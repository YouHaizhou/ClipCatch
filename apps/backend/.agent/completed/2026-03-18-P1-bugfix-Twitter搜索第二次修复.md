# 2026-03-18-P1-bugfix-Twitter搜索第二次修复

## ⚠️ 上一轮已下发任务但未解决

上一轮改用 Serper `/videos` + `/search` 降级，但 `site:twitter.com` Google 索引极差，实际命中率极低，导致仍然返回空。本轮彻底调整策略。

## Git 信息
- **工作分支**：`feature/backend-api-v2`

> ⛔ **严禁执行任何 git 操作**

---

## 修复内容

### `src/services/search_service.py` — _search_twitter 策略彻底重写

新三级策略：
1. **策略1**：Serper `/videos` 接口，去掉 `site:` 限制，改用 `{query} twitter` 宽泛搜索，放宽 platform 过滤
2. **策略2**：结果 <5 条时，Serper `/search` 补充，用 seen set 去重
3. **策略3**：两个接口均无结果时，构造 Twitter 搜索页直链作为兜底，确保不显示「未找到相关视频」
4. **异常兜底**：即使 httpx 报错也返回兜底卡片而非空列表

### `src/routers/ai.py` — done 事件同时提供 camelCase 和 snake_case

```python
_push(task_id, {
    'type': 'done',
    'note_id': note.id,
    'noteId': note.id,
    'word_count': word_count,
    'wordCount': word_count,
})
```

---

## 验收标准

- [x] 搜索 Twitter 平台时，无论是否有 Serper 结果，不再显示「未找到相关视频」
- [x] 有 Serper 结果时显示实际视频卡片
- [x] 无 Serper 结果时显示「在 Twitter/X 上搜索」兜底卡片，点击可跳转
- [x] ai.py done 事件同时包含 `noteId`/`note_id` 和 `wordCount`/`word_count`

---

## 完成记录

- **完成时间**：2026-03-18
- **实际工时**：约 0.5h
- **修改文件**：
  - `src/services/search_service.py`：_search_twitter 三级策略重写
  - `src/routers/ai.py`：done 事件补充 camelCase 字段
