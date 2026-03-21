# ============================================================
# Proxy Sentinel — 跨环境代理自适应诊断服务
# 检测：WSL环境、代理来源、外网连通性、精准错误码映射
# ============================================================
import asyncio
import os
import platform
import time
from typing import Optional
import httpx


# ============================================================
# 环境检测
# ============================================================
def _is_wsl() -> bool:
    """项目运行在 Windows 本地，始终返回 False"""
    return False


def _get_proxy_info() -> dict:
    """
    读取当前生效的代理配置。
    返回：{ source: 'env'|'winreg'|'none', address: str|None }
    """
    # 1. 环境变量优先
    proxy = (
        os.environ.get('VIDEOAI_PROXY')
        or os.environ.get('TWS_PROXY')
        or os.environ.get('HTTP_PROXY')
        or os.environ.get('http_proxy')
        or os.environ.get('HTTPS_PROXY')
        or os.environ.get('https_proxy')
    )
    if proxy:
        return {'source': 'env', 'address': proxy}

    # 2. Windows 注册表
    try:
        import winreg  # noqa: F401 — 仅 Windows 原生 Python 可用
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
                    return {'source': 'winreg', 'address': s}
    except Exception:
        pass

    return {'source': 'none', 'address': None}


# ============================================================
# 错误码映射
# ============================================================
def _classify_error(exc: Exception) -> dict:
    """
    将底层网络异常映射为用户可读的提示 + 建议操作。
    返回：{ error_code: str, hint: str, suggestion: str }
    """
    msg = str(exc)

    # WinError 10061: ECONNREFUSED — 目标端口未监听（代理客户端未启动）
    if '10061' in msg or 'ECONNREFUSED' in msg or 'Connection refused' in msg:
        return {
            'error_code': 'ECONNREFUSED',
            'hint': '本地代理端口未开启',
            'suggestion': '请启动代理客户端（Clash / V2Ray / Shadowsocks）',
        }

    # WinError 10060: ETIMEDOUT — 防火墙拦截或目标不可达
    if '10060' in msg or 'ETIMEDOUT' in msg or 'timed out' in msg.lower():
        return {
            'error_code': 'ETIMEDOUT',
            'hint': '连接超时，防火墙可能拦截了该请求',
            'suggestion': '检查防火墙规则，或尝试更换代理节点',
        }

    # SSL 证书错误
    if 'SSL' in msg or 'certificate' in msg.lower():
        return {
            'error_code': 'SSL_ERROR',
            'hint': 'SSL 证书验证失败',
            'suggestion': '可能存在中间人拦截，检查企业证书或代理设置',
        }

    # 通用连接错误
    if isinstance(exc, httpx.ConnectError):
        return {
            'error_code': 'CONNECT_ERROR',
            'hint': '无法建立连接',
            'suggestion': '请检查网络连接或代理配置',
        }

    # 超时
    if isinstance(exc, httpx.TimeoutException):
        return {
            'error_code': 'TIMEOUT',
            'hint': '请求超时（>5s）',
            'suggestion': '网络较慢或目标服务不可达，请检查代理',
        }

    return {
        'error_code': 'UNKNOWN',
        'hint': f'未知错误: {msg[:80]}',
        'suggestion': '请检查网络或代理配置',
    }


# ============================================================
# 单项连通性检测
# ============================================================
async def _check_endpoint(
    name: str,
    url: str,
    use_proxy: bool,
    proxy_address: Optional[str],
    timeout: float = 5.0,
) -> dict:
    """
    检测单个端点的连通性。
    返回：{ name, ok, latency_ms, error_code?, hint?, suggestion? }
    """
    client_kwargs: dict = {'timeout': timeout, 'trust_env': False}
    if use_proxy and proxy_address:
        client_kwargs['proxy'] = proxy_address
    elif not use_proxy:
        pass  # 直连，不使用代理
    else:
        # 需要代理但未配置
        return {
            'name': name,
            'ok': False,
            'latency_ms': 0,
            'error_code': 'NO_PROXY',
            'hint': f'访问 {name} 需要代理，但未检测到代理配置',
            'suggestion': '请配置代理客户端，或开启 TUN 模式',
        }

    start = time.monotonic()
    try:
        async with httpx.AsyncClient(**client_kwargs) as client:
            resp = await client.get(url)
        latency_ms = int((time.monotonic() - start) * 1000)
        return {'name': name, 'ok': resp.status_code < 500, 'latency_ms': latency_ms}
    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        err_info = _classify_error(exc)
        return {
            'name': name,
            'ok': False,
            'latency_ms': latency_ms,
            **err_info,
        }


# ============================================================
# 主诊断入口
# ============================================================
async def run_diagnostics() -> dict:
    """
    执行完整的网络诊断，并行检测所有端点。

    返回结构：
    {
      is_wsl: bool,
      proxy_source: 'env' | 'winreg' | 'none',
      proxy_address: str | None,
      suggestion: str | None,   # 最高优先级的全局建议
      checks: [
        { name, ok, latency_ms, error_code?, hint?, suggestion? },
        ...
      ]
    }
    """
    is_wsl = _is_wsl()
    proxy_info = _get_proxy_info()
    proxy_address = proxy_info['address']
    proxy_source = proxy_info['source']

    # 检测项：(名称, URL, 是否需要代理)
    checks_config = [
        ('Bilibili',  'https://api.bilibili.com/x/web-interface/nav', False),
        ('Serper',    'https://google.serper.dev',                     False),
        ('DeepSeek',  'https://api.deepseek.com',                      False),  # 国内可直连
        ('YouTube',   'https://www.youtube.com',                       True),
        ('Twitter/X', 'https://twitter.com',                           True),
    ]

    # 并行执行所有检测
    tasks = [
        _check_endpoint(name, url, needs_proxy, proxy_address)
        for name, url, needs_proxy in checks_config
    ]
    results = await asyncio.gather(*tasks)

    # 生成全局建议
    global_suggestion: Optional[str] = None

    # WSL + 无代理：建议 TUN 模式
    if proxy_source == 'none':
        global_suggestion = (
            'Windows 环境未检测到代理配置。如需访问 YouTube/DeepSeek 等境外服务，'
            '请启动代理客户端并通过环境变量 VIDEOAI_PROXY=http://127.0.0.1:端口 指定代理地址。'
        )
    # 有代理但外网均失败，且有 ECONNREFUSED：代理端口未开启
    elif proxy_address:
        foreign_checks = [r for r in results if r['name'] in ('DeepSeek', 'YouTube')]
        all_refused = all(
            not r['ok'] and r.get('error_code') == 'ECONNREFUSED'
            for r in foreign_checks
        )
        if all_refused:
            global_suggestion = (
                f'检测到代理配置（{proxy_address}），但代理端口拒绝连接。'
                '请确认代理客户端已启动，并检查端口号是否正确。'
            )
    # (elif proxy_source == 'none' 已在最上方处理，此处无需重复)

    return {
        'is_wsl': is_wsl,
        'proxy_source': proxy_source,
        'proxy_address': proxy_address,
        'suggestion': global_suggestion,
        'checks': list(results),
    }
