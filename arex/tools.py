"""Arex'in bilgisayardaki elleri."""
import ast
import datetime
import html
import json
import operator
import os
import re
import shlex
import shutil
import platform
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path


# Her durumda engellenen yıkıcı komutlar (config: block_catastrophic)
CATASTROPHIC = [
    r"\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)[a-z]*\s+(/|~|/\*|\$HOME)(\s|$)",
    r"\bmkfs(\.\w+)?\b", r"\bdd\b.*\bof=/dev/(sd|nvme|hd|mmcblk)", r":\(\)\s*\{\s*:\|:&\s*\};:",
    r">\s*/dev/(sd|nvme)", r"(?i)\bformat\s+[a-z]:", r"(?i)\b(rd|rmdir|del)\s+/s\b.*\b[a-z]:\\?\s*$",
    r"(?i)remove-item\b.*-recurse\b.*\b[a-z]:\\(\s|$|windows)", r"(?i)\bstop-computer\b|\brestart-computer\b", r"\bchmod\s+-R\s+0?777\s+/(\s|$)", r"\bshutdown\b|\bpoweroff\b|\breboot\b",
]
BLOCK = True


def is_catastrophic(command: str) -> bool:
    return any(re.search(p, command) for p in CATASTROPHIC)


def run_shell(command: str, timeout: int = 60) -> str:
    if BLOCK and is_catastrophic(command):
        return "Bu komutu güvenlik nedeniyle çalıştırmadım (yıkıcı/sistemi kapatan komut)."
    try:
        r = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=int(timeout))
        return ((r.stdout + r.stderr).strip() or "(çıktı yok)")[-4000:]
    except Exception as e:
        return f"hata: {e}"


def read_file(path: str) -> str:
    try:
        return Path(path).expanduser().read_text(errors="replace")[:8000]
    except Exception as e:
        return f"hata: {e}"


def write_file(path: str, content: str) -> str:
    try:
        p = Path(path).expanduser()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)
        return f"{p} yazıldı."
    except Exception as e:
        return f"hata: {e}"


def list_dir(path: str = "~") -> str:
    try:
        return "\n".join(sorted(os.listdir(Path(path).expanduser()))[:200])
    except Exception as e:
        return f"hata: {e}"


def open_app(name: str) -> str:
    """Program ya da adres/dosya aç. Kabuk enjeksiyonu yok."""
    try:
        args = shlex.split(name)
    except ValueError:
        args = [name]
    if not args:
        return "Ne açayım?"
    if sys.platform == "win32":
        try:
            if shutil.which(args[0]):
                subprocess.Popen(args, creationflags=0x00000008)      # DETACHED_PROCESS
            else:
                os.startfile(name)                                    # dosya, adres, 'notepad', 'spotify:' ...
            return f"{name} açıldı."
        except Exception:
            subprocess.Popen(f'start "" "{name}"', shell=True)
            return f"{name} açılmaya çalışıldı."
    if not shutil.which(args[0]) and shutil.which("xdg-open"):
        args = ["xdg-open", name]          # https://..., dosya yolu vb.
    try:
        subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        return f"{name} açıldı."
    except Exception as e:
        return f"açılamadı: {e}"


def web_search(query: str) -> str:
    """DuckDuckGo HTML - anahtarsız."""
    try:
        url = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(query)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        page = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", "replace")
        titles = re.findall(r'result__a[^>]*>(.*?)</a>', page, re.S)[:6]
        snips = re.findall(r'result__snippet[^>]*>(.*?)</a>', page, re.S)[:6]
        clean = lambda s: html.unescape(re.sub(r"<[^>]+>", "", s)).strip()
        return "\n".join(f"- {clean(t)}: {clean(s)}" for t, s in zip(titles, snips)) or "sonuç yok"
    except Exception as e:
        return f"hata: {e}"


def fetch_url(url: str) -> str:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        page = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "replace")
        text = re.sub(r"<(script|style).*?</\1>", "", page, flags=re.S)
        return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text)))[:6000]
    except Exception as e:
        return f"hata: {e}"


def now() -> str:
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S %A")


def system_info() -> str:
    if sys.platform == "win32":
        from . import system
        return f"{platform.platform()} | {platform.processor()} | {system.health()}"
    return run_shell("uname -a; uptime; free -h | head -2; df -h / | tail -1")


# ---------------- yeni araçlar (1.9) ----------------
def weather(city: str = "") -> str:
    """wttr.in - anahtarsız hava durumu."""
    try:
        url = "https://wttr.in/" + urllib.parse.quote(city or "") + "?format=j1&lang=tr"
        req = urllib.request.Request(url, headers={"User-Agent": "curl/8"})
        d = json.loads(urllib.request.urlopen(req, timeout=15).read())
        c = d["current_condition"][0]
        desc = (c.get("lang_tr") or c["weatherDesc"])[0]["value"]
        place = d.get("nearest_area", [{}])[0].get("areaName", [{"value": city}])[0]["value"]
        today = d["weather"][0]
        return (f"{place}: {desc}, {c['temp_C']}°C (hissedilen {c['FeelsLikeC']}°C), nem %{c['humidity']}, "
                f"rüzgar {c['windspeedKmph']} km/s. Bugün en düşük {today['mintempC']}°, en yüksek {today['maxtempC']}°.")
    except Exception as e:
        return f"hava durumu alınamadı: {e}"


_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
        ast.Pow: operator.pow, ast.Mod: operator.mod, ast.FloorDiv: operator.floordiv,
        ast.USub: operator.neg, ast.UAdd: operator.pos}


def calculate(expression: str) -> str:
    """Güvenli hesap makinesi: + - * / ** % ve sqrt, sin, cos, log, pi..."""
    import math
    names = {k: getattr(math, k) for k in ("sqrt", "sin", "cos", "tan", "log", "log10", "exp", "pi", "e",
                                            "floor", "ceil", "factorial")}
    names.update(abs=abs, round=round)

    def ev(n):
        if isinstance(n, ast.Expression):
            return ev(n.body)
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return n.value
        if isinstance(n, ast.BinOp) and type(n.op) in _OPS:
            if isinstance(n.op, ast.Pow) and abs(ev(n.right)) > 1000:
                raise ValueError("üs çok büyük")
            return _OPS[type(n.op)](ev(n.left), ev(n.right))
        if isinstance(n, ast.UnaryOp) and type(n.op) in _OPS:
            return _OPS[type(n.op)](ev(n.operand))
        if isinstance(n, ast.Name) and n.id in names:
            return names[n.id]
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in names:
            return names[n.func.id](*[ev(a) for a in n.args])
        raise ValueError("desteklenmeyen ifade")
    try:
        expr = re.sub(r"(?<=[\d)\s])x(?=[\d(\s])", "*", expression).replace("×", "*").replace("÷", "/").replace("^", "**").replace(",", ".")
        r = ev(ast.parse(expr, mode="eval"))
        return str(round(r, 10) if isinstance(r, float) else r)
    except Exception as e:
        return f"hesaplanamadı: {e}"


def _todos():
    from .config import HOME
    f = HOME / "todos.json"
    return f, (json.loads(f.read_text()) if f.exists() else [])


def todo_add(item: str) -> str:
    f, t = _todos()
    t.append({"text": item, "done": False, "added": now()})
    f.write_text(json.dumps(t, ensure_ascii=False, indent=1))
    return f"Listeye eklendi: {item}"


def todo_list() -> str:
    _, t = _todos()
    return "\n".join(f"{i + 1}. [{'x' if x['done'] else ' '}] {x['text']}" for i, x in enumerate(t)) or "Liste boş."


def todo_done(item: str) -> str:
    f, t = _todos()
    for i, x in enumerate(t):
        if str(i + 1) == str(item).strip() or str(item).lower() in x["text"].lower():
            x["done"] = True
            f.write_text(json.dumps(t, ensure_ascii=False, indent=1))
            return f"Tamamlandı: {x['text']}"
    return "Bulamadım."


def todo_clear() -> str:
    f, t = _todos()
    f.write_text(json.dumps([x for x in t if not x["done"]], ensure_ascii=False, indent=1))
    return "Tamamlananlar silindi."
