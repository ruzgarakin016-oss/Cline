#!/usr/bin/env bash
# Arex kurulumu (Debian/Ubuntu). Bir kez internet gerekir, sonra tamamen çevrimdışı çalışır.
set -e
sudo apt update
sudo apt install -y python3-pip python3-venv portaudio19-dev espeak-ng alsa-utils kdeconnect adb unzip curl
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.1:8b          # zayıf PC için: ollama pull llama3.2:3b ve config.json'da model'i değiştir
python3 -m venv ~/.arex/venv
~/.arex/venv/bin/pip install -r "$(dirname "$0")/requirements.txt"
cd ~/.arex
[ -d vosk-model-small-tr-0.3 ] || { curl -LO https://alphacephei.com/vosk/models/vosk-model-small-tr-0.3.zip && unzip -q vosk-model-small-tr-0.3.zip; }
echo "Hazır. Çalıştır: cd $(dirname "$(dirname "$0")") && ~/.arex/venv/bin/python -m arex.main"
