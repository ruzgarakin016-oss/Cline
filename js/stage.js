// Sahne: robot hocanın yüzü, altyazı balonu, sabır göstergesi ve sesli konuşma.
import { Face, EMOTIONS } from './face.js';
import { getPatience, baseEmotion, applyEvent, patienceColor } from './mood.js';
import { getSettings } from './storage.js';
import { speak, stopSpeaking } from './speech.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createStage(el, teacher, { compact = false } = {}) {
  el.innerHTML = `
  <div class="stage ${compact ? 'compact' : ''}">
    <div class="st-glow"></div>
    <div class="st-head"><span class="st-name"></span><span class="st-live" hidden>● CANLI</span></div>
    <button class="st-face" aria-label="Hocayı sustur"><div class="face"></div></button>
    <div class="st-bubble" hidden></div>
    <div class="st-meter">
      <span class="st-emo"></span>
      <div class="bar"><i></i></div><b class="st-p"></b>
    </div>
  </div>`;
  const $ = s => el.querySelector(s);
  let t = teacher, face = null, revert = null, speaking = false, thinking = false, voiceOn = getSettings().voice;
  let bubbleTimer = null, resolveSay = null;

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
    const p = getPatience(t.id);
    meter(p, emo);
    clearTimeout(revert);
    if (hold) revert = setTimeout(() => { if (!thinking) { const b = baseEmotion(getPatience(t.id)); face.setEmotion(b); meter(getPatience(t.id), b); } }, hold);
  }
  render();

  const api = {
    get teacher() { return t; },
    get speaking() { return speaking; },
    setTeacher(nt) { t = nt; stopSpeaking(); render(); },
    // Olay → sabır değişir → kurala bağlı ifade
    react(ev, hold) { const r = applyEvent(t.id, ev); show(r.emotion, hold); return r; },
    calm() { show(baseEmotion(getPatience(t.id)), 0); },
    think(on) { thinking = on; if (on) { clearTimeout(revert); face.setEmotion('dusunceli'); $('.st-emo').textContent = '🤔 Düşünüyor…'; } else api.calm(); },
    setVoice(on) { voiceOn = on; if (!on) api.stop(); },
    get voice() { return voiceOn; },
    setLive(on) { $('.st-live').hidden = !on; },
    say(text, { bubble = true } = {}) {
      api.stop();
      const b = $('.st-bubble');
      if (bubble) { b.hidden = false; b.innerHTML = esc(text); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
      clearTimeout(bubbleTimer);
      return new Promise(res => {
        resolveSay = res;
        const end = () => { speaking = false; face.setSpeaking(false); bubbleTimer = setTimeout(() => { b.hidden = true; }, 6000); const r = resolveSay; resolveSay = null; r && r(); };
        if (!voiceOn) { setTimeout(end, 200); return; }
        speaking = true;
        const s = getSettings();
        speak(text, { pitch: t.voice.pitch, rate: t.voice.rate * s.rate }, {
          onstart: () => face.setSpeaking(true), onboundary: () => face.boundary(), onend: end,
        });
      });
    },
    stop() { if (speaking) { stopSpeaking(); speaking = false; face.setSpeaking(false); } const r = resolveSay; resolveSay = null; r && r(); },
    onFaceTap(fn) { $('.st-face').addEventListener('click', fn); },
    destroy() { api.stop(); clearTimeout(revert); clearTimeout(bubbleTimer); face && face.destroy(); el.removeEventListener('pointermove', move); },
  };
  const move = e => {
    const r = $('.face').getBoundingClientRect();
    face.lookAt(Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2)), Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.45) * 2)));
    clearTimeout(move.t); move.t = setTimeout(() => face.lookAt(null), 1500);
  };
  el.addEventListener('pointermove', move);
  $('.st-face').addEventListener('click', () => api.stop());
  return api;
}
