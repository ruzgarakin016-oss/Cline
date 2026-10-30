"""Arex ayarları. Hepsi yerel; API anahtarı yok."""
import json
import os
from pathlib import Path

HOME = Path(os.environ.get("AREX_HOME", Path.home() / ".arex"))
HOME.mkdir(parents=True, exist_ok=True)

DEFAULTS = {
    "name": "Arex",
    "owner": "Efendim",
    "ollama_url": "http://127.0.0.1:11434",
    "model": "llama3.1:8b",          # ollama pull llama3.1:8b
    "language": "tr",
    "wake_word": "arex",
    "vosk_model_path": str(HOME / "vosk-model-small-tr-0.3"),
    "piper_model": "",               # örn. ~/.arex/tr_TR-dfki-medium.onnx (opsiyonel)
    "phone_device": "",              # kdeconnect cihaz id (boşsa ilk bağlı cihaz)
    "phone_number": "",              # SMS/arama için senin numaran
    "allow_dangerous": True,         # bilgisayara tam erişim
    "proactive_minutes": 45,         # kendiliğinden seni arama/yazma aralığı (0 = kapalı)
}


def load():
    path = HOME / "config.json"
    cfg = dict(DEFAULTS)
    if path.exists():
        cfg.update(json.loads(path.read_text()))
    else:
        path.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
    return cfg
