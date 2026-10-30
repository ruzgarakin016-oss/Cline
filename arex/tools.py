"""Arex'in bilgisayardaki elleri."""
import datetime
import html
import os
import re
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path


def run_shell(command: str, timeout: int = 60) -> str:
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
    subprocess.Popen(["bash", "-c", f"nohup {name} >/dev/null 2>&1 &"])
    return f"{name} açıldı."


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
    return run_shell("uname -a; uptime; free -h | head -2; df -h / | tail -1")
