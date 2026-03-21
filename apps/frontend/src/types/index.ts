// ============================================================
// 全局 TypeScript 类型定义
// 所有模块共用的接口集中在此，禁止在业务文件中重复定义
// ============================================================

// ---------- 视频相关 ----------
export interface VideoInfo {
  id: string
  title: string
  url: string
  platform: 'youtube' | 'bilibili' | 'twitter' | 'other'
  duration: number        // 单位：秒
  thumbnailUrl: string
  thumbnailPath?: string  // 本地缓存路径
  author: string
  publishedAt?: string
  viewCount?: number
  localFilePath?: string  // 下载后本地路径
  fileSize?: number       // 字节
  quality?: VideoQuality
  downloadedAt?: string
  createdAt: string
}

export type VideoQuality = '1080p' | '720p' | '480p' | 'audio_only'

export type AiStatus = 'none' | 'processing' | 'completed' | 'failed'

export type MermaidDiagramType = 'mindmap' | 'flowchart' | 'graph'

// ---------- 下载任务 ----------
export interface DownloadTask {
  id: number
  videoId: number
  video: VideoInfo
  status: DownloadStatus
  progressPct: number     // 0.0 - 100.0
  speedBps: number        // 字节/秒
  etaSeconds: number
  errorMsg?: string
  createdAt: string
  updatedAt: string
}

export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'

// ---------- AI 任务 ----------
export interface AiTask {
  id: number
  videoId: number
  mode: AiMode
  promptTemplate: PromptTemplate
  status: AiTaskStatus
  errorMsg?: string
  createdAt: string
  completedAt?: string
}

export type AiMode = 'text_only' | 'multimodal' | 'extract_only'

export type PromptTemplate =
  | 'summary'
  | 'timeline'
  | 'meeting'
  | 'keypoints'

export type AiTaskStatus =
  | 'queued'
  | 'extracting'
  | 'transcribing'
  | 'generating'
  | 'completed'
  | 'failed'

// ---------- 笔记 ----------
export interface Note {
  id: number
  videoId: number
  aiTaskId: number
  markdownContent: string
  wordCount: number
  exportedPath?: string
  createdAt: string
  updatedAt: string
}

// ---------- 设置 ----------
export interface AppSettings {
  downloadDir: string
  exportDir: string
  llmModel: string
  sttProvider: 'xunfei' | 'aliyun'
  cacheSize: string
  // API Keys 存在标志（脱敏，实际值不返回前端）
  hasDeepseekKey: boolean
  hasZhipuKey: boolean
  hasXunfeiKey: boolean
  hasSerperKey: boolean
  hasOpenaiKey: boolean
  hasGroqKey: boolean
  hasGeminiKey: boolean
  // 各 Key 启用状态
  deepseekEnabled: boolean
  openaiEnabled: boolean
  groqEnabled: boolean
  geminiEnabled: boolean
  serperEnabled: boolean
}

// ---------- API 响应通用结构 ----------
export interface ApiResponse<T> {
  code: number       // 0 = 成功，非 0 = 失败
  data?: T
  message?: string
}

// ---------- 搜索 ----------
export interface SearchFilters {
  duration?: 'short' | 'medium' | 'long'
  sort?: 'relevance' | 'newest' | 'views'
}

export interface SearchResult {
  results: VideoInfo[]
  total: number
  page: number
}

// ---------- SSE 事件 ----------
export interface DownloadProgressEvent {
  taskId: number
  status: DownloadStatus
  progressPct: number
  speedBps: number
  etaSeconds: number
  localFilePath?: string
  errorMsg?: string
}

export interface AiStreamEvent {
  type: 'progress' | 'token' | 'done' | 'error'
  stage?: AiTaskStatus
  message?: string
  content?: string    // type=token 时的 LLM 输出片段
  noteId?: number     // type=done 时（camelCase）
  note_id?: number    // type=done 时（snake_case，后端实际发送）
  wordCount?: number  // type=done 时（camelCase）
  word_count?: number // type=done 时（snake_case，后端实际发送）
}

// ---------- API 连接测试 ----------
export interface ConnectionTestResult {
  status: 'ok' | 'error'
  latencyMs?: number
  model?: string
  message?: string
}
