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

属性类（CF/DV/命名范围/打印/冻结/迷你图）经同一宿主单项提交。CF默认追加保留原规则，清除扩展规则须拒绝；DV只替换/删除精确原范围，部分重叠拒绝。命名范围保留未改名称原XML，只管理普通工作簿级名称；只读快照须携带definedNames。打印设置只提交改动字段，不能因编辑纸张方向静默重置缩放或页边距。冻结写回pane且影响实际网格。CF使用有预算的安全条件解释器，无eval；色阶/数据条与迷你图从真实源值绘制。复杂条件公式无法求值时标注未支持。DV在单格、范围、清空及查找替换的写前/写后位置并集逐格校验，违规整批拒绝；添加规则时不拦截原件已有无效值。导入warning/info规则当前严格处理，尚未实现Excel的警告后继续交互，不得声称完全兼容。

55个固定DSL操作均已有执行入口，各参数及拒绝边界以任务矩阵为准。对象/结构化表/透视操作单项提交；无sheetId的edit_chart/edit_shape/delete_visual也要按对象所属表检查保护。表格结构插删实际影响整行/整列，至少保留一数据行和一列；计算列/汇总行复杂调整拒绝。透视输出拒绝覆盖现有内容、合并格、源区、其他透视、结构化表及数据验证；源公式无缓存拒绝。新增成员刷新须同步原生definition/cache与网格，不得只扩大location；自定义数值格式/总计/ext元数据、值行布局和已选报告筛选超出重建能力时拒绝，保留原件。

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

- `move_range`：原始单元格内容/类型/富文本/格式整体移动，可同表重叠或跨表；剪切内公式和全簿相对/绝对A1、完整包含的矩形范围引用、命名范围、图表数据引用随目标迁移。跨表移动公式的原同表外部引用须补原表限定。源及目标保护和被改引用表保护均核对。部分相交范围引用、共享/数组/溢出公式和与表格/透视/批注/合并/链接/规则相交的移动仍未齐，明确拒绝并保留原件；不以该拒绝宣称完整Excel剪切语义。不相交表格保留原字节。
- `copy_format` / `clear_format`：按原cellXfs索引复制完整基础样式，目标内容/公式保留；格式源取显式单元格、行、列的样式。单格目标按源矩形尺寸展开，多格目标重复源样式；菜单预览真实目标范围，越界或超过2000格拒绝，源/目标与合并范围相交时预拒绝。清除将目标设为默认样式，移除富文本字符覆盖与所选范围普通条件格式，规则的范围外部分保留；拆分后首个sqref锚点改变时同步平移各formula的相对引用，保留绝对引用、工作表限定和字符串，使未选单元格的规则含义不变。不清数据验证、语义链接或结构化表样式。自定义扩展CF局部清除拒绝。固定GenOffice/Univer 0.25.1格式刷只采集基础样式，不采集源多run字形；刷格式会移除目标字符覆盖，保持源富文本原XML。
- `auto_size`：浏览器canvas按实际字体测量当前解析显示文本，以整行/整列尺寸一次原子写回，最多500行或列；行高考虑换行和当前列宽。合并格不参与，结果受Excel行高/列宽上限限制；不承诺与Excel自身字体栅格化完全相同。
- `set_outline`：行列分组/取消一层/折叠/展开，保存outlineLevel、sheetFormatPr最大层级和summary collapsed；最多7层。预览读取真实层级/隐藏状态，列无显式width时也不能漏掉hidden。与已有筛选或复杂原件组合仍需独立验收。
- `flash_fill`：采用固定上游纯函数，左侧最多6列、前3个示例的原始值（非格式化显示值）推断拼接和固定文字，仅写空目标为inlineStr，已有值和公式原XML保持。选单格时从起点沿紧邻左列连续非空值向下探测，含起点最多1000行且不越过工作表尾；0和false是非空，遇空立即停止。显式范围最多2000格。不会把以`=`开头的输出转公式；未支持子串或大小写推断。四向填充共用原fill_range，等差序列按前两格数字生成。

手动剪切/格式刷源与当前不可变工作簿快照绑定；工作簿快照更新后需重选，提示说明文档已更新，不推断源范围本身发生变化；选区/表切换不使源失效。扩展使用具名320px短菜单，保留选中源和待应用反馈；完整对象编辑继续右侧Inspector。
