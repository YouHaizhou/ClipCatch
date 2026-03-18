# ClipCatch

> 一站式视频知识提炼桌面应用 — 搜索、下载、AI 转写、导出笔记

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Python](https://img.shields.io/badge/python-3.10%2B-green)
![Node](https://img.shields.io/badge/node-18%2B-green)
![License](https://img.shields.io/badge/license-MIT-orange)

## 功能特性

- 🔍 **多平台搜索**：支持 YouTube、Bilibili 关键词搜索，封面/时长/作者一览
- ⬇️ **智能下载**：基于 yt-dlp，支持 1080p/720p/480p/仅音频，实时进度显示
- 🤖 **AI 知识提炼**：本地 Whisper 语音转写 + DeepSeek LLM 生成结构化 Markdown 笔记
- 📚 **本地媒体库**：已下载视频管理，AI 状态角标，一键触发分析
- 📝 **笔记导出**：复制全文 / 导出 .md 文件

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron 33 |
| 前端 | React 18 + TypeScript + Tailwind CSS + Zustand |
| 后端 | FastAPI + SQLAlchemy + SQLite |
| AI | faster-whisper（本地 STT）+ DeepSeek API（LLM） |
| 下载 | yt-dlp |

## 快速开始

### 环境要求

- Windows 10/11
- Python 3.10+
- Node.js 18+
- pnpm 8+

### 安装依赖

```bash
# 安装 Python 依赖
cd apps/backend
pip install -r requirements.txt

# 安装前端 + Desktop 依赖
pnpm install
```

### 启动开发环境

```bash
# 1. 启动后端
cd apps/backend/src
python main.py --port 57891 --host 127.0.0.1

# 2. 启动前端 + Electron（新终端）
cd apps/frontend
pnpm dev

# 或者直接从 desktop 目录启动（同时启动前端+Electron）
cd apps/desktop
pnpm dev
```

### 配置

1. 打开应用，进入「系统设置」
2. 填写 **DeepSeek API Key**（用于 AI 生成笔记）
3. 填写 **Whisper 模型路径**（本地语音转写，可选）
   - 推荐模型：[faster-whisper-small](https://huggingface.co/Systran/faster-whisper-small)
   - 国内镜像：[ModelScope](https://modelscope.cn/models/pkufool/faster-whisper-small)

## 项目结构

```
video-ai-desktop/
├── apps/
│   ├── frontend/          # React SPA
│   ├── backend/           # FastAPI 后端
│   └── desktop/           # Electron 主进程
├── docs/                  # 项目文档
└── SKILLS/                # Agent 开发规范
```

## ⚠️ 免责声明

- 本软件仅供个人学习和合法使用
- 用户下载视频须确保拥有合法权限或视频为可免费下载内容
- 本软件不对因用户违规使用导致的版权纠纷承担责任
- API Key 由用户自行填写，调用费用由用户承担
- 本软件不存储、不传播任何视频内容

## License

MIT
