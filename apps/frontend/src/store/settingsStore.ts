// ============================================================
// 设置与全局状态管理（Zustand）
// ============================================================
import { create } from 'zustand'
import type { AppSettings, ConnectionTestResult } from '@/types'
import { apiGet, apiPost } from '@/services/api'

type ApiStatusKey = 'deepseek' | 'zhipu' | 'xunfei' | 'serper' | 'openai' | 'groq' | 'gemini'
type ApiStatus = 'unknown' | 'ok' | 'error' | 'testing'

interface SettingsStore {
  settings: AppSettings | null
  apiStatus: Record<ApiStatusKey, ApiStatus>
  // 当前激活的导航页
  activePage: 'search' | 'library' | 'workspace' | 'settings'

  loadSettings: () => Promise<void>
  testConnection: (provider: ApiStatusKey) => Promise<ConnectionTestResult>
  setActivePage: (page: SettingsStore['activePage']) => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: null,
  apiStatus: {
    deepseek: 'unknown',
    zhipu: 'unknown',
    xunfei: 'unknown',
    serper: 'unknown',
    openai: 'unknown',
    groq: 'unknown',
    gemini: 'unknown',
  },
  activePage: 'search',

  loadSettings: async () => {
    const data = await apiGet<AppSettings>('/api/settings')
    set({ settings: data })
  },

  testConnection: async (provider) => {
    // 测试开始时标记为 testing
    set((s) => ({
      apiStatus: { ...s.apiStatus, [provider]: 'testing' },
    }))
    try {
      const result = await apiPost<ConnectionTestResult>('/api/settings/test-connection', { provider })
      set((s) => ({
        apiStatus: { ...s.apiStatus, [provider]: result.status },
      }))
      return result
    } catch (err) {
      set((s) => ({
        apiStatus: { ...s.apiStatus, [provider]: 'error' },
      }))
      return { status: 'error', message: String(err) }
    }
  },

  setActivePage: (page) => set({ activePage: page }),
}))
