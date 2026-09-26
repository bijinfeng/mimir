# packages/office —— Office 文档的浏览器内预览与编辑

这个包是 **vendored 代码 + 一层薄适配**：引擎与编辑器来自
[GenOffice](https://github.com/genspark-ai/genoffice)（Apache-2.0），
mimir 侧只加「打开 / 保存」的编排与样式裁剪。

**动手前先读这一页。** 它讲的都是「不知道就会毁掉几个月工作」的事。

---

## 目录形状

```
vendor/          vendored 的上游代码。**一律不改。** 同步会覆盖
  UPSTREAM.json    清单：commit、入口、跳过清单、文件列表（同步脚本维护）
  apps/docs/…      上游的文件，保持原目录形状（便于与上游对照）
  packages/docx-engine/…   docx 引擎
  packages/pptx-engine/…   pptx 解析（继承已解析成最终值）
  packages/pptx-render/…   pptx 布局（Slide → 纯数据的绘制列表）
src/
  docx.ts          解析层：openDocx → 编辑 → save
  pagination.ts    docx 分页视图；footnotes.ts 脚注
  xlsx.ts          xlsx 网格解析（**自己写的**，未 vendored）
  xlsx-edit.ts     xlsx 单元格编辑：补丁式保存 + 内联字符串（**自己写的**）
  pptx-archive.ts  pptx 的 zip / rels / 媒体读写（浏览器安全，预加载 entries）
  pptx.ts          pptx 打开：装配解析上下文 + 编辑会话（openPptxForEdit）
  pptx-save.ts     pptx 保存：元素补丁回字节（**移植自上游 index.ts**）
  pptx-render.ts   pptx 渲染入口：renderSlide / renderDeck → SVG 字符串
  pptx-svg.ts      RenderSlide → SVG（**我们写的**，替上游的 Konva 适配器）
  shell/           **界面外壳**：四种编辑器共用的框架与控件（D-054）
    EditorShell.tsx   四个槽位：toolbar / children / footer / status
    shell.css         外壳样式；主题值走 --me-* 自定义属性
    icons.tsx         工具条图标（自绘 SVG，不依赖图标库）
    editor-commands.ts 方言能力检测与调用
  editors/         **六种编辑器**（docx / xlsx / pptx / html / markdown / pdf）
    DocxEditor.tsx / XlsxEditor.tsx / PptxEditor.tsx
    HtmlEditor.tsx     源码 + 预览双栏（借 vendored 的 CodeMirror 与点选映射）
    PdfEditor.tsx      页面级操作（pdf-lib）+ 逐页渲染（pdf.js）
    MarkdownEditor.tsx / InlineToolbar.tsx
    use-source.ts      取字节 → 解析 → 写回（含「解析结果绑在哪个字节上」）
    pdf-render.ts      pdf.js → canvas（**代次防并发**，见文件注释）
    pdfjs-assets.ts    cmaps / 标准字体 / wasm 的路径（宿主 public/ 提供）
    types.ts           EditorIo：宿主提供取与存
  index.ts         对外出口
  shims/i18n.ts          上游 i18n 的等价替代
  shims/pptx-engine-types.ts  pptx 引擎的类型桶（挡住整条写路径）
  generated/       样式裁剪产物（不进 git，由同步产出）
scripts/
  sync-upstream.mjs  从上游同步 vendor/（含闭包计算、改写、自检）
  trim-editor-css.mjs 从上游整份样式里裁出编辑器需要的部分
```

**六种格式六条路**（`docs/TECH.md` §15.7–15.12）：

| 格式 | 做法 | 保存 | 为什么 |
|---|---|---|---|
| docx | vendored 引擎 + 编辑器，**可编辑** | 补丁式 | 编辑要求文件能读写回来 |
| xlsx | 自写网格解析与补丁写回（约 550 行） | 补丁式 | 「把表画出来、改几个格子」用不到上游的 Rust 侧车 + Univer |
| pptx | vendored **解析 / 布局 / 编辑映射**，自写 SVG 适配器与保存原语 | 补丁式 | 四级继承 + 文字度量 + 160 种预设几何，自己写会错得看不出 |
| html | vendored **编辑器本体**（CodeMirror + 点选映射，12 个文件），界面用自己的外壳 | 整体重写（保留 BOM/换行） | 上游那个 app 25924 行，其中 2.6K 与编辑 HTML 有关，其余是办公壳 |
| markdown | **就是笔记编辑器**（上传 `.md` 即导入为笔记） | 写回正文列 | 正文格式是 mimir 的产品决定 |
| pdf | pdf.js 渲染 + pdf-lib 页面级操作 | 整体重写 | PDF 是一叠页面指令而非结构化文档；改文字要 PDFium 的 7MB WASM |

### pptx 保存：`src/pptx-save.ts` 为什么是照搬

`buildZip` / `patchSlideXml` / `patchedElementXml` / `patchAnchorXml` /
`slideIsDirty` / `modelStrokeToPatch` 六个函数在上游 `index.ts` 里，而那个
文件**不能 vendored**（import `zip.ts` 的 `node:crypto` 与 `media-insert.ts`
的 `node:zlib`）。但那段保存逻辑本身是纯的——只用已 vendored 的
`generate.ts`（全部 patch 原语）与 `identity.ts`。

所以 `src/pptx-save.ts` 逐条照搬了它们。**上游改这几个函数时要跟着改**
（`UPSTREAM.json` 记了 commit）。改动只有两处：不用 `createHash`，
以及 `buildPptxBytes` 直接产出字节（浏览器里没有「写到文件」这一步）。

**两条不能违反的性质**（有测试守着，红了不要放宽断言）：

1. **没动过的条目逐字节相同** —— 整个前提是未改动的元素用
   `anchor.originalXml` 原样回填
2. **改一段文字只动那一张 slideN.xml** —— 主题/版式/母版/媒体都不该动

还有一条隐含契约：**`save()` 成功后必须 `commit()`**。不 commit 的话
第二次编辑会拿旧锚点拼字节、把上一次的改动静默回滚（两次保存都「成功」）。

---

## 三条不能违反的规矩

### 1. `vendor/` 里的文件一律不改

需要改行为就在 `src/` 做。手改 vendor 的代价不是「下次同步冲突一下」——
是**每次同步都要重新解决同一处冲突**，而且上游一动那个文件你就得重看一遍。

上游依赖的两个东西（i18n、样式）已经用**机械改写**处理掉了，见
`sync-upstream.mjs` 的 `REWRITES`：改写是可重复的，所以每次同步都自动应用，
不算「手工修改」。要加新的改写，在那里加一条并写明理由。

### 2. 不要用 mimir 的严格度去检查 vendor

上游没开 `noUncheckedIndexedAccess`，mimir 开了。所以 vendored 文件顶部由
同步脚本机械加 `@ts-nocheck` + `eslint-disable` 横幅，`vendor/tsconfig.json`
是单独一份宽松配置。

**收紧类型检查的边界是 `src/`。** 那里是 mimir 自己的代码，按 mimir 的
规矩来。

### 3. 界面与逻辑同包，但**壳与内容分家**

界面在这个包里（D-054），因为四种格式的外壳必须长得一样——而「一样」只能
由同一份实现保证。边界是：

| 归包 | 归宿主（`apps/web`） |
|---|---|
| 壳（工具条 / 状态行 / 布局 / 保存状态） | 方言（markdown 的 Tiptap 扩展集合） |
| 编辑器组件 | 正文排版类（与只读视图共用同一个） |
| 解析与保存 | 取字节与写回（`EditorIo`） |
| 主题变量**消费**（`--me-*`） | 主题变量**提供**（`editor-theme-bridge.ts`） |

**包不依赖 antd**，所以它能独立测试与预览。代价是那道变量桥——不要为了
「方便」把 antd 引进来，那会让这个包不能再脱开宿主跑。

两条这一层特有的规矩：

- **不要手改 `src/generated/editor.css`**：它是 `trim-editor-css.mjs` 的产物，
  同步会覆盖
- **`vitest` 的默认环境是 node，不是 happy-dom**。happy-dom 会替换全局
  `URL`，于是 `readFileSync(new URL(..., import.meta.url))` 抛
  `The URL must be of scheme file`——解析类测试整片挂掉（实测踩过 48 个）。
  要 DOM 的测试在自己的文件顶部写 `@vitest-environment happy-dom`

### 4. 保存必须走补丁路径

`saveDocx` 有两种模式：逐块补丁（未改动的块原样复制 zip 条目）和整体重建。
**产品里只允许前者**——整体重建会丢掉我们没建模的东西（域代码、修订标记、
OLE 对象、自定义样式）。

`src/docx.test.ts` 有一条断言在守它：改一段后**只允许 `word/document.xml`
变化**。这条红了不要放宽断言，先查是不是保存路径退化了。

---

## 同步上游

```bash
git clone --depth 1 https://github.com/genspark-ai/genoffice /tmp/genoffice
node packages/office/scripts/sync-upstream.mjs --from /tmp/genoffice          # 同步
node packages/office/scripts/sync-upstream.mjs --from /tmp/genoffice --check  # 只报告差异
```

`--check` 用于定期看上游是否动了我们 vendored 的文件（输出非零退出码表示有差异）。

同步脚本会：重新计算闭包 → 应用改写与横幅 → 写入 vendor/ → **按闭包清理
多余文件** → 裁剪样式 → 更新 `UPSTREAM.json`。**它是幂等的**：连续跑两次，
第二次「内容有差异 0 个文件」。

**跑完同步要跟着跑 `pnpm format`。** 改写会把 `@genoffice/x` 换成长相对
路径，而 oxfmt 会把超过行宽的那种 import 折成多行——所以「刚同步完」会看到
十几个文件有差异，格式化之后归零。顺序反了（先 format 后 sync）就会漏掉。

### 一条 pptx 专用的改写（裸包名类型导入）

`@genoffice/pptx-engine` 的**裸包名**导入会被改写到
`src/shims/pptx-engine-types.ts`，**必须在 `byPkg` 那条规则之前**。

理由：渲染层对引擎的裸包名导入全是 `import type`（运行时不需要任何代码），
但闭包计算**不区分类型导入**——它会顺着包名走到引擎的 `index.ts`，把整条
**写路径**（insert / generate / media-insert / slide-transfer / sections，
约 10K 行，带 `node:zlib` 与 `Buffer`）拉进浏览器闭包。实测：不加这条规则，
闭包从 135 涨到 146 个文件。

子路径导入（`./table-grid`、`./identity`、`./background-promote`）是**真代码**，
照常走 `byPkg` 改成相对路径。

### 闭包自检拦的是哪三类错

解析不完整时脚本会**静默跳过**文件，所以产物不对而脚本不报错。三次教训：

| 症状 | 原因 |
|---|---|
| docx-engine 的 35 个文件全丢（93 → 56） | `.js` 后缀没映射回 `.ts`（改写产出 NodeNext 写法） |
| 9 个文件漏掉（watermark / protection / blank…） | 抓 import 的正则不允许跨行，而上游大量用多行 `export { … } from` |
| vendor 里多了 26 个 UI kit 文件、应用起不来 | 改写规则把 `@genoffice/ui` 变成了相对路径，**绕过了 skipPackages** |

现在两种断链都会报错退出：相对导入落在闭包外、以及**未被改写**的
`@genoffice/*` 导入（后者正是「依赖了被跳过的包」的判据）。

顺带一条：抓 import 的正则**不能跨越语句边界**（见 `computeClosure` 的注释）
——否则注释里提到 `@genoffice/ui` 也会被当成真导入。

### 闭包是算出来的，不是列出来的

`UPSTREAM.json` 的 `entries` 是人工选的入口（编辑器、排版度量、文档状态），
`files` 由脚本从入口出发沿 import 图算出。所以**上游新增的依赖会自动进来**，
但**新功能不会**（那要改 `entries`）。

闭包算完后脚本会**自检**：每个被抽出的文件，它的每个相对导入都要能在闭包内
解析到；不满足就报错退出。这条自检是有代价换来的——解析不完整时是**静默**
跳过文件的，实测踩过两次：

| 症状 | 原因 |
|---|---|
| docx-engine 的 35 个文件全丢，闭包 93 → 56 | `.js` 后缀没映射回 `.ts`（改写产出 NodeNext 写法） |
| 9 个文件漏掉（watermark / protection / blank…） | 抓 import 的正则不允许跨行，而上游大量用多行 `export { … } from` |

两次都是「脚本成功退出、文件少了一批」。有自检之后同类失误会直接报错。

---

## 已知边界（POC 与产品的距离）

| 缺什么 | 说明 |
|---|---|
| ~~分页视图~~ | **已实现**：`src/pagination.ts` 把连续流切成纸张，含块内断行、拆表+重复表头、页眉脚、脚注 |
| **工具栏** | 上游的 ribbon 没 vendored（那是它自己的办公壳）。要哪些能力是 mimir 的界面决策 |
| **大文档解析** | `parseDocx` 是同步重活，上游为它做了 worker（`parse-off-thread.ts`）。现在直接 await，大文档会卡主线程 |
| **保存冲突** | `PUT /api/documents/:id/file` 不校验 `If-Match`。单客户端可接受，多客户端会互相覆盖 |
| **xlsx** | **网格 + 改单元格已做**（`src/xlsx.ts` 读 + `src/xlsx-edit.ts` 写，零新增依赖）。与 docx/pptx 是**两条技术路线**：上游走 13.7K 行 Rust 侧车 + Univer，而「把表画出来、改几个格子」用不到那一层——所以这里没 vendored 任何东西。见 TECH §15.7 |
| **xlsx 行/列增删与公式重算** | 这一版只改**现有格的内容**（不改行列结构、不重算公式）。改了被别的公式引用的格子，那边的显示值要等 Excel 打开才更新 |
| **pptx 编辑** | **改文字已做**（`src/pptx-save.ts`，补丁式保存）。**run 级格式**（加粗/字号/颜色）与元素位置未做——上游那条路走 `pptx-ops` 的 ops 层 + `setElementFont`，依赖 `index.ts` 的整条写路径。见 TECH §15.9 |
| **pptx 字体度量** | 用启发式（按字符类别估宽度）——**换行位置**可能与原件略有差别。要精确得接 opentype.js + vendored 字体（docx 那边有） |
| **pdf 的文字编辑** | 只做页面级（旋转/删除/调序）。改文字要拆内容流 —— 上游那 7062 行在 Electron 主进程里、依赖 `node:fs`/`node:path`，还要 PDFium 的 7MB WASM（TECH §15.12） |
| **html 的增量预览** | 每敲一个字预览整页重载（滚动位置回顶）。上游也这样，但要做好的话得把改动 patch 进 frame 的 DOM |
| **html 的点选改样式** | 点选能定位到源码，但**不能改样式**（上游 StylePanel 调 `ops.ts` 的 514 行操作编译器，未接） |
| **页内分栏** | 多栏文档按单栏排（上游有 `columns` 支持，未接） |
| **工具栏面窄** | 现有 6 项（加粗/斜体/下划线/删除线/两种列表）。对齐、字号、颜色、表格操作为空 |
| **列表编号分配** | 新列表沿用文档里已有的 `numId`；新建编号定义要写 `numbering.xml`（上游的 `allocateListNumId` 在 host 侧，未 vendored） |

### 分页的四个静默坑（都在 `src/pagination.ts` 的注释里）

排查分页问题时先看 `window.__mimirPagination`（中间量）与
`window.__mimirPagError`——分页失败的**三种原因现象相同**（都是「没有页」），
不记下来只能靠猜。

| 症状 | 原因 |
|---|---|
| 页数对但没有页间隙 | `origin` 用了滚动容器的位置（容器一滚动就偏移一个 scrollTop） |
| 51 个块被量成 1 个 | 传了容器 ref 而不是 `.ProseMirror` 本身 |
| 分页永久不触发且不报错 | 用 `requestAnimationFrame`——**后台标签页不派发帧** |
| 分页正常但灰带透明 | `--canvas` / `--docs-paper` 由上游 App 壳运行时注入，未 vendored |

样式裁剪（`trim-editor-css.mjs`）只保留 `.doc-*` / `.ProseMirror` / `.page-*` /
`.hf-*` 前缀的规则。**加新的编辑器 UI 时如果样式不生效，先看它是不是被裁掉了**——
那种失效是静默的（元素渲染出来但没样式）。

### pptx 预览的五个静默坑（都在 `src/pptx-svg.ts` / `src/pptx-archive.ts` 的注释里）

| 症状 | 原因 |
|---|---|
| 文字间距诡异（「2026」渲染成「2 026」） | 误以为「一个 `GlyphRun` 一个字」，把 run 的 x 拼成 SVG 的**逐字坐标列表**。实际一个 run 是**一个词**，多余的坐标被浏览器当逐字定位（**实测踩过**） |
| 整页空白 | SVG 是 XML——一处没转义的 `<` 或 `&` 让整份文档解析失败。`pptx-svg.ts` 有转义测试与「能被 XML 解析」的测试 |
| 形状旋转后位置偏 | OOXML 的 rot 绕**框中心**；翻转后坐标系回到左上角，旋转中心要相应还原 |
| 合并相邻 run 后间距不对 | 同格式的两个 run 位置接不上（中间有空档）时**不能合**——合了就被浏览器按自然排版重排 |
| 幻灯片空白（背景也没了） | 占位符的位置可能在**母版**（幻灯片与版式里都是空 `<p:spPr/>`）。两级上溯链断在任何一级都会让内容叠在 (0,0)。`src/pptx.test.ts` 有一条测试专门断言这个 |
