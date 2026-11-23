"""Windows karşılıkları: ses, medya, kilit, pano, pil, bellek, parlaklık, konuşma, ekran görüntüsü."""
import ctypes
import subprocess

NO_WINDOW = 0x08000000   # CREATE_NO_WINDOW


def ps(script: str, inp=None, timeout=30) -> str:
    try:
        r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
                           input=inp, capture_output=True, text=True, timeout=timeout,
                           creationflags=NO_WINDOW)
        return (r.stdout + r.stderr).strip()
    except Exception as e:
        return f"hata: {e}"


# ---- tuşlar (ses / medya)
VK = {"mute": 0xAD, "down": 0xAE, "up": 0xAF, "next": 0xB0, "previous": 0xB1, "stop": 0xB2, "play-pause": 0xB3}


def _key(vk, times=1):
    u = ctypes.windll.user32
    for _ in range(times):
        u.keybd_event(vk, 0, 0, 0)
        u.keybd_event(vk, 0, 2, 0)


def volume(level="") -> str:
    lv = str(level).strip().lower().rstrip("%")
    if lv in ("up", "artır", "aç"):
        _key(VK["up"], 5)
    elif lv in ("down", "azalt", "kıs"):
        _key(VK["down"], 5)
    elif lv in ("mute", "sessiz", "kapat", "unmute"):
        _key(VK["mute"])
    elif lv.isdigit():                       # her tuş %2: önce sıfırla, sonra istenen seviyeye çık
        _key(VK["down"], 50)
        _key(VK["up"], min(int(lv), 100) // 2)
    else:
        return "Ses seviyesi: 0-100, up, down veya mute söyle."
    return "Tamam."


def media(action="play-pause") -> str:
    a = {"oynat": "play-pause", "durdur": "play-pause", "play": "play-pause", "pause": "play-pause",
         "sonraki": "next", "önceki": "previous"}.get(action, action)
    if a not in VK or a in ("up", "down", "mute"):
        return "Desteklenen: play-pause, next, previous, stop."
    _key(VK[a])
    return "Tamam."


def brightness(level="") -> str:
    lv = str(level).strip().rstrip("%")
    if not lv.isdigit():
        return ps("(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness") or "?"
    return ps(f"(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods)"
              f".WmiSetBrightness(1,{min(int(lv), 100)})") or "Tamam."


def lock_screen() -> str:
    ctypes.windll.user32.LockWorkStation()
    return "Ekran kilitlendi."


def clipboard_get() -> str:
    return ps("Get-Clipboard -Raw")[:4000] or "(pano boş)"


def clipboard_set(text: str) -> str:
    ps("$input | Set-Clipboard", inp=text)
    return "Panoya kopyalandı."


class _Power(ctypes.Structure):
    _fields_ = [("ACLineStatus", ctypes.c_byte), ("BatteryFlag", ctypes.c_byte),
                ("BatteryLifePercent", ctypes.c_byte), ("SystemStatusFlag", ctypes.c_byte),
                ("BatteryLifeTime", ctypes.c_ulong), ("BatteryFullLifeTime", ctypes.c_ulong)]


def battery():
    s = _Power()
    if not ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(s)):
        return None
    pct = s.BatteryLifePercent & 0xFF
    if pct == 255 or (s.BatteryFlag & 0xFF) == 128:      # pil yok (masaüstü)
        return None
    return pct, s.ACLineStatus == 1


class _Mem(ctypes.Structure):
    _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong)] + \
               [(n, ctypes.c_ulonglong) for n in ("t", "a", "tp", "ap", "tv", "av", "ae")]


def mem_percent():
    m = _Mem()
    m.dwLength = ctypes.sizeof(m)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
    return float(m.dwMemoryLoad)


def say(text: str):
    """Windows'un kendi sesi (SAPI). Türkçe ses yüklüyse onu seçer."""
    script = ("Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; "
              "$v=$s.GetInstalledVoices()|?{$_.VoiceInfo.Culture.Name -like 'tr*'}|select -First 1; "
              "if($v){$s.SelectVoice($v.VoiceInfo.Name)}; $s.Speak([Console]::In.ReadToEnd())")
    ps(script, inp=text, timeout=120)


def screenshot(path: str) -> bool:
    try:
        from PIL import ImageGrab
        ImageGrab.grab(all_screens=True).save(path)
        return True
    except Exception:
        return False
