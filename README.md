# ClipCatch

> 一站式视频知识提炼桌面应用 — 搜索、下载、AI 转写、导出笔记

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Python](https://img.shields.io/badge/python-3.10%2B-green)
![Node](https://img.shields.io/badge/node-18%2B-green)
![License](https://img.shields.io/badge/license-MIT-orange)

## 功能特性

- 🔍 **多平台搜索**：支持 YouTube、Bilibili、Twitter/X 关键词搜索，或直接粘贴视频链接
- ⬇️ **智能下载**：基于 yt-dlp，支持 1080p/720p/480p/仅音频，实时进度/暂停/取消
- 🤖 **AI 知识提炼**：本地 Whisper 语音转写 + DeepSeek/OpenAI/Groq LLM 生成结构化笔记
- 📊 **可视化思维导图**：Mermaid 思维导图/流程图/关系图，支持缩放和拖拽交互
- 📝 **灵活笔记导出**：Markdown 格式，GitHub/Notion 原生支持 Mermaid 图表
- 🔧 **网络诊断工具**：代理检测、连通性测试，快速排查网络问题
- 📚 **本地媒体库**：已下载视频管理，AI 分析状态角标，一键触发分析
- 🎯 **用户自定义模板**：支持自定义 AI 提示词模板，灵活控制生成内容

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron 33 |
| 前端 | React 18 + TypeScript + Tailwind CSS + Zustand |
| 后端 | FastAPI + SQLAlchemy + SQLite |
| AI | faster-whisper（本地 STT）+ DeepSeek/OpenAI/Groq API（LLM 多提供商降级）|
| 可视化 | Mermaid + markmap-lib |
| 下载 | yt-dlp |
| 搜索 | Serper API（google.serper.dev） |

## 快速开始

### 环境要求

- Windows 10/11
- Python 3.10+
- Node.js 18+
- pnpm 8+（`npm install -g pnpm`）

### 一键启动（推荐）

```bash
# 克隆项目
git clone https://github.com/YouHaizhou/ClipCatch.git
cd ClipCatch

# 双击运行一键启动脚本
STARTUP.bat
```

> `STARTUP.bat` 会自动安装依赖并启动后端 + 前端 + Electron 窗口。

### 手动启动

#### 1. 安装依赖

```bash
# 安装前端/Desktop 依赖（在项目根目录）
pnpm install

# 安装 Python 依赖
cd apps/backend
pip install -r requirements.txt
```

#### 2. 启动后端

```bash
cd apps/backend/src
$env:KMP_DUPLICATE_LIB_OK='TRUE'
python main.py --port 57891 --host 127.0.0.1
```

#### 3. 启动前端 + Electron（新终端）

```bash
cd apps/frontend
pnpm dev
```

> 或直接从 desktop 目录同时启动前端 + Electron：
> ```bash
> cd apps/desktop
> pnpm dev
> ```

### 配置

打开应用后进入「系统设置」完成以下配置：

| 配置项 | 说明 | 是否必填 |
|--------|------|----------|
| DeepSeek API Key | AI 笔记生成（推荐） | 可选 |
| OpenAI API Key | 多模态分析（可选） | 可选 |
| Groq API Key | 备用 LLM 提供商 | 可选 |
| Whisper 模型路径 | 本地语音转写 | 可选 |
| Serper API Key | YouTube/Twitter/X 搜索 | Twitter 搜索必填 |
| 提示词模板 | 自定义 AI 生成模板 | 可选（默认使用内置模板） |

#### Whisper 模型下载

- HuggingFace：https://huggingface.co/Systran/faster-whisper-small
- ModelScope（国内）：https://modelscope.cn/models/pkufool/faster-whisper-small

下载解压后，将包含 `model.bin` 的文件夹路径填入设置。

## 项目结构

```
video-ai-desktop/
├── apps/
│   ├── frontend/          # React SPA
│   │   └── src/
│   │       ├── pages/     # 页面组件
│   │       ├── components/# 公共组件
│   │       ├── store/     # Zustand 状态
│   │       └── services/  # API 服务
│   ├── backend/           # FastAPI 后端
│   │   └── src/
│   │       ├── routers/   # API 路由
│   │       └── services/  # 业务服务
│   └── desktop/           # Electron 主进程
├── docs/                  # 项目文档
│   ├── PROJECT_OVERVIEW.md    # 项目概述（快速了解）
│   ├── AGENT_OVERVIEW.md      # 详细架构文档
│   └── GIT_WORKFLOW.md        # Git 工作流规范
├── prompt/
│   └── 提炼.md            # AI 提示词模板（用户可自定义）
├── STARTUP.bat            # 一键启动脚本
└── README.md
```

## 文档导航

- **[PROJECT_OVERVIEW.md](./docs/PROJECT_OVERVIEW.md)** — 项目快速概述（推荐新手阅读）
- **[AGENT_OVERVIEW.md](./docs/AGENT_OVERVIEW.md)** — 详细的架构和 API 文档
- **[GIT_WORKFLOW.md](./docs/GIT_WORKFLOW.md)** — Git 工作流规范

## 打包发布（Windows EXE）

```bash
# 安装依赖
pnpm install

# 打包 Windows zip 便携包
cd apps/desktop
pnpm build:win

# 输出目录：apps/desktop/release/
```

> 打包前需确保 `apps/desktop/resources/ffmpeg/win/` 目录下有 `ffmpeg.exe` 和 `ffprobe.exe`
> 下载地址：https://github.com/BtbN/FFmpeg-Builds/releases

## 常见问题

**Q: YouTube 搜索无结果？**
A: 需要科学上网，或在设置中配置 Serper API Key（serper.dev，有免费额度）。

**Q: 下载报「链接解析失败」？**
A: 确保开启代理。yt-dlp 版本需 ≥ 2024.11.4，可执行 `pip install --upgrade yt-dlp` 升级。

**Q: Twitter 搜索无结果？**
A: Twitter/X 平台已于 2024 年关闭所有公开 Guest Token 接口，无法在无授权状态下直接调用 API。**必须配置 Serper API Key**（[serper.dev](https://serper.dev)，有免费额度，国内直连无需代理）才能搜索 Twitter/X 视频。

**Q: AI 生成显示「0字」？**
A: 确保 DeepSeek/OpenAI/Groq API Key 已配置，且网络可访问对应服务。

**Q: 思维导图显示异常？**
A: 检查浏览器控制台是否有 Mermaid 渲染错误。确保生成的内容包含 ` ```mermaid ``` ` 代码块。

## ⚠️ 免责声明

- 本软件仅供个人学习和合法使用
- 用户下载视频须确保拥有合法权限或视频为可免费下载内容
- 本软件不对因用户违规使用导致的版权纠纷承担责任
- API Key 由用户自行填写，调用费用由用户承担

## License

MIT
