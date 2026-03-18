# ============================================================
# 数据库连接与初始化
# 使用 SQLAlchemy 2.x ORM，数据库文件存放在用户家目录
# ============================================================
import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# 数据库文件路径：~/VideoAI/app.db
DB_DIR = Path.home() / 'VideoAI'
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / 'app.db'

# 创建 SQLite 引擎
# check_same_thread=False 允许多线程访问（FastAPI 异步环境需要）
engine = create_engine(
    f'sqlite:///{DB_PATH}',
    connect_args={'check_same_thread': False},
    echo=False,  # 生产环境关闭 SQL 日志
)

# Session 工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """所有 ORM 模型的基类"""
    pass


def get_db():
    """FastAPI 依赖注入：获取数据库 Session，用完自动关闭"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """初始化数据库：创建所有表（如果不存在）"""
    # 必须先导入所有模型，才能让 Base.metadata 感知到表定义
    import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    print(f'[DB] Initialized at {DB_PATH}')
