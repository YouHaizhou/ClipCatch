"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// ============================================================
// Preload 脚本：通过 contextBridge 向渲染进程安全暴露有限 API
// 渲染进程只能调用这里明确暴露的方法，无法直接访问 Node.js
// ============================================================
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // 选择目录对话框
    selectDirectory: () => electron_1.ipcRenderer.invoke('dialog:select-directory'),
    // 保存文件对话框
    saveFile: (defaultName) => electron_1.ipcRenderer.invoke('dialog:save-file', defaultName),
    // 在系统文件管理器中打开路径
    openPath: (filePath) => electron_1.ipcRenderer.invoke('shell:open-path', filePath),
    // 获取后端 FastAPI 服务端口
    getBackendPort: () => electron_1.ipcRenderer.invoke('app:get-backend-port'),
    // 窗口控制
    minimize: () => electron_1.ipcRenderer.send('window:minimize'),
    maximize: () => electron_1.ipcRenderer.send('window:maximize'),
    close: () => electron_1.ipcRenderer.send('window:close'),
});
