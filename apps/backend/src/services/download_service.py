# ============================================================
# 下载服务 — yt-dlp 封装
# 所有数据库操作使用独立 Session（try/finally），不依赖请求生命周期
# ============================================================
import asyncio
import json
import os
import sys
import shutil
from pathlib import Path
from typing import Callable, Optional
import yt_dlp
from sqlalchemy.orm import Session
from models import Video, DownloadTask, Setting
from datetime import datetime

_pause_events: dict[int, asyncio.Event] = {}
_cancel_flags: dict[int, bool] = {}
_paused_flags: dict[int, bool] = {}  # 暂停标志（区别于取消）
_progress_callbacks: dict[int, Callable] = {}


def _new_db():
    """创建独立的数据库 Session"""
    from database import SessionLocal
    return SessionLocal()


def _find_ffmpeg_dir() -> str:
    """
    返回 ffmpeg 可执行文件所在目录（供 yt-dlp ffmpeg_location 使用）。
    优先级：系统PATH > WinGet > 打包后 resources > 开发环境 resources
    """
    # 1. 系统 PATH
    system_ffmpeg = shutil.which('ffmpeg')
    if system_ffmpeg:
        return str(Path(system_ffmpeg).parent)

    # 2. WinGet 安装路径
    winget_base = Path(os.environ.get('LOCALAPPDATA', '')) / 'Microsoft' / 'WinGet' / 'Packages'
    if winget_base.exists():
        for pkg_dir in winget_base.iterdir():
            if 'ffmpeg' in pkg_dir.name.lower() or 'Gyan.FFmpeg' in pkg_dir.name:
                for ffmpeg_exe in pkg_dir.rglob('ffmpeg.exe'):
                    return str(ffmpeg_exe.parent)

    # 3. 打包后路径
    if getattr(sys, 'frozen', False):
        bundled = Path(sys.executable).parent / 'resources' / 'ffmpeg' / 'win'
        if (bundled / 'ffmpeg.exe').exists():
            return str(bundled)

    # 4. 开发环境：从本文件向上三级到项目根
    dev_path = Path(__file__).parent.parent.parent / 'resources' / 'ffmpeg' / 'win'
    if (dev_path / 'ffmpeg.exe').exists():
        return str(dev_path)

    return ''  # 找不到时返回空，yt-dlp 会自行在 PATH 中查找


def _get_download_dir(db: Session) -> Path:
    row = db.query(Setting).filter(Setting.key == 'download_dir').first()
    if row and row.value:
        d = Path(json.loads(row.value))
    else:
        d = Path.home() / 'VideoAI' / 'downloads'
    d.mkdir(parents=True, exist_ok=True)
    return d


def register_progress_callback(task_id: int, callback: Callable) -> None:
    _progress_callbacks[task_id] = callback


def unregister_progress_callback(task_id: int) -> None:
    _progress_callbacks.pop(task_id, None)


def _notify(task_id: int, status: str, pct: float, speed: int, eta: int,
            local_file_path: str = '', error_msg: str = '') -> None:
    callback = _progress_callbacks.get(task_id)
    if callback:
        callback({
            'task_id': task_id,
            'status': status,
            'progress_pct': pct,
            'speed_bps': speed,
            'eta_seconds': eta,
            'local_file_path': local_file_path,
            'error_msg': error_msg,
        })


async def start_download(
    task_id: int,
    video_id: int,
    url: str,
    quality: str,
    db: Session = None,  # 保留签名兼容，内部统一使用独立 Session
) -> None:
    _pause_events[task_id] = asyncio.Event()
    _pause_events[task_id].set()
    _cancel_flags[task_id] = False

    download_dir = Path.home() / 'VideoAI' / 'downloads'
    db1 = _new_db()
    try:
        task_row = db1.query(DownloadTask).filter(DownloadTask.id == task_id).first()
        if task_row:
            task_row.status = 'downloading'
            task_row.updated_at = datetime.utcnow()
            db1.commit()
        download_dir = _get_download_dir(db1)
    finally:
        db1.close()

    # 格式回退链：优先带 ffmpeg 合并的高质量，回退到单流无需合并
    # ffmpeg_location 注入后，合并格式也能正常工作
    format_map = {
        '1080p':      'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]/best',
        '720p':       'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]/best',
        '480p':       'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]/best',
        'audio_only': 'bestaudio/best',
    }
    ydl_format = format_map.get(quality, format_map['720p'])
    ffmpeg_dir = _find_ffmpeg_dir()

    def progress_hook(d: dict) -> None:
        callback = _progress_callbacks.get(task_id)
        if not callback:
            return
        status = d.get('status', '')
        if status == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            downloaded = d.get('downloaded_bytes', 0)
            pct = (downloaded / total * 100) if total > 0 else 0
            speed = d.get('speed', 0) or 0
            eta = d.get('eta', 0) or 0
            callback({
                'task_id': task_id,
                'status': 'downloading',
                'progress_pct': round(pct, 1),
                'speed_bps': int(speed),
                'eta_seconds': int(eta),
            })
        elif status == 'finished':
            callback({
                'task_id': task_id,
                'status': 'finished_fragment',
                'progress_pct': 99.0,
                'speed_bps': 0,
                'eta_seconds': 0,
            })

    ydl_opts = {
        'format': ydl_format,
        'outtmpl': str(download_dir / '%(title)s.%(ext)s'),
        'progress_hooks': [progress_hook],
        'quiet': True,
        'no_warnings': True,
        'merge_output_format': 'mp4',
        'noplaylist': True,
    }
    # 仅在找到 ffmpeg 时注入路径（空字符串会让 yt-dlp 报错）
    if ffmpeg_dir:
        ydl_opts['ffmpeg_location'] = ffmpeg_dir

    loop = asyncio.get_event_loop()
    try:
        def run_ytdlp():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                return ydl.extract_info(url, download=True)

        info = await loop.run_in_executor(None, run_ytdlp)

        if _cancel_flags.get(task_id):
            _notify(task_id, 'failed', 0, 0, 0, error_msg='已取消')
            return

        filepath = _find_downloaded_file(download_dir, info)
        file_size = filepath.stat().st_size if filepath and filepath.exists() else 0

        db2 = _new_db()
        try:
            video_row = db2.query(Video).filter(Video.id == video_id).first()
            if video_row:
                video_row.local_file_path = str(filepath) if filepath else None
                video_row.file_size = file_size
                video_row.quality = quality
                video_row.downloaded_at = datetime.utcnow()
            task_row = db2.query(DownloadTask).filter(DownloadTask.id == task_id).first()
            if task_row:
                task_row.status = 'completed'
                task_row.progress_pct = 100.0
                task_row.updated_at = datetime.utcnow()
            db2.commit()
        finally:
            db2.close()

        _notify(task_id, 'completed', 100.0, 0, 0,
                local_file_path=str(filepath) if filepath else '')

    except Exception as e:
        db3 = _new_db()
        try:
            task_row = db3.query(DownloadTask).filter(DownloadTask.id == task_id).first()
            if task_row:
                task_row.status = 'failed'
                task_row.error_msg = str(e)
                task_row.updated_at = datetime.utcnow()
            db3.commit()
        finally:
            db3.close()
        _notify(task_id, 'failed', 0, 0, 0, error_msg=str(e))
    finally:
        _pause_events.pop(task_id, None)
        _cancel_flags.pop(task_id, None)
        unregister_progress_callback(task_id)


def pause_task(task_id: int) -> bool:
    """暂停下载（实际等同取消，yt-dlp 不支持真正暂停）"""
    _cancel_flags[task_id] = True
    return True


def resume_task(task_id: int) -> bool:
    """恢复下载（仅重置标志，需前端重新发起请求）"""
    _cancel_flags[task_id] = False
    event = _pause_events.get(task_id)
    if event:
        event.set()
        return True
    return False


def cancel_task(task_id: int) -> bool:
    """取消下载"""
    _cancel_flags[task_id] = True
    return True


def _find_downloaded_file(download_dir: Path, info: Optional[dict]) -> Optional[Path]:
    if not info:
        return None
    filename = info.get('requested_downloads', [{}])[0].get('filepath')
    if filename:
        p = Path(filename)
        if p.exists():
            return p
    files = sorted(download_dir.glob('*.mp4'), key=lambda f: f.stat().st_mtime, reverse=True)
    return files[0] if files else None


async def extract_video_info(url: str) -> dict:
    ydl_opts = {'quiet': True, 'no_warnings': True, 'skip_download': True}
    loop = asyncio.get_event_loop()

    def run():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            return ydl.extract_info(url, download=False)

    info = await loop.run_in_executor(None, run)
    if not info:
        raise ValueError('无法解析该链接')

    platform = 'youtube' if 'youtube.com' in url or 'youtu.be' in url \
        else 'bilibili' if 'bilibili.com' in url else 'other'

    return {
        'title': info.get('title', '未知标题'),
        'url': url,
        'platform': platform,
        'duration': info.get('duration', 0),
        'thumbnail_url': info.get('thumbnail', ''),
        'author': info.get('uploader', ''),
        'published_at': info.get('upload_date', ''),
    }
