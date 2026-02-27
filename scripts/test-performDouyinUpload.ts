/**
 * performDouyinUpload 方法测试脚本
 * 
 * 直接调用函数方式测试
 * 
 * 使用方法:
 * 1. 确保视频文件存在于 upload 目录下
 * 2. 确保有效的抖音 Cookie 文件存在 (默认: cookies/douyin.json)
 * 3. 运行: npx tsx scripts/test-performDouyinUpload.ts
 */

import "dotenv/config";
import { join } from "path";
import { existsSync, statSync, readFileSync } from "fs";

// 测试配置接口
interface TestConfig {
  videoFilename: string;
  videoTitle: string;
  videoDescription: string;
  videoTags: string[];
  cookiesPath: string;
}

// VideoInfo 接口 (与 index.ts 保持一致)
interface VideoInfo {
  filename: string;
  title: string;
  description: string;
  tags: string[];
}

// 默认测试配置
const defaultConfig: TestConfig = {
  videoFilename: "test_video.mp4",
  videoTitle: "测试视频标题",
  videoDescription: "这是一个测试视频的描述内容",
  videoTags: ["测试", "抖音", "自动化"],
  cookiesPath: process.env.DOUYIN_COOKIES_FILE 
    ? join(process.cwd(), process.env.DOUYIN_COOKIES_FILE)
    : join(process.cwd(), "cookies", "douyin.json"),
};

/**
 * 打印测试标题
 */
function printHeader(title: string): void {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║ ${title.padEnd(60)}║
╚═══════════════════════════════════════════════════════════════╝
  `);
}

/**
 * 验证测试前置条件
 */
function validatePrerequisites(config: TestConfig): { passed: boolean; errors: string[] } {
  const errors: string[] = [];

  printHeader("验证测试前置条件");

  // 1. 检查 Cookie 文件
  console.log(`[1] 检查 Cookie 文件: ${config.cookiesPath}`);
  if (!existsSync(config.cookiesPath)) {
    const errorMsg = `Cookie 文件不存在: ${config.cookiesPath}`;
    console.log(`❌ ${errorMsg}`);
    console.log(`   请运行 scripts/douyin-cookie-gen.ts 生成 Cookie`);
    errors.push(errorMsg);
  } else {
    // 验证 JSON 格式
    try {
      const cookieData = JSON.parse(readFileSync(config.cookiesPath, "utf-8"));
      if (!cookieData.cookies || !Array.isArray(cookieData.cookies)) {
        const errorMsg = "Cookie 文件格式错误，缺少 cookies 数组";
        console.log(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      } else {
        console.log(`✓ Cookie 文件存在 (${cookieData.cookies.length} 个 cookies)`);
      }
    } catch (e) {
      const errorMsg = `Cookie 文件 JSON 解析失败: ${(e as Error).message}`;
      console.log(`❌ ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  // 2. 检查视频文件
  const videoPath = join(process.cwd(), "upload", config.videoFilename);
  console.log(`\n[2] 检查视频文件: ${videoPath}`);
  if (!existsSync(videoPath)) {
    const errorMsg = `视频文件不存在: ${videoPath}`;
    console.log(`❌ ${errorMsg}`);
    console.log(`   请将测试视频文件放入 upload 目录`);
    errors.push(errorMsg);
  } else {
    const stats = statSync(videoPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`✓ 视频文件存在 (${sizeMB} MB)`);
    
    // 检查文件大小是否合理
    if (stats.size < 1024) {
      console.log(`⚠ 警告: 文件可能不是有效的视频文件 (太小)`);
    }
  }

  // 3. 检查环境变量
  console.log(`\n[3] 检查环境变量`);
  if (!process.env.OPENAI_API_KEY) {
    const errorMsg = "缺少 OPENAI_API_KEY 环境变量";
    console.log(`❌ ${errorMsg}`);
    errors.push(errorMsg);
  } else {
    const keyPreview = process.env.OPENAI_API_KEY.substring(0, 10) + "...";
    console.log(`✓ OPENAI_API_KEY 已设置 (${keyPreview})`);
  }

  if (!process.env.OPENAI_BASE_URL) {
    console.log(`⚠ 未设置 OPENAI_BASE_URL，将使用默认: https://api.openai.com/v1`);
  } else {
    console.log(`✓ OPENAI_BASE_URL: ${process.env.OPENAI_BASE_URL}`);
  }

  console.log("");
  const passed = errors.length === 0;
  if (passed) {
    console.log("✅ 所有前置条件验证通过");
  } else {
    console.log("❌ 前置条件验证失败");
  }

  return { passed, errors };
}

/**
 * 构建 VideoInfo 对象
 */
function buildVideoInfo(config: TestConfig): VideoInfo {
  return {
    filename: config.videoFilename,
    title: config.videoTitle,
    description: config.videoDescription,
    tags: config.videoTags,
  };
}

/**
 * 打印测试配置
 */
function printConfig(config: TestConfig): void {
  console.log("测试配置:");
  console.log(`  - 视频文件: ${config.videoFilename}`);
  console.log(`  - 标题: ${config.videoTitle}`);
  console.log(`  - 描述: ${config.videoDescription.substring(0, 50)}${config.videoDescription.length > 50 ? "..." : ""}`);
  console.log(`  - 标签: ${config.videoTags.join(", ")}`);
  console.log(`  - Cookie: ${config.cookiesPath}`);
  console.log();
}

/**
 * 直接调用 performDouyinUpload 函数测试
 */
async function runDirectFunctionTest(config: TestConfig): Promise<void> {
  printHeader("直接函数调用测试");

  const videoInfo = buildVideoInfo(config);

  console.log("测试参数:");
  console.log(JSON.stringify(videoInfo, null, 2));
  console.log();

  console.log("[-] 开始调用 performDouyinUpload 函数...\n");

  try {
    // 动态导入 index.ts 并获取 performDouyinUpload 函数
    const index = await import("../index.ts");
    const performDouyinUpload = index.performDouyinUpload;

    if (!performDouyinUpload || typeof performDouyinUpload !== "function") {
      throw new Error("无法从 index.ts 导入 performDouyinUpload 函数");
    }

    console.log("✓ 成功导入 performDouyinUpload 函数");
    console.log("[-] 执行上传任务...\n");

    const startTime = Date.now();
    
    // 直接调用函数
    const result = await performDouyinUpload(videoInfo);
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log("\n========== 测试结果 ==========");
    console.log(`执行时间: ${duration} 秒`);
    console.log(`结果: ${JSON.stringify(result, null, 2)}`);

    if (result.success) {
      console.log("\n✅ 测试通过: 视频上传成功");
    } else {
      console.log(`\n❌ 测试失败: ${result.message}`);
    }
  } catch (error) {
    console.error("\n========== 测试错误 ==========");
    console.error(`错误类型: ${(error as Error).constructor.name}`);
    console.error(`错误信息: ${(error as Error).message}`);
    
    if ((error as Error).stack) {
      console.error(`\n错误堆栈:\n${(error as Error).stack}`);
    }
    
    console.log("\n❌ 测试失败: 抛出异常");
  }
}

/**
 * 解析命令行参数
 */
function parseArgs(): TestConfig {
  const args = process.argv.slice(2);
  let config = { ...defaultConfig };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--filename" && args[i + 1]) {
      config.videoFilename = args[i + 1];
      i++;
    } else if (args[i] === "--title" && args[i + 1]) {
      config.videoTitle = args[i + 1];
      i++;
    } else if (args[i] === "--description" && args[i + 1]) {
      config.videoDescription = args[i + 1];
      i++;
    } else if (args[i] === "--tags" && args[i + 1]) {
      config.videoTags = args[i + 1].split(",").map(t => t.trim());
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return config;
}

/**
 * 打印帮助信息
 */
function printHelp(): void {
  console.log(`
用法: npx tsx scripts/test-performDouyinUpload.ts [选项]

选项:
  --filename <名称>     测试视频文件名 (默认: test_video.mp4)
  --title <标题>        视频标题 (默认: 测试视频标题)
  --description <描述>  视频描述
  --tags <标签>         视频标签，用逗号分隔 (默认: 测试,抖音,自动化)
  --help, -h           显示帮助信息

示例:
  npx tsx scripts/test-performDouyinUpload.ts
  npx tsx scripts/test-performDouyinUpload.ts --filename my_video.mp4 --title "我的视频"
  npx tsx scripts/test-performDouyinUpload.ts --tags "旅游,美食,生活"

注意:
  - 视频文件必须存在于 upload/ 目录下
  - Cookie 文件必须存在于 cookies/douyin.json
  - 此脚本直接调用 performDouyinUpload 函数进行测试
  `);
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  printHeader("performDouyinUpload 直接函数测试");

  // 解析命令行参数
  const config = parseArgs();

  // 打印测试配置
  printConfig(config);

  // 验证前置条件
  const validation = validatePrerequisites(config);
  
  if (!validation.passed) {
    console.log("\n❌ 前置条件验证失败，请检查上述问题后重试");
    console.log("\n提示:");
    console.log("  1. 运行 'npx tsx scripts/douyin-cookie-gen.ts' 生成 Cookie");
    console.log("  2. 将测试视频放入 upload/ 目录");
    console.log("  3. 确保 .env 文件中配置了 OPENAI_API_KEY");
    process.exit(1);
  }

  // 直接调用函数测试
  await runDirectFunctionTest(config);

  printHeader("测试程序执行完成");
}

// 导出测试配置和接口供其他测试使用
export { TestConfig, VideoInfo, defaultConfig, validatePrerequisites, buildVideoInfo };

// 运行主函数
main().catch(console.error);
