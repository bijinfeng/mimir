# Research: XLSX 下一最小透视切片——跨表取数，输出到当前表

- Query: 在已验收的高级新建/读取/刷新之后，比较来源表选择、跨表新建与已有定义编辑，选择一片可独立实现、保存及浏览器验收的手动补全。
- Scope: mixed；仅 XLSX 透视，不重审六格式。
- Date: 2026-10-17
- Status: 只读研究及建议；未改生产、未执行测试/构建、未上传或删除文件。

## Findings

### 1. 给主会话的决策

**建议下一实施片为：新建透视时选择已有来源工作表，结果固定写入当前工作表。** 只增加一个来源表下拉及一个只读输出表名称；用户先打开汇总表，再选数据表和范围，现有字段/汇总/筛选继续工作。沿既有 `add_pivot`，不新增 DSL、编辑模式或工作表创建流程。

这片属于 **Mimir 已有原生能力尚未完整暴露给手动工具**。不能宣称它是“GenOffice 手动新建已有，而 Mimir 缺失”的已证事实：固定 GenOffice 的普通手动新建仍从 active sheet 同表生成。**已有透视布局编辑才是已证明的 GenOffice 手动能力差距**，但它需要独立的原件检查、定点替换和旧输出清理合同，明显大于本片；本片完成后仍应保留该待办。

不建议为了“编辑已有”直接把 `PivotDefinition` 转回新建草稿。读取模型缺少 `numFmt` 等原件元数据；当前只读是明确保护合同，不是漏写一个表单事件。

### 2. 当前已实现部分及可靠证据

- `research/xlsx-advanced-pivot-implementation-20261017.md`、`research/xlsx-pivot-html-planning-check-20261017.md`：多级维度、多值/聚合、分组/筛选/pageFields、新建和当前表全量刷新已经实现；真实 Editor 单事务、保存/撤销/重做和迟到拒绝已有专项。后者最终 Office 61/61、Server 14/14是历史验证记录，本研究没有重跑。
- `research/editor-remaining-tools-current-20261017.md` §3：同表 F1:J7 实机新建总计910，修改来源后刷新1010/新增2028–2030分组，两段完整ZIP历史已验；保留跨表入口及原地编辑差距。`toolbar-four-tools-browser-acceptance-20261017.md`主要证明填充等四工具，不提供新的跨表透视实测，不能用它宣称该能力已验。
- `packages/office/src/editors/XlsxPivotControls.tsx:25–31,141–175,325–363`：控件只收到单个 `sheet`；来源范围和字段读取都使用该表，没有来源表选择。
- `packages/office/src/editors/xlsx-pivot-controls.ts:197–225`：新建固定 `sheetId: sheet.id`，不填 `targetSheetId`，且无条件用同一坐标系拒绝源/输出范围重叠。
- `packages/office/src/editors/XlsxEditor.tsx:895–921`：父接缝把操作强制覆盖为当前 `sheetId`。只给控件加来源下拉仍会取错表，必须一并修此接缝。
- `packages/office/vendor/packages/xlsx-gateway/src/domain/workbook-dsl.ts:384–392`：既有 `sheetId` 是来源、`targetSheetId?` 是输出表；不提供后者时默认来源表。
- `apps/server/src/services/xlsx-agent-pivots.ts:205–238`：宿主已按来源表读取，按 `targetSheetId` 选择输出，只在同表时判断源区坐标重叠，建立实际 native cache/definition/网格输出。`326–354`在内存单次生成补丁、检查 touched inventory、重读后才返回一次版本。
- `apps/server/src/services/xlsx-agent-host.ts:327–340`：包括透视在内的内容操作仍按来源 `sheetId` 核保护；透视 writer `:172` 另外核输出表保护。此片不放宽“保护来源不能执行”的现行策略，即便业务上只是读取该来源。

### 3. 主参考及其界限

GenOffice 固定提交 `480548fd55f1be3593ee0d8e316a734751d58309`，本地固定源码 `/tmp/mimir-genoffice-full`；本研究不执行任何 Git 操作。

- `apps/sheets/src/renderer/pivot-actions.ts:229–250`：普通手动新建使用 active sheet 且不传 `targetSheetId`，未发现其新建表单来源/输出表选择器。不能把 native 参数等同为已存在的手动 UI。
- `apps/sheets/src/renderer/ai/prompts/guides/pivot.md:10–17`：明确 `targetSheetId?` 将结果放到汇总表；这是跨表原生能力和使用意图的具体证据。
- `apps/sheets/src/renderer/PivotDialog.tsx:59–68,113–129`：确有 `mode='edit'` 和原件预填；目标左上角固定为原位置。
- `apps/sheets/src/renderer/pivot-actions.ts:262–351,354–383`：已有布局编辑把来源与输出表ID分开，在写入时携带原 pivotPath/cachePath/oldBounds。它同样拒绝 grouping、formula、filter/pageField、值行布局、未知类型等无法回填的原件。Mimir 当前宿主的 `XLSX_PIVOT_OPS` 只有 `add_pivot`/`refresh_pivot`（`xlsx-agent-pivots.ts:34`），不能简单仿照传一个公开 `edit_pivot` 就完成。

**WeKnora 本次按项目要求重新检查官网及公开源码：**

| URL / 版本 | 2026-10-17 读取证据 |
| --- | --- |
| `https://weknora.weixin.qq.com/` | HTTP200，113529 bytes，SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe` |
| GitHub API `repos/Tencent/WeKnora/git/ref/tags/v0.8.3` | HTTP200，tag直接指向 commit `3e22822c1d2397be730c458c7539d0eb8c113a24` |
| `https://raw.githubusercontent.com/Tencent/WeKnora/3e22822c1d2397be730c458c7539d0eb8c113a24/internal/agent/tools/definitions.go` | HTTP200，13533 bytes，SHA256 `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0` |

该固定源码14–21行列知识搜索/读取/list；29–49行把文件操作与实际 sandbox 能力绑定，并说明无执行效果的复选框会误导。适用于此片的原则是 UI 选择必须真正映射执行器的来源/目标，保护/预算失败要真实呈现。它不提供 Office 透视表 Ribbon 或原件写回依据；外观与编辑能力主参照仍是固定 GenOffice 和当前 Mimir Inspector。

### 4. 一片实现边界与数据流

1. 从 `view.sheets` 向对象控件及透视控件传当前已发布工作簿全部 sheet；保持 `sheet` 表示当前输出/已有透视归属表。新增 `sourceSheetId` 草稿，默认当前表，选项用持久ID，名称仅显示。隐藏表仍可发现并标“隐藏”；保护表可列出并禁用/说明。不要用名称解析 `表名!A1:D8` 代替独立ID。
2. 在“字段 → 数据与位置”中增加“来源工作表”下拉；“源数据范围”继续只收 A1范围。“输出工作表”只读显示当前名称，输出左上角沿现有输入。跨表创建保持当前汇总表可见，不跳到来源表；已有透视继续显示真实来源与只读布局，刷新仍只针对当前输出表全部透视。
3. 切换来源不写文档、不改版本/dirty/history。保留用户已填的透视名称、输出左上角及输入范围；用新来源重新生成默认行/值字段，清空旧列/page/grouping/filter并提示“来源已切换，请确认字段”。无效新范围显示具体问题，不能保留旧来源字段冒充新表。选择相同来源不重置草稿。
4. helper 以真实来源读取字段/缓存值，以真实目标校验边界；仅 `source.id === target.id` 时拒绝源/目标坐标相交。生成 `{op:'add_pivot',sheetId:source.id,targetSheetId:target.id,sourceRange,targetCell,...}`；同表可省略 `targetSheetId`。2000格、缺失缓存、字段唯一/顺序和多值限制继续沿用。输出内容/merge/table/DV/其他透视冲突仍由宿主最终权威校验。
5. 父接缝不能再用 `{...op,sheetId:sheet.id}` 覆盖来源。建议收窄回调类型为现有 add/refresh 操作联合，并在执行前按活工作簿核来源ID存在、add目标等于当前输出ID；refresh保持当前表ID。冻结文档、handle、已发布version、来源/目标ID及请求signal，以当前工作字节执行单项 `propose_operations`。
6. 来源选择变化、当前输出表切换、文档/源快照身份变化、关闭/切对象类型均单调取消旧请求。来源切换控件在 pending 时显式disabled；仍须有最后的取消/身份校验，不能只依赖fieldset或按钮。失败保留当前草稿；自己的busy和成功发布的新view不能把成功变成取消提示。更早请求的迟到结果不得清除/覆盖后继草稿。
7. 成功仍由共享 handle 只发布一次字节、版本、dirty和history；手动保存仍显式到库。Undo/Redo恢复完整ZIP字节，不能仅撤输出格、不撤cache/关系；此片不新增 React 层文档历史，也不自动保存。

### 5. 预期改动文件（供 implement 分配 ownership）

| 文件 | 预期改动 |
| --- | --- |
| `packages/office/src/editors/XlsxEditor.tsx` | 传工作簿sheets，纠正来源ID被覆盖的接缝；保留文档/版本/signal绑定 |
| `packages/office/src/editors/XlsxObjectControls.tsx` | 只透传sheets给透视；保留六类型tabs和共用关闭/焦点逻辑 |
| `packages/office/src/editors/XlsxPivotControls.tsx` | 来源ID草稿、选择后的字段重置、当前输出表回显、请求取消与错误状态 |
| `packages/office/src/editors/xlsx-pivot-controls.ts` | 来源/目标显式参数、原生targetSheetId、同表重叠判定 |
| `packages/office/src/editors/xlsx-pivot-controls.css` | 必要时只补只读目标/长表名换行；保持现有滚动/footer结构 |
| 同目录 `xlsx-pivot-controls.test.ts` / `XlsxPivotControls.test.tsx` / `XlsxEditor.pivot.test.tsx` / `xlsx-pivot-test-fixture.ts` | 新来源目标案例、切换/取消、真实Editor保存历史fixture |
| `apps/server/src/test/xlsx-agent-pivots.test.ts` | 经真实宿主补跨表原生/保护/冲突与untouched证据 |

预期不需要生产 Server/vendor/DSL 修改；若 targeted 测试发现实际跨表写回缺陷，应明确报告具体反例再做最小修复，不能借此放宽结构守卫。

### 6. 样式、当前值和交互门槛

- 沿现有320px实色Inspector，≤800px覆盖但保留文档上下文；不加顶级Ribbon组、不新建模态表单。`xlsx-tools.css:131–188`已有宽度/容器适配。
- 只把新增来源/目标放入滚动body的现有数据组；不增加固定navigation高度。沿 `xlsx-pivot-controls.css` 的 flex/min-height:0/body overflow:auto/footer flex-shrink:0。Footer继续单一“创建数据透视表”或“刷新当前表全部透视表”；primary不重复添加children文字。
- 下拉真实回显选择，输出摘要带输出表名称；长中文/引号/空格名称可换行，不能挤压右侧箭头、控件或页面宽度。错误与禁用理由显示在关联字段/现有footer，不能只把宿主错误吞为false。
- 键盘可完整选来源及配置字段。先Escape只关Select浮层；再Escape关闭Inspector并回可见入口或折叠组。打开来源选项和切换不得偷走至工作表标签；关闭时若用户已转到外部控件不抢焦点。沿 `XlsxObjectControls.tsx:55–70`共用行为验证。
- 实际1280×720和420×500同轮截图：Inspector宽320、整页scrollWidth等于clientWidth，body实际有内部scroll，footer完整可点；切视口不丢草稿。滚到最后规则后主动作仍固定可见。不能用组件尺寸mock宣称窄屏验收完成。

### 7. 必需的最小验证集与浏览器fixture

**Fixture**：沿 `xlsx-pivot-test-fixture.ts` 现有六字段/150总金额数据，扩为现有“源 数据'2026”“汇总”及未操作第三表；加入隐藏来源选项、长中文表名、保护表。源含原始inline/shared字符串、样式、缓存公式及保留标记；目标A1空白，另备有内容/merge/table/DV冲突点。源与目标A1:F6坐标相交但分属不同表，直接证明旧无条件overlap guard被正确限为同表。

1. helper：跨表sourceID/targetID正确、同坐标允许，同表重叠仍拒；字段/汇总取所选来源而非当前汇总表，失效ID/未缓存公式不生成操作。
2. 真实控件：切来源重置依赖字段但保留名称/位置，不产生操作；取消/失败/相同tick双击、关闭/切表/换文档/切对象的旧结果不落画布；已有定义仍只读，refresh不误用新建sourceID。
3. 真实Editor→真实原生宿主：当前汇总表点击一次创建，单版本/单history；sourceSheet/worksheetSource与目标pivotParts关系正确，网格总计150，来源sheet XML及未触及第三表/customXml逐字节保持。保存→Undo→保存→Redo→保存比较全部非目录ZIP entry，重开仍有原生透视。
4. 经完整 `applyXlsxOpsOnHost`：来源保护/目标保护、无效目标ID及目标内容/合并/表/DV冲突原子拒绝；输入bytes不变，Editor版本/history/dirty不变。不要只调用低层函数跳过来源保护检查。
5. 浏览器用规定测试账号，在汇总表打开Inspector，来源选含空格/引号表并配置A1:F6→A1，新建/保存/下载原生检查，Undo/Redo各保存；再改来源金额/成员并在汇总表刷新，核native+网格；1280与420×500检查当前值、下拉Escape两层、内部滚动/固定footer/长名。此片实施阶段才上传fixture，研究阶段未上传。可沿用现有高级透视规则，不重做无关格式。

### 8. Related specs

- `.trellis/workflow.md`：先方案和明确边界，research落盘；本研究不修改任务状态或spec。
- `.trellis/spec/office/frontend/editors/conventions.md`：XLSX 范围/对象Inspector、持久ID、2000格、真实画布及保存、焦点/窄屏；标题“XLSX 对象 Inspector 与网格显示”。
- `.trellis/spec/office/frontend/editors/pitfalls.md`：原件解析及真实行列索引，不能猜稀疏内容范围。
- `.trellis/spec/office/engine/conventions.md`：原件补丁保真，不能用显示模型整体重建。
- `.trellis/spec/shared/contract/xlsx-agent.md:18,26–30`：版本/取消、单项透视、复杂元数据守卫、已有定义只读、全字节历史。需要由有权修改spec的主会话/implement流程补记新的来源表手动合同。
- Impeccable `reference/operate.md`：沿现有操作界面、真实状态、熟悉控件、紧凑层级；context结果允许现有窄范围扩展，缺PRODUCT/DESIGN不阻断本研究。没有进行新视觉世界或新产品规划。

## Caveats / Not Found

- 跨表新建是当前原生宿主已有分支，未找到现成 Mimir 跨表透视专项/真实浏览器验收；本研究不把源码可执行推断成已实测。
- 固定 GenOffice 普通手动新建没有证明提供来源表选择器；其已有布局编辑和native跨表输出均有上述具体源码证据，两者须分别记账。
- 已有定义原地编辑、所选报告筛选项、切片器/时间线持久化、Excel标准分组刷新、自定义numFmt增长等不在本片。它们不能因跨表入口完成而标齐，也不能为了缩短实现移除拒绝。
- 若主会话把“下一片必须是已经证明的上游手动独有功能”作为硬条件，应选择已有简单布局编辑并另立原件替换合同；不要把本跨表片包装成该条件已满足。本建议选择的是最小可用手动补全与最小保存风险。
- 未调用模型、未做Desktop；保持用户既定“先代码与浏览器、Desktop自行验收”。没有重跑全仓既存480技能lint失败，也没有改变任何生产文件或Git状态。
