"""Görme: yerel Ollama görsel modeliyle (moondream/llava) fotoğraf/ekran anlatma, ekran OCR."""
import base64
import datetime
import json
import shutil
import subprocess
import urllib.request

from .config import HOME

SHOTS = HOME / "screenshots"


def describe_image(cfg, path: str, question: str = "") -> str:
    """Görseli yerel görsel modele sor. question boşsa genel anlatım."""
    try:
        data = base64.b64encode(open(path, "rb").read()).decode()
    except Exception as e:
        return f"hata: görüntü okunamadı ({e})"
    prompt = question or "Bu görüntüde ne var? Kısa ve net anlat."
    body = json.dumps({"model": cfg["vision_model"], "stream": False,
                       "messages": [{"role": "user", "content": prompt + " (Türkçe cevap ver)",
                                     "images": [data]}]}).encode()
    req = urllib.request.Request(cfg["ollama_url"] + "/api/chat", body, {"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=180).read())["message"]["content"].strip()
    except Exception as e:
        return f"Görme modeline ulaşamadım (ollama pull {cfg['vision_model']}): {e}"


SCREENSHOT_CMDS = [
    ("grim", ["grim", "{p}"]),                             # Wayland (sway/hyprland)
    ("gnome-screenshot", ["gnome-screenshot", "-f", "{p}"]),
    ("spectacle", ["spectacle", "-b", "-n", "-o", "{p}"]),  # KDE
    ("scrot", ["scrot", "-o", "{p}"]),
    ("import", ["import", "-window", "root", "{p}"]),      # ImageMagick / X11
]


def screenshot() -> str:
    SHOTS.mkdir(parents=True, exist_ok=True)
    path = str(SHOTS / f"{datetime.datetime.now():%Y%m%d_%H%M%S}.png")
    import sys
    if sys.platform == "win32":
        from .winsys import screenshot as win_shot
        return path if win_shot(path) else ""
    for exe, cmd in SCREENSHOT_CMDS:
        if shutil.which(exe):
            try:
                subprocess.run([c.replace("{p}", path) for c in cmd], timeout=20, capture_output=True)
                with open(path, "rb"):
                    return path
            except Exception:
                continue
    return ""


def ocr(path: str, lang: str = "tur+eng") -> str:
    import os
    exe = shutil.which("tesseract") or next((p for p in (r"C:\Program Files\Tesseract-OCR\tesseract.exe",)
                                             if os.path.exists(p)), None)
    if not exe:
        return "tesseract kurulu değil (sudo apt install tesseract-ocr tesseract-ocr-tur)."
    r = subprocess.run([exe, path, "-", "-l", lang], capture_output=True, text=True, timeout=120)
    return (r.stdout.strip() or r.stderr.strip() or "yazı bulunamadı")[:6000]
