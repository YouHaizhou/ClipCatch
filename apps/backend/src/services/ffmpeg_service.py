# ============================================================
# FFmpeg 音频提取服务
# 从本地视频文件提取 16kHz 单声道 WAV，供 STT 使用
# FFmpeg 需提前安装并在 PATH 中，或放置于 resources/ffmpeg/win/
# ============================================================
import asyncio
import os
import sys
from pathlib import Path

# 临时音频输出目录
TEMP_DIR = Path.home() / 'VideoAI' / 'temp'
TEMP_DIR.mkdir(parents=True, exist_ok=True)


def _find_ffmpeg() -> str:
    """
    查找 FFmpeg 可执行文件路径。
    优先级：
    1. 系统 PATH 中的 ffmpeg
    2. WinGet 安装的常见路径
    3. 打包后 resources/ffmpeg/win/ffmpeg.exe
    4. 开发环境 resources 目录
    """
    import shutil
    # 1. 优先系统 PATH
    system_ffmpeg = shutil.which('ffmpeg')
    if system_ffmpeg:
        return system_ffmpeg

    # 2. WinGet 安装路径（Windows 常见）
    winget_base = Path(os.environ.get('LOCALAPPDATA', '')) / 'Microsoft' / 'WinGet' / 'Packages'
    if winget_base.exists():
        for pkg_dir in winget_base.iterdir():
            if 'ffmpeg' in pkg_dir.name.lower() or 'Gyan.FFmpeg' in pkg_dir.name:
                for ffmpeg_exe in pkg_dir.rglob('ffmpeg.exe'):
                    return str(ffmpeg_exe)

    # 3. 打包后路径
    if getattr(sys, 'frozen', False):
        bundled = Path(sys.executable).parent / 'resources' / 'ffmpeg' / 'win' / 'ffmpeg.exe'
        if bundled.exists():
            return str(bundled)

    # 4. 开发环境：项目根目录 resources 目录（ffmpeg_service.py 在 backend/services/ 下，需上溯三级）
    dev_path = Path(__file__).parent.parent.parent / 'resources' / 'ffmpeg' / 'win' / 'ffmpeg.exe'
    if dev_path.exists():
        return str(dev_path)

    raise RuntimeError(
        'FFmpeg 未找到。请确保以下任一条件满足：\n'
        '1. 系统已安装 FFmpeg 并加入 PATH\n'
        '2. 项目 resources/ffmpeg/win/ffmpeg.exe 存在\n'
        '3. 通过 WinGet 安装了 Gyan.FFmpeg'
    )


async def extract_audio(
    video_path: str,
    task_id: int,
    on_progress: callable = None,
) -> str:
    """
    从视频文件提取音频，返回临时 WAV 文件路径。

    参数：
        video_path: 本地视频文件完整路径
        task_id:    AI 任务 ID（用于命名临时文件）
        on_progress: 可选进度回调 (stage: str, message: str)

    返回：
        提取后的 WAV 文件路径

    异常：
        RuntimeError: FFmpeg 执行失败
        FileNotFoundError: 视频文件不存在
    """
    video_path = Path(video_path)
    if not video_path.exists():
        raise FileNotFoundError(f'视频文件不存在: {video_path}')

    output_path = TEMP_DIR / f'audio_task_{task_id}.wav'

    # 如果已存在（重试场景），先删除
    if output_path.exists():
        output_path.unlink()

    ffmpeg_cmd = _find_ffmpeg()

    # FFmpeg 参数说明：
    # -i input          输入文件
    # -vn               不处理视频流
    # -acodec pcm_s16le PCM 16-bit 小端，WAV 标准格式
    # -ar 16000         采样率 16kHz（讯飞 STT 要求）
    # -ac 1             单声道（讯飞 STT 要求）
    # -y                覆盖已存在文件
    cmd = [
        ffmpeg_cmd,
        '-i', str(video_path),
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        '-y',
        str(output_path),
    ]

    if on_progress:
        on_progress('extracting', '正在提取音频...')

    # 异步执行 FFmpeg 子进程
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    _stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        err_msg = stderr.decode('utf-8', errors='replace').strip()
        # 提取关键错误行
        lines = [l for l in err_msg.splitlines() if 'Error' in l or 'error' in l or 'Invalid' in l]
        short_err = lines[-1] if lines else err_msg[-200:]
        raise RuntimeError(f'FFmpeg 提取失败: {short_err}')

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RuntimeError('FFmpeg 输出文件为空，视频可能没有音轨')

    file_size_mb = output_path.stat().st_size / 1024 / 1024
    if on_progress:
        on_progress('extracting', f'音频提取完成（{file_size_mb:.1f} MB）')

    return str(output_path)


def cleanup_audio(task_id: int) -> None:
    """删除指定任务的临时音频文件"""
    audio_path = TEMP_DIR / f'audio_task_{task_id}.wav'
    if audio_path.exists():
        audio_path.unlink()


async def get_video_duration(video_path: str) -> float:
    """
    用 ffprobe 获取视频时长（秒），用于预估处理时间。
    """
    ffmpeg_cmd = _find_ffmpeg()
    # ffprobe 和 ffmpeg 在同一目录
    ffprobe_cmd = ffmpeg_cmd.replace('ffmpeg', 'ffprobe')

    cmd = [
        ffprobe_cmd,
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        video_path,
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        import json
        info = json.loads(stdout.decode())
        return float(info.get('format', {}).get('duration', 0))
    except Exception:
        return 0.0
