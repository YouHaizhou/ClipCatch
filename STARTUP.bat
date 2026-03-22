@echo off
setlocal EnableDelayedExpansion
title ClipCatch
cd /d "%~dp0"

echo ============================================
echo  ClipCatch - 一站式视频知识提炼桌面应用
echo ============================================
echo.

:: ---- 1. 检测 Python ----
set PYTHON_CMD=

:: 优先尝试 python / python3 命令
where python >nul 2>&1
if %errorlevel%==0 (
    for /f "delims=" %%i in ('python --version 2^>&1') do set PY_VER=%%i
    echo [OK] 找到 Python: !PY_VER!
    set PYTHON_CMD=python
    goto :check_node
)

where python3 >nul 2>&1
if %errorlevel%==0 (
    for /f "delims=" %%i in ('python3 --version 2^>&1') do set PY_VER=%%i
    echo [OK] 找到 Python: !PY_VER!
    set PYTHON_CMD=python3
    goto :check_node
)

:: 尝试常见 Anaconda/Miniconda 路径
for %%P in (
    "%USERPROFILE%\anaconda3\python.exe"
    "%USERPROFILE%\miniconda3\python.exe"
    "%LOCALAPPDATA%\anaconda3\python.exe"
    "%LOCALAPPDATA%\miniconda3\python.exe"
    "C:\anaconda3\python.exe"
    "C:\miniconda3\python.exe"
    "C:\Python311\python.exe"
    "C:\Python310\python.exe"
) do (
    if exist %%P (
        echo [OK] 找到 Python: %%P
        set PYTHON_CMD=%%P
        goto :check_node
    )
)

echo [ERROR] 未找到 Python，请安装 Python 3.10+ 后重试
echo 下载地址: https://www.python.org/downloads/
pause
exit /b 1

:check_node
:: ---- 2. 检测 Node.js / pnpm ----
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 未找到 Node.js，请安装 Node.js 18+ 后重试
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)
for /f "delims=" %%i in ('node --version 2^>&1') do echo [OK] Node.js %%i

where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] 未找到 pnpm，正在安装...
    npm install -g pnpm
)
for /f "delims=" %%i in ('pnpm --version 2^>&1') do echo [OK] pnpm %%i

:: ---- 3. 安装 Python 依赖 ----
echo.
echo [1/4] 检查 Python 依赖...
!PYTHON_CMD! -m pip install -r "%~dp0apps\backend\requirements.txt" -q --disable-pip-version-check
if %errorlevel% neq 0 (
    echo [WARN] pip install 出现警告，继续启动...
)
echo [OK] Python 依赖已就绪

:: ---- 4. 安装前端依赖 ----
echo.
echo [2/4] 检查前端依赖...
if not exist "%~dp0node_modules" (
    echo 首次运行，安装前端依赖（约 1-2 分钟）...
    pnpm install
) else (
    echo [OK] 前端依赖已存在，跳过安装
)

:: ---- 5. 启动后端 ----
echo.
echo [3/4] 启动后端服务...
start "ClipCatch-Backend" /min cmd /k "set KMP_DUPLICATE_LIB_OK=TRUE && cd /d "%~dp0apps\backend\src" && !PYTHON_CMD! main.py --port 57891 --host 127.0.0.1"

echo 等待后端启动...
timeout /t 5 /nobreak >nul

:: ---- 6. 启动前端 ----
echo.
echo [4/4] 启动前端 + Electron 窗口...
start "ClipCatch-Frontend" /min cmd /k "cd /d "%~dp0apps\frontend" && pnpm dev"

echo 等待前端编译（约 10 秒）...
timeout /t 12 /nobreak >nul

:: ---- 7. 启动 Electron ----
cd /d "%~dp0apps\desktop"
if not exist node_modules (
    pnpm install
)
node_modules\.bin\electron .

echo.
echo ClipCatch 已退出。
pause
