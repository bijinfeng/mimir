# Research: 已有简单 XLSX 透视布局编辑

- Query: 下一片已由固定 GenOffice 源码证明、当前 Mimir 尚缺的手动工具；如何在不丢失原件元数据的前提下编辑已有简单透视布局。
- Scope: mixed；只研究已有透视布局；不重审已冻结的跨表来源切片。
- Date: 2026-10-17
- Status: 等主会话批准边界后才可实施。本研究没有修改生产/spec、运行测试/构建、上传/删除或操作Git。

## Findings

### 1. 建议批准的最小切片

**允许编辑严格识别的简单原生透视表的行字段、列字段、汇总字段与聚合方式；固定原来源表/范围、原输出表/左上角、原name/cacheId/part身份。** 行1–8、列0–8、值1–8；有列时仍只一个值；聚合仅sum/count/average/max/min。第一片只接受 **General 数字格式、普通汇总显示、默认 writer 透视样式及已知原生结构**。

继续把分组、筛选/pageFields、计算字段、值行布局、非General numFmt、自定义caption/样式/总计、未知属性/扩展、共享缓存或依赖关系不明确的原件保持只读，并给具体理由。这里的只读仅指布局编辑；已有读取/当前表刷新入口保持其自身现行能力判定。

这一片能补上真实的 GenOffice 手动布局编辑差距。**不批准“将现有模型当新建数据覆盖”；不批准两个公开操作的先删除再add。** 建议新增本地手动操作 `edit_pivot_layout`，沿现有字节宿主单请求执行；固定55项上游Agent DSL与vendor不变。主会话确认后才应进入实施。

### 2. 上游和当前源码证据

GenOffice固定 `480548fd55f1be3593ee0d8e316a734751d58309`；本地 `/tmp/mimir-genoffice-full`，本仓 `packages/office/vendor/UPSTREAM.json` 同样记录该commit。

| 文件 / 行 | 已证明的合同 |
| --- | --- |
| 上游 `apps/sheets/src/renderer/PivotDialog.tsx:59–68,113–129` | 已有 `PivotEditSeed`、`mode='edit'`，从原件预填行列/值与固定目标位置 |
| 上游 `apps/sheets/src/renderer/pivot-actions.ts:262–351` | 定位已有pivot；拒分组/公式/筛选/报告字段、负值行字段、未支持聚合；冻结source/target/pivotPath/cachePath/oldBounds |
| 同上 `:354–383` | 带原pivotPath/cachePath/oldBounds调用原生relayout，而不是创建第二个透视表 |
| 上游 `apps/sheets/src/renderer/workbook-ops.ts:281–295,333–350,369–403,435–450` | 同一个add内部执行器有私有relayout参数，校验其他透视、增长冲突、清旧输出，并记录刷新及布局替换 |
| 本仓 `packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-pivot-expand.ts:16–35,258–325` | **现有已vendor接口 `PivotRefreshUpdate.relayout` 可直接复用**；保留原name/cacheId/records关系ID，原地再生成table/cache，清records并由refreshOnLoad让Excel重建 |
| 同上 `:78–105` | helper按cache反查并返回第一个pivotTable；共享cache若未提前拒绝，会定位到错误对象 |
| 本仓 `.../gateway/xlsx-gateway.ts:843–858,1214–1219` | 原生plan先处理layout更新与增长守卫，再处理格修改；同次plan可设置cache refreshOnLoad |
| 本仓 `.../gateway/xlsx-pivot-add.ts:620–681,687–838` | `buildCacheDefinitionXml`/`buildPivotTableXml`已导出，重生成会重置默认root属性/styleInfo/dataField caption/numFmt；不能把“unsupported为空”视为足够安全 |
| 本仓 `.../gateway/xlsx-pivot.ts:55–89,309–331` | 读取的dataFields没有numFmt；PivotDefinition也没有原styleInfo、root未知属性和完整关系信息 |
| `packages/office/src/xlsx-visuals.ts:37–42,96–108` | 当前可见XlsxPivot只有path/cachePath/name/解析definition，raw私有元数据尚未保留 |
| `packages/office/src/editors/XlsxPivotControls.tsx:280–315` | 当前已有定义真实只读；没有布局编辑状态或应用入口 |
| `apps/server/src/services/xlsx-agent-pivots.ts:34,145–155,259–307` | 仅add/refresh；已有growth用relayout重建，并另查原件numFmt/总计/ext守卫。此growth检查不是完整的编辑资格证明 |

**重要实现发现：** 上游 `workbook-ops.ts:393–403`按max(height)×max(width)矩形填null。新布局“变宽同时变短”或“变窄同时变高”时，该矩形可能包含既不属于旧输出、也不属于新输出的角落。Mimir局部adapter必须按**实际集合并集**写入，不能照搬矩形padding，也不能直接复用当前refresh的max矩形write来清尾部。此为研究中的风险推导，未运行反例测试，不宣称上游实测损坏。

### 3. 精确的原件资格与只读理由

建议使用浏览器安全的本地 `xlsx-pivot-editability.ts` 做有预算的只读检查；Server执行前调用同一语义检查并从当前bytes重新取raw，最终结果以Server为准。不能把客户端`eligible:true`或hash当授权证明。

**正向资格必须全部成立：**

1. default SpreadsheetML命名空间，XML通过validation；拒DOCTYPE/entity、重复属性、重复singleton和名字空间歧义。关系采用严格OPC解析：内部规范路径、唯一目标、无External或别名指向不明。当前既有reader的显式前缀限制不在此片扩大；遇不同XML方言以明确只读处理。
2. 由当前输出sheet的真实pivot关系定位唯一pivotPath；其唯一cache关系与workbook中的cacheId映射完全一致；cache唯一records关系存在，内容类型正确。全包所有pivotTable→cache反向索引证明**仅此pivot消费cache**。不能只看当前表pivots数或缓存ID是否不同。
3. 来源是现存工作表的固定A1矩形，标题/缓存字段与源列一一匹配，非空唯一；没有外部/defined-name/data-model/consolidation来源。来源和目标均未保护。保护来源即使仅被读取仍保持现行拒绝，不从manual分支绕过。
4. definition.unsupported为空；1–8正数rowFields、0–8正常colFields，允许固定writer多值列哨兵-2但不允许值行布局；至少一个普通值字段，仅五聚合；无grouping/formula/filter/pageField/隐藏成员/手动排序、其他特殊布局。
5. 原始dataField `numFmtId`仅缺省或0；cacheField也仅缺省/0，无showDataAs（允许语义normal）；不接受百分比默认10，也不接受任何自定义格式。dataField caption必须是固定writer生成的普通默认caption，原件自定义显示名保持只读。编辑后依相同writer生成新默认caption，UI要准确回显当前字段和聚合。
6. table root/location/pivotFields/items/rowItems/colItems/styleInfo、cache root/source/fields/sharedItems以及records结构都属于已知writer语义；General/default styleInfo精确为`PivotStyleLight16`与已知flags；默认总计，无其他format/conditionalFormat/custom subtotal/autoSortScope/pivotAreas/扩展或未知属性。不能仅对extLst做一个负向正则。
7. 建议资格实现以**完整有序XML语义树核对固定writer可表示基线**：属性顺序、合法单双引号/空白和空元素写法可归一；所有节点/属性/值均有明确去向；不匹配即拒绝。Server可将原布局seed按当前源grid重建，调用已导出的table/cache生成器进行全结构语义对比；仅允许已验证的refreshOnLoad=0/1、原合法recordCount及已知声明归一，不忽略任意属性。来源新成员造成基线不再匹配时明确“源成员已变化，请先刷新后重试”，不能为了让编辑通过删掉比较。
8. 旧输出/新输出以及实际受影响并集均≤2000格并在表边界内。旧输出及新输出不碰merge/表/DV/CF/超链接/批注/其他透视、shared/array/spill公式或未建模地址结构；不移动行列。旧输出本身拥有的普通文字/数值格可重写；未知单元格扩展不能清除。
9. 第一片旧输出/新增输出涉及的有效单元格/行列继承格式应为默认General和默认外观，或能证明补丁逐地址完整保留且不制造角色格式错误；建议首片按默认格式正向接受，其他明确“输出区域含暂不支持的自定义格式”。`s=0`本身不证明默认，须解析所指xf和继承。
10. 所选pivot没有关联的slicer/timeline/pivotChart或其他cache依赖；对选定cache/pivot名构建依赖检查，不能只查当前表visuals。定位不清时只读并说明“缓存或关联对象关系尚不能安全更新”；不因整个工作簿存在无关复杂对象就擅改它们。

**明确只读文案分类：** 无法定位原件关系；共享缓存；来源/目标受保护；来源/标题或缓存成员已变化；含分组/筛选/报告字段；含计算字段；值行或其他特殊布局；自定义数字格式/显示方式；自定义样式/标题/总计；未知原生属性/扩展；关联切片器/时间线/透视图；输出区关联结构/格式；超过预算。尽量只显示最直接原因，详情列其余，不显示统一“复杂原件不支持”。

上述资格是 **Mimir局部writer保真边界**；不能把这些只读理由都计为GenOffice功能缺口，也不能宣传支持任意Excel透视编辑。普通GenOffice自己的writer基线是本片正向fixture；导入Excel定义只有完整通过相同能力检查时才接受，首片不承诺广泛兼容。

### 4. raw/private数据与当前值

需要从当前bytes读取并在本地闭包/请求内持有：原table/cache/records XML、各rels XML及对应path/ID、cacheId/name、worksheet entry、source/target ID与源ref/oldref、原styleInfo/dataField格式和完整规范化树、反向cache消费及关联索引。保留这些用于资格证明与保存前复查；不把raw XML塞入Agent `read_sheet_features`、可修改form或HTTP参数。

UI只收到派生 `{eligible, reasons, seed, sourceSheetId, targetSheetId, sourceRef, outputRef}`；seed包含真实有序row/column/values/agg。可以携带baseline指纹作过期诊断，但Server仍从bytes重新解析。读取请求绑定document/handle/version/pivotPath；换选项/关闭/切表/源变动废弃旧请求，不能让A→B→A恢复旧资格。禁止浏览器导入gateway writer模块；`UPSTREAM.json`已明确OOXML写路径属于Server。

### 5. 本地操作与宿主流程

**建议新增共享手动schema一项，不新增上游公开DSL：**

```ts
{
  op: 'edit_pivot_layout',
  sheetId: targetSheetId, // 原透视归属表
  pivotPath,            // 只作当前sheet内对象身份，不直接读任意路径
  rowFields: string[],
  columnFields: string[],
  values: { field: string, agg: 'sum'|'count'|'average'|'max'|'min' }[]
}
```

顶层及value对象strict，拒多余name/source/target/newPath/cacheId/numFmt/grouping/filter参数。source/target/origin全部从当前原件派生，不接受客户端要求迁移。沿 `/api/conversations/xlsx-agent/apply-ops` + `action=apply_ops`，单项，不带image；不增加route/action，不向固定Agent catalog宣称多了第56个上游工具。现有manual入口不是访问控制边界，仍必须完整鉴权、输入和原件验证。

`packages/shared/src/xlsx-agent.ts:13–67`已有本地manual schema；`xlsx-agent-host.ts:261–274`在vendor schema前分流manual。建议在该分流中把edit项转专门adapter，不让庞大range manual执行器假装处理pivot；其它manual项保持现状。**该分流早于通用保护循环，所以新adapter须独立核source和target保护。** 现有HTTP鉴权仍覆盖文档可见性；signal在前后preflight及发布前复查。

执行顺序：

1. 从传入当前工作bytes做BoundedZip完整预检，按targetSheetId+pivotPath定位，重建资格和私有关系信息；输入path不能绕过sheet所属关系。校验当前seed与operation的字段全部来自同一原来源，字段索引/重复/维度值冲突/有列多值限制沿现有layout规则。
2. 若操作与原语义配置相同，UI禁用应用并显示“配置未变化”；强行调用宿主时明确拒绝为无变化，保持输入bytes/version/history，不为了返回成功推进一次版本。来源值变化请使用已有刷新入口。
3. `buildPivotLayout(currentSourceGrid, newSpec)`，原top-left生成newref；源/目标同表时检查与源区相交；检查新输出与其他透视/结构的冲突。当前旧区域只对**这个pivot**放行，不按面积巧合排除其他对象。
4. 用真实集合操作：**新区域全部matrix格 + 旧区域减新区域的空值格**，坐标去重，一次CellEdit集合；不写max宽×max高矩形的外角。单独核new-minus-old空白（包含formula/合并/结构），核old-minus-new安全可清理；整个真实并集限2000格。
5. 原生plan携带 **零additions**、`pivotRefreshUpdates:[{cachePath,sheetName:target.name,newOutputRef,relayout:{sourceSheetName,sourceArea,location,name:originalName,...layout.definition}}]`、对应`pivotCacheRefreshPaths:[cachePath]`及前述cell edits。`planCellEditsToXlsx`会调用现有relayout并保留身份；不手工删除parts、不分两次调用宿主、不先发布中间字节。
6. 严格独占cache检查消除gateway“反查第一个pivot”的歧义；生成后再核实际被改tablePath确为所选path。`assembleWithJsZip`后独立核inventory、原name/cacheId/path/所有关系ID不变、cache source不变、新ref/fields/输出一致，重读readXlsx再返回 `expectedVersion+1`。
7. 预期仅改目标worksheet、选定table/cache/records；既有gateway可能按原合同修改workbook calcPr或移除calcChain及其关系/类型标记，必须逐一证明这些有限副作用。无新/删pivot parts，无style.xml/源sheet/第三表变化；只依赖“touchedEntries自报”不足以证明保真，须独立对比全部未触及entry。
8. 共享handle原有一次host结果→openSession→一次remember/history/dirty/onChange（`xlsx-agent.ts:348–373`），刷新后再编辑与编辑后再刷新都读新session的原生定义；保存仍显式到库。Undo/Redo完整恢复ZIP，不增加React层历史。

**能否复用vendor？可以，且不必改vendor。** `PivotRefreshUpdate.relayout`已满足身份替换、location改大/改小和records清空。须额外本地资格、关系独占、并集清理及最终inventory核验。初片记录沿上游合同：编辑后records count=0且refreshOnLoad=1，Mimir网格/定义已更新，Excel需从来源重建cache；不能声称与新建一样输出完整预填records或已实测任意第三方Office。若产品要求完整cache records离线兼容，则需另片本地writer，不在本片隐式添加。

### 6. Inspector行为及视觉验收

- 同一个320px Inspector的“透视表”选择器保留原pivot path。已有对象默认是读取状态；通过“编辑布局”进入显式草稿模式。字段tab复用有序行/列与汇总tab的真实字段/聚合控件；编辑时来源、范围、输出位置、名称只读，筛选tab显示无筛选/此片不可新增，不展示会被静默丢弃的可编辑控件。
- 进入不改文档；当前值必须逐项原生回显，不能默认row[0]/sum。固定footer编辑态只有一个primary“应用布局”；“取消编辑”用secondary；取消回原生只读，重新进入重新取当前基线。刷新入口在读取态保留，pending时互斥。
- 第一片eligible的新建form有的numFmt/show-as/grouping/filter controls不得泄漏进编辑模式；不能显示可以输入但保存忽略的参数。资格不通过则保留原生readback，显示原因，编辑入口禁用且有原因。
- 原顶层六对象tabs、透视导航和配置全部沿当前内部body滚动，不另加固定区域。420×500 footer可见、body实际能滚到底，长name/source/ref换行，Select不溢出/被body裁切，整页scrollWidth=clientWidth。1280×720与420×500各一张真实截图及对应实际测量。
- 第一次Escape只关当前Select；下一次退出编辑草稿到读取态并把焦点回“编辑布局”，再Escape关Inspector回可见入口/折叠组。关闭整个面板和切对象/当前表永久取消草稿和pending；已转到外部控件时不抢焦点。视口变化保持同一草稿，不视为文档变更。
- 编辑/宿主请求冻结文档、handle、version、pivotPath、source/targetID与读取资格epoch；改源、刷新/Undo/Redo或异步读取过期均要求重新确认。自己的pending及成功发布的新view按已冻结跨表片的acceptedSignal模式处理，不能使自身操作自取消。

### 7. 文件与责任建议

| 文件 | 工作范围 |
| --- | --- |
| `packages/shared/src/xlsx-agent.ts` | 本地strict手动edit schema/type；不改固定vendor DSL |
| 新 `packages/office/src/xlsx-pivot-editability.ts`及测试 | 浏览器安全原件资格、safe seed、原因；raw仅闭包/函数内部 |
| `packages/office/src/editors/XlsxPivotControls.tsx`、`xlsx-pivot-controls.ts`、必要CSS | 已有对象编辑模式、当前值/只读元数据、取消、footer及字段操作生成 |
| `packages/office/src/editors/XlsxEditor.tsx` / `XlsxObjectControls.tsx` | 当前handle bytes资格读取接缝、输出归属/版本/取消；不覆盖既有跨表source语义 |
| 新 `apps/server/src/services/xlsx-pivot-layout-edit.ts` | raw独占验证、严格baseline、union edits、gateway relayout及最终原件核验 |
| `apps/server/src/services/xlsx-agent-host.ts` | 本地manual单项分流与signal/preflight/DV合同；不放宽通用保护 |
| `apps/server/src/test/xlsx-pivot-layout-edit.test.ts`及必要route测试 | native正反例、身份/metadata/inventory/原子性 |
| `XlsxPivotControls.test.tsx` / `XlsxEditor.pivot.test.tsx` / pivot fixture | 真实控件、真实宿主、当前值、保存history及取消 |

避免把native writer引入浏览器；资格helper可用已依赖`fast-xml-parser`与只读model/domain函数。写adapter保留Server目录依赖边界。

### 8. 最小有意义的测试/浏览器fixture

1. **正向native**：用真实既有add_pivot建立General/default样式基线，保存后再edit。两来源/输出不同表、字段含中文/空格/引号；多行维度+两值改为有列单值，再改回无列多值，实际校验汇总总计、row/col/dataFields、原name/cacheId/table/cache/records paths及关系ID。随后刷新和二次编辑都使用新native定义。
2. **精确并集反例**：旧输出高而窄，新输出短而宽，外角布置不属于旧/新区域的“不能清除”文字、公式和样式；编辑应成功且外角XML逐字节保留。反向变高变窄同测；new-minus-old有真实内容则整项失败；old-minus-new清空但范围外保留。
3. **raw资格参数化**：最小独立变体各拒绝：dataField numFmtId2/164、自定义styleInfo、caption、总计root、未知属性/扩展、cache未知字段/fieldGroup、filters/pageFields、formula、值行布局、隐藏成员、重复关系、外部记录关系、跨表共享cache、关联pivotChart/slicer；不是只对JS模型加unsupported数组。所有失败输入entries不变。
4. **保护与绑定**：来源保护、目标保护、selected path不属于sheet、schema额外source/target/cacheId字段、过期version/aborted signal、混批/image均拒；不要仅调用低层adapter测试而跳过真实apply-ops入口。
5. **真实Editor**：读取当前顺序/聚合，不改草稿不执行；一次应用一个host请求/版本/history；save→Undo/save→Redo/save完整非目录ZIP entry对比；源及第三表/customXml精确保留。关闭/取消/切对象/切表/换文档/旧资格读取迟到、外部编辑→Undo不复活旧draft均不发布旧结果。失败保留草稿并展示具体原因。
6. **浏览器**：用户规定admin账号，既有General simple pivot fixture（提前通过原件资格）。在汇总表选已有透视进入编辑，改行顺序和值聚合，实际网格/保存下载/原生检查；一次Undo/Redo保存。1280和420×500、长字段/长表名、body真实滚动、footer/Select/Escape逐层焦点均真实验。再选择至少一个numFmt/unknown-extension拒绝原件确认原因和只读。无真实模型、Desktop由用户自验；本研究没有执行该流程或上传fixture。

### 9. Related specs与外部研究要求

- `.trellis/spec/shared/contract/xlsx-agent.md:18,26–30`：当前版本/取消、单项透视、未知原件守卫、只读既有定义及完整字节history；实施后需主会话按角色权限更新“简单资格可编辑”的精确合同，不能只删除旧只读句子。
- `.trellis/spec/office/frontend/editors/conventions.md`：320px对象Inspector/内部滚动/fixed footer、持久ID、窄屏真实画布与焦点。
- `.trellis/spec/office/engine/conventions.md`、vendor/UPSTREAM.json：写路径Server限定，vendor不改，保真不能用不完整显示模型替代原件。
- WeKnora按AGENTS要求使用同一研究会话刚核对的证据，详 `research/xlsx-pivot-next-plan-20261017.md` §3：官网HTTP200、113529bytes、SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`；公开v0.8.3 tag经GitHub API验证commit `3e22822c1d2397be730c458c7539d0eb8c113a24`；固定definitions.go HTTP200、13533bytes、SHA256 `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`。源码14–21知识检索/读取与29–49 sandbox能力门控说明UI必须对应真实执行能力；对本片的意义是明确eligible/readonly和真实效果。它不提供Office透视编辑/保存/工具栏模型，主要参考是上面的GenOffice具体代码。

## Caveats / Not Found

- 没有现成Mimir `edit_pivot`或raw元数据模型；新manual operation和资格adapter是必要实现，不是加按钮即可完成。
- 原件已知writer结构的严格语义比较是建议的安全边界，尚未实现/验证；实施者需以正向实际生成文件验证它不会一概拒绝，并证明每类未知属性确实被拒，不得以失败为由放宽成unsupported.length===0。
- 整个公开API本片不增加；本地manual schema增加一项会被现有host接受，但不是安全权限隔离，也不代表Agent固定DSL功能表已扩展。
- records清空+refreshOnLoad是固定gateway真实行为；不声称完整预填cache或实际Excel/LibreOffice兼容验收。
- 同一片不要顺带支持任意numFmt、style、过滤/分组编辑、迁移来源或透视位置；保留只读原因后再逐项设计。
- 本文件为待批准方案。尚无本片代码、测试或浏览器验收结论；不把研究风险推导写成已实测缺陷，也不改当前任务/矩阵完成状态。
