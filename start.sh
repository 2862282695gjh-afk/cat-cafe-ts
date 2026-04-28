#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# 清理残留进程
lsof -ti:3001 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null || true

# 启动 Server (后台)
echo "[启动] Server → http://localhost:3001"
NO_PROXY=localhost npx tsx packages/server/src/index.ts &
SERVER_PID=$!

# 启动 UI (前台)
echo "[启动] UI → http://localhost:5173"
cd packages/ui && npx vite

# Ctrl+C 退出时清理
trap "kill $SERVER_PID 2>/dev/null" EXIT
