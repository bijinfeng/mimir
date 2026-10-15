# 会静默出错的地方

：保存与编辑

这几类问题**不报错**，只在你以为没问题的时候悄悄地错。改编辑器前先扫一遍。


| 症状 | 原因 |
|---|---|
| 改了字但格式没了（或文件里别的东西被重排） | 补丁式保存退化成整体重建。pptx 靠**元素锚点**（未改动的元素用 `anchor.originalXml` 原样回填，见 `packages/office/src/pptx-save.ts`），docx 靠**块比对**。`pptx-save.test.ts` / `docx.test.ts` 各有断言守着「只有该变的条目变」 |
| 第二次保存把第一次的改动回滚 | pptx 的 `save()` 成功后必须 `commit()`——否则下次拼字节时干净元素回填的是**旧**字节，而两次保存都报成功 |
| pptx 编辑后画布不更新 | 编辑是就地改模型的，`slides()` 返回同一个数组，React 的 `useMemo` 依赖它不会重算。要用 `view()` 的**不可变快照**当依赖 |
| pptx 点画布没反应 | 渲染的 SVG 少了 `data-element-id`（事件代理靠它把点击映射回模型元素）。漏掉是静默的——看着像「这个元素不能编辑」 |
| 部分 pptx 的字逐字竖排并挤到画布外 | 原件里的文本框缺几何信息，不能把零宽框交给文字布局；在渲染层按画布尺寸补默认框并说明原因，不回写原件（补丁式保存要求打开文件不改变 OOXML） |
| **pptx 段尾打字（或段首 / run 边界插字），同段其余 run 的格式没了** | 纯插入的改动区间是**零宽**的，与 0 条 run「相交」——按「区间与几条 run 相交」判断会误判成整段重写、把整段压成一条 run（实测两条 run 的段落段尾加一个字符，`<a:r>` 由 2 变 1）。落点要单独算：插入点**前一个字符所在的 run**（`PptxEditor.tsx` 的 `editParagraphRuns` / `insertIntoRuns`），软换行哨兵不当落点；跨了多条 run 的才是整段重写（不带 `srcRun`，让 `dominantRun` 跟正文走）。`PptxEditor.test.tsx` 的段尾 / 段首 / run 边界 / 软换行四条用例守着 |
| 改了 A1，D7 也跟着变 | xlsx 的**共享字符串**被就地改写了（`<c t="s"><v>17</v></c>` 里的 17 被多个格子共用）。新文本必须写成内联字符串（`packages/office/src/xlsx-edit.ts`） |
| 改完格子又变回旧值 | xlsx 的公式格：只换了 `<v>` 而留着 `<f>`，Excel 打开时按公式重算。覆盖时必须连 `<f>` 一起清 |
| xlsx 新写的格跑到行首 | 插入位置要按**列号**比，而列号要从 `r="A5"` 里只取列字母。我们的预览按 `r` 定位所以照常显示，而 Excel 要求 `<c>` 按列升序 |
| 表格里改列宽，越改越离谱 | 单元格的 `colwidth` 属性存的是 **px**（解析 `convert.ts:930` 写入、保存 `:1236` 自己 ×15 换回 twips），而输入框说的是 twips——读要过 `pxToTwips`、写要过 `twipsToPx`（`DocxEditor.tsx`），漏掉任何一次就是「每次编辑把列宽放大 15 倍，重开显示又缩小 15 倍」 |
| 段落样式换了级别，重开又变回去 | Tiptap 的 `setNode` 会把没点名的属性原样带过去（`attributesToCopy`）——换样式必须显式 `styleId: null`，否则文件里的 `w:pStyle` 还是旧样式（`generate.ts:1742` 优先写它） |
| 格式刷点上去反而把格式抹掉 | 源选区起点正好压在格式区间起点上时，`$from.marks()` 返回**前一个节点**的 marks（实测为空）——要取**选区区间里第一个文本节点**的 marks |
| docx 点字号增减后文件里出现 `w:sz w:val="NaN"` | 文字没有直接字号时 `sizeHalfPoints` 是 `undefined`（继承段落样式）；增减按钮须禁用并说明原因，不能对它做算术，也不能用“点了不动”兜底 |
| 选了「1.5 倍行距」但画布和文件都没变 | `lineRule='exact'` 优先于倍数；改倍数时同时清掉 `lineRule` 和 `lineRawTwips` |
| 清除格式后标题的对齐仍在，或分页符消失 | 段落格式须分别更新 `docParagraph` / `docHeading` / `docListItem`；但 `pageBreakBefore` 是分页符本身，绝不能清掉 |
| 格式刷把链接、批注或修订也刷掉 | `tr.removeMark(from, to)` 不给 markType 会清除区间所有标记；只逐类搬运允许的字符格式 |
| 改了单元格、保存也成功，界面上还是旧值 | `setCell` 只改了 XML 没改内存模型，而界面读模型（`view()`）。文件是对的，所以只有对着界面看才发现（TECH §15.7） |
| **深色下 docx 里作者写的文字颜色不可见（黑压黑）** | 上游的「深色纸张」机制是「编辑器发 `--dk-*` 孪生值 + CSS 在 `.page-dark` 子树里切过去」，而**两组规则都被裁剪脚本静默丢掉**：① 消费规则包在 `@media screen {}` 里，判据看选择器文本、`@media` 不匹配任何保留前缀 → 整块扔；② `--docs-paper-*` 变量块的选择器就叫 `:root`，判据却在**选择器**上找 `--docs-`（那些名字在**声明体**里）→ 变量定义也全扔。修法是判据读声明体 + 对 `@media` 递归过滤内部规则 + `.page-dark` 整组保留，**并在生成脚本里加自检**（`.page-dark` / `--docs-paper-ink` / `--canvas` 缺一即抛错，并写明症状）。宿主侧还要按外观挂类（`EditorProps.appearance` → docx 在深色时给滚动容器加 `page-dark`，D-096） |
| 中文 PDF 整段文字空白（不是乱码） | pdf.js 的 cmaps 没加载到。它按**原始文件名**取（`cmaps/Adobe-GB1-0.bcmap`），所以两端构建都须把资产原样复制到各自的 `public/pdfjs/`；带哈希的产物目录里没有这些名字，404 后内容就是空白（TECH §15.12） |
| PDF 界面全白且无报错 | 并发渲染。第一版用「取消上一次」防并发，而 StrictMode 挂载两次会让两次都没画。要用**代次**（`src/editors/pdf-render.ts`） |
| 预览过一次之后保存的 PDF 是 0 字节 | `getDocument` 把字节 transfer 给 worker 了。要传 `bytes.slice()` |
| PDF 页面改动后表单、书签或标题丢失 | `copyPages` 只搬页对象，不搬文档级 Catalog/Info。标准 Info 字段要显式复制；Catalog 有额外结构或 Info 有自定义字段时先拒绝写回，并让界面解释原因（TECH §15.12） |
| PDF 高亮纵向压扁，或缩放后画面变形 | 高亮纸层与 canvas 的 CSS 盒必须同尺寸：纸层不要被 flex stretch；页面不要用 `max-width: 100%` 单独夹宽度，放大时让工作台横向滚动 |
| PDF 放大后左侧内容滚不到 | `justify-content: center` 会裁掉溢出方向的起始边；用子项 `margin-inline: auto` 居中 |
| 窄窗口下 PDF 工具条右端消失 | 编辑器是 flex 子项，默认 `min-width: auto` 会被宽画布撑住；外壳要有 `min-width: 0`，`overflow: clip` 不能替代 |
| 窄窗口下 PPTX/PDF 标题或正文被缩略图挡住 | `ThumbnailSidebar` 在容器 ≤650px 时把 164px 侧栏绝对定位到画布上；若初始状态仍是展开，打开文档就会覆盖页面左侧。默认用 `auto`：宽容器显示侧栏，窄容器隐藏并保留展开按钮。显式展开后选页恢复 `auto`，否则遮挡会一直留在画布上。要在约 588px 的真实 Electron 窗口检查两种格式的默认页、展开及选页，不能只看 DOM 里有缩略图。 |
| HTML 切到预览再回来，中间改的内容丢了 | 视图切换不能条件渲染源码编辑器：卸载会丢 CodeMirror 实例与历史，重挂只读打开时的 `initialText`；两个栏位始终挂载，只切 `hidden` |
| HTML 的 `hidden` 属性看似无效 | 作者样式里的 `display: flex` 胜过浏览器默认的 `[hidden]`；用 `.mimir-html-split > [hidden] { display: none }` 明确覆盖 |
| HTML 放大后变成手机布局 | `zoom` 会缩小内部布局尺寸；宿主宽度要用 `calc(100% * var(--html-preview-zoom))` 补偿，并设 `flex: none` |
