# Desktop Agent 任务目录

主 Agent 会在此目录创建 Markdown 任务文件。

## 使用说明

1. 主 Agent 在此目录创建任务文件（格式：`P1-feature-xxx.md`）
2. Desktop Agent 读取任务、执行、完成后移到 `../completed/`
3. 更新 `../status.md` 反映当前进度

## 任务命名规范

```
[P0-P3]-[feature|bugfix|refactor|docs]-[简述].md
```

当前无待处理任务。
