# ClipCatch 拓展计划总览

> 整理时间：2026-03-20
> 状态：规划阶段，本轮不做代码改动

---

## 三个拓展方向

| # | 方向 | 优先级 | 影响范围 | 工作量估算 |
|---|------|--------|----------|------------|
| 1 | [Resilient Gateway — 韧性 LLM 调用网关](./plan-resilient-gateway.md) | ⭐⭐⭐ P1 | 后端 `llm_service.py` | 中（1-2天） |
| 2 | [Proxy Sentinel — 跨环境代理诊断模块](./plan-proxy-sentinel.md) | ⭐⭐ P2 | 后端新增服务 + 前端新增面板 | 中（1-2天） |
| 3 | [TCO Scheduler — 资源搜索调度器](./plan-tco-scheduler.md) | ⭐ P3 | 后端 `search_service.py` + 前端 UI | 小（0.5天） |

---

## 优先级建议

### P1 优先：方向二 Resilient Gateway

**理由**：
- 现有 `llm_service.py` 是单点 DeepSeek，无重试、无降级，`all-connection-failed` 会直接让 AI 工作台完全不可用
- 断路器 + 指数退避是后端稳定性的基础设施，后续所有 LLM 扩展都依赖它
- 落地路径最清晰，改动范围集中在一个服务文件

### P2 推荐：方向一 Proxy Sentinel

**理由**：
- 项目已有 `_get_proxy()` + `winreg` 读取逻辑（`search_service.py`），但原 `llm_service.py` 用的是模块级静态变量，两套不一致（现已修复）
- 用户遭遇「连接失败」时缺乏诊断手段，网络医生面板能大幅降低用户排障成本
- Windows 本地运行，代理读取通过 winreg 注册表或环境变量统一处理

### P3 可选：方向三 TCO Scheduler

**理由**：
- `search_service.py` 已有三路降级（Serper → YouTube Data API → yt-dlp 直连），框架已存在
- 稳定性标签属于 UI 信息增强，对用户感知有帮助但不影响核心功能
- 可在前两个方向完成后作为补充

---

## 启动命令

**后端（PowerShell）**：
```powershell
cd apps/backend/src
$env:KMP_DUPLICATE_LIB_OK='TRUE'
python main.py --port 57891 --host 127.0.0.1
```

**前端（PowerShell）**：
```powershell
cd apps/frontend; pnpm dev
```

---

## 执行顺序建议

```
第一轮：方向二（Resilient Gateway）✅ 已完成
  └── 后端：重构 llm_service.py
      └── 断路器状态机 + 多提供商降级（Groq→DeepSeek→OpenAI）+ 指数退避重试

第二轮：方向一（Proxy Sentinel）✅ 已完成
  ├── 后端：新增 proxy_diagnostic_service.py + diagnostics 路由
  └── 前端：设置页新增「网络诊断」Tab

第三轮：方向三（TCO Scheduler）⏳ 待实现
  ├── 后端：search_service.py 补充 source_reliability 字段
  └── 前端：VideoCard 增加稳定性标签显示
```
