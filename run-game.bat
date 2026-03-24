@echo off
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found in PATH.
  echo Install Python from https://www.python.org/ ^(enable "Add python.exe to PATH"^)
  pause
  exit /b 1
)

REM Prefer PowerShell launcher: waits until the server is ready before opening the browser.
where powershell >nul 2>nul
if errorlevel 1 goto :basic

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-game.ps1"
exit /b 0

:basic
echo PowerShell not found — using a simple launcher.
echo A window will open with the server. Wait until you see "Serving HTTP", then refresh the browser.
echo.
start "Dungeon Crawler server" /D "%~dp0" cmd /k "python -m http.server 8765"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:8765/"
echo.
echo If you see ERR_CONNECTION_REFUSED, wait a few seconds and press F5 in the browser.
pause
