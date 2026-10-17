# XLSX R2b：普通范围 CF/DV 原生迁移实施记录

2026-10-17，owner `/root/xlsx_range_structure_r2a`。**实施已冻结，待正式独立checker与root真实浏览器验收；本报告不宣布全部工具完成。** Server runner已归还root，无stage/commit/archive/delete、无新账号/测试文档上传。

## 边界与依据

只补无筛选同尺寸单矩形copy和本地move（≤2000操作格）的普通CF/DV，沿R2a完整包含merge/link一次组装。fill、筛选复制、sort、R3特殊粘贴和notes不取得此许可。保护、版本/abort、来源身份、手动保存及完整字节history沿原合同。

依据已批准 `xlsx-range-rule-migration-r2b-plan-20261017.md`、原R2计划与已缓存固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`、Univer0.25.1 `/tmp/mimir-univer-r2-review-20261017`。WeKnora v0.8.3 commit `3e22822c1d2397be730c458c7539d0eb8c113a24`、cached site SHA `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`、definitions SHA `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`，仅沿原文用于KB/Agent边界，不作为Office剪贴语义。本片没有新HTTP或最新版声称。

## 生产实现

### 私有planner与范围守卫

- 新 `apps/server/src/services/xlsx-range-rules.ts`：矩形交/差/平移与确定性无重叠并集；整列作用域恒定矩形工作，不逐格展开。每规则sqref512、分片8192、规则4096、运算200000与XML4MiB预算；超过预算在发布前失败。
- `planXlsxRangeRules(request,readers)` 从冻结原生规则取交集，扣目标覆盖和move源。源规则首anchor改变、混合/绝对/跨表引用与formula-CFVO均逐token处理。move依赖按引用边界分片，再复用真实move算法；与源相交的整行/列公式引用或部分矩形引用、不能等价分片的统计规则域准确拒绝。
- 保留dxf实际身份、stopIfTrue、完整提示/下拉属性、颜色/阈值；验证已知类型/属性/布尔/数值、颜色身份与阈值计数/顺序。新CF priority全表唯一稳定，源相对次序保留；仅分片冲突时顺推保留priority。未知/歧义/重叠DV、重复priority与未知扩展拒绝。
- `candidateBases` 接收R2a结构候选，先比较CF/DV原生完整片段与冻结原件一致，随后组合rules，避免替换sheet时覆盖merge/link修改。私有WeakMap permit绑定原entry/XML及非空操作范围，仅放行CF/DV相关范围guard。输入bounds复制后签名，不共享可变外部范围对象。
- `xlsx-range-features.ts` 添加该窄permit及第三表top-level结构检查。未知第三表规则扩展继续拒绝。`xlsx-rule-footprint.ts`仅公开既有静态引用读器，原R1保护算法保持。

### 实际入口与candidate验证

- `xlsx-agent-range.ts` 将普通copy结构候选与规则候选组合；filtered/fill沿旧守卫。`xlsx-manual-ops.ts`将move全簿规则/merge/link/cell作为一次候选；第二次全簿公式改写仅处理cell `f`，防止规则公式搬两次。被改第三表检查原生保护。
- `qualifyMovedFormula`复用既有标准token pattern，补足跨表移动时不相交的整行/列引用原来源限定；部分相交整行/列规则依赖仍拒绝。
- `bindXlsxRangeValidation(actualBytes,plan,target)`用实际Uint8Array身份绑定私有coverage，不新增result/HTTP/Agent字段。host从实际candidate读取新DV；目标枚举仅≤2000操作格，包含值未变与空格；区外依赖按矩形分类已有存储值，语义未变的tile不被强制重验。
- 修复新行渲染补出的空占位被误当值变化的问题：空值比较归一，同时比较numeric/boolean类型。此修复避免旧区外无效DV在普通粘贴时被误重验；新DV强制coverage仍不会跳过未变值。stop/unknown/未缓存拒绝，warning/information沿旧严格确认合同，普通copy/move不能取得manual_cell豁免。

### 浏览器与Server唯一XML归属

- 新 `packages/office/src/xlsx-native-xml.ts` 原样承接R2a有界lexer、native offset/namespace tree与公式character data；用TextEncoder计算UTF8预算，没有Buffer。普通实体一次解码，CDATA从不作实体二次解码；注释、未知混合公式markup、命名空间和预算守卫保留。
- 原 `xlsx-range-structures.ts` 保留旧路径重导出；原 `pivotXmlTree` 52行纯语义parser也迁入同一模块，`xlsx-pivot-editability.ts`旧入口重导出，消除native→pivot→xlsx新循环。唯一另外的pivot代码变化是纯singleton helper无行为hoist，以满足所触文件既有lint。
- `xlsx-sheet-features.ts`、`xlsx-cell-effects.ts`共用该reader读取前缀/CDATA的DV/CF及dxf身份，原字节不被读取重写。CF阈值render-only XML局部去标准前缀，native字节保存不使用该display view。
- `xlsx-validation-list.ts`接收可选 `{address,range}`，按首sqref anchor平移相对/混合list引用；XlsxEditor当前格列表与host用同一resolver。`xlsx-formula-predicate.ts`有界解释器增加简单工作表限定引用callback；CF/DV读取实际依赖表/缓存，缺表和未缓存如实失败。

## 文件清单

新增生产：Server `xlsx-range-rules.ts`；Office `xlsx-native-xml.ts`。

修改生产：Server `xlsx-range-structures.ts`、`xlsx-rule-footprint.ts`、`xlsx-range-features.ts`、`xlsx-agent-range.ts`、`xlsx-manual-ops.ts`、`xlsx-agent-host.ts`；Office `xlsx-pivot-editability.ts`、`xlsx-validation-list.ts`、`xlsx-formula-predicate.ts`、`xlsx-sheet-features.ts`、`xlsx-cell-effects.ts`、`editors/XlsxEditor.tsx`（仅列表resolver context和import）。

新增测试：Server `xlsx-range-rules.test.ts`、`xlsx-range-rules.test-helper.ts`、`xlsx-range-rules-host.test.ts`；Office `xlsx-range-rule-reading.test.ts`。临时phase-one复制解析适配器已删除，helper直接用真实生产native reader、静态grammar、move与qualification函数。

修改测试：`xlsx-range-disjoint.test.ts`原普通CF/DV拒绝场景改为准确迁移/native依赖分片断言；filter/fill/sort/未知规则保护仍在。`xlsx-range-structures.test.ts`正常CF保护样本换成unknown属性，保留原结构场景。没有删除测试。

规格：`.trellis/spec/shared/contract/xlsx-agent.md`补7节可执行合同，修正旧move全部规则拒绝的过时描述。本报告为新增任务证据。未改vendor、public DSL、排序内核、DOCX、manifest/lock或其他owner生产文件。

## 验证与保留的失败历史

1. standalone phase-one Server1文件 **44/44 PASS**，`/tmp/mimir-r2b-phase1-tests-20261017.log`；当时没有production wiring证明。
2. 首次接线5文件 **17失败/264通过**：15为旧R1拒绝预期已过时；另2为第三表未知顶层/扩展真实guard回归，恢复独立top-level检查后修复。保留 `/tmp/mimir-r2b-wiring-tests-first-20261017.log`。
3. 首次新增native6文件 **5失败/291通过**：4个fixture使用非工作表限定link触发已有正确guard（fixture修正为 `'数据'!A1`）；1个暴露区外空占位误重验，生产比较归一后修复。`/tmp/mimir-r2b-native-tests-second-20261017.log`；修复后单host **15/15**，`/tmp/mimir-r2b-native-host-third-20261017.log`。
4. 第一完整12文件 **384/384 PASS**，`/tmp/mimir-r2b-server-scope-20261017.log`。随后补7个边界测试，新增browser fixture生成因底件没有styles.xml失败1次（390通过），已补合法styles部件/关系/ContentTypes；保留 `/tmp/mimir-r2b-server-final-20261017.log`。
5. **最终原R2a10+新2 Server文件：12文件391/391 PASS，exit0**，`/tmp/mimir-r2b-server-final-second-20261017.log`。这包括原325个场景及新增51纯规则/15真实host场景。
6. **共享parser提取的额外实际透视布局回归：1文件27/27 PASS，exit0**，`/tmp/mimir-r2b-pivot-parser-regression-20261017.log`。
7. Office首次新测试2个fixture预期错误已修正（隐藏来源F4实际“线上”，缺缓存要改实际hidden源而非另一表）；保留 `/tmp/mimir-r2b-office-scope-20261017.log`。最终 **8文件79/79 PASS，exit0**，包括原R2a3文件38项、DV/reader与pivot原有用例，`/tmp/mimir-r2b-office-final-20261017.log`。
8. **Server/Office frozen typecheck exit0**：`/tmp/mimir-r2b-server-types-frozen-20261017.log`、`/tmp/mimir-r2b-office-types-frozen-20261017.log`。早期新R3未接线helper暂态类型错误由其owner修复，不修改其文件。
9. **20个本片源/测试文件 scoped oxlint --deny-warnings PASS、oxfmt --check PASS**，`/tmp/mimir-r2b-lint-final-20261017.log`、`/tmp/mimir-r2b-format-check-20261017.log`；`git diff --check`本片触及tracked paths清。未跑完整suite/build，交root统一安排。

## 浏览器fixture与待验收

`/tmp/mimir-xlsx-range-rules-20261017.xlsx`，本次冻结生成SHA256 `5e1386f5126056457c70640a4101d1acb261850f46e340bf4a9ef3bf2c3b70ff`。源“数据”A1:B2为5/6/7/8；q:前缀CF dxf0绿色加粗及DV stop `>0`，带输入提示；目标表J10=11有原priority7规则。copy到跨表E5可见绿色加粗与原生DV；预计新priority8，原priority7保留。普通source/target字段沿原剪贴工具，无新UI。fixture测试会重新生成ZIP时间戳，root上传前应复制固定baseline，不可覆盖R2a旧baseline。

正式checker需特别核对：提取行为等价/依赖图、候选组合/跨表保护、覆盖permit不可伪造、prefix/CDATA/relative-list实际候选校验、priority与统计域、无新手动warning权限及预算。之后root做真实1280/420复制/移动/UndoRedo/save/reopen与ZIP未触entry精确保留。此处没有真实浏览器、OS剪贴互操作或Excel自身实测声明。

## R3交接

现planner默认CF+DV、同尺寸单rect；`validationAreas`为新DV目标和真实改依赖域，bindings为Server私有，不能从HTTP传。R3的CF-only与整数倍平铺必须从冻结源一次生成完整fragment集，最后一次assignPriorities/patch，不逐tile重读已改源或覆盖前一片候选。格式刷仍是scalar基础样式，不等于special paste format。notes继续原准确guard，不宣称上游native保存证明。
