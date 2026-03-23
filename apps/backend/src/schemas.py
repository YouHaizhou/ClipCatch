# ============================================================
# Pydantic DTO 定义 — 请求/响应数据结构
# 用于 FastAPI 路由的类型校验、自动文档生成
# ============================================================
from pydantic import BaseModel, Field
from typing import Optional, Literal, List


# ============================================================
# 搜索相关 DTO
# ============================================================

class SearchFilters(BaseModel):
    """搜索过滤条件"""
    duration: Optional[Literal['short', 'medium', 'long']] = None
    sort: Literal['relevance', 'newest', 'views'] = 'relevance'


class SearchRequest(BaseModel):
    """POST /api/search 请求体"""
    query: str = Field(..., min_length=1, max_length=200, description='搜索关键词')
    platform: Literal['all', 'bilibili', 'youtube', 'twitter'] = Field(
        default='all', description='搜索平台'
    )
    page: int = Field(default=1, ge=1, description='页码，从 1 开始')
    filters: SearchFilters = Field(default_factory=SearchFilters)
    seed: Optional[int] = Field(default=None, description='随机种子，用于打散结果顺序')


class VideoItem(BaseModel):
    """单条视频搜索结果"""
    id: str
    title: str
    url: str
    platform: str
    duration: int = 0
    thumbnailUrl: str = ''
    author: str = ''
    publishedAt: str = ''
    viewCount: int = 0
    createdAt: str = ''
    sourceReliability: str = 'heuristic'
    sourceName: str = ''
    isRelated: bool = False

    @classmethod
    def from_raw(cls, item: dict) -> 'VideoItem':
        """从 search_service 返回的 snake_case 字典构造 DTO"""
        return cls(
            id=item.get('id', ''),
            title=item.get('title', ''),
            url=item.get('url', ''),
            platform=item.get('platform', 'other'),
            duration=item.get('duration', 0),
            thumbnailUrl=item.get('thumbnail_url', '') or item.get('thumbnailUrl', ''),
            author=item.get('author', ''),
            publishedAt=str(item.get('published_at', '') or item.get('publishedAt', '') or ''),
            viewCount=item.get('view_count', 0) or item.get('viewCount', 0),
            createdAt=str(item.get('created_at', '') or item.get('createdAt', '') or ''),
            sourceReliability=item.get('source_reliability', 'heuristic'),
            sourceName=item.get('source_name', ''),
        )


class SearchData(BaseModel):
    """搜索响应的 data 字段"""
    results: List[VideoItem]
    total: int
    page: int


class SearchResponse(BaseModel):
    """POST /api/search 响应体"""
    code: int
    data: Optional[SearchData] = None
    message: Optional[str] = None
