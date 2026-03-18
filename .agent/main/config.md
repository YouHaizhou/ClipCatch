# 主 Agent 配置

## 职责

主 Agent 是项目的整体管理者，负责：

1. **项目管理**
   - 管理整个项目的架构和结构
   - 协调三个子 Agent 的工作
   - 维护项目文档和版本

2. **任务分发**
   - 在 `.agent/frontend/tasks/` 中创建前端任务
   - 在 `.agent/backend/tasks/` 中创建后端任务
   - 在 `.agent/desktop/tasks/` 中创建 Desktop 任务
   - 任务格式：Markdown 文档，包含详细的需求和验收标准

3. **代码审查**
   - 定期审查各 Agent 的代码质量
   - 检查是否符合项目规范
   - 生成审查报告到 `.agent/main/reports/`

4. **集成测试**
   - 进行端到端功能测试
   - 验证各模块间的集成
   - 测试报告保存到 `.agent/main/reports/`

5. **版本管理**
   - 管理项目版本号
   - 协调打包和发布流程
   - 维护 CHANGELOG

## 工作流程

### 1. 下发任务

在 `.agent/frontend/tasks/`、`.agent/backend/tasks/` 或 `.agent/desktop/tasks/` 中创建 Markdown 文件：

```markdown
# 任务标题

## 需求描述
详细描述需要完成的功能或修复

## 验收标准
- [ ] 标准 1
- [ ] 标准 2
- [ ] 标准 3

## 相关文件
- `apps/frontend/src/pages/SearchPage.tsx`
- `apps/backend/src/routers/search.py`

## 优先级
高 / 中 / 低

## 截止日期
YYYY-MM-DD
```

### 2. 监控任务进度

- 定期检查各 Agent 的 `status.md` 文件
- 查看 `completed/` 目录中的已完成任务
- 如有问题，在任务文件中添加评论

### 3. 代码审查

完成任务后，进行代码审查：

```markdown
# 代码审查报告 - [日期]

## 前端审查
- [ ] 代码规范检查
- [ ] 性能优化检查
- [ ] 安全性检查
- [ ] 测试覆盖率检查

## 后端审查
- [ ] API 设计检查
- [ ] 数据库设计检查
- [ ] 错误处理检查
- [ ] 性能优化检查

## Desktop 审查
- [ ] Electron 最佳实践
- [ ] IPC 通信检查
- [ ] 打包配置检查

## 总体评分
- 代码质量: ⭐⭐⭐⭐⭐
- 功能完整性: ⭐⭐⭐⭐⭐
- 文档完善度: ⭐⭐⭐⭐⭐

## 建议
...
```

### 4. 集成测试

```markdown
# 集成测试报告 - [日期]

## 测试环境
- OS: Windows 11 / WSL Ubuntu
- Node: v18.x
- Python: 3.9+

## 功能测试
- [ ] 搜索功能
- [ ] 下载功能
- [ ] AI 分析功能
- [ ] 导出功能
- [ ] 设置功能

## 性能测试
- 前端加载时间: < 2s
- 后端响应时间: < 500ms
- 内存占用: < 500MB

## 问题记录
...

## 总体状态
✅ 通过 / ⚠️ 有问题 / ❌ 失败
```

## 关键文件

- `.agent/main/tasks/` - 下发给各 Agent 的任务
- `.agent/main/reports/` - 审查和测试报告
- `.agent/frontend/status.md` - 前端 Agent 状态
- `.agent/backend/status.md` - 后端 Agent 状态
- `.agent/desktop/status.md` - Desktop Agent 状态

## 任务命名规范

```
[优先级]-[类型]-[简述].md

优先级: P0 (紧急) / P1 (高) / P2 (中) / P3 (低)
类型: feature (功能) / bugfix (修复) / refactor (重构) / docs (文档)
简述: 用英文或中文简述任务内容

示例:
P1-feature-搜索分页功能.md
P2-bugfix-修复下载暂停问题.md
P3-refactor-优化前端状态管理.md
```

## 通信方式

由于 Cursor 不支持 Agent 间直接通信，所有通信通过文件进行：

1. **主 Agent → 子 Agent**: 在 `.agent/[agent]/tasks/` 中创建任务文件
2. **子 Agent → 主 Agent**: 在 `.agent/[agent]/status.md` 中更新状态，完成后移动到 `completed/`
3. **子 Agent 间**: 通过主 Agent 协调

## 状态文件格式

每个 Agent 维护一个 `status.md` 文件：

```markdown
# [Agent 名称] 状态

## 当前任务
- 任务 1: 进行中 (50%)
- 任务 2: 待开始
- 任务 3: 已完成 ✅

## 最近完成
- [日期] 任务 X
- [日期] 任务 Y

## 遇到的问题
- 问题 1: 描述
- 问题 2: 描述

## 下一步计划
- 计划 1
- 计划 2

## 最后更新
[日期] [时间]
```
