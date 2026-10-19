# Research: DOCX 文件编辑参考来源与适用边界

- Query: 固定版本核对 Office 文件编辑的分组、任务属性面板、键盘与只读预览边界
- Scope: mixed
- Date: 2026-10-20 Asia/Shanghai

## Findings

本轮优先参考 GenOffice 固定版和 Office for the web/Google Docs 官方说明；Mimir 的 `--me-*` 主题与现有统一 Shell 决定 chrome。按项目要求重新检查 WeKnora 官网与源码；WeKnora 的知识预览不等于 DOCX 原件编辑，不能作为 Office 工具栏或密码保护规范的主样板。以下为实际 HTTP 请求证据，未操作第三方登录产品。

### WeKnora public website

- URL: https://weknora.weixin.qq.com/
- HTTP: 200; checked UTC 2026-10-19T18:47:47.315183+00:00
- Response: 113529 bytes; SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`
- Concrete excerpts (source original line numbers; webpage snippets have no line-number contract):
  -  WeKnora — 帮你找到答案，并将知识付诸实践 (function(){var t='auto';try{t=localStorage.getItem('vitepress-theme-appearance')||'auto'}catch(e){}document.documentElement.classList.toggle('dark',t==='dark'||
  - ='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))})() 跳至正文 产品能力 v0.8.3 NEW 生态集成 企业部署 文档 模型评测 LLM Embed Rerank 数据集 GitHub GitHub v0.8.3 画廊 · 多模态 Embedding · Wiki 图谱 · 原文引用 帮你找到答案， 并将知识付诸实践。 TENCENT OPEN SOURCE · WEKNORA 腾讯开源的企业级知识管理框架。 汇集团队资料，用于知识问答、任
  - ).matches))})() 跳至正文 产品能力 v0.8.3 NEW 生态集成 企业部署 文档 模型评测 LLM Embed Rerank 数据集 GitHub GitHub v0.8.3 画廊 · 多模态 Embedding · Wiki 图谱 · 原文引用 帮你找到答案， 并将知识付诸实践。 TENCENT OPEN SOURCE · WEKNORA 腾讯开源的企业级知识管理框架。 汇集团队资料，用于知识问答、任务执行和 Wiki 整理。 开始使用 GitHub RAG 问答 / Agent 推理 / 自动 Wiki 产品演示 / PRO
  - GitHub v0.8.3 画廊 · 多模态 Embedding · Wiki 图谱 · 原文引用 帮你找到答案， 并将知识付诸实践。 TENCENT OPEN SOURCE · WEKNORA 腾讯开源的企业级知识管理框架。 汇集团队资料，用于知识问答、任务执行和 Wiki 整理。 开始使用 GitHub RAG 问答 / Agent 推理 / 自动 Wiki 产品演示 / PRODUCT FILM 02:25 / 1080P WeKnora 产品演示 播放产品介绍 · 2 分 25 秒 知识问答、Agent 推理与 Wiki 整理 README
  - 、任务执行和 Wiki 整理。 开始使用 GitHub RAG 问答 / Agent 推理 / 自动 Wiki 产品演示 / PRODUCT FILM 02:25 / 1080P WeKnora 产品演示 播放产品介绍 · 2 分 25 秒 知识问答、Agent 推理与 Wiki 整理 README 产品视频 · 英文旁白 / 中英字幕 腾讯开源 · MIT License 支持私有化部署 自由选择模型与存储 01 / KNOWLEDGE AT WORK 知识问答、任务执行与自动 Wiki 查询资料用 RAG，处理多步任务用 Agent， 整理知识
  - 档整理成 Wiki 从原始文档生成相互链接的 Wiki 页面与知识图谱，支持浏览、编辑和版本回滚。 自动组织 知识图谱 版本回滚 了解 Wiki 02 / INTRODUCING v0.8.3 图文检索、原文核对与知识组织 查看版本说明 画廊 文档图片，集中浏览 集中浏览文档图片，按来源、描述和图片属性筛选，查看原图与出处。 浏览图片 查看详情 了解更多 多模态 Embedding 文字与图片，共同检索 让图片、图表与文字共同参与知识检索，用自然语言查找相关内容。支持 腾讯 WeMM-Embedding 、Qwen3-VL-Embedding 等

### WeKnora latest release

- Parsed evidence: `tag_name=v0.8.3`, `published_at=2026-10-14T07:53:24Z`; response identified below.

- URL: https://api.github.com/repos/Tencent/WeKnora/releases/latest
- HTTP: 200; checked UTC 2026-10-19T18:47:48.087211+00:00
- Response: 44048 bytes; SHA256 `163a964cc10c02fbca6dec0ad01f6fee50ffa0cc3f95957587c7df3b55fa9478`
- Concrete excerpts (source original line numbers; webpage snippets have no line-number contract):

### WeKnora release commit

- Parsed evidence: `sha=3e22822c1d2397be730c458c7539d0eb8c113a24`; this is the release commit, not main HEAD.

- URL: https://api.github.com/repos/Tencent/WeKnora/commits/v0.8.3
- HTTP: 200; checked UTC 2026-10-19T18:47:49.520087+00:00
- Response: 397989 bytes; SHA256 `01cf54c5d9467c803927c9b6162afc9c0053172e7c87aebd9ad66121e67f2171`
- Concrete excerpts (source original line numbers; webpage snippets have no line-number contract):

### WeKnora preview source

- URL: https://raw.githubusercontent.com/Tencent/WeKnora/3e22822c1d2397be730c458c7539d0eb8c113a24/frontend/src/utils/documentPreviewMarkdown.ts
- HTTP: 200; checked UTC 2026-10-19T18:47:50.330909+00:00
- Response: 2529 bytes; SHA256 `041afb8656a7ac7cba587fe9a1b7b1a761d98668236d44f27d1877594c18da4a`
- Concrete excerpts (source original line numbers; webpage snippets have no line-number contract):
  - 7: import { escapeHTML, safeMarkdownToHTML, sanitizeDocumentPreviewHTML } from './security.ts'
  - 12: export function isSafePreviewImageHref(href: unknown): href is string {
  - 36:     if (!isSafePreviewImageHref(href)) return ''
  - 65:   sanitize: (html: string) => string = sanitizeDocumentPreviewHTML,
  - 68:   return sanitize(previewMarked.parse(safeMarkdownToHTML(mathSafe)) as string)

### GenOffice Ribbon

- URL: https://raw.githubusercontent.com/genspark-ai/genoffice/480548fd55f1be3593ee0d8e316a734751d58309/apps/docs/src/renderer/components/Ribbon.tsx
- HTTP: 200; checked UTC 2026-10-19T18:47:51.560137+00:00
- Response: 171124 bytes; SHA256 `9fd0ec2c20f5dc924ed335622d44aad6e52d983def5b597a05664ff8fe95d791`
- Concrete excerpts (source original line numbers; webpage snippets have no line-number contract):
  - 153:   /** Quick-access area on the tab row's left (save/undo-redo/autosave), matching the WPS/Office QAT */
  - 200:   /** References → footnotes / endnotes / citations */
  - 216:   tabRequest?: { tab: string; nonce: number } | null
  - 239:   /** Review → comments / revisions / compare / protection */
  - 322: const TABS = (
  - 327: const TABLE_TABS = ['tableDesign', 'tableLayout'] as const
  - 336: const TABLE_PRESETS = [
  - 380: const TABLE_AUTO_FIT_OPTIONS: Array<[TableAutoFitMode, StringKey]> = [
  - 386: // tab values double as internal-state / external tabRequest keys; translated for display via these string keys
  - 771–774: leaving Draw tab returns to text editing; `if (tab !== 'draw' && inkTool !== 'select') onInkTool('select')` (verified fixed source).

### GenOffice references tab

- URL: https://raw.githubusercontent.com/genspark-ai/genoffice/480548fd55f1be3593ee0d8e316a734751d58309/apps/docs/src/renderer/components/ribbon-references-tab.tsx
- HTTP: 200; checked UTC 2026-10-19T18:47:52.370490+00:00
- Response: 22427 bytes; SHA256 `43bd43db592b36a88d8b7faba09cf3770ccdb125e9eb8ecb616262f4d7f0e1a1`
- Concrete excerpts (source original line numbers; webpage snippets have no line-number contract):
  - 6:   citationText,
  - 7:   generateCaptionXml,
  - 8:   generateIndexFieldXml,
  - 9:   generateTocFieldXml,
  - 11:   type SourceInfo,
  - 12:   type TocEntry,
  - 20:   IconCaption,
  - 22:   IconCitation,
  - 27:   IconToc,

### GenOffice tabs

- URL: https://raw.githubusercontent.com/genspark-ai/genoffice/480548fd55f1be3593ee0d8e316a734751d58309/apps/docs/src/renderer/components/ribbon-tabs.tsx
- HTTP: 200; checked UTC 2026-10-19T18:47:53.387508+00:00
- Response: 53793 bytes; SHA256 `89e928ec78963db9a9515dbce5cebf2536b5ed86a31dc87bbb17673402db7c92`
- Concrete excerpts (source original line numbers; webpage snippets have no line-number contract):
  - 34:   IconCompare,
  - 155:       const m = node.marks.find((mm) => mm.type === type)
  - 278:         type: 'docProtected',
  - 354:     type: 'docProtected',
  - 376:   const def = DOC_SHAPES.find((s) => s.prst === prst)
  - 428:     type: 'docProtected',
  - 480:     type: 'docProtected',
  - 533:     type: 'docProtected',
  - 616:   isProtected: boolean

### Microsoft Word keyboard guide

- URL: https://support.microsoft.com/en-us/accessibility/word/keyboard-shortcuts-in-word
- HTTP: 200; checked UTC 2026-10-19T18:47:57.712403+00:00
- Response: 224570 bytes; SHA256 `dc1a92520a50f56eeb7ad1395dbd0bcdad2c3bda8d23b46a385dab691bd4913f`
- Concrete excerpts (source original line numbers; webpage snippets have no line-number contract):
  - bar. Use the arrow keys to select Close , and then press Enter. Ribbon keyboard shortcuts The ribbon area groups together related options in tabs. For example, on the Home tab, the Font group includes the Font Color option. Press the Alt key to display the ribbon shortcuts -- called Key Tips -- as seen below. Note Add-ins a
  - rl+F6 Go to the Tell Me or Search text field. Alt+Q Top of Page Ribbon keyboard shortcuts Word for the web offers shortcuts called access keys to navigate the ribbon. If you've used access keys to save time on Word for desktop computers, you'll find access keys very similar in Word for the web. On a Wi
  - of Page Ribbon keyboard shortcuts Word for the web offers shortcuts called access keys to navigate the ribbon. If you've used access keys to save time on Word for desktop computers, you'll find access keys very similar in Word for the web. On a Windows computer, access keys all start with

### Google Docs keyboard guide

- URL: https://support.google.com/docs/answer/179738?hl=en
- HTTP: 200; checked UTC 2026-10-19T18:48:01.255759+00:00
- Response: 1696467 bytes; SHA256 `b8af0f640dcfc801991071f7e0f0b467f8330adce3c8b386e2d0988d4ae2071f`
- Concrete excerpts (source original line numbers; webpage snippets have no line-number contract):
  -  Docs Editors Tools Keyboard shortcuts for Google Docs Keyboard shortcuts for Google Docs Use keyboard shortcuts in Google Docs to navigate, format, and edit. Note: Some shortcuts might not work for all languages or keyboards. To open a list of keyboard shortcuts in Google Docs, press Ctrl + / (Windows, Ch
  - hange is automatically saved in Drive Ctrl + s Print Ctrl + p Open Ctrl + o Find Ctrl + f Find and replace Ctrl + h Find again Ctrl + g Find previous Ctrl + Shift + g Hide the menus (compact mode) Ctrl + Shift + f Insert page break Ctrl + Enter Tool finder(formerly Search the menus) Al
  - ed in Drive Ctrl + s Print Ctrl + p Open Ctrl + o Find Ctrl + f Find and replace Ctrl + h Find again Ctrl + g Find previous Ctrl + Shift + g Hide the menus (compact mode) Ctrl + Shift + f Insert page break Ctrl + Enter Tool finder(formerly Search the menus) Alt + / Alt + Shift +
  -  Print Ctrl + p Open Ctrl + o Find Ctrl + f Find and replace Ctrl + h Find again Ctrl + g Find previous Ctrl + Shift + g Hide the menus (compact mode) Ctrl + Shift + f Insert page break Ctrl + Enter Tool finder(formerly Search the menus) Alt + / Alt + Shift + z Google Chrome: Alt +
  - Save Every change is automatically saved in Drive ⌘ + s Print ⌘ + p Open ⌘ + o Find ⌘ + f Find and replace ⌘ + Shift + h Find again ⌘ + g Find previous ⌘ + Shift + g Hide the menus (compact mode) Ctrl + Shift + f Insert page break ⌘ + Enter Tool finder (formerly Search the menus) Optio
  - lly saved in Drive ⌘ + s Print ⌘ + p Open ⌘ + o Find ⌘ + f Find and replace ⌘ + Shift + h Find again ⌘ + g Find previous ⌘ + Shift + g Hide the menus (compact mode) Ctrl + Shift + f Insert page break ⌘ + Enter Tool finder (formerly Search the menus) Option + / Ctrl + Option + z R

### Version and applicability

- WeKnora latest release API returned `v0.8.3`, release commit `3e22822c1d2397be730c458c7539d0eb8c113a24`. The public site advertises knowledge retrieval/Agent, and `documentPreviewMarkdown.ts` explicitly separates safe image URL handling and sanitized Markdown. This supports preserving a distinction between knowledge preview and editable original; it gives no DOCX formatting, protection, or Ribbon parity evidence. Do not copy its Markdown editor as Office UI.
- GenOffice is pinned to `480548fd55f1be3593ee0d8e316a734751d58309`, Apache-2.0, matching `packages/office/vendor/UPSTREAM.json:18–22`. Source HTTP URLs above contain the full commit and are the authority, rather than assuming a reused `/private/tmp` checkout HEAD. `Ribbon.tsx` documents quick-access save/undo separate from tab commands, comments/revisions/compare/protection as Review and footnotes/endnotes/citations as References. The Draw-tab exit rule cancels active drawing. Preserve these patterns within Mimir's own CompactToolbar; do not import upstream app shell or modify vendor.
- Office and Google Docs support pages have no fixed published code version. Time, HTTP and response SHA identify the snapshot. Office documents related options grouped in tabs and separate web keyboard constraints. Google Docs lists Find/replace/next/previous. These support discoverable tabs, keyboard navigation, find focus and returning to editing context; they do not establish Mimir supports Office access keys or Office-complete formatting.
- Existing Mimir source is the behavior authority: one EditorContent stays mounted; view/zoom/navigation do not create document history; current-copy export uses the actual save snapshot but does not mark saved or call io.save; protection remains enforced by session/Agent/PM guards. Any proposed polish must preserve these boundaries.

### Related specs

- `.trellis/spec/office/frontend/editors/conventions.md`: compact actual-width command groups; DOCX navigation/read/edit/focus and Inspector contracts.
- `.trellis/spec/office/frontend/editors/pitfalls.md`: table conditional preview/native deltas; citations sources/history; async callbacks and source identity.
- `.trellis/spec/office/frontend/shell/conventions.md`: quick-access, fixed actions, visible property labels and shared theme primitives.
- `.trellis/spec/office/frontend/shell/pitfalls.md`: actual pointerdown→click portal ownership, number input first-click commit, focus and short viewport.
- `.trellis/spec/office/engine/conventions.md`: no vendor edits; DOCX protection/encryption/metadata/native write safety.

## Caveats / Not Found

- No login or browser parity audit of third-party products was performed; HTTP source/docs evidence only. No live Office/Docs screenshot or pixel match claim.
- Public site HTML and release source are separate evidence; do not assert identical deployed version from release alone.
- Complete response bytes were inspected in memory and identified by hash; this research file preserves concise excerpts, not full raw responses.
- No dependency upgrade, new engine ability, collaboration feature or protection policy change is proposed.
