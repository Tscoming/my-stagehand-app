抖音 Cookie 生成器 (Douyin Cookie Cooker)
==========================================

用法:
  npx ts-node scripts/douyin-cookie-gen.ts [options]

选项:
  --path <path>    指定 Cookie 保存路径 (默认: cookies/douyin.json)
  --check          仅检查 Cookie 有效性，不重新生成
  --force          强制重新生成 Cookie
  --help           显示帮助信息

示例:
  npx ts-node scripts/douyin-cookie-gen.ts
  npx ts-node scripts/douyin-cookie-gen.ts --check
  npx ts-node scripts/douyin-cookie-gen.ts --force

---

performDouyinUpload 测试程序
==========================================

直接调用 performDouyinUpload 函数进行测试

用法:
  npx tsx scripts/test-performDouyinUpload.ts [选项]

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
  - 直接调用 performDouyinUpload 函数进行测试
  - 测试会启动浏览器执行完整的抖音上传流程
