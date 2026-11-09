// Tüm veriler bu cihazın tarayıcısında (localStorage) saklanır.
const P = 'sinifim2.';

export function read(key, def) {
  try { const v = localStorage.getItem(P + key); return v == null ? def : JSON.parse(v); } catch { return def; }
}
export function write(key, val) {
  try { localStorage.setItem(P + key, JSON.stringify(val)); } catch { /* depolama dolu/kapalı */ }
}
export function remove(key) { try { localStorage.removeItem(P + key); } catch { /* yok */ } }

export const DEFAULT_SETTINGS = {
  name: '', grade: 9, apiKey: '', model: 'claude-haiku-5-5',
  dailyLimit: 30, answerTime: 30, voice: true, rate: 1,
  strictness: 'normal', reminders: true, sfx: true, voiceMap: {}, dailyGoal: 100,
};
export function getSettings() {
  const s = { ...DEFAULT_SETTINGS, ...read('settings', {}) };
  s.grade = parseInt(s.grade, 10) || 9;
  return s;
}
export function saveSettings(s) { write('settings', s); }
export const isHighSchool = g => g >= 9;
export const gradeLabel = g => `${g}. sınıf`;

export const DEFAULT_PERIODS = [
  ['08:30', '09:10'], ['09:20', '10:00'], ['10:10', '10:50'], ['11:00', '11:40'],
  ['12:30', '13:10'], ['13:20', '14:00'], ['14:10', '14:50'],
];
const DEFAULT_DAYS = [
  ['piko', 'piko', 'hece', 'volt', 'lingo', 'filiz', 'turbo'],
  ['hece', 'krono', 'moli', 'moli', 'piko', 'atlas', 'lingo'],
  ['volt', 'volt', 'piko', 'hece', 'filiz', 'filiz', 'krono'],
  ['lingo', 'lingo', 'atlas', 'piko', 'piko', 'moli', 'turbo'],
  ['krono', 'hece', 'hece', 'volt', 'atlas', 'lingo', null],
];
export function getSchedule() {
  return read('schedule', null) || { periods: DEFAULT_PERIODS.map(p => [...p]), days: DEFAULT_DAYS.map(d => [...d]) };
}
export function saveSchedule(s) { write('schedule', s); }

export function today(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Günlük soru hakkı
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
export function remaining() { return Math.max(0, getSettings().dailyLimit - getUsage().used); }
export function bumpStat(k, n = 1) { const u = getUsage(); u[k] = (u[k] || 0) + n; saveUsage(u); }

// Sohbet geçmişi
export function getHistory(id) { return read('hist.' + id, []); }
export function saveHistory(id, h) { write('hist.' + id, h.slice(-40)); }
export function clearHistory(id) { remove('hist.' + id); }

// Yazılı takvimi
export function getExams() { return read('exams', []); }
export function saveExams(e) { write('exams', e); }

// Deneme / çalışma geçmişi
export function getResults() { return read('results', []); }
export function addResult(r) { const a = getResults(); a.unshift({ ...r, date: new Date().toISOString() }); write('results', a.slice(0, 100)); }

// Konu listesi önbelleği
export function getTopics(key) { return read('topics.' + key, null); }
export function saveTopics(key, v) { write('topics.' + key, v); }

export function resetAll() {
  Object.keys(localStorage).filter(k => k.startsWith(P)).forEach(k => localStorage.removeItem(k));
}
