// Sınıf ekranı: hoca yüzü + sohbet + canlı konuşma + cevap süresi + günlük limit.
import { Face, EMOTIONS, normalizeEmotion } from './face.js';
import { teacherById } from './teachers.js';
import * as S from './storage.js';
import { askTeacher } from './ai.js';
import { OfflineTeacher, LINES } from './offline.js';
import { speak, stopSpeaking, Listener, unlockAudio } from './speech.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function baseEmotion(mood) {
  if (mood >= 80) return 'mutlu';
  if (mood >= 45) return 'notr';
  if (mood >= 25) return 'suphe';
  return 'kizgin';
}

export function mountClassroom(root, teacherId, { toast, go }) {
  const t = teacherById(teacherId);
  let settings = S.getSettings();
  let history = S.getHistory(t.id);
  let mood = S.getMood(t.id);
  const offline = new OfflineTeacher(t, settings.strictness);
  const useAI = () => !!settings.apiKey.trim();
  let busy = false, speaking = false, liveMode = false, destroyed = false;
  let awaiting = false, strikes = 0, timer = null, timeLeft = 0, warned = false, revertTimer = null;
  let voiceOn = settings.voice;

  root.innerHTML = `
  <section class="class" style="--tc:${t.color}">
    <div class="stage">
      <div class="board">
        <div class="board-subject">${t.icon} ${esc(t.subject)}</div>
        <div class="board-sub">${esc(t.name)} · ${useAI() ? 'Yapay zekâ' : 'Çevrimdışı mod'}</div>
      </div>
      <div class="live-badge" hidden>● CANLI</div>
      <button class="face-btn" aria-label="Hocayı sustur"><div class="face big"></div></button>
      <div class="emo-chip"></div>
      <div class="stage-meters">
        <div class="meter"><span>Sabır</span><div class="bar"><i class="mood-bar"></i></div><b class="mood-val"></b></div>
        <div class="timer" hidden>
          <svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" class="ring-bg"/><circle cx="20" cy="20" r="17" class="ring"/></svg>
          <span class="timer-txt"></span>
        </div>
      </div>
      <div class="desk"></div>
    </div>
    <div class="chat">
      <header class="chat-head">
        <button class="icon-btn back" aria-label="Geri">←</button>
        <div class="chat-title"><b>${esc(t.name)}</b><small>${esc(t.tagline)}</small></div>
        <div class="limit-pill" title="Günlük soru hakkı"></div>
        <button class="icon-btn voice-tg" aria-label="Ses"></button>
        <button class="icon-btn restart" aria-label="Yeni ders" title="Yeni ders">⟳</button>
      </header>
      <div class="msgs"></div>
      <div class="interim" hidden></div>
      <form class="composer">
        <button type="button" class="mic" aria-label="Bas konuş">🎤</button>
        <textarea rows="1" placeholder="Cevabını ya da sorunu yaz…" enterkeyhint="send"></textarea>
        <button type="submit" class="send" aria-label="Gönder">➤</button>
      </form>
      <div class="live-row">
        <button type="button" class="live-btn">🎙️ Canlı konuşmayı başlat</button>
        <span class="hint"></span>
      </div>
    </div>
  </section>`;

  const $ = s => root.querySelector(s);
  const face = new Face($('.face'), { ...t.look, alt: t.name }, { emotion: baseEmotion(mood) });
  const msgs = $('.msgs'), input = $('textarea'), interimEl = $('.interim');
  const listener = new Listener();
  if (!listener.supported) { $('.mic').disabled = true; $('.live-btn').disabled = true; $('.hint').textContent = 'Bu tarayıcı sesli dinlemeyi desteklemiyor (Chrome veya Safari kullanın).'; }

  // ---------- Gösterge ----------
  function showEmotion(e, hold = 7000) {
    const k = normalizeEmotion(e);
    face.setEmotion(k);
    $('.emo-chip').textContent = `${EMOTIONS[k].emoji} ${EMOTIONS[k].label}`;
    clearTimeout(revertTimer);
    if (hold) revertTimer = setTimeout(() => !busy && showEmotion(baseEmotion(mood), 0), hold);
  }
  function renderMood() {
    $('.mood-bar').style.width = mood + '%';
    $('.mood-bar').style.background = mood > 60 ? '#22c55e' : mood > 30 ? '#f59e0b' : '#ef4444';
    $('.mood-val').textContent = mood;
  }
  function renderLimit() {
    const u = S.getUsage(), rem = Math.max(0, settings.dailyLimit - u.used);
    const pill = $('.limit-pill');
    pill.textContent = `❓ ${rem}/${settings.dailyLimit}`;
    pill.className = 'limit-pill' + (rem === 0 ? ' out' : rem <= 5 ? ' low' : '');
    input.disabled = rem === 0;
    input.placeholder = rem === 0 ? 'Bugünlük soru hakkın bitti 😴' : 'Cevabını ya da sorunu yaz…';
  }
  function renderVoice() { $('.voice-tg').textContent = voiceOn ? '🔊' : '🔇'; }
  function addMsg(role, text, emotion) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    if (role === 'teacher') div.innerHTML = `<span class="m-emo">${EMOTIONS[normalizeEmotion(emotion)].emoji}</span><p>${esc(text)}</p>`;
    else if (role === 'system') div.innerHTML = `<p>${esc(text)}</p>`;
    else div.innerHTML = `<p>${esc(text)}</p>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }
  function typing(on) {
    let el = msgs.querySelector('.typing');
    if (on && !el) { el = document.createElement('div'); el.className = 'msg teacher typing'; el.innerHTML = '<p><i></i><i></i><i></i></p>'; msgs.appendChild(el); msgs.scrollTop = msgs.scrollHeight; }
    if (!on && el) el.remove();
  }

  // ---------- Konuşma ----------
  function say(text, done) {
    if (!voiceOn) { speaking = false; face.setSpeaking(false); done && done(); return; }
    speaking = true;
    listener.stop();
    speak(text, { pitch: t.voice.pitch, rate: t.voice.rate * settings.rate }, {
      onstart: () => face.setSpeaking(true),
      onboundary: () => face.boundary(),
      onend: () => { speaking = false; face.setSpeaking(false); if (!destroyed) done && done(); },
    });
  }
  function afterTeacher(reply) {
    if (destroyed) return;
    if (reply.question) startTimer(); else stopTimer();
    if (liveMode) setTimeout(() => !busy && !speaking && listener.start(), 300);
  }
  function teacherSays(reply, { record = true } = {}) {
    typing(false);
    showEmotion(reply.emotion);
    addMsg('teacher', reply.text, reply.emotion);
    if (record) { history.push({ role: 'assistant', text: reply.text, emotion: normalizeEmotion(reply.emotion), question: reply.question }); S.saveHistory(t.id, history); }
    awaiting = reply.question;
    say(reply.text, () => afterTeacher(reply));
  }

  function changeMood(d) { mood = S.setMood(t.id, mood + d); renderMood(); }

  async function teacherTurn(userText, kind) {
    busy = true;
    stopTimer();
    face.setEmotion('dusunceli');
    typing(true);
    let reply;
    const u = S.getUsage();
    const ctx = { name: settings.name, grade: settings.grade, mood, limit: settings.dailyLimit, used: u.used };
    if (useAI()) {
      try { reply = await askTeacher(settings, t, history, ctx); } catch (e) {
        toast('Yapay zekâya ulaşılamadı: ' + e.message + ' — çevrimdışı moda geçildi.');
        reply = null;
      }
    }
    if (destroyed) return;
    if (!reply) {
      if (kind === 'start') reply = offline.start(settings.name);
      else if (kind === 'silence') reply = offline.silence(strikes);
      else reply = offline.respond(userText);
    }
    // Değerlendirmeye göre sabır & istatistik
    if (kind === 'answer') {
      const us = S.getUsage();
      if (reply.evaluation === 'dogru') { us.correct++; changeMood(+10); }
      else if (reply.evaluation === 'kismen') changeMood(+3);
      else if (reply.evaluation === 'yanlis') { us.wrong++; changeMood(-7); }
      S.saveUsage(us);
    }
    busy = false;
    teacherSays(reply);
  }

  function limitCheck() {
    const u = S.getUsage(), rem = settings.dailyLimit - u.used;
    if ([10, 5, 3, 1, 0].includes(rem) && !u.warned.includes(rem)) {
      u.warned.push(rem); S.saveUsage(u);
      return rem;
    }
    return null;
  }

  async function studentSend(text) {
    text = text.trim();
    if (!text || busy) return;
    unlockAudio();
    const u = S.getUsage();
    if (u.used >= settings.dailyLimit) { limitReached(); return; }
    stopSpeaking(); speaking = false; face.setSpeaking(false);
    u.used++; S.saveUsage(u);
    renderLimit();
    addMsg('student', text);
    history.push({ role: 'user', text });
    strikes = 0;
    const wasAwaiting = awaiting;
    awaiting = false;
    await teacherTurn(text, wasAwaiting ? 'answer' : 'chat');
    const warn = limitCheck();
    if (warn != null && !destroyed) {
      const line = LINES.limit(warn);
      toast('⚠️ ' + line);
      if (warn <= 3) {
        // Hoca mevcut cümlesini bitirince uyarsın
        const deliver = () => { if (speaking || busy) return setTimeout(deliver, 400); addMsg('system', '⚠️ ' + line); showEmotion(warn === 0 ? 'uzgun' : 'endiseli'); say(line, () => liveMode && warn > 0 && listener.start()); };
        setTimeout(deliver, 500);
      }
    }
    if (S.getUsage().used >= settings.dailyLimit) { stopLive(); renderLimit(); }
  }

  function limitReached() {
    const line = LINES.limit(0);
    addMsg('system', '⛔ ' + line);
    showEmotion('kizgin');
    say(line);
    stopLive();
    renderLimit();
  }

  // ---------- Cevap süresi ----------
  function startTimer() {
    stopTimer();
    timeLeft = settings.answerTime;
    warned = false;
    $('.timer').hidden = false;
    drawTimer();
    timer = setInterval(() => {
      if (document.hidden || speaking || busy) return;
      if (input.value.trim()) return; // yazıyorsa bekle
      timeLeft--;
      drawTimer();
      if (!warned && timeLeft === Math.floor(settings.answerTime / 2)) {
        warned = true;
        showEmotion(strikes > 0 ? 'kizgin' : 'suphe', 4000);
        const w = LINES.wait(t, settings.strictness);
        say(w[Math.floor(Math.random() * w.length)], () => liveMode && listener.start());
      }
      if (timeLeft <= 0) onSilence();
    }, 1000);
  }
  function stopTimer() { clearInterval(timer); timer = null; $('.timer').hidden = true; }
  function drawTimer() {
    const f = timeLeft / settings.answerTime;
    $('.ring').style.strokeDashoffset = (1 - f) * 106.8;
    $('.ring').style.stroke = f > 0.5 ? '#22c55e' : f > 0.25 ? '#f59e0b' : '#ef4444';
    $('.timer-txt').textContent = timeLeft;
  }
  async function onSilence() {
    stopTimer();
    listener.stop();
    strikes++;
    const u = S.getUsage(); u.silent++; S.saveUsage(u);
    changeMood(-12);
    addMsg('system', `⏰ ${settings.answerTime} saniyedir cevap vermedin.`);
    if (strikes > 3) {
      awaiting = false;
      teacherSays({ emotion: 'cok_kizgin', text: 'Tamam, yeter. Derse katılmıyorsun, bunu not ettim. Hazır olduğunda bana yaz.', question: false }, { record: true });
      stopLive();
      return;
    }
    history.push({ role: 'user', text: `[SİSTEM] Öğrenci ${settings.answerTime} saniyedir sorunu cevaplamadı. Bu ${strikes}. sessizlik. Kişiliğine göre ${strikes >= 2 ? 'açıkça kız' : 'uyar'} ve soruyu kısaca tekrar et.` });
    await teacherTurn('', 'silence');
  }

  // ---------- Canlı mod ----------
  function startLive() {
    if (!listener.supported) return;
    unlockAudio();
    liveMode = true;
    $('.live-badge').hidden = false;
    $('.live-btn').textContent = '⏹ Canlı konuşmayı bitir';
    $('.live-btn').classList.add('on');
    $('.hint').textContent = 'Konuş, hoca dinliyor. Hocanın sözünü kesmek için yüzüne dokun.';
    if (!speaking && !busy) listener.start();
  }
  function stopLive() {
    liveMode = false;
    listener.stop();
    $('.live-badge').hidden = true;
    $('.live-btn').textContent = '🎙️ Canlı konuşmayı başlat';
    $('.live-btn').classList.remove('on');
    $('.hint').textContent = '';
  }
  listener.onstate = on => { $('.mic').classList.toggle('on', on); if (!on) { interimEl.hidden = true; } };
  listener.oninterim = txt => { interimEl.hidden = false; interimEl.textContent = '🎤 ' + txt; };
  listener.onfinal = txt => { interimEl.hidden = true; studentSend(txt); };
  listener.onidle = () => { if (liveMode && !busy && !speaking && !destroyed) setTimeout(() => liveMode && !busy && !speaking && listener.start(), 250); };
  listener.onerror = err => {
    if (err === 'not-allowed' || err === 'service-not-allowed') { toast('Mikrofon izni verilmedi.'); stopLive(); }
  };

  // ---------- Olaylar ----------
  $('.composer').addEventListener('submit', e => { e.preventDefault(); const v = input.value; input.value = ''; studentSend(v); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('.composer').requestSubmit(); } });
  $('.mic').addEventListener('click', () => { unlockAudio(); if (listener.active) listener.stop(); else { stopSpeaking(); listener.start(); } });
  $('.live-btn').addEventListener('click', () => liveMode ? stopLive() : startLive());
  $('.face-btn').addEventListener('click', () => {
    unlockAudio();
    if (speaking) { stopSpeaking(); speaking = false; face.setSpeaking(false); if (awaiting) startTimer(); if (liveMode) listener.start(); }
  });
  $('.voice-tg').addEventListener('click', () => { voiceOn = !voiceOn; if (!voiceOn) stopSpeaking(); renderVoice(); });
  $('.back').addEventListener('click', () => go('home'));
  $('.restart').addEventListener('click', () => {
    if (!confirm('Bu hocayla yeni bir ders başlatılsın mı? Sohbet geçmişi silinir.')) return;
    stopSpeaking(); stopTimer(); history = []; S.clearHistory(t.id); msgs.innerHTML = ''; begin();
  });
  const onMove = e => {
    const r = $('.face').getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 2, y = ((e.clientY - r.top) / r.height - 0.4) * 2;
    face.lookAt(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
    clearTimeout(onMove.t); onMove.t = setTimeout(() => face.lookAt(null), 1500);
  };
  root.addEventListener('pointermove', onMove);

  // ---------- Başlat ----------
  function begin() {
    history.push({ role: 'user', text: `[SİSTEM] Ders başladı. Öğrenci sınıfa girdi. Kendini kısaca tanıt, bugünkü ${t.subject} konusunu söyle ve ilk soruyu sor.` });
    teacherTurn('', 'start');
  }
  renderMood(); renderLimit(); renderVoice(); showEmotion(baseEmotion(mood), 0);
  if (history.length) {
    history.filter(m => !m.text.startsWith('[SİSTEM]')).slice(-12)
      .forEach(m => addMsg(m.role === 'assistant' ? 'teacher' : 'student', m.text, m.emotion));
    addMsg('system', '— Derse geri döndün —');
    const last = history[history.length - 1];
    if (S.getUsage().used >= settings.dailyLimit) limitReached();
    else if (last.role === 'assistant') {
      const r = { emotion: 'notr', text: mood < 40 ? 'Nihayet geldin. Kaldığımız yerden devam ediyoruz.' : 'Tekrar hoş geldin! Kaldığımız yerden devam edelim.', question: last.question };
      teacherSays(r, { record: false });
    } else teacherTurn('', 'start');
  } else begin();

  return {
    teacherId: t.id,
    destroy() {
      destroyed = true;
      stopSpeaking(); stopTimer(); listener.stop(); face.destroy();
      clearTimeout(revertTimer);
      root.removeEventListener('pointermove', onMove);
    },
  };
}
