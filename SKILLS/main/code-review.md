# Skill：代码审查

## 触发时机
主 Agent 在子 Agent 完成任务、代码提交后调用此 Skill。

## 审查流程

### 第一步：查看代码变更
```bash
git diff develop..feature/[branch-name]
git log --oneline develop..feature/[branch-name]
```

### 第二步：逐项检查

#### 通用检查项
- [ ] **命名规范**：变量/函数/文件命名清晰、符合规范
- [ ] **无冗余代码**：无注释掉的死代码、无 console.log/print 遗留
- [ ] **错误处理**：关键路径有 try/catch，错误有意义的提示
- [ ] **安全性**：无 API Key 硬编码、无 SQL 注入风险
- [ ] **文档注释**：关键函数和复杂逻辑有注释

#### 前端专项
- [ ] 图片统一走 `proxyImageUrl()`
- [ ] 跨页面状态放 Zustand，纯 UI 状态用 useState
- [ ] 没有用 `key={activePage}` 切换页面
- [ ] SSE EventSource 存入 `aiStore._sse`
- [ ] 组件 Props 有 TypeScript 类型定义

#### 后端专项
- [ ] API 返回格式统一 `{ code, data }` 或 `{ code, message }`
- [ ] 后台任务使用独立 `SessionLocal()`，有 try/finally 关闭
- [ ] Windows OMP 修复保留（`KMP_DUPLICATE_LIB_OK=TRUE`）
- [ ] SSE 队列有 heartbeat 和超时处理
- [ ] B站图片代理有 Referer 伪造

#### Desktop 专项
- [ ] IPC 通道通过 contextBridge 暴露，不直接暴露 ipcRenderer
- [ ] `nodeIntegration: false`，`contextIsolation: true`
- [ ] 应用退出时关闭后端子进程
- [ ] CSP 配置完整

### 第三步：生成审查报告

保存到 `.agent/main/reports/code-review-[日期]-[任务名].md`：

```markdown
# 代码审查报告 - [日期] - [任务名]

## 变更范围
- 文件 1
- 文件 2

## 检查结果
| 检查项 | 结果 | 说明 |
|-------|------|------|
| 命名规范 | ✅ | |
| 错误处理 | ⚠️ | XXX 函数缺少错误处理 |
| 安全性 | ✅ | |

## 总体评分
- 代码质量: ⭐⭐⭐⭐☆
- 功能完整性: ⭐⭐⭐⭐⭐
- 文档完善度: ⭐⭐⭐☆☆

## 修改要求
- [ ] 修复 XXX 函数缺少错误处理
- [ ] 补充 YYY 函数注释

## 结论
- [x] ✅ 通过
- [ ] ⚠️ 需要修改后重新审查
- [ ] ❌ 不通过
```

### 第四步：处理结果

**通过**：
```bash
git checkout develop
git merge --no-ff feature/[branch-name] -m "Merge: [task-name]"
git push origin develop
git branch -d feature/[branch-name]
git push origin --delete feature/[branch-name]
```

**需要修改**：在任务文件中添加修改要求，通知对应 Agent 修改后重新提交。
