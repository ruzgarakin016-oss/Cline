// Sabır sistemi. Hocanın yüz ifadesi TAMAMEN sabrına ve yaşanan olaya göre
// belirlenir; hiçbir duygu rastgele seçilmez.
import { read, write, getSettings } from './storage.js';
import { teacherById } from './teachers.js';

const RECOVER_PER_HOUR = 3;   // zamanla sakinleşir (70'e kadar)
const CALM = 70;

// Olayların sabra etkisi
const DELTA = {
  dogru: +8, kismen: +3, yanlis: -6, bilmiyorum: -3, sessiz: -12, kaba: -15,
  soru: +1, foto: +1, deneme_iyi: +12, deneme_orta: +4, deneme_kotu: -6,
  yazili_iyi: +10, yazili_orta: +3, yazili_kotu: -6, tekrar: +4, limit_bitti: -5, gec: -5,
};

function strictFactor(t) {
  const s = getSettings().strictness;
  return (0.6 + t.strict * 0.8) * (s === 'sert' ? 1.35 : s === 'yumusak' ? 0.65 : 1);
}

export function getPatience(id) {
  const all = read('patience', {});
  const rec = all[id] || { v: CALM, t: Date.now() };
  const hours = (Date.now() - rec.t) / 3.6e6;
  if (rec.v < CALM) return Math.min(CALM, Math.round(rec.v + hours * RECOVER_PER_HOUR));
  return rec.v;
}
function setPatience(id, v) {
  const all = read('patience', {});
  all[id] = { v: Math.max(0, Math.min(100, Math.round(v))), t: Date.now() };
  write('patience', all);
  return all[id].v;
}
export function resetPatience() { write('patience', {}); }

// Sabra göre bekleme ifadesi (tablo: 85+ çok mutlu ... 20 altı çok kızgın)
export const MOOD_SCALE = [
  [85, 'cok_mutlu'], [70, 'mutlu'], [50, 'notr'], [35, 'suphe'], [20, 'kizgin'], [0, 'cok_kizgin'],
];
export function baseEmotion(p) { return MOOD_SCALE.find(([min]) => p >= min)[1]; }
export function patienceColor(p) { return p >= 70 ? '#22c55e' : p >= 50 ? '#84cc16' : p >= 35 ? '#f59e0b' : p >= 20 ? '#f97316' : '#ef4444'; }

// Olayın anlık tepkisi — sabrın yeni değerine göre, kurala bağlı
function reaction(ev, p) {
  switch (ev) {
    case 'dogru': return p >= 60 ? 'cok_mutlu' : 'mutlu';
    case 'kismen': return p >= 50 ? 'mutlu' : 'suphe';
    case 'yanlis': return p >= 50 ? 'hayal_kirikligi' : p >= 25 ? 'kizgin' : 'cok_kizgin';
    case 'bilmiyorum': return p >= 50 ? 'hayal_kirikligi' : 'suphe';
    case 'sessiz': return p >= 55 ? 'suphe' : p >= 30 ? 'kizgin' : 'cok_kizgin';
    case 'kaba': return p >= 40 ? 'kizgin' : 'cok_kizgin';
    case 'deneme_iyi': case 'yazili_iyi': return 'gururlu';
    case 'deneme_orta': case 'yazili_orta': return 'mutlu';
    case 'deneme_kotu': case 'yazili_kotu': return p >= 45 ? 'uzgun' : 'kizgin';
    case 'limit_az': return 'endiseli';
    case 'limit_bitti': return 'uzgun';
    case 'gec': return p >= 50 ? 'suphe' : 'kizgin';
    case 'bekle': return p >= 50 ? 'suphe' : 'kizgin';
    case 'dusun': return 'dusunceli';
    case 'saskin': return 'saskin';
    default: return baseEmotion(p);
  }
}

// Bir olay uygula: sabrı değiştir, tepki duygusunu döndür
export function applyEvent(id, ev) {
  const t = teacherById(id);
  let p = getPatience(id);
  const d = DELTA[ev] || 0;
  if (d) p = setPatience(id, p + (d < 0 ? d * strictFactor(t) : d));
  return { patience: p, emotion: reaction(ev, p), delta: d };
}
