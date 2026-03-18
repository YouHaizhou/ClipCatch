// ============================================================
// LibraryPage — 本地媒体库
// 切换到此页面时自动刷新，无手动刷新按钮
// ============================================================
import { useEffect, useState } from 'react'
import { Library, LayoutGrid, List, Search, Cpu, Clock, HardDrive, Loader2, Play, FolderOpen, X, CheckCircle } from 'lucide-react'
import { cn, formatDuration, formatBytes } from '@/lib/utils'
import { apiGet, proxyImageUrl } from '@/services/api'
import { useSettingsStore } from '@/store/settingsStore'
import { showToast } from '@/components/Toast'

interface LibraryVideo {
  video_id: number; title: string; thumbnail_path: string; thumbnail_url: string
  duration: number; file_size: number; downloaded_at: string; platform: string
  has_note: boolean; local_file_path: string
}
type ViewMode = 'grid' | 'list'
type SortKey = 'time' | 'title' | 'size'

export default function LibraryPage() {
  const { setActivePage, activePage } = useSettingsStore()
  const [videos, setVideos] = useState<LibraryVideo[]>([])
  const [filtered, setFiltered] = useState<LibraryVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<SortKey>('time')
  const [playing, setPlaying] = useState<LibraryVideo | null>(null)

  const fetchLibrary = async () => {
    try {
      const data = await apiGet<{ videos: LibraryVideo[] }>(`/api/library?sort=${sort}`)
      setVideos(data.videos ?? [])
    } catch (e) { showToast('error', String(e)) }
    finally { setLoading(false) }
  }

  // 切换到媒体库页面时自动刷新
  useEffect(() => {
    if (activePage === 'library') fetchLibrary()
  }, [activePage])

  useEffect(() => { fetchLibrary() }, [sort])

  useEffect(() => {
    if (!keyword.trim()) setFiltered(videos)
    else { const kw = keyword.toLowerCase(); setFiltered(videos.filter(v => v.title.toLowerCase().includes(kw))) }
  }, [keyword, videos])

  const handleAnalyze = (id: number) => {
    sessionStorage.setItem('workspace_video_id', String(id))
    setActivePage('workspace')
  }
  const handleFolder = async (v: LibraryVideo) => {
    if (!window.electronAPI) { showToast('error', '仅 Electron 支持'); return }
    if (!v.local_file_path) { showToast('error', '路径未找到'); return }
    await window.electronAPI.openPath(v.local_file_path.replace(/[\/\\][^\/\\]+$/, ''))
  }

  const DOT: Record<string, string> = { youtube: 'bg-red-500', bilibili: 'bg-blue-500', other: 'bg-muted-foreground' }

  return (
    <div className="h-full flex flex-col">
      {playing && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setPlaying(null)}>
          <div className="relative w-full max-w-4xl mx-4" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPlaying(null)} className="absolute -top-9 right-0 text-white/70 hover:text-white flex items-center gap-1 text-sm"><X size={16} /> 关闭</button>
            <p className="text-white text-sm mb-2 truncate">{playing.title}</p>
            <video src={`/api/library/${playing.video_id}/stream`} controls autoPlay className="w-full rounded-xl max-h-[70vh] bg-black" onError={() => showToast('error', '视频加载失败')} />
          </div>
        </div>
      )}
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <Library size={18} className="text-primary" />
        <h1 className="text-base font-semibold">本地媒体库</h1>
        <span className="text-xs text-muted-foreground">{filtered.length} 个视频</span>
        <div className="flex-1" />
        <div className="relative w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="过滤标题..." data-selectable="true"
            className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-card border border-border text-xs outline-none focus:border-primary transition-colors" />
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {([['time','时间'],['title','名称'],['size','大小']] as [SortKey,string][]).map(([k,l]) => (
            <button key={k} onClick={() => setSort(k)}
              className={cn('px-2.5 py-1.5 text-xs transition-colors',
                sort === k ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button onClick={() => setViewMode('grid')} className={cn('p-1.5 transition-colors', viewMode==='grid'?'bg-primary text-primary-foreground':'bg-card text-muted-foreground hover:bg-muted')}><LayoutGrid size={14} /></button>
          <button onClick={() => setViewMode('list')} className={cn('p-1.5 transition-colors', viewMode==='list'?'bg-primary text-primary-foreground':'bg-card text-muted-foreground hover:bg-muted')}><List size={14} /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {loading && <div className="flex items-center justify-center h-40"><Loader2 size={28} className="animate-spin text-primary" /></div>}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <Library size={40} className="opacity-20" />
            <p className="text-sm">{keyword ? '没有匹配的视频' : '还没有下载的视频'}</p>
          </div>
        )}
        {!loading && viewMode === 'grid' && filtered.length > 0 && (
          <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filtered.map(v => {
              const thumb = proxyImageUrl(v.thumbnail_url || v.thumbnail_path)
              return (
                <div key={v.video_id} className="group rounded-xl overflow-hidden bg-card border border-border hover:border-primary/40 transition-all">
                  <div className="relative aspect-video bg-muted overflow-hidden cursor-pointer" onClick={() => setPlaying(v)}>
                    {thumb ? <img src={thumb} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={e => { (e.target as HTMLImageElement).style.display='none' }} /> : <div className="w-full h-full flex items-center justify-center"><Library size={28} className="opacity-20" /></div>}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-black text-xs font-medium"><Play size={12} fill="currentColor" /> 播放</span>
                    </div>
                    {v.duration > 0 && <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-xs font-mono flex items-center gap-1"><Clock size={9} /> {formatDuration(v.duration)}</div>}
                    <div className={cn('absolute top-2 left-2 w-2 h-2 rounded-full', DOT[v.platform] ?? DOT.other)} />
                    {/* AI 状态角标 */}
                    {v.has_note
                      ? <div className="absolute top-2 right-2"><CheckCircle size={14} className="text-emerald-400 drop-shadow" /></div>
                      : <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" title="点击 AI 分析"><Cpu size={14} className="text-muted-foreground/70" /></div>
                    }
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
        {!loading && viewMode === 'list' && filtered.length > 0 && (
          <div className="flex flex-col gap-2">
            {filtered.map(v => {
              const thumb = proxyImageUrl(v.thumbnail_url || v.thumbnail_path)
              return (
                <div key={v.video_id} className="flex gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/40 transition-colors group">
                  <div className="w-20 h-12 rounded-lg overflow-hidden bg-muted shrink-0 cursor-pointer" onClick={() => setPlaying(v)}>
                    {thumb ? <img src={thumb} alt={v.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none' }} /> : <div className="w-full h-full flex items-center justify-center"><Library size={16} className="opacity-20" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-1">{v.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock size={10} /> {formatDuration(v.duration)}</span>
                      <span className="flex items-center gap-1"><HardDrive size={10} /> {v.file_size ? formatBytes(v.file_size) : '--'}</span>
                      {v.has_note && <span className="text-primary">● 已有笔记</span>}
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
  )
}
