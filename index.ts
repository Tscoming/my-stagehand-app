import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { Page, Browser, BrowserContext } from "playwright";
import { chromium } from "playwright";
import * as fs from "fs";
import express from "express";
import multer from "multer";
import cors from "cors";

// 设置终端输出编码为 UTF-8 (Windows)
if (process.platform === "win32") {
  process.stdout.setDefaultEncoding("utf-8");
  process.stderr.setDefaultEncoding("utf-8");
}

// =====================
// Express 服务器配置
// =====================
const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 配置 multer 用于文件上传
const uploadDir = join(process.cwd(), "upload");
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB 限制
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv"];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf("."));
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件格式: ${ext}`));
    }
  }
});

// =====================
// 视频信息数据类型
// =====================
interface VideoInfo {
  filename: string;
  title: string;
  description: string;
  tags: string[];
}

// =====================
// 初始化 Stagehand 实例
// =====================
async function initStagehand() {
  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    debugDom: true,
    model: {
      modelName: "deepseek/deepseek-v3.2-251201",
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    },
  });

  await stagehand.init();
  console.log(`Stagehand Session Started (Local Browser)`);
  return stagehand;
}

// =====================
// 验证 Cookie 是否有效
// =====================
async function cookieAuth(accountFile: string): Promise<{ browser: Browser; context: BrowserContext; page: Page } | null> {
  console.log("[+] 正在验证 Cookie 有效性...");

  if (!fs.existsSync(accountFile)) {
    console.log("[-] Cookie 文件不存在");
    return null;
  }

  // 无头模式配置：通过 HEADLESS 环境变量控制，默认为 false（有头模式）
  const isHeadless = process.env.HEADLESS === "true";
  console.log(`[*] 浏览器模式: ${isHeadless ? "无头模式" : "有头模式"}`);

  const browser = await chromium.launch({ 
    headless: isHeadless,
    args: isHeadless ? [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ] : []
  });
  const context = await browser.newContext({
    storageState: accountFile,
  });

  const page = await context.newPage();

  try {
    await page.goto("https://creator.douyin.com/creator-micro/content/upload", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    console.log("[+] 当前 URL:", currentUrl);

    const title = await page.title();
    console.log("[+] 页面标题:", title);

    const phoneLoginVisible = await page.getByText("手机号登录").first().isVisible().catch(() => false);
    const scanLoginVisible = await page.getByText("扫码登录").first().isVisible().catch(() => false);

    console.log("[+] 手机号登录 是否可见:", phoneLoginVisible);
    console.log("[+] 扫码登录 是否可见:", scanLoginVisible);

    if (phoneLoginVisible || scanLoginVisible) {
      console.log("[-] Cookie 已失效，需要重新登录");
      await context.close();
      await browser.close();
      return null;
    }

    console.log("[+] Cookie 有效");
    return { browser, context, page };
  } catch (error) {
    console.log("[-] 验证过程出错:", (error as Error).message);
    await browser.close();
    return null;
  }
}

// =====================
// 加载并注入 Cookies
// =====================
async function injectCookies(stagehand: Stagehand, cookiesPath: string): Promise<Page> {
  const cookiesData = JSON.parse(readFileSync(cookiesPath, "utf-8"));

  console.log(`Loading cookies from: ${cookiesPath}`);
  console.log(`Total cookies to load: ${cookiesData.cookies.length}`);

  let page = stagehand.page as unknown as Page;
  if (!page) {
    console.log("Page not found, creating new page via context...");
    // @ts-ignore
    const context = stagehand.context;
    if (context && typeof context.newPage === "function") {
      page = await context.newPage();
    } else {
      console.log("Context not found or newPage not available, using act to initialize...");
      try {
        await stagehand.act("Go to https://creator.douyin.com");
        page = stagehand.page as unknown as Page;
      } catch (e) {
        console.error("Act fallback failed:", e);
      }
    }
  }

  if (!page) {
    throw new Error("FATAL: 无法初始化 page 对象");
  }

  try {
    // @ts-ignore
    const context = stagehand.context;
    if (context && typeof context.addCookies === "function") {
      await context.addCookies(cookiesData.cookies);
      console.log(`✓ Cookies added successfully via stagehand.context.addCookies`);
      return page;
    }
    throw new Error(`Context method unavailable`);
  } catch (e) {
    console.log(`Context method failed (${(e as Error).message}), trying document.cookie fallback...`);

    try {
      await page.goto("https://creator.douyin.com", { waitUntil: "domcontentloaded", timeout: 60000 });
      for (const cookie of cookiesData.cookies) {
        try {
          await page.evaluate(
            ({ name, value, domain, path, expires, secure, sameSite }) => {
              const cookieString = `${name}=${value}; domain=${domain}; path=${path}; ${
                expires ? `expires=${new Date(expires * 1000).toUTCString()};` : ""
              } ${secure ? "secure;" : ""} samesite=${sameSite || "Lax"}`;
              document.cookie = cookieString;
            },
            cookie
          );
        } catch (err) {
          // 忽略单个 cookie 注入错误
        }
      }
      console.log(`✓ Cookies injected via document.cookie`);
    } catch (gotoError) {
      console.log(`⚠ Fallback goto failed: ${(gotoError as Error).message}`);
    }
  }
  return page;
}

// =====================
// 验证认证状态
// =====================
async function verifyAuthStatus(accountFile: string): Promise<{ browser: Browser; context: BrowserContext; page: Page } | null> {
  console.log(`\n正在验证认证状态...`);

  try {
    console.log("\n[+] 正在验证保存的 Cookie...");
    const authResult = await cookieAuth(accountFile);

    if (authResult != null) {
      console.log("[+] Cookie 验证通过！");
      return authResult;
    } else {
      console.log("[-] Cookie 验证失败");
      return null;
    }
  } catch (error) {
    console.log(`验证认证状态时出错: ${error}`);
    return null;
  }
}

// =====================
// 视频上传核心函数
// =====================
async function uploadVideoToDouyin(page: Page, videoPath: string) {
  console.log(`\n[上传流程] 正在打开上传页面...`);
  await page.goto("https://creator.douyin.com/creator-micro/content/upload", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);

  console.log(`[上传流程] 准备上传视频: ${videoPath}`);
  try {
    const uploadSelector = "div[class^='container'] input";
    try {
      await page.waitForSelector(uploadSelector, { timeout: 10000 });
      await page.locator(uploadSelector).setInputFiles(videoPath);
    } catch (e) {
      console.log(`[上传流程] 默认选择器失败，尝试通用 input[type="file"]...`);
      await page.setInputFiles('input[type="file"]', videoPath);
    }

    console.log(`✓ [上传流程] 已成功选择视频文件，等待跳转至发布页面...`);

    let success = false;
    const startTime = Date.now();
    while (Date.now() - startTime < 60000) {
      const currentUrl = page.url();
      if (currentUrl.includes("/content/publish") || currentUrl.includes("/content/post/video")) {
        console.log(`✓ [上传流程] 成功进入发布页面: ${currentUrl}`);
        success = true;
        break;
      }
      await page.waitForTimeout(1000);
    }

    if (success) {
      console.log(`✓ [上传流程] 已进入发布页面，准备填写详情`);
      return true;
    } else {
      console.log(`⚠ [上传流程] 超时未检测到发布页面跳转`);
      console.log(`当前 URL: ${page.url()}`);
      return false;
    }
  } catch (error) {
    console.log(`[上传流程] 上传过程中出错: ${(error as Error).message}`);
    return false;
  }
}

// =====================
// 等待视频上传完成
// =====================
async function waitForVideoUploadComplete(page: Page, timeout: number = 60000): Promise<boolean> {
  console.log(`  [-] 等待视频上传完成...`);
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      await page.evaluate(() => {
        window.scrollBy(0, -window.innerHeight);
      });
      await page.waitForTimeout(500);

      let number = await page.locator('[class^="long-card"] div:has-text("重新上传")').count();

      if (number === 0) {
        number = await page.locator('div:has-text("重新上传")').count();
      }

      if (number === 0) {
        number = await page.locator('text="重新上传"').count();
      }

      if (number === 0) {
        const pageText = await page.evaluate(() => document.documentElement.outerHTML);
        if (pageText.includes("重新上传")) {
          number = 1;
          console.log(`  [-] 通过页面文本检测到"重新上传"`);
        }
      }

      if (number > 0) {
        console.log(`  ✓ 视频上传完毕 (检测到 ${number} 个元素)`);
        return true;
      }

      const progressDiv = await page.locator('.progress-div, [class*="progress"]').count();
      if (progressDiv > 0) {
        const failedText = await page.locator('text="上传失败"').count();
        if (failedText > 0) {
          console.log(`  ✗ 发现上传失败提示，准备重试...`);
          return false;
        }
      }

      console.log(`  [-] 正在上传视频中...`);
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log(`  [-] 正在上传视频中...`);
      await page.waitForTimeout(2000);
    }
  }

  console.log(`  ✗ 等待上传完成超时 (${timeout}ms)`);
  return false;
}

// =====================
// 处理上传失败
// =====================
async function handleUploadError(page: Page, videoPath: string): Promise<boolean> {
  console.log(`  [-] 视频出错了，重新上传中...`);
  try {
    await page.locator('div.progress-div [class^="upload-btn-input"]').setInputFiles(videoPath);
    return await waitForVideoUploadComplete(page);
  } catch (e) {
    console.log(`  ✗ 重新上传失败: ${(e as Error).message}`);
    return false;
  }
}

// =====================
// 填充视频详情
// =====================
async function fillVideoDetails(stagehand: Stagehand, page: Page, title: string, description: string, tags: string[]) {
  console.log(`\n[详情流程] 正在分析页面并填充详情...`);

  try {
    await page.waitForTimeout(1000);

    await page.screenshot({ path: "./debug/debug_page_state.png" });
    console.log("  [-] 已保存页面截图到 ./debug/debug_page_state.png");

    console.log("  [-] 尝试使用多种选择器定位作品简介输入框...");

    const descriptionSelectors = [
      'textarea[placeholder*="简介"]',
      'textarea[data-placeholder*="简介"]',
      'div[contenteditable="true"][data-placeholder*="简介"]',
      'div[contenteditable="true"][placeholder*="简介"]',
      '[data-placeholder="添加作品简介"]',
      '[data-placeholder="输入作品简介"]',
      'textarea[aria-label*="简介"]',
      "div.notranslate[contenteditable='true']",
      '.zone-container[contenteditable="true"]',
      'div[class*="description"]',
      'div[class*="intro"]',
      '[class*="desc-container"] textarea',
      '[class*="description"] textarea',
      'input[aria-describedby*="简介"]',
    ];

    let descriptionLocator = null;
    for (const selector of descriptionSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`  [-] 找到匹配的选择器: ${selector}, 数量: ${count}`);
        descriptionLocator = page.locator(selector).first();
        break;
      }
    }

    const allInputsInfo = await page.evaluate(() => {
      const inputs: any[] = [];

      document.querySelectorAll("input, textarea, [contenteditable='true']").forEach((el, idx) => {
        const input = el as HTMLElement;
        inputs.push({
          index: idx,
          tagName: input.tagName,
          className: input.className,
          id: input.id,
          placeholder: input.getAttribute("placeholder"),
          "data-placeholder": input.getAttribute("data-placeholder"),
          contenteditable: input.getAttribute("contenteditable"),
          ariaLabel: input.getAttribute("aria-label"),
          textContent: input.textContent?.substring(0, 50),
        });
      });
      return inputs;
    });

    console.log("  [-] 页面输入元素分析:", JSON.stringify(allInputsInfo, null, 2));

    if (descriptionLocator) {
      console.log("  [-] 使用 Playwright 直接填充作品简介...");
      await descriptionLocator.click();
      const descriptionPlus = description + "\n" + tags.map((tag) => `#${tag}`).join(" ");

      await descriptionLocator.fill(descriptionPlus);
      console.log("  ✓ 作品简介已填充");
    } else {
      console.log("  [-] 未找到指定输入框，使用 Stagehand AI 分析...");

      const pageAnalysis = await stagehand.extract(
        "识别页面上用于填写作品标题(placeholder='填写作品标题，为作品获得更多流量')、作品简介(可能是一个大的文本编辑器区域，用于填写作品介绍/描述)的输入框。注意作品简介可能是一个可编辑的 div 而不是 textarea。"
      );

      console.log("  [-] AI 页面分析结果:", pageAnalysis);

      await stagehand.act(`在作品标题输入框中输入: ${title}`);
      await page.waitForTimeout(500);

      await stagehand.act(`在作品简介或作品描述的编辑器中输入: ${description}`);
    }

    const titleSelectors = ['input[placeholder*="标题"]', 'input[placeholder*="作品标题"]', 'input[aria-label*="标题"]'];

    for (const selector of titleSelectors) {
      const titleInput = page.locator(selector);
      if ((await titleInput.count()) > 0) {
        console.log(`  [-] 使用选择器填充标题: ${selector}`);
        await titleInput.first().fill(title);
        break;
      }
    }

    try {
      await stagehand.act(`在标题输入框中填写: ${title}`);
    } catch (e) {
      console.log("  [-] Stagehand 填充标题失败，继续下一步");
    }

    let uploadCheck = await page.locator('[class^="long-card"] div:has-text("重新上传")').count();

    if (uploadCheck === 0) {
      uploadCheck = await page.locator('div:has-text("重新上传")').count();
    }
    if (uploadCheck === 0) {
      uploadCheck = await page.locator('text="重新上传"').count();
    }
    if (uploadCheck === 0) {
      const pageText = await page.evaluate(() => document.documentElement.outerHTML);
      if (pageText.includes("重新上传")) {
        uploadCheck = 1;
      }
    }

    if (uploadCheck === 0) {
      console.log(`  [-] 检测到视频可能还在上传中，等待完成...`);
      const uploadComplete = await waitForVideoUploadComplete(page);
      if (!uploadComplete) {
        throw new Error("视频上传未完成，无法继续");
      }
    } else {
      console.log(`  ✓ 视频已上传完毕 (检测到 ${uploadCheck} 个元素)`);
    }

    return true;
  } catch (error) {
    console.log(`[详情流程] 填充详情失败: ${(error as Error).message}`);
    try {
      await page.screenshot({ path: "debug_error_state.png" });
      console.log("  [-] 已保存错误时的页面截图到 debug_error_state.png");
    } catch (e) {}
    return false;
  }
}

// =====================
// 设置视频封面
// =====================
async function setThumbnail(page: Page, thumbnailPath: string) {
  if (!thumbnailPath) return;

  console.log(`\n[封面流程] 正在设置视频封面: ${thumbnailPath}`);
  try {
    await page.click('text="选择封面"');
    await page.waitForSelector("div.dy-creator-content-modal");
    await page.click('text="设置竖封面"');
    await page.waitForTimeout(2000);

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator("div[class^='semi-upload upload'] >> input.semi-upload-hidden-input").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(thumbnailPath);

    await page.waitForTimeout(2000);
    await page.locator("div#tooltip-container button:visible:has-text('完成')").click();

    console.log("✓ [封面流程] 视频封面设置完成！");
    await page.waitForSelector("div.extractFooter", { state: "detached" });
  } catch (error) {
    console.log(`⚠ [封面流程] 设置封面失败: ${(error as Error).message}`);
  }
}

// =====================
// 处理自动视频封面
// =====================
async function handleAutoVideoCover(page: Page) {
  try {
    const errorTip = page.locator('text="请设置封面后再发布"');
    if (await errorTip.first().isVisible()) {
      console.log("  [-] 检测到需要设置封面提示...");
      const recommendCover = page.locator('[class^="recommendCover-"]').first();

      if ((await recommendCover.count()) > 0) {
        console.log("  [-] 正在选择第一个推荐封面...");
        await recommendCover.click();
        await page.waitForTimeout(1000);

        const confirmText = "是否确认应用此封面？";
        if (await page.locator(`text="${confirmText}"`).first().isVisible()) {
          await page.locator('button:has-text("确定")').click();
          await page.waitForTimeout(1000);
        }
        return true;
      }
    }
  } catch (e) {
    // 忽略错误
  }
  return false;
}

// =====================
// 处理发布确认对话框
// =====================
async function handlePublishConfirmDialog(page: Page): Promise<boolean> {
  try {
    await page.waitForTimeout(1000);

    const confirmButtonSelectors = [
      'button:has-text("确认发布")',
      'button:has-text("确认")',
      'button:has-text("确定发布")',
      'button:has-text("是")',
      'text="确认发布"',
      'text="确认"',
    ];

    for (const selector of confirmButtonSelectors) {
      const confirmBtn = page.locator(selector);
      if ((await confirmBtn.count()) > 0 && (await confirmBtn.first().isVisible())) {
        console.log(`  [-] 检测到确认对话框，点击确认按钮...`);
        await confirmBtn.first().click();
        await page.waitForTimeout(2000);
        return true;
      }
    }
  } catch (e) {
    // 忽略确认对话框处理错误
  }
  return false;
}

// =====================
// 检查发布错误
// =====================
async function checkPublishErrors(page: Page): Promise<string | null> {
  const errorPatterns = [
    "请设置封面后再发布",
    "标题不能为空",
    "视频上传中",
    "内容不能为空",
    "审核中",
    "发布失败",
    "请先登录",
    "网络异常",
    "格式不支持",
    "文件过大",
  ];

  try {
    const pageText = await page.evaluate(() => document.documentElement.innerText);

    for (const pattern of errorPatterns) {
      if (pageText.includes(pattern)) {
        console.log(`  [-] 检测到错误提示: ${pattern}`);
        return pattern;
      }
    }
  } catch (e) {
    // 忽略错误
  }

  return null;
}

// =====================
// 发布视频
// =====================
async function publishVideo(page: Page) {
  console.log(`\n[发布流程] 准备发布视频...`);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    try {
      await page.screenshot({ path: `./debug/publish_page_state_attempt${attempts + 1}.png` });
      console.log(`  [-] 已保存发布页面截图 (尝试 ${attempts + 1})`);

      let publishButton = page.locator('button:has-text("发布")');
      let buttonCount = await publishButton.count();
      console.log(`  [-] 尝试 CSS 选择器 button:has-text("发布"), 数量: ${buttonCount}`);

      const allPublishButtons = await page.locator("button").evaluateAll((buttons) => {
        return buttons.map((btn, idx) => ({
          index: idx,
          text: btn.textContent?.trim(),
          className: btn.className,
          id: btn.id,
        }));
      });
      console.log(`  [-] 页面所有按钮详情:`, JSON.stringify(allPublishButtons, null, 2));

      const exactPublishButtons = allPublishButtons.filter((btn) => btn.text === "发布");
      console.log(`  [-] 精确匹配"发布"的按钮:`, JSON.stringify(exactPublishButtons, null, 2));

      if (exactPublishButtons.length > 0) {
        publishButton = page.locator("xpath=//button[normalize-space()='发布']");
        buttonCount = await publishButton.count();
        console.log(`  [-] 精确匹配按钮数量: ${buttonCount}`);
      }

      if (buttonCount === 0) {
        publishButton = page.locator("xpath=//button[contains(text(), '发布')]");
        buttonCount = await publishButton.count();
        console.log(`  [-] 尝试 XPath 方式, 数量: ${buttonCount}`);
      }

      if (buttonCount === 0) {
        publishButton = page.locator("xpath=//button[text()='发布']");
        buttonCount = await publishButton.count();
        console.log(`  [-] 尝试 XPath 精确匹配, 数量: ${buttonCount}`);
      }

      if (buttonCount === 0) {
        const allButtons = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button"));
          return btns.map((btn, idx) => ({
            index: idx,
            text: btn.textContent?.trim().substring(0, 30),
            className: btn.className,
          }));
        });
        console.log(`  [-] 页面上的所有按钮:`, JSON.stringify(allButtons));

        console.log(`  [-] 尝试使用 evaluate 直接点击...`);
        const clicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll("button"));
          for (const btn of buttons) {
            if (btn.textContent?.trim() === "发布") {
              btn.click();
              return true;
            }
          }
          return false;
        });

        if (clicked) {
          console.log(`[发布流程] 已通过 evaluate 点击发布按钮 (尝试 ${attempts + 1})，等待跳转...`);

          await handlePublishConfirmDialog(page);

          let redirected = false;
          const waitStart = Date.now();
          while (Date.now() - waitStart < 3000) {
            if (page.url().includes("/content/manage")) {
              redirected = true;
              console.log(`✓ [发布流程] 视频发布成功!`);
              return true;
            }
            await page.waitForTimeout(500);
          }

          if (!redirected) {
            console.log(`  [-] 发布后未跳转，检查是否有错误提示...`);
            await handleAutoVideoCover(page);
          }
          continue;
        }
      }

      if (buttonCount > 0) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(500);

        await publishButton.first().evaluate((btn) => {
          btn.scrollIntoView({ block: "center" });
        });
        await page.waitForTimeout(500);

        const buttonDetails = await publishButton.evaluateAll((buttons) => {
          return buttons.map((btn, idx) => ({
            index: idx,
            text: btn.textContent?.trim(),
            className: btn.className,
            id: btn.id,
            tagName: btn.tagName,
          }));
        });
        console.log(`  [-] 所有"发布"按钮详情:`, JSON.stringify(buttonDetails, null, 2));

        await publishButton.first().click();
        console.log(`[发布流程] 已点击发布按钮 (尝试 ${attempts + 1})，实际点击的是第 1 个按钮 (索引 0)`);
        console.log(`  [-] 点击的按钮详情:`, JSON.stringify(buttonDetails[0], null, 2));

        await page.waitForTimeout(1500);

        const confirmHandled = await handlePublishConfirmDialog(page);
        if (confirmHandled) {
          console.log(`  [-] 已处理确认对话框，继续等待跳转...`);
        }

        try {
          const currentUrl = page.url();
          let redirected = false;
          const waitStart = Date.now();

          while (Date.now() - waitStart < 3000) {
            const newUrl = page.url();
            if (newUrl.includes("/content/manage")) {
              redirected = true;
              console.log(`✓ [发布流程] 视频发布成功!`);
              return true;
            }
            await page.waitForTimeout(500);
          }

          if (!redirected) {
            console.log(`  [-] 发布后未跳转，检查是否有错误提示...`);
            const errorMsg = await checkPublishErrors(page);
            if (errorMsg) {
              console.log(`  [-] 发现错误: ${errorMsg}`);
            }
          }
        } catch (e) {
          console.log(`  [-] 发布后未跳转，检查是否有错误提示...`);

          const errorMsg = await checkPublishErrors(page);
          if (errorMsg) {
            console.log(`  [-] 发现错误: ${errorMsg}`);
          }

          const coverHandled = await handleAutoVideoCover(page);
          if (coverHandled) {
            console.log(`  [-] 已处理封面问题，尝试再次发布...`);
            continue;
          }

          const errorTexts = await page.locator('text="请设置封面后再发布"').count();
          if (errorTexts > 0) {
            console.log(`  [-] 检测到需要设置封面`);
          }
        }
      } else {
        console.log(`⚠ [发布流程] 未找到发布按钮`);
      }
    } catch (error) {
      console.log(`[发布流程] 尝试失败: ${(error as Error).message}`);
    }
    attempts++;
    await page.waitForTimeout(2000);
  }

  console.log(`⚠ [发布流程] 发布失败，已达到最大尝试次数`);
  return false;
}

// =====================
// 验证视频文件
// =====================
function validateVideoPath(videoPath: string): boolean {
  console.log(`\n[验证流程] 检查视频文件: ${videoPath}`);

  if (!fs.existsSync(videoPath)) {
    console.log(`[-] 视频文件不存在: ${videoPath}`);
    return false;
  }

  const stats = fs.statSync(videoPath);
  if (!stats.isFile()) {
    console.log(`[-] 指定路径不是有效文件: ${videoPath}`);
    return false;
  }

  if (stats.size === 0) {
    console.log(`[-] 视频文件大小为 0: ${videoPath}`);
    return false;
  }

  const validExtensions = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv"];
  const ext = videoPath.toLowerCase().substring(videoPath.lastIndexOf("."));
  if (!validExtensions.includes(ext)) {
    console.log(`[-] 视频文件格式不支持: ${ext}，支持的格式: ${validExtensions.join(", ")}`);
    return false;
  }

  console.log(`[+] 视频文件验证通过`);
  console.log(`    - 文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`    - 文件格式: ${ext}`);

  return true;
}

// =====================
// 执行上传任务的核心函数
// =====================
export async function performDouyinUpload(videoInfo: VideoInfo) {
  let stagehand: Stagehand | undefined;
  let page: Page | null = null;
  let authResult: { browser: Browser; context: BrowserContext; page: Page } | null = null;

  const videoPath = join(process.cwd(), "upload", videoInfo.filename);

  if (!validateVideoPath(videoPath)) {
    throw new Error(`视频文件验证失败: ${videoPath}`);
  }

  const videoTitle = videoInfo.title;
  const videoDescription = videoInfo.description;
  const videoTags = videoInfo.tags;
  const thumbnailPath = "";

  try {
    stagehand = await initStagehand();
    const cookiesPath = process.env.DOUYIN_COOKIES_FILE
      ? join(process.cwd(), process.env.DOUYIN_COOKIES_FILE)
      : join(process.cwd(), "cookies", "douyin.json");

    authResult = await cookieAuth(cookiesPath);

    if (authResult === null) {
      throw new Error("Cookie 验证失败，请重新登录");
    }

    page = authResult.page;

    // 1. 上传视频
    const uploadSuccess = await uploadVideoToDouyin(page, videoPath);
    if (!uploadSuccess) {
      throw new Error("视频上传失败");
    }

    // 2. 填充详情
    const fillSuccess = await fillVideoDetails(stagehand, page, videoTitle, videoDescription, videoTags);
    if (!fillSuccess) {
      throw new Error("填充视频详情失败");
    }

    // 3. 设置封面 (可选)
    if (thumbnailPath) {
      await setThumbnail(page, thumbnailPath);
    }

    // 4. 发布
    const publishSuccess = await publishVideo(page);
    if (!publishSuccess) {
      throw new Error("视频发布失败");
    }

    return {
      success: true,
      message: "视频发布成功",
      videoInfo: {
        title: videoTitle,
        filename: videoInfo.filename,
      },
    };
  } finally {
    // 清理资源
    if (authResult) {
      console.log(`\n关闭 cookieAuth 浏览器...`);
      try {
        await authResult.page.close();
      } catch (e) {
        /* 忽略关闭错误 */
      }
      try {
        await authResult.context.close();
      } catch (e) {
        /* 忽略关闭错误 */
      }
      try {
        await authResult.browser.close();
      } catch (e) {
        /* 忽略关闭错误 */
      }
    }

    if (stagehand) {
      console.log(`\n关闭 Stagehand 浏览器...`);
      const closeWithTimeout = async (ms: number) => {
        return Promise.race([
          stagehand.close() as Promise<void>,
          new Promise<void>((resolve) =>
            setTimeout(() => {
              console.log(`⚠ 关闭浏览器超时 (${ms}ms)，强制结束...`);
              resolve();
            }, ms)
          ),
        ]);
      };

      await closeWithTimeout(5000);
    }
  }
}

// =====================
// REST API 端点
// =====================

// 健康检查端点
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// 上传视频到抖音 API
app.post("/api/v1/douyin/upload_video", upload.single("video"), async (req, res) => {
  console.log("\n========== 收到视频上传请求 ==========");

  try {
    // 验证文件上传
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "请上传视频文件",
      });
    }

    // 获取请求参数
    const { title, description, tags } = req.body;

    // 验证必填参数
    if (!title) {
      return res.status(400).json({
        success: false,
        error: "缺少必填参数: title (标题)",
      });
    }

    if (!description) {
      return res.status(400).json({
        success: false,
        error: "缺少必填参数: description (描述)",
      });
    }

    // 解析标签
    let parsedTags: string[] = [];
    if (tags) {
      if (typeof tags === "string") {
        parsedTags = tags.split(",").map((t: string) => t.trim()).filter((t: string) => t);
      } else if (Array.isArray(tags)) {
        parsedTags = tags;
      }
    }

    console.log(`[API] 接收到的参数:`);
    console.log(`  - 文件名: ${req.file.filename}`);
    console.log(`  - 原始文件名: ${req.file.originalname}`);
    console.log(`  - 文件大小: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  - 标题: ${title}`);
    console.log(`  - 描述: ${description}`);
    console.log(`  - 标签: ${parsedTags.join(", ")}`);

    // 构建视频信息对象
    const videoInfo: VideoInfo = {
      filename: req.file.filename,
      title,
      description,
      tags: parsedTags,
    };

    // 执行上传任务
    const result = await performDouyinUpload(videoInfo);

    console.log("\n========== 视频上传任务完成 ==========");
    console.log(`结果: ${JSON.stringify(result)}`);

    res.json(result);
  } catch (error) {
    console.error("\n========== 上传失败 ==========");
    console.error(`错误: ${(error as Error).message}`);

    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// 错误处理中间件
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("服务器错误:", err.message);

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        error: "文件大小超过限制 (最大 500MB)",
      });
    }
    return res.status(400).json({
      success: false,
      error: err.message,
    });
  }

  res.status(500).json({
    success: false,
    error: "服务器内部错误",
  });
});

// =====================
// 启动服务器
// =====================
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    抖音视频上传 API 服务器                        ║
╠═══════════════════════════════════════════════════════════════╣
║  服务器运行地址: http://localhost:${PORT}                         ║
║                                                               ║
║  可用端点:                                                     ║
║  - GET  /health              - 健康检查                        ║
║  - POST /api/v1/douyin/upload_video - 上传视频                 ║
║                                                               ║
║  API 使用示例:                                                 ║
║  curl -X POST http://localhost:${PORT}/api/v1/douyin/upload_video \\  ║
║    -F "video=@/path/to/video.mp4" \\                           ║
║    -F "title=视频标题" \\                                       ║
║    -F "description=视频描述" \\                                 ║
║    -F "tags=标签1,标签2,标签3"                                  ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

console.log("API 服务器初始化完成");
