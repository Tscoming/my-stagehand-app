#!/bin/bash

# ========================================
# Docker 容器启动脚本 - Xvfb 有头浏览器方案
# ========================================

set -e

echo "=========================================="
echo "  抖音视频上传 API - Docker 启动脚本"
echo "=========================================="

# 检测是否在 Docker 环境中
if [ -f /.dockerenv ]; then
    echo "[*] 检测到 Docker 环境"
else
    echo "[*] 非 Docker 环境"
fi

# Xvfb 虚拟显示配置
: ${DISPLAY=:99}
: ${XVFB_WHD:=1920x1080x24}

echo "[*] 启动 Xvfb 虚拟显示器..."
echo "    DISPLAY: $DISPLAY"
echo "    分辨率: $XVFB_WHD"

# 启动 Xvfb 作为后台进程
# -screen 0: 第一个虚拟屏幕
# $XVFB_WHD: 屏幕分辨率和色深
# -ac: 禁用访问控制
# +extension: 启用扩展
Xvfb $DISPLAY -screen 0 $XVFB_WHD -ac +extension GLX +render -noreset &

# 等待 Xvfb 启动
sleep 2

# 验证 Xvfb 是否成功启动
if pgrep -x Xvfb > /dev/null; then
    echo "[+] Xvfb 启动成功"
else
    echo "[-] Xvfb 启动失败，尝试备用方案..."
    # 尝试使用 Xvfb-run（如果可用）
    if command -v xvfb-run &> /dev/null; then
        echo "[*] 将在 xvfb-run 中运行应用..."
        exec xvfb-run --auto-servernum --server-args="$DISPLAY -screen 0 $XVFB_WHD -ac +extension GLX +render -noreset" npm start
    else
        echo "[-] 警告: Xvfb 启动失败，将在无显示模式下运行"
    fi
fi

# 检查环境变量配置
echo ""
echo "[*] 当前环境配置:"
echo "    HEADLESS: ${HEADLESS:-false (默认有头模式)}"
echo "    NODE_ENV: ${NODE_ENV:-production}"
echo "    DISPLAY: ${DISPLAY}"
echo ""

# 如果设置为无头模式，显示警告
if [ "$HEADLESS" = "true" ]; then
    echo "[*] 警告: 已配置为无头模式运行"
else
    echo "[*] 将使用 Xvfb 虚拟显示器运行有头浏览器"
fi

echo ""
echo "[*] 启动应用..."
echo "=========================================="

# 启动 Node.js 应用
exec npm start
