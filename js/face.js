// Sevimli robot hoca yüzleri. Yüz bir ekrandır: parlayan gözler, dalga gibi
// oynayan ağız (konuşurken), antende sabrı gösteren ışık.
// Duygular rastgele DEĞİLDİR: mood.js sabra ve olaylara göre seçer.

export const EMOTIONS = {
  cok_mutlu:       { label: 'Çok mutlu',       emoji: '🤩', p: { open: 1.05, happy: 1, curve: 1, mopen: 0.55, width: 18, blush: 0.9, hearts: 1, wave: 1, tilt: 4 } },
  mutlu:           { label: 'Mutlu',           emoji: '😊', p: { happy: 0.65, curve: 0.85, mopen: 0.15, width: 16, blush: 0.55 } },
  gururlu:         { label: 'Gururlu',         emoji: '😌', p: { open: 0.9, happy: 0.85, curve: 0.75, width: 15, blush: 0.4, sparkle: 1, tilt: 3 } },
  notr:            { label: 'Sakin',           emoji: '🙂', p: {} },
  dusunceli:       { label: 'Düşünüyor',       emoji: '🤔', p: { open: 0.95, asym: 0.45, gazeX: 1, gazeY: -1, curve: -0.05, width: 8, think: 1, tilt: 3 } },
  suphe:           { label: 'Şüpheli',         emoji: '🤨', p: { lidDown: 8, asym: 0.5, curve: -0.15, width: 10, tilt: 2 } },
  sikilmis:        { label: 'Sıkılmış',        emoji: '😑', p: { lidDown: 12, open: 0.85, curve: -0.1, width: 11, zzz: 1, tilt: -2 } },
  endiseli:        { label: 'Endişeli',        emoji: '😟', p: { lidAng: -16, open: 1.12, curve: -0.35, width: 9, alert: 0.6 } },
  hayal_kirikligi: { label: 'Hayal kırıklığı', emoji: '😞', p: { lidAng: -12, lidDown: 9, gazeY: 1, curve: -0.45, width: 12, tilt: -3 } },
  uzgun:           { label: 'Üzgün',           emoji: '😢', p: { lidAng: -20, lidDown: 5, gazeY: 1.2, curve: -0.65, width: 12, rain: 1, tilt: -4 } },
  saskin:          { label: 'Şaşkın',          emoji: '😲', p: { open: 1.3, curve: 0, mopen: 0.75, width: 7, alert: 1 } },
  kizgin:          { label: 'Kızgın',          emoji: '😠', p: { lidAng: 22, lidDown: 5, curve: -0.6, width: 12, red: 0.4, steam: 1 } },
  cok_kizgin:      { label: 'Çok kızgın',      emoji: '🤬', p: { lidAng: 28, lidDown: 7, curve: -0.9, mopen: 0.4, width: 15, red: 0.85, steam: 1, shake: 1 } },
};
export const EMOTION_KEYS = Object.keys(EMOTIONS);
export const normalizeEmotion = e => (EMOTIONS[e] ? e : 'notr');

const BASE = {
  open: 1, happy: 0, lidAng: 0, lidDown: 0, asym: 0, gazeX: 0, gazeY: 0,
  curve: 0.25, mopen: 0, width: 13, blush: 0.2, red: 0,
  hearts: 0, steam: 0, rain: 0, think: 0, zzz: 0, alert: 0, sparkle: 0, wave: 0, shake: 0, tilt: 0,
};

const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const mix = (a, b, f) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * f)).join(',')})`; };
function shade(h, amt) { const [r, g, b] = hex(h); const f = c => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt))); return `rgb(${f(r)},${f(g)},${f(b)})`; }

let uid = 0;
const live = new Set();
let running = false;
function loop(ms) {
  for (const f of live) { if (!f.svg.isConnected) { live.delete(f); continue; } f._frame(ms / 1000); }
  if (live.size) requestAnimationFrame(loop); else running = false;
}

export class Face {
  constructor(el, look, { emotion = 'notr', still = false, led = '#22c55e' } = {}) {
    this.id = 'rb' + (++uid);
    this.look = look;
    this.emotion = normalizeEmotion(emotion);
    this.cur = { ...BASE, ...EMOTIONS[this.emotion].p };
    this.target = { ...this.cur };
    this.led = led;
    this.speaking = false; this.speakAmp = 0; this.pulse = 0;
    this.blinkStart = -1; this.nextBlink = 0.6 + Math.random() * 2.5;
    this.gaze = { x: 0, y: 0 }; this.gazeT = { x: 0, y: 0 }; this.nextGaze = 1;
    this.pointer = null; this.last = null;
    el.innerHTML = this._svg();
    this.svg = el.querySelector('svg');
    const q = c => this.svg.querySelector('.' + c);
    this.E = {
      head: q('hd'), eyes: [q('eye-l'), q('eye-r')], spark: [q('sp-l'), q('sp-r')],
      tops: [q('lt-l'), q('lt-r')], bots: [q('lb-l'), q('lb-r')], eyeG: [q('eg-l'), q('eg-r')],
      mouth: q('mouth'), cheeks: q('cheeks'), red: q('red'), led: q('led'), ledGlow: q('ledglow'),
      hearts: q('hearts'), steam: q('steam'), rain: q('rain'), think: q('think'), zzz: q('zzz'), alert: q('alert'),
      sparkle: q('sparkle'), armL: q('arm-l'), armR: q('arm-r'), orbit: q('orbit'),
    };
    this.setLed(led);
    this._frame(0);
    if (!still) { live.add(this); if (!running) { running = true; requestAnimationFrame(loop); } }
  }
  setEmotion(name) { this.emotion = normalizeEmotion(name); this.target = { ...BASE, ...EMOTIONS[this.emotion].p }; }
  setLed(c) { this.led = c; this.E.led.setAttribute('fill', c); this.E.ledGlow.setAttribute('fill', c); }
  setSpeaking(on) { this.speaking = on; }
  boundary() { this.pulse = 0.5; }
  lookAt(x, y) { this.pointer = x == null ? null : { x, y }; }
  destroy() { live.delete(this); }

  _frame(t) {
    const dt = this.last == null ? 1 : Math.min(0.1, t - this.last);
    this.last = t;
    const k = 1 - Math.exp(-dt * 7);
    for (const key in this.target) this.cur[key] += (this.target[key] - this.cur[key]) * k;
    const c = this.cur, E = this.E;

    if (t > this.nextBlink) { this.blinkStart = t; this.nextBlink = t + (c.zzz > 0.5 ? 1.2 : 2.2 + Math.random() * 3.5); }
    let blink = 1; const bt = t - this.blinkStart;
    if (this.blinkStart >= 0 && bt < 0.16) blink = 1 - Math.sin(Math.PI * bt / 0.16) * 0.92;

    if (this.pointer) this.gazeT = { x: this.pointer.x * 7, y: this.pointer.y * 4 };
    else if (t > this.nextGaze) {
      this.gazeT = Math.random() < 0.5 ? { x: 0, y: 0 } : { x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 4 };
      this.nextGaze = t + 1.2 + Math.random() * 2.5;
    }
    const gk = 1 - Math.exp(-dt * 12);
    this.gaze.x += (this.gazeT.x - this.gaze.x) * gk; this.gaze.y += (this.gazeT.y - this.gaze.y) * gk;

    let amp = 0;
    if (this.speaking) amp = 0.25 + 0.55 * Math.abs(Math.sin(t * 11)) * (0.6 + 0.4 * Math.sin(t * 3.1)) + this.pulse;
    this.pulse *= Math.exp(-dt * 6);
    this.speakAmp += (amp - this.speakAmp) * (1 - Math.exp(-dt * 20));

    // Kafa hareketi
    const sx = c.shake * Math.sin(t * 50) * 2.4;
    const bob = Math.sin(t * 1.8) * 1.6 + (this.speaking ? Math.sin(t * 7) * 0.8 : 0);
    const sway = Math.sin(t * 0.8) * 1.5;
    E.head.setAttribute('transform', `translate(${sx.toFixed(2)} ${bob.toFixed(2)}) rotate(${(c.tilt + sway).toFixed(2)} 100 150)`);

    // Göz rengi: kızdıkça kırmızıya döner
    const glow = mix(this.look.glow, '#ff4d6d', Math.min(1, c.red * 1.1));
    const gx = this.gaze.x + c.gazeX * 6, gy = this.gaze.y + c.gazeY * 4;
    for (let i = 0; i < 2; i++) {
      const cx = (i ? 124 : 76) + gx, cy = 97 + gy;
      const asym = i === 1 ? c.asym : 0;
      const h = Math.max(2, 28 * c.open * blink * (1 - asym * 0.55));
      const w = 20;
      const eye = E.eyes[i];
      eye.setAttribute('x', cx - w / 2); eye.setAttribute('y', cy - h / 2);
      eye.setAttribute('width', w); eye.setAttribute('height', h);
      eye.setAttribute('rx', Math.min(10, h / 2)); eye.setAttribute('fill', glow);
      E.spark[i].setAttribute('cx', cx + 4); E.spark[i].setAttribute('cy', cy - h / 2 + 6);
      E.spark[i].setAttribute('opacity', h > 12 ? 0.9 : 0);
      const ang = (i ? -1 : 1) * c.lidAng;
      E.tops[i].setAttribute('transform', `translate(${cx} ${cy - h / 2 + c.lidDown + asym * 6}) rotate(${ang})`);
      E.bots[i].setAttribute('cx', cx); E.bots[i].setAttribute('cy', cy + h / 2 + 12 - c.happy * 17);
    }

    // Ağız: konuşurken ses dalgası, değilse ifade
    const w = c.width + this.speakAmp * 4, y0 = 125 - c.curve * 4;
    let d;
    if (this.speakAmp > 0.06) {
      d = `M${100 - w},${y0}`;
      const n = 10;
      for (let i = 1; i <= n; i++) {
        const x = 100 - w + (2 * w * i) / n, env = Math.sin(Math.PI * i / n);
        d += ` L${x.toFixed(1)},${(y0 + Math.sin(i * 1.7 + t * 16) * this.speakAmp * 9 * env).toFixed(1)}`;
      }
      E.mouth.setAttribute('fill', 'none');
    } else {
      const o = c.mopen;
      const uc = y0 + c.curve * 11 - o * 2, lc = uc + 1 + o * 22;
      d = `M${100 - w},${y0} Q100,${uc} ${100 + w},${y0}` + (o > 0.04 ? ` Q100,${lc} ${100 - w},${y0}Z` : '');
      E.mouth.setAttribute('fill', o > 0.04 ? glow : 'none');
    }
    E.mouth.setAttribute('d', d);
    E.mouth.setAttribute('stroke', glow);
    E.cheeks.setAttribute('opacity', (c.blush * 0.75).toFixed(3));
    E.red.setAttribute('opacity', (c.red * 0.35 * (0.85 + 0.15 * Math.sin(t * 9))).toFixed(3));

    // Antende ışık: kızgınken hızlı yanıp söner
    const lb = c.red > 0.3 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 6)) : 0.85 + 0.15 * Math.sin(t * 2);
    E.ledGlow.setAttribute('opacity', (lb * 0.55).toFixed(3));
    if (E.orbit) E.orbit.setAttribute('transform', `rotate(${(t * 60) % 360} 100 16)`);

    // Kollar
    const wave = c.wave * Math.sin(t * 9) * 25;
    E.armL.setAttribute('transform', `rotate(${(8 + c.wave * 0).toFixed(1)} 62 172)`);
    E.armR.setAttribute('transform', `rotate(${(-8 - c.wave * 60 + wave).toFixed(1)} 138 172)`);

    // Efektler
    E.hearts.setAttribute('opacity', c.hearts.toFixed(3));
    [...E.hearts.children].forEach((h, i) => { const p = (t * 0.5 + i * 0.33) % 1; h.setAttribute('transform', `translate(${[30, 170, 158][i]} ${60 - p * 40}) scale(${0.6 + p * 0.5})`); h.setAttribute('opacity', (1 - p).toFixed(2)); });
    E.steam.setAttribute('opacity', c.steam.toFixed(3));
    [...E.steam.children].forEach((s, i) => { const p = (t * 0.9 + i * 0.33) % 1; const side = i % 2 ? 1 : -1; s.setAttribute('transform', `translate(${100 + side * (78 + p * 8)} ${92 - p * 50}) scale(${0.5 + p})`); s.setAttribute('opacity', (1 - p).toFixed(2)); });
    E.rain.setAttribute('opacity', c.rain.toFixed(3));
    [...E.rain.querySelectorAll('.drop')].forEach((r, i) => { const p = (t * 1.4 + i * 0.37) % 1; r.setAttribute('transform', `translate(${150 + i * 8} ${26 + p * 26})`); r.setAttribute('opacity', (1 - p).toFixed(2)); });
    E.think.setAttribute('opacity', c.think.toFixed(3));
    [...E.think.querySelectorAll('.td')].forEach((dd, i) => dd.setAttribute('opacity', (0.3 + 0.7 * Math.max(0, Math.sin(t * 5 - i))).toFixed(2)));
    E.zzz.setAttribute('opacity', c.zzz.toFixed(3));
    E.zzz.setAttribute('transform', `translate(160 ${(40 - (t * 8) % 14).toFixed(1)})`);
    E.alert.setAttribute('opacity', c.alert.toFixed(3));
    E.alert.setAttribute('transform', `translate(166 34) scale(${(1 + Math.sin(t * 10) * 0.08).toFixed(3)})`);
    E.sparkle.setAttribute('opacity', c.sparkle.toFixed(3));
    [...E.sparkle.children].forEach((s, i) => s.setAttribute('transform', `translate(${[34, 168, 150][i]} ${[70, 58, 26][i]}) scale(${(0.6 + 0.4 * Math.abs(Math.sin(t * 3 + i))).toFixed(2)}) rotate(${(t * 40 + i * 30) % 360})`));
  }

  _svg() {
    const L = this.look, id = this.id;
    const body = L.body, dark = shade(body, -0.22), screen = L.screen || '#141631';
    const ears = L.ears === 'cat'
      ? `<path d="M40,58 L46,18 L78,44Z" fill="${body}"/><path d="M47,48 L50,28 L66,42Z" fill="${dark}"/><path d="M160,58 L154,18 L122,44Z" fill="${body}"/><path d="M153,48 L150,28 L134,42Z" fill="${dark}"/>`
      : L.ears === 'round'
        ? `<circle cx="26" cy="100" r="16" fill="${dark}"/><circle cx="174" cy="100" r="16" fill="${dark}"/><circle cx="26" cy="100" r="7" fill="${L.glow}" opacity=".5"/><circle cx="174" cy="100" r="7" fill="${L.glow}" opacity=".5"/>`
        : `<rect x="15" y="78" width="20" height="44" rx="9" fill="${dark}"/><rect x="165" y="78" width="20" height="44" rx="9" fill="${dark}"/>`;
    const top = {
      pi: `<text x="100" y="21" text-anchor="middle" font-size="12" font-weight="900" fill="#fff" font-family="system-ui">π</text>`,
      atom: `<g class="orbit"><ellipse cx="100" cy="16" rx="17" ry="6" fill="none" stroke="${L.glow}" stroke-width="2"/><ellipse cx="100" cy="16" rx="17" ry="6" fill="none" stroke="${L.glow}" stroke-width="2" transform="rotate(60 100 16)"/></g>`,
      leaf: `<path d="M100,30 C108,16 124,14 128,20 C120,30 108,32 100,30Z" fill="#4ade80"/><path d="M100,34 C92,22 78,22 74,28 C82,36 94,36 100,34Z" fill="#22c55e"/>`,
      globe: `<path d="M92,16 H108 M100,8 C95,12 95,20 100,24 C105,20 105,12 100,8" fill="none" stroke="#fff" stroke-width="1.4" opacity=".8"/>`,
      book: `<path d="M84,34 L100,30 L116,34 L116,44 L100,40 L84,44Z" fill="#fff" stroke="${dark}" stroke-width="1.5"/><path d="M100,30 V40" stroke="${dark}" stroke-width="1.5"/>`,
      flask: `<path d="M120,30 h8 v6 l7,12 h-22 l7,-12Z" fill="#c4b5fd" stroke="${dark}" stroke-width="1.5"/><circle cx="124" cy="44" r="2" fill="#fff"/>`,
      scroll: `<rect x="114" y="30" width="22" height="12" rx="3" fill="#fde68a" stroke="#b45309" stroke-width="1.5"/>`,
      band: '', bow: '',
    }[L.top] || '';
    const band = L.top === 'band' ? `<rect x="28" y="56" width="144" height="10" fill="#ef4444"/><rect x="28" y="56" width="144" height="3" fill="#fff" opacity=".6"/>` : '';
    const bow = L.top === 'bow' ? `<path d="M100,163 L84,155 L84,171Z M100,163 L116,155 L116,171Z" fill="#ef4444"/><circle cx="100" cy="163" r="4" fill="#b91c1c"/>` : '';
    const heart = `<path d="M0,3 C-6,-3 -10,2 0,9 C10,2 6,-3 0,3Z" fill="#ff6b9d"/>`;
    const star = `<path d="M0,-7 L2,-2 L7,0 L2,2 L0,7 L-2,2 L-7,0 L-2,-2Z" fill="#fde047"/>`;

    return `<svg viewBox="0 0 200 220" class="face-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${L.alt || 'Robot hoca'}">
<defs>
  <filter id="${id}g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <clipPath id="${id}s"><rect x="44" y="56" width="112" height="88" rx="30"/></clipPath>
  <linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(body, 0.18)}"/><stop offset="1" stop-color="${body}"/></linearGradient>
</defs>
<ellipse cx="100" cy="212" rx="48" ry="5" fill="#000" opacity=".15"/>
<ellipse class="arm-l" cx="56" cy="186" rx="9" ry="16" fill="${dark}"/>
<ellipse class="arm-r" cx="144" cy="186" rx="9" ry="16" fill="${dark}"/>
<rect x="62" y="158" width="76" height="50" rx="24" fill="url(#${id}h)"/>
<rect x="82" y="172" width="36" height="24" rx="9" fill="${screen}"/>
<text x="100" y="189" text-anchor="middle" font-size="14">${L.icon || ''}</text>
${bow}
<g class="hd">
  <line x1="100" y1="44" x2="100" y2="20" stroke="${dark}" stroke-width="4" stroke-linecap="round"/>
  <circle class="ledglow" cx="100" cy="16" r="13" opacity=".4"/>
  <circle class="led" cx="100" cy="16" r="8"/>
  ${top}
  ${ears}
  <rect x="28" y="40" width="144" height="120" rx="46" fill="url(#${id}h)"/>
  <rect x="44" y="45" width="56" height="9" rx="4.5" fill="#fff" opacity=".28"/>
  ${band}
  <rect x="44" y="56" width="112" height="88" rx="30" fill="${screen}"/>
  <g clip-path="url(#${id}s)">
    <rect class="red" x="44" y="56" width="112" height="88" fill="#ff2d55" opacity="0"/>
    <g filter="url(#${id}g)">
      <g class="eg-l"><rect class="eye-l"/><circle class="sp-l" r="3" fill="#fff"/></g>
      <g class="eg-r"><rect class="eye-r"/><circle class="sp-r" r="3" fill="#fff"/></g>
      <path class="mouth" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill-opacity=".4"/>
    </g>
    <rect class="lt-l" x="-22" y="-34" width="44" height="34" fill="${screen}"/>
    <rect class="lt-r" x="-22" y="-34" width="44" height="34" fill="${screen}"/>
    <ellipse class="lb-l" rx="18" ry="13" fill="${screen}"/>
    <ellipse class="lb-r" rx="18" ry="13" fill="${screen}"/>
    <g class="cheeks" opacity=".2"><ellipse cx="62" cy="121" rx="9" ry="6" fill="#ff8fb1"/><ellipse cx="138" cy="121" rx="9" ry="6" fill="#ff8fb1"/></g>
    <path d="M52,70 Q60,60 76,60" stroke="#fff" stroke-width="3" fill="none" opacity=".12" stroke-linecap="round"/>
  </g>
</g>
<g class="hearts" opacity="0">${heart}${heart}${heart}</g>
<g class="sparkle" opacity="0">${star}${star}${star}</g>
<g class="steam" opacity="0"><circle r="6" fill="#e2e8f0"/><circle r="6" fill="#e2e8f0"/><circle r="5" fill="#e2e8f0"/><circle r="5" fill="#e2e8f0"/></g>
<g class="rain" opacity="0"><path d="M140,22 a9,9 0 0,1 12,-10 a11,11 0 0,1 20,4 a8,8 0 0,1 2,16 h-30 a7,7 0 0,1 -4,-10Z" fill="#94a3b8"/><path class="drop" d="M0,0 l-2,5 a2,2 0 0,0 4,0Z" fill="#60a5fa"/><path class="drop" d="M0,0 l-2,5 a2,2 0 0,0 4,0Z" fill="#60a5fa"/><path class="drop" d="M0,0 l-2,5 a2,2 0 0,0 4,0Z" fill="#60a5fa"/></g>
<g class="think" opacity="0"><path d="M150,22 a10,10 0 0,1 14,-10 a12,12 0 0,1 22,6 a9,9 0 0,1 -2,18 h-28 a8,8 0 0,1 -6,-14Z" fill="#fff" stroke="#cbd5e1" stroke-width="1.5"/><circle class="td" cx="162" cy="24" r="2.6" fill="#6366f1"/><circle class="td" cx="171" cy="24" r="2.6" fill="#6366f1"/><circle class="td" cx="180" cy="24" r="2.6" fill="#6366f1"/><circle cx="148" cy="44" r="3" fill="#fff" stroke="#cbd5e1"/></g>
<g class="zzz" opacity="0"><text font-size="15" font-weight="900" fill="#94a3b8" font-family="system-ui">z<tspan dx="2" dy="-8" font-size="19">Z</tspan></text></g>
<g class="alert" opacity="0"><circle r="11" fill="#facc15"/><text y="6" text-anchor="middle" font-size="17" font-weight="900" fill="#78350f" font-family="system-ui">!</text></g>
</svg>`;
  }
}
