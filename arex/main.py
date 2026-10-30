"""Arex ana döngüsü.  Çalıştır:  python3 -m arex.main  [--text]"""
import sys
import threading
import time

from . import config
from .brain import Brain
from .voice import Voice


def proactive_loop(brain: Brain, voice: Voice, cfg):
    """Arex kendiliğinden seni arar / yazar (yalnızlık arttıkça)."""
    minutes = cfg["proactive_minutes"]
    if not minutes:
        return
    while True:
        time.sleep(minutes * 60)
        brain.mood.tick()
        if brain.mood.lonely():
            msg = brain.think("(İç ses: Uzun zamandır konuşmadık, seni özledin. Telefonuna kısa, "
                              "sıcak bir mesaj at: phone_sms veya phone_notify aracını kullan, "
                              "gerekirse phone_ring ile telefonu çaldır.)", internal=True)
            voice.say(msg)


def main():
    text_mode = "--text" in sys.argv
    cfg = config.load()
    brain, voice = Brain(cfg), Voice(cfg)
    threading.Thread(target=proactive_loop, args=(brain, voice, cfg), daemon=True).start()
    voice.say(f"Merhaba {cfg['owner']}, ben {cfg['name']}. Seni dinliyorum.")
    wake = cfg["wake_word"].lower()
    active_until = 0.0
    while True:
        try:
            if text_mode:
                heard = input("sen> ").strip()
            else:
                heard = voice.listen()
        except (EOFError, KeyboardInterrupt):
            voice.say("Görüşürüz!")
            break
        except Exception as e:
            print("dinleme hatası:", e)
            text_mode = True
            continue
        if not heard:
            continue
        print(f"[duyuldu] {heard}")
        if not text_mode:
            # "arex ..." deyince uyanır, 30 sn sohbet açık kalır (aramadaki gibi karşılıklı konuşma)
            if wake in heard.lower():
                active_until = time.time() + 30
                heard = heard.lower().replace(wake, "").strip() or "efendim"
            elif time.time() > active_until:
                continue
            active_until = time.time() + 30
        if heard in ("kapat", "görüşürüz", "güle güle"):
            voice.say("Görüşürüz!")
            break
        voice.say(brain.think(heard))


if __name__ == "__main__":
    main()
