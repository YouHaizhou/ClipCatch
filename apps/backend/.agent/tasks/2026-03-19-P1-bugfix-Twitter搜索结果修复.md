# 2026-03-19-P1-bugfix-Twitter搜索结果修复

## Git 信息
- 分支：`feature/backend-twitter-search-fix`
- 基于：`develop`

## 任务概览
Twitter 搜索只返回一个跳转卡片，没有实际视频内容。需要改善搜索策略，优先通过 twscrape 返回真实视频，Serper 补充，兜底改为更友好的多结果展示。

---

## 问题：Twitter 搜索只显示一个跳转卡片

### 问题现象
搜索 Twitter/X 视频时，搜索结果只显示一个「点击跳转」卡片，没有获取到实际的 Twitter 视频内容。

### 根因分析

`apps/backend/src/services/search_service.py` 的 `_search_twitter` 函数有以下问题：

1. **twscrape 路径**：已配置账号时调用 `search_twitter_videos`，该函数在 `twitter_service.py` 中实现。但 twscrape 搜索需要活跃账号，且视频推文中 `tweet.media.videos` 字段可能为空，导致视频 URL 获取失败但推文本身有效。

2. **Serper 路径**：`/videos` 接口加了 `twitter` 关键词但不限域名，返回的大量结果是非 Twitter 视频。`/search` 接口用 `site:twitter.com OR site:x.com` 但 Twitter 限制了爬虫，结果很少。

3. **兜底策略**：只返回 1 个卡片，用户体验差。

### 修复方案

文件：`apps/backend/src/services/search_service.py`
函数：`_search_twitter`

**核心改动**：
1. twscrape 路径：即使视频 URL 为空，只要推文有内容也返回（用推文页面 URL 作为跳转链接）
2. Serper `/videos` 接口：改为 `site:twitter.com OR site:x.com` 限定域名，过滤掉非 Twitter 结果
3. Serper `/search` 接口：保留作为补充
4. 兜底：当 twscrape 无账号且 Serper 无 Key 时，返回带描述的跳转卡片（现有逻辑保留）

### 完整替换代码

```python
async def _search_twitter(query: str, page: int = 1) -> list:
    """搜索 Twitter/X 视频内容"""
    from database import SessionLocal
    from models import Setting
    import json as _json
    db = SessionLocal()
    try:
        row = db.query(Setting).filter(Setting.key == 'api_key_serper').first()
        serper_key = _json.loads(row.value) if row and row.value else None
    finally:
        db.close()

    results = []

    # ---- 策略1: twscrape（已配置 Twitter 账号时优先）----
    try:
        from services.twitter_service import search_twitter_videos
        tw_results = await search_twitter_videos(query, limit=12)
        if tw_results:
            return tw_results
    except Exception:
        pass

    # ---- 策略2: Serper API ----
    if serper_key:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                # /videos 接口限定 twitter/x 域名
                resp1 = await client.post(
                    'https://google.serper.dev/videos',
                    headers={'X-API-KEY': serper_key, 'Content-Type': 'application/json'},
                    json={'q': f'{query} site:twitter.com OR site:x.com', 'num': 10},
                )
            if resp1.status_code == 200:
                for item in resp1.json().get('videos', []):
                    link = item.get('link', '')
                    if not link:
                        continue
                    results.append({
                        'id': link.split('/')[-1] or link,
                        'title': item.get('title', ''),
                        'url': link,
                        'platform': 'twitter',
                        'duration': _parse_duration(item.get('duration', '')),
                        'thumbnail_url': item.get('imageUrl', ''),
                        'author': item.get('channel', ''),
                        'published_at': item.get('date', ''),
                        'view_count': 0,
                    })

            # /search 接口补充
            if len(results) < 5:
                async with httpx.AsyncClient(timeout=15) as client:
                    resp2 = await client.post(
                        'https://google.serper.dev/search',
                        headers={'X-API-KEY': serper_key, 'Content-Type': 'application/json'},
                        json={'q': f'{query} site:twitter.com OR site:x.com', 'num': 10},
                    )
                if resp2.status_code == 200:
                    seen = {r['url'] for r in results}
                    for item in resp2.json().get('organic', []):
                        link = item.get('link', '')
                        if not link or link in seen:
                            continue
                        results.append({
                            'id': link.split('/')[-1] or link,
                            'title': item.get('title', ''),
                            'url': link,
                            'platform': 'twitter',
                            'duration': 0,
                            'thumbnail_url': item.get('imageUrl', ''),
                            'author': '',
                            'published_at': item.get('date', ''),
                            'view_count': 0,
                        })
        except Exception:
            pass

    # ---- 策略3: 兜底跳转卡片 ----
    if not results:
        twitter_search_url = f'https://twitter.com/search?q={query.replace(" ", "%20")}&f=video'
        results.append({
            'id': 'twitter_search',
            'title': f'在 Twitter/X 上搜索「{query}」视频（点击跳转）',
            'url': twitter_search_url,
            'platform': 'twitter',
            'duration': 0,
            'thumbnail_url': '',
            'author': 'Twitter/X',
            'published_at': '',
            'view_count': 0,
        })

    return results[:12]
```

同时检查 `twitter_service.py` 的 `search_twitter_videos` 函数：
即使推文没有视频 URL（`tweet.media.videos` 为空），也应返回推文本身（用推文页面链接），这样用户至少能跳转到推文页面查看。

修改 `search_twitter_videos` 中的过滤逻辑：
```python
# 原来：只有 video_url 不为空才追加
# 改为：只要推文有内容就追加，video_url 为空时用推文页面 URL
results.append({
    'id': str(tweet.id),
    'title': title or f'@{tweet.user.username} 的推文',
    'url': tweet_url,
    'platform': 'twitter',
    'duration': duration,
    'thumbnail_url': thumbnail_url,
    'author': f'@{tweet.user.username}',
    'published_at': tweet.date.strftime('%Y-%m-%d') if tweet.date else '',
    'view_count': tweet.viewCount or 0,
    '_direct_video_url': video_url,  # 空字符串时 yt-dlp 会从 tweet_url 提取
})
```

### 验收标准
- [ ] 已配置 Twitter 账号时，搜索返回真实推文列表（不止1个）
- [ ] 未配置账号但有 Serper Key 时，返回 Twitter 域名的视频结果
- [ ] 两者都无时，返回兜底跳转卡片
- [ ] 不再只显示单个跳转卡片（有账号/有 Serper Key 的情况下）

---

## 完成记录
（子 Agent 完成后填写）
