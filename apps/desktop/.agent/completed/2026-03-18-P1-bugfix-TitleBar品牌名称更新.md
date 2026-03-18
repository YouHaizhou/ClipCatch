# 2026-03-18-P1-bugfix-TitleBar品牌名称更新

## 任务信息
- **优先级**：P1
- **类型**：bugfix
- **下发时间**：2026-03-18
- **预计工时**：30min

## Git 信息
- **工作分支**：`feature/desktop-window-v2`

> ⛔ **严禁执行任何 git 操作**，git 由主 Agent 统一执行

---

## 问题 5：标题栏 VideoAI 改为 ClipCatch

**文件**：`apps/frontend/src/components/TitleBar.tsx`

### 修改内容
将 `VideoAI` 文本替换为品牌化样式：
- 左侧添加品牌色小方块装饰（`bg-primary/80`）
- 「Clip」使用前景色（`text-foreground`），「Catch」使用主题色（`text-primary`）

---

## 验收标准

- [x] 标题栏显示「ClipCatch」（Clip 前景色，Catch 主题色）
- [x] 左侧有小方块装饰
- [x] `main.ts` 中窗口 title 为 `'ClipCatch'`
- [x] 单实例锁、关闭确认弹窗、openExternal 均已实现

---

## 完成记录

- **完成时间**：2026-03-18
- **实际工时**：<15min

### 变更内容

**`apps/frontend/src/components/TitleBar.tsx`**
- 将 `<span>VideoAI</span>` 替换为品牌化 `<div>` 块
- 添加 `w-4 h-4 rounded bg-primary/80` 品牌色小方块
- 「Clip」使用 `text-foreground`，「Catch」使用 `text-primary`

**`apps/desktop/src/main.ts`**
- 窗口 `title` 从 `'VideoAI Desktop'` 改为 `'ClipCatch'`

### TypeScript 编译
- `npx tsc -p tsconfig.json --noEmit` 退出码 0，无类型错误
