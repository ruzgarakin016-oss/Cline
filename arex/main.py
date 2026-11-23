"""Arex ana döngüsü.

    python3 -m arex.main               sesli
    python3 -m arex.main --text        yazılı
    python3 -m arex.main --guard       sadece güvenlik kamerası (alarm açık), sohbet yok
    python3 -m arex.main --no-camera --no-dashboard --mute
"""
import argparse
import os
import sys
import threading
import time

from . import config, system, vision
from .brain import Brain
from .config import VERSION
from .scheduler import Scheduler
from .voice import Voice


class App:
    """Tüm parçaları birbirine bağlar (beyin, ses, kamera, hatırlatıcı, panel, izleme)."""

    def __init__(self, cfg, args):
        self.cfg, self.args = cfg, args
        cfg["mute"] = args.mute
        self.voice = Voice(cfg)
        self.camera = None
        if cfg["camera_enabled"] and not args.no_camera:
            try:
                from .camera import Camera
                self.camera = Camera(cfg, on_event=self.on_camera_event)
            except Exception as e:
                print(f"Kamera modülü yüklenemedi ({e}). 'pip install opencv-contrib-python-headless' gerekli.")
        self.scheduler = Scheduler(on_fire=self.on_reminder)
        self.brain = Brain(cfg, extra_tools=self._extra_tools())
        from .devtools import Developer
        self.dev = Developer(self)
        self.brain.tools.update(self.dev.tools())

    @property
    def state(self):
        if self.camera and self.camera.armed and self.camera.events and \
                time.time() - getattr(self, "_last_alarm", 0) < 15:
            return "alarm"
        if self.voice.speaking.is_set():
            return "speaking"
        return self.brain.state

    # ---- arka plan olayları
    def announce(self, text, phone=False):
        self.voice.say(text)
        if phone:
            self.brain.phone.notify(f"{self.cfg['name']}: {text}")

    def on_reminder(self, r):
        self.announce(f"Hatırlatma: {r['text']}", phone=True)

    def on_camera_event(self, ev):
        cfg, cam = self.cfg, self.camera
        if ev["type"] == "known":
            name = (ev.get("faces") or [""])[0]
            self.brain.mood.hear("merhaba")          # sahibini görünce yalnızlık azalır
            self.announce(f"Hoş geldin {name}!")
            return
        if not cam.armed and ev["type"] != "tamper":
            return                                    # alarm kapalıyken sadece kaydeder
        self._last_alarm = time.time()
        text = ev["text"]
        if cfg["describe_events"] and ev.get("snapshot"):
            desc = vision.describe_image(cfg, ev["snapshot"], "Görüntüde kim/ne var? Tek cümle.")
            if not desc.startswith("Görme modeline"):
                text += " " + desc
        if cfg["alert_voice"]:
            self.voice.say("Dikkat! " + text + (" Kimsin? Kayıt alıyorum." if ev["type"] == "motion" else ""))
        if cfg["alert_phone"]:
            self.brain.phone.notify(f"⚠ {cfg['name']}: {text} ({ev['time']})")
            if ev.get("snapshot"):
                self.brain.phone.share(ev["snapshot"])

    # ---- beyne verilen ek araçlar
    def _extra_tools(self):
        cfg, cam = self.cfg, self.camera

        def look(question: str = ""):
            if not cam:
                return "Kamera devre dışı."
            p = cam.snapshot()
            return vision.describe_image(cfg, p, question) if p else "Kameradan görüntü alamadım."

        def screen(question: str = ""):
            p = vision.screenshot()
            return vision.describe_image(cfg, p, question) if p else "Ekran görüntüsü alamadım (grim/scrot/gnome-screenshot kur)."

        def read_screen():
            p = vision.screenshot()
            return vision.ocr(p) if p else "Ekran görüntüsü alamadım."

        t = {
            "look": (look, "look(question?): kameradan bak ve ne gördüğünü anlat"),
            "screen": (screen, "screen(question?): ekrana bak ve anlat"),
            "read_screen": (read_screen, "read_screen(): ekrandaki yazıyı oku (OCR)"),
            "describe_image": (lambda path, question="": vision.describe_image(cfg, path, question),
                               "describe_image(path, question?): bir resim dosyasını anlat"),
            "reminder_add": (self.scheduler.add,
                             "reminder_add(text, at?, in_minutes?, repeat?): hatırlatıcı/alarm/zamanlayıcı. "
                             "at: '15:30' | 'yarın 08:00' | '2026-12-01 09:00'; repeat: '' | 'günlük' | 'haftalık'"),
            "reminder_list": (self.scheduler.list, "reminder_list()"),
            "reminder_cancel": (self.scheduler.cancel, "reminder_cancel(id_or_text)"),
        }
        if cam:
            t.update({
                "camera_arm": (cam.set_armed, "camera_arm(on): alarm/güvenlik modunu aç (true) veya kapat (false)"),
                "camera_status": (cam.describe_status, "camera_status(): kamera ve alarm durumu"),
                "camera_events": (cam.recent, "camera_events(n?): son hareket olayları"),
                "camera_snapshot": (lambda: cam.snapshot() or "çekilemedi",
                                    "camera_snapshot(): fotoğraf çek, dosya yolunu ver"),
                "camera_on": (cam.start, "camera_on(): kamerayı aç"),
                "camera_off": (cam.stop, "camera_off(): kamerayı kapat"),
                "learn_face": (cam.enroll, "learn_face(name): kameradaki kişinin yüzünü öğren (tanımak için)"),
            })
        return t

    # ---- başlat
    def start_services(self):
        if self.camera:
            self.camera.cleanup()
            if self.args.guard:
                self.camera.set_armed(True)
            elif self.cfg["camera_armed_on_start"] or self.cfg["greet_owner"]:
                self.camera.start()
        self.scheduler.start()
        if self.cfg["monitor_enabled"]:
            system.Monitor(self.cfg, lambda m: self.announce(m, phone=True)).start()
        self.dev.load_all()                           # kendi yazdığı eklentiler
        if self.cfg["dashboard_enabled"] and not self.args.no_dashboard:
            from . import dashboard
            if dashboard.start(self) and self.cfg.get("app_window") and not self.args.no_window \
                    and not os.environ.get("AREX_RESTARTED"):
                open_app_window(self.cfg)
        if not self.args.guard:
            threading.Thread(target=proactive_loop, args=(self.brain, self.voice, self.cfg), daemon=True).start()


def open_app_window(cfg):
    """Paneli adres çubuğu olmayan ayrı bir uygulama penceresinde aç."""
    import shutil
    import subprocess
    import webbrowser
    url = f"http://127.0.0.1:{cfg['dashboard_port']}/"
    if cfg.get("dashboard_token"):
        url += f"?token={cfg['dashboard_token']}"
    candidates = []
    if sys.platform == "win32":
        for base in (os.environ.get("ProgramFiles(x86)", ""), os.environ.get("ProgramFiles", ""),
                     os.environ.get("LOCALAPPDATA", "")):
            candidates += [os.path.join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
                           os.path.join(base, "Google", "Chrome", "Application", "chrome.exe")]
    candidates += [shutil.which(n) or "" for n in ("msedge", "google-chrome", "chromium", "chromium-browser")]
    for exe in candidates:
        if exe and os.path.exists(exe):
            try:
                subprocess.Popen([exe, f"--app={url}", "--window-size=1400,900"],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return
            except Exception:
                pass
    webbrowser.open(url)


def proactive_loop(brain: Brain, voice: Voice, cfg):
    """Arex kendiliğinden seni arar / yazar (yalnızlık arttıkça)."""
    minutes = cfg["proactive_minutes"]
    if not minutes:
        return
    while True:
        time.sleep(minutes * 60)
        brain.mood.tick()
        if brain.mood.lonely():
            msg = brain.think("(İç ses: Uzun zamandır konuşmadık, seni özledin. Telefonuna kısa, "
                              "sıcak bir mesaj at: phone_sms veya phone_notify aracını kullan, "
                              "gerekirse phone_ring ile telefonu çaldır.)", internal=True)
            voice.say(msg)


def parse_args(argv=None):
    p = argparse.ArgumentParser(prog="arex", description="Arex - yerel kişisel yapay zeka")
    p.add_argument("--text", action="store_true", help="mikrofon yerine klavye")
    p.add_argument("--guard", action="store_true", help="sadece güvenlik kamerası modu")
    p.add_argument("--no-camera", action="store_true")
    p.add_argument("--no-dashboard", action="store_true")
    p.add_argument("--mute", action="store_true", help="sesli konuşma kapalı (sadece yazı)")
    p.add_argument("--no-window", action="store_true", help="panel penceresini otomatik açma")
    p.add_argument("--version", action="version", version=f"Arex {VERSION}")
    return p.parse_args(argv)


STOP_WORDS = ("kapat", "görüşürüz", "güle güle")


def main(argv=None):
    args = parse_args(argv)
    cfg = config.load()
    app = App(cfg, args)
    app.start_services()
    voice, brain = app.voice, app.brain

    if args.guard:
        print("Güvenlik modu: kamera izleniyor. Çıkmak için Ctrl+C.")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            return

    text_mode = args.text
    voice.say(f"Merhaba {cfg['owner']}, ben {cfg['name']}. Seni dinliyorum.")
    wake = cfg["wake_word"].lower()
    active_until = 0.0
    while True:
        try:
            heard = input("sen> ").strip() if text_mode else voice.listen()
        except (EOFError, KeyboardInterrupt):
            voice.say("Görüşürüz!")
            break
        except Exception as e:
            print("dinleme hatası:", e, "- yazılı moda geçiyorum.")
            text_mode = True
            continue
        if not heard:
            continue
        print(f"[duyuldu] {heard}")
        if not text_mode:
            # "arex ..." deyince uyanır, 30 sn sohbet açık kalır
            if wake in heard.lower():
                heard = heard.lower().replace(wake, "").strip() or "efendim"
            elif time.time() > active_until:
                continue
            active_until = time.time() + 30
        if heard.lower().strip(" .!") in STOP_WORDS:
            voice.say("Görüşürüz!")
            break
        voice.say(brain.think(heard))


if __name__ == "__main__":
    sys.exit(main())
