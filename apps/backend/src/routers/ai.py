# ============================================================
# AI 路由 — 完整实现
# 流程：创建任务 -> SSE 流 -> FFmpeg提取 -> 本地Whisper STT -> DeepSeek生成 -> 写入笔记
# ============================================================
import asyncio
import json
from datetime import datetime
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from database import get_db
from models import Video, AITask, Note
from services.ffmpeg_service import extract_audio, cleanup_audio
from services.stt_service import transcribe_audio
from services.llm_service import stream_summary

router = APIRouter()

# SSE 事件队列注册表：task_id -> asyncio.Queue
_task_queues: dict[int, asyncio.Queue] = {}


def _push(task_id: int, event: dict) -> None:
    """向指定任务的 SSE 队列推送事件"""
    q = _task_queues.get(task_id)
    if q:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass


@router.post('/ai/tasks')
async def create_ai_task(body: dict, db: Session = Depends(get_db)):
    """创建 AI 处理任务，立即返回 task_id，后台异步执行"""
    video_id = body.get('video_id')
    mode = body.get('mode', 'text_only')
    template = body.get('prompt_template', 'summary')

    if not video_id:
        return {'code': 1, 'message': 'video_id 不能为空'}

    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        return {'code': 1, 'message': '视频不存在'}

    # 创建任务记录
    task = AITask(
        video_id=video_id,
        mode=mode,
        prompt_template=template,
        status='queued',
        created_at=datetime.utcnow(),
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    # 启动后台处理（不 await）
    diagram_type = body.get('diagram_type', 'mindmap')
    asyncio.create_task(
        _run_ai_pipeline(task.id, video_id, mode, template, diagram_type)
    )

    return {'code': 0, 'data': {'task_id': task.id, 'status': 'queued'}}


async def _run_ai_pipeline(
    task_id: int,
    video_id: int,
    mode: str,
    template: str,
    diagram_type: str = 'mindmap',
) -> None:
    """
    AI 处理主流程（在独立的 asyncio Task 中运行）：
    1. 从数据库获取视频信息
    2. FFmpeg 提取音频
    3. 本地 Whisper STT 转写
    4. DeepSeek 流式生成摘要
    5. 保存笔记到数据库
    """
    # 每个后台任务需要独立的数据库 Session
    from database import SessionLocal
    db = SessionLocal()

    audio_path = None
    try:
        # 更新任务状态
        def update_status(status: str, error: str = None):
            task = db.query(AITask).filter(AITask.id == task_id).first()
            if task:
                task.status = status
                if error:
                    task.error_msg = error
                if status == 'completed':
                    task.completed_at = datetime.utcnow()
                db.commit()

        def on_progress(stage: str, message: str):
            update_status(stage)
            _push(task_id, {
                'type': 'progress',
                'stage': stage,
                'message': message,
            })

        # 获取视频信息
        video = db.query(Video).filter(Video.id == video_id).first()
        if not video:
            raise ValueError('视频不存在')

        # --- Step 1: 提取音频 ---
        if not video.local_file_path:
            raise ValueError('视频文件未下载，请先下载视频')

        on_progress('extracting', '正在提取音频...')
        audio_path = await extract_audio(
            video_path=video.local_file_path,
            task_id=task_id,
            on_progress=on_progress,
        )

        # 保存音频路径到任务记录
        task_row = db.query(AITask).filter(AITask.id == task_id).first()
        if task_row:
            task_row.audio_path = audio_path
            db.commit()

        # --- Step 2: STT 转写 ---
        on_progress('transcribing', '正在语音转写...')
        transcript = await transcribe_audio(
            audio_path=audio_path,
            db=db,
            on_progress=on_progress,
        )

        # 保存转写结果
        task_row = db.query(AITask).filter(AITask.id == task_id).first()
        if task_row:
            task_row.transcript = transcript
            db.commit()

        # extract_only 模式：只转写，不调用 LLM
        task_row = db.query(AITask).filter(AITask.id == task_id).first()
        if task_row and task_row.mode == 'extract_only':
            word_count = len(transcript)
            # 直接把转写文本作为内容保存
            note = Note(
                video_id=video_id,
                ai_task_id=task_id,
                markdown_content=transcript,
                word_count=word_count,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.add(note)
            update_status('completed')
            db.commit()
            db.refresh(note)
            # 把全文通过 token 流推出（分块推送避免单包过大）
            chunk_size = 200
            for i in range(0, len(transcript), chunk_size):
                _push(task_id, {'type': 'token', 'content': transcript[i:i+chunk_size]})
            _push(task_id, {'type': 'done', 'note_id': note.id, 'noteId': note.id,
                            'word_count': word_count, 'wordCount': word_count})
            return

        # --- Step 3: extract_only 模式：跳过 LLM，直接保存转写文本 ---
        if mode == 'extract_only':
            word_count = len(transcript)
            note = Note(
                video_id=video_id,
                ai_task_id=task_id,
                markdown_content=transcript,
                word_count=word_count,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.add(note)
            update_status('completed')
            db.commit()
            db.refresh(note)
            chunk_size = 200
            for i in range(0, len(transcript), chunk_size):
                _push(task_id, {'type': 'token', 'content': transcript[i:i+chunk_size]})
            _push(task_id, {
                'type': 'done',
                'note_id': note.id, 'noteId': note.id,
                'word_count': word_count, 'wordCount': word_count,
            })
            return

        # --- Step 3: LLM 生成 ---
        on_progress('generating', '正在 AI 生成摘要...')
        content_buffer = []

        def on_token(token: str):
            content_buffer.append(token)
            _push(task_id, {'type': 'token', 'content': token})

        full_content = await stream_summary(
            transcript=transcript,
            title=video.title,
            template_key=template,
            db=db,
            on_token=on_token,
            on_progress=on_progress,
            diagram_type=diagram_type,
        )

        # --- Step 4: 保存笔记 ---
        word_count = len(full_content.replace(' ', '').replace('\n', ''))
        note = Note(
            video_id=video_id,
            ai_task_id=task_id,
            markdown_content=full_content,
            word_count=word_count,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(note)
        update_status('completed')
        db.commit()
        db.refresh(note)

        _push(task_id, {
            'type': 'done',
            'note_id': note.id,
            'noteId': note.id,
            'word_count': word_count,
            'wordCount': word_count,
        })

    except Exception as e:
        err = str(e)
        task_row = db.query(AITask).filter(AITask.id == task_id).first()
        if task_row:
            task_row.status = 'failed'
            task_row.error_msg = err
            db.commit()
        _push(task_id, {'type': 'error', 'message': err})

    finally:
        # 清理临时音频文件
        if audio_path:
            cleanup_audio(task_id)
        db.close()
        # 仅清理自己注册的队列，避免覆盖新连接的队列
        if _task_queues.get(task_id) is not None:
            _task_queues.pop(task_id, None)


@router.get('/ai/tasks/{task_id}/stream')
async def ai_task_stream(task_id: int, db: Session = Depends(get_db)):
    """SSE 流：客户端订阅后实时接收 AI 处理进度和生成内容"""
    # 若旧队列存在（断开重连场景），先通知旧消费者并清理，避免泄漏
    old_queue = _task_queues.pop(task_id, None)
    if old_queue:
        try:
            old_queue.put_nowait({'type': 'error', 'message': 'reconnected'})
        except asyncio.QueueFull:
            pass

    queue: asyncio.Queue = asyncio.Queue(maxsize=500)
    _task_queues[task_id] = queue

    async def event_stream():
        # 先推送当前任务状态
        task = db.query(AITask).filter(AITask.id == task_id).first()
        if task:
            yield f'data: {json.dumps({"type": "progress", "stage": task.status, "message": ""})}\n\n'

            # 如果任务已完成，直接推送 done
            if task.status == 'completed':
                note = db.query(Note).filter(Note.ai_task_id == task_id).first()
                if note:
                    yield f'data: {json.dumps({"type": "done", "note_id": note.id, "word_count": note.word_count, "content": note.markdown_content})}\n\n'
                return
            elif task.status == 'failed':
                yield f'data: {json.dumps({"type": "error", "message": task.error_msg or "处理失败"})}\n\n'
                return

        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=60.0)
                    yield f'data: {json.dumps(event)}\n\n'
                    if event.get('type') in ('done', 'error'):
                        break
                except asyncio.TimeoutError:
                    yield ': heartbeat\n\n'
        finally:
            # 仅清理自己注册的队列，避免覆盖新连接后的队列
            if _task_queues.get(task_id) is queue:
                _task_queues.pop(task_id, None)

    return StreamingResponse(
        event_stream(),
        media_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
    )


@router.get('/ai/tasks')
def list_ai_tasks(video_id: int = None, db: Session = Depends(get_db)):
    """获取 AI 任务列表"""
    query = db.query(AITask)
    if video_id:
        query = query.filter(AITask.video_id == video_id)
    tasks = query.order_by(AITask.created_at.desc()).limit(20).all()
    return {
        'code': 0,
        'data': [
            {
                'task_id':         t.id,
                'video_id':        t.video_id,
                'mode':            t.mode,
                'prompt_template': t.prompt_template,
                'status':          t.status,
                'error_msg':       t.error_msg,
                'created_at':      t.created_at.isoformat(),
                'completed_at':    t.completed_at.isoformat() if t.completed_at else None,
            }
            for t in tasks
        ]
    }

@router.get('/ai/tasks/{task_id}/transcript')
def get_transcript(task_id: int, db: Session = Depends(get_db)):
    """获取 AI 任务的原始转写文本"""
    task = db.query(AITask).filter(AITask.id == task_id).first()
    if not task:
        return {'code': 1, 'message': '任务不存在'}
    if not task.transcript:
        return {'code': 1, 'message': '暂无转写文本，请先运行 AI 分析'}
    return {'code': 0, 'data': {'transcript': task.transcript, 'word_count': len(task.transcript)}}
