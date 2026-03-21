import { useState, useRef, useEffect } from 'react'
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
  { value: 'all',      label: '全网' },
  { value: 'youtube',  label: 'YouTube' },
  { value: 'bilibili', label: 'Bilibili' },
  { value: 'twitter',  label: 'Twitter/X' },
] as const
type Platform = typeof PLATFORMS[number]['value']

export default function SearchPage() {
  const { setActivePage } = useSettingsStore()
  const { addTask } = useDownloadStore()
  const [query, setQuery]             = useState('')
  const [platform, setPlatform]       = useState<Platform>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters]         = useState<SearchFilters>({ sort: 'relevance' })
  const [results, setResults]         = useState<VideoInfo[]>([])
  const [loading, setLoading]         = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searched, setSearched]       = useState(false)
  const [hasMore, setHasMore]         = useState(false)
  const [qualityMenuVideo, setQualityMenuVideo] = useState<VideoInfo | null>(null)
  const scrollRef      = useRef<HTMLDivElement>(null)
  const sentinelRef    = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLInputElement>(null)
  const queryRef       = useRef(query)
  const platformRef    = useRef(platform)
  const filtersRef     = useRef(filters)
  const pageRef        = useRef(1)
  const hasMoreRef     = useRef(false)
  const loadingMoreRef = useRef(false)
  queryRef.current    = query
  platformRef.current = platform
  filtersRef.current  = filters

  const doSearch = async (q: string, p: Platform, f: SearchFilters, pg: number, append = false) => {
    if (!q.trim()) return
    if (pg === 1) { setLoading(true); setSearched(true) }
    else { setLoadingMore(true); loadingMoreRef.current = true }
    try {
      const data = await apiPost<{ results: VideoInfo[]; total: number; page: number }>('/api/search', {
        query: q.trim(), platform: p, filters: f, page: pg, seed: pg === 1 ? Date.now() : undefined,
      })
      const newResults = data.results ?? []
      if (append) {
        setResults(prev => {
          const ids = new Set(prev.map(v => v.id))
          return [...prev, ...newResults.filter(v => !ids.has(v.id))]
        })
      } else {
        setResults(newResults)
      }
      const more = newResults.length >= 10
      setHasMore(more)
      hasMoreRef.current = more
      pageRef.current = pg
      if (pg === 1 && newResults.length === 0) showToast('info', '未找到相关视频')
    } catch (e) {
      showToast('error', String(e))
      if (!append) setResults([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
      loadingMoreRef.current = false
    }
  }

  const isVideoUrl = (s: string) =>
    /^https?:\/\/.*(youtube\.com|youtu\.be|bilibili\.com|twitter\.com|x\.com|b23\.tv)/.test(s.trim())

  const handleSearch = () => {
    // 如果输入的是视频链接，直接弹出画质选择菜单
    if (isVideoUrl(query)) {
      setQualityMenuVideo({
        id: query.trim(),
        url: query.trim(),
        title: query.trim(),
        platform: 'other',
        duration: 0,
        thumbnailUrl: '',
        author: '',
        createdAt: new Date().toISOString(),
      })
      return
    }
    pageRef.current = 1
    setHasMore(false); hasMoreRef.current = false
    setResults([])
    doSearch(query, platform, filters, 1, false)
  }
  const handleFilterChange = (newF: SearchFilters) => {
    setFilters(newF)
    if (searched) { setResults([]); doSearch(queryRef.current, platformRef.current, newF, 1, false) }
  }
  const handlePlatformChange = (p: Platform) => {
    setPlatform(p)
    if (searched) { setResults([]); doSearch(queryRef.current, p, filtersRef.current, 1, false) }
  }

  // loadMore via ref so IntersectionObserver always reads fresh state
  const loadMoreRef2 = useRef<() => void>(() => {})
  loadMoreRef2.current = () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return
    doSearch(queryRef.current, platformRef.current, filtersRef.current, pageRef.current + 1, true)
  }

  // Re-bind observer whenever sentinel becomes available (after first search results render)
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreRef2.current() },
      { rootMargin: '400px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [results.length > 0]) // re-run when results appear so sentinel is in DOM

  const handleQualitySelect = async (video: VideoInfo, quality: VideoQuality) => {
    setQualityMenuVideo(null)
    try {
      await addTask(video.url, quality)
      showToast('success', `《${video.title.slice(0, 20)}》已加入下载队列`)
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
      {qualityMenuVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setQualityMenuVideo(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-4 w-64" onClick={e => e.stopPropagation()}>
            <p className="text-xs font-medium mb-1 line-clamp-2">{qualityMenuVideo.title}</p>
            <p className="text-xs text-muted-foreground mb-3">选择下载画质</p>
            <div className="flex flex-col gap-1.5">
              {QUALITY_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => handleQualitySelect(qualityMenuVideo, opt.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm text-left hover:bg-primary/10 hover:text-primary transition-colors border border-border hover:border-primary/40">
                  {opt.label}
                </button>
              ))}
            </div>
            <button onClick={() => setQualityMenuVideo(null)} className="mt-3 w-full py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors">取消</button>
          </div>
        </div>
      )}

      <div className="px-3 sm:px-6 pt-4 pb-3 flex flex-col gap-2 border-b border-border shrink-0">
        <div className="flex gap-2">
          <select value={platform} onChange={e => handlePlatformChange(e.target.value as Platform)}
            className="h-9 px-2 rounded-xl bg-card border border-border text-xs sm:text-sm outline-none focus:border-primary cursor-pointer shrink-0">
            {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <div className="flex-1 relative min-w-0">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="输入关键词或粘贴视频链接..." data-selectable="true"
              className="w-full pl-8 pr-7 py-2 rounded-lg bg-card border border-border text-sm outline-none focus:border-primary transition-colors" />
            {query && (
              <button onClick={() => { setQuery(''); setResults([]); setSearched(false) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={13} />
              </button>
            )}
          </div>
          <button onClick={handleSearch} disabled={loading || !query.trim()}
            className="px-3 sm:px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 shrink-0">
            {loading ? <Loader2 size={14} className="animate-spin" /> : '搜索'}
          </button>
          <button onClick={() => setShowFilters(!showFilters)}
            className={cn('px-2.5 py-2 rounded-lg border text-sm transition-colors shrink-0',
              showFilters ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted-foreground hover:bg-muted')}>
            <SlidersHorizontal size={14} />
          </button>
        </div>
        {showFilters && (
          <div className="flex flex-wrap gap-2 p-2 rounded-lg bg-muted/50 border border-border text-sm">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-muted-foreground text-xs">时长</span>
              {(['short', 'medium', 'long', ''] as const).map(d => (
                <button key={d}
                  onClick={() => handleFilterChange({ ...filters, duration: (d || undefined) as SearchFilters['duration'] })}
                  className={cn('px-2 py-0.5 rounded-md text-xs transition-colors',
                    filters.duration === (d || undefined) ? 'bg-primary text-primary-foreground' : 'bg-card border border-border hover:bg-muted')}>
                  {d === '' ? '全部' : d === 'short' ? '<4分钟' : d === 'medium' ? '4-20分钟' : '>20分钟'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs">排序</span>
              {(['relevance', 'newest'] as const).map(s => (
                <button key={s} onClick={() => handleFilterChange({ ...filters, sort: s })}
                  className={cn('px-2 py-0.5 rounded-md text-xs transition-colors',
                    filters.sort === s ? 'bg-primary text-primary-foreground' : 'bg-card border border-border hover:bg-muted')}>
                  {s === 'relevance' ? '最相关' : '最新'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-5">
        {loading && (
          <div className="flex items-center justify-center h-40"><Loader2 size={32} className="animate-spin text-primary" /></div>
        )}
        {!loading && results.length > 0 && (
          <>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              {results.map(video => (
                <VideoCard key={video.id} video={video} onDownload={v => setQualityMenuVideo(v)} onPreview={handleCardPreview} />
              ))}
            </div>
            <div ref={sentinelRef} className="h-4 mt-2" />
            {loadingMore && (
              <div className="flex items-center justify-center py-3 gap-2">
                <Loader2 size={18} className="animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">加载更多...</span>
              </div>
            )}
            {!hasMore && !loadingMore && (
              <p className="text-center text-xs text-muted-foreground py-3">已显示全部结果</p>
            )}
          </>
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
