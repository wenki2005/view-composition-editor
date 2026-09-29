@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.19 or newer is required.
  echo Install Node.js and run this launcher again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies for the first run...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:4177/api/health' -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'node' -ArgumentList 'server/http.mjs' -WorkingDirectory '%~dp0' -WindowStyle Hidden"

set /a attempts=0
:wait_server
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:4177/api/health' -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 goto open_browser
set /a attempts+=1
if %attempts% geq 15 (
  echo The local server did not start. Check Node.js and try again.
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait_server

:open_browser
start "" "http://127.0.0.1:4177"
endlocal
