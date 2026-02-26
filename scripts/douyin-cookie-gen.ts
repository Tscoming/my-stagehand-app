import "dotenv/config";
import { chromium } from "playwright";
import { join } from "path";
import * as fs from "fs";

// 设置终端输出编码为 UTF-8 (Windows)
if (process.platform === "win32") {
  process.stdout.setDefaultEncoding("utf-8");
  process.stderr.setDefaultEncoding("utf-8");
}

// 默认 cookie 存储路径
const DEFAULT_COOKIE_PATH = join(process.cwd(), "cookies", "douyin.json");

/**
 * 验证 Cookie 是否有效
 * 对应 Python 的 cookie_auth 函数
 */
async function cookieAuth(accountFile: string): Promise<boolean> {
  console.log("[+] 正在验证 Cookie 有效性...");


  if (!fs.existsSync(accountFile)) {
    console.log("[-] Cookie 文件不存在");
    return false;
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: accountFile,
  });

  const page = await context.newPage();

  try {
    await page.goto("https://creator.douyin.com/creator-micro/content/upload", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // 等待页面加载
    await page.waitForTimeout(3000);

    // 获取当前 URL
    const currentUrl = page.url();
    console.log("[+] 当前 URL:", currentUrl);

    // 打印页面标题
    const title = await page.title();
    console.log("[+] 页面标题:", title);

    // 检查是否存在"手机号登录"或"扫码登录"文本
    // 使用 filter({ hasText: ... }) 来查找这些元素
    const phoneLoginVisible = await page.getByText("手机号登录").first().isVisible().catch(() => false);
    const scanLoginVisible = await page.getByText("扫码登录").first().isVisible().catch(() => false);

    console.log("[+] 手机号登录 是否可见:", phoneLoginVisible);
    console.log("[+] 扫码登录 是否可见:", scanLoginVisible);

    // 如果"手机号登录"或"扫码登录"可见，说明需要登录，Cookie 失效
    if (phoneLoginVisible || scanLoginVisible) {
      console.log("[-] Cookie 已失效，需要重新登录");
      await context.close();
      await browser.close();
      return false;
    }

    console.log("[+] Cookie 有效");
    await context.close();
    await browser.close();
    return true;
  } catch (error) {
    console.log("[-] 验证过程出错:", (error as Error).message);
    await browser.close();
    return false;
  }
}

/**
 * 生成 Cookie - 手动扫码登录
 * 对应 Python 的 douyin_cookie_gen 函数
 */
async function douyinCookieGen(accountFile: string): Promise<boolean> {
  console.log("\n========================================");
  console.log("[+] 正在打开浏览器，请扫码登录抖音创作者中心");
  console.log("[+] 登录成功后，Cookie 将自动保存到:", accountFile);
  console.log("========================================\n");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();

  const page = await context.newPage();

  // 导航到抖音创作者中心
  await page.goto("https://creator.douyin.com/");

  // 等待用户手动登录
  console.log("\n请在浏览器中扫码登录...");
  console.log("登录成功后，请手动关闭浏览器或按 Enter 键继续...\n");

  // 监听页面变化，检测是否显示登录页面
  let loggedIn = false;
  
  // 等待用户登录成功 - 检测页面是否不再显示登录选项
  const loginCheckPromise = (async () => {
    while (!loggedIn) {
      // 等待一小段时间再检查
      await page.waitForTimeout(10000);
      
      try {
        // 检查是否存在"手机号登录"或"扫码登录"文本
        // 如果这些元素不可见，说明已登录
        const phoneLoginVisible = await page.getByText("手机号登录").first().isVisible().catch(() => false);
        const scanLoginVisible = await page.getByText("扫码登录").first().isVisible().catch(() => false);
        
        // 如果登录选项都不可见了，说明已登录成功
        if (!phoneLoginVisible && !scanLoginVisible) {
          // 额外检查：确保页面已经加载完成且URL包含creator.douyin.com
          const currentUrl = page.url();
          if (currentUrl.includes("creator.douyin.com")) {
            loggedIn = true;
            return true;
          }
        }
      } catch (e) {
        // 忽略检查过程中的错误
      }
    }
    return false;
  })();

  // 同时监听用户按键
  let userPressedEnter = false;
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const enterKeyPromise = new Promise<void>((resolve) => {
    rl.question("", () => {
      userPressedEnter = true;
      rl.close();
      resolve();
    });
  });

  // 等待任一条件满足（登录成功检测或用户按Enter键）
  // 设置 5 分钟超时
  const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 300000));
  await Promise.race([loginCheckPromise, enterKeyPromise, timeoutPromise]);

  if (userPressedEnter) {
    console.log("\n[+] 检测到用户确认，保存 Cookie...");
  } else if (loggedIn) {
    console.log("\n[+] 检测到登录成功，保存 Cookie...");
  } else {
    console.log("\n[-] 等待超时，尝试保存 Cookie...");
  }

  // 保存 Cookie 到文件
  await context.storageState({ path: accountFile });

  console.log("[+] Cookie 已保存到:", accountFile);

  await browser.close();

  // 验证保存的 Cookie
  console.log("\n[+] 正在验证保存的 Cookie...");
  const isValid = await cookieAuth(accountFile);

  if (isValid) {
    console.log("[+] Cookie 验证通过！");
    return true;
  } else {
    console.log("[-] Cookie 验证失败，请重试");
    return false;
  }
}

/**
 * 设置 Cookie - 主入口
 * 对应 Python 的 douyin_setup 函数
 */
async function douyinSetup(accountFile: string, autoHandle: boolean = true): Promise<boolean> {
  // 检查 Cookie 文件是否存在且有效
  const fileExists = fs.existsSync(accountFile);

  if (!fileExists) {
    console.log("[-] Cookie 文件不存在");
    if (!autoHandle) {
      return false;
    }
    console.log("[+] 即将自动打开浏览器，请扫码登录...");
    return await douyinCookieGen(accountFile);
  }

  // 验证 Cookie 是否有效
  const isValid = await cookieAuth(accountFile);

  if (isValid) {
    console.log("[+] Cookie 有效，无需重新登录");
    return true;
  }

  // Cookie 无效，需要重新生成
  if (!autoHandle) {
    console.log("[-] Cookie 已失效");
    return false;
  }

  console.log("[+] Cookie 文件已失效或不存在，即将自动打开浏览器，请扫码登录");
  return await douyinCookieGen(accountFile);
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
抖音 Cookie 生成器 (Douyin Cookie Cooker)
==========================================

用法:
  npx tsx scripts/douyin-cookie-gen.ts [options]

选项:
  --path <path>    指定 Cookie 保存路径 (默认: cookies/douyin.json)
  --check          仅检查 Cookie 有效性，不重新生成
  --force          强制重新生成 Cookie
  --help           显示帮助信息

示例:
  npx tsx scripts/douyin-cookie-gen.ts
  npx tsx scripts/douyin-cookie-gen.ts --check
  npx tsx scripts/douyin-cookie-gen.ts --force
  `);
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  let cookiePath = DEFAULT_COOKIE_PATH;
  let checkOnly = false;
  let forceGen = false;

  // 解析命令行参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--path" && args[i + 1]) {
      cookiePath = args[i + 1];
      i++;
    } else if (args[i] === "--check") {
      checkOnly = true;
    } else if (args[i] === "--force") {
      forceGen = true;
    } else if (args[i] === "--help" || args[i] === "-h") {
      showHelp();
      process.exit(0);
    }
  }

  console.log("抖音 Cookie 生成器");
  console.log("==================\n");

  // 确保 cookies 目录存在
  const cookiesDir = join(process.cwd(), "cookies");
  if (!fs.existsSync(cookiesDir)) {
    fs.mkdirSync(cookiesDir, { recursive: true });
    console.log("[+] 已创建 cookies 目录");
  }

  if (checkOnly) {
    // 仅检查 Cookie 有效性
    const isValid = await cookieAuth(cookiePath);
    if (isValid) {
      console.log("\n✓ Cookie 有效");
      process.exit(0);
    } else {
      console.log("\n✗ Cookie 无效或已失效");
      process.exit(1);
    }
  } else if (forceGen) {
    // 强制重新生成 Cookie
    console.log("[*] 强制重新生成 Cookie...");
    const success = await douyinCookieGen(cookiePath);
    process.exit(success ? 0 : 1);
  } else {
    // 正常流程：检查并生成
    const success = await douyinSetup(cookiePath);
    process.exit(success ? 0 : 1);
  }
}

main().catch((err) => {
  console.error("发生错误:", err);
  process.exit(1);
});
