# Git 协作工作流

## 📋 分支策略

### 主分支

- **main** - 生产环境分支，仅接受 PR
- **develop** - 开发主分支，各 Agent 的工作基础

### Agent 工作分支

```
develop
├── feature/frontend-xxx          # 前端 Agent 功能分支
├── feature/backend-xxx           # 后端 Agent 功能分支
├── feature/desktop-xxx           # Desktop Agent 功能分支
├── bugfix/frontend-xxx           # 前端 Agent 修复分支
├── bugfix/backend-xxx            # 后端 Agent 修复分支
└── bugfix/desktop-xxx            # Desktop Agent 修复分支
```

### 分支命名规范

```
[type]/[agent]-[description]

type: feature / bugfix / refactor / docs / perf
agent: frontend / backend / desktop
description: 用英文或中文简述

示例:
feature/frontend-search-pagination
bugfix/backend-download-pause
refactor/desktop-ipc-communication
docs/update-api-documentation
```

---

## 🔄 工作流程

### 第一步：主 Agent 创建任务分支

```bash
# 在 develop 分支基础上创建任务分支
git checkout develop
git pull origin develop

# 创建任务分支（对应 .agent/[agent]/tasks/ 中的任务）
git checkout -b feature/frontend-search-pagination

# 推送到远程
git push -u origin feature/frontend-search-pagination
```

### 第二步：子 Agent 执行任务

```bash
# 子 Agent 切换到任务分支
git checkout feature/frontend-search-pagination

# 在对应目录中实现功能
# 例如：apps/frontend/src/pages/SearchPage.tsx

# 提交代码
git add apps/frontend/
git commit -m "feat(frontend): implement search pagination

- Add Pagination component
- Update SearchPage to support pagination
- Add unit tests

Closes #42"

# 推送到远程
git push origin feature/frontend-search-pagination
```

### 第三步：主 Agent 审查和合并

```bash
# 主 Agent 检查代码变更
git diff develop..feature/frontend-search-pagination

# 创建 Pull Request（在 GitHub/GitLab 上）
# 或本地合并
git checkout develop
git pull origin develop
git merge --no-ff feature/frontend-search-pagination

# 删除任务分支
git branch -d feature/frontend-search-pagination
git push origin --delete feature/frontend-search-pagination

# 推送到远程
git push origin develop
```

---

## 📝 Commit 消息规范

### 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 示例

```
feat(frontend): implement search pagination

- Add Pagination component with prev/next/jump functionality
- Update SearchPage to support page parameter
- Add unit tests for pagination logic
- Update API documentation

Closes #42
Related to #41
```

### Type 列表

- **feat** - 新功能
- **fix** - Bug 修复
- **refactor** - 代码重构
- **perf** - 性能优化
- **docs** - 文档更新
- **test** - 测试相关
- **chore** - 构建、依赖等

### Scope 列表

- **frontend** - 前端相关
- **backend** - 后端相关
- **desktop** - Electron 相关
- **db** - 数据库相关
- **api** - API 相关
- **config** - 配置相关

---

## 🔐 代码审查流程

### 主 Agent 审查清单

- [ ] 代码规范检查
- [ ] 功能完整性检查
- [ ] 性能优化检查
- [ ] 安全性检查
- [ ] 测试覆盖率检查
- [ ] 文档完善度检查

### 审查意见模板

```markdown
## 代码审查 - [任务名称]

### 总体评分
- 代码质量: ⭐⭐⭐⭐⭐
- 功能完整性: ⭐⭐⭐⭐⭐
- 文档完善度: ⭐⭐⭐⭐☆

### 优点
- 优点 1
- 优点 2

### 需要改进
- 改进点 1
- 改进点 2

### 建议
- 建议 1
- 建议 2

### 是否通过
- [x] ✅ 通过
- [ ] ⚠️ 需要修改
- [ ] ❌ 不通过
```

---

## 🚀 常用 Git 命令

### 基础命令

```bash
# 查看分支
git branch -a

# 创建并切换分支
git checkout -b feature/xxx

# 切换分支
git checkout develop

# 查看状态
git status

# 查看日志
git log --oneline --graph --all

# 查看差异
git diff develop..feature/xxx
```

### 提交命令

```bash
# 查看未暂存的改动
git diff

# 暂存所有改动
git add .

# 提交
git commit -m "feat: description"

# 修改最后一次提交
git commit --amend

# 查看提交历史
git log --oneline -10
```

### 推送和拉取

```bash
# 推送到远程
git push origin feature/xxx

# 拉取最新代码
git pull origin develop

# 强制推送（谨慎使用）
git push -f origin feature/xxx
```

### 合并和变基

```bash
# 合并分支
git merge feature/xxx

# 变基（保持历史线性）
git rebase develop

# 中止变基
git rebase --abort

# 继续变基
git rebase --continue
```

---

## 📊 协作流程图

```
主 Agent
  │
  ├─ 创建任务分支 → feature/frontend-xxx
  │                  ↓
  │            前端 Agent 切换分支
  │                  ↓
  │            前端 Agent 实现功能
  │                  ↓
  │            前端 Agent 提交代码
  │                  ↓
  │            前端 Agent 推送到远程
  │                  ↓
  │            主 Agent 审查代码
  │                  ↓
  │            主 Agent 合并到 develop
  │                  ↓
  │            删除任务分支
  │
  ├─ 创建任务分支 → feature/backend-xxx
  │                  ↓
  │            后端 Agent 切换分支
  │                  ↓
  │            后端 Agent 实现功能
  │                  ↓
  │            后端 Agent 提交代码
  │                  ↓
  │            后端 Agent 推送到远程
  │                  ↓
  │            主 Agent 审查代码
  │                  ↓
  │            主 Agent 合并到 develop
  │                  ↓
  │            删除任务分支
  │
  └─ 定期合并 develop → main
                        ↓
                   生产环境部署
```

---

## ⚠️ 常见问题

### Q: 如何处理合并冲突？

A: 
```bash
# 1. 查看冲突文件
git status

# 2. 编辑冲突文件，解决冲突

# 3. 暂存解决后的文件
git add .

# 4. 完成合并
git commit -m "Merge: resolve conflicts"
```

### Q: 如何撤销已提交的代码？

A:
```bash
# 撤销最后一次提交（保留改动）
git reset --soft HEAD~1

# 撤销最后一次提交（丢弃改动）
git reset --hard HEAD~1

# 撤销已推送的提交（创建新提交）
git revert HEAD
```

### Q: 如何同步最新的 develop 分支？

A:
```bash
# 方法 1：合并
git fetch origin
git merge origin/develop

# 方法 2：变基（推荐）
git fetch origin
git rebase origin/develop
```

### Q: 如何查看某个文件的修改历史？

A:
```bash
# 查看文件的提交历史
git log --oneline -- apps/frontend/src/pages/SearchPage.tsx

# 查看文件的详细改动
git log -p -- apps/frontend/src/pages/SearchPage.tsx

# 查看某个提交中的文件改动
git show abc1234:apps/frontend/src/pages/SearchPage.tsx
```

---

## 🔗 相关文档

- [Git 官方文档](https://git-scm.com/doc)
- [GitHub Flow](https://guides.github.com/introduction/flow/)
- [Conventional Commits](https://www.conventionalcommits.org/)
