"""Tamamen çevrimdışı ses: Vosk (dinleme) + Piper/espeak-ng (konuşma)."""
import json
import queue
import shutil
import subprocess
import threading
from pathlib import Path


class Voice:
    def __init__(self, cfg):
        self.cfg = cfg
        self.speaking = threading.Event()
        self._model = None

    # ---------- konuşma ----------
    def say(self, text: str):
        print(f"[{self.cfg['name']}] {text}")
        self.speaking.set()
        try:
            piper_model = self.cfg["piper_model"]
            if piper_model and shutil.which("piper") and shutil.which("aplay"):
                p = subprocess.Popen(["piper", "--model", piper_model, "--output-raw"],
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE)
                a = subprocess.Popen(["aplay", "-q", "-r", "22050", "-f", "S16_LE", "-t", "raw"],
                                     stdin=p.stdout)
                p.stdin.write(text.encode())
                p.stdin.close()
                a.wait()
            elif shutil.which("espeak-ng"):
                subprocess.run(["espeak-ng", "-v", self.cfg["language"], "-s", "155", text])
        finally:
            self.speaking.clear()

    # ---------- dinleme ----------
    def _load(self):
        if self._model is None:
            from vosk import Model, SetLogLevel
            SetLogLevel(-1)
            path = self.cfg["vosk_model_path"]
            if not Path(path).exists():
                raise RuntimeError(f"Vosk modeli yok: {path} (setup.sh indirir)")
            self._model = Model(path)
        return self._model

    def listen(self, max_seconds=15, silence_end=True) -> str:
        """Mikrofondan bir cümle dinler ve metne çevirir. Arex konuşurken dinlemez."""
        import sounddevice as sd
        from vosk import KaldiRecognizer
        rate = 16000
        rec = KaldiRecognizer(self._load(), rate)
        q: "queue.Queue[bytes]" = queue.Queue()

        def cb(indata, frames, t, status):
            if not self.speaking.is_set():
                q.put(bytes(indata))

        import time
        start = time.time()
        with sd.RawInputStream(samplerate=rate, blocksize=4000, dtype="int16",
                               channels=1, callback=cb):
            while time.time() - start < max_seconds:
                try:
                    data = q.get(timeout=1)
                except queue.Empty:
                    continue
                if rec.AcceptWaveform(data):
                    text = json.loads(rec.Result()).get("text", "").strip()
                    if text:
                        return text
        return json.loads(rec.FinalResult()).get("text", "").strip()
