// WorkspacePage — AI 工作台
// 进度状态持久化到 aiStore，切换页面不丢失
import { useEffect, useState } from 'react'
import { Cpu, Play, ChevronDown, Loader2, CheckCircle, XCircle, RotateCcw, Square, Edit2, Eye, FolderOpen, FileText } from 'lucide-react'
import { cn, formatDuration } from '@/lib/utils'
import { apiPost, apiGet, createSSE, proxyImageUrl } from '@/services/api'
import { useAiStore } from '@/store/aiStore'
import { useSettingsStore } from '@/store/settingsStore'
import { showToast } from '@/components/Toast'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import ExportToolbar from '@/components/ExportToolbar'
import type { AiMode, AiStreamEvent, MermaidDiagramType } from '@/types'

interface LibraryVideo {
  video_id: number
  title: string
  thumbnail_url: string
  duration: number
  has_note: boolean
}

const STAGE_LABELS: Record<string, string> = {
  queued:       '等待处理...',
  extracting:   '提取音频中...',
  transcribing: '语音转写中...',
  generating:   'AI 生成中...',
  completed:    '生成完成',
  failed:       '处理失败',
}

export default function WorkspacePage() {
  const { streamBuffer, isStreaming, stage, stageMsg, currentNoteId, reset, setState, stop } = useAiStore()
  const [videos, setVideos] = useState<LibraryVideo[]>([])
  const [selectedVideo, setSelectedVideo] = useState<LibraryVideo | null>(null)
  const [mode, setMode] = useState<AiMode>('text_only')
  const [diagramType, setDiagramType] = useState<MermaidDiagramType>('mindmap')
  const [showVideoSelect, setShowVideoSelect] = useState(false)
  const [templatePath, setTemplatePath] = useState('')
  const [templateName, setTemplateName] = useState('默认模板（提炼.md）')
  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState('')


  const loadTemplate = () => {
    apiGet<{ path: string; name: string; is_default: boolean; exists: boolean }>('/api/settings/prompt-template')
      .then((d) => {
        setTemplatePath(d.path)
        setTemplateName(d.is_default ? '默认模板（提炼.md）' : d.name)
      }).catch(() => {})
  }

  const loadVideos = () => {
    apiGet<{ videos: LibraryVideo[] }>('/api/library').then((data) => {
      setVideos(data.videos)
      const preselect = sessionStorage.getItem('workspace_video_id')
      if (preselect) {
        const v = data.videos.find((v) => v.video_id === Number(preselect))
        if (v) setSelectedVideo(v)
        sessionStorage.removeItem('workspace_video_id')
      }
    }).catch(() => {})
  }

  useEffect(() => {
    loadVideos()
    loadTemplate()
    // 页面获得焦点时刷新（从下载页切回来时自动更新）
    window.addEventListener('focus', loadVideos)
    return () => window.removeEventListener('focus', loadVideos)
  }, [])

  // 生成完成后同步编辑内容
  useEffect(() => {
    if (stage === 'completed' && streamBuffer) {
      setEditContent(streamBuffer)
      setEditMode(false)
    }
  }, [stage])

  const isProcessing = ['queued', 'extracting', 'transcribing', 'generating'].includes(stage)

  const handleStart = async () => {
    if (!selectedVideo) { showToast('error', '请先选择一个视频'); return }
    if (mode === 'multimodal') {
      const settings = useSettingsStore.getState().settings as any
      const hasOpenAI = settings?.api_key_openai || settings?.hasOpenaiKey
      const hasGemini = settings?.api_key_gemini || settings?.hasGeminiKey
      if (!hasOpenAI && !hasGemini) {
        showToast('error', '多模态模式需要配置 OpenAI 或 Gemini API Key，请前往设置页面配置')
        return
      }
    }
    reset()
    setEditMode(false)
    setState({ stage: 'queued', stageMsg: '正在创建任务...' })
    try {
      const data = await apiPost<{ task_id: number }>('/api/ai/tasks', {
        video_id: selectedVideo.video_id, mode, prompt_template: 'custom', diagram_type: diagramType,
      })
      const sse = createSSE(`/api/ai/tasks/${data.task_id}/stream`)
      setState({ isStreaming: true, _sse: sse })
      sse.onmessage = (e) => {
        const event: AiStreamEvent = JSON.parse(e.data)
        if (event.type === 'progress') {
          setState({ stage: event.stage ?? '', stageMsg: event.message ?? '' })
        } else if (event.type === 'token') {
          useAiStore.setState((s) => ({ streamBuffer: s.streamBuffer + (event.content ?? '') }))
        } else if (event.type === 'done') {
          // 兼容后端 snake_case 字段名
          const ev = event as any
          const wordCount = ev.wordCount ?? ev.word_count ?? 0
          const noteId = ev.noteId ?? ev.note_id ?? null
          const providerPath: string[] = ev.provider_path ?? []
          // 构造提供商路径提示（BGP AS_PATH 思路）
          const providerHint = providerPath.length
            ? ` · ${providerPath[providerPath.length - 1].replace('(ok)', '')} 生成${
                providerPath.length > 1
                  ? `（${providerPath.slice(0, -1).map(s => s.replace(/\(.*\)/, '')).join(' → ')} 降级）`
                  : ''
              }`
            : ''
          setState({ stage: 'completed', stageMsg: `生成完成，共 ${wordCount} 字${providerHint}`, isStreaming: false, currentNoteId: noteId, _sse: null })
          sse.close()
          showToast('success', 'AI 笔记生成完成')
        } else if (event.type === 'error') {
          setState({ stage: 'failed', stageMsg: event.message ?? '', isStreaming: false, _sse: null })
          sse.close()
          showToast('error', event.message ?? '处理失败')
        }
      }
      sse.onerror = () => {
        setState({ stage: 'failed', stageMsg: '连接中断', isStreaming: false, _sse: null })
        sse.close()
      }
    } catch (e) {
      showToast('error', String(e))
      setState({ stage: 'failed', isStreaming: false, _sse: null })
    }
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* 左侧控制面板 */}
      <div className="w-72 flex flex-col border-r border-border bg-card overflow-y-auto">
        <div className="flex flex-col gap-5 p-4">
          {/* 视频选择 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">选择视频</label>
              <button onClick={loadVideos} className="text-muted-foreground hover:text-foreground transition-colors" title="刷新列表">
                <RotateCcw size={12} />
              </button>
            </div>
            <button onClick={() => setShowVideoSelect(!showVideoSelect)}
              className="flex items-center gap-2 p-2.5 rounded-lg bg-muted border border-border hover:border-primary/40 transition-colors text-left">
              {selectedVideo ? (
                <>
                  <div className="w-10 h-7 rounded overflow-hidden bg-background shrink-0">
                    {selectedVideo.thumbnail_url && (
                      <img src={proxyImageUrl(selectedVideo.thumbnail_url)} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <span className="flex-1 text-xs line-clamp-2">{selectedVideo.title}</span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground flex-1">点击选择视频...</span>
              )}
              <ChevronDown size={14} className={cn('shrink-0 transition-transform', showVideoSelect && 'rotate-180')} />
            </button>
            {showVideoSelect && (
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-background p-1">
                {videos.length === 0 && (
                  <p className="text-xs text-muted-foreground p-2">媒体库为空，请先下载视频</p>
                )}
                {videos.map((v) => (
                  <button key={v.video_id}
                    onClick={() => { setSelectedVideo(v); setShowVideoSelect(false) }}
                    className={cn('flex items-center gap-2 p-2 rounded-md text-left transition-colors',
                      selectedVideo?.video_id === v.video_id ? 'bg-primary/10 text-primary' : 'hover:bg-muted')}>
                    <div className="w-8 h-6 rounded overflow-hidden bg-muted shrink-0">
                      {v.thumbnail_url && (
                        <img src={proxyImageUrl(v.thumbnail_url)} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs line-clamp-1">{v.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDuration(v.duration)}</p>
                    </div>
                    {v.has_note && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* 处理模式 */}
          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">处理模式</label>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(['text_only', 'multimodal', 'extract_only'] as AiMode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={cn('flex-1 py-1.5 text-xs transition-colors',
                    mode === m ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}>
                  {m === 'text_only' ? '仅音频' : m === 'multimodal' ? '多模态' : '提取文本'}
                </button>
              ))}
            </div>
          </div>
          {/* 图表类型 */}
          {mode !== 'extract_only' && (
          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">图表类型</label>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(['mindmap', 'flowchart', 'graph'] as MermaidDiagramType[]).map((t) => (
                <button key={t} onClick={() => setDiagramType(t)}
                  className={cn('flex-1 py-1.5 text-xs transition-colors',
                    diagramType === t ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}>
                  {t === 'mindmap' ? '思维导图' : t === 'flowchart' ? '流程图' : '关系图'}
                </button>
              ))}
            </div>
          </div>
          )}
          {/* 提示词模板 */}
          {mode !== 'extract_only' && (
          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">提示词模板</label>
            <div className="flex items-center gap-1.5 p-2.5 rounded-lg bg-muted border border-border">
              <FileText size={13} className="text-primary shrink-0" />
              <span className="flex-1 text-xs truncate text-foreground" title={templatePath}>{templateName}</span>
              <button
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = '.md,.txt'
                  input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0]
                    if (!file) return
                    // Electron 环境下 file.path 是绝对路径
                    const filePath = (file as any).path || file.name
                    try {
                      await fetch('/api/settings/prompt-template', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: filePath }),
                      })
                      setTemplatePath(filePath)
                      setTemplateName(file.name)
                      showToast('success', `已切换模板：${file.name}`)
                    } catch { showToast('error', '模板文件设置失败') }
                  }
                  input.click()
                }}
                className="text-xs text-muted-foreground hover:text-primary transition-colors shrink-0" title="选择模板文件">
                <FolderOpen size={13} />
              </button>
              {templatePath && !templateName.includes('默认') && (
                <button
                  onClick={async () => {
                    await fetch('/api/settings/prompt-template', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ path: '' }),
                    })
                    setTemplatePath('')
                    setTemplateName('默认模板（提炼.md）')
                    showToast('success', '已恢复默认模板')
                  }}
                  className="text-xs text-muted-foreground hover:text-red-400 transition-colors shrink-0" title="恢复默认">
                  <RotateCcw size={12} />
                </button>
              )}
            </div>
          </div>
          )}
          {/* 开始/停止按钮 */}
          {isProcessing ? (
            <button onClick={stop}
              className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-all">
              <Square size={14} fill="currentColor" /> 停止分析
            </button>
          ) : (
            <button onClick={handleStart} disabled={!selectedVideo}
              className={cn('w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all',
                !selectedVideo ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:opacity-90')}>
              <Play size={15} fill="currentColor" /> 开始分析
            </button>
          )}
        </div>
      </div>
      {/* 右侧内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {stage && isProcessing && (
          <div className="px-5 py-2 border-b border-border flex items-center gap-3 bg-muted/30">
            {isProcessing && <Loader2 size={13} className="animate-spin text-primary" />}
            <span className="text-xs text-muted-foreground flex-1">
              {STAGE_LABELS[stage] ?? stage}{stageMsg && ` — ${stageMsg}`}
            </span>
          </div>
        )}
        {streamBuffer && stage === 'completed' && currentNoteId && selectedVideo && (
          <div className="px-5 py-2 border-b border-border flex items-center justify-between bg-muted/20">
            <span className="text-xs text-muted-foreground">{stageMsg}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { if (!editMode) setEditContent(streamBuffer); setEditMode(!editMode) }}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors',
                  editMode ? 'bg-primary/10 text-primary border border-primary/30' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}>
                {editMode ? <><Eye size={12} /> 预览</> : <><Edit2 size={12} /> 编辑</>}
              </button>
              <ExportToolbar noteId={currentNoteId} content={editMode ? editContent : streamBuffer} videoTitle={selectedVideo.title} />
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-6">
          {!streamBuffer && !isProcessing && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <Cpu size={48} className="opacity-10" />
              <p className="text-sm">从左侧选择视频并点击『开始分析』</p>
            </div>
          )}
          {streamBuffer && !editMode && <MarkdownRenderer content={streamBuffer} isStreaming={isStreaming} />}
          {streamBuffer && editMode && (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full h-full min-h-96 p-4 rounded-lg bg-card border border-border text-sm font-mono leading-relaxed resize-none outline-none focus:border-primary transition-colors"
              placeholder="在此编辑 Markdown 内容..."
              data-selectable="true"
            />
          )}
        </div>
      </div>
    </div>
  )
}
