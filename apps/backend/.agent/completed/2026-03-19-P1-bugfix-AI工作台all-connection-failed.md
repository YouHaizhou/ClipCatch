# 2026-03-19-P1-bugfix-AI工作台all-connection-failed

## Git 信息
- 分支：`bugfix/backend-ai-llm-proxy`

---

## 修复内容

### `src/services/llm_service.py`
- 顶部加 `import os`，读取 `_PROXY = os.environ.get('HTTP_PROXY') or os.environ.get('http_proxy')`
- `httpx.AsyncClient(timeout=120)` → `httpx.AsyncClient(timeout=120, proxy=_PROXY)` 使 DeepSeek API 走代理
- 外层增加 `try/except httpx.ConnectError` 和 `httpx.TimeoutException`，给出中文友好提示：
  - ConnectError → `'DeepSeek API 连接失败，请检查网络或代理配置'`
  - TimeoutException → `'DeepSeek API 连接超时，请检查网络或代理配置'`
- `_get_api_key` 未配置时抛 `ValueError('DeepSeek API Key 未配置，请在设置页填写')`，由上层 `_run_ai_pipeline` except 捕获推送前端（已确认链路完整）

## 验收标准

- [x] 挂梯子时，AI 工作台能正常完成 STT → LLM → 笔记生成全流程
- [x] 不挂梯子时，错误提示为「DeepSeek API 连接失败，请检查网络或代理」
- [x] 未配置 DeepSeek Key 时，前端显示「DeepSeek API Key 未配置，请在设置页填写」

## 完成记录
- **完成时间**：2026-03-19
- **修改文件**：`src/services/llm_service.py`
