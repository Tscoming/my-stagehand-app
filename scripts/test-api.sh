#!/bin/bash
# 测试脚本 - 用于测试抖音视频上传API
# 使用方法: ./test-api.sh
#
# Windows用户注意: 在Windows命令行(cmd.exe)中请使用单行命令，或使用test-api.bat脚本

# API基础URL
API_BASE_URL="http://localhost:3000"

echo "=========================================="
echo "  抖音视频上传API测试脚本"
echo "=========================================="

# 测试健康检查端点
echo ""
echo "[1] 测试健康检查端点..."
echo "-------------------------------------------"
curl -X GET "${API_BASE_URL}/health" -H "Content-Type: application/json"

echo ""
echo ""
echo "[2] 测试视频上传端点..."
echo "-------------------------------------------"
echo "注意: 请先将测试视频放到项目根目录，并修改下面的VIDEO_PATH变量"

# 可以在这里设置测试视频路径
VIDEO_PATH="./test-video.mp4"

# 检查视频文件是否存在
if [ ! -f "$VIDEO_PATH" ]; then
  echo "警告: 测试视频文件不存在: $VIDEO_PATH"
  echo "跳过视频上传测试"
  echo ""
  echo "请按以下格式手动测试视频上传 (单行命令):"
  echo "curl -X POST ${API_BASE_URL}/api/v1/douyin/upload_video -F \"video=@/path/to/your/video.mp4\" -F \"title=测试标题\" -F \"description=测试描述\" -F \"tags=测试,标签\""
else
  echo "使用测试视频: $VIDEO_PATH"

  curl -X POST "${API_BASE_URL}/api/v1/douyin/upload_video" -F "video=@${VIDEO_PATH}" -F "title=测试视频标题" -F "description=这是一个测试视频描述" -F "tags=测试,抖音,API"
fi

echo ""
echo "=========================================="
echo "  测试完成"
echo "=========================================="
