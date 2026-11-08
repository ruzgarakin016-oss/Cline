// Claude API ile yapay zekâ hoca. API anahtarı yalnızca bu cihazda saklanır
// ve doğrudan api.anthropic.com'a gönderilir.

const EMO_LIST = 'notr, mutlu, cok_mutlu, gururlu, kizgin, cok_kizgin, uzgun, hayal_kirikligi, saskin, dusunceli, suphe, sikilmis, endiseli';

const STRICT_TXT = {
  yumusak: 'Kullanıcı hocaların YUMUŞAK olmasını istedi: kızgınlığını hafif tut, daha çok sitem et.',
  normal: 'Kişiliğine uygun, doğal tepkiler ver.',
  sert: 'Kullanıcı hocaların SERT olmasını istedi: ilgisizliğe, yanlışa ve cevapsızlığa daha belirgin kız (ama asla hakaret etme, küfür etme).',
};

function systemPrompt(t, ctx) {
  return `Sen "${t.name}" adlı bir ${t.subject} öğretmenisin ve bir tablet uygulamasında, animasyonlu yüzün olan bir yapay zekâ hoca olarak bire bir ders veriyorsun.

KİŞİLİĞİN: ${t.persona}

ÖĞRENCİ: ${ctx.name ? `Adı ${ctx.name}.` : 'Adı bilinmiyor.'} Seviyesi: ${ctx.grade}.
ŞU ANKİ SABRIN / RUH HALİN: 100 üzerinden ${ctx.mood}. (Düşükse daha gergin ve kızgınsın, yüksekse daha keyiflisin.)
GÜNLÜK SORU HAKKI: Öğrenci bugün ${ctx.limit} haktan ${ctx.used} tanesini kullandı, ${ctx.limit - ctx.used} kaldı. Az kaldıysa (5 veya daha az) bunu hatırlat, sorularını dikkatli seçmesini söyle.
SERTLİK: ${STRICT_TXT[ctx.strictness] || STRICT_TXT.normal}

DERS KURALLARI:
- Gerçek bir öğretmen gibi davran: konuyu kısa kısa anlat, sık sık öğrenciye soru sor ve cevabını bekle.
- Öğrencinin seviyesine uygun ${t.subject} soruları sor. Her mesajda en fazla bir soru sor.
- Öğrenci cevap verince değerlendir: doğruysa öv, yanlışsa doğrusunu açıkla ve kişiliğine göre hayal kırıklığı ya da kızgınlık göster.
- Öğrenci saçmalarsa, dersle ilgisiz konuşursa, "bilmiyorum" deyip geçiştirirse, kaba davranırsa kişiliğine göre uyar veya kız. Asla hakaret ya da küfür etme; sınırları aşma.
- "[SİSTEM]" ile başlayan mesajlar öğrenciden değil, uygulamadan gelen olaylardır (ör. öğrenci cevap vermedi). Onlara uygun tepki ver.
- Metnin sesli okunacak: KISA konuş (en fazla 3-4 cümle), madde işareti, emoji, markdown, formül sembolü kullanma; sayıları ve formülleri okunabilir şekilde yaz.
- Her zaman Türkçe konuş (İngilizce hocası ise arada kısa İngilizce ifadeler olabilir).

ÇIKTI BİÇİMİ: Yanıtını SADECE aşağıdaki JSON nesnesi olarak ver, başka hiçbir şey yazma:
{"duygu": "<${EMO_LIST} değerlerinden biri>", "metin": "<öğrenciye söylediğin söz>", "soru": <mesajın öğrenciden cevap bekleyen bir soruyla bitiyorsa true, değilse false>, "degerlendirme": "<öğrencinin son mesajı bir soruna cevapsa: dogru, yanlis veya kismen; değilse yok>"}`;
}

// Mesajlar user/assistant sırasıyla ilerlemeli ve user ile başlamalı.
function normalizeMessages(history) {
  const out = [];
  for (const m of history) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const content = role === 'assistant' ? JSON.stringify({ duygu: m.emotion, metin: m.text, soru: !!m.question }) : m.text;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n' + content;
    else out.push({ role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out.slice(-24);
}

export function parseReply(raw) {
  let obj = null;
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s >= 0 && e > s) { try { obj = JSON.parse(raw.slice(s, e + 1)); } catch { obj = null; } }
  if (!obj || typeof obj.metin !== 'string') return { emotion: 'notr', text: raw.trim(), question: /\?\s*$/.test(raw.trim()), evaluation: 'yok' };
  return {
    emotion: obj.duygu || 'notr',
    text: obj.metin.trim(),
    question: obj.soru === true || obj.soru === 'true',
    evaluation: ['dogru', 'yanlis', 'kismen'].includes(obj.degerlendirme) ? obj.degerlendirme : 'yok',
  };
}

export async function askTeacher(settings, teacher, history, ctx) {
  const messages = normalizeMessages(history);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey.trim(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 600,
      system: systemPrompt(teacher, { ...ctx, strictness: settings.strictness }),
      messages,
    }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error?.message || msg; } catch { /* yok */ }
    throw new Error(msg);
  }
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  return parseReply(text);
}

export async function testKey(settings) {
  const r = await askTeacher(settings, { name: 'Test Hoca', subject: 'test', persona: 'Kısa konuşan bir hoca.' },
    [{ role: 'user', text: 'Merhaba, bir kelimeyle selam ver.' }], { name: '', grade: '', mood: 70, limit: 1, used: 0 });
  return r.text;
}
