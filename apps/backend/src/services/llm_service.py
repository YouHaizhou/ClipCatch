# ============================================================
# LLM 流式摘要服务 — Resilient Gateway
# 支持多提供商降级（Groq → DeepSeek → OpenAI）
# 内置断路器（Circuit Breaker）+ 指数退避重试
# ============================================================
import asyncio
import json
import os
import random
import time
from typing import Callable, Optional
import httpx
from sqlalchemy.orm import Session
from models import Setting
from services.prompts import build_messages, get_template_info


# ============================================================
# 代理配置（懒加载，与 search_service 保持一致）
# ============================================================
def _get_proxy() -> Optional[str]:
    proxy = (
        os.environ.get('VIDEOAI_PROXY')
        or os.environ.get('HTTP_PROXY')
        or os.environ.get('http_proxy')
        or os.environ.get('HTTPS_PROXY')
        or os.environ.get('https_proxy')
    )
    if proxy:
        return proxy
    try:
        import winreg
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r'Software\Microsoft\Windows\CurrentVersion\Internet Settings'
        ) as key:
            enabled, _ = winreg.QueryValueEx(key, 'ProxyEnable')
            if enabled:
                server, _ = winreg.QueryValueEx(key, 'ProxyServer')
                if server:
                    s = str(server)
                    if '://' not in s:
                        s = 'http://' + s
                    return s
    except Exception:
        pass
    return None


# ============================================================
# 提供商配置
# ============================================================
_PROVIDERS = [
    {
        'id': 'groq',
        'name': 'Groq',
        'key_setting': 'api_key_groq',
        'url': 'https://api.groq.com/openai/v1/chat/completions',
        'default_model': 'llama3-70b-8192',
        'model_setting': None,          # Groq 用固定模型，不读 llm_model 设置
        'use_proxy': True,
    },
    {
        'id': 'deepseek',
        'name': 'DeepSeek',
        'key_setting': 'api_key_deepseek',
        'url': 'https://api.deepseek.com/chat/completions',
        'default_model': 'deepseek-chat',
        'model_setting': 'llm_model',   # 读用户设置的模型
        'use_proxy': True,
    },
    {
        'id': 'openai',
        'name': 'OpenAI',
        'key_setting': 'api_key_openai',
        'url': 'https://api.openai.com/v1/chat/completions',
        'default_model': 'gpt-4o-mini',
        'model_setting': None,
        'use_proxy': True,
    },
]


# ============================================================
# 断路器（Circuit Breaker）— 进程级内存状态
# ============================================================
class _CircuitBreaker:
    """
    三态断路器：Closed（正常）→ Open（熔断）→ Half-Open（探测）
    - failure_threshold: 连续失败 N 次后 Open
    - recovery_timeout:  Open 状态持续 N 秒后尝试 Half-Open
    """
    def __init__(self, failure_threshold: int = 3, recovery_timeout: float = 60.0):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._failures: dict[str, int] = {}          # provider_id -> 连续失败次数
        self._open_since: dict[str, float] = {}      # provider_id -> open 时间戳
        self._state: dict[str, str] = {}             # provider_id -> closed/open/half-open
        self._skip_session: set[str] = set()         # 本次会话永久跳过（如 401）

    def is_available(self, provider_id: str) -> bool:
        """返回该提供商当前是否可以发起请求"""
        if provider_id in self._skip_session:
            return False
        state = self._state.get(provider_id, 'closed')
        if state == 'closed':
            return True
        if state == 'open':
            # 检查是否到了探测时间
            since = self._open_since.get(provider_id, 0)
            if time.monotonic() - since >= self.recovery_timeout:
                self._state[provider_id] = 'half-open'
                return True
            return False
        # half-open: 允许一次探测
        return True

    def record_success(self, provider_id: str):
        self._failures[provider_id] = 0
        self._state[provider_id] = 'closed'
        self._open_since.pop(provider_id, None)

    def record_failure(self, provider_id: str, permanent: bool = False):
        """permanent=True 表示本次会话直接跳过（如 401 无效 Key）"""
        if permanent:
            self._skip_session.add(provider_id)
            return
        count = self._failures.get(provider_id, 0) + 1
        self._failures[provider_id] = count
        if count >= self.failure_threshold:
            self._state[provider_id] = 'open'
            self._open_since[provider_id] = time.monotonic()

    def reset(self):
        """重置所有状态（用于测试或手动恢复）"""
        self._failures.clear()
        self._open_since.clear()
        self._state.clear()
        self._skip_session.clear()


# 全局单例断路器
_breaker = _CircuitBreaker(failure_threshold=3, recovery_timeout=60.0)


# ============================================================
# 读取提供商配置
# ============================================================
def _get_provider_config(provider: dict, db: Session) -> Optional[dict]:
    """
    从数据库读取提供商的 API Key 和模型。
    Key 未配置时返回 None（跳过该提供商）。
    """
    key_row = db.query(Setting).filter(Setting.key == provider['key_setting']).first()
    if not key_row or not key_row.value:
        return None
    api_key = json.loads(key_row.value)
    if not api_key or not api_key.strip():
        return None

    model = provider['default_model']
    if provider.get('model_setting'):
        model_row = db.query(Setting).filter(Setting.key == provider['model_setting']).first()
        if model_row and model_row.value:
            model = json.loads(model_row.value) or model

    return {'api_key': api_key, 'model': model}


# ============================================================
# 单次流式调用（一个提供商，一次尝试）
# ============================================================
async def _stream_one(
    provider: dict,
    api_key: str,
    model: str,
    messages: list,
    on_token: Callable[[str], None],
) -> str:
    """
    向单个提供商发起流式请求，返回完整生成文本。
    抛出异常由上层处理。
    """
    proxy = _get_proxy() if provider['use_proxy'] else None
    client_kwargs: dict = {'timeout': 120}
    if proxy:
        client_kwargs['proxy'] = proxy
        client_kwargs['trust_env'] = False
    else:
        client_kwargs['trust_env'] = True

    full_content = ''
    async with httpx.AsyncClient(**client_kwargs) as client:
        async with client.stream(
            'POST',
            provider['url'],
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
                raise PermissionError(f'{provider["name"]} API Key 无效（401），已跳过该提供商')
            if resp.status_code == 429:
                raise IOError(f'{provider["name"]} 配额已耗尽（429 Rate Limit）')
            if resp.status_code != 200:
                raise RuntimeError(f'{provider["name"]} API 错误: HTTP {resp.status_code}')

            async for line in resp.aiter_lines():
                if not line or not line.startswith('data: '):
                    continue
                data_str = line[6:]
                if data_str == '[DONE]':
                    break
                try:
                    chunk = json.loads(data_str)
                    token = chunk['choices'][0]['delta'].get('content', '')
                    if token:
                        full_content += token
                        on_token(token)
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue

    return full_content


# ============================================================
# 主入口：带断路器 + 降级 + 指数退避的流式调用
# ============================================================
async def stream_summary(
    transcript: str,
    title: str,
    template_key: str,
    db: Session,
    on_token: Callable[[str], None],
    on_progress: Optional[Callable[[str, str], None]] = None,
    diagram_type: str = 'mindmap',
) -> str:
    """
    调用 LLM 流式生成摘要，内置多提供商降级 + 断路器 + 指数退避。

    降级顺序：Groq → DeepSeek → OpenAI
    （仅使用已配置 API Key 的提供商）

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
    messages = build_messages(template_key, title, transcript, db=db, diagram_type=diagram_type)
    tpl_name = get_template_info(db)['name']

    attempted: list[str] = []   # 记录已尝试的提供商名称（用于最终错误提示）
    last_error: str = ''

    for provider in _PROVIDERS:
        pid = provider['id']

        # 1. 断路器检查
        if not _breaker.is_available(pid):
            continue

        # 2. API Key 检查
        cfg = _get_provider_config(provider, db)
        if cfg is None:
            continue

        attempted.append(provider['name'])

        # 3. 带指数退避的重试（仅对 429 重试，连接失败直接切换下一个）
        max_retries = 3
        base_delay = 1.0

        for attempt in range(max_retries):
            try:
                if on_progress:
                    retry_hint = f'（第 {attempt + 1} 次尝试）' if attempt > 0 else ''
                    on_progress('generating', f'正在使用 {provider["name"]} 生成{tpl_name}{retry_hint}...')

                full_content = await _stream_one(
                    provider=provider,
                    api_key=cfg['api_key'],
                    model=cfg['model'],
                    messages=messages,
                    on_token=on_token,
                )

                if not full_content.strip():
                    raise RuntimeError(f'{provider["name"]} 返回内容为空')

                # 成功：重置断路器
                _breaker.record_success(pid)

                if on_progress:
                    on_progress('generating', f'生成完成（{provider["name"]}），共 {len(full_content)} 字')

                return full_content

            except PermissionError as e:
                # 401 无效 Key：本会话永久跳过，不重试
                _breaker.record_failure(pid, permanent=True)
                last_error = str(e)
                break  # 直接切换下一个提供商

            except IOError as e:
                # 429 Rate Limit：指数退避后重试同一提供商
                _breaker.record_failure(pid)
                last_error = str(e)
                if attempt < max_retries - 1:
                    jitter = random.uniform(0.0, 0.5)
                    delay = min(base_delay * (2 ** attempt) + jitter, 30.0)
                    if on_progress:
                        on_progress('generating',
                            f'{provider["name"]} 触发限流，{delay:.1f}s 后重试...')
                    await asyncio.sleep(delay)
                else:
                    # 重试耗尽，记录失败，切换下一提供商
                    break

            except (httpx.ConnectError, httpx.TimeoutException) as e:
                # 连接失败 / 超时：直接切换，不退避
                _breaker.record_failure(pid)
                last_error = f'{provider["name"]} 连接失败: {e}'
                break

            except Exception as e:
                # 其他错误：记录失败，切换下一提供商
                _breaker.record_failure(pid)
                last_error = str(e)
                break

    # 全部提供商均失败
    if not attempted:
        raise ValueError(
            '未配置任何 LLM API Key，请在「系统设置 → API 配置」中填写 '
            'Groq、DeepSeek 或 OpenAI 的 API Key'
        )

    raise ConnectionError(
        f'所有 LLM 提供商均不可用（已尝试：{", ".join(attempted)}）。'
        f'最后错误：{last_error}。'
        f'请检查 API Key 是否有效、网络是否畅通，或等待 60s 后重试。'
    )
