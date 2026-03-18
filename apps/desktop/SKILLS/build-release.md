# Skill：打包发布

## 触发时机
Desktop Agent 需要进行打包配置或执行打包时调用此 Skill。

## 打包流程

### 第一步：确认条件（在项目根目录执行）

```bash
# 确认前端构建产物
ls apps/frontend/dist/

# 确认 ffmpeg 内置文件
ls resources/ffmpeg/win/
# 应有：ffmpeg.exe + ffprobe.exe
```

### 第二步：构建前端

```bash
pnpm -C apps/frontend build
```

### 第三步：编译 Electron 主进程

```bash
tsc -p tsconfig.json
# 输出到 dist-electron/
```

### 第四步：打包 Windows 安装包

```bash
electron-builder --win --config electron-builder.yml
# 输出：release/VideoAI-Setup-x.x.x.exe + VideoAI-x.x.x-portable.zip
```

## electron-builder.yml 关键配置

```yaml
appId: com.videoai.desktop
productName: VideoAI Desktop
directories:
  output: release

files:
  - dist/**/*           # 前端构建产物
  - dist-electron/**/*  # Electron 主进程
  - "!node_modules"

extraResources:
  - from: resources/ffmpeg
    to: ffmpeg
  - from: ../backend/src
    to: backend

win:
  target:
    - target: nsis
      arch: [x64]
    - target: zip
      arch: [x64]

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

## 开发模式 vs 生产模式

| 项目 | 开发模式 | 生产模式 |
|------|---------|----------|
| 前端加载 | `http://localhost:5173` | `dist/index.html` |
| 后端路径 | `../../backend/src/main.py` | `resources/backend/main.py` |
| ffmpeg | `resources/ffmpeg/win/` | `resources/ffmpeg/win/` |
| DevTools | 自动打开 | 不打开 |

## 新增 IPC 通道（需同时修改三个文件）

### src/preload.ts
```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  // 现有通道...
  newMethod: (param: string) => ipcRenderer.invoke('channel:new-method', param),
})
```

### src/main.ts
```typescript
ipcMain.handle('channel:new-method', async (_event, param: string) => {
  return result
})
```

### 通知前端 Agent 更新类型声明
前端 Agent 需在 `src/services/api.ts` 中更新 `Window.electronAPI` 的类型声明。

## 常见问题

- **白屏**：确认 `mainWindow.loadFile()` 路径，使用 `show:false` + `ready-to-show`
- **ffmpeg 路径错误**：检查 `_find_ffmpeg_dir()` 中打包路径是否指向 `resources/ffmpeg/win`
- **Python 未找到**：确保生产环境系统已安装 Python 3.9+
