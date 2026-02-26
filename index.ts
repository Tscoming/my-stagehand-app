import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { readFileSync } from "fs";
import { join } from "path";
import { Page } from "playwright";

// 设置终端输出编码为 UTF-8 (Windows)
if (process.platform === "win32") {
  process.stdout.setDefaultEncoding("utf-8");
  process.stderr.setDefaultEncoding("utf-8");
}

/**
 * 初始化 Stagehand 实例
 */
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

/**
 * 加载并注入 Cookies
 */
async function injectCookies(stagehand: Stagehand, cookiesPath: string): Promise<Page> {
  const cookiesData = JSON.parse(readFileSync(cookiesPath, "utf-8"));
  
  console.log(`Loading cookies from: ${cookiesPath}`);
  console.log(`Total cookies to load: ${cookiesData.cookies.length}`);
  
  // 确保 page 对象已初始化
  let page = stagehand.page as unknown as Page;
  if (!page) {
    console.log("Page not found, creating new page via context...");
    // @ts-ignore
    const context = stagehand.context;
    if (context && typeof context.newPage === 'function') {
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
    // 检查 Stagehand 的 context
    // @ts-ignore
    const context = stagehand.context;
    if (context && typeof context.addCookies === 'function') {
      await context.addCookies(cookiesData.cookies);
      console.log(`✓ Cookies added successfully via stagehand.context.addCookies`);
      return page;
    }
    throw new Error(`Context method unavailable`);
  } catch (e) {
    console.log(`Context method failed (${(e as Error).message}), trying document.cookie fallback...`);
    
    try {
      await page.goto("https://creator.douyin.com", { waitUntil: 'domcontentloaded', timeout: 60000 });
      for (const cookie of cookiesData.cookies) {
        try {
          await page.evaluate(({name, value, domain, path, expires, secure, sameSite}) => {
            const cookieString = `${name}=${value}; domain=${domain}; path=${path}; ${expires ? `expires=${new Date(expires * 1000).toUTCString()};` : ''} ${secure ? 'secure;' : ''} samesite=${sameSite || 'Lax'}`;
            document.cookie = cookieString;
          }, cookie);
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

/**
 * 验证认证状态
 */
async function verifyAuthStatus(page: Page) {
  console.log(`\n正在验证认证状态...`);
  
  try {
    await page.goto("https://creator.douyin.com", { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    const pageTitle = await page.title();
    
    console.log(`当前页面信息:`);
    console.log(`- URL: ${currentUrl}`);
    console.log(`- 标题: ${pageTitle}`);
    
    const hasUserInfo = await page.evaluate(() => {
      const selectors = ['.user-info', '.avatar', '.username', '[class*="user"]', '[class*="avatar"]'];
      return selectors.some(s => document.querySelector(s));
    });
    
    if (hasUserInfo) {
      console.log(`✓ 检测到用户信息元素 - 认证可能已生效`);
      return true;
    } else {
      console.log(`⚠ 未检测到明显的用户信息元素`);
      return false;
    }
  } catch (error) {
    console.log(`验证认证状态时出错: ${error}`);
    return false;
  }
}

/**
 * 专门负责视频上传的过程
 */
async function uploadVideoToDouyin(page: Page, videoPath: string) {
  console.log(`\n[上传流程] 正在打开上传页面...`);
  await page.goto("https://creator.douyin.com/creator-micro/content/upload", { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  // 滚动到页面顶部，确保上传区域可见
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);
  
  console.log(`[上传流程] 准备上传视频: ${videoPath}`);
  try {
    // 等待上传按钮或 input 出现
    const uploadSelector = "div[class^='container'] input";
    try {
      await page.waitForSelector(uploadSelector, { timeout: 10000 });
      await page.locator(uploadSelector).setInputFiles(videoPath);
    } catch (e) {
      console.log(`[上传流程] 默认选择器失败，尝试通用 input[type="file"]...`);
      await page.setInputFiles('input[type="file"]', videoPath);
    }
    
    console.log(`✓ [上传流程] 已成功选择视频文件，等待跳转至发布页面...`);

    // 等待页面跳转 (循环检查 URL)
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
      // 不在这里等待上传完成，而是返回让 fillVideoDetails 在填写详情的同时等待上传
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

/**
 * 等待视频上传完成（与 Python debug/main.py 逻辑一致）
 * 判断依据：检测"重新上传"按钮是否出现
 */
async function waitForVideoUploadComplete(page: Page, timeout: number = 60000): Promise<boolean> {
  console.log(`  [-] 等待视频上传完成...`);
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      // 向上翻一屏，检查"重新上传"按钮（与 Python 逻辑一致）
      await page.evaluate(() => {
        // 向上滚动一屏的距离
        window.scrollBy(0, -window.innerHeight);
      });
      await page.waitForTimeout(500);
      
      // 方法1：使用 Python 相同的 CSS 选择器
      let number = await page.locator('[class^="long-card"] div:has-text("重新上传")').count();
      
      // 方法2：如果方法1失败，尝试更通用的选择器
      if (number === 0) {
        number = await page.locator('div:has-text("重新上传")').count();
      }
      
      // 方法3：使用 text= 定位器（Playwright 推荐方式）
      if (number === 0) {
        number = await page.locator('text="重新上传"').count();
      }
      
      // 方法4：检查页面中是否包含"重新上传"文本
      if (number === 0) {
        const pageText = await page.content();
        if (pageText.includes('重新上传')) {
          number = 1; // 文本存在，认为上传完成
          console.log(`  [-] 通过页面文本检测到"重新上传"`);
        }
      }
      
      if (number > 0) {
        console.log(`  ✓ 视频上传完毕 (检测到 ${number} 个元素)`);
        return true;
      }
      
      // 检查是否上传失败 - 使用更可靠的方式
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

/**
 * 处理上传失败，重新上传视频
 */
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

/**
 * 填充视频详情（标题、话题、简介等）
 * 改进版本：使用多种策略来识别和填充"作品简介"输入框
 */
async function fillVideoDetails(stagehand: Stagehand, page: Page, title: string, description: string, tags: string[]) {
  console.log(`\n[详情流程] 正在分析页面并填充详情...`);
  
  try {
    await page.waitForTimeout(1000); // 短暂等待页面加载（与 Python 一边上传一边填详情）

    // 0. 先截图保存当前页面状态用于调试
    await page.screenshot({ path: './debug/debug_page_state.png' });
    console.log("  [-] 已保存页面截图到 ./debug/debug_page_state.png");

    // 1. 尝试使用 Playwright 原生选择器直接定位作品简介输入框
    console.log("  [-] 尝试使用多种选择器定位作品简介输入框...");
    
    // 抖音作品简介可能的多种选择器
    const descriptionSelectors = [
      // 包含"简介"关键词的 textarea
      'textarea[placeholder*="简介"]',
      'textarea[data-placeholder*="简介"]',
      // 包含"简介"关键词的 div (contenteditable)
      'div[contenteditable="true"][data-placeholder*="简介"]',
      'div[contenteditable="true"][placeholder*="简介"]',
      // 根据 aria-label 或 data-placeholder
      '[data-placeholder="添加作品简介"]',
      '[data-placeholder="输入作品简介"]',
      'textarea[aria-label*="简介"]',
      // 通用 contenteditable 区域（通常简介是较大的编辑器）
      'div.notranslate[contenteditable="true"]',
      '.zone-container[contenteditable="true"]',
      // 查找包含"简介"文本的元素附近的输入区域
      'div[class*="description"]',
      'div[class*="intro"]',
      // 更通用的：查找作品描述区块内的输入框
      '[class*="desc-container"] textarea',
      '[class*="description"] textarea',
      // 可能的无障碍属性
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

    // 2. 同时获取页面上的所有输入框信息用于调试
    const allInputsInfo = await page.evaluate(() => {
      const inputs: any[] = [];
      
      // 获取所有 input, textarea, contenteditable 元素
      document.querySelectorAll('input, textarea, [contenteditable="true"]').forEach((el, idx) => {
        const input = el as HTMLElement;
        inputs.push({
          index: idx,
          tagName: input.tagName,
          className: input.className,
          id: input.id,
          placeholder: input.getAttribute('placeholder'),
          'data-placeholder': input.getAttribute('data-placeholder'),
          contenteditable: input.getAttribute('contenteditable'),
          ariaLabel: input.getAttribute('aria-label'),
          textContent: input.textContent?.substring(0, 50),
        });
      });
      return inputs;
    });
    
    console.log("  [-] 页面输入元素分析:", JSON.stringify(allInputsInfo, null, 2));

    // 3. 如果找到了描述输入框，直接使用 Playwright 填充
    if (descriptionLocator) {
      console.log("  [-] 使用 Playwright 直接填充作品简介...");
      await descriptionLocator.click();
      await descriptionLocator.fill(description);
      console.log("  ✓ 作品简介已填充");
    } else {
      // 4. 如果没找到，回退到使用 Stagehand AI
      console.log("  [-] 未找到指定输入框，使用 Stagehand AI 分析...");
      
      // Stagehand extract API 变化：instruction 作为第一个参数
      const pageAnalysis = await stagehand.extract(
        "识别页面上用于填写作品标题(placeholder='填写作品标题，为作品获得更多流量')、作品简介(可能是一个大的文本编辑器区域，用于填写作品介绍/描述)的输入框。注意作品简介可能是一个可编辑的 div 而不是 textarea。"
      );

      console.log("  [-] AI 页面分析结果:", pageAnalysis);

      // 使用 Stagehand act 来填充
      await stagehand.act(`在作品标题输入框中输入: ${title}`);
      await page.waitForTimeout(500);
      
      // 尝试多种描述输入的指令
      await stagehand.act(`在作品简介或作品描述的编辑器中输入: ${description}`);
    }

    // 5. 单独处理标题（通常更容易定位）
    const titleSelectors = [
      'input[placeholder*="标题"]',
      'input[placeholder*="作品标题"]',
      'input[aria-label*="标题"]',
    ];
    
    for (const selector of titleSelectors) {
      const titleInput = page.locator(selector);
      if (await titleInput.count() > 0) {
        console.log(`  [-] 使用选择器填充标题: ${selector}`);
        await titleInput.first().fill(title);
        break;
      }
    }

    // 6. 如果标题还没填，尝试使用 Stagehand
    try {
      await stagehand.act(`在标题输入框中填写: ${title}`);
    } catch (e) {
      console.log("  [-] Stagehand 填充标题失败，继续下一步");
    }

    // 7. 视频上传完成检查已移至 uploadVideoToDouyin 函数
    // 这里做双重保险检查，确保上传已完成
    let uploadCheck = await page.locator('[class^="long-card"] div:has-text("重新上传")').count();
    
    // 备用检测方法
    if (uploadCheck === 0) {
      uploadCheck = await page.locator('div:has-text("重新上传")').count();
    }
    if (uploadCheck === 0) {
      uploadCheck = await page.locator('text="重新上传"').count();
    }
    if (uploadCheck === 0) {
      const pageText = await page.content();
      if (pageText.includes('重新上传')) {
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
    // 尝试保存失败时的页面截图
    try {
      await page.screenshot({ path: 'debug_error_state.png' });
      console.log("  [-] 已保存错误时的页面截图到 debug_error_state.png");
    } catch (e) {}
    return false;
  }
}

/**
 * 设置视频封面
 */
async function setThumbnail(page: Page, thumbnailPath: string) {
  if (!thumbnailPath) return;
  
  console.log(`\n[封面流程] 正在设置视频封面: ${thumbnailPath}`);
  try {
    await page.click('text="选择封面"');
    await page.waitForSelector("div.dy-creator-content-modal");
    await page.click('text="设置竖封面"');
    await page.waitForTimeout(2000);
    
    // 定位到上传区域并点击
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator("div[class^='semi-upload upload'] >> input.semi-upload-hidden-input").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(thumbnailPath);
    
    await page.waitForTimeout(2000);
    await page.locator("div#tooltip-container button:visible:has-text('完成')").click();
    
    console.log('✓ [封面流程] 视频封面设置完成！');
    // 等待封面设置对话框关闭
    await page.waitForSelector("div.extractFooter", { state: 'detached' });
  } catch (error) {
    console.log(`⚠ [封面流程] 设置封面失败: ${(error as Error).message}`);
  }
}

/**
 * 处理自动视频封面 (当提示 "请设置封面后再发布" 时)
 */
async function handleAutoVideoCover(page: Page) {
  try {
    const errorTip = page.locator('text="请设置封面后再发布"');
    if (await errorTip.first().isVisible()) {
      console.log("  [-] 检测到需要设置封面提示...");
      const recommendCover = page.locator('[class^="recommendCover-"]').first();

      if (await recommendCover.count() > 0) {
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

/**
 * 发布视频
 */
async function publishVideo(page: Page) {
  console.log(`\n[发布流程] 准备发布视频...`);
  
  // 滚动到页面底部查找发布按钮
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  
  let attempts = 0;
  while (attempts < 5) {
    try {
      // 使用精确匹配（与 Python 一致）
      let publishButton = page.locator('button:has-text("发布")').first();
      
      // 尝试多种选择器
      let buttonCount = await publishButton.count();
      if (buttonCount === 0) {
        // 尝试查找所有按钮
        publishButton = page.locator('button').first();
        buttonCount = await page.locator('button').count();
        console.log(`  [-] 页面共有 ${buttonCount} 个按钮，尝试查找第一个按钮`);
      }
      
      // 调试：保存页面截图
      await page.screenshot({ path: './debug/publish_page_state.png' });
      console.log(`  [-] 已保存发布页面截图`);
      
      // 使用 evaluate 来滚动（兼容 Stagehand）
      await page.evaluate(() => {
        const btn = document.querySelector('button');
        if (btn) btn.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(500);
      if (await publishButton.count() > 0) {
        // 确保按钮可见 - 使用 evaluate 方式
        await page.evaluate(() => {
          const btns = document.querySelectorAll('button');
          if (btns.length > 0) btns[0].scrollIntoView({ block: 'center' });
        });
        await page.waitForTimeout(500);
        await publishButton.click();
        console.log(`[发布流程] 已点击发布按钮 (尝试 ${attempts + 1})，等待跳转...`);
        
        try {
          // 等待跳转至管理页
          let redirected = false;
          const waitStart = Date.now();
          while (Date.now() - waitStart < 5000) {
            if (page.url().includes("/content/manage")) {
              redirected = true;
              break;
            }
            await page.waitForTimeout(500);
          }

          if (redirected) {
            console.log(`✓ [发布流程] 视频发布成功!`);
            return true;
          }
          console.log(`  [-] 发布后未跳转，检查是否有错误提示...`);
          await handleAutoVideoCover(page);
        } catch (e) {
          console.log(`  [-] 发布后未跳转，检查是否有错误提示...`);
          await handleAutoVideoCover(page);
        }
      } else {
        console.log(`⚠ [发布流程] 未找到发布按钮`);
        return false;
      }
    } catch (error) {
      console.log(`[发布流程] 尝试失败: ${(error as Error).message}`);
    }
    attempts++;
    await page.waitForTimeout(2000);
  }
  return false;
}

/**
 * 执行业务任务
 */
async function performDouyinTasks(stagehand: Stagehand, page: Page, videoPath: string) {
  const videoTitle = "可爱的小猫咪";
  const videoDescription = "这是一只非常可爱的橘猫，它正在玩耍。"; // 新增简介参数
  const videoTags = ["宠物", "萌宠"];
  // 如果有封面图，可以设置此路径
  const thumbnailPath = ""; 

  // 1. 上传视频
  const uploadSuccess = await uploadVideoToDouyin(page, videoPath);
  if (!uploadSuccess) return;

  // 2. 填充详情
  const fillSuccess = await fillVideoDetails(stagehand, page, videoTitle, videoDescription, videoTags);
  if (!fillSuccess) return;

  // 3. 设置封面 (可选)
  if (thumbnailPath) {
    await setThumbnail(page, thumbnailPath);
  }

  // 4. 发布
  await publishVideo(page);
}

async function main() {
  let stagehand: Stagehand | undefined;

  try {
    stagehand = await initStagehand();
    const cookiesPath = join(process.cwd(), "cookies", "douyin.json");

    // 1. 注入 Cookie 并获取 page
    const page = await injectCookies(stagehand, cookiesPath);

    // 2. 验证状态
    const isAuthenticated = await verifyAuthStatus(page);

    if (isAuthenticated) {
      // 3. 执行任务
      const videoPath = join(process.cwd(), "upload", "cat.mp4");
      await performDouyinTasks(stagehand, page, videoPath);
    }

    console.log(`\n任务执行完成，浏览器将保持打开 30 秒...`);
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error("发生错误:", error);
  } finally {
    if (stagehand) {
      console.log(`\n关闭浏览器...`);
      await stagehand.close();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
