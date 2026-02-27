# 使用 Node.js 20 LTS
FROM node:20-slim

# 设置环境变量
ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    # Xvfb 虚拟显示配置
    DISPLAY=:99 \
    XVFB_WHD=1920x1080x24

# 设置工作目录
WORKDIR /app

# 安装系统依赖、Xvfb 和 Chromium 浏览器
RUN apt-get update && apt-get install -y \
    # Xvfb (虚拟帧缓冲区) - 用于在无显示器环境中运行有头浏览器
    xvfb \
    # X11 相关库
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxext6 \
    libxrender1 \
    libxtst6 \
    libxi6 \
    # Chromium 浏览器依赖
    chromium \
    chromium-sandbox \
    # 其他必要的系统库
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    # 字体支持
    fonts-liberation \
    fonts-noto-cjk \
    # 其他工具
    wget \
    gnupg \
    ca-certificates \
    # 清理缓存
    && rm -rf /var/lib/apt/lists/*

# 创建符号链接
RUN ln -sf /usr/bin/chromium /usr/bin/chromium-browser || true

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装所有依赖 (包括开发依赖，因为需要 tsx 和 typescript)
RUN npm ci

# 复制所有源代码
COPY . .

# 创建必要的目录
RUN mkdir -p upload debug cookies

# 设置环境变量默认值
ENV PORT=3000
ENV OPENAI_API_KEY=""
ENV OPENAI_BASE_URL=https://api.openai.com/v1
ENV DOUYIN_COOKIES_FILE=cookies/douyin.json

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => {process.exit(res.statusCode === 200 ? 0 : 1)})"

# 复制启动脚本
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# 启动应用
CMD ["/docker-entrypoint.sh"]
