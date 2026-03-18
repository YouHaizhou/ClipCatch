// ============================================================
// 下载任务状态管理（Zustand）
// ============================================================
import { create } from 'zustand'
import type { DownloadTask } from '@/types'
import { apiPost, apiPatch, createSSE } from '@/services/api'

interface DownloadStore {
  tasks: Record<number, DownloadTask>  // key = task_id
  activeSseMap: Record<number, EventSource>

  // 添加下载任务并开始监听进度
  addTask: (url: string, quality: string) => Promise<void>
  // 控制任务（暂停/继续/取消）
  controlTask: (taskId: number, action: 'pause' | 'resume' | 'cancel') => Promise<void>
  // 内部：更新单个任务状态
  _updateTask: (taskId: number, patch: Partial<DownloadTask>) => void
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  tasks: {},
  activeSseMap: {},

  addTask: async (url, quality) => {
    // 创建下载任务
    const data = await apiPost<{ task_id: number; video_id: number; status: string }>(
      '/api/download/tasks',
      { url, quality }
    )
    const taskId = data.task_id

    // 订阅 SSE 进度流
    const sse = createSSE(`/api/download/tasks/${taskId}/progress`)
    sse.onmessage = (e) => {
      const raw = JSON.parse(e.data)
      // 兼容后端 snake_case 和 camelCase 字段
      const event = {
        status: raw.status,
        progressPct: raw.progress_pct ?? raw.progressPct ?? 0,
        speedBps: raw.speed_bps ?? raw.speedBps ?? 0,
        etaSeconds: raw.eta_seconds ?? raw.etaSeconds ?? 0,
        localFilePath: raw.local_file_path ?? raw.localFilePath,
        errorMsg: raw.error_msg ?? raw.errorMsg,
      }
      get()._updateTask(taskId, {
        status: event.status,
        progressPct: event.progressPct,
        speedBps: event.speedBps,
        etaSeconds: event.etaSeconds,
      })
      // 完成或失败时关闭 SSE
      if (event.status === 'completed' || event.status === 'failed') {
        sse.close()
        const { activeSseMap } = get()
        const updated = { ...activeSseMap }
        delete updated[taskId]
        set({ activeSseMap: updated })
      }
    }
    sse.onerror = () => sse.close()

    set((s) => ({
      activeSseMap: { ...s.activeSseMap, [taskId]: sse },
    }))
  },

  controlTask: async (taskId, action) => {
    await apiPatch(`/api/download/tasks/${taskId}`, { action })
    const statusMap = { pause: 'paused', resume: 'downloading', cancel: 'failed' } as const
    get()._updateTask(taskId, { status: statusMap[action] })
  },

  _updateTask: (taskId, patch) => {
    set((s) => ({
      tasks: {
        ...s.tasks,
        [taskId]: { ...s.tasks[taskId], ...patch },
      },
    }))
  },
}))
