# VideoAI Desktop — 四 Agent 架构总览

> 本文档由主 Agent 整理，描述项目中四个 Cursor Agent 的分工、工作目录、任务流转和协作规则。

---

## 🏗️ 整体架构

```
┌─────────────────────────────────────────────┐
│               主 Agent                      │
│  工作目录：video-ai-desktop/                │
│  职责：管理、分发、审查、验收、Git           │
└──────────┬──────────┬──────────┬────────────┘
           │          │          │
     ┌─────▼──┐ ┌─────▼──┐ ┌────▼───┐
     │前端Agent│ │后端Agent│ │Desktop │
     │frontend │ │backend  │ │Agent   │
     └─────────┘ └─────────┘ └────────┘
```

---

## 👤 主 Agent

**工作目录**：`video-ai-desktop/`（项目根）

**职责**：
- 整体管理：维护架构、文档、版本号
- 任务分发：向子 Agent 下发 Markdown 任务文件
- 代码审查：审查子 Agent 提交的代码
- 验收记录：将验收结果和修改记录写入各 Agent 的 `status.md`
- Git 管理：创建/删除分支，merge，push

**任务下发流程**：
1. 在 `.agent/[app]/tasks/` 创建任务文件（按任务命名，带日期，如 `2026-03-17-P1-feature-xxx.md`）
2. 运行 `bash sync-tasks.sh down` 同步到子 Agent
3. 子 Agent 完成后，主 Agent 验收，将验收结果写入对应 `status.md`
4. 审查通过后 merge 分支

**规则文件**：`.cursorrules`（精简）+ `SKILLS/main/SYSTEM_SKILL.md`（完整）

---

## 🖥️ 前端 Agent

**工作目录**：`apps/frontend/`

**职责**：React 组件、页面、Zustand 状态管理、Tailwind 样式、API 对接

**关键技术约定**：
- 外部图片必须走 `proxyImageUrl()`（`services/api.ts` 导出）
- 页面切换用 `className="hidden"`，禁止 `key={activePage}`
- SSE EventSource 存入 `aiStore._sse`，停止调用 `aiStore.stop()`
- API 响应格式：`{ code: 0, data: {} }` / `{ code: 1, message: '' }`
- 页面导航用 `useSettingsStore.setActivePage`

**任务工作流**：
1. **执行前**：先读 `apps/frontend/.agent/status.md`（了解主 Agent 验收记录和注意事项）
2. 读 `apps/frontend/.agent/tasks/` 获取任务
3. checkout 主 Agent 指定分支，开发，commit，push
4. 任务文件移到 `completed/`（按原文件名保留，含日期）
5. 完成后等待主 Agent 验收

**规则文件**：`apps/frontend/.cursorrules` + `SKILLS/frontend/SYSTEM_SKILL.md`

---

## ⚙️ 后端 Agent

**工作目录**：`apps/backend/`

**职责**：FastAPI 路由、业务逻辑（services/）、SQLAlchemy ORM、第三方服务集成

**关键技术约定**：
- API 响应格式：`{'code': 0, 'data': {}}` / `{'code': 1, 'message': ''}`
- SSE 推送字段统一 snake_case：`progress_pct`、`speed_bps`、`eta_seconds`
- 后台任务独立 `SessionLocal()`，try/finally 关闭
- `main.py` 顶部保留 `KMP_DUPLICATE_LIB_OK=TRUE`
- API Key 加密存储，后端只监听 `127.0.0.1`

**任务工作流**：
1. **执行前**：先读 `apps/backend/.agent/status.md`
2. 读 `apps/backend/.agent/tasks/` 获取任务     
3. checkout 分支，开发，commit，push
4. 任务文件移到 `completed/`
5. 完成后等待主 Agent 验收

**规则文件**：`apps/backend/.cursorrules` + `SKILLS/backend/SYSTEM_SKILL.md`

---

## 🖥️ Desktop Agent

**工作目录**：`apps/desktop/`

**职责**：Electron 主进程（main.ts）、contextBridge IPC（preload.ts）、打包配置

**关键技术约定**：
- 所有 IPC 通道通过 `contextBridge` 暴露，禁止渲染进程直接 `require('electron')`
- `nodeIntegration: false`、`contextIsolation: true` 不得修改
- 主进程 spawn 后端，等待 `/health` 就绪再 `createWindow()`
- 无边框窗口（`frame: false`），背景色 `#0f1117`，最小 960x600

**任务工作流**：
1. **执行前**：先读 `apps/desktop/.agent/status.md`
2. 读 `apps/desktop/.agent/tasks/` 获取任务
3. checkout 分支，开发，commit，push
4. 任务文件移到 `completed/`
5. 完成后等待主 Agent 验收

**规则文件**：`apps/desktop/.cursorrules` + `SKILLS/desktop/SYSTEM_SKILL.md`

---

## 📁 任务系统目录约定

```
apps/[app]/.agent/
├── tasks/         # 主 Agent 下发的待执行任务（按任务命名，含日期）
│                  # 格式：YYYY-MM-DD-[优先级]-[类型]-[描述].md
│                  # 示例：2026-03-17-P1-feature-下载暂停恢复.md
├── completed/     # 子 Agent 完成任务后的记录（含代码改动说明）
│                  # 从 tasks/ 移入，保留原文件名
└── status.md      # 主 Agent 验收记录（子 Agent 执行前必读）
                   # 记录：验收结果、主 Agent 直接修改的代码、注意事项
```

---

## 🔄 完整任务流转

```
主 Agent
  │
  │ 1. 创建任务文件到 apps/[app]/.agent/tasks/
  │ 2. git checkout -b feature/[app]-[描述]
  │ 3. bash sync-tasks.sh down
  │
  ▼
子 Agent
  │
  │ 1. 读 status.md（了解验收记录/注意事项）
  │ 2. 读 tasks/ 获取任务
  │ 3. git fetch origin && git checkout <指定分支>
  │ 4. 开发 → commit → push
  │ 5. 任务文件移到 completed/（保留原文件名，补充 ## 完成记录）
  │
  ▼
主 Agent
  │
  │ 1. 审查代码（git diff develop..<分支名>）
  │ 2. 将验收结果写入 apps/[app]/.agent/status.md
  │ 3. 审查通过 → git merge --no-ff → push origin develop
  │ 4. 删除 feature 分支（本地+远程）
```

---

## 🔒 跨 Agent 禁止事项

| 禁止行为 | 说明 |
|----------|------|
| 子 Agent 创建/删除 Git 分支 | 只由主 Agent 操作 |
| 子 Agent 修改其他 Agent 目录 | 各自只修改自己的工作目录 |
| 主 Agent 直接修改业务代码 | 通过任务下发给子 Agent |
| 任何 Agent 暴露 API Key | 加密存储，不写入日志/代码 |
