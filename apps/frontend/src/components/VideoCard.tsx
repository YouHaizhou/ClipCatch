// VideoCard — 视频卡片组件
import { useState } from 'react'
import { Download, Play, Clock, User } from 'lucide-react'
import { cn, formatDuration } from '@/lib/utils'
import { proxyImageUrl } from '@/services/api'
import type { VideoInfo } from '@/types'

interface VideoCardProps {
  video: VideoInfo
  onDownload?: (video: VideoInfo) => void
  onPreview?: (video: VideoInfo) => void
}

const PLATFORM_COLORS: Record<string, string> = {
  youtube: 'bg-red-500', bilibili: 'bg-blue-500', twitter: 'bg-sky-500', other: 'bg-muted-foreground',
}
const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube', bilibili: 'Bilibili', twitter: 'Twitter/X', other: '其他',
}

export default function VideoCard({ video, onDownload, onPreview }: VideoCardProps) {
  const [imgError, setImgError] = useState(false)
  const [imgBlank, setImgBlank] = useState(false)
  // For YouTube/Twitter: try direct URL first (works when user has system proxy/VPN);
  // fallback to backend proxy; fallback to placeholder on error
  const isYtOrTw = video.platform === 'youtube' || video.platform === 'twitter'
  const directUrl = video.thumbnailUrl ?? ''
  const proxyUrl  = proxyImageUrl(directUrl)
  // Use direct URL for yt/tw so system proxy is used; use backend proxy for bilibili
  const thumb = isYtOrTw ? directUrl : proxyUrl
  const showImg = !imgError && !imgBlank && !!thumb

  return (
    <div className="group flex flex-col rounded-xl overflow-hidden bg-card border border-border hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5">
      <div className="relative aspect-video bg-muted overflow-hidden cursor-pointer" onClick={() => onPreview?.(video)}>
        {showImg ? (
          <img src={thumb} alt={video.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
            onLoad={e => {
              const img = e.currentTarget
              // Detect 1x1 transparent fallback PNG (backend returns when no proxy)
              if (img.naturalWidth <= 1 || img.naturalHeight <= 1) setImgBlank(true)
            }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground flex-col gap-1">
            <Play size={28} className="opacity-20" />
            {(video.platform === 'youtube' || video.platform === 'twitter') && (
              <span className="text-xs opacity-30">点击预览</span>
            )}
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center">
          <Play size={40} className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 drop-shadow-lg" fill="white" />
        </div>
        {onDownload && (
          <button onClick={(e) => { e.stopPropagation(); onDownload(video) }}
            className={cn('absolute top-2 right-2 p-1.5 rounded-lg bg-primary text-primary-foreground',
              'opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg hover:scale-110 active:scale-95')}
            title="下载视频">
            <Download size={14} />
          </button>
        )}
        {video.duration > 0 && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-xs font-mono">
            <Clock size={10} /> {formatDuration(video.duration)}
          </div>
        )}
        <div className={cn('absolute top-2 left-2 px-1.5 py-0.5 rounded text-white text-xs font-medium',
          PLATFORM_COLORS[video.platform] ?? PLATFORM_COLORS.other)}>
          {PLATFORM_LABELS[video.platform] ?? '其他'}
        </div>
      </div>
      <div className="p-3 flex flex-col gap-1.5">
        <h3 className="text-sm font-medium leading-snug line-clamp-2 text-foreground">{video.title}</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <User size={11} />
          <span className="truncate">{video.author || '未知作者'}</span>

        </div>
      </div>
    </div>
  )
}
