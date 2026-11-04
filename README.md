# BeadGift · 拼豆礼坊 🎨

<p align="center">
  <b>面向手作人与创作者的专业级拼豆图纸生成与精细化编辑工坊</b><br>
  <i>A professional perler bead pattern generator and fine-grained editor for crafters and creators.</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Author-@发疯拔萝卜-indigo?style=flat-square" alt="Author" />
  <img src="https://img.shields.io/badge/React-18-blue?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/Algorithm-Delta%20E%202000-emerald?style=flat-square" alt="CIELAB DeltaE 2000" />
  <img src="https://img.shields.io/badge/Platform-Web%20%7C%20Xiaohongshu-ff2442?style=flat-square" alt="Xiaohongshu Minitool" />
</p>

---

## 🌐 语言 / Languages
- [中文说明](#-中文说明)
- [English Documentation](#-english-documentation)

---

## 🇨🇳 中文说明

### ✨ 核心特性

#### 1. 🧬 双色彩量化算法（自主择优）
- **V2 真彩肤色保护算法 (推荐写实/真人照)**：
  - 基于 **CIELAB Delta E 2000** 色差公式；
  - 智能面部暖色调识别，强力惩罚突兀纯白斑点与冷青/冷绿杂色；
  - 动态软高光收拢与死黑平滑过渡，消灭面部碎噪点，完美呈现五官立体感与自然肤色。
- **V1 经典高对比算法 (推荐插画/Icon)**：
  - 经典色块聚类与边缘锐化，轮廓分明、色彩纯正，适合卡通图案与极简像素风。

#### 2. ✏️ 交互式像素豆豆编辑工坊
- ➰ **套索改色 (Lasso Fill)**：手指或鼠标一笔圈选连续区域，松开即刻批量替换为当前选定豆色。搭载**连续线性插值补点**与**触屏原生滚动手势隔离 (`touch-action: none`)**，手机上连笔画再快也绝不跳格、绝不抢屏滚屏。
- 🎨 **画笔 (Brush)**：单格点涂与粗细画笔切换，支持对称模式与调色盘自由选色。
- 💉 **吸管 (Eyedropper)**：点击画布任意豆豆，秒速提取色号并设为当前画笔。
- ✋ **抓手 (Pan)**：在移动端与桌面端轻松拖动画布位置，不干扰画面内容。
- 🧼 **橡皮擦 (Eraser)**：随心擦去不需要的颗粒。
- ↩️ / ↪️ **全历史撤回与重做 (Undo / Redo)**：任何编辑步骤皆可反悔。
- 🔍 **智能缩放与视口适配**：
  - 仅在初次生成图纸或首次进入预览时自动全图居中适配；
  - **后续用户放大精修时完全锁定缩放与视野**，绝不再因为画一颗豆豆而强制重置跳回全图；
  - 工具栏提供 **【适配】** 按钮，随时一键归位全图。
- 👁️ **原图半透明对照**：支持随时叠印参考原图进行精细校对。

#### 3. 📄 紧凑高清单图与色号清单导出
- **紧凑扁平色号表**：
  - 摒弃以往纵向拉扯严重的巨型色块，采用 **34px 超扁平横向胶囊卡片**；
  - 左侧标明色号小色块，右侧清晰标注颗粒数，单行紧密排布 8~10 列，垂直留白减少 70% 以上；
  - 纵向长方形图纸导出依然比例协调、主体突出，告别难看的大长图。
- **署名与多格式支持**：
  - 图纸右上角、材料清单标题与底部版权条均附带设计署名 **`@发疯拔萝卜`**；
  - 支持超清 **PNG** 导出与 A4 打印级 **PDF** 导出。

#### 4. 📱 小红书离线小工具全兼容
- 符合小红书官方 `minitool-zip-builder` 规范，纯本地静态离线包（无外部 CDN、经典脚本无 `type="module"`）；
- 导出 PNG 时原生直调 `window.xhs.miniTool.saveImageToPhotosAlbum` 保存进手机系统相册；
- 通过 `audit_artifact.py` 严格门禁审计，包体积仅 ~400KB。

---

### 🚀 快速上手

#### 本地开发
```bash
# 1. 克隆仓库
git clone https://github.com/kaitongg-bit/beadArt_Pindou.git
cd beadArt_Pindou

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

#### 项目构建与部署
```bash
# 构建常规 Web 生产版本 (适用于 Vercel / Netlify / 自定义域名)
npm run build

# 构建小红书离线小工具 ZIP 包 (生成 beadgift-xhs-minitool.zip)
npm run build:xhs
```

---

## 🇬🇧 English Documentation

### ✨ Key Features

#### 1. 🧬 Dual Color Quantization Pipelines
- **V2 True-Color Skin Protection Pipeline (Recommended for Real Photos & Portraits)**:
  - Powered by the **CIELAB Delta E 2000** color distance metric;
  - Intelligent warm facial tone detection, heavily penalizing harsh white spots, cold green/cyan casts, and crushing dead blacks;
  - Soft highlight convergence and noise elimination to preserve smooth, natural skin textures and facial anatomy.
- **V1 Classic Contrast Pipeline (Recommended for Illustrations & Icons)**:
  - Sharp contrasts and solid color blocks, ideal for cartoons, pixel art, and logo designs.

#### 2. ✏️ Interactive Bead Studio & Editor
- ➰ **Lasso Fill Tool**: Continuous stroke loop selection with **linear step interpolation** and **touch-action gesture isolation (`touch-action: none`)** — draw seamlessly on mobile touchscreens without browser scrolling interruptions, and release to batch-recolor the enclosed area instantly.
- 🎨 **Brush Tool**: Pixel-by-pixel painting with single/thick brush toggles, symmetry mode, and palette integration.
- 💉 **Eyedropper Tool**: Sample any bead on the canvas to immediately pick its exact color code.
- ✋ **Pan / Hand Tool**: Move and drag the canvas freely without affecting pattern pixels.
- 🧼 **Eraser Tool**: Erase unwanted beads cleanly.
- ↩️ / ↪️ **Undo & Redo**: Full step-by-step history tracking.
- 🔍 **Smart Viewport & Auto-Fit**:
  - Auto-fits on initial pattern generation or first entry into the preview tab;
  - **Locks zoom and pan during editing** so your precision edits never get abruptly reset;
  - Dedicated **[Fit]** button in the toolbar to center the whole canvas anytime.
- 👁️ **Reference Overlay**: Toggle semi-transparent source image overlay for precision comparison.

#### 3. 📄 High-Resolution Blueprint & Compact Legend Export
- **Compact & Flat Color Inventory**:
  - Replaces tall bulky blocks with **34px ultra-flat horizontal pill cards**;
  - Color swatch on the left and bead count on the right, neatly packed into 8–10 columns;
  - Reduces vertical white space by over 70%, preventing rectangular drawings from turning into awkwardly elongated banners.
- **Attribution & Formats**:
  - Automatically watermarked with author attribution **`@发疯拔萝卜`** in headers, legend titles, and footers;
  - Supports high-resolution **PNG** and printable **PDF** exports.

#### 4. 📱 Xiaohongshu (RED) Minitool Compatibility
- Full compliance with the official Xiaohongshu offline minitool specifications (`minitool-zip-builder`);
- Zero external CDNs, classic non-module scripts, and full container CSP compliance;
- Direct integration with `window.xhs.miniTool.saveImageToPhotosAlbum` to save blueprints directly to the mobile photo album;
- Strictly audited with `audit_artifact.py` (0 errors, 0 warnings, package size ~400KB).

---

### 🚀 Getting Started

#### Local Development
```bash
# 1. Clone the repository
git clone https://github.com/kaitongg-bit/beadArt_Pindou.git
cd beadArt_Pindou

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

#### Production Builds
```bash
# Build for standard web hosting (Vercel, Netlify, Custom Domain)
npm run build

# Build Xiaohongshu offline minitool ZIP package (outputs beadgift-xhs-minitool.zip)
npm run build:xhs
```

---

## 🎨 Author & License

- **Author**: [@发疯拔萝卜](https://github.com/kaitongg-bit/beadArt_Pindou)
- **License**: MIT
