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
  let windowReady = false  // 标志位：窗口完全显示后才启用退出确认

  mainWindow = new BrowserWindow({
    title: 'ClipCatch',
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
    show: false,
    backgroundColor: '#0f1117',
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    windowReady = true  // 窗口显示后才允许退出确认
  })

  mainWindow.on('close', (_e) => {
    // 直接关闭，不弹确认框
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
    // 开发模式不自动开启 DevTools，如需调试请按 Ctrl+Shift+I 手动开启
    // mainWindow.webContents.openDevTools()
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

// ---------- Twitter 登录窗口（内嵌浏览器自动抓 Cookie）----------
ipcMain.handle('twitter:login-window', async () => {
  return new Promise((resolve) => {
    // 使用独立 partition，避免扩展/隐私设置干扰
    const loginWin = new BrowserWindow({
      width: 520,
      height: 680,
      title: 'ClipCatch — 登录 Twitter/X',
      resizable: false,
      center: true,
      frame: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:twitter-login',
      },
    })

    // 注入脚本删除 webdriver 标志，避免被 X.com 检测为自动化浏览器
    loginWin.webContents.on('dom-ready', () => {
      loginWin.webContents.executeJavaScript(
        "try { Object.defineProperty(navigator, \"webdriver\", { get: () => undefined }) } catch(e) {}"
      ).catch(() => {})
    })

    // 设置正常浏览器 User-Agent
    loginWin.webContents.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    )

    loginWin.loadURL('https://x.com/i/flow/login')
    loginWin.setMenuBarVisibility(false)

    // 轮询检测 auth_token cookie
    const timer = setInterval(async () => {
      try {
        const allCookies = [
          ...await loginWin.webContents.session.cookies.get({ domain: '.twitter.com' }),
          ...await loginWin.webContents.session.cookies.get({ domain: '.x.com' }),
        ]
        const authToken = allCookies.find(c => c.name === 'auth_token')
        const ct0 = allCookies.find(c => c.name === 'ct0')
        if (authToken && ct0) {
          clearInterval(timer)
          const cookieObj: Record<string, string> = {}
          allCookies.forEach(c => { cookieObj[c.name] = c.value })
          loginWin.close()
          resolve({ success: true, cookies: cookieObj, auth_token: authToken.value, ct0: ct0.value })
        }
      } catch {}
    }, 1000)

    loginWin.on('closed', () => {
      clearInterval(timer)
      resolve({ success: false, message: '用户关闭了登录窗口' })
    })

    // 最多等待 5 分钟
    setTimeout(() => {
      clearInterval(timer)
      if (!loginWin.isDestroyed()) loginWin.close()
      resolve({ success: false, message: '登录超时' })
    }, 5 * 60 * 1000)
  })
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
    if (app.isPackaged) {
      startBackend()
      await waitForBackend()
    } else {
      // 开发模式：等待后端就绪
      await waitForBackend(20)
      // 等待 Vite 前端就绪
      await new Promise<void>((resolve) => {
        const tryFrontend = () => {
          http.get('http://localhost:5173', (res) => {
            if (res.statusCode && res.statusCode < 500) resolve()
            else setTimeout(tryFrontend, 500)
          }).on('error', () => setTimeout(tryFrontend, 500))
        }
        tryFrontend()
      })
    }
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
