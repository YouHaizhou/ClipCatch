// ResourcePage — 我的资源：下载任务 + 我的视频合并页
import { useEffect, useState } from 'react'
import {
  Download, Library, Pause, X, FolderOpen, CheckCircle, XCircle, Clock,
  Loader2, Play, Cpu, LayoutGrid, List, Search, HardDrive, CheckCircle2, ArrowUpDown, ChevronDown
} from 'lucide-react'
import { cn, formatSpeed, formatEta, formatDuration, formatBytes } from '@/lib/utils'
import { apiGet, proxyImageUrl } from '@/services/api'
import { useDownloadStore } from '@/store/downloadStore'
import { useSettingsStore } from '@/store/settingsStore'
import { showToast } from '@/components/Toast'

interface TaskRow {
  task_id: number; video_id: number; title: string; thumbnail_url: string
  duration: number; status: string; progress_pct: number
  speed_bps: number; eta_seconds: number; error_msg?: string; created_at: string
}
interface LibraryVideo {
  video_id: number; title: string; thumbnail_path: string; thumbnail_url: string
  duration: number; file_size: number; downloaded_at: string; platform: string
  has_note: boolean; local_file_path: string
}

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  queued:      { label: '排队中',  color: 'text-muted-foreground' },
  downloading: { label: '下载中',  color: 'text-primary' },
  paused:      { label: '已暂停',  color: 'text-yellow-400' },
  completed:   { label: '已完成',  color: 'text-emerald-400' },
  failed:      { label: '失败',    color: 'text-red-400' },
}
type DlTabKey = 'all' | 'downloading' | 'completed' | 'failed'
const DL_TABS: { key: DlTabKey; label: string }[] = [
  { key: 'all',         label: '全部' },
  { key: 'downloading', label: '下载中' },
  { key: 'completed',   label: '已完成' },
  { key: 'failed',      label: '失败' },
]
type SortKey = 'time' | 'title' | 'size'
type ViewMode = 'grid' | 'list'
const DOT: Record<string, string> = { youtube: 'bg-red-500', bilibili: 'bg-blue-500', other: 'bg-muted-foreground' }


export default function ResourcePage() {
  const { controlTask } = useDownloadStore()
  const { activePage, setActivePage } = useSettingsStore()
  const [activeTab, setActiveTab] = useState<'downloads' | 'library'>('downloads')

  // --- Download state ---
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [dlLoading, setDlLoading] = useState(true)
  const [dlTab, setDlTab] = useState<DlTabKey>('all')

  const fetchTasks = async () => {
    try {
      const data = await apiGet<TaskRow[]>('/api/download/tasks')
      setTasks(data)
    } catch { }
    finally { setDlLoading(false) }
  }

  useEffect(() => { fetchTasks(); const iv = setInterval(fetchTasks, 2000); return () => clearInterval(iv) }, [])
  useEffect(() => { if (activePage === 'library') fetchTasks() }, [activePage])

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
      const dir = filePath.replace(/[\/][^\/]+$/, '')
      await window.electronAPI.openPath(dir)
    } catch (e) { showToast('error', String(e)) }
  }

  const handleSendToAI = (videoId: number) => {
    sessionStorage.setItem('workspace_video_id', String(videoId))
    setActivePage('workspace')
  }

  const filteredTasks = tasks.filter(t => {
    if (dlTab === 'all') return true
    if (dlTab === 'downloading') return ['downloading','queued','paused'].includes(t.status)
    if (dlTab === 'completed') return t.status === 'completed'
    if (dlTab === 'failed') return t.status === 'failed'
    return true
  })

  const activeCount = tasks.filter(t => t.status === 'downloading').length
  const tabCounts: Record<DlTabKey, number> = {
    all: tasks.length,
    downloading: tasks.filter(t => ['downloading','queued','paused'].includes(t.status)).length,
    completed: tasks.filter(t => t.status === 'completed').length,
    failed: tasks.filter(t => t.status === 'failed').length,
  }

  // --- Library state ---
  const [videos, setVideos] = useState<LibraryVideo[]>([])
  const [libLoading, setLibLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<SortKey>('time')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [filtered, setFiltered] = useState<LibraryVideo[]>([])
  const [playing, setPlaying] = useState<LibraryVideo | null>(null)

  const fetchLibrary = async () => {
    try {
      const data = await apiGet<{ videos: LibraryVideo[] }>(`/api/library?sort=${sort}`)
      setVideos(data.videos ?? [])
    } catch (e) { showToast('error', String(e)) }
    finally { setLibLoading(false) }
  }

  useEffect(() => { fetchLibrary() }, [sort])
  useEffect(() => {
    if (activePage === 'library') fetchLibrary()
  }, [activePage])
  useEffect(() => {
    if (!keyword.trim()) setFiltered(videos)
    else { const kw = keyword.toLowerCase(); setFiltered(videos.filter(v => v.title.toLowerCase().includes(kw))) }
  }, [keyword, videos])

  const handleAnalyze = (id: number) => { sessionStorage.setItem('workspace_video_id', String(id)); setActivePage('workspace') }
  const handleFolder = async (v: LibraryVideo) => {
    if (!window.electronAPI) { showToast('error', '仅 Electron 支持'); return }
    if (!v.local_file_path) { showToast('error', '路径未找到'); return }
    await window.electronAPI.openPath(v.local_file_path.replace(/[\\/][^\\/]+$/, ''))
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 播放弹窗 */}
      {playing && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setPlaying(null)}>
          <div className="relative w-full max-w-4xl mx-4" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPlaying(null)} className="absolute -top-9 right-0 text-white/70 hover:text-white flex items-center gap-1 text-sm">关闭</button>
            <p className="text-white text-sm mb-2 truncate">{playing.title}</p>
            <video src={`/api/library/${playing.video_id}/stream`} controls autoPlay className="w-full rounded-xl max-h-[70vh] bg-black" onError={() => showToast('error', '视频加载失败')} />
          </div>
        </div>
      )}

      {/* 顶部 Tab 栏 */}
      <div className="px-5 py-3 border-b border-border flex items-center gap-1 shrink-0">
        <button onClick={() => setActiveTab('downloads')}
          className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            activeTab === 'downloads' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
          <Download size={15} /> 正在下载
          {activeCount > 0 && <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-xs">{activeCount}</span>}
        </button>
        <button onClick={() => setActiveTab('library')}
          className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            activeTab === 'library' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
          <Library size={15} /> 我的视频
          {videos.length > 0 && <span className="text-xs text-muted-foreground">({videos.length})</span>}
        </button>
      </div>

      {/* 正在下载 Tab */}
      <div className={activeTab === 'downloads' ? 'flex-1 flex flex-col overflow-hidden' : 'hidden'}>
        <div className="px-5 pt-2 flex gap-1 border-b border-border shrink-0">
          {DL_TABS.map(tab => (
            <button key={tab.key} onClick={() => setDlTab(tab.key)}
              className={cn('px-3 py-2 text-xs font-medium rounded-t-lg transition-colors flex items-center gap-1.5',
                dlTab === tab.key ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground')}>
              {tab.label}
              {tabCounts[tab.key] > 0 && (
                <span className={cn('px-1.5 py-0.5 rounded-full text-xs',
                  dlTab === tab.key ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground')}>
                  {tabCounts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {dlLoading && <div className="flex items-center justify-center h-40"><Loader2 size={28} className="animate-spin text-primary" /></div>}
          {!dlLoading && filteredTasks.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <Download size={40} className="opacity-20" />
              <p className="text-sm">{dlTab === 'all' ? '暂无正在下载' : `暂无${DL_TABS.find(t => t.key === dlTab)?.label}任务`}</p>
            </div>
          )}
          <div className="flex flex-col gap-3">
            {filteredTasks.map(task => {
              const cfg = STATUS_CFG[task.status] ?? STATUS_CFG.queued
              const isActive = task.status === 'downloading'
              const isPaused = task.status === 'paused'
              const isDone   = task.status === 'completed' || task.status === 'failed'
              const thumbSrc = proxyImageUrl(task.thumbnail_url)
              return (
                <div key={task.task_id} className="flex gap-3 p-3 rounded-xl bg-card border border-border">
                  <div className="w-24 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                    {thumbSrc ? <img src={thumbSrc} alt={task.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                      : <div className="w-full h-full flex items-center justify-center"><Download size={20} className="opacity-20" /></div>}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium line-clamp-1">{task.title}</p>
                      <div className="flex gap-1 shrink-0">
                        {isActive && <button onClick={() => handleControl(task.task_id,'pause')} className="p-1.5 rounded-md text-muted-foreground hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors" title="暂停"><Pause size={13} /></button>}
                        {isPaused && <button onClick={() => handleControl(task.task_id,'resume')} className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors" title="继续"><Play size={13} /></button>}
                        {!isDone && <button onClick={() => handleControl(task.task_id,'cancel')} className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors" title="取消"><X size={13} /></button>}
                        {task.status === 'completed' && <>
                          <button onClick={() => handleOpenFolder(task.video_id)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="打开文件夹"><FolderOpen size={13} /></button>
                          <button onClick={() => handleSendToAI(task.video_id)} className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="发送至 AI 分析"><Cpu size={13} /></button>
                        </>}
                      </div>
                    </div>
                    <div className={cn('flex items-center gap-2 text-xs', cfg.color)}>
                      {task.status==='downloading' && <Loader2 size={11} className="animate-spin" />}
                      {task.status==='completed' && <CheckCircle size={11} />}
                      {task.status==='failed' && <XCircle size={11} />}
                      {task.status==='queued' && <Clock size={11} />}
                      {task.status==='paused' && <Pause size={11} />}
                      <span>{cfg.label}</span>
                      {isActive && <><span className="text-muted-foreground">·</span><span className="text-muted-foreground">{formatSpeed(task.speed_bps)}</span><span className="text-muted-foreground">剩余 {formatEta(task.eta_seconds)}</span></>}
                      {task.status==='failed' && task.error_msg && <span className="text-red-400/70 truncate max-w-xs">{task.error_msg}</span>}
                    </div>
                    {!isDone && task.status!=='failed' && <div className="w-full h-1 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{width:`${task.progress_pct}%`}} /></div>}
                    {task.status==='completed' && <div className="w-full h-1 rounded-full bg-emerald-400/30"><div className="h-full w-full rounded-full bg-emerald-400" /></div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 我的视频 Tab */}
      <div className={activeTab === 'library' ? 'flex-1 flex flex-col overflow-hidden' : 'hidden'}>
        <div className="px-5 py-3 border-b border-border flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground">{filtered.length} 个视频</span>
          <div className="flex-1" />
          <div className="relative w-40">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="过滤标题..." data-selectable="true"
              className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-card border border-border text-xs outline-none focus:border-primary transition-colors" />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-xs hover:bg-muted transition-colors">
              <ArrowUpDown size={12} />
              {sort === 'time' ? '下载时间' : sort === 'title' ? '标题' : '文件大小'}
              <ChevronDown size={11} className={cn('transition-transform', showSortMenu && 'rotate-180')} />
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-xl shadow-xl overflow-hidden min-w-[120px]" style={{ backgroundColor: 'var(--card)' }}>
                <button onClick={() => { setSort('time'); setShowSortMenu(false) }} className={cn('w-full px-3 py-2 text-xs text-left transition-colors hover:bg-muted', sort==='time' ? 'text-primary font-medium bg-primary/5' : 'text-foreground')} >下载时间</button>
                <button onClick={() => { setSort('title'); setShowSortMenu(false) }} className={cn('w-full px-3 py-2 text-xs text-left transition-colors hover:bg-muted', sort==='title' ? 'text-primary font-medium bg-primary/5' : 'text-foreground')} >标题</button>
                <button onClick={() => { setSort('size'); setShowSortMenu(false) }} className={cn('w-full px-3 py-2 text-xs text-left transition-colors hover:bg-muted', sort==='size' ? 'text-primary font-medium bg-primary/5' : 'text-foreground')} >文件大小</button>
              </div>
            )}
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button onClick={() => setViewMode('grid')} className={cn('p-1.5 transition-colors', viewMode==='grid'?'bg-primary text-primary-foreground':'bg-card text-muted-foreground hover:bg-muted')}><LayoutGrid size={14} /></button>
            <button onClick={() => setViewMode('list')} className={cn('p-1.5 transition-colors', viewMode==='list'?'bg-primary text-primary-foreground':'bg-card text-muted-foreground hover:bg-muted')}><List size={14} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {tasks.filter(t => ['downloading','queued','paused'].includes(t.status)).length > 0 && (
            <div className="pb-4">
              <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wider">正在下载</p>
              <div className="flex flex-col gap-2">
                {tasks.filter(t => ['downloading','queued','paused'].includes(t.status)).map(task => (
                  <div key={task.task_id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title || ''}</p>
                      <div className="w-full h-1 rounded-full bg-muted mt-1.5 overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{width:`${task.progress_pct ?? 0}%`}} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {task.status === 'paused' ? '已暂停 · ' : ''}
                        {(task.progress_pct ?? 0).toFixed(0)}%
                        {task.speed_bps > 0 && ` · ${formatSpeed(task.speed_bps)}`}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {task.status === 'downloading' && (
                        <button onClick={() => handleControl(task.task_id, 'pause')}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors" title="暂停">
                          <Pause size={13} />
                        </button>
                      )}
                      {task.status === 'paused' && (
                        <button onClick={() => handleControl(task.task_id, 'resume')}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="继续">
                          <Play size={13} />
                        </button>
                      )}
                      <button onClick={() => handleControl(task.task_id, 'cancel')}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors" title="取消">
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {libLoading && <div className="flex items-center justify-center h-40"><Loader2 size={28} className="animate-spin text-primary" /></div>}
          {!libLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <Library size={40} className="opacity-20" />
              <p className="text-sm">{keyword ? '没有匹配的视频' : '还没有下载的视频'}</p>
            </div>
          )}
          {!libLoading && viewMode === 'grid' && filtered.length > 0 && (
            <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {filtered.map(v => {
                const thumb = proxyImageUrl(v.thumbnail_url || v.thumbnail_path)
                return (
                  <div key={v.video_id} className="group rounded-xl overflow-hidden bg-card border border-border hover:border-primary/40 transition-all">
                    <div className="relative aspect-video bg-muted overflow-hidden cursor-pointer" onClick={() => setPlaying(v)}>
                      {thumb ? <img src={thumb} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={e => {(e.target as HTMLImageElement).style.display='none'}} />
                        : <div className="w-full h-full flex items-center justify-center"><Library size={28} className="opacity-20" /></div>}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-black text-xs font-medium"><Play size={12} fill="currentColor" /> 播放</span>
                      </div>
                      {v.duration > 0 && <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-xs font-mono flex items-center gap-1"><Clock size={9} /> {formatDuration(v.duration > 10000 ? Math.floor(v.duration / 1000) : v.duration)}</div>}
                      <div className={cn('absolute top-2 left-2 w-2 h-2 rounded-full', DOT[v.platform] ?? DOT.other)} />
                      {v.has_note
                        ? <div className="absolute top-2 right-2"><CheckCircle2 size={14} className="text-emerald-400 drop-shadow" /></div>
                        : <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"><Cpu size={14} className="text-muted-foreground/70" /></div>}
                    </div>
                    <div className="p-2.5 flex items-center gap-1">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium line-clamp-2 leading-snug">{v.title}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground"><HardDrive size={10} /><span>{v.file_size ? formatBytes(v.file_size) : '--'}</span></div>
                      </div>
                      <button onClick={() => handleFolder(v)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="打开文件夹"><FolderOpen size={12} /></button>
                      <button onClick={() => handleAnalyze(v.video_id)} className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="AI 分析"><Cpu size={12} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {!libLoading && viewMode === 'list' && filtered.length > 0 && (
            <div className="flex flex-col gap-2">
              {filtered.map(v => {
                const thumb = proxyImageUrl(v.thumbnail_url || v.thumbnail_path)
                return (
                  <div key={v.video_id} className="flex gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/40 transition-colors group">
                    <div className="w-20 h-12 rounded-lg overflow-hidden bg-muted shrink-0 cursor-pointer" onClick={() => setPlaying(v)}>
                      {thumb ? <img src={thumb} alt={v.title} className="w-full h-full object-cover" onError={e => {(e.target as HTMLImageElement).style.display='none'}} />
                        : <div className="w-full h-full flex items-center justify-center"><Library size={16} className="opacity-20" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-1">{v.title}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock size={10} /> {formatDuration(v.duration > 10000 ? Math.floor(v.duration / 1000) : v.duration)}</span>
                        <span className="flex items-center gap-1"><HardDrive size={10} /> {v.file_size ? formatBytes(v.file_size) : '--'}</span>
                        {v.has_note && <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={10} /> 已有笔记</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setPlaying(v)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-muted text-xs hover:bg-secondary"><Play size={11} fill="currentColor" /> 播放</button>
                      <button onClick={() => handleFolder(v)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"><FolderOpen size={13} /></button>
                      <button onClick={() => handleAnalyze(v.video_id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs"><Cpu size={12} /> 分析</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
