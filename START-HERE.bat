@echo off
setlocal
title 366 Creation Platform
cd /d "%~dp0creation-platform"

echo.
echo   ================================================
echo      366 Creation Platform
echo   ================================================
echo.

REM ---- Is Node installed? -------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo   Node.js is not installed.
  echo.
  echo   Download the LTS version from  https://nodejs.org
  echo   Install it, then run this file again.
  echo.
  pause
  exit /b 1
)

REM ---- Does .env exist? ---------------------------------------
if not exist ".env" (
  echo   No settings file found. Creating one from the template...
  copy /y "..\.env.example" ".env" >nul
  echo.
  echo   Opening it now. Fill in the two lines marked "FILL THIS IN",
  echo   save the file, then run this again.
  echo.
  notepad ".env"
  pause
  exit /b 1
)

REM ---- Is there a model key? ----------------------------------
findstr /r /c:"^ANTHROPIC_API_KEY=." /c:"^OPENAI_API_KEY=." /c:"^GOOGLE_API_KEY=." ".env" >nul 2>&1
if errorlevel 1 (
  echo   Your settings file has no AI key yet.
  echo.
  echo   Opening it now. Paste your key after  ANTHROPIC_API_KEY=
  echo   Get one at  https://console.anthropic.com
  echo   Save the file, then run this again.
  echo.
  notepad ".env"
  pause
  exit /b 1
)

REM ---- Dependencies -------------------------------------------
if not exist "node_modules" (
  echo   First run - installing dependencies. This takes a minute...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo   Install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

REM ---- Open the browser once the server has had time to boot ---
start "" cmd /c "timeout /t 7 >nul & start "" http://localhost:3000"

echo   Starting. Your browser will open in a few seconds.
echo   Leave this window open while you use the app.
echo   Close it, or press Ctrl+C, to stop.
echo.

call npx tsx src/server.ts

echo.
echo   The server stopped.
pause
