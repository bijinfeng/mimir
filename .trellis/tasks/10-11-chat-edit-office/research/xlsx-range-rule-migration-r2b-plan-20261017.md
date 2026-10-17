# XLSX R2b：普通范围 CF/DV 迁移最小实施计划

2026-10-17 root，承接已批准全部工具范围；需R2a正式冻结后开始，不以算法测试绿替代浏览器或全工具完成。原计划 `xlsx-range-structure-migration-plan-20261017.md` 仍有效。本片只普通单矩形copy/move规则迁移，特殊粘贴另R3；批注普通复制/native保存尚无固定上游证据，维持准确保护而不猜测实现。

## 依据与实际接缝

固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的save journal明确收cfStates/dvStates；官方Univer0.25.1缓存 `/tmp/mimir-univer-r2-review-20261017` 的CF/DV clipboard hooks见原R2计划。WeKnora沿同日已固定官网/公开源v0.8.3、commit `3e22822c1d2397be730c458c7539d0eb8c113a24`及原计划两份SHA，只作为KB/Agent能力门控依据，无新HTTP或Office语义声称。

最小缺口在服务端原生范围planner与R1许可；当前只搬cell/merge/link，`xlsx-range-features.ts`对相交CF/DV拒绝、`assertXlsxFeatureFormulaMoveSafe`保护区外规则引用。`xlsx-manual-ops.ts`有clear_format矩形差与formula重锚，但该局部regex不能直接作通用XML迁移器。复用私有有界XML/字符数据、公式token解析和已有native规则语义；不要复制另一套宽泛innerXML解码。

## 边界与文件

新增私有 `xlsx-range-rules.ts` /专项tests；必要 `xlsx-range-structures.ts` 私有planner组合、range-features permit、agent-range/manual-ops入口、rule-footprint受影响公式接缝及验证host最小后置接缝。所有其他结构仍按现有原生guard。不得改vendor、排序内核、UI确认controller、公开Agent词表；如需公共schema变更应回报root另R3。2000操作格限制维持，但整列规则不能展开逐格。

1. 用有界rectangle交/差/平移/确定性归并；规则sqref的区外部分原生保留，目标覆盖只删相交区，cut也去源相交区；同表重叠从冻结快照一次规划，源清除不误删目标新规则。多rect上限、输出碎片上限和运算预算明确，超限修改前准确拒绝。
2. 源规则仅真实复制交集：CF或DV的原first sqref anchor移到交集first，再平移到目标；保留源剩余规则anchor变化需等价重锚。相对/混合/绝对引用逐token处理，双引号字符串不改，XML普通实体一次decode、CDATA语义正确。CF formula与formula类型CFVO@val、DV formula1/formula2皆覆盖。普通目标语义用固定上游实际行为证明，跨表引用保留原依赖时准确限定，不能模糊移错表。
3. CF类型仅现有可验证普通原生集合；保留dxfId同工作簿身份、stopIfTrue与原相对次序，新复制规则priority全表唯一且稳定。未受影响规则不无故重新格式化；如唯一priority必须重编号，变化许可限实际priority属性、给出逐字节之外的精确属性证明。不能丢失公式/颜色/阈值/未知字段后报成功；未知扩展精确拒绝。
4. DV保留type/operator/allowBlank/showInputMessage/showErrorMessage/errorStyle/promptTitle/prompt/errorTitle/error/showDropDown以及现有明确支持属性；source与target已存在的规则按照覆盖矩形切分，更新真实count。未知/歧义/重叠DV、外链或不支持公式准确拒绝。不能把copy/move自动获得任意用户绕过校验的权限。
5. Move影响区外依赖公式，需复用既有真实引用迁移并在规则语义上正确重锚，不能取消R1 footprint后直接放行。写后验证用实际候选新规则与实际输出值/cache；新DV不满足数据时沿现有严格host/确认合同，失败整个批次零发布。规则复制允许哪类warning信息必须有明确执行合同与现有Editor确认。
6. 原子组合cell/merge/link/rules一次candidate与mutation inventory；native reread验证来源/目标规则、实际关系、优先级及所有值，allowedEntries仅实际变更sheet/style（通常不需style新增）/existinggatewaycalc部件。noop原件身份、单history/版本，source/version/abort迟到照旧。

## 证明

先红后绿：同表/跨表copy与move、overlap、源和目的部分多rect切分、firstanchor改变、混合绝对公式/文字转义/CDATA、CFVO、priority/dxf/stop、DV全部显示开关与message、真实写后不合法零发布、超限/未知XML/保护与其他结构拒绝、未操作XML原样、noop/history/UndoRedo/save。复用严格已有native报告，不删guard断言只换样本满足准确新边界。Server测试全局串行，dualDB E1S重型用例先等其释放。正式独立checker后root统一build与1280×800/420×500真实剪贴/保存/重开，全ZIP目标外精确保留。
