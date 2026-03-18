# 2026-03-18-P1-bugfix-TitleBar品牌名称更新

## 任务信息
- **优先级**：P1
- **类型**：bugfix
- **下发时间**：2026-03-18
- **预计工时**：30min

## Git 信息
- **工作分支**：`feature/desktop-window-v2`
- 执行前：`git fetch origin && git checkout feature/desktop-window-v2`

> ⛔ **严禁执行任何 git 操作**，git 由主 Agent 统一执行

---

## 问题 5：标题栏 VideoAI 改为 ClipCatch

**文件**：`apps/frontend/src/components/TitleBar.tsx`

注意：这是前端组件文件，Desktop Agent 需修改 `apps/frontend/src/components/TitleBar.tsx`。

### 当前代码
```tsx
<span className="px-4 text-xs font-semibold text-muted-foreground tracking-widest uppercase">
  VideoAI
</span>
```

### 修改目标
将「VideoAI」改为「ClipCatch」，并优化样式使其更有品牌感：

```tsx
<div className="px-4 flex items-center gap-2">
  {/* 品牌色小方块 */}
  <div className="w-4 h-4 rounded bg-primary/80 shrink-0" />
  {/* 品牌名 */}
  <span className="text-xs font-bold text-foreground tracking-tight">
    Clip<span className="text-primary">Catch</span>
  </span>
</div>
```

效果：「Clip」白色/前景色，「Catch」主题色，左侧小方块做装饰。

---

## 同时确认以下已在 main.ts 中实现

读取 `apps/desktop/src/main.ts`，确认以下配置存在，若缺失则补充：

1. 单实例锁（`app.requestSingleInstanceLock()`）
2. 窗口标题改为 `'ClipCatch'`：
   ```typescript
   mainWindow = new BrowserWindow({
     title: 'ClipCatch',  // ← 确认已是 ClipCatch
     ...
   })
   ```
3. 关闭确认弹窗（`mainWindow.on('close', ...)`）
4. `openExternal` 协议安全校验

若 `main.ts` 中 `title` 仍是 `'VideoAI Desktop'`，改为 `'ClipCatch'`。

---

## 验收标准

- [ ] 标题栏显示「ClipCatch」（Clip 前景色，Catch 主题色）
- [ ] 左侧有小方块装饰
- [ ] `main.ts` 中窗口 title 为 `'ClipCatch'`
- [ ] 单实例锁、关闭确认弹窗、openExternal 均已实现
