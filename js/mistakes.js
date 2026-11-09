// HATA DEFTERİ: yanlış yapılan sorular kaydedilir ve aralıklı tekrar (Leitner kutuları)
// ile tam zamanında yeniden sorulur. 5. kutuyu doğru geçen soru "öğrenildi" sayılır.
import { read, write, today } from './storage.js';
import { stat } from './progress.js';

const GAP = [0, 1, 2, 4, 7, 15]; // kutuya göre gün aralığı
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return today(d); };
const key = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return 'm' + (h >>> 0).toString(36); };

export function allMistakes() { return read('mistakes', []); }
function save(a) { write('mistakes', a); }

export function addMistake(q, teacherId) {
  if (!q || !q.soru || !Array.isArray(q.secenekler)) return;
  const a = allMistakes();
  const id = key(q.soru);
  const ex = a.find(m => m.id === id);
  if (ex) { ex.box = 1; ex.due = addDays(1); }
  else a.unshift({ id, teacherId, box: 1, due: addDays(1), added: today(), q: { soru: q.soru, secenekler: q.secenekler, dogru: q.dogru, cozum: q.cozum, konu: q.konu } });
  save(a.slice(0, 400));
}
export function dueMistakes(teacherId) {
  const t = today();
  return allMistakes().filter(m => m.due <= t && (!teacherId || m.teacherId === teacherId));
}
export function reviewMistake(id, ok) {
  const a = allMistakes();
  const m = a.find(x => x.id === id); if (!m) return;
  if (ok) {
    if (m.box >= 5) { save(a.filter(x => x.id !== id)); stat('fixed'); return 'ogrenildi'; }
    m.box++; m.due = addDays(GAP[m.box]);
  } else { m.box = 1; m.due = addDays(1); }
  save(a);
  return ok ? 'ileri' : 'basa';
}
export function removeMistake(id) { save(allMistakes().filter(x => x.id !== id)); }
