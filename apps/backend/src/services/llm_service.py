# ============================================================
# LLM 流式摘要服务 — DeepSeek API
# 支持流式 token 输出，通过回调推送给 SSE 层
# ============================================================
import json
import os
from typing import AsyncGenerator, Callable, Optional
import httpx
from sqlalchemy.orm import Session
from models import Setting
from services.prompts import build_messages, PROMPTS

_PROXY = os.environ.get('HTTP_PROXY') or os.environ.get('http_proxy')

DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'


def _get_api_key(db: Session) -> str:
    row = db.query(Setting).filter(Setting.key == 'api_key_deepseek').first()
    if not row or not row.value:
        raise ValueError('DeepSeek API Key 未配置，请在设置页填写')
    return json.loads(row.value)


def _get_model(db: Session) -> str:
    row = db.query(Setting).filter(Setting.key == 'llm_model').first()
    if row and row.value:
        return json.loads(row.value)
    return 'deepseek-chat'


async def stream_summary(
    transcript: str,
    title: str,
    template_key: str,
    db: Session,
    on_token: Callable[[str], None],
    on_progress: Optional[Callable[[str, str], None]] = None,
) -> str:
    """
    调用 DeepSeek API 流式生成摘要。

    参数：
        transcript:   STT 转写文本
        title:        视频标题
        template_key: 'summary' | 'timeline' | 'meeting' | 'keypoints'
        db:           数据库 Session
        on_token:     每个 token 的回调，用于 SSE 推送
        on_progress:  阶段进度回调

    返回：
        完整生成的 Markdown 文本
    """
    api_key = _get_api_key(db)
    model = _get_model(db)
    messages = build_messages(template_key, title, transcript)

    if on_progress:
        tpl_name = PROMPTS.get(template_key, PROMPTS['summary'])['name']
        on_progress('generating', f'正在使用 {model} 生成{tpl_name}...')

    full_content = ''

    try:
        async with httpx.AsyncClient(timeout=120, proxy=_PROXY) as client:
            async with client.stream(
                'POST',
                DEEPSEEK_API_URL,
                headers={
                    'Authorization': f'Bearer {api_key}',
                    'Content-Type': 'application/json',
                },
                json={
                    'model': model,
                    'messages': messages,
                    'stream': True,
                    'temperature': 0.7,
                    'max_tokens': 4096,
                },
            ) as resp:
                if resp.status_code == 401:
                    raise ValueError('DeepSeek API Key 无效（401）')
                if resp.status_code == 429:
                    raise ValueError('DeepSeek API 配额已耗尽（429）')
                if resp.status_code != 200:
                    raise ValueError(f'DeepSeek API 错误: HTTP {resp.status_code}')

                async for line in resp.aiter_lines():
                    if not line or not line.startswith('data: '):
                        continue
                    data_str = line[6:]  # 去掉 'data: ' 前缀
                    if data_str == '[DONE]':
                        break
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk['choices'][0]['delta']
                        token = delta.get('content', '')
                        if token:
                            full_content += token
                            on_token(token)
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
    except httpx.ConnectError:
        raise ConnectionError('DeepSeek API 连接失败，请检查网络或代理配置')
    except httpx.TimeoutException:
        raise ConnectionError('DeepSeek API 连接超时，请检查网络或代理配置')

    if not full_content.strip():
        raise RuntimeError('LLM 返回内容为空')

    if on_progress:
        on_progress('generating', f'生成完成，共 {len(full_content)} 字')

    return full_content
