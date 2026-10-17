# 下一 DOCX 小切片：大小写转换；正文排序证据纠正

2026-10-17，只读研究。未修改生产代码、测试、矩阵或 vendor。

## 1. 建议结论

**下一片只补四种大小写与 Shift+F3。正文排序不属于固定 GenOffice 已实现而 Mimir 缺失的工具。** 若以后实施正文排序，应作为额外增强单独确定行为，不在这片增加参数面板或排序执行器。

四种转换可用开始→其他字符格式里的一个具名“大小写”菜单承载；即时操作无需新 Inspector。保持已有紧凑 Ribbon、可见菜单文字、窄屏具名组折叠，显示“请先选择文字”的真实禁用原因。

## 2. 固定来源与准确证据

### GenOffice

本轮 `git -C /tmp/mimir-genoffice-html-git rev-parse HEAD` 再次确认：
`480548fd55f1be3593ee0d8e316a734751d58309`。

| 证据 | 已实现行为 |
| --- | --- |
| `apps/docs/src/renderer/editor/case-transform.ts:4–17` | `CaseMode = upper/lower/title/sentence`。upper/lower 用 JS 非 locale 的 Unicode 大小写；title 先转小写，再对 `(^|\s)(\p{L})` 大写；sentence 先小写，再大写选区开头和 `. ! ? 。` 后的字母。源码集合中 `! ?` 重复，未包含全角 `！ ？`。 |
| 同文件 `24–30` | `nextCaseMode` 从选区文字推导 lower→upper→title 环：全小写下一步 upper；全大写下一步 title；混合大小写下一步 lower。没有持久 cycle 状态。 |
| 同文件 `34–69` | `applyCase` 空选区返回 false；只遍历实际选区内 text 节点，截取部分 run，替换时保留 `node.marks`；映射变化后的 PM 位置；按总长度变化恢复完整选区，覆盖 `ß → SS`。所有变更在一个 chain transaction。 |
| 同文件 `73–76` | `selectionText` 用 `doc.textBetween(from,to,'\n','\n')` 给快捷键取当前选区文字。 |
| `components/Ribbon.tsx:1820–1824` | 可编辑时调用 `applyCase(ed, mode)`，随后关闭 dropdown；`ed` 是当前活跃正文/子编辑器。 |
| `components/Ribbon.tsx:3203–3208` | 四个真实菜单项 sentence/lower/upper/title。 |
| `renderer/App.tsx:4919–4925` | Shift+F3 对 `getActiveSubEditor() ?? editor` 调用 `applyCase(target,nextCaseMode(selectionText(target)))`。 |
| **`components/Ribbon.tsx:3532–3540`** | **排序按钮有无条件 `disabled`，tooltip/aria-label 为 `ribbonNotSupportedSuffix`，仅渲染 `IconSort`，没有 onClick。** |

另检索整个 `apps/docs` 与 `packages/docx-engine` 的 sortParagraph/sortText/sortRows/sortTable/sort_selection/Intl.Collator/localeCompare：没有正文段落/表格排序执行器。出现的排序证据为索引条目（`generate.ts:2291`、`ribbon-references-tab.tsx:475`）、字体或 mark 类型规范化；`ai/field-ops.ts:245` 是 IF 域的文本/数值比较，**不是目录排序或正文排序**。不能借这些位置推断正文排序已实现。

本轮没有运行 GenOffice GUI。`case-transform.ts` 未包含在当前 vendor 闭包中；禁止手改 vendor。需要在 Mimir 私有适配下带固定来源说明实现。

### WeKnora（按 AGENTS 要求核对）

复用本任务已有 HTTP 200 站点产物 `/tmp/mimir-group-flip-weknora-site.html`。公开源码固定 v0.8.3 commit `3e22822c1d2397be730c458c7539d0eb8c113a24`，产物 `/tmp/mimir-group-flip-weknora-definitions.go`；本轮重新读了14–22行知识检索和35–50行 sandbox 文件工具门控。该证据适合知识库/Agent 能力权限，不包含 OOXML 字符格式、大小写选区或 Office 排序语义，**不适合作为此工具主参考**。不重用它的 Markdown 编辑器来决定 Ribbon。

## 3. Mimir 接缝与真实保真能力

### 画布与 marks

- `DocxEditor.tsx:2030` 起 `additionalFontControls` 是现有“其他字符格式”组；在该组加入具名菜单即可，不新建同级分类或宽表单。
- 正文/标题/列表是 `docParagraph/docHeading/docListItem`；表格单元格内也有可编辑段落。选区应以 PM 实际 text range 为准，不使用段落数字索引输入。
- `Run.rawRPr` 的保真约定见 vendor `docx-engine/src/types.ts:39–47`。`convert.ts:1549` 把它传入 `docTextStyle` mark，`:3054` 取回原生 Run；`generate.ts:2799` 的 `mergeRPrModel` 与 `:3378` 保留未知 rPr 属性。替换文字必须复制原 `node.marks`，不能先删所有 mark 或用一整段字符串覆盖选区。
- 超链接、批注、修订、脚注/尾注引用、域/公式、隐藏文字与字符样式不等同于普通字形。PM 文本被 links/comments 包围时必须原样保留 mark；atom 不变，不得给脚注引用显示号做大小写。
- 修订通过 `revisions.ts:680–694` appendTransaction 捕获普通 docChanged。大小写属于人工文字编辑，沿现有修订开关；不得无条件加 TRACK_IGNORE 来躲过修订。启用修订时会有附加事务，验收“一步撤销”不能错误要求整个 editor 只有一个 docChanged 回调。

### 保存路径

- 当前 `docx.ts:180–208`：`docxListSavePlan` → 既有 table/native plan → chart/reference/list options → `saveDocx` → `docxListSaveResult`。新功能不得替换或旁路该链。
- native `convert.ts:2164–2191` 对普通变化文字生成 GeneratedBlock；同结构时 `applyRawPPr`（`:2665` 起）保留/合并原 pPr；未改块继续 `{kind:'original',docxIndex}`，保持其他 ZIP 部件。
- **边界**：`rawRPr` 保护完整字符属性，并不自动保护重建后原 `w:p` / `w:r` 开标签上的未知属性及所有未知 inline XML。上一列表片是只改 numPr 的私有精确路径；**不能声称它自动保护任意文字变换**。
- vendor `text-patch.ts:25–69` 的 `patchParagraphTexts` 不适合作为大小写保真捷径：`:175–190` 将跨多个 w:t 的整体 replacement 塞到第一个 changed w:t，后续置空。若原字符跨加粗/链接等 run，会把变化后的字符放到错误格式中。它保留 XML 外壳不代表保留字符格式归属。
- 表格有 `convert.ts:2466` 起的 rich cell patch；需用真实大小写操作重开验证，不能因存在 patch 函数就假设任何合并格/嵌套表/域皆可可靠映射。

## 4. 推荐最小实现合同

### 4.1 目标与安全守卫

1. `caseTarget(editor)` 返回 `{doc,from,to,anchor,head,textLeaves,logicalText}`，只收当前真实非空 TextSelection。
2. 从选区取得实际可编辑文字片段；保留部分 run 的前后文字，中文、数字、标点不做无关修改。菜单打开时冻结 doc/选区；点击时 doc 或版本变化则拒绝，纯选区移动不改冻结目标。Shift+F3 使用当前画布选区。
3. 跨段允许，段落/软换行作为真实分隔；不移动段落、列表编号、表格单元格或改变表格结构。CellSelection、NodeSelection 不自动扩成全文，先给可读禁用原因。
4. 预检整个目标，再一次 transaction 应用；若选区穿过受保护域/公式/Zotero/instrText 或映射不完整的内容，整次拒绝并说明重新选择普通文字。不能一半改、一半跳过却报“已转换全部”。普通 inline footnote/image atom可作为分隔保留；首片可直接排除含这些 atom 的选区以避免假承诺，但必须有禁用解释。
5. 普通超链接/批注文字可支持，只要 marks 原样复制且用保存回读证明 hyperlink/锚点/关系未丢。既有 ins/del 修订内容应专项验证，未证明前明确拒绝选区内已有修订；人工修订开关本身继续可用。

### 4.2 四模式与跨 mark 语义

不能照搬上游逐 run 重新启动 title/sentence 的算法。例如粗体 `HEL` + 普通 `LO WORLD`，上游逐片 sentence 会得到 `HelLo world`。推荐按完整逻辑选区计算转换意图，再映射回每个原 text leaf 的 marks。

- upper/lower：采用 ECMAScript 默认 Unicode case conversion，与固定上游一致，**不是当前浏览器语言驱动的 toLocaleUpperCase()**；暂不增加语言下拉。
- title：每个空白分隔词首大写，其余小写；不暗示英语出版标题规则（a/the 等虚词规则不在上游）。连字符/撇号是否构成新词按上游正则保持一致，测试 `O'NEIL`/`FOO-BAR`。
- sentence：选区开头与句末标点后首字母大写，其余小写。建议明确补全 `。！？` 的识别；这是中文交互修正，应有断言，不能宣称固定上游原样已支持全角问号/感叹号。中文本身保持不变。
- 选区从单词中部开始，只改所选子串；不扩到词首或段落。转换起点按照选区起点，与上游合同一致。
- 用 Unicode scalar / UTF-16 offset 映射，不拆代理对；覆盖 `ß→SS`、`İ→i\u0307`、Greek final sigma 与组合重音。**不能假定输入输出等长，也不能逐字符独立 lower 而忽视 Greek Σ 的上下文。**
- 可行的纯适配：先得到 full logical lower/upper 结果，再按来源 Unicode scalar 的映射长度划分输出片段，统一判定 title/sentence 的大写起点，最后把片段归回源 text leaf。最终拼接必须等于全字符串目标转换；长度/上下文无法证明时在派事务前拒绝，禁止错分 marks。对默认 Unicode 的条件小写用 Greek sigma 回归证明。
- 使用 `schema.text(next, originalMarks)` + tr.mapping 改动实际片段，末次恢复完整选区；保留正选/反选方向。no-op（纯中文/数字、已经相同）不派 docChanged、不 dirty、不加 undo；给简短状态即可。
- 每次转换独立 history 边界；重复 Shift+F3 从转换后的完整选区推导，`ß` 长度增加后不可只选中尾部。

### 4.3 原件保存的最小可靠增量

先用原生链证明 rawRPr/链接/批注/普通列表和表格文本的保真；测试必须逐项区分“model 可保真”和“原始 XML 可保真”。若本片将未知 paragraph/run 开标签与 inline wrapper 原样保留列为完成门槛，则增加**独立、严格的 case-only SavePlan adapter**：

- 只处理有唯一原 docxIndex、结构/attrs/marks 未变化、文字差异能证明为本次大小写转换的原段；原 `w:t` 字符流须能与原 PM 普通文字流和 marks 归属完整核对。
- 按实际来源 w:t 分配字符扩展，逐 w:t patch，不移动输出到首个 run；保留 w:p/w:r/w:rPr、超链接 wrapper 和未知 inline XML。仅为必要的前后空白设置 xml:space，避免替换整个 paragraph。
- 映射基于来源位置/唯一锚点，不基于重复字符串全局 replace。含 fldChar/instrText、修订、嵌入 textbox 或未建模文字流时不猜测。
- 与本会话已发生的普通文本/结构编辑组合时继续沿 native 已有保存合同；**不能把这个 case-only 精确路径的证明扩展成所有任意编辑均保持全部未知 XML**。若新增保护必须覆盖组合编辑，应另补版本绑定的来源映射与测试，不能只移除拒绝。
- 新适配只改变 saveBlocks 中可证明的 case-only 段，嵌套在现有 list/table 链外，不改 numbering/ref/image/chart options，不改 vendor。

这部分需要实现者先固定输出合同，避免“PM marks 没变”被误写成“所有原始 XML 不变”。普通 rPr 保真已有原语，不需要另建 DOCX 全量 writer。

## 5. 测试与真实验收建议

| 层 | 必须覆盖 |
| --- | --- |
| 纯变换 | 四模式、部分选区、空白/软换行/段落、中文英文混排、`.!?。！？`、连字符/撇号、纯中文数字 no-op、ß/İ/Σ/emoji/组合音标。 |
| 实际 Editor | 单词/句子跨不同 bold/italic/rawRPr/link marks；部分 run；反选；Shift+F3 三步循环与长度变化后选区；input/textarea/Inspector 内快捷键不劫持；过期目标不写入。 |
| 原件 | 字体/主题色/未知 rPr、超链接关系/批注/非目标段、原 numId/ilvl不变；普通表格单元格文本不改 tcPr/网格；受保护域拒绝；一次保存、二次保存、保存后 undo/redo 全 ZIP entry 比较。额外声明“未知外层 XML 保留”时必须加 w:p/w:r sentinel。 |
| 修订 | 开启人工修订后一操作/一次 undo 合同，原生 ins/del读回；未支持的已有修订选区明确拒绝。 |
| 浏览器 | 真实内容选择→菜单→可见文字变化→保存重开；宽/420分类/菜单无整页溢出；Escape回实际入口；Shift+F3画布有效、输入框无副作用。 |

保持本任务既有真实模型/桌面边界：不需要模型配置，Desktop 用户自行验收，不为此重新请求凭据或桌面解锁。

## 6. 文件所有权与执行顺序

**建议单个 DOCX 实现者独占以下文件，根会话做浏览器，独立 checker 在 freeze 后复核。**

1. 新 `packages/office/src/editors/docx-case.ts`：固定来源说明、纯转换、实际选区预检、保 marks 的单事务命令与 Shift+F3 extension。新 `docx-case.test.ts` 对 Unicode/跨 mark/选区/history 重点验证。
2. `DocxEditor.tsx`：导入 extension、在其他字符格式组放四项菜单；可读禁用与 no-op状态接现有 notice。不新建大表单、不改列表/图片/引用实现。
3. 新 `DocxCaseControls.tsx`（若菜单足够短可直接在 Toolbar 组复用 shell）：当前 disabled/visible icon+label；同一个 command 同时供菜单和快捷键，避免两套逻辑。
4. 新 `DocxCaseControls.test.tsx`：真实 Editor Ribbon/键盘/窄组折叠测试。
5. 如上节精确保真门槛需要，新 `src/docx-case-save.ts`/测试，并由同一实现者独占 `docx.ts` 的最小 save-plan 接缝；不交叉改现有 `docx-list-plan.ts`，由 wrapper 组合。
6. 先纯变换与实际 PM 测试，后原生 save 合同，再 UI/专项静态与独立检查，最后根会话生产构建/浏览器宽420。

无 server/shared/renderer 协议改动，不增加 Agent tool，不改 vendor、Design/Draw/保护。

## 7. 将来如另做正文排序，必须先明确的边界（本片不实施）

- 文本排序要显式语言（如 zh-CN），以固定 `Intl.Collator` options/稳定排序处理中文和英文；相等键保持来源顺序，不由操作系统默认语言漂移。
- 数值/日期不能依赖 `Number('')`/随意 Date.parse 或按显示字符串比较。数值需完整可验证输入；日期限定明确 ISO/指定格式，歧义日期整次拒绝。混合类型和空段位置先有产品合同。
- 段落排序应只接受用户明确选中的完整连续段落，不在空选区时猜“全文”；移动完整 PM node 保留 marks/docxIndex/list numId/ilvl，原件按原块顺序重排，非目标块不重建。
- 列表计数随顺序改变属于可见结果，要保留原定义而非把编号烘成文本；跨组、多级层级排序不能单纯按文本打散子项。
- 表格排序是整行及所有单元格结构迁移，不是排序所选 cell 文字；合并格、跨行/嵌套表、行标题/公式或引用边界必须有迁移合同，不能清空后重填。
- 域、书签/批注跨段范围、SDT分组、节边界、锚定图片与修订需要完整范围迁移；单个 block 原 XML 能原样移动不代表跨 block 引用仍正确。

以上均超出固定 GenOffice 已实现的正文工具，不为了补齐图标数量扩建。
