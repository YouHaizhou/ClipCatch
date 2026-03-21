import { useState, useEffect } from 'react'
import { Settings, CheckCircle, XCircle, Loader2, FolderOpen, Trash2, ChevronRight, Cpu, UserX, Search as SearchIcon, Wifi, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/store/settingsStore'
import { apiPost, apiGet, apiDelete } from '@/services/api'
import { showToast } from '@/components/Toast'

type TabKey = 'api' | 'search' | 'storage' | 'whisper' | 'twitter' | 'network'

interface WhisperStatus { available: boolean; path: string; model_size: string; error: string }

const API_CONFIGS = [
  { provider: 'deepseek' as const, label: 'DeepSeek', placeholder: 'sk-...',   settingKey: 'api_key_deepseek' },
  { provider: 'openai'   as const, label: 'OpenAI',   placeholder: 'sk-...',   settingKey: 'api_key_openai'   },
  { provider: 'groq'     as const, label: 'Groq',     placeholder: 'gsk_...', settingKey: 'api_key_groq'    },
  { provider: 'gemini'   as const, label: 'Gemini',   placeholder: 'AIza...', settingKey: 'api_key_gemini'  },
]

const MODEL_MAP: Record<string, string> = {
  deepseek: 'deepseek-chat',
  openai:   'gpt-4o',
  groq:     'llama3-70b-8192',
  gemini:   'gemini-1.5-flash',
}

const TABS: [TabKey, string][] = [
  ['api',     'AI \u6a21\u578b'],
  ['search',  '\u641c\u7d22\u8bbe\u7f6e'],
  ['storage', '\u5b58\u50a8\u7ba1\u7406'],
  ['whisper', '\u8bed\u97f3\u6a21\u578b'],
  ['network', '\u7f51\u7edc\u8bca\u65ad'],
]

interface DiagCheck {
  name: string
  ok: boolean
  latency_ms: number
  error_code?: string
  hint?: string
  suggestion?: string
}

interface DiagResult {
  is_wsl: boolean
  proxy_source: 'env' | 'winreg' | 'none'
  proxy_address: string | null
  suggestion: string | null
  checks: DiagCheck[]
}
export default function SettingsPage() {
  const { apiStatus, testConnection, loadSettings, markKeyConfigured } = useSettingsStore()
  const [activeTab, setActiveTab]     = useState<TabKey>('api')
  const [keyValues, setKeyValues]     = useState<Record<string, string>>({})
  const [savingKey, setSavingKey]     = useState<string | null>(null)
  const [storageInfo, setStorageInfo] = useState<{ downloadDir: string; exportDir: string; cacheSize: string } | null>(null)
  const [whisperPath, setWhisperPath]         = useState('')
  const [whisperStatus, setWhisperStatus]     = useState<WhisperStatus | null>(null)
  const [whisperSaving, setWhisperSaving]     = useState(false)
  const [enabledKeys, setEnabledKeys] = useState<Record<string, boolean>>({})
  const [selectedModel, setSelectedModel] = useState('deepseek')
  const [keyHints, setKeyHints] = useState<Record<string, string>>({})
  // 网络诊断状态
  const [diagResult, setDiagResult]   = useState<DiagResult | null>(null)
  const [diagLoading, setDiagLoading] = useState(false)

  useEffect(() => {
    loadStorageInfo(); loadWhisperStatus(); loadEnabledKeys()
    apiGet<Record<string, unknown>>('/api/settings').then(d => {
      const m = (d.llm_model as string) ?? ''
      if (m.includes('gpt'))    setSelectedModel('openai')
      else if (m.includes('groq') || m.includes('llama')) setSelectedModel('groq')
      else if (m.includes('gemini')) setSelectedModel('gemini')
      else setSelectedModel('deepseek')
      // Show placeholder for keys that are already configured
      const hints: Record<string, string> = {}
      const keyMap: Record<string, string> = {
        has_deepseek_key: 'api_key_deepseek',
        has_openai_key:   'api_key_openai',
        has_groq_key:     'api_key_groq',
        has_gemini_key:   'api_key_gemini',
        has_serper_key:   'api_key_serper',
      }
      for (const [flag, settingKey] of Object.entries(keyMap)) {
        if (d[flag]) hints[settingKey] = '__has_key__'
      }
      setKeyHints(hints)
    }).catch(() => {})
  }, [])

  const loadEnabledKeys = async () => {
    try { const d = await apiGet<Record<string, boolean>>('/api/settings/enabled-keys'); setEnabledKeys(d) } catch {}
  }
  const loadStorageInfo = async () => {
    try {
      const d = await apiGet<Record<string, string>>('/api/settings')
      setStorageInfo({ downloadDir: d.download_dir ?? '', exportDir: d.export_dir ?? '', cacheSize: d.cache_size ?? '计算中...' })
    } catch {}
  }
  const loadWhisperStatus = async () => {
    try {
      const d = await apiGet<WhisperStatus>('/api/settings/whisper-status')
      setWhisperStatus(d); if (d.path) setWhisperPath(d.path)
    } catch {}
  }

  const handleSaveAndTest = async (provider: typeof API_CONFIGS[number]['provider'], settingKey: string) => {
    const value = keyValues[settingKey]
    if (!value?.trim()) { showToast('error', '请先填写 API Key'); return }
    setSavingKey(settingKey)
    try {
      // 先保存 Key
      await apiPost('/api/settings', { [settingKey]: value.trim() })
      await loadSettings()
      markKeyConfigured(provider) // show green checkmark immediately
      showToast('success', `${provider} Key 已保存`)
      // 后台静默测试，不阻塞 UI，不覆盖保存成功提示
      setTimeout(async () => {
        try {
          const result = await testConnection(provider)
          if (result.status === 'ok') {
            showToast('success', `${provider} 连接测试成功 ${result.latencyMs ?? '--'}ms`)
          }
          // 测试失败时静默处理，Key 已保存即可正常使用
        } catch {
          // 测试超时或网络错误，静默处理
        }
      }, 500)
    } catch (e) { showToast('error', 'Key 保存失败：' + String(e)) }
    finally { setSavingKey(null) }
  }

  const handleSelectDir = async (type: 'download' | 'export') => {
    if (!window.electronAPI) return
    const dir = await window.electronAPI.selectDirectory()
    if (!dir) return
    await apiPost('/api/settings', { [type === 'download' ? 'download_dir' : 'export_dir']: dir })
    showToast('success', '目录已更新'); await loadStorageInfo()
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
      await loadWhisperStatus(); showToast('success', '模型路径已保存')
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
    if (s === 'ok')      return <CheckCircle size={14} className="text-emerald-400" />
    if (s === 'error')   return <XCircle size={14} className="text-red-400" />
    if (s === 'testing') return <Loader2 size={14} className="text-yellow-400 animate-spin" />
    return <span className="w-3.5 h-3.5 rounded-full bg-muted inline-block" />
  }

  const runDiagnostics = async () => {
    setDiagLoading(true)
    try {
      const d = await apiGet<DiagResult>("/api/diagnostics/network")
      setDiagResult(d)
    } catch (e) {
      showToast("error", "\u8bca\u65ad\u5931\u8d25\uff1a" + String(e))
    } finally {
      setDiagLoading(false)
    }
  }

  const proxySourceLabel = (src: string) => {
    if (src === "env")    return "\u73af\u5883\u53d8\u91cf"
    if (src === "winreg") return "Windows \u6ce8\u518c\u8868"
    return "\u672a\u68c0\u6d4b\u5230"
  }

  const toggleKey = async (settingKey: string) => {
    const next = !(enabledKeys[settingKey] !== false)
    setEnabledKeys(p => ({ ...p, [settingKey]: next }))
    await apiPost('/api/settings', { [`${settingKey}_enabled`]: next })
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
        <Settings size={16} className="text-primary" />
        <h1 className="text-sm font-semibold">系统设置</h1>
      </div>
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* 窗口宽度足够时：左侧竖排 tab */}
        <nav className="hidden sm:flex w-32 shrink-0 border-r border-border p-2 flex-col gap-0.5 overflow-y-auto">
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={cn('w-full text-left px-3 py-2 rounded-md text-xs flex items-center justify-between transition-colors',
                activeTab === key ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
              {label}{activeTab === key && <ChevronRight size={12} />}
            </button>
          ))}
        </nav>
        {/* 窗口狭时：顶部横排 tab */}
        <div className="sm:hidden flex shrink-0 border-b border-border overflow-x-auto w-full">
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={cn('shrink-0 px-3 py-2 text-xs border-b-2 transition-colors whitespace-nowrap',
                activeTab === key ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground')}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">

          {/* ===== AI 模型 Tab ===== */}
          {activeTab === 'api' && (
            <div className="flex flex-col gap-5 max-w-lg">
              <p className="text-xs text-muted-foreground">API Key 加密存储在本地，不上传任何服务器。</p>
              {/* 模型选择下拉 */}
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex flex-col gap-2">
                <label className="text-xs font-semibold text-primary">当前使用模型</label>
                <select value={selectedModel}
                  onChange={async e => {
                    const v = e.target.value
                    setSelectedModel(v)
                    await apiPost('/api/settings', { llm_model: MODEL_MAP[v] ?? v })
                    showToast('success', '已切换为 ' + v)
                  }}
                  className="px-3 py-2 rounded-lg bg-input border border-border text-sm outline-none focus:border-primary cursor-pointer">
                  {API_CONFIGS.map(c => (
                    <option key={c.provider} value={c.provider}>
                      {c.label}{enabledKeys[c.settingKey] !== false ? '' : ' (已停用)'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">AI 工作台生成笔记时使用此模型。</p>
              </div>
              {/* 各 Key 配置 */}
              {API_CONFIGS.map((cfg) => (
                <div key={cfg.provider} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">{statusIcon(cfg.provider)}<label className="text-sm font-medium">{cfg.label} API Key</label></div>
                    <button onClick={() => toggleKey(cfg.settingKey)}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                        enabledKeys[cfg.settingKey] !== false ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                      {enabledKeys[cfg.settingKey] !== false ? '已启用' : '已停用'}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input type="password" value={keyValues[cfg.settingKey] ?? ''}
                      onChange={e => setKeyValues(p => ({ ...p, [cfg.settingKey]: e.target.value }))}
                      placeholder={keyHints[cfg.settingKey] === '__has_key__' ? '•••••••• (已配置，重新输入可更新)' : cfg.placeholder}
                      data-selectable="true" autoComplete="off"
                      className="flex-1 px-3 py-2 rounded-lg bg-input border border-border text-sm outline-none focus:border-primary font-mono" />
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

          {/* ===== 搜索设置 Tab ===== */}
          {activeTab === 'search' && (
            <div className="flex flex-col gap-4 max-w-lg">
              <div className="p-3 rounded-xl bg-muted/50 border border-border flex flex-col gap-2">
                <div className="flex items-center gap-2"><SearchIcon size={14} className="text-primary" /><span className="text-sm font-medium">Serper API Key</span></div>
                <p className="text-xs text-muted-foreground">serper.dev 获取，免费 2500 次/月。用于 YouTube / Twitter/X 搜索，国内直连无需代理。未配置时挂梯子可直连 YouTube。</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">启用状态</span>
                  <button onClick={() => toggleKey('api_key_serper')}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      enabledKeys['api_key_serper'] !== false ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                    {enabledKeys['api_key_serper'] !== false ? '已启用' : '已停用'}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input type="password" value={keyValues['api_key_serper'] ?? ''}
                    onChange={e => setKeyValues(p => ({ ...p, api_key_serper: e.target.value }))}
                    placeholder={keyHints['api_key_serper'] === '__has_key__' ? '•••••••• (已配置)' : 'serper key...'}
                    data-selectable="true" autoComplete="off"
                    className="flex-1 px-3 py-2 rounded-lg bg-input border border-border text-sm outline-none focus:border-primary font-mono" />
                  <button
                    onClick={async () => {
                      setSavingKey('api_key_serper')
                      try {
                        await apiPost('/api/settings', { api_key_serper: keyValues['api_key_serper']?.trim() })
                        showToast('success', 'Serper API Key 已保存')
                      } catch(e) { showToast('error', String(e)) }
                      finally { setSavingKey(null) }
                    }}
                    disabled={savingKey === 'api_key_serper' || !keyValues['api_key_serper']?.trim()}
                    className="px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 whitespace-nowrap">
                    {savingKey === 'api_key_serper' ? <Loader2 size={14} className="animate-spin" /> : '保存'}
                  </button>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-muted/30 border border-border text-xs text-muted-foreground flex flex-col gap-1.5">
                <p className="font-medium text-foreground">搜索策略说明</p>
                <p>• Bilibili：国内直连，无需任何配置</p>
                <p>• YouTube / Twitter：配置 Serper Key 可国内直连；未配置时需挂梯子直连</p>
                <p>• 代理地址通过环境变量 VIDEOAI_PROXY 或 HTTP_PROXY 配置</p>
              </div>
            </div>
          )}

          {/* ===== 存储管理 Tab ===== */}
          {activeTab === 'storage' && (
            <div className="flex flex-col gap-5 max-w-lg">
              {([{ type: 'download' as const, label: '视频下载目录', val: storageInfo?.downloadDir },
                { type: 'export' as const, label: 'Markdown 导出目录', val: storageInfo?.exportDir }]).map(item => (
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

          {/* ===== Whisper Tab ===== */}
          {activeTab === 'whisper' && (
            <div className="flex flex-col gap-5 max-w-lg">
              <div className="p-4 rounded-xl bg-muted/50 border border-border flex flex-col gap-3">
                <div className="flex items-center gap-2 font-medium text-sm"><Cpu size={15} className="text-primary" />本地 Whisper 模型（免费无需联网）</div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>使用 faster-whisper 在本地运行，中文识别效果好，完全免费。</p>
                  <p>推荐模型：<span className="font-mono text-foreground">faster-whisper-small</span>（约 466MB）</p>
                  <p>HuggingFace：<span className="text-primary">https://huggingface.co/Systran/faster-whisper-small</span></p>
                  <p>ModelScope：<span className="text-primary">https://modelscope.cn/models/pkufool/faster-whisper-small</span></p>
                </div>
              </div>
              {whisperStatus && (
                <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm border',
                  whisperStatus.available ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400')}>
                  {whisperStatus.available ? <><CheckCircle size={14} />模型已就绪</> : <><XCircle size={14} />{whisperStatus.error || '模型未配置'}</>}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Whisper 模型文件夹路径</label>
                <div className="flex gap-2">
                  <input type="text" value={whisperPath} onChange={e => setWhisperPath(e.target.value)}
                    placeholder="例：C:\Users\Models\faster-whisper-small" data-selectable="true"
                    className="flex-1 px-3 py-2 rounded-lg bg-input border border-border text-sm outline-none focus:border-primary font-mono" />
                  <button onClick={handleSelectWhisperDir} className="px-3 py-2 rounded-lg bg-muted hover:bg-secondary text-sm flex items-center gap-1.5"><FolderOpen size={14} /> 浏览</button>
                </div>
                <button onClick={handleSaveWhisperPath} disabled={whisperSaving || !whisperPath.trim()}
                  className="self-start px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 flex items-center gap-2">
                  {whisperSaving ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                  {whisperSaving ? '验证中...' : '保存模型路径'}
                </button>
              </div>
            </div>
          )}


          {/* ===== 网络诊断 Tab ===== */}
          {activeTab === 'network' && (
            <div className="flex flex-col gap-4 max-w-lg">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">并行检测各网络端点连通性，帮助排查代理和连接问题。</p>
                <button onClick={runDiagnostics} disabled={diagLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-40">
                  {diagLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  {diagLoading ? '诊断中...' : '开始检测'}
                </button>
              </div>

              {!diagResult && !diagLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                  <Wifi size={36} className="opacity-20" />
                  <p className="text-xs">点击『开始检测』运行网络诊断</p>
                </div>
              )}

              {diagResult && (
                <>
                  {/* 环境信息 */}
                  <div className="p-3 rounded-xl bg-muted/40 border border-border flex flex-col gap-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">运行环境</span>
                      <span className="font-medium">{diagResult.is_wsl ? 'WSL (Linux)' : 'Windows'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">代理来源</span>
                      <span className="font-medium">{proxySourceLabel(diagResult.proxy_source)}</span>
                    </div>
                    {diagResult.proxy_address && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">代理地址</span>
                        <span className="font-mono text-primary">{diagResult.proxy_address}</span>
                      </div>
                    )}
                  </div>

                  {/* 全局建议 */}
                  {diagResult.suggestion && (
                    <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex gap-2">
                      <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-yellow-200">{diagResult.suggestion}</p>
                    </div>
                  )}

                  {/* 检测项列表 */}
                  <div className="flex flex-col gap-2">
                    {diagResult.checks.map((check) => (
                      <div key={check.name} className={`p-3 rounded-xl border flex flex-col gap-1 ${
                        check.ok ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
                      }`}>
                        <div className="flex items-center gap-2">
                          {check.ok
                            ? <CheckCircle size={13} className="text-emerald-400 shrink-0" />
                            : <XCircle size={13} className="text-red-400 shrink-0" />}
                          <span className="text-sm font-medium flex-1">{check.name}</span>
                          {check.ok
                            ? <span className="text-xs text-emerald-400">{check.latency_ms}ms</span>
                            : <span className="text-xs text-red-400">{check.error_code ?? '失败'}</span>}
                        </div>
                        {!check.ok && check.hint && (
                          <p className="text-xs text-muted-foreground ml-5">{check.hint}</p>
                        )}
                        {!check.ok && check.suggestion && (
                          <p className="text-xs text-yellow-300/80 ml-5">建议：{check.suggestion}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
