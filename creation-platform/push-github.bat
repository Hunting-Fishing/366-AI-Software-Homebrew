@echo off
REM ============================================================
REM One-click push to GitHub for the Creation Platform.
REM First time: installs nothing, but you need Git for Windows
REM from https://git-scm.com/download/win (accept all defaults).
REM On the first push, a GitHub sign-in window opens in your
REM browser - sign in once and Git remembers you.
REM ============================================================

where git >nul 2>nul
if errorlevel 1 (
  echo Git is not installed yet. Download it from:
  echo    https://git-scm.com/download/win
  echo Install with default settings, then run this file again.
  pause
  exit /b 1
)

cd /d "%~dp0"

if not exist .git (
  echo Setting up this folder as a Git repository...
  git init
  git branch -M main
  git remote add origin https://github.com/Hunting-Fishing/366-AI-Software-Homebrew.git
)

echo Saving your changes...
git add -A
git commit -m "Update %date% %time%"

echo Syncing with GitHub (a sign-in window may open the first time)...
git pull origin main --rebase --allow-unrelated-histories 2>nul
git push -u origin main

echo.
echo Done! Check https://github.com/Hunting-Fishing/366-AI-Software-Homebrew
pause
