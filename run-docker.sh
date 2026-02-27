#!/bin/bash
# ========================================
# Docker 容器启动脚本 - Xvfb 有头浏览器方案
# ========================================

set -e

echo "=========================================="
echo "  抖音视频上传 API - Docker 启动脚本"
echo "  Xvfb 有头浏览器方案"
echo "=========================================="

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "[错误] 未检测到 Docker，请先安装 Docker"
    exit 1
fi

# 检查 docker-compose 是否安装
if ! command -v docker-compose &> /dev/null; then
    echo "[错误] 未检测到 docker-compose，请先安装"
    exit 1
fi

# 检查环境变量文件
if [ ! -f ".env" ]; then
    echo "[警告] .env 文件不存在，正在从示例创建..."
    cp ".env.example" ".env"
    echo "[提示] 请编辑 .env 文件配置 OPENAI_API_KEY"
fi

# 创建必要的目录
mkdir -p cookies upload debug

echo ""
echo "[*] 当前配置:"
echo "    浏览器模式: 有头模式 (通过 Xvfb)"
echo "    显示端口: :99"
echo "    分辨率: 1920x1080"
echo ""

# 解析命令行参数
HEADLESS=""
BUILD=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --headless|-h)
            HEADLESS="true"
            shift
            ;;
        --build)
            BUILD="--build"
            shift
            ;;
        --no-cache)
            BUILD="--build --no-cache"
            shift
            ;;
        *)
            echo "[警告] 未知参数: $1"
            shift
            ;;
    esac
done

# 设置环境变量
export HEADLESS="${HEADLESS:-false}"

if [ "$HEADLESS" = "true" ]; then
    echo "[*] 切换到无头模式运行"
    docker-compose up $BUILD -d
else
    echo "[*] 使用 Xvfb 有头模式运行"
    docker-compose up $BUILD -d
fi

echo ""
echo "[*] 等待服务启动..."
sleep 5

echo ""
echo "=========================================="
echo "  服务启动完成"
echo "=========================================="
echo ""
echo "  API 地址: http://localhost:3000"
echo "  健康检查: http://localhost:3000/health"
echo ""
echo "  常用命令:"
echo "  - 查看日志: docker-compose logs -f"
echo "  - 停止服务: docker-compose down"
echo "  - 重启服务: docker-compose restart"
echo ""
echo "=========================================="

# 显示日志
docker-compose logs -f --tail=30
