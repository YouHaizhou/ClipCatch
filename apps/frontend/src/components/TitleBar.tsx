// ============================================================
// TitleBar — 自定义标题栏
// 拖拽区域 + 最小化/最大化/关闭按钮
// ============================================================
import { Minus, Square, X } from 'lucide-react'

export default function TitleBar() {
  const minimize = () => window.electronAPI?.minimize()
  const maximize = () => window.electronAPI?.maximize()
  const close    = () => window.electronAPI?.close()

  return (
    <div
      className="flex items-center h-9 bg-background border-b border-border select-none shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* 应用名称 */}
      <span className="px-4 text-xs font-semibold text-muted-foreground tracking-widest uppercase">
        VideoAI
      </span>

      <div className="flex-1" />

      {/* 窗口控制按钮 — 不可拖拽 */}
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={minimize}
          className="flex items-center justify-center w-10 h-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={maximize}
          className="flex items-center justify-center w-10 h-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Square size={12} />
        </button>
        <button
          onClick={close}
          className="flex items-center justify-center w-10 h-full text-muted-foreground hover:bg-red-500 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
