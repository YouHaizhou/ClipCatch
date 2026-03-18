# ============================================================
# 设置路由 — 完整实现
# ============================================================
import json
import os
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Setting

router = APIRouter()

# 默认设置
DEFAULT_SETTINGS = {
    'download_dir': str(Path.home() / 'VideoAI' / 'downloads'),
    'export_dir':   str(Path.home() / 'VideoAI' / 'exports'),
    'llm_model':    'deepseek-chat',
    'stt_provider': 'xunfei',
}

# 临时文件目录（音频提取产物）
TEMP_DIR = Path.home() / 'VideoAI' / 'temp'


def _get_setting(db: Session, key: str, default=None):
    """从数据库读取单个设置值，不存在时返回 default"""
    row = db.query(Setting).filter(Setting.key == key).first()
    if row and row.value:
        return json.loads(row.value)
    return default


def _format_size(size_bytes: int) -> str:
    """格式化字节数为人类可读大小"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024:
            return f'{size_bytes:.1f} {unit}'
        size_bytes /= 1024
    return f'{size_bytes:.1f} TB'


def _calc_cache_size() -> str:
    """计算临时目录大小"""
    if not TEMP_DIR.exists():
        return '0 B'
    total = sum(f.stat().st_size for f in TEMP_DIR.rglob('*') if f.is_file())
    return _format_size(total)


@router.get('/settings')
def get_settings(db: Session = Depends(get_db)):
    """获取所有设置项"""
    result = {}
    for key, default in DEFAULT_SETTINGS.items():
        result[key] = _get_setting(db, key, default)

    # 缓存大小
    result['cache_size'] = _calc_cache_size()

    # API Key 脱敏：只返回是否已配置
    for key_name in ['api_key_deepseek', 'api_key_zhipu', 'api_key_xunfei', 'api_key_serper']:
        val = _get_setting(db, key_name)
        short = key_name.replace('api_key_', '')
        result[f'has_{short}_key'] = bool(val)

    return {'code': 0, 'data': result}


@router.post('/settings')
def update_settings(body: dict, db: Session = Depends(get_db)):
    """批量更新设置项"""
    for key, value in body.items():
        row = db.query(Setting).filter(Setting.key == key).first()
        if row:
            row.value = json.dumps(value)
        else:
            db.add(Setting(key=key, value=json.dumps(value)))
    db.commit()
    return {'code': 0}


@router.post('/settings/test-connection')
async def test_connection(body: dict, db: Session = Depends(get_db)):
    """测试指定 API 的连通性"""
    import time
    import httpx

    provider = body.get('provider', '')
    start = time.time()

    try:
        if provider == 'deepseek':
            key = _get_setting(db, 'api_key_deepseek')
            if not key:
                return {'code': 0, 'data': {'status': 'error', 'message': 'API Key 未配置'}}
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    'https://api.deepseek.com/chat/completions',
                    headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
                    json={'model': 'deepseek-chat', 'messages': [{'role': 'user', 'content': 'hi'}], 'max_tokens': 1},
                )
            latency = int((time.time() - start) * 1000)
            if resp.status_code == 200:
                return {'code': 0, 'data': {'status': 'ok', 'latency_ms': latency, 'model': 'deepseek-chat'}}
            elif resp.status_code == 401:
                return {'code': 0, 'data': {'status': 'error', 'message': 'API Key 无效（401）'}}
            elif resp.status_code == 429:
                return {'code': 0, 'data': {'status': 'error', 'message': '配额已耗尽（429）'}}
            else:
                return {'code': 0, 'data': {'status': 'error', 'message': f'HTTP {resp.status_code}'}}

        elif provider == 'zhipu':
            key = _get_setting(db, 'api_key_zhipu')
            if not key:
                return {'code': 0, 'data': {'status': 'error', 'message': 'API Key 未配置'}}
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    'https://open.bigmodel.cn/api/paas/v4/models',
                    headers={'Authorization': f'Bearer {key}'},
                )
            latency = int((time.time() - start) * 1000)
            ok = resp.status_code in (200, 404)  # 404 说明路由不对但鉴权通过
            return {'code': 0, 'data': {'status': 'ok' if ok else 'error', 'latency_ms': latency}}

        elif provider == 'xunfei':
            key = _get_setting(db, 'api_key_xunfei')
            if not key:
                return {'code': 0, 'data': {'status': 'error', 'message': '讯飞凭证未配置'}}
            # 讯飞凭证格式：AppID|APIKey|APISecret
            parts = str(key).split('|')
            if len(parts) != 3:
                return {'code': 0, 'data': {'status': 'error', 'message': '格式错误，应为 AppID|APIKey|APISecret'}}
            latency = int((time.time() - start) * 1000)
            # 简单验证格式合法性（真正的鉴权在 STT 调用时验证）
            return {'code': 0, 'data': {'status': 'ok', 'latency_ms': latency, 'message': '格式正确，将在首次转写时验证'}}

        elif provider == 'serper':
            key = _get_setting(db, 'api_key_serper')
            if not key:
                return {'code': 0, 'data': {'status': 'error', 'message': 'API Key 未配置'}}
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    'https://google.serper.dev/search',
                    headers={'X-API-KEY': key, 'Content-Type': 'application/json'},
                    json={'q': 'test', 'num': 1},
                )
            latency = int((time.time() - start) * 1000)
            if resp.status_code == 200:
                return {'code': 0, 'data': {'status': 'ok', 'latency_ms': latency}}
            elif resp.status_code == 403:
                return {'code': 0, 'data': {'status': 'error', 'message': 'API Key 无效（403）'}}
            else:
                return {'code': 0, 'data': {'status': 'error', 'message': f'HTTP {resp.status_code}'}}

        else:
            return {'code': 1, 'message': f'未知 provider: {provider}'}

    except httpx.ConnectError:
        return {'code': 0, 'data': {'status': 'error', 'message': '网络不可达，请检查网络连接'}}
    except httpx.TimeoutException:
        return {'code': 0, 'data': {'status': 'error', 'message': '连接超时（>10s）'}}
    except Exception as e:
        return {'code': 0, 'data': {'status': 'error', 'message': str(e)}}


@router.post('/settings/clear-cache')
def clear_cache():
    """清理临时音频/图片文件"""
    if TEMP_DIR.exists():
        shutil.rmtree(TEMP_DIR)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    return {'code': 0, 'data': {'message': '缓存已清理'}}


@router.get('/settings/whisper-status')
def whisper_status(db: Session = Depends(get_db)):
    """查询本地 Whisper 模型状态"""
    from services.stt_service import get_model_status
    status = get_model_status(db)
    return {'code': 0, 'data': status}


@router.post('/settings/whisper-unload')
def whisper_unload(db: Session = Depends(get_db)):
    """卸载已加载的 Whisper 模型（更换模型路径时调用）"""
    from services.stt_service import unload_model
    path = _get_setting(db, 'whisper_model_path', '')
    unload_model(path)
    return {'code': 0, 'data': {'message': '模型已卸载'}}
