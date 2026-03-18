# ============================================================
# Twitter 搜索服务 — 基于 twscrape
# 用户提供自己的 Twitter 账号凭证，以个人责任使用
# ⚠️ 警告：使用本模块即表示用户自行承担账号封禁及法律风险
# ============================================================
import asyncio
import json
from pathlib import Path
from typing import Optional

# twscrape 数据库路径（存储账号 cookie）
_ACCOUNTS_DB = Path.home() / 'VideoAI' / 'twscrape_accounts.db'
_ACCOUNTS_DB.parent.mkdir(parents=True, exist_ok=True)

_api_instance = None
_api_lock = asyncio.Lock()

# Clash Verge 本地代理配置
_PROXY_URL = 'http://127.0.0.1:7897'


async def _get_api():
    """获取或初始化 twscrape API 实例（走本地代理）"""
    global _api_instance
    async with _api_lock:
        if _api_instance is None:
            try:
                from twscrape import API
                import httpx
                # 注入代理，让 twscrape 走 Clash Verge
                proxy_client = httpx.AsyncClient(
                    proxy=_PROXY_URL,
                    verify=False,
                )
                _api_instance = API(str(_ACCOUNTS_DB), proxy=_PROXY_URL)
            except ImportError:
                raise RuntimeError('twscrape 未安装，请运行: pip install twscrape')
    return _api_instance


async def add_twitter_account(username: str, password: str, email: str, email_password: str = '') -> dict:
    """
    添加 Twitter 账号凭证并登录
    返回 {'success': bool, 'message': str}
    """
    try:
        api = await _get_api()
        await api.pool.add_account(
            username=username,
            password=password,
            email=email,
            email_password=email_password or password,
        )
        await api.pool.login_all()
        # 检查是否登录成功
        accounts = await api.pool.get_all()
        logged_in = [a for a in accounts if a.active]
        if not logged_in:
            return {'success': False, 'message': '登录失败，请检查账号密码是否正确'}
        return {'success': True, 'message': f'账号 @{username} 登录成功'}
    except Exception as e:
        err = str(e)
        if 'suspended' in err.lower():
            return {'success': False, 'message': '账号已被 Twitter 封禁'}
        elif 'locked' in err.lower():
            return {'success': False, 'message': '账号已被锁定，请在 Twitter 网站解锁后重试'}
        else:
            return {'success': False, 'message': f'登录失败: {err}'}


async def get_twitter_account_status() -> dict:
    """获取已配置的 Twitter 账号状态"""
    try:
        api = await _get_api()
        accounts = await api.pool.get_all()
        if not accounts:
            return {'configured': False, 'accounts': []}
        return {
            'configured': True,
            'accounts': [
                {
                    'username': a.username,
                    'active': a.active,
                    'locks': a.locks,
                }
                for a in accounts
            ]
        }
    except Exception:
        return {'configured': False, 'accounts': []}


async def remove_twitter_account(username: str) -> dict:
    """删除指定账号"""
    try:
        api = await _get_api()
        await api.pool.delete_accounts(username)
        return {'success': True, 'message': f'已删除账号 @{username}'}
    except Exception as e:
        return {'success': False, 'message': str(e)}


async def search_twitter_videos(query: str, limit: int = 12) -> list:
    """
    使用 twscrape 搜索 Twitter/X 视频推文
    返回标准化的视频信息列表
    """
    try:
        api = await _get_api()
        accounts = await api.pool.get_all()
        active = [a for a in accounts if a.active]
        if not active:
            return []  # 无活跃账号，由调用方处理兜底

        results = []
        # 搜索视频推文：filter:videos 限制只返回含视频的推文
        search_query = f'{query} filter:videos'
        
        async for tweet in api.search(search_query, limit=limit):
            # 提取视频信息
            video_url = ''
            thumbnail_url = ''
            duration = 0
            
            if tweet.media and tweet.media.videos:
                # 取最高质量的视频
                videos = tweet.media.videos
                if videos:
                    best = max(videos, key=lambda v: v.bitrate or 0)
                    video_url = best.url or ''
                    duration = int(best.duration_millis / 1000) if best.duration_millis else 0
            
            if tweet.media and tweet.media.photos:
                if tweet.media.photos:
                    thumbnail_url = tweet.media.photos[0].url or ''

            # 推文页面链接
            tweet_url = f'https://twitter.com/{tweet.user.username}/status/{tweet.id}'
            
            # 标题用推文文本（截断）
            title = tweet.rawContent or ''
            if len(title) > 100:
                title = title[:97] + '...'

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
                # 直链视频 URL（供 yt-dlp 下载）
                '_direct_video_url': video_url,
            })

        return results

    except Exception as e:
        err = str(e)
        if 'No active accounts' in err or 'pool' in err.lower():
            return []  # 无账号，静默返回
        raise RuntimeError(f'Twitter 搜索失败: {err}')
