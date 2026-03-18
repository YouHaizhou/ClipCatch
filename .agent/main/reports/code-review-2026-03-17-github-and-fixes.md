# 代码审查报告 — 2026-03-17（GitHub 配置 + 本轮修复）

**审查人**：主 Agent  
**审查时间**：2026-03-17  
**覆盖范围**：本轮所有改动 + 第一轮遗留 bug 修复

---

## 📋 本轮完成事项

### 1. GitHub 仓库配置
- **状态**：⚠️ 待完成（等待用户手动创建仓库）
- **原因**：WSL2 网络环境下 HTTPS POST 请求到 `api.github.com` 被阻断（HTTP 000），GET 请求正常
- **已完成**：PAT 已配置到 `.git/config`，两次提交已在本地 develop 分支就绪
- **待操作**：用户在浏览器打开 https://github.com/new 创建空仓库 `video-ai-desktop`，完成后执行：
  ```bash
  git push origin develop
  git checkout main && git push origin main
  ```

### 2. SKILL 文件更新（全部完成）

| 文件 | 变更内容 |
|------|----------|
| `SKILLS/main/SYSTEM_SKILL.md` | 新增下发任务检查清单、审查通过才可合并规则、WSL POST 阻断经验记录 |
| `SKILLS/main/git-workflow.md` | 新增 GitHub 远程仓库配置说明和 PAT 设置步骤 |
| `SKILLS/frontend/SYSTEM_SKILL.md` | 工作流从「创建分支」改为「checkout 主 Agent 预创建的分支」 |
| `SKILLS/backend/SYSTEM_SKILL.md` | 同上 |
| `SKILLS/desktop/SYSTEM_SKILL.md` | 同上 |
| `apps/frontend/SKILLS/git-workflow.md` | 重写，加核心约束区块，明确只 checkout 不创建 |
| `apps/backend/SKILLS/git-workflow.md` | 同上 |
| `apps/desktop/SKILLS/git-workflow.md` | 同上 |

---

## 🐛 Bug 修复（本轮）

### Bug 1：addTask SSE 字段 snake_case/camelCase 不兼容（P2，已修复）

**文件**：`apps/frontend/src/store/downloadStore.ts`  
**问题**：`addTask` 的 SSE `onmessage` 直接读取 `event.progressPct`/`event.speedBps`/`event.etaSeconds`（camelCase），但后端推送的是 `progress_pct`/`speed_bps`/`eta_seconds`（snake_case），导致下载进度在初始添加任务时始终显示为 `undefined`。  
**修复**：改为兼容写法 `event.progress_pct ?? event.progressPct`，与 `controlTask` resume 逻辑保持一致。

```typescript
// 修复前
progressPct: event.progressPct,
speedBps: event.speedBps,
etaSeconds: event.etaSeconds,

// 修复后
progressPct: (event as any).progress_pct ?? event.progressPct,
speedBps: (event as any).speed_bps ?? event.speedBps,
etaSeconds: (event as any).eta_seconds ?? event.etaSeconds,
```

### Bug 2：WorkspacePage done 事件 noteId 字段不匹配（P2，已修复）

**文件**：`apps/frontend/src/pages/WorkspacePage.tsx`  
**问题**：前端读取 `event.noteId` 和 `event.wordCount`，但后端 `ai.py` 推送的字段名是 `note_id` 和 `word_count`（snake_case），导致 AI 生成完成后 `currentNoteId` 始终为 null，无法显示导出工具栏。  
**修复**：改为兼容写法，同时支持两种命名。

```typescript
// 修复前
currentNoteId: event.noteId ?? null
stageMsg: `生成完成，共 ${event.wordCount ?? 0} 字`

// 修复后  
currentNoteId: (event as any).note_id ?? event.noteId ?? null
stageMsg: `生成完成，共 ${event.wordCount ?? (event as any).word_count ?? 0} 字`
```

### Bug 3：WorkspacePage 空状态引导按钮使用 window hack（P3，已修复）

**文件**：`apps/frontend/src/pages/WorkspacePage.tsx`  
**问题**：媒体库为空时，「前往下载」按钮使用 `(window as any).__setActivePage?.('download')`，这是一个全局变量 hack，既不安全也不可靠。  
**修复**：改为直接使用已引入的 `setActivePage` from `useSettingsStore`。

---

## ✅ 代码质量审查（第一轮功能）

### 后端审查

| 项目 | 状态 | 备注 |
|------|------|------|
| `download_service.py` — Session 管理 | ✅ | 独立 `_new_db()`，try/finally 关闭 |
| `download_service.py` — 暂停/恢复逻辑 | ✅ | `_paused_flags` 与 `_cancel_flags` 双标志区分 |
| `download_service.py` — ffmpeg 路径查找 | ✅ | 四级查找，空字符串不注入 |
| `download_service.py` — 续传支持 | ✅ | `continuedl: True` 已设置 |
| `routers/download.py` — SSE 心跳 | ✅ | 30s timeout + heartbeat |
| `routers/download.py` — 进度初始推送 | ✅ | SSE 建立时先推当前 DB 状态 |
| `routers/ai.py` — Session 独立 | ✅ | `_run_ai_pipeline` 用独立 SessionLocal |
| `routers/ai.py` — 队列清理 | ✅ | finally 中检查队列归属再清理，避免覆盖新连接 |
| `routers/ai.py` — 断线重连 | ✅ | 旧队列关闭时推送 reconnected 事件 |
| `routers/search.py` — 分页支持 | ✅ | page/page_size 参数传递正确 |
| `services/prompts.py` — 超长截断 | ✅ | 12000+2000 字截断策略合理 |
| `main.py` — KMP_DUPLICATE_LIB_OK | 未检查 | 需确认保留 |

### 前端审查

| 项目 | 状态 | 备注 |
|------|------|------|
| `downloadStore.ts` — SSE 字段兼容 | ✅ | 本轮已修复 |
| `downloadStore.ts` — resume 重订阅 SSE | ✅ | controlTask resume 已实现 |
| `SearchPage.tsx` — 分页加载更多 | ✅ | append 模式正确 |
| `SearchPage.tsx` — 质量选择器 | ✅ | 传递给 addTask |
| `SearchPage.tsx` — proxyImageUrl 使用 | ✅ | 预览弹窗封面已代理 |
| `WorkspacePage.tsx` — 模板动态加载 | ✅ | apiGet 自动解包 data 字段 |
| `WorkspacePage.tsx` — done 事件字段 | ✅ | 本轮已修复 |
| `WorkspacePage.tsx` — setActivePage | ✅ | 本轮已修复 |
| 页面切换用 hidden 不用 key | 未检查 | 需查看 App.tsx |

---

## ⚠️ 遗留问题（下轮处理）

| # | 问题 | 优先级 | 文件 |
|---|------|--------|------|
| 1 | GitHub 仓库未创建，代码未推送到远程 | P1 | — |
| 2 | 下载恢复后进度从 0 重新显示（.part 续传后 yt-dlp 重算进度）| P2 | `download_service.py` |
| 3 | `build-resources/icon.ico` 未创建，NSIS 打包无图标 | P3 | `electron-builder.yml` |
| 4 | App.tsx 页面切换方式未审查 | P2 | `App.tsx` |
| 5 | `main.py` KMP_DUPLICATE_LIB_OK 保留情况未确认 | P2 | `main.py` |

---

## 📊 总体评分

- **代码质量**：⭐⭐⭐⭐☆（4/5）
- **功能完整性**：⭐⭐⭐⭐☆（4/5，SSE 字段 bug 影响体验但不阻塞流程）
- **安全性**：⭐⭐⭐⭐⭐（5/5，无 Key 暴露，Session 管理规范）
- **架构一致性**：⭐⭐⭐⭐⭐（5/5，各层职责清晰）

**结论**：✅ 核心功能代码质量良好，已修复 3 个 P2/P3 bug，可继续推进。
