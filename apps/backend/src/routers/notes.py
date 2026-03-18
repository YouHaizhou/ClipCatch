# ============================================================
# 笔记路由 — 导出功能
# ============================================================
import json
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Note, Video, Setting

router = APIRouter()


def _get_export_dir(db: Session) -> Path:
    row = db.query(Setting).filter(Setting.key == 'export_dir').first()
    if row and row.value:
        d = Path(json.loads(row.value))
    else:
        d = Path.home() / 'VideoAI' / 'exports'
    d.mkdir(parents=True, exist_ok=True)
    return d


def _safe_filename(title: str) -> str:
    """将视频标题转换为安全文件名"""
    import re
    # 移除 Windows 非法字符
    safe = re.sub(r'[\\/:*?"\u003c>|]', '_', title)
    # 截断到 80 字符
    return safe[:80].strip()


@router.get('/notes')
def list_notes(video_id: int = None, db: Session = Depends(get_db)):
    """获取笔记列表"""
    query = db.query(Note)
    if video_id:
        query = query.filter(Note.video_id == video_id)
    notes = query.order_by(Note.created_at.desc()).limit(50).all()
    return {
        'code': 0,
        'data': [
            {
                'note_id':   n.id,
                'video_id':  n.video_id,
                'ai_task_id': n.ai_task_id,
                'word_count': n.word_count,
                'exported_path': n.exported_path,
                'created_at': n.created_at.isoformat(),
            }
            for n in notes
        ]
    }


@router.get('/notes/{note_id}')
def get_note(note_id: int, db: Session = Depends(get_db)):
    """获取笔记内容"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        return {'code': 1, 'message': '笔记不存在'}
    return {
        'code': 0,
        'data': {
            'note_id':          note.id,
            'video_id':         note.video_id,
            'markdown_content': note.markdown_content,
            'word_count':       note.word_count,
            'exported_path':    note.exported_path,
            'created_at':       note.created_at.isoformat(),
        }
    }


@router.post('/notes/{note_id}/export')
def export_note(
    note_id: int,
    body: dict = None,
    db: Session = Depends(get_db)
):
    """
    将笔记导出为 Markdown 文件。
    body.export_path: 可选，指定导出路径（来自 Electron dialog）
    """
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        return {'code': 1, 'message': '笔记不存在'}

    # 获取关联视频标题
    video = db.query(Video).filter(Video.id == note.video_id).first()
    title = video.title if video else f'note_{note_id}'

    # 确定导出路径
    if body and body.get('export_path'):
        export_path = Path(body['export_path'])
    else:
        export_dir = _get_export_dir(db)
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'{_safe_filename(title)}_{ts}.md'
        export_path = export_dir / filename

    # 构建 Markdown 文件头
    header = f'# {title}\n\n'
    header += f'> 导出时间：{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}  \n'
    header += f'> 字数：{note.word_count}  \n\n'
    header += '---\n\n'

    full_content = header + note.markdown_content

    # 写入文件
    export_path.parent.mkdir(parents=True, exist_ok=True)
    with open(export_path, 'w', encoding='utf-8') as f:
        f.write(full_content)

    # 更新数据库记录
    note.exported_path = str(export_path)
    note.updated_at = datetime.utcnow()
    db.commit()

    return {
        'code': 0,
        'data': {
            'export_path': str(export_path),
            'file_size': export_path.stat().st_size,
        }
    }


@router.delete('/notes/{note_id}')
def delete_note(note_id: int, db: Session = Depends(get_db)):
    """删除笔记"""
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        return {'code': 1, 'message': '笔记不存在'}
    db.delete(note)
    db.commit()
    return {'code': 0}
