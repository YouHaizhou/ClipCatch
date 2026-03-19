# ============================================================
# FastAPI 后端入口
# ============================================================
import os
# 修复 ctranslate2 + onnxruntime 同时加载导致的 OpenMP 冲突
os.environ.setdefault('KMP_DUPLICATE_LIB_OK', 'TRUE')
# 代理配置：不自动注入代理环境变量，避免国内平台请求被误导向代理
# 用户若需要代理，请在启动前自行设置 HTTP_PROXY 或 VIDEOAI_PROXY 环境变量
# 例：set VIDEOAI_PROXY=http://127.0.0.1:7897

import argparse
import base64
import uvicorn
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from database import init_db
from routers import search, download, ai, library, settings, notes, twitter

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=57891)
parser.add_argument('--host', type=str, default='127.0.0.1')
args, _ = parser.parse_known_args()

app = FastAPI(title='VideoAI Backend', version='1.0.0', docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        'http://localhost:5173', 'http://127.0.0.1:5173',
        'http://localhost:5174', 'http://127.0.0.1:57891',
        'app://.', 'file://',
    ],
    allow_methods=['*'],
    allow_headers=['*'],
    allow_credentials=True,
)

app.include_router(search.router, prefix='/api')
app.include_router(download.router, prefix='/api')
app.include_router(ai.router, prefix='/api')
app.include_router(library.router, prefix='/api')
app.include_router(settings.router, prefix='/api')
app.include_router(notes.router, prefix='/api')
app.include_router(twitter.router, prefix='/api')

FALLBACK_PNG = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
)


@app.on_event('startup')
async def startup():
    init_db()
    from seed import seed_default_settings
    seed_default_settings()


@app.get('/health')
async def health():
    return {'status': 'ok'}


@app.get('/api/proxy/image')
async def proxy_image(url: str):
    """
    图片代理：绕过 B 站等平台防盗链，先获取首页 Cookie 再请求图片。
    """
    try:
        if 'hdslb.com' in url or 'bilibili.com' in url:
            referer = 'https://www.bilibili.com/'
        elif 'ytimg.com' in url or 'youtube.com' in url:
            referer = 'https://www.youtube.com/'
        else:
            referer = url

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': referer,
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
        }

        # YouTube/Twitter 封面需走代理；无代理时直接返回 fallback 避免绿幕
        _proxy = os.environ.get('VIDEOAI_PROXY') or os.environ.get('HTTP_PROXY') or os.environ.get('http_proxy')
        needs_proxy = 'ytimg.com' in url or 'youtube.com' in url or 'twimg.com' in url
        if needs_proxy and not _proxy:
            # 无代理无法获取 YouTube/Twitter 图片，返回 204 让前端 onError 触发 fallback UI
            from fastapi.responses import Response as FR
            return FR(status_code=204)
        client_kwargs: dict = {'timeout': 15, 'follow_redirects': True, 'trust_env': False}
        if needs_proxy and _proxy:
            client_kwargs['proxy'] = _proxy
        async with httpx.AsyncClient(**client_kwargs) as client:
            if 'hdslb.com' in url or 'bilibili.com' in url:
                try:
                    await client.get('https://www.bilibili.com/', timeout=4,
                                     headers={'User-Agent': headers['User-Agent']})
                except Exception:
                    pass
            resp = await client.get(url, headers=headers)

        ct = resp.headers.get('content-type', '')
        if resp.status_code == 200 and ('image' in ct or len(resp.content) > 500):
            return Response(
                content=resp.content,
                media_type=ct if 'image' in ct else 'image/jpeg',
                headers={'Cache-Control': 'public, max-age=86400'},
            )
    except Exception:
        pass
    return Response(content=FALLBACK_PNG, media_type='image/png')


if __name__ == '__main__':
    uvicorn.run('main:app', host=args.host, port=args.port, log_level='info', reload=False)
