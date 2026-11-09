// SES MOTORU
// - Her robotun kendine ait ses profili (ses, perde, hız) ve kısa robot "imza" sesi.
// - Akıcı konuşma: metin cümlelere bölünür, sırayla kesintisiz okunur; yapay zekâ yazarken
//   hazır olan cümleler hemen okunmaya başlar (bekleme yok).
// - Dinleme: tarayıcı mikrofonu izin veriyorsa gerçek mikrofon; Claude sayfası içinde
//   mikrofon kapalıysa klavye dikte modu (klavyedeki 🎤 tuşu) + otomatik gönderme.
import { getSettings } from './storage.js';

const synth = window.speechSynthesis;
export const ttsSupported = !!synth;
let voices = [];
function loadVoices() { voices = synth ? synth.getVoices() : []; }
if (synth) { loadVoices(); synth.addEventListener && synth.addEventListener('voiceschanged', loadVoices); }
export function trVoices() { return voices.filter(v => /^tr/i.test(v.lang)); }
function enVoice() {
  const en = voices.filter(v => /^en/i.test(v.lang));
  return en.find(v => /google us|samantha|natural|neural|premium|enhanced/i.test(v.name)) || en[0] || null;
}
const QUALITY = /neural|natural|premium|enhanced|geliştirilmiş|online/i;

function pickVoice(profile, lang) {
  if (lang === 'en') return enVoice();
  const s = getSettings();
  const chosen = s.voiceMap && s.voiceMap[profile.id];
  const tr = trVoices();
  if (chosen) { const v = tr.find(x => x.voiceURI === chosen); if (v) return v; }
  if (!tr.length) return null;
  // Birden fazla Türkçe ses varsa robotlara farklı sesler dağıt (kaliteliler önce)
  const sorted = [...tr].sort((a, b) => (QUALITY.test(b.name) - QUALITY.test(a.name)));
  return sorted[(profile.slot || 0) % sorted.length];
}

// İngilizce cümle mi? (Lingo için)
const EN_WORDS = /\b(the|you|is|are|great|job|come|on|good|let's|well|done|awesome|excellent|nice|yes|no|what|how|hello|hi|very|okay|ok)\b/i;
function langOf(sentence) { return !/[çğıöşüÇĞİÖŞÜ]/.test(sentence) && EN_WORDS.test(sentence) && (sentence.match(/[a-z]{2,}/gi) || []).length >= 2 ? 'en' : 'tr'; }

function clean(text) {
  return String(text)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/[*_#`>|]/g, '')
    .replace(/\s+/g, ' ').trim();
}
export function splitSentences(text) {
  return clean(text).split(/(?<=[.!?…:;])\s+/).map(s => s.trim()).filter(Boolean);
}

// ---------- Robot imza sesi (WebAudio) ----------
let actx = null;
export function unlockAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch { actx = null; }
  if (synth && !unlockAudio.done) { unlockAudio.done = true; try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch { /* yok */ } }
}
export function chime(notes = [660, 880], type = 'sine', vol = 0.06) {
  if (!actx || !getSettings().sfx) return;
  const t0 = actx.currentTime;
  notes.forEach((f, i) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t0 + i * 0.07);
    g.gain.linearRampToValueAtTime(vol, t0 + i * 0.07 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.07 + 0.12);
    o.connect(g).connect(actx.destination);
    o.start(t0 + i * 0.07); o.stop(t0 + i * 0.07 + 0.14);
  });
}
export const SFX = {
  dogru: () => chime([523, 659, 784, 1047], 'triangle', 0.07),
  yanlis: () => chime([330, 247], 'sawtooth', 0.04),
  xp: () => chime([880, 1175], 'sine', 0.05),
  level: () => chime([523, 659, 784, 1047, 1319], 'triangle', 0.08),
  tap: () => chime([1200, 1500], 'sine', 0.04),
  alarm: () => chime([880, 660, 880, 660], 'square', 0.035),
};

// ---------- Konuşmacı (kuyruk) ----------
let gen = 0, keepAlive = null;
export function stopSpeaking() { gen++; clearInterval(keepAlive); if (synth) synth.cancel(); }
export function isSpeaking() { return !!synth && (synth.speaking || synth.pending); }

/**
 * Akış halinde konuşma. push(tümMetin) çağrıldıkça biten cümleler okunur.
 * profile: {id, pitch, rate, slot, sig:[notalar]}
 * hooks: {onstart, onend, onboundary, onsentence(text)}
 */
export function speakStream(profile, hooks = {}) {
  const my = ++gen;
  if (synth) synth.cancel();
  const s = getSettings();
  const q = [];
  let spokenUpTo = 0, ended = false, playing = false, started = false, finished = false, full = '';
  let resolveDone; const done = new Promise(r => { resolveDone = r; });

  const finish = () => {
    if (finished) return; finished = true;
    clearInterval(keepAlive);
    hooks.onend && hooks.onend();
    resolveDone();
  };
  const next = () => {
    if (my !== gen) return finish();
    if (!q.length) { playing = false; if (ended) finish(); return; }
    playing = true;
    const sentence = q.shift();
    hooks.onsentence && hooks.onsentence(sentence);
    if (!synth || !s.voice) {
      if (!started) { started = true; hooks.onstart && hooks.onstart(); }
      setTimeout(next, Math.min(2500, 250 + sentence.length * 30));
      return;
    }
    const u = new SpeechSynthesisUtterance(sentence);
    const lang = profile.id === 'lingo' ? langOf(sentence) : 'tr';
    u.lang = lang === 'en' ? 'en-US' : 'tr-TR';
    const v = pickVoice(profile, lang); if (v) u.voice = v;
    u.pitch = Math.max(0, Math.min(2, profile.pitch));
    u.rate = Math.max(0.5, Math.min(2, profile.rate * (s.rate || 1)));
    let moved = false;
    const go = () => { if (moved) return; moved = true; clearTimeout(wd); next(); };
    u.onstart = () => { if (!started) { started = true; hooks.onstart && hooks.onstart(); } };
    u.onboundary = () => hooks.onboundary && hooks.onboundary();
    u.onend = go; u.onerror = go;
    const wd = setTimeout(go, 3000 + sentence.length * 110 / u.rate);
    synth.speak(u);
  };
  const flush = (final) => {
    const rest = clean(full.slice(spokenUpTo));
    if (!rest) return;
    if (final) { q.push(...splitSentences(rest)); spokenUpTo = full.length; }
    else {
      // Son cümle sonu işaretine kadar olanı al
      const m = full.slice(spokenUpTo).match(/^[\s\S]*[.!?…:;](?=\s)/);
      if (!m) return;
      q.push(...splitSentences(m[0]));
      spokenUpTo += m[0].length;
    }
    if (!playing) next();
  };
  if (synth) { clearInterval(keepAlive); keepAlive = setInterval(() => { if (synth.speaking && !synth.paused) { /* Chrome uzun konuşmada durmasın */ synth.pause(); synth.resume(); } }, 10000); }
  if (profile.sig && s.sfx) chime(profile.sig, 'sine', 0.045);
  return {
    push(text) { if (my !== gen) return; full = text; flush(false); },
    end(text) { if (text != null) full = text; ended = true; flush(true); if (!playing && !q.length) finish(); return done; },
    done,
  };
}
export function speak(text, profile, hooks) { const s = speakStream(profile, hooks); return s.end(text); }

// ---------- Dinleme ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let micBlocked = sessionStorage.getItem('mic.blocked') === '1';
export function micAvailable() { return !!SR && !micBlocked; }
export function markMicBlocked() { micBlocked = true; try { sessionStorage.setItem('mic.blocked', '1'); } catch { /* yok */ } }

export class Listener {
  constructor() {
    this.supported = !!SR;
    this.active = false;
    this.onfinal = this.oninterim = this.onstate = this.onblocked = this.onidle = null;
    if (!SR) return;
    const r = new SR();
    r.lang = 'tr-TR'; r.continuous = false; r.interimResults = true; r.maxAlternatives = 1;
    r.onstart = () => { this.active = true; this.onstate && this.onstate(true); };
    r.onend = () => { const had = this._got; this.active = false; this.onstate && this.onstate(false); if (!had && !this._blocked) this.onidle && this.onidle(); };
    r.onerror = e => {
      if (/not-allowed|service-not-allowed|audio-capture/.test(e.error)) { this._blocked = true; markMicBlocked(); this.onblocked && this.onblocked(e.error); }
    };
    r.onresult = e => {
      let interim = '', fin = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += t; else interim += t; }
      if (interim) this.oninterim && this.oninterim(interim);
      if (fin.trim()) { this._got = true; this.onfinal && this.onfinal(fin.trim()); }
    };
    this.r = r;
  }
  start() {
    if (!this.r || this.active || micBlocked) { if (micBlocked) this.onblocked && this.onblocked('blocked'); return; }
    this._got = false; this._blocked = false;
    try { this.r.start(); } catch { /* zaten açık */ }
  }
  stop() { if (this.r && this.active) { try { this.r.abort(); } catch { /* yok */ } } }
}
