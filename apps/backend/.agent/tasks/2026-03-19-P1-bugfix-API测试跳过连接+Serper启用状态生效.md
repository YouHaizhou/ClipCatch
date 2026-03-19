# 2026-03-19-P1-bugfix-API测试跳过连接+Serper启用状态生效

## Git 信息
- 分支：`bugfix/backend-api-enabled-serper`
- 基于：`develop`

## 任务概览
两个后端问题：
1. 保存 API Key 时强制 test-connection，无梯子时报网络不可达，导致 Key 无法保存
2. Serper Key 停用后搜索仍调用 Serper（`_search_youtube_via_serper` 和 `_search_twitter` 未读取 enabled 状态）

---

## B1：保存 API Key 不应强制测试连接

### 问题现象
在「AI 对话模型」Tab 填入 DeepSeek/OpenAI 等 Key 点击「保存并测试」，后端 `test-connection` 向 api.deepseek.com 发请求，无梯子时 ConnectError 导致前端显示「网络不可达」，Key 实际上已保存到数据库但前端误以为失败。

### 根因
`routers/settings.py` `test-connection` 接口用 `httpx.AsyncClient(timeout=10)` 不走代理，直连外网失败。

### 代码定位
- `apps/backend/src/routers/settings.py`：`test_connection` 函数
- 所有 `async with httpx.AsyncClient(timeout=10)` 改为 `async with httpx.AsyncClient(timeout=10, proxy=os.environ.get('HTTP_PROXY'))` 
- 文件顶部加 `import os`（如果还没有）
- B 站搜索：`services/search_service.py` 的 `_search_bilibili` 函数，`_make_client` 已支持代理，确认 `_PROXY` 变量在模块加载时已读取 `os.environ.get('HTTP_PROXY')`（当前是模块级变量，main.py 已在启动时设置 HTTP_PROXY，应已生效，若仍失败则改为函数内动态读取）

### 验收标准
- [ ] 不挂梯子时，填入 DeepSeek Key 点「保存并测试」能保存成功（即使连接测试失败也应提示「Key 已保存，连接测试失败」而不是报网络错误）
- [ ] 挂梯子时，连接测试正常返回延迟
- [ ] B 站搜索走代理，不报网络不可达

---

## B2：Serper Key 停用后搜索仍调用 Serper

### 问题现象
在设置页把 Serper Key 设为「已停用」，搜索 YouTube/Twitter 时仍走 Serper 接口。

### 根因
`services/search_service.py` 中 `_search_youtube_via_serper` 和 `_search_twitter` 只检查 `api_key_serper` 是否有值，没有检查 `api_key_serper_enabled` 字段。

### 代码定位
**文件**：`apps/backend/src/services/search_service.py`

`_search_youtube_via_serper` 函数，在读取 `serper_key` 后加 enabled 检查：
```python
row_enabled = db.query(Setting).filter(Setting.key == 'api_key_serper_enabled').first()
enabled = _json.loads(row_enabled.value) if row_enabled and row_enabled.value else True
if not serper_key or not enabled:
    return None
```

`_search_twitter` 函数，找到读取 `serper_key` 的位置，同样加 enabled 检查（模式同上）。

### 验收标准
- [ ] Serper Key 停用后，YouTube 搜索走直连或返回跳转卡片，不调用 Serper
- [ ] Serper Key 停用后，Twitter 搜索走 twscrape，不调用 Serper
- [ ] Serper Key 启用后，搜索正常走 Serper

---

## 完成记录
（子 Agent 完成后填写）
