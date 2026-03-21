# 方向二：韧性 LLM 调用网关 (Resilient Gateway)

> 优先级：P1 | 状态：规划中 | 影响范围：后端 `llm_service.py`

---

## 问题现状

**当前 `llm_service.py` 的缺陷：**
1. **单点依赖**：只支持 DeepSeek 一个提供商，任意原因导致 DeepSeek 不可用时，AI 工作台完全瘫痪
2. **无重试**：连接失败直接抛出异常，不做任何重试
3. **无断路器**：反复失败时仍持续请求，加剧雪崩风险
4. **静态代理**：`_PROXY = os.environ.get('HTTP_PROXY')` 是模块级静态变量，启动后代理变化不感知
5. **429 处理简单**：遇到限流直接报错，没有退避等待

---

## 目标设计

### 核心机制

#### 1. 多提供商优先级队列

```
优先级队列（按速度/成本排序）：
  1. Groq       — 速度最快，有免费额度，适合默认首选
  2. DeepSeek   — 中文优化好，价格低，备选
  3. OpenAI     — 通用能力强，成本较高，备选
  4. Ollama     — 本地运行，零成本，无需网络，最终兜底
```

用户在设置页配置了哪些 Key，就自动加入队列；未配置的跳过。

#### 2. 断路器（Circuit Breaker）状态机

```
状态：Closed（正常）→ Open（熔断）→ Half-Open（探测）

Closed：正常调用，失败计数 +1
  └── 失败次数 >= 阈值（如 3 次）→ 进入 Open

Open：直接跳过该提供商，不发请求
  └── 超时后（如 60s）→ 进入 Half-Open

Half-Open：发送一次探测请求
  ├── 成功 → 回到 Closed，重置计数
  └── 失败 → 回到 Open，重置超时
```

断路器状态存在内存中（进程级），重启后重置。

#### 3. 指数退避 + 随机抖动

```python
# 伪代码
base_delay = 1.0  # 秒
max_delay = 30.0
jitter = random.uniform(0, 0.5)

for attempt in range(max_retries):
    try:
        return await call_provider(provider)
    except RateLimitError:
        delay = min(base_delay * (2 ** attempt) + jitter, max_delay)
        await asyncio.sleep(delay)
    except ConnectionError:
        # 连接错误不退避，直接切换下一个提供商
        break
```

重试策略：
- **429 Rate Limit**：同一提供商退避重试（1s, 2s, 4s），最多 3 次
- **连接失败 / 超时**：立即切换下一个提供商，不等待
- **401 无效 Key**：标记该提供商永久跳过（本次会话内）

#### 4. 降级链路

```
正常路径：
  Groq 流式输出 → 成功 → 返回结果

降级路径：
  Groq 失败（断路器 Open）
    → DeepSeek 流式输出 → 成功 → 返回结果
    → DeepSeek 失败
      → OpenAI 流式输出 → 成功 → 返回结果
      → OpenAI 失败
        → Ollama 本地 → 成功 → 返回结果（提示：本地模式，质量可能下降）
        → 全部失败 → 抛出含诊断信息的异常
```

---

## 文件改动范围

### 后端

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `apps/backend/src/services/llm_service.py` | 重构 | 核心改动，引入断路器 + 多提供商 + 重试 |
| `apps/backend/src/services/prompts.py` | 只读 | 确认 `build_messages` 接口不变 |
| `apps/backend/src/routers/ai.py` | 微调 | 错误信息透传到 SSE |
| `apps/backend/src/models.py` | 可能新增 | 新增 `api_key_groq`、`api_key_openai` 设置键（若不存在） |

### 前端

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `apps/frontend/src/pages/SettingsPage.tsx` | 微调 | 新增 Groq API Key 输入框（如已有则跳过） |
| `apps/frontend/src/pages/WorkspacePage.tsx` | 微调 | 降级时在 UI 提示「已切换至 xxx 提供商」 |

---

## 验收标准

- [ ] DeepSeek Key 无效时，自动切换到下一个已配置提供商
- [ ] 同一提供商连续失败 3 次后，断路器 Open，60s 内不再尝试
- [ ] 429 Rate Limit 触发退避（1s→2s→4s），不立即报错
- [ ] 全部提供商失败时，错误信息包含「已尝试以下提供商：xxx，建议检查 API Key 或网络」
- [ ] WorkspacePage 显示当前实际使用的提供商名称
- [ ] 无新增 linter 错误

---

## 新增依赖

无需新增 pip 包，断路器用纯 Python 内存实现，不引入 `pybreaker` 等外部库。

---

## 参考

- 知识来源：`knowledge/2026-03-20.md` — 网络层 NAT/PAT 多路径思想（多路降级本质上是应用层的「多路由」）
- 现有代码：`apps/backend/src/services/search_service.py` 的三路降级实现（Serper → YT Data API → yt-dlp）可作为降级链路的参考模板
