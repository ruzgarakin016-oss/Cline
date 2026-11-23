"""Arex 1.9 testleri: donanım (mikrofon/kamera/Ollama) gerekmeden çalışır."""
import datetime
import json
import os
import tempfile
import threading
import time
import urllib.request

os.environ["AREX_HOME"] = tempfile.mkdtemp(prefix="arex-test-")

import cv2  # noqa: E402
import numpy as np  # noqa: E402

from arex import brain, camera, scheduler, system, tools  # noqa: E402


def _frames(n, moving_from=None):
    rng = np.random.default_rng(0)
    bg = rng.integers(60, 90, (480, 640, 3), dtype=np.uint8)
    for i in range(n):
        f = bg.copy()
        if moving_from is not None and i >= moving_from:
            x = 50 + (i - moving_from) * 15
            cv2.rectangle(f, (x, 150), (x + 120, 380), (240, 240, 240), -1)
        yield f


def test_motion_detected_only_when_object_moves():
    d = camera.MotionDetector(min_area=1500)
    results = [d.process(f)[0] for f in _frames(60, moving_from=40)]
    assert not any(results[15:40]), "statik sahnede yanlış alarm"
    assert any(results[41:]), "hareket algılanmadı"


def test_ignore_zone_suppresses_motion():
    d = camera.MotionDetector(min_area=1500, ignore_zones=[[0, 0, 1, 1]])
    assert not any(d.process(f)[0] for f in _frames(60, moving_from=40))


def test_small_motion_filtered():
    d = camera.MotionDetector(min_area=50000)
    assert not any(d.process(f)[0] for f in _frames(60, moving_from=40))


def test_tamper():
    assert camera.is_tampered(np.zeros((480, 640, 3), np.uint8))
    assert not camera.is_tampered(next(_frames(1)))


class FakeCap:
    def __init__(self, frames):
        self.frames = list(frames)

    def isOpened(self):
        return True

    def read(self):
        if not self.frames:
            time.sleep(0.05)
            return False, None
        time.sleep(0.005)
        return True, self.frames.pop(0)

    def set(self, *a):
        pass

    def get(self, *a):
        return 15.0

    def release(self):
        pass


def test_camera_pipeline_records_event_snapshot_and_clip():
    cfg = dict(__import__("arex.config", fromlist=["DEFAULTS"]).DEFAULTS)
    cfg.update(motion_cooldown=0, clip_post_seconds=0.2, person_check=True, armed=True)
    got = []
    cam = camera.Camera(cfg, on_event=got.append)
    cam.armed = True
    cam._open = lambda: FakeCap(_frames(80, moving_from=40))
    cam.start()
    deadline = time.time() + 20
    while time.time() < deadline and not got:
        time.sleep(0.1)
    time.sleep(1)
    cam.stop()
    time.sleep(0.3)
    assert got, "olay üretilmedi"
    ev = got[0]
    assert ev["type"] == "motion" and os.path.exists(ev["snapshot"])
    clips = list(camera.clips_dir().glob("*.mp4"))
    assert clips and clips[0].stat().st_size > 0
    assert "Kamera" in cam.describe_status()
    assert cam.jpeg and cam.jpeg[:2] == b"\xff\xd8"


def test_faceid_without_training():
    f = camera.FaceID()
    gray = np.zeros((480, 640), np.uint8)
    assert f.faces(gray) == []
    assert f.who(gray, (0, 0, 100, 100)) == "bilinmiyor"


def test_parse_tool_nested_and_text():
    assert brain.parse_tool('Tamam {"tool": "write_file", "args": {"path": "a", "content": "{x}"}} bitti') == \
        ("write_file", {"path": "a", "content": "{x}"})
    assert brain.parse_tool("merhaba {nasılsın}") is None
    assert brain.parse_tool('{"tool": "now"}') == ("now", {})


def test_brain_tool_loop_with_fake_llm():
    cfg = dict(__import__("arex.config", fromlist=["DEFAULTS"]).DEFAULTS)
    b = brain.Brain(cfg)
    replies = iter(['{"tool": "calculate", "args": {"expression": "6*7"}}', "Sonuç 42."])
    seen = []
    b._chat = lambda msgs: (seen.append(msgs[-1]["content"]), next(replies))[1]
    assert b.think("6 kere 7?") == "Sonuç 42."
    assert "42" in seen[-1]
    assert "hatalı argüman" in b.call_tool("calculate", {"yanlis": 1})
    assert "bilinmeyen" in b.call_tool("yok", {})


def test_calculator():
    assert tools.calculate("2+3*4") == "14"
    assert tools.calculate("sqrt(16) + 2^3") == "12.0"
    assert tools.calculate("3 x 4") == "12"
    assert tools.calculate("exp(0)") == "1.0"
    assert "hesaplanamadı" in tools.calculate("__import__('os')")
    assert "hesaplanamadı" in tools.calculate("9**9**9")


def test_shell_guard():
    for bad in ("rm -rf /", "rm -fr ~", "sudo mkfs.ext4 /dev/sda1", "dd if=/dev/zero of=/dev/sda", "shutdown now"):
        assert tools.is_catastrophic(bad), bad
    for ok in ("ls -la", "rm -rf ./build", "echo merhaba"):
        assert not tools.is_catastrophic(ok), ok
    assert "çalıştırmadım" in tools.run_shell("rm -rf /")
    assert tools.run_shell("echo merhaba") == "merhaba"


def test_todos():
    tools.todo_add("süt al")
    tools.todo_add("faturayı öde")
    assert tools.todo_done("2").startswith("Tamamlandı")
    assert "[x] faturayı öde" in tools.todo_list()
    tools.todo_clear()
    assert "faturayı" not in tools.todo_list()


def test_parse_when():
    now = datetime.datetime(2026, 11, 23, 14, 0)
    assert scheduler.parse_when("15:30", now=now) == datetime.datetime(2026, 11, 23, 15, 30).timestamp()
    assert scheduler.parse_when("09:00", now=now) == datetime.datetime(2026, 11, 24, 9, 0).timestamp()
    assert scheduler.parse_when("yarın 08:00", now=now) == datetime.datetime(2026, 11, 24, 8, 0).timestamp()
    assert scheduler.parse_when(in_minutes=10, now=now) == (now + datetime.timedelta(minutes=10)).timestamp()


def test_scheduler_fires_and_repeats():
    s = scheduler.Scheduler()
    s.items = []
    s.add("çay demle", in_minutes=0)
    s.add("ilaç", in_minutes=0, repeat="günlük")
    fired = s.due(now=time.time() + 1)
    assert {r["text"] for r in fired} == {"çay demle", "ilaç"}
    assert [r["text"] for r in s.items] == ["ilaç"] and s.items[0]["when"] > time.time()
    assert "1 hatırlatıcı" in s.cancel("ilaç")


def test_system_health_runs():
    h = system.health()
    assert "bellek" in h and "disk" in h
    mon = system.Monitor({"monitor_cpu_temp": 999, "monitor_disk_percent": 0, "monitor_battery_low": -1}, print)
    assert any(k == "disk" for k, _ in mon.check())


def test_dashboard_end_to_end():
    from arex import dashboard, main
    cfg = dict(__import__("arex.config", fromlist=["DEFAULTS"]).DEFAULTS)
    cfg.update(dashboard_port=18765, dashboard_token="gizli", mute=True)
    app = main.App(cfg, main.parse_args(["--mute", "--no-camera"]))
    app.brain._chat = lambda msgs: "Merhaba!"
    assert dashboard.start(app)
    base = "http://127.0.0.1:18765"
    try:
        urllib.request.urlopen(base + "/api/status")
        assert False, "token olmadan açılmamalı"
    except urllib.error.HTTPError as e:
        assert e.code == 401
    st = json.loads(urllib.request.urlopen(base + "/api/status?token=gizli").read())
    assert st["version"] == "2.0.0" and "stats" in st and "state" in st and st["camera"] == "devre dışı"
    req = urllib.request.Request(base + "/api/chat?token=gizli", json.dumps({"text": "selam"}).encode(),
                                 {"Content-Type": "application/json"})
    assert json.loads(urllib.request.urlopen(req).read())["reply"] == "Merhaba!"
    assert b"Arex" in urllib.request.urlopen(base + "/?token=gizli").read()
    assert "reminder_add" in app.brain.tools and "look" in app.brain.tools


# ---------------- 2.0: kendini geliştirme ----------------
def _app():
    from arex import main
    cfg = dict(__import__("arex.config", fromlist=["DEFAULTS"]).DEFAULTS)
    cfg.update(mute=True)
    return main.App(cfg, main.parse_args(["--mute", "--no-camera", "--no-window"]))


GOOD = '''import random
def zar_at(kenar: int = 6) -> str:
    return f"Zar: {random.randint(1, int(kenar))}"
TOOLS = {"zar_at": (zar_at, "zar_at(kenar?): zar at")}
'''


def test_create_plugin_retries_until_code_works_then_brain_uses_it(monkeypatch):
    from arex import devtools
    app = _app()
    answers = iter(["```python\ndef zar_at(:\n```", "```python\n" + GOOD + "```"])
    prompts = []
    monkeypatch.setattr(devtools, "ask_model", lambda cfg, sys_, p: (prompts.append(p), next(answers))[1])
    msg = app.dev.create_plugin("zar", "zar atan bir yetenek")
    assert "hazır" in msg and "zar_at" in app.brain.tools, msg
    assert "SyntaxError" in prompts[1], "hata modele geri bildirilmeli"
    assert app.brain.call_tool("zar_at", {"kenar": 1}) == "Zar: 1"
    assert "zar" in app.dev.list_plugins()
    # yeniden açılışta otomatik yüklenir
    app2 = _app()
    app2.dev.load_all()
    assert "zar_at" in app2.brain.tools
    assert "silindi" in app2.dev.delete_plugin("zar") and "zar_at" not in app2.brain.tools


def test_plugin_without_tools_is_rejected(tmp_path):
    from arex import devtools
    f = tmp_path / "x.py"
    f.write_text("x = 1\n")
    assert "TOOLS" in devtools.check_plugin_file(f)
    f.write_text(GOOD)
    assert devtools.check_plugin_file(f) == ""


def test_edit_core_rolls_back_broken_code(monkeypatch):
    from arex import devtools
    app = _app()
    target = devtools.SRC / "emotions.py"
    before = target.read_text(encoding="utf-8")
    monkeypatch.setattr(devtools, "ask_model", lambda *a: "```python\nimport modul_yok_123\n```")
    msg = app.dev.edit_core("emotions.py", "boz")
    assert "geri aldım" in msg and target.read_text(encoding="utf-8") == before


def test_backup_and_rollback_restore_files(monkeypatch):
    from arex import devtools
    monkeypatch.setattr(devtools, "restart_self", lambda *a: "")
    target = devtools.SRC / "emotions.py"
    before = target.read_text(encoding="utf-8")
    devtools.backup("test")
    try:
        target.write_text(before + "\n# bozuk değişiklik\n", encoding="utf-8")
        assert "döndüm" in devtools.rollback()
        assert target.read_text(encoding="utf-8") == before
    finally:
        target.write_text(before, encoding="utf-8")


def test_self_update_from_zip(monkeypatch, tmp_path):
    import shutil
    import zipfile
    from arex import devtools
    monkeypatch.setattr(devtools, "restart_self", lambda *a: "")
    monkeypatch.setattr(devtools, "_run", lambda *a, **k: (0, "ok"))      # pip çalıştırma
    fake_src = tmp_path / "src"
    shutil.copytree(devtools.SRC, fake_src / "repo-arex" / "arex", ignore=shutil.ignore_patterns("__pycache__"))
    cfgf = fake_src / "repo-arex" / "arex" / "config.py"
    cfgf.write_text(cfgf.read_text(encoding="utf-8").replace('VERSION = "2.0.0"', 'VERSION = "2.0.1"'), encoding="utf-8")
    z = tmp_path / "u.zip"
    with zipfile.ZipFile(z, "w") as zf:
        for f in fake_src.rglob("*"):
            zf.write(f, f.relative_to(fake_src))
    install_dir = tmp_path / "install" / "arex"
    shutil.copytree(devtools.SRC, install_dir, ignore=shutil.ignore_patterns("__pycache__"))
    monkeypatch.setattr(devtools, "SRC", install_dir)
    monkeypatch.setattr(devtools, "ROOT", install_dir.parent)
    app = _app()
    app.cfg["update_url"] = z.as_uri()
    msg = app.dev.self_update()
    assert "2.0.1" in msg, msg
    assert 'VERSION = "2.0.1"' in (install_dir / "config.py").read_text(encoding="utf-8")


def test_dashboard_serves_hud_and_actions():
    from arex import dashboard
    app = _app()
    app.cfg.update(dashboard_port=18766, dashboard_token="")
    assert dashboard.start(app)
    base = "http://127.0.0.1:18766"
    html = urllib.request.urlopen(base + "/").read().decode()
    assert "A.R.E.X" in html and "reactor" in html
    assert urllib.request.urlopen(base + "/icon.svg").read().startswith(b"<svg")
    assert json.loads(urllib.request.urlopen(base + "/api/activity").read()) == []
    req = urllib.request.Request(base + "/api/action", json.dumps({"name": "backup"}).encode(),
                                 {"Content-Type": "application/json"})
    assert "Yedek" in json.loads(urllib.request.urlopen(req).read())["result"]
