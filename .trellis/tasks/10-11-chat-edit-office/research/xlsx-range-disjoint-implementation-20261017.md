# XLSX R1 原生不相交结构放行实施

2026-10-17，正式 trellis-implement；已冻结，待独立 checker 与 root 生产浏览器验收。对应 `xlsx-range-sort-followup-plan-20261017.md` 的 R1。本片不代表全部工具完成；S 多级排序与 R2 相交结构迁移仍分别排期。

## 边界与依据

实际缺口位于 server 原生范围执行器：排序按整表是否存在结构拒绝；copy 对 comments/table 整表拒绝，而 move 依赖只读模型的部分锚点。已改为读取原生 XML 和真实关系，证明不相交才沿原写入器执行；没有移除相交或未知结构守卫。

沿 root 批准方案与固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的既有研究；未重新声称联网检索。WeKnora 同日官网/公开源码缓存为 v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`，官网 SHA `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`、定义 SHA `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`；仅借鉴真实能力门控，原生 Office 范围语义仍依据固定 GenOffice/原件合同。

## 文件与实现

- 新 `apps/server/src/services/xlsx-range-features.ts`：私有只读原件 guard，复用现有 `pivotXmlTree` 的 XML 验证/有序树，不复制解析器、不改 vendor。自行解析逐节点 namespace 作用域，不删除 prefix 后猜类型。解析前限制 UTF-8 4 MiB、200,000 元素、深度64；最初50,000节点会误禁20,000 inline-string格，已提升并以原生大工作表回归证明原存储格预算保持。
- `xlsx-agent-data.ts`：sort 只核实际移动的数据行矩形，首行标题不算移动区域；标准 merge/link/CF/DV/filter/comments/table 与该矩形不相交时允许。所有既有范围/保护/公式检查后，稳定顺序恒等返回原字节/原版本/空变更清单，不产生 calcPr 变动。
- `xlsx-agent-range.ts`：copy/fill 对 source 和实际 expanded target 都调用同一 guard；原2000格、公式平移/缓存、样式与补丁路径不变。convert_to_values 路径未扩大。
- `xlsx-manual-ops.ts`：move 对 source/target 调用同一 guard，保留既有 pivot/sparkline/保护与全簿引用重定向。在每个拥有表中解析标准 CF/DV 公式，只有确实将改写范围外规则引用时拒绝；字符串内 `A1`、无关引用不会误禁。不变表达式直接返回原 XML span，避免把 `&quot;` 等词法改写到未触及规则。
- `packages/office/src/agent/xlsx-agent.ts`：root 额外批准的最小 no-op 接缝。只接受原版本、逐字节相同、空 changedCells/touchedEntries、无新 recalculation 且不是重算请求的响应；返回 changed:false，保持当前 session/dirty/round/undo/redo。伪装同版本的字节/变化/重算声明全部仍拒绝。
- 新 `apps/server/src/test/xlsx-range-disjoint.test.ts`，以及 `xlsx-agent-host.test.ts` 错误类别断言同步；`packages/office/src/agent/xlsx-agent.test.ts` 加严格 identity 合同与伪造响应反例。

## 可放行与拒绝

标准 mergeCell.ref、hyperlink.ref、conditionalFormatting.sqref、dataValidation.sqref、autoFilter.ref 均检查每个真实矩形，包含同一行的远列不相交。comments 根据关系读真实 comment.ref，并核 VML Note 的 Row/Column 与 comment 一一对应；tableParts 根据真实关系读 table.ref/autoFilter.ref。source/target 跨表独立核验。

缺/坏/越界/重复引用、错误 scope/namespace、重复 count/锚点、坏/缺/外部 comments/table 关系、重复结构目标、未知顶层扩展/AlternateContent、threaded comments/控件关系、非 Note VML 或不匹配锚点拒绝。标准外部 HTTPS/mailto hyperlink 本身可在不相交时保留；不把外部表格关系当普通链接。sheetData 内原有不相关 row/cell opaque XML 沿既有原件合同保留，不把行里的普通未知 XML 当整表地址扩展。

任何相交关联结构继续准确拒绝；未做合并/链接/规则/批注/表格迁移。未新增 DV 忽略开关或修改确认 token；最后仍由现有宿主按当前 native DV 复核。未修改 toolbar/Inspector、shared schema、HTTP 鉴权、vendor 或其他 owner 文件。

## 测试与静态结果

- 原实现红：`/tmp/mimir-r1-red-20261017.log`，56项中49失败/7通过。明确功能红包括七类 disjoint sort 的旧整表拒绝，以及 comments/table copy 的旧整表拒绝。其他初版失败包含测试误把既有 workbook calcPr 更新也要求 exact；已将此断言精确调整为只归一既有 calcPr，不能把49项全部声称功能回归。
- 首轮修复119/119通过；扩展反例时新增 header-only comment 用例先红，核实际数据行后通过。
- **最终 server 5文件167/167，exit0**：`/tmp/mimir-r1-final-frozen-20261017.log`。包含七类 × copy/move/sort、跨表两侧、相交/坏ref/关系/VML/namespace/sqref后续矩形、范围外CF/DV引用影响、20,000 inline-string存储格，以及真实 current-canvas handle→native host 一次 publish/history、重复排序零publish/history、Undo/Redo全字节恢复。
- **Office agent 1文件15/15，exit0**：`/tmp/mimir-r1-office-target-20261017.log`；原有取消/重算/查找回归保持，新增 no-op 不清 redo/session/round 与五类伪造旧版本拒绝。
- **Server typecheck exit0**：`/tmp/mimir-r1-types-server-freeze-20261017.log`。
- Office typecheck **未全绿**：`/tmp/mimir-r1-types-office-freeze-20261017.log` 仅同时实施中的 `src/docx-forced-tracking.test.ts` 三处 TS2339（86 `.text`、115/126 `handle.version`）；无 R1 诊断，已告知 root，未改他人 DOCX 文件。
- 八个 owned源/测试文件 oxlint 无错误/警告、oxfmt check、限定 git diff --check 均 exit0。最终测试后仅改了未使用 callback 参数名以消除 no-shadow，不涉及行为。

ZIP证据针对每个非目录条目及受触及 worksheet 除 sheetData/dimension 的原始字符串；既有原生 writer 的 calcPr 标记变动单独归一后核其余 workbook XML。related comments/VML/table/relations 与 custom opaque entry 全字节精确。没有声称重新压缩的整个 ZIP 恒等；恒等 no-op 与完整历史恢复另有原 bytes 测试。

## 交给 root / checker

- 独立检查必须再审 namespace/relationship/范围与公式影响边界，并关注并行变更。
- root 统一全套/构建与真实浏览器范围选择、保存重开、Undo/Redo/420×500；本片没有生产浏览器结论。
- root 负责修改既有 editors/conventions.md 排序整表拒绝句，改为相交或元数据不可靠时拒绝、可证明不相交时保留；本片未抢改 shared dirty specs。
- 多级排序S、相交结构R2、全部Office工具总验收仍未完成。模型供应商与Desktop验收边界遵从用户选择；无真实模型调用声明。
- 本片没有暂存、提交、归档、上传或删除测试文档。

## 独立检查返工：sqref 依赖与命名空间保护（13:38 再冻结）

此补记取代前文对本片保护/规则依赖完整性的推断，但保留原有失败与修复历史。正式 checker 的 `xlsx-range-disjoint-check-20261017.md` 发现并保留5项真实红例，已按 root 派回正式实施阶段；本次不是 checker 直接代做算法。

### 改动

- 新 `apps/server/src/services/xlsx-rule-footprint.ts`：有界静态引用分析器。只验证小表达式语法并提取引用，不求值、不调用 eval；支持普通数值/字符串/布尔、静态函数白名单、括号/运算、A1单格/范围/整行/整列、相对/绝对/混合轴、正确拥有表与带转义单引号的限定表名。动态 OFFSET/INDIRECT/INDEX、未解析名称/结构化引用、外部工作簿（包括被单引号包裹的外链）、3D/隐式交集/溢出等复杂或坏语法明确拒绝，不能以未知当无依赖。
- CF/DV 按第一个 sqref 矩形左上格作为 anchor。对每个实际矩形，用两端点各轴的 affine offset 最小/最大值计算引用覆盖矩形，与移动 source 比较；多矩形独立处理，不按每个规则格展开。绝对轴不偏移，混合引用只移动相应轴；拥有表中的未限定引用不会误当 source 表。任何计算越界拒绝，不裁切掉未知依赖。
- 每公式≤32K字符/1024token/256ref/32层表达式、每拥有表≤200,000个 reference×sqref products；sqref保持≤20,000矩形。整张表或全列规则只耗一个矩形产品，不需遍历十亿个格。常量/不涉及 source 的普通静态公式仍可保留原 XML。
- `xlsx-range-features.ts::assertXlsxFeatureFormulaMoveSafe` 改接明确拥有/source表和原 source 矩形，调用上述覆盖范围证明；保留原有不变公式 XML span。此时 K2 对 A1 规则隐含的 B2 依赖也会准确拒绝。
- 同文件新增 namespace-aware `assertXlsxSheetWritable`，复用已有有界原生 XML 树。保持原有“存在 sheetProtection 即禁止写”的合同，不解释或清除任何 password/algorithm/许可参数；坏 scope/namespace 同样拒绝。
- data直接执行器在写前核目标；range执行器只核写 target，不禁止读取 protected source；manual执行器核目标，move另核会被清空的 source，实际被重定向公式的其他表也再次核原生保护。直接调用三个执行器同样拒绝，不能只靠路由/UI。只读复制源和格式源权限未扩大限制。
- 保留 checker 已落地的未知顶层 MAIN/外来 namespace 拒绝、完整注释/CDATA后再算深度、旧扩展错误断言修复；没有覆盖这些改动。

### 验证

- 重跑 checker 原始5红：`/tmp/mimir-r1-followup-red-20261017.log`，99项94通过/5失败，确认为两类原缺陷；未跳过或删除它们。
- 初次修复6文件184/184通过。随后补跨表受保护 source 测试另出现1项红，定位到新 guard 初始插入了只读格式源分支；已移至真实 move source 写入口，恢复只读格式源权限，再完整通过。
- **最终7文件233/233，exit0**：`/tmp/mimir-r1-followup-freeze-20261017.log`。文件为 range-disjoint、rule-footprint、agent-range、manual-ops、range-styles、agent-host、validation-host。覆盖原5红、相对/混合/绝对/范围/多矩形/跨表依赖、字符串伪引用、坏/动态/命名/外链公式、巨大sqref矩形预算、copy protected source允许/move拒绝、protected target、第三表真实依赖保护和三个原生执行器直接调用。
- Server、Office类型均 exit0：`/tmp/mimir-r1-followup-server-types-final-20261017.log`、`/tmp/mimir-r1-followup-office-types-final-20261017.log`。此前并行 DOCX TS 问题已由其 owner 解决，本次未改 DOCX。
- 本次7个 owned源/测试文件 oxlint无错误/警告、oxfmt check、限定diff check通过。最终233项测试之后仅将等价的非法表名字符检查拆成字符类+方括号includes以满足no-useless-escape，没有改变允许/拒绝集合。
- 现有Office strict no-op接缝本次未改；未追加Office重型套件。Server测试进程全程顺序，未再并发共享SQLite setup。

### 再交付

本片再次冻结，**必须正式独立 recheck 后才算 R1 可交 root 生产验收**。root仍拥有共享 spec 修订、全套/构建/浏览器；未运行任何fullbuild/browser，不声称S/R2或全部工具完成。此补片只触server新helper、上述三个执行器、原生专项测试及本报告；没有改Office UI、模型、密码 writer、DV确认token、vendor，没有暂存/提交/归档/上传/删测试件。
