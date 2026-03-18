import sys, asyncio
sys.path.insert(0, r'g:\求职\项目\Resource-Seach-Summary\video-ai-desktop\backend')

import traceback
from database import SessionLocal
from services.download_service import extract_video_info

async def test():
    try:
        info = await extract_video_info('https://www.bilibili.com/video/BV1xx411c7mD')
        print('extract_video_info OK:', info)
    except Exception as e:
        print('extract_video_info FAIL:')
        traceback.print_exc()

asyncio.run(test())
