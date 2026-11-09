// Dersin konu listesi (yapay zekâdan bir kez alınır, cihazda saklanır).
import { llmJSON, hasAI } from './ai.js';
import { topicsSystem } from './prompts.js';
import { getSettings, getTopics, saveTopics } from './storage.js';
import { esc } from './ui.js';

export async function topicList(t) {
  const key = `${t.id}.${getSettings().grade}`;
  const c = getTopics(key);
  if (c) return c;
  if (!hasAI()) return [];
  try {
    const j = await llmJSON({ system: topicsSystem(t), messages: [{ role: 'user', content: 'Konu listesini ver.' }] });
    const list = (j.konular || []).map(String).slice(0, 16);
    if (list.length) saveTopics(key, list);
    return list;
  } catch { return []; }
}

// Konu seçici: çipler + serbest yazı
export function topicPicker(el, t, { multi = false } = {}) {
  el.innerHTML = `<div class="topics"><div class="chips"><span class="muted small">Konular yükleniyor…</span></div>
    <input class="topic-in" placeholder="ya da konuyu kendin yaz (boş = karışık)"></div>`;
  const sel = new Set();
  topicList(t).then(list => {
    const box = el.querySelector('.chips'); if (!box) return;
    box.innerHTML = list.length ? list.map(k => `<button type="button" class="chip-btn">${esc(k)}</button>`).join('') : '<span class="muted small">Konu listesi alınamadı, aşağıya yazabilirsin.</span>';
    box.querySelectorAll('.chip-btn').forEach(b => b.addEventListener('click', () => {
      const k = b.textContent;
      if (!multi) { sel.clear(); box.querySelectorAll('.chip-btn').forEach(x => x.classList.remove('on')); }
      if (sel.has(k)) { sel.delete(k); b.classList.remove('on'); } else { sel.add(k); b.classList.add('on'); }
    }));
  });
  return () => {
    const typed = el.querySelector('.topic-in').value.trim();
    return [typed, ...sel].filter(Boolean).join(', ');
  };
}
