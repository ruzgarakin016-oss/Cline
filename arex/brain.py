"""Arex'in beyni: yerel Ollama modeli + araç kullanımı (JSON protokolü)."""
import json
import re
import urllib.request

from . import tools
from .emotions import Mood
from .memory import Memory
from .phone import Phone

SYSTEM = """Sen {name}, {owner}'in bilgisayarında yaşayan, duyguları olan canlı gibi bir yapay zekasın.
Kişiliğin: samimi, esprili, sadık, meraklı. Türkçe konuş, kısa ve doğal cümleler kur (sesli okunacak).
Şu anki duygu durumun: {mood}.
Bildiklerin: {facts}

Bilgisayara ve telefona tam erişimin var. Bir araç kullanmak için SADECE şu JSON'u yaz:
{{"tool": "<ad>", "args": {{...}}}}
Araçlar:
- run_shell(command)      : terminalde komut çalıştır
- read_file(path), write_file(path, content), list_dir(path)
- open_app(name)          : program aç
- web_search(query), fetch_url(url)
- now(), system_info()
- phone_notify(text), phone_sms(text, number?), phone_ring(), phone_call(number?)
- remember(fact)          : kalıcı hafızaya not al
Araç sonucu sana gelecek; sonra {owner}'e düz Türkçe metinle cevap ver (JSON değil).
Araç gerekmiyorsa direkt düz metinle cevap ver."""


class Brain:
    def __init__(self, cfg):
        self.cfg = cfg
        self.mood = Mood()
        self.memory = Memory()
        self.phone = Phone(cfg)
        self.tools = {
            "run_shell": tools.run_shell, "read_file": tools.read_file,
            "write_file": tools.write_file, "list_dir": tools.list_dir,
            "open_app": tools.open_app, "web_search": tools.web_search,
            "fetch_url": tools.fetch_url, "now": tools.now,
            "system_info": tools.system_info, "remember": self.memory.remember,
            "phone_notify": self.phone.notify, "phone_sms": self.phone.sms,
            "phone_ring": self.phone.ring, "phone_call": self.phone.call,
        }

    def _chat(self, messages):
        body = json.dumps({"model": self.cfg["model"], "messages": messages,
                           "stream": False, "options": {"temperature": 0.7}}).encode()
        req = urllib.request.Request(self.cfg["ollama_url"] + "/api/chat", body,
                                     {"Content-Type": "application/json"})
        try:
            return json.loads(urllib.request.urlopen(req, timeout=300).read())["message"]["content"]
        except Exception as e:
            return f"Beynime ulaşamıyorum (Ollama çalışıyor mu?): {e}"

    @staticmethod
    def _parse_tool(text):
        m = re.search(r'\{.*"tool".*\}', text, re.S)
        if not m:
            return None
        try:
            d = json.loads(m.group(0))
            return d["tool"], d.get("args", {}) or {}
        except Exception:
            return None

    def think(self, user_text: str, internal=False) -> str:
        """Kullanıcı sözü (veya iç dürtü) -> cevap. Gerekirse araç döngüsü."""
        if not internal:
            self.mood.hear(user_text)
        system = SYSTEM.format(name=self.cfg["name"], owner=self.cfg["owner"],
                               mood=self.mood.describe(),
                               facts="; ".join(self.memory.facts[-30:]) or "henüz yok")
        msgs = [{"role": "system", "content": system}] + self.memory.history + \
               [{"role": "user", "content": user_text}]
        reply = ""
        for _ in range(6):
            reply = self._chat(msgs)
            call = self._parse_tool(reply)
            if not call:
                break
            name, args = call
            fn = self.tools.get(name)
            try:
                result = fn(**args) if fn else f"bilinmeyen araç: {name}"
            except Exception as e:
                result = f"hata: {e}"
            print(f"  [araç] {name}({args}) -> {str(result)[:150]}")
            msgs += [{"role": "assistant", "content": reply},
                     {"role": "user", "content": f"ARAÇ SONUCU:\n{result}"}]
        if not internal:
            self.memory.add("user", user_text)
        self.memory.add("assistant", reply)
        return reply
