# Skill：集成测试

## 触发时机
主 Agent 在代码合并到 develop 后，或准备发布前调用此 Skill。

## 测试环境准备

```bash
# 确保后端运行
cd apps/backend/src
HOME=/tmp/VideoAI-home KMP_DUPLICATE_LIB_OK=TRUE \
  /root/projects/video-ai-desktop/.env/venv-linux/bin/python3 \
  main.py --port 57891 --host 127.0.0.1

# 确保前端运行
pnpm -C apps/frontend dev

# 检查后端健康
curl http://127.0.0.1:57891/health
```

## 功能测试清单

### 搜索功能
- [ ] 搜索关键词（YouTube + Bilibili）
- [ ] 筛选时长（全部 / <4分钟 / 4-20分钟 / >20分钟）
- [ ] 排序（最相关 / 最新）
- [ ] 视频封面正常显示（B站封面无 403）
- [ ] 直接粘贴链接下载
- [ ] 重复搜索同一关键词，结果顺序有所不同（seed 多样性）

### 下载功能
- [ ] 从搜索结果下载视频
- [ ] 下载进度实时更新（2秒轮询）
- [ ] 暂停下载
- [ ] 恢复下载
- [ ] 取消下载
- [ ] 下载完成后打开文件夹
- [ ] 切换页面后回到下载页，任务状态正确

### 媒体库
- [ ] 已下载视频列表显示
- [ ] 网格/列表视图切换
- [ ] 搜索过滤
- [ ] 排序（按钮组样式）
- [ ] 视频内嵌播放
- [ ] 切换页面后回到媒体库，列表自动刷新
- [ ] 时长显示为 `Xh Xm Xs` 格式，无浮点数

### AI 工作台
- [ ] 选择视频
- [ ] 点击开始分析
- [ ] 进度状态更新（extracting → transcribing → generating）
- [ ] Markdown 实时流式渲染
- [ ] 手动停止（停止按钮）
- [ ] 切换页面后回来，进度不丢失
- [ ] 生成完成后导出 .md 文件（纯前端 Blob 下载）
- [ ] 生成完成后复制到剪贴板

### 设置
- [ ] DeepSeek API Key 保存和连接测试
- [ ] Serper API Key 保存和连接测试
- [ ] 下载目录配置
- [ ] Whisper 模型路径配置

### 系统功能
- [ ] 自定义标题栏拖拽
- [ ] 最小化/最大化/关闭窗口
- [ ] 图片代理（B站 + YouTube 封面）
- [ ] 点击搜索结果播放按钮，跳转到原视频链接（`openExternal` 或 `window.open`）

## 性能测试

- [ ] 前端页面加载 < 3s
- [ ] API 响应时间 < 500ms
- [ ] 内存占用 < 500MB（开启 DevTools 查看）

## 测试报告模板

保存到 `.agent/main/reports/integration-test-[日期].md`：

```markdown
# 集成测试报告 - [日期]

## 测试环境
- OS: Windows 11 / WSL Ubuntu
- Node: v18.x
- Python: 3.x
- Electron: 33.x

## 测试结果

| 功能模块 | 通过 | 失败 | 跳过 |
|---------|------|------|------|
| 搜索 | 6 | 0 | 0 |
| 下载 | 7 | 0 | 0 |
| 媒体库 | 7 | 0 | 0 |
| AI 工作台 | 8 | 0 | 0 |
| 设置 | 4 | 0 | 0 |
| 系统功能 | 4 | 0 | 0 |

## 失败问题

### 问题 1
- 现象：XXX
- 步骤：XXX
- 期望：XXX
- 实际：XXX

## 总体状态
✅ 通过 / ⚠️ 有问题需修复 / ❌ 失败
```
