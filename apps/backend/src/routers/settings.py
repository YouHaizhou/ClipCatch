# ============================================================
# 设置路由 — 完整实现
# ============================================================
import json
import os
import shutil
import time
import httpx
from pathlib import Path
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Setting

router = APIRouter()

# 代理配置：从 VIDEOAI_PROXY 或 HTTP_PROXY 读取，未设置则为 None
# settings.py 中所有 httpx 调用都通过 _http_client() / _http_client_no_proxy() 创建，
# 不依赖 httpx 自动读取环境变量（trust_env=False），避免国内 API 被误导向代理
# 懒加载代理，避免模块导入时环境变量未就绪
def _get_proxy() -> str | None:
    return os.environ.get("VIDEOAI_PROXY") or os.environ.get("TWS_PROXY") or os.environ.get("HTTP_PROXY") or os.environ.get("http_proxy") or None

DEFAULT_SETTINGS = {
    "download_dir": str(Path.home() / "VideoAI" / "downloads"),
    "export_dir":   str(Path.home() / "VideoAI" / "exports"),
    "llm_model":    "deepseek-chat",
    "stt_provider": "xunfei",
}

TEMP_DIR = Path.home() / "VideoAI" / "temp"


def _get_setting(db: Session, key: str, default=None):
    row = db.query(Setting).filter(Setting.key == key).first()
    if row and row.value:
        return json.loads(row.value)
    return default


def _format_size(size_bytes: int) -> str:
    for unit in ["B", "KB", "MB", "GB"]:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"


def _calc_cache_size() -> str:
    if not TEMP_DIR.exists():
        return "0 B"
    total = sum(f.stat().st_size for f in TEMP_DIR.rglob("*") if f.is_file())
    return _format_size(total)


def _http_client(timeout: int = 10) -> httpx.AsyncClient:
    """
    国外 API 专用客户端（DeepSeek/OpenAI/Groq/Gemini）。
    trust_env=False：禁止 httpx 自动读取 HTTP_PROXY 环境变量，
    代理完全由 _PROXY 变量手动控制，避免国内 API 被意外代理。
    """
    proxy = _get_proxy()
    kwargs: dict = {"timeout": timeout, "trust_env": False}
    if proxy:
        kwargs["proxy"] = proxy
    return httpx.AsyncClient(**kwargs)


def _ok(latency_ms: int, **extra) -> dict:
    """构造统一的成功响应（camelCase）"""
    return {"code": 0, "data": {"status": "ok", "latencyMs": latency_ms, **extra}}


def _err(msg: str) -> dict:
    """构造统一的错误响应"""
    return {"code": 0, "data": {"status": "error", "message": msg}}


@router.get("/settings/enabled-keys")
def get_enabled_keys(db: Session = Depends(get_db)):
    """获取所有 API Key 的启用状态"""
    keys = ["api_key_deepseek", "api_key_openai", "api_key_groq", "api_key_gemini", "api_key_serper"]
    result = {}
    for key in keys:
        enabled = _get_setting(db, f"{key}_enabled")
        result[key] = enabled if enabled is not None else True
    return {"code": 0, "data": result}


@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    """获取所有设置项"""
    try:
        result = {}
        for key, default in DEFAULT_SETTINGS.items():
            result[key] = _get_setting(db, key, default)
        result["cache_size"] = _calc_cache_size()
        for key_name in [
            "api_key_deepseek", "api_key_zhipu", "api_key_xunfei", "api_key_serper",
            "api_key_openai", "api_key_groq", "api_key_gemini",
        ]:
            val = _get_setting(db, key_name)
            short = key_name.replace("api_key_", "")
            result[f"has_{short}_key"] = bool(val)
            enabled = _get_setting(db, f"{key_name}_enabled")
            result[f"{short}_enabled"] = enabled if enabled is not None else True
        return {"code": 0, "data": result}
    except Exception:
        import traceback
        traceback.print_exc()
        return {"code": 1, "message": "获取设置失败"}


@router.post("/settings")
def update_settings(body: dict, db: Session = Depends(get_db)):
    """批量更新设置项"""
    try:
        for key, value in body.items():
            row = db.query(Setting).filter(Setting.key == key).first()
            if row:
                row.value = json.dumps(value)
            else:
                db.add(Setting(key=key, value=json.dumps(value)))
        db.commit()
        return {"code": 0, "data": None}
    except Exception:
        import traceback
        traceback.print_exc()
        return {"code": 1, "message": "更新设置失败"}

@router.post("/settings/test-connection")
async def test_connection(body: dict, db: Session = Depends(get_db)):
    """测试指定 API 的连通性"""
    provider = body.get("provider", "")
    start = time.time()

    def elapsed_ms() -> int:
        return int((time.time() - start) * 1000)

    try:
        if provider == "deepseek":
            key = _get_setting(db, "api_key_deepseek")
            if not key:
                return _err("API Key 未配置")
            async with _http_client() as client:
                resp = await client.post(
                    "https://api.deepseek.com/chat/completions",
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    json={"model": "deepseek-chat", "messages": [{"role": "user", "content": "hi"}], "max_tokens": 1},
                )
            ms = elapsed_ms()
            if resp.status_code == 200:
                return _ok(ms, model="deepseek-chat")
            elif resp.status_code == 401:
                return _err("API Key 无效（401）")
            elif resp.status_code == 429:
                return _err("配额已耗尽（429）")
            else:
                return _err(f"HTTP {resp.status_code}")

        elif provider == "zhipu":
            key = _get_setting(db, "api_key_zhipu")
            if not key:
                return _err("API Key 未配置")
            async with _http_client() as client:
                resp = await client.get(
                    "https://open.bigmodel.cn/api/paas/v4/models",
                    headers={"Authorization": f"Bearer {key}"},
                )
            ms = elapsed_ms()
            return _ok(ms) if resp.status_code in (200, 404) else _err(f"HTTP {resp.status_code}")

        elif provider == "xunfei":
            key = _get_setting(db, "api_key_xunfei")
            if not key:
                return _err("讯飞凭证未配置")
            parts = str(key).split("|")
            if len(parts) != 3:
                return _err("格式错误，应为 AppID|APIKey|APISecret")
            return _ok(elapsed_ms(), message="格式正确，将在首次转写时验证")

        elif provider == "serper":
            key = _get_setting(db, "api_key_serper")
            if not key:
                return _err("API Key 未配置")
            # Serper 国内可达，不走代理直连
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    "https://google.serper.dev/search",
                    headers={"X-API-KEY": key, "Content-Type": "application/json"},
                    json={"q": "test", "num": 1},
                )
            ms = elapsed_ms()
            if resp.status_code == 200:
                return _ok(ms)
            elif resp.status_code == 403:
                return _err("API Key 无效（403）")
            else:
                return _err(f"HTTP {resp.status_code}")

        elif provider == "openai":
            key = _get_setting(db, "api_key_openai")
            if not key:
                return _err("API Key 未配置")
            async with _http_client() as client:
                resp = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {key}"},
                )
            ms = elapsed_ms()
            if resp.status_code == 200:
                return _ok(ms)
            elif resp.status_code == 401:
                return _err("API Key 无效（401）")
            else:
                return _err(f"HTTP {resp.status_code}")

        elif provider == "groq":
            key = _get_setting(db, "api_key_groq")
            if not key:
                return _err("API Key 未配置")
            async with _http_client() as client:
                resp = await client.get(
                    "https://api.groq.com/openai/v1/models",
                    headers={"Authorization": f"Bearer {key}"},
                )
            ms = elapsed_ms()
            return _ok(ms) if resp.status_code == 200 else _err(f"HTTP {resp.status_code}")

        elif provider == "gemini":
            key = _get_setting(db, "api_key_gemini")
            if not key:
                return _err("API Key 未配置")
            async with _http_client() as client:
                resp = await client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models?key={key}",
                )
            ms = elapsed_ms()
            if resp.status_code == 200:
                return _ok(ms)
            elif resp.status_code == 400:
                return _err("API Key 无效")
            else:
                return _err(f"HTTP {resp.status_code}")

        else:
            return {"code": 1, "message": f"未知 provider: {provider}"}

    except httpx.ConnectError:
        return _err("网络不可达，Key 已保存（请检查代理或网络）")
    except httpx.TimeoutException:
        return _err("连接超时（>10s），Key 已保存（请检查代理或网络）")
    except Exception as e:
        return _err(str(e))


@router.post("/settings/clear-cache")
def clear_cache():
    """清理临时音频/图片文件"""
    try:
        if TEMP_DIR.exists():
            shutil.rmtree(TEMP_DIR)
        TEMP_DIR.mkdir(parents=True, exist_ok=True)
        return {"code": 0, "data": {"message": "缓存已清理"}}
    except Exception:
        import traceback
        traceback.print_exc()
        return {"code": 1, "message": "清理缓存失败"}


@router.get("/settings/whisper-status")
def whisper_status(db: Session = Depends(get_db)):
    """查询本地 Whisper 模型状态"""
    try:
        from services.stt_service import get_model_status
        status = get_model_status(db)
        return {"code": 0, "data": status}
    except Exception:
        import traceback
        traceback.print_exc()
        return {"code": 1, "message": "查询模型状态失败"}


@router.post("/settings/whisper-unload")
def whisper_unload(db: Session = Depends(get_db)):
    """卸载已加载的 Whisper 模型（更换模型路径时调用）"""
    try:
        from services.stt_service import unload_model
        path = _get_setting(db, "whisper_model_path", "")
        unload_model(path)
        return {"code": 0, "data": {"message": "模型已卸载"}}
    except Exception:
        import traceback
        traceback.print_exc()
        return {"code": 1, "message": "卸载模型失败"}


@router.get("/settings/prompt-template")
def get_prompt_template(db: Session = Depends(get_db)):
    """获取当前提示词模板信息"""
    try:
        from services.prompts import get_template_info
        info = get_template_info(db)
        # 同时返回模板内容（用于前端预览）
        from pathlib import Path
        content = ''
        if info['exists']:
            content = Path(info['path']).read_text(encoding='utf-8')
        return {"code": 0, "data": {**info, "content": content}}
    except Exception:
        import traceback
        traceback.print_exc()
        return {"code": 1, "message": "获取模板信息失败"}


@router.post("/settings/prompt-template")
def set_prompt_template(body: dict, db: Session = Depends(get_db)):
    """设置提示词模板文件路径（传空字符串恢复默认）"""
    try:
        path = body.get("path", "").strip()
        row = db.query(Setting).filter(Setting.key == "prompt_template_path").first()
        if row:
            row.value = json.dumps(path)
        else:
            db.add(Setting(key="prompt_template_path", value=json.dumps(path)))
        db.commit()
        return {"code": 0, "data": {"message": "模板路径已更新"}}
    except Exception:
        import traceback
        traceback.print_exc()
        return {"code": 1, "message": "设置模板路径失败"}
