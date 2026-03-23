@echo off
setlocal EnableDelayedExpansion
title ClipCatch
cd /d "%~dp0"

echo ============================================
echo  ClipCatch - 一站式视频知识提炼桌面应用
echo ============================================
echo.

:: ---- 1) 指定 Anaconda Python 3.12（避免系统 Python 3.13 冲突） ----
set PYTHON_CMD=E:\Code-env\Python\Anaconda\python.exe
if not exist "%PYTHON_CMD%" (
    echo [WARN] Anaconda Python 未找到，尝试系统 python...
    set PYTHON_CMD=python
)
for /f "delims=" %%i in ('"%PYTHON_CMD%" --version 2^>^&1') do echo [OK] %%i

:: ---- 2) 检测 Node / pnpm ----
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 未找到 Node.js，请安装 Node.js 18+
    pause
    exit /b 1
)
for /f "delims=" %%i in ('node --version 2^>^&1') do echo [OK] Node.js %%i

where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] 未找到 pnpm，正在安装...
    npm install -g pnpm
)
for /f "delims=" %%i in ('pnpm --version 2^>^&1') do echo [OK] pnpm %%i

:: ---- 3) 安装 Python 依赖 ----
echo.
echo [1/3] 检查 Python 依赖...
"%PYTHON_CMD%" -m pip install -r "%~dp0apps\backend\requirements.txt" -q --disable-pip-version-check
if %errorlevel% neq 0 echo [WARN] pip install 有警告，继续
echo [OK] Python 依赖已就绪

:: ---- 4) 安装前端/桌面依赖 ----
echo.
echo [2/3] 检查前端/桌面依赖...
if not exist "%~dp0node_modules" (
    echo 首次运行，安装根依赖...
    pnpm install
) else (
    echo [OK] 根依赖已存在
)
if not exist "%~dp0apps\desktop\node_modules" (
    echo 安装 desktop 依赖...
    pnpm -C "%~dp0apps\desktop" install
) else (
    echo [OK] desktop 依赖已存在
)

:: ---- 5) 启动后端（独立窗口） ----
echo.
echo [3/3] 启动后端服务...
start "ClipCatch-Backend" /min cmd /k ""%PYTHON_CMD%" "%~dp0apps\backend\src\main.py" --port 57891 --host 127.0.0.1"
echo 等待后端启动（5秒）...
timeout /t 5 /nobreak >nul

:: ---- 6) 启动桌面端（含前端 dev server + Electron） ----
echo 启动桌面端...
pnpm -C "%~dp0apps\desktop" dev

echo.
echo ClipCatch 已退出。
pause
