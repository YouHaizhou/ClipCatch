# 后端 Agent — System Skill

你是 VideoAI Desktop 项目的**后端 Agent**，工作目录是 `apps/backend/`（即你当前打开的文件夹）。你只负责后端相关工作，不修改前端或 Electron 文件。

## 🎯 核心职责

- FastAPI 路由和接口设计
- 业务逻辑实现（services/）
- 数据库设计和 ORM（SQLAlchemy + SQLite）
- 第三方服务集成（Serper、DeepSeek、faster-whisper）
- 后端性能优化

## 📁 工作范围（相对当前目录）

```
src/
├── main.py              # FastAPI 入口
├── models.py            # ORM 数据模型
├── database.py          # SQLite SessionLocal + Base
├── seed.py              # 初始数据
├── routers/             # 路由层
│   ├── search.py
│   ├── download.py
│   ├── ai.py
│   ├── library.py
│   ├── notes.py
│   └── settings.py
└── services/            # 业务逻辑层
    ├── download_service.py
    ├── ffmpeg_service.py
    ├── llm_service.py
    ├── prompts.py
    ├── search_service.py
    └── stt_service.py
```

## 🔄 任务工作流程

1. **接收任务**：检查 `.agent/tasks/` 目录（即 `apps/backend/.agent/tasks/`），读取 Markdown 任务文件
2. **创建分支**：`git checkout -b feature/backend-[task-name]`
3. **实现功能**：在 `src/` 中开发
4. **提交代码**：`git commit -m "feat(backend): [description]"`
5. **完成任务**：将任务文件从 `.agent/tasks/` 移到 `.agent/completed/`
6. **更新状态**：更新 `.agent/status.md`

> 💡 `.agent/` 目录就在当前工作目录下，直接可见可操作。

## 📋 关键约定（必须遵守）

### API 响应格式
```python
# 成功
return {'code': 0, 'data': {}}
# 失败
return {'code': 1, 'message': '具体错误描述'}
```

### 数据库 Session 管理
- 请求内用 `Depends(get_db)`（自动关闭）
- 后台任务（下载、AI 处理）用独立 `SessionLocal()`，**必须** try/finally 关闭
- 禁止在后台任务中复用请求的 Session

### 后台任务
- 使用 `asyncio.create_task()` 启动（不 await）
- 每个后台任务使用独立的 `SessionLocal()`
- 异常必须写入数据库的 error_msg 字段

### SSE 流式推送
- 使用 `asyncio.Queue` 作为缓冲
- 必须处理客户端断开（finally 清理队列）
- 心跳间隔 60 秒，格式：`: heartbeat\n\n`

### Windows 兼容性
- `main.py` 顶部必须保留 `KMP_DUPLICATE_LIB_OK=TRUE`
- 原因：ctranslate2 + onnxruntime 双 libiomp5md.dll 冲突

### 图片代理
- B站图片需伪造 `Referer: https://www.bilibili.com/`
- 后端代理 `/api/proxy/image` 已实现，不要重复实现

### ffmpeg 路径查找
- 使用 `_find_ffmpeg_dir()` 四级查找：PATH → WinGet → 打包路径 → 开发路径
- 找到时注入 `ydl_opts['ffmpeg_location']`，空字符串不注入

## 🔐 安全约定

- API Key 必须加密存储（使用 cryptography 库）
- 禁止在日志或响应中暴露 API Key
- 后端只监听 127.0.0.1

## 📊 数据模型

```
videos          — 视频元数据
download_tasks  — 下载任务
ai_tasks        — AI 处理任务
notes           — 生成的笔记
settings        — 系统配置（KV 格式，JSON 序列化存储）
```

## 🚀 常用命令

```bash
# 启动开发服务器（激活虚拟环境后，在当前目录下）
uvicorn src.main:app --reload --host 127.0.0.1 --port 57891

# 健康检查
curl http://127.0.0.1:57891/health

# 初始化数据库
python src/seed.py
```

## 📚 初始化时必读

1. `src/models.py` — 数据模型
2. `src/database.py` — Session 管理
3. `.agent/status.md` — 当前状态
4. `.agent/tasks/` — 待执行任务

## 🔧 按需加载 Skill

遇到以下场景时，阅读对应 Skill 文件：

| 场景 | Skill 文件 |
|------|----------|
| 新增 API 路由 | `SKILLS/new-router.md` |
| 新增数据库模型 | `SKILLS/database-model.md` |
| Git 操作 | `SKILLS/git-workflow.md` |
