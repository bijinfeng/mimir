/**
 * pdf.js 的运行时资产路径（cmaps / 标准字体 / wasm）。
 *
 * ## 为什么非要有这些
 *
 * | 资产 | 少了它的症状 |
 * |---|---|
 * | `cmaps/` | **中文、日文、韩文的 PDF 整段文字不显示**（不是乱码，是空白）。那些 PDF 用 CID 字体，字符到字形的映射表不在文件里，pdf.js 得按 Adobe 的 CMap 去查——169 个文件 |
 * | `standard_fonts/` | 用标准 14 字体（Helvetica / Times 等）但**没内嵌**的 PDF 显示为空白或错位 |
 * | `wasm/` | pdf.js 6.x 的图像解码（JPEG 2000、JBIG2）走 WASM；缺失时那类页面渲染失败 |
 *
 * 三条都是**静默的**：文件能打开、页数对、只有内容缺。所以宁可多带 3.9MB
 * 资产，也不能让「中文 PDF 打不开」在生产里出现。
 *
 * ## 为什么是**固定路径**而不是打包器给的哈希 URL
 *
 * pdf.js 按**原始文件名**去目录里取（它会请求
 * `cmaps/Adobe-GB1-0.bcmap`，而不是某个带哈希的名字）。所以：
 *
 *   - `?url` 导入一个 cmap 只能拿到**那一个**文件的 URL，其余 168 个仍然要按
 *     原名找——带哈希的产物目录里根本没有那些名字，于是 404
 *   - 于是资产落在宿主的 `public/pdfjs/`：**Vite 把 `public/` 原样复制到产物根、
 *     不改名**，而服务端的静态中间件（`lib/static.ts`）整目录挂载 `dist`，
 *     所以 `/pdfjs/cmaps/…bcmap` 在开发与生产都成立
 *
 * 这条约束（文件名不能被哈希）是 pdf.js 侧的，不是我们的选择。改这块之前先
 * 想清楚：换一个「更现代」的资产方案，代价可能是中文 PDF 静默变空白。
 *
 * ## 那些文件**不在 git 里**
 *
 * 它们是 `pdfjs-dist` 依赖自带的资产（199 个文件、7.5MB），由宿主的
 * `apps/web/pdfjs-assets.ts` 在**构建时从 node_modules 拷**过来，而
 * `public/pdfjs/` 在 `.gitignore` 里。提交它们的代价：仓库白大三倍、
 * 升级依赖时容易忘了同步（旧 cmaps 配新引擎 → 只在特定 PDF 上出现的
 * 兼容问题）。
 *
 * ## 路径是绝对的（以 `/` 开头）
 *
 * 相对路径会随**当前页面路由**变化（`/docs?scope=all` 与 `/` 的基准不同），
 * 于是从某些页面打开 PDF 时 cmap 会 404——而那种失效只在特定入口出现，
 * 最难查。绝对路径没有这个问题。
 *
 * 一条部署前提：**应用挂在域名根**。挂在子路径（`example.com/mimir/`）时
 * 这些绝对路径要跟着 base 走——那时改成从 `import.meta.env.BASE_URL` 派生。
 * 目前 compose 与桌面端都挂在根，所以先不做那层（做了也没有场景能验证它）。
 */

export const PDFJS_ASSETS = {
  cmaps: '/pdfjs/cmaps/',
  standardFonts: '/pdfjs/standard_fonts/',
  wasm: '/pdfjs/wasm/',
} as const
