# Research: XLSX 文件编辑外部参考与适用边界

- Query: XLSX 工具发现、属性面板、键盘和原件语义应参考什么
- Scope: mixed
- Date: 2026-10-20 Asia/Shanghai

## Findings

本轮主参考 Excel for the web、Google Sheets 官方键盘说明与 Mimir 固定版 GenOffice。按 AGENTS 要求实查 WeKnora 官网、最新公开 release 与该版源码。以下均为真实 HTTP 文档/源码证据，不是第三方产品 GUI 观察。

### WeKnora 官网

- URL: https://weknora.weixin.qq.com/
- HTTP: 200; resolved: https://weknora.weixin.qq.com/
- Checked UTC: 2026-10-19T19:19:00.173147+00:00
- Response: 113529 bytes; SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`
- Parsed evidence: see excerpts
- light'&&matchMedia('(prefers-color-scheme: dark)').matches))})() 跳至正文 产品能力 v0.8.3 NEW 生态集成 企业部署 文档 模型评测 LLM Embed Rerank 数据集 GitHub GitHub v0.8.3 画廊 · 多模态 Embedding · Wiki 图谱 · 原文引用 帮你找到答案， 并将知识付诸实践。 TENCENT OPEN SOURCE · WEKNORA 腾讯开源的企业级知识管理框架。 汇集团队资料，用于知识问答、任务执行和 Wiki 整理。 开始使用 GitHub RAG 问答 / Agent
-  WeKnora — 帮你找到答案，并将知识付诸实践 (function(){var t='auto';try{t=localStorage.getItem('vitepress-theme-appearance')||'auto'}catch(e){}document.documentElement.classList.toggle('dark',t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)
-  WEKNORA 腾讯开源的企业级知识管理框架。 汇集团队资料，用于知识问答、任务执行和 Wiki 整理。 开始使用 GitHub RAG 问答 / Agent 推理 / 自动 Wiki 产品演示 / PRODUCT FILM 02:25 / 1080P WeKnora 产品演示 播放产品介绍 · 2 分 25 秒 知识问答、Agent 推理与 Wiki 整理 README 产品视频 · 英文旁白 / 中英字幕 腾讯开源 · MIT License 支持私有化部署 自由选择模型与存储 01 / KNOWLEDGE AT WORK 知识问答、任务执行与自动 Wiki 查询资料用 RAG，处理多步

### WeKnora 最新 release

- URL: https://api.github.com/repos/Tencent/WeKnora/releases/latest
- HTTP: 200; resolved: https://api.github.com/repos/Tencent/WeKnora/releases/latest
- Checked UTC: 2026-10-19T19:19:00.634833+00:00
- Response: 44048 bytes; SHA256 `163a964cc10c02fbca6dec0ad01f6fee50ffa0cc3f95957587c7df3b55fa9478`
- Parsed evidence: tag=v0.8.3; published=2026-10-14T07:53:24Z; URL=https://github.com/Tencent/WeKnora/releases/tag/v0.8.3


### WeKnora release commit

- URL: https://api.github.com/repos/Tencent/WeKnora/commits/v0.8.3
- HTTP: 200; resolved: https://api.github.com/repos/Tencent/WeKnora/commits/v0.8.3
- Checked UTC: 2026-10-19T19:19:00.908511+00:00
- Response: 397989 bytes; SHA256 `01cf54c5d9467c803927c9b6162afc9c0053172e7c87aebd9ad66121e67f2171`
- Parsed evidence: release SHA=3e22822c1d2397be730c458c7539d0eb8c113a24; timestamp=2026-10-14T07:20:30Z


### WeKnora 安全知识预览源码

- URL: https://raw.githubusercontent.com/Tencent/WeKnora/3e22822c1d2397be730c458c7539d0eb8c113a24/frontend/src/utils/documentPreviewMarkdown.ts
- HTTP: 200; resolved: https://raw.githubusercontent.com/Tencent/WeKnora/3e22822c1d2397be730c458c7539d0eb8c113a24/frontend/src/utils/documentPreviewMarkdown.ts
- Checked UTC: 2026-10-19T19:19:00.489989+00:00
- Response: 2529 bytes; SHA256 `041afb8656a7ac7cba587fe9a1b7b1a761d98668236d44f27d1877594c18da4a`
- Parsed evidence: see excerpts
- 7: import { escapeHTML, safeMarkdownToHTML, sanitizeDocumentPreviewHTML } from './security.ts'
- 12: export function isSafePreviewImageHref(href: unknown): href is string {
- 36: if (!isSafePreviewImageHref(href)) return ''
- 65: sanitize: (html: string) => string = sanitizeDocumentPreviewHTML,
- 68: return sanitize(previewMarked.parse(safeMarkdownToHTML(mathSafe)) as string)

### GenOffice Sheets 界面文档

- URL: https://raw.githubusercontent.com/genspark-ai/genoffice/480548fd55f1be3593ee0d8e316a734751d58309/apps/sheets/docs/interface.md
- HTTP: 200; resolved: https://raw.githubusercontent.com/genspark-ai/genoffice/480548fd55f1be3593ee0d8e316a734751d58309/apps/sheets/docs/interface.md
- Checked UTC: 2026-10-19T19:19:00.986135+00:00
- Response: 3682 bytes; SHA256 `b98bbf95eaf1fd8aba477332ef1c7d1497c1a880ae1b02a372aefb85577b0416`
- Parsed evidence: see excerpts
- 10: 2. Ribbon tabs for Home, Insert, Page Layout, Formulas, Data, Review, View, and AI. There is no File tab — file commands live in the macOS application menu (File → Open ⌘O / Save ⌘S / Save As ⇧⌘S), forwarded to the renderer over IPC.
- 11: 3. A compact single-band ribbon with hairline group separators and no group captions (group names remain as `aria-label`s). Home exposes clipboard, font, alignment, number, styles, cells, and editing groups.
- 12: 4. Univer's name box + formula bar (preset `header: true, toolbar: false` renders only these), worksheet canvas, sheet tabs, statistics, and zoom controls.
- 15: The ribbon establishes the final command hierarchy. Commands whose workbook capability is not implemented are presented as reserved surfaces rather than active operations. In development builds the application menu title shows "Electron" — fixing that requires packaged builds (P0).
- 26: External XLSX files support direct cell value/formula editing and ribbon style edits, saved back with preservation checks. AI editing remains demo-only: the panel's AI inputs are disabled for imported files and display the save/streaming state.
- 40: ## Current limitations

### GenOffice Sheets 实现边界

- URL: https://raw.githubusercontent.com/genspark-ai/genoffice/480548fd55f1be3593ee0d8e316a734751d58309/apps/sheets/README.md
- HTTP: 200; resolved: https://raw.githubusercontent.com/genspark-ai/genoffice/480548fd55f1be3593ee0d8e316a734751d58309/apps/sheets/README.md
- Checked UTC: 2026-10-19T19:19:01.301218+00:00
- Response: 4445 bytes; SHA256 `5c5ddc0934ce4e0edc8afdbf27064c44b531dbb13e684dd0cc36a5850812dc74`
- Parsed evidence: see excerpts
- 18: - Cell value, formula, and ribbon style editing on streamed external workbooks with preservation-checked save / Save As (⌘S / ⇧⌘S); style changes are written copy-on-write into styles.xml.
- 21: - Interactive sorting and filtering on fully-loaded workbooks, saved back as autoFilter XML (value lists, blank flags, custom conditions) plus declarative row visibility; color filters and table-owned filters fail closed.
- 22: - Per-edge border editing, full font/fill/border color pickers, and fill clearing, written copy-on-write into the stylesheet's borders/fills tables.
- 25: - Preservation checks for untouched OOXML entries.

### Microsoft Excel 键盘文档

- URL: https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-excel-1798d9d5-842a-42b8-9c99-9b7213f0040f
- HTTP: 200; resolved: https://support.microsoft.com/en-us/accessibility/excel/keyboard-shortcuts-in-excel
- Checked UTC: 2026-10-19T19:19:12.065154+00:00
- Response: 219377 bytes; SHA256 `05eee6b68c7cd56573c63b0031f872a15d8694ff611a04d5d80e05b4acb10924`
- Parsed evidence: see excerpts
- xplore and navigate Excel This article describes the keyboard shortcuts in Excel for the web. Note To quickly find a shortcut, you can use the Search. Press Ctrl+F and then type your search words. When you use Excel for the web, we recommend that you use Microsoft Edge as your web browser. Because Excel for the
- oard shortcuts and function keys . In this topic Frequently used shortcuts Ribbon keyboard shortcuts Use the Access keys for ribbon tabs Work in the ribbon with the keyboard Keyboard shortcuts for navigating in cells Keyboard shortcuts for formatting cells Keyboard shortcuts for making selections and
- or a selected command. Down arrow key Open the menu for a selected button. Alt+Down arrow key When a menu or submenu is open, move to the next command. Down arrow key Expand or collapse the ribbon. Ctrl+F1 Open a context menu. Shift+F10 Or, on a Windows keyboard, the Windows Menu key (usually between t
- Excel on Windows. To do this Use Send your prompt, in the Copilot in Excel task pane. Enter Stop or cancel the Copilot in Excel request. Esc Accept changes made by Copilot in Excel. Ctrl+Enter Switch between edit, chat, and plan mode in the Copilot in Excel task pane. Ctrl+Shift+M Navigate between chat

### Google Sheets 键盘文档

- URL: https://support.google.com/docs/answer/181110?hl=en
- HTTP: 200; resolved: https://support.google.com/docs/answer/181110?hl=en
- Checked UTC: 2026-10-19T19:19:04.560442+00:00
- Response: 1682951 bytes; SHA256 `780f4ca01419c7739944d84c5a93c978e664e2672658583e73786498b19555f0`
- Parsed evidence: see excerpts
- hift + Space Undo Ctrl + z Redo Ctrl + y Ctrl + Shift + z F4 Find Ctrl + f Find and replace Ctrl + h Fill range Ctrl + Enter Fill down Ctrl + d Fill right Ctrl + r Save (every change is saved automatically in Drive) Ctrl + s Open Ctrl + o Print Ctrl + p Copy Ctrl + c Cut Ctrl + x Paste Ctrl + v Paste values on
- pup (for links, bookmarks, and images) holding Ctrl + Alt , press e then p Open drop-down menu on filtered cell Ctrl + Alt + r Open revision history Ctrl + Alt + Shift + h Close drawing editor Shift + Esc Edit notes and comments Insert/edit note Shift + F2 Insert/edit comment Ctrl + Alt + m Open comment disc
-  Keyboard shortcuts for Google Sheets - Computer - Google Docs Editors Help @font-face{font-family:'Roboto';font-style:normal;font-weight:400;src:url(https://fonts.gstatic.com/s/roboto/v18/KFOmCnqEu92Fr1Mu4mxP.ttf)format('truetype');}@font-face{font-family
-  or keyboards. To see a list of keyboard shortcuts in Google Sheets, press Ctrl + / (Windows, Chrome OS) or ⌘ + / (Mac). Tool finder (formerly search the menus), press Alt + / (Windows, Chrome OS) or Option + / (Mac). PC shortcuts Common actions Select column Ctrl + Space Select row Shift + Space Selec

### 适用于 Mimir 的结论

- WeKnora latest release API 及 release commit 标识公开版本；官网部署版本不能仅据 release 推断。官网强调知识检索、Agent、知识组织；安全 Markdown 预览源码区分 URL 检查与 HTML 清理。适用于知识来源和原文预览边界，不是 Excel 原生格式/公式/表格/图表/数据验证编辑依据，本轮不从其 Markdown 编辑器导出 Office 布局。
- GenOffice 固定 commit 与 `packages/office/vendor/UPSTREAM.json:18–22` 一致。Sheets 文档明确 quick access、分类 Ribbon、name box/formula bar、sheet tabs、zoom 和次要 Copilot；并明确原件保存与预览限制。可借鉴命令分组和工作表上下文，但 Mimir 当前 UI 和能力来源以实际源码为准，不能把上游预留功能当作可用功能，更不能变更 vendor。
- Microsoft/Google 官方说明为无固定代码版本的公开文档，以请求时间、最终 URL 和 SHA 标识这次快照。键盘路径、查找、下拉和工作表导航支持保持当前选择/焦点语义；本轮不据此新增完整 Excel 快捷键、打印引擎或透视能力。
- 实施边界：仅现有 XLSX 本地布局/忙态/焦点和查找结果生命周期；保存版本、ZIP保真、缓存公式、DV字面量、共享Agent与宿主命令均维持现行合同。

### Related specs

- `.trellis/spec/office/frontend/editors/conventions.md`、`pitfalls.md`：真实宽度 Ribbon、Inspector、异步失效与工作表选择。
- `.trellis/spec/office/frontend/shell/conventions.md`、`pitfalls.md`：复合 Select 显式 disabled、原生按钮/fieldset差别、焦点返回、面板滚动和嵌套 Escape。
- `.trellis/spec/office/engine/conventions.md`：原件保持、vendor固定、宿主写入边界。

## Caveats / Not Found

- 没有登录或操作第三方 Office/Google/WeKnora GUI；不声称视觉逐像素一致或逐控件行为实测。
- 公开文档/README描述可能滞后于固定源码，以各自版本与时间辨识。HTTP响应在内存检查后保存哈希与节选；不保存整份HTML。
- WeKnora公开release是公开发布证据，不能当作官网正在运行该commit的证据。
