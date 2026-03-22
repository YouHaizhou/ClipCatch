# ClipCatch

> 一站式视频知识提炼桌面应用 — 搜索、下载、AI 转写、导出笔记

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![License](https://img.shields.io/badge/license-MIT-orange)
![Release](https://img.shields.io/badge/release-v1.0-brightgreen)

## 功能特性

- 🔍 **多平台搜索**：支持 YouTube、Bilibili、Twitter/X 关键词搜索，或直接粘贴视频链接
- ⬇️ **智能下载**：基于 yt-dlp，支持 1080p/720p/480p/仅音频，实时进度/暂停/取消
- 🤖 **AI 知识提炼**：本地 Whisper 语音转写 + DeepSeek/OpenAI/Groq LLM 生成结构化笔记
- 📊 **可视化思维导图**：Mermaid 思维导图/流程图/关系图，支持缩放和拖拽交互
- 📝 **灵活笔记导出**：Markdown 格式，GitHub/Notion 原生支持 Mermaid 图表
- 🔧 **网络诊断工具**：代理检测、连通性测试，快速排查网络问题
- 📚 **本地媒体库**：已下载视频管理，AI 分析状态角标，一键触发分析
- 🎯 **用户自定义模板**：支持自定义 AI 提示词模板，灵活控制生成内容

## 快速开始（推荐：直接下载 Release）

### 方式一：下载打包好的 zip（无需安装任何环境）

1. 前往 [Releases](https://github.com/YouHaizhou/ClipCatch/releases) 下载最新的 `ClipCatch-win-x64.zip`
2. 解压到任意目录
3. 双击 `ClipCatch.exe` 即可启动

> **无需安装 Python、Node.js 或任何其他环境。**

### 方式二：开发者本地运行（需要 Python 3.10+ 和 Node.js 18+）

```bash
# 1. 克隆项目
git clone https://github.com/YouHaizhou/ClipCatch.git
cd ClipCatch

# 2. 安装前端依赖
npm install -g pnpm
pnpm install

# 3. 安装 Python 依赖
cd apps/backend
pip install -r requirements.txt
cd ../..

# 4. 启动后端（新终端）
cd apps/backend/src
python main.py --port 57891 --host 127.0.0.1

# 5. 启动前端 + Electron（新终端）
cd apps/desktop
pnpm dev
```

## 配置

打开应用后进入「系统设置」完成以下配置：

| 配置项 | 说明 | 是否必填 |
|--------|------|----------|
| DeepSeek API Key | AI 笔记生成（推荐） | 至少配置一个 LLM |
| OpenAI API Key | 多模态分析（可选） | 可选 |
| Groq API Key | 备用 LLM 提供商 | 可选 |
| Whisper 模型路径 | 本地语音转写 | 可选（不配置则无法 AI 转写） |
| Serper API Key | YouTube/Twitter/X 搜索 | Twitter 搜索必填 |
| 提示词模板 | 自定义 AI 生成模板 | 可选（默认使用内置模板） |

### Whisper 模型下载

> Whisper 语音转写为可选功能，模型需单独下载（约 466MB）。

- HuggingFace：https://huggingface.co/Systran/faster-whisper-small
- ModelScope（国内）：https://modelscope.cn/models/pkufool/faster-whisper-small

下载解压后，将包含 `model.bin` 的文件夹路径填入「系统设置 → Whisper 模型路径」。

> 注意：打包版 `ClipCatch.exe` 不含 faster-whisper 运行时，使用 Whisper 功能时需要额外在本机安装：
> ```bash
> pip install faster-whisper
> ```
> 若不使用语音转写功能，则无需安装。

## 打包发布（开发者）

### 前置准备

1. 将 `ffmpeg.exe` 和 `ffprobe.exe` 放入 `apps/desktop/resources/ffmpeg/win/`
   - 下载地址：https://github.com/BtbN/FFmpeg-Builds/releases

2. 安装 PyInstaller：
   ```bash
   pip install pyinstaller
   ```

### 打包步骤

```bash
# 在项目根目录执行

# 步骤 1：打包 Python 后端为 backend.exe
python -m PyInstaller backend.spec --distpath apps/desktop/backend --workpath build/pyinstaller --noconfirm

# 步骤 2：打包 Electron + 前端 + backend.exe 为 zip
cd apps/desktop
pnpm build:win

# 输出目录：apps/desktop/release/ClipCatch-*-win.zip
```

> 打包完成后，`release/` 目录下的 zip 即可直接分发给用户，无需任何环境依赖。

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron 33 |
| 前端 | React 18 + TypeScript + Tailwind CSS + Zustand |
| 后端 | FastAPI + SQLAlchemy + SQLite |
| AI | faster-whisper（本地 STT，可选）+ DeepSeek/OpenAI/Groq API（LLM 多提供商降级）|
| 可视化 | Mermaid + markmap-lib |
| 下载 | yt-dlp |
| 搜索 | Bilibili API + Serper API（YouTube/Twitter）|

## 项目结构

```
video-ai-desktop/
├── apps/
│   ├── frontend/          # React SPA
│   ├── backend/           # FastAPI 后端
│   └── desktop/           # Electron 主进程
│       ├── backend/       # PyInstaller 产物 backend.exe（打包前需先执行步骤1）
│       └── resources/
│           └── ffmpeg/win/ # ffmpeg.exe + ffprobe.exe
├── docs/                  # 项目文档
├── prompt/
│   └── 提炼.md            # AI 提示词模板（用户可自定义）
├── backend.spec           # PyInstaller 打包配置
├── build-backend.bat      # 一键打包后端脚本（Windows）
└── README.md
```

## 常见问题

**Q: 双击 ClipCatch.exe 无法启动？**
A: 检查是否解压完整（不要直接在 zip 内运行）。若提示缺少 DLL，安装 [Visual C++ Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe)。

**Q: YouTube 搜索无结果？**
A: 需要科学上网，或在设置中配置 Serper API Key（serper.dev，有免费额度）。

**Q: 下载报「链接解析失败」？**
A: 确保开启代理。yt-dlp 版本需 ≥ 2024.11.4。

**Q: Twitter 搜索无结果？**
A: 必须配置 Serper API Key（[serper.dev](https://serper.dev)）才能搜索 Twitter/X 视频。

**Q: AI 转写提示「模型未配置」？**
A: 在「系统设置 → Whisper 模型路径」填写已下载的 faster-whisper 模型文件夹路径。

**Q: AI 生成显示「0字」？**
A: 确保 DeepSeek/OpenAI/Groq API Key 已配置，且网络可访问对应服务。

## ⚠️ 免责声明

- 本软件仅供个人学习和合法使用
- 用户下载视频须确保拥有合法权限或视频为可免费下载内容
- 本软件不对因用户违规使用导致的版权纠纷承担责任
- API Key 由用户自行填写，调用费用由用户承担

## License

MIT
