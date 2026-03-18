# 2026-03-18-P1-feature-UI全面优化（前端）

## 任务信息
- **优先级**：P1
- **下发时间**：2026-03-18
- **预计工时**：4-6h

## Git 信息
- **工作分支**：`feature/frontend-modules-v2`
- 执行前：`git fetch origin && git checkout feature/frontend-modules-v2`

> ⛔ **严禁执行任何 git 操作**，git 由主 Agent 统一执行

---

## 子任务 1：时长格式改为 h m s 风格

**文件**：`src/lib/utils.ts`，修改 `formatDuration`：

```typescript
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
```

---

## 子任务 2：搜索界面布局重设计

**文件**：`src/pages/SearchPage.tsx`

整体布局变为三层：顶部搜索区（shrink-0）→ 中间结果区（flex-1 overflow-y-auto）→ 底部粘贴下载栏（shrink-0）

### 顶部搜索区改动
- 搜索框高度改为 `h-11`，圆角改为 `rounded-xl`，更突出
- 平台切换从 `<select>` 改为三个横排标签按钮（全网 / YouTube / Bilibili）
- 筛选按钮展开后用标签按钮组，不用原生 select

### 平台标签按钮实现
```tsx
<div className="flex gap-1.5">
  {(['all','youtube','bilibili'] as const).map((p) => {
    const labels = { all:'全网', youtube:'YouTube', bilibili:'Bilibili' }
    return (
      <button key={p} onClick={() => handlePlatformChange(p)}
        className={cn('px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
          platform === p
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground')}>
        {labels[p]}
      </button>
    )
  })}
</div>
```

### 底部粘贴下载栏（移至底部固定）
```tsx
<div className="px-6 py-3 border-t border-border flex gap-2 shrink-0 bg-card/50">
  <input type="text" value={pasteUrl} onChange={e => setPasteUrl(e.target.value)}
    onKeyDown={e => e.key === 'Enter' && handlePasteDownload()}
    placeholder="粘贴视频链接直接下载（支持 YouTube / Bilibili 等）"
    data-selectable="true"
    className="flex-1 h-9 px-3 rounded-lg bg-input border border-border text-sm outline-none focus:border-primary transition-colors" />
  <button onClick={handlePasteDownload} disabled={!pasteUrl.trim() || !!downloadingUrl}
    className="h-9 px-4 rounded-lg text-sm font-medium bg-muted hover:bg-secondary disabled:opacity-40 flex items-center gap-1.5">
    {downloadingUrl ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
    <span>直接下载</span>
  </button>
</div>
```

---

## 子任务 3：移除视频卡片右下角 publishedAt

**文件**：`src/components/VideoCard.tsx`

删除卡片底部 publishedAt 显示（那串数字）：
```tsx
// 删除：
{video.publishedAt && <span className="ml-auto shrink-0">{video.publishedAt}</span>}
```

---

## 子任务 4：下载中心与媒体库合并为「我的资源」

### 4.1 新建 `src/pages/ResourcePage.tsx`

顶部两个 Tab：「下载任务」和「本地视频」，内容分别来自原 DownloadPage 和 LibraryPage。

Tab 栏：
```tsx
<div className="px-5 py-3 border-b border-border flex items-center gap-1 shrink-0">
  <button onClick={() => setActiveTab('downloads')}
    className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
      activeTab === 'downloads' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
    <Download size={15} /> 下载任务
    {activeCount > 0 && (
      <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-xs">{activeCount}</span>
    )}
  </button>
  <button onClick={() => setActiveTab('library')}
    className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
      activeTab === 'library' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
    <Library size={15} /> 本地视频
    {videos.length > 0 && <span className="text-xs text-muted-foreground">({videos.length})</span>}
  </button>
</div>
```

Tab 内容用 `hidden` 切换，保留两个 Tab 各自的所有逻辑和状态。

### 4.2 更新 `src/App.tsx`
- 删除 `DownloadPage`、`LibraryPage` import，新增 `ResourcePage`
- 删除 `download` 和 `library` 两个 div，合并为：
  ```tsx
  <div className={activePage === 'library' ? 'h-full' : 'hidden'}><ResourcePage /></div>
  ```

### 4.3 更新 `src/components/Sidebar.tsx`
- 删除 `{ key: 'download', icon: Download, label: '下载中心' }` 导航项
- 将 `library` 项改为：`{ key: 'library', icon: FolderOpen, label: '我的资源' }`
- 从 `useDownloadStore` 读取活跃下载数，在图标旁显示 badge

### 4.4 更新 `src/store/settingsStore.ts`
- `activePage` 类型移除 `'download'`：
  ```typescript
  activePage: 'search' | 'library' | 'workspace' | 'settings'
  ```

### 4.5 更新 `src/store/downloadStore.ts`
- `addTask` 成功后跳转页面改为 `library`（在 `SearchPage.tsx` 中调用 `setActivePage('library')`）

---

## 子任务 5：Sidebar Logo 去除「AI」，改为「CC」ClipCatch 样式

**文件**：`src/components/Sidebar.tsx`

将 Logo 区域改为更有品牌感的设计：
```tsx
{/* Logo 区域 */}
<div className="mb-6 flex flex-col items-center gap-0.5">
  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20">
    <span className="text-primary-foreground font-black text-sm tracking-tight">CC</span>
  </div>
  <span className="text-[9px] text-muted-foreground/70 font-medium tracking-widest uppercase">Clip</span>
</div>
```

---

## 验收标准

- [ ] 时长显示为 `1h 20m`、`5m 30s`、`45s` 格式
- [ ] 搜索界面：搜索框更大，平台切换为标签按钮，粘贴下载移至底部
- [ ] 视频卡片无 publishedAt 数字
- [ ] 下载与媒体库合并为「我的资源」，Tab 切换正常
- [ ] Sidebar 导航只有4项：搜索发现/我的资源/AI工作台/设置
- [ ] Logo 显示「CC」渐变图标 + 「Clip」文字
- [ ] `pnpm type-check` 无报错
