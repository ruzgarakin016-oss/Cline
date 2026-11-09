// Ortak arayüz yardımcıları.
import { getSettings, getUsage, saveUsage } from './storage.js';
import { getPatience } from './mood.js';

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export function toast(msg, ms = 3800) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

export function modal(html, init) {
  const d = document.createElement('dialog');
  d.className = 'modal';
  d.innerHTML = `<button class="icon-btn x" aria-label="Kapat">✕</button>${html}`;
  document.body.appendChild(d);
  d.querySelector('.x').addEventListener('click', () => d.close());
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  init && init(d);
  d.showModal();
  return d;
}

export function loading(el, text, sub = '') {
  el.innerHTML = `<div class="loading"><div class="spinner"></div><b>${esc(text)}</b><small class="ld-sub">${esc(sub)}</small></div>`;
  return t => { const s = el.querySelector('.ld-sub'); if (s) s.textContent = t; };
}

export function errorBox(el, err, retry) {
  el.innerHTML = `<div class="empty"><div class="big-emoji">🔌</div><b>Olmadı…</b><p>${esc(err.message || err)}</p>${retry ? '<button class="btn primary retry">Tekrar dene</button>' : ''}</div>`;
  if (retry) el.querySelector('.retry').addEventListener('click', retry);
}

export function needAI(el) {
  el.innerHTML = `<div class="empty"><div class="big-emoji">🤖💤</div><b>Bu bölüm için yapay zekâ gerekli</b>
  <p>Uygulamayı Claude linkinden açtığında hocalar otomatik çalışır. Başka bir yerden açtıysan Ayarlar'dan API anahtarı ekleyebilirsin.</p>
  <button class="btn primary" data-go="settings">Ayarlar</button></div>`;
}

// Günlük soru hakkı: soru sormadan önce çağır.
export function limitLine(rem) {
  return rem <= 0 ? 'Bugünlük soru hakkın bitti. Yarın tekrar gel, bu arada öğrendiklerini tekrar et!'
    : rem === 1 ? 'Dikkat! Son bir soru hakkın kaldı. Boşa harcama.'
      : `Bak, bugün sadece ${rem} soru hakkın kaldı. Sorularını dikkatli seç.`;
}
export function consumeQuestion(stage) {
  const s = getSettings(), u = getUsage();
  if (u.used >= s.dailyLimit) {
    stage.react('limit_bitti');
    stage.say(limitLine(0));
    toast('⛔ Bugünlük soru hakkın bitti.');
    return false;
  }
  u.used++;
  const rem = s.dailyLimit - u.used;
  let warn = null;
  if ([10, 5, 3, 1, 0].includes(rem) && !u.warned.includes(rem)) { u.warned.push(rem); warn = rem; }
  saveUsage(u);
  document.dispatchEvent(new CustomEvent('usage'));
  if (warn != null) {
    toast('⚠️ ' + limitLine(warn));
    // Hoca mevcut konuşmasını bitirince uyarsın
    const deliver = () => { if (stage.speaking) return setTimeout(deliver, 500); stage.react(warn === 0 ? 'limit_bitti' : 'limit_az'); stage.say(limitLine(warn)); };
    setTimeout(deliver, 2500);
  }
  return true;
}

// Sabra göre kural tabanlı kısa tepkiler (rastgele değil, sırayla döner)
const counters = {};
const LINES = {
  dogru: [['Harika, doğru! Devam!', 'Mükemmel, tam isabet!', 'İşte bu! Doğru cevap.'], ['Doğru. Böyle devam et.', 'Evet, doğru.', 'Tamam, bu doğru.']],
  yanlis: [['Hmm, olmadı. Açıklamaya bak.', 'Yanlış ama sorun değil, öğreniyoruz.', 'Bu sefer olmadı, çözüme bir göz at.'], ['Yanlış! Daha dikkatli ol.', 'Olmadı. Bunu çalışman lazım.', 'Yine yanlış. Konuyu tekrar etmelisin!']],
  sessiz: [['Süre doldu! Bir dahakine en azından tahmin et.', 'Cevap vermedin, sinyalin mi koptu?'], ['Süre bitti ve cevap yok! Böyle olmaz.', 'Yine cevap yok! Beni dinlemiyorsun.']],
  bekle: [['Hadi, bekliyorum.', 'Acele etme ama süren azalıyor.'], ['Saat işliyor, cevap?', 'Hadi! Sessizlik cevap değildir.']],
};
export function line(ev, teacherId) {
  const set = LINES[ev]; if (!set) return '';
  const variant = getPatience(teacherId) >= 50 ? 0 : 1;
  const arr = set[variant];
  counters[ev] = (counters[ev] || 0) + 1;
  return arr[counters[ev] % arr.length];
}

// Basit zengin metin: satır sonları ve **kalın**
export function rich(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
}

export function googleLink(q, label) {
  return `<a class="g-link" href="https://www.google.com/search?q=${encodeURIComponent(q)}" target="_blank" rel="noopener"><span>G</span>${esc(label || q)}</a>`;
}

export function letterOf(ans, n) {
  if (typeof ans === 'number') return LETTERS[ans] || 'A';
  const m = String(ans).trim().toUpperCase().match(/[A-E]/);
  const L = m ? m[0] : 'A';
  return LETTERS.indexOf(L) < n ? L : 'A';
}
