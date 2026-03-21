# VideoAI Desktop — 项目概述

> 最后更新：2026-03-21  
> 项目状态：功能完整，持续优化中

---

## 项目简介

**VideoAI Desktop** 是一个视频资源聚合 + AI 知识提炼平台，支持从多个视频平台（YouTube、Bilibili、Twitter）下载视频，通过本地 Whisper 进行语音转写，再由 LLM（DeepSeek/OpenAI/Groq）生成结构化笔记和可视化思维导图。

**核心特性**：
- 🎬 多平台视频下载（YouTube、Bilibili、Twitter、直链）
- 🎙️ 本地 Whisper 语音转写（支持中文）
- 🤖 多 LLM 降级支持（DeepSeek → OpenAI → Groq）
- 📊 Mermaid 思维导图可视化（支持 mindmap/flowchart/graph）
- 📝 Markdown 笔记导出（GitHub/Notion 原生支持）
- 🔧 网络诊断工具（代理检测、连通性测试）

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 18 + TypeScript + Tailwind CSS + Zustand |
| **后端** | FastAPI + SQLAlchemy + SQLite |
| **音视频** | FFmpeg + faster-whisper（CTranslate2 加速） |
| **可视化** | Mermaid + markmap-lib |
| **桌面** | Electron（可选） |

---

## 项目结构

```
video-ai-desktop/
├── apps/
│   ├── backend/src/
│   │   ├── main.py                    # FastAPI 入口
│   │   ├── models.py                  # SQLAlchemy 数据模型
│   │   ├── database.py                # 数据库初始化
│   │   ├── routers/                   # API 路由
│   │   │   ├── search.py              # 搜索接口
│   │   │   ├── download.py            # 下载管理
│   │   │   ├── ai.py                  # AI 分析
│   │   │   ├── settings.py            # 设置管理
│   │   │   └── diagnostics.py         # 网络诊断
│   │   └── services/                  # 业务逻辑
│   │       ├── llm_service.py         # LLM 多提供商降级
│   │       ├── stt_service.py         # Whisper 转写
│   │       ├── download_service.py    # yt-dlp 下载
│   │       ├── ffmpeg_service.py      # 音频提取
│   │       ├── prompts.py             # 提示词模板加载
│   │       └── proxy_diagnostic_service.py  # 代理诊断
│   │
│   └── frontend/src/
│       ├── pages/
│       │   ├── SearchPage.tsx         # 搜索和下载
│       │   ├── ResourcePage.tsx       # 媒体库
│       │   ├── WorkspacePage.tsx      # AI 工作台
│       │   └── SettingsPage.tsx       # 设置
│       ├── components/
│       │   ├── MarkdownRenderer.tsx   # Markdown + Mermaid 渲染
│       │   ├── MermaidRenderer.tsx    # 思维导图（可缩放拖拽）
│       │   └── ExportToolbar.tsx      # 导出工具
│       ├── store/                     # Zustand 状态管理
│       └── services/                  # API 调用
│
└── prompt/
    └── 提炼.md                        # AI 提示词模板（用户可自定义）
```

---

## 核心功能流程

### 1. 搜索 & 下载
- 用户输入关键词或视频链接
- 后端调用 Serper API 搜索或 yt-dlp 解析链接
- 前端显示搜索结果，用户选择画质后下载
- SSE 实时推送下载进度

### 2. AI 分析
- 用户在「AI 工作台」选择视频、处理模式、图表类型
- 后端流程：
  1. FFmpeg 提取音频
  2. Whisper 转写为文本
  3. LLM 按模板生成摘要 + 思维导图
  4. 保存笔记到数据库
- 前端 SSE 实时显示生成进度和内容

### 3. 笔记导出
- 支持 Markdown 导出（包含思维导图代码块）
- GitHub/Notion 等平台原生渲染 Mermaid 图表
- 支持复制到剪贴板

---

## 关键设计决策

### 多 LLM 降级（Resilient Gateway）
```
优先级：Groq → DeepSeek → OpenAI
机制：断路器 + 指数退避重试 + 错误分类
```
- 任何一个 LLM 故障不会导致整个系统不可用
- 自动降级到下一个可用提供商

### 本地 Whisper 转写
- 无需调用外部 API，隐私安全
- 支持用户自定义模型路径（tiny/base/small/medium/large）
- 默认中文，支持自动检测多语言

### 用户自定义模板
- 提示词模板存储在 `prompt/` 目录
- 用户可在设置中选择自定义 `.md` 文件
- 模板支持 `{title}` 和 `{transcript}` 占位符替换

### 思维导图可视化
- 使用 Mermaid（而非 markmap）以获得更好的文字清晰度和平台兼容性
- 支持用户选择图表类型（mindmap/flowchart/graph）
- 前端实现缩放和拖拽交互

---

## 启动命令

**后端**（PowerShell）：
```powershell
cd apps/backend/src
$env:KMP_DUPLICATE_LIB_OK='TRUE'
python main.py --port 57891 --host 127.0.0.1
```

**前端**（PowerShell）：
```powershell
cd apps/frontend
pnpm dev
```

后端 API 地址：`http://127.0.0.1:57891`  
前端开发服务：`http://localhost:5173`

---

## 常见问题排查

| 问题 | 排查步骤 |
|------|---------|
| 后端启动失败 | 检查 Python 环境、依赖安装、端口占用 |
| 下载失败 | 检查网络诊断（设置 → 网络诊断），确认代理配置 |
| Whisper 转写失败 | 检查模型路径是否正确，模型文件是否完整 |
| LLM 调用失败 | 检查 API Key 配置，查看后端日志中的错误信息 |
| 思维导图显示异常 | 检查浏览器控制台是否有 Mermaid 渲染错误 |

---

## 后续优化方向

- [ ] 支持更多视频平台（TikTok、Instagram 等）
- [ ] 批量下载和分析
- [ ] 笔记搜索和标签管理
- [ ] 云端同步（可选）
- [ ] 移动端适配

---

## 相关文档

- [AGENT_OVERVIEW.md](./AGENT_OVERVIEW.md) — 详细的架构和 API 文档
- [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) — Git 工作流规范
