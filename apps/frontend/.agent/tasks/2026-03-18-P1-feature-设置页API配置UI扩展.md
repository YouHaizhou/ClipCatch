# 2026-03-18-P1-feature-设置页API配置UI扩展

## 任务信息
- **优先级**：P1
- **下发时间**：2026-03-18
- **预计工时**：1-2h
- **依赖**：后端任务「搜索渠道与API配置扩展」需先完成（新增了 openai/groq/gemini 的测试接口）

## Git 信息
- **工作分支**：`feature/frontend-modules-v2`
- 执行前：`git fetch origin && git checkout feature/frontend-modules-v2`

> ⛔ **严禁执行任何 git 操作**，git 由主 Agent 统一执行

---

## 子任务 1：SettingsPage — API 配置扩展

**文件**：`src/pages/SettingsPage.tsx`

### 1.1 新增 API 配置项，移除 Serper

将 `API_CONFIGS` 数组替换为以下内容（移除 Serper，新增 OpenAI/Groq/Gemini）：

```typescript
const API_CONFIGS = [
  {
    provider: 'deepseek' as const,
    label: 'DeepSeek API Key',
    placeholder: 'sk-...',
    hint: '用于 AI 摘要生成，platform.deepseek.com 获取，性价比最高',
    settingKey: 'api_key_deepseek',
  },
  {
    provider: 'openai' as const,
    label: 'OpenAI API Key',
    placeholder: 'sk-...',
    hint: '支持 GPT-4o，platform.openai.com 获取',
    settingKey: 'api_key_openai',
  },
  {
    provider: 'groq' as const,
    label: 'Groq API Key',
    placeholder: 'gsk_...',
    hint: '免费额度大，速度极快，支持 Whisper 转写，console.groq.com 获取',
    settingKey: 'api_key_groq',
  },
  {
    provider: 'gemini' as const,
    label: 'Google Gemini API Key',
    placeholder: 'AIza...',
    hint: 'Google AI Studio 获取，aistudio.google.com',
    settingKey: 'api_key_gemini',
  },
  {
    provider: 'zhipu' as const,
    label: '智谱 AI API Key',
    placeholder: '智谱 GLM-4 备用 Key',
    hint: 'open.bigmodel.cn 获取，可选备用',
    settingKey: 'api_key_zhipu',
  },
]
```

### 1.2 更新 settingsStore 类型

**文件**：`src/store/settingsStore.ts`

`ApiStatusKey` 类型新增 `'openai' | 'groq' | 'gemini'`：

```typescript
type ApiStatusKey = 'deepseek' | 'zhipu' | 'xunfei' | 'serper' | 'openai' | 'groq' | 'gemini'
```

`apiStatus` 初始值新增三个：
```typescript
apiStatus: {
  deepseek: 'unknown',
  zhipu: 'unknown',
  xunfei: 'unknown',
  serper: 'unknown',
  openai: 'unknown',
  groq: 'unknown',
  gemini: 'unknown',
},
```

### 1.3 Sidebar 底部状态指示灯更新

**文件**：`src/components/Sidebar.tsx`

底部状态灯改为只显示 DeepSeek 一个（最关键的 LLM），移除 STT 那个：
```tsx
<button
  onClick={() => setActivePage('settings')}
  title={`AI: ${apiStatus.deepseek}`}
  className="p-2 rounded-lg hover:bg-muted transition-colors">
  <div className="flex items-center gap-1">
    <div className={cn('w-2 h-2 rounded-full', STATUS_DOT[apiStatus.deepseek] ?? STATUS_DOT.unknown)} />
    <span className="text-[9px] text-muted-foreground">AI</span>
  </div>
</button>
```

---

## 子任务 2：SearchPage — 新增 Twitter 平台选项

**文件**：`src/pages/SearchPage.tsx`

在平台标签按钮中新增 Twitter：
```tsx
const PLATFORMS = [
  { value: 'all',      label: '全网' },
  { value: 'youtube',  label: 'YouTube' },
  { value: 'bilibili', label: 'Bilibili' },
  { value: 'twitter',  label: 'Twitter/X' },
] as const
type Platform = typeof PLATFORMS[number]['value']
```

同时将 `Platform` 类型定义更新为包含 `'twitter'`。

---

## 验收标准

- [ ] 设置页 API 配置显示 5 个：DeepSeek / OpenAI / Groq / Gemini / 智谱，无 Serper
- [ ] 每个新 API 的「保存并测试」按钮可正常调用后端
- [ ] `settingsStore` 类型无报错
- [ ] 搜索页平台选项包含 Twitter/X
- [ ] Sidebar 底部只显示一个 AI 状态灯
- [ ] `pnpm type-check` 无报错
