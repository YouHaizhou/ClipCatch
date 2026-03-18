// ============================================================
// ExportToolbar — 笔记导出工具栏
// 功能：保存为 Markdown 文件、复制到剪贴板、在文件管理器中打开
// ============================================================
import { useState } from 'react'
import { Download, Copy, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiPost } from '@/services/api'
import { showToast } from '@/components/Toast'

interface ExportToolbarProps {
  noteId: number
  content: string
  videoTitle: string
}

export default function ExportToolbar({ noteId, content, videoTitle }: ExportToolbarProps) {
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  // 保存为 Markdown 文件
  const handleSave = async () => {
    setSaving(true)
    try {
      // 如果在 Electron 中，弹出保存对话框
      let exportPath: string | null = null
      if (window.electronAPI) {
        exportPath = await window.electronAPI.saveFile(
          `${videoTitle.slice(0, 40)}.md`
        )
        if (!exportPath) { setSaving(false); return } // 用户取消
      }

      const result = await apiPost<{ export_path: string; file_size: number }>(
        `/api/notes/${noteId}/export`,
        exportPath ? { export_path: exportPath } : {}
      )

      showToast('success', `已保存到 ${result.export_path.split('\\').pop()}`)

      // 在文件管理器中显示
      if (window.electronAPI) {
        const dir = result.export_path.split('\\').slice(0, -1).join('\\')
        await window.electronAPI.openPath(dir)
      }
    } catch (e) {
      showToast('error', String(e))
    } finally {
      setSaving(false)
    }
  }

  // 复制到剪贴板
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      showToast('success', '已复制到剪贴板')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('error', '复制失败')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleCopy}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
          copied
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'bg-muted hover:bg-secondary text-muted-foreground hover:text-foreground border border-border'
        )}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? '已复制' : '复制'}
      </button>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {saving ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        导出 .md
      </button>
    </div>
  )
}
