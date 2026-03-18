# 2026-03-18-P1-bugfix-Twitter搜索第二次修复

## ⚠️ 上一轮已下发任务但未解决

上一轮（第三轮）已下发 Twitter 修复方案（改用 Serper `/videos` 接口 + `/search` 降级），用户反馈**本轮仍然显示「未找到相关视频」**。说明 Serper `/videos` 对 `site:twitter.com` 查询实际命中率极低，需要彻底改变搜索策略。

## Git 信息
- **工作分支**：`feature/backend-api-v2`
- 执行前：`git fetch origin && git checkout feature/backend-api-v2`

> ⛔ **严禁执行任何 git 操作**

---

## 问题：Twitter 搜索持续返回空（两轮未解决）

### 问题现象
搜索 Twitter/X 视频时，一直显示「未找到相关视频」。上一轮修复后仍然无效。

### 根因（深度分析）

1. Serper `/videos` 接口对 `site:twitter.com` 的 Google 视频索引极少，几乎无结果
2. `/search` 降级时 Twitter 链接过滤条件 `'twitter.com' in link` 依然命中率低
3. **根本策略错误**：用 `site:` 限制搜 Twitter 视频本来就是死路，Google 对 Twitter 索引极差

### 修复方案（策略彻底调整）

**新策略**：不用 `site:` 限制，改为关键词 + `twitter` 宽泛搜索，放宽过滤条件，同时增加 `x.com` 短链识别。若两个 Serper 接口都无结果，构造 Twitter 搜索页直链作为兜底展示。

**文件**：`src/services/search_service.py`

完整替换 `_search_twitter` 函数：

```python
async def _search_twitter(query: str, page: int = 1) -> list:
    """搜索 Twitter/X 内容：放弃 site: 限制，改为宽泛搜索 + 关键词过滤"""
    from database import SessionLocal
    from models import Setting
    import json as _json
    db = SessionLocal()
    try:
        row = db.query(Setting).filter(Setting.key == 'api_key_serper').first()
        serper_key = _json.loads(row.value) if row and row.value else None
    finally:
        db.close()
    if not serper_key:
        return []

    results = []
    try:
        # 策略1: /videos 接口，不加 site: 限制，加 twitter 关键词
        async with httpx.AsyncClient(timeout=15) as client:
            resp1 = await client.post(
                'https://google.serper.dev/videos',
                headers={'X-API-KEY': serper_key, 'Content-Type': 'application/json'},
                json={'q': f'{query} twitter', 'num': 10},
            )
        if resp1.status_code == 200:
            for item in resp1.json().get('videos', []):
                link = item.get('link', '')
                if not link:
                    continue
                is_twitter = any(d in link for d in ['twitter.com', 'x.com', 't.co'])
                results.append({
                    'id': link.split('/')[-1] or link,
                    'title': item.get('title', ''),
                    'url': link,
                    'platform': 'twitter' if is_twitter else 'other',
                    'duration': _parse_duration(item.get('duration', '')),
                    'thumbnail_url': item.get('imageUrl', ''),
                    'author': item.get('channel', ''),
                    'published_at': item.get('date', ''),
                    'view_count': 0,
                })

        # 策略2: /search 接口补充，放宽筛选（不再只要 twitter.com）
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

        # 策略3: 两个接口都无结果时，构造 Twitter 搜索结果作为兜底
        if not results:
            twitter_search_url = f'https://twitter.com/search?q={query.replace(" ", "%20")}&f=video'
            results.append({
                'id': 'twitter_search',
                'title': f'在 Twitter/X 上搜索「{query}」视频',
                'url': twitter_search_url,
                'platform': 'twitter',
                'duration': 0,
                'thumbnail_url': '',
                'author': 'Twitter/X',
                'published_at': '',
                'view_count': 0,
            })

    except Exception as e:
        # 即使出错也返回兜底结果
        twitter_search_url = f'https://twitter.com/search?q={query.replace(" ", "%20")}&f=video'
        return [{
            'id': 'twitter_search_fallback',
            'title': f'在 Twitter/X 上搜索「{query}」',
            'url': twitter_search_url,
            'platform': 'twitter',
            'duration': 0,
            'thumbnail_url': '',
            'author': 'Twitter/X',
            'published_at': '',
            'view_count': 0,
        }]

    return results[:12]
```

### 同步修复：ai.py 的 done 事件字段名（snake_case vs camelCase）

**文件**：`src/routers/ai.py`，`_run_ai_pipeline` 函数中的 done 事件推送：

```python
# 修改前：
_push(task_id, {
    'type': 'done',
    'note_id': note.id,
    'word_count': word_count,
})

# 修改后（同时提供 camelCase 和 snake_case，前端兼容）：
_push(task_id, {
    'type': 'done',
    'note_id': note.id,
    'noteId': note.id,
    'word_count': word_count,
    'wordCount': word_count,
})
```

### 验收标准

- [ ] 搜索 Twitter 平台时，无论是否有 Serper 结果，不再显示「未找到相关视频」
- [ ] 有 Serper 结果时显示实际视频卡片
- [ ] 无 Serper 结果时显示「在 Twitter/X 上搜索」兜底卡片，点击可跳转
- [ ] ai.py done 事件同时包含 `noteId`/`note_id` 和 `wordCount`/`word_count`
