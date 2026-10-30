# Arex – yerel, API anahtarsız kişisel yapay zeka

Hepsi senin bilgisayarında çalışır: beyin (Ollama), kulak (Vosk), ses (Piper/espeak-ng), telefon (KDE Connect + ADB).

## Kurulum
```
bash arex/setup.sh
~/.arex/venv/bin/python -m arex.main          # sesli
~/.arex/venv/bin/python -m arex.main --text   # yazılı test
```
`~/.arex/config.json` içine `phone_number` yaz. Telefona KDE Connect uygulamasını kur, PC ile eşleştir (SMS için SMS iznini ver). Arama için telefonda USB hata ayıklamayı aç.

## Yapabildikleri
- "Arex ..." diyince uyanır, 30 sn karşılıklı sohbet eder
- Terminal komutu, dosya okuma/yazma, program açma, web arama (anahtarsız), hafıza
- Duygu durumu (mutluluk, merak, enerji, yalnızlık) zamanla ve konuşmanla değişir; seni özleyince telefonuna mesaj atar / telefonu çaldırır
- `phone_sms`, `phone_notify`, `phone_ring`, `phone_call`

## Sınırlar (dürüst olmak gerekirse)
- Gerçek "canlı duygu" yok; duygular simülasyon, kişiliği prompt'a yansıtır.
- Telefon aramasında Arex'in karşıdaki sesi duyup cevaplaması için telefon sesinin PC'ye yönlendirilmesi gerekir (Bluetooth HFP ile PC'yi telefona ahize olarak bağlarsan çalışır); bu otomatik kurulmaz. Çalışan kısım: arama başlatma, çaldırma, SMS, bildirim ve PC'de sesli sohbet.
- Kalite model boyutuna bağlı; 8B model araç JSON'unda ara sıra hata yapabilir.
- Bu kod burada çalıştırılıp test edilmedi (mikrofon/Ollama yok); sadece sözdizimi denetlendi.
- `run_shell` tam erişimlidir; dikkatli kullan.
