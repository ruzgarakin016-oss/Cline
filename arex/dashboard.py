"""Yerel web paneli: canlı kamera, olaylar, alarm aç/kapa, sohbet, durum.

Tarayıcıda: http://127.0.0.1:8765  (telefondan erişim için dashboard_host=0.0.0.0 + dashboard_token)
"""
import hmac
import json
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import system
from .config import VERSION

UI = Path(__file__).with_name("ui.html")       # her istekte okunur: Arex arayüzünü kendisi değiştirebilir
ICON = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#02060b'/>"
        "<circle cx='32' cy='32' r='24' fill='none' stroke='#29e6ff' stroke-width='3' stroke-dasharray='14 5'/>"
        "<circle cx='32' cy='32' r='11' fill='#7af3ff'/><circle cx='32' cy='32' r='16' fill='none' stroke='#29e6ff' stroke-width='2'/></svg>")


def make_handler(app):
    cfg = app.cfg

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _auth(self):
            token = cfg.get("dashboard_token") or ""
            if not token:
                return True
            got = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("token", [""])[0]
            if hmac.compare_digest(got, token):
                return True
            self._send(401, b"token gerekli", "text/plain")
            return False

        def _send(self, code, body, ctype="application/json"):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, obj, code=200):
            self._send(code, json.dumps(obj, ensure_ascii=False).encode())

        def do_GET(self):
            if not self._auth():
                return
            path = urllib.parse.urlparse(self.path).path
            cam = app.camera
            if path == "/":
                return self._send(200, UI.read_bytes(), "text/html; charset=utf-8")
            if path == "/icon.svg":
                return self._send(200, ICON.encode(), "image/svg+xml")
            if path == "/api/status":
                dev = getattr(app, "dev", None)
                return self._json({"version": VERSION, "armed": bool(cam and cam.armed),
                                   "camera": cam.status if cam else "devre dışı",
                                   "state": getattr(app, "state", "idle"), "name": app.cfg["name"],
                                   "mood": app.brain.mood.v, "health": system.health(), "stats": system.stats(),
                                   "plugins": dev.loaded if dev else {}})
            if path == "/api/activity":
                return self._json(list(getattr(app.brain, "activity", []))[-40:])
            if path == "/api/events":
                evs = list(cam.events)[-50:] if cam else []
                return self._json([dict(e, snapshot=Path(e["snapshot"]).name if e.get("snapshot") else None)
                                   for e in evs])
            if path.startswith("/media/") and cam:
                from .camera import MEDIA
                name = Path(urllib.parse.unquote(path[7:])).name       # dizin dışına çıkılamaz
                f = MEDIA / "snapshots" / name
                if f.is_file():
                    return self._send(200, f.read_bytes(), "image/jpeg")
                return self._send(404, b"yok", "text/plain")
            if path == "/stream.mjpg":
                return self._stream()
            self._send(404, b"yok", "text/plain")

        def _stream(self):
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                while True:
                    cam = app.camera
                    jpg = None
                    if cam and cam.running:
                        with cam.lock:
                            jpg = cam.jpeg
                    if jpg:
                        self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                                         + str(len(jpg)).encode() + b"\r\n\r\n" + jpg + b"\r\n")
                    time.sleep(0.1 if jpg else 1.0)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def do_POST(self):
            if not self._auth():
                return
            path = urllib.parse.urlparse(self.path).path
            n = int(self.headers.get("Content-Length") or 0)
            try:
                data = json.loads(self.rfile.read(min(n, 100_000)) or b"{}")
            except ValueError:
                data = {}
            cam = app.camera
            if path == "/api/chat":
                reply = app.brain.think(str(data.get("text", ""))[:2000])
                return self._json({"reply": reply})
            if path == "/api/arm" and cam:
                return self._json({"result": cam.set_armed(bool(data.get("on")))})
            if path == "/api/camera" and cam:
                return self._json({"result": cam.stop() if cam.running else cam.start()})
            if path == "/api/action":
                from . import devtools
                name = data.get("name")
                actions = {"update": lambda: app.dev.self_update(), "rollback": devtools.rollback,
                           "restart": lambda: "Yeniden başlıyorum." + devtools.restart_self(),
                           "backup": lambda: "Yedek: " + devtools.backup("panel")}
                if name not in actions:
                    return self._json({"error": "bilinmeyen işlem"}, 400)
                return self._json({"result": actions[name]()})
            if path == "/api/snapshot" and cam:
                p = cam.snapshot()
                return self._json({"file": Path(p).name if p else None})
            self._json({"error": "bilinmeyen istek"}, 404)

    return H


def start(app):
    cfg = app.cfg
    host, port = cfg["dashboard_host"], int(cfg["dashboard_port"])
    if host not in ("127.0.0.1", "localhost") and not cfg.get("dashboard_token"):
        print("UYARI: Panel ağa açık ama dashboard_token boş. Güvenlik için yalnız 127.0.0.1'de açıyorum.")
        host = "127.0.0.1"
    try:
        srv = ThreadingHTTPServer((host, port), make_handler(app))
    except OSError as e:
        print(f"Panel başlatılamadı ({e}).")
        return None
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True, name="arex-dashboard").start()
    print(f"Panel: http://{host}:{port}/" + (f"?token={cfg['dashboard_token']}" if cfg.get("dashboard_token") else ""))
    return srv
