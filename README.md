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

## 📱 Telefon uygulaması

Arexi bilgisayarında çalışır, sen telefondan yönetirsin. Komutlar ve dosya işlemleri bilgisayarında yapılır. API anahtarı telefona hiç gitmez.

```bash
arexi serve            # izin isteyen modda başlat
arexi serve --full     # tam yetki: telefondan gelen görevler onay sorulmadan yapılır
```

1. Bilgisayarda `arexi serve` çalıştır. Terminalde bir bağlantı ve bir QR kod çıkar.
2. Telefon ve bilgisayar **aynı Wi-Fi ağında** olsun. QR kodu telefonun kamerasıyla okut.
3. Açılan sayfayı uygulama olarak kur:
   - **Android (Chrome):** ⋮ menüsü → *Ana ekrana ekle*.
   - **iPhone (Safari):** Paylaş → *Ana Ekrana Ekle*.

Uygulamada şunları yapabilirsin:
- Görev verirsin, Arexi'nin yazdıklarını, düşüncelerini ve komut çıktılarını canlı izlersin.
- İzin isteyen işlemleri **İzin ver / Reddet / Tümüne izin ver** düğmeleriyle onaylarsın.
- Çalışan bir görevi ■ düğmesiyle durdurursun.
- ⚙︎ menüsünden izin modunu, düşünme derinliğini ve modeli değiştirir, yeni oturum başlatırsın.

Uygulama kapanıp açılsa da konuşma kaybolmaz. Telefon yeniden bağlandığında geçmiş baştan yüklenir.

| Seçenek | Açıklama |
|---|---|
| `--port 7777` | Sunucu portu |
| `--host 0.0.0.0` | Dinlenecek adres. Sadece bu bilgisayardan erişim için `127.0.0.1` |
| `--full`, `--mode`, `--model`, `--effort` | Terminaldeki `arexi` ile aynı |
| `--new-token` | Erişim anahtarını yenile. Eski bağlantılar çalışmaz hale gelir |

**Güvenlik:**
- QR koddaki bağlantı, bilgisayarına erişim veren gizli bir anahtar içerir. Kimseyle paylaşma.
- Anahtar `~/.arexi/server-token` dosyasında durur. Sızdığını düşünürsen `arexi serve --new-token` çalıştır.
- Bağlantı ev ağı içinde şifresiz HTTP kullanır. Kafe veya okul gibi ortak Wi-Fi ağlarında kullanma.
- Evin dışından bağlanmak istiyorsan modemde port açma. Bunun yerine [Tailscale](https://tailscale.com) gibi özel bir VPN kullan. Tailscale ile HTTPS de alırsın ve uygulama çevrimdışı açılış desteğiyle tam kurulur.

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
src/server.js    Telefon uygulaması sunucusu (arexi serve): API, olay akışı, erişim anahtarı
src/terminal.js  Ajan olaylarını terminale çizen arayüz
src/config.js    Ayarlar ve izin modları
src/ui.js        Renkli terminal çıktısı
public/          Telefon uygulaması (PWA): arayüz, manifest, service worker, simge
test/            Araç, ajan ve telefon sunucusu testleri (sahte API sunucusuyla)
```

## Geliştirme

```bash
npm test
```

Testler gerçek API anahtarı gerektirmez. Ajan döngüsü, yerel bir sahte Messages API sunucusuna karşı test edilir.
