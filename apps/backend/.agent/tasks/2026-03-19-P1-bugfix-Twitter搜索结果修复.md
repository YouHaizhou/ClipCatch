# 2026-03-19-P1-bugfix-Twitter搜索结果修复

## Git 信息
- 分支：`feature/backend-twitter-search-fix`
- 基于：`develop`

## 任务概览
2 个后端问题：
1. Twitter 视频搜索只返回单个跳转卡片，无实际视频
2. 删除 Twitter 账号接口响应格式确认

---

## B1：Twitter 搜索只返回一个跳转卡片

### 问题现象
搜索 Twitter/X 视频时，结果只显示一个「点击跳转」卡片，没有实际视频内容。

### 根因
`apps/backend/src/services/search_service.py` 的 `_search_twitter` 函数存在两个问题：

1. **Serper `/videos` 接口**：当前用 `twitter` 关键词但不限域名，导致返回大量非 Twitter 视频，过滤后数量很少甚至为零，直接触发兜底逻辑（单个跳转卡片）。应改为 `site:twitter.com OR site:x.com` 限定域名。

2. **twscrape 路径**：`search_twitter_videos`（`twitter_service.py`）中，当推文有内容但 `tweet.media.videos` 为空时，推文被跳过。应改为：即使无视频直链也保留推文，用推文页面 URL 作为跳转地址，`_direct_video_url` 字段留空，让 yt-dlp 从推文页面提取。

### 代码定位

**文件 1**：`apps/backend/src/services/search_service.py`
- 函数 `_search_twitter`
- Serper `/videos` 接口调用：`json={'q': f'{query} twitter', 'num': 10}` → 改为 `json={'q': f'{query} site:twitter.com OR site:x.com', 'num': 10}`
- 过滤逻辑：移除 `is_twitter` 判断，只要是 `/videos` 接口返回的结果直接加入，不再过滤非 twitter 域名（已通过 site: 限定）

**文件 2**：`apps/backend/src/services/twitter_service.py`
- 函数 `search_twitter_videos`
- 当前在循环体内，只有 `video_url` 不为空才 `results.append(...)`，改为无论是否有 `video_url` 都 append，确保推文列表有内容

### 验收标准
- [ ] 已配置 Twitter 账号时，搜索返回多条推文（不止 1 个）
- [ ] 未配置账号但有 Serper Key 时，返回 Twitter 域名的视频/推文结果（不只是兜底卡片）
- [ ] 两者都无时，兜底单卡片保留（现有逻辑不动）

---

## B2：删除 Twitter 账号接口响应格式确认

### 问题现象
前端删除账号报 `failed to fetch`（前端 F1 已修复 hardcode URL 问题），但需确认后端 DELETE 路由响应格式正确。

### 根因
`apps/backend/src/routers/twitter.py` 的 `DELETE /api/twitter/account` 路由当前接收 `body: dict`，FastAPI 默认 DELETE 请求不解析 body，可能导致 `username` 读不到。

### 代码定位
- `apps/backend/src/routers/twitter.py`：`remove_account` 函数
- 确认 `body: dict` 能正确接收 DELETE 请求的 JSON body（FastAPI 需要显式声明 `Request` 或用 `Body()`）
- 若有问题，改为用 `Request` 接收：
  ```python
  from fastapi import Request
  @router.delete('/twitter/account')
  async def remove_account(request: Request):
      body = await request.json()
      username = body.get('username', '').strip()
  ```

### 验收标准
- [ ] DELETE `/api/twitter/account` 能正确接收 `{"username": "xxx"}` 并删除账号
- [ ] 返回 `{"code": 0, "data": {"success": true, "message": "..."}}`

---

## 完成记录
（子 Agent 完成后填写）
