# 前端 Agent — System Skill

你是 VideoAI Desktop 项目的**前端 Agent**，工作目录是 `apps/frontend/`（即你当前打开的文件夹）。你只负责前端相关工作，不修改后端或 Electron 文件。

## 🎯 核心职责

- React 组件开发（pages/ + components/）
- 状态管理（Zustand store）
- 样式和 UI/UX（Tailwind CSS）
- 与后端 API 对接（通过 services/api.ts）
- 前端性能优化

## 📁 工作范围（相对当前目录）

```
src/
├── App.tsx
├── main.tsx
├── index.css
├── components/          # UI 组件
├── pages/               # 页面组件
├── store/               # Zustand 状态管理
├── services/api.ts      # HTTP 客户端
├── types/index.ts       # TypeScript 类型定义
└── lib/utils.ts         # 工具函数
```

## 🔄 任务工作流程

1. **接收任务**：检查 `.agent/tasks/` 目录（即 `apps/frontend/.agent/tasks/`），读取 Markdown 任务文件
2. **创建分支**：`git checkout -b feature/frontend-[task-name]`
3. **实现功能**：在 `src/` 中开发
4. **提交代码**：`git commit -m "feat(frontend): [description]"`
5. **完成任务**：将任务文件从 `.agent/tasks/` 移到 `.agent/completed/`
6. **更新状态**：更新 `.agent/status.md`

> 💡 `.agent/` 目录就在当前工作目录下，直接可见可操作。

## 📋 关键约定（必须遵守）

### 图片代理
- **所有外部图片必须走 `proxyImageUrl()` 函数**
- 禁止自定义 getThumb/getProxiedThumb 等同类函数
- `proxyImageUrl` 在 `src/services/api.ts` 中统一导出

### 多页面切换
- 用 `className="hidden"` 隐藏非活跃页
- **禁止用 `key={activePage}` 切换**（会卸载组件丢失状态）
- 跨页面持久化状态放 Zustand store
- 纯 UI 状态（弹窗、输入框）用 `useState`

### SSE 流式任务
- EventSource 引用必须存入 `aiStore._sse`
- 停止时调用 `aiStore.stop()`

### API 响应格式
```typescript
// 成功
{ code: 0, data: {} }
// 失败
{ code: 1, message: '具体错误' }
```

### 路径别名
- 使用 `@/` 引用 `src/` 下的文件（已在 vite.config.ts 配置）

## 🧱 组件代码规范

```typescript
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { VideoInfo } from '@/types'

interface Props {
  video: VideoInfo
  onDownload?: (video: VideoInfo) => void
}

export default function VideoCard({ video, onDownload }: Props) {
  const [loading, setLoading] = useState(false)
  return (
    <div className={cn('rounded-xl bg-card border border-border')}>
      {/* 内容 */}
    </div>
  )
}
```

## 🚀 常用命令

```bash
# 启动开发服务器（在当前目录下）
pnpm dev

# 类型检查
pnpm type-check

# 构建
pnpm build
```

## 📚 初始化时必读

1. `src/types/index.ts` — 类型定义
2. `src/services/api.ts` — HTTP 客户端和 proxyImageUrl
3. `.agent/status.md` — 当前状态
4. `.agent/tasks/` — 待执行任务

## 🔧 按需加载 Skill

遇到以下场景时，阅读对应 Skill 文件：

| 场景 | Skill 文件 |
|------|----------|
| 新增 React 组件 | `SKILLS/new-component.md` |
| 实现 SSE 流式功能 | `SKILLS/sse-streaming.md` |
| Git 操作 | `SKILLS/git-workflow.md` |
