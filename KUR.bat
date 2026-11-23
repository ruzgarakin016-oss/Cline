@echo off
cd /d "%~dp0"
echo Arex kuruluyor, pencereyi kapatma...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
pause
