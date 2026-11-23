# Arex 1.9 Windows kurulumu. KUR.bat ile calistir. Bir kez internet gerekir.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ax = Join-Path $env:USERPROFILE ".arex"
New-Item -ItemType Directory -Force -Path $ax | Out-Null
function Step($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
$hasWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)

Step "1/5 Python 3.12"
$py = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
if (-not (Test-Path $py)) {
    if (-not $hasWinget) { throw "winget yok. Python 3.12'yi python.org'dan kur (Add to PATH isaretle), sonra KUR.bat'i tekrar calistir." }
    winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements
}
if (-not (Test-Path $py)) { $py = (Get-Command python -ErrorAction Stop).Source }
& $py --version

Step "2/5 Ollama (yapay zeka beyni)"
$ol = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
if (-not (Test-Path $ol)) {
    if (-not $hasWinget) { throw "winget yok. Ollama'yi ollama.com/download adresinden kur, sonra tekrar calistir." }
    winget install -e --id Ollama.Ollama --silent --accept-package-agreements --accept-source-agreements
}
if (-not (Test-Path $ol)) { $ol = (Get-Command ollama -ErrorAction Stop).Source }
try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:11434 -TimeoutSec 3 | Out-Null }
catch { Start-Process $ol "serve" -WindowStyle Hidden; Start-Sleep 6 }

Step "3/5 Modeller indiriliyor (birkac GB, sabir...)"
& $ol pull llama3.1:8b
& $ol pull moondream
& $ol pull qwen2.5-coder:7b      # kendine kod yazmak icin

Step "4/5 Python paketleri"
& $py -m venv "$ax\venv"
& "$ax\venv\Scripts\python.exe" -m pip install --upgrade pip
& "$ax\venv\Scripts\python.exe" -m pip install -r "$root\arex\requirements.txt"

Step "5/5 Turkce ses tanima modeli (Vosk)"
if (-not (Test-Path "$ax\vosk-model-small-tr-0.3")) {
    $zip = "$ax\vosk-tr.zip"
    Invoke-WebRequest -UseBasicParsing "https://alphacephei.com/vosk/models/vosk-model-small-tr-0.3.zip" -OutFile $zip
    Expand-Archive $zip -DestinationPath $ax -Force
    Remove-Item $zip
}
Step "Masaustu kisayolu"
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "AREX.lnk"))
$lnk.TargetPath = Join-Path $root "BASLAT-YAZILI.bat"
$lnk.WorkingDirectory = $root
$lnk.IconLocation = Join-Path $root "arex\arex.ico"
$lnk.WindowStyle = 7     # konsol simge durumunda; panel ayri pencerede acilir
$lnk.Save()
Write-Host "`nKURULUM BITTI. Masaustundeki AREX simgesine cift tikla." -ForegroundColor Green
