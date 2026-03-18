@echo off
chcp 65001 >nul
title ClipCatch 启动器
cd /d "%~dp0"

echo.
echo  ========================================
echo    ClipCatch 启动器
echo    一站式视频知识提炼桌面应用
echo  ========================================
echo.

:: 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Python，请先安装 Python 3.10+
    echo 下载地址：https://www.python.org/downloads/
    pause & exit /b 1
)

:: 检查 Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18+
    echo 下载地址：https://nodejs.org/
    pause & exit /b 1
)

:: 检查 pnpm
pnpm --version >nul 2>&1
if errorlevel 1 (
    echo [提示] 正在安装 pnpm...
    npm install -g pnpm
)

echo [1/4] 安装依赖（首次较慢，请耐心等待）...
call pnpm install >nul 2>&1

echo [2/4] 安装后端依赖...
pip install -r apps\backend\requirements.txt -q

echo [3/4] 启动后端服务...
start "ClipCatch-Backend" /min cmd /c "cd /d "%~dp0apps\backend\src" && python main.py --port 57891 --host 127.0.0.1"

echo [4/4] 等待后端就绪...
timeout /t 5 /nobreak >nul

:: 检查后端
curl -s http://127.0.0.1:57891/health >nul 2>&1
if errorlevel 1 (
    echo [提示] 后端启动中，再等几秒...
    timeout /t 5 /nobreak >nul
)

echo [5/5] 启动前端...
start "ClipCatch-Frontend" /min cmd /c "cd /d "%~dp0apps\frontend" && pnpm dev"

echo 等待前端就绪...
timeout /t 8 /nobreak >nul

echo 启动主窗口...
cd /d "%~dp0apps\desktop"
node_modules\.bin\electron .

echo.
echo [ClipCatch 已退出]
pause
