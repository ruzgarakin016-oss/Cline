// SORU ÇÖZ: hoca konuya göre soru hazırlar, sen süreyle çözersin.
import { llmJSON, hasAI, aiReady } from '../ai.js';
import { quizSystem } from '../prompts.js';
import { runQuiz } from '../quiz.js';
import { topicPicker } from '../topics.js';
import { addResult } from '../storage.js';
import { esc, needAI, errorBox } from '../ui.js';

export function mountCoz(el, { t, stage }) {
  let quiz = null, dead = false;
  function setup() {
    quiz && quiz.destroy();
    el.innerHTML = `
    <div class="card-in">
      <h3>✏️ ${esc(t.name)} sana soru sorsun</h3>
      <p class="muted small">Konuyu seç, hoca o konudan sınav tarzında sorular hazırlasın. Süre bitmeden cevapla — susarsan sabrı azalır!</p>
      <div class="tp"></div>
      <div class="row">
        <label>Zorluk <select class="lvl"><option value="kolay">Kolay</option><option value="orta" selected>Orta</option><option value="zor">Zor</option></select></label>
        <label>Soru sayısı <select class="cnt"><option>5</option><option selected>8</option><option>12</option></select></label>
        <label>Soru başı süre <select class="tm"><option value="45">45 sn</option><option value="75" selected>75 sn</option><option value="120">2 dk</option></select></label>
      </div>
      <button class="btn primary big go">Başla →</button>
    </div>`;
    const getTopic = topicPicker(el.querySelector('.tp'), t);
    el.querySelector('.go').addEventListener('click', () => start(getTopic(), el.querySelector('.lvl').value, +el.querySelector('.cnt').value, +el.querySelector('.tm').value));
  }
  async function start(topic, level, count, time) {
    if (!hasAI()) return needAI(el);
    el.innerHTML = `<div class="loading"><div class="spinner"></div><b>${esc(t.name)} soruları hazırlıyor…</b><small class="ld">${count} soru · 10-60 sn</small></div>`;
    stage.think(true);
    stage.say('Soruları hazırlıyorum, kalemini al!', { bubble: true });
    try {
      const j = await llmJSON({
        system: quizSystem(t, { count, topic, level }), tier: 'default',
        messages: [{ role: 'user', content: 'Soruları hazırla.' }],
        onText: ({ text }) => { const n = (text.match(/"soru"\s*:/g) || []).length; const l = el.querySelector('.ld'); if (l) l.textContent = `${n}/${count} soru hazır…`; },
      });
      if (dead) return;
      stage.think(false);
      const qs = (j.sorular || []).filter(q => q.soru && Array.isArray(q.secenekler) && q.secenekler.length >= 2);
      if (!qs.length) throw new Error('Sorular hazırlanamadı, tekrar dene.');
      quiz = runQuiz(el, stage, qs, { timePer: time, title: topic || 'Karışık', onDone: done(topic) });
    } catch (e) { stage.think(false); if (!dead) errorBox(el, e, setup); }
  }
  const done = topic => ({ correct, total, answers }) => {
    const pct = Math.round(correct / total * 100);
    addResult({ type: 'soru', teacher: t.id, subject: t.subject, topic, correct, total, score: pct });
    const ev = pct >= 75 ? 'deneme_iyi' : pct >= 50 ? 'deneme_orta' : 'deneme_kotu';
    stage.react(ev, 9000);
    const msg = pct >= 75 ? `Süpersin! ${total} sorudan ${correct} doğru.` : pct >= 50 ? `Fena değil, ${total} sorudan ${correct} doğru. Biraz daha çalışalım.` : `${total} sorudan sadece ${correct} doğru. Bu konuyu tekrar etmemiz şart.`;
    stage.say(msg);
    el.innerHTML = `
    <div class="result card-in">
      <div class="score-ring" style="--p:${pct};--tc:${t.color}"><div><b>${correct}/${total}</b><small>%${pct}</small></div></div>
      <h3>${esc(msg)}</h3>
      <div class="wrong-list">${answers.filter(a => !a.ok).map(a => `<details><summary>❌ ${esc(a.q.soru.slice(0, 90))}…</summary><p><b>Doğru: ${a.q.dogru}</b> — ${esc(a.q.cozum || '')}</p></details>`).join('')}</div>
      <div class="row"><button class="btn primary again">Yeni sorular</button></div>
    </div>`;
    el.querySelector('.again').addEventListener('click', setup);
  };
  setup();
  aiReady.then(() => { if (!dead && !hasAI()) needAI(el); });
  return { destroy() { dead = true; quiz && quiz.destroy(); } };
}
