# ============================================================
# ORM 数据模型定义
# 对应 SQLite 中的 5 张表
# ============================================================
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean,
    DateTime, ForeignKey, Text
)
from sqlalchemy.orm import relationship
from database import Base


class Video(Base):
    """视频元数据表"""
    __tablename__ = 'videos'

    id              = Column(Integer, primary_key=True, autoincrement=True)
    title           = Column(String(500), nullable=False)
    url             = Column(String(1000), nullable=False, unique=True)
    platform        = Column(String(50), nullable=False)  # youtube/bilibili/other
    duration        = Column(Integer)                      # 秒
    thumbnail_url   = Column(String(1000))
    thumbnail_path  = Column(String(500))                  # 本地缓存封面
    local_file_path = Column(String(500))                  # 下载后本地路径
    author          = Column(String(200))                  # 作者/上传者
    published_at    = Column(DateTime)                     # 视频发布时间
    file_size       = Column(Integer)                      # 字节
    quality         = Column(String(20))                   # 1080p/720p/480p/audio_only
    downloaded_at   = Column(DateTime)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)

    # 关联关系
    download_tasks  = relationship('DownloadTask', back_populates='video', cascade='all, delete-orphan')
    ai_tasks        = relationship('AITask', back_populates='video', cascade='all, delete-orphan')
    notes           = relationship('Note', back_populates='video', cascade='all, delete-orphan')


class DownloadTask(Base):
    """下载任务表"""
    __tablename__ = 'download_tasks'

    id           = Column(Integer, primary_key=True, autoincrement=True)
    video_id     = Column(Integer, ForeignKey('videos.id'), nullable=False)
    status       = Column(String(20), nullable=False, default='queued')
    # queued / downloading / paused / completed / failed
    progress_pct = Column(Float, default=0.0)             # 0.0 - 100.0
    speed_bps    = Column(Integer, default=0)              # 字节/秒
    eta_seconds  = Column(Integer)
    error_msg    = Column(Text)
    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    video        = relationship('Video', back_populates='download_tasks')


class AITask(Base):
    """AI 处理任务表"""
    __tablename__ = 'ai_tasks'

    id              = Column(Integer, primary_key=True, autoincrement=True)
    video_id        = Column(Integer, ForeignKey('videos.id'), nullable=False)
    mode            = Column(String(20), nullable=False, default='text_only')
    # text_only / multimodal
    prompt_template = Column(String(50), nullable=False, default='summary')
    # summary / timeline / meeting / keypoints
    status          = Column(String(20), nullable=False, default='queued')
    # queued / extracting / transcribing / generating / completed / failed
    audio_path      = Column(String(500))                  # 临时音频文件路径
    transcript      = Column(Text)                         # STT 结果 JSON
    error_msg       = Column(Text)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at    = Column(DateTime)

    video           = relationship('Video', back_populates='ai_tasks')
    notes           = relationship('Note', back_populates='ai_task', cascade='all, delete-orphan')


class Note(Base):
    """生成的笔记表"""
    __tablename__ = 'notes'

    id               = Column(Integer, primary_key=True, autoincrement=True)
    video_id         = Column(Integer, ForeignKey('videos.id'), nullable=False)
    ai_task_id       = Column(Integer, ForeignKey('ai_tasks.id'), nullable=False)
    markdown_content = Column(Text, nullable=False)
    word_count       = Column(Integer, default=0)
    exported_path    = Column(String(500))
    created_at       = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    video            = relationship('Video', back_populates='notes')
    ai_task          = relationship('AITask', back_populates='notes')


class Setting(Base):
    """系统配置 KV 表"""
    __tablename__ = 'settings'

    key        = Column(String(100), primary_key=True)
    value      = Column(Text)                              # JSON 序列化存储
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
