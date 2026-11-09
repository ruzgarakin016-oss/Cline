// Hoca odası: solda robot hoca, sağda sekmeler (Ders, Soru Sor, Soru Çöz, Deneme, Yazılı, Tekrar).
import { teacherById } from './teachers.js';
import { createStage } from './stage.js';
import { getSettings, remaining } from './storage.js';
import { unlockAudio } from './speech.js';
import { esc } from './ui.js';
import { mountDers } from './modes/ders.js';
import { mountSor } from './modes/sor.js';
import { mountCoz } from './modes/coz.js';
import { mountDeneme } from './modes/deneme.js';
import { mountYazili } from './modes/yazili.js';
import { mountTekrar } from './modes/tekrar.js';

export const TABS = [
  ['ders', '💬', 'Ders', mountDers],
  ['sor', '📷', 'Soru Sor', mountSor],
  ['coz', '✏️', 'Soru Çöz', mountCoz],
  ['deneme', '📝', 'Deneme', mountDeneme],
  ['yazili', '🗒️', 'Yazılı', mountYazili],
  ['tekrar', '🔁', 'Tekrar', mountTekrar],
];

export function mountRoom(root, teacherId, tab, { go }) {
  const t = teacherById(teacherId);
  root.innerHTML = `
  <section class="room" style="--tc:${t.color}">
    <div class="room-stage"></div>
    <div class="room-main">
      <header class="room-head">
        <button class="icon-btn back" aria-label="Geri">←</button>
        <div class="rh-title"><b>${t.icon} ${esc(t.name)}</b><small>${esc(t.subject)} · ${esc(t.tagline)}</small></div>
        <span class="limit-pill"></span>
        <button class="icon-btn voice" aria-label="Ses"></button>
      </header>
      <nav class="tabs">${TABS.map(([k, ic, label]) => `<button data-tab="${k}"><span>${ic}</span>${label}</button>`).join('')}</nav>
      <div class="room-body"></div>
    </div>
  </section>`;
  const $ = s => root.querySelector(s);
  const stage = createStage($('.room-stage'), t);
  let current = null, curTab = null;

  const pill = () => {
    const r = remaining(), L = getSettings().dailyLimit;
    $('.limit-pill').textContent = `❓ ${r}/${L}`;
    $('.limit-pill').className = 'limit-pill' + (r === 0 ? ' out' : r <= 5 ? ' low' : '');
  };
  const voiceBtn = () => { $('.voice').textContent = stage.voice ? '🔊' : '🔇'; };
  pill(); voiceBtn();
  document.addEventListener('usage', pill);

  function switchTab(k) {
    if (curTab === k) return;
    current && current.destroy();
    stage.stop();
    curTab = k;
    root.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === k));
    const body = $('.room-body');
    body.scrollTop = 0;
    const mount = TABS.find(x => x[0] === k)[3];
    current = mount(body, { t, stage, go, switchTab });
    history.replaceState(null, '', `#room/${t.id}/${k}`);
  }
  root.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { unlockAudio(); switchTab(b.dataset.tab); }));
  $('.back').addEventListener('click', () => go('home'));
  $('.voice').addEventListener('click', () => { stage.setVoice(!stage.voice); voiceBtn(); });
  switchTab(TABS.some(x => x[0] === tab) ? tab : 'ders');

  return {
    teacherId: t.id,
    destroy() { current && current.destroy(); stage.destroy(); document.removeEventListener('usage', pill); },
  };
}
