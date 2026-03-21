# 方向一：跨环境代理自适应诊断模块 (Proxy Sentinel)

> 优先级：P2 | 状态：规划中 | 影响范围：后端新增诊断服务 + 前端设置页新增面板

---

## 问题现状

**项目的代理困境：**

1. **双环境不一致**：Electron + React 运行在 Windows（走 WinINet 代理），FastAPI 后端运行在 WSL（走 Linux 环境变量代理），两套代理配置互相独立
2. **WSL 无法读注册表**：`search_service.py` 的 `_get_proxy()` 会尝试读 Windows 注册表（`winreg`），但在 WSL Python 环境中 `winreg` 不存在，静默失败回退到无代理
3. **`llm_service.py` 静态代理**：模块级 `_PROXY = os.environ.get('HTTP_PROXY')` 启动时读取一次，运行中代理变化不感知
4. **错误信息不友好**：用户只看到「连接失败」，无法判断是代理问题、防火墙问题还是 API Key 问题

**Windows WinINet vs WinHTTP 平行宇宙：**
```
Windows 系统代理（注册表）
  ├── WinINet（IE/Chrome/Edge 走这里）  ← Electron 渲染进程读到
  └── WinHTTP（系统级服务走这里）      ← 需要 netsh winhttp 单独配置

WSL Linux 环境
  └── HTTP_PROXY / HTTPS_PROXY 环境变量  ← Python 后端走这里
      （需手动设置或由代理客户端自动注入，Clash TUN 模式可绕过此问题）
```

---

## 目标设计

### 核心功能

#### 1. 后端启动时自动诊断

后端启动（`main.py`）时，异步运行一次诊断，结果缓存供前端查询：

```
诊断项目：
  A. 本地环回测试    — GET http://127.0.0.1:57891/health（确认后端自身正常）
  B. 代理配置读取    — 尝试 winreg / 环境变量，报告当前代理地址或「未检测到」
  C. DeepSeek 连通性 — GET https://api.deepseek.com（timeout=5s），不带认证
  D. YouTube 连通性  — GET https://www.youtube.com（timeout=5s，需代理）
  E. Serper 连通性   — GET https://google.serper.dev（timeout=5s，国内直连）
```

#### 2. 精准错误码映射

| 错误码 / 异常类型 | 用户提示 | 建议操作 |
|------------------|----------|----------|
| `WinError 10061` (ECONNREFUSED) | 本地代理端口未开启 | 请启动代理客户端（Clash/V2Ray） |
| `WinError 10060` (ETIMEDOUT) | 防火墙拦截或目标不可达 | 检查防火墙规则，或尝试更换代理节点 |
| `winreg` 不存在 | WSL 环境无法读取 Windows 代理 | 建议开启代理客户端的 TUN 模式（自动劫持所有流量） |
| `SSLError` | SSL 证书验证失败 | 可能存在中间人拦截，检查企业证书或关闭 SSL 检查 |
| 无 HTTP_PROXY 且 winreg 为空 | 未检测到任何代理配置 | 如需访问 YouTube/Twitter，请配置代理 |

#### 3. 新增诊断 API 端点

```
GET /api/diagnostics/network
返回：
{
  "code": 0,
  "data": {
    "proxy_detected": "http://127.0.0.1:7890",  // 或 null
    "proxy_source": "winreg" | "env" | "none",
    "is_wsl": true,
    "checks": [
      {"name": "DeepSeek", "ok": true,  "latency_ms": 320},
      {"name": "YouTube",  "ok": false, "error": "WinError 10061", "hint": "本地代理端口未开启"},
      {"name": "Serper",   "ok": true,  "latency_ms": 180}
    ],
    "suggestion": "建议开启 TUN 模式"  // 或 null
  }
}
```

#### 4. 前端「网络诊断」面板

位置：设置页新增「网络诊断」Tab，或在现有设置页顶部加「网络状态」折叠卡片。

展示内容：
- 每个检测项显示 ✅ / ❌ + 延迟（ms）
- ❌ 项显示错误原因 + 建议操作（高亮橙色卡片）
- TUN 模式建议时，弹出 Toast 引导
- 「重新检测」按钮，手动触发一次诊断

---

## 文件改动范围

### 后端

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `apps/backend/src/services/proxy_diagnostic_service.py` | 新增 | 诊断逻辑核心，独立服务 |
| `apps/backend/src/routers/diagnostics.py` | 新增 | `/api/diagnostics/network` 端点 |
| `apps/backend/src/main.py` | 微调 | 注册新路由，启动时触发异步诊断 |

### 前端

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `apps/frontend/src/pages/SettingsPage.tsx` | 扩展 | 新增「网络诊断」Tab |
| `apps/frontend/src/services/api.ts` | 扩展 | 新增 `fetchNetworkDiagnostics()` |

---

## 验收标准

- [ ] 后端启动后 `/api/diagnostics/network` 返回各项检测结果
- [ ] WSL 环境下 `is_wsl: true`，`proxy_source: "none"` 时出现 TUN 模式建议
- [ ] WinError 10061 / 10060 映射到对应中文提示
- [ ] 前端面板正确展示每项状态，「重新检测」按钮可用
- [ ] 检测超时不超过 8s（各项并行检测）
- [ ] 无新增 linter 错误

---

## 参考

- 知识来源：`knowledge/2026-03-20.md` — NAT/代理本质是网络层地址转换，WinINet/WinHTTP 差异是应用层协议栈的「路由分叉」
- 现有代码：`apps/backend/src/services/search_service.py` 的 `_get_proxy()` 函数可直接复用并增强
