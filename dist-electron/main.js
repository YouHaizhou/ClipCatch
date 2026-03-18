"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const http_1 = __importDefault(require("http"));
// ============================================================
// Electron 主进程入口
// 职责：创建窗口、启动 FastAPI 子进程、注册 IPC 处理器
// ============================================================
let mainWindow = null;
let backendProcess = null;
let backendPort = 57891;
// ---------- 1. 启动 Python FastAPI 后端子进程 ----------
function startBackend() {
    const isProd = electron_1.app.isPackaged;
    const backendPath = isProd
        ? path_1.default.join(process.resourcesPath, 'backend', 'main.py')
        : path_1.default.join(__dirname, '..', 'backend', 'main.py');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    // 注入 ffmpeg 路径，确保打包后 yt-dlp 能调用 ffmpeg
    const env = { ...process.env };
    if (isProd) {
        const ffmpegDir = path_1.default.join(process.resourcesPath, 'ffmpeg', 'win');
        env.PATH = `${ffmpegDir};${env.PATH ?? ''}`;
    }
    backendProcess = (0, child_process_1.spawn)(pythonCmd, [
        backendPath,
        '--port', String(backendPort),
        '--host', '127.0.0.1',
    ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
    });
    backendProcess.stdout?.on('data', (data) => {
        console.log('[Backend]', data.toString().trim());
    });
    backendProcess.stderr?.on('data', (data) => {
        console.error('[Backend Error]', data.toString().trim());
    });
    backendProcess.on('exit', (code) => {
        console.log(`[Backend] exited with code ${code}`);
        backendProcess = null;
    });
    console.log(`[Main] Backend started: ${backendPath} on port ${backendPort}`);
}
// ---------- 2. 等待后端就绪（轮询 /health 接口）----------
function waitForBackend(maxRetries = 30) {
    return new Promise((resolve, reject) => {
        let retries = 0;
        const check = () => {
            http_1.default.get(`http://127.0.0.1:${backendPort}/health`, (res) => {
                if (res.statusCode === 200) {
                    console.log('[Main] Backend is ready');
                    resolve();
                }
                else {
                    retry();
                }
            }).on('error', retry);
        };
        const retry = () => {
            retries++;
            if (retries >= maxRetries) {
                reject(new Error('Backend failed to start'));
            }
            else {
                setTimeout(check, 500);
            }
        };
        check();
    });
}
// ---------- 3. 创建主窗口 ----------
async function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 600,
        frame: false,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            // 关闭 webSecurity：允许渲染进程直连 127.0.0.1 后端
            // 本应用仅加载本地/localhost 资源，无安全风险
            webSecurity: false,
        },
        show: false,
        backgroundColor: '#0f1117',
    });
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    // 覆盖 Chromium 默认 CSP：允许加载 http 图片（B站封面等）和连接本地后端
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
                        "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*; " +
                        "img-src 'self' data: blob: https: http:; " +
                        "media-src 'self' blob: https: http: file:; " +
                        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
                        "style-src 'self' 'unsafe-inline';"
                ],
            },
        });
    });
    if (electron_1.app.isPackaged) {
        await mainWindow.loadFile(path_1.default.join(__dirname, '..', 'dist', 'index.html'));
    }
    else {
        await mainWindow.loadURL('http://localhost:5173');
        // 开发模式开启 DevTools，方便查看网络请求和 Console 报错
        mainWindow.webContents.openDevTools();
    }
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        electron_1.shell.openExternal(url);
        return { action: 'deny' };
    });
}
// ---------- 4. IPC 处理器 ----------
electron_1.ipcMain.handle('dialog:select-directory', async () => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
});
electron_1.ipcMain.handle('dialog:save-file', async (_event, defaultName) => {
    const result = await electron_1.dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    return result.canceled ? null : result.filePath;
});
electron_1.ipcMain.handle('shell:open-path', async (_event, filePath) => {
    await electron_1.shell.openPath(filePath);
});
electron_1.ipcMain.handle('app:get-backend-port', () => backendPort);
electron_1.ipcMain.on('window:minimize', () => mainWindow?.minimize());
electron_1.ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized())
        mainWindow.unmaximize();
    else
        mainWindow?.maximize();
});
electron_1.ipcMain.on('window:close', () => mainWindow?.close());
// ---------- 5. 应用生命周期 ----------
electron_1.app.whenReady().then(async () => {
    try {
        startBackend();
        await waitForBackend();
        await createWindow();
    }
    catch (err) {
        console.error('[Main] Startup failed:', err);
        electron_1.app.quit();
    }
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('before-quit', () => {
    if (backendProcess) {
        backendProcess.kill();
        backendProcess = null;
    }
});
