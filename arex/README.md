# Arex 2.0 – kendini geliştirebilen yerel yapay zeka

Hepsi senin bilgisayarında çalışır: beyin (Ollama), göz (OpenCV + moondream), kulak (Vosk),
ses (Piper/espeak-ng), telefon (KDE Connect + ADB).

## Windows'ta kurulum
1. Zip'i bir klasöre çıkar (sağ tık → Tümünü ayıkla).
2. **KUR.bat**'a çift tıkla (bir kez; 20-40 dk, birkaç GB indirir).
3. Masaüstündeki **AREX** simgesine çift tıkla → ayrı uygulama penceresinde HUD paneli açılır.
   (veya BASLAT.bat = sesli, BASLAT-YAZILI.bat = klavye)
4. Sadece güvenlik kamerası için: **GUVENLIK-KAMERASI.bat**.

## Linux'ta kurulum
```
bash arex/setup.sh
~/.arex/venv/bin/python -m arex.main            # sesli
~/.arex/venv/bin/python -m arex.main --text     # yazılı
~/.arex/venv/bin/python -m arex.main --guard    # sadece güvenlik kamerası (alarm açık)
~/.arex/venv/bin/python -m arex.main --no-camera --no-dashboard --mute
```
Panel: tarayıcıda **http://127.0.0.1:8765** (canlı kamera, olaylar, alarm aç/kapa, sohbet, durum).
Telefondan açmak için `config.json`: `"dashboard_host": "0.0.0.0"` ve `"dashboard_token": "uzun-gizli-bir-söz"`,
sonra `http://PC-IP:8765/?token=...`.

## 2.0 ile gelenler: kendini geliştirme
- **"…yapabilen bir yetenek yaz"** → Arex kodu yerel kod modeliyle (qwen2.5-coder) yazar, ayrı süreçte test eder,
  hata verirse hatayı modele geri verip düzeltir (3 deneme), sonra hemen yükler. Eklentiler `~/.arex/plugins`'te
  durur, güncellemede kaybolmaz.
- **"şu eklentiyi değiştir"**, **"kendi kodunda şunu düzelt"** (edit_core) → önce yedek alır; yeni kod Arex'i
  bozarsa otomatik geri alır.
- **Kendi kendine kurulum**: pip paketleri, `winget` ile Windows programları, PowerShell komutları, dosya indirme.
- **Yedek / geri al / güncelle / yeniden başlat** (sesli komutla veya paneldeki düğmelerle).
  Güncelleme kaynağı: `config.json` → `update_url`.
- **Yeni HUD arayüz**: dönen reaktör çekirdeği (bekleme=mavi, düşünme=turuncu, alarm=kırmızı, konuşurken titreşim),
  tarama çizgili kamera vizörü + radar, dairesel göstergeler, terminal sohbet, araç etkinlik kaydı, açılış
  animasyonu, mekanik ses efektleri. Arayüz `arex/ui.html` dosyasıdır; Arex onu da düzenleyebilir.
- Masaüstü kısayolu ve simge; panel ayrı uygulama penceresinde açılır.

## 1.9 ile gelenler
### Kamera / güvenlik
- **Hareket algılama** (MOG2 arka plan çıkarma, gölge ve gürültü filtresi, yoksayılacak bölgeler, ani ışık değişimine dayanıklı)
- **Alarm modu**: "Arex alarmı aç" → hareket olunca sesli uyarı, telefona bildirim + **fotoğraf** gönderir
- **Video kaydı**: hareketten **önceki 3 sn** dahil, hareket bitene kadar MP4 (`~/.arex/camera/clips`)
- **İnsan / yüz algılama** (HOG + Haar); `alert_only_people: true` ile kedi, gölge vb. yüzünden alarm çalmaz
- **Yüz tanıma**: "Arex yüzümü öğren, adım Rüzgar" → seni tanır, sana alarm vermez, "Hoş geldin" der; yabancıyı ayrıca bildirir
- **Kamera kapatma / karartma algılama** (sabotaj uyarısı)
- IP kamera / telefon kamerası desteği: `camera_source` = `rtsp://...` veya `http://.../video`
- Eski kayıtları otomatik silme (`keep_media_days`)
### Görme
- "Arex bak, ne görüyorsun?" → kamerayı yerel görsel modelle (moondream/llava) anlatır
- "Ekranımda ne var?" → ekran görüntüsünü anlatır; "ekrandaki yazıyı oku" → OCR (tesseract)
- İstersen alarm fotoğrafını da anlatır (`describe_events: true`)
### Günlük işler
- **Hatırlatıcı / alarm / zamanlayıcı** – "10 dakika sonra çayı hatırlat", "yarın 08:00 uyandır", günlük/haftalık tekrar; kapanınca kaybolmaz
- **Yapılacaklar listesi**, **hava durumu** (wttr.in, anahtarsız), **güvenli hesap makinesi**
- **Bilgisayar kontrolü**: ses, müzik (oynat/durdur/sonraki), parlaklık, ekran kilidi, pano
- **Sistem izleme**: CPU aşırı ısınma, disk dolması, pil azalması → sesli + telefona uyarı
- **Telefon**: fotoğraf/dosya gönderme, telefon pili, kayıp telefonu çaldırma
### Düzeltmeler / güvenlik
- Araç JSON'u artık iç içe süslü parantezde bozulmuyor; yanlış argümanda modele doğru kullanım söyleniyor
- `open_app` kabuk enjeksiyonu kapatıldı; `rm -rf /`, `mkfs`, `dd of=/dev/sdX`, kapatma gibi yıkıcı komutlar engelleniyor (`block_catastrophic`)
- Hafıza dosyası atomik yazılıyor (bozulmuyor), "unut" komutu
- Arka plan uyarıları ile konuşma üst üste binmiyor; aynı anda tek düşünce (kilit)
- Yeni ayarlar mevcut `config.json`'a otomatik eklenir; `--version`, `--mute`, `--guard` seçenekleri

## Örnek komutlar
"Arex alarmı aç" · "son hareketler neler?" · "bak bakalım odada kim var" · "yüzümü öğren, adım Rüzgar" ·
"yarın 07:30 beni uyandır" · "her gün 21:00'de ilacımı hatırlat" · "sesi 40 yap" · "müziği durdur" ·
"İstanbul'da hava nasıl?" · "listeye ekmek ekle" · "ekranı kilitle" · "telefonum nerede?"

## Sınırlar (dürüst olmak gerekirse)
- Gerçek "canlı duygu" yok; duygular simülasyon, kişiliği prompt'a yansıtır.
- Yüz tanıma (LBPH) basit bir yöntemdir; ışık ve açıya duyarlı. Kimlik doğrulama/kilit açma için kullanma.
- Hareket algılama, kamera sabitken en iyi çalışır; perde, ağaç gibi alanları `motion_ignore_zones` ile dışla.
- Telefon aramasında karşı tarafın sesi için Bluetooth HFP yönlendirmesi gerekir; otomatik kurulmaz.
- Kalite model boyutuna bağlı; 8B model araç JSON'unda ara sıra hata yapabilir.
- Testler (`python -m pytest tests`) sahte kamera görüntüleri ve sahte model cevabıyla yapıldı;
  gerçek mikrofon, webcam ve Ollama ile bu ortamda denenmedi.
- `run_shell` hâlâ geniş erişimlidir; dikkatli kullan.
- Kendine kod yazma, yerel 7B kod modeliyle basit/orta işlerde iyi çalışır; büyük işlerde hata yapabilir.
  Yazdığı kod bilgisayarında tam yetkiyle çalışır: ne yazdığını panelden/"show_code" ile görebilirsin.
