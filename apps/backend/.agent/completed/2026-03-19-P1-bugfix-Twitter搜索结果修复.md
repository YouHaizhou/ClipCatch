# 2026-03-19-P1-bugfix-Twitter搜索结果修复

## Git 信息
- 分支：`feature/backend-twitter-search-fix`
- 基于：`develop`

---

## B1：Twitter 搜索只返回一个跳转卡片

### `src/services/search_service.py`
- 策略1 query 从 `{query} twitter`（宽泛）改为 `{query} site:twitter.com OR site:x.com`（限定域名）
- 移除 `is_twitter` 过滤判断，改为直接 append（已通过 site: 限定，无需再过滤）
- platform 统一设为 `'twitter'`

### `src/services/twitter_service.py`
- `search_twitter_videos` 函数中：无论 `video_url` 是否为空，都 append 推文到结果列表
- 注释说明：`_direct_video_url` 为空时由 yt-dlp 从推文页面提取视频

---

## B2：DELETE /api/twitter/account 接口修复

### `src/routers/twitter.py`
- `remove_account` 函数签名从 `body: dict` 改为 `request: Request`
- 使用 `await request.json()` 手动解析 body（FastAPI DELETE 请求不自动解析 body）
- 增加 json 解析异常兜底 `except Exception: body = {}`
- 返回格式补充 `{'success': True, 'message': ...}` 符合验收标准

---

## 验收标准

- [x] 已配置 Twitter 账号时，搜索返回多条推文（不止 1 个）
- [x] 未配置账号但有 Serper Key 时，返回 Twitter 域名的视频/推文结果（不只是兜底卡片）
- [x] 两者都无时，兜底单卡片保留
- [x] DELETE `/api/twitter/account` 能正确接收 `{"username": "xxx"}` 并删除账号
- [x] 返回 `{"code": 0, "data": {"success": true, "message": "..."}}`

---

## 完成记录

- **完成时间**：2026-03-19
- **实际工时**：约 0.5h
- **修改文件**：
  - `src/services/search_service.py`：策略1 改用 site: 限定，移除 is_twitter 过滤
  - `src/services/twitter_service.py`：无视频直链也保留推文
  - `src/routers/twitter.py`：remove_account 改用 Request 解析 body
