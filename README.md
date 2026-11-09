# 🤖 Sınıfım — Robot Yapay Zekâ Hocalar

Tablet için ders uygulaması. Her dersin sevimli bir **robot yapay zekâ hocası** var. Hocaların yüzü ekran gibi: gözleri parlar, konuşurken ağzı ses dalgası gibi oynar, antenindeki ışık sabrını gösterir.

## Hocalar ve sabır

Piko (Matematik), Hece (Türk Dili ve Edebiyatı), Volt (Fizik), Lingo (İngilizce), Krono (Tarih), Moli (Kimya), Filiz (Biyoloji), Atlas (Coğrafya), Turbo (Beden Eğitimi).

Yüz ifadeleri **rastgele değil**, her hocanın **sabrına** bağlı:

| Sabır | İfade |
|---|---|
| 85+ | 🤩 Çok mutlu |
| 70–84 | 😊 Mutlu |
| 50–69 | 🙂 Sakin |
| 35–49 | 🤨 Şüpheli |
| 20–34 | 😠 Kızgın |
| 0–19 | 🤬 Çok kızgın |

Doğru cevap, iyi deneme ve yazılı sonuçları sabrı artırır. Yanlış cevap, cevap vermemek ve kabalık sabrı düşürür. Hocalar zamanla kendiliğinden sakinleşir. Sertlik ayarı, sabrın ne kadar hızlı düştüğünü belirler.

## Her hocanın bölümleri

- 💬 **Ders**: Yazarak ya da canlı (sesli) konuşarak ders. Hoca soru sorar, süre işler, cevap vermezsen kızar.
- 📷 **Soru Sor**: Sorunun ya da deneme sayfasının fotoğrafını at, hoca adım adım çözsün. "Anlamadım / daha basit anlat" diyebilirsin.
- ✏️ **Soru Çöz**: Konu seç, hoca sınav tarzında çoktan seçmeli sorular sorsun. Soru başına süre var.
- 📝 **Deneme**: Süreli deneme. Sonunda doğru, yanlış, boş, net ve çözümler gösterilir.
- 🗒️ **Yazılı**: Yazılıda çıkabilecek konular, soru tipleri ve çözümlü örnekler. Google'da örnek yazılı ve tarih aramaları. **Yazılı provası**: cevaplarını yaz ya da kâğıdın fotoğrafını çek, hoca 100 üzerinden puanlasın.
- 🔁 **Tekrar**: Konu özet kartları (sesli) ve kontrol testi.

## Diğer sayfalar

- 🌈 **Genel Tekrar**: Seçtiğin derslerin hocaları sırayla gelip soru sorar, sonunda ders ders sonuç gösterilir.
- 🗓️ **Yazılılar**: Yazılı takvimi ve geri sayım. MEB 2026-2027 ülke geneli ortak yazılı tarihleri hazır gelir (haberlere dayanır, resmi duyurudan kontrol et). Yazılı yaklaşınca hoca uyarır.
- 📅 **Program**: Düzenlenebilir haftalık ders programı. Ders saati gelince hoca "Neredesin?" diye uyarır.
- ❓ **Günlük soru hakkı**: Hocaya sorulan her soru 1 hak. Hak azalınca hoca uyarır.

## Yapay zekâ

Uygulama claude.ai'de link (artifact) olarak açılınca hocalar kullanıcının Claude hesabıyla çalışır, anahtar gerekmez. Başka bir yerde açıldığında Ayarlar > Yapay zekâ bölümüne Claude API anahtarı girilebilir. Yapay zekâ yoksa Ders bölümü hazır soru bankasıyla çevrimdışı çalışır.

Bilgisayarda denemek için: `python3 -m http.server` → `http://localhost:8000`
