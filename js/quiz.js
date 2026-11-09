// Çoktan seçmeli soru çözme (tek tek, süreli, anında geri bildirim).
import { esc, rich, LETTERS, letterOf, line } from './ui.js';
import { teacherById } from './teachers.js';
import { bumpStat } from './storage.js';

export function runQuiz(el, stage, questions, { timePer = 60, title = 'Soru Çöz', onDone } = {}) {
  let i = 0, timer = null, left = 0, warned = false, dead = false;
  const answers = [];
  const qs = questions.map(q => ({ ...q, dogru: letterOf(q.dogru, (q.secenekler || []).length || 4) }));

  function stopTimer() { clearInterval(timer); timer = null; }
  function show() {
    stopTimer();
    const q = qs[i];
    if (q.teacherId && stage.teacher.id !== q.teacherId) stage.setTeacher(teacherById(q.teacherId));
    const t = stage.teacher;
    el.innerHTML = `
    <div class="quiz">
      <div class="q-top">
        <span class="q-count">${esc(title)} · ${i + 1}/${qs.length}</span>
        ${q.konu ? `<span class="chip">${esc(q.konu)}</span>` : ''}
        <span class="q-timer"><i></i><b></b></span>
      </div>
      <div class="q-progress">${qs.map((_, k) => `<span class="${k < i ? (answers[k]?.ok ? 'ok' : 'no') : k === i ? 'cur' : ''}"></span>`).join('')}</div>
      <div class="q-card" style="--tc:${t.color}">
        <div class="q-text">${rich(q.soru)}</div>
        <div class="q-opts">${q.secenekler.map((o, k) => `<button class="opt" data-l="${LETTERS[k]}"><b>${LETTERS[k]}</b><span>${rich(String(o).replace(/^[A-E][).]\s*/, ''))}</span></button>`).join('')}</div>
        <div class="q-feedback" hidden></div>
      </div>
    </div>`;
    el.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => answer(b.dataset.l)));
    left = timePer; warned = false;
    stage.say(q.soru.length < 220 ? q.soru : `${i + 1}. soru ekranda. Dikkatle oku.`, { bubble: false });
    drawTimer();
    timer = setInterval(() => {
      if (document.hidden || stage.speaking) return;
      left--; drawTimer();
      if (!warned && left === Math.floor(timePer / 3)) { warned = true; stage.react('bekle', 3500); stage.say(line('bekle', stage.teacher.id)); }
      if (left <= 0) answer(null);
    }, 1000);
  }
  function drawTimer() {
    const f = left / timePer;
    const bar = el.querySelector('.q-timer i'); if (!bar) return;
    bar.style.width = f * 100 + '%';
    bar.style.background = f > 0.5 ? '#22c55e' : f > 0.25 ? '#f59e0b' : '#ef4444';
    el.querySelector('.q-timer b').textContent = left + ' sn';
  }
  function answer(L) {
    if (dead || answers[i]) return;
    stopTimer();
    const q = qs[i];
    const ok = L === q.dogru;
    answers[i] = { picked: L, ok, q };
    el.querySelectorAll('.opt').forEach(b => {
      b.disabled = true;
      if (b.dataset.l === q.dogru) b.classList.add('right');
      else if (b.dataset.l === L) b.classList.add('wrong');
    });
    const ev = L == null ? 'sessiz' : ok ? 'dogru' : 'yanlis';
    bumpStat(L == null ? 'silent' : ok ? 'correct' : 'wrong');
    stage.react(ev);
    const say = line(ev, stage.teacher.id);
    stage.say(ok ? say : `${say} Doğru cevap ${q.dogru}.`);
    const fb = el.querySelector('.q-feedback');
    fb.hidden = false;
    fb.className = 'q-feedback ' + (ok ? 'ok' : 'no');
    fb.innerHTML = `<b>${ok ? '✅ Doğru!' : L ? `❌ Yanlış — doğru cevap ${q.dogru}` : `⏰ Süre doldu — doğru cevap ${q.dogru}`}</b>
      ${q.cozum ? `<p>${rich(q.cozum)}</p>` : ''}
      <button class="btn primary next">${i + 1 < qs.length ? 'Sonraki soru →' : 'Sonuçları gör'}</button>`;
    fb.querySelector('.next').addEventListener('click', () => { i++; if (i < qs.length) show(); else finish(); });
    fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function finish() {
    const correct = answers.filter(a => a.ok).length;
    onDone && onDone({ answers, correct, total: qs.length });
  }
  show();
  return { destroy() { dead = true; stopTimer(); } };
}
