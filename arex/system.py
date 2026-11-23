"""Bilgisayar kontrolü (ses, medya, parlaklık, kilit, pano, pil) ve sağlık izleme."""
import glob
import os
import shutil
import subprocess
import sys
import threading
import time

WIN = sys.platform == "win32"
if WIN:
    from . import winsys


def _run(cmd, inp=None, timeout=10):
    try:
        r = subprocess.run(cmd, input=inp, capture_output=True, text=True, timeout=timeout)
        return (r.stdout + r.stderr).strip()
    except Exception as e:
        return f"hata: {e}"


def volume(level: str = "") -> str:
    """level: 0-100 | 'up' | 'down' | 'mute' | 'unmute' | '' (sorgula)"""
    if WIN:
        return winsys.volume(level)
    lv = str(level).strip().lower().rstrip("%")
    if shutil.which("pactl"):
        sink = "@DEFAULT_SINK@"
        if lv in ("up", "artır", "aç"):
            _run(["pactl", "set-sink-volume", sink, "+10%"])
        elif lv in ("down", "azalt", "kıs"):
            _run(["pactl", "set-sink-volume", sink, "-10%"])
        elif lv in ("mute", "sessiz", "kapat"):
            _run(["pactl", "set-sink-mute", sink, "1"])
        elif lv in ("unmute",):
            _run(["pactl", "set-sink-mute", sink, "0"])
        elif lv.isdigit():
            _run(["pactl", "set-sink-volume", sink, f"{min(int(lv), 150)}%"])
        out = _run(["pactl", "get-sink-volume", sink])
        return "Ses: " + (out.split("/")[1].strip() if "/" in out else out)
    if shutil.which("amixer"):
        arg = {"up": "10%+", "down": "10%-", "mute": "mute", "unmute": "unmute"}.get(lv, f"{lv}%" if lv.isdigit() else "")
        return _run(["amixer", "-q", "sset", "Master", arg] if arg else ["amixer", "get", "Master"]) or "tamam"
    return "Ses kontrolü için pactl veya amixer gerekli."


def media(action: str = "play-pause") -> str:
    """play-pause | next | previous | stop | status"""
    if WIN:
        return winsys.media(action)
    if not shutil.which("playerctl"):
        return "playerctl kurulu değil (sudo apt install playerctl)."
    a = {"oynat": "play", "durdur": "pause", "sonraki": "next", "önceki": "previous"}.get(action, action)
    if a == "status":
        return _run(["playerctl", "metadata", "--format", "{{status}}: {{artist}} - {{title}}"]) or "çalan yok"
    return _run(["playerctl", a]) or "tamam"


def brightness(level: str = "") -> str:
    if WIN:
        return winsys.brightness(level)
    if not shutil.which("brightnessctl"):
        return "brightnessctl kurulu değil."
    lv = str(level).strip().rstrip("%")
    arg = {"up": "+10%", "down": "10%-"}.get(lv, f"{lv}%" if lv.isdigit() else "")
    return _run(["brightnessctl", "set", arg] if arg else ["brightnessctl", "info"])


def lock_screen() -> str:
    if WIN:
        return winsys.lock_screen()
    for cmd in (["loginctl", "lock-session"], ["xdg-screensaver", "lock"],
                ["gnome-screensaver-command", "-l"]):
        if shutil.which(cmd[0]) and not _run(cmd).startswith("hata"):
            return "Ekran kilitlendi."
    return "Ekranı kilitleyemedim."


def clipboard_get() -> str:
    if WIN:
        return winsys.clipboard_get()
    for cmd in (["wl-paste", "-n"], ["xclip", "-o", "-selection", "clipboard"], ["xsel", "-ob"]):
        if shutil.which(cmd[0]):
            return _run(cmd)[:4000] or "(pano boş)"
    return "wl-clipboard veya xclip kurulu değil."


def clipboard_set(text: str) -> str:
    if WIN:
        return winsys.clipboard_set(text)
    for cmd in (["wl-copy"], ["xclip", "-selection", "clipboard"], ["xsel", "-ib"]):
        if shutil.which(cmd[0]):
            _run(cmd, inp=text)
            return "Panoya kopyalandı."
    return "wl-clipboard veya xclip kurulu değil."


def battery():
    """(yüzde, şarjda_mı) ya da None"""
    if WIN:
        return winsys.battery()
    for b in glob.glob("/sys/class/power_supply/BAT*"):
        try:
            cap = int(open(f"{b}/capacity").read())
            st = open(f"{b}/status").read().strip()
            return cap, st in ("Charging", "Full", "Not charging")
        except Exception:
            pass
    return None


def cpu_temp():
    if WIN:
        return None
    temps = []
    for z in glob.glob("/sys/class/thermal/thermal_zone*/temp"):
        try:
            temps.append(int(open(z).read()) / 1000)
        except Exception:
            pass
    return max(temps) if temps else None


def disk_percent(path=None):
    u = shutil.disk_usage(path or os.path.abspath(os.sep))
    return 100.0 * u.used / u.total if u.total else 0.0


def mem_percent():
    if WIN:
        return winsys.mem_percent()
    info = {}
    for line in open("/proc/meminfo"):
        k, v = line.split(":", 1)
        info[k] = int(v.split()[0])
    return 100.0 * (1 - info.get("MemAvailable", 0) / info["MemTotal"])


_cpu_prev = None


def _cpu_times():
    if WIN:
        import ctypes
        i, k, u = (ctypes.c_ulonglong() for _ in range(3))
        ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(i), ctypes.byref(k), ctypes.byref(u))
        return i.value, k.value + u.value               # kernel süresi boşta süreyi de içerir
    v = [int(x) for x in open("/proc/stat").readline().split()[1:]]
    idle = v[3] + (v[4] if len(v) > 4 else 0)
    return idle, sum(v)


def cpu_percent() -> float:
    """İki çağrı arasındaki işlemci kullanımı (%)."""
    global _cpu_prev
    try:
        cur = _cpu_times()
    except Exception:
        return 0.0
    prev, _cpu_prev = _cpu_prev, cur
    if not prev or cur[1] == prev[1]:
        return 0.0
    return max(0.0, min(100.0, 100.0 * (1 - (cur[0] - prev[0]) / (cur[1] - prev[1]))))


def stats() -> dict:
    b = battery()
    return {"cpu": round(cpu_percent(), 1), "mem": round(mem_percent(), 1), "disk": round(disk_percent(), 1),
            "temp": cpu_temp(), "battery": b[0] if b else None, "charging": b[1] if b else None}


def health() -> str:
    load = f"yük {os.getloadavg()[0]:.2f} " if hasattr(os, "getloadavg") else ""
    parts = [f"{load}({os.cpu_count()} çekirdek)",
             f"bellek %{mem_percent():.0f}", f"disk %{disk_percent():.0f}"]
    t = cpu_temp()
    if t is not None:
        parts.append(f"sıcaklık {t:.0f}°C")
    b = battery()
    if b:
        parts.append(f"pil %{b[0]}{' (şarjda)' if b[1] else ''}")
    return ", ".join(parts)


class Monitor:
    """Sorun olunca bir kez uyarır (aynı uyarıyı 30 dk tekrarlamaz)."""

    def __init__(self, cfg, alert):
        self.cfg, self.alert, self.last = cfg, alert, {}

    def check(self):
        out = []
        t = cpu_temp()
        if t is not None and t >= self.cfg["monitor_cpu_temp"]:
            out.append(("temp", f"İşlemci çok ısındı: {t:.0f} derece."))
        d = disk_percent()
        if d >= self.cfg["monitor_disk_percent"]:
            out.append(("disk", f"Disk neredeyse dolu: yüzde {d:.0f}."))
        b = battery()
        if b and not b[1] and b[0] <= self.cfg["monitor_battery_low"]:
            out.append(("bat", f"Pil azaldı: yüzde {b[0]}. Şarja tak."))
        return out

    def run(self):
        while True:
            for key, msg in self.check():
                if time.time() - self.last.get(key, 0) > 1800:
                    self.last[key] = time.time()
                    self.alert(msg)
            time.sleep(60)

    def start(self):
        threading.Thread(target=self.run, daemon=True, name="arex-monitor").start()
