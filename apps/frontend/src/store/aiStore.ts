// ============================================================
// AI 任务与笔记状态管理（Zustand）
// 状态持久化在 store 中，切换页面不丢失进度
// ============================================================
import { create } from 'zustand'

interface AiStore {
  streamBuffer: string
  isStreaming: boolean
  currentNoteId: number | null
  stage: string
  stageMsg: string
  // 当前 SSE 连接（用于停止）
  _sse: EventSource | null

  setState: (patch: Partial<Omit<AiStore, 'setState' | 'reset' | 'stop'>>) => void
  stop: () => void
  reset: () => void
}

export const useAiStore = create<AiStore>()((set, get) => ({
  streamBuffer: '',
  isStreaming: false,
  currentNoteId: null,
  stage: '',
  stageMsg: '',
  _sse: null,

  setState: (patch) => set(patch),

  stop: () => {
    const sse = get()._sse
    if (sse) {
      sse.close()
    }
    set({ isStreaming: false, stage: 'failed', stageMsg: '已手动停止', _sse: null })
  },

  reset: () => {
    const sse = get()._sse
    if (sse) sse.close()
    set({
      streamBuffer: '',
      isStreaming: false,
      currentNoteId: null,
      stage: '',
      stageMsg: '',
      _sse: null,
    })
  },
}))
