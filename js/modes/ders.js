// DERS: hocayla sohbet ederek ders. Yazarak ya da canlı (sesli) konuşarak.
import * as S from '../storage.js';
import { llm, parseJSON, hasAI, aiReady } from '../ai.js';
import { chatSystem } from '../prompts.js';
import { OfflineTeacher } from '../offline.js';
import { Listener, unlockAudio } from '../speech.js';
import { esc, toast, consumeQuestion, line } from '../ui.js';

export function mountDers(el, { t, stage }) {
  const settings = S.getSettings();
  let history = S.getHistory(t.id);
  const offline = new OfflineTeacher(t, settings.strictness);
  let busy = false, live = false, dead = false, awaiting = false, strikes = 0, timer = null, left = 0, warned = false;

  el.innerHTML = `
  <div class="ders">
    <div class="msgs"></div>
    <div class="interim" hidden></div>
    <form class="composer">
      <button type="button" class="mic" aria-label="Bas konuş">🎤</button>
      <textarea rows="1" placeholder="Cevabını ya da sorunu yaz…" enterkeyhint="send"></textarea>
      <button type="submit" class="send" aria-label="Gönder">➤</button>
    </form>
    <div class="ders-bar">
      <button type="button" class="live-btn">🎙️ Canlı konuş</button>
      <div class="d-timer" hidden><i></i><span></span></div>
      <button type="button" class="btn ghost sm restart">⟳ Yeni ders</button>
    </div>
  </div>`;
  const $ = s => el.querySelector(s);
  const msgs = $('.msgs'), input = $('textarea');
  const listener = new Listener();
  if (!listener.supported) { $('.mic').disabled = true; $('.live-btn').disabled = true; $('.live-btn').title = 'Bu tarayıcı sesli dinlemeyi desteklemiyor'; }

  function add(role, text) {
    const d = document.createElement('div');
    d.className = 'msg ' + role;
    d.innerHTML = `<p>${esc(text)}</p>`;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }
  function typing(on) {
    let e = msgs.querySelector('.typing');
    if (on && !e) { e = document.createElement('div'); e.className = 'msg teacher typing'; e.innerHTML = '<p><i></i><i></i><i></i></p>'; msgs.appendChild(e); msgs.scrollTop = msgs.scrollHeight; }
    if (!on && e) e.remove();
  }

  async function teacherSay(reply, record = true) {
    typing(false);
    add('teacher', reply.text);
    if (record) { history.push({ role: 'assistant', content: JSON.stringify({ metin: reply.text, soru: reply.question }) , text: reply.text, question: reply.question }); S.saveHistory(t.id, history); }
    awaiting = reply.question;
    await stage.say(reply.text);
    if (dead) return;
    if (awaiting) startTimer(); else stopTimer();
    if (live) setTimeout(() => !busy && !stage.speaking && listener.start(), 250);
  }

  async function turn(kind, userText) {
    busy = true; stopTimer(); listener.stop();
    stage.think(true); typing(true);
    await aiReady;
    let reply = null;
    if (hasAI()) {
      try {
        const raw = await llm({ system: chatSystem(t), messages: history.slice(-24).map(m => ({ role: m.role, content: m.content })) });
        let j; try { j = parseJSON(raw); } catch { j = { metin: raw, soru: /\?\s*$/.test(raw.trim()) }; }
        reply = { text: String(j.metin || '').trim() || '…', question: j.soru === true || j.soru === 'true', evaluation: j.degerlendirme || 'yok', rude: j.kaba === true };
      } catch (e) { toast('⚠️ ' + e.message); }
    }
    if (dead) return;
    if (!reply) {
      const r = kind === 'start' ? offline.start(settings.name) : kind === 'silence' ? offline.silence(strikes) : offline.respond(userText);
      reply = { text: r.text, question: r.question, evaluation: r.evaluation };
    }
    stage.think(false);
    busy = false;
    // Sabır kuralları
    if (reply.rude) stage.react('kaba');
    else if (kind === 'answer' && ['dogru', 'yanlis', 'kismen', 'bilmiyorum'].includes(reply.evaluation)) {
      stage.react(reply.evaluation);
      if (reply.evaluation === 'dogru') S.bumpStat('correct');
      if (reply.evaluation === 'yanlis') S.bumpStat('wrong');
    } else if (kind === 'silence') { /* sabır zaten düştü */ } else if (kind === 'chat') stage.react('soru');
    await teacherSay(reply);
  }

  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    unlockAudio();
    stage.stop();
    if (!consumeQuestion(stage)) { stopLive(); return; }
    add('student', text);
    history.push({ role: 'user', content: text, text });
    strikes = 0;
    const kind = awaiting ? 'answer' : 'chat';
    awaiting = false;
    await turn(kind, text);
  }

  // Cevap süresi
  function startTimer() {
    stopTimer();
    left = settings.answerTime; warned = false;
    $('.d-timer').hidden = false; draw();
    timer = setInterval(() => {
      if (document.hidden || stage.speaking || busy || input.value.trim()) return;
      left--; draw();
      if (!warned && left === Math.floor(settings.answerTime / 2)) { warned = true; stage.react('bekle', 4000); stage.say(line('bekle', t.id)).then(() => live && listener.start()); }
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
      await teacherSay({ text: 'Tamam, yeter. Derse katılmıyorsun, bunu not ettim. Hazır olduğunda bana yaz.', question: false });
      stopLive();
      return;
    }
    history.push({ role: 'user', content: `[SİSTEM] Öğrenci ${settings.answerTime} saniyedir sorunu cevaplamadı (${strikes}. kez). Sabrına göre ${strikes >= 2 ? 'açıkça kız' : 'uyar'} ve soruyu kısaca tekrar et.`, text: '' });
    await turn('silence');
  }

  // Canlı mod
  function startLive() { unlockAudio(); live = true; stage.setLive(true); $('.live-btn').textContent = '⏹ Canlıyı bitir'; $('.live-btn').classList.add('on'); if (!busy && !stage.speaking) listener.start(); }
  function stopLive() { live = false; listener.stop(); stage.setLive(false); const b = $('.live-btn'); if (b) { b.textContent = '🎙️ Canlı konuş'; b.classList.remove('on'); } }
  listener.onstate = on => { $('.mic').classList.toggle('on', on); if (!on) $('.interim').hidden = true; };
  listener.oninterim = x => { $('.interim').hidden = false; $('.interim').textContent = '🎤 ' + x; };
  listener.onfinal = x => { $('.interim').hidden = true; send(x); };
  listener.onidle = () => { if (live && !busy && !stage.speaking && !dead) setTimeout(() => live && !busy && !stage.speaking && listener.start(), 300); };
  listener.onerror = err => { if (/not-allowed|service-not-allowed/.test(err)) { toast('🎤 Mikrofon izni yok. Yazarak devam edebilirsin (klavyedeki mikrofon tuşu da olur).'); stopLive(); } };

  $('.composer').addEventListener('submit', e => { e.preventDefault(); const v = input.value; input.value = ''; send(v); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('.composer').requestSubmit(); } });
  $('.mic').addEventListener('click', () => { unlockAudio(); if (listener.active) listener.stop(); else { stage.stop(); listener.start(); } });
  $('.live-btn').addEventListener('click', () => live ? stopLive() : startLive());
  $('.restart').addEventListener('click', () => { stage.stop(); stopTimer(); history = []; S.clearHistory(t.id); msgs.innerHTML = ''; begin(); });
  stage.onFaceTap(() => { if (dead) return; if (awaiting && !timer) startTimer(); if (live) setTimeout(() => listener.start(), 200); });

  function begin() {
    history.push({ role: 'user', content: `[SİSTEM] Öğrenci derse geldi. Kendini kısaca tanıt, bugün ${t.subject} dersinde ne çalışacağınızı söyle ve ilk soruyu sor.`, text: '' });
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

  return { destroy() { dead = true; stopTimer(); listener.stop(); stage.setLive(false); } };
}
