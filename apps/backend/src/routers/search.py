# ============================================================
# 搜索路由 — DTO 版本
# 使用 Pydantic SearchRequest/SearchResponse 做类型校验和自动文档
# ============================================================
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from services.search_service import search_videos
from schemas import SearchRequest, SearchResponse, SearchData, VideoItem

router = APIRouter()


@router.post('/search', response_model=SearchResponse)
async def search(body: SearchRequest, db: Session = Depends(get_db)):
    """
    搜索视频接口，结果不足时自动补充相关视频。

    - **query**: 搜索关键词（1-200字符）
    - **platform**: all / bilibili / youtube / twitter
    - **page**: 页码，从 1 开始
    - **filters.duration**: short(<4min) / medium(4-20min) / long(>20min)
    - **filters.sort**: relevance / newest / views
    - **seed**: 随机种子，用于打散结果顺序
    """
    try:
        result = await search_videos(
            db=db,
            query=body.query,
            platform=body.platform,
            duration_filter=body.filters.duration,
            sort=body.filters.sort,
            page=body.page,
            seed=body.seed,
        )

        items = [VideoItem.from_raw(v) for v in result.get('results', [])]

        # 结果不足 10 条且是第一页时，补充相关视频（取关键词首词重搜）
        if len(items) < 10 and body.page == 1:
            try:
                first_word = body.query.split()[0] if ' ' in body.query else body.query
                if first_word != body.query:
                    related = await search_videos(
                        db=db, query=first_word,
                        platform=body.platform,
                        duration_filter=None, sort='relevance', page=1,
                    )
                    seen_ids = {v.id for v in items}
                    for raw in related.get('results', []):
                        item = VideoItem.from_raw(raw)
                        if item.id not in seen_ids:
                            item.isRelated = True
                            items.append(item)
                            seen_ids.add(item.id)
            except Exception:
                pass

        return SearchResponse(
            code=0,
            data=SearchData(
                results=items,
                total=result.get('total', len(items)),
                page=result.get('page', 1),
            )
        )

    except ValueError as e:
        return SearchResponse(code=1, message=str(e))
    except Exception as e:
        return SearchResponse(code=1, message=f'搜索失败: {str(e)}')
