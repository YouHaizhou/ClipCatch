// ============================================================
// DownloadPage — 下载中心页
// 切换到此页面时自动刷新，无手动刷新按钮
// ============================================================
import { useEffect, useState } from 'react'
import {
  Download, Pause, X, FolderOpen,
  CheckCircle, XCircle, Clock, Loader2, Play, Cpu
} from 'lucide-react'
import { cn, formatSpeed, formatEta } from '@/lib/utils'
import { apiGet, proxyImageUrl } from '@/services/api'
import { useDownloadStore } from '@/store/downloadStore'
import { useSettingsStore } from '@/store/settingsStore'
import { showToast } from '@/components/Toast'

interface TaskRow {
  task_id: number
  video_id: number
  title: string
  thumbnail_url: string
  duration: number
  status: string
  progress_pct: number
  speed_bps: number
  eta_seconds: number
  error_msg?: string
  created_at: string
}

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  queued:      { label: '排队中',  color: 'text-muted-foreground' },
  downloading: { label: '下载中',  color: 'text-primary' },
  paused:      { label: '已暂停',  color: 'text-yellow-400' },
  completed:   { label: '已完成',  color: 'text-emerald-400' },
  failed:      { label: '失败',    color: 'text-red-400' },
}

type TabKey = 'all' | 'downloading' | 'completed' | 'failed'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',         label: '全部' },
  { key: 'downloading', label: '下载中' },
  { key: 'completed',   label: '已完成' },
  { key: 'failed',      label: '失败' },
]

export default function DownloadPage() {
  const { controlTask } = useDownloadStore()
  const { activePage, setActivePage } = useSettingsStore()
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('all')

  const fetchTasks = async () => {
    try {
      const data = await apiGet<TaskRow[]>('/api/download/tasks')
      setTasks(data)
    } catch { /* 静默 */ }
    finally { setLoading(false) }
  }

  // 切换到下载页时立即刷新
  useEffect(() => {
    if (activePage === 'library') fetchTasks()
  }, [activePage])

  // 轮询进行中的任务
  useEffect(() => {
    fetchTasks()
    const iv = setInterval(fetchTasks, 2000)
    return () => clearInterval(iv)
  }, [])

  const handleControl = async (taskId: number, action: 'pause' | 'resume' | 'cancel') => {
    try {
      await controlTask(taskId, action)
      const msgs = { pause: '已暂停', resume: '继续下载', cancel: '已取消' }
      showToast('success', msgs[action])
      fetchTasks()
    } catch (e) { showToast('error', String(e)) }
  }

  const handleOpenFolder = async (videoId: number) => {
    if (!window.electronAPI) { showToast('error', '仅 Electron 环境支持打开文件夹'); return }
    try {
      const res = await fetch(`/api/library/${videoId}`)
      const json = await res.json()
      const filePath: string = json?.data?.video?.local_file_path ?? ''
      if (!filePath) { showToast('error', '文件路径未找到'); return }
      const dir = filePath.replace(/[\\/][^\\/]+$/, '')
      await window.electronAPI.openPath(dir)
    } catch (e) { showToast('error', String(e)) }
  }

  const handleSendToAI = (videoId: number) => {
    sessionStorage.setItem('workspace_video_id', String(videoId))
    setActivePage('workspace')
  }

  // 按 Tab 过滤
  const filteredTasks = tasks.filter((t) => {
    if (activeTab === 'all') return true
    if (activeTab === 'downloading') return t.status === 'downloading' || t.status === 'queued' || t.status === 'paused'
    if (activeTab === 'completed') return t.status === 'completed'
    if (activeTab === 'failed') return t.status === 'failed'
    return true
  })

  const activeCount = tasks.filter((t) => t.status === 'downloading').length

  // 各 Tab 计数
  const tabCounts: Record<TabKey, number> = {
    all:         tasks.length,
    downloading: tasks.filter(t => t.status === 'downloading' || t.status === 'queued' || t.status === 'paused').length,
    completed:   tasks.filter(t => t.status === 'completed').length,
    failed:      tasks.filter(t => t.status === 'failed').length,
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <Download size={18} className="text-primary" />
        <h1 className="text-base font-semibold">下载中心</h1>
        {activeCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs">
            {activeCount} 个进行中
          </span>
        )}
      </div>

      {/* 任务分类 Tab */}
      <div className="px-6 pt-3 flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-3 py-2 text-xs font-medium rounded-t-lg transition-colors flex items-center gap-1.5',
              activeTab === tab.key
                ? 'bg-primary/10 text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            {tabCounts[tab.key] > 0 && (
              <span className={cn(
                'px-1.5 py-0.5 rounded-full text-xs',
                activeTab === tab.key ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                {tabCounts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={28} className="animate-spin text-primary" />
          </div>
        )}
        {!loading && filteredTasks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <Download size={40} className="opacity-20" />
            <p className="text-sm">
              {activeTab === 'all' ? '暂无下载任务' : `暂无${TABS.find(t => t.key === activeTab)?.label}任务`}
            </p>
            {activeTab === 'all' && <p className="text-xs opacity-60">在搜索页点击下载，或直接粘贴视频链接</p>}
          </div>
        )}
        <div className="flex flex-col gap-3">
          {filteredTasks.map((task) => {
            const cfg = STATUS_CFG[task.status] ?? STATUS_CFG.queued
            const isActive  = task.status === 'downloading'
            const isPaused  = task.status === 'paused'
            const isDone    = task.status === 'completed' || task.status === 'failed'
            const thumbSrc  = proxyImageUrl(task.thumbnail_url)
            return (
              <div key={task.task_id} className="flex gap-3 p-3 rounded-xl bg-card border border-border">
                <div className="w-24 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                  {thumbSrc ? (
                    <img src={thumbSrc} alt={task.title} className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Download size={20} className="opacity-20" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium line-clamp-1">{task.title}</p>
                    <div className="flex gap-1 shrink-0">
                      {/* 下载中：暂停按钮 */}
                      {isActive && (
                        <button onClick={() => handleControl(task.task_id, 'pause')}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors" title="暂停">
                          <Pause size={13} />
                        </button>
                      )}
                      {/* 暂停中：继续按钮 */}
                      {isPaused && (
                        <button onClick={() => handleControl(task.task_id, 'resume')}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors" title="继续">
                          <Play size={13} />
                        </button>
                      )}
                      {/* 未完成：取消按钮 */}
                      {!isDone && (
                        <button onClick={() => handleControl(task.task_id, 'cancel')}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors" title="取消">
                          <X size={13} />
                        </button>
                      )}
                      {/* 已完成：打开文件夹 + 发送至AI */}
                      {task.status === 'completed' && (
                        <>
                          <button onClick={() => handleOpenFolder(task.video_id)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="打开文件夹">
                            <FolderOpen size={13} />
                          </button>
                          <button onClick={() => handleSendToAI(task.video_id)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="发送至 AI 分析">
                            <Cpu size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className={cn('flex items-center gap-2 text-xs', cfg.color)}>
                    {task.status === 'downloading' && <Loader2 size={11} className="animate-spin" />}
                    {task.status === 'completed' && <CheckCircle size={11} />}
                    {task.status === 'failed' && <XCircle size={11} />}
                    {task.status === 'queued' && <Clock size={11} />}
                    {task.status === 'paused' && <Pause size={11} />}
                    <span>{cfg.label}</span>
                    {isActive && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{formatSpeed(task.speed_bps)}</span>
                        <span className="text-muted-foreground">剩余 {formatEta(task.eta_seconds)}</span>
                      </>
                    )}
                    {task.status === 'failed' && task.error_msg && (
                      <span className="text-red-400/70 truncate max-w-xs">{task.error_msg}</span>
                    )}
                  </div>
                  {!isDone && task.status !== 'failed' && (
                    <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${task.progress_pct}%` }} />
                    </div>
                  )}
                  {task.status === 'completed' && (
                    <div className="w-full h-1 rounded-full bg-emerald-400/30">
                      <div className="h-full w-full rounded-full bg-emerald-400" />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
