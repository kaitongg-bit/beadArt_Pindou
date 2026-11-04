import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist-xhs');

console.log('🚀 1. 开始构建小红书离线包 (Vite)...');
execSync('npx vite build --config vite.config.xhs.ts', {
  cwd: rootDir,
  env: { ...process.env, VITE_APP_TARGET: 'xhs' },
  stdio: 'inherit'
});

console.log('📦 2. 注入离线依赖与修复 CSP 约束...');
// 确保 tailwind 离线脚本
const tailwindSrc = '/tmp/tailwind.js';
const tailwindDest = path.join(distDir, 'assets', 'tailwind.js');
if (fs.existsSync(tailwindSrc)) {
  fs.copyFileSync(tailwindSrc, tailwindDest);
  console.log('   ✅ 复制 tailwind.js 到 assets/tailwind.js');
} else {
  console.error('   ❌ 找不到 /tmp/tailwind.js，请先下载！');
  process.exit(1);
}

// 修复 index.html
const indexPath = path.join(distDir, 'index.html');
let html = fs.readFileSync(indexPath, 'utf-8');

// 移除外链图标
html = html.replace(/<link rel="apple-touch-icon"[^>]*>/g, '');

// 替换 Tailwind CDN 为本地包内脚本
html = html.replace(
  /<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/g,
  '<script src="./assets/tailwind.js"></script>'
);

// 移除 Google 字体外链引入，使用系统通用字体栈
html = html.replace(
  /@import url\('https:\/\/fonts\.googleapis\.com\/css2\?[^']*'\);/g,
  '/* Offline System Fonts */'
);
html = html.replace(
  /font-family: 'Noto Sans SC', sans-serif;/g,
  'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;'
);

// 移除 module 与 crossorigin，确保为符合规范的离线经典脚本
html = html.replace(
  /<script type="module" crossorigin src="\.\/assets\/app\.js"><\/script>/g,
  '<script src="./assets/app.js"></script>'
);

fs.writeFileSync(indexPath, html, 'utf-8');
console.log('   ✅ dist-xhs/index.html 离线化与 CSP 合规修复完成');

console.log('🔍 3. 运行静态资源目录审计 (audit_artifact.py)...');
const auditScript = path.join(rootDir, '.skill', 'minitool-zip-builder', 'scripts', 'audit_artifact.py');
execSync(`python3 "${auditScript}" "${distDir}"`, { stdio: 'inherit' });

console.log('🗜️ 4. 打包为无嵌套根目录的 .zip...');
const zipOutput = path.join(rootDir, 'beadgift-xhs-minitool.zip');
if (fs.existsSync(zipOutput)) {
  fs.unlinkSync(zipOutput);
}
execSync(`cd "${distDir}" && zip -r "${zipOutput}" . -x '*.DS_Store'`, { stdio: 'inherit' });

console.log('🔍 5. 运行 ZIP 产物最终门禁审计...');
execSync(`python3 "${auditScript}" "${zipOutput}"`, { stdio: 'inherit' });

console.log(`\n🎉 小红书小工具静态离线包打包成功！产物路径: ${zipOutput}`);
