# ============================================================
# 本地 Whisper 语音转写服务
# 基于 faster-whisper（CTranslate2 加速）
#
# 支持的模型规格（用户自行下载并导入路径）：
#   tiny    (~75MB)   - 速度最快，准确率一般
#   base    (~145MB)  - 推荐入门
#   small   (~466MB)  - 推荐中文
#   medium  (~1.5GB)  - 准确率高
#   large-v3 (~3GB)   - 最准确，需要 4GB+ VRAM 或较长CPU时间
#
# 模型下载地址（任选其一）：
#   Hugging Face: https://huggingface.co/Systran/faster-whisper-small
#   ModelScope:   https://modelscope.cn/models/pkufool/faster-whisper-small
#
# 用法：下载模型文件夹（包含 model.bin + config.json + tokenizer.json 等），
#       在设置页填写文件夹路径即可。
# ============================================================
import json
from pathlib import Path
from typing import Callable, Optional
from sqlalchemy.orm import Session
from models import Setting

# 全局模型缓存（避免重复加载）
_model_cache: dict = {}  # {model_path: WhisperModel}


def _get_model_path(db: Session) -> str:
    """从数据库读取用户配置的 Whisper 模型路径"""
    row = db.query(Setting).filter(Setting.key == 'whisper_model_path').first()
    if row and row.value:
        return json.loads(row.value)
    return ''


def _get_language(db: Session) -> Optional[str]:
    """
    从数据库读取转写语言配置。
    返回值：
      'zh'  - 强制中文（默认，速度快）
      None  - 自动检测语言（支持多语言视频，稍慢）
      其他  - 任意 Whisper 支持的语言代码（如 'en'、'ja'）
    在设置页 whisper_language 键写入空字符串即可切换为自动检测。
    """
    row = db.query(Setting).filter(Setting.key == 'whisper_language').first()
    if row and row.value:
        val = json.loads(row.value)
        return val if val else None  # 空字符串 -> None（自动检测）
    return 'zh'  # 未配置时默认中文，兼容旧行为


def get_model_status(db: Session) -> dict:
    """
    检查本地 Whisper 模型状态。
    返回：{'available': bool, 'path': str, 'model_size': str, 'error': str}
    """
    path = _get_model_path(db)
    if not path:
        return {'available': False, 'path': '', 'error': '未配置模型路径'}

    p = Path(path)
    if not p.exists():
        return {'available': False, 'path': path, 'error': '路径不存在'}

    # 检查是否包含必要文件
    has_model = (p / 'model.bin').exists()
    has_config = (p / 'config.json').exists()
    if not has_model:
        return {'available': False, 'path': path, 'error': '未找到 model.bin，请确认模型文件夹正确'}

    # 尝试读取模型大小
    model_size = 'unknown'
    if has_config:
        try:
            cfg = json.loads((p / 'config.json').read_text())
            model_size = cfg.get('model_type', cfg.get('name', 'unknown'))
        except Exception:
            pass

    return {'available': True, 'path': path, 'model_size': model_size, 'error': ''}


def _load_model(model_path: str):
    """加载 faster-whisper 模型（带缓存）"""
    global _model_cache
    if model_path in _model_cache:
        return _model_cache[model_path]

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError('请安装 faster-whisper: pip install faster-whisper')

    # 自动选择设备：有 CUDA 用 GPU，否则用 CPU
    try:
        import torch
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
    except ImportError:
        device = 'cpu'

    compute_type = 'float16' if device == 'cuda' else 'int8'

    model = WhisperModel(
        model_path,
        device=device,
        compute_type=compute_type,
        local_files_only=True,  # 不联网，只用本地文件
    )
    _model_cache[model_path] = model
    return model


def unload_model(model_path: str = None) -> None:
    """卸载模型，释放内存（更换模型时调用）"""
    global _model_cache
    if model_path:
        _model_cache.pop(model_path, None)
    else:
        _model_cache.clear()


async def transcribe_audio(
    audio_path: str,
    db: Session,
    on_progress: Optional[Callable[[str, str], None]] = None,
) -> str:
    """
    使用本地 Whisper 模型将音频转写为文本。

    参数：
        audio_path:  WAV/MP3/M4A 文件路径（支持多格式）
        db:          数据库 Session（读取模型路径配置和语言配置）
        on_progress: 进度回调 (stage, message)

    返回：转写文本
    异常：RuntimeError（模型未配置/加载失败/转写失败）
    """
    import asyncio

    model_path = _get_model_path(db)
    if not model_path:
        raise RuntimeError(
            '本地 Whisper 模型未配置。\n'
            '请在设置页「语音转写」中填写模型文件夹路径。\n'
            '推荐下载 faster-whisper-small（约466MB，中文效果好）。'
        )

    audio_path_obj = Path(audio_path)
    if not audio_path_obj.exists():
        raise FileNotFoundError(f'音频文件不存在: {audio_path}')

    # 在主线程读取配置（db 操作不能在 executor 线程中执行）
    language = _get_language(db)
    lang_label = language if language else '自动检测'
    file_size_mb = audio_path_obj.stat().st_size / 1024 / 1024

    if on_progress:
        on_progress('transcribing', '加载 Whisper 模型...')

    # 在线程池中执行同步的模型加载和推理（避免阻塞事件循环）
    # 注意：on_progress 涉及 db.commit() 和 asyncio.Queue，不能在 executor 线程中直接调用
    # 必须通过 loop.call_soon_threadsafe 投递回事件循环线程执行
    loop = asyncio.get_event_loop()

    def _safe_progress(stage: str, message: str):
        """线程安全地把进度回调投递回事件循环"""
        if on_progress:
            loop.call_soon_threadsafe(on_progress, stage, message)

    def _run_transcribe():
        model = _load_model(model_path)
        _safe_progress('transcribing', f'开始转写（{file_size_mb:.1f} MB，语言：{lang_label}）...')

        segments, info = model.transcribe(
            str(audio_path_obj),
            language=language,      # None = 自动检测；'zh' = 强制中文（快）
            beam_size=5,
            vad_filter=True,        # VAD 过滤静音，减少幻觉
            vad_parameters={'min_silence_duration_ms': 500},
            word_timestamps=False,
        )

        texts = []
        total_duration = info.duration if info.duration > 0 else 1
        for seg in segments:
            texts.append(seg.text.strip())
            pct = min(seg.end / total_duration * 100, 99)
            _safe_progress('transcribing', f'转写中 {pct:.0f}%...')

        return ' '.join(t for t in texts if t)

    result = await loop.run_in_executor(None, _run_transcribe)

    if not result.strip():
        raise RuntimeError('转写结果为空，可能音频无声音或内容极短')

    if on_progress:
        on_progress('transcribing', f'转写完成，共 {len(result)} 字')

    return result


async def estimate_transcribe_time(audio_duration_seconds: float) -> str:
    """预估转写耗时（CPU 约 2-4x 实时，GPU 约 0.5x 实时）"""
    # 保守估计：CPU x3
    estimated = audio_duration_seconds * 3
    if estimated < 60:
        return f'约 {int(estimated)} 秒'
    return f'约 {int(estimated / 60)} 分钟'
