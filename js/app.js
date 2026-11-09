import { Face, EMOTION_KEYS, EMOTIONS } from './face.js';
import { TEACHERS, teacherById } from './teachers.js';
import * as S from './storage.js';
import { mountClassroom, baseEmotion } from './classroom.js';
import { testKey, aiReady, hasAI } from './ai.js';
import { LINES } from './offline.js';
import { speak, unlockAudio } from './speech.js';

const view = document.getElementById('view');
const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let current = null; // aktif sınıf
let faces = [];

export function toast(msg, ms = 3800) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

function cleanup() {
  if (current) { current.destroy(); current = null; }
  faces.forEach(f => f.destroy());
  faces = [];
}
function mountFace(el, t, emotion, still = false) {
  const f = new Face(el, { ...t.look, alt: t.name }, { emotion, still });
  if (!still) faces.push(f);
  return f;
}

// ---------- Ders programı yardımcıları ----------
const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
function lessonNow(date = new Date()) {
  const sch = S.getSchedule();
  const day = (date.getDay() + 6) % 7;
  const min = date.getHours() * 60 + date.getMinutes();
  if (day > 4) return { day, now: null, next: null, sch };
  const list = sch.periods.map((p, i) => ({ i, start: p[0], end: p[1], teacher: sch.days[day][i] })).filter(x => x.teacher);
  const now = list.find(x => min >= toMin(x.start) && min < toMin(x.end)) || null;
  const next = list.find(x => toMin(x.start) > min) || null;
  return { day, now, next, list, sch };
}

// ---------- Router ----------
export function go(name, arg) {
  cleanup();
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.body.dataset.view = name;
  view.scrollTop = 0;
  ({ home, schedule, teachers, settings, class: classroom })[name](arg);
  location.hash = name === 'class' ? `class/${arg}` : name;
}

function classroom(id) {
  if (!teacherById(id)) return go('teachers');
  current = mountClassroom(view, id, { toast, go });
}

// ---------- Ana sayfa ----------
function home() {
  const st = S.getSettings(), u = S.getUsage();
  const { now, next, list, day } = lessonNow();
  const hr = new Date().getHours();
  const hello = hr < 6 ? 'İyi geceler' : hr < 12 ? 'Günaydın' : hr < 18 ? 'İyi günler' : 'İyi akşamlar';
  const focus = now || next;
  const ft = focus && teacherById(focus.teacher);
  const rem = Math.max(0, st.dailyLimit - u.used);
  const pct = Math.round((u.used / st.dailyLimit) * 100);

  view.innerHTML = `
  <div class="page">
    <header class="page-head">
      <div><h1>${hello}${st.name ? ', ' + esc(st.name) : ''} 👋</h1>
      <p class="muted">${new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
      ${hasAI(st) ? '<span class="tag ok">🤖 Yapay zekâ açık</span>' : '<button class="tag warn ai-tag" data-go="settings">⚙️ Yapay zekâ anahtarı ekle</button>'}
    </header>
    <div class="home-grid">
      <section class="card hero" style="--tc:${ft ? ft.color : '#64748b'}">
        ${ft ? `
          <div class="hero-face face"></div>
          <div class="hero-body">
            <span class="kicker">${now ? '🔴 ŞU AN DERSTE' : '⏭ SIRADAKİ DERS'}</span>
            <h2>${ft.icon} ${esc(ft.subject)}</h2>
            <p>${esc(ft.name)} · ${focus.start}–${focus.end}</p>
            <p class="say">“${now ? esc(LINES.late(ft)) : 'Derse hazırlıklı gel, sorularım var!'}”</p>
            <button class="btn primary big" data-class="${ft.id}">Derse gir →</button>
          </div>` : `
          <div class="hero-face face"></div>
          <div class="hero-body"><span class="kicker">${day > 4 ? 'HAFTA SONU' : 'BUGÜN DERS KALMADI'}</span>
          <h2>Serbest çalışma 🎉</h2><p>İstediğin hocayı seçip birebir çalışabilirsin.</p>
          <button class="btn primary big" data-go="teachers">Hoca seç →</button></div>`}
      </section>
      <section class="card limit-card">
        <h3>Günlük soru hakkı</h3>
        <div class="donut" style="--p:${pct}"><div><b>${rem}</b><small>/${st.dailyLimit} kaldı</small></div></div>
        ${rem === 0 ? '<p class="alert red">⛔ Bugünlük hakkın bitti. Yarın görüşürüz!</p>' : rem <= 5 ? `<p class="alert amber">⚠️ Sadece ${rem} hakkın kaldı, dikkatli kullan!</p>` : '<p class="muted small">Her mesaj bir hak. Gece yarısı yenilenir.</p>'}
        <div class="stats">
          <div><b class="g">${u.correct}</b><small>Doğru</small></div>
          <div><b class="r">${u.wrong}</b><small>Yanlış</small></div>
          <div><b class="a">${u.silent}</b><small>Sessiz</small></div>
        </div>
      </section>
      <section class="card today">
        <h3>Bugünün programı</h3>
        ${day > 4 || !list.length ? '<p class="muted">Bugün ders yok.</p>' : `<ul class="timeline">${list.map(x => {
          const tt = teacherById(x.teacher);
          const cls = now && now.i === x.i ? 'now' : (toMin(x.end) <= new Date().getHours() * 60 + new Date().getMinutes() ? 'past' : '');
          return `<li class="${cls}" data-class="${tt.id}" style="--tc:${tt.color}"><span class="time">${x.start}</span><span class="mini face" data-t="${tt.id}"></span><span><b>${esc(tt.subject)}</b><small>${esc(tt.name)}</small></span>${cls === 'now' ? '<em>Şimdi</em>' : ''}</li>`;
        }).join('')}</ul>`}
      </section>
      <section class="card moods">
        <h3>Hocaların ruh hali</h3>
        <div class="mood-row">${TEACHERS.map(tt => `<button class="mood-item" data-class="${tt.id}" title="${esc(tt.name)}"><span class="mini face" data-t="${tt.id}" data-mood></span><small>${esc(tt.name.replace(' Hoca', ''))}</small></button>`).join('')}</div>
      </section>
    </div>
  </div>`;
  aiReady.then(ok => { const tg = view.querySelector('.ai-tag'); if (ok && tg) tg.outerHTML = '<span class="tag ok">🤖 Yapay zekâ açık</span>'; });
  const heroT = ft || TEACHERS[new Date().getDate() % TEACHERS.length];
  mountFace(view.querySelector('.hero-face'), heroT, ft ? (now ? 'kizgin' : baseEmotion(S.getMood(ft.id))) : 'cok_mutlu');
  view.querySelectorAll('.mini.face').forEach(el => {
    const tt = teacherById(el.dataset.t);
    mountFace(el, tt, baseEmotion(S.getMood(tt.id)), !('mood' in el.dataset));
  });
}

// ---------- Ders programı ----------
function schedule() {
  const sch = S.getSchedule();
  const { day, now } = lessonNow();
  view.innerHTML = `
  <div class="page">
    <header class="page-head"><div><h1>Ders Programı</h1><p class="muted">Bir kutuya dokunup hocayı değiştir. Saate dokunup saati düzenle.</p></div>
    <button class="btn ghost" id="resetSch">Varsayılana dön</button></header>
    <div class="card sched-wrap"><table class="sched">
      <thead><tr><th></th>${DAYS.map((d, i) => `<th class="${i === day ? 'today' : ''}">${d}</th>`).join('')}</tr></thead>
      <tbody>${sch.periods.map((p, i) => `<tr><th class="ptime" data-p="${i}"><b>${i + 1}. ders</b><small>${p[0]}–${p[1]}</small></th>${DAYS.map((_, d) => {
        const tt = teacherById(sch.days[d][i]);
        const isNow = d === day && now && now.i === i;
        return `<td><button class="slot ${tt ? '' : 'empty'} ${isNow ? 'now' : ''}" data-d="${d}" data-p="${i}" style="--tc:${tt ? tt.color : '#cbd5e1'}">${tt ? `<span>${tt.icon}</span><b>${esc(tt.subject)}</b><small>${esc(tt.name)}</small>` : '<small>Boş</small>'}</button></td>`;
      }).join('')}</tr>`).join('')}</tbody>
    </table></div>
  </div>`;
  view.querySelectorAll('.slot').forEach(b => b.addEventListener('click', () => {
    const d = +b.dataset.d, p = +b.dataset.p;
    modal(`<h3>${DAYS[d]} · ${p + 1}. ders</h3><div class="pick">${TEACHERS.map(tt => `<button data-id="${tt.id}" style="--tc:${tt.color}"><span>${tt.icon}</span>${esc(tt.subject)}<small>${esc(tt.name)}</small></button>`).join('')}<button data-id="">— Boş —</button></div>`, m => {
      m.querySelectorAll('.pick button').forEach(x => x.addEventListener('click', () => { sch.days[d][p] = x.dataset.id || null; S.saveSchedule(sch); m.close(); schedule(); }));
    });
  }));
  view.querySelectorAll('.ptime').forEach(th => th.addEventListener('click', () => {
    const p = +th.dataset.p;
    modal(`<h3>${p + 1}. ders saati</h3><div class="row"><label>Başlangıç <input type="time" id="ts" value="${sch.periods[p][0]}"></label><label>Bitiş <input type="time" id="te" value="${sch.periods[p][1]}"></label></div><button class="btn primary" id="tsave">Kaydet</button>`, m => {
      m.querySelector('#tsave').addEventListener('click', () => { sch.periods[p] = [m.querySelector('#ts').value, m.querySelector('#te').value]; S.saveSchedule(sch); m.close(); schedule(); });
    });
  }));
  view.querySelector('#resetSch').addEventListener('click', () => { if (confirm('Program varsayılana dönsün mü?')) { localStorage.removeItem('sinifim.schedule'); schedule(); } });
}

// ---------- Hocalar ----------
function teachers() {
  view.innerHTML = `
  <div class="page">
    <header class="page-head"><div><h1>Hocalar</h1><p class="muted">Yüzlerine dokun, duygularını gör. Derse girip konuş.</p></div></header>
    <div class="t-grid">${TEACHERS.map(tt => {
      const m = S.getMood(tt.id);
      return `<article class="card t-card" style="--tc:${tt.color}">
        <button class="t-face face" data-t="${tt.id}" aria-label="${esc(tt.name)} duygu değiştir"></button>
        <span class="t-emo" data-e="${tt.id}"></span>
        <h3>${esc(tt.name)}</h3><p class="subj">${tt.icon} ${esc(tt.subject)}</p>
        <p class="muted small">${esc(tt.tagline)}</p>
        <div class="meter sm"><span>Sabır</span><div class="bar"><i style="width:${m}%;background:${m > 60 ? '#22c55e' : m > 30 ? '#f59e0b' : '#ef4444'}"></i></div></div>
        <button class="btn primary" data-class="${tt.id}">Derse gir</button>
      </article>`;
    }).join('')}</div>
  </div>`;
  view.querySelectorAll('.t-face').forEach((el, i) => {
    const tt = teacherById(el.dataset.t);
    const f = mountFace(el, tt, baseEmotion(S.getMood(tt.id)));
    const chip = view.querySelector(`[data-e="${tt.id}"]`);
    let idx = EMOTION_KEYS.indexOf(f.emotion);
    const show = () => { chip.textContent = `${EMOTIONS[f.emotion].emoji} ${EMOTIONS[f.emotion].label}`; };
    show();
    el.addEventListener('click', () => { idx = (idx + 1) % EMOTION_KEYS.length; f.setEmotion(EMOTION_KEYS[idx]); show(); });
    // Galeri canlı dursun: arada bir rastgele duygu
    const iv = setInterval(() => { if (!el.isConnected) return clearInterval(iv); if (Math.random() < 0.3) { idx = Math.floor(Math.random() * EMOTION_KEYS.length); f.setEmotion(EMOTION_KEYS[idx]); show(); } }, 3500 + i * 300);
  });
}

// ---------- Ayarlar ----------
function settings() {
  const s = S.getSettings();
  view.innerHTML = `
  <div class="page narrow">
    <header class="page-head"><div><h1>Ayarlar</h1></div></header>
    <form class="card form" id="sf">
      <h3>👤 Öğrenci</h3>
      <div class="row"><label>Adın <input name="name" value="${esc(s.name)}" placeholder="Örn. Rüzgar"></label>
      <label>Sınıf / seviye <input name="grade" value="${esc(s.grade)}"></label></div>

      <h3>🤖 Yapay zekâ (Claude)</h3>
      <label>API anahtarı <input name="apiKey" type="password" value="${esc(s.apiKey)}" placeholder="sk-ant-..." autocomplete="off"></label>
      <p class="muted small">Anahtar yalnızca bu tablette saklanır, sadece api.anthropic.com'a gönderilir. Anahtar yoksa hocalar çevrimdışı soru bankasıyla çalışır. Anahtar almak için: console.anthropic.com</p>
      <div class="row"><label>Model <select name="model">
        ${[['claude-haiku-5-5', 'Haiku 5.5 — en hızlı (canlı konuşma için önerilir)'], ['claude-sonnet-5-5', 'Sonnet 5.5 — daha akıllı'], ['claude-opus-5-5', 'Opus 5.5 — en akıllı, daha yavaş']].map(([v, l]) => `<option value="${v}" ${s.model === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select></label>
      <button type="button" class="btn ghost" id="test">Bağlantıyı test et</button></div>

      <h3>📏 Kurallar</h3>
      <div class="row">
        <label>Günlük soru hakkı <input name="dailyLimit" type="number" min="1" max="500" value="${s.dailyLimit}"></label>
        <label>Cevap süresi (sn) <input name="answerTime" type="number" min="8" max="180" value="${s.answerTime}"></label>
      </div>
      <label>Hocaların sertliği <select name="strictness">
        <option value="yumusak" ${s.strictness === 'yumusak' ? 'selected' : ''}>Yumuşak — sitem ederler</option>
        <option value="normal" ${s.strictness === 'normal' ? 'selected' : ''}>Normal — kişiliklerine göre</option>
        <option value="sert" ${s.strictness === 'sert' ? 'selected' : ''}>Sert — iyice kızarlar</option>
      </select></label>

      <h3>🔊 Ses & uyarılar</h3>
      <label class="check"><input type="checkbox" name="voice" ${s.voice ? 'checked' : ''}> Hocalar sesli konuşsun</label>
      <label>Konuşma hızı <input name="rate" type="range" min="0.7" max="1.4" step="0.05" value="${s.rate}"></label>
      <label class="check"><input type="checkbox" name="reminders" ${s.reminders ? 'checked' : ''}> Ders başlayınca hoca beni uyarsın</label>
      <div class="row"><button class="btn primary" type="submit">Kaydet</button><button type="button" class="btn ghost" id="voiceTest">Sesi dene</button></div>
    </form>
    <div class="card form danger">
      <h3>🧹 Veriler</h3>
      <div class="row"><button class="btn ghost" id="resetMood">Hocaların sabrını sıfırla</button><button class="btn ghost" id="resetAll">Her şeyi sil</button></div>
    </div>
  </div>`;
  const f = view.querySelector('#sf');
  const collect = () => {
    const d = new FormData(f);
    return {
      ...s, name: d.get('name').trim(), grade: d.get('grade').trim() || '9. sınıf', apiKey: d.get('apiKey').trim(), model: d.get('model'),
      dailyLimit: Math.max(1, +d.get('dailyLimit') || 30), answerTime: Math.max(8, +d.get('answerTime') || 25),
      strictness: d.get('strictness'), voice: !!d.get('voice'), rate: +d.get('rate'), reminders: !!d.get('reminders'),
    };
  };
  f.addEventListener('submit', e => { e.preventDefault(); S.saveSettings(collect()); toast('✅ Kaydedildi'); });
  view.querySelector('#test').addEventListener('click', async e => {
    const st = collect();
    if (!st.apiKey) return toast('Önce API anahtarını gir.');
    e.target.disabled = true; e.target.textContent = 'Deneniyor…';
    try { const r = await testKey(st); toast('✅ Çalışıyor! Hoca diyor ki: ' + r); S.saveSettings(st); } catch (err) { toast('❌ Hata: ' + err.message, 6000); }
    e.target.disabled = false; e.target.textContent = 'Bağlantıyı test et';
  });
  view.querySelector('#voiceTest').addEventListener('click', () => { unlockAudio(); speak('Merhaba! Ben senin yapay zekâ hocanım. Derse hazır mısın?', { rate: +f.rate.value }); });
  view.querySelector('#resetMood').addEventListener('click', () => { localStorage.removeItem('sinifim.mood'); toast('Hocalar sakinleşti 😌'); });
  view.querySelector('#resetAll').addEventListener('click', () => { if (confirm('Tüm ayarlar, program ve geçmiş silinsin mi?')) { S.resetAll(); toast('Silindi'); settings(); } });
}

// ---------- Modal ----------
function modal(html, init) {
  const d = document.createElement('dialog');
  d.className = 'modal';
  d.innerHTML = `<button class="icon-btn x" aria-label="Kapat">✕</button>${html}`;
  document.body.appendChild(d);
  d.querySelector('.x').addEventListener('click', () => d.close());
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  init && init(d);
  d.showModal();
}

// ---------- Ders başlangıç uyarısı ----------
let lastLessonKey = null;
function checkReminder(initial) {
  const { now, day } = lessonNow();
  const key = now ? `${S.today()}-${day}-${now.i}` : null;
  if (key === lastLessonKey) return;
  lastLessonKey = key;
  if (initial || !now || !S.getSettings().reminders) return;
  if (current && current.teacherId === now.teacher) return;
  const tt = teacherById(now.teacher);
  const line = LINES.late(tt);
  modal(`<div class="remind" style="--tc:${tt.color}"><div class="face remind-face"></div><h3>${esc(tt.name)}</h3><p>“${esc(line)}”</p><button class="btn primary big" id="goClass">Derse gir →</button></div>`, m => {
    const f = new Face(m.querySelector('.remind-face'), tt.look, { emotion: 'kizgin' });
    m.addEventListener('close', () => f.destroy());
    m.querySelector('#goClass').addEventListener('click', () => { m.close(); go('class', tt.id); });
    if (S.getSettings().voice) { f.setSpeaking(true); speak(line, tt.voice, { onend: () => f.setSpeaking(false) }); }
  });
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    new Notification(`${tt.name} seni bekliyor`, { body: line, icon: 'icons/icon-192.png' });
  }
}

// ---------- Başlangıç ----------
document.addEventListener('click', e => {
  const c = e.target.closest('[data-class]'); if (c) { unlockAudio(); return go('class', c.dataset.class); }
  const g = e.target.closest('[data-go], .nav button[data-view]'); if (g) return go(g.dataset.go || g.dataset.view);
});
document.addEventListener('pointerdown', () => {
  unlockAudio();
  if (S.getSettings().reminders && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}, { once: true });

const [h, arg] = (location.hash.slice(1) || 'home').split('/');
go(['home', 'schedule', 'teachers', 'settings', 'class'].includes(h) ? h : 'home', arg);
checkReminder(true);
setInterval(() => checkReminder(false), 20000);
setInterval(() => { if (document.body.dataset.view === 'home' && !document.querySelector('dialog')) go('home'); }, 60000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
