# 🎓 Sınıfım — Yapay Zekâ Hocalar

Tablet için yapılmış bir ders programı uygulaması. Her dersin bir **yapay zekâ hocası** var: yüzleri hareket eder, göz kırpar, konuşurken ağızları oynar, **duyguları** vardır (mutlu, gururlu, kızgın, çok kızgın, üzgün, hayal kırıklığı, şaşkın, düşünceli, şüpheli, sıkılmış, endişeli…).

## Özellikler

- 📅 **Haftalık ders programı**: düzenlenebilir; şu anki ders vurgulanır.
- 🧑‍🏫 **9 farklı hoca**, her birinin kendi yüzü, kişiliği ve sesi var (Matematik, Türkçe, Fizik, İngilizce, Tarih, Kimya, Biyoloji, Coğrafya, Beden Eğitimi).
- 😠 **Duygular**: doğru cevapta sevinir, yanlışta hayal kırıklığına uğrar ya da kızar. Cevap vermezsen önce uyarır, sonra kızar; üst üste susarsan iyice sinirlenir. Her hocanın kalıcı bir **sabır** göstergesi var.
- ⏱️ **Cevap süresi**: hoca soru sorunca geri sayım başlar (ayarlanabilir).
- ❓ **Günlük soru hakkı**: varsayılan 30 mesaj. 10, 5, 3 ve 1 hak kalınca hoca seni uyarır, bitince yarına kadar ders yok.
- 🎙️ **Canlı konuşma**: "Canlı konuşmayı başlat"a bas, sesli konuş. Hoca dinler, sesli cevap verir, sonra tekrar dinler. Sözünü kesmek için hocanın yüzüne dokun.
- 🔔 **Ders hatırlatıcısı**: ders saati gelince hoca ekrana gelip "Neredesin?" diye uyarır.
- 📴 **Çevrimdışı mod**: API anahtarı yoksa hocalar hazır soru bankasıyla ders yapar.
- 📱 **Uygulama olarak kurulur (PWA)**: ana ekrana eklenir, tam ekran açılır.

## Yapay zekâ

Hocalar Claude ile konuşur. **Ayarlar → API anahtarı** kısmına [console.anthropic.com](https://console.anthropic.com) adresinden aldığın anahtarı gir. Anahtar sadece tablette saklanır ve doğrudan Anthropic API'sine gider. Canlı konuşma için en hızlı model olan **Haiku** önerilir.

## Tablete kurulum

Mikrofon ve uygulama kurulumu için uygulamanın **HTTPS** üzerinden açılması gerekir.

1. GitHub'da depo **Settings → Pages → Source: GitHub Actions** seç.
2. Kodu `main` dalına birleştir; `.github/workflows/pages.yml` uygulamayı otomatik yayınlar.
3. Tablette verilen adresi aç:
   - **Android (Chrome)**: menü ⋮ → *Ana ekrana ekle / Uygulamayı yükle*
   - **iPad (Safari)**: Paylaş → *Ana Ekrana Ekle*

Bilgisayarda denemek için: `python3 -m http.server` → `http://localhost:8000`

## Dosyalar

| Dosya | Görev |
|---|---|
| `js/face.js` | Animasyonlu SVG yüzler ve duygular |
| `js/teachers.js` | Hocaların kişilikleri, görünüşleri, soru bankaları |
| `js/classroom.js` | Sınıf ekranı: sohbet, süre, kızma, limit, canlı mod |
| `js/ai.js` | Claude API bağlantısı |
| `js/offline.js` | Çevrimdışı hoca beyni ve hazır replikler |
| `js/speech.js` | Sesli konuşma ve dinleme |
| `js/app.js` | Ana sayfa, program, hocalar, ayarlar, hatırlatıcı |
