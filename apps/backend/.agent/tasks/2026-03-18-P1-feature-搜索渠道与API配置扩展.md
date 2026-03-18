# 2026-03-18-P1-feature-后端搜索渠道与API配置扩展

## 任务信息
- **优先级**：P1
- **下发时间**：2026-03-18
- **预计工时**：2-3h

## Git 信息
- **工作分支**：`feature/backend-api-v2`
- 执行前：`git fetch origin && git checkout feature/backend-api-v2`

> ⛔ **严禁执行任何 git 操作**，git 由主 Agent 统一执行

---

## 子任务 1：搜索渠道新增 Twitter/X

**文件**：`src/services/search_service.py`

1. 在 `search_videos` 中新增 twitter 分支：
```python
if platform in ('twitter', 'all'):
    try:
        results.extend(await _search_twitter(query, page))
    except Exception as e:
        if platform == 'twitter':
            raise ValueError(f'Twitter 搜索失败: {e}')
```

2. 实现 `_search_twitter`（用 Serper API 搜索）：
```python
async def _search_twitter(query: str, page: int = 1) -> list:
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
        return []  # 未配置 Serper Key 时静默返回空
    search_query = f'site:twitter.com OR site:x.com {query}'
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            'https://google.serper.dev/search',
            headers={'X-API-KEY': serper_key, 'Content-Type': 'application/json'},
            json={'q': search_query, 'num': 10},
        )
    if resp.status_code != 200:
        return []
    data = resp.json()
    results = []
    for item in data.get('organic', []):
        link = item.get('link', '')
        if 'twitter.com' not in link and 'x.com' not in link:
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
    return results
```

**文件**：`src/routers/search.py`

在 `_to_camel` 中补充 twitter platform 支持（已通用，无需改动）。

---

## 子任务 2：API 配置扩展 — 新增更多 LLM，移除爬虫设置

**文件**：`src/routers/settings.py`

### 2.1 新增 API Key 存储支持

在 `get_settings` 的脱敏返回中，新增以下 key 的 has_xxx_key 字段：
- `api_key_openai`（OpenAI GPT）
- `api_key_groq`（Groq — 免费 Whisper + LLM）
- `api_key_gemini`（Google Gemini）

```python
# 在现有的 api_key_deepseek/zhipu/xunfei/serper 基础上，追加：
for key_name in ['api_key_openai', 'api_key_groq', 'api_key_gemini']:
    val = _get_setting(db, key_name)
    short = key_name.replace('api_key_', '')
    result[f'has_{short}_key'] = bool(val)
```

### 2.2 新增连接测试分支

在 `test_connection` 路由中，追加以下 provider 分支：

```python
elif provider == 'openai':
    key = _get_setting(db, 'api_key_openai')
    if not key:
        return {'code': 0, 'data': {'status': 'error', 'message': 'API Key 未配置'}}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            'https://api.openai.com/v1/models',
            headers={'Authorization': f'Bearer {key}'},
        )
    latency = int((time.time() - start) * 1000)
    if resp.status_code == 200:
        return {'code': 0, 'data': {'status': 'ok', 'latency_ms': latency}}
    elif resp.status_code == 401:
        return {'code': 0, 'data': {'status': 'error', 'message': 'API Key 无效（401）'}}
    else:
        return {'code': 0, 'data': {'status': 'error', 'message': f'HTTP {resp.status_code}'}}

elif provider == 'groq':
    key = _get_setting(db, 'api_key_groq')
    if not key:
        return {'code': 0, 'data': {'status': 'error', 'message': 'API Key 未配置'}}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            'https://api.groq.com/openai/v1/models',
            headers={'Authorization': f'Bearer {key}'},
        )
    latency = int((time.time() - start) * 1000)
    ok = resp.status_code == 200
    return {'code': 0, 'data': {'status': 'ok' if ok else 'error', 'latency_ms': latency}}

elif provider == 'gemini':
    key = _get_setting(db, 'api_key_gemini')
    if not key:
        return {'code': 0, 'data': {'status': 'error', 'message': 'API Key 未配置'}}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f'https://generativelanguage.googleapis.com/v1beta/models?key={key}',
        )
    latency = int((time.time() - start) * 1000)
    if resp.status_code == 200:
        return {'code': 0, 'data': {'status': 'ok', 'latency_ms': latency}}
    elif resp.status_code == 400:
        return {'code': 0, 'data': {'status': 'error', 'message': 'API Key 无效'}}
    else:
        return {'code': 0, 'data': {'status': 'error', 'message': f'HTTP {resp.status_code}'}}
```

### 2.3 移除爬虫相关设置

检查 `settings.py` 中是否有 `api_key_serper` 相关的「搜索爬虫」说明或单独接口，若有则移除。Serper Key 仅保留作为 Twitter 搜索的支撑，不在 API 配置页面单独展示（前端任务处理 UI 部分）。

---

## 验收标准

- [ ] `POST /api/search` 支持 `platform: 'twitter'`，配置了 Serper Key 后能返回结果
- [ ] `GET /api/settings` 返回 `has_openai_key`、`has_groq_key`、`has_gemini_key` 字段
- [ ] `POST /api/settings/test-connection` 支持 `provider: 'openai'`、`'groq'`、`'gemini'`
- [ ] 所有新增路由有外层 try/except
