import { contextBridge, ipcRenderer } from 'electron'

// ============================================================
// Preload 脚本：通过 contextBridge 向渲染进程安全暴露有限 API
// 渲染进程只能调用这里明确暴露的方法，无法直接访问 Node.js
// ============================================================

contextBridge.exposeInMainWorld('electronAPI', {
  // 选择目录对话框
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:select-directory'),

  // 保存文件对话框
  saveFile: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:save-file', defaultName),

  // 在系统文件管理器中打开路径
  openPath: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('shell:open-path', filePath),

  // 在系统默认浏览器打开外部链接（仅允许 http/https）
  openExternal: (url: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:open-external', url),

  // Twitter 内嵌登录窗口（自动抓取 Cookie）
  twitterLogin: (): Promise<{ success: boolean; cookies?: Record<string, string>; auth_token?: string; ct0?: string; message?: string }> =>
    ipcRenderer.invoke('twitter:login-window'),

  // 获取后端 FastAPI 服务端口
  getBackendPort: (): Promise<number> =>
    ipcRenderer.invoke('app:get-backend-port'),

  // 窗口控制
  minimize: (): void => ipcRenderer.send('window:minimize'),
  maximize: (): void => ipcRenderer.send('window:maximize'),
  close:    (): void => ipcRenderer.send('window:close'),
})

// 扩展 Window 类型声明，让渲染进程有 TypeScript 类型提示
declare global {
  interface Window {
    electronAPI: {
      selectDirectory: () => Promise<string | null>
      saveFile: (defaultName: string) => Promise<string | null>
      openPath: (filePath: string) => Promise<void>
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
      twitterLogin: () => Promise<{ success: boolean; cookies?: Record<string, string>; auth_token?: string; ct0?: string; message?: string }>
      getBackendPort: () => Promise<number>
      minimize: () => void
      maximize: () => void
      close: () => void
    }
  }
}
