import { useState, useRef } from 'react'
import { Search, SlidersHorizontal, X, Loader2, Youtube } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiPost } from '@/services/api'
import { useSettingsStore } from '@/store/settingsStore'
import { useDownloadStore } from '@/store/downloadStore'
import VideoCard from '@/components/VideoCard'
import { showToast } from '@/components/Toast'
import type { VideoInfo, SearchFilters, VideoQuality } from '@/types'

const QUALITY_OPTIONS: { value: VideoQuality; label: string }[] = [
  { value: '1080p',      label: '1080p 高清' },
  { value: '720p',       label: '720p 标清' },
  { value: '480p',       label: '480p 流畅' },
  { value: 'audio_only', label: '仅音频' },
]

const PLATFORMS = [
  { value: 'all',     label: '全网' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'bilibili',label: 'Bilibili' },
  { value: 'twitter', label: 'Twitter/X' },
] as const
type Platform = typeof PLATFORMS[number]['value']

export default function SearchPage() {
  const { setActivePage } = useSettingsStore()
  const { addTask } = useDownloadStore()
  const [query, setQuery] = useState('')
  const [platform, setPlatform] = useState<Platform>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<SearchFilters>({ sort: 'relevance' })
  const [results, setResults] = useState<VideoInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [qualityMenuVideo, setQualityMenuVideo] = useState<VideoInfo | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const doSearch = async (q: string, p: Platform, f: SearchFilters) => {
    if (!q.trim()) return
    setLoading(true); setSearched(true)
    try {
      const data = await apiPost<{ results: VideoInfo[]; total: number }>('/api/search', {
        query: q.trim(), platform: p, filters: f, page: 1, seed: Date.now(),
      })
      setResults(data.results)
      if (data.results.length === 0) showToast('info', '未找到相关视频')
    } catch (e) { showToast('error', String(e)); setResults([]) }
    finally { setLoading(false) }
  }

  const handleSearch = () => doSearch(query, platform, filters)
  const handleFilterChange = (newF: SearchFilters) => { setFilters(newF); if (searched) doSearch(query, platform, newF) }
  const handlePlatformChange = (p: Platform) => { setPlatform(p); if (searched) doSearch(query, p, filters) }

  const handleCardDownload = (video: VideoInfo) => {
    setQualityMenuVideo(video)
  }

  const handleQualitySelect = async (video: VideoInfo, quality: VideoQuality) => {
    setQualityMenuVideo(null)
    try {
      await addTask(video.url, quality)
      showToast('success', `『${video.title.slice(0, 20)}』已加入下载队列`)
      setActivePage('library')
    } catch (e) { showToast('error', String(e)) }
  }

  const handleCardPreview = (video: VideoInfo) => {
    if (window.electronAPI && 'openExternal' in window.electronAPI) {
      ;(window.electronAPI as any).openExternal(video.url)
    } else {
      window.open(video.url, '_blank')
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* 画质选择弹出层 */}
      {qualityMenuVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setQualityMenuVideo(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-4 w-64" onClick={e => e.stopPropagation()}>
            <p className="text-xs font-medium mb-1 line-clamp-2">{qualityMenuVideo.title}</p>
            <p className="text-xs text-muted-foreground mb-3">选择下载画质</p>
            <div className="flex flex-col gap-1.5">
              {QUALITY_OPTIONS.map(opt => (
                <button key={opt.value}
                  onClick={() => handleQualitySelect(qualityMenuVideo, opt.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm text-left hover:bg-primary/10 hover:text-primary transition-colors border border-border hover:border-primary/40">
                  {opt.label}
                </button>
              ))}
            </div>
            <button onClick={() => setQualityMenuVideo(null)} className="mt-3 w-full py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors">取消</button>
          </div>
        </div>
      )}
      <div className="px-6 pt-5 pb-3 flex flex-col gap-3 border-b border-border">
        <div className="flex gap-2">
          <select
            value={platform}
            onChange={e => handlePlatformChange(e.target.value as Platform)}
            className="h-11 px-3 rounded-xl bg-card border border-border text-sm outline-none focus:border-primary transition-colors cursor-pointer"
          >
            <option value="all">全网</option>
            <option value="youtube">YouTube</option>
            <option value="bilibili">Bilibili</option>
            <option value="twitter">Twitter/X</option>
          </select>
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="输入关键词搜索视频..." data-selectable="true"
              className="w-full pl-9 pr-8 py-2 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary transition-colors" />
            {query && (
              <button onClick={() => { setQuery(''); setResults([]); setSearched(false) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            )}
          </div>
          <button onClick={handleSearch} disabled={loading || !query.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity">
            {loading ? <Loader2 size={15} className="animate-spin" /> : '搜索'}
          </button>
          <button onClick={() => setShowFilters(!showFilters)}
            className={cn('px-3 py-2 rounded-lg border text-sm transition-colors',
              showFilters ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted-foreground hover:bg-muted')}>
            <SlidersHorizontal size={15} />
          </button>
        </div>
        {showFilters && (
          <div className="flex flex-wrap gap-4 p-3 rounded-lg bg-muted/50 border border-border text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">时长</span>
              {(['', 'short', 'medium', 'long'] as const).map(d => (
                <button key={d}
                  onClick={() => handleFilterChange({ ...filters, duration: (d || undefined) as SearchFilters['duration'] })}
                  className={cn('px-2.5 py-1 rounded-md text-xs transition-colors',
                    filters.duration === (d || undefined) ? 'bg-primary text-primary-foreground' : 'bg-card border border-border hover:bg-muted')}>
                  {d === '' ? '全部' : d === 'short' ? '<4分钟' : d === 'medium' ? '4-20分钟' : '>20分钟'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">排序</span>
              {(['relevance', 'newest'] as const).map(s => (
                <button key={s}
                  onClick={() => handleFilterChange({ ...filters, sort: s })}
                  className={cn('px-2.5 py-1 rounded-md text-xs transition-colors',
                    filters.sort === s ? 'bg-primary text-primary-foreground' : 'bg-card border border-border hover:bg-muted')}>
                  {s === 'relevance' ? '最相关' : '最新'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {loading && <div className="flex items-center justify-center h-40"><Loader2 size={32} className="animate-spin text-primary" /></div>}
        {!loading && results.length > 0 && (
          <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {results.map(video => (
              <VideoCard key={video.id} video={video} onDownload={handleCardDownload} onPreview={handleCardPreview} />
            ))}
          </div>
        )}
        {!loading && searched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <Youtube size={40} className="opacity-20" />
            <p className="text-sm">未找到相关视频</p>
          </div>
        )}
        {!loading && !searched && (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <Youtube size={40} className="opacity-20" />
            <p className="text-sm">输入关键词搜索视频</p>
          </div>
        )}
      </div>
    </div>
  )
}
