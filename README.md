# 🤖 Sınıfım — Robot Yapay Zekâ Akademisi

Tablet için yapay zekâ destekli çalışma uygulaması. Dokuz sevimli **robot hoca** var: Piko (Matematik), Hece (Türk Dili ve Edebiyatı), Volt (Fizik), Lingo (İngilizce), Krono (Tarih), Moli (Kimya), Filiz (Biyoloji), Atlas (Coğrafya), Turbo (Beden Eğitimi).

## Robotlar
- Havada süzülürler, kollarıyla jest yaparlar, konuşurken elleriyle anlatırlar, dokununca tepki verirler.
- Ekran yüzleri: parlayan gözler (mutluyken kalp gözler), ses dalgası ağız, göğüste ekolayzer.
- **Her robotun ayrı sesi var**: farklı perde ve hız, kendine has "bip" imza sesi. Tablette birden fazla Türkçe ses varsa robotlara farklı sesler dağıtılır (Ayarlar'dan değiştirilebilir). Lingo İngilizce cümleleri İngilizce sesle okur.
- **Akıcı konuşma**: yapay zekâ cevabı yazarken robot hazır cümleleri hemen okumaya başlar.
- Yüz ifadeleri **sabra bağlıdır**, rastgele değil (85+ çok mutlu … 0–19 çok kızgın).

## Bölümler (her robot için)
💬 Sohbet (yazılı / canlı sesli) · 📷 Soru Sor (fotoğraf) · ✍️ Tahta (parmakla/kalemle çöz, robot kontrol etsin) · ✏️ Soru Çöz · 📝 Deneme (net hesabı) · 🗒️ Yazılı (konular, çözümlü örnekler, yazılı provası ve puanlama) · 🔁 Tekrar kartları · 📊 Karne (konu konu ustalık + hata defteri)

## Uygulama geneli
- **Yapay zekâ koç**: yazılılara, zayıf konulara ve hata defterine göre günlük plan.
- **Hata defteri**: yanlışlar aralıklı tekrarla (Leitner) tam zamanında yeniden sorulur.
- **XP, seviye, günlük seri, 20 rozet**, günlük XP hedefi, 7 günlük grafik.
- **Odak modu**: robotla süreli çalışma; uygulamadan çıkarsan robot fark eder ve kızar.
- **Genel tekrar**: robotlar sırayla soru sorar.
- **Yazılı takvimi** (MEB 2026-2027 ortak yazılı tarihleri hazır), ders programı, hatırlatıcılar, günlük soru hakkı.

## Ses ve mikrofon
- claude.ai içinde (artifact olarak) açıldığında sayfa doğrudan mikrofona erişemez. Canlı sohbet bu durumda **klavye diktesi** ile çalışır: klavyedeki 🎤 tuşuyla konuşulur, konuşma bitince mesaj kendiliğinden gönderilir.
- Uygulama kendi HTTPS adresinde açıldığında gerçek mikrofonla eller serbest sohbet çalışır (yapay zekâ için Ayarlar'a Claude API anahtarı gerekir).

Bilgisayarda denemek için: `python3 -m http.server` → `http://localhost:8000`
