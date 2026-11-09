import { Face, EMOTIONS } from './face.js';
import { TEACHERS, teacherById } from './teachers.js';
import * as S from './storage.js';
import { getPatience, baseEmotion, patienceColor, MOOD_SCALE, resetPatience } from './mood.js';
import { mountRoom } from './room.js';
import { createStage } from './stage.js';
import { runQuiz } from './quiz.js';
import { llmJSON, hasAI, aiReady, testConnection } from './ai.js';
import { quizSystem } from './prompts.js';
import { allExams, upcoming, daysUntil, whenText } from './exams.js';
import { speak, unlockAudio } from './speech.js';
import { esc, toast, modal, googleLink, needAI, errorBox } from './ui.js';

const view = document.getElementById('view');
const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
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
export function go(name, ...args) {
  cleanup();
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.body.dataset.view = name;
  view.scrollTop = 0;
  const views = { home, schedule, teachers, exams, genel, settings, room };
  (views[name] || home)(...args);
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

// ---------- Ana sayfa ----------
function home() {
  const st = S.getSettings(), u = S.getUsage();
  const { now, next, list, day } = lessonNow();
  const hr = new Date().getHours();
  const hello = hr < 6 ? 'İyi geceler' : hr < 12 ? 'Günaydın' : hr < 18 ? 'İyi günler' : 'İyi akşamlar';
  const focus = now || next;
  const ft = focus ? teacherById(focus.teacher) : TEACHERS[new Date().getDate() % TEACHERS.length];
  const rem = Math.max(0, st.dailyLimit - u.used);
  const exs = upcoming(3);
  const results = S.getResults().slice(0, 4);

  view.innerHTML = `
  <div class="page">
    <header class="page-head">
      <div><h1>${hello}${st.name ? ', ' + esc(st.name) : ''} 👋</h1>
      <p class="muted">${new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} · ${st.grade}. sınıf</p></div>
      <span class="tag ai-tag">…</span>
    </header>
    <div class="home-grid">
      <section class="card hero" style="--tc:${ft.color}">
        <div class="hero-face face"></div>
        <div class="hero-body">
          <span class="kicker">${now ? '🔴 ŞU AN DERSTE' : focus ? '⏭ SIRADAKİ DERS' : day > 4 ? '🎉 HAFTA SONU' : '✅ BUGÜNLÜK DERSLER BİTTİ'}</span>
          <h2>${ft.icon} ${esc(ft.subject)}</h2>
          <p>${esc(ft.name)}${focus ? ` · ${focus.start}–${focus.end}` : ' · serbest çalışma'}</p>
          <p class="say">Sabrı ${getPatience(ft.id)} · ${EMOTIONS[baseEmotion(getPatience(ft.id))].label}</p>
          <div class="row">
            <button class="btn primary big" data-room="${ft.id}">Derse gir →</button>
            <button class="btn ghost" data-room="${ft.id}" data-tab="sor">📷 Soru at</button>
          </div>
        </div>
      </section>
      <section class="card limit-card">
        <h3>Günlük soru hakkı</h3>
        <div class="donut" style="--p:${Math.round(u.used / st.dailyLimit * 100)}"><div><b>${rem}</b><small>/${st.dailyLimit} kaldı</small></div></div>
        ${rem === 0 ? '<p class="alert red">⛔ Bugünlük hakkın bitti. Yarın görüşürüz!</p>' : rem <= 5 ? `<p class="alert amber">⚠️ Sadece ${rem} hakkın kaldı!</p>` : '<p class="muted small">Hocaya sorduğun her soru 1 hak. Soru çözmek, deneme ve tekrar hak harcamaz.</p>'}
        <div class="stats"><div><b class="g">${u.correct}</b><small>Doğru</small></div><div><b class="r">${u.wrong}</b><small>Yanlış</small></div><div><b class="a">${u.silent}</b><small>Sessiz</small></div></div>
      </section>
      <section class="card quick">
        <h3>Hızlı başla</h3>
        <div class="quick-grid">
          <button class="qa" data-act="sor"><span>📷</span><b>Soru at</b><small>Fotoğrafını çek, çözsün</small></button>
          <button class="qa" data-act="coz"><span>✏️</span><b>Soru çöz</b><small>Hoca sorsun, sen çöz</small></button>
          <button class="qa" data-act="deneme"><span>📝</span><b>Deneme</b><small>Süreli deneme sınavı</small></button>
          <button class="qa" data-act="genel"><span>🔁</span><b>Genel tekrar</b><small>Tüm hocalarla</small></button>
        </div>
      </section>
      <section class="card exams-card">
        <h3>Yaklaşan yazılılar</h3>
        ${exs.length ? `<ul class="ex-list">${exs.map(e => { const t = teacherById(e.teacher); const d = daysUntil(e.date); return `<li style="--tc:${t ? t.color : '#64748b'}"><span class="ex-d ${d <= 3 ? 'hot' : ''}"><b>${d}</b><small>gün</small></span><span><b>${esc(e.title || (t ? t.subject + ' yazılısı' : 'Yazılı'))}</b><small>${fmtDate(e.date)}${e.source === 'ortak' ? ' · MEB ortak' : ''}</small></span>${t ? `<button class="btn sm primary" data-room="${t.id}" data-tab="yazili">Hazırlan</button>` : ''}</li>`; }).join('')}</ul>` : '<p class="muted">Takvimde yazılı yok.</p>'}
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
      </section>
      <section class="card moods">
        <h3>Hocaların sabrı</h3>
        <div class="mood-row">${TEACHERS.map(tt => { const p = getPatience(tt.id); return `<button class="mood-item" data-room="${tt.id}"><span class="mini face" data-t="${tt.id}"></span><small>${esc(tt.name)}</small><i style="background:${patienceColor(p)}">${p}</i></button>`; }).join('')}</div>
        ${results.length ? `<h3 style="margin-top:16px">Son çalışmaların</h3><ul class="past">${results.map(r => `<li><span>${({ deneme: '📝', soru: '✏️', yazili: '🗒️', tekrar: '🔁', genel: '🌈' })[r.type] || '•'} ${esc(r.subject)}</span><span class="muted small">${esc(r.topic || '')}</span><b>${r.net != null ? r.net + ' net' : '%' + r.score}</b></li>`).join('')}</ul>` : ''}
      </section>
    </div>
  </div>`;
  face(view.querySelector('.hero-face'), ft, { emotion: now ? (getPatience(ft.id) < 50 ? 'kizgin' : 'suphe') : undefined });
  view.querySelectorAll('.mini.face').forEach(el => face(el, teacherById(el.dataset.t), { still: true }));
  view.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'genel') return go('genel');
    pickTeacher({ sor: 'Soruyu hangi hocaya atalım?', coz: 'Hangi dersten soru çözelim?', deneme: 'Hangi dersten deneme?' }[a], id => go('room', id, a));
  }));
  const tag = view.querySelector('.ai-tag');
  aiReady.then(() => { tag.className = 'tag ' + (hasAI() ? 'ok' : 'warn'); tag.textContent = hasAI() ? '🤖 Yapay zekâ bağlı' : '📴 Çevrimdışı mod'; });
}

// ---------- Ders programı ----------
function schedule() {
  const sch = S.getSchedule();
  const { day, now } = lessonNow();
  view.innerHTML = `
  <div class="page">
    <header class="page-head"><div><h1>Ders Programı</h1><p class="muted">Kutuya dokunup dersi değiştir, saate dokunup saati düzenle.</p></div>
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
  view.querySelector('#resetSch').addEventListener('click', () => { if (confirm('Program varsayılana dönsün mü?')) { S.remove('schedule'); schedule(); } });
}

// ---------- Hocalar ----------
function teachers() {
  view.innerHTML = `
  <div class="page">
    <header class="page-head"><div><h1>Robot Hocalar</h1><p class="muted">Her hocanın bir sabrı var. Yüz ifadesi sabrına göre değişir — rastgele değil.</p></div></header>
    <div class="card legend">
      <b>Sabır → ifade</b>
      <div class="scale">${MOOD_SCALE.map(([min, e], i) => `<span style="--c:${patienceColor(min)}">${EMOTIONS[e].emoji} ${min}${i === 0 ? '+' : '–' + (MOOD_SCALE[i - 1][0] - 1)} <small>${EMOTIONS[e].label}</small></span>`).join('')}</div>
      <p class="muted small">✅ Doğru cevap ve güzel sonuçlar sabrı artırır. ❌ Yanlış, ⏰ cevap vermemek ve kabalık düşürür. Zamanla kendiliğinden sakinleşirler.</p>
    </div>
    <div class="t-grid">${TEACHERS.map(tt => {
      const p = getPatience(tt.id), e = baseEmotion(p);
      return `<article class="card t-card" style="--tc:${tt.color}">
        <div class="t-face face" data-t="${tt.id}"></div>
        <span class="t-emo">${EMOTIONS[e].emoji} ${EMOTIONS[e].label}</span>
        <h3>${esc(tt.name)}</h3><p class="subj">${tt.icon} ${esc(tt.subject)}</p>
        <p class="muted small">${esc(tt.tagline)}</p>
        <div class="meter sm"><span>Sabır</span><div class="bar"><i style="width:${p}%;background:${patienceColor(p)}"></i></div><b>${p}</b></div>
        <button class="btn primary" data-room="${tt.id}">Derse gir</button>
      </article>`;
    }).join('')}</div>
  </div>`;
  view.querySelectorAll('.t-face').forEach(el => face(el, teacherById(el.dataset.t)));
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
    <header class="page-head"><div><h1>Yazılılar</h1><p class="muted">${g}. sınıf yazılı takvimin. Yazılı yaklaşınca hocan seni uyarır.</p></div>
    <button class="btn primary" id="add">+ Yazılı ekle</button></header>
    <div class="card">
      ${up.length ? `<ul class="ex-list big">${up.map(row).join('')}</ul>` : '<p class="muted">Yaklaşan yazılı yok. Okulundan öğrendiğin tarihleri ekle.</p>'}
    </div>
    <div class="card info-card">
      <h3>🔎 Tarihleri ve örnek soruları Google'da bul</h3>
      <div class="glinks">
        ${googleLink(`2026-2027 ${g}. sınıf yazılı tarihleri`, 'Yazılı tarihleri')}
        ${googleLink('MEB 2026-2027 ortak yazılı sınav takvimi', 'MEB ortak sınav takvimi')}
        ${googleLink(`${g}. sınıf 1. dönem 1. yazılı soruları ve cevapları`, 'Örnek yazılı soruları')}
        ${googleLink(`MEB ${g}. sınıf ortak sınav örnek sorular`, 'MEB örnek sorular')}
      </div>
      <p class="muted small">Ülke geneli ortak yazılı tarihleri (2026-2027) haberlere göre eklendi: 6., 7., 9. ve 10. sınıflarda Matematik ve Türkçe/Türk Dili ve Edebiyatı. Diğer derslerin yazılı tarihlerini okulun belirler. Kesin tarih için okulunu ve MEB duyurusunu kontrol et. Bulduğun bir soruyu hocana fotoğrafla atıp çözdürebilirsin.</p>
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
  view.innerHTML = `
  <section class="room genel">
    <div class="room-stage"></div>
    <div class="room-main"><div class="room-body"><div class="g-body"></div></div></div>
  </section>`;
  const stage = createStage(view.querySelector('.room-stage'), TEACHERS[0]);
  const body = view.querySelector('.g-body');
  let quiz = null, dead = false;
  current = { destroy() { dead = true; quiz && quiz.destroy(); stage.destroy(); } };
  const sel = new Set(['piko', 'hece', 'volt', 'krono']);
  function setup() {
    quiz && quiz.destroy();
    body.innerHTML = `
    <div class="card-in">
      <h2>🌈 Genel Tekrar</h2>
      <p class="muted">Seçtiğin derslerin hocaları sırayla sahneye çıkıp sana soru soracak. Her doğru cevap o hocanın sabrını artırır!</p>
      <div class="pick multi">${TEACHERS.map(t => `<button data-id="${t.id}" class="${sel.has(t.id) ? 'on' : ''}" style="--tc:${t.color}"><span>${t.icon}</span>${esc(t.subject)}<small>${esc(t.name)}</small></button>`).join('')}</div>
      <div class="row"><label>Ders başı soru <select class="per"><option>2</option><option selected>3</option><option>4</option></select></label>
      <label>Soru başı süre <select class="tm"><option value="45">45 sn</option><option value="75" selected>75 sn</option><option value="120">2 dk</option></select></label></div>
      <button class="btn primary big go">Genel tekrara başla →</button>
    </div>`;
    body.querySelectorAll('.pick button').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id;
      if (sel.has(id)) sel.delete(id); else sel.add(id);
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
    body.innerHTML = `<div class="loading"><div class="spinner"></div><b>Hocalar sorularını hazırlıyor…</b><small class="ld">0/${ts.length} ders hazır</small></div>`;
    stage.think(true);
    try {
      const sets = await Promise.all(ts.map(t => llmJSON({ system: quizSystem(t, { count: per, level: 'orta' }), tier: 'default', messages: [{ role: 'user', content: 'Genel tekrar için soruları hazırla.' }] })
        .then(j => { done++; const l = body.querySelector('.ld'); if (l) l.textContent = `${done}/${ts.length} ders hazır`; return (j.sorular || []).filter(q => q.soru && q.secenekler).slice(0, per).map(q => ({ ...q, teacherId: t.id, konu: t.subject })); })));
      if (dead) return;
      stage.think(false);
      const qs = [];
      for (let k = 0; k < per; k++) sets.forEach(s => s[k] && qs.push(s[k]));
      if (!qs.length) throw new Error('Sorular hazırlanamadı.');
      quiz = runQuiz(body, stage, qs, { timePer: time, title: 'Genel tekrar', onDone: ({ answers }) => finish(ts, answers) });
    } catch (e) { stage.think(false); if (!dead) errorBox(body, e, setup); }
  }
  function finish(ts, answers) {
    const rows = ts.map(t => { const a = answers.filter(x => x.q.teacherId === t.id); return { t, c: a.filter(x => x.ok).length, n: a.length }; });
    const total = answers.filter(a => a.ok).length;
    rows.forEach(r => S.addResult({ type: 'genel', teacher: r.t.id, subject: r.t.subject, topic: 'Genel tekrar', correct: r.c, total: r.n, score: Math.round(r.c / r.n * 100) }));
    const best = rows.slice().sort((a, b) => b.c / b.n - a.c / a.n)[0], worst = rows.slice().sort((a, b) => a.c / a.n - b.c / b.n)[0];
    stage.setTeacher(worst.t);
    stage.react(worst.c / worst.n >= 0.6 ? 'deneme_orta' : 'deneme_kotu', 9000);
    stage.say(worst.c / worst.n >= 0.6 ? 'Genel tekrar güzel geçti!' : `En zayıf dersin ${worst.t.subject}. Benimle biraz daha çalışmalısın.`);
    body.innerHTML = `
    <div class="result card-in">
      <h2>🌈 Genel tekrar bitti: ${total}/${answers.length}</h2>
      <div class="g-rows">${rows.map(r => `<div class="g-r" style="--tc:${r.t.color}"><span class="mini face" data-t="${r.t.id}"></span><b>${esc(r.t.subject)}</b><div class="bar"><i style="width:${r.c / r.n * 100}%;background:${r.t.color}"></i></div><span>${r.c}/${r.n}</span><button class="btn sm ghost" data-room="${r.t.id}" data-tab="tekrar">Tekrar et</button></div>`).join('')}</div>
      <p>🏆 En iyi: <b>${esc(best.t.subject)}</b> · 📌 Çalışman gereken: <b>${esc(worst.t.subject)}</b></p>
      <div class="row"><button class="btn primary again">Yeniden</button></div>
    </div>`;
    body.querySelectorAll('.mini.face').forEach(el => face(el, teacherById(el.dataset.t), { still: true }));
    body.querySelector('.again').addEventListener('click', setup);
  }
  setup();
  stage.say('Genel tekrara hoş geldin! Dersleri seç, hocalar sırayla gelsin.');
}

// ---------- Ayarlar ----------
function settings() {
  const s = S.getSettings();
  view.innerHTML = `
  <div class="page narrow">
    <header class="page-head"><div><h1>Ayarlar</h1></div></header>
    <form class="card form" id="sf">
      <h3>👤 Öğrenci</h3>
      <div class="row"><label>Adın <input name="name" value="${esc(s.name)}" placeholder="Adın"></label>
      <label>Sınıfın <select name="grade">${[5, 6, 7, 8, 9, 10, 11, 12].map(g => `<option value="${g}" ${s.grade === g ? 'selected' : ''}>${g}. sınıf</option>`).join('')}</select></label></div>
      <h3>📏 Kurallar</h3>
      <div class="row">
        <label>Günlük soru hakkı <input name="dailyLimit" type="number" min="1" max="500" value="${s.dailyLimit}"></label>
        <label>Ders modunda cevap süresi (sn) <input name="answerTime" type="number" min="10" max="180" value="${s.answerTime}"></label>
      </div>
      <label>Hocaların sertliği <select name="strictness">
        <option value="yumusak" ${s.strictness === 'yumusak' ? 'selected' : ''}>Yumuşak — sabırları yavaş azalır</option>
        <option value="normal" ${s.strictness === 'normal' ? 'selected' : ''}>Normal</option>
        <option value="sert" ${s.strictness === 'sert' ? 'selected' : ''}>Sert — sabırları hızlı azalır</option>
      </select></label>
      <h3>🔊 Ses & uyarılar</h3>
      <label class="check"><input type="checkbox" name="voice" ${s.voice ? 'checked' : ''}> Hocalar sesli konuşsun</label>
      <label>Konuşma hızı <input name="rate" type="range" min="0.7" max="1.4" step="0.05" value="${s.rate}"></label>
      <label class="check"><input type="checkbox" name="reminders" ${s.reminders ? 'checked' : ''}> Ders saati ve yaklaşan yazılılar için uyar</label>
      <details class="adv"><summary>🤖 Yapay zekâ (gelişmiş)</summary>
        <p class="muted small">Uygulamayı Claude linkinden açtığında hocalar senin Claude hesabınla çalışır, anahtar gerekmez. Başka bir yerden açıyorsan buraya bir Claude API anahtarı girebilirsin (yalnızca bu cihazda saklanır).</p>
        <label>API anahtarı <input name="apiKey" type="password" value="${esc(s.apiKey)}" placeholder="sk-ant-..." autocomplete="off"></label>
        <label>Sohbet modeli <select name="model">${[['claude-haiku-5-5', 'Haiku 5.5 — en hızlı'], ['claude-sonnet-5-5', 'Sonnet 5.5 — daha akıllı']].map(([v, l]) => `<option value="${v}" ${s.model === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </details>
      <div class="row"><button class="btn primary" type="submit">Kaydet</button><button type="button" class="btn ghost" id="test">Bağlantıyı dene</button><button type="button" class="btn ghost" id="voiceTest">Sesi dene</button></div>
    </form>
    <div class="card form">
      <h3>🧹 Veriler</h3>
      <div class="row"><button class="btn ghost" id="resetMood">Hocaların sabrını sıfırla</button><button class="btn ghost" id="resetAll">Her şeyi sil</button></div>
    </div>
  </div>`;
  const f = view.querySelector('#sf');
  const collect = () => {
    const d = new FormData(f);
    return { ...s, name: d.get('name').trim(), grade: +d.get('grade'), apiKey: (d.get('apiKey') || '').trim(), model: d.get('model'),
      dailyLimit: Math.max(1, +d.get('dailyLimit') || 30), answerTime: Math.max(10, +d.get('answerTime') || 30),
      strictness: d.get('strictness'), voice: !!d.get('voice'), rate: +d.get('rate'), reminders: !!d.get('reminders') };
  };
  f.addEventListener('submit', e => { e.preventDefault(); S.saveSettings(collect()); toast('✅ Kaydedildi'); });
  view.querySelector('#test').addEventListener('click', async e => {
    S.saveSettings(collect());
    e.target.disabled = true; e.target.textContent = 'Deneniyor…';
    try { const r = await testConnection(); toast('✅ Bağlı! Hoca diyor ki: ' + r.slice(0, 80)); } catch (err) { toast('❌ ' + err.message, 6000); }
    e.target.disabled = false; e.target.textContent = 'Bağlantıyı dene';
  });
  view.querySelector('#voiceTest').addEventListener('click', () => { unlockAudio(); speak('Bip bop! Ben senin robot hocanım. Derse hazır mısın?', { pitch: 1.3, rate: +f.rate.value }); });
  view.querySelector('#resetMood').addEventListener('click', () => { resetPatience(); toast('Hocalar sakinleşti 😌'); });
  view.querySelector('#resetAll').addEventListener('click', () => { if (confirm('Tüm ayarlar, program, yazılılar ve geçmiş silinsin mi?')) { S.resetAll(); toast('Silindi'); settings(); } });
}

// ---------- Hatırlatıcılar ----------
let lastLessonKey = null;
function remindPopup(t, line, btnText, onGo, emotion) {
  modal(`<div class="remind" style="--tc:${t.color}"><div class="face remind-face"></div><h3>${esc(t.name)}</h3><p>“${esc(line)}”</p><button class="btn primary big" id="goR">${esc(btnText)}</button></div>`, m => {
    const f = new Face(m.querySelector('.remind-face'), t.look, { emotion, led: patienceColor(getPatience(t.id)) });
    m.addEventListener('close', () => f.destroy());
    m.querySelector('#goR').addEventListener('click', () => { m.close(); onGo(); });
    if (S.getSettings().voice) { f.setSpeaking(true); speak(line, t.voice, { onend: () => f.setSpeaking(false) }); }
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
  const g = e.target.closest('[data-go], .nav button[data-view]'); if (g) return go(g.dataset.go || g.dataset.view);
});
document.addEventListener('pointerdown', () => unlockAudio(), { once: true });

const [h, a1, a2] = (location.hash.slice(1) || 'home').split('/');
go(['home', 'schedule', 'teachers', 'exams', 'genel', 'settings', 'room'].includes(h) ? h : 'home', a1, a2);
checkLesson(true);
setTimeout(checkExams, 1500);
setInterval(() => checkLesson(false), 20000);
setInterval(() => { if (document.body.dataset.view === 'home' && !document.querySelector('dialog')) go('home'); }, 60000);
if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.claude) navigator.serviceWorker.register('sw.js').catch(() => {});
