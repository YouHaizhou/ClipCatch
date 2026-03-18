# ============================================================
# 搜索路由 — 完整实现
# ============================================================
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from services.search_service import search_videos

router = APIRouter()


def _to_camel(item: dict) -> dict:
    """将搜索结果 snake_case 字段转为前端 VideoInfo 期望的 camelCase"""
    return {
        'id': item.get('id', ''),
        'title': item.get('title', ''),
        'url': item.get('url', ''),
        'platform': item.get('platform', 'other'),
        'duration': item.get('duration', 0),
        'thumbnailUrl': item.get('thumbnail_url', '') or item.get('thumbnailUrl', ''),
        'author': item.get('author', ''),
        'publishedAt': str(item.get('published_at', '') or item.get('publishedAt', '') or ''),
        'viewCount': item.get('view_count', 0) or item.get('viewCount', 0),
        'createdAt': str(item.get('created_at', '') or item.get('createdAt', '') or ''),
    }


@router.post('/search')
async def search(body: dict, db: Session = Depends(get_db)):
    """搜索视频接口"""
    query = body.get('query', '').strip()
    if not query:
        return {'code': 1, 'message': '请输入搜索关键词'}

    try:
        result = await search_videos(
            db=db,
            query=query,
            platform=body.get('platform', 'all'),
            duration_filter=body.get('filters', {}).get('duration'),
            sort=body.get('filters', {}).get('sort', 'relevance'),
            page=body.get('page', 1),
            seed=body.get('seed'),
        )
        # 将结果字段转为前端期望的 camelCase
        camel_results = [_to_camel(v) for v in result.get('results', [])]
        return {
            'code': 0,
            'data': {
                'results': camel_results,
                'total': result.get('total', len(camel_results)),
                'page': result.get('page', 1),
            }
        }
    except ValueError as e:
        return {'code': 1, 'message': str(e)}
    except Exception as e:
        return {'code': 1, 'message': f'搜索失败: {str(e)}'}
