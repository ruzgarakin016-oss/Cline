"""Telefon köprüsü - API anahtarsız, yerel ağ üzerinden.

SMS/bildirim/çaldırma : KDE Connect  (PC: kdeconnect-cli, telefon: KDE Connect uygulaması)
Arama başlatma        : ADB (Telefonda USB/Kablosuz hata ayıklama açık olmalı)
"""
import shutil
import subprocess


def _run(cmd, timeout=30):
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

    def call(self, number: str = "") -> str:
        """Telefondan gerçek arama başlatır (ADB)."""
        number = number or self.cfg["phone_number"]
        if not shutil.which("adb"):
            return "adb kurulu değil (sudo apt install adb)."
        if not number:
            return "numara yok."
        return _run(["adb", "shell", "am", "start", "-a", "android.intent.action.CALL",
                     "-d", f"tel:{number}"])

    def hangup(self) -> str:
        return _run(["adb", "shell", "input", "keyevent", "KEYCODE_ENDCALL"])
