# Skill：新增 FastAPI 路由

## 触发时机
后端 Agent 需要新增 API 接口时调用此 Skill。

## 标准路由模板

```python
# src/routers/xxx.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import ModelName

router = APIRouter()

@router.get('/xxx')
def list_xxx(db: Session = Depends(get_db)):
    """获取 XXX 列表"""
    items = db.query(ModelName).order_by(ModelName.created_at.desc()).all()
    return {'code': 0, 'data': [{'id': i.id, 'field': i.field} for i in items]}

@router.post('/xxx')
async def create_xxx(body: dict, db: Session = Depends(get_db)):
    """创建 XXX"""
    field = body.get('field', '').strip()
    if not field:
        return {'code': 1, 'message': 'field 不能为空'}
    item = ModelName(field=field)
    db.add(item)
    db.commit()
    db.refresh(item)
    return {'code': 0, 'data': {'id': item.id}}

@router.patch('/xxx/{item_id}')
def update_xxx(item_id: int, body: dict, db: Session = Depends(get_db)):
    """更新 XXX"""
    item = db.query(ModelName).filter(ModelName.id == item_id).first()
    if not item:
        return {'code': 1, 'message': '记录不存在'}
    if 'field' in body:
        item.field = body['field']
    db.commit()
    return {'code': 0, 'data': {'id': item.id}}
```

## 注册路由到 src/main.py

```python
from routers import xxx
app.include_router(xxx.router, prefix='/api')
```

## 后台任务模板（独立 Session）

```python
import asyncio
from datetime import datetime
from database import SessionLocal

async def _run_background_task(task_id: int) -> None:
    """后台任务：使用独立 Session，不依赖请求生命周期"""
    db = SessionLocal()
    try:
        task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
        if task:
            task.status = 'running'
            db.commit()

        # 执行业务逻辑
        result = await do_some_work()

        task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
        if task:
            task.status = 'completed'
            task.completed_at = datetime.utcnow()
            db.commit()
    except Exception as e:
        db2 = SessionLocal()
        try:
            task = db2.query(TaskModel).filter(TaskModel.id == task_id).first()
            if task:
                task.status = 'failed'
                task.error_msg = str(e)
                db2.commit()
        finally:
            db2.close()
    finally:
        db.close()

# 在路由中启动（不 await）
asyncio.create_task(_run_background_task(task.id))
```

## SSE 流式路由模板

```python
import asyncio
import json
from fastapi.responses import StreamingResponse

_queues: dict[int, asyncio.Queue] = {}

@router.get('/xxx/{task_id}/stream')
async def stream_xxx(task_id: int, db: Session = Depends(get_db)):
    """SSE 流：实时推送进度"""
    queue: asyncio.Queue = asyncio.Queue(maxsize=500)
    _queues[task_id] = queue

    async def event_stream():
        # 先推送当前状态
        task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
        if task:
            yield f'data: {json.dumps({"type": "progress", "stage": task.status})}\n\n'
            if task.status == 'completed':
                yield f'data: {json.dumps({"type": "done"})}\n\n'
                return
            if task.status == 'failed':
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
            if _queues.get(task_id) is queue:
                _queues.pop(task_id, None)

    return StreamingResponse(
        event_stream(),
        media_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
    )
```

## API 响应规范

```python
# 成功
return {'code': 0, 'data': { ... }}

# 失败
return {'code': 1, 'message': '具体错误描述'}
```

## 关键注意事项

- 路由层只做**参数解析和校验**，业务逻辑放 `services/`
- `Depends(get_db)` 仅用于同步请求，后台任务必须用 `SessionLocal()`
- `src/main.py` 顶部的 `KMP_DUPLICATE_LIB_OK=TRUE` 不能删除
- 所有时间字段用 `datetime.utcnow()`
- 禁止在响应中暴露 API Key 或内部路径
