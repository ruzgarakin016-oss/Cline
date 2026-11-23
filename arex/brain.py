"""Arex'in beyni: yerel Ollama modeli + araç kullanımı (JSON protokolü)."""
import collections
import json
import threading
import time
import urllib.request

from . import system, tools
from .emotions import Mood
from .memory import Memory
from .phone import Phone

SYSTEM = """Sen {name}, {owner}'in bilgisayarında yaşayan, duyguları olan canlı gibi bir yapay zekasın.
Kişiliğin: samimi, esprili, sadık, meraklı. Türkçe konuş, kısa ve doğal cümleler kur (sesli okunacak).
Şu anki duygu durumun: {mood}.
Şu an: {now}.
Bildiklerin: {facts}

Bilgisayara, kameraya ve telefona erişimin var. Bir araç kullanmak için SADECE şu JSON'u yaz:
{{"tool": "<ad>", "args": {{...}}}}
Araçlar:
{tools}
Araç sonucu sana gelecek; sonra {owner}'e düz Türkçe metinle cevap ver (JSON değil).
Araç gerekmiyorsa direkt düz metinle cevap ver. Emin olmadığın şeyi uydurma; araçla kontrol et.
KENDİNİ GELİŞTİRME: İstenen iş mevcut araçlarla yapılamıyorsa "yapamam" deme; create_plugin ile kendine yeni
yetenek yaz, sonra onu kullan. {owner} "şunu değiştir/düzelt" derse edit_plugin veya edit_core kullan.
Eksik program/paket gerekiyorsa install_package, winget_install, powershell veya download ile kendin kur."""


def parse_tool(text):
    """Metindeki ilk {"tool": ...} JSON nesnesini bulur (iç içe süslü parantez güvenli)."""
    dec = json.JSONDecoder()
    i = text.find("{")
    while i != -1:
        try:
            obj, _ = dec.raw_decode(text, i)
            if isinstance(obj, dict) and isinstance(obj.get("tool"), str):
                args = obj.get("args") or {}
                return obj["tool"], args if isinstance(args, dict) else {}
        except ValueError:
            pass
        i = text.find("{", i + 1)
    return None


class Brain:
    def __init__(self, cfg, extra_tools=None):
        self.cfg = cfg
        self.mood = Mood()
        self.memory = Memory()
        self.phone = Phone(cfg)
        self.lock = threading.Lock()
        self.state = "idle"                                   # idle | thinking | tool
        self.activity = collections.deque(maxlen=60)          # panelde görünen araç kayıtları
        tools.BLOCK = cfg.get("block_catastrophic", True)
        # ad -> (fonksiyon, açıklama)
        self.tools = {
            "run_shell": (tools.run_shell, "run_shell(command): terminalde komut çalıştır"),
            "read_file": (tools.read_file, "read_file(path)"),
            "write_file": (tools.write_file, "write_file(path, content)"),
            "list_dir": (tools.list_dir, "list_dir(path)"),
            "open_app": (tools.open_app, "open_app(name): program, web adresi veya dosya aç"),
            "web_search": (tools.web_search, "web_search(query): internette ara"),
            "fetch_url": (tools.fetch_url, "fetch_url(url): sayfa metnini oku"),
            "now": (tools.now, "now(): tarih/saat"),
            "system_info": (tools.system_info, "system_info(): sistem bilgisi"),
            "health": (system.health, "health(): işlemci yükü, bellek, disk, sıcaklık, pil"),
            "weather": (lambda city="": tools.weather(city or cfg.get("city", "")),
                        "weather(city?): hava durumu"),
            "calculate": (tools.calculate, "calculate(expression): hesap yap, ör. '12*7+sqrt(16)'"),
            "todo_add": (tools.todo_add, "todo_add(item): yapılacaklar listesine ekle"),
            "todo_list": (tools.todo_list, "todo_list()"),
            "todo_done": (tools.todo_done, "todo_done(item): numara veya metin"),
            "todo_clear": (tools.todo_clear, "todo_clear(): tamamlananları sil"),
            "volume": (system.volume, "volume(level): 0-100, 'up', 'down', 'mute', 'unmute'"),
            "media": (system.media, "media(action): play-pause, next, previous, stop, status"),
            "brightness": (system.brightness, "brightness(level): 0-100, 'up', 'down'"),
            "lock_screen": (system.lock_screen, "lock_screen(): ekranı kilitle"),
            "clipboard_get": (system.clipboard_get, "clipboard_get(): panodaki metin"),
            "clipboard_set": (system.clipboard_set, "clipboard_set(text)"),
            "remember": (self.memory.remember, "remember(fact): kalıcı hafızaya not al"),
            "forget": (self.memory.forget, "forget(text): hafızadan sil"),
            "phone_notify": (self.phone.notify, "phone_notify(text): telefona bildirim"),
            "phone_sms": (self.phone.sms, "phone_sms(text, number?)"),
            "phone_ring": (self.phone.ring, "phone_ring(): telefonu çaldır / kayıp telefonu bul"),
            "phone_call": (self.phone.call, "phone_call(number?)"),
            "phone_share": (self.phone.share, "phone_share(path): dosyayı telefona gönder"),
            "phone_battery": (self.phone.battery, "phone_battery()"),
        }
        self.tools.update(extra_tools or {})

    def tool_docs(self):
        return "\n".join("- " + doc for _, doc in self.tools.values())

    def call_tool(self, name, args):
        entry = self.tools.get(name)
        if not entry:
            return f"bilinmeyen araç: {name}"
        try:
            return entry[0](**args)
        except TypeError as e:
            return f"hatalı argüman: {e}. Doğru kullanım: {entry[1]}"
        except Exception as e:
            return f"hata: {e}"

    def _chat(self, messages):
        body = json.dumps({"model": self.cfg["model"], "messages": messages,
                           "stream": False, "options": {"temperature": 0.7, "num_ctx": 8192}}).encode()
        req = urllib.request.Request(self.cfg["ollama_url"] + "/api/chat", body,
                                     {"Content-Type": "application/json"})
        try:
            return json.loads(urllib.request.urlopen(req, timeout=300).read())["message"]["content"]
        except Exception as e:
            return f"Beynime ulaşamıyorum (Ollama çalışıyor mu?): {e}"

    _parse_tool = staticmethod(parse_tool)   # geri uyumluluk

    def think(self, user_text: str, internal=False) -> str:
        """Kullanıcı sözü (veya iç dürtü) -> cevap. Gerekirse araç döngüsü."""
        with self.lock:
            self.state = "thinking"
            try:
                return self._think(user_text, internal)
            finally:
                self.state = "idle"

    def _think(self, user_text, internal):
        if not internal:
            self.mood.hear(user_text)
        system_msg = SYSTEM.format(name=self.cfg["name"], owner=self.cfg["owner"],
                                   mood=self.mood.describe(), now=tools.now(), tools=self.tool_docs(),
                                   facts="; ".join(self.memory.facts[-30:]) or "henüz yok")
        msgs = [{"role": "system", "content": system_msg}] + self.memory.history + \
               [{"role": "user", "content": user_text}]
        reply = ""
        for step in range(6):
            reply = self._chat(msgs)
            call = parse_tool(reply)
            if not call:
                break
            name, args = call
            self.state = "tool"
            self.activity.append({"t": time.strftime("%H:%M:%S"), "tool": name,
                                  "args": json.dumps(args, ensure_ascii=False)[:160], "result": "..."})
            result = self.call_tool(name, args)
            self.activity[-1]["result"] = str(result)[:240]
            self.state = "thinking"
            print(f"  [araç] {name}({args}) -> {str(result)[:150]}")
            msgs += [{"role": "assistant", "content": reply},
                     {"role": "user", "content": f"ARAÇ SONUCU:\n{str(result)[:6000]}"}]
        else:
            reply = "Bu iş beklediğimden uzun sürdü, yarıda bıraktım. Başka türlü sorar mısın?"
        if not internal:
            self.memory.add("user", user_text)
        self.memory.add("assistant", reply)
        return reply
