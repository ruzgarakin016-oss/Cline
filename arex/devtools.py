"""Arex'in kendini geliştirme yetenekleri.

- create_plugin: istenen yeteneği yerel kod modeliyle yazar, test eder, hata varsa düzeltir, yükler
- edit_plugin / edit_core: mevcut kodu talimatla değiştirir (önce yedek, bozulursa geri alır)
- install_package / winget_install / powershell: eksik ne varsa indirir
- backup / rollback / self_update / restart_self

Eklentiler ~/.arex/plugins içinde durur; Arex güncellense de kaybolmaz.
Eklenti şablonu:
    def hava_kalitesi(sehir: str) -> str: ...
    TOOLS = {"hava_kalitesi": (hava_kalitesi, "hava_kalitesi(sehir): hava kalitesi")}
    def setup(app): ...      # opsiyonel: kamera, ses, beyin vb.ne erişim
"""
import datetime
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import zipfile
from pathlib import Path

from .config import HOME

SRC = Path(__file__).resolve().parent          # arex/ paket klasörü
ROOT = SRC.parent
PLUGINS = HOME / "plugins"
BACKUPS = HOME / "backups"
WIN = sys.platform == "win32"
NO_WINDOW = 0x08000000 if WIN else 0
RESTART_CODE = 3

PLUGIN_RULES = """Sen Arex için Python eklentisi yazan uzman bir yazılımcısın. SADECE tek bir ```python kod bloğu ver.
Kurallar:
- Python 3.10+, sadece standart kütüphane tercih et. Dış paket gerekiyorsa en üste yorum yaz: # requires: paket1 paket2
- Her araç fonksiyonu basit argümanlar (str/int/float/bool) alır ve Türkçe kısa bir str döndürür.
- Hataları try/except ile yakala ve 'hata: ...' metni döndür; asla programı çökertme.
- Ağ isteklerinde timeout kullan. Sonsuz döngü yok (arka plan işi gerekiyorsa threading + daemon=True).
- Dosyanın sonunda şu sözlük OLMALI:
  TOOLS = {"arac_adi": (fonksiyon, "arac_adi(arg1, arg2?): ne yaptığı")}
- İsteğe bağlı: def setup(app): app.voice.say(..), app.camera, app.brain, app.announce(metin) kullanılabilir.
- İşletim sistemi: """ + ("Windows (PowerShell, ctypes.windll kullanılabilir)" if WIN else "Linux")


# ---------------------------------------------------------------- yardımcılar
def _run(cmd, timeout=600, shell=False, inp=None):
    try:
        r = subprocess.run(cmd, shell=shell, capture_output=True, text=True, timeout=timeout,
                           input=inp, creationflags=NO_WINDOW, encoding="utf-8", errors="replace")
        out = (r.stdout + r.stderr).strip()
        return r.returncode, out[-4000:] or "(çıktı yok)"
    except Exception as e:
        return 1, f"hata: {e}"


def _safe_name(name: str) -> str:
    tr = str.maketrans("çğıöşüÇĞİÖŞÜ ", "cgiosuCGIOSU_")
    n = re.sub(r"[^a-zA-Z0-9_]", "", name.translate(tr)).lower().strip("_")
    return (n if n and not n[0].isdigit() else "e_" + n) or "eklenti"


def extract_code(text: str) -> str:
    m = re.findall(r"```(?:python|py)?\s*\n(.*?)```", text, re.S)
    return max(m, key=len).strip() + "\n" if m else text.strip() + "\n"


def ask_model(cfg, system: str, prompt: str) -> str:
    body = json.dumps({"model": cfg.get("coder_model") or cfg["model"], "stream": False,
                       "options": {"temperature": 0.2, "num_ctx": 8192},
                       "messages": [{"role": "system", "content": system},
                                    {"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request(cfg["ollama_url"] + "/api/chat", body, {"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=900).read())["message"]["content"]


def check_plugin_file(path: Path) -> str:
    """Eklentiyi AYRI bir süreçte içe aktarıp TOOLS'u denetler. '' = sorun yok."""
    try:
        compile(path.read_text(encoding="utf-8"), str(path), "exec")
    except SyntaxError as e:
        return f"SyntaxError satır {e.lineno}: {e.msg}"
    probe = ("import importlib.util,sys\n"
             f"s=importlib.util.spec_from_file_location('p',{str(path)!r});m=importlib.util.module_from_spec(s)\n"
             "s.loader.exec_module(m)\n"
             "t=getattr(m,'TOOLS',None)\n"
             "assert isinstance(t,dict) and t, 'TOOLS sözlüğü yok ya da boş'\n"
             "for k,v in t.items():\n"
             "  assert isinstance(k,str) and callable(v[0]) and isinstance(v[1],str), f'TOOLS[{k}] hatalı'\n"
             "print('OK', ','.join(t))\n")
    code, out = _run([sys.executable, "-c", probe], timeout=60)
    return "" if code == 0 and "OK" in out else out[-1500:]


def requirements_of(code: str):
    m = re.search(r"#\s*requires:\s*(.+)", code)
    return m.group(1).split() if m else []


# ---------------------------------------------------------------- yedek / geri alma
def backup(label="yedek") -> str:
    BACKUPS.mkdir(parents=True, exist_ok=True)
    path = BACKUPS / f"{datetime.datetime.now():%Y%m%d_%H%M%S}_{_safe_name(label)}.zip"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in SRC.rglob("*.py"):
            z.write(f, f.relative_to(ROOT))
        for f in PLUGINS.glob("*.py") if PLUGINS.exists() else []:
            z.write(f, Path("_plugins") / f.name)
    for old in sorted(BACKUPS.glob("*.zip"))[:-30]:      # son 30 yedek kalsın
        old.unlink(missing_ok=True)
    return str(path)


def list_backups() -> str:
    return "\n".join(f.name for f in sorted(BACKUPS.glob("*.zip"))[-15:]) or "Yedek yok."


def rollback(name: str = "") -> str:
    """name boşsa en son yedeğe döner."""
    zips = sorted(BACKUPS.glob("*.zip"))
    if not zips:
        return "Yedek yok."
    z = next((b for b in zips if name and name in b.name), zips[-1])
    with zipfile.ZipFile(z) as zf:
        for n in zf.namelist():
            target = (PLUGINS / Path(n).name) if n.startswith("_plugins/") else (ROOT / n)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(zf.read(n))
    return f"{z.name} yedeğine döndüm. Değişikliklerin geçerli olması için yeniden başlatıyorum." + restart_self()


# ---------------------------------------------------------------- kurulum / komut
def install_package(name: str) -> str:
    """Python paketi kur (Arex'in kendi ortamına)."""
    pkgs = [p for p in re.split(r"[\s,]+", name) if re.fullmatch(r"[A-Za-z0-9_.\-\[\]=<>~]+", p)]
    if not pkgs:
        return "geçersiz paket adı"
    code, out = _run([sys.executable, "-m", "pip", "install", "--disable-pip-version-check", *pkgs])
    return ("Kuruldu: " if code == 0 else "Kurulamadı: ") + out[-800:]


def winget_install(package_id: str) -> str:
    """Windows programı kur (winget). Örn: 'Git.Git', 'VideoLAN.VLC', 'Gyan.FFmpeg'."""
    if not WIN:
        return "winget sadece Windows'ta. Linux'ta run_shell ile apt kullan."
    if not re.fullmatch(r"[A-Za-z0-9_.\-]+", package_id):
        return "geçersiz paket kimliği"
    code, out = _run(["winget", "install", "-e", "--id", package_id, "--silent",
                      "--accept-package-agreements", "--accept-source-agreements"], timeout=1800)
    return out[-800:]


def winget_search(query: str) -> str:
    if not WIN:
        return "winget sadece Windows'ta."
    return _run(["winget", "search", query, "--accept-source-agreements"], timeout=120)[1][-2500:]


def powershell(command: str, timeout: int = 300) -> str:
    """PowerShell komutu çalıştır (Windows). İndirme: Invoke-WebRequest URL -OutFile yol."""
    from .tools import BLOCK, is_catastrophic
    if BLOCK and is_catastrophic(command):
        return "Bu komutu güvenlik nedeniyle çalıştırmadım."
    exe = "powershell" if WIN else (shutil.which("pwsh") or "")
    if not exe:
        return "PowerShell yok (Linux'ta run_shell kullan)."
    return _run([exe, "-NoProfile", "-NonInteractive", "-Command", command], timeout=int(timeout))[1]


def download(url: str, path: str = "") -> str:
    """İnternetten dosya indir. path boşsa ~/.arex/downloads."""
    try:
        dest = Path(path).expanduser() if path else HOME / "downloads" / (url.rstrip("/").split("/")[-1].split("?")[0] or "dosya")
        dest.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
            shutil.copyfileobj(r, f)
        return f"İndirildi: {dest} ({dest.stat().st_size // 1024} KB)"
    except Exception as e:
        return f"hata: {e}"


def restart_self(delay: float = 3.0) -> str:
    """Konuşma bitince Arex'i yeniden başlatır (yeni kod yüklensin)."""
    def go():
        time.sleep(delay)
        if WIN:
            os._exit(RESTART_CODE)            # BASLAT.bat bu kodu görünce yeniden açar
        os.environ["AREX_RESTARTED"] = "1"
        os.execv(sys.executable, [sys.executable, "-m", "arex.main", *sys.argv[1:]])
    threading.Thread(target=go, daemon=True).start()
    return " (birkaç saniye içinde yeniden başlıyorum)"


# ---------------------------------------------------------------- geliştirici
class Developer:
    def __init__(self, app):
        self.app = app
        self.cfg = app.cfg
        self.loaded = {}               # eklenti adı -> araç adları
        PLUGINS.mkdir(parents=True, exist_ok=True)

    # ---- eklenti yükleme
    def load_all(self):
        for f in sorted(PLUGINS.glob("*.py")):
            msg = self.load(f)
            print("  [eklenti]", msg)

    def load(self, path: Path) -> str:
        try:
            spec = importlib.util.spec_from_file_location(f"arex_plugin_{path.stem}", path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            tools = dict(getattr(mod, "TOOLS", {}) or {})
            for old in self.loaded.get(path.stem, []):
                self.app.brain.tools.pop(old, None)
            self.app.brain.tools.update(tools)
            self.loaded[path.stem] = list(tools)
            if hasattr(mod, "setup"):
                threading.Thread(target=mod.setup, args=(self.app,), daemon=True).start()
            return f"{path.stem}: {', '.join(tools)}"
        except Exception as e:
            return f"{path.stem} yüklenemedi: {e}"

    # ---- kod üretme döngüsü (yaz -> test et -> hatayı düzelt)
    def _generate(self, prompt: str, path: Path, tries: int = 3) -> str:
        last_err, code = "", ""
        for i in range(tries):
            p = prompt if not last_err else (prompt + f"\n\nÖnceki kodun:\n```python\n{code}```\n"
                                             f"Şu hatayı verdi, düzelt:\n{last_err}")
            try:
                code = extract_code(ask_model(self.cfg, PLUGIN_RULES, p))
            except Exception as e:
                return f"Kod modeline ulaşamadım ({self.cfg.get('coder_model')}): {e}"
            for pkg in requirements_of(code):
                install_package(pkg)
            tmp = Path(tempfile.mkdtemp()) / path.name
            tmp.write_text(code, encoding="utf-8")
            last_err = check_plugin_file(tmp)
            if not last_err:
                path.write_text(code, encoding="utf-8")
                return ""
            print(f"  [geliştirici] deneme {i + 1} başarısız: {last_err[:200]}")
        return f"{tries} denemede çalışan kod yazamadım. Son hata: {last_err[:600]}"

    def create_plugin(self, name: str, description: str) -> str:
        """Yeni yetenek yaz ve hemen kullanıma al."""
        path = PLUGINS / f"{_safe_name(name)}.py"
        if path.exists():
            return f"{path.stem} zaten var; edit_plugin ile değiştir."
        err = self._generate(f"Eklenti adı: {path.stem}\nİstenen yetenek: {description}", path)
        if err:
            return err
        return "Yeni yetenek hazır ve yüklendi → " + self.load(path)

    def edit_plugin(self, name: str, instruction: str) -> str:
        path = PLUGINS / f"{_safe_name(name)}.py"
        if not path.exists():
            return f"{path.stem} adlı eklenti yok. Mevcutlar: {self.list_plugins()}"
        backup(f"eklenti_{path.stem}")
        old = path.read_text(encoding="utf-8")
        err = self._generate(f"Bu eklentiyi şu isteğe göre değiştir: {instruction}\n"
                             f"Mevcut kod:\n```python\n{old}```", path)
        if err:
            return err + " (eski hali duruyor)"
        return "Güncellendi → " + self.load(path)

    def delete_plugin(self, name: str) -> str:
        path = PLUGINS / f"{_safe_name(name)}.py"
        if not path.exists():
            return "Öyle bir eklenti yok."
        backup(f"sil_{path.stem}")
        for t in self.loaded.pop(path.stem, []):
            self.app.brain.tools.pop(t, None)
        path.unlink()
        return f"{path.stem} silindi (yedekte duruyor)."

    def list_plugins(self) -> str:
        return ", ".join(f"{k} ({', '.join(v)})" for k, v in self.loaded.items()) or "Henüz eklenti yok."

    def show_code(self, name: str) -> str:
        """Eklenti veya çekirdek dosyanın kodunu göster (ör. 'hava', 'camera.py')."""
        p = PLUGINS / f"{_safe_name(name)}.py"
        if not p.exists():
            p = SRC / Path(name).name
        return p.read_text(encoding="utf-8")[:8000] if p.exists() and p.suffix == ".py" else "Dosya yok."

    def edit_core(self, file: str, instruction: str) -> str:
        """Arex'in kendi çekirdek dosyasını değiştir (dikkatli!). Bozulursa geri alır."""
        path = SRC / Path(file).name
        if not path.exists() or path.suffix != ".py":
            return f"Böyle bir çekirdek dosya yok. Dosyalar: {', '.join(p.name for p in SRC.glob('*.py'))}"
        bk = backup(f"cekirdek_{path.stem}")
        old = path.read_text(encoding="utf-8")
        rules = ("Sen Arex adlı Python asistanının çekirdek kodunu düzenleyen uzman yazılımcısın. "
                 "Dosyanın TAMAMINI tek bir ```python bloğunda, istenen değişiklikle ver. Mevcut fonksiyon/sınıf "
                 "adlarını ve davranışı bozma; sadece isteneni değiştir.")
        try:
            new = extract_code(ask_model(self.cfg, rules, f"Dosya: {path.name}\nİstek: {instruction}\n"
                                                         f"```python\n{old}```"))
            compile(new, str(path), "exec")
        except Exception as e:
            return f"Değişiklik yapılamadı: {e}"
        path.write_text(new, encoding="utf-8")
        code, out = _run([sys.executable, "-c", "import arex.main, arex.brain, arex.dashboard"], timeout=60)
        if code != 0:
            path.write_text(old, encoding="utf-8")
            return f"Yeni kod Arex'i bozuyordu, geri aldım. Hata: {out[-500:]}"
        return f"{path.name} güncellendi (yedek: {Path(bk).name})." + restart_self()

    # ---- güncelleme
    def self_update(self) -> str:
        """Güncelleme kaynağından (GitHub zip) en yeni sürümü indirip kurar."""
        url = self.cfg.get("update_url")
        if not url:
            return "update_url ayarlı değil (config.json)."
        try:
            tmp = Path(tempfile.mkdtemp())
            data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "arex"}), timeout=120).read()
            (tmp / "u.zip").write_bytes(data)
            with zipfile.ZipFile(tmp / "u.zip") as z:
                z.extractall(tmp / "x")
            pkg = next((p.parent for p in (tmp / "x").rglob("__init__.py")
                        if p.parent.name == "arex" and (p.parent / "main.py").exists()), None)
            if not pkg:
                return "İndirilen pakette arex klasörü bulunamadı."
            new_ver = re.search(r'VERSION = "([^"]+)"', (pkg / "config.py").read_text(encoding="utf-8"))
            backup("guncelleme_oncesi")
            for f in pkg.rglob("*"):
                if f.is_file() and "__pycache__" not in f.parts:
                    dest = SRC / f.relative_to(pkg)
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(f, dest)
            for extra in ("BASLAT.bat", "BASLAT-YAZILI.bat", "GUVENLIK-KAMERASI.bat", "KUR.bat", "setup.ps1"):
                if (pkg.parent / extra).exists():
                    shutil.copy2(pkg.parent / extra, ROOT / extra)
            req = SRC / "requirements.txt"
            if req.exists():
                _run([sys.executable, "-m", "pip", "install", "-q", "-r", str(req)])
            v = new_ver.group(1) if new_ver else "?"
            return f"Güncelleme kuruldu (sürüm {v}). Eklentilerin ve ayarların korunuyor." + restart_self()
        except Exception as e:
            return f"Güncelleme başarısız: {e}"

    # ---- beyne verilecek araçlar
    def tools(self):
        return {
            "create_plugin": (self.create_plugin, "create_plugin(name, description): KENDİNE YENİ YETENEK YAZ. "
                              "İstenen şey mevcut araçlarla yapılamıyorsa bunu kullan"),
            "edit_plugin": (self.edit_plugin, "edit_plugin(name, instruction): yazdığın bir yeteneği değiştir"),
            "delete_plugin": (self.delete_plugin, "delete_plugin(name)"),
            "list_plugins": (self.list_plugins, "list_plugins(): kendi yazdığın yetenekler"),
            "show_code": (self.show_code, "show_code(name): eklenti ya da çekirdek dosya kodunu oku"),
            "edit_core": (self.edit_core, "edit_core(file, instruction): kendi çekirdek kodunu değiştir (ör. 'dashboard.py')"),
            "install_package": (install_package, "install_package(name): Python paketi kur (pip)"),
            "winget_install": (winget_install, "winget_install(package_id): Windows programı kur, ör. 'VideoLAN.VLC'"),
            "winget_search": (winget_search, "winget_search(query): kurulacak programın kimliğini bul"),
            "powershell": (powershell, "powershell(command): PowerShell komutu çalıştır"),
            "download": (download, "download(url, path?): dosya indir"),
            "backup": (backup, "backup(label?): kendini yedekle"),
            "list_backups": (list_backups, "list_backups()"),
            "rollback": (rollback, "rollback(name?): yedeğe geri dön (boş = son yedek)"),
            "self_update": (self.self_update, "self_update(): yeni Arex sürümünü indir ve kur"),
            "restart_self": (lambda: "Yeniden başlıyorum." + restart_self(), "restart_self(): kendini yeniden başlat"),
        }
