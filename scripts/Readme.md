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