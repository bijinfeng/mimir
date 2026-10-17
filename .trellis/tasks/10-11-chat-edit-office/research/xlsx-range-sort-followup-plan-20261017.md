# XLSX 范围与多级排序后续计划

2026-10-17，root。续 `xlsx-preview-range-next-review-20261017.md`。研究/实施计划，未运行此片测试或浏览器；不计工具已齐。

## 具体可执行证据

- 固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，实际读取 `apps/sheets/src/renderer/ribbon-actions.ts:317–340`：手动copy/cut/paste和粘贴值/公式/格式/列宽/除边框格式调用实际Univer命令，不能用Agent scalar copy执行器代替手动全部语义。
- 同文件`:1463–1472`手动单列sort调用当前range.sort；`:1553–1579`自定义sort解析有序多个列+asc/desc并传 `sheet.command.sort-range` 的orderRules和hasTitle。因此**多级排序是固定版真实手动参数，Mimir当前只有单列升降序，属于确认缺口**。
- `op-executor.ts:990–1140` Agent copy携带v/t/s/f并平移相对公式；`:1358–1430`Agent sort值移动、目标格式保留且拒绝数据公式；domain/sort-range.ts共用稳定比较器。手动与Agent执行器并不相同，不据Agent拒绝公式推定手动也拒绝；不把Mimir现有原生rawcell保真/普通公式平移合同退化成scalar-only。
- 当前 `apps/server/src/services/xlsx-agent-data.ts::sort_range` 对任意merge/hyperlink/legacyDrawing/tableParts/CF/DV/autoFilter整表拒绝；`xlsx-agent-range.ts::assertCopyFeatures`已有普通ref/sqref相交判定，但copy的批注/表格仍整表拒绝，扩展规则也整表拒绝。`xlsx-manual-ops.ts`cut使用allowDisjointParts=true，还需核其额外ref guard，不能直接套用到copy。
- 当前 `XlsxDataControls.tsx` 是360px ToolbarMenu，单列字母输入+首行标题+升/降两个动作；新的多级排序应收敛到320px Inspector当前值/内部滚动/固定单一主动作，避免再追加一排按钮。
- WeKnora官网/公开源码检查沿同日固定v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`缓存及 `docx-protection-password-next-plan-20261017.md` 哈希证据，不声称本次重新联网。只借鉴真实能力门控，Office范围与视觉主依据仍固定GenOffice/现有紧凑Inspector。

## R1：只先解除已证明不相交结构的整表误禁

所有权：新server私有feature-intersection helper，xlsx-agent-data/range/manual-ops最小调用及native/host tests；不碰DV controller/确认token，待其独立check冻结后实施。

- 对源/目标实际矩形解析标准merge/hyperlink/CF/DV/filter ref/sqref；解当前sheet关系后读comments每个ref、table每个ref。解析须有界namespace-aware，作用域准确；外部/坏关系、坏引用、重复/未知扩展语义仍明确拒绝。只要存在需要解释但不可靠的结构，不通过猜零坐标放开。
- 普通结构与受影响source/target均不相交时允许copy/cut/sort，并证明featureXML、comments/table/关系/媒体/未知entry全部精确。仅换选区内cell，不迁移或改写不相交结构。不得按整行粗略相交而误禁同一行远列，但相关结构的实际范围必须完整读取。
- 任何相交复杂结构仍维持准确错误；本片不包含merge/link移动，不删除守卫来掩盖标量丢失，不冒称所有范围结构支持。公式、数组/溢出、外部link、表/透视/保护的现有边界保持真实证据。
- DV warning/info仍只能手动真实确认，Agent/range路径不可获得通用“忽略校验”开关。最终host以native当前规则再次核对，不能让新helper绕过DV。
- 2000cell预算及既有公式/样式/原生补丁行为保持；实际noop不增version/history。测试从旧整表拒绝先红后绿，证明每类不相交成功/相交失败/坏关系失败和一次原子发布。root后续生产范围选择、保存重开及UndoRedo所有ZIPentry；独立checker必需。

## S：多级手动排序

R1后独立片。私有严格manual-sort参数有序rules（列、asc/desc）、hasHeader，最多合理有限级数，重复列/范围外列明确校验；不改变固定公开Agent sort_range参数词表。统一排序内核按有序key逐个比较，全部相同稳定保留原行次序，空值两向末尾，原生数值/布尔/文本/错误/公式缓存遵守已有合同。

320px现有数据Inspector按模式只显示当前字段：动态添加/移除/调整级序，列从选区真实列供选，首行标题，单一固定“应用排序”；范围/页/版本改变失效或重置旧草稿。避免依赖自由文本列字母或用两个升降按钮同时执行。有界多级native/typed-key/stableties/空值/标题/公式与非目标字节测试，真实Editor单history/并发取消/保存UndoRedo、420×500及回焦。

## R2：相交结构迁移尚待精确研究

普通完全包含merge/hyperlink的copy/cut、目的冲突/跨sheet关系与批注/CF/DV复制需分别核手动Univer native保存链和真实fixture。当前仅确认命令存在，未证明完整OOXML迁移；不能以R1或S替代R2完成。V导入shape预览按另一计划独立实施，互不竞争文件。
