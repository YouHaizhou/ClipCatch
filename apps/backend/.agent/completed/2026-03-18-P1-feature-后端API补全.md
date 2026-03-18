# 2026-03-18-P1-feature-后端API补全

## 任务信息
- **优先级**：P1
- **类型**：feature + bugfix
- **下发时间**：2026-03-18
- **预计工时**：3-4h

## Git 信息
- **工作分支**：`feature/backend-api-v2`
- 执行前：`git fetch origin && git checkout feature/backend-api-v2`

---

## 子任务 1：媒体库接口新增 `ai_status` 字段

**文件**：`src/routers/library.py`

`GET /api/library` 返回列表中每个视频新增 `ai_status` 字段：
- `'none'`：没有 AI 任务，或任务失败
- `'processing'`：任务状态在 `queued/extracting/transcribing/generating`
- `'completed'`：任务状态为 `completed`

同时保留 `has_note: bool` 字段（兼容现有前端）。

---

## 子任务 2：确认下载画质参数映射

**文件**：`src/services/download_service.py`

已确认 `format_map` 正确映射所有画质参数并传入 `ydl_opts['format']`，无需修改。

---

## 子任务 3：AI 任务完成时确认 note_id 推送

**文件**：`src/routers/ai.py`

已确认 `_run_ai_pipeline` 在完成时推送：
```python
_push(task_id, {'type': 'done', 'note_id': note.id, 'word_count': word_count})
```
`ai_task_stream` 的已完成任务分支也包含 `note_id`，无需修改。

---

## 子任务 4：Prompt 模板支持（timeline / meeting / keypoints）

**文件**：`src/services/prompts.py`

已补充 3 个新模板：`timeline`（时间轴）、`meeting`（会议纪要）、`keypoints`（关键知识点）。`llm_service.py` 中 `stream_summary` 已通过 `build_messages(template_key, ...)` 正确读取对应模板，无需修改。

---

## 子任务 5：Settings 接口支持 Serper Key 连接测试

**文件**：`src/routers/settings.py`

已确认 `provider=serper` 分支已实现，调用 `https://google.serper.dev/search`，返回 `{status: 'ok', latency_ms: 数字}`，与前端 `result.latency_ms ?? result.latencyMs` 兼容，无需修改。

---

## 验收标准

- [x] `GET /api/library` 返回包含 `ai_status` 字段（none/processing/completed）
- [x] 下载画质参数正确传递给 yt-dlp
- [x] AI SSE `done` 事件包含 `note_id`
- [x] 4 个 Prompt 模板均可使用
- [x] Serper 连接测试返回格式正确
- [x] 所有路由均有外层 try/except 防止 500

---

## 完成记录

- **完成时间**：2026-03-18
- **实际工时**：约 1h
- **提交分支**：`feature/backend-api-v2`
- **Commit**：`67dc226` — `feat(backend): 补全API - ai_status字段/Prompt模板扩展`
- **修改文件**：
  - `src/routers/library.py`：新增 `ai_status` 字段查询逻辑，补充外层 try/except
  - `src/services/prompts.py`：补充 `timeline`、`meeting`、`keypoints` 三个 Prompt 模板
- **未修改文件**（已满足要求）：
  - `src/services/download_service.py`：format_map 已完整
  - `src/routers/ai.py`：note_id 已推送
  - `src/routers/settings.py`：serper 测试已实现
