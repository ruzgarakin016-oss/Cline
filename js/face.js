// Animasyonlu, duygulu SVG hoca yüzleri.
// Her yüz göz kırpar, etrafa bakar, konuşurken ağzı hareket eder ve
// duygular arasında yumuşakça geçiş yapar.

export const EMOTIONS = {
  notr:            { label: 'Nötr',            emoji: '😐', p: {} },
  mutlu:           { label: 'Mutlu',           emoji: '🙂', p: { browIn: -3, browOut: -2, eyeOpen: 0.85, curve: 0.9, open: 0.2, width: 20, blush: 0.45 } },
  cok_mutlu:       { label: 'Çok mutlu',       emoji: '😄', p: { browIn: -6, browOut: -5, eyeOpen: 1.1, curve: 1, open: 0.65, width: 22, blush: 0.7, tilt: 4 } },
  gururlu:         { label: 'Gururlu',         emoji: '😌', p: { browIn: -2, browOut: -1, eyeOpen: 0.65, curve: 0.8, open: 0, width: 19, blush: 0.3, tilt: 3 } },
  kizgin:          { label: 'Kızgın',          emoji: '😠', p: { browIn: 8, browOut: -4, eyeOpen: 0.75, pupil: 0.8, curve: -0.6, open: 0.1, width: 15, red: 0.35, anger: 1 } },
  cok_kizgin:      { label: 'Çok kızgın',      emoji: '🤬', p: { browIn: 11, browOut: -6, eyeOpen: 0.95, pupil: 0.6, curve: -0.9, open: 0.55, width: 20, red: 0.75, anger: 1, shake: 1 } },
  uzgun:           { label: 'Üzgün',           emoji: '😢', p: { browIn: -7, browOut: 4, eyeOpen: 0.75, gazeY: 1, curve: -0.7, open: 0, width: 14, tear: 1, tilt: -4 } },
  hayal_kirikligi: { label: 'Hayal kırıklığı', emoji: '😞', p: { browIn: -3, browOut: 3, eyeOpen: 0.55, gazeY: 1, curve: -0.45, open: 0, width: 15, tilt: -3 } },
  saskin:          { label: 'Şaşkın',          emoji: '😲', p: { browIn: -9, browOut: -9, eyeOpen: 1.35, pupil: 0.7, curve: 0, open: 0.75, width: 11 } },
  dusunceli:       { label: 'Düşünceli',       emoji: '🤔', p: { browIn: -2, browOut: -4, browAsym: 5, eyeOpen: 0.9, gazeY: -1.4, curve: -0.1, open: 0, width: 10, think: 1, tilt: 3 } },
  suphe:           { label: 'Şüpheli',         emoji: '🤨', p: { browIn: 4, browOut: 1, browAsym: -6, eyeOpen: 0.55, curve: -0.2, open: 0, width: 13, tilt: 3 } },
  sikilmis:        { label: 'Sıkılmış',        emoji: '😑', p: { browIn: 2, browOut: 2, eyeOpen: 0.42, curve: -0.15, open: 0, width: 14, zzz: 1, tilt: -2 } },
  endiseli:        { label: 'Endişeli',        emoji: '😟', p: { browIn: -6, browOut: 2, eyeOpen: 1.1, curve: -0.4, open: 0.15, width: 13, sweat: 1 } },
};
export const EMOTION_KEYS = Object.keys(EMOTIONS);

export function normalizeEmotion(e) {
  if (!e) return 'notr';
  const k = String(e).toLowerCase()
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o')
    .replace(/[\s-]+/g, '_');
  if (EMOTIONS[k]) return k;
  const map = { happy: 'mutlu', angry: 'kizgin', sad: 'uzgun', surprised: 'saskin', thinking: 'dusunceli', furious: 'cok_kizgin', proud: 'gururlu', bored: 'sikilmis', disappointed: 'hayal_kirikligi', worried: 'endiseli', neutral: 'notr' };
  return map[k] || 'notr';
}

const BASE = {
  browIn: 0, browOut: 0, browAsym: 0, eyeOpen: 1, pupil: 1, gazeY: 0,
  curve: 0.12, open: 0, width: 16, red: 0, blush: 0, tear: 0, anger: 0,
  shake: 0, sweat: 0, think: 0, zzz: 0, tilt: 0,
};

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c * amt : (255 - c) * amt))));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

// ---------- Saç modelleri ----------
const SHORT_FRONT = 'M44,112 C40,60 62,38 100,38 C138,38 160,60 156,112 C152,84 146,70 132,64 C118,72 84,74 68,66 C56,74 48,88 44,112Z';
function hairParts(style) {
  switch (style) {
    case 'long': return {
      back: 'M40,110 C36,50 64,30 100,30 C136,30 164,50 160,110 L168,205 C140,214 60,214 32,205Z',
      front: 'M44,108 C42,58 66,38 100,38 C134,38 158,58 156,108 C150,80 140,62 122,58 C108,70 80,74 60,72 C52,80 46,92 44,108Z',
    };
    case 'bob': return {
      back: 'M36,112 C32,50 64,32 100,32 C136,32 168,50 164,112 L166,162 C152,170 140,164 138,152 L62,152 C60,164 48,170 34,162Z',
      front: 'M46,102 C44,56 68,40 100,40 C132,40 156,56 154,102 L150,84 C138,77 62,77 50,84Z',
    };
    case 'ponytail': return {
      back: 'M138,58 C186,56 196,132 176,178 C170,146 162,112 142,92Z',
      front: SHORT_FRONT,
    };
    case 'bun': return {
      back: 'M100,14 a20,20 0 1,0 0.1,0Z',
      front: 'M44,110 C40,60 62,40 100,40 C138,40 160,60 156,110 C152,82 140,64 100,62 C60,64 48,82 44,110Z',
    };
    case 'messy': return {
      front: 'M42,112 L34,80 L50,84 L42,54 L62,64 L62,36 L80,52 L92,26 L104,48 L120,28 L124,52 L144,38 L140,62 L162,56 L152,82 L168,88 L158,112 C152,86 140,72 124,68 C108,76 86,76 72,70 C58,78 48,92 42,112Z',
    };
    case 'curly': {
      let d = '';
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI * (1.05 - i * 0.0917);
        const x = 100 + Math.cos(a) * 58, y = 104 - Math.sin(a) * 62;
        const r = 13 + (i % 2) * 2;
        d += `M${x - r},${y} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0Z `;
      }
      return { front: d + 'M50,96 C56,66 80,58 100,58 C120,58 144,66 150,96 C150,60 130,46 100,46 C70,46 50,60 50,96Z' };
    }
    case 'bald': return {
      front: 'M42,124 C38,104 42,90 52,80 C48,96 50,110 56,122Z M158,124 C162,104 158,90 148,80 C152,96 150,110 144,122Z',
      shine: true,
    };
    case 'buzz': return {
      front: 'M45,108 C42,62 64,42 100,42 C136,42 158,62 155,108 C150,80 140,62 100,58 C60,62 50,80 45,108Z',
      opacity: 0.85,
    };
    default: return { front: SHORT_FRONT };
  }
}

let uid = 0;
const live = new Set();
let running = false;
function loop(ms) {
  const t = ms / 1000;
  for (const f of live) {
    if (!f.svg.isConnected) { live.delete(f); continue; }
    f._frame(t);
  }
  if (live.size) requestAnimationFrame(loop); else running = false;
}

export class Face {
  constructor(el, look, { emotion = 'notr', still = false } = {}) {
    this.id = 'fc' + (++uid);
    this.look = look;
    this.cur = { ...BASE, ...EMOTIONS[normalizeEmotion(emotion)].p };
    this.target = { ...this.cur };
    this.emotion = normalizeEmotion(emotion);
    this.speaking = false;
    this.speakAmp = 0;
    this.pulse = 0;
    this.blinkStart = -1;
    this.nextBlink = 0.5 + Math.random() * 3;
    this.gaze = { x: 0, y: 0 };
    this.gazeT = { x: 0, y: 0 };
    this.nextGaze = 1;
    this.last = null;
    this.pointer = null;
    el.innerHTML = this._svg();
    this.svg = el.querySelector('svg');
    const q = c => this.svg.querySelector('.' + c);
    this.el = {
      head: q('head-g'), eyeL: q('eye-l'), eyeR: q('eye-r'), clipL: q('clip-l'), clipR: q('clip-r'),
      irisL: q('iris-l'), irisR: q('iris-r'), browL: q('brow-l'), browR: q('brow-r'),
      mouth: q('mouth'), mclip: q('mclip'), teeth: q('teeth'), tongue: q('tongue'),
      red: q('red'), blush: q('blush'), tear: q('tear'), anger: q('anger'), sweat: q('sweat'),
      think: q('think'), zzz: q('zzz'),
    };
    this._frame(0);
    if (!still) {
      live.add(this);
      if (!running) { running = true; requestAnimationFrame(loop); }
    }
  }

  setEmotion(name) {
    this.emotion = normalizeEmotion(name);
    this.target = { ...BASE, ...EMOTIONS[this.emotion].p };
  }
  setSpeaking(on) { this.speaking = on; }
  boundary() { this.pulse = 0.45; }
  lookAt(x, y) { this.pointer = x == null ? null : { x, y }; }
  destroy() { live.delete(this); }

  _frame(t) {
    const dt = this.last == null ? 1 : Math.min(0.1, t - this.last);
    this.last = t;
    const k = 1 - Math.exp(-dt * 7);
    for (const key in this.target) this.cur[key] += (this.target[key] - this.cur[key]) * k;
    const c = this.cur, E = this.el;

    // Göz kırpma
    if (t > this.nextBlink) {
      this.blinkStart = t;
      this.nextBlink = t + (c.zzz > 0.5 ? 1 + Math.random() * 1.5 : 2 + Math.random() * 4);
    }
    let blink = 1;
    const bt = t - this.blinkStart;
    if (this.blinkStart >= 0 && bt < 0.17) blink = 1 - Math.sin(Math.PI * bt / 0.17) * 0.95;

    // Bakış
    if (this.pointer) this.gazeT = { x: this.pointer.x * 4, y: this.pointer.y * 3 };
    else if (t > this.nextGaze) {
      this.gazeT = Math.random() < 0.45 ? { x: 0, y: 0 } : { x: (Math.random() - 0.5) * 7, y: (Math.random() - 0.5) * 3.5 };
      this.nextGaze = t + 1 + Math.random() * 2.5;
    }
    const gk = 1 - Math.exp(-dt * 12);
    this.gaze.x += (this.gazeT.x - this.gaze.x) * gk;
    this.gaze.y += (this.gazeT.y - this.gaze.y) * gk;

    // Konuşma
    let amp = 0;
    if (this.speaking) amp = 0.12 + 0.5 * Math.abs(Math.sin(t * 12.5)) * (0.55 + 0.45 * Math.sin(t * 3.3 + 1)) + this.pulse;
    this.pulse *= Math.exp(-dt * 6);
    this.speakAmp += (amp - this.speakAmp) * (1 - Math.exp(-dt * 25));

    // Kafa
    const shakeX = c.shake * Math.sin(t * 55) * 2.2;
    const bob = Math.sin(t * 1.6) * 0.8 + (this.speaking ? Math.sin(t * 8.5) * 0.7 : 0);
    const sway = Math.sin(t * 0.7) * 1.3;
    E.head.setAttribute('transform', `translate(${shakeX.toFixed(2)} ${bob.toFixed(2)}) rotate(${(c.tilt + sway).toFixed(2)} 100 200)`);

    // Gözler
    const ry = Math.max(0.6, 9.5 * c.eyeOpen * blink);
    for (const [eye, clip] of [[E.eyeL, E.clipL], [E.eyeR, E.clipR]]) { eye.setAttribute('ry', ry); clip.setAttribute('ry', ry); }
    const gx = this.gaze.x, gy = this.gaze.y + c.gazeY * 3;
    const ps = c.pupil;
    E.irisL.setAttribute('transform', `translate(${75 + gx} ${108 + gy}) scale(${ps})`);
    E.irisR.setAttribute('transform', `translate(${125 + gx} ${108 + gy}) scale(${ps})`);

    // Kaşlar
    const by = 88;
    const li = by + c.browIn - c.browAsym, lo = by + c.browOut - c.browAsym;
    const ri = by + c.browIn, ro = by + c.browOut;
    E.browL.setAttribute('d', `M60,${lo} Q74,${Math.min(li, lo) - 5} 89,${li}`);
    E.browR.setAttribute('d', `M140,${ro} Q126,${Math.min(ri, ro) - 5} 111,${ri}`);

    // Ağız
    const w = c.width + this.speakAmp * 2;
    const o = Math.min(1.2, c.open + this.speakAmp);
    const y0 = 152 - c.curve * 5;
    const uc = y0 + c.curve * 12 - o * 3;
    const lc = uc + 2 + o * 26;
    const d = `M${100 - w},${y0} Q100,${uc} ${100 + w},${y0} Q100,${lc} ${100 - w},${y0}Z`;
    E.mouth.setAttribute('d', d);
    E.mclip.setAttribute('d', d);
    const upperMid = (y0 + uc) / 2;
    E.teeth.setAttribute('y', upperMid - 12);
    E.teeth.setAttribute('height', 12 + 3 + o * 3);
    E.teeth.setAttribute('opacity', o > 0.12 ? 1 : 0);
    E.tongue.setAttribute('cy', (y0 + lc) / 2 + 1);
    E.tongue.setAttribute('ry', 2 + o * 5);

    // Efektler
    E.red.setAttribute('opacity', (c.red * 0.55).toFixed(3));
    E.blush.setAttribute('opacity', c.blush.toFixed(3));
    E.tear.setAttribute('opacity', c.tear.toFixed(3));
    E.tear.setAttribute('transform', `translate(0 ${((t * 26) % 34).toFixed(1)})`);
    const ap = 1 + Math.sin(t * 8) * 0.12;
    E.anger.setAttribute('opacity', c.anger.toFixed(3));
    E.anger.setAttribute('transform', `translate(160 62) scale(${(ap * c.anger).toFixed(3)})`);
    E.sweat.setAttribute('opacity', c.sweat.toFixed(3));
    E.sweat.setAttribute('transform', `translate(0 ${(Math.sin(t * 2) * 3 + 3).toFixed(1)})`);
    E.think.setAttribute('opacity', c.think.toFixed(3));
    E.think.setAttribute('transform', `translate(168 ${(46 + Math.sin(t * 2.5) * 3).toFixed(1)})`);
    E.zzz.setAttribute('opacity', c.zzz.toFixed(3));
    E.zzz.setAttribute('transform', `translate(158 ${(54 - ((t * 8) % 14)).toFixed(1)})`);
  }

  _svg() {
    const L = this.look, id = this.id;
    const skin = L.skin, skinD = shade(skin, -0.18), hair = L.hair;
    const h = hairParts(L.hairStyle);
    const hairOp = h.opacity ?? 1;
    const glasses = L.glasses === 'round'
      ? `<g fill="rgba(255,255,255,.15)" stroke="${L.glassesColor || '#222'}" stroke-width="3"><circle cx="75" cy="108" r="15"/><circle cx="125" cy="108" r="15"/><path d="M90,106 Q100,100 110,106 M60,106 L45,102 M140,106 L155,102" fill="none"/></g>`
      : L.glasses === 'square'
        ? `<g fill="rgba(255,255,255,.15)" stroke="${L.glassesColor || '#222'}" stroke-width="3"><rect x="58" y="96" width="34" height="24" rx="5"/><rect x="108" y="96" width="34" height="24" rx="5"/><path d="M92,106 Q100,102 108,106 M58,104 L45,101 M142,104 L155,101" fill="none"/></g>`
        : '';
    const beard = L.beard
      ? `<path d="M46,118 C46,172 74,194 100,194 C126,194 154,172 154,118 C150,150 136,166 122,168 C112,160 88,160 78,168 C64,166 50,150 46,118Z" fill="${L.beardColor || hair}" opacity="${L.beard === 'stubble' ? 0.35 : 1}"/>`
      : '';
    const mustache = L.mustache
      ? `<path d="M78,145 C85,135 96,137 100,141 C104,137 115,135 122,145 C113,147 106,146 100,144 C94,146 87,147 78,145Z" fill="${L.beardColor || hair}"/>`
      : '';
    const earrings = L.earrings ? `<circle cx="44" cy="132" r="3.5" fill="${L.earrings}"/><circle cx="156" cy="132" r="3.5" fill="${L.earrings}"/>` : '';
    const tie = L.tie ? `<path d="M96,184 L104,184 L107,192 L103,220 L97,220 L93,192Z" fill="${L.tie}"/>` : '';
    const cap = L.cap ? `<path d="M42,84 C42,42 70,30 100,30 C130,30 158,42 158,84 C130,74 70,74 42,84Z" fill="${L.cap}"/><path d="M110,78 C140,72 172,74 186,86 C164,92 132,90 110,86Z" fill="${shade(L.cap, -0.25)}"/>` : '';
    const shine = h.shine ? `<ellipse cx="82" cy="58" rx="16" ry="8" fill="#fff" opacity=".25" transform="rotate(-20 82 58)"/>` : '';

    return `<svg viewBox="0 0 200 220" class="face-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${L.alt || 'Hoca yüzü'}">
<defs>
  <clipPath id="${id}cl"><ellipse class="clip-l" cx="75" cy="108" rx="12" ry="9.5"/></clipPath>
  <clipPath id="${id}cr"><ellipse class="clip-r" cx="125" cy="108" rx="12" ry="9.5"/></clipPath>
  <clipPath id="${id}cm"><path class="mclip"/></clipPath>
</defs>
<path d="M28,222 Q32,182 100,180 Q168,182 172,222Z" fill="${L.shirt}"/>
<path d="M82,180 L100,200 L118,180Z" fill="${L.collar || '#fff'}"/>
${tie}
<g class="head-g">
  ${h.back ? `<path d="${h.back}" fill="${hair}"/>` : ''}
  <rect x="84" y="150" width="32" height="38" rx="10" fill="${skinD}"/>
  <ellipse cx="44" cy="116" rx="9" ry="14" fill="${skinD}"/>
  <ellipse cx="156" cy="116" rx="9" ry="14" fill="${skinD}"/>
  ${earrings}
  <ellipse cx="100" cy="112" rx="56" ry="66" fill="${skin}"/>
  <ellipse class="red" cx="100" cy="112" rx="56" ry="66" fill="#e11d48" opacity="0"/>
  ${shine}
  <g class="blush" opacity="0" fill="#f472b6"><ellipse cx="66" cy="134" rx="10" ry="6" opacity=".55"/><ellipse cx="134" cy="134" rx="10" ry="6" opacity=".55"/></g>
  <ellipse class="eye-l" cx="75" cy="108" rx="12" ry="9.5" fill="#fff"/>
  <ellipse class="eye-r" cx="125" cy="108" rx="12" ry="9.5" fill="#fff"/>
  <g clip-path="url(#${id}cl)"><g class="iris-l"><circle r="6.5" fill="${L.eye}"/><circle r="3.2" fill="#111"/><circle cx="2" cy="-2" r="1.6" fill="#fff"/></g></g>
  <g clip-path="url(#${id}cr)"><g class="iris-r"><circle r="6.5" fill="${L.eye}"/><circle r="3.2" fill="#111"/><circle cx="2" cy="-2" r="1.6" fill="#fff"/></g></g>
  <path class="brow-l" fill="none" stroke="${L.browColor || hair}" stroke-width="5" stroke-linecap="round"/>
  <path class="brow-r" fill="none" stroke="${L.browColor || hair}" stroke-width="5" stroke-linecap="round"/>
  ${glasses}
  <path d="M100,112 C97,124 93,130 97,133 C100,135 104,134 106,132" fill="none" stroke="${skinD}" stroke-width="2.6" stroke-linecap="round"/>
  ${beard}
  <path class="mouth" fill="#6b1d2a" stroke="#3f0f18" stroke-width="2.2" stroke-linejoin="round"/>
  <g clip-path="url(#${id}cm)">
    <rect class="teeth" x="70" width="60" fill="#fff"/>
    <ellipse class="tongue" cx="100" rx="9" fill="#e5677a"/>
  </g>
  ${mustache}
  <g opacity="${hairOp}">${h.front ? `<path d="${h.front}" fill="${hair}" fill-rule="nonzero"/>` : ''}</g>
  ${cap}
  <g class="tear" opacity="0"><path d="M64,120 C60,128 60,132 64,133 C68,132 68,128 64,120Z" fill="#60a5fa"/></g>
  <g class="sweat" opacity="0"><path d="M146,70 C140,80 140,85 146,86 C152,85 152,80 146,70Z" fill="#93c5fd" stroke="#3b82f6" stroke-width="1"/></g>
</g>
<g class="anger" opacity="0"><path d="M-12,-4 L-4,-4 L-4,-12 M4,-12 L4,-4 L12,-4 M12,4 L4,4 L4,12 M-4,12 L-4,4 L-12,4" fill="none" stroke="#dc2626" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>
<g class="think" opacity="0"><circle r="15" fill="#fff" stroke="#94a3b8" stroke-width="2"/><circle cx="-14" cy="20" r="4" fill="#fff" stroke="#94a3b8" stroke-width="1.5"/><text y="7" text-anchor="middle" font-size="20" font-weight="800" fill="#6366f1" font-family="system-ui">?</text></g>
<g class="zzz" opacity="0"><text font-size="16" font-weight="800" fill="#64748b" font-family="system-ui">z<tspan dx="2" dy="-8" font-size="20">Z</tspan></text></g>
</svg>`;
  }
}
