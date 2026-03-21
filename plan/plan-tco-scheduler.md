# 方向三：基于 TCO 的资源搜索调度器 (TCO Scheduler)

> 优先级：P3 | 状态：规划中 | 影响范围：后端 `search_service.py` + 前端 VideoCard UI

---

## 问题现状

**当前搜索架构：**

`search_service.py` 已有三路降级链路（Serper → YouTube Data API → yt-dlp 直连），但存在以下问题：

1. **来源透明度为零**：前端拿到搜索结果，不知道数据来自哪条链路，稳定性高低未知
2. **稳定性定义模糊**：API 来源（契约型，稳定）和爬虫来源（对抗型，易失效）混在一起，用户无法感知
3. **yt-dlp 仅用于下载，搜索阶段也调用**：yt-dlp 直连 YouTube 用于搜索时需要代理，维护成本高，实际上 YouTube Data API 能更稳定地完成元数据获取

---

## TCO（总拥有成本）分析

| 来源 | 类型 | 稳定性 | 延迟 | 成本 | 维护成本 |
|------|------|--------|------|------|----------|
| Serper API | 契约型 | ⭐⭐⭐⭐⭐ | 低 | 付费（有免费额度） | 极低 |
| YouTube Data API v3 | 契约型 | ⭐⭐⭐⭐⭐ | 低 | 免费（10000次/天） | 极低 |
| Bilibili 官方 API | 契约型 | ⭐⭐⭐⭐ | 低 | 免费 | 低 |
| yt-dlp 直连 YouTube | 启发式 | ⭐⭐ | 高（需代理） | 免费 | 高（随时失效） |
| yt-dlp 直连其他 | 启发式 | ⭐⭐⭐ | 中 | 免费 | 中 |

**核心原则**：元数据（标题/封面/时长）走 API（确定性高），流地址（下载）走 yt-dlp（不可替代）。

---

## 目标设计

### 1. 搜索结果增加来源字段

后端搜索结果每条记录新增 `source_reliability` 字段：

```python
# search_service.py 返回结构扩展
{
  "id": "...",
  "title": "...",
  "source_reliability": "contract" | "heuristic",
  # contract  = 来自官方 API（Serper / YouTube Data API / Bilibili API）
  # heuristic = 来自爬虫/yt-dlp 直连
  "source_name": "YouTube Data API" | "Serper" | "Bilibili" | "yt-dlp",
  ...
}
```

### 2. yt-dlp 从搜索阶段退出

当前降级链路（YouTube）：
```
Serper → YouTube Data API → yt-dlp 直连搜索
```

优化后：
```
Serper → YouTube Data API → 返回「跳转搜索」兜底卡片（不再用 yt-dlp 搜索）
```

理由：yt-dlp 搜索需要代理且不稳定，降级到兜底卡片用户体验更清晰；yt-dlp 保留用于下载阶段（不可替代）。

### 3. 前端稳定性标签

`VideoCard` 组件右下角增加小标签：

```
契约型来源（contract）：显示绿色小点 + 「稳定」
启发式来源（heuristic）：显示橙色小点 + 「可能失效」
```

悬停 tooltip 说明：
- 稳定：「数据来自官方 API，链接稳定可靠」
- 可能失效：「数据来自网页解析，平台更新后可能失效」

### 4. 搜索页来源筛选（可选增强）

搜索结果页增加「仅显示稳定来源」开关，过滤掉启发式来源的结果。

---

## 文件改动范围

### 后端

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `apps/backend/src/services/search_service.py` | 扩展 | 各搜索函数返回结果加 `source_reliability` / `source_name` 字段；移除 yt-dlp 搜索降级 |
| `apps/backend/src/routers/search.py` | 微调 | `to_camel()` 同步透传新字段 |

### 前端

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `apps/frontend/src/components/VideoCard.tsx` | 扩展 | 右下角增加稳定性标签（绿点/橙点 + tooltip） |
| `apps/frontend/src/types/index.ts` | 扩展 | `VideoInfo` 类型增加 `sourceReliability` / `sourceName` 字段 |
| `apps/frontend/src/pages/SearchPage.tsx` | 可选 | 增加「仅稳定来源」筛选开关 |

---

## 验收标准

- [ ] 搜索结果每条数据含 `sourceReliability`（`contract` / `heuristic`）和 `sourceName`
- [ ] VideoCard 正确显示绿色「稳定」或橙色「可能失效」标签
- [ ] Tooltip 悬停可见说明文字
- [ ] YouTube 搜索不再调用 yt-dlp（yt-dlp 仅保留在下载阶段）
- [ ] Bilibili / Serper / YouTube Data API 来源均标记为 `contract`
- [ ] 无新增 linter 错误

---

## 参考

- 知识来源：`knowledge/2026-03-20.md` — 「确定性系统 vs 启发式系统」对应网络工程中「静态路由（契约型，稳定）vs 动态路由（启发式，自适应）」的分层思想
- 现有代码：`apps/backend/src/routers/search.py` 的 `to_camel()` 函数需同步扩展新字段 