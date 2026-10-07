# packages/office/src/editors —— 各格式的编辑器

`DocxEditor` / `XlsxEditor` / `PptxEditor` / `HtmlEditor` / `PdfEditor` /
`MarkdownEditor`（`src/editors/`）。markdown 的宿主方言（Tiptap 扩展配置）
在 `apps/web/src/editor`；外壳在 `../shell`。父层 `packages/office/AGENTS.md`
与根 `AGENTS.md` 仍然适用。

---

## 会静默出错的地方：保存与编辑

这几类问题**不报错**，只在你以为没问题的时候悄悄地错。改编辑器前先扫一遍。
（2026-10 自 `packages/office/AGENTS.md` 末尾按代码归属归位。）

| 症状 | 原因 |
|---|---|
| 改了字但格式没了（或文件里别的东西被重排） | 补丁式保存退化成整体重建。pptx 靠**元素锚点**（未改动的元素用 `anchor.originalXml` 原样回填，见 `packages/office/src/pptx-save.ts`），docx 靠**块比对**。`pptx-save.test.ts` / `docx.test.ts` 各有断言守着「只有该变的条目变」 |
| 第二次保存把第一次的改动回滚 | pptx 的 `save()` 成功后必须 `commit()`——否则下次拼字节时干净元素回填的是**旧**字节，而两次保存都报成功 |
| pptx 编辑后画布不更新 | 编辑是就地改模型的，`slides()` 返回同一个数组，React 的 `useMemo` 依赖它不会重算。要用 `view()` 的**不可变快照**当依赖 |
| pptx 点画布没反应 | 渲染的 SVG 少了 `data-element-id`（事件代理靠它把点击映射回模型元素）。漏掉是静默的——看着像「这个元素不能编辑」 |
| **pptx 段尾打字（或段首 / run 边界插字），同段其余 run 的格式没了** | 纯插入的改动区间是**零宽**的，与 0 条 run「相交」——按「区间与几条 run 相交」判断会误判成整段重写、把整段压成一条 run（实测两条 run 的段落段尾加一个字符，`<a:r>` 由 2 变 1）。落点要单独算：插入点**前一个字符所在的 run**（`PptxEditor.tsx` 的 `editParagraphRuns` / `insertIntoRuns`），软换行哨兵不当落点；跨了多条 run 的才是整段重写（不带 `srcRun`，让 `dominantRun` 跟正文走）。`PptxEditor.test.tsx` 的段尾 / 段首 / run 边界 / 软换行四条用例守着 |
| 改了 A1，D7 也跟着变 | xlsx 的**共享字符串**被就地改写了（`<c t="s"><v>17</v></c>` 里的 17 被多个格子共用）。新文本必须写成内联字符串（`packages/office/src/xlsx-edit.ts`） |
| 改完格子又变回旧值 | xlsx 的公式格：只换了 `<v>` 而留着 `<f>`，Excel 打开时按公式重算。覆盖时必须连 `<f>` 一起清 |
| xlsx 新写的格跑到行首 | 插入位置要按**列号**比，而列号要从 `r="A5"` 里只取列字母。我们的预览按 `r` 定位所以照常显示，而 Excel 要求 `<c>` 按列升序 |
| 表格里改列宽，越改越离谱 | 单元格的 `colwidth` 属性存的是 **px**（解析 `convert.ts:930` 写入、保存 `:1236` 自己 ×15 换回 twips），而输入框说的是 twips——读要过 `pxToTwips`、写要过 `twipsToPx`（`DocxEditor.tsx`），漏掉任何一次就是「每次编辑把列宽放大 15 倍，重开显示又缩小 15 倍」 |
| 段落样式换了级别，重开又变回去 | Tiptap 的 `setNode` 会把没点名的属性原样带过去（`attributesToCopy`）——换样式必须显式 `styleId: null`，否则文件里的 `w:pStyle` 还是旧样式（`generate.ts:1742` 优先写它） |
| 格式刷点上去反而把格式抹掉 | 源选区起点正好压在格式区间起点上时，`$from.marks()` 返回**前一个节点**的 marks（实测为空）——要取**选区区间里第一个文本节点**的 marks |
| 改了单元格、保存也成功，界面上还是旧值 | `setCell` 只改了 XML 没改内存模型，而界面读模型（`view()`）。文件是对的，所以只有对着界面看才发现（TECH §15.7） |
| **深色下 docx 里作者写的文字颜色不可见（黑压黑）** | 上游的「深色纸张」机制是「编辑器发 `--dk-*` 孪生值 + CSS 在 `.page-dark` 子树里切过去」，而**两组规则都被裁剪脚本静默丢掉**：① 消费规则包在 `@media screen {}` 里，判据看选择器文本、`@media` 不匹配任何保留前缀 → 整块扔；② `--docs-paper-*` 变量块的选择器就叫 `:root`，判据却在**选择器**上找 `--docs-`（那些名字在**声明体**里）→ 变量定义也全扔。修法是判据读声明体 + 对 `@media` 递归过滤内部规则 + `.page-dark` 整组保留，**并在生成脚本里加自检**（`.page-dark` / `--docs-paper-ink` / `--canvas` 缺一即抛错，并写明症状）。宿主侧还要按外观挂类（`EditorProps.appearance` → docx 在深色时给滚动容器加 `page-dark`，D-096） |
| 中文 PDF 整段文字空白（不是乱码） | pdf.js 的 cmaps 没加载到。它按**原始文件名**取（`cmaps/Adobe-GB1-0.bcmap`），所以资产必须放 `apps/web/public/pdfjs/`（原样复制、不改名）——带哈希的产物目录里没有那些名字，404 之后内容就是空白（TECH §15.12） |
| PDF 界面全白且无报错 | 并发渲染。第一版用「取消上一次」防并发，而 StrictMode 挂载两次会让两次都没画。要用**代次**（`src/editors/pdf-render.ts`） |
| 预览过一次之后保存的 PDF 是 0 字节 | `getDocument` 把字节 transfer 给 worker 了。要传 `bytes.slice()` |
