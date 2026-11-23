"""Arex ayarları. Hepsi yerel; API anahtarı yok."""
import json
import os
from pathlib import Path

VERSION = "2.0.0"

HOME = Path(os.environ.get("AREX_HOME", Path.home() / ".arex"))
HOME.mkdir(parents=True, exist_ok=True)

DEFAULTS = {
    "name": "Arex",
    "owner": "Efendim",
    "ollama_url": "http://127.0.0.1:11434",
    "model": "llama3.1:8b",          # ollama pull llama3.1:8b
    "vision_model": "moondream",     # ollama pull moondream  (görme: kamera/ekran anlatma)
    "coder_model": "qwen2.5-coder:7b", # ollama pull qwen2.5-coder:7b  (kendine kod yazma)
    "update_url": "https://codeload.github.com/ruzgarakin016-oss/Cline/zip/refs/heads/arex",
    "app_window": True,              # paneli ayrı uygulama penceresinde aç (Edge/Chrome --app)
    "language": "tr",
    "wake_word": "arex",
    "vosk_model_path": str(HOME / "vosk-model-small-tr-0.3"),
    "piper_model": "",               # örn. ~/.arex/tr_TR-dfki-medium.onnx (opsiyonel)
    "phone_device": "",              # kdeconnect cihaz id (boşsa ilk bağlı cihaz)
    "phone_number": "",              # SMS/arama için senin numaran
    "allow_dangerous": True,         # bilgisayara tam erişim
    "block_catastrophic": True,      # rm -rf /, mkfs, dd of=/dev/sdX gibi yıkıcı komutları her zaman engelle
    "proactive_minutes": 45,         # kendiliğinden seni arama/yazma aralığı (0 = kapalı)

    # ---- kamera / güvenlik ----
    "camera_enabled": True,
    "camera_source": "0",            # 0 = ilk webcam; RTSP/HTTP adresi de olur (IP kamera / telefon kamerası)
    "camera_width": 640,
    "camera_armed_on_start": False,  # açılışta alarm modu
    "motion_min_area": 1500,         # 640px genişlikte en küçük hareket alanı (piksel²); büyüt = daha az hassas
    "motion_sensitivity": 25,        # MOG2 varThreshold; küçük = daha hassas
    "motion_cooldown": 20,           # iki hareket bildirimi arası en az saniye
    "motion_ignore_zones": [],       # [[x,y,w,h], ...] 0..1 oranı; örn. perde/ağaç bölgesi
    "record_clips": True,            # hareket olunca video kaydet
    "clip_pre_seconds": 3,           # hareketten önceki kaç saniye klibe eklensin
    "clip_post_seconds": 5,          # hareket bittikten sonra kaç saniye daha kaydetsin
    "clip_max_seconds": 60,
    "person_check": True,            # hareket karesinde insan (HOG) / yüz ara
    "alert_only_people": False,      # True: sadece insan/yüz varsa bildir (kedi, gölge vb. yok say)
    "alert_phone": True,             # alarm modunda telefona bildirim + fotoğraf
    "alert_voice": True,             # alarm modunda sesli uyarı
    "describe_events": False,        # olay fotoğrafını görme modeliyle anlat (yavaş)
    "greet_owner": True,             # tanıdığı yüzü görünce selam ver
    "keep_media_days": 7,            # eski fotoğraf/klipleri sil

    # ---- web paneli ----
    "dashboard_enabled": True,
    "dashboard_host": "127.0.0.1",   # telefondan erişmek için "0.0.0.0" + dashboard_token
    "dashboard_port": 8765,
    "dashboard_token": "",           # boş değilse ?token=... gerekir

    # ---- sistem izleme ----
    "monitor_enabled": True,
    "monitor_cpu_temp": 85,          # °C üstü uyar
    "monitor_disk_percent": 92,      # disk doluluk % üstü uyar
    "monitor_battery_low": 15,       # pil % altı (şarjda değilken) uyar
    "city": "",                      # hava durumu için varsayılan şehir
}


def load():
    path = HOME / "config.json"
    cfg = dict(DEFAULTS)
    if path.exists():
        try:
            user = json.loads(path.read_text())
        except Exception as e:
            print(f"config.json okunamadı ({e}); varsayılanlar kullanılıyor.")
            user = {}
        cfg.update(user)
        if set(DEFAULTS) - set(user):          # yeni sürümle gelen ayarları dosyaya ekle
            path.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
    else:
        path.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
    return cfg
