# ============================================================
# 数据库工具：初始化默认设置项
# 首次启动时调用，确保必要的设置键存在
# ============================================================
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from database import SessionLocal, init_db
from models import Setting


DEFAULT_SETTINGS = {
    'download_dir': str(Path.home() / 'VideoAI' / 'downloads'),
    'export_dir':   str(Path.home() / 'VideoAI' / 'exports'),
    'llm_model':    'deepseek-chat',
    'stt_provider': 'xunfei',
}


def seed_default_settings() -> None:
    """写入默认设置（仅在 key 不存在时插入，不覆盖已有值）"""
    db = SessionLocal()
    try:
        for key, value in DEFAULT_SETTINGS.items():
            exists = db.query(Setting).filter(Setting.key == key).first()
            if not exists:
                db.add(Setting(key=key, value=json.dumps(value)))
                print(f'[Seed] Inserted default: {key} = {value}')
        db.commit()
        # 确保下载目录和导出目录存在
        Path(DEFAULT_SETTINGS['download_dir']).mkdir(parents=True, exist_ok=True)
        Path(DEFAULT_SETTINGS['export_dir']).mkdir(parents=True, exist_ok=True)
        print('[Seed] Default directories ensured.')
    finally:
        db.close()


if __name__ == '__main__':
    init_db()
    seed_default_settings()
    print('[Seed] Done.')
