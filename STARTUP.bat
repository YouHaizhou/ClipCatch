@echo off
title ClipCatch
cd /d "%~dp0"

echo [1/3] Starting backend...
start "ClipCatch-Backend" /min cmd /k "cd /d "%~dp0apps\backend\src" && E:\Code-env\Python\Anaconda\python.exe main.py --port 57891 --host 127.0.0.1"
timeout /t 7 /nobreak >nul

echo [2/3] Starting frontend...
start "ClipCatch-Frontend" /min cmd /k "cd /d "%~dp0apps\frontend" && pnpm dev"
timeout /t 12 /nobreak >nul

echo [3/3] Starting Electron...
cd /d "%~dp0apps\desktop"
node_modules\.bin\electron .

echo.
echo ClipCatch exited.
pause
