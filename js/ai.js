// Yapay zekâ bağlantısı.
// 1) claude.ai içinde link olarak açılınca: kullanıcının Claude hesabı (anahtar gerekmez).
// 2) Ayarlarda API anahtarı varsa: doğrudan Claude API.
import { getSettings } from './storage.js';

let sampleFn = null;
export const aiReady = (async () => {
  try { if (window.claude && window.claude.use) sampleFn = await window.claude.use('sample'); } catch { sampleFn = null; }
  return !!sampleFn;
})();
export const hasAI = () => !!getSettings().apiKey.trim() || !!sampleFn;

export class AIError extends Error { constructor(msg, code) { super(msg); this.code = code; } }

function friendly(code, msg) {
  return ({
    not_granted: 'Claude kullanım izni verilmedi. Sayfayı yenileyip "İzin ver" de.',
    rate_limited: 'Çok hızlı soru gönderildi, biraz bekleyip tekrar dene.',
    usage_limit: 'Claude kullanım hakkın dolmuş görünüyor.',
  })[code] || msg || 'Yapay zekâ yanıt vermedi.';
}

async function blobToBase64(b) {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}

// Fotoğrafı küçült (hız ve boyut için)
export async function prepareImage(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
  } finally { URL.revokeObjectURL(url); }
}

/**
 * messages: [{role:'user'|'assistant', content:string}] — user ile başlar ve biter.
 * tier: 'quick' (sohbet) | 'default' (çözüm, deneme hazırlama)
 */
export async function llm({ system, messages, images = [], tier = 'quick', onText, signal }) {
  await aiReady;
  const s = getSettings();
  const msgs = [];
  for (const m of messages) {
    if (msgs.length && msgs[msgs.length - 1].role === m.role) msgs[msgs.length - 1].content += '\n' + m.content;
    else msgs.push({ role: m.role, content: m.content });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length) msgs.push({ role: 'user', content: 'Başla.' });

  if (s.apiKey.trim()) {
    const model = tier === 'quick' ? s.model : (s.model.includes('haiku') ? 'claude-sonnet-5-5' : s.model);
    const apiMsgs = msgs.map((m, i) => {
      if (i !== msgs.length - 1 || !images.length) return m;
      return { role: 'user', content: [] };
    });
    if (images.length) {
      const last = apiMsgs[apiMsgs.length - 1];
      for (const b of images) last.content.push({ type: 'image', source: { type: 'base64', media_type: b.type || 'image/jpeg', data: await blobToBase64(b) } });
      last.content.push({ type: 'text', text: msgs[msgs.length - 1].content });
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-api-key': s.apiKey.trim(), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: tier === 'quick' ? 700 : 6000, system, messages: apiMsgs }),
    });
    if (!res.ok) { let m = 'HTTP ' + res.status; try { m = (await res.json()).error?.message || m; } catch { /* yok */ } throw new AIError(m, 'http'); }
    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    onText && onText({ text });
    return text;
  }
  if (!sampleFn) throw new AIError('Yapay zekâ bağlı değil. Uygulamayı Claude linkinden aç ya da Ayarlar\'dan API anahtarı ekle.', 'none');
  const input = msgs.map((m, i) => i === 0 ? { ...m, content: `TALİMATLAR (bunlara kesinlikle uy):\n${system}\n\n---\n${m.content}` } : m);
  try {
    const opts = { modelTier: tier, cache: false, signal };
    if (images.length) opts.images = images;
    if (onText) opts.onText = onText;
    const { text } = await sampleFn(input, opts);
    return text;
  } catch (e) {
    if (e && e.code === 'not_granted') sampleFn = null;
    throw new AIError(friendly(e && e.code, e && e.message), e && e.code);
  }
}

export function parseJSON(raw) {
  const t = raw.replace(/```(?:json)?/g, '');
  const starts = [t.indexOf('{'), t.indexOf('[')].filter(i => i >= 0);
  if (!starts.length) throw new AIError('Yanıt anlaşılamadı.', 'parse');
  const s = Math.min(...starts);
  const e = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  try { return JSON.parse(t.slice(s, e + 1)); } catch { throw new AIError('Yanıt anlaşılamadı, tekrar dene.', 'parse'); }
}

export async function llmJSON(opts) {
  const text = await llm(opts);
  return parseJSON(text);
}

export async function testConnection() {
  return llm({ system: 'Kısa cevap ver.', messages: [{ role: 'user', content: 'Bir kelimeyle selam ver.' }] });
}
