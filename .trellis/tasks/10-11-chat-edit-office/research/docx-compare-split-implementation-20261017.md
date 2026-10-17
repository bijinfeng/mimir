# DOCX 本地对比与只读拆分实现

日期：2026-10-17。基于已批准 `docx-compare-split-next-20261017.md`；本报告是实现和组件/原生检查证据，真实浏览器 1280/420px 由根会话继续验收。生产已冻结，可统一构建；未运行全量 suite/Web build，未修改 vendor/server/shared/chat。

## 来源与边界

- 固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`：计划中 `compare.ts` 的段落 LCS、Review 本地 DOCX 选择、`ComparePanel` 和只读连续镜像为主要行为参考。
- WeKnora 官网与源码证据复用同计划所列已取证文件；v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的工具能力门控适用，不作为 DOCX Office 工具栏或对比/镜像实现来源。
- 不生成 Word 修订/合并文档。对比只针对两侧正文段落与普通表格文字，不比较格式、页眉页脚、批注与修订语义。

## 实现文件

- `packages/office/src/editors/docx-compare.ts`：同一 live/parsed PM 提取器、受预算限制的 LCS、整段变更序列按顺序配对、受控本地 DOCX 打开。
- `DocxCompareControls.tsx` / `DocxComparePanel.tsx`：审阅的「对比文档」320px Inspector，当前画布版本、本地来源名、仅差异/全部、统计、只读差异清单；内部滚动与固定比较按钮。
- `docx-readonly.ts`：仅供拆分使用的本地安全 AST；不复用比较序列来抹平格式。
- `DocxSplitView.tsx` / `docx-compare-split.css`：独立滚动的连续只读副本、关闭/Escape和基础正文格式。正文用白色纸面呈现原件颜色，头部沿用主题；不是原生分页副本。
- `DocxEditor.tsx` / `DocxViewControls.tsx`：最小 Review/View/reading 接缝；主 EditorContent 和原 scrollRef 置于始终存在的 stack，Inspector 留在外侧，原 pagination/fit 仍观察主滚动容器。
- `docx-compare.test.ts` / `docx-readonly.test.ts` / `DocxEditor.compare-split.test.tsx`：新增专项。

## 合同

### 对比

- 读取前 3 MiB 压缩文件上限；原生 parse 前 BoundedZip 500 部件、2 MiB/部件、8 MiB 总解压预算。错误提示给出上限或有效 DOCX 的恢复路径，不上传、不写库。
- 提取上限 2000 顶层段落/表格、20 万文字、30000 节点；分配 LCS 前检查两侧块数乘积 ≤100 万。不同长度不以截断造假比较。
- 保留空段落、重复内容、硬换行，以及 table row/cell/paragraph 三层边界。表格读真实 PM cell 内容；不读原预览。`docNestedTable` 与未知对象明确计入未比较范围。
- 对一个连续删/增片段，先收集整段，再按顺序配对为修改；剩余才计新增/删除。覆盖 2→2、多余项、重复和空段。
- 本地请求 token 单调递增；重选、关闭、编辑、卸载均使旧请求失效。原生文件读取/预检/parse 后均检查当前性；即使编辑后 Undo 回同 JSON，也不复活旧结果。编辑器实例/会话与文档来源生命周期卸载原结果，A→B→A 不复活。
- 当前 handle version 经 useSyncExternalStore 读取；版本不匹配结果不呈现。任何 docChanged 清除结果；新比较冻结 current JSON + version，迟到结果不得发布。失败保留所选文件以重试。
- 不执行写操作，不改变 dirty、selection、Agent version、history 或保存基线。

### 拆分安全格式白名单

- 文本与 hardBreak；docParagraph；docHeading 的真实1–9逻辑层级（1–6对应原生标题，7–9保留 `role=heading` 与 `aria-level`）；基础扁平项目符号/有序列表与有限层级。
- bold/italic/underline/strike 与上下标；实际 docTextStyle 的6位HEX颜色、内置highlight枚举/HEX阴影、有限2–288 half-point字号、经验证≤128字符fontAscii/font（仅Unicode字母数字空格._-），不接收任意CSS/URL。
- 段落align枚举、bidi布尔、有限lineSpacing；spaceBefore/After和indent按真实twips /20转pt，限幅，拒绝非有限数字。
- 普通表格/行/单元格/表头；colspan1–64、rowspan1–1000、有效px colwidth；有限HEX fill/color、bold、align/vAlign枚举、cellMar twips /20。使用基本网格，不宣称完整表格样式或浮动位置保真。
- 只从验证的标量构造独立 React CSS 属性。无 HTML/attrs spread、id、contenteditable、事件、form、链接URL、foreign资源或分页DOM；link等只保留已有文字，不执行链接。复杂对象和嵌套表格明确说明显示有限。
- 主编辑器和滚动 DOM 一直保持挂载；副本滚动不改变主选区/历史/版本。改变 live PM 立即刷新副本，无同步 timer。更换会话清除副本。

## 实际运行检查

- `pnpm --filter @mimir/office exec vitest run src/editors/docx-compare.test.ts src/editors/docx-readonly.test.ts src/editors/DocxEditor.compare-split.test.tsx src/editors/DocxEditor.views.test.tsx src/editors/DocxEditor.ink.test.tsx`：**5 files / 42 tests passed**，exit0，日志 `/tmp/mimir-docx-compare-tests.log`。
- `pnpm --filter @mimir/office typecheck`：**exit0**，日志 `/tmp/mimir-docx-compare-types.log`。中间一次被其他在途 PDF 括号编辑阻塞，已在对方冻结后最终重跑通过。
- 目标11文件 `oxfmt --check`：exit0，日志 `/tmp/mimir-docx-compare-format.log`。
- 目标10 TS/TSX `oxlint`：exit0、无warning，日志 `/tmp/mimir-docx-compare-lint.log`。
- `node scripts/check-style-backticks.mjs`：exit0。
- 目标新UI/CSS Impeccable detect：`[]`、exit0，日志 `/tmp/mimir-docx-compare-design.json`。未作浏览器样式合格声明。
- `git diff --check`（Editor/ViewControls接缝）：exit0。

组件测试使用真实 DocxEditor/openDocx/Tiptap/Agent handle，包含：

1. 对比/拆分/切布局/阅读后单一EditorContent/scroll DOM保持；正文JSON、选区、版本、history、dirty保持；无操作保存的所有非目录ZIP部件逐字节相同。
2. 当前未保存正文与真实本地DOCX比较；当前表格单元格改字与本地DOCX原格对比，含空段落；读取并非旧preview。
3. 编辑→Undo使结果永久失效、迟到文件读取关闭/切文档A→B→A不得恢复结果。
4. 拆分独立scroll、Escape回入口、真实bold/italic/heading/align镜像；9级标题逻辑语义；未知HTML/links/resource/style注入不进入DOM。
5. AST的half-point/twips单位、有限字体/颜色/数字、表格span/width/padding、安全值与复杂对象排除。

## 交给根会话/独立 checker 的后续

- 新代码已freeze。根会话统一build、独立checker及真实浏览器1280/420：本地chooser、折叠分组自动关闭、当前来源/版本、面板body内部滚动/footer可达、Escape回真正可见入口；split缩放/fit/阅读与窄栏高度、真实视觉格式检查。
- 文件失败保留选择、无操作原生导出和已有history的真实浏览器读回仍由根会话记录。组件/native检查不能替代这些浏览器证据。
- 本片未实现保护、可编辑大纲、原生Word比较/合并修订、复杂嵌套表格镜像或全部样式级联。
