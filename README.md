# Arexi

Arexi terminalde çalışan otonom bir yapay zekâ asistanıdır. Claude API üzerinde (varsayılan model **Claude Opus 5.5**) çalışır ve bilgisayarında gerçek işler yapar: komut çalıştırır, dosya okur, yazar ve düzenler, kod arar, web'de arama yapar ve sayfa indirir. Çok adımlı işleri kendi başına planlayıp yürütür.

```
  ▄▀█ █▀█ █▀▀ ▀▄▀ █
  █▀█ █▀▄ ██▄ █░█ █
```

## Özellikler

- **Ajan döngüsü:** Model araç çağırır, Arexi çalıştırır, sonucu modele geri verir. Bu, iş bitene kadar sürer. Bağımsız okuma işlemleri paralel çalışır.
- **Araçlar:** `bash` (Windows'ta PowerShell), `read_file`, `write_file`, `edit_file`, `list_dir`, `glob`, `grep`, `web_fetch`, `todo`. Bunlara ek olarak sunucu taraflı `web_search` var.
- **Tam yetki modu:** `--full` ile hiçbir işlem için onay sorulmaz. Arexi bilgisayarında senin yetkilerinle her şeyi yapabilir.
- **Canlı akış:** Yanıtlar ve düşünce özetleri yazılırken ekranda görünür. Komut çıktıları da anlık akar.
- **Uyarlanabilir düşünme:** `/effort low|medium|high|xhigh|max` ile ne kadar derin düşüneceğini ayarlarsın.
- **Uzun oturumlar:** Bağlam dolmaya yaklaşınca sunucu eski konuşmayı otomatik özetler (compaction). İstem önbelleği maliyeti düşürür.
- **Kalıcı hafıza:** `~/.arexi/AREXI.md` (genel) ve proje klasöründeki `AREXI.md` dosyaları her oturumda sisteme yüklenir. `/init` komutu projeyi inceleyip bu dosyayı oluşturur.
- **Oturum kaydı:** Her konuşma `~/.arexi/sessions/` altına kaydedilir. `arexi -c` veya `/resume` ile kaldığın yerden devam edersin.
- **Yedek model:** Model bir isteği politika nedeniyle reddederse API isteği otomatik olarak varsayılan yedek modelde yeniden çalıştırır.
- **Güvenli durdurma:** Ctrl+C o anki işlemi (model yanıtı veya komut) durdurur, konuşma geçmişi bozulmaz.

## Kurulum

Node.js 20.12 veya üstü gerekir.

```bash
git clone <bu-repo> arexi && cd arexi
npm install
npm link            # 'arexi' komutunu her yerde kullanılabilir yapar
```

API anahtarını [console.anthropic.com](https://console.anthropic.com) adresinden al ve ortam değişkeni olarak ayarla:

```bash
# Linux / macOS
export ANTHROPIC_API_KEY="sk-ant-..."

# Windows (PowerShell)
setx ANTHROPIC_API_KEY "sk-ant-..."
```

## Kullanım

```bash
arexi                         # etkileşimli sohbet (her değişiklik için onay ister)
arexi --full                  # TAM YETKİ: hiçbir şey için onay sormaz
arexi "bu projedeki testleri çalıştır ve hataları düzelt"
arexi -p "disk kullanımını özetle"   # tek görev, bitince çıkar
arexi -c                      # son oturumdan devam et
arexi --effort max --model claude-opus-5-5
```

### İzin modları

| Mod | Davranış |
|---|---|
| `ask` (varsayılan) | Her dosya yazma/düzenleme ve her komut için onay ister |
| `auto-edit` | Dosya düzenlemelerini kendisi yapar, komutlar için onay ister |
| `full` | **Tam yetki**: hiçbir şey için onay istemez |

Onay sorusunda `e` (evet), `h` (hayır) veya `t` (bu oturumda bu türdeki tüm işlemlere evet) yazabilirsin. Bunların yerine ne yapmasını istediğini de yazabilirsin, Arexi bunu dikkate alır.

> ⚠️ **Tam yetki modu gerçekten tam yetkidir.** Arexi senin kullanıcı hesabının yapabildiği her şeyi onay sormadan yapar: dosya silmek, program kurmak, sistem ayarlarını değiştirmek dahil. Yıkıcı işlemlerden önce sorması talimatlarında yazar, ama son sorumluluk sende. Önemli verilerinin yedeği olsun.

### Sohbet içi komutlar

| Komut | Açıklama |
|---|---|
| `/mode [ask\|auto-edit\|full]`, `/full` | İzin modunu değiştir |
| `/effort [seviye]` | Düşünme derinliği |
| `/model [id]` | Modeli değiştir |
| `/think` | Düşünce özetlerini aç/kapat |
| `/init` | Proje için `AREXI.md` hafıza dosyası oluştur |
| `/todos` | Arexi'nin görev listesi |
| `/cost` | Token kullanımı ve tahmini maliyet |
| `/clear`, `/resume [id]` | Yeni oturum başlat / eski oturuma dön |
| `/save` | Mevcut ayarları varsayılan yap (`~/.arexi/config.json`) |
| `!komut` | Kabuk komutunu doğrudan çalıştır |
| `/exit` | Çık |

Satırın sonuna `\` koyarsan çok satırlı mesaj yazabilirsin.

## Ayarlar

Ayarlar `~/.arexi/config.json` dosyasında durur (`/save` ile yazılır). Ortam değişkenleri ve komut satırı seçenekleri dosyadaki ayarları geçersiz kılar.

```json
{
  "model": "claude-opus-5-5",
  "effort": "high",
  "mode": "ask",
  "maxTokens": 64000,
  "showThinking": true,
  "webSearch": true,
  "fallbacks": true,
  "compaction": true,
  "commandTimeoutSec": 300
}
```

Ortam değişkenleri: `AREXI_MODEL`, `AREXI_EFFORT`, `AREXI_MODE`, `AREXI_HOME`.

## Proje yapısı

```
bin/arexi.js     Komut satırı arayüzü, sohbet döngüsü, slash komutları
src/agent.js     Ajan döngüsü: akışlı API çağrıları, araç yürütme, izinler, oturum kaydı
src/tools.js     Araç tanımları, girdi doğrulama (zod) ve uygulamaları
src/prompt.js    Sistem talimatı ve AREXI.md hafıza yükleme
src/config.js    Ayarlar ve izin modları
src/ui.js        Renkli terminal çıktısı
test/            Araç testleri ve sahte API sunucusuyla uçtan uca ajan testi
```

## Geliştirme

```bash
npm test
```

Testler gerçek API anahtarı gerektirmez. Ajan döngüsü, yerel bir sahte Messages API sunucusuna karşı test edilir.
