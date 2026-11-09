// YAZILI: yazılıya hazırlık (konular, soru tipleri, çözümlü örnekler) + yazılı provası (hoca puanlar).
import { llmJSON, prepareImage, hasAI, aiReady } from '../ai.js';
import { yaziliInfoSystem, yaziliExamSystem, yaziliGradeSystem } from '../prompts.js';
import { getSettings, addResult } from '../storage.js';
import { nextFor, daysUntil, whenText } from '../exams.js';
import { esc, rich, toast, needAI, errorBox, googleLink } from '../ui.js';

export function mountYazili(el, { t, stage }) {
  let dead = false;
  const g = getSettings().grade;
  const ex = nextFor(t.id);
  const guessTerm = () => { const m = new Date().getMonth(); return m >= 8 || m === 0 ? 1 : 2; };

  function setup() {
    const term = guessTerm();
    el.innerHTML = `
    <div class="card-in">
      <h3>🗒️ Yazılıya hazırlan</h3>
      ${ex ? `<p class="alert ${daysUntil(ex.date) <= 3 ? 'red' : 'amber'}">📅 ${esc(ex.title || t.subject + ' yazılısı')}: <b>${new Date(ex.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}</b> (${whenText(daysUntil(ex.date))})</p>` : '<p class="muted small">Takvimde bu dersin yazılısı yok. "Yazılılar" sayfasından tarih ekleyebilirsin.</p>'}
      <div class="row">
        <label>Dönem <select class="donem"><option value="1" ${term === 1 ? 'selected' : ''}>1. dönem</option><option value="2" ${term === 2 ? 'selected' : ''}>2. dönem</option></select></label>
        <label>Yazılı <select class="no"><option value="1">1. yazılı</option><option value="2">2. yazılı</option></select></label>
      </div>
      <div class="row">
        <button class="btn primary info">📚 Yazılıyı anlat</button>
        <button class="btn primary prova">✍️ Yazılı provası yap</button>
      </div>
      <div class="g-row">
        <span class="muted small">Google'da bak:</span>
        <span class="glinks"></span>
      </div>
    </div>
    <div class="y-out"></div>`;
    const links = () => {
      const d = el.querySelector('.donem').value, n = el.querySelector('.no').value;
      el.querySelector('.glinks').innerHTML =
        googleLink(`${g}. sınıf ${t.subject} ${d}. dönem ${n}. yazılı soruları ve cevapları 2026-2027`, 'Örnek yazılı soruları') +
        googleLink(`MEB ${g}. sınıf ${t.subject} ortak sınav örnek sorular`, 'MEB örnek sorular') +
        googleLink(`2026-2027 ${g}. sınıf yazılı tarihleri`, 'Yazılı tarihleri') +
        googleLink(`${g}. sınıf ${t.subject} ${d}. dönem ${n}. yazılı konuları`, 'Konular');
    };
    links();
    el.querySelector('.donem').addEventListener('change', links);
    el.querySelector('.no').addEventListener('change', links);
    el.querySelector('.info').addEventListener('click', () => info(+el.querySelector('.donem').value, +el.querySelector('.no').value));
    el.querySelector('.prova').addEventListener('click', () => prova(+el.querySelector('.donem').value, +el.querySelector('.no').value));
  }

  async function info(donem, no) {
    if (!hasAI()) return needAI(el.querySelector('.y-out'));
    const out = el.querySelector('.y-out');
    out.innerHTML = `<div class="loading"><div class="spinner"></div><b>${esc(t.name)} yazılıyı hazırlıyor…</b><small>Konular, soru tipleri ve çözümlü örnekler · 10-60 sn</small></div>`;
    stage.think(true);
    try {
      const extra = ex && ex.source === 'ortak' ? 'Bu yazılı ülke geneli ortak yazılı sınavı olabilir.' : '';
      const j = await llmJSON({ system: yaziliInfoSystem(t, { donem, no, extra }), tier: 'default', messages: [{ role: 'user', content: 'Yazılıyı anlat.' }] });
      if (dead) return;
      stage.think(false);
      stage.react('tekrar');
      stage.say(j.ozet || 'Yazılıda neler çıkabileceğini ekrana yazdım.');
      out.innerHTML = `
      <div class="card-in y-info">
        <h4>📌 Olası konular</h4><div class="chips">${(j.konular || []).map(k => `<span class="chip">${esc(k)}</span>`).join('')}</div>
        <h4>🧩 Sorular nasıl sorulur?</h4><ul>${(j.soru_tipleri || []).map(k => `<li>${rich(k)}</li>`).join('')}</ul>
        <h4>💡 İpuçları</h4><ul>${(j.ipuclari || []).map(k => `<li>${rich(k)}</li>`).join('')}</ul>
        <h4>✅ Çözümlü örnek sorular</h4>
        ${(j.ornek_sorular || []).map((q, i) => `<details class="ex-sample"><summary><b>${i + 1}.</b> ${rich(q.soru)} ${q.puan ? `<span class="chip">${q.puan} puan</span>` : ''}</summary>
          <ol class="steps">${(q.cozum || []).map(s => `<li>${rich(s)}</li>`).join('')}</ol>${q.cevap ? `<div class="answer">Cevap: <b>${rich(q.cevap)}</b></div>` : ''}</details>`).join('')}
        <p class="muted small">Konular okula ve öğretmene göre değişebilir; öğretmeninden teyit et.</p>
      </div>`;
    } catch (e) { stage.think(false); if (!dead) errorBox(out, e, () => info(donem, no)); }
  }

  async function prova(donem, no) {
    if (!hasAI()) return needAI(el.querySelector('.y-out'));
    const out = el.querySelector('.y-out');
    out.innerHTML = `<div class="loading"><div class="spinner"></div><b>Yazılı kâğıdı hazırlanıyor…</b><small>10-60 sn</small></div>`;
    stage.think(true);
    try {
      const j = await llmJSON({ system: yaziliExamSystem(t, { donem, no, count: 5 }), tier: 'default', messages: [{ role: 'user', content: 'Kâğıdı hazırla.' }] });
      if (dead) return;
      stage.think(false);
      const qs = (j.sorular || []).filter(q => q.soru);
      if (!qs.length) throw new Error('Kâğıt hazırlanamadı.');
      stage.say('Yazılı kâğıdın hazır. Cevaplarını yaz ya da kâğıda çözüp fotoğrafını çek. Kopya yok!');
      let photos = [];
      out.innerHTML = `
      <div class="card-in paper">
        <div class="paper-head"><b>${g}. Sınıf ${esc(t.subject)} · ${donem}. Dönem ${no}. Yazılı (Prova)</b><span>Ad Soyad: ${esc(getSettings().name || '..........')}</span></div>
        ${qs.map((q, i) => `<div class="pq"><div class="pq-q"><b>${q.no || i + 1})</b> ${rich(q.soru)} <span class="chip">${q.puan} p</span></div><textarea data-i="${i}" rows="3" placeholder="Cevabın…"></textarea></div>`).join('')}
        <div class="pick-row"><label class="btn ghost file-btn">📸 Cevap kâğıdımın fotoğrafını ekle<input type="file" accept="image/*" multiple hidden class="ph"></label><span class="ph-n muted small"></span></div>
        <button class="btn primary big submit">Kâğıdı teslim et</button>
      </div>`;
      out.querySelector('.ph').addEventListener('change', async e => {
        for (const f of [...e.target.files].slice(0, 4)) { try { photos.push(await prepareImage(f, 2000)); } catch { toast('Fotoğraf açılamadı'); } }
        out.querySelector('.ph-n').textContent = `${photos.length} fotoğraf eklendi`;
      });
      out.querySelector('.submit').addEventListener('click', () => {
        const ans = [...out.querySelectorAll('textarea')].map(x => x.value.trim());
        if (!photos.length && ans.every(a => !a)) return toast('Hiç cevap yazmadın!');
        grade(qs, ans, photos, donem, no);
      });
    } catch (e) { stage.think(false); if (!dead) errorBox(out, e, () => prova(donem, no)); }
  }

  async function grade(qs, ans, photos, donem, no) {
    const out = el.querySelector('.y-out');
    out.innerHTML = `<div class="loading"><div class="spinner"></div><b>${esc(t.name)} kâğıdını okuyor…</b><small>Kırmızı kalem hazır 🖍️</small></div>`;
    stage.think(true);
    try {
      const paper = qs.map((q, i) => `SORU ${q.no || i + 1} (${q.puan} puan): ${q.soru}\nPUANLAMA ÖLÇÜTÜ: ${q.beklenen}\nÖĞRENCİNİN YAZDIĞI: ${ans[i] || (photos.length ? '(fotoğrafta)' : '(boş)')}`).join('\n\n');
      const j = await llmJSON({ system: yaziliGradeSystem(t), tier: 'default', images: photos, messages: [{ role: 'user', content: (photos.length ? 'Cevap kâğıdının fotoğrafları ekte. ' : '') + paper }] });
      if (dead) return;
      stage.think(false);
      const total = Math.max(0, Math.min(100, Math.round(+j.toplam || (j.sorular || []).reduce((a, s) => a + (+s.alinan || 0), 0))));
      addResult({ type: 'yazili', teacher: t.id, subject: t.subject, topic: `${donem}. dönem ${no}. yazılı provası`, score: total });
      const ev = total >= 70 ? 'yazili_iyi' : total >= 45 ? 'yazili_orta' : 'yazili_kotu';
      stage.react(ev, 10000);
      stage.say(j.genel || `${total} aldın.`);
      out.innerHTML = `
      <div class="result card-in">
        <div class="score-ring red-pen" style="--p:${total};--tc:${total >= 50 ? '#16a34a' : '#dc2626'}"><div><b>${total}</b><small>/100</small></div></div>
        <h3>${rich(j.genel || '')}</h3>
        ${(j.sorular || []).map(s => `<div class="graded"><div><b>${s.no}. soru</b> <span class="pts">${s.alinan}/${s.puan}</span></div><p>${rich(s.geri_bildirim || '')}</p>${s.dogru_cevap ? `<p class="muted small">Doğrusu: ${rich(s.dogru_cevap)}</p>` : ''}</div>`).join('')}
        <div class="row"><button class="btn primary again">Yeni prova</button></div>
      </div>`;
      out.querySelector('.again').addEventListener('click', () => prova(donem, no));
    } catch (e) { stage.think(false); if (!dead) errorBox(out, e, () => grade(qs, ans, photos, donem, no)); }
  }

  setup();
  aiReady.then(() => { if (!dead && !hasAI()) needAI(el.querySelector('.y-out')); });
  return { destroy() { dead = true; } };
}
