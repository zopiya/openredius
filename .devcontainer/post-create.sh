#!/usr/bin/env bash
# Codespace / devcontainer 首次创建后执行一次。
# 职责：安装 bun / uv / pi 三个当前 devcontainer features 未覆盖的工具链，
# 并预装前端依赖，使容器启动后可直接 `bun run dev` 或 `pi`。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> 安装 bun（前端：package.json/bunfig.toml）"
curl -fsSL https://bun.sh/install | bash

echo "==> 安装 uv（后端：backend/pyproject.toml，M1 起使用）"
curl -LsSf https://astral.sh/uv/install.sh | sh

echo "==> 安装 pi（coding agent，见 AGENTS.md / .pi/）"
"$HOME/.bun/bin/bun" add -g --ignore-scripts @earendil-works/pi-coding-agent

echo "==> 安装前端依赖"
cd "$REPO_ROOT"
"$HOME/.bun/bin/bun" install --frozen-lockfile

if [ -f "$REPO_ROOT/backend/pyproject.toml" ]; then
  echo "==> 安装后端依赖（backend/pyproject.toml 已存在）"
  cd "$REPO_ROOT/backend"
  "$HOME/.local/bin/uv" sync
fi

echo "==> 完成。'bun run dev' 启动前端 http://localhost:5173；'pi' 启动 coding agent"
