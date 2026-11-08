// Tüm veriler tabletin kendi tarayıcısında (localStorage) saklanır.
const P = 'sinifim.';

function read(key, def) {
  try { const v = localStorage.getItem(P + key); return v == null ? def : JSON.parse(v); } catch { return def; }
}
function write(key, val) {
  try { localStorage.setItem(P + key, JSON.stringify(val)); } catch { /* depolama dolu/kapalı */ }
}

export const DEFAULT_SETTINGS = {
  name: '',
  grade: '9. sınıf',
  apiKey: '',
  model: 'claude-haiku-5-5',
  dailyLimit: 30,
  answerTime: 25,
  voice: true,
  rate: 1,
  strictness: 'normal', // yumusak | normal | sert
  reminders: true,
};

export function getSettings() { return { ...DEFAULT_SETTINGS, ...read('settings', {}) }; }
export function saveSettings(s) { write('settings', s); }

export const DEFAULT_PERIODS = [
  ['08:30', '09:10'], ['09:20', '10:00'], ['10:10', '10:50'], ['11:00', '11:40'],
  ['12:30', '13:10'], ['13:20', '14:00'], ['14:10', '14:50'],
];
const DEFAULT_DAYS = [
  ['kemal', 'kemal', 'ayse', 'selim', 'elif', 'murat', 'can'],
  ['ayse', 'nevzat', 'zeynep', 'zeynep', 'kemal', 'deniz', 'elif'],
  ['selim', 'selim', 'kemal', 'ayse', 'murat', 'murat', 'nevzat'],
  ['elif', 'elif', 'deniz', 'kemal', 'kemal', 'zeynep', 'can'],
  ['nevzat', 'ayse', 'ayse', 'selim', 'deniz', 'elif', null],
];
export function getSchedule() {
  const s = read('schedule', null);
  return s || { periods: DEFAULT_PERIODS.map(p => [...p]), days: DEFAULT_DAYS.map(d => [...d]) };
}
export function saveSchedule(s) { write('schedule', s); }

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function getUsage() {
  const u = read('usage', null);
  if (!u || u.date !== today()) {
    const fresh = { date: today(), used: 0, correct: 0, wrong: 0, silent: 0, warned: [] };
    write('usage', fresh);
    return fresh;
  }
  return u;
}
export function saveUsage(u) { write('usage', u); }

export function getMood(id) { const m = read('mood', {}); return m[id] ?? 70; }
export function setMood(id, v) { const m = read('mood', {}); m[id] = Math.max(0, Math.min(100, Math.round(v))); write('mood', m); return m[id]; }

export function getHistory(id) { return read('hist.' + id, []); }
export function saveHistory(id, h) { write('hist.' + id, h.slice(-40)); }
export function clearHistory(id) { localStorage.removeItem(P + 'hist.' + id); }

export function resetAll() {
  Object.keys(localStorage).filter(k => k.startsWith(P)).forEach(k => localStorage.removeItem(k));
}
