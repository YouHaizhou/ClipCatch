# 2026-03-19-P1-bugfix-AI工作台all-connection-failed

## Git 信息
- 分支：`bugfix/backend-ai-llm-proxy`
- 基于：`develop`

## 任务概览
AI 工作台点击「开始分析」后显示「处理失败，all connection attempts failed」，LLM 调用走 DeepSeek API 无代理直连失败。

## 问题现象
AI 工作台选择视频，点击「开始分析」，SSE 进度条停在「extracting」或直接报 `all connection attempts failed`。

## 根因
`services/llm_service.py` 第 62 行：
```python
async with httpx.AsyncClient(timeout=120) as client:
```
没有配置代理，DeepSeek API（`api.deepseek.com`）无梯子时连接失败，抛出 `ConnectError: All connection attempts failed`。

`main.py` 启动时已设置 `HTTP_PROXY=http://127.0.0.1:7897`，但 `httpx.AsyncClient` 需要显式传入 proxy 参数才会使用。

## 代码定位
**文件**：`apps/backend/src/services/llm_service.py`

修改 `stream_summary` 函数中的 `httpx.AsyncClient` 调用，加入代理：
```python
import os
proxy = os.environ.get('HTTP_PROXY') or os.environ.get('http_proxy')
async with httpx.AsyncClient(timeout=120, proxy=proxy) as client:
```

同时在文件顶部加 `import os`（如未导入）。

另外检查 `_get_api_key` 函数：若 Key 未配置抛 `ValueError`，应被上层 `_run_ai_pipeline` 的 `except Exception` 捕获并通过 `_push` 推送 `error` 事件给前端，确认这条链路完整（无需修改，确认即可）。

## 验收标准
- [ ] 挂梯子时，AI 工作台能正常完成 STT → LLM → 笔记生成全流程
- [ ] 不挂梯子时，错误提示改为「DeepSeek API 连接失败，请检查网络或代理」而不是原始英文报错
- [ ] 未配置 DeepSeek Key 时，前端显示「DeepSeek API Key 未配置，请在设置页填写」

## 完成记录
（子 Agent 完成后填写）
