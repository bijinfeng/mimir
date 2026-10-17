# XLSX S 多级手动排序实施边界

2026-10-17，正式 trellis-implement。当前实施中，待独立检查/root 浏览器。

最小缺口：手动数据菜单只有自由输入单列+两个方向动作。扩为选区真实列的1–8个有序唯一规则、首行标题；严格私有 `sort_range_multi`，不改固定公开 Agent `sort_range`。

行为所在地是server原生 data writer、shared手动operation schema、Editor持久Inspector。预期修改 shared/xlsx-agent.ts、server/xlsx-agent-data.ts/host.ts/manual-ops.ts（类型排除专用适配器）、Office XlsxDataControls.tsx/XlsxEditor.tsx/局部CSS及专项测试。原生写入器按既有 typed stable comparator 从末级到首级稳定排序，保持空值两向末尾，复用R1真实关联/namespace保护和2000格预算；无变化返回exact identity。移动格复用已有继承样式物化，避免落入目的行样式。宿主最终DV校验和警告确认权限保持。

界面沿现有320px Inspector，Editor body拥有草稿，Ribbon只持入口；当前模式字段、内部滚动、单一固定主动作、增删/升降级、源/表/范围/版本失效与取消。保留筛选/替换功能，无相关面板重设计。不实施R2关联结构迁移，不改vendor/public Agent词表/共享spec，不构建/全套/浏览器/上传/删件/暂存提交归档。

依据：实际读取固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的 ribbon-actions.ts:1553–1579，有序orderRules与hasTitle真实命令；比较合同沿其 domain/sort-range.ts 和Mimir原生保真扩展。WeKnora同日官方站点/公开源码缓存v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`，站点SHA `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`、definitions SHA `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`。仅适用真实能力门控，非Office排序/工具栏主要依据；本次无重新联网成功声明。

## 实施完成，冻结待独立检查

### 文件与行为

- `packages/shared/src/xlsx-agent.ts`：只新增本地 `xlsxManualSortSchema`/类型并加入现有手动union。`sort_range_multi {sheetId,range,rules:[{column,order}],hasHeader}`严格未知字段拒绝，1–8级、唯一大写列、asc/desc；实际列归属/2000格/Excel边界在执行器再次验证。没有改vendor公开Agent schema或工具描述；公开旧schema仍保持原有strip行为，不宣称它会拒绝所有额外字段。
- `apps/server/src/services/xlsx-agent-host.ts`：现有手动分流将新operation交原生data writer，保留鉴权、单项批次、ZIP preflight、signal与最终native DV复核。手动多级排序不能携带通用validationConsent/image或与其他op混批；未改确认token。
- `apps/server/src/services/xlsx-manual-ops.ts`：仅增加专用适配器排除，保持union narrowing；没有改move/R1算法。
- `apps/server/src/services/xlsx-agent-data.ts`：原单列sort与新多级共用原件写入器。按最后规则到第一规则使用固定vendor `computeSortedRowOrder` 的稳定typed comparator并复合index，最终全同保持原顺序；null空格两向末尾。显式空字符串缓存仍是文本，沿固定比较器，不谎称空字符串等同缺失格。普通原生数值/日期序号、布尔、文本/错误和公式缓存参与比较。原 `readBasicWorkbook` 对公式给`value:null`，现在排序键从原生v及t读取缓存，拒绝缺失/非法缓存，非key普通公式不要求缓存。保留普通相对公式平移、原rich/error/style XML；共享/数组/溢出仍拒绝。
- 移动格沿已有 `xlsxRangeStyles` / `materializeXlsxCellStyle`：只在来源有效样式与目的行列继承不同且缺显式s时物化，包含空格显式0；不把主题/富文本烘为显示值。行高/隐藏/其他行metadata保持目的行原XML。复用 `replaceCells`，支持已有隐式row身份与范围内空洞；恢复原dimension精确词法。合法prefixed sheetData/row/c/f/v等明确拒绝，不能被正则漏读后当空格。
- 沿R1 namespace-aware保护与完整原生关联范围守卫，含首行标题排除移动范围。相交/未知结构仍拒绝，未实施R2。稳定identity（包括合法自闭合空sheetData）返回原bytes/原version/空changedCells+touchedEntries，不改calcPr/history。真实改动沿原calcPr/旧calcChain清理路径。
- `packages/office/src/editors/XlsxDataControls.tsx` + 新 `xlsx-data-controls.css`：现有数据菜单收敛为320px既有Inspector；Editor body拥有，顶部当前范围/筛选与三任务tab，内部滚动、固定单一primary。排序列为选区真实列Select，最多8级、其他已用列禁选、增加/删除/上下调整、有标题开关。筛选/替换仍实际接原operation，按当前子任务只显示相关字段。pending禁用稿内控件，换任务/关闭/卸载取消，失败保留稿并显示真实错误。
- `packages/office/src/editors/XlsxEditor.tsx`：Ribbon只持有入口，body挂面板；key包含文档/表/范围/单调版本，source bytes另核identity；改变即清旧稿/abort，A→B→A不复活。写操作捕获handle/document/version/signal并沿原单事务handle，不复制history；关闭后优先当前可见入口，折叠回具名数据组。与已有对象/填充/剪贴板/验证Inspector互斥。没有修改Manage六文件。
- 新server `xlsx-multilevel-sort.test.ts`，新Office `XlsxDataControls.test.tsx`、`XlsxEditor.sort.test.tsx`。

### 门禁和证据

- 最终server **8文件260/260 PASS，exit0**：`/tmp/mimir-s-server-freeze.log`，包含R1既有241项与本片19项。排序优先级、asc/desc两向null末尾、同值稳定、标题/无标题、八级、严格拒绝/边界/预算、原生typed公式缓存、共享/溢出拒绝、不相交CF保留、prefixed保护/相交拒绝、DV无通用确认、单项批次、native全非目标ZIP保留均覆盖。
- 随后将typed fixture补为**合法原生两XF样式（含numFmt14日期）**，避免用悬空s索引冒称日期/继承验收；本片19/19再次PASS，`/tmp/mimir-s-native-final.log`。这次只增强测试fixture，生产代码未改。
- 最终Office **5文件111/111 PASS，exit0**：`/tmp/mimir-s-office-freeze.log`。含真实Editor native宿主单次publish/history，save→undo/save→redo/save全部非目录ZIP条目精确、重复排序原version/dirty/history保持；range/source/close/其他Inspector接管时abort且迟到原生结果不发布；组件规则增删/重排/唯一、当前模式、错误重试和live trigger回焦；相邻Editor、DV、strict no-op Agent回归保持。
- shared/server/Office/renderer types均exit0，日志 `/tmp/mimir-s-{shared,server,office,renderer}-types-final.log`。Renderer既有脚本重生成routeTree，无该文件Git变化。
- owned9个TS/TSX文件oxlint无任何错误/警告；owned10源/测试/CSS oxfmt check通过；样式守卫及限定git diff --check通过。Antd扫描DataControls `issues:[] / skipped:[] / partial:false`，`/tmp/mimir-s-antd.json`。
- 保留失败历史：初版server152项中7项为无必要s=0词法变更，改为只在继承不同物化后恢复；1项误假设vendor公开schema严格拒绝额外字段，改为验证原strip语义。最终邻接260首次259/260仅旧共享公式错误文案断言，恢复既有精确文案后全绿。Office初版使用happy-dom URL/空handle等待的测试工具问题均修复，不记为产品能力缺陷。

### root / checker 接续

生产文件与专项测试现冻结；需正式独立checker，root统一全套/生产构建/1280和420×500真实浏览器。局部代码测试不冒充浏览器截图或Excel互操作。未运行fullsuite/build/UI/真实模型/Desktop，已知bundled-skill整仓lint不重复。R2仍未完成。

提供本地合成浏览器fixture `/tmp/mimir-xlsx-multilevel-sort-20261017.xlsx`（未上传）：选A1:H8、标题开启，A升序→B升序→C升序，H的稳定原行标识预期为 原第5行→原第6行（稳定同值）→原第4行→原第2行→原第8行（空季度末尾）→原第3行→原第7行（空部门末尾）。J1:K2原生CF与customXml二进制用于非目标保留。可加至8级检查内滚/固定footer，再删/调级/切范围/Escape。用户已授权测试上传，但本agent没有执行任何上传或删除。

root拥有共享spec整合；建议在唯一XLSX合同记录私有手动多级参数、继承样式/typed cache与identity语义，不抢写共享dirty spec。无暂存、提交、归档或破坏性git操作；其他owner/vendor原dirty改动全部保留。

## 正式独立检查返工边界

checker报告 `xlsx-multilevel-sort-check-20261017.md` 保留三项native红：合法单引号类型误读、数值XML字符引用未先解码、静止行公式仍规范化。本次只改data writer的原生缓存类型读取/解码和实际移动格必要补丁，以及本片回归；不改比较器、R1 guard/依赖算法、UI或其他owner。继续复用已存在有界原件资格检查与XML树解析器，类型只读真实cell根属性；静止行仍先核普通公式资格，但不加入写入集合，整个原row XML保留。保留checker反例并补属性空白/伪属性文字、hex/boolean实体与静止行空洞/单双引号词法反例。生产浏览器/共享spec仍root负责。

### 独立检查返工完成，再次冻结

仅改 `apps/server/src/services/xlsx-agent-data.ts`、本片native test及本报告；checker的4个独立新增测试完整保留，未skip/弱化；Office/UI/R1算法/其他owner未改。

- 原生cache值先用既有 `decodeXlsxXml` 解码一次，再按真实c根属性t区分numeric/string/error/boolean，支持单双引号及等号周围空白。省略t才是默认numeric，显式空/未知t拒绝；字符串`001`等仍保留字符串身份，boolean字符引用正确识别。
- 属性读取最初试用既有 `pivotXmlTree(raw).attrs.t`，原3红变绿。新增更严字符引用/decoy反例发现 `fast-xml-parser@5.11.2` 默认会解`&amp;`而保留数字字符引用，因此不能在其结果上盲目再次decode（会双解码）。最终改为**已由原R1全XML验证通过后的私有c opening-tag属性lexer**：完整消费quoted值，准确根属性名匹配，接受quoted `>`/单双引号/空白，对原始属性值解码恰好一次。不会从其他属性里的`t='b'`或公式正文猜类型。`t='&#115;tr'`合法字符串类型可读，`t='&amp;#115;tr'`实际类型仍为字面`&#115;tr`，准确拒绝；未更改通用XML解析器或R1校验。
- `sourceRow===targetRow`仍先检查普通公式资格，随后整行不加入replacements；因此实际排序其他行时，静止行的原始公式实体、属性拼写、行标签单双引号/空白、已有空c与未存储空洞全部原样。实际移动行仍按原有必要公式平移/继承样式合同写回。

验证：

- 原checker23项（含3红）：**23/23 PASS**，`/tmp/mimir-s-return-native-initial.log`。
- 新增属性空白+quoted decoy/单次解码/hex数值与bool实体/显式空或未知类型拒绝、静止row完整词法与空洞：最终**Server8文件267/267 PASS，exit0**，`/tmp/mimir-s-return-server-freeze.log`（原R1241+本片26）。新增实体反例在使用pivotXmlTree属性候选时先红，最终私有lexer修复后全绿；失败历史`/tmp/mimir-s-return-server-final.log`保留。
- **Office5文件113/113 PASS，exit0**，`/tmp/mimir-s-return-office-final.log`。包括checker新增八级/16Select禁用/两层Escape，原真实Editor native保存历史与取消、相邻Editor/DV/strict Agent。产品UI此次没有改动。
- **Server/Office typecheck均exit0**，`/tmp/mimir-s-return-{server,office}-types-final.log`；root已确认E0 helper类型由其owner修复，此次未碰DOCX。命令期间pnpm因并行owner的新依赖触发已有lockfile安装补全；本片没有编辑package/lock文件。
- 两个owned TS文件oxlint零错误/警告、oxfmt check、限定git diff check均通过；`/tmp/mimir-s-return-lint-final.log`为空正常结果。未重复fullsuite/build/browser或其他无关门禁。

再次交正式独立recheck；root统一生产浏览器与共享spec。没有暂存、提交、归档、上传/删除测试文档，也不把本次返工标成S浏览器或R2完成。

## 第二次独立检查返工：原始引用单次解码

checker新增的 `t='&#x26;#115;tr'` 反例确认前段“恰好一次”结论不充分：共享 `decodeXlsxXml` 的hex→decimal连续替换会重扫替换产物。此次只改 `apps/server/src/services/xlsx-agent-data.ts`：新增sort私有 `decodeSortXml`，用单次全局匹配统一处理原始数字/五种命名XML引用，回调产生的文本不会再次扫描；只用于原始t属性和排序键公式缓存。`&#x26;#115;tr`和`&amp;#115;tr`均保持字面`&#115;tr`而准确拒绝，合法`&#115;tr`、decimal/hex数值与boolean继续通过。共享decoder、实际移动公式平移、R1与UI均未改；checker既有26项和非法类型loop全部保留，没有新增可选测试或弱化断言。

冻结验证（均已消费进程最终exit0）：

- 本片native **26/26 PASS**：`/tmp/mimir-s-single-pass-native-final.log`，含原3红、48行八级独立oracle和最新混合引用反例。
- Server/Office typecheck **均PASS**：`/tmp/mimir-s-single-pass-server-types.log`、`/tmp/mimir-s-single-pass-office-types.log`。
- writer及现有native test两文件oxlint零错误/警告、oxfmt check与限定git diff check均PASS：`/tmp/mimir-s-single-pass-lint.log`、`/tmp/mimir-s-single-pass-format.log`。本轮测试文件没有修改。
- 本轮未重跑先前267项server相邻套或113项Office套；未修改UI。上述旧轮结果保留原时间语义，不算本轮重复通过。未运行build/fullsuite/browser/Desktop/Excel互操作，也未上传、删除、暂存、提交或归档。

此次仅writer与本实施报告改变，重新冻结交独立检查；root继续负责生产浏览器与唯一共享spec整合。
