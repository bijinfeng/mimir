# DOCX 混合分节浮动表格定位 — 独立复查

2026-10-17；对应 `docx-table-section-position-implementation-20261017.md`、已批准 `office-crop-remaining-plan-20261017.md` §B 与 `toolbar-docx-table-position-preflight-20261017.md`。正式 trellis-check，自行复查，没有派生代理。

## Findings (fixed)

- File: `packages/office/src/docx-floating-table-layout.test.ts`
- Issue: 原13项覆盖即时PM/JSON/history无变更，但未显式等待DOM observer恢复并flush后检查只读文档；不能用同步断言证明临时DOM补丁不会迟到进入正文。
- Fix: 新增真实Tiptap只读Editor回归；实际应用right-float布局、等待异步DOM观察、显式flush，再清空布局并再次等待/flush。验证doc对象及JSON保持、无docChanged事务/undo、只读维持、私有marker/property清除。新增1项，未修改生产逻辑。

## Findings (not fixed)

本片未发现需修复的生产缺陷。下列为验收或范围边界，不作为已通过项目：

- 最终production浏览器、两次原生保存重开与save→Undo/Redo由root统一执行。本checker未启动浏览器、构建或重型全套。root已有5173开发预检左右实际坐标/真实wrap和3479B原件cmp证据，只作为既有证据引用，不能替代最终验收。
- HappyDOM不进行真实CSS布局，复杂native margin表达式也不能完整解析；负X/Y、page/margin/text与五种native关键字的单测证明属性/表达式不被适配器改写，不证明所有Word几何完全兼容。最终浏览器须继续按预检计划覆盖窄/宽节、数值和关键字原件及suppression。
- 此修复针对section横向几何：仅在sectionWidthSpecs输入副本取消表格floated，原BlockBox仍floated。上游columnLayoutSpecs仍跳过floated（vendor pagination-sections.ts约291），因此没有新增浮动表格的逐栏/跨栏定位能力或垂直页对齐能力；这属于原引擎范围，不能把本片写成任意多栏Word定位已齐。非浮动正文/表格原column合并路径保持。若root需要扩展上述能力，应另立有原生/浏览器参照的纵切片。
- 共享公开spec由root统一同步，建议记录：混合节floatTable须获得所属节content width/margins/page offset；右float需修正真实wrap的margin而不只是paint translate；临时DOM补丁必须暂停/恢复observer且不能进入PM/native/history。checker未改并行owner的spec文件。

## 实际代码路径核对

1. `liveColumnPlacements`仅复制floatTable+floated输入给sectionWidthSpecs；section索引沿assignLiveBlockSections与既有helper的clamp，contentWPx/margins/dx/pageDx按当前节生成；table不被强制赋予段落widthPx，原BlockBox不变。普通文本、内嵌表格、其他浮动图/段落及code模式未新增分支。
2. 自有adapter先沿原ColumnLayoutExtension通道施加既有decoration/NodeView patch；随后独立stop/start observer包住私有class/CSS var写入。无doc属性/原生writer/dirty/version写入；setColumnLayout的meta事务沿addToHistory=false。
3. 右边距保存当前inline native margin表达式，不读取已经补偿的computed margin，故重复分页不会叠加。CSS加shared-flow与当前节width的差值，保留native anchor gap；原native X/Y、四距离、signed数值、XSpec/YSpec与paginator --tblp-dy不变。
4. 右→非右或clearDocxPagination的空placement会清marker/property，vendor原通道清section decoration；CSS显式排除doc-table-float-flow，suppressed保留正常block节布局。调用点包括首次width预测量、multicol各迭代与最终pass、cleanup，顺序未改。

## Verification

- Tests: **4文件50/50，exit0**。`/tmp/mimir-docx-table-section-independent-final-20261017.log`；12:29:58，3.52s。新增helper14、pagination geometry10、既有表设计/控件26。之前独立原49/49也通过，日志`/tmp/mimir-docx-table-section-independent-targeted-20261017.log`。
- TypeCheck: Office `pnpm --filter @mimir/office typecheck` **pass，exit0**。最终`/tmp/mimir-docx-table-section-independent-final-types-20261017.log`；未复现此前其他切片的W1类型阻点。
- Lint: 四自有TS目标oxlint **pass，exit0**。
- Format: 五自有TS/CSS目标oxfmt check **pass，exit0**。
- 无UI控件变更，不新增Antd检查；不重跑全仓已知480技能lint基线。
- 没有改vendor/DocxEditor/W1/nativewriter/DV；没有上传/删除测试文件或暂存/提交/归档。

## 参照

复用任务固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的实际column-layout、sectionWidthSpecs、table renderHTML、float测量代码。WeKnora沿同日已批准研究缓存v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`及适用性结论；它不提供Office浮动表格几何模型，本片没有新HTTP调研或外部取证。

独立检查冻结，五自有文件交还root；整体任务仍in_progress，不能从本片门禁推断所有工具已齐。
