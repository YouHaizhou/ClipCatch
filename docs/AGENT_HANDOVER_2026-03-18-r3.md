# VideoAI Desktop — Agent 交接文档

**生成时间**：2026-03-18
**轮次**：第三轮（r3）
**生成人**：主 Agent

---

## 📊 当前项目状态

### Git 分支
| 分支 | 状态 | 说明 |
|------|------|------|
| `main` | ✅ 已推送 | 生产分支 |
| `develop` | ✅ 已推送 | 开发主分支，包含所有已合并功能 |
| `feature/backend-bugfix-download-search` | ✅ 已推送 | 后端 P1 修复分支，待 merge |
| `feature/frontend-ui-fixes` | ✅ 已推送 | 前端 UI 修复分支，待 merge |
| `feature/desktop-open-external` | ✅ 已推送 | Desktop openExternal 分支，待 merge |

### 各 Agent 任务状态
| Agent | 状态 | 待处理 |
|-------|------|--------|
| 后端 | ✅ 任务完成 | 等待主 Agent merge |
| 前端 | ✅ 任务完成 | 等待主 Agent merge |
| Desktop | ✅ 任务完成 | 等待主 Agent merge |

---

## 🔧 本轮完成的修复（第三轮）

### 后端修复（`feature/backend-bugfix-download-search`）

**文件**：`apps/backend/src/routers/download.py`
- 下载路由最外层加 try/except，防止 500 错误
- `asyncio.create_task` 不再传 `db=db` 参数

**文件**：`apps/backend/src/services/search_service.py`
- 新增 `seed: Optional[int]` 参数，用 `random.Random(seed).shuffle()` 实现搜索多样性

**文件**：`apps/backend/src/routers/search.py`
- 接收前端 `seed` 参数并传给 `search_videos`
- ⚠️ **主 Agent 直接修改**：新增 `to_camel()` 函数，将搜索结果 snake_case 转为前端期望的 camelCase（修复封面不显示根本原因）

### 前端修复（`feature/frontend-ui-fixes`）

**文件**：`apps/frontend/src/lib/utils.ts`
- `formatDuration` 改为 `Xh Xm Xs` 格式，`Math.floor` 取整避免浮点数

**文件**：`apps/frontend/src/components/ExportToolbar.tsx`
- 导出 .md 改为纯前端 Blob 下载，不再依赖后端接口

**文件**：`apps/frontend/src/pages/SearchPage.tsx`
- 移除假预览弹窗，播放按钮改为 `window.electronAPI?.openExternal(url) ?? window.open(url, '_blank')`
- 搜索传 `seed: Date.now()` 实现多样性
- 网格改为 `grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5`
- `page_size` 改为 20

**文件**：`apps/frontend/src/pages/LibraryPage.tsx`
- 排序控件改为按钮组（替代原生 select）

**文件**：`apps/frontend/src/services/api.ts`
- ⚠️ **主 Agent 直接修改**：`Window` 接口补充 `openExternal` 类型声明

### Desktop 修复（`feature/desktop-open-external`）

**文件**：`apps/desktop/src/preload.ts`
- 新增 `openExternal` 通过 contextBridge 暴露
- 类型声明已补充

**文件**：`apps/desktop/src/main.ts`
- 新增 `open-external` IPC handler，含 http/https 协议校验

---

## ⚠️ 待处理事项（新 Agent 接手后首要任务）

### 1. merge 待合并分支（按顺序）
```bash
git checkout develop

# 后端
git merge --no-ff feature/backend-bugfix-download-search -m "Merge: 2026-03-17-P1-bugfix-下载500错误和搜索多样性"

# 前端
git merge --no-ff feature/frontend-ui-fixes -m "Merge: 2026-03-17-P2-feature-搜索媒体库AI工作台UI优化"

# Desktop
git merge --no-ff feature/desktop-open-external -m "Merge: 2026-03-18-P2-feature-preload暴露openExternal接口"

# 推送（在 Windows PowerShell 执行）
git push origin develop
```

### 2. 端到端功能验证（P1）
参考 `SKILLS/main/integration-test.md` 执行完整测试流程。

### 3. 下一批任务（优先级排序）
1. **P1** 下载暂停真正实现（当前暂停等同取消，需后端实现 yt-dlp 真正暂停/恢复）
2. **P3** 打包发布（electron-builder NSIS + ZIP 便携版）

---

## 🏗️ 环境信息

| 项目 | 值 |
|------|----|n| 后端端口 | 57891 |
| 前端开发端口 | 5173 |
| 数据库路径（WSL）| `/tmp/VideoAI-home/VideoAI/app.db` |
| Linux venv | `.env/venv-linux/` |
| Git remote | `https://github.com/YouHaiZhou/Video-AI-Desktop.git` |
| PAT | 存于 `.git/config`（Windows 侧），WSL 侧只读 |

**后端启动命令（WSL）**：
```bash
cd /root/projects/video-ai-desktop/apps/backend/src
HOME=/tmp/VideoAI-home KMP_DUPLICATE_LIB_OK=TRUE \
  /root/projects/video-ai-desktop/.env/venv-linux/bin/python3 \
  main.py --port 57891 --host 127.0.0.1
```

---

## 📝 本轮经验积累

- **搜索封面不显示根本原因**：后端返回 `thumbnail_url`（snake_case），前端 `VideoInfo` 用 `thumbnailUrl`（camelCase）。修复：`search.py` 路由加 `to_camel()` 转换。后续新增搜索字段必须同步更新 `to_camel()`。
- **Windows venv 不能在 WSL 用**：需在 WSL 内单独建 venv，用 `virtualenv`（`pip3 install virtualenv --target /tmp/pip-tools`）。
- **git push 只能在 Windows 侧**：WSL Cursor Shell 代理劫持，所有 push 必须在 Windows PowerShell 执行。
- **GitHub 大文件限制**：`ffmpeg/*.zip` 超 100MB，已加入 `.gitignore` 并 `git rm --cached`。
- **前端 task 文件含中文**：Write 工具偶尔报错但实际写入成功，用 LS 验证。
- **子 Agent 任务目录**：任务文件必须写入 `apps/[app]/.agent/tasks/`，根目录 `.agent/` 仅作主 Agent 归档用。
