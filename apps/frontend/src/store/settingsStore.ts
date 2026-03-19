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
  activePage: 'search' | 'library' | 'workspace' | 'settings'

  loadSettings: () => Promise<void>
  testConnection: (provider: ApiStatusKey) => Promise<ConnectionTestResult>
  setActivePage: (page: SettingsStore['activePage']) => void
  markKeyConfigured: (provider: ApiStatusKey) => void
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
    try {
      // 后端返回 snake_case，在此统一转换为前端 AppSettings camelCase
      const raw = await apiGet<Record<string, unknown>>('/api/settings')
      const data: AppSettings = {
        downloadDir:     (raw.download_dir as string) ?? '',
        exportDir:       (raw.export_dir as string) ?? '',
        llmModel:        (raw.llm_model as string) ?? 'deepseek-chat',
        sttProvider:     (raw.stt_provider as 'xunfei' | 'aliyun') ?? 'xunfei',
        cacheSize:       (raw.cache_size as string) ?? '0 B',
        hasDeepseekKey:  Boolean(raw.has_deepseek_key),
        hasZhipuKey:     Boolean(raw.has_zhipu_key),
        hasXunfeiKey:    Boolean(raw.has_xunfei_key),
        hasSerperKey:    Boolean(raw.has_serper_key),
        hasOpenaiKey:    Boolean(raw.has_openai_key),
        hasGroqKey:      Boolean(raw.has_groq_key),
        hasGeminiKey:    Boolean(raw.has_gemini_key),
        deepseekEnabled: raw.deepseek_enabled !== false,
        openaiEnabled:   raw.openai_enabled !== false,
        groqEnabled:     raw.groq_enabled !== false,
        geminiEnabled:   raw.gemini_enabled !== false,
        serperEnabled:   raw.serper_enabled !== false,
      }
      set({ settings: data })
    } catch (err) {
      console.error('[settingsStore] loadSettings failed:', err)
    }
  },

  testConnection: async (provider) => {
    set((s) => ({ apiStatus: { ...s.apiStatus, [provider]: 'testing' } }))
    try {
      const result = await apiPost<ConnectionTestResult>('/api/settings/test-connection', { provider })
      // 测试成功才更新状态；失败时保持 unknown 避免显示红叉
      set((s) => ({ apiStatus: { ...s.apiStatus, [provider]: result.status === 'ok' ? 'ok' : 'unknown' } }))
      return result
    } catch (err) {
      // 网络错误/超时：保持 unknown，不显示红叉
      set((s) => ({ apiStatus: { ...s.apiStatus, [provider]: 'unknown' } }))
      return { status: 'error', message: String(err) }
    }
  },

  setActivePage: (page) => set({ activePage: page }),

  markKeyConfigured: (provider: ApiStatusKey) =>
    set((s) => ({ apiStatus: { ...s.apiStatus, [provider]: 'ok' } })),
}))
