import { useState, useEffect } from 'react'
import { Settings, CheckCircle, XCircle, Loader2, FolderOpen, Trash2, ChevronRight, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/store/settingsStore'
import { apiPost, apiGet } from '@/services/api'
import { showToast } from '@/components/Toast'

type TabKey = 'api' | 'storage' | 'whisper'

interface WhisperStatus {
  available: boolean
  path: string
  model_size: string
  error: string
}

const API_CONFIGS = [
  { provider: 'deepseek' as const, label: 'DeepSeek API Key', placeholder: 'sk-...', hint: '用于 AI 摘要生成，platform.deepseek.com 获取', settingKey: 'api_key_deepseek' },
  { provider: 'zhipu' as const, label: '智谱 AI API Key', placeholder: '智谱 GLM-4 备用 Key', hint: 'open.bigmodel.cn 获取，可选', settingKey: 'api_key_zhipu' },
  { provider: 'serper' as const, label: 'Serper API Key', placeholder: 'serper.dev API Key', hint: 'serper.dev 获取，2500次/月免费', settingKey: 'api_key_serper' },
]

export default function SettingsPage() {
  const { apiStatus, testConnection, loadSettings } = useSettingsStore()
  const [activeTab, setActiveTab] = useState<TabKey>('api')
  const [keyValues, setKeyValues] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [storageInfo, setStorageInfo] = useState<{ downloadDir: string; exportDir: string; cacheSize: string } | null>(null)
  const [whisperPath, setWhisperPath] = useState('')
  const [whisperStatus, setWhisperStatus] = useState<WhisperStatus | null>(null)
  const [whisperSaving, setWhisperSaving] = useState(false)

  useEffect(() => { loadStorageInfo(); loadWhisperStatus() }, [])

  const loadStorageInfo = async () => {
    try {
      const data = await apiGet<Record<string, string>>('/api/settings')
      setStorageInfo({ downloadDir: data.download_dir ?? '', exportDir: data.export_dir ?? '', cacheSize: data.cache_size ?? '计算中...' })
    } catch { }
  }

  const loadWhisperStatus = async () => {
    try {
      const data = await apiGet<WhisperStatus>('/api/settings/whisper-status')
      setWhisperStatus(data)
      if (data.path) setWhisperPath(data.path)
    } catch { }
  }

  const handleSaveAndTest = async (provider: typeof API_CONFIGS[number]['provider'], settingKey: string) => {
    const value = keyValues[settingKey]
    if (!value?.trim()) { showToast('error', '请先填写 API Key'); return }
    setSavingKey(settingKey)
    try {
      await apiPost('/api/settings', { [settingKey]: value.trim() })
      const result = await testConnection(provider)
      if (result.status === 'ok') {
        showToast('success', provider + ' 连接成功，延迟 ' + (result.latencyMs ?? '--') + 'ms')
        await loadSettings()
      } else {
        showToast('error', result.message ?? '连接失败')
      }
    } catch (e) { showToast('error', String(e)) }
    finally { setSavingKey(null) }
  }

  const handleSelectDir = async (type: 'download' | 'export') => {
    if (!window.electronAPI) return
    const dir = await window.electronAPI.selectDirectory()
    if (!dir) return
    await apiPost('/api/settings', { [type === 'download' ? 'download_dir' : 'export_dir']: dir })
    showToast('success', '目录已更新')
    await loadStorageInfo()
  }

  const handleClearCache = async () => {
    try { await apiPost('/api/settings/clear-cache', {}); showToast('success', '缓存已清理'); await loadStorageInfo() }
    catch { showToast('error', '清理失败') }
  }

  const handleSaveWhisperPath = async () => {
    if (!whisperPath.trim()) { showToast('error', '请填写模型路径'); return }
    setWhisperSaving(true)
    try {
      await apiPost('/api/settings/whisper-unload', {})
      await apiPost('/api/settings', { whisper_model_path: whisperPath.trim() })
      await loadWhisperStatus()
      showToast('success', '模型路径已保存')
    } catch (e) { showToast('error', String(e)) }
    finally { setWhisperSaving(false) }
  }

  const handleSelectWhisperDir = async () => {
    if (!window.electronAPI) { showToast('error', '仅 Electron 环境支持'); return }
    const dir = await window.electronAPI.selectDirectory()
    if (dir) setWhisperPath(dir)
  }

  const statusIcon = (provider: string) => {
    const s = apiStatus[provider as keyof typeof apiStatus]
    if (s === 'ok') return <CheckCircle size={14} className="text-emerald-400" />
    if (s === 'error') return <XCircle size={14} className="text-red-400" />
    if (s === 'testing') return <Loader2 size={14} className="text-yellow-400 animate-spin" />
    return <span className="w-3.5 h-3.5 rounded-full bg-muted inline-block" />
  }

  const TABS: [TabKey, string][] = [['api', 'API 配置'], ['storage', '存储管理'], ['whisper', '语音转写']]

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-border flex items-center gap-2">
        <Settings size={18} className="text-primary" />
        <h1 className="text-base font-semibold">系统设置</h1>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <nav className="w-40 border-r border-border p-3 flex flex-col gap-1">
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={cn('w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between transition-colors',
                activeTab === key ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
              {label}{activeTab === key && <ChevronRight size={14} />}
            </button>
          ))}
        </nav>
        <div className="flex-1 overflow-y-auto p-6">

          {activeTab === 'api' && (
            <div className="flex flex-col gap-6 max-w-xl">
              <p className="text-xs text-muted-foreground">API Key 加密存储在本地数据库，不上传至任何服务器。</p>
              {API_CONFIGS.map((cfg) => (
                <div key={cfg.provider} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">{statusIcon(cfg.provider)}<label className="text-sm font-medium">{cfg.label}</label></div>
                  <p className="text-xs text-muted-foreground">{cfg.hint}</p>
                  <div className="flex gap-2">
                    <input type="password" value={keyValues[cfg.settingKey] ?? ''}
                      onChange={e => setKeyValues(p => ({ ...p, [cfg.settingKey]: e.target.value }))}
                      placeholder={cfg.placeholder} data-selectable="true" autoComplete="off"
                      className="flex-1 px-3 py-2 rounded-lg bg-input border border-border text-sm outline-none focus:border-primary transition-colors font-mono" />
                    <button onClick={() => handleSaveAndTest(cfg.provider, cfg.settingKey)}
                      disabled={savingKey === cfg.settingKey || !keyValues[cfg.settingKey]?.trim()}
                      className="px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 whitespace-nowrap">
                      {savingKey === cfg.settingKey ? <Loader2 size={14} className="animate-spin" /> : '保存并测试'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'storage' && (
            <div className="flex flex-col gap-6 max-w-xl">
              {[{type: 'download' as const, label: '视频下载目录', val: storageInfo?.downloadDir},
                {type: 'export' as const, label: 'Markdown 导出目录', val: storageInfo?.exportDir}].map(item => (
                <div key={item.type} className="flex flex-col gap-2">
                  <label className="text-sm font-medium">{item.label}</label>
                  <div className="flex gap-2 items-center">
                    <span className="flex-1 px-3 py-2 rounded-lg bg-input border border-border text-sm text-muted-foreground font-mono truncate">{item.val ?? '加载中...'}</span>
                    <button onClick={() => handleSelectDir(item.type)} className="px-3 py-2 rounded-lg bg-muted hover:bg-secondary text-sm flex items-center gap-1.5"><FolderOpen size={14} /> 更改</button>
                  </div>
                </div>
              ))}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">临时文件缓存</label>
                <div className="flex gap-2 items-center">
                  <span className="flex-1 px-3 py-2 rounded-lg bg-input border border-border text-sm text-muted-foreground">{storageInfo?.cacheSize ?? '计算中...'}</span>
                  <button onClick={handleClearCache} className="px-3 py-2 rounded-lg bg-destructive/20 hover:bg-destructive/30 text-destructive text-sm flex items-center gap-1.5"><Trash2 size={14} /> 清理</button>
                </div>
                <p className="text-xs text-muted-foreground">清理 AI 处理过程中产生的临时音频文件</p>
              </div>
            </div>
          )}

          {activeTab === 'whisper' && (
            <div className="flex flex-col gap-6 max-w-xl">
              <div className="p-4 rounded-xl bg-muted/50 border border-border flex flex-col gap-3">
                <div className="flex items-center gap-2 font-medium text-sm"><Cpu size={15} className="text-primary" />本地 Whisper 模型（免费，无需联网）</div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>使用 faster-whisper 在本地运行，中文识别效果好，完全免费。</p>
                  <p>推荐模型：<span className="font-mono text-foreground">faster-whisper-small</span>（约 466MB）</p>
                  <p>HuggingFace 下载：<span className="text-primary">https://huggingface.co/Systran/faster-whisper-small</span></p>
                  <p>ModelScope（国内）：<span className="text-primary">https://modelscope.cn/models/pkufool/faster-whisper-small</span></p>
                  <p className="mt-1">下载后解压，将包含 model.bin 的文件夹路径填入下方。</p>
                </div>
              </div>

              {whisperStatus && (
                <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm border',
                  whisperStatus.available ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400')}>
                  {whisperStatus.available
                    ? <><CheckCircle size={14} />模型已就绪（{whisperStatus.model_size}）</>
                    : <><XCircle size={14} />{whisperStatus.error || '模型未配置'}</>}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Whisper 模型文件夹路径</label>
                <div className="flex gap-2">
                  <input type="text" value={whisperPath} onChange={e => setWhisperPath(e.target.value)}
                    placeholder="例：C:\\Users\\你的名字\\Models\\faster-whisper-small"
                    data-selectable="true"
                    className="flex-1 px-3 py-2 rounded-lg bg-input border border-border text-sm outline-none focus:border-primary transition-colors font-mono" />
                  <button onClick={handleSelectWhisperDir} className="px-3 py-2 rounded-lg bg-muted hover:bg-secondary text-sm flex items-center gap-1.5"><FolderOpen size={14} /> 浏览</button>
                </div>
                <button onClick={handleSaveWhisperPath} disabled={whisperSaving || !whisperPath.trim()}
                  className="self-start px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 flex items-center gap-2">
                  {whisperSaving ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                  {whisperSaving ? '验证中...' : '保存模型路径'}
                </button>
              </div>

              <div className="p-4 rounded-xl bg-muted/30 border border-border text-xs text-muted-foreground flex flex-col gap-1.5">
                <p className="font-medium text-foreground">其他免费替代方案</p>
                <p>• <span className="text-foreground">OpenAI Whisper API</span>：$0.006/分钟，无本地GPU也可用</p>
                <p>• <span className="text-foreground">Groq Whisper</span>：免费额度大，速度快，https://console.groq.com</p>
                <p>• <span className="text-foreground">本地更大模型</span>：下载 faster-whisper-medium 或 large-v3 获得更高准确率</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
