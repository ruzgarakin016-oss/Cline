// KARNE: bu hocanın dersinde konu konu ustalığın + hata defteri tekrarı.
import { mastery, getProg } from '../progress.js';
import { dueMistakes, allMistakes } from '../mistakes.js';
import { getResults } from '../storage.js';
import { runQuiz } from '../quiz.js';
import { esc } from '../ui.js';

export function mountKarne(el, { t, stage, switchTab }) {
  let quiz = null;
  function render() {
    quiz && quiz.destroy();
    const m = mastery(t.id), due = dueMistakes(t.id), all = allMistakes().filter(x => x.teacherId === t.id);
    const res = getResults().filter(r => r.teacher === t.id).slice(0, 6);
    const xp = getProg().teachers[t.id] || 0;
    el.innerHTML = `
    <div class="card-in">
      <div class="karne-top"><div><h3>📊 ${esc(t.subject)} karnen</h3><p class="muted small">${esc(t.name)} ile toplam <b>${xp} XP</b> kazandın.</p></div></div>
      ${m.length ? `<div class="mastery">${m.map(x => `<div class="ms"><span>${esc(x.topic)}</span><div class="bar"><i style="width:${x.pct}%;background:${x.pct >= 75 ? '#22c55e' : x.pct >= 50 ? '#f59e0b' : '#ef4444'}"></i></div><b>%${x.pct}</b><small>${x.c}/${x.n}</small></div>`).join('')}</div>
        <p class="muted small">En zayıf konular üstte. Kırmızı konuları <button class="link go-coz">Soru Çöz</button> ile çalış.</p>`
        : '<p class="muted">Henüz veri yok. Soru çözdükçe konu konu ustalığın burada görünecek.</p>'}
    </div>
    <div class="card-in">
      <h3>📒 Hata defteri</h3>
      <p class="muted small">Yanlış yaptığın sorular burada birikir ve unutmadan önce sana tekrar sorulur (aralıklı tekrar). Bir soruyu 5 kez doğru yapınca defterden çıkar.</p>
      <div class="row"><div class="big-num"><b>${due.length}</b><small>bugün tekrar</small></div><div class="big-num"><b>${all.length}</b><small>toplam</small></div>
      <button class="btn primary big rev" ${due.length ? '' : 'disabled'}>Bugünkü tekrarı çöz →</button></div>
    </div>
    ${res.length ? `<div class="card-in"><h3>Son çalışmalar</h3><ul class="past">${res.map(r => `<li><span>${new Date(r.date).toLocaleDateString('tr-TR')}</span><span class="muted small">${esc(r.topic || r.type)}</span><b>${r.net != null ? r.net + ' net' : '%' + r.score}</b></li>`).join('')}</ul></div>` : ''}`;
    const gc = el.querySelector('.go-coz'); gc && gc.addEventListener('click', () => switchTab('coz'));
    el.querySelector('.rev').addEventListener('click', () => {
      quiz = runQuiz(el, stage, due.slice(0, 15).map(x => ({ ...x.q, mistakeId: x.id })), {
        timePer: 90, title: 'Hata defteri', review: true,
        onDone: ({ correct, total }) => { stage.react(correct / total >= 0.7 ? 'deneme_iyi' : 'deneme_orta'); stage.say(`${total} sorudan ${correct} tanesini bu sefer doğru yaptın.`); render(); },
      });
    });
  }
  render();
  return { destroy() { quiz && quiz.destroy(); } };
}
