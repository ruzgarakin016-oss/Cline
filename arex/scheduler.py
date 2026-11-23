"""Hatırlatıcılar, zamanlayıcılar ve alarmlar (kalıcı; Arex kapanıp açılsa da kaybolmaz)."""
import datetime
import json
import re
import threading
import time
import uuid

from .config import HOME

FILE = HOME / "reminders.json"


def parse_when(at: str = "", in_minutes=None, now=None) -> float:
    """'15:30', '2026-12-01 09:00', 'yarın 08:00' veya dakika -> unix zamanı."""
    now = now or datetime.datetime.now()
    if in_minutes not in (None, ""):
        return (now + datetime.timedelta(minutes=float(in_minutes))).timestamp()
    at = (at or "").strip().lower()
    if not at:
        raise ValueError("zaman yok")
    day = now.date()
    if at.startswith("yarın"):
        day += datetime.timedelta(days=1)
        at = at[5:].strip()
    if re.fullmatch(r"\d{1,2}\.\d{1,2} \d{1,2}:\d{2}", at):      # '24.12 09:00' -> bu yıl
        d, rest = at.split(" ")
        at = f"{d}.{now.year} {rest}"
    for fmt in ("%Y-%m-%d %H:%M", "%d.%m.%Y %H:%M"):
        try:
            return datetime.datetime.strptime(at, fmt).timestamp()
        except ValueError:
            pass
    m = re.fullmatch(r"(\d{1,2})[:.](\d{2})", at)
    if not m:
        raise ValueError(f"zaman anlaşılamadı: {at}")
    dt = datetime.datetime.combine(day, datetime.time(int(m[1]), int(m[2])))
    if dt <= now:
        dt += datetime.timedelta(days=1)
    return dt.timestamp()


class Scheduler:
    def __init__(self, on_fire=None):
        self.on_fire = on_fire or (lambda r: None)
        self.lock = threading.Lock()
        self.items = []
        if FILE.exists():
            try:
                self.items = json.loads(FILE.read_text())
            except Exception:
                pass

    def _save(self):
        FILE.write_text(json.dumps(self.items, ensure_ascii=False, indent=1))

    def add(self, text: str, at: str = "", in_minutes=None, repeat: str = "") -> str:
        """repeat: '' | 'günlük' | 'haftalık'"""
        try:
            when = parse_when(at, in_minutes)
        except Exception as e:
            return f"hata: {e}"
        item = {"id": uuid.uuid4().hex[:6], "when": when, "text": text, "repeat": repeat or ""}
        with self.lock:
            self.items.append(item)
            self._save()
        t = datetime.datetime.fromtimestamp(when).strftime("%d.%m %H:%M")
        return f"Tamam, {t} için kurdum: {text} (no: {item['id']})"

    def list(self) -> str:
        with self.lock:
            items = sorted(self.items, key=lambda r: r["when"])
        return "\n".join(f"{r['id']}: {datetime.datetime.fromtimestamp(r['when']):%d.%m %H:%M} "
                         f"{r['text']}{' (' + r['repeat'] + ')' if r['repeat'] else ''}"
                         for r in items) or "Kurulu hatırlatıcı yok."

    def cancel(self, id_or_text: str) -> str:
        with self.lock:
            before = len(self.items)
            self.items = [r for r in self.items if r["id"] != id_or_text
                          and id_or_text.lower() not in r["text"].lower()]
            self._save()
            n = before - len(self.items)
        return f"{n} hatırlatıcı iptal edildi." if n else "Eşleşen hatırlatıcı yok."

    def due(self, now=None):
        """Zamanı gelenleri döndürür, tekrarlıları ileri alır."""
        now = now or time.time()
        fired = []
        with self.lock:
            keep = []
            for r in self.items:
                if r["when"] <= now:
                    fired.append(dict(r))
                    step = {"günlük": 86400, "haftalık": 7 * 86400}.get(r["repeat"])
                    if step:
                        while r["when"] <= now:
                            r["when"] += step
                        keep.append(r)
                else:
                    keep.append(r)
            if fired:
                self.items = keep
                self._save()
        return fired

    def run(self):
        while True:
            for r in self.due():
                try:
                    self.on_fire(r)
                except Exception as e:
                    print("hatırlatıcı hatası:", e)
            time.sleep(5)

    def start(self):
        threading.Thread(target=self.run, daemon=True, name="arex-scheduler").start()
