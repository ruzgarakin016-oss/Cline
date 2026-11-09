// SORU SOR: soruyu yaz ya da fotoğrafını at (deneme sayfası da olur), hoca adım adım çözsün.
import { llmJSON, llm, prepareImage, hasAI, aiReady } from '../ai.js';
import { solveSystem, base, SPOKEN } from '../prompts.js';
import { esc, rich, toast, consumeQuestion, errorBox, needAI } from '../ui.js';
import { addXP, stat } from '../progress.js';

export function mountSor(el, { t, stage }) {
  let images = [], dead = false, lastSolution = null, lastQuestion = '';
  el.innerHTML = `
  <div class="sor">
    <div class="card-in">
      <h3>📷 Soru at, ${esc(t.name)} çözsün</h3>
      <p class="muted small">Kitaptan, testten ya da denemeden fotoğraf çek. Sayfada birden çok soru varsa hepsini çözer. İstersen yazarak da sorabilirsin.</p>
      <div class="pick-row">
        <label class="btn primary file-btn">📸 Fotoğraf çek<input type="file" accept="image/*" capture="environment" hidden class="cam"></label>
        <label class="btn ghost file-btn">🖼️ Galeriden seç<input type="file" accept="image/*" multiple hidden class="gal"></label>
      </div>
      <div class="thumbs"></div>
      <textarea class="q-in" rows="3" placeholder="Soruyu buraya yaz ya da fotoğrafa not ekle (ör. 'sadece 5. soruyu çöz')"></textarea>
      <button class="btn primary big ask">Hocaya sor (1 hak)</button>
    </div>
    <div class="sor-out"></div>
  </div>`;
  const $ = s => el.querySelector(s);
  aiReady.then(() => { if (!dead && !hasAI()) needAI($('.sor-out')); });

  async function addFiles(files) {
    for (const f of [...files].slice(0, 4 - images.length)) {
      try { images.push(await prepareImage(f)); } catch { toast('Bu fotoğraf açılamadı.'); }
    }
    drawThumbs();
  }
  function drawThumbs() {
    $('.thumbs').innerHTML = images.map((b, i) => `<div class="thumb"><img src="${URL.createObjectURL(b)}" alt="Soru fotoğrafı ${i + 1}"><button data-i="${i}" aria-label="Kaldır">✕</button></div>`).join('');
    $('.thumbs').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { images.splice(+b.dataset.i, 1); drawThumbs(); }));
  }
  $('.cam').addEventListener('change', e => addFiles(e.target.files));
  $('.gal').addEventListener('change', e => addFiles(e.target.files));

  async function ask() {
    const text = $('.q-in').value.trim();
    if (!text && !images.length) return toast('Önce bir soru yaz ya da fotoğraf ekle.');
    if (!hasAI()) return needAI($('.sor-out'));
    if (!consumeQuestion(stage)) return;
    const imgs = images.slice();
    lastQuestion = text || '(fotoğraftaki soru)';
    $('.ask').disabled = true;
    const out = $('.sor-out');
    out.innerHTML = `<div class="loading"><div class="spinner"></div><b>${esc(t.name)} soruyu çözüyor…</b><small>Dikkatli çözmesi 10-60 saniye sürebilir.</small></div>`;
    stage.react('foto', 0); stage.think(true);
    try {
      const j = await llmJSON({
        system: solveSystem(t), tier: 'default', images: imgs,
        messages: [{ role: 'user', content: (imgs.length ? `${imgs.length} fotoğraf gönderdim. ` : '') + (text || 'Fotoğraftaki soruları çöz.') }],
      });
      if (dead) return;
      lastSolution = j;
      stage.think(false);
      render(j);
      images = []; drawThumbs(); $('.q-in').value = '';
      stage.calm();
      if (imgs.length) stat('photos');
      addXP(5, 'Soru sordun', t.id);
      stage.say(j.ozet || 'Çözümü ekrana yazdım, adım adım incele.');
    } catch (e) {
      stage.think(false);
      if (!dead) errorBox(out, e, ask);
    } finally { if (!dead) $('.ask').disabled = false; }
  }
  $('.ask').addEventListener('click', ask);

  function render(j) {
    const qs = Array.isArray(j.sorular) ? j.sorular : [];
    $('.sor-out').innerHTML = `
      ${qs.map(q => `
      <article class="sol" style="--tc:${t.color}">
        <header><span class="sol-no">${esc(q.no || '')}</span><div><b>${esc(q.soru_ozeti || 'Soru')}</b>${q.konu ? `<small>${esc(q.konu)}</small>` : ''}</div></header>
        <ol class="steps">${(q.adimlar || []).map(a => `<li>${rich(a)}</li>`).join('')}</ol>
        <div class="answer">✅ Cevap: <b>${rich(q.cevap || '')}</b></div>
      </article>`).join('')}
      <div class="follow">
        <input class="f-in" placeholder="Anlamadığın yeri sor… (1 hak)">
        <button class="btn primary f-ask">Sor</button>
        <button class="btn ghost f-simple">🧸 Daha basit anlat</button>
      </div>
      <div class="f-out"></div>`;
    const fq = async q => {
      if (!q.trim()) return;
      if (!consumeQuestion(stage)) return;
      const fo = $('.f-out');
      fo.innerHTML = '<div class="loading sm"><div class="spinner"></div><b>Düşünüyor…</b></div>';
      stage.think(true);
      try {
        const ans = await llm({
          system: `${base(t)}\n${SPOKEN} Düz metin yaz.`,
          messages: [{ role: 'user', content: `Soru: ${lastQuestion}\nSenin çözümün: ${JSON.stringify(lastSolution)}\n\nÖğrencinin sorusu: ${q}` }],
        });
        if (dead) return;
        stage.think(false);
        fo.innerHTML = `<div class="msg teacher"><p>${rich(ans)}</p></div>`;
        stage.react('soru');
        stage.say(ans, { bubble: false });
      } catch (e) { stage.think(false); fo.innerHTML = `<p class="alert red">${esc(e.message)}</p>`; }
    };
    $('.f-ask').addEventListener('click', () => { fq($('.f-in').value); $('.f-in').value = ''; });
    $('.f-in').addEventListener('keydown', e => { if (e.key === 'Enter') $('.f-ask').click(); });
    $('.f-simple').addEventListener('click', () => fq('Bunu çok daha basit, günlük hayattan bir örnekle anlatır mısın?'));
  }
  return { destroy() { dead = true; } };
}
