# Skill：Git 协作

## 触发时机
任意 Agent 需要进行 Git 操作时调用此 Skill。

## GitHub 远程仓库配置

```
仓库地址：https://github.com/YouHaiZhou/video-ai-desktop
用户名：YouHaiZhou
认证：Personal Access Token（PAT）
```

**配置 PAT（首次或 PAT 失效时）：**
```bash
# 由于 WSL 下 git remote set-url 可能报 Device or resource busy
# 直接用 Write 工具覆写 .git/config
# url 格式：https://YouHaiZhou:<PAT>@github.com/YouHaiZhou/video-ai-desktop.git
```

**推送规则：**
- `develop` 分支：子 Agent 的 feature 分支审查通过后，由主 Agent 合并并 push
- `main` 分支：仅在正式发布时由主 Agent 从 develop 合并
- feature/bugfix 分支：子 Agent push 后等待主 Agent 审查，**审查通过才能合并**

## 日常工作流程

### 开始新任务

```bash
# 1. 切换到 develop 并拉取最新代码
git checkout develop
git pull origin develop

# 2. 创建任务分支（命名规范见下方）—— 主 Agent 执行
git checkout -b feature/frontend-search-pagination
git push -u origin feature/frontend-search-pagination
# ⚠️ 分支创建后必须立即 push 到 origin，子 Agent 才能 checkout

# 3. 在任务文件 ## Git 信息 区块填写分支名
```

### 提交代码

```bash
# 只提交自己负责的目录
git add apps/frontend/          # 前端 Agent
git add apps/backend/src/       # 后端 Agent
git add apps/desktop/src/       # Desktop Agent

# Commit 消息格式
git commit -m "feat(frontend): implement search pagination

- Add Pagination component
- Update SearchPage with page state
- Closes apps/frontend/.agent/tasks/2026-03-18-P2-feature-搜索分页.md"

# 推送到远程
git push -u origin feature/frontend-search-pagination
```

### 完成任务

```bash
# 推送最终代码
git push origin feature/frontend-search-pagination

# 将任务文件移到 completed/
# 更新 status.md
```

## 分支命名规范

```
[type]/[agent]-[description]

type:   feature / bugfix / refactor / docs / perf
agent:  frontend / backend / desktop

示例：
feature/frontend-search-pagination
bugfix/backend-download-pause
refactor/desktop-ipc-communication
```

## Commit 消息规范

```
<type>(<scope>): <subject>

[可选 body]

[可选 footer]

type 枚举：
  feat     - 新功能
  fix      - Bug 修复
  refactor - 代码重构
  perf     - 性能优化
  docs     - 文档更新
  test     - 测试
  chore    - 构建/依赖

scope 枚举：
  frontend / backend / desktop / db / api / config

示例：
feat(frontend): add pagination to search results
fix(backend): resolve SSE connection leak on client disconnect
docs(desktop): update build instructions
```

## 常用命令速查

```bash
# 查看分支
git branch -a

# 查看状态
git status

# 查看最近提交
git log --oneline -10

# 查看与 develop 的差异
git diff develop..HEAD --stat

# 同步 develop 最新代码（变基，保持线性历史）
git fetch origin
git rebase origin/develop

# 处理合并冲突
git status                    # 查看冲突文件
# 手动解决冲突后：
git add .
git rebase --continue

# 撤销最后一次提交（保留改动）
git reset --soft HEAD~1

# 查看某文件的修改历史
git log --oneline -- apps/frontend/src/pages/SearchPage.tsx
```

## 各 Agent 的文件所有权

| Agent | 负责目录 | 不能修改 |
|-------|---------|----------|
| 前端 Agent | `apps/frontend/` | `apps/backend/`, `apps/desktop/` |
| 后端 Agent | `apps/backend/src/` | `apps/frontend/`, `apps/desktop/` |
| Desktop Agent | `apps/desktop/src/` | `apps/frontend/`, `apps/backend/` |
| 主 Agent | 根目录、`.agent/`、`docs/` | 不修改业务代码 |

## 注意事项

- **不要直接推送到 main 或 develop**，通过主 Agent 审查后合并
- **不要修改其他 Agent 负责的文件**
- **每次开始新任务前先 `git pull`**，避免冲突
- **提交时只 add 自己负责的目录**，避免误提交
- **git push 在 WSL 中可能失败**（代理劫持），需在 Windows PowerShell 执行
