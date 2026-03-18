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
    search_url = f'https://www.youtube.com/results?search_query={query.replace(" ", "+")}'
    headers = {**_HEADERS, 'Accept-Language': 'en-US,en;q=0.9'}
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        resp = await client.get(search_url, headers=headers)
    if resp.status_code != 200:
        raise ConnectionError(f'YouTube 返回 HTTP {resp.status_code}')
    match = re.search(r'var ytInitialData = (\{.+?\});', resp.text, re.DOTALL)
    if not match: raise ValueError('无法解析 YouTube 搜索结果')
    try: data = json.loads(match.group(1))
    except json.JSONDecodeError: raise ValueError('YouTube 数据解析失败')
    try:
        contents = data['contents']['twoColumnSearchResultsRenderer']['primaryContents']['sectionListRenderer']['contents']
    except (KeyError, IndexError): return []
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
                    'thumbnail_url': thumb, 'author': author, 'published_at': '', 'view_count': 0})
            if len(results) >= 12: break
        if len(results) >= 12: break
    return results

def _parse_duration(s: str) -> int:
    if not s: return 0
    parts = s.strip().split(':')
    try:
        if len(parts) == 2: return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 3: return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except ValueError: pass
    return 0
