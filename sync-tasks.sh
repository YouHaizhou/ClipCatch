#!/bin/bash
# sync-tasks.sh — 主 Agent 任务同步脚本
# 用法：bash sync-tasks.sh [down|up|all]
#   down  仅下行同步（根目录 tasks → apps/*/agent/tasks）
#   up    仅上行同步（apps/*/agent/completed + status → 根目录）
#   all   双向同步（默认）

MODE=${1:-all}
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[sync]${NC} $1"; }
ok()  { echo -e "${GREEN}[done]${NC} $1"; }

# 下行同步：根目录 tasks → apps/*/agent/tasks
sync_down() {
  log "下行同步：下发任务到各子 Agent 工作目录..."
  for agent in frontend backend desktop; do
    src=".agent/${agent}/tasks"
    dst="apps/${agent}/.agent/tasks"
    mkdir -p "$dst"
    if [ -d "$src" ] && [ "$(ls -A $src 2>/dev/null)" ]; then
      cp -u "$src/"* "$dst/" 2>/dev/null
      ok "${agent} tasks → ${dst}/"
    else
      log "跳过 ${agent}（源目录为空）"
    fi
  done
}

# 上行同步：apps/*/agent → 根目录归档
sync_up() {
  log "上行同步：归档子 Agent 完成状态..."
  for agent in frontend backend desktop; do
    src_completed="apps/${agent}/.agent/completed"
    dst_completed=".agent/${agent}/completed"
    mkdir -p "$dst_completed"
    if [ -d "$src_completed" ] && [ "$(ls -A $src_completed 2>/dev/null)" ]; then
      cp -u "$src_completed/"* "$dst_completed/" 2>/dev/null
      ok "${agent} completed 已归档"
    fi

    src_status="apps/${agent}/.agent/status.md"
    dst_status=".agent/${agent}/status.md"
    if [ -f "$src_status" ]; then
      cp "$src_status" "$dst_status"
      ok "${agent} status.md 已归档"
    fi
  done
}

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     VideoAI Desktop 任务同步工具     ║"
echo "╚══════════════════════════════════════╝"
echo "时间: $TIMESTAMP"
echo "模式: $MODE"
echo ""

case "$MODE" in
  down) sync_down ;;
  up)   sync_up   ;;
  all)  sync_down; echo ""; sync_up ;;
  *)
    echo "用法: bash sync-tasks.sh [down|up|all]"
    exit 1
    ;;
esac

echo ""
echo "✅ 同步完成 $TIMESTAMP"
