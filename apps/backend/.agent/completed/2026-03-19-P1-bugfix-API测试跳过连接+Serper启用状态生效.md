# 2026-03-19-P1-bugfix-API测试跳过连接+Serper启用状态生效

## Git 信息
- 分支：`bugfix/backend-api-enabled-serper`

---

## B1：test-connection 加代理

### `src/routers/settings.py`
- 顶部加 `import os`，`_PROXY = os.environ.get('HTTP_PROXY') or os.environ.get('http_proxy')`
- 所有 `httpx.AsyncClient(timeout=10)` → `httpx.AsyncClient(timeout=10, proxy=_PROXY)`
- ConnectError/TimeoutException 错误提示改为「Key 已保存，连接测试失败（请检查代理或网络）」
- `GET /settings` 额外返回 `{short}_enabled` 字段

## B2：Serper 启用状态检查

### `src/services/search_service.py`
- `_search_youtube_via_serper`：读取 `api_key_serper_enabled`，停用时返回 `None`（降级直连）
- `_search_twitter`：同样读取 `api_key_serper_enabled`，停用时走 twscrape 或兜底卡片
- 修复手段：Windows StrReplace/Write 均因 CRLF 失败，最终用 Python 脚本在 Windows 侧读取替换写回

## 验收标准

- [x] 不挂梯子时，填入 DeepSeek Key 点「保存并测试」能保存成功，提示「Key 已保存，连接测试失败」
- [x] 挂梯子时，连接测试正常返回延迟
- [x] Serper Key 停用后，YouTube 搜索走直连，不调用 Serper
- [x] Serper Key 停用后，Twitter 搜索走 twscrape 或兜底卡片
- [x] Serper Key 启用后，搜索正常走 Serper

## 完成记录
- **完成时间**：2026-03-19
- **修改文件**：`src/routers/settings.py`、`src/services/search_service.py`
