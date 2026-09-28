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
  shell/           **界面外壳**：六种编辑器共用的框架与控件（D-054）
    EditorShell.tsx   五个槽位：toolbar / subbar / children / footer / status
                      加一组工具条原语：ToolbarButton（含 disabledReason）、
                      ToolbarGroup / Divider / Spacer / Label / Note / Notice / Tabs、
                      ToolbarTextButton（状态行里**有动作的一句话**：重试 / 关掉
                      这条提示。是 antd `Button variant="link"`，被 `.me-text-btn`
                      压成下划线文字——状态行里放 24px 的方框会看成第二条工具条）、
                      ToolbarSelect、ToolbarNumberField、ToolbarTextField、
                      ToolbarTextArea（多行输入，pptx 的段落编辑框；单行框不能
                      代替它——`\n` 会被值消毒静默删掉）、
                      ToolbarToggleGroup、ToolbarMenu（含 ToolbarMenuItemRow /
                      ToolbarMenuSeparator：菜单项要和别的控件混在同一个面板里
                      时用它们，别照着 markup 手抄）、ToolbarColorPicker
                      （`inline` = 只出那排色块，给「面板里的一小节」用）、
                      ToolbarGridPicker、ToolbarFileButton、FindReplaceBar、
                      useToolbarState。
                      **外面包一层只传 componentSize="small" 的 ConfigProvider**
                      （D-064：控件是 antd 的，布局与弹层仍是自己的 CSS）
                      面板里的方向键**按事件来源让位**：来自 input / combobox
                      那类表单控件的按键归控件自己——别在调用点挂
                      `stopPropagation` 绕过（那样漏一处就是一次静默失效）
                      **正文画布是可点而不经原语的两处例外**（pptx 的 SVG 画布、
                      xlsx 的 `<td>` 网格）：被点的是画布里注入的节点、动作随点
                      在哪而变，换成 `ToolbarButton` 没有意义。它们是**显式白
                      名单**，新增第三处要先想清键盘路径（`PptxEditor.tsx` 里
                      画布那段注释是存档）
    shell.css         外壳样式：布局、弹层、非 antd 的元素（主题值走 --me-*）
    icons.tsx         工具条图标（自绘 SVG，不依赖图标库）
    editor-commands.ts 方言能力检测与调用
    antd-test-dom.ts  驱动 antd 下拉的测试辅助（`@mimir/office/test-dom` 导出）
  editors/         **六种编辑器**（docx / xlsx / pptx / html / markdown / pdf）
    DocxEditor.tsx / XlsxEditor.tsx / PptxEditor.tsx
    PptxEditor.test.tsx pptx 工具条的按钮 → 命令（挂真组件、读保存出的 XML）
    HtmlEditor.tsx     源码 + 预览双栏（借 vendored 的 CodeMirror 与点选映射）
    PdfEditor.tsx      页面级操作（pdf-lib）+ 逐页渲染（pdf.js）+ 查找文字。
                       四样东西决定一页：来源（原件/空白/导入）、旋转、裁剪、
                       纸型——模型与保存都在 pdf-pages.ts
    MarkdownEditor.tsx 笔记：30+ 个工具条控件（D-061）
    markdown-format.ts markdown 方言的判据与操作（整张列表的范围、段落样式的
                       当前值、列对齐、工具条状态串）。**导出**给宿主测——
                       方言在宿主那边（`apps/web/src/editor/extensions.ts`），
                       只有真方言能验证这些行为
    MarkdownEditor.test.tsx（在宿主）按钮 → 命令：挂真工具条 + 真编辑器实例
    markdown-controls.test.ts  控件契约的**静态**一半（读源码：没有手写原生
                       控件、不直接 import antd、不把 .me-btn 挂到控件上）。
                       **渲染**的那一半在宿主（`markdown-controls.test.tsx`）
                       ——尺寸档与弹层要真方言才挂得起来
    InlineToolbar.tsx / use-source.ts  取字节 → 解析 → 写回
    pdf-render.ts      pdf.js → canvas（**代次防并发**）+ 按字节的文档缓存
                       （画布与文字层共用；导出 loadPdfDocument 给查找复用）
    pdf-pages.ts       PDF 的页面模型与保存（**没有 JSX，所以测得动**）：读
                       每页的 CropBox/旋转、按目标结构重建字节（copyPages，
                       导入的页按来源分组）、裁剪、纸型（scaleContent 与
                       setSize 配对，补一次绕可视区左下角的 translate）
    pdf-text.ts        文字层与查找：getTextContent → 页面比例矩形（含中文、
                       含旋转）。与画布共用 viewport，所以高亮必然对齐
    pdf-pages.test.ts / pdf-text.test.ts  用 **pdf-lib 与 pdf.js 独立读回**产出物
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
| pptx | vendored **解析 / 布局 / 编辑映射**，自写 SVG 适配器与保存原语；工具条改文字 + 整段字形（D-060） | 补丁式 | 四级继承 + 文字度量 + 160 种预设几何，自己写会错得看不出 |
| html | vendored **编辑器本体**（CodeMirror + 点选映射，12 个文件），界面用自己的外壳 | 整体重写（保留 BOM/换行） | 上游那个 app 25924 行，其中 2.6K 与编辑 HTML 有关，其余是办公壳 |
| markdown | **就是笔记编辑器**（上传 `.md` 即导入为笔记） | 写回正文列 | 正文格式是 mimir 的产品决定 |
| pdf | pdf.js 读（渲染 + 文字层）、pdf-lib 写（页面结构） | 整体重写 | PDF 是一叠页面指令而非结构化文档；页面级操作（旋转/删除/调序/倒序/插页/导入/裁剪/纸型）是纯结构改动，pdf-lib 做得对。**改文字**要 PDFium 的 7MB WASM（§15.12），**查找**是自己取文字层做的（没有替换） |

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

界面在这个包里（D-054），因为六种格式的外壳必须长得一样——而「一样」只能
由同一份实现保证。边界是：

| 归包 | 归宿主（`apps/web`） |
|---|---|
| 壳（工具条 / 状态行 / 布局 / 保存状态） | 方言（markdown 的 Tiptap 扩展集合） |
| 编辑器组件 | 正文排版类（与只读视图共用同一个） |
| 解析与保存 | 取字节与写回（`EditorIo`） |
| 主题变量**消费**（`--me-*`） | 主题变量**提供**（`editor-theme-bridge.ts`）与 antd 实例 |

**包依赖 antd（D-064 起）**。原先刻意不依赖，是为了「能独立测试、独立预览」
——那个收益是真的，但它换来的是壳里一整套手写控件追不上 antd 已有的东西，
而缺口是实测的：`ToolbarSelect` / `ToolbarToggleGroup` / `ToolbarColorPicker` /
`ToolbarMenu` 都没有 `disabled`（加载期 19 个控件可点，点「段落底纹」把文档
标脏而保存字节与原件相同），`ToolbarNumberField` 没有 `step`（原生 spinner
每档 ±1，调用方按 10 的倍数吸附，点一下看着没反应）。判断见 D-064。

**哪一层管什么**（改工具条样式前先读这一张）：

| 归 antd（`--ant-*`） | 归 `shell.css`（`--me-*`） |
|---|---|
| 控件的高度、内边距、圆角、边框、hover、焦点环、禁用态、控件字号 | 外壳布局（`.mimir-editor` 的四条约束、`flex-wrap`、状态行、工具条 gap） |
| 按钮的实心 / 文本两档、下拉弹层、分段控件选中外观、水波纹 | 弹层（`.me-menu*` / `.me-color*`，就地 `fixed`，**不 portal**）与色块、页签、状态块这类非 antd 元素 |
| 数字框的上下抓手（我们 `controls={false}` 关掉了） | 按钮的**按下态**（`.me-tb[aria-pressed='true']`）与两个未迁移触发器的 `.me-btn` |

四条随之而来的规矩：

- **包不新建主题。** antd 实例与主题由宿主的 `MimirProvider` 提供；包只允许
  一层**只传 `componentSize="small"`、不传 `theme`** 的 `ConfigProvider`
  （`EditorShell` 内部，包住 `.mimir-editor`）。传 `theme` 会重算 cssVar 的
  key（`--ant-*` 变量名跟着变，引用处静默失效）
- **`antd` 的版本与宿主同一份**（进 `pnpm-workspace.yaml` 的 `catalog`；
  包把它声明成 `peerDependencies` + `devDependencies`，**不进 `dependencies`**
  ——两份拷贝的症状是「某些控件不吃 componentSize」，不报错）
- **`--me-*` 变量桥不退役**：颜色、间距、正文字号仍由它提供；
  退役的只是「控件本身也得手写」
- **`.me-btn` 不许挂到 antd 的按钮上。** 它现在只服务两个未迁移的弹层触发器
  （`ToolbarMenu` / `ToolbarColorPicker` 的裸 `<button>`）。它的 `height` 与
  antd 的 `:where(...).ant-btn-sm` **特异性相同**（都是 (0,1,0)）而这份样式在
  head 里更靠后，挂上之后 small 档按钮会被拉成 24px 之外的值；它的
  `background: transparent` 还会压过实心 `type="primary"`（症状：透明的「保存」）。
  antd 按钮要按下态就挂 `.me-tb`

两条这一层特有的规矩：

- **不要手改 `src/generated/editor.css`**：它是 `trim-editor-css.mjs` 的产物，
  同步会覆盖
- **`vitest` 的默认环境是 node，不是 happy-dom**。happy-dom 会替换全局
  `URL`，于是 `readFileSync(new URL(..., import.meta.url))` 抛
  `The URL must be of scheme file`——解析类测试整片挂掉（实测踩过 48 个）。
  要 DOM 的测试在自己的文件顶部写 `@vitest-environment happy-dom`。
  **挂 antd 组件的测试要自己包一层 `ConfigProvider`**（产品里那层是宿主的
  `MimirProvider`）——不包的话量到的不是 small 档，尺寸对不上；而 happy-dom
  下 `Input` / `Select` / `InputNumber` / `Segmented` 的计算高度取不到
  （返回空串），「一行所有控件同高」只能进浏览器验收

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
| ~~工具栏~~ | **docx 已补齐**（`src/editors/DocxEditor.tsx` 的 `DocxToolbar`，八组 40+ 控件，清单与四项如实不做见 TECH §15.4.3）。上游的 ribbon 没 vendored（那是它自己的办公壳），所以每一项都是 mimir 自己的界面决策 |
| **大文档解析** | `parseDocx` 是同步重活，上游为它做了 worker（`parse-off-thread.ts`）。现在直接 await，大文档会卡主线程 |
| **保存冲突** | `PUT /api/documents/:id/file` 不校验 `If-Match`。单客户端可接受，多客户端会互相覆盖 |
| **xlsx** | **网格 + 改单元格已做**（`src/xlsx.ts` 读 + `src/xlsx-edit.ts` 写，零新增依赖）。与 docx/pptx 是**两条技术路线**：上游走 13.7K 行 Rust 侧车 + Univer，而「把表画出来、改几个格子」用不到那一层——所以这里没 vendored 任何东西。见 TECH §15.7 |
| **xlsx 行/列增删与公式重算** | 这一版只改**现有格的内容**（不改行列结构、不重算公式）。改了被别的公式引用的格子，那边的显示值要等 Excel 打开才更新 |
| **xlsx 改样式** | 新写的是不带 `s` 的内联字符串格，所以**覆盖（含清空）会丢掉该格原有的颜色/边框/数字格式**。实测：清空 `A2`（原 `s="7"`）写出 `<c r="A2" t="inlineStr"><is><t></t></is></c>`，同行别的格 `s="9"` 原样还在。这是能力边界，所以状态行与「清空」的 tooltip 都如实写着（TECH §15.7） |
| **pptx 编辑** | **改文字与整段字形已做**（`src/pptx-save.ts` 补丁式保存 + `src/editors/PptxEditor.tsx` 的工具条，D-060）。**元素位置**（改框）与段落格式（项目符号/行距/对齐）未做——上游那条路走 `pptx-ops` 的 ops 层 + `setElementTransform`，依赖 `index.ts` 的整条写路径。见 TECH §15.9 |
| **pptx 格式的粒度是整段** | 界面里没有 run 级选区（能选的是元素与段落输入框），所以加粗/字号/颜色只能表达「这一整段」。标签里都写着「（整段）」 |
| **pptx 回传格式必须逐 run** | 把一段压成「一条 run、文本是整段」会让同段其它 run 的字号/颜色被 `dominantRun` 静默顶掉（实测：`b="1" sz="3600"` 的标签变成 `sz="2400"`）。`PptxEditor.tsx` 的 `applyFormat` 逐 run 带 `srcRun`，`src/editors/PptxEditor.test.tsx` 有断言守着 |
| **pptx 字体度量** | 用启发式（按字符类别估宽度）——**换行位置**可能与原件略有差别。要精确得接 opentype.js + vendored 字体（docx 那边有） |
| **pdf 的文字编辑** | **查找做了**（`pdf-text.ts`：取文字层、整份文档里搜、高亮到字上，含中文），但**不能改**——`FindAdapter` 只给查找，不给 `replaceOne`/`replaceAll`（空实现点了没反应，正是这个仓库最讨厌的按钮）。改文字要拆内容流：上游那 7062 行在 Electron 主进程里、依赖 `node:fs`/`node:path`，还要 PDFium 的 7MB WASM（TECH §15.12） |
| **pdf 的单边裁剪** | 页面模型（`PdfCropInsets`）四边各自算，**界面上只能四边等量**（去掉扫描件黑边的常见用途；单边裁剪在旋转之后就分不清「左右」了）。要单边就补界面，模型不用改 |
| **pdf 的选中文字** | 页面上的文字画进 canvas，选不中、复制不了。文字层只用来定位查找的高亮（那与 pdf.js 自带 textLayer 叠 DOM 是两种做法——它要和画布像素级对齐，多一层缩放维度） |
| **html 的增量预览** | 每敲一个字预览整页重载（滚动位置回顶）。上游也这样，但要做好的话得把改动 patch 进 frame 的 DOM |
| **html 的点选改样式** | 点选能定位到源码、能顺元素路径上下走，但**不能改样式**（上游 StylePanel 调 `ops.ts` 的 514 行操作编译器，未接） |
| **页内分栏** | 多栏文档按单栏排（上游有 `columns` 支持，未接） |
| **docx 里写不进去的几类格式** | `rawRPr` 透传那批（字符间距、大小写、字符边框、文本效果、发光、带圈）与复杂文种字体（`csFont`）：前者模板里改了保存时会被原字节覆盖，后者要按 `w:rtl` 判断、中文库里命中率极低。表格边框只给了三个预设。见 TECH §15.4.3 |
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

### html 编辑器的三个静默坑（都在 `src/editors/HtmlEditor.tsx` / `editors.css` 的注释里，完整版见 TECH §15.11.1）

| 症状 | 原因 |
|---|---|
| 切到预览再切回来，中间改的东西没了（接着敲键就把它覆盖） | 视图切换写成了**条件渲染**。源码编辑器一卸载，CodeMirror 的实例与编辑历史一起消失，而重新挂载时只吃 `initialText`——那是刚打开文件时的文本。两个栏位必须**始终挂着**，只用 `hidden` |
| `hidden` 属性看起来完全没生效 | `[hidden] { display: none }` 在**浏览器默认样式表**里，而 `.mimir-html-preview-pane` 自己写了 `display: flex`——作者样式一律胜过默认样式（与特异性无关）。要有 `.mimir-html-split > [hidden] { display: none }` 压回去 |
| 「放大到 200%」得到的是手机版布局 | `zoom` 同时**缩掉布局尺寸**：`zoom: 2` 下 `width: 100%` 是容器的一半，于是 frame 的视口被压到 360px、内容重排。要 `width: calc(100% * var(--html-preview-zoom))` 乘回来，**并且 `flex: none`**（否则 flex 又把它收回去）。实测：1438 视口下 host 的 `offsetWidth` 359 对 `rect` 719 |
