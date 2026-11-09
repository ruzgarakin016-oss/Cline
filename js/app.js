import { Face, EMOTIONS } from './face.js';
import { TEACHERS, teacherById } from './teachers.js';
import * as S from './storage.js';
import { getPatience, baseEmotion, patienceColor, MOOD_SCALE, resetPatience, applyEvent } from './mood.js';
import { mountRoom } from './room.js';
import { createStage } from './stage.js';
import { runQuiz } from './quiz.js';
import { llmJSON, hasAI, aiReady, testConnection } from './ai.js';
import { quizSystem, planSystem } from './prompts.js';
import { allExams, upcoming, daysUntil, whenText } from './exams.js';
import { speak, unlockAudio, trVoices, SFX } from './voice.js';
import { getProg, levelOf, xpForLevel, levelName, currentStreak, todayXP, lastDays, BADGES, weakTopics, addXP, stat } from './progress.js';
import { dueMistakes, allMistakes } from './mistakes.js';
import { esc, toast, modal, googleLink, needAI, errorBox } from './ui.js';

const view = document.getElementById('view');
const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
const MODE_NAMES = { ders: 'Sohbet', coz: 'Soru çöz', deneme: 'Deneme', yazili: 'Yazılı hazırlık', tekrar: 'Tekrar', tahta: 'Tahtada çöz', hata: 'Hata defteri', sor: 'Soru sor' };
let current = null;
let faces = [];

function cleanup() {
  if (current) { current.destroy(); current = null; }
  faces.forEach(f => f.destroy()); faces = [];
}
function face(el, t, { still = false, emotion } = {}) {
  const p = getPatience(t.id);
  const f = new Face(el, { ...t.look, alt: t.name }, { emotion: emotion || baseEmotion(p), still, led: patienceColor(p) });
  if (!still) faces.push(f);
  return f;
}
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' });

// ---------- Ders programı yardımcıları ----------
const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
function lessonNow(date = new Date()) {
  const sch = S.getSchedule();
  const day = (date.getDay() + 6) % 7;
  const min = date.getHours() * 60 + date.getMinutes();
  if (day > 4) return { day, now: null, next: null, list: [] };
  const list = sch.periods.map((p, i) => ({ i, start: p[0], end: p[1], teacher: sch.days[day][i] })).filter(x => x.teacher && teacherById(x.teacher));
  const now = list.find(x => min >= toMin(x.start) && min < toMin(x.end)) || null;
  const next = list.find(x => toMin(x.start) > min) || null;
  return { day, now, next, list };
}

// ---------- Router ----------
const VIEWS = () => ({ home, teachers, odak, exams, gelisim, genel, hata, schedule, settings, room });
export function go(name, ...args) {
  cleanup();
  const navName = { room: 'teachers', genel: 'home', hata: 'gelisim' }[name] || name;
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', b.dataset.view === navName));
  document.body.dataset.view = name;
  view.scrollTop = 0;
  (VIEWS()[name] || home)(...args);
  if (name !== 'room') history.replaceState(null, '', '#' + name);
}
function room(id, tab) {
  if (!teacherById(id)) return go('teachers');
  current = mountRoom(view, id, tab, { go });
}
function pickTeacher(title, cb) {
  modal(`<h3>${esc(title)}</h3><div class="pick">${TEACHERS.map(t => `<button data-id="${t.id}" style="--tc:${t.color}"><span>${t.icon}</span>${esc(t.subject)}<small>${esc(t.name)}</small></button>`).join('')}</div>`, m => {
    m.querySelectorAll('.pick button').forEach(b => b.addEventListener('click', () => { m.close(); cb(b.dataset.id); }));
  });
}
function openTask(g) {
  if (g.mod === 'hata') return go('hata');
  go('room', teacherById(g.hoca) ? g.hoca : 'piko', g.mod);
}

// ---------- Ana sayfa ----------
function home() {
  const st = S.getSettings(), u = S.getUsage(), pr = getProg();
  const { now, next, list, day } = lessonNow();
  const hr = new Date().getHours();
  const hello = hr < 6 ? 'İyi geceler' : hr < 12 ? 'Günaydın' : hr < 18 ? 'İyi günler' : 'İyi akşamlar';
  const focus = now || next;
  const ft = focus ? teacherById(focus.teacher) : TEACHERS[new Date().getDate() % TEACHERS.length];
  const rem = Math.max(0, st.dailyLimit - u.used);
  const exs = upcoming(3);
  const lv = levelOf(pr.xp), lvFrom = xpForLevel(lv), lvTo = xpForLevel(lv + 1);
  const streak = currentStreak(pr), txp = todayXP(), goal = st.dailyGoal || 100;
  const due = dueMistakes().length;

  view.innerHTML = `
  <div class="page">
    <header class="page-head">
      <div><h1>${hello}${st.name ? ', ' + esc(st.name) : ''} 👋</h1>
      <p class="muted">${new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} · ${st.grade}. sınıf</p></div>
      <div class="hud">
        <span class="hud-i fire ${streak ? 'on' : ''}" title="Günlük seri">🔥 <b>${streak}</b></span>
        <span class="hud-i" title="Seviye">⭐ <b>${lv}</b></span>
        <span class="tag ai-tag">…</span>
      </div>
    </header>
    <div class="home-grid">
      <section class="card hero" style="--tc:${ft.color}">
        <div class="hero-face face"></div>
        <div class="hero-body">
          <span class="kicker">${now ? '🔴 ŞU AN DERSTE' : focus ? '⏭ SIRADAKİ DERS' : day > 4 ? '🎉 HAFTA SONU' : '✅ BUGÜNLÜK DERSLER BİTTİ'}</span>
          <h2>${ft.icon} ${esc(ft.subject)}</h2>
          <p>${esc(ft.name)}${focus ? ` · ${focus.start}–${focus.end}` : ' · serbest çalışma'}</p>
          <div class="row">
            <button class="btn primary big" data-room="${ft.id}">Derse gir →</button>
            <button class="btn ghost" data-room="${ft.id}" data-tab="sor">📷 Soru at</button>
          </div>
        </div>
      </section>
      <section class="card goal-card">
        <div class="lvl"><div class="lvl-badge">${lv}</div><div class="grow"><b>${esc(levelName(lv))}</b><div class="bar"><i style="width:${Math.min(100, (pr.xp - lvFrom) / (lvTo - lvFrom) * 100)}%;background:linear-gradient(90deg,#a78bfa,#6d5efc)"></i></div><small class="muted">${pr.xp - lvFrom}/${lvTo - lvFrom} XP · sonraki seviye</small></div></div>
        <div class="goal">
          <div class="donut" style="--p:${Math.min(100, Math.round(txp / goal * 100))};--c:#f59e0b"><div><b>${txp}</b><small>/${goal} XP</small></div></div>
          <div class="goal-side">
            <div><b>Günlük hedef</b><small>${txp >= goal ? '🎉 Tamamlandı!' : `${goal - txp} XP kaldı`}</small></div>
            <div><b>❓ ${rem}/${st.dailyLimit}</b><small>soru hakkı</small></div>
            <div><b>📒 ${due}</b><small>tekrar bekliyor</small></div>
          </div>
        </div>
      </section>
      <section class="card coach">
        <div class="coach-head"><span class="mini face coach-face"></span><div><h3>Koçun bugünkü planı</h3><small class="muted">Yazılılarına, zayıf konularına ve hata defterine göre</small></div></div>
        <div class="plan"></div>
      </section>
      <section class="card quick">
        <h3>Hızlı başla</h3>
        <div class="quick-grid">
          <button class="qa" data-act="sor"><span>📷</span><b>Soru at</b><small>Fotoğrafını çek</small></button>
          <button class="qa" data-act="tahta"><span>✍️</span><b>Tahtada çöz</b><small>Robot kontrol etsin</small></button>
          <button class="qa" data-act="deneme"><span>📝</span><b>Deneme</b><small>Süreli sınav</small></button>
          <button class="qa" data-go="odak"><span>🎧</span><b>Odak modu</b><small>Robotla çalış</small></button>
          <button class="qa" data-go="genel"><span>🌈</span><b>Genel tekrar</b><small>Tüm hocalarla</small></button>
          <button class="qa" data-go="hata"><span>📒</span><b>Hata defteri</b><small>${due} soru bekliyor</small></button>
        </div>
      </section>
      <section class="card exams-card">
        <h3>Yaklaşan yazılılar</h3>
        ${exs.length ? `<ul class="ex-list">${exs.map(e => { const t = teacherById(e.teacher); const d = daysUntil(e.date); return `<li style="--tc:${t ? t.color : '#64748b'}"><span class="ex-d ${d <= 3 ? 'hot' : ''}"><b>${d}</b><small>gün</small></span><span class="grow"><b>${esc(e.title || (t ? t.subject + ' yazılısı' : 'Yazılı'))}</b><small>${fmtDate(e.date)}${e.source === 'ortak' ? ' · MEB ortak' : ''}</small></span>${t ? `<button class="btn sm primary" data-room="${t.id}" data-tab="yazili">Hazırlan</button>` : ''}</li>`; }).join('')}</ul>` : '<p class="muted">Takvimde yazılı yok.</p>'}
        <button class="btn ghost sm" data-go="exams">+ Yazılı ekle / takvim</button>
      </section>
      <section class="card today">
        <h3>Bugünün programı</h3>
        ${!list.length ? '<p class="muted">Bugün ders yok.</p>' : `<ul class="timeline">${list.map(x => {
          const tt = teacherById(x.teacher);
          const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
          const cls = now && now.i === x.i ? 'now' : (toMin(x.end) <= nowMin ? 'past' : '');
          return `<li class="${cls}" data-room="${tt.id}" style="--tc:${tt.color}"><span class="time">${x.start}</span><span class="mini face" data-t="${tt.id}"></span><span><b>${esc(tt.subject)}</b><small>${esc(tt.name)}</small></span>${cls === 'now' ? '<em>Şimdi</em>' : ''}</li>`;
        }).join('')}</ul>`}
        <button class="btn ghost sm" data-go="schedule" style="margin-top:10px">📅 Programı düzenle</button>
      </section>
      <section class="card moods">
        <h3>Robot hocalar</h3>
        <div class="mood-row">${TEACHERS.map(tt => { const p = getPatience(tt.id); return `<button class="mood-item" data-room="${tt.id}"><span class="mini face" data-t="${tt.id}"></span><small>${esc(tt.name)}</small><i style="background:${patienceColor(p)}">${p}</i></button>`; }).join('')}</div>
      </section>
    </div>
  </div>`;
  face(view.querySelector('.hero-face'), ft, { emotion: now ? (getPatience(ft.id) < 50 ? 'kizgin' : 'suphe') : undefined });
  face(view.querySelector('.coach-face'), teacherById('atlas'), { still: true, emotion: 'mutlu' });
  view.querySelectorAll('.mini.face[data-t]').forEach(el => face(el, teacherById(el.dataset.t), { still: true }));
  view.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act;
    pickTeacher({ sor: 'Soruyu hangi hocaya atalım?', tahta: 'Hangi dersten çözeceksin?', deneme: 'Hangi dersten deneme?' }[a], id => go('room', id, a));
  }));
  const tag = view.querySelector('.ai-tag');
  aiReady.then(() => { tag.className = 'tag ai-tag ' + (hasAI() ? 'ok' : 'warn'); tag.textContent = hasAI() ? '🤖 Yapay zekâ bağlı' : '📴 Çevrimdışı'; renderPlan(); });
}

// Koç planı
function renderPlan(force) {
  const box = view.querySelector('.plan'); if (!box) return;
  const cache = S.read('plan', null);
  if (cache && cache.date === S.today() && !force) return drawPlan(box, cache);
  if (!hasAI()) { box.innerHTML = '<p class="muted small">Plan için yapay zekâ gerekli.</p>'; return; }
  box.innerHTML = `<div class="plan-empty"><p class="muted small">Koç robot; yazılılarına, zayıf konularına ve hata defterine bakıp sana özel bir günlük plan hazırlar.</p><button class="btn primary mk">✨ Bugünün planını hazırla</button></div>`;
  box.querySelector('.mk').addEventListener('click', () => makePlan(box));
}
async function makePlan(box) {
  box.innerHTML = '<div class="loading sm"><div class="spinner"></div><b>Koç planını hazırlıyor…</b></div>';
  const { list } = lessonNow();
  const ctx = {
    grade: S.getSettings().grade, date: new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }),
    todayLessons: list.map(x => teacherById(x.teacher).subject).join(', '),
    exams: upcoming(5).map(e => `${e.title || teacherById(e.teacher)?.subject} (${daysUntil(e.date)} gün sonra, hoca: ${e.teacher})`).join('; '),
    weak: weakTopics().map(w => `${teacherById(w.teacherId)?.subject} - ${w.topic}: %${w.pct}`).join('; '),
    due: dueMistakes().length,
    teachers: TEACHERS.map(t => `${t.id}: ${t.subject}`).join(', '),
  };
  try {
    const j = await llmJSON({ system: planSystem(ctx), tier: 'default', messages: [{ role: 'user', content: 'Planı hazırla.' }] });
    const plan = { date: S.today(), selam: j.selam || '', gorevler: (j.gorevler || []).slice(0, 7).map(g => ({ ...g, done: false })) };
    S.write('plan', plan);
    if (box.isConnected) drawPlan(box, plan);
  } catch (e) { if (box.isConnected) errorBox(box, e, () => makePlan(box)); }
}
function drawPlan(box, plan) {
  const doneN = plan.gorevler.filter(g => g.done).length;
  box.innerHTML = `
    ${plan.selam ? `<p class="plan-hi">“${esc(plan.selam)}”</p>` : ''}
    <div class="plan-prog"><div class="bar"><i style="width:${doneN / Math.max(1, plan.gorevler.length) * 100}%;background:#22c55e"></i></div><small>${doneN}/${plan.gorevler.length}</small></div>
    <ul class="tasks">${plan.gorevler.map((g, i) => { const t = teacherById(g.hoca); return `<li class="${g.done ? 'done' : ''}" style="--tc:${t ? t.color : '#64748b'}">
      <button class="chk" data-i="${i}" aria-label="Tamamlandı">${g.done ? '✓' : ''}</button>
      <div class="grow" data-open="${i}"><b>${t ? t.icon + ' ' : ''}${esc(MODE_NAMES[g.mod] || g.mod)}${g.konu ? ' · ' + esc(g.konu) : ''}</b><small>${esc(g.neden || '')}</small></div>
      <span class="mins">${g.dakika || 15} dk</span></li>`; }).join('')}</ul>
    <button class="link redo">↻ Yeniden planla</button>`;
  box.querySelectorAll('.chk').forEach(b => b.addEventListener('click', () => {
    const g = plan.gorevler[+b.dataset.i];
    g.done = !g.done; S.write('plan', plan);
    if (g.done) { addXP(15, 'Plan görevi'); if (plan.gorevler.every(x => x.done)) { addXP(50, 'Günlük plan tamam!'); SFX.level(); } }
    drawPlan(box, plan);
  }));
  box.querySelectorAll('[data-open]').forEach(d => d.addEventListener('click', () => openTask(plan.gorevler[+d.dataset.open])));
  box.querySelector('.redo').addEventListener('click', () => makePlan(box));
}

// ---------- Hocalar ----------
function teachers() {
  view.innerHTML = `
  <div class="page">
    <header class="page-head"><div><h1>Robot Hocalar</h1><p class="muted">Her robotun kendi sesi, kişiliği ve sabrı var. Yüzlerine dokun!</p></div></header>
    <div class="card legend">
      <b>Sabır → ifade</b>
      <div class="scale">${MOOD_SCALE.map(([min, e], i) => `<span style="--c:${patienceColor(min)}">${EMOTIONS[e].emoji} ${min}${i === 0 ? '+' : '–' + (MOOD_SCALE[i - 1][0] - 1)} <small>${EMOTIONS[e].label}</small></span>`).join('')}</div>
      <p class="muted small">✅ Doğru cevap ve iyi sonuçlar sabrı artırır. ❌ Yanlış, ⏰ susmak, kabalık ve odak modunda uygulamadan kaçmak düşürür. Zamanla sakinleşirler.</p>
    </div>
    <div class="t-grid">${TEACHERS.map(tt => {
      const p = getPatience(tt.id), e = baseEmotion(p);
      return `<article class="card t-card" style="--tc:${tt.color}">
        <button class="t-face face" data-t="${tt.id}" aria-label="${esc(tt.name)} konuşsun"></button>
        <span class="t-emo">${EMOTIONS[e].emoji} ${EMOTIONS[e].label}</span>
        <h3>${esc(tt.name)}</h3><p class="subj">${tt.icon} ${esc(tt.subject)}</p>
        <p class="muted small">${esc(tt.tagline)}</p>
        <div class="meter sm"><span>Sabır</span><div class="bar"><i style="width:${p}%;background:${patienceColor(p)}"></i></div><b>${p}</b></div>
        <button class="btn primary" data-room="${tt.id}">Derse gir</button>
      </article>`;
    }).join('')}</div>
  </div>`;
  view.querySelectorAll('.t-face').forEach(el => {
    const t = teacherById(el.dataset.t);
    const f = face(el, t);
    el.addEventListener('click', () => {
      unlockAudio(); f.poke(); SFX.tap();
      const intro = `Merhaba! Ben ${t.name}. ${t.tagline}`;
      f.setSpeaking(true);
      speak(intro, t.voice, { onboundary: () => f.boundary(), onend: () => f.setSpeaking(false) });
    });
  });
}

// ---------- Odak modu ----------
function odak(tid) {
  const t0 = teacherById(tid || S.read('odakT', 'filiz')) || TEACHERS[0];
  view.innerHTML = `
  <section class="room odak">
    <div class="room-stage"></div>
    <div class="room-main"><div class="room-body"><div class="o-body"></div></div></div>
  </section>`;
  let stage = createStage(view.querySelector('.room-stage'), t0);
  stage.setVoice(S.getSettings().voice);
  const body = view.querySelector('.o-body');
  let timer = null, dead = false, onVis = null;
  current = { destroy() { dead = true; clearInterval(timer); stage.destroy(); if (onVis) document.removeEventListener('visibilitychange', onVis); } };
  let t = t0;
  function setup() {
    clearInterval(timer);
    if (onVis) { document.removeEventListener('visibilitychange', onVis); onVis = null; }
    body.innerHTML = `
    <div class="card-in">
      <h2>🎧 Odak modu</h2>
      <p class="muted">Bir robot seç, telefonu bırak, çalış. Robot seni izler: uygulamadan çıkarsan fark eder ve sabrı azalır! Süre bitince XP kazanırsın.</p>
      <h4>Çalışma arkadaşın</h4>
      <div class="pick">${TEACHERS.map(x => `<button data-id="${x.id}" class="${x.id === t.id ? 'sel' : ''}" style="--tc:${x.color}"><span>${x.icon}</span>${esc(x.name)}<small>${esc(x.subject)}</small></button>`).join('')}</div>
      <div class="row">
        <label>Ne çalışacaksın? <input class="o-goal" placeholder="ör. Fizik test kitabı 3. ünite"></label>
        <label>Süre <select class="o-min"><option>15</option><option selected>25</option><option>45</option><option>60</option></select></label>
      </div>
      <button class="btn primary big o-start">▶ Odaklanmaya başla</button>
    </div>`;
    body.querySelectorAll('.pick button').forEach(b => b.addEventListener('click', () => {
      t = teacherById(b.dataset.id); S.write('odakT', t.id);
      body.querySelectorAll('.pick button').forEach(x => x.classList.toggle('sel', x === b));
      stage.setTeacher(t); stage.say('Birlikte çalışalım mı?');
    }));
    body.querySelector('.o-start').addEventListener('click', () => run(+body.querySelector('.o-min').value, body.querySelector('.o-goal').value.trim()));
  }
  function run(min, goal) {
    unlockAudio();
    let left = min * 60, away = 0, leftAt = 0, escapes = 0;
    const total = left;
    stage.say(`${min} dakika başlıyor. ${goal ? goal + ' çalışıyoruz. ' : ''}Ben buradayım, kaçmak yok!`);
    body.innerHTML = `
    <div class="card-in focus">
      <div class="f-ring" style="--tc:${t.color}"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="fr-bg"/><circle cx="60" cy="60" r="52" class="fr"/></svg><div><b class="f-time"></b><small>${esc(goal || 'odak')}</small></div></div>
      <div class="f-stats"><span>🚪 Kaçış: <b class="f-esc">0</b></span><span>💤 Uzakta: <b class="f-away">0</b> sn</span></div>
      <div class="row center"><button class="btn ghost f-stop">⏹ Bitir</button></div>
    </div>`;
    const draw = () => {
      const f = left / total;
      body.querySelector('.f-time').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      body.querySelector('.fr').style.strokeDashoffset = (1 - f) * 326.7;
    };
    draw();
    const cheers = ['Harika gidiyorsun, devam!', 'Yarıya geldik bile. Su içmeyi unutma.', 'Son düzlük! Pes etmek yok.'];
    timer = setInterval(() => {
      if (document.hidden) return;
      left--; draw();
      const done = total - left;
      if (done === Math.floor(total / 4) || done === Math.floor(total / 2) || done === Math.floor(total * 3 / 4)) { stage.react('dogru', 3000); stage.say(cheers[[Math.floor(total / 4), Math.floor(total / 2), Math.floor(total * 3 / 4)].indexOf(done)]); }
      if (left <= 0) finish(true);
    }, 1000);
    onVis = () => {
      if (document.hidden) { leftAt = Date.now(); return; }
      if (!leftAt) return;
      const s = Math.round((Date.now() - leftAt) / 1000); leftAt = 0;
      if (s < 5) return;
      away += s; escapes++;
      body.querySelector('.f-esc').textContent = escapes; body.querySelector('.f-away').textContent = away;
      const r = stage.react('gec', 7000);
      SFX.alarm();
      stage.say(escapes >= 3 ? `Yine mi kaçtın?! ${escapes}. kez! Sabrım tükeniyor.` : r.patience < 40 ? `Neredeydin? ${s} saniye yoktun! Bu hiç hoş değil.` : `Hey! ${s} saniye uzaktaydın. Hadi, odaklan!`);
    };
    document.addEventListener('visibilitychange', onVis);
    body.querySelector('.f-stop').addEventListener('click', () => { if (confirm('Odak oturumu erken bitirilsin mi?')) finish(false); });
    function finish(full) {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis); onVis = null;
      const mins = Math.round((total - left) / 60);
      if (mins > 0) { stat('focusMin', mins); addXP(mins * 2 + (full && escapes === 0 ? 20 : 0), 'Odak modu'); }
      if (full && escapes === 0) { applyEvent(t.id, 'deneme_iyi'); stage.react('deneme_iyi', 9000); }
      else stage.react(full ? 'deneme_orta' : 'hayal_kirikligi');
      const msg = full ? (escapes === 0 ? `Mükemmel! ${mins} dakika hiç kaçmadan çalıştın. Gurur duydum!` : `${mins} dakika bitti ama ${escapes} kez kaçtın. Bir dahakine daha iyi!`) : `Erken bitirdin. ${mins} dakika çalıştık.`;
      stage.say(msg);
      body.innerHTML = `<div class="result card-in"><div class="big-emoji">${full && !escapes ? '🏆' : full ? '👍' : '⏹'}</div><h3>${esc(msg)}</h3><p class="muted">+${mins * 2 + (full && escapes === 0 ? 20 : 0)} XP · Toplam odak: ${getProg().stats.focusMin || 0} dk</p><div class="row center"><button class="btn primary again">Yeni oturum</button></div></div>`;
      body.querySelector('.again').addEventListener('click', setup);
    }
  }
  setup();
}

// ---------- Hata defteri (karışık) ----------
function hata() {
  const due = dueMistakes();
  const first = due[0] ? teacherById(due[0].teacherId) : TEACHERS[0];
  view.innerHTML = `<section class="room"><div class="room-stage"></div><div class="room-main"><div class="room-body"><div class="o-body"></div></div></div></section>`;
  const stage = createStage(view.querySelector('.room-stage'), first || TEACHERS[0]);
  stage.setVoice(S.getSettings().voice);
  const body = view.querySelector('.o-body');
  let quiz = null;
  current = { destroy() { quiz && quiz.destroy(); stage.destroy(); } };
  const all = allMistakes();
  if (!due.length) {
    body.innerHTML = `<div class="empty card-in"><div class="big-emoji">📒✨</div><b>Bugün tekrar edilecek soru yok!</b><p class="muted">Defterde ${all.length} soru var. Yanlış yaptığın sorular, unutmadan önce tam zamanında burada karşına çıkar.</p><button class="btn primary" data-go="home">Ana sayfa</button></div>`;
    stage.say('Defter bugün temiz. Aferin!');
    return;
  }
  body.innerHTML = `<div class="card-in"><h2>📒 Hata defteri</h2><p class="muted">Bugün ${due.length} soru seni bekliyor. Her doğru, soruyu bir sonraki kutuya taşır; 5 kutuyu geçen soru öğrenilmiş sayılır.</p><button class="btn primary big go">Başla →</button></div>`;
  stage.say(`Bugün defterde ${due.length} soru var. Hadi şunları bitirelim!`);
  body.querySelector('.go').addEventListener('click', () => {
    quiz = runQuiz(body, stage, due.slice(0, 20).map(x => ({ ...x.q, mistakeId: x.id, teacherId: x.teacherId })), {
      timePer: 90, title: 'Hata defteri', review: true,
      onDone: ({ correct, total }) => {
        stage.react(correct / total >= 0.7 ? 'deneme_iyi' : 'deneme_orta', 8000);
        stage.say(`${total} sorudan ${correct} tanesini bu sefer doğru yaptın!`);
        body.innerHTML = `<div class="result card-in"><div class="score-ring" style="--p:${Math.round(correct / total * 100)};--tc:#22c55e"><div><b>${correct}/${total}</b><small>düzeldi</small></div></div><div class="row center"><button class="btn primary" data-go="gelisim">Gelişimime bak</button></div></div>`;
      },
    });
  });
}

// ---------- Gelişim ----------
function gelisim() {
  const pr = getProg(), lv = levelOf(pr.xp), lvFrom = xpForLevel(lv), lvTo = xpForLevel(lv + 1);
  const days = lastDays(7), maxD = Math.max(50, ...days.map(d => d.xp));
  const weak = weakTopics(8), due = dueMistakes().length, all = allMistakes().length;
  const res = S.getResults().slice(0, 8);
  view.innerHTML = `
  <div class="page">
    <header class="page-head"><div><h1>Gelişimin</h1><p class="muted">Seviyen, serin, rozetlerin ve konu karnen.</p></div></header>
    <div class="dev-grid">
      <section class="card lvl-card">
        <div class="lvl big"><div class="lvl-badge">${lv}</div><div class="grow"><h2>${esc(levelName(lv))}</h2><div class="bar"><i style="width:${Math.min(100, (pr.xp - lvFrom) / (lvTo - lvFrom) * 100)}%;background:linear-gradient(90deg,#a78bfa,#6d5efc)"></i></div><small class="muted">Toplam ${pr.xp} XP · ${lvTo - pr.xp} XP sonra seviye ${lv + 1}</small></div></div>
        <div class="stats4"><div><b>🔥 ${currentStreak(pr)}</b><small>gün seri</small></div><div><b>🏆 ${pr.best || 0}</b><small>en uzun seri</small></div><div><b>🎯 ${pr.stats.correct || 0}</b><small>doğru</small></div><div><b>🧘 ${pr.stats.focusMin || 0}</b><small>dk odak</small></div></div>
      </section>
      <section class="card">
        <h3>Son 7 gün</h3>
        <div class="chart">${days.map(d => `<div class="col"><span class="v">${d.xp || ''}</span><i style="height:${Math.max(3, d.xp / maxD * 100)}%"></i><small>${d.d.toLocaleDateString('tr-TR', { weekday: 'short' })}</small></div>`).join('')}</div>
      </section>
      <section class="card">
        <h3>📒 Hata defteri</h3>
        <div class="row"><div class="big-num"><b>${due}</b><small>bugün</small></div><div class="big-num"><b>${all}</b><small>toplam</small></div><div class="big-num"><b>${pr.stats.fixed || 0}</b><small>öğrenildi</small></div></div>
        <button class="btn primary" data-go="hata" ${due ? '' : 'disabled'} style="margin-top:12px">Bugünkü tekrarı çöz →</button>
      </section>
      <section class="card">
        <h3>🎯 Çalışman gereken konular</h3>
        ${weak.length ? `<div class="mastery">${weak.map(w => { const t = teacherById(w.teacherId); return `<div class="ms" style="--tc:${t?.color}"><span>${t?.icon || ''} ${esc(w.topic)}</span><div class="bar"><i style="width:${w.pct}%;background:${w.pct >= 75 ? '#22c55e' : w.pct >= 50 ? '#f59e0b' : '#ef4444'}"></i></div><b>%${w.pct}</b><button class="btn sm ghost" data-room="${w.teacherId}" data-tab="coz">Çalış</button></div>`; }).join('')}</div>` : '<p class="muted">Soru çözdükçe zayıf konuların burada görünecek.</p>'}
      </section>
      <section class="card wide">
        <h3>🏅 Rozetler (${pr.badges.length}/${BADGES.length})</h3>
        <div class="badges">${BADGES.map(b => `<div class="badge-i ${pr.badges.includes(b.id) ? 'on' : ''}" title="${esc(b.d)}"><span>${b.e}</span><b>${esc(b.n)}</b><small>${esc(b.d)}</small></div>`).join('')}</div>
      </section>
      ${res.length ? `<section class="card wide"><h3>Son çalışmalar</h3><ul class="past">${res.map(r => `<li><span>${({ deneme: '📝', soru: '✏️', yazili: '🗒️', tekrar: '🔁', genel: '🌈' })[r.type] || '•'} ${esc(r.subject)}</span><span class="muted small">${esc(r.topic || '')} · ${new Date(r.date).toLocaleDateString('tr-TR')}</span><b>${r.net != null ? r.net + ' net' : '%' + r.score}</b></li>`).join('')}</ul></section>` : ''}
    </div>
  </div>`;
}

// ---------- Ders programı ----------
function schedule() {
  const sch = S.getSchedule();
  const { day, now } = lessonNow();
  view.innerHTML = `
  <div class="page">
    <header class="page-head"><div><h1>Ders Programı</h1><p class="muted">Kutuya dokunup dersi değiştir, saate dokunup saati düzenle. Ders saati gelince robot seni çağırır.</p></div>
    <button class="btn ghost" id="resetSch">Varsayılana dön</button></header>
    <div class="card sched-wrap"><table class="sched">
      <thead><tr><th></th>${DAYS.map((d, i) => `<th class="${i === day ? 'today' : ''}">${d}</th>`).join('')}</tr></thead>
      <tbody>${sch.periods.map((p, i) => `<tr><th class="ptime" data-p="${i}"><b>${i + 1}. ders</b><small>${p[0]}–${p[1]}</small></th>${DAYS.map((_, d) => {
        const tt = teacherById(sch.days[d][i]);
        const isNow = d === day && now && now.i === i;
        return `<td><button class="slot ${tt ? '' : 'empty'} ${isNow ? 'now' : ''}" data-d="${d}" data-p="${i}" style="--tc:${tt ? tt.color : '#94a3b8'}">${tt ? `<span>${tt.icon}</span><b>${esc(tt.subject)}</b><small>${esc(tt.name)}</small>` : '<small>Boş</small>'}</button></td>`;
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
  view.querySelector('#resetSch').addEventListener('click', () => { if (confirm('Program varsayılana dönsün mü?')) { S.remove('schedule'); schedule(); } });
}

// ---------- Yazılı takvimi ----------
function exams() {
  const g = S.getSettings().grade;
  const list = allExams();
  const up = list.filter(e => daysUntil(e.date) >= 0), past = list.filter(e => daysUntil(e.date) < 0);
  const row = e => { const t = teacherById(e.teacher); const d = daysUntil(e.date); return `<li style="--tc:${t ? t.color : '#64748b'}">
    <span class="ex-d ${d >= 0 && d <= 3 ? 'hot' : ''}"><b>${d >= 0 ? d : '✓'}</b><small>${d >= 0 ? 'gün' : 'geçti'}</small></span>
    <span class="grow"><b>${esc(e.title || (t ? t.subject + ' yazılısı' : 'Yazılı'))}</b><small>${fmtDate(e.date)} · ${d >= 0 ? whenText(d) : ''}${e.note ? ' · ' + esc(e.note) : ''}${e.source === 'ortak' ? ' · <span class="badge">MEB ortak yazılı</span>' : ''}</small></span>
    ${t && d >= 0 ? `<button class="btn sm primary" data-room="${t.id}" data-tab="yazili">Hazırlan</button>` : ''}
    ${e.source === 'mine' ? `<button class="icon-btn del" data-id="${e.id}" aria-label="Sil">🗑️</button>` : ''}</li>`; };
  view.innerHTML = `
  <div class="page narrow">
    <header class="page-head"><div><h1>Yazılılar</h1><p class="muted">${g}. sınıf yazılı takvimin. Yazılı yaklaşınca robotun seni uyarır.</p></div>
    <button class="btn primary" id="add">+ Yazılı ekle</button></header>
    <div class="card">${up.length ? `<ul class="ex-list big">${up.map(row).join('')}</ul>` : '<p class="muted">Yaklaşan yazılı yok. Okulundan öğrendiğin tarihleri ekle.</p>'}</div>
    <div class="card info-card">
      <h3>🔎 Tarihleri ve örnek soruları Google'da bul</h3>
      <div class="glinks">
        ${googleLink(`2026-2027 ${g}. sınıf yazılı tarihleri`, 'Yazılı tarihleri')}
        ${googleLink('MEB 2026-2027 ortak yazılı sınav takvimi', 'MEB ortak sınav takvimi')}
        ${googleLink(`${g}. sınıf 1. dönem 1. yazılı soruları ve cevapları`, 'Örnek yazılı soruları')}
        ${googleLink(`MEB ${g}. sınıf ortak sınav örnek sorular`, 'MEB örnek sorular')}
      </div>
      <p class="muted small">Ülke geneli ortak yazılı tarihleri (2026-2027) haberlere göre eklendi: 6., 7., 9. ve 10. sınıflarda Matematik ve Türkçe/Türk Dili ve Edebiyatı. Diğer derslerin tarihlerini okulun belirler; kesin tarih için okulunu ve MEB duyurusunu kontrol et. Bulduğun bir soruyu robotuna fotoğrafla atıp çözdürebilirsin.</p>
    </div>
    ${past.length ? `<div class="card"><h3>Geçmiş</h3><ul class="ex-list">${past.reverse().map(row).join('')}</ul></div>` : ''}
  </div>`;
  view.querySelector('#add').addEventListener('click', () => {
    modal(`<h3>Yazılı ekle</h3>
      <label>Ders <select id="xt">${TEACHERS.map(t => `<option value="${t.id}">${t.icon} ${esc(t.subject)}</option>`).join('')}</select></label>
      <div class="row"><label>Tarih <input type="date" id="xd" value="${S.today()}"></label><label>Tür <select id="xk"><option>1. yazılı</option><option>2. yazılı</option><option>Ortak yazılı</option><option>Deneme sınavı</option><option>Proje/Performans</option></select></label></div>
      <label>Not (ör. konular) <input id="xn" placeholder="Ünite 1-2, sayfa 10-48"></label>
      <button class="btn primary" id="xsave" style="margin-top:12px">Kaydet</button>`, m => {
      m.querySelector('#xsave').addEventListener('click', () => {
        const t = teacherById(m.querySelector('#xt').value);
        const e = { id: 'e' + Date.now(), teacher: t.id, date: m.querySelector('#xd').value, title: `${t.subject} ${m.querySelector('#xk').value}`, note: m.querySelector('#xn').value.trim() };
        if (!e.date) return toast('Tarih seç.');
        S.saveExams([...S.getExams(), e]); m.close(); exams(); toast('📅 Eklendi');
      });
    });
  });
  view.querySelectorAll('.del').forEach(b => b.addEventListener('click', () => { S.saveExams(S.getExams().filter(e => e.id !== b.dataset.id)); exams(); }));
}

// ---------- Genel Tekrar (tüm hocalarla) ----------
function genel() {
  view.innerHTML = `<section class="room genel"><div class="room-stage"></div><div class="room-main"><div class="room-body"><div class="o-body"></div></div></div></section>`;
  const stage = createStage(view.querySelector('.room-stage'), TEACHERS[0]);
  stage.setVoice(S.getSettings().voice);
  const body = view.querySelector('.o-body');
  let quiz = null, dead = false;
  current = { destroy() { dead = true; quiz && quiz.destroy(); stage.destroy(); } };
  const sel = new Set(S.read('genelSel', ['piko', 'hece', 'volt', 'krono']));
  function setup() {
    quiz && quiz.destroy();
    body.innerHTML = `
    <div class="card-in">
      <h2>🌈 Genel Tekrar</h2>
      <p class="muted">Seçtiğin derslerin robotları sırayla sahneye çıkıp sana soru soracak. Her doğru, o robotun sabrını artırır!</p>
      <div class="pick multi">${TEACHERS.map(t => `<button data-id="${t.id}" class="${sel.has(t.id) ? 'on' : ''}" style="--tc:${t.color}"><span>${t.icon}</span>${esc(t.subject)}<small>${esc(t.name)}</small></button>`).join('')}</div>
      <div class="row"><label>Ders başı soru <select class="per"><option>2</option><option selected>3</option><option>4</option></select></label>
      <label>Soru başı süre <select class="tm"><option value="45">45 sn</option><option value="75" selected>75 sn</option><option value="120">2 dk</option></select></label></div>
      <button class="btn primary big go">Genel tekrara başla →</button>
    </div>`;
    body.querySelectorAll('.pick button').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id;
      if (sel.has(id)) sel.delete(id); else sel.add(id);
      S.write('genelSel', [...sel]);
      b.classList.toggle('on', sel.has(id));
      stage.setTeacher(teacherById(id));
      stage.say(sel.has(id) ? `${teacherById(id).name} hazır!` : 'Peki, bu sefer yokum.');
    }));
    body.querySelector('.go').addEventListener('click', () => start(+body.querySelector('.per').value, +body.querySelector('.tm').value));
  }
  async function start(per, time) {
    if (!sel.size) return toast('En az bir ders seç.');
    await aiReady;
    if (!hasAI()) return needAI(body);
    const ts = [...sel].map(teacherById);
    let done = 0;
    body.innerHTML = `<div class="loading"><div class="spinner"></div><b>Robotlar sorularını hazırlıyor…</b><small class="ld">0/${ts.length} ders hazır</small></div>`;
    stage.think(true);
    try {
      const sets = await Promise.all(ts.map(t => llmJSON({ system: quizSystem(t, { count: per, level: 'orta' }), tier: 'default', messages: [{ role: 'user', content: 'Genel tekrar için soruları hazırla.' }] })
        .then(j => { done++; const l = body.querySelector('.ld'); if (l) l.textContent = `${done}/${ts.length} ders hazır`; return (j.sorular || []).filter(q => q.soru && q.secenekler).slice(0, per).map(q => ({ ...q, teacherId: t.id, konu: q.konu || t.subject })); })));
      if (dead) return;
      stage.think(false);
      const qs = [];
      for (let k = 0; k < per; k++) sets.forEach(s => s[k] && qs.push(s[k]));
      if (!qs.length) throw new Error('Sorular hazırlanamadı.');
      quiz = runQuiz(body, stage, qs, { timePer: time, title: 'Genel tekrar', onDone: ({ answers }) => finish(ts, answers) });
    } catch (e) { stage.think(false); if (!dead) errorBox(body, e, setup); }
  }
  function finish(ts, answers) {
    const rows = ts.map(t => { const a = answers.filter(x => x.q.teacherId === t.id); return { t, c: a.filter(x => x.ok).length, n: a.length || 1 }; });
    const total = answers.filter(a => a.ok).length;
    rows.forEach(r => S.addResult({ type: 'genel', teacher: r.t.id, subject: r.t.subject, topic: 'Genel tekrar', correct: r.c, total: r.n, score: Math.round(r.c / r.n * 100) }));
    addXP(25, 'Genel tekrar');
    const best = rows.slice().sort((a, b) => b.c / b.n - a.c / a.n)[0], worst = rows.slice().sort((a, b) => a.c / a.n - b.c / b.n)[0];
    stage.setTeacher(worst.t);
    stage.react(worst.c / worst.n >= 0.6 ? 'deneme_orta' : 'deneme_kotu', 9000);
    stage.say(worst.c / worst.n >= 0.6 ? 'Genel tekrar güzel geçti!' : `En zayıf dersin ${worst.t.subject}. Benimle biraz daha çalışmalısın.`);
    body.innerHTML = `
    <div class="result card-in">
      <h2>🌈 Genel tekrar bitti: ${total}/${answers.length}</h2>
      <div class="g-rows">${rows.map(r => `<div class="g-r" style="--tc:${r.t.color}"><span class="mini face" data-t="${r.t.id}"></span><b>${esc(r.t.subject)}</b><div class="bar"><i style="width:${r.c / r.n * 100}%;background:${r.t.color}"></i></div><span>${r.c}/${r.n}</span><button class="btn sm ghost" data-room="${r.t.id}" data-tab="tekrar">Tekrar et</button></div>`).join('')}</div>
      <p>🏆 En iyi: <b>${esc(best.t.subject)}</b> · 📌 Çalışman gereken: <b>${esc(worst.t.subject)}</b></p>
      <div class="row center"><button class="btn primary again">Yeniden</button></div>
    </div>`;
    body.querySelectorAll('.mini.face').forEach(el => face(el, teacherById(el.dataset.t), { still: true }));
    body.querySelector('.again').addEventListener('click', setup);
  }
  setup();
  stage.say('Genel tekrara hoş geldin! Dersleri seç, robotlar sırayla gelsin.');
}

// ---------- Ayarlar ----------
function settings() {
  const s = S.getSettings();
  const tv = trVoices();
  view.innerHTML = `
  <div class="page narrow">
    <header class="page-head"><div><h1>Ayarlar</h1></div></header>
    <form class="card form" id="sf">
      <h3>👤 Öğrenci</h3>
      <div class="row"><label>Adın <input name="name" value="${esc(s.name)}" placeholder="Adın"></label>
      <label>Sınıfın <select name="grade">${[5, 6, 7, 8, 9, 10, 11, 12].map(g => `<option value="${g}" ${s.grade === g ? 'selected' : ''}>${g}. sınıf</option>`).join('')}</select></label></div>
      <h3>📏 Kurallar ve hedef</h3>
      <div class="row">
        <label>Günlük soru hakkı <input name="dailyLimit" type="number" min="1" max="500" value="${s.dailyLimit}"></label>
        <label>Günlük XP hedefi <input name="dailyGoal" type="number" min="20" max="2000" step="10" value="${s.dailyGoal}"></label>
        <label>Sohbette cevap süresi (sn) <input name="answerTime" type="number" min="10" max="180" value="${s.answerTime}"></label>
      </div>
      <label>Robotların sertliği <select name="strictness">
        <option value="yumusak" ${s.strictness === 'yumusak' ? 'selected' : ''}>Yumuşak — sabırları yavaş azalır</option>
        <option value="normal" ${s.strictness === 'normal' ? 'selected' : ''}>Normal</option>
        <option value="sert" ${s.strictness === 'sert' ? 'selected' : ''}>Sert — sabırları hızlı azalır</option>
      </select></label>
      <h3>🔊 Ses</h3>
      <label class="check"><input type="checkbox" name="voice" ${s.voice ? 'checked' : ''}> Robotlar sesli konuşsun</label>
      <label class="check"><input type="checkbox" name="sfx" ${s.sfx ? 'checked' : ''}> Robot efekt sesleri (bip, doğru/yanlış)</label>
      <label>Genel konuşma hızı <input name="rate" type="range" min="0.7" max="1.4" step="0.05" value="${s.rate}"></label>
      <label class="check"><input type="checkbox" name="reminders" ${s.reminders ? 'checked' : ''}> Ders saati ve yaklaşan yazılılar için uyar</label>
      <div class="row"><button class="btn primary" type="submit">Kaydet</button><button type="button" class="btn ghost" id="test">Yapay zekâyı dene</button></div>
    </form>
    <div class="card form">
      <h3>🎙️ Robot sesleri</h3>
      <p class="muted small">Her robotun kendi perdesi ve hızı var. Tabletinde ${tv.length} Türkçe ses bulundu${tv.length > 1 ? '; robotlara farklı sesler dağıtıldı, istersen değiştir' : ''}. Daha doğal ve farklı sesler için tabletine Türkçe ses indir: <b>iPad</b>: Ayarlar › Erişilebilirlik › Seslendirilen İçerik › Sesler › Türkçe (ör. "Yelda – Geliştirilmiş"). <b>Android</b>: Ayarlar › Metin okuma › Google ses verileri › Türkçe.</p>
      <div class="voices">${TEACHERS.map(t => `<div class="vrow" style="--tc:${t.color}"><span class="mini face" data-t="${t.id}"></span><b>${esc(t.name)}</b>
        ${tv.length > 1 ? `<select data-v="${t.id}"><option value="">Otomatik</option>${tv.map(v => `<option value="${esc(v.voiceURI)}" ${s.voiceMap[t.id] === v.voiceURI ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>` : '<span class="muted small grow">perde ' + t.voice.pitch + ' · hız ' + t.voice.rate + '</span>'}
        <button type="button" class="btn sm ghost" data-listen="${t.id}">▶ Dinle</button></div>`).join('')}</div>
    </div>
    <details class="card form adv"><summary>🤖 Yapay zekâ (gelişmiş)</summary>
      <p class="muted small">Uygulama Claude linkinden açıldığında robotlar senin Claude hesabınla çalışır, anahtar gerekmez. Başka bir yerden (kendi adresinde) açıyorsan buraya bir Claude API anahtarı girebilirsin (yalnızca bu cihazda saklanır). Kendi adresinde açıldığında gerçek mikrofonla eller serbest sohbet de çalışır.</p>
      <label>API anahtarı <input id="apiKey" type="password" value="${esc(s.apiKey)}" placeholder="sk-ant-..." autocomplete="off"></label>
      <label>Sohbet modeli <select id="model">${[['claude-haiku-5-5', 'Haiku 5.5 — en hızlı'], ['claude-sonnet-5-5', 'Sonnet 5.5 — daha akıllı']].map(([v, l]) => `<option value="${v}" ${s.model === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <button type="button" class="btn ghost" id="saveKey">Kaydet</button>
    </details>
    <div class="card form">
      <h3>🧹 Veriler</h3>
      <div class="row"><button class="btn ghost" id="resetMood">Robotların sabrını sıfırla</button><button class="btn ghost" id="resetAll">Her şeyi sil</button></div>
    </div>
  </div>`;
  view.querySelectorAll('.mini.face[data-t]').forEach(el => face(el, teacherById(el.dataset.t), { still: true }));
  const f = view.querySelector('#sf');
  const collect = () => {
    const d = new FormData(f), cur = S.getSettings();
    return { ...cur, name: d.get('name').trim(), grade: +d.get('grade'),
      dailyLimit: Math.max(1, +d.get('dailyLimit') || 30), dailyGoal: Math.max(20, +d.get('dailyGoal') || 100), answerTime: Math.max(10, +d.get('answerTime') || 30),
      strictness: d.get('strictness'), voice: !!d.get('voice'), sfx: !!d.get('sfx'), rate: +d.get('rate'), reminders: !!d.get('reminders') };
  };
  f.addEventListener('submit', e => { e.preventDefault(); S.saveSettings(collect()); toast('✅ Kaydedildi'); });
  view.querySelectorAll('[data-v]').forEach(sel => sel.addEventListener('change', () => { const cur = S.getSettings(); cur.voiceMap = { ...cur.voiceMap, [sel.dataset.v]: sel.value }; S.saveSettings(cur); }));
  view.querySelectorAll('[data-listen]').forEach(b => b.addEventListener('click', () => { unlockAudio(); S.saveSettings(collect()); const t = teacherById(b.dataset.listen); speak(`Merhaba, ben ${t.name}! ${t.tagline}`, t.voice); }));
  view.querySelector('#test').addEventListener('click', async e => {
    S.saveSettings(collect());
    e.target.disabled = true; e.target.textContent = 'Deneniyor…';
    try { const r = await testConnection(); toast('✅ Bağlı! ' + r.slice(0, 80)); } catch (err) { toast('❌ ' + err.message, 6000); }
    e.target.disabled = false; e.target.textContent = 'Yapay zekâyı dene';
  });
  view.querySelector('#saveKey').addEventListener('click', () => { const cur = S.getSettings(); cur.apiKey = view.querySelector('#apiKey').value.trim(); cur.model = view.querySelector('#model').value; S.saveSettings(cur); toast('✅ Kaydedildi'); });
  view.querySelector('#resetMood').addEventListener('click', () => { resetPatience(); toast('Robotlar sakinleşti 😌'); });
  view.querySelector('#resetAll').addEventListener('click', () => { if (confirm('Tüm ayarlar, program, yazılılar, XP ve geçmiş silinsin mi?')) { S.resetAll(); toast('Silindi'); settings(); } });
}

// ---------- XP / seviye / rozet bildirimleri ----------
document.addEventListener('xp', e => {
  const { n, levelUp, badges } = e.detail;
  if (n > 0) {
    const el = document.createElement('div');
    el.className = 'xp-pop'; el.textContent = `+${n} XP`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }
  (badges || []).forEach((b, i) => setTimeout(() => { toast(`🏅 Yeni rozet: ${b.e} ${b.n}`); SFX.level(); }, 400 + i * 900));
  if (levelUp) {
    SFX.level();
    modal(`<div class="lvlup"><div class="confetti">${'🎉✨⭐🎊'.repeat(4).split('').map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</div><div class="lvl-badge xl">${levelUp}</div><h2>Seviye atladın!</h2><p>Artık <b>${esc(levelName(levelUp))}</b> seviyesindesin.</p></div>`);
  }
});

// ---------- Hatırlatıcılar ----------
let lastLessonKey = null;
function remindPopup(t, line, btnText, onGo, emotion) {
  modal(`<div class="remind" style="--tc:${t.color}"><div class="face remind-face"></div><h3>${esc(t.name)}</h3><p>“${esc(line)}”</p><button class="btn primary big" id="goR">${esc(btnText)}</button></div>`, m => {
    const f = new Face(m.querySelector('.remind-face'), t.look, { emotion, led: patienceColor(getPatience(t.id)) });
    m.addEventListener('close', () => f.destroy());
    m.querySelector('#goR').addEventListener('click', () => { m.close(); onGo(); });
    if (S.getSettings().voice) { f.setSpeaking(true); speak(line, t.voice, { onboundary: () => f.boundary(), onend: () => f.setSpeaking(false) }); }
  });
}
function checkLesson(initial) {
  const { now, day } = lessonNow();
  const key = now ? `${S.today()}-${day}-${now.i}` : null;
  if (key === lastLessonKey) return;
  lastLessonKey = key;
  if (initial || !now || !S.getSettings().reminders) return;
  if (current && current.teacherId === now.teacher) return;
  const t = teacherById(now.teacher);
  const p = getPatience(t.id);
  remindPopup(t, `${t.subject} dersi başladı! Neredesin? Hemen derse gel.`, 'Derse gir →', () => go('room', t.id), p >= 50 ? 'suphe' : 'kizgin');
}
function checkExams() {
  if (!S.getSettings().reminders) return;
  const seen = S.read('examWarned', {});
  const e = upcoming().find(x => daysUntil(x.date) <= 3 && seen[x.id] !== S.today());
  if (!e || !teacherById(e.teacher)) return;
  seen[e.id] = S.today(); S.write('examWarned', seen);
  const t = teacherById(e.teacher), d = daysUntil(e.date);
  remindPopup(t, d === 0 ? `Bugün ${t.subject} yazılın var! Son bir tekrar yapalım mı?` : `${t.subject} yazılına ${d} gün kaldı! Hadi birlikte hazırlanalım.`, 'Hazırlan →', () => go('room', t.id, 'yazili'), 'endiseli');
}

// ---------- Başlangıç ----------
document.addEventListener('click', e => {
  const r = e.target.closest('[data-room]'); if (r) { unlockAudio(); return go('room', r.dataset.room, r.dataset.tab); }
  const g = e.target.closest('[data-go], .nav button[data-view]'); if (g) { const m = g.closest('dialog'); m && m.close(); return go(g.dataset.go || g.dataset.view); }
});
document.addEventListener('pointerdown', () => unlockAudio(), { once: true });

function route() {
  const [h, a1, a2] = (location.hash.slice(1) || 'home').split('/');
  go(Object.keys(VIEWS()).includes(h) ? h : 'home', a1, a2);
}
window.addEventListener('hashchange', route);
route();
checkLesson(true);
setTimeout(checkExams, 1500);
setInterval(() => checkLesson(false), 20000);
setInterval(() => { if (document.body.dataset.view === 'home' && !document.querySelector('dialog')) go('home'); }, 120000);
if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.claude) navigator.serviceWorker.register('sw.js').catch(() => {});
