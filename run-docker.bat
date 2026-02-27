@echo off
REM ========================================
REM Docker 容器启动脚本 - Xvfb 有头浏览器方案
REM ========================================

echo ==========================================
echo   抖音视频上传 API - Docker 启动脚本
echo   Xvfb 有头浏览器方案
echo ==========================================
echo.

REM 检查 Docker 是否安装
docker --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Docker，请先安装 Docker
    pause
    exit /b 1
)

REM 检查 docker-compose 是否安装
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 docker-compose，请先安装
    pause
    exit /b 1
)

REM 检查环境变量文件
if not exist ".env" (
    echo [警告] .env 文件不存在，正在从示例创建...
    copy ".env.example" ".env"
    echo [提示] 请编辑 .env 文件配置 OPENAI_API_KEY
)

REM 创建必要的目录
if not exist "cookies" mkdir cookies
if not exist "upload" mkdir upload
if not exist "debug" mkdir debug

echo.
echo [*] 当前配置:
echo     浏览器模式: 有头模式 (通过 Xvfb)
echo     显示端口: :99
echo     分辨率: 1920x1080
echo.

REM 解析命令行参数
set HEADLESS=
set BUILD=

:parse_args
if "%~1"=="" goto done_args
if "%~1"=="--headless" set HEADLESS=true&shift&goto parse_args
if "%~1"=="-h" set HEADLESS=true&shift&goto parse_args
if "%~1"=="--build" set BUILD=--build&shift&goto parse_args
if "%~1"=="--no-cache" set BUILD=--build --no-cache&shift&goto parse_args
shift
goto parse_args

:done_args

if defined HEADLESS (
    echo [*] 切换到无头模式运行
    docker-compose up %BUILD% -d
) else (
    echo [*] 使用 Xvfb 有头模式运行
    docker-compose up %BUILD% -d
)

if errorlevel 1 (
    echo.
    echo [错误] Docker 启动失败
    pause
    exit /b 1
)

echo.
echo [*] 等待服务启动...
timeout /t 5 /nobreak >nul

echo.
echo ==========================================
echo   服务启动完成
echo ==========================================
echo.
echo   API 地址: http://localhost:3000
echo   健康检查: http://localhost:3000/health
echo.
echo   常用命令:
echo   - 查看日志: docker-compose logs -f
echo   - 停止服务: docker-compose down
echo   - 重启服务: docker-compose restart
echo.
echo ==========================================

REM 显示日志
docker-compose logs -f --tail=30
