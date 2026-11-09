// İLERLEME: XP, seviye, günlük seri, rozetler, konu karnesi (ustalık).
import { read, write, today } from './storage.js';

const DEF = { xp: 0, days: {}, streak: 0, best: 0, lastDay: null, badges: [], stats: {}, teachers: {} };
export function getProg() { const p = { ...DEF, ...read('prog', {}) }; p.stats = { ...p.stats }; return p; }
function save(p) { write('prog', p); }

export const levelOf = xp => Math.floor((1 + Math.sqrt(1 + 8 * xp / 100)) / 2);
export const xpForLevel = n => 100 * n * (n - 1) / 2;
export const LEVEL_NAMES = ['', 'Çaylak', 'Meraklı', 'Çalışkan', 'Azimli', 'Usta Çırak', 'Bilgin', 'Uzman', 'Dahi', 'Efsane', 'Robot Fısıldayan'];
export const levelName = l => LEVEL_NAMES[Math.min(l, LEVEL_NAMES.length - 1)] + (l >= LEVEL_NAMES.length ? ' ' + (l - LEVEL_NAMES.length + 2) : '');

function yesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return today(d); }
export function currentStreak(p = getProg()) { return p.lastDay === today() || p.lastDay === yesterday() ? p.streak : 0; }

export const BADGES = [
  { id: 'ilk', e: '🌱', n: 'İlk Adım', d: 'İlk XP\'ni kazan', t: p => p.xp > 0 },
  { id: 'seri3', e: '🔥', n: 'Isınıyoruz', d: '3 gün üst üste çalış', t: p => p.best >= 3 },
  { id: 'seri7', e: '⚡', n: 'Bir Hafta!', d: '7 gün seri', t: p => p.best >= 7 },
  { id: 'seri30', e: '🌋', n: 'Durdurulamaz', d: '30 gün seri', t: p => p.best >= 30 },
  { id: 'dogru50', e: '🎯', n: 'Keskin Nişancı', d: '50 doğru cevap', t: p => (p.stats.correct || 0) >= 50 },
  { id: 'dogru300', e: '🏹', n: 'Soru Avcısı', d: '300 doğru cevap', t: p => (p.stats.correct || 0) >= 300 },
  { id: 'foto10', e: '📸', n: 'Fotoğrafçı', d: '10 soru fotoğrafı çözdür', t: p => (p.stats.photos || 0) >= 10 },
  { id: 'tahta5', e: '✍️', n: 'Tahta Kahramanı', d: 'Tahtada 5 çözüm göster', t: p => (p.stats.board || 0) >= 5 },
  { id: 'deneme1', e: '📝', n: 'İlk Deneme', d: 'Bir deneme bitir', t: p => (p.stats.denemes || 0) >= 1 },
  { id: 'deneme10', e: '🏅', n: 'Deneme Makinesi', d: '10 deneme bitir', t: p => (p.stats.denemes || 0) >= 10 },
  { id: 'full', e: '💯', n: 'Kusursuz', d: 'Bir denemeden tam puan al', t: p => (p.stats.perfect || 0) >= 1 },
  { id: 'yazili', e: '🗒️', n: 'Prova Ustası', d: 'Bir yazılı provası yap', t: p => (p.stats.yazili || 0) >= 1 },
  { id: 'odak60', e: '🧘', n: 'Odak Ustası', d: 'Toplam 60 dk odak', t: p => (p.stats.focusMin || 0) >= 60 },
  { id: 'odak600', e: '🧠', n: 'Zen Robotu', d: 'Toplam 10 saat odak', t: p => (p.stats.focusMin || 0) >= 600 },
  { id: 'hata10', e: '🩹', n: 'Hatadan Ders', d: 'Hata defterinden 10 soru kapat', t: p => (p.stats.fixed || 0) >= 10 },
  { id: 'hepsi', e: '🤝', n: 'Herkesin Gözdesi', d: '9 hocanın hepsiyle çalış', t: p => Object.keys(p.teachers).length >= 9 },
  { id: 'gece', e: '🦉', n: 'Gece Kuşu', d: 'Saat 22\'den sonra çalış', t: p => !!p.stats.night },
  { id: 'erken', e: '🐓', n: 'Erken Kalkan', d: 'Saat 8\'den önce çalış', t: p => !!p.stats.early },
  { id: 'lv5', e: '⭐', n: 'Seviye 5', d: '5. seviyeye ulaş', t: p => levelOf(p.xp) >= 5 },
  { id: 'lv10', e: '🌟', n: 'Seviye 10', d: '10. seviyeye ulaş', t: p => levelOf(p.xp) >= 10 },
];

// XP ekle. Olay yayınlar: document 'xp' {n, reason, levelUp, badges}
export function addXP(n, reason = '', teacherId = null) {
  const p = getProg();
  const before = levelOf(p.xp);
  p.xp += n;
  const d = today();
  p.days[d] = (p.days[d] || 0) + n;
  if (p.lastDay !== d) { p.streak = p.lastDay === yesterday() ? p.streak + 1 : 1; p.lastDay = d; }
  p.best = Math.max(p.best || 0, p.streak);
  if (teacherId) p.teachers[teacherId] = (p.teachers[teacherId] || 0) + n;
  const h = new Date().getHours();
  if (h >= 22) p.stats.night = 1;
  if (h < 8) p.stats.early = 1;
  const fresh = BADGES.filter(b => !p.badges.includes(b.id) && b.t(p));
  fresh.forEach(b => p.badges.push(b.id));
  save(p);
  const after = levelOf(p.xp);
  document.dispatchEvent(new CustomEvent('xp', { detail: { n, reason, levelUp: after > before ? after : 0, badges: fresh } }));
  return p;
}
export function stat(k, n = 1) {
  const p = getProg();
  p.stats[k] = (p.stats[k] || 0) + n;
  const fresh = BADGES.filter(b => !p.badges.includes(b.id) && b.t(p));
  fresh.forEach(b => p.badges.push(b.id));
  save(p);
  if (fresh.length) document.dispatchEvent(new CustomEvent('xp', { detail: { n: 0, reason: '', levelUp: 0, badges: fresh } }));
}
export function todayXP() { return getProg().days[today()] || 0; }
export function lastDays(n = 7) {
  const p = getProg(), out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = today(d); out.push({ d, xp: p.days[k] || 0 }); }
  return out;
}

// ---------- Konu karnesi ----------
export function recordAnswer(teacherId, topic, ok) {
  if (!topic) topic = 'Genel';
  topic = String(topic).slice(0, 60);
  const m = read('mastery', {});
  m[teacherId] = m[teacherId] || {};
  const r = m[teacherId][topic] || { c: 0, n: 0, last: 0 };
  r.n++; if (ok) r.c++; r.last = Date.now();
  m[teacherId][topic] = r;
  write('mastery', m);
}
export function mastery(teacherId) {
  const m = read('mastery', {})[teacherId] || {};
  return Object.entries(m).map(([topic, r]) => ({ topic, ...r, pct: Math.round((r.c + 1) / (r.n + 2) * 100) }))
    .sort((a, b) => a.pct - b.pct);
}
export function weakTopics(limit = 6) {
  const m = read('mastery', {});
  const all = [];
  for (const [tid, topics] of Object.entries(m)) for (const [topic, r] of Object.entries(topics)) if (r.n >= 2) all.push({ teacherId: tid, topic, pct: Math.round((r.c + 1) / (r.n + 2) * 100), n: r.n });
  return all.sort((a, b) => a.pct - b.pct).slice(0, limit);
}
