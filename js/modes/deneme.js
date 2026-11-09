// DENEME: süreli deneme sınavı. Hoca hazırlar, sen çözersin, net ve puan hesaplanır.
import { llmJSON, hasAI, aiReady } from '../ai.js';
import { quizSystem } from '../prompts.js';
import { topicPicker } from '../topics.js';
import { addResult, getResults, getSettings, isHighSchool } from '../storage.js';
import { esc, rich, LETTERS, letterOf, needAI, errorBox } from '../ui.js';

export function mountDeneme(el, { t, stage, switchTab }) {
  let dead = false, timer = null;
  function setup() {
    clearInterval(timer);
    const past = getResults().filter(r => r.type === 'deneme' && r.teacher === t.id).slice(0, 5);
    el.innerHTML = `
    <div class="card-in">
      <h3>📝 ${esc(t.subject)} denemesi</h3>
      <p class="muted small">Hoca sınav formatında bir deneme hazırlar. Süre tutulur, sonunda doğru-yanlış, net ve puanın çıkar. Elindeki bir denemeyi çözdürmek istersen <button class="link to-sor">📷 Soru Sor</button> bölümünden fotoğrafını at.</p>
      <div class="tp"></div>
      <div class="row">
        <label>Soru sayısı <select class="cnt"><option>10</option><option selected>15</option><option>20</option></select></label>
        <label>Süre <select class="min"><option value="15">15 dk</option><option value="25" selected>25 dk</option><option value="40">40 dk</option></select></label>
      </div>
      <button class="btn primary big go">Denemeyi hazırla →</button>
    </div>
    ${past.length ? `<div class="card-in"><h4>Geçmiş denemelerin</h4><ul class="past">${past.map(r => `<li><span>${new Date(r.date).toLocaleDateString('tr-TR')}</span><span>${esc(r.topic || 'Karışık')}</span><b>${r.net} net · %${r.score}</b></li>`).join('')}</ul></div>` : ''}`;
    const getTopic = topicPicker(el.querySelector('.tp'), t, { multi: true });
    el.querySelector('.to-sor').addEventListener('click', () => switchTab('sor'));
    el.querySelector('.go').addEventListener('click', () => build(getTopic(), +el.querySelector('.cnt').value, +el.querySelector('.min').value));
  }

  async function build(topic, count, minutes) {
    if (!hasAI()) return needAI(el);
    el.innerHTML = `<div class="loading"><div class="spinner"></div><b>${esc(t.name)} denemeni hazırlıyor…</b><small class="ld">0/${count}</small></div>`;
    stage.think(true);
    stage.say('Deneme kâğıdını hazırlıyorum. Masanı topla!');
    try {
      const qs = [];
      while (qs.length < count) {
        const n = Math.min(8, count - qs.length);
        const j = await llmJSON({
          system: quizSystem(t, { count: n, topic, level: 'karışık (kolaydan zora)' }), tier: 'default',
          messages: [{ role: 'user', content: qs.length ? `Önceki sorulardan farklı ${n} soru daha hazırla. Önceki soruların konuları: ${qs.map(q => q.konu).join(', ')}` : 'Soruları hazırla.' }],
          onText: ({ text }) => { const k = (text.match(/"soru"\s*:/g) || []).length; const l = el.querySelector('.ld'); if (l) l.textContent = `${qs.length + k}/${count} soru hazır…`; },
        });
        if (dead) return;
        const got = (j.sorular || []).filter(q => q.soru && Array.isArray(q.secenekler) && q.secenekler.length >= 2);
        if (!got.length) throw new Error('Sorular hazırlanamadı.');
        qs.push(...got.map(q => ({ ...q, dogru: letterOf(q.dogru, q.secenekler.length) })));
      }
      stage.think(false);
      exam(qs.slice(0, count), minutes, topic);
    } catch (e) { stage.think(false); if (!dead) errorBox(el, e, setup); }
  }

  function exam(qs, minutes, topic) {
    const picks = new Array(qs.length).fill(null);
    let cur = 0, left = minutes * 60;
    stage.say(`Deneme başladı! ${minutes} dakikan var. Başarılar!`);
    el.innerHTML = `
    <div class="exam">
      <div class="ex-top"><b>📝 Deneme</b><span class="ex-time"></span><button class="btn primary sm finish">Bitir</button></div>
      <div class="ex-nav">${qs.map((_, i) => `<button data-i="${i}">${i + 1}</button>`).join('')}</div>
      <div class="ex-q"></div>
      <div class="row ex-move"><button class="btn ghost prev">← Önceki</button><button class="btn ghost next">Sonraki →</button></div>
    </div>`;
    const draw = () => {
      const q = qs[cur];
      el.querySelector('.ex-q').innerHTML = `<div class="q-card" style="--tc:${t.color}"><div class="q-text"><b>${cur + 1}.</b> ${rich(q.soru)}</div>
        <div class="q-opts">${q.secenekler.map((o, k) => `<button class="opt ${picks[cur] === LETTERS[k] ? 'picked' : ''}" data-l="${LETTERS[k]}"><b>${LETTERS[k]}</b><span>${rich(String(o).replace(/^[A-E][).]\s*/, ''))}</span></button>`).join('')}</div></div>`;
      el.querySelectorAll('.ex-q .opt').forEach(b => b.addEventListener('click', () => { picks[cur] = picks[cur] === b.dataset.l ? null : b.dataset.l; draw(); }));
      el.querySelectorAll('.ex-nav button').forEach((b, i) => { b.classList.toggle('done', !!picks[i]); b.classList.toggle('cur', i === cur); });
    };
    el.querySelectorAll('.ex-nav button').forEach(b => b.addEventListener('click', () => { cur = +b.dataset.i; draw(); }));
    el.querySelector('.prev').addEventListener('click', () => { if (cur > 0) { cur--; draw(); } });
    el.querySelector('.next').addEventListener('click', () => { if (cur < qs.length - 1) { cur++; draw(); } });
    el.querySelector('.finish').addEventListener('click', () => {
      const empty = picks.filter(p => !p).length;
      if (empty && !confirm(`${empty} boş soru var. Yine de bitirilsin mi?`)) return;
      finish(qs, picks, minutes * 60 - left, topic);
    });
    const tick = () => {
      const e = el.querySelector('.ex-time'); if (!e) return;
      e.textContent = `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      e.classList.toggle('low', left < 120);
    };
    tick();
    timer = setInterval(() => {
      if (document.hidden) return;
      left--; tick();
      if (left === 300) stage.say('Son 5 dakika!');
      if (left <= 0) { stage.react('gec'); finish(qs, picks, minutes * 60, topic); }
    }, 1000);
    draw();
  }

  function finish(qs, picks, used, topic) {
    clearInterval(timer);
    const d = qs.filter((q, i) => picks[i] === q.dogru).length;
    const b = picks.filter(p => !p).length;
    const y = qs.length - d - b;
    const div = isHighSchool(getSettings().grade) ? 4 : 3;
    const net = Math.max(0, +(d - y / div).toFixed(2));
    const score = Math.round(net / qs.length * 100);
    addResult({ type: 'deneme', teacher: t.id, subject: t.subject, topic, correct: d, wrong: y, blank: b, net, score, total: qs.length });
    const ev = score >= 75 ? 'deneme_iyi' : score >= 45 ? 'deneme_orta' : 'deneme_kotu';
    const r = stage.react(ev, 10000);
    const msg = score >= 75 ? `Muhteşem bir deneme! ${net} net yaptın.` : score >= 45 ? `${net} net. İdare eder ama daha iyisini yapabilirsin.` : `${net} net... Bu hiç iyi değil. Yanlışlarını birlikte inceleyelim.`;
    stage.say(msg);
    el.innerHTML = `
    <div class="result card-in">
      <div class="score-ring" style="--p:${score};--tc:${t.color}"><div><b>${net}</b><small>net</small></div></div>
      <h3>${esc(msg)}</h3>
      <div class="stats4"><div><b class="g">${d}</b><small>Doğru</small></div><div><b class="r">${y}</b><small>Yanlış</small></div><div><b>${b}</b><small>Boş</small></div><div><b>%${score}</b><small>Başarı</small></div></div>
      <p class="muted small">Net = Doğru − Yanlış ÷ ${div} · Süre: ${Math.round(used / 60)} dk · Hocanın sabrı: ${r.patience}</p>
      <h4>Cevap anahtarı ve çözümler</h4>
      <div class="review">${qs.map((q, i) => {
        const ok = picks[i] === q.dogru;
        return `<details class="${ok ? 'ok' : picks[i] ? 'no' : 'blank'}"><summary><b>${i + 1}.</b> ${ok ? '✅' : picks[i] ? '❌' : '⚪'} Senin: ${picks[i] || '—'} · Doğru: ${q.dogru}</summary>
          <div class="q-text">${rich(q.soru)}</div><ol type="A" class="opts-list">${q.secenekler.map(o => `<li>${rich(String(o).replace(/^[A-E][).]\s*/, ''))}</li>`).join('')}</ol><p class="cozum">💡 ${rich(q.cozum || '')}</p></details>`;
      }).join('')}</div>
      <div class="row"><button class="btn primary again">Yeni deneme</button></div>
    </div>`;
    el.querySelector('.again').addEventListener('click', setup);
  }

  setup();
  aiReady.then(() => { if (!dead && !hasAI()) needAI(el); });
  return { destroy() { dead = true; clearInterval(timer); } };
}
