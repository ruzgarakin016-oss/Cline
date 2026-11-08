// Sesli konuşma (TTS) ve dinleme (konuşma tanıma) — tarayıcının yerleşik özellikleri.

const synth = window.speechSynthesis;
export const ttsSupported = !!synth;
let voices = [];
function loadVoices() { voices = synth ? synth.getVoices() : []; }
if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }

function pickVoice() {
  const tr = voices.filter(v => /^tr/i.test(v.lang));
  return tr.find(v => /google|neural|natural|premium|enhanced/i.test(v.name)) || tr[0] || null;
}

let unlocked = false;
// iPad/iOS: ilk konuşmanın bir dokunuşla tetiklenmesi gerekir.
export function unlockAudio() {
  if (unlocked || !synth) return;
  unlocked = true;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch { /* yok */ }
}

let watchdog = null;
export function stopSpeaking() {
  clearTimeout(watchdog);
  if (synth) synth.cancel();
}

export function speak(text, { pitch = 1, rate = 1 } = {}, { onstart, onend, onboundary } = {}) {
  const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/[*_#`]/g, '').trim();
  let done = false;
  const finish = () => { if (done) return; done = true; clearTimeout(watchdog); onend && onend(); };
  if (!synth || !clean) { onstart && onstart(); setTimeout(finish, Math.min(4000, 400 + clean.length * 55)); return; }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = 'tr-TR';
  const v = pickVoice();
  if (v) u.voice = v;
  u.pitch = pitch;
  u.rate = rate;
  u.onstart = () => onstart && onstart();
  u.onend = finish;
  u.onerror = finish;
  u.onboundary = () => onboundary && onboundary();
  synth.speak(u);
  // Bazı tarayıcılarda onend gelmeyebilir: tahmini süreyle güvenlik kilidi.
  watchdog = setTimeout(finish, 2500 + (clean.length * 85) / rate);
}

export class Listener {
  constructor() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = !!SR;
    this.active = false;
    this.onfinal = null; this.oninterim = null; this.onstate = null; this.onerror = null; this.onidle = null;
    if (!SR) return;
    const r = new SR();
    r.lang = 'tr-TR';
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onstart = () => { this.active = true; this.onstate && this.onstate(true); };
    r.onend = () => {
      const had = this._got;
      this.active = false;
      this.onstate && this.onstate(false);
      if (!had) this.onidle && this.onidle();
    };
    r.onerror = e => { if (e.error !== 'no-speech' && e.error !== 'aborted') this.onerror && this.onerror(e.error); };
    r.onresult = e => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t; else interim += t;
      }
      if (interim) this.oninterim && this.oninterim(interim);
      if (final.trim()) { this._got = true; this.onfinal && this.onfinal(final.trim()); }
    };
    this.r = r;
  }
  start() {
    if (!this.r || this.active) return;
    this._got = false;
    try { this.r.start(); } catch { /* zaten çalışıyor */ }
  }
  stop() { if (this.r && this.active) { try { this.r.abort(); } catch { /* yok */ } } }
}
