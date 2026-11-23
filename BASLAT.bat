@echo off
title A.R.E.X
cd /d "%~dp0"
chcp 65001 >nul
set PYTHONUTF8=1
if not exist "%USERPROFILE%\.arex\venv\Scripts\python.exe" (echo Once KUR.bat calistir! & pause & exit /b)
:basla
"%USERPROFILE%\.arex\venv\Scripts\python.exe" -m arex.main 
if %errorlevel%==3 (echo Arex kendini guncelledi, yeniden baslatiliyor... & set AREX_RESTARTED=1 & goto basla)
pause
