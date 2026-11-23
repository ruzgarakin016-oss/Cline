"""Arex'in gözü: hareket algılama, kayıt, yüz/insan algılama, sahibini tanıma.

Tamamen yerel (OpenCV). Webcam, USB kamera veya RTSP/HTTP IP kamera ile çalışır.
"""
import collections
import datetime
import json
import threading
import time
from pathlib import Path

import cv2
import numpy as np

from .config import HOME

MEDIA = HOME / "camera"
FACES = HOME / "faces"


# ---------------------------------------------------------------- hareket
class MotionDetector:
    """MOG2 arka plan çıkarma + kontur filtreleme. Saf fonksiyon gibi test edilebilir."""

    def __init__(self, min_area=1500, sensitivity=25, warmup=15, ignore_zones=()):
        self.min_area = min_area
        self.warmup = warmup
        self.ignore_zones = list(ignore_zones or [])
        self.frames = 0
        self.sub = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=sensitivity,
                                                      detectShadows=True)
        self.kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))

    def process(self, frame):
        """frame (BGR) -> (kutular [(x,y,w,h)], hareket_oranı 0..1)."""
        self.frames += 1
        h, w = frame.shape[:2]
        scale = 320.0 / w if w > 320 else 1.0
        small = cv2.resize(frame, (int(w * scale), int(h * scale))) if scale != 1.0 else frame
        small = cv2.GaussianBlur(small, (5, 5), 0)
        mask = self.sub.apply(small)
        if self.frames <= self.warmup:
            return [], 0.0
        _, mask = cv2.threshold(mask, 200, 255, cv2.THRESH_BINARY)   # gölgeler (127) atılır
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, self.kernel)
        mask = cv2.dilate(mask, self.kernel, iterations=2)
        sh, sw = mask.shape[:2]
        for zx, zy, zw, zh in self.ignore_zones:
            mask[int(zy * sh):int((zy + zh) * sh), int(zx * sw):int((zx + zw) * sw)] = 0
        ratio = float(np.count_nonzero(mask)) / mask.size
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        # min_area 640px genişlik için tanımlı -> küçük kareye ölçekle
        min_small = self.min_area * (sw / 640.0) ** 2
        boxes = []
        for c in contours:
            if cv2.contourArea(c) < min_small:
                continue
            x, y, bw, bh = cv2.boundingRect(c)
            boxes.append((int(x / scale), int(y / scale), int(bw / scale), int(bh / scale)))
        return boxes, ratio


def is_tampered(frame) -> bool:
    """Kamera kapatıldı/karartıldı mı? (çok karanlık ve neredeyse tek renk)"""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return float(gray.mean()) < 12 and float(gray.std()) < 6


# ---------------------------------------------------------------- yüz / insan
class FaceID:
    """Yüz algılama (Haar) + isteğe bağlı tanıma (LBPH, opencv-contrib)."""

    def __init__(self):
        self.cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        self.hog = cv2.HOGDescriptor()
        self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
        self.recognizer = None
        self.names = {}
        self.can_recognize = hasattr(cv2, "face")
        FACES.mkdir(parents=True, exist_ok=True)
        self.train()

    def faces(self, gray):
        return [tuple(map(int, f)) for f in
                self.cascade.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=5, minSize=(50, 50))]

    def people(self, frame):
        h, w = frame.shape[:2]
        scale = 480.0 / w if w > 480 else 1.0
        small = cv2.resize(frame, (int(w * scale), int(h * scale))) if scale != 1.0 else frame
        rects, weights = self.hog.detectMultiScale(small, winStride=(8, 8), padding=(8, 8), scale=1.05)
        return [tuple(int(v / scale) for v in r) for r, wt in zip(rects, np.ravel(weights)) if wt > 0.5]

    def train(self):
        if not self.can_recognize:
            return False
        imgs, labels, self.names = [], [], {}
        for i, person in enumerate(sorted(p for p in FACES.iterdir() if p.is_dir())):
            self.names[i] = person.name
            for f in person.glob("*.png"):
                img = cv2.imread(str(f), cv2.IMREAD_GRAYSCALE)
                if img is not None:
                    imgs.append(cv2.resize(img, (200, 200)))
                    labels.append(i)
        if not imgs:
            self.recognizer = None
            return False
        self.recognizer = cv2.face.LBPHFaceRecognizer_create()
        self.recognizer.train(imgs, np.array(labels))
        return True

    def who(self, gray, box, threshold=70.0):
        """Yüz kutusu -> isim ya da 'yabancı'. Tanıma yoksa 'bilinmiyor'."""
        if self.recognizer is None:
            return "bilinmiyor"
        x, y, w, h = box
        roi = cv2.resize(gray[y:y + h, x:x + w], (200, 200))
        label, dist = self.recognizer.predict(roi)
        return self.names.get(label, "yabancı") if dist < threshold else "yabancı"

    def save_sample(self, name, gray, box, idx):
        x, y, w, h = box
        d = FACES / name
        d.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(d / f"{int(time.time())}_{idx}.png"), cv2.resize(gray[y:y + h, x:x + w], (200, 200)))


# ---------------------------------------------------------------- kamera servisi
class Camera:
    def __init__(self, cfg, on_event=None):
        self.cfg = cfg
        self.on_event = on_event or (lambda e: None)
        self.armed = bool(cfg["camera_armed_on_start"])
        self.detector = MotionDetector(cfg["motion_min_area"], cfg["motion_sensitivity"],
                                       ignore_zones=cfg["motion_ignore_zones"])
        self.faceid = FaceID()
        self.events = collections.deque(maxlen=300)
        self.lock = threading.Lock()
        self.frame = None            # son kare (BGR)
        self.jpeg = None             # panel için son kare (JPEG)
        self.running = False
        self.status = "kapalı"
        self.fps = 15.0
        self.preroll = collections.deque(maxlen=int(self.fps * cfg["clip_pre_seconds"]) or 1)
        self.writer = None
        self.clip_path = None
        self.clip_started = 0.0
        self.last_motion = 0.0
        self.last_alert = 0.0
        self.last_greet = {}
        self.tampered = False
        self._enroll = None          # (isim, kalan örnek)
        (MEDIA / "snapshots").mkdir(parents=True, exist_ok=True)
        (MEDIA / "clips").mkdir(parents=True, exist_ok=True)
        self._load_events()

    # ---- yaşam döngüsü
    def start(self):
        if self.running:
            return "Kamera zaten açık."
        self.running = True
        threading.Thread(target=self._loop, daemon=True, name="arex-camera").start()
        return "Kamera açılıyor."

    def stop(self):
        self.running = False
        return "Kamera kapatıldı."

    def _open(self):
        src = str(self.cfg["camera_source"])
        if src.isdigit():
            import sys
            cap = cv2.VideoCapture(int(src), cv2.CAP_DSHOW) if sys.platform == "win32" else cv2.VideoCapture(int(src))
        else:
            cap = cv2.VideoCapture(src)
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.cfg["camera_width"])
            fps = cap.get(cv2.CAP_PROP_FPS)
            if 1 < fps < 61:
                self.fps = fps
        return cap

    def _loop(self):
        cap, fails = self._open(), 0
        self.status = "açık" if cap.isOpened() else "kamera bulunamadı"
        last_jpeg = 0.0
        while self.running:
            ok, frame = cap.read()
            if not ok:
                fails += 1
                self.status = "görüntü alınamıyor, yeniden bağlanıyor"
                time.sleep(min(30, 2 * fails))
                cap.release()
                cap = self._open()
                continue
            fails = 0
            self.status = "açık"
            w = self.cfg["camera_width"]
            if frame.shape[1] > w:
                frame = cv2.resize(frame, (w, int(frame.shape[0] * w / frame.shape[1])))
            try:
                self._process(frame)
            except Exception as e:      # tek kötü kare servisi düşürmesin
                print("kamera hatası:", e)
            now = time.time()
            if now - last_jpeg > 0.1:
                last_jpeg = now
                ok, buf = cv2.imencode(".jpg", self._overlay(frame), [cv2.IMWRITE_JPEG_QUALITY, 75])
                if ok:
                    with self.lock:
                        self.jpeg = buf.tobytes()
        cap.release()
        self._close_clip()
        self.status = "kapalı"

    # ---- kare işleme
    def _process(self, frame):
        now = time.time()
        with self.lock:
            self.frame = frame
        self.preroll.append(frame)

        if self._enroll:
            self._enroll_step(frame)
            return

        tamper = is_tampered(frame)
        if tamper and not self.tampered:
            self._event("tamper", frame, "Kamera kapatıldı ya da karartıldı!")
        self.tampered = tamper
        if tamper:
            return

        boxes, ratio = self.detector.process(frame)
        self._last_boxes = boxes
        if ratio > 0.85:          # ani ışık değişimi: arka planı sıfırla
            self.detector = MotionDetector(self.cfg["motion_min_area"], self.cfg["motion_sensitivity"],
                                           ignore_zones=self.cfg["motion_ignore_zones"])
            return
        if boxes:
            self.last_motion = now
            if self.armed and self.cfg["record_clips"] and self.writer is None:
                self._open_clip(frame)
            if now - self.last_alert >= self.cfg["motion_cooldown"]:
                self._analyse(frame, boxes)
        if self.writer is not None:
            self.writer.write(frame)
            if (now - self.last_motion > self.cfg["clip_post_seconds"]
                    or now - self.clip_started > self.cfg["clip_max_seconds"]):
                self._close_clip()

    def _analyse(self, frame, boxes):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces, people, names = [], [], []
        if self.cfg["person_check"]:
            faces = self.faceid.faces(gray)
            names = [self.faceid.who(gray, f) for f in faces]
            if not faces:
                people = self.faceid.people(frame)
        known = [n for n in names if n not in ("yabancı", "bilinmiyor")]
        if known and self.cfg["greet_owner"]:
            for n in known:
                if time.time() - self.last_greet.get(n, 0) > 1800:
                    self.last_greet[n] = time.time()
                    self._event("known", frame, f"{n} görüldü.", faces=names)
        human = bool(faces or people)
        if self.cfg["alert_only_people"] and not human:
            return
        if known and not [n for n in names if n == "yabancı"]:
            return            # sadece tanıdık yüzler: alarm yok
        self.last_alert = time.time()
        what = ("yabancı bir yüz" if "yabancı" in names else
                "bir yüz" if faces else "bir insan" if people else "hareket")
        self._event("motion", frame, f"{what.capitalize()} algılandı.", boxes=boxes,
                    faces=names, people=len(people))

    # ---- olaylar
    def _event(self, kind, frame, text, **extra):
        stamp = datetime.datetime.now()
        snap = MEDIA / "snapshots" / f"{stamp:%Y%m%d_%H%M%S}_{kind}.jpg"
        cv2.imwrite(str(snap), self._overlay(frame))
        ev = {"time": stamp.strftime("%Y-%m-%d %H:%M:%S"), "type": kind, "text": text,
              "armed": self.armed, "snapshot": str(snap),
              "clip": str(self.clip_path) if self.clip_path else None}
        ev.update({k: v for k, v in extra.items() if k != "boxes"})
        self.events.append(ev)
        with open(MEDIA / "events.jsonl", "a") as f:
            f.write(json.dumps(ev, ensure_ascii=False) + "\n")
        threading.Thread(target=self.on_event, args=(ev,), daemon=True).start()

    def _load_events(self):
        f = MEDIA / "events.jsonl"
        if f.exists():
            for line in f.read_text().splitlines()[-300:]:
                try:
                    self.events.append(json.loads(line))
                except Exception:
                    pass

    # ---- kayıt
    def _open_clip(self, frame):
        stamp = datetime.datetime.now()
        self.clip_path = MEDIA / "clips" / f"{stamp:%Y%m%d_%H%M%S}.mp4"
        h, w = frame.shape[:2]
        self.writer = cv2.VideoWriter(str(self.clip_path), cv2.VideoWriter_fourcc(*"mp4v"), self.fps, (w, h))
        self.clip_started = time.time()
        for f in list(self.preroll):            # hareketten önceki saniyeler
            if f.shape[:2] == (h, w):
                self.writer.write(f)

    def _close_clip(self):
        if self.writer is not None:
            self.writer.release()
            self.writer = None
            self.clip_path = None

    def _overlay(self, frame):
        img = frame.copy()
        for x, y, w, h in getattr(self, "_last_boxes", []):
            cv2.rectangle(img, (x, y), (x + w, y + h), (0, 0, 255), 2)
        label = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        label += "  ALARM" if self.armed else ""
        label += "  REC" if self.writer is not None else ""
        cv2.putText(img, label, (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 3)
        cv2.putText(img, label, (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        return img

    # ---- yüz kaydı
    def enroll(self, name: str, samples: int = 25) -> str:
        if not self.faceid.can_recognize:
            return "Yüz tanıma için opencv-contrib-python-headless gerekli."
        if not self.running:
            self.start()
        name = "".join(c for c in name if c.isalnum() or c in "-_ ").strip() or "sahip"
        self._enroll = (name, int(samples))
        deadline = time.time() + 40
        while self._enroll and time.time() < deadline:
            time.sleep(0.5)
        if self._enroll:
            self._enroll = None
            return "Yüzünü yeterince göremedim; ışığı aç ve kameraya bak, tekrar deneyelim."
        self.faceid.train()
        return f"{name} yüzünü öğrendim. Artık seni tanıyacağım."

    def _enroll_step(self, frame):
        name, left = self._enroll
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self.faceid.faces(gray)
        if len(faces) == 1:
            self.faceid.save_sample(name, gray, faces[0], left)
            left -= 1
            time.sleep(0.15)
        self._enroll = (name, left) if left > 0 else None

    # ---- araçlar
    def snapshot(self) -> str:
        with self.lock:
            frame = None if self.frame is None else self.frame.copy()
        if frame is None:
            cap = self._open()
            ok, frame = cap.read() if cap.isOpened() else (False, None)
            cap.release()
            if not ok:
                return ""
        path = MEDIA / "snapshots" / f"{datetime.datetime.now():%Y%m%d_%H%M%S}_manual.jpg"
        cv2.imwrite(str(path), frame)
        return str(path)

    def set_armed(self, on) -> str:
        on = on if isinstance(on, bool) else str(on).lower() in ("1", "true", "evet", "aç", "on")
        self.armed = on
        if on and not self.running:
            self.start()
        if not on:
            self._close_clip()
        return "Alarm modu açık, evi izliyorum." if on else "Alarm modu kapalı."

    def describe_status(self) -> str:
        last = self.events[-1] if self.events else None
        s = f"Kamera {self.status}, alarm {'açık' if self.armed else 'kapalı'}"
        s += f", kayıtlı yüzler: {', '.join(self.faceid.names.values()) or 'yok'}"
        if last:
            s += f". Son olay {last['time']}: {last['text']}"
        return s

    def recent(self, n: int = 10) -> str:
        evs = list(self.events)[-int(n):]
        return "\n".join(f"{e['time']} [{e['type']}] {e['text']}" for e in evs) or "Olay yok."

    def cleanup(self, days=None):
        days = days or self.cfg["keep_media_days"]
        limit = time.time() - days * 86400
        n = 0
        for f in list((MEDIA / "snapshots").glob("*")) + list((MEDIA / "clips").glob("*")):
            if f.stat().st_mtime < limit:
                f.unlink(missing_ok=True)
                n += 1
        return n


def clips_dir() -> Path:
    return MEDIA / "clips"
