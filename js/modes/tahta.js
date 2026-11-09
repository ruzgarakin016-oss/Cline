// TAHTA: soruyu parmağınla / kalemle tahtaya çöz, robot okuyup kontrol etsin.
import { llmJSON, prepareImage, hasAI, aiReady } from '../ai.js';
import { boardSystem } from '../prompts.js';
import { esc, rich, toast, errorBox, needAI } from '../ui.js';
import { addXP, stat, recordAnswer } from '../progress.js';

const COLORS = ['#1d1a33', '#2563eb', '#dc2626', '#16a34a'];

export function mountTahta(el, { t, stage }) {
  let dead = false, strokes = [], cur = null, color = COLORS[0], size = 4, erase = false, penSeen = false, qPhoto = null;
  el.innerHTML = `
  <div class="tahta">
    <div class="tb-q">
      <input class="tb-qtext" placeholder="Hangi soruyu çözüyorsun? (yaz ya da fotoğrafını ekle — isteğe bağlı)">
      <label class="btn ghost sm file-btn">📷<input type="file" accept="image/*" hidden class="tb-ph"></label>
    </div>
    <div class="tb-tools">
      ${COLORS.map((c, i) => `<button class="tb-c ${i ? '' : 'on'}" data-c="${c}" style="--c:${c}" aria-label="Renk"></button>`).join('')}
      <button class="tb-s" data-s="3">ince</button><button class="tb-s on" data-s="5">orta</button><button class="tb-s" data-s="9">kalın</button>
      <button class="tb-e" aria-label="Silgi">🧽</button>
      <button class="tb-u" aria-label="Geri al">↶</button>
      <button class="tb-x" aria-label="Temizle">🗑️</button>
    </div>
    <div class="board"><canvas></canvas><span class="board-hint">Buraya çöz ✍️</span></div>
    <button class="btn primary big tb-send">🤖 ${esc(t.name)}'ya göster</button>
    <div class="tb-out"></div>
  </div>`;
  const $ = s => el.querySelector(s);
  const cv = $('canvas'), ctx = cv.getContext('2d');

  function fit() {
    const r = cv.parentElement.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }
  function drawStroke(s) {
    if (!s.pts.length) return;
    ctx.save();
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 1; i < s.pts.length; i++) {
      const a = s.pts[i - 1], b = s.pts[i];
      ctx.lineWidth = (s.erase ? 26 : s.size) * (b.p || 1);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    if (s.pts.length === 1) { ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.pts[0].x, s.pts[0].y, s.size / 2, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  function redraw() { ctx.clearRect(0, 0, cv.width, cv.height); strokes.forEach(drawStroke); $('.board-hint').hidden = strokes.length > 0; }
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pointerType === 'pen' ? 0.5 + (e.pressure || 0.5) : 1 }; };
  cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'pen') penSeen = true;
    if (penSeen && e.pointerType === 'touch') return; // avuç içi koruması
    cv.setPointerCapture(e.pointerId);
    cur = { color, size, erase, pts: [pos(e)] };
    strokes.push(cur); redraw();
  });
  cv.addEventListener('pointermove', e => {
    if (!cur) return;
    const p = pos(e), last = cur.pts[cur.pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 1.2) return;
    cur.pts.push(p); drawStroke({ ...cur, pts: [last, p] });
  });
  const up = () => { cur = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.style.touchAction = 'none';

  el.querySelectorAll('.tb-c').forEach(b => b.addEventListener('click', () => { color = b.dataset.c; erase = false; el.querySelectorAll('.tb-c,.tb-e').forEach(x => x.classList.remove('on')); b.classList.add('on'); }));
  el.querySelectorAll('.tb-s').forEach(b => b.addEventListener('click', () => { size = +b.dataset.s; el.querySelectorAll('.tb-s').forEach(x => x.classList.remove('on')); b.classList.add('on'); }));
  $('.tb-e').addEventListener('click', () => { erase = true; el.querySelectorAll('.tb-c').forEach(x => x.classList.remove('on')); $('.tb-e').classList.add('on'); });
  $('.tb-u').addEventListener('click', () => { strokes.pop(); redraw(); });
  $('.tb-x').addEventListener('click', () => { if (strokes.length && confirm('Tahta temizlensin mi?')) { strokes = []; redraw(); } });
  $('.tb-ph').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; try { qPhoto = await prepareImage(f); toast('📷 Soru fotoğrafı eklendi'); } catch { toast('Fotoğraf açılamadı'); } });

  function exportPNG() {
    const out = document.createElement('canvas');
    out.width = cv.width; out.height = cv.height;
    const o = out.getContext('2d');
    o.fillStyle = '#ffffff'; o.fillRect(0, 0, out.width, out.height);
    o.drawImage(cv, 0, 0);
    return new Promise(res => out.toBlob(res, 'image/png'));
  }

  $('.tb-send').addEventListener('click', async () => {
    if (!strokes.length) return toast('Önce tahtaya çözümünü yaz.');
    if (!hasAI()) return needAI($('.tb-out'));
    const out = $('.tb-out');
    out.innerHTML = `<div class="loading"><div class="spinner"></div><b>${esc(t.name)} tahtanı okuyor…</b><small>10-40 sn</small></div>`;
    $('.tb-send').disabled = true;
    stage.think(true);
    try {
      const img = await exportPNG();
      const images = qPhoto ? [qPhoto, img] : [img];
      const qtext = $('.tb-qtext').value.trim();
      const j = await llmJSON({
        system: boardSystem(t), tier: 'default', images,
        messages: [{ role: 'user', content: `${qPhoto ? 'İlk fotoğraf soru, ikincisi benim tahtadaki çözümüm. ' : 'Fotoğraf benim tahtadaki çözümüm. '}${qtext ? 'Soru: ' + qtext : ''}` }],
      });
      if (dead) return;
      stage.think(false);
      const res = ['dogru', 'kismen', 'yanlis', 'okunamadi'].includes(j.sonuc) ? j.sonuc : 'kismen';
      stat('board');
      if (res === 'dogru') { stage.react('dogru'); addXP(25, 'Tahtada doğru çözüm', t.id); }
      else if (res === 'kismen') { stage.react('kismen'); addXP(10, 'Tahtada çözüm', t.id); }
      else if (res === 'yanlis') { stage.react('yanlis'); addXP(4, 'Tahtada çözüm', t.id); }
      if (res !== 'okunamadi') recordAnswer(t.id, qtext ? qtext.slice(0, 40) : 'Tahta çözümleri', res === 'dogru');
      stage.say(j.ozet || '');
      const label = { dogru: '✅ Doğru çözüm!', kismen: '🟡 Kısmen doğru', yanlis: '❌ Çözümde hata var', okunamadi: '🔍 Okuyamadım, daha büyük ve net yaz' }[res];
      out.innerHTML = `
      <div class="sol board-res ${res}" style="--tc:${t.color}">
        <header><div><b>${label}</b>${j.okunan ? `<small>Okuduğum: ${esc(j.okunan)}</small>` : ''}</div></header>
        ${(j.geri_bildirim || []).length ? `<ul>${j.geri_bildirim.map(x => `<li>${rich(x)}</li>`).join('')}</ul>` : ''}
        ${(j.dogru_cozum || []).length && res !== 'dogru' ? `<h4>Doğru çözüm</h4><ol class="steps">${j.dogru_cozum.map(x => `<li>${rich(x)}</li>`).join('')}</ol>` : ''}
        <div class="row"><button class="btn ghost sm again">🧽 Tahtayı temizle, yeni soru</button></div>
      </div>`;
      out.querySelector('.again').addEventListener('click', () => { strokes = []; qPhoto = null; $('.tb-qtext').value = ''; redraw(); out.innerHTML = ''; });
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { stage.think(false); if (!dead) errorBox(out, e); }
    finally { if (!dead) $('.tb-send').disabled = false; }
  });

  const ro = new ResizeObserver(() => fit());
  ro.observe(cv.parentElement);
  aiReady.then(() => { if (!dead && !hasAI()) needAI($('.tb-out')); });
  stage.say('Tahtaya çözümünü yaz, sonra bana göster. Adımları atlamadan yaz!');
  return { destroy() { dead = true; ro.disconnect(); } };
}
