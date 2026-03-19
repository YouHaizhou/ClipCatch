import { useState, useEffect } from 'react'
import { Settings, CheckCircle, XCircle, Loader2, FolderOpen, Trash2, ChevronRight, Cpu, Twitter, UserX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/store/settingsStore'
import { apiPost, apiGet, apiDelete } from '@/services/api'
import { showToast } from '@/components/Toast'

type TabKey = 'api' | 'storage' | 'whisper' | 'twitter'

interface WhisperStatus {
  available: boolean
  path: string
  model_size: string
  error: string
}

const API_CONFIGS = [
  { provider: 'deepseek' as const, label: 'DeepSeek API Key', placeholder: 'sk-...', hint: '\u7528\u4e8e AI \u6458\u8981\u751f\u6210\uff0cplatform.deepseek.com \u83b7\u53d6\uff0c\u6027\u4ef7\u6bd4\u6700\u9ad8', settingKey: 'api_key_deepseek' },
  { provider: 'openai' as const, label: 'OpenAI API Key', placeholder: 'sk-...', hint: '\u652f\u6301 GPT-4o\uff0cplatform.openai.com \u83b7\u53d6', settingKey: 'api_key_openai' },
  { provider: 'groq' as const, label: 'Groq API Key', placeholder: 'gsk_...', hint: '\u514d\u8d39\u989d\u5ea6\u5927\uff0c\u901f\u5ea6\u6781\u5feb\uff0c\u652f\u6301 Whisper \u8f6c\u5199\uff0cconsole.groq.com \u83b7\u53d6', settingKey: 'api_key_groq' },
  { provider: 'gemini' as const, label: 'Google Gemini API Key', placeholder: 'AIza...', hint: 'Google AI Studio \u83b7\u53d6\uff0caistudio.google.com', settingKey: 'api_key_gemini' },
]

const SEARCH_CONFIGS = [
  { label: 'Serper API Key', placeholder: 'serper key...', hint: 'serper.dev 获取\uff0c免费 2500 次/月\u3002用于 YouTube / Twitter/X 视频搜索\uff0c国内直连无需代理\u3002', settingKey: 'api_key_serper' },
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
  const [twitterAccounts, setTwitterAccounts] = useState<{ username: string; active: boolean }[]>([])
  const [twitterForm, setTwitterForm] = useState({ username: '' })
  const [twitterLoginLoading, setTwitterLoginLoading] = useState(false)
  const [enabledKeys, setEnabledKeys] = useState<Record<string, boolean>>({})

  useEffect(() => { loadStorageInfo(); loadWhisperStatus(); loadTwitterStatus(); loadEnabledKeys() }, [])

  const loadEnabledKeys = async () => {
    try {
      const data = await apiGet<Record<string, boolean>>('/api/settings/enabled-keys')
      setEnabledKeys(data)
    } catch {}
  }

  const loadTwitterStatus = async () => {
    try {
      const data = await apiGet<{ configured: boolean; accounts: { username: string; active: boolean }[] }>('/api/twitter/account/status')
      setTwitterAccounts(data.accounts ?? [])
    } catch {}
  }

  const handleOneClickLogin = async () => {
    if (!(window.electronAPI as any)?.twitterLogin) {
      showToast('error', '\u4ec5 Electron \u73af\u5883\u652f\u6301\u4e00\u952e\u767b\u5f55'); return
    }
    setTwitterLoginLoading(true)
    try {
      const result = await (window.electronAPI as any).twitterLogin()
      if (result.success && result.cookies && result.auth_token) {
        const username = twitterForm.username.trim() ||
          (result.cookies && (result.cookies['screen_name'] || result.cookies['twid'] || '').replace('u%3D', '')) ||
          'twitter_user'
        const res = await apiPost<{ success: boolean; message: string }>('/api/twitter/account', {
          username, password: '', email: '', email_password: '',
          cookies: JSON.stringify(result.cookies),
        })
        if (res.success) {
          showToast('success', res.message)
          setTwitterForm({ username: '' })
          await loadTwitterStatus()
        } else { showToast('error', res.message) }
      } else { showToast('error', result.message || '\u767b\u5f55\u5931\u8d25') }
    } catch (e) { showToast('error', String(e)) }
    finally { setTwitterLoginLoading(false) }
  }

  const handleRemoveTwitterAccount = async (username: string) => {
    try {
      await apiDelete<{ success: boolean }>('/api/twitter/account', { username })
      showToast('success', `\u5df2\u5220\u9664\u8d26\u53f7 @${username}`)
      await loadTwitterStatus()
    } catch (e) { showToast('error', String(e)) }
  }

  const loadStorageInfo = async () => {
    try {
      const data = await apiGet<Record<string, string>>('/api/settings')
      setStorageInfo({ downloadDir: data.download_dir ?? '', exportDir: data.export_dir ?? '', cacheSize: data.cache_size ?? '\u8ba1\u7b97\u4e2d...' })
    } catch {}
  }

  const loadWhisperStatus = async () => {
    try {
      const data = await apiGet<WhisperStatus>('/api/settings/whisper-status')
      setWhisperStatus(data)
      if (data.path) setWhisperPath(data.path)
    } catch {}
  }

  const handleSaveAndTest = async (provider: typeof API_CONFIGS[number]['provider'], settingKey: string) => {
    const value = keyValues[settingKey]
    if (!value?.trim()) { showToast('error', '\u8bf7\u5148\u586b\u5199 API Key'); return }
    setSavingKey(settingKey)
    try {
      await apiPost('/api/settings', { [settingKey]: value.trim() })
      const result = await testConnection(provider)
      if (result.status === 'ok') {
        showToast('success', provider + ' \u8fde\u63a5\u6210\u529f\uff0c\u5ef6\u8fdf ' + (result.latencyMs ?? '--') + 'ms')
        await loadSettings()
      } else { showToast('error', result.message ?? '\u8fde\u63a5\u5931\u8d25') }
    } catch (e) { showToast('error', String(e)) }
    finally { setSavingKey(null) }
  }

  const handleSelectDir = async (type: 'download' | 'export') => {
    if (!window.electronAPI) return
    const dir = await window.electronAPI.selectDirectory()
    if (!dir) return
    await apiPost('/api/settings', { [type === 'download' ? 'download_dir' : 'export_dir']: dir })
    showToast('success', '\u76ee\u5f55\u5df2\u66f4\u65b0')
    await loadStorageInfo()
  }

  const handleClearCache = async () => {
    try { await apiPost('/api/settings/clear-cache', {}); showToast('success', '\u7f13\u5b58\u5df2\u6e05\u7406'); await loadStorageInfo() }
    catch { showToast('error', '\u6e05\u7406\u5931\u8d25') }
  }

  const handleSaveWhisperPath = async () => {
    if (!whisperPath.trim()) { showToast('error', '\u8bf7\u586b\u5199\u6a21\u578b\u8def\u5f84'); return }
    setWhisperSaving(true)
    try {
      await apiPost('/api/settings/whisper-unload', {})
      await apiPost('/api/settings', { whisper_model_path: whisperPath.trim() })
      await loadWhisperStatus()
      showToast('success', '\u6a21\u578b\u8def\u5f84\u5df2\u4fdd\u5b58')
    } catch (e) { showToast('error', String(e)) }
    finally { setWhisperSaving(false) }
  }

  const handleSelectWhisperDir = async () => {
    if (!window.electronAPI) { showToast('error', '\u4ec5 Electron \u73af\u5883\u652f\u6301'); return }
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

  const TABS: [TabKey, string][] = [
    ['api', 'AI 对话模型'],
    ['storage', '存储管理'],
    ['whisper', '语音与视觉'],
    ['twitter', 'Twitter 账号'],
  ]
  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-border flex items-center gap-2">
        <Settings size={18} className="text-primary" />
        <h1 className="text-base font-semibold">系统设置</h1>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <nav className="w-44 border-r border-border p-3 flex flex-col gap-1">
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
              <p className="text-xs text-muted-foreground">API Key 加密存储在本地，不上传任何服务器。</p>
              {API_CONFIGS.map((cfg) => (
                <div key={cfg.provider} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">{statusIcon(cfg.provider)}<label className="text-sm font-medium">{cfg.label}</label></div>
                    <button
                      onClick={async () => {
                        const next = !(enabledKeys[cfg.settingKey] !== false)
                        setEnabledKeys(p => ({ ...p, [cfg.settingKey]: next }))
                        await apiPost('/api/settings', { [`${cfg.settingKey}_enabled`]: next })
                      }}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${enabledKeys[cfg.settingKey] !== false ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted text-muted-foreground'}`}
                    >
                      {enabledKeys[cfg.settingKey] !== false ? '已启用' : '已停用'}
                    </button>
                  </div>
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

              {/* Search API */}
              <div className="pt-4 border-t border-border flex flex-col gap-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">搜索增强</p>
                {SEARCH_CONFIGS.map((cfg) => (
                  <div key={cfg.settingKey} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">{cfg.label}</label>
                      <button
                        onClick={async () => {
                          const next = !(enabledKeys[cfg.settingKey] !== false)
                          setEnabledKeys(p => ({ ...p, [cfg.settingKey]: next }))
                          await apiPost('/api/settings', { [`${cfg.settingKey}_enabled`]: next })
                        }}
                        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${enabledKeys[cfg.settingKey] !== false ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted text-muted-foreground'}`}
                      >
                        {enabledKeys[cfg.settingKey] !== false ? '已启用' : '已停用'}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">{cfg.hint}</p>
                    <div className="flex gap-2">
                      <input type="password" value={keyValues[cfg.settingKey] ?? ''}
                        onChange={e => setKeyValues(p => ({ ...p, [cfg.settingKey]: e.target.value }))}
                        placeholder={cfg.placeholder} data-selectable="true" autoComplete="off"
                        className="flex-1 px-3 py-2 rounded-lg bg-input border border-border text-sm outline-none focus:border-primary transition-colors font-mono" />
                      <button
                        onClick={async () => {
                          setSavingKey(cfg.settingKey)
                          try {
                            await apiPost('/api/settings', { [cfg.settingKey]: keyValues[cfg.settingKey]?.trim() })
                            showToast('success', 'Serper API Key 已保存')
                          } catch(e) { showToast('error', String(e)) }
                          finally { setSavingKey(null) }
                        }}
                        disabled={savingKey === cfg.settingKey || !keyValues[cfg.settingKey]?.trim()}
                        className="px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 whitespace-nowrap">
                        {savingKey === cfg.settingKey ? <Loader2 size={14} className="animate-spin" /> : '保存'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeTab === 'storage' && (
            <div className="flex flex-col gap-6 max-w-xl">
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
          {activeTab === 'whisper' && (
            <div className="flex flex-col gap-6 max-w-xl">
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
                    className="flex-1 px-3 py-2 rounded-lg bg-input border border-border text-sm outline-none focus:border-primary transition-colors font-mono" />
                  <button onClick={handleSelectWhisperDir} className="px-3 py-2 rounded-lg bg-muted hover:bg-secondary text-sm flex items-center gap-1.5"><FolderOpen size={14} /> 浏览</button>
                </div>
                <button onClick={handleSaveWhisperPath} disabled={whisperSaving || !whisperPath.trim()}
                  className="self-start px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 flex items-center gap-2">
                  {whisperSaving ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                  {whisperSaving ? '验证中...' : '保存模型路径'}
                </button>
              </div>
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex flex-col gap-4">
                <div className="flex items-center gap-2 font-medium text-sm"><Cpu size={15} className="text-primary" />多模态视觉分析 API</div>
                <p className="text-xs text-muted-foreground">多模态模式独立配置\uff0c与对话模型 API 相互独立\u3002支持 OpenAI Vision 或 Google Gemini\u3002</p>
                {([
                  { label: 'OpenAI Vision API Key', placeholder: 'sk-...', settingKey: 'api_key_openai_vision', hint: '用于多模态视频分析\uff0c留空则复用 AI 对话中的 OpenAI Key' },
                  { label: 'Gemini Vision API Key', placeholder: 'AIza...', settingKey: 'api_key_gemini_vision', hint: '用于多模态视频分析\uff0c留空则复用 AI 对话中的 Gemini Key' },
                ]).map(vcfg =>
                  <div key={vcfg.settingKey} className="flex flex-col gap-2">
                    <label className="text-sm font-medium">{vcfg.label}</label>
                    <p className="text-xs text-muted-foreground">{vcfg.hint}</p>
                    <div className="flex gap-2">
                      <input type="password" value={keyValues[vcfg.settingKey] ?? ''}
                        onChange={e => setKeyValues(p => ({ ...p, [vcfg.settingKey]: e.target.value }))}
                        placeholder={vcfg.placeholder} data-selectable="true" autoComplete="off"
                        className="flex-1 px-3 py-2 rounded-lg bg-input border border-border text-sm outline-none focus:border-primary transition-colors font-mono" />
                      <button onClick={async () => {
                          setSavingKey(vcfg.settingKey)
                          try {
                            await apiPost('/api/settings', { [vcfg.settingKey]: keyValues[vcfg.settingKey]?.trim() })
                            showToast('success', vcfg.label + '已保存')
                          } catch(e) { showToast('error', String(e)) }
                          finally { setSavingKey(null) }
                        }}
                        disabled={savingKey === vcfg.settingKey || !keyValues[vcfg.settingKey]?.trim()}
                        className="px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 whitespace-nowrap">
                        {savingKey === vcfg.settingKey ? <Loader2 size={14} className="animate-spin" /> : '保存'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {activeTab === 'twitter' && (
            <div className="flex flex-col gap-6 max-w-xl">
              <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-200 flex flex-col gap-1.5">
                <p className="font-semibold text-yellow-300">⚠️ 免责声明</p>
                <p>使用 Twitter 账号登录搜索视频，可能违反 Twitter/X 服务条款。账号存在被封禁风险，请使用小号。本功能由用户自行承担全部责任。</p>
              </div>
              {twitterAccounts.length > 0 && (
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">已配置账号</label>
                  {twitterAccounts.map(acc => (
                    <div key={acc.username} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-card border border-border">
                      <Twitter size={14} className="text-sky-400 shrink-0" />
                      <span className="flex-1 text-sm font-mono">@{acc.username}</span>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full', acc.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>
                        {acc.active ? '活跃' : '已失效'}
                      </span>
                      <button onClick={() => handleRemoveTwitterAccount(acc.username)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors">
                        <UserX size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-3">
                <input type="text" placeholder="用户名（不含@）" data-selectable="true"
                  value={twitterForm.username} onChange={e => setTwitterForm(p => ({...p, username: e.target.value}))}
                  className="px-3 py-2 rounded-lg bg-input border border-border text-sm outline-none focus:border-primary transition-colors" />
                <button onClick={handleOneClickLogin} disabled={twitterLoginLoading}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 disabled:opacity-40 transition-colors w-full justify-center">
                  {twitterLoginLoading ? <Loader2 size={15} className="animate-spin" /> : <Twitter size={15} />}
                  {twitterLoginLoading ? '等待浏览器登录...' : '一键登录 Twitter（推荐）'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
