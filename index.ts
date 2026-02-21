import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { readFileSync } from "fs";
import { join } from "path";

// 设置终端输出编码为 UTF-8 (Windows)
if (process.platform === "win32") {
  process.stdout.setDefaultEncoding("utf-8");
  process.stderr.setDefaultEncoding("utf-8");
}

async function main() {
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    model: {
      modelName: "deepseek/deepseek-v3.2-251201",
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    },
  });

  await stagehand.init();

  console.log(`Stagehand Session Started (Local Browser)`);

  // 加载 cookies
  const cookiesPath = join(process.cwd(), "cookies", "douyin.json");
  const cookiesData = JSON.parse(readFileSync(cookiesPath, "utf-8"));
  
  console.log(`Loading cookies from: ${cookiesPath}`);
  console.log(`Total cookies to load: ${cookiesData.cookies.length}`);
  
  // 尝试通过内部 Playwright context 添加 cookies
  console.log(`Attempting to add cookies to browser context...`);
  
  // 获取页面对象
  const page = stagehand.context.pages()[0];
  
  try {
    // 方法1: 尝试通过 stagehand.context 的内部属性访问
    // @ts-ignore
    const internalContext = stagehand.context._browserContext || stagehand.context.browserContext;
    
    if (internalContext && typeof internalContext.addCookies === 'function') {
      await internalContext.addCookies(cookiesData.cookies);
      console.log(`✓ Cookies added successfully via internal context`);
    } else {
      throw new Error('Internal context not accessible');
    }
  } catch (e) {
    console.log(`Direct context method failed, trying alternative...`);
    
    // 方法2: 先访问一个页面，然后使用 evaluate 注入 cookies
    await page.goto("https://creator.douyin.com");
    
    // 使用 evaluate 注入 cookies
    console.log(`Injecting cookies via browser storage...`);
    
    for (const cookie of cookiesData.cookies) {
      try {
        // @ts-ignore
        await page.evaluate(({name, value, domain, path, expires, secure, sameSite}) => {
          const cookieString = `${name}=${value}; domain=${domain}; path=${path}; ${expires ? `expires=${new Date(expires * 1000).toUTCString()};` : ''} ${secure ? 'secure;' : ''} samesite=${sameSite || 'Lax'}`;
          document.cookie = cookieString;
        }, cookie);
      } catch (err) {
        // Ignore errors for individual cookies
      }
    }
    
    console.log(`✓ Cookies injected via document.cookie`);
  }
  
  // 无论使用哪种方法，都导航到目标页面
  await page.goto("https://creator.douyin.com");
  
  console.log(`✓ Authenticated with Douyin cookies!`);
  console.log(`✓ Page reloaded - cookies should now be active`);
  
  // 等待页面 DOM 加载完成（比 networkidle 更宽松）
  await page.waitForLoadState('domcontentloaded');
  
  // 额外等待一下，确保页面内容渲染
  await page.waitForTimeout(3000);
  
  // 获取当前页面的 URL 和标题来验证
  const currentUrl = page.url();
  const pageTitle = await page.title();
  
  console.log(`\n当前页面信息:`);
  console.log(`- URL: ${currentUrl}`);
  console.log(`- 标题: ${pageTitle}`);
  
  // 尝试提取页面上是否有登录用户信息来验证认证
  console.log(`\n正在验证认证状态...`);
  
  try {
    // 检查页面中是否有登录后才显示的元素
    const hasUserInfo = await page.evaluate(() => {
      // 常见的登录后元素选择器
      const selectors = [
        '.user-info',
        '.avatar',
        '.username',
        '[class*="user"]',
        '[class*="avatar"]'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          return true;
        }
      }
      return false;
    });
    
    if (hasUserInfo) {
      console.log(`✓ 检测到用户信息元素 - 认证可能已生效`);
    } else {
      console.log(`⚠ 未检测到明显的用户信息元素`);
    }
  } catch (error) {
    console.log(`检查用户信息时出错: ${error}`);
  }

  // 现在你可以使用 Stagehand 在已认证的页面上执行操作
  // 例如：
  console.log(`\n尝试提取页面上的用户信息...`);
  const extractResult = await stagehand.extract("提取页面上的用户信息");
  console.log(`Extract result:\n`, extractResult);
 
  const actResult = await stagehand.act("点击<高清发布>下拉列表按钮，并选择<发布视频>选项");
  console.log(`Act result:\n`, actResult);

  // 保持浏览器打开 30 秒，让用户可以手动验证
  console.log(`\n浏览器将保持打开 30 秒，以便你手动验证认证状态...`);
  console.log(`请检查浏览器窗口，确认是否已登录。`);
  await page.waitForTimeout(30000);
  
  console.log(`\n关闭浏览器...`);

  await stagehand.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
