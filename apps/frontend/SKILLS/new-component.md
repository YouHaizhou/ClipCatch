# Skill：新增 React 组件

## 触发时机
前端 Agent 需要新增可复用组件时调用此 Skill。

## 创建流程

### 第一步：确认组件归属
- 可复用 UI 组件 → `src/components/`
- 页面级组件 → `src/pages/`

### 第二步：标准组件模板

```tsx
// src/components/ComponentName.tsx
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { TypeName } from '@/types'

interface ComponentNameProps {
  prop1: string
  prop2?: number
  className?: string
  onEvent?: (data: TypeName) => void
}

export default function ComponentName({
  prop1,
  prop2,
  className,
  onEvent,
}: ComponentNameProps) {
  const [localState, setLocalState] = useState(false)

  return (
    <div className={cn('base-classes', className)}>
      {/* 组件内容 */}
    </div>
  )
}
```

### 第三步：使用图片时必须用 proxyImageUrl

```tsx
import { proxyImageUrl } from '@/services/api'

// 正确 ✅
<img src={proxyImageUrl(video.thumbnailUrl)} alt={video.title} />

// 错误 ❌
<img src={video.thumbnailUrl} alt={video.title} />
```

### 第四步：状态管理选择

```tsx
// 纯 UI 状态（弹窗开关、输入值）→ useState
const [isOpen, setIsOpen] = useState(false)

// 跨组件/跨页面共享状态 → Zustand store
const { activePage, setActivePage } = useSettingsStore()

// 禁止用 key={activePage} 切换页面（会卸载组件）❌
// 正确：用 className="hidden" 隐藏 ✅
<div className={activePage === 'search' ? 'h-full' : 'hidden'}>
  <SearchPage />
</div>
```

### 第五步：Toast 通知

```tsx
import { showToast } from '@/components/Toast'

showToast('success', '操作成功')
showToast('error', '操作失败：' + errorMessage)
showToast('info', '提示信息')
```

### 第六步：API 调用

```tsx
import { apiGet, apiPost, apiPatch } from '@/services/api'

try {
  const data = await apiGet<ResponseType>('/api/endpoint')
} catch (e) {
  showToast('error', String(e))
}
```

### 第七步：常用 Tailwind 样式模式

```tsx
// 卡片容器
'rounded-xl bg-card border border-border hover:border-primary/40 transition-all'

// 主色按钮
'px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90'

// 危险按钮
'px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20'

// 禁用状态
'disabled:opacity-40 disabled:cursor-not-allowed'

// 加载状态
<Loader2 size={15} className="animate-spin" />
```
