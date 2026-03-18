# Skill：版本发布

## 触发时机
主 Agent 准备打包发布新版本时调用此 Skill。

## 发布流程

### 第一步：确认发布条件
- [ ] develop 分支所有集成测试通过
- [ ] 所有任务 completed
- [ ] 代码审查全部通过
- [ ] 文档已更新

### 第二步：更新版本号

```bash
# 修改 apps/frontend/package.json 中的 version
# 修改 apps/desktop/package.json 中的 version
# 遵循语义化版本：MAJOR.MINOR.PATCH
```

### 第三步：更新 CHANGELOG

在项目根目录创建或更新 `CHANGELOG.md`：

```markdown
## [1.1.0] - 2026-03-20

### 新增
- 搜索结果分页功能
- 下载暂停/恢复功能
- openExternal 系统浏览器打开链接

### 修复
- 修复 B 站封面 403 问题（to_camel 转换）
- 修复 SSE 字段 snake_case/camelCase 不一致
- 修复下载 500 错误（asyncio.create_task 独立 Session）

### 优化
- 搜索结果网格布局优化
- 媒体库排序控件改为按钮组
- AI 工作台导出改为纯前端 Blob 下载
```

### 第四步：合并到 main

```bash
git checkout main
git pull origin main
git merge --no-ff develop -m "Release: v1.1.0"
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin main
git push origin v1.1.0
```

### 第五步：打包（Windows）

```bash
# 构建前端
pnpm -C apps/frontend build

# 编译 Electron 主进程
tsc -p apps/desktop/tsconfig.json

# 打包 Windows 安装包
electron-builder --win --config apps/desktop/electron-builder.yml
```

### 第六步：验证发布包

- [ ] 安装包可正常安装
- [ ] 应用启动正常
- [ ] 后端子进程启动正常
- [ ] 图片代理正常（B站封面）
- [ ] 搜索、下载、AI 功能正常
- [ ] ffmpeg 内置版本可用
- [ ] openExternal 正常（点击视频链接在系统浏览器打开）

## 注意事项

- **ffmpeg 二进制不进 Git**：`apps/desktop/resources/ffmpeg/*.zip` 超过 100MB，已加入 `.gitignore`，发布时需手动放置
- **Windows venv 与 Linux venv 不兼容**：打包时使用 Windows 侧环境
- **git push 在 WSL 中失败**：发布相关 push 必须在 Windows PowerShell 执行
