"""Kalıcı hafıza: sohbet geçmişi + kalıcı notlar (JSON)."""
import json

from .config import HOME

FILE = HOME / "memory.json"


class Memory:
    def __init__(self):
        self.facts = []
        self.history = []
        if FILE.exists():
            try:
                d = json.loads(FILE.read_text())
                self.facts = d.get("facts", [])
                self.history = d.get("history", [])[-40:]
            except Exception:
                pass

    def remember(self, fact: str):
        self.facts.append(fact)
        self.save()
        return "Hafızaya kaydettim."

    def add(self, role: str, content: str):
        self.history.append({"role": role, "content": content})
        self.history = self.history[-40:]
        self.save()

    def save(self):
        FILE.write_text(json.dumps({"facts": self.facts[-200:], "history": self.history},
                                   ensure_ascii=False, indent=1))
