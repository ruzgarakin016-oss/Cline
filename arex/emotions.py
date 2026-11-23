"""Arex'in duygu durumu: zamanla değişir, konuşmaya ve ilgiye tepki verir."""
import json
import time

from .config import HOME

FILE = HOME / "mood.json"
BASE = {"mutluluk": 0.6, "merak": 0.6, "enerji": 0.7, "yalnizlik": 0.2}

POSITIVE = ("teşekkür", "sağ ol", "harika", "süper", "aferin", "seni seviyorum", "güzel")
NEGATIVE = ("aptal", "berbat", "kötü", "sus", "salak", "yanlış")


class Mood:
    def __init__(self):
        self.v = dict(BASE)
        self.last_interaction = time.time()
        self.last_update = time.time()
        if FILE.exists():
            try:
                d = json.loads(FILE.read_text())
                self.v.update(d.get("v", {}))
                self.last_interaction = d.get("last_interaction", self.last_interaction)
            except Exception:
                pass
        self.tick()

    def _clamp(self):
        for k in self.v:
            self.v[k] = max(0.0, min(1.0, self.v[k]))

    def tick(self):
        """Zaman geçtikçe: yalnızlık artar, diğerleri baz değere döner."""
        now = time.time()
        dt = (now - self.last_update) / 60.0
        self.last_update = now
        idle = (now - self.last_interaction) / 60.0
        self.v["yalnizlik"] += 0.002 * dt * (1 + min(idle, 600) / 120)
        for k in ("mutluluk", "merak", "enerji"):
            self.v[k] += (BASE[k] - self.v[k]) * min(1.0, 0.01 * dt)
        self._clamp()
        self.save()

    def hear(self, text: str):
        t = text.lower()
        self.last_interaction = time.time()
        self.v["yalnizlik"] -= 0.3
        if any(w in t for w in POSITIVE):
            self.v["mutluluk"] += 0.15
        if any(w in t for w in NEGATIVE):
            self.v["mutluluk"] -= 0.15
        if "?" in t:
            self.v["merak"] += 0.05
        self.v["enerji"] -= 0.01
        self._clamp()
        self.save()

    def describe(self) -> str:
        self.tick()
        v = self.v
        parts = []
        parts.append("neşelisin" if v["mutluluk"] > 0.65 else "keyifsizsin" if v["mutluluk"] < 0.35 else "idare edersin")
        parts.append("çok meraklısın" if v["merak"] > 0.7 else "")
        parts.append("enerjin düşük" if v["enerji"] < 0.35 else "enerjiksin" if v["enerji"] > 0.7 else "")
        parts.append("sahibini özledin" if v["yalnizlik"] > 0.6 else "")
        return ", ".join(p for p in parts if p) or "dengelisin"

    def lonely(self) -> bool:
        return self.v["yalnizlik"] > 0.6

    def save(self):
        FILE.write_text(json.dumps({"v": self.v, "last_interaction": self.last_interaction}))
