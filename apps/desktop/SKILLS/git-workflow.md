# Skill：Git 协作（Desktop Agent）

## 触发时机
Desktop Agent 需要进行 Git 操作时调用此 Skill。

## 日常工作流程

### 开始新任务

```bash
# 在项目根目录（video-ai-desktop/）执行
git checkout develop
git pull origin develop
git checkout -b feature/desktop-[task-name]
```

### 提交代码

```bash
# 只提交 Desktop 目录
git add apps/desktop/src/
git commit -m "feat(desktop): [description]"
git push -u origin feature/desktop-[task-name]
```

### 完成任务

```bash
# 1. 推送最终代码
git push origin feature/desktop-[task-name]

# 2. 将任务文件移到 completed（在 Desktop 目录内操作）
# .agent/tasks/P1-feature-xxx.md → .agent/completed/P1-feature-xxx.md

# 3. 更新 .agent/status.md
```

## 分支命名规范

```
feature/desktop-[description]
bugfix/desktop-[description]

示例：
feature/desktop-new-ipc-channel
bugfix/desktop-window-size
```

## Commit 消息规范

```
feat(desktop): [description]
fix(desktop): [description]
refactor(desktop): [description]
```

## 文件所有权

- ✅ 只修改 `apps/desktop/src/` 下的文件
- ❌ 不修改 `apps/frontend/`、`apps/backend/`、根目录配置文件

## 常用命令

```bash
git status
git log --oneline -10
git diff develop..HEAD --stat
git reset --soft HEAD~1    # 撤销最后一次提交（保留改动）
```
