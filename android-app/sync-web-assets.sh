#!/usr/bin/env bash
# 把最新 H5 游戏与图标同步进 Android 工程（每次改完 tasks/index.html 后执行）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cp "$ROOT/tasks/index.html" "$ROOT/android-app/app/src/main/assets/game.html"
mkdir -p "$ROOT/android-app/app/src/main/assets/assets/icons"
cp "$ROOT"/public/assets/icons/*.png "$ROOT/android-app/app/src/main/assets/assets/icons/"
echo "已同步 game.html 与 $(ls "$ROOT/android-app/app/src/main/assets/assets/icons" | wc -l) 个图标"
