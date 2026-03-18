import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import http from 'http'

// ============================================================
// Electron 主进程入口
// 职责：创建窗口、启动 FastAPI 子进程、注册 IPC 处理器
// ============================================================

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null
let backendPort = 57891

// ---------- 0. 单实例锁（防止多窗口）----------
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// ---------- 1. 启动 Python FastAPI 后端子进程 ----------
function startBackend(): void {
  const isProd = app.isPackaged
  const backendPath = isProd
    ? path.join(process.resourcesPath, 'backend', 'main.py')
    : path.join(__dirname, '..', 'backend', 'main.py')

  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'

  // 注入 ffmpeg 路径，确保打包后 yt-dlp 能调用 ffmpeg
  const env = { ...process.env }
  if (isProd) {
    const ffmpegDir = path.join(process.resourcesPath, 'ffmpeg', 'win')
    env.PATH = `${ffmpegDir};${env.PATH ?? ''}`
  }

  backendProcess = spawn(pythonCmd, [
    backendPath,
    '--port', String(backendPort),
    '--host', '127.0.0.1',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  })

  backendProcess.stdout?.on('data', (data) => {
    console.log('[Backend]', data.toString().trim())
  })

  backendProcess.stderr?.on('data', (data) => {
    console.error('[Backend Error]', data.toString().trim())
  })

  backendProcess.on('exit', (code) => {
    console.log(`[Backend] exited with code ${code}`)
    backendProcess = null
  })

  console.log(`[Main] Backend started: ${backendPath} on port ${backendPort}`)
}

// ---------- 2. 等待后端就绪（轮询 /health 接口）----------
function waitForBackend(maxRetries = 30): Promise<void> {
  return new Promise((resolve, reject) => {
    let retries = 0
    const check = () => {
      http.get(`http://127.0.0.1:${backendPort}/health`, (res) => {
        if (res.statusCode === 200) {
          console.log('[Main] Backend is ready')
          resolve()
        } else {
          retry()
        }
      }).on('error', retry)
    }
    const retry = () => {
      retries++
      if (retries >= maxRetries) {
        reject(new Error('Backend failed to start'))
      } else {
        setTimeout(check, 500)
      }
    }
    check()
  })
}

// ---------- 3. 创建主窗口 ----------
async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    title: 'VideoAI Desktop',
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // 关闭 webSecurity：允许渲染进程直连 127.0.0.1 后端
      // 本应用仅加载本地/localhost 资源，无安全风险
      webSecurity: false,
    },
    show: false,
    backgroundColor: '#0f1117',
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (e) => {
    const choice = dialog.showMessageBoxSync(mainWindow!, {
      type: 'question',
      buttons: ['继续退出', '取消'],
      defaultId: 1,
      title: '确认退出',
      message: '退出后下载任务将中断，确定退出吗？',
    })
    if (choice === 1) e.preventDefault()
  })

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
    })
  })

  if (app.isPackaged) {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  } else {
    await mainWindow.loadURL('http://localhost:5173')
    // 开发模式开启 DevTools，方便查看网络请求和 Console 报错
    mainWindow.webContents.openDevTools()
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ---------- 4. IPC 处理器 ----------
ipcMain.handle('dialog:select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:save-file', async (_event, defaultName: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultName,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  return result.canceled ? null : result.filePath
})

ipcMain.handle('shell:open-path', async (_event, filePath: string) => {
  await shell.openPath(filePath)
})

ipcMain.handle('app:get-backend-port', () => backendPort)

ipcMain.handle('shell:open-external', async (_event, url: string) => {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { success: false, error: '不支持的协议' }
  }
  await shell.openExternal(url)
  return { success: true }
})

ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

// ---------- 5. 应用生命周期 ----------
app.whenReady().then(async () => {
  try {
    startBackend()
    await waitForBackend()
    await createWindow()
  } catch (err) {
    console.error('[Main] Startup failed:', err)
    app.quit()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill()
    backendProcess = null
  }
})
