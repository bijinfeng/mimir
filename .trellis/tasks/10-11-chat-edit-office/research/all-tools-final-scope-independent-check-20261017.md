# 六格式全工具最终范围与证据：独立复核

2026-10-17，`r3_bullets_independent_check`。本报告对当前任务整体只读核对；局部 focus 与 DOCX 复验另见末节专项。没有新增安装、服务、模型配置、账户、上传、删除、暂存、提交或归档。本报告不能代替 root 最终生产浏览器和原样 `pnpm check`。

## 结论与当前门禁

对已接受的固定 GenOffice 可执行工具/参数、六格式手动工具清单及用户追加的本地 PDF OCR，**未发现新增确定的工具或参数漏接**。此前最后六类实际缺口已有生产实现与专项证据：XLSX R3、图片比例、PPTX 引用图/透明与原附件、原音视频分析、批量图片符号、逐页生成与部分保留。

这不等于总任务已完成：最新原样全仓门禁曾失败（XLSX 两个旧测试入口/host、DOCX 导出生命周期与密码等待），修补和本次独立专项已绿，root 已在最终冻结源码启动原样门禁及Web build。逐页生成最后回焦修复已由 root 真实 CUA 确认回同编辑器画布。旧 `4231 passed /2 skipped` 只属于旧快照，不能覆盖后续源码。

## 1. 基线与研究适用范围

- GenOffice 固定 `/tmp/mimir-genoffice-html-git` HEAD `480548fd55f1be3593ee0d8e316a734751d58309`，本轮重核本地 HEAD；依据其真实 DSL、执行器和 Ribbon，不依据营销词或按钮总数。
- 已复核任务 PRD、design/implement 的当前扩展、check.jsonl、六格式矩阵与最新补片报告、`editor-all-tools-final-parameter-audit-20261017.md` 和 completion ledger。早期 design 的 DOCX-only 描述及旧矩阵待办已被后续 PRD/当前证据扩展，不据它们缩小范围。
- 按 AGENTS.md 重核 WeKnora v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 已缓存证据：官网 `/tmp/mimir-group-flip-weknora-site.html` SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`；definitions `/tmp/mimir-group-flip-weknora-definitions.go` SHA256 `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`。knowledge/wiki/sandbox capability 用于 KB 与 Agent 能力门控；不是 Office Ribbon、原生文件 writer 或视觉样式的主参照。本轮无新增远程 HTTP 调研声明。
- Office 编辑语义沿 GenOffice/Office for web/Google Docs，紧凑布局沿已接受 Obsidian 方向。没有用 WeKnora Markdown 编辑器替换文件工具栏对标。

## 2. 六格式入口、真实执行与当前证据

以下是跨层核对索引，详细逐参数和原件工件仍以链接报告为准，不把测试数量作为功能数量。

| 格式 | 入口与实际执行路径 | 独立/native 与浏览器证据及边界 |
| --- | --- | --- |
| DOCX | `DocxEditor`/Ribbon 与 `agent/docx-agent` → 公共 catalog/工具适配 → session/native save；原生结构、保护、加密仍走各自真实 guard/worker | docx-agent-inventory 的36工具/15子操作与手动矩阵；crop/table-position/outline/compare-split/ink/forms/protected-anchors/w1/w2/forced-tracking/privacy/encryption-final 浏览器专报。Standard/Agile 编辑保存、第三方密码/HMAC、重开、no-op exact cipher 已证；新建/改密码由用户稍后自行输入验收。最新 export 生命周期及加密 IO 独立41项见下节。 |
| Markdown | NoteEditor/Ribbon 与 `agent/markdown-agent` → markdown catalog/writing/frontmatter → 当前文档受控草稿/发布 | `10-13-markdown-agent-manual/research/capability-matrix.md` 最后增量草稿证据：真实 NDJSON 接收、停止后选择、420/回焦；不是实时 provider 成功。正文与 frontmatter 独立批次/flush 是文件索引一致性合同。 |
| HTML | HTML Editor/设计 Inspector 与 `agent/html-agent` → HTML catalog/writing → 安全树/文档元数据/唯一发布 | HTML矩阵13原生操作与 html-rich-brief-check、toolbar-design-rewrite-browser 的真实组件证据；多选、alternative/redo/user_edited/RGB及head meta pin 已接。restyle/extract pin 元数据不等于已自动改 CSS，报告明确。 |
| XLSX | XlsxEditor/Controls/对象管理 Inspector 与 `agent/xlsx-agent` → catalog/host/manual-ops/range/special-paste → 原生 writer/reader | pivot-layout/source、validation、preview/manage-final、multilevel-sort、R1/R2a/R2b 与 R3独立/浏览器专报。特殊粘贴六模式/平铺、统计域、CF/DV、链接、合并、丰富文本/native/history 有真实证据；CDATA 最终生产显示/复制/reload及1280/420已补通过。限制为明确可证明原生结构子集。 |
| PPTX | PptxEditor/Ribbon/对象 Inspector 与 `agent/pptx-agent` → host/严格 ops/services → session/native save/SVG render；逐页走共享 NDJSON schema/后端生成/renderer parser/临时候选/既有唯一发布 | c1/image-formats/media/snapshot/design/批量符号专报。批量符号原生正确但画布漏图曾真实失败；共享SVG分支补正，独立41项+正式产品8个SVG image及宽/420已过。逐页 Server13、Renderer11、Office当前32项及 types/static通过；root 最后CUA回同画布已过，最终全门仍运行中。 |
| PDF | PdfEditor/各工具 Inspector 与 `agent/pdf-content-agent` → 实际 hostBlocks/markup/schema/host → 原生 PDF 修改/独立解析；本地 OCR 独立临时结果 | text/image/signature/OCR 专报：真实插字拖动/宽度/对齐、native保存/保存后UndoRedo/reopen；图片自动恢复/翻转/native/420；本地WASM识别/复制/四旋转搜索/停止/重载清除且原件与索引零变更。扫描识别有误字提示，不宣称100%准确或入库OCR。 |

静态核对特别排除假缺口：PDF `wholeRun` 等旧 fallback 不能代表当前 hostBlocks 分支；PPTX applyLocal 的限制不能代表实际 hostApply 完整执行器；DOCX dispatch 末端的未实现保护错误不能据孤立字符串计漏工具。公共 `documentAgentCatalog(format)` 已分派全部六格式。

## 3. 最后六类缺口的闭合证据

1. **XLSX R3**：实际六模式、边框保留、平铺、整数重复门控、CUT单源门控、原生保存/history 已过；独立 Server534项及统计域补例、Office操作专项见 R3 independent 报告。CDATA修复独立94项、最终产品共享/inline显示 ` rich & text&literal;`、真实复制和reload正确，零dirty/history；不能只用纯helper证明运行时接线。
2. **图片参数**：DOCX shared schema → Chat bridge → API → route、Markdown catalog → agent → NoteEditor → API → route 的 aspectRatio 均实际传递；PPTX referenceImageUrls/transparentBackground 与 request-local 原附件通至 imageSource/common generation。独立16文件142项，真实SDK受控HTTP覆盖参数，不宣称真实供应商生成已过。
3. **原音视频分析**：真实附件选择/私有访问/原媒体前处理已接；实际浏览器 H264/AAC 视频四帧1280×720、AAC→16k mono WAV、原WAV exact、seek/decode/read/pre取消及资源回收专报已过。该页面是 codec 验证，不能冒充正式产品全部布局或 provider 分析质量。
4. **PPTX图片符号**：批量顶层PNG/直接组成员JPEG原生两段 buBlip/关系/媒体准确，保存UndoRedo各非目录部件精确；共享SVG真实图片run、父组matrix、420/960布局和 media URL 生命周期独立41项。root 最终浏览器主画布8图及缩略图已见，旧“native成功但画布缺图”失败保留。
5. **逐页进度与停止保留**：原生逐页完整候选后 checkpoint、NDJSON identity/sequence/UTF8/预算/backpressure、临时预览不改 live/history、stop 与 outer source abort分开、显式keep只发布一次，均按真实路径核验。Server新增背压/取消/terminal3例与Renderer极端逐字节UTF8中文/emoji/𠮷，不用4字节PK mock证明native。完整生成/部分保留真实原生Editor/history与round rollback保留。最终 focus fallback 从当前Editor显式canvasRef取得，仍待root实浏览器确认。
6. **原生边界与视觉**：每格式最新专报都有当前值、紧凑工具条、320px侧栏、内部滚动/固定单primary、1280与420×500、分层Escape/回焦证据；不能用happy-dom几何替代实际截图。最后focus是浏览器新发现，root再次CUA验证Escape丢弃后下一调用activeElement为同画布DIV、aria-label“幻灯片对象画布”、tabindex0，结果okfalse/changedfalse/version0，不能仅用组件回归覆盖失败。

## 4. 原样全门失败后的专项独立复验

- DOCX窄修复三文件与 owner freeze 全部SHA一致；独立重跑导出/protection-settings/encryption Editor/encrypted-session 四文件41项，真实worker/hash/native/IO/version/protection/candidate/ACK守卫均保留，见 `docx-export-password-final-gate-independent-check-20261017.md`。
- PPTX focus 在捕获原按钮延迟解禁外，新增 mount 前按钮已blur时回当前画布；用户已主动移焦则不抢。真实Editor含前后共四条焦点时序回归，四文件32项，见 `pptx-deck-progress-independent-check-20261017.md` 最新节。
- 两组合跑 **8文件73/73，exit0**，`/tmp/mimir-focus-docx-independent-tests-20261017.log`；Office `tsc --noEmit`、六文件scoped oxlint/oxfmt、diff check均exit0。最后生产快照 `/tmp/mimir-pptx-deck-focus-final-independent-freeze-20261017.sha256`；本人进程已全部退出。
- XLSX owner 的两个旧“粘贴”选择器改为当前唯一按钮，原 fakeHost 不支持新 paste_range 的用例改接真实 `applyXlsxSpecialPaste`，不是伪造返回。只读差量核对保留原始剪切公式迁移、格式/清除/native保存重开/history断言；既有保存与新编辑两种顺序继续验证dirty/version/native，清空公式立即切分类继续验证真实bytes与undo。owner70/70作为专项证据，不冒称本checker重跑70项或最终全仓已绿。

## 5. 明确支持边界与用户选择

- 未配置供应商：用户已选择先完成代码/UI。真实六格式provider Agent轮、图片生成/搜索、音视频模型内容质量未验；错误门控和受控SDK/HTTP不等同真实服务端到端。
- DOCX新建/更改打开密码由用户明确“稍后自行验收”，Desktop用户自验；不再作为待授权阻断。系统打印、屏幕录制chooser、独立双屏不据代码入口谎称OS操作已验。
- DOCX排序固定上游本身disabled；PDF视觉签名不是证书签名，固定源未证书执行器；PPTX表格边框固定仅all/none、深层组需解组、3D附件/封面不等于原生am3d；不凭名称增加未证明上游功能。
- XLSX新增sheet的 rows/columns 对应上游Univer演示网格容量；原生XLSX网格隐式存在，尚无证据它们是原生持久化文件参数，不能写空单元格冒充对齐。Mimir catalog明确name-only，host显式拒绝指定网格容量。记为平台适配界限，不新列确定native漏项。
- DOCX复杂opaque/保护锚点、PDF未知Form/clip/Catalog、XLSX复杂原生表/pivot/cache/扩展与预算、PPTX深层组/复杂资源复制都保留逐目标真实拒绝。支持子集不能宣传任意Office原件全兼容。四格式create_document亦按rich-matrix的内容限制，不宣传任意CSS/图片/图表。
- DOCX C2已有结构轮次只在保存前撤销；本轮已批准既有合同，不能声称保存后普通PM undo恢复批注结构，也不暗中新增全局结构历史架构。

## 6. 待 root 最终收口

1. 最后focus实际CUA回同编辑器画布已通过；完整三页生成/保存/单UndoRedo/native逐部件/reopen亦已由 `toolbar-pptx-deck-progress-browser-20261017.md` 记录。主动移焦不抢焦点有独立真实Editor回归，本checker没有重复操作浏览器；最终source快照须覆盖该修复。
2. 最终冻结后原样 `pnpm check`、Web build记录准确exit/count及起止源码身份，不用独立专项拼接成功。
3. 同步 completion ledger 主表与总入口：R3 CDATA和图片符号预览已由最新生产报告闭合；逐页回焦、全门据本轮最终结果更新。旧矩阵历史“待Desktop/两端/未接”须带时点，按用户选择和当前证据落准确状态；不删除失败历史。
4. shared document-agent 的逐页合同已同步包含临时预览/预算/唯一发布/取消/固定侧栏与回焦；final report仍须列真实provider、新密码和Desktop自验边界。

当前判断：无新增确定漏接项；本checker负责的代码/类型/静态/专项门已通过。总任务是否完成由上述最后浏览器和冻结源码全仓门决定，不能在本报告中提前改为complete。


## root最终质量门结清（2026-10-17 17:41）

独立结论及历史失败保持原文。其后第三轮原样pnpm check完整exit0：4606通过、2既有跳过、0失败；最终Web构建exit0，1764源码/配置起止零变化。逐页最终回焦、CDATA与图片符号生产宽窄屏均已通过。完整结果、报告映射及未配置provider/用户密码/Desktop自验边界见final-quality-check-20261017.md。当前授权代码与浏览器范围完成，不追加真实模型成功声明。
