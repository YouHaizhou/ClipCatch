import asyncio
import re
import json
import os
from typing import Optional
import httpx
from sqlalchemy.orm import Session

# 代理配置：懒加载，每次调用时读取，确保 main.py 之后设置的环境变量能被感知
def _get_proxy() -> str | None:
    # 1. explicit env vars
    proxy = (os.environ.get('VIDEOAI_PROXY') or os.environ.get('TWS_PROXY')
             or os.environ.get('HTTP_PROXY') or os.environ.get('http_proxy')
             or os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy'))
    if proxy:
        return proxy
    # 2. Windows registry proxy (Clash / V2ray system proxy)
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
    """Create httpx client. use_proxy=True for YouTube/Twitter/Serper."""
    if use_proxy:
        proxy = _get_proxy()
        if proxy:
            kwargs['trust_env'] = False
            kwargs.setdefault('proxy', proxy)
        else:
            # No explicit proxy found; let httpx read env/system proxy
            kwargs['trust_env'] = True
    else:
        kwargs['trust_env'] = False
    return httpx.AsyncClient(**kwargs)



def _parse_duration(s: str) -> int:
    """Parse duration string like '1:23:45' or '12:34' or '1h23m' into seconds."""
    if not s:
        return 0
    s = str(s).strip()
    import re
    # Format: HH:MM:SS or MM:SS
    m = re.match(r'^(\d+):(\d+)(?::(\d+))?$', s)
    if m:
        parts = [int(x) for x in m.groups() if x is not None]
        if len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
        return parts[0] * 60 + parts[1]
    # Format: 1h23m45s
    m2 = re.match(r'(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?', s)
    if m2:
        h = int(m2.group(1) or 0)
        m_ = int(m2.group(2) or 0)
        sec = int(m2.group(3) or 0)
        return h * 3600 + m_ * 60 + sec
    # Plain seconds
    try:
        return int(s)
    except Exception:
        return 0


_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}


def _get_serper_config(db: Session) -> tuple[Optional[str], bool]:
    """
    从已有的 db Session 读取 Serper API Key 和启用状态。
    返回 (key, enabled)，key=None 表示未配置。
    """
    from models import Setting
    row = db.query(Setting).filter(Setting.key == 'api_key_serper').first()
    serper_key: Optional[str] = json.loads(row.value) if row and row.value else None
    row_en = db.query(Setting).filter(Setting.key == 'api_key_serper_enabled').first()
    enabled: bool = json.loads(row_en.value) if row_en and row_en.value is not None else True
    return serper_key, enabled


async def search_videos(
    db: Session,
    query: str,
    platform: str = 'all',
    duration_filter: Optional[str] = None,
    sort: str = 'relevance',
    page: int = 1,
    seed: Optional[int] = None,
) -> dict:
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
    # Bilibili 直连（use_proxy=False），避免代理导致IP异常被412
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
        })
    return results

async def _search_youtube(db: Session, query: str, page: int = 1) -> list:
    """YouTube 搜索：优先 Serper API（国内可用），无 Key 时降级走代理直连"""
    serper_key, serper_enabled = _get_serper_config(db)
    if serper_key and serper_enabled:
        serper_results = await _search_youtube_via_serper(serper_key, query, page)
        if serper_results:
            return serper_results
    return await _search_youtube_direct(query, page)


async def _search_youtube_via_serper(serper_key: str, query: str, page: int = 1) -> Optional[list]:
    """通过 Serper API 搜索 YouTube（国内直连 serper.dev，无需代理）"""
    try:
        # Serper 是国内可达的 Google 搜索代理，不走本地代理
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
            })
        return results if results else None
    except Exception:
        return None


async def _search_youtube_direct(query: str, page: int = 1) -> list:
    """直连 YouTube（国外，需科学上网），Serper 不可用时的降级方案"""
    search_url = f'https://www.youtube.com/results?search_query={query.replace(" ", "+")}'
    headers = {**_HEADERS, 'Accept-Language': 'en-US,en;q=0.9'}
    try:
        # YouTube 需要代理才能访问
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
                    })
                if len(results) >= 20:
                    break
            if len(results) >= 20:
                break
        return results
    except Exception:
        yt_url = f'https://www.youtube.com/results?search_query={query.replace(" ", "+")}'
        return [{'id': 'youtube_search', 'title': f'在 YouTube 上搜索「{query}」（点击跳转，需梯子）',
                 'url': yt_url, 'platform': 'youtube', 'duration': 0,
                 'thumbnail_url': '', 'author': 'YouTube', 'published_at': '', 'view_count': 0}]

async def _search_twitter(db: Session, query: str, page: int = 1) -> list:
    """搜索 Twitter/X：优先 Serper（国内直连），降级代理直连，最终返回跳转卡片"""
    serper_key, serper_enabled = _get_serper_config(db)

    if not serper_key or not serper_enabled:
        # 无 Serper 时，尝试走代理直连 Twitter 搜索页（需挂梯子）
        proxy_results = await _search_twitter_direct(query, page)
        if proxy_results:
            return proxy_results
        return [_twitter_fallback_card(query)]

    results = []
    try:
        # Serper 国内可达，不走代理
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
                    })

        if not results:
            results.append(_twitter_fallback_card(query))

    except Exception:
        return [_twitter_fallback_card(query, suffix='_err')]

    return results[:12]


def _twitter_fallback_card(query: str, suffix: str = '') -> dict:
    """构造 Twitter 搜索跳转兜底卡片"""
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
    }


async def _search_twitter_direct(query: str, page: int = 1) -> list:
    """走代理直连 Twitter/X 搜索——使用 Guest Token 接口，无需登录"""
    results = []
    try:
        # Step 1: 获取 Guest Token
        async with _make_client(use_proxy=True, timeout=15) as client:
            # 获取 bearer token
            bearer = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'
            # 申请 guest token
            gt_resp = await client.post(
                'https://api.twitter.com/1.1/guest/activate.json',
                headers={
                    'Authorization': f'Bearer {bearer}',
                    'Content-Type': 'application/json',
                }
            )
            if gt_resp.status_code != 200:
                return []
            guest_token = gt_resp.json().get('guest_token', '')
            if not guest_token:
                return []

            # Step 2: 搜索请求
            params = {
                'q': query,
                'tweet_search_mode': 'live',
                'result_filter': 'video',
                'count': '20',
                'query_source': 'typed_query',
                'pc': '1',
                'spelling_corrections': '1',
            }
            search_resp = await client.get(
                'https://api.twitter.com/2/search/adaptive.json',
                params=params,
                headers={
                    'Authorization': f'Bearer {bearer}',
                    'x-guest-token': guest_token,
                    'x-twitter-active-user': 'yes',
                    'x-twitter-client-language': 'zh-cn',
                    'Referer': 'https://twitter.com/',
                    **_HEADERS,
                }
            )
            if search_resp.status_code != 200:
                return []

            data = search_resp.json()
            tweets = data.get('globalObjects', {}).get('tweets', {})
            users = data.get('globalObjects', {}).get('users', {})

            for tweet_id, tweet in tweets.items():
                # 只要有视频的推文
                if not tweet.get('extended_entities', {}).get('media'):
                    continue
                has_video = any(
                    m.get('type') in ('video', 'animated_gif')
                    for m in tweet.get('extended_entities', {}).get('media', [])
                )
                if not has_video:
                    continue

                user_id = str(tweet.get('user_id_str', ''))
                user = users.get(user_id, {})
                screen_name = user.get('screen_name', '')
                thumb = ''
                for m in tweet.get('extended_entities', {}).get('media', []):
                    if m.get('type') in ('video', 'animated_gif'):
                        thumb = m.get('media_url_https', '')
                        break
                duration_ms = 0
                for m in tweet.get('extended_entities', {}).get('media', []):
                    vi = m.get('video_info', {})
                    duration_ms = vi.get('duration_millis', 0)
                    break

                results.append({
                    'id': tweet_id,
                    'title': tweet.get('full_text', tweet.get('text', ''))[:120],
                    'url': f'https://twitter.com/{screen_name}/status/{tweet_id}',
                    'platform': 'twitter',
                    'duration': duration_ms // 1000,
                    'thumbnail_url': thumb,
                    'author': screen_name,
                    'published_at': tweet.get('created_at', ''),
                    'view_count': 0,
                })
                if len(results) >= 12:
                    break

    except Exception as e:
        print(f'[Twitter direct] error: {e}')
    return results


