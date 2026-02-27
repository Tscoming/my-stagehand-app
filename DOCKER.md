# Docker 部署指南

本指南将帮助你使用 Docker 部署抖音视频上传 API 服务。

## 前置要求

- [Docker](https://www.docker.com/get-started) (>= 20.10)
- [Docker Compose](https://docs.docker.com/compose/install/) (>= 2.0)

## 目录结构

项目中的 Docker 相关文件和目录：

```
my-stagehand-app/
├── Dockerfile              # Docker 镜像构建文件
├── docker-compose.yml      # Docker Compose 编排文件
├── .dockerignore           # Docker 构建排除文件 
├── cookies/                # Cookie 目录 (通过 volume 映射)
│   └── douyin.json        # 抖音 Cookie 文件 (需手动放置)
├── upload/                 # 上传目录 (通过 volume 映射)
├── debug/                  # 调试目录 (通过 volume 映射)
└── ...                    # 其他源代码文件 (打包到镜像中)
```

## 快速开始

### 1. 准备环境变量

配置环境变量文件：

```bash
mkdir -p cookies upload debug
```

复制环境变量示例文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置必需的参数：

```env
# OpenAI API 配置 (必需)
OPENAI_API_KEY=your_openai_api_key_here

# OpenAI API 基础 URL (可选)
OPENAI_BASE_URL=https://api.openai.com/v1

# 服务器端口 (可选，默认 3000)
PORT=3000
```

### 2. 放置抖音 Cookie

将抖音 Cookie 文件放置到 `cookies/douyin.json`：

1. 在本地浏览器中登录抖音创作者平台
2. 使用浏览器开发者工具导出 Cookie 为 JSON 格式
3. 将 Cookie 文件复制到项目的 `cookies/douyin.json`

### 3. 构建并启动容器

```bash
# 构建并启动 (后台运行)
docker-compose up --build -d
```

### 4. 验证服务

```bash
curl http://localhost:3000/health
```

预期响应：
```json
{"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}
```

## 使用 API

### 上传视频到抖音

```bash
curl -X POST http://localhost:3000/api/v1/douyin/upload_video \
  -F "video=@/path/to/video.mp4" \
  -F "title=视频标题" \
  -F "description=视频描述" \
  -F "tags=标签1,标签2,标签3"
```

## 常用命令

```bash
# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 重新构建镜像
docker-compose build --no-cache
```

## Xvfb 有头浏览器方案

本项目使用 Xvfb (X  Virtual Framebuffer)方案在 Docker 容器中实现有头浏览器的自动化操作。

### 什么是 Xvfb？

Xvfb 是一个虚拟帧缓冲器，它可以在没有物理显示器的情况下运行 X Window 程序。这对于在 Docker 容器中运行有头浏览器非常有用，因为：

1. **有头模式优势**: 可以看到浏览器的实际渲染过程，便于调试
2. **反检测更强**: 有头浏览器更难被网站检测为自动化工具
3. **兼容性好**: 某些网站功能在无头模式下可能无法正常工作

### 工作原理

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker 容器                             │
│  ┌─────────────┐    ┌─────────────┐    ┌────────────────┐  │
│  │ Xvfb        │───>│ DISPLAY=:99  │───>│ Chromium       │  │
│  │ (虚拟显示器)│    │ (环境变量)    │    │ (有头模式)     │  │
│  └─────────────┘    └─────────────┘    └────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 配置选项

通过环境变量控制浏览器模式：

| 环境变量 | 值 | 说明 |
|---------|-----|------|
| `HEADLESS` | `false` (默认) | 有头模式，通过 Xvfb 运行 |
| `HEADLESS` | `true` | 无头模式，不使用 Xvfb |
| `DISPLAY` | `:99` (默认) | Xvfb 虚拟显示编号 |
| `XVFB_WHD` | `1920x1080x24` (默认) | 虚拟显示分辨率 |

### 使用示例

```bash
# 使用有头模式 (默认，通过 Xvfb)
docker-compose up -d

# 强制使用无头模式
docker-compose run -e HEADLESS=true douyin-api

# 查看 Xvfb 启动日志
docker-compose logs | grep -i xvfb

# 进入容器测试浏览器
docker exec -it douyin-upload-api chromium --version
```

### 调试技巧

1. **查看虚拟显示**: 容器内运行 `echo $DISPLAY`
2. **测试 Xvfb**: `Xvfb :99 -screen 0 1920x1080x24 &`
3. **屏幕截图**: 在有头模式下自动保存截图到 `./debug` 目录
4. **查看浏览器进程**: `docker exec douyin-upload-api ps aux | grep chromium`

## 注意事项

1. **打包内容**: 所有源代码和 npm 依赖都打包到 Docker 镜像中
2. **Volume 映射**: 仅 `.env` 和 `cookies` 目录通过 volume 映射到宿主机
3. **Cookie 有效期**: 抖音 Cookie 可能会过期，需要定期更新
4. **共享内存**: 增大 `/dev/shm` 到 2GB 避免浏览器崩溃
5. **Xvfb 资源**: Xvfb 会占用一定内存，确保容器有足够资源分配
