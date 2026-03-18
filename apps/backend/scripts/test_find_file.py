import sys, asyncio
sys.path.insert(0, r'g:\求职\项目\Resource-Seach-Summary\video-ai-desktop\backend')
from pathlib import Path
from services.download_service import _find_downloaded_file

download_dir = Path.home() / 'VideoAI' / 'downloads'
print('Download dir:', download_dir)
print('Files in dir:')
for f in download_dir.iterdir():
    print(f'  {f.name} ({f.stat().st_size} bytes)')

# 模拟 info dict
test_info = {'requested_downloads': [{'filepath': None}]}
result = _find_downloaded_file(download_dir, test_info)
print('Found file:', result)
