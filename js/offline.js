// API anahtarı yokken çalışan çevrimdışı hoca beyni + hazır repliklar.

export function norm(s) {
  return String(s).toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/â/g, 'a')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
const pick = a => a[Math.floor(Math.random() * a.length)];
const isStrict = (t, s) => (t.strict + (s === 'sert' ? 0.25 : s === 'yumusak' ? -0.25 : 0)) >= 0.55;

export const LINES = {
  wait: (t, s) => isStrict(t, s)
    ? ['Hadi, bekliyorum!', 'Saat işliyor, cevap?', 'Uyuyor musun? Cevap ver!', 'Sessizlik cevap değildir.']
    : ['Acele etme ama bekliyorum.', 'Hadi, bir tahminde bulun.', 'Aklına ne geliyorsa söyle.', 'Orada mısın?'],
  silence: (t, s, n) => n >= 3
    ? ['Bu kaçıncı kez cevap vermiyorsun! Bunu not ediyorum, çok ayıp.', 'Yeter artık! Derse hiç katılmıyorsun, bunu velinle konuşacağım.']
    : isStrict(t, s)
      ? ['Cevap yok mu? Derste beni dinlemiyorsun!', 'Ben konuşuyorum, sen susuyorsun. Böyle olmaz!', 'Bu sessizlik hiç hoşuma gitmiyor. Cevap ver!']
      : ['Hey, kayboldun mu? Sana bir soru sormuştum.', 'Cevap bekliyordum, biraz üzüldüm açıkçası.', 'Hadi ama, en azından bir deneme yap.'],
  limit: rem => rem <= 0
    ? 'Bugünlük soru hakkın bitti. Yarın tekrar gel, bu arada öğrendiklerini tekrar et!'
    : rem === 1 ? 'Dikkat! Son bir soru hakkın kaldı. Boşa harcama.'
      : `Uyarıyorum: bugün sadece ${rem} soru hakkın kaldı. Sorularını dikkatli seç.`,
  late: t => `${t.subject} dersi başladı! Neredesin? Hemen derse gel.`,
};

export class OfflineTeacher {
  constructor(teacher, strictness) {
    this.t = teacher;
    this.s = strictness;
    this.order = [...teacher.bank.keys()].sort(() => Math.random() - 0.5);
    this.i = 0;
    this.current = null;
  }
  _next() {
    const q = this.t.bank[this.order[this.i % this.order.length]];
    this.i++;
    this.current = q;
    return q;
  }
  start(name) {
    const q = this._next();
    const hi = name ? `Merhaba ${name}!` : 'Merhaba!';
    return { emotion: 'mutlu', text: `${hi} Ben ${this.t.name}. Bugün ${this.t.subject} çalışıyoruz. İlk soru: ${q.q}`, question: true, evaluation: 'yok' };
  }
  silence(n) {
    const angry = n >= 2 || isStrict(this.t, this.s);
    const tail = this.current ? ` Soruyu tekrar ediyorum: ${this.current.q}` : '';
    return { emotion: n >= 3 ? 'cok_kizgin' : angry ? 'kizgin' : 'hayal_kirikligi', text: pick(LINES.silence(this.t, this.s, n)) + tail, question: !!this.current, evaluation: 'yok' };
  }
  respond(text) {
    const n = norm(text);
    const strict = isStrict(this.t, this.s);
    if (!this.current) {
      const q = this._next();
      return { emotion: 'notr', text: `Peki. O zaman sana bir soru: ${q.q}`, question: true, evaluation: 'yok' };
    }
    const q = this.current;
    const ok = q.a.some(a => (' ' + n + ' ').includes(' ' + norm(a) + ' ') || n === norm(a));
    const dunno = /\b(bilmiyorum|bilmem|pas|gec|hatirlamiyorum|yok)\b/.test(n);
    const asking = /\?\s*$/.test(text.trim()) || /^(neden|nasil|niye|ne |nedir|kim |hangi)/.test(n);
    if (ok) {
      const next = this._next();
      return { emotion: pick(['cok_mutlu', 'gururlu', 'mutlu']), text: `${pick(['Aferin, doğru!', 'Harika, tam isabet!', 'Çok güzel, doğru cevap!', 'İşte bu!'])} Sıradaki soru: ${next.q}`, question: true, evaluation: 'dogru' };
    }
    if (asking && !dunno) {
      return { emotion: 'dusunceli', text: `Güzel bir soru ama şu an çevrimdışı moddayım, ayarlardan yapay zekâ anahtarını girersen her şeyi anlatırım. Şimdi sen benim soruma cevap ver: ${q.q}`, question: true, evaluation: 'yok' };
    }
    const next = this._next();
    const right = q.a[0];
    if (dunno) {
      return { emotion: strict ? 'suphe' : 'hayal_kirikligi', text: `${strict ? 'Bilmiyorum demek kolay! Çalışman lazım.' : 'Olsun, öğrenmek için buradayız.'} Doğru cevap: ${right}. Şimdi şu soru: ${next.q}`, question: true, evaluation: 'yanlis' };
    }
    return { emotion: strict ? 'kizgin' : 'hayal_kirikligi', text: `${strict ? pick(['Yanlış! Hiç dinlemiyorsun.', 'Olmadı evladım, yanlış!', 'Hayır! Bunu biliyor olmalıydın.']) : pick(['Hmm, maalesef yanlış.', 'Olmadı ama yaklaştın gibi.', 'Yanlış ama pes etmek yok.'])} Doğrusu: ${right}. Sıradaki: ${next.q}`, question: true, evaluation: 'yanlis' };
  }
}
