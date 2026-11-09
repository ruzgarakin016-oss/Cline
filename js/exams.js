// Yazılı takvimi: kullanıcının eklediği sınavlar + MEB ülke geneli ortak yazılılar.
// Ortak yazılı tarihleri (2026-2027) haberlere dayanır; resmi duyurudan kontrol edilmeli.
import { getExams, getSettings, today } from './storage.js';

export const ORTAK = [
  { date: '2026-11-11', grade: 6, subject: 'Matematik' },
  { date: '2026-11-12', grade: 10, subject: 'Türk Dili ve Edebiyatı' },
  { date: '2027-01-05', grade: 7, subject: 'Türkçe' },
  { date: '2027-01-06', grade: 9, subject: 'Matematik' },
  { date: '2027-04-06', grade: 7, subject: 'Matematik' },
  { date: '2027-04-07', grade: 9, subject: 'Türk Dili ve Edebiyatı' },
  { date: '2027-06-08', grade: 6, subject: 'Türkçe' },
  { date: '2027-06-09', grade: 10, subject: 'Matematik' },
];
const SUBJECT_TO_TEACHER = { 'Matematik': 'piko', 'Türk Dili ve Edebiyatı': 'hece', 'Türkçe': 'hece' };

export function daysUntil(dateStr) {
  const a = new Date(today() + 'T00:00:00'), b = new Date(dateStr + 'T00:00:00');
  return Math.round((b - a) / 864e5);
}

export function allExams() {
  const g = getSettings().grade;
  const mine = getExams().map(e => ({ ...e, source: 'mine' }));
  const ortak = ORTAK.filter(o => o.grade === g).map(o => ({
    id: 'ortak-' + o.date, date: o.date, teacher: SUBJECT_TO_TEACHER[o.subject], title: `${o.subject} — Ülke geneli ortak yazılı`, source: 'ortak',
  }));
  return [...mine, ...ortak].sort((a, b) => a.date.localeCompare(b.date));
}
export function upcoming(limit = 99) { return allExams().filter(e => daysUntil(e.date) >= 0).slice(0, limit); }
export function nextFor(teacherId) { return upcoming().find(e => e.teacher === teacherId) || null; }
export function whenText(d) { return d === 0 ? 'BUGÜN' : d === 1 ? 'Yarın' : `${d} gün sonra`; }
