@echo off
chcp 65001 >nul
title ClipCatch 启动器

echo.
echo  ╔══════════════════════════════════════╗
echo  ║         ClipCatch 启动器             ║
echo  ║   一站式视频知识提炼桌面应用         ║
echo  ╚══════════════════════════════════════╝
echo.

:: 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Python，请先安装 Python 3.10+
    echo 下载地址：https://www.python.org/downloads/
    pause
    exit /b 1
)

:: 检查 Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18+
    echo 下载地址：https://nodejs.org/
    pause
    exit /b 1
)

:: 检查 pnpm
pnpm --version >nul 2>&1
if errorlevel 1 (
    echo [提示] 正在安装 pnpm...
    npm install -g pnpm
)

echo [1/4] 安装前端依赖...
call pnpm install
if errorlevel 1 (
    echo [错误] 前端依赖安装失败
    pause
    exit /b 1
)

echo [2/4] 安装后端依赖...
cd apps\backend
pip install -r requirements.txt -q
if errorlevel 1 (
    echo [错误] 后端依赖安装失败
    pause
    exit /b 1
)
cd ..\.. 

echo [3/4] 启动后端服务...
start "ClipCatch Backend" /min cmd /c "cd apps\backend\src && python main.py --port 57891 --host 127.0.0.1"

echo [4/4] 等待后端就绪...
timeout /t 4 /nobreak >nul

:: 检查后端是否启动成功
curl -s http://127.0.0.1:57891/health >nul 2>&1
if errorlevel 1 (
    echo [提示] 后端启动中，继续等待...
    timeout /t 4 /nobreak >nul
)

echo 启动前端 + Electron 窗口...
cd apps\frontend
call pnpm dev

pause
