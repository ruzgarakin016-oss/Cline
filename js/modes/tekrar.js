// TEKRAR: hoca konu özetlerini kart kart anlatır, mini sorular sorar, sonunda kısa test.
import { llmJSON, hasAI, aiReady } from '../ai.js';
import { reviewSystem, quizSystem } from '../prompts.js';
import { topicPicker } from '../topics.js';
import { runQuiz } from '../quiz.js';
import { addResult } from '../storage.js';
import { esc, rich, needAI, errorBox } from '../ui.js';

export function mountTekrar(el, { t, stage }) {
  let dead = false, quiz = null;
  function setup() {
    quiz && quiz.destroy();
    el.innerHTML = `
    <div class="card-in">
      <h3>🔁 ${esc(t.name)} ile tekrar</h3>
      <p class="muted small">Hoca konuları kısa kartlarla sesli anlatır, her kartta mini bir soru sorar. Sonunda 5 soruluk kontrol testi var.</p>
      <div class="tp"></div>
      <button class="btn primary big go">Tekrara başla →</button>
    </div>`;
    const getTopic = topicPicker(el.querySelector('.tp'), t);
    el.querySelector('.go').addEventListener('click', () => start(getTopic()));
  }
  async function start(topic) {
    if (!hasAI()) return needAI(el);
    el.innerHTML = `<div class="loading"><div class="spinner"></div><b>Tekrar kartları hazırlanıyor…</b><small>10-40 sn</small></div>`;
    stage.think(true);
    try {
      const j = await llmJSON({ system: reviewSystem(t, { topic }), tier: 'default', messages: [{ role: 'user', content: 'Kartları hazırla.' }] });
      if (dead) return;
      stage.think(false);
      const cards = (j.kartlar || []).filter(c => c.baslik);
      if (!cards.length) throw new Error('Kartlar hazırlanamadı.');
      show(cards, 0, topic);
    } catch (e) { stage.think(false); if (!dead) errorBox(el, e, setup); }
  }
  function show(cards, i, topic) {
    const c = cards[i];
    el.innerHTML = `
    <div class="flash" style="--tc:${t.color}">
      <div class="q-progress">${cards.map((_, k) => `<span class="${k < i ? 'ok' : k === i ? 'cur' : ''}"></span>`).join('')}</div>
      <article class="fcard">
        <span class="chip">Kart ${i + 1}/${cards.length}</span>
        <h3>${esc(c.baslik)}</h3>
        <p>${rich(c.ozet)}</p>
        ${(c.anahtarlar || []).length ? `<div class="keys">${c.anahtarlar.map(k => `<span>${rich(k)}</span>`).join('')}</div>` : ''}
        ${c.mini_soru ? `<div class="mini"><b>❓ ${rich(c.mini_soru)}</b><button class="btn ghost sm reveal">Cevabı göster</button><p class="mini-a" hidden>👉 ${rich(c.mini_cevap || '')}</p></div>` : ''}
      </article>
      <div class="row"><button class="btn ghost prev" ${i ? '' : 'disabled'}>← Önceki</button><button class="btn ghost replay">🔊 Tekrar oku</button><button class="btn primary next">${i + 1 < cards.length ? 'Sonraki kart →' : 'Kontrol testine geç →'}</button></div>
    </div>`;
    const read = () => stage.say(`${c.baslik}. ${c.ozet}${c.mini_soru ? ' Soru: ' + c.mini_soru : ''}`, { bubble: false });
    read();
    el.querySelector('.replay').addEventListener('click', read);
    const rv = el.querySelector('.reveal');
    rv && rv.addEventListener('click', () => { el.querySelector('.mini-a').hidden = false; rv.remove(); stage.say(c.mini_cevap || ''); });
    el.querySelector('.prev').addEventListener('click', () => show(cards, i - 1, topic));
    el.querySelector('.next').addEventListener('click', () => { if (i + 1 < cards.length) show(cards, i + 1, topic); else check(cards, topic); });
  }
  async function check(cards, topic) {
    el.innerHTML = `<div class="loading"><div class="spinner"></div><b>Kontrol testi hazırlanıyor…</b></div>`;
    stage.react('tekrar');
    stage.think(true);
    try {
      const j = await llmJSON({ system: quizSystem(t, { count: 5, topic: cards.map(c => c.baslik).join(', '), level: 'orta' }), tier: 'default', messages: [{ role: 'user', content: 'Soruları hazırla.' }] });
      if (dead) return;
      stage.think(false);
      quiz = runQuiz(el, stage, (j.sorular || []).filter(q => q.soru && q.secenekler), {
        timePer: 75, title: 'Kontrol', onDone: ({ correct, total }) => {
          const pct = Math.round(correct / total * 100);
          addResult({ type: 'tekrar', teacher: t.id, subject: t.subject, topic, correct, total, score: pct });
          stage.react(pct >= 75 ? 'deneme_iyi' : pct >= 50 ? 'deneme_orta' : 'deneme_kotu', 9000);
          stage.say(pct >= 75 ? 'Tekrar işe yaradı, harikasın!' : pct >= 50 ? 'Güzel, ama birkaç konuyu bir kez daha tekrar et.' : 'Tekrar yetmedi, kartlara bir daha bakalım.');
          el.innerHTML = `<div class="result card-in"><div class="score-ring" style="--p:${pct};--tc:${t.color}"><div><b>${correct}/${total}</b><small>%${pct}</small></div></div>
            <div class="row"><button class="btn ghost back">Kartlara dön</button><button class="btn primary again">Yeni tekrar</button></div></div>`;
          el.querySelector('.back').addEventListener('click', () => show(cards, 0, topic));
          el.querySelector('.again').addEventListener('click', setup);
        },
      });
    } catch (e) { stage.think(false); if (!dead) errorBox(el, e, setup); }
  }
  setup();
  aiReady.then(() => { if (!dead && !hasAI()) needAI(el); });
  return { destroy() { dead = true; quiz && quiz.destroy(); } };
}
