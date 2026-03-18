# ============================================================
# 媒体库路由 — 完整实现
# ============================================================
import mimetypes
import os
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from models import Video, Note, AITask

router = APIRouter()


@router.get('/library')
def get_library(
    sort: str = 'time',
    order: str = 'desc',
    keyword: str = '',
    db: Session = Depends(get_db)
):
    """获取本地媒体库视频列表（已下载的视频）"""
    try:
        query = db.query(Video).filter(Video.local_file_path.isnot(None))

        if keyword:
            query = query.filter(Video.title.contains(keyword))

        if sort == 'time':
            col = Video.downloaded_at
        elif sort == 'size':
            col = Video.file_size
        else:
            col = Video.title

        query = query.order_by(col.desc() if order == 'desc' else col.asc())
        videos = query.all()
        video_ids = [v.id for v in videos]

        video_ids_with_notes = set(
            row[0] for row in db.query(Note.video_id).filter(
                Note.video_id.in_(video_ids)
            ).all()
        )

        # 查询每个视频最新 AI 任务的状态
        latest_tasks: dict[int, str] = {}
        if video_ids:
            subq = (
                db.query(
                    AITask.video_id,
                    func.max(AITask.id).label('max_id')
                )
                .filter(AITask.video_id.in_(video_ids))
                .group_by(AITask.video_id)
                .subquery()
            )
            rows = (
                db.query(AITask.video_id, AITask.status)
                .join(subq, (AITask.video_id == subq.c.video_id) & (AITask.id == subq.c.max_id))
                .all()
            )
            for vid, status in rows:
                if status in ('queued', 'extracting', 'transcribing', 'generating'):
                    latest_tasks[vid] = 'processing'
                elif status == 'completed':
                    latest_tasks[vid] = 'completed'
                else:
                    latest_tasks[vid] = 'none'

        return {
            'code': 0,
            'data': {
                'videos': [
                    {
                        'video_id':        v.id,
                        'title':           v.title,
                        'thumbnail_url':   v.thumbnail_url or '',
                        'thumbnail_path':  v.thumbnail_path or '',
                        'duration':        v.duration or 0,
                        'file_size':       v.file_size or 0,
                        'platform':        v.platform,
                        'local_file_path': v.local_file_path or '',
                        'downloaded_at':   v.downloaded_at.isoformat() if v.downloaded_at else '',
                        'has_note':        v.id in video_ids_with_notes,
                        'ai_status':       latest_tasks.get(v.id, 'none'),
                    }
                    for v in videos
                ]
            }
        }
    except Exception:
        import traceback
        traceback.print_exc()
        return {'code': 1, 'message': '获取媒体库失败'}


@router.get('/library/{video_id}/stream')
async def stream_video(video_id: int, db: Session = Depends(get_db)):
    """视频流接口：支持直接播放，供前端 video 标签使用"""
    try:
        video = db.query(Video).filter(Video.id == video_id).first()
        if not video or not video.local_file_path:
            return JSONResponse({'code': 1, 'message': '视频文件不存在'}, status_code=404)

        file_path = video.local_file_path
        if not os.path.exists(file_path):
            return JSONResponse({'code': 1, 'message': f'文件不存在: {file_path}'}, status_code=404)

        mime_type, _ = mimetypes.guess_type(file_path)
        mime_type = mime_type or 'video/mp4'
        return FileResponse(
            path=file_path,
            media_type=mime_type,
            filename=os.path.basename(file_path),
            headers={'Accept-Ranges': 'bytes'},
        )
    except Exception:
        import traceback
        traceback.print_exc()
        return JSONResponse({'code': 1, 'message': '视频流加载失败'}, status_code=500)


@router.get('/library/{video_id}')
def get_video_detail(video_id: int, db: Session = Depends(get_db)):
    """获取单个视频详情及其所有笔记"""
    try:
        video = db.query(Video).filter(Video.id == video_id).first()
        if not video:
            return {'code': 1, 'message': '视频不存在'}

        notes = db.query(Note).filter(Note.video_id == video_id)\
            .order_by(Note.created_at.desc()).all()

        return {
            'code': 0,
            'data': {
                'video': {
                    'video_id':        video.id,
                    'title':           video.title,
                    'url':             video.url,
                    'platform':        video.platform,
                    'duration':        video.duration or 0,
                    'thumbnail_url':   video.thumbnail_url or '',
                    'local_file_path': video.local_file_path or '',
                    'file_size':       video.file_size or 0,
                    'downloaded_at':   video.downloaded_at.isoformat() if video.downloaded_at else '',
                },
                'notes': [
                    {
                        'note_id':          n.id,
                        'ai_task_id':       n.ai_task_id,
                        'markdown_content': n.markdown_content,
                        'word_count':       n.word_count,
                        'created_at':       n.created_at.isoformat(),
                    }
                    for n in notes
                ]
            }
        }
    except Exception:
        import traceback
        traceback.print_exc()
        return {'code': 1, 'message': '获取视频详情失败'}
