# Skill：Git 协作（前端 Agent）

## 触发时机
前端 Agent 需要进行 Git 操作时调用此 Skill。

## 日常工作流程

### 开始新任务

```bash
# 在项目根目录（video-ai-desktop/）执行
git checkout develop
git pull origin develop
git checkout -b feature/frontend-[task-name]
```

### 提交代码

```bash
# 只提交前端目录
git add apps/frontend/src/
git commit -m "feat(frontend): [description]"
git push -u origin feature/frontend-[task-name]
```

### 完成任务

```bash
# 1. 推送最终代码
git push origin feature/frontend-[task-name]

# 2. 将任务文件移到 completed（在前端目录内操作）
# .agent/tasks/P1-feature-xxx.md → .agent/completed/P1-feature-xxx.md

# 3. 更新 .agent/status.md
```

## 分支命名规范

```
feature/frontend-[description]
bugfix/frontend-[description]
refactor/frontend-[description]

示例：
feature/frontend-search-pagination
bugfix/frontend-image-proxy
```

## Commit 消息规范

```
feat(frontend): [description]
fix(frontend): [description]
refactor(frontend): [description]
```

## 文件所有权

- ✅ 只修改 `apps/frontend/` 下的文件
- ❌ 不修改 `apps/backend/`、`apps/desktop/`、根目录配置文件

## 常用命令

```bash
git status
git log --oneline -10
git diff develop..HEAD --stat
git reset --soft HEAD~1    # 撤销最后一次提交（保留改动）
```
