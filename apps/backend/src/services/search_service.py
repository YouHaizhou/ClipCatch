import asyncio
import re
import json
import os
import time
from typing import Optional
import httpx
from sqlalchemy.orm import Session

# ============================================================
# 搜索结果缓存 - DNS TTL 思路: TTL 300s + LRU 淘汰(最多 100 条)
# ============================================================
_search_cache: dict[str, tuple[list, float]] = {}
_CACHE_TTL = 300
_CACHE_MAX = 100


def _cache_key(query: str, platform: str, page: int, duration_filter, sort: str) -> str:
    return f"{platform}:{sort}:{duration_filter}:{page}:{query.lower().strip()}"


def _cache_get(key: str):
    entry = _search_cache.get(key)
    if entry is None:
        return None
    results, expire_ts = entry
    if time.time() < expire_ts:
        _search_cache.pop(key)
        _search_cache[key] = (results, expire_ts)
        return results
    _search_cache.pop(key, None)
    return None


def _cache_set(key: str, results: list) -> None:
    if key in _search_cache:
        _search_cache.pop(key)
    elif len(_search_cache) >= _CACHE_MAX:
        oldest_key = next(iter(_search_cache))
        _search_cache.pop(oldest_key)
    _search_cache[key] = (results, time.time() + _CACHE_TTL)


def _get_proxy() -> str | None:
    proxy = (os.environ.get('VIDEOAI_PROXY') or os.environ.get('TWS_PROXY')
             or os.environ.get('HTTP_PROXY') or os.environ.get('http_proxy')
             or os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy'))
    if proxy:
        return proxy
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                r'Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings') as key:
            enabled, _ = winreg.QueryValueEx(key, 'ProxyEnable')
            if enabled:
                server, _ = winreg.QueryValueEx(key, 'ProxyServer')
                if server:
                    s = str(server)
                    if '://' not in s:
                        s = 'http://' + s
                    return s
    except Exception:
        pass
    return None


def _make_client(use_proxy: bool = False, **kwargs) -> httpx.AsyncClient:
    if use_proxy:
        proxy = _get_proxy()
        if proxy:
            kwargs['trust_env'] = False
            kwargs.setdefault('proxy', proxy)
        else:
            kwargs['trust_env'] = True
    else:
        kwargs['trust_env'] = False
    return httpx.AsyncClient(**kwargs)


def _parse_duration(s: str) -> int:
    if not s:
        return 0
    s = str(s).strip()
    m = re.match(r'^(\d+):(\d+)(?::(\d+))?$', s)
    if m:
        parts = [int(x) for x in m.groups() if x is not None]
        if len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
        return parts[0] * 60 + parts[1]
    m2 = re.match(r'(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?', s)
    if m2:
        h = int(m2.group(1) or 0)
        m_ = int(m2.group(2) or 0)
        sec = int(m2.group(3) or 0)
        return h * 3600 + m_ * 60 + sec
    try:
        return int(s)
    except Exception:
        return 0


_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}


def _get_yt_data_api_key(db):
    from models import Setting
    row = db.query(Setting).filter(Setting.key == 'api_key_youtube_data').first()
    return json.loads(row.value) if row and row.value else None


def _get_serper_config(db):
    from models import Setting
    row = db.query(Setting).filter(Setting.key == 'api_key_serper').first()
    serper_key = json.loads(row.value) if row and row.value else None
    row_en = db.query(Setting).filter(Setting.key == 'api_key_serper_enabled').first()
    enabled = json.loads(row_en.value) if row_en and row_en.value is not None else True
    return serper_key, enabled


async def search_videos(
    db,
    query: str,
    platform: str = 'all',
    duration_filter=None,
    sort: str = 'relevance',
    page: int = 1,
    seed=None,
) -> dict:
    # ---- 缓存读取（seed 随机化请求不走缓存）----
    cache_key = None
    if seed is None:
        cache_key = _cache_key(query, platform, page, duration_filter, sort)
        cached = _cache_get(cache_key)
        if cached is not None:
            return {'results': cached, 'total': len(cached), 'page': page, 'from_cache': True}

    results = []

    if platform in ('bilibili', 'all'):
        try:
            results.extend(await _search_bilibili(query, page, sort))
        except Exception as e:
            if platform == 'bilibili':
                raise ValueError(f'B 站搜索失败: {e}')

    if platform in ('youtube', 'all'):
        try:
            results.extend(await _search_youtube(db, query, page))
        except Exception as e:
            if platform == 'youtube':
                raise ValueError(f'YouTube 搜索失败: {e}')

    if platform in ('twitter', 'all'):
        try:
            results.extend(await _search_twitter(db, query, page))
        except Exception as e:
            if platform == 'twitter':
                raise ValueError(f'Twitter 搜索失败: {e}')

    if duration_filter:
        filtered = []
        for v in results:
            d = v.get('duration', 0)
            if duration_filter == 'short' and d < 240:
                filtered.append(v)
            elif duration_filter == 'medium' and 240 <= d <= 1200:
                filtered.append(v)
            elif duration_filter == 'long' and d > 1200:
                filtered.append(v)
        results = filtered

    if seed is not None:
        import random
        random.Random(seed).shuffle(results)

    # ---- 缓存写入 ----
    if cache_key is not None and results:
        _cache_set(cache_key, results)

    return {'results': results, 'total': len(results), 'page': page}

async def _search_bilibili(query: str, page: int = 1, sort: str = 'relevance') -> list:
    """B站搜索 — 国内平台，直连不走代理"""
    order_map = {'newest': 'pubdate', 'views': 'click', 'relevance': 'totalrank'}
    url = 'https://api.bilibili.com/x/web-interface/search/type'
    params = {
        'search_type': 'video', 'keyword': query, 'page': page,
        'page_size': 50, 'order': order_map.get(sort, 'totalrank'),
        'platform': 'pc', 'highlight': 1,
    }
    headers = {
        **_HEADERS,
        'Referer': 'https://www.bilibili.com/',
        'Origin': 'https://www.bilibili.com',
        'Accept': 'application/json, text/plain, */*',
    }
    async with _make_client(use_proxy=False, timeout=15, follow_redirects=True, headers=headers) as client:
        try:
            await client.get('https://www.bilibili.com/', timeout=5)
        except Exception:
            pass
        resp = await client.get(url, params=params)

    if resp.status_code == 412:
        await asyncio.sleep(2)
        async with _make_client(use_proxy=False, timeout=15, follow_redirects=True, headers=headers) as client:
            try:
                await client.get('https://www.bilibili.com/', timeout=5)
            except Exception:
                pass
            resp = await client.get(url, params=params)

    if resp.status_code != 200:
        raise ConnectionError(f'B 站 API 返回 HTTP {resp.status_code}')
    data = resp.json()
    if data.get('code') != 0:
        raise ConnectionError(f'B 站 API 错误: {data.get("message", "unknown")}')

    items = data.get('data', {}).get('result', []) or []
    results = []
    for item in items:
        import html as _html
        title = _html.unescape(re.sub(r'<[^>]+>', '', item.get('title', '')))
        bvid = item.get('bvid', '')
        aid = item.get('aid', '')
        pic = item.get('pic', '')
        if pic and not pic.startswith('http'):
            pic = 'https:' + pic
        results.append({
            'id': bvid or str(aid),
            'title': title,
            'url': f'https://www.bilibili.com/video/{bvid}' if bvid else f'https://www.bilibili.com/video/av{aid}',
            'platform': 'bilibili',
            'duration': _parse_duration(item.get('duration', '0:0')),
            'thumbnail_url': pic,
            'author': item.get('author', ''),
            'published_at': str(item.get('pubdate', '')),
            'view_count': item.get('play', 0),
            'source_reliability': 'contract',
            'source_name': 'Bilibili API',
        })
    return results


async def _search_youtube(db, query: str, page: int = 1) -> list:
    """YouTube 搜索降级链：Serper -> YouTube Data API v3 -> yt-dlp 直连 -> fallback"""
    serper_key, serper_enabled = _get_serper_config(db)
    if serper_key and serper_enabled:
        serper_results = await _search_youtube_via_serper(serper_key, query, page)
        if serper_results:
            return serper_results
    yt_key = _get_yt_data_api_key(db)
    if yt_key:
        yt_results = await _search_youtube_via_data_api(yt_key, query, page)
        if yt_results:
            return yt_results
    return await _search_youtube_direct(query, page)


async def _search_youtube_via_serper(serper_key: str, query: str, page: int = 1):
    try:
        async with _make_client(use_proxy=False, timeout=15) as client:
            resp = await client.post(
                'https://google.serper.dev/videos',
                headers={'X-API-KEY': serper_key, 'Content-Type': 'application/json'},
                json={'q': f'{query} site:youtube.com', 'num': 20},
            )
        if resp.status_code != 200:
            return None
        data = resp.json()
        results = []
        for item in data.get('videos', []):
            link = item.get('link', '')
            if 'youtube.com/watch' not in link and 'youtu.be' not in link:
                continue
            vid_match = re.search(r'(?:v=|youtu\.be/)([\w-]{11})', link)
            video_id = vid_match.group(1) if vid_match else link
            results.append({
                'id': video_id,
                'title': item.get('title', ''),
                'url': link,
                'platform': 'youtube',
                'duration': _parse_duration(item.get('duration', '')),
                'thumbnail_url': item.get('imageUrl', ''),
                'author': item.get('channel', ''),
                'published_at': item.get('date', ''),
                'view_count': 0,
                'source_reliability': 'contract',
                'source_name': 'Serper',
            })
        return results if results else None
    except Exception:
        return None


async def _search_youtube_via_data_api(yt_key: str, query: str, page: int = 1):
    try:
        async with _make_client(use_proxy=False, timeout=15) as client:
            resp = await client.get(
                'https://www.googleapis.com/youtube/v3/search',
                params={'part': 'snippet', 'q': query, 'type': 'video',
                        'maxResults': 20, 'key': yt_key},
            )
        if resp.status_code != 200:
            return None
        data = resp.json()
        results = []
        for item in data.get('items', []):
            video_id = item.get('id', {}).get('videoId', '')
            snippet = item.get('snippet', {})
            if not video_id:
                continue
            results.append({
                'id': video_id,
                'title': snippet.get('title', ''),
                'url': f'https://www.youtube.com/watch?v={video_id}',
                'platform': 'youtube',
                'duration': 0,
                'thumbnail_url': snippet.get('thumbnails', {}).get('high', {}).get('url', ''),
                'author': snippet.get('channelTitle', ''),
                'published_at': snippet.get('publishedAt', ''),
                'view_count': 0,
                'source_reliability': 'contract',
                'source_name': 'YouTube Data API',
            })
        return results if results else None
    except Exception:
        return None

async def _search_youtube_direct(query: str, page: int = 1) -> list:
    """直连 YouTube（国外，需科学上网），Serper 不可用时的降级方案"""
    search_url = 'https://www.youtube.com/results?search_query=' + query.replace(' ', '+')
    headers = {**_HEADERS, 'Accept-Language': 'en-US,en;q=0.9'}
    try:
        async with _make_client(use_proxy=True, timeout=15, follow_redirects=True) as client:
            resp = await client.get(search_url, headers=headers)
        if resp.status_code != 200:
            raise ConnectionError(f'YouTube 返回 HTTP {resp.status_code}')
        match = re.search(r'var ytInitialData = (\{.+?\});', resp.text, re.DOTALL)
        if not match:
            raise ValueError('无法解析 YouTube 搜索结果')
        data = json.loads(match.group(1))
        contents = (
            data['contents']['twoColumnSearchResultsRenderer']
            ['primaryContents']['sectionListRenderer']['contents']
        )
        results = []
        for section in contents:
            for item in section.get('itemSectionRenderer', {}).get('contents', []):
                vr = item.get('videoRenderer')
                if not vr:
                    continue
                video_id = vr.get('videoId', '')
                title = ''.join(r.get('text', '') for r in vr.get('title', {}).get('runs', []))
                duration_sec = _parse_duration(vr.get('lengthText', {}).get('simpleText', ''))
                thumbs = vr.get('thumbnail', {}).get('thumbnails', [])
                thumb = thumbs[-1]['url'] if thumbs else ''
                author = ''.join(r.get('text', '') for r in vr.get('ownerText', {}).get('runs', []))
                if video_id and title:
                    results.append({
                        'id': video_id, 'title': title,
                        'url': f'https://www.youtube.com/watch?v={video_id}',
                        'platform': 'youtube', 'duration': duration_sec,
                        'thumbnail_url': thumb, 'author': author,
                        'published_at': '', 'view_count': 0,
                        'source_reliability': 'heuristic',
                        'source_name': 'yt-dlp',
                    })
                if len(results) >= 20:
                    break
            if len(results) >= 20:
                break
        return results
    except Exception:
        yt_url = 'https://www.youtube.com/results?search_query=' + query.replace(' ', '+')
        return [{'id': 'youtube_search', 'title': f'在 YouTube 上搜索「{query}」（点击跳转，需梯子）',
                 'url': yt_url, 'platform': 'youtube', 'duration': 0,
                 'thumbnail_url': '', 'author': 'YouTube', 'published_at': '', 'view_count': 0,
                 'source_reliability': 'heuristic', 'source_name': 'fallback'}]


async def _search_twitter(db, query: str, page: int = 1) -> list:
    """搜索 Twitter/X：优先 Serper（国内直连），降级代理直连，最终返回跳转卡片"""
    serper_key, serper_enabled = _get_serper_config(db)
    if not serper_key or not serper_enabled:
        proxy_results = await _search_twitter_direct(query, page)
        if proxy_results:
            return proxy_results
        return [_twitter_fallback_card(query)]
    results = []
    try:
        async with _make_client(use_proxy=False, timeout=15) as client:
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
                    'source_reliability': 'contract',
                    'source_name': 'Serper',
                })

        if len(results) < 5:
            async with _make_client(use_proxy=False, timeout=15) as client:
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
                        'source_reliability': 'contract',
                        'source_name': 'Serper',
                    })

        if not results:
            results.append(_twitter_fallback_card(query))

    except Exception:
        return [_twitter_fallback_card(query, suffix='_err')]

    return results[:12]


def _twitter_fallback_card(query: str, suffix: str = '') -> dict:
    url = f'https://twitter.com/search?q={query.replace(" ", "%20")}&f=video'
    return {
        'id': f'twitter_search{suffix}',
        'title': f'在 Twitter/X 上搜索「{query}」视频（点击跳转）',
        'url': url,
        'platform': 'twitter',
        'duration': 0,
        'thumbnail_url': '',
        'author': 'Twitter/X',
        'published_at': '',
        'view_count': 0,
        'source_reliability': 'heuristic',
        'source_name': 'fallback',
    }


async def _search_twitter_direct(query: str, page: int = 1) -> list:
    """Twitter/X Guest Token API 已于 2023-2024 年永久下线（404/403），此路径不可用。
    诊断结论：Stage 3 HTTP 404 — 平台策略问题，非代码 bug，无免费可用路径。
    请配置 Serper API Key 使用 Serper 搜索 Twitter 视频。
    """
    return []
