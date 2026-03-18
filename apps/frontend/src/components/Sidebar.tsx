// ============================================================
// Sidebar — 左侧固定导航栏
// 包含：模块导航、API 连接状态指示灯
// ============================================================
import { Search, FolderOpen, Cpu, Settings } from 'lucide-react'
import { useSettingsStore } from '@/store/settingsStore'
import { cn } from '@/lib/utils'

const STATUS_DOT: Record<string, string> = {
  ok:      'bg-emerald-400 shadow-[0_0_5px_1px_rgba(52,211,153,0.6)]',
  error:   'bg-red-400 shadow-[0_0_5px_1px_rgba(248,113,113,0.6)]',
  testing: 'bg-yellow-400 animate-pulse',
  unknown: 'bg-muted-foreground/50',
}

const NAV_ITEMS = [
  { key: 'search'    as const, icon: Search,     label: '搜索发现' },
  { key: 'library'   as const, icon: FolderOpen,  label: '我的资源' },
  { key: 'workspace' as const, icon: Cpu,          label: 'AI 工作台' },
]

export default function Sidebar() {
  const { activePage, setActivePage, apiStatus } = useSettingsStore()

  return (
    <aside className="w-16 flex flex-col items-center py-4 border-r border-border bg-card">

      {/* 导航项 */}
      <nav className="flex-1 flex flex-col items-center gap-1">
        {NAV_ITEMS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            title={label}
            onClick={() => setActivePage(key)}
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
              activePage === key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon size={18} />
          </button>
        ))}
      </nav>

      {/* 底部：AI 状态指示灯 + 设置 */}
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => setActivePage('settings')}
          title={`AI: ${apiStatus.deepseek}`}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <div className="flex items-center gap-1">
            <div className={cn('w-2 h-2 rounded-full transition-all', STATUS_DOT[apiStatus.deepseek] ?? STATUS_DOT.unknown)} />
            <span className="text-[9px] text-muted-foreground leading-none">AI</span>
          </div>
        </button>

        <button
          title="系统设置"
          onClick={() => setActivePage('settings')}
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
            activePage === 'settings'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Settings size={18} />
        </button>
      </div>
    </aside>
  )
}
