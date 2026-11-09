// SAHNE: robot hoca, altyazı balonu, sabır göstergesi, akıcı sesli konuşma, dokunma tepkisi.
import { Face, EMOTIONS } from './face.js';
import { getPatience, baseEmotion, applyEvent, patienceColor } from './mood.js';
import { speakStream, stopSpeaking, SFX, unlockAudio } from './voice.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Dokununca söyledikleri (sabra göre, sırayla)
const POKE = {
  hi: ['Hihi, gıdıklanıyorum!', 'Bip bop! Buradayım.', 'Ekranım parlıyor, bak!', 'Hadi çalışalım!'],
  mid: ['Evet? Bir sorun mu var?', 'Dokunacağına soru sor bence.', 'Hmm, dikkatin dağılmasın.'],
  lo: ['Dokunma bana! Önce çalış.', 'Şu an hiç keyfim yok.', 'Ekranıma parmak izi bırakma!'],
};
let pokeN = 0;

export function createStage(el, teacher, { compact = false } = {}) {
  el.innerHTML = `
  <div class="stage ${compact ? 'compact' : ''}">
    <div class="st-bg"></div>
    <div class="st-head"><span class="st-name"></span><span class="st-live" hidden>● CANLI</span></div>
    <button class="st-face" aria-label="Robota dokun"><div class="face"></div></button>
    <div class="st-bubble" hidden></div>
    <div class="st-meter">
      <span class="st-emo"></span>
      <div class="bar"><i></i></div><b class="st-p"></b>
    </div>
  </div>`;
  const $ = s => el.querySelector(s);
  let t = teacher, face = null, revert = null, speaking = false, thinking = false, voiceOn = true;
  let bubbleTimer = null, lastPoke = 0, current = null;

  function render() {
    face && face.destroy();
    const p = getPatience(t.id);
    el.querySelector('.stage').style.setProperty('--tc', t.color);
    $('.st-name').textContent = `${t.icon} ${t.name} · ${t.subject}`;
    face = new Face($('.face'), { ...t.look, alt: t.name }, { emotion: baseEmotion(p), led: patienceColor(p) });
    meter(p, baseEmotion(p));
  }
  function meter(p, emo) {
    $('.st-meter i').style.width = p + '%';
    $('.st-meter i').style.background = patienceColor(p);
    $('.st-p').textContent = p;
    $('.st-emo').textContent = `${EMOTIONS[emo].emoji} ${EMOTIONS[emo].label}`;
    face.setLed(patienceColor(p));
  }
  function show(emo, hold = 6500) {
    face.setEmotion(emo);
    meter(getPatience(t.id), emo);
    clearTimeout(revert);
    if (hold) revert = setTimeout(() => { if (!thinking) api.calm(); }, hold);
  }
  function bubble(text) {
    const b = $('.st-bubble');
    clearTimeout(bubbleTimer);
    if (!text) { b.hidden = true; return; }
    b.hidden = false; b.innerHTML = esc(text);
    b.scrollTop = b.scrollHeight;
  }
  render();

  const api = {
    get teacher() { return t; },
    get speaking() { return speaking; },
    get face() { return face; },
    setTeacher(nt) { api.stop(); t = nt; render(); },
    react(ev, hold) { const r = applyEvent(t.id, ev); show(r.emotion, hold); if (ev === 'dogru') SFX.dogru(); if (ev === 'yanlis') SFX.yanlis(); return r; },
    calm() { const p = getPatience(t.id); const b = baseEmotion(p); face.setEmotion(b); meter(p, b); },
    think(on) { thinking = on; if (on) { clearTimeout(revert); face.setEmotion('dusunceli'); $('.st-emo').textContent = '🤔 Düşünüyor…'; } else api.calm(); },
    setVoice(on) { voiceOn = on; if (!on) api.stop(); },
    get voice() { return voiceOn; },
    setLive(on) { $('.st-live').hidden = !on; },
    // Akış: yapay zekâ yazdıkça konuşur. push(tümMetin), end(tümMetin) → Promise
    stream({ bubble: showBubble = true } = {}) {
      api.stop();
      speaking = true;
      const s = speakStream({ ...t.voice }, {
        onstart: () => face.setSpeaking(true),
        onboundary: () => face.boundary(),
        onend: () => { speaking = false; face.setSpeaking(false); bubbleTimer = setTimeout(() => bubble(''), 7000); },
      });
      if (!voiceOn) { stopSpeaking(); }
      const wrap = {
        push(txt) { if (showBubble) bubble(txt); if (voiceOn) s.push(txt); },
        end(txt) {
          if (showBubble && txt != null) bubble(txt);
          if (!voiceOn) { speaking = false; face.setSpeaking(false); return Promise.resolve(); }
          return s.end(txt);
        },
      };
      current = s;
      return wrap;
    },
    say(text, { bubble: showBubble = true } = {}) { const s = api.stream({ bubble: showBubble }); return s.end(text); },
    stop() { if (speaking) { stopSpeaking(); speaking = false; face.setSpeaking(false); } current = null; },
    showBubble: bubble,
    destroy() { api.stop(); clearTimeout(revert); clearTimeout(bubbleTimer); face && face.destroy(); el.removeEventListener('pointermove', move); },
  };
  const move = e => {
    const r = $('.face').getBoundingClientRect();
    face.lookAt(Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2)), Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.45) * 2)));
    clearTimeout(move.t); move.t = setTimeout(() => face.lookAt(null), 1500);
  };
  el.addEventListener('pointermove', move);
  $('.st-face').addEventListener('click', () => {
    unlockAudio();
    if (speaking) { api.stop(); el.dispatchEvent(new CustomEvent('stage-interrupt', { bubbles: true })); return; }
    face.poke(); SFX.tap();
    if (Date.now() - lastPoke < 2500) return;
    lastPoke = Date.now();
    const p = getPatience(t.id);
    const set = p >= 60 ? POKE.hi : p >= 35 ? POKE.mid : POKE.lo;
    show(p >= 60 ? 'mutlu' : p >= 35 ? 'suphe' : 'kizgin', 2500);
    api.say(set[pokeN++ % set.length]);
  });
  return api;
}
