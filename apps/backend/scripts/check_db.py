import sys, json
sys.path.insert(0, r'g:\求职\项目\Resource-Seach-Summary\video-ai-desktop\backend')
from database import SessionLocal
from models import Video, DownloadTask

db = SessionLocal()
try:
    videos = db.query(Video).all()
    for v in videos:
        print(f'Video id={v.id} title_len={len(v.title) if v.title else 0}')
        print(f'  local_file_path={v.local_file_path}')
        print(f'  file_size={v.file_size}')
        print(f'  downloaded_at={v.downloaded_at}')
    print()
    tasks = db.query(DownloadTask).order_by(DownloadTask.id.desc()).limit(5).all()
    for t in tasks:
        print(f'Task id={t.id} video_id={t.video_id} status={t.status} pct={t.progress_pct}')
finally:
    db.close()
