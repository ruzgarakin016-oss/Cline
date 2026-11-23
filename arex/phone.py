"""Telefon köprüsü - API anahtarsız, yerel ağ üzerinden.

SMS/bildirim/çaldırma : KDE Connect  (PC: kdeconnect-cli, telefon: KDE Connect uygulaması)
Arama başlatma        : ADB (Telefonda USB/Kablosuz hata ayıklama açık olmalı)
"""
import os
import shutil
import subprocess

_KDE_WIN = r"C:\Program Files\KDE Connect\bin\kdeconnect-cli.exe"
_which = shutil.which


def _find(name):
    """Windows'ta KDE Connect PATH'te olmayabilir; kurulum klasörüne de bak."""
    p = _which(name)
    if not p and name == "kdeconnect-cli" and os.path.exists(_KDE_WIN):
        p = _KDE_WIN
    return p


class _Shutil:
    which = staticmethod(_find)


shutil = _Shutil()   # noqa: F811  (aşağıdaki kod shutil.which ile Windows yolunu da bulur)


def _run(cmd, timeout=30):
    if cmd and cmd[0] == "kdeconnect-cli":
        cmd = [_find("kdeconnect-cli") or cmd[0]] + cmd[1:]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return (r.stdout + r.stderr).strip() or "tamam"
    except Exception as e:
        return f"hata: {e}"


class Phone:
    def __init__(self, cfg):
        self.cfg = cfg

    def _device(self):
        if self.cfg["phone_device"]:
            return self.cfg["phone_device"]
        out = _run(["kdeconnect-cli", "-a", "--id-only"])
        return out.splitlines()[0] if out and "hata" not in out else ""

    def notify(self, text: str) -> str:
        """Telefona bildirim/ping gönderir."""
        if not shutil.which("kdeconnect-cli"):
            return "kdeconnect-cli kurulu değil (sudo apt install kdeconnect)."
        dev = self._device()
        if not dev:
            return "Bağlı telefon bulunamadı; KDE Connect ile eşleştir."
        return _run(["kdeconnect-cli", "-d", dev, "--ping-msg", text])

    def sms(self, text: str, number: str = "") -> str:
        number = number or self.cfg["phone_number"]
        if not number:
            return "phone_number ayarlı değil."
        if not shutil.which("kdeconnect-cli"):
            return "kdeconnect-cli kurulu değil."
        dev = self._device()
        if not dev:
            return "Bağlı telefon yok."
        return _run(["kdeconnect-cli", "-d", dev, "--send-sms", text, "--destination", number])

    def ring(self) -> str:
        """Telefonu yüksek sesle çaldırır (seni 'arar')."""
        if not shutil.which("kdeconnect-cli"):
            return "kdeconnect-cli kurulu değil."
        dev = self._device()
        return _run(["kdeconnect-cli", "-d", dev, "--ring"]) if dev else "Bağlı telefon yok."

    def battery(self) -> str:
        if not shutil.which("adb"):
            return "adb kurulu değil."
        out = _run(["adb", "shell", "dumpsys", "battery"])
        lv = [l for l in out.splitlines() if "level" in l]
        return ("Telefon pili: %" + lv[0].split(":")[1].strip()) if lv else out

    def call(self, number: str = "") -> str:
        """Telefondan gerçek arama başlatır (ADB)."""
        number = number or self.cfg["phone_number"]
        if not shutil.which("adb"):
            return "adb kurulu değil (sudo apt install adb)."
        if not number:
            return "numara yok."
        return _run(["adb", "shell", "am", "start", "-a", "android.intent.action.CALL",
                     "-d", f"tel:{number}"])

    def share(self, path: str) -> str:
        """Dosyayı (ör. hareket fotoğrafı) telefona gönderir."""
        if not shutil.which("kdeconnect-cli"):
            return "kdeconnect-cli kurulu değil."
        dev = self._device()
        return _run(["kdeconnect-cli", "-d", dev, "--share", path], timeout=120) if dev else "Bağlı telefon yok."

    def find(self) -> str:
        """Kayıp telefonu bul: çaldırır."""
        return self.ring()

    def hangup(self) -> str:
        return _run(["adb", "shell", "input", "keyevent", "KEYCODE_ENDCALL"])
