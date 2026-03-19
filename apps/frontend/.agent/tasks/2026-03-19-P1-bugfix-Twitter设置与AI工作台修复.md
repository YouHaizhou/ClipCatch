# 2026-03-19-P1-bugfix-Twitter设置与AI工作台修复

## Git 信息
- 分支：`feature/frontend-twitter-settings-ai-fix`
- 基于：`develop`

## 任务概览
4 个前端问题：
1. 删除账号报 `failed to fetch`
2. Twitter 设置界面简化（删除手动输入区块）
3. AI 工作台多模态未配置 API 时前端提示
4. 系统配置「语音转写」Tab 改名 + 补充多模态 API 入口

---

## 问题 1：删除 Twitter 账号报 "failed to fetch"

### 根因
`handleRemoveTwitterAccount` 使用硬编码 `fetch('http://127.0.0.1:57891/...')` 而非统一的 `baseUrl()` 工具函数。

### 修复

**Step 1** — `apps/frontend/src/services/api.ts` 末尾追加：
```ts
export async function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`)
  const json: ApiResponse<T> = await res.json()
  if (json.code !== 0) throw new Error(json.message ?? 'Unknown error')
  return json.data as T
}
```

**Step 2** — `SettingsPage.tsx` import 改为：
```tsx
import { apiPost, apiGet, apiDelete } from '@/services/api'
```

**Step 3** — 替换 `handleRemoveTwitterAccount`：
```tsx
const handleRemoveTwitterAccount = async (username: string) => {
  try {
    await apiDelete('/api/twitter/account', { username })
    showToast('success', `已删除账号 @${username}`)
    await loadTwitterStatus()
  } catch (e) { showToast('error', String(e)) }
}
```

### 验收
- [ ] 点击删除，toast 显示「已删除账号 @xxx」，列表刷新
- [ ] 不出现 failed to fetch

---

## 问题 2：Twitter 设置界面简化

### 根因
Twitter Tab 中存在大量手动输入字段（Cookie/密码/邮箱），用户只需要一键登录。

### 修复

**Step 1** — state 简化（`SettingsPage.tsx`）：
```tsx
const [twitterForm, setTwitterForm] = useState({ username: '' })
```

**Step 2** — 删除 `twitterAdding` state 和整个 `handleAddTwitterAccount` 函数。

**Step 3** — `handleOneClickLogin` 中 reset 改为：
```tsx
setTwitterForm({ username: '' })
```

**Step 4** — Twitter Tab JSX 完整替换为：
```tsx
{activeTab === 'twitter' && (
  <div className="flex flex-col gap-6 max-w-xl">
    <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-200 flex flex-col gap-1.5">
      <p className="font-semibold text-yellow-300">⚠️ 免责声明</p>
      <p>使用 Twitter 账号登录可能违反服务条款，账号有封禁风险，请使用小号，后果自负。</p>
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
      <label className="text-sm font-medium">添加账号</label>
      <input type="text" placeholder="Twitter 用户名（不含@，可选）" data-selectable="true"
        value={twitterForm.username} onChange={e => setTwitterForm({ username: e.target.value })}
        className="px-3 py-2 rounded-lg bg-input border border-border text-sm outline-none focus:border-primary transition-colors" />
      <button onClick={handleOneClickLogin} disabled={twitterLoginLoading}
        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 disabled:opacity-40 transition-colors w-full justify-center">
        {twitterLoginLoading ? <Loader2 size={15} className="animate-spin" /> : <Twitter size={15} />}
        {twitterLoginLoading ? '等待浏览器登录...' : '一键登录 Twitter'}
      </button>
      <p className="text-xs text-muted-foreground">弹出内嵌浏览器窗口，正常登录即可，自动导入 Cookie。</p>
    </div>
  </div>
)}
```

**Step 5** — 检查并删除不再使用的 `Plus` 图标 import。

### 验收
- [ ] Twitter Tab 只有免责声明 + 账号列表 + 用户名输入 + 一键登录按钮
- [ ] 无 linter 错误

---

## 问题 3：AI 工作台多模态未配置 API 前端提示

### 根因
`WorkspacePage.tsx` `handleStart` 未在前端提前校验多模态所需 API Key。

`settingsStore.ts` 中 `settings` 字段类型为 `AppSettings | null`，API Key 字段：`api_key_openai`、`api_key_gemini`。

### 修复 — `apps/frontend/src/pages/WorkspacePage.tsx`

在 `handleStart` 的 `if (!selectedVideo)` 检查后插入：
```tsx
  if (mode === 'multimodal') {
    const { settings } = useSettingsStore.getState()
    const hasVisionApi = (settings as any)?.api_key_openai || (settings as any)?.api_key_gemini
    if (!hasVisionApi) {
      showToast('error', '多模态模式需要配置 OpenAI 或 Gemini API Key，请前往「系统配置 → API 配置」添加')
      return
    }
  }
```

### 验收
- [ ] 未配置 OpenAI/Gemini Key 时，点击「开始分析」立即 toast 提示，不发请求
- [ ] 已配置时正常处理

---

## 问题 4：系统配置「语音转写」改名 + 多模态 API 入口

### 根因
`SettingsPage.tsx` whisper Tab 显示名称为「语音转写」，且无多模态模型配置说明。

### 修复 — `apps/frontend/src/pages/SettingsPage.tsx`

**Step 1** — Tab 按钮列表中将「语音转写」改为「语音 & 视觉」。

**Step 2** — 在 `activeTab === 'whisper'` 区块的现有 Whisper 配置下方追加：
```tsx
{/* 多模态视觉模型 */}
<div className="flex flex-col gap-3 pt-2 border-t border-border">
  <label className="text-sm font-medium">多模态视觉模型 API</label>
  <div className="p-3 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground flex flex-col gap-1.5">
    <p>多模态处理模式需要配置以下任意一个视觉模型 API：</p>
    <p>• <span className="text-foreground font-medium">OpenAI API Key</span>（GPT-4o Vision）</p>
    <p>• <span className="text-foreground font-medium">Google Gemini API Key</span>（Gemini 1.5 Pro）</p>
    <p className="mt-1">前往<button onClick={() => setActiveTab('api' as TabKey)} className="text-primary underline mx-1">API 配置</button>Tab 添加。</p>
  </div>
</div>
```

> 注意：需要将 `activeTab` 的 setter 提取为可调用函数（如已有 `setActiveTab` state setter 则直接用，否则直接改 `setActiveTab('api')` 即可，因为 `activeTab` 是本地 useState）。

### 验收
- [ ] Tab 显示名称为「语音 & 视觉」
- [ ] Tab 内下方显示多模态 API 说明和跳转链接
- [ ] 点击「API 配置」链接切换到 api Tab

---

## 完成记录
（子 Agent 完成后填写）
