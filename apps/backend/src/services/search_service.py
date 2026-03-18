import asyncio
import re
import json
from typing import Optional
import httpx
from sqlalchemy.orm import Session

_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}


async def search_videos(db: Session, query: str, platform: str = 'bilibili',
                        duration_filter: Optional[str] = None, sort: str = 'relevance', page: int = 1,
                        seed: Optional[int] = None) -> dict:
    results = []
    if platform in ('bilibili', 'all'):
        try:
            results.extend(await _search_bilibili(query, page, sort))
        except Exception as e:
            if platform == 'bilibili':
                raise ValueError(f'B 站搜索失败: {e}')
    if platform in ('youtube', 'all'):
        try:
            results.extend(await _search_youtube(query, page))
        except Exception as e:
            if platform == 'youtube':
                raise ValueError(f'YouTube 搜索失败: {e}')
    if platform in ('twitter', 'all'):
        try:
            results.extend(await _search_twitter(query, page))
        except Exception as e:
            if platform == 'twitter':
                raise ValueError(f'Twitter 搜索失败: {e}')
    if duration_filter:
        filtered = []
        for v in results:
            d = v.get('duration', 0)
            if duration_filter == 'short' and d < 240: filtered.append(v)
            elif duration_filter == 'medium' and 240 <= d <= 1200: filtered.append(v)
            elif duration_filter == 'long' and d > 1200: filtered.append(v)
        results = filtered
    if seed is not None:
        import random
        random.Random(seed).shuffle(results)
    return {'results': results, 'total': len(results), 'page': page}


async def _search_bilibili(query: str, page: int = 1, sort: str = 'relevance') -> list:
    order_map = {'newest': 'pubdate', 'views': 'click', 'relevance': 'totalrank'}
    url = 'https://api.bilibili.com/x/web-interface/search/type'
    params = {'search_type': 'video', 'keyword': query, 'page': page,
              'page_size': 20, 'order': order_map.get(sort, 'totalrank'), 'platform': 'pc', 'highlight': 1}
    headers = {**_HEADERS, 'Referer': 'https://www.bilibili.com/', 'Origin': 'https://www.bilibili.com',
               'Accept': 'application/json, text/plain, */*'}
    async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers=headers) as client:
        try: await client.get('https://www.bilibili.com/', timeout=5)
        except Exception: pass
        resp = await client.get(url, params=params)
    if resp.status_code == 412:
        await asyncio.sleep(2)
        async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers=headers) as client:
            try: await client.get('https://www.bilibili.com/', timeout=5)
            except Exception: pass
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
        if pic and not pic.startswith('http'): pic = 'https:' + pic
        results.append({'id': bvid or str(aid), 'title': title,
            'url': f'https://www.bilibili.com/video/{bvid}' if bvid else f'https://www.bilibili.com/video/av{aid}',
            'platform': 'bilibili', 'duration': _parse_duration(item.get('duration', '0:0')),
            'thumbnail_url': pic, 'author': item.get('author', ''),
            'published_at': str(item.get('pubdate', '')), 'view_count': item.get('play', 0)})
    return results


async def _search_youtube(query: str, page: int = 1) -> list:
    """YouTube 搜索：优先 Serper API（国内可用），无 Key 时降级直连"""
    serper_results = await _search_youtube_via_serper(query, page)
    if serper_results is not None:
        return serper_results
    return await _search_youtube_direct(query, page)


async def _search_youtube_via_serper(query: str, page: int = 1):
    """通过 Serper API 搜索 YouTube 视频，返回 None 表示未配置 Key"""
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
        return None
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                'https://google.serper.dev/videos',
                headers={'X-API-KEY': serper_key, 'Content-Type': 'application/json'},
                json={'q': f'{query} site:youtube.com', 'num': 12},
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
            })
        return results
    except Exception:
        return None


async def _search_youtube_direct(query: str, page: int = 1) -> list:
    """直连 YouTube（需科学上网），Serper 不可用时的降级方案"""
    search_url = f'https://www.youtube.com/results?search_query={query.replace(" ", "+")}'
    headers = {**_HEADERS, 'Accept-Language': 'en-US,en;q=0.9'}
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(search_url, headers=headers)
        if resp.status_code != 200:
            raise ConnectionError(f'YouTube 返回 HTTP {resp.status_code}')
        match = re.search(r'var ytInitialData = (\{.+?\});', resp.text, re.DOTALL)
        if not match:
            raise ValueError('无法解析 YouTube 搜索结果')
        data = json.loads(match.group(1))
        contents = data['contents']['twoColumnSearchResultsRenderer']['primaryContents']['sectionListRenderer']['contents']
        results = []
        for section in contents:
            for item in section.get('itemSectionRenderer', {}).get('contents', []):
                vr = item.get('videoRenderer')
                if not vr: continue
                video_id = vr.get('videoId', '')
                title = ''.join(r.get('text', '') for r in vr.get('title', {}).get('runs', []))
                duration_sec = _parse_duration(vr.get('lengthText', {}).get('simpleText', ''))
                thumbs = vr.get('thumbnail', {}).get('thumbnails', [])
                thumb = thumbs[-1]['url'] if thumbs else ''
                author = ''.join(r.get('text', '') for r in vr.get('ownerText', {}).get('runs', []))
                if video_id and title:
                    results.append({'id': video_id, 'title': title,
                        'url': f'https://www.youtube.com/watch?v={video_id}',
                        'platform': 'youtube', 'duration': duration_sec,
                        'thumbnail_url': thumb, 'author': author,
                        'published_at': '', 'view_count': 0})
                if len(results) >= 12: break
            if len(results) >= 12: break
        return results
    except Exception as e:
        raise ConnectionError(f'YouTube 直连失败（建议配置 Serper API Key）: {e}')


async def _search_twitter(query: str, page: int = 1) -> list:
    """搜索 Twitter/X 内容：放弃 site: 限制，改为宽泛搜索 + 关键词过滤，保证有兜底结果"""
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
        # 未配置 Serper Key，直接返回兜底跳转卡片
        twitter_search_url = f'https://twitter.com/search?q={query.replace(" ", "%20")}&f=video'
        return [{
            'id': 'twitter_search_no_key',
            'title': f'在 Twitter/X 上搜索「{query}」视频（点击跳转）',
            'url': twitter_search_url,
            'platform': 'twitter',
            'duration': 0,
            'thumbnail_url': '',
            'author': 'Twitter/X',
            'published_at': '',
            'view_count': 0,
        }]

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

    except Exception:
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


def _parse_duration(s: str) -> int:
    if not s: return 0
    parts = s.strip().split(':')
    try:
        if len(parts) == 2: return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 3: return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except ValueError: pass
    return 0
