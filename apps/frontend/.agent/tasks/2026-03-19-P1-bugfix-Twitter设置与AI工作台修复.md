# 2026-03-19-P1-bugfix-Twitter设置与AI工作台修复

## Git 信息
- 分支：`feature/frontend-twitter-settings-ai-fix`
- 基于：`develop`

## 任务概览
4 个前端问题：
1. 删除 Twitter 账号报 `failed to fetch`
2. Twitter 设置界面简化（删除手动输入区块）
3. AI 工作台多模态未配置 API 时前端提示
4. 系统配置「语音转写」Tab 改名 + 补充多模态 API 入口

---

## F1：删除 Twitter 账号报 "failed to fetch"

### 问题现象
点击已配置 Twitter 账号旁的删除按钮，toast 显示 `failed to fetch`，账号未被删除。

### 根因
`SettingsPage.tsx` 的 `handleRemoveTwitterAccount` 使用硬编码 `fetch('http://127.0.0.1:57891/api/twitter/account', { method: 'DELETE' })`，不走 `api.ts` 的 `baseUrl()` 统一封装，开发模式下 Vite proxy 不代理 DELETE 请求导致 CORS 失败。

### 代码定位
- `apps/frontend/src/services/api.ts`：缺少 `apiDelete` 函数，参照现有 `apiPost`/`apiPatch` 的模式添加
- `apps/frontend/src/pages/SettingsPage.tsx`：`handleRemoveTwitterAccount` 函数，改用 `apiDelete`

### 验收标准
- [ ] 点击删除，toast 显示「已删除账号 @xxx」，账号列表刷新
- [ ] 不出现 `failed to fetch`

---

## F2：Twitter 设置界面简化

### 问题现象
用户要求去掉「推荐方式说明」和「手动填写 Cookie / 账号密码」区块，只保留一键登录按钮。

### 根因
`SettingsPage.tsx` Twitter Tab 中存在大量手动输入字段（Cookie 文本框、密码、邮箱、推荐说明区块），需要删除。

### 代码定位
- `apps/frontend/src/pages/SettingsPage.tsx`
  - `twitterForm` state：简化为只保留 `username` 字段
  - 删除 `twitterAdding` state
  - 删除整个 `handleAddTwitterAccount` 函数
  - `handleOneClickLogin` 中 reset 时同步简化
  - Twitter Tab JSX：删除推荐说明区块、Cookie 输入框、密码、邮箱字段，只保留免责声明 + 已配置账号列表 + 用户名输入框 + 一键登录按钮
  - 检查并移除不再使用的 `Plus` 图标 import

### 验收标准
- [ ] Twitter Tab 只有：免责声明 + 已配置账号列表 + 用户名输入框 + 一键登录按钮
- [ ] 无 linter 错误

---

## F3：AI 工作台多模态未配置 API 前端提示

### 问题现象
选择「多模态」处理模式，未配置 OpenAI/Gemini API Key 时，点击「开始分析」后报错信息不明确（由后端报错，体验差）。

### 根因
`WorkspacePage.tsx` 的 `handleStart` 没有在前端提前校验多模态所需 API Key。

### 代码定位
- `apps/frontend/src/pages/WorkspacePage.tsx`：`handleStart` 函数
- `apps/frontend/src/store/settingsStore.ts`：`settings` 对象中 API Key 字段名为 `api_key_openai`、`api_key_gemini`（已确认）
- 在 `if (!selectedVideo)` 检查后、`reset()` 调用前，添加 `mode === 'multimodal'` 时的 API Key 校验，未配置则 `showToast('error', ...)` 并 `return`
- 通过 `useSettingsStore.getState()` 读取 settings（无需 hook，直接调用）

### 验收标准
- [ ] 未配置 OpenAI/Gemini Key 时，点击「开始分析」立即 toast 提示，不发请求
- [ ] 已配置时正常处理

---

## F4：系统配置「语音转写」改名 + 多模态 API 入口

### 问题现象
- 「语音转写」Tab 命名不直观
- 多模态模型 API 在配置界面没有体现

### 根因
`SettingsPage.tsx` whisper Tab 显示名称为「语音转写」，Tab 内只有本地 Whisper 路径配置，缺少多模态模型 API 说明和跳转。

### 代码定位
- `apps/frontend/src/pages/SettingsPage.tsx`
  - Tab 按钮列表中 `whisper` 对应显示文字改为「本地模型」
  - `activeTab === 'whisper'` 区块：在现有 Whisper 配置下方追加多模态 API 说明区块，说明需要配置 OpenAI 或 Gemini API Key，提供点击切换到 `api` Tab 的按钮（`setActiveTab('api')`，即 `setActiveTab` 是本地 `useState` 的 setter）

### 验收标准
- [ ] Tab 显示名称改为「本地模型」
- [ ] Tab 内下方有多模态 API 说明，点击可跳转到 API 配置 Tab
- [ ] 无 linter 错误

---

## 完成记录
（子 Agent 完成后填写）
