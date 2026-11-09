// SOHBET / DERS: robotla akıcı sesli sohbet ederek ders.
// Robot cevabını yazarken konuşmaya başlar (bekletmez).
// Canlı mod: mikrofon varsa eller serbest dinleme; yoksa (Claude sayfası içinde) klavye
// diktesi: klavyedeki 🎤'ya bas, konuş; susunca mesaj kendiliğinden gönderilir.
import * as S from '../storage.js';
import { llm, parseJSON, hasAI, aiReady } from '../ai.js';
import { chatSystem } from '../prompts.js';
import { OfflineTeacher } from '../offline.js';
import { Listener, unlockAudio, micAvailable } from '../voice.js';
import { esc, toast, consumeQuestion, line } from '../ui.js';
import { addXP, recordAnswer } from '../progress.js';

function splitMeta(raw) {
  const i = raw.indexOf('@@');
  let text = (i >= 0 ? raw.slice(0, i) : raw).trim(), meta = {};
  if (i >= 0) { try { meta = parseJSON(raw.slice(i + 2)); } catch { meta = {}; } }
  else if (text.startsWith('{')) { try { const j = parseJSON(text); text = j.metin || text; meta = j; } catch { /* düz metin */ } }
  return { text, meta };
}

export function mountDers(el, { t, stage }) {
  const settings = S.getSettings();
  let history = S.getHistory(t.id);
  const offline = new OfflineTeacher(t, settings.strictness);
  let busy = false, live = false, dead = false, awaiting = false, strikes = 0, timer = null, left = 0, warned = false;
  let dictation = !micAvailable(), autoTimer = null;

  el.innerHTML = `
  <div class="ders">
    <div class="msgs"></div>
    <div class="dict" hidden>
      <div class="dict-ico">🎤</div>
      <div><b>Canlı sohbet açık</b><small>Klavyendeki <b>🎤 mikrofon tuşuna</b> bas ve konuş. Susunca mesajın kendiliğinden gider, robot sesli cevap verir.</small></div>
    </div>
    <div class="interim" hidden></div>
    <form class="composer">
      <button type="button" class="mic" aria-label="Konuş">🎤</button>
      <textarea rows="1" placeholder="Yaz ya da konuş…" enterkeyhint="send"></textarea>
      <button type="submit" class="send" aria-label="Gönder">➤</button>
    </form>
    <div class="ders-bar">
      <button type="button" class="live-btn">🎙️ Canlı sohbet</button>
      <div class="d-timer" hidden><i></i><span></span></div>
      <button type="button" class="btn ghost sm restart">⟳ Yeni ders</button>
    </div>
  </div>`;
  const $ = s => el.querySelector(s);
  const msgs = $('.msgs'), input = $('textarea');
  const listener = new Listener();

  function add(role, text) {
    const d = document.createElement('div');
    d.className = 'msg ' + role;
    d.innerHTML = `<p>${esc(text)}</p>`;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d.querySelector('p');
  }

  async function turn(kind, userText) {
    busy = true; stopTimer(); listener.stop();
    stage.think(true);
    const bubbleEl = add('teacher', '…');
    bubbleEl.parentElement.classList.add('typing-live');
    await aiReady;
    let reply = null;
    if (hasAI()) {
      try {
        const sp = stage.stream();
        let started = false;
        const raw = await llm({
          system: chatSystem(t),
          messages: history.slice(-24).map(m => ({ role: m.role, content: m.content })),
          onText: ({ text }) => {
            if (dead) return;
            const vis = text.split('@@')[0];
            if (vis.trim().startsWith('{')) return;
            if (!started && vis.trim()) { started = true; stage.think(false); }
            bubbleEl.textContent = vis; msgs.scrollTop = msgs.scrollHeight;
            sp.push(vis);
          },
        });
        const { text, meta } = splitMeta(raw);
        reply = { text: text || '…', question: meta.soru === true || meta.soru === 'true', evaluation: meta.degerlendirme || 'yok', rude: meta.kaba === true, topic: meta.konu, sp };
      } catch (e) { toast('⚠️ ' + e.message); stage.stop(); }
    }
    if (dead) return;
    if (!reply) {
      const r = kind === 'start' ? offline.start(settings.name) : kind === 'silence' ? offline.silence(strikes) : offline.respond(userText);
      reply = { text: r.text, question: r.question, evaluation: r.evaluation };
    }
    stage.think(false);
    bubbleEl.parentElement.classList.remove('typing-live');
    bubbleEl.textContent = reply.text;
    busy = false;
    // Sabır ve ilerleme kuralları
    if (reply.rude) stage.react('kaba');
    else if (kind === 'answer' && ['dogru', 'yanlis', 'kismen', 'bilmiyorum'].includes(reply.evaluation)) {
      stage.react(reply.evaluation);
      const ok = reply.evaluation === 'dogru';
      recordAnswer(t.id, reply.topic, ok);
      if (ok) { S.bumpStat('correct'); addXP(15, 'Doğru cevap', t.id); }
      else if (reply.evaluation === 'yanlis') S.bumpStat('wrong');
    } else if (kind === 'chat') { stage.react('soru'); addXP(3, 'Soru sordun', t.id); }
    history.push({ role: 'assistant', content: reply.text, text: reply.text, question: reply.question });
    S.saveHistory(t.id, history);
    awaiting = reply.question;
    await (reply.sp ? reply.sp.end(reply.text) : stage.say(reply.text));
    if (dead) return;
    if (awaiting) startTimer(); else stopTimer();
    resumeLive();
  }

  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    unlockAudio();
    clearTimeout(autoTimer);
    stage.stop();
    if (!consumeQuestion(stage)) { stopLive(); return; }
    add('student', text);
    history.push({ role: 'user', content: text, text });
    strikes = 0;
    const kind = awaiting ? 'answer' : 'chat';
    awaiting = false;
    await turn(kind, text);
  }

  // ---------- Cevap süresi ----------
  function startTimer() {
    stopTimer();
    left = settings.answerTime; warned = false;
    $('.d-timer').hidden = false; draw();
    timer = setInterval(() => {
      if (document.hidden || stage.speaking || busy || input.value.trim() || listener.active) return;
      left--; draw();
      if (!warned && left === Math.floor(settings.answerTime / 2)) { warned = true; stage.react('bekle', 4000); stage.say(line('bekle', t.id)).then(resumeLive); }
      if (left <= 0) silence();
    }, 1000);
  }
  function stopTimer() { clearInterval(timer); timer = null; const d = $('.d-timer'); if (d) d.hidden = true; }
  function draw() {
    const f = left / settings.answerTime;
    $('.d-timer i').style.width = f * 100 + '%';
    $('.d-timer i').style.background = f > 0.5 ? '#22c55e' : f > 0.25 ? '#f59e0b' : '#ef4444';
    $('.d-timer span').textContent = `⏱ ${left} sn`;
  }
  async function silence() {
    stopTimer(); listener.stop();
    strikes++;
    S.bumpStat('silent');
    stage.react('sessiz');
    add('system', `⏰ ${settings.answerTime} saniyedir cevap vermedin.`);
    if (strikes > 3) {
      awaiting = false;
      add('teacher', 'Tamam, yeter. Derse katılmıyorsun, bunu not ettim. Hazır olduğunda bana yaz.');
      await stage.say('Tamam, yeter. Derse katılmıyorsun, bunu not ettim. Hazır olduğunda bana yaz.');
      stopLive();
      return;
    }
    history.push({ role: 'user', content: `[SİSTEM] Öğrenci ${settings.answerTime} saniyedir sorunu cevaplamadı (${strikes}. kez). Sabrına göre ${strikes >= 2 ? 'açıkça kız' : 'uyar'} ve soruyu kısaca tekrar et.`, text: '' });
    await turn('silence');
  }

  // ---------- Canlı sohbet ----------
  function resumeLive() {
    if (!live || dead || busy || stage.speaking) return;
    if (!dictation) setTimeout(() => live && !busy && !stage.speaking && listener.start(), 250);
    else { try { input.focus({ preventScroll: true }); } catch { /* yok */ } }
  }
  function useDictation(explain) {
    dictation = true;
    $('.dict').hidden = !live;
    if (explain) toast('🎤 Bu sayfada doğrudan mikrofon kapalı. Klavyedeki 🎤 tuşuyla konuş — susunca kendiliğinden gönderirim.', 6500);
  }
  function startLive() {
    unlockAudio(); live = true; stage.setLive(true);
    $('.live-btn').textContent = '⏹ Canlıyı bitir'; $('.live-btn').classList.add('on');
    $('.dict').hidden = !dictation;
    if (!busy && !stage.speaking) resumeLive();
  }
  function stopLive() {
    live = false; listener.stop(); stage.setLive(false); clearTimeout(autoTimer);
    const b = $('.live-btn'); if (b) { b.textContent = '🎙️ Canlı sohbet'; b.classList.remove('on'); }
    const d = $('.dict'); if (d) d.hidden = true;
  }
  listener.onstate = on => { $('.mic').classList.toggle('on', on); if (!on) $('.interim').hidden = true; };
  listener.oninterim = x => { $('.interim').hidden = false; $('.interim').textContent = '🎤 ' + x; };
  listener.onfinal = x => { $('.interim').hidden = true; send(x); };
  listener.onidle = () => { if (live && !busy && !stage.speaking && !dead && !dictation) setTimeout(() => live && !busy && !stage.speaking && listener.start(), 300); };
  listener.onblocked = () => { useDictation(true); if (live) resumeLive(); };
  // Dikte: yazı değişmeyi bırakınca otomatik gönder
  input.addEventListener('input', () => {
    clearTimeout(autoTimer);
    if (live && dictation && input.value.trim()) autoTimer = setTimeout(() => { const v = input.value; input.value = ''; send(v); }, 1800);
  });

  $('.composer').addEventListener('submit', e => { e.preventDefault(); const v = input.value; input.value = ''; send(v); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('.composer').requestSubmit(); } });
  $('.mic').addEventListener('click', () => {
    unlockAudio(); stage.stop();
    if (dictation) { useDictation(true); input.focus(); return; }
    if (listener.active) listener.stop(); else listener.start();
  });
  $('.live-btn').addEventListener('click', () => live ? stopLive() : startLive());
  $('.restart').addEventListener('click', () => { stage.stop(); stopTimer(); history = []; S.clearHistory(t.id); msgs.innerHTML = ''; begin(); });
  const onInterrupt = () => { if (dead) return; if (awaiting && !timer) startTimer(); resumeLive(); };
  document.addEventListener('stage-interrupt', onInterrupt);

  function begin() {
    history.push({ role: 'user', content: `[SİSTEM] Öğrenci derse geldi. Kendini kısaca, kişiliğine uygun tanıt, bugün ${t.subject} dersinde ne çalışacağınızı söyle ve ilk soruyu sor.`, text: '' });
    turn('start');
  }
  if (history.length) {
    history.filter(m => m.text).slice(-12).forEach(m => add(m.role === 'assistant' ? 'teacher' : 'student', m.text));
    add('system', '— Kaldığın yerden devam —');
    const last = history[history.length - 1];
    if (last.role === 'assistant') {
      awaiting = !!last.question;
      stage.say('Tekrar hoş geldin! Kaldığımız yerden devam edelim.').then(() => { if (!dead && awaiting) startTimer(); });
    } else turn('start');
  } else begin();

  return { destroy() { dead = true; stopTimer(); listener.stop(); clearTimeout(autoTimer); stage.setLive(false); document.removeEventListener('stage-interrupt', onInterrupt); } };
}
