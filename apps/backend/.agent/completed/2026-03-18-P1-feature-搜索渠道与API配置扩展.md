# 2026-03-18-P1-feature-后端搜索渠道与API配置扩展

## 任务信息
- **优先级**：P1
- **下发时间**：2026-03-18
- **预计工时**：2-3h

## Git 信息
- **工作分支**：`feature/backend-api-v2`

> ⛔ **严禁执行任何 git 操作**，git 由主 Agent 统一执行

---

## 子任务 1：搜索渠道新增 Twitter/X

**文件**：`src/services/search_service.py`

已在 `search_videos` 中新增 twitter 分支，实现 `_search_twitter` 函数通过 Serper API 搜索 Twitter/X 内容。未配置 Serper Key 时静默返回空列表。

`src/routers/search.py` 的 `_to_camel` 已通用，无需改动。

---

## 子任务 2：API 配置扩展

**文件**：`src/routers/settings.py`

- `GET /api/settings` 新增返回 `has_openai_key`、`has_groq_key`、`has_gemini_key` 字段
- `POST /api/settings/test-connection` 新增 `openai`、`groq`、`gemini` 三个 provider 分支
- 所有路由补充外层 try/except

---

## 验收标准

- [x] `POST /api/search` 支持 `platform: 'twitter'`，配置了 Serper Key 后能返回结果
- [x] `GET /api/settings` 返回 `has_openai_key`、`has_groq_key`、`has_gemini_key` 字段
- [x] `POST /api/settings/test-connection` 支持 `provider: 'openai'`、`'groq'`、`'gemini'`
- [x] 所有新增路由有外层 try/except

---

## 完成记录

- **完成时间**：2026-03-18
- **实际工时**：约 0.5h
- **修改文件**：
  - `src/services/search_service.py`：新增 `_search_twitter` 函数及 twitter 分支
  - `src/routers/settings.py`：新增 openai/groq/gemini 的 has_key 返回及 test-connection 分支
- **注意**：git 操作由主 Agent 统一执行，本 Agent 未提交
