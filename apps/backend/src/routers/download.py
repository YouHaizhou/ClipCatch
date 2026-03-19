# ============================================================
# 下载路由 — 完整实现
# ============================================================
import asyncio
import json
from datetime import datetime
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from database import get_db
from models import Video, DownloadTask
from services.download_service import (
    start_download, pause_task, cancel_task,
    register_progress_callback, unregister_progress_callback,
    extract_video_info,
)

router = APIRouter()


def _friendly_download_error(err: str) -> str:
    """将 yt-dlp 原始错误转为用户友好的中文提示"""
    if 'Sign in' in err or 'login' in err.lower() or 'LOGIN_REQUIRED' in err:
        return '该视频需要登录才能下载'
    elif 'Private video' in err:
        return '该视频为私密视频，无法下载'
    elif 'not available' in err.lower() or 'unavailable' in err.lower():
        return '该视频在当前地区不可用'
    elif 'copyright' in err.lower():
        return '该视频因版权原因无法下载'
    elif 'removed' in err.lower() or 'deleted' in err.lower():
        return '该视频已被删除'
    else:
        return f'链接解析失败: {err}'


@router.post('/download/tasks')
async def create_download_task(body: dict, db: Session = Depends(get_db)):
    """创建下载任务：解析链接元数据 -> 写入 DB -> 启动后台下载"""
    try:
        url = body.get('url', '').strip()
        quality = body.get('quality', '720p')

        if not url:
            return {'code': 1, 'message': 'URL 不能为空'}

        try:
            info = await extract_video_info(url)
        except Exception as e:
            return {'code': 1, 'message': _friendly_download_error(str(e))}

        # 检查是否已存在相同 URL 的视频
        video = db.query(Video).filter(Video.url == url).first()
        if not video:
            published_at = None
            raw_date = info.get('published_at')
            if raw_date:
                try:
                    from datetime import datetime as dt
                    if len(str(raw_date)) == 8:  # YYYYMMDD
                        published_at = dt.strptime(str(raw_date), '%Y%m%d')
                    else:
                        published_at = dt.fromisoformat(str(raw_date)[:19])
                except Exception:
                    published_at = None
            video = Video(
                title=info['title'],
                url=url,
                platform=info['platform'],
                duration=info['duration'],
                thumbnail_url=info['thumbnail_url'],
                author=info.get('author'),
                published_at=published_at,
                created_at=datetime.utcnow(),
            )
            db.add(video)
            db.flush()

        task = DownloadTask(
            video_id=video.id,
            status='queued',
            progress_pct=0.0,
            speed_bps=0,
            eta_seconds=0,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        db.refresh(video)

        # 启动后台下载（独立 Session，不传请求 Session）
        asyncio.create_task(
            start_download(
                task_id=task.id,
                video_id=video.id,
                url=url,
                quality=quality,
            )
        )

        return {
            'code': 0,
            'data': {
                'task_id': task.id,
                'video_id': video.id,
                'status': 'queued',
                'title': video.title,
                'thumbnail_url': video.thumbnail_url,
                'duration': video.duration,
            }
        }
    except Exception as e:
        import traceback
        print(f'[ERROR] create_download_task: {traceback.format_exc()}')
        return {'code': 1, 'message': f'服务器内部错误: {type(e).__name__}: {e}'}


@router.patch('/download/tasks/{task_id}')
async def control_task(task_id: int, body: dict, db: Session = Depends(get_db)):
    """控制下载任务：pause / cancel"""
    action = body.get('action', '')
    task = db.query(DownloadTask).filter(DownloadTask.id == task_id).first()
    if not task:
        return {'code': 1, 'message': '任务不存在'}

    if action == 'pause':
        pause_task(task_id)
        task.status = 'paused'
    elif action == 'cancel':
        cancel_task(task_id)
        task.status = 'failed'
        task.error_msg = '用户取消'
    else:
        return {'code': 1, 'message': f'未知操作: {action}'}

    task.updated_at = datetime.utcnow()
    db.commit()
    return {'code': 0, 'data': {'task_id': task_id, 'status': task.status}}


@router.get('/download/tasks')
def list_tasks(db: Session = Depends(get_db)):
    """获取所有下载任务列表"""
    try:
        tasks = (
            db.query(DownloadTask)
            .order_by(DownloadTask.created_at.desc())
            .limit(50)
            .all()
        )
        result = []
        for t in tasks:
            try:
                video = t.video
                title = video.title if video else ''
                thumb = video.thumbnail_url if video else ''
                duration = video.duration if video else 0
            except Exception:
                title = ''
                thumb = ''
                duration = 0
            result.append({
                'task_id': t.id,
                'video_id': t.video_id,
                'title': title,
                'thumbnail_url': thumb,
                'duration': duration,
                'status': t.status,
                'progress_pct': t.progress_pct,
                'speed_bps': t.speed_bps,
                'eta_seconds': t.eta_seconds,
                'error_msg': t.error_msg,
                'created_at': t.created_at.isoformat() if t.created_at else '',
            })
        return {'code': 0, 'data': result}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {'code': 1, 'message': f'获取任务列表失败: {e}'}


@router.get('/download/tasks/{task_id}/progress')
async def download_progress(task_id: int, db: Session = Depends(get_db)):
    """SSE 进度流：客户端订阅后实时接收下载进度"""
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)

    def on_progress(event: dict):
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            pass

    register_progress_callback(task_id, on_progress)

    async def event_stream():
        try:
            task = db.query(DownloadTask).filter(DownloadTask.id == task_id).first()
            if task:
                yield f'data: {json.dumps({"task_id": task_id, "status": task.status, "progress_pct": task.progress_pct, "speed_bps": task.speed_bps, "eta_seconds": task.eta_seconds})}\n\n'

            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f'data: {json.dumps(event)}\n\n'
                    if event.get('status') in ('completed', 'failed'):
                        break
                except asyncio.TimeoutError:
                    yield ': heartbeat\n\n'
        finally:
            unregister_progress_callback(task_id)

    return StreamingResponse(
        event_stream(),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        },
    )
