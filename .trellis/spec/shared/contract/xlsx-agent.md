# XLSX 范围编辑与显式公式重算合同

## 1. Scope / Trigger

适用于手动网格、工具栏与 Agent 共用的工作簿字节宿主。固定 GenOffice gateway 负责已接入操作的 OOXML 补丁；公式重算用独立 Node worker 运行官方 WASM，仅回写原件既有公式缓存。当前操作覆盖及两端实测以 XLSX 任务矩阵为准，不据此推断全部 DSL、完整网格或全部 Excel 函数已支持。

## 2. Signatures

- `POST /api/conversations/xlsx-agent/apply-ops`：multipart `file`、`documentId`、`expectedVersion`、JSON `ops`，可选 `action: 'apply_ops'|'recalculate_formulas'`。
- `XlsxHostRequest = { documentId, bytes: Uint8Array, expectedVersion, ops: unknown[], action?, signal? }`。
- `XlsxHostResult = { bytes, version, changedCells, touchedEntries, recalculation? }`。
- `XlsxRecalculation = { engine: 'ironcalc-wasm-xlsx', engineVersion: '0.9.0', formulaCount: number, warnings: string[] }`，共享定义位于 `packages/shared/src/xlsx-agent.ts`。
- 手动设备图片沿同一 multipart 请求传 `imageBlob`，客户端 `imageFile?: File` 转为宿主 `image?: { bytes: Uint8Array, mimeType: string }`；只允许单项 `add_image` 且 `path='upload'`。图片非空、上限 8 MiB、PNG/JPEG MIME 与真实签名必须一致，并由解码器校验。整请求预算是原件 50 MiB 加图片 8 MiB 加 multipart 1 MiB；模型不能借此读取本机路径。
- Agent 重算为 `propose_operations({operations: [], recalculate: true})`；手动“公式 → 重新计算”调用同一句柄。

## 3. Contracts

鉴权路由只接受当前用户可见的 XLSX 文档；上传的是当前未保存工作字节。`expectedVersion` 是客户端画布版本，不能冒充存储层跨客户端锁。宿主只生成新字节，不替代保存到库；执行器在异步完成时核对文档、句柄、signal 和版本，才发布画布、推进版本和 dirty。返回重算元数据随工具结果给模型，失败原因进入续轮。

范围复制/填充读取原始单元格XML，保留样式索引、类型与富文本，平移普通相对公式；筛选复制固定缓存值。`convert_to_values`只移除公式，保留缓存类型，无缓存拒绝。关联范围结构相交及共享/数组公式不得降级丢弃。

`set_hyperlink`、`set_note`、`protect_sheet`须单项提交。链接仅接受http/https/mailto/内部#地址；按单格修改既有范围超链接须拒绝。批注改写保留其他普通批注和作者；富文本/线程批注拒绝。无密码工作表保护可切换；密码保护不得移除；所有内容写操作须在宿主再次核对保护状态。

属性类（CF/DV/命名范围/打印/冻结/迷你图）经同一宿主单项提交。CF默认追加保留原规则，清除扩展规则须拒绝；DV只替换/删除精确原范围，部分重叠拒绝。命名范围保留未改名称原XML，只管理普通工作簿级名称；只读快照须携带definedNames。打印设置只提交改动字段，不能因编辑纸张方向静默重置缩放或页边距。冻结写回pane且影响实际网格。CF使用有预算的安全条件解释器，无eval；色阶/数据条与迷你图从真实源值绘制。复杂条件公式无法求值时标注未支持。DV在单格、范围、清空及查找替换的写前/写后位置并集逐格校验，违规整批拒绝；添加规则时不拦截原件已有无效值。原生 showErrorMessage=false 对已支持且可计算的规则允许无效输入；stop 拒绝，warning/information 仅当前格手动输入可显式确认。未知类型/样式/比较方式、无法可靠计算的公式和复杂结构继续拒绝，不能靠关闭错误提示绕过。

55个固定DSL操作均已有执行入口，各参数及拒绝边界以任务矩阵为准。对象/结构化表/透视操作单项提交；无sheetId的edit_chart/edit_shape/delete_visual也要按对象所属表检查保护。表格结构插删实际影响整行/整列，至少保留一数据行和一列；计算列/汇总行复杂调整拒绝。透视输出拒绝覆盖现有内容、合并格、同表源区、其他透视、结构化表及数据验证；源公式无缓存拒绝。新增成员刷新须同步原生definition/cache与网格，不得只扩大location；自定义数值格式/总计、未知ext元数据、值行布局和已选报告筛选超出重建能力时拒绝，保留原件。仅固定原生writer生成的唯一完整`{AIO-PIVOT-GROUPINGS}`扩展、合法且无附加键的分组JSON与解析定义逐字段一致时，可沿现有布局重建；其他XML或JSON元数据仍拒绝。该私有分组可在Mimir中刷新，在Excel自行刷新可能退回原始维度，不声称标准OOXML分组兼容。

手动透视Inspector按“字段／汇总／筛选”分区，内部滚动与固定单一应用入口。新建支持有序行列、多汇总值及显示方式/数值格式、日期或数值分组、标签或按汇总值筛选、报告筛选字段，沿单项`add_pivot`提交；有列字段时只允许一个汇总值。新建可从当前工作簿按持久ID选择来源表，输出固定当前表并只读回显名称；跨表坐标重叠允许，同表重叠仍拒绝。来源切换不写文档，保留名称、源范围和输出位置，重新提取行/汇总默认字段并清除旧列、报告筛选、分组和筛选规则。隐藏来源可见并标识，保护来源不可选且全宿主仍核来源与目标保护。现有透视从原生definition显示真实字段/聚合，刷新作用于当前表全部透视表。仅通过完整原生资格检查的 General/default 简单原件可显式“编辑布局”，经本地 strict `edit_pivot_layout` 单项提交有序行列与聚合值；它不是固定上游 DSL 新增的 `edit_pivot`，不得将缺少原生元数据的普通读取模型直接重建。名称、source/target/range、起点、pivot/cache/records路径和关系身份固定；浏览器只读AST与Server实际writer独立复核，复杂格式/分组/筛选/共享cache/依赖对象及未知结构保留只读并说明原因。输出只修改真实新旧区域并集，外角单元格文字/公式/样式必须精确保留；缓存沿固定writer清空records并标记recordCount0/refreshOnLoad1，不宣称Excel实测。编辑态只展示实际接受参数，取消为可见次动作且与唯一主应用同行，未变化不提交。报告筛选保存全部项，当前网格不提供报告筛选项选择。草稿绑定已发布快照及文档/表，源身份变化永久清空；关闭/切上下文须取消pending，失败保留草稿。复合Select显式禁用，同tick重复提交只执行一次，成功沿完整字节历史和手动保存。执行前按活工作簿核来源/目标ID与版本，父级不得覆盖来源ID；自身已接受发布用请求signal关联，保留来源/配置及成功状态，不能当外部变化取消自身。外部快照/当前输出/上下文变化仍单调取消旧请求，A→B→A不复活。

`history(): {undo:number,redo:number}`、`undo():Promise<boolean>`、`redo():Promise<boolean>`沿同一FIFO恢复完整工作簿字节、单调推进版本和重开会话。每方向最多50步及64MiB，保存记录实际字节基线；undo/redo比较该基线决定dirty，重做回已保存字节应为clean。新编辑清redo；手动历史恢复清除旧Agent轮次快照，整轮撤销也清普通历史，避免跨路径覆盖后续编辑。dispose丢弃历史并拒绝迟到结果。

`exportSheet('xlsx'|'csv',sheetId?)`等待FIFO并导出当前未保存单表的显示值；不带公式和格式，≤20000格。CSV使用UTF-8 BOM、引号转义及CRLF。`load_guide`含8份指南；`read_sheet_features`的对象元数据不返回SVG/图片字节，表格/透视/对象计入32K读取预算。以上完整实现不等于全部上游非DSL手动工具已齐。

普通操作默认 `apply_ops`，批次 1–50 项；重算必须独立提交且 `ops=[]`，普通写入不会隐式执行重算。范围工具、排序和工作表管理的补丁／画布合同另见 [编辑器规范](../../office/frontend/editors/conventions.md)。

重算读取官方引擎的原始 cell type，并从临时 `toXlsx()` 的 `t/v` 取缓存，交叉校验数值、字符串、布尔、错误与空串。源工作簿的公式、样式与未触及 ZIP 部件保留。不得把 formatted 文字当缓存，不得以引擎整体导出替代源工作簿。`formulaValues` 路径必须实际加载目标 sheet；固定上游 gateway 单传缓存时会跳过无 mutation 的 sheet，适配层通过空结构 journal 加载，仍由原网关写缓存。空串公式须保持 `t="str"` 和空 `<v>`。

预算为压缩 2 MiB、实际总解压 8 MiB、单部件 4 MiB、500 部件、20000 已存储格、2000 公式、单 worker、20 秒硬终止。取消同样终止真实计算；`resourceLimits` 只限制 JS 堆，不是 WASM 线性内存硬上限。部署时须从构建产物实际运行 worker 并解析包内 WASM 路径。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 未鉴权／文档不可见或格式不符 | 路由拒绝，不暴露写入结果 |
| 未接操作、无效范围、批次混入重算 | 执行前拒绝，保留当前字节 |
| 1904 日期系统 | 明确拒绝重算；网格日期预览仍应正确按 1904 显示 |
| shared/array/溢出、外链、引擎不支持函数、丢失缓存或类型不一致 | 不发布部分计算结果，保留原件和 dirty |
| 超预算／超时／取消／引擎忙 | 明确失败；真实 worker 终止或不启动 |
| 返回后人工编辑／切文档／句柄释放／版本冲突 | 丢弃旧结果，不覆盖新画布，不清 dirty |
| 保存失败或保存期间又有编辑 | 保留工作副本与新版本 dirty |

早期 1900 日期语义及全部 Excel 函数仍须逐项验证；成功重算一组公式不能作为完全兼容证据。

## 5. Good / Base / Bad Cases

- Good：A1=23、B1=`=A1*3+1` 旧缓存 999，重算为70；A1改50后再次重算为151，保存两次，独立读回公式和未触及 customXml 均保留。
- Base：普通修改保留源公式缓存，并向用户明确结果仍为缓存。
- Bad：把临时引擎输出直接保存，或把 `#N/A` 文本和公式错误合并为同一类型。

## 6. Tests Required

- `xlsx-recalc.test.ts`／`xlsx-agent-host.test.ts`：真实 WASM 类型缓存、两次计算、源公式及未触及部件、1904/外链/非法公式、预算与取消。
- `XlsxEditor.test.tsx`／`xlsx-agent.test.ts`：按钮与 Agent 同执行器、保存重开、版本冲突和轮次撤销。
- server 生产构建后调用真实 `dist/services/xlsx-recalc.js`，独立 ZIP/XML 解析结果；浏览器与桌面实际交互另记矩阵。

## 7. Wrong vs Correct

错误：`save(model.toXlsx())`，整体重建会破坏源工作簿未建模结构。

正确：引擎临时导出 → 核对原公式目标与原始类型 → `SheetFormulaValues` 补丁原件 → 验证未触及部件 → 客户端版本门控发布 → 用户保存。


## 本地手动扩展操作

固定上游55 DSL保持原样；本地工具栏扩展由`packages/shared/src/xlsx-agent.ts`的`xlsxManualOperationSchema`单独校验，沿同一apply-ops、FIFO、版本守卫、全字节历史和手动保存。每次单独提交，先校验保护、ZIP与范围预算，再写入；成功回执仅为“已应用”，保存状态由底部dirty负责。

- `move_range`：原始单元格内容/类型/富文本/格式整体移动，可同表重叠或跨表；剪切内公式和全簿相对/绝对A1、完整包含的矩形范围引用、命名范围、图表数据引用随目标迁移。跨表移动公式的原同表外部引用须补原表限定。源及目标保护和被改引用表保护均核对。普通完整包含的合并/链接及受支持CF/DV按下述原生范围迁移合同执行；部分合并/链接、部分相交公式范围、共享/数组/溢出及表格/透视/批注相交仍准确拒绝并保留原件。不相交表格保留原字节。
- `copy_format` / `clear_format`：按原cellXfs索引复制完整基础样式，目标内容/公式保留；格式源取显式单元格、行、列的样式。单格目标按源矩形尺寸展开，多格目标重复源样式；菜单预览真实目标范围，越界或超过2000格拒绝，源/目标与合并范围相交时预拒绝。清除将目标设为默认样式，移除富文本字符覆盖与所选范围普通条件格式，规则的范围外部分保留；拆分后首个sqref锚点改变时同步平移各formula的相对引用，保留绝对引用、工作表限定和字符串，使未选单元格的规则含义不变。不清数据验证、语义链接或结构化表样式。自定义扩展CF局部清除拒绝。固定GenOffice/Univer 0.25.1格式刷只采集基础样式，不采集源多run字形；刷格式会移除目标字符覆盖，保持源富文本原XML。
- `auto_size`：浏览器canvas按实际字体测量当前解析显示文本，以整行/整列尺寸一次原子写回，最多500行或列；行高考虑换行和当前列宽。合并格不参与，结果受Excel行高/列宽上限限制；不承诺与Excel自身字体栅格化完全相同。
- `set_outline`：行列分组/取消一层/折叠/展开，保存outlineLevel、sheetFormatPr最大层级和summary collapsed；最多7层。预览读取真实层级/隐藏状态，列无显式width时也不能漏掉hidden。与已有筛选或复杂原件组合仍需独立验收。
- `flash_fill`：采用固定上游纯函数，左侧最多6列、前3个示例的原始值（非格式化显示值）推断拼接和固定文字，仅写空目标为inlineStr，已有值和公式原XML保持。选单格时从起点沿紧邻左列连续非空值向下探测，含起点最多1000行且不越过工作表尾；0和false是非空，遇空立即停止。显式范围最多2000格。不会把以`=`开头的输出转公式；未支持子串或大小写推断。四向填充共用原fill_range，等差序列按前两格数字生成。

格式刷源与当前不可变工作簿快照绑定；工作簿快照更新后需重选，选区/表切换不使源失效。范围复制/剪切由下述 Editor-owned 剪贴板统一持有，不再另存一份剪切源。

## 结构化范围剪贴板与基础样式（2026-10-17）

### 1. Scope / Trigger

同一文档的普通矩形原生复制/剪切、受限外部HTML/plain导入，以及网格基础行列继承格式读取；不承诺任意Excel复杂关联结构迁移或OS互操作。

### 2. Signatures

`createXlsxClipboard()` 持有 `{documentId, handle, version, bytes, sheetId, range, kind, id, plain, html}`；内部提交 `handle.execute('propose_operations', {operations:[{op:'copy_range'|'move_range', sheetId:targetSheet, sourceSheetId, source, target:anchor}]}, {expectedVersion,signal})`。沿原apply-ops协议，不新增Agent DSL。

### 3. Contracts

- copy/cut只冻结，不改dirty/history；源跨表/范围变化保留，版本/文档/句柄/原件身份变更失效。一次paste一次原件事务与历史，成功消耗缓存并要求重新复制；失败保留源。关闭Inspector停止异步，grid Escape取消范围。
- 网格自身copy/cut/paste事件写/读HTML+plain，文字输入不被抢；只有匹配当前内存marker才走原生。已知失效marker拒绝，不猜plain相等、不静默降级剪切。
- 外部HTML单普通table、文字按literal（`=`不执行公式）、基础显式CSS；HTML/plain ≤1MiB、500行/100列/2000格，HTML解析深度24/15000节点、一次≤50操作。复杂格式明确报错，用户主动values-only才省略格式。plain沿既有标量/公式推断。
- 基础cellXfs索引为显式c.s（含0）→customFormat=1/true的row.s→column.style→0；最后带style的重叠列声明生效，width-only不清前值。显示补洞/稀疏行/对象补格也沿此规则；copy/fill/move物化目标索引，空洞显式0阻止目标继承，不烘焙主题/rich runs。
- 自有共享replaceCells识别省略row.r的previous+1身份及单双引号，触碰隐式行才补r；插入保持行序、dimension唯一并保留原范围。原生cellMap对单引号c.r仍明确拒绝；不据只读支持宣称所有writer已支持。

### 4. Validation & Error Matrix

| 条件 | 必须行为 |
| --- | --- |
| pending时切文档/原件身份（即使同版本）/目标，或新输入stage | abort旧操作，迟到结果不覆盖新草稿 |
| stale/未知内部marker、错handle/version、重复提交 | 拒绝，原件和历史不变 |
| 无Clipboard API/权限失败 | 如实提示；仅具名工作簿内粘贴可用缓存 |
| 不支持HTML/CSS、合并/多表/图片/链接、超预算 | 整批拒绝，不只写值或部分格式 |
| 保护/共享数组/结构关联等原host守卫 | 保持拒绝，cut不先copy再clear |

### 5. Good / Base / Bad Cases

Good：数据!A1:C3→目标!D8保留行列样式，跨表剪切迁移绝对引用，save/undo/redo全entry恢复。Base：HTML导出只表示网格已解析基础格式。Bad：将源缺s解释成0，或迟到读取覆盖用户新输入。

### 6. Tests Required

`xlsx-clipboard.test.ts`、`XlsxEditor.clipboard.test.tsx`覆盖原件历史、marker、取消/重载/新草稿、scope和原生事件；`xlsx-inherited-styles.test.ts`及server `xlsx-range-styles.test.ts`覆盖日期/空洞/overlap/implicit row/dimension与ZIP。真实浏览器1280/420检查320px滚动、固定主操作、可见导入标题、当前源目标和live焦点；模拟ClipboardEvent不能冒充真实浏览器或OS互操作。

### 7. Wrong vs Correct

错误：仅比版本，在同版本原件重载后让旧read恢复；只给非primary FileButton传aria label，界面出现空白按钮。正确：source identity也abort；显式可见图标/文字、短分区标题，关闭后从仍连接的Editor查找可见入口。

## 原生范围填充（2026-10-17）

- `format_range.format.fill` 保持固定 GenOffice DSL：`{pattern,fg,bg?}`（PATTERN_TYPES 全部18项，含solid）或 `{gradient:{type?:linear|path,angle?,left?,right?,top?,bottom?,stops}}`（2–10个 position/color）。颜色接受 #RRGGBB、主题 shorthand 和 theme/tint 对象；保存主题引用，不烘焙 RGB。
- 省略 fill 保留原件；`fill:null` 明确清除，写 fillId=0/applyFill=1 以阻止父 cellStyleXf 重新继承。相同操作 fill 优先于 fillColor；同批后一个 fillColor 可替换前一个 fill。字体等其他格式操作也须保留原有填充继承标记。
- 宿主原生序列化后由 `xlsx-fill-styles.ts` 从原 xf 派生，替换实际改动类别，保留 xfId/quotePrefix/pivotButton、保护、alignment 未改属性及未知扩展；仍执行 touched-entry inventory 检查，不扩大 ZIP 白名单。原生格式路径可按既有约定追加 workbook calcPr 重算标记。
- `read_formats` 的 `format.fill` 返回 spec、direct/inherited 来源、unsupported 提示。索引色/未知色型不可伪装成可编辑 RGB；原件 RGB 非零 tint 也标为 unsupported，因原生 DSL 仅能在主题引用上保留 tint，不可静默丢弃或烘焙。省略 fill 的其他格式操作须保留这类原 XML。CSS/SVG 预览只在显示边缘派生，不进入 Agent 数据。画布按 CF > 显式 rich fill > table 样式显示；清除填充可露出 table/CF 底色，不改这些层。
- 开始页紧凑“填充”入口打开320px Inspector；与对象 Inspector 互斥，窄栏保留32px画布上下文。Inspector与草稿持久挂在Editor body，不能由会随宽度折叠重挂的Ribbon分组拥有；宽窄切换保留同一面板、草稿和在途请求。Escape关闭后优先回当前填充入口，原入口已卸载则回可用的具名“格式”分组。表单内部滚动、底部Apply固定。显示当前/混合/继承值，支持任意HEX输入、主题及明暗、图案、线性角度、路径四边、2–10色标。无效色值阻止提交；失败保留草稿，切源/切范围/关闭/切对象面板取消在途请求，旧A→B→A草稿不复活。
- 代表性门禁：`xlsx-fill.test.ts`、`xlsx-fill-layers.test.ts`、`XlsxFillControls.test.tsx`、`XlsxEditor.fill.test.tsx`、server `xlsx-fill-host.test.ts`。原生ZIP独立读回，连续两次保存，历史撤销/重做后保存恢复完整条目，保护与非法参数整批拒绝。


## 原生数据验证列表与手动确认

- 数值/日期/时间/长度比较公式与 custom 使用同一有界解释器，按 sqref 首个范围左上格平移相对引用，绝对引用保持；被引用格若公式未缓存，须拒绝，不能把未知结果当空值或0通过验证。
- 原生读取 showErrorMessage/errorStyle/errorTitle/showInputMessage/promptTitle/prompt/showDropDown 及完整规则 XML；缺省布尔为 false。OOXML showDropDown=true 表示隐藏下拉，UI 显示开关须反转。只读和无操作导出不重写规则。
- 网格当前格提供列表入口、Alt+Down、方向/Home/End、Enter/Space、Escape/Tab 与鼠标选择；选项写原始标量，`001`、`=A1` 不经公式或数值推断。输入提示只按原生开关展示，不进入 dirty/history。下拉与宿主共用有界 resolver：inline、普通单行/列范围、带引号工作表（双单引号转义）、正确本地/全局作用域名称。最多2000项/32K文字，名称最多8层；重复/hidden 名称、外链/复杂公式、合并来源和未缓存公式拒绝。隐藏工作表可作为只读来源，仍逐格核验缓存/合并和预算。
- `validationConsent?: {intent:'manual_cell',token?:uuid}` 是宿主执行 options 与 HTTP multipart 独立字段，不能从模型 operation 参数提取。鉴权路由提供可信 principal；Agent 和批量请求遇需确认时整体拒绝，不获得 token。首个手动无效值返回409 `XLSX_VALIDATION_CONFIRMATION`，details.validationWarning 含有界 title/message/style/address 与 opaque token；客户端用共享错误类型区分。
- token 服务端内存最多128个、有效5分钟、单次消费。绑定 principal/documentId/源字节SHA256/expectedVersion/精确单项 set_cell/全部当前规则和重新计算结果；确认时宿主重新计算，任一 stop/unknown 拒绝，不发布部分结果。客户端另冻结源身份/句柄/版本/格/稿及交互上下文，换格/改稿/保存/换工具/撤销/切文档单调取消，A→B→A不复活。无确认和取消零版本/dirty/history。宿主只生成工作字节，原件仍需手动保存。
- 本地单项 `edit_validation_options {sheetId,ruleXml,options}` 仅更新唯一可映射原件规则的上述提示与下拉属性；原约束/公式/其他属性和所有非目标 ZIP 部件保持。未知/扩展、保护、过期 raw XML、无改动均拒绝。320px Inspector 内部滚动、唯一固定主动作；版本变化取消旧草稿，成功后显示新的原生当前值。
- 代表验证为 xlsx-validation-list、实际 XlsxEditor.validation、xlsx-validation-host、xlsx-validation-route 和 renderer xlsx-validation-api；不据此宣称全部 Excel 数据验证公式或复杂工作簿完全兼容。


## 普通范围 CF/DV 原生迁移（R2b，2026-10-17）

### 1. Scope / Trigger

仅无筛选 `copy_range` 和本地 `move_range` 的同尺寸单矩形（≤2000格）；与 R2a 合并/链接一起形成单候选。`fill_range`、筛选复制、排序不取得该许可；特殊粘贴仅依下节模式/平铺合同取得选择性的原生许可。规则作用域可为整列，以矩形运算处理，不能展开百万格。

### 2. Signatures

私有 `planXlsxRangeRules(request, readers) → {replacements, validationAreas, permit}`；`candidateBases?:ReadonlyMap<entry,xml>` 仅叠加合并/链接候选，先证明冻结规则原字节未改。`bindXlsxRangeValidation(actualBytes,plan,target)` 在 WeakMap 绑定实际候选字节，不进入 HTTP 或 Agent schema。共有纯XML读取在 Office `xlsx-native-xml.ts`，Server `xlsx-range-structures.ts` 和旧 `pivotXmlTree` 路径兼容重导出；浏览器禁用 Buffer。

### 3. Contracts

- 从冻结源取规则真实交集；目标覆盖扣除旧作用域，move还扣源。首个sqref改变时重锚相对/混合引用，绝对引用保留。move一次迁移全簿规则依赖，CF formula、formula-CFVO@val、DV formula1/2均覆盖。单元格全簿搬移仅再次处理 `f`，不能再处理已迁移的规则公式。
- CF保留dxf实际身份、stop、标量阈值/颜色与源相对次序；新规则priority全表唯一稳定，保留规则只在分片冲突需要时顺推priority。统计规则域不能因依赖分片而改变统计意义。
- DV保留原生提示、错误和下拉标志；只重写实际sqref、公式与count。host在实际候选验证所有新DV目标（含值未变及空格），以及真正改变依赖的区外已有值；不重验语义未变的旧无效值或渲染新补出的空占位。缺少公式缓存拒绝。warning/information沿旧合同，copy/move不能取得手动单格确认权限。
- 浏览器/host从同一QName/CDATA/单次实体解码读取规则；列表按被验证格与首sqref的差平移相对引用，保留 `$`。简单跨表条件引用经有界解释器读取实际依赖格，缺表或未缓存拒绝。

### 4. Validation & Error Matrix

| 条件 | 必须行为 |
| --- | --- |
| 未知扩展/命名空间、属性/阈值、重复priority或重叠DV | 准确拒绝，零发布 |
| 每规则>512矩形、总分片>8192、规则>4096、运算>200000 | 预拒绝，不枚举整列 |
| 部分公式范围依赖、与源相交的整行/列公式引用、无法等价拆分的统计域 | 说明无法表达，原件不变 |
| 源/目标或被改第三表已保护 | 保持原写保护；未改copy来源可只读 |
| 区外第三表有未建模顶层/扩展结构 | 保留原top-level guard，不能因规则permit绕过 |

### 5. Good / Base / Bad Cases

Good：A1:B2的前缀CF/DV连同完整merge/link复制到跨表E5:F6，画布实际规则可读，保存重开及单步Undo/Redo恢复完整字节。Base：有界普通公式可迁移；动态/复杂规则准确拒绝。Bad：旧值0保持0就跳过新 `>5` 验证，或重锚后再次全局改规则，导致目标依赖搬两次。

### 6. Tests Required

`xlsx-range-rules` 覆盖矩形集合、anchor、CFVO、priority、dxf、分片与预算；`xlsx-range-rules-host` 用真实ZIP证明原子组合、实际新DV、前缀/CDATA、relative list、保护及历史/重开；原R2a10文件与3 Office文件保留全部场景，旧CF/DV保护样本按新合同换成精确迁移或未知/无效拒绝断言。`xlsx-range-rule-reading` 核验共有读取/跨表缓存与渲染；纯XML提取还需透视资格回归。root另做真实1280/420浏览器、保存原件与ZIP清单验证。

### 7. Wrong vs Correct

错误：逐tile重新读取已改源、串行覆盖规则候选，或只验证changedCells。正确：冻结源矩形 → 一次矩形/依赖规划 → 与结构候选组合 → native reread → 实际候选DV校验 → 原版本/取消合同发布一次。


## 选择性粘贴 R3（2026-10-17）

### 1. Scope / Trigger

私有手动 `paste_range {sheetId,sourceSheetId,source,target,kind,mode}` 使用严格 schema；未知字段/模式拒绝。公开固定 Agent DSL 不变。普通 A1 矩形最多2000格；单格目标按源展开，行列分别为源整数倍的矩形真正平铺。原子规划冻结源，只生成一次宿主候选、版本及历史；失败/取消/过期零发表。

### 2. Mode contract

| mode | 内容 | 格式/合并 | CF | DV/链接 |
| --- | --- | --- | --- | --- |
| all | 原生源常量/公式，按tile偏移 | 源 | 源 | 源 |
| value | 源实际缓存/类型，去公式 | 保留目标 | 保留目标 | 保留目标 |
| formula | 平移源公式，同时粘贴常量与空值 | 保留目标 | 保留目标 | 保留目标 |
| format | 保留目标值/公式/富文本正文 | 源基础格式与合并 | 源 | 保留目标 |
| column-width | 不写正文 | 只赋非固定默认的源列宽 | 保留目标 | 保留目标 |
| besides-border | 源原生内容 | 源格式/合并，保留目标有效边框 | 源 | 源 |

画布对sharedStrings与inlineStr的实际`t`元素读取XML字符数据：普通实体只解码一次、CDATA按字面字符、注释省略，保留空白；元素边界复用native token迭代，CDATA中的伪`t`/`si`标签不得改变边界或共享索引。显示文本不能反写覆盖源rich runs或原始CDATA/实体tokens。

值模式缺真实公式缓存拒绝，不能把公式或格式化显示文案冒充缓存；数字、布尔、错误与字符串类型保留。固定官方hook先后顺序使 value 对非公式目标保留源rich runs，但替换公式目标时降为plain；formula模式rich常量降plain。format只换base style，保留目标正文/runs。样式按显式格→行→列有效继承物化；besides按target cellStyleXfs/applyBorder解析有效border，仅追加必要xf，其他样式/主题/扩展原字节保留。

列宽沿固定Univer0.25.1规则：默认88px对应native `(88-5)/7` 字符单位；宽度0或固定默认不赋值，实际workbook自定义defaultColWidth可复制。按源列周期重复，目标hidden列跳过，span只切分width/min/max/customWidth，保留style/outline等列属性。源/目标区间查找各有2,000,000工作预算，不能按百万行枚举。

### 3. Structures / rules / validation

复用 R2a/R2b 唯一 native reader、writer 与源XML/entry/range绑定的私有permit。结构planner独立验证完整、有序、无重复的tile覆盖；只对模式许可的merge/link做迁移。规则planner选择CF/DV种类，不选中的规则原文保留；一个源规则跨全部tile仍为一个规则身份和多sqref作用域，不能拆成独立统计域。首sqref anchor和公式相对性、priority、dxf及提示参数沿R2b合同。所有tile一次组合，不能逐tile串行改源或发布候选。

宿主最终仍验证实际新DV及依赖域，包括没变化的目标值、空格和未缓存公式；showErrorMessage=false也不能把未知缓存当有效。原保护、未知结构/公式与预算守卫保留；未写的受保护跨表来源可只读copy，实际目标/同表写必须可写。same-source的`all`/`format`/`besides-border`及实际重复无变化保持原字节、版本及历史。

### 4. Clipboard / interaction / errors

mode和来源选择只属准备状态；pending时不能改mode，单一固定底部“粘贴”执行。CUT仅all走原真实move、同尺寸、不平铺；特殊CUT禁用并说明先复制，不猜测清源。外部内容只支持all/value，其他模式准确要求工作簿内来源。stale/陌生marker始终拒绝，不以所选value自动降级；外部values-only必须来源明确。

320px Inspector在内部范围之后显示模式及短说明，外部内容随后；内部滚动、footer固定、短高度/窄屏保留入口。Escape尊重已处理的最近弹层事件，再关闭面板并回可见入口。复制、选择mode与来源不产生dirty或历史；一次平铺只记录一次Undo，保存/Undo/Redo保持全部entry。

### 5. Tests required / limits

`xlsx-special-paste`/`xlsx-special-paste-host`涵盖六模式真实ZIP矩阵、富文本/cache/继承边框、平铺CF/DV身份、overlap、hidden/default/zero列宽、完整tile验证、same-source与重复no-op、原生保护和真实handle历史。Office clipboard与真实Editor联合宿主验证mode准备零dirty、一次操作平铺、全bytes Undo/Redo/save及busy/stale/取消。保留R2a/R2b原回归，另由root执行1280×800/420×500真实浏览器与独立检查；这些测试不证明全部Excel复杂公式或外部OS剪贴板兼容。
