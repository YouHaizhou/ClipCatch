# ============================================================
# Prompt 模板加载器
# 优先使用用户指定的模板文件，未指定时使用默认模板
# 默认模板路径：prompt/提炼.md（相对于项目根目录）
# 模板文件中可使用 {title} 和 {transcript} 占位符
# ============================================================
import json
import os
from pathlib import Path
from sqlalchemy.orm import Session
from models import Setting

# 默认模板文件路径（相对于本文件向上三级到项目根）
_DEFAULT_PROMPT_PATH = Path(__file__).parent.parent.parent.parent.parent / 'prompt' / '提炼.md'

# 系统角色默认值
_DEFAULT_SYSTEM = (
    '你是一位顶尖的知识提炼专家，擅长从视频转录文本中提炼核心价值，'
    '并以结构化、可视化的方式呈现。请使用中文输出。'
    '重要：直接输出分析结果，禁止在开头添加任何确认语句、客套话或角色扮演说明。'
)


def _get_template_path(db: Session) -> Path:
    """从数据库读取用户指定的模板文件路径，未设置则用默认路径"""
    row = db.query(Setting).filter(Setting.key == 'prompt_template_path').first()
    if row and row.value:
        val = json.loads(row.value)
        if val and val.strip():
            p = Path(val.strip())
            if p.exists():
                return p
    return _DEFAULT_PROMPT_PATH


def _load_template(db: Session) -> str:
    """加载模板文件内容"""
    path = _get_template_path(db)
    if path.exists():
        return path.read_text(encoding='utf-8')
    # 兜底：内置简单模板
    return (
        '请对以下视频《{title}》的转录文本进行分析，提炼核心内容：\n\n'
        '{transcript}'
    )


def build_messages(template_key: str, title: str, transcript: str,
                   db: Session = None, diagram_type: str = 'mindmap') -> list[dict]:
    """
    构建 LLM messages 列表。
    template_key 保留参数兼容旧调用，实际模板从文件加载。
    transcript 超过 12000 字时自动截断。
    """
    # 超长截断
    MAX_CHARS = 12000
    TAIL_CHARS = 2000
    if len(transcript) > MAX_CHARS + TAIL_CHARS:
        transcript = (
            transcript[:MAX_CHARS]
            + f'\n\n[...中间内容已省略，原文共 {len(transcript)} 字...]\n\n'
            + transcript[-TAIL_CHARS:]
        )

    # 加载模板
    if db is not None:
        template_content = _load_template(db)
    else:
        # 无 db 时直接读默认文件
        if _DEFAULT_PROMPT_PATH.exists():
            template_content = _DEFAULT_PROMPT_PATH.read_text(encoding='utf-8')
        else:
            template_content = '请分析视频《{title}》的转录文本：\n\n{transcript}'

    # 替换占位符
    user_content = template_content.replace('{title}', title).replace('{transcript}', transcript)
    
    # 如果模板中有 {diagram_type} 占位符，替换为用户选择的类型
    user_content = user_content.replace('{diagram_type}', diagram_type)

    return [
        {'role': 'system', 'content': _DEFAULT_SYSTEM},
        {'role': 'user',   'content': user_content},
    ]


def get_template_info(db: Session) -> dict:
    """获取当前模板信息，供前端展示"""
    path = _get_template_path(db)
    is_default = (path == _DEFAULT_PROMPT_PATH)
    return {
        'path': str(path),
        'is_default': is_default,
        'exists': path.exists(),
        'name': path.name,
    }
