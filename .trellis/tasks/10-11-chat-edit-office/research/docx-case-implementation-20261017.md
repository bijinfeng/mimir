# DOCX 大小写实现与代码验收

2026-10-17。生产与测试已冻结，真实浏览器由主会话接续，尚未以本报告宣称浏览器通过。

## 改动

- 新 `packages/office/src/editors/docx-case.ts`：四种纯转换、Shift+F3 lower→upper→title 循环、真实 TextSelection 冻结与整体守卫、跨 run 的 Unicode 映射、一次文字/marks/selection 事务。
- 新 `DocxCaseControls.tsx`：复用 ToolbarMenu/ToolbarMenuItemRow/ToolbarMenuNote，304px 紧凑菜单；四动作可见名称+样例，空选区/受保护/过期原因可见；Escape 与完成操作后沿外壳返回焦点。没有新 Inspector、额外工具栏行或新 CSS。
- `DocxEditor.tsx`：仅引入控件、稳定的 extension 配置和“其他字符格式”接缝；结果与失败复用现有 notice。
- 新 `docx-case.test.ts` / `DocxCaseControls.test.tsx`。

固定来源 GenOffice commit `480548fd55f1be3593ee0d8e316a734751d58309`，具体路径/行号和 WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的相关性核对见 `docx-case-sort-next-20261017.md`。正文排序在固定上游是 disabled 无执行器，本片未实施。

## 选区与安全合同

- 菜单子组件挂载时冻结 Editor 身份、doc 与真实选区；纯选区移动仍操作原范围，任何文档变化整次拒绝。快捷键使用当前画布范围。
- 仅普通段落/标题/列表、普通表格内文字和软换行。CellSelection/NodeSelection/空选区不猜测扩为全文。
- 全目标预检：域（包括 instrField/refField/Zotero）、未知 inline atom/mark、符号/checkbox、已有修订、段落/行/格修订、SDT、隐藏字等整次拒绝；没有部分转换静默跳过。
- 保留全部原 marks 与属性。人工修订开关由原生 recorder 捕获，没有 TRACK_IGNORE；转换后已经成为修订范围，再次转换会按已有修订守卫拒绝。
- lower 先计算完整逻辑文字以保留 Greek final sigma 上下文，再用来源 Unicode scalar 长度回配到每个 run；title/sentence 不在粗体/链接等 run 边界重启。最终输出必须等于完整四模式变换，否则事务前拒绝。
- 非 locale ECMAScript Unicode case，与固定上游一致；title 按空白词首，保留撇号/连字符语义；sentence 额外支持全角 `！`/`？`。段落/软换行作为逻辑分隔，不移动任何节点。
- 正反选方向与 ß→SS、İ→i+组合点后的完整范围保留。截断 surrogate 的选区拒绝。
- no-op 不派事务、不 dirty、不加 undo。一次正式转换仅一个 docChanged 事务，随后一个 metadata-only `closeHistory` 边界隔离紧接着的手动输入；该元事务不改 doc、不加 history。每次重复 Shift+F3 可逐次撤销。
- editor-local keydown Plugin 排除非 Shift+F3、额外修饰键、IME、工具栏或嵌套 input/textarea/select/combobox 与独立 contenteditable。无全局 window handler。

## 保存验证与边界

沿用现有原生 save 链，没有新增 save adapter，也没有改 vendor、docx.ts、列表、server/shared。

实际 DOCX fixture 验证所选列表/普通表格文字保存重开，原 numId/ilvl、raw rPr（含 fitText/lang/color/size）、链接 rId/目标、批注范围/原 comments.xml、非目标段与表格 shd 保留。该 canonical fixture 的初始 save 与 undo 后 save 逐 ZIP entry 等于原件；编辑仅 document.xml 变化，两次 save 相同，保存后 undo/redo 再保存一致。

本片仅宣称已建模属性/rawRPr/关系及上述实际结构保留，**不宣称任意重建文字段的未知 w:p/w:r 开标签属性或所有未知 inline XML 逐字节保留**。一般文字编辑仍遵守当前 native writer 合同。fixture 使用 writer 的 xml:space=preserve 规范形式，避免把原生既有空白属性规范化误记为大小写功能变化。

## 检查

- 大小写专项 28/28（纯/原生25、真实组件3）。
- 8 相关测试文件 134/134：case/Controls、lists/Controls、docx-toolbar、docx-toolbar-render、docx-references、docx-save。独立列表 checker 同期修正了旧 Toolbar Harness 漏装新列表扩展的问题；原 bullet 断言保留。
- Office `tsc --noEmit` 通过。
- 5 个相关文件 oxlint 与 oxfmt 通过。
- `pnpm lint:styles`、目标 `git diff --check` 通过。
- 未重新运行全仓 check；既有全仓 Impeccable bundled lint 问题不在这片解决。

## 浏览器交接

未上传的原件：`/tmp/mimir-docx-case-fixture.docx`。

五段依次为：跨粗体/普通/斜体的 HELLO WORLD. NEXT SENTENCE.；straße/İ/Σ/emoji/组合重音；中文全角句界；包含 DATE 域的 SAFE OCTOBER SAFE；未选末段。建议前3段真实选择验证四模式与 Shift+F3、保存重开、扩长后循环，第四段选到域时菜单明确禁用。宽区和420px检查开始→其他字符格式→大小写的可见入口、四行样例、Escape/焦点、窄栏无越界。

不需要模型配置；Desktop 留给用户自行验收。
