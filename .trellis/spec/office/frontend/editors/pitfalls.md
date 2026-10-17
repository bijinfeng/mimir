# 会静默出错的地方

### DOCX 保护必须拦截原生 DOM 预览和对象入口

PM `filterTransaction` 拒绝修改仍挡不住 vendor 图片缩放/浮动拖动先改 DOM 的预览，也挡不住公式独立按钮发送编辑事件。保护层须在这些实际入口前阻断，原生编辑按钮同步禁用并解释原因，嵌套文本框标记只读。普通文字 mousedown、copy 和双击选词保留浏览器默认行为；只拦截 NodeView 激活，不能用全局 preventDefault 牺牲选取复制。回归须同时检查真实 DOM 手势中/结束的样式、PM、版本和 dirty，不能只看保存字节。建议只读明确继续后重新查询当前挂载控件，确认可编辑状态恢复。

：保存与编辑

这几类问题**不报错**，只在你以为没问题的时候悄悄地错。改编辑器前先扫一遍。


| 症状 | 原因 |
|---|---|
| 改了字但格式没了（或文件里别的东西被重排） | 补丁式保存退化成整体重建。pptx 靠**元素锚点**（未改动的元素用 `anchor.originalXml` 原样回填，见 `packages/office/src/pptx-save.ts`），docx 靠**块比对**。`pptx-save.test.ts` / `docx.test.ts` 各有断言守着「只有该变的条目变」 |
| 第二次保存把第一次的改动回滚 | pptx 的 `save()` 成功后必须 `commit()`——否则下次拼字节时干净元素回填的是**旧**字节，而两次保存都报成功 |
| pptx 编辑后画布不更新 | 编辑是就地改模型的，`slides()` 返回同一个数组，React 的 `useMemo` 依赖它不会重算。要用 `view()` 的**不可变快照**当依赖 |
| pptx 点画布没反应 | 渲染的 SVG 少了 `data-element-id`（事件代理靠它把点击映射回模型元素）。漏掉是静默的——看着像「这个元素不能编辑」 |
| PPTX 打印偶发缺图，画布却显示正常 | 内联 SVG 的 `<image>` 不在 `HTMLDocument.images` 集合中；打印前除字体与 HTML 图片外，还须读取 SVG image href 并等待解码。取消/解码失败不得继续 `print()`，回归见 `pptx-output-complete.test.ts`。 |
| 部分 pptx 的字逐字竖排并挤到画布外 | 原件里的文本框缺几何信息，不能把零宽框交给文字布局；在渲染层按画布尺寸补默认框并说明原因，不回写原件（补丁式保存要求打开文件不改变 OOXML） |
| **pptx 插字继承了错误字形** | 零宽插入不能按相交区间判断；普通 run 边界沿前字、软换行后沿后字，替换继承替换所在来源；整段重写才沿 dominantRun。重复字符串无法仅凭公共前后缀确定落点，原生 beforeinput/keydown 需提供验证过的原选区。`pptx-text-range.test.ts`、组件及 Editor 测试覆盖段尾/段首/边界/软换行/重复文字、IME与版本。 |
| 改了 A1，D7 也跟着变 | xlsx 的**共享字符串**被就地改写了（`<c t="s"><v>17</v></c>` 里的 17 被多个格子共用）。新文本必须写成内联字符串（`packages/office/src/xlsx-edit.ts`） |
| XLSX 某部门变空白、数据落到前面的空格，透视合计随之失真 | `<row/>`、`<c/>`、`<si/>` 须在开标签处先区分自闭合和成对元素，不能让成对分支吞掉后项的关闭标签。共享字符串空项须原序占索引，不能统计后补到末尾；空行也推进隐式行号，空格推进隐式列号。`xlsx.test.ts` 覆盖三种空白写法和省略坐标，`xlsx-pivot-grouping-refresh.test.ts` 用真实 inline/shared 源验证部门470/440、总计910及刷新。 |
| 改完格子又变回旧值 | xlsx 的公式格：只换了 `<v>` 而留着 `<f>`，Excel 打开时按公式重算。覆盖时必须连 `<f>` 一起清 |
| XLSX 保存期间又编辑，旧保存完成后新改动却显示“已保存” | `flush()` 取得的是那一刻的字节；等待宿主写盘期间画布仍可编辑。保存成功后只有句柄与版本仍匹配，才能 `markSaved()` 和清除 dirty。`XlsxEditor.test.tsx` 用延迟写盘覆盖这条竞态 |
| xlsx 新写的格跑到行首 | 插入位置要按**列号**比，而列号要从 `r="A5"` 里只取列字母。我们的预览按 `r` 定位所以照常显示，而 Excel 要求 `<c>` 按列升序 |
| 表格里改列宽，越改越离谱 | 单元格的 `colwidth` 属性存的是 **px**（解析 `convert.ts:930` 写入、保存 `:1236` 自己 ×15 换回 twips），而输入框说的是 twips——读要过 `pxToTwips`、写要过 `twipsToPx`（`DocxEditor.tsx`），漏掉任何一次就是「每次编辑把列宽放大 15 倍，重开显示又缩小 15 倍」 |
| 段落样式换了级别，重开又变回去 | Tiptap 的 `setNode` 会把没点名的属性原样带过去（`attributesToCopy`）——换样式必须显式 `styleId: null`，否则文件里的 `w:pStyle` 还是旧样式（`generate.ts:1742` 优先写它） |
| 格式刷点上去反而把格式抹掉 | 源选区起点正好压在格式区间起点上时，`$from.marks()` 返回**前一个节点**的 marks（实测为空）——要取**选区区间里第一个文本节点**的 marks |
| docx 点字号增减后文件里出现 `w:sz w:val="NaN"` | 文字没有直接字号时 `sizeHalfPoints` 是 `undefined`（继承段落样式）；增减按钮须禁用并说明原因，不能对它做算术，也不能用“点了不动”兜底 |
| 选了「1.5 倍行距」但画布和文件都没变 | `lineRule='exact'` 优先于倍数；改倍数时同时清掉 `lineRule` 和 `lineRawTwips` |
| 清除格式后标题的对齐仍在，或分页符消失 | 段落格式须分别更新 `docParagraph` / `docHeading` / `docListItem`；但 `pageBreakBefore` 是分页符本身，绝不能清掉 |
| 格式刷把链接、批注或修订也刷掉 | `tr.removeMark(from, to)` 不给 markType 会清除区间所有标记；只逐类搬运允许的字符格式 |
| DOCX 选中段落开头的文字后「添加批注」误报跨段 | 浏览器选区可能从段落边界起算，按 `from >= blockStart + 1` 判定会拒绝实际只含一个段落文字的选区。按各顶层段落与选区的**文字重叠**确定唯一目标；跨段都有文字时拒绝，重复锚点仍须拒绝。`docx-toolbar-render.test.tsx` 覆盖段落边界与跨段两种情况。 |
| DOCX 撤销批注后画布标记消失，保存重开却还留批注 | `add_comment` 同时写 ProseMirror mark 和 `SaveOptions.comments`；编辑器撤销只回滚 mark。保存前用当前 mark ID 清理本次新增且已无锚点的批注及回复，保留原件已有批注；测试覆盖首次保存、撤销、再次保存及重开。 |
| 超长脚注续页在节尾尾注前倒序 | 相同锚点的 PM 等 side widget、以及尾注内反复 prepend/range.insertNode 都会反转顺序。前者使用独立有序 side，后者按同一 offset 的尾节点 after 追加；必须分别测两条路径和真实 DOM 视觉顺序，不能用 PM 单测替代尾注内插入验收。 |
| 改了单元格、保存也成功，界面上还是旧值 | `setCell` 只改了 XML 没改内存模型，而界面读模型（`view()`）。文件是对的，所以只有对着界面看才发现（TECH §15.7） |
| **深色下 docx 里作者写的文字颜色不可见（黑压黑）** | 上游的「深色纸张」机制是「编辑器发 `--dk-*` 孪生值 + CSS 在 `.page-dark` 子树里切过去」，而**两组规则都被裁剪脚本静默丢掉**：① 消费规则包在 `@media screen {}` 里，判据看选择器文本、`@media` 不匹配任何保留前缀 → 整块扔；② `--docs-paper-*` 变量块的选择器就叫 `:root`，判据却在**选择器**上找 `--docs-`（那些名字在**声明体**里）→ 变量定义也全扔。修法是判据读声明体 + 对 `@media` 递归过滤内部规则 + `.page-dark` 整组保留，**并在生成脚本里加自检**（`.page-dark` / `--docs-paper-ink` / `--canvas` 缺一即抛错，并写明症状）。宿主侧还要按外观挂类（`EditorProps.appearance` → docx 在深色时给滚动容器加 `page-dark`，D-096） |
| 中文 PDF 整段文字空白（不是乱码） | pdf.js 的 cmaps 没加载到。它按**原始文件名**取（`cmaps/Adobe-GB1-0.bcmap`），所以两端构建都须把资产原样复制到各自的 `public/pdfjs/`；带哈希的产物目录里没有这些名字，404 后内容就是空白（TECH §15.12） |
| PDF 写入批注后工具栏跳回“开始”，Agent 版本回到初始值或本轮撤销失效 | `useParsed(currentBytes)` 对新字节短暂返回 null，卸载工具栏并使 ready=false，导致 Agent handle dispose/recreate。宿主返回后已经 `readPdfPages` 核验的工作字节必须把同字节 `structure` 一起放进 `PdfWorkingBytes`；渲染优先取它，保存、插字重放和 undo 快照也须携带结构。不能用旧字节的结构兜底，或只控制 toolbar 分类来掩盖句柄重建。组件须断言分类、handle 对象身份、版本单调及成功 undoRound 都保留。 |
| PDF 界面全白且无报错 | 并发渲染。第一版用「取消上一次」防并发，而 StrictMode 挂载两次会让两次都没画。要用**代次**（`src/editors/pdf-render.ts`） |
| PDF 插字首次成功，移动或改宽度后永久忙碌，关闭面板也无法恢复 | 插字底稿不再等于当前工作字节，若被 viewer 缓存回收，已销毁的 pdf.js transport 的 getPage 可能永不结算。viewer 保留活动 pending.base；尚未发布的物化/批次字节用独立引用计数 pin，finally 释放，不覆盖 viewer keep 或保留全部历史。load/getPage 等待可按请求取消，但不能销毁其他持有者的任务；加载失败也须销毁自身 loading task，旧任务完成/失败不能覆盖同字节新任务。回归使用真实缓存与原生 Editor 保存/history，另以可控 transport 验证取消和释放竞争。 |
| 预览过一次之后保存的 PDF 是 0 字节 | `getDocument` 把字节 transfer 给 worker 了。要传 `bytes.slice()` |
| PDF 页面改动后表单、书签或标题丢失 | `copyPages` 只搬页对象，不搬文档级 Catalog/Info。标准 Info 字段要显式复制；Catalog 有额外结构或 Info 有自定义字段时先拒绝写回，并让界面解释原因（TECH §15.12） |
| PDF 高亮纵向压扁，或缩放后画面变形 | 高亮纸层与 canvas 的 CSS 盒必须同尺寸：纸层不要被 flex stretch；页面不要用 `max-width: 100%` 单独夹宽度，放大时让工作台横向滚动 |
| PDF 放大后左侧内容滚不到 | `justify-content: center` 会裁掉溢出方向的起始边；用子项 `margin-inline: auto` 居中 |
| 窄窗口下 PDF 工具条右端消失 | 编辑器是 flex 子项，默认 `min-width: auto` 会被宽画布撑住；外壳要有 `min-width: 0`，`overflow: clip` 不能替代 |
| 窄窗口下 PPTX/PDF 标题或正文被缩略图挡住 | `ThumbnailSidebar` 在容器 ≤650px 时把 164px 侧栏绝对定位到画布上；若初始状态仍是展开，打开文档就会覆盖页面左侧。默认用 `auto`：宽容器显示侧栏，窄容器隐藏并保留展开按钮。显式展开后选页恢复 `auto`，否则遮挡会一直留在画布上。要在约 588px 的真实 Electron 窗口检查两种格式的默认页、展开及选页，不能只看 DOM 里有缩略图。 |
| HTML 切到预览再回来，中间改的内容丢了 | 视图切换不能条件渲染源码编辑器：卸载会丢 CodeMirror 实例与历史，重挂只读打开时的 `initialText`；两个栏位始终挂载，只切 `hidden` |
| HTML 的 `hidden` 属性看似无效 | 作者样式里的 `display: flex` 胜过浏览器默认的 `[hidden]`；用 `.mimir-html-split > [hidden] { display: none }` 明确覆盖 |
| HTML 放大后变成手机布局 | `zoom` 会缩小内部布局尺寸；宿主宽度要用 `calc(100% * var(--html-preview-zoom))` 补偿，并设 `flex: none` |
| HTML 尺寸显示当前值，直接应用却报缺少单位，或把百分比布局固化成像素 | 固定上游检视脚本的计算尺寸快照会剥掉 `px`。宿主显示时补回单位；未编辑的计算尺寸提交须保持原件，不能把计算像素覆盖作者的 `%`、`auto` 或样式表规则。用数字快照配百分比原件验证首次应用与修改后保存。 |

## XLSX 无选区也必须能打开工具分类

范围工具在未选格或输入非法A1时仍会渲染。不要用按钮disabled和事件闭包中的`bounds!`代替空值处理：浏览器编译优化后的路径可能提前读取闭包所需边界，导致切到数据/布局分类即崩溃。先以可选读取生成安全标量，再构造事件参数；操作按钮根据同一范围校验禁用。回归须包含未选区、空输入、非法文字及越界A1直接打开各分类/子面板。

## Inspector 源数据回环不能复活旧草稿

`draft.sourceKey === currentSourceKey ? draft.value : source` 只能隐藏失效草稿。PDF 绘图蓝色 A → 手动改红 B → 应用保存 → undo 回到 A 时，旧草稿的 A key 会再次匹配，使面板显示 B，而保存字节正确是 A。源身份改变时须永久清空对应草稿；同源数据重新读取则保留尚未应用的输入，不按对象引用变化清草稿。

PPTX 表格 Inspector 用持久对象 ID 保留分类和所选行列，文字/样式草稿与数值输入另绑定会话的单调版本，版本变化即永久清除。异步提交成功仅清理该次提交的草稿，不能清掉新版本的输入；不要靠按版本重挂整个面板来处理草稿，否则每次操作都会跳回内容分类。

## PPTX 宿主提交与保存不得交错

位置尺寸字段每次用当前快照构造完整 `setTransform.box`；宿主未完成就连续提交，会让后一次旧框覆盖先前已改的坐标。手动写操作与保存共用同步 ref 门控，覆盖宿主执行、回传解析和保存 commit 全程；等待期间禁用位置尺寸及保存/历史操作并说明原因。同一 tick 早于禁用渲染的重复触发必须明确拒绝，不能静默吞掉，也不能自动排队重放旧框。成功后从新快照读取其余几何，失败则解锁并保留原文档。

真实 Editor 的连续动画测试须等待动画数已发布、面板 aria-busy=false 且保存解锁，再操作下一步；只有轮询次数上限却耗尽后静默返回的 settle 不算完成屏障。`PptxEditor.test.tsx` 用第二次真实宿主结果的可控 gate，独立读出两个原生动画，验证接受前仍显示一个且禁用保存、切到时间线不取消结果，放行后再验证重排/删除和保存重开。避免用随机延迟或取消原生断言掩盖这类测试同步错误。

回归见 `PdfEditor.local.test.tsx`：真实输入改色、应用、保存、undo/save、redo/save，分别断言面板颜色与独立文件缓存一致；同时覆盖同源刷新保留草稿、A→B→A 不复活颜色/宽度、选中对象 ID 和精确几何保留。只测源变化一次或只读保存文件都不能发现此问题。


## PPTX 放映回焦和无改动结果

放映入口必须显式传真实启动按钮 ref：`ToolbarButton` 为保留选区可能阻止鼠标默认聚焦，不能靠 `document.activeElement` 推断本次来源。退出只在焦点仍在放映或 BODY 时恢复；来源卸载则回 Inspector/原分组/当前 Tab，保留用户已主动移动到外部的焦点。`PptxShowControls.test.tsx` 与 `PptxEditor.extended-tools.test.tsx` 覆盖输入框仍聚焦时启动、来源消失和外部焦点。

`runManualTool` 的 `ok:true,changed:false` 是成功且未修改；不得创建对应的新对象撤销 round。复杂背景重复应用全部的原件字节、版本、dirty 和历史须保持，测试见 `PptxEditor.fill-host.test.tsx` 的 no-op 专项。


### PPTX 宿主重解析后的选区身份

宿主应用操作会替换解析模型并重新分配volatile element.id；文字选区若以该ID作targetKey，即使成功后更新version也会丢失，下次段落动作可能退到整框。选区身份须用documentId+原生slide path+elementDurableId并独立绑定version。已接受成功的操作会因新版控件卸载而abort旧controller，不能把这次cleanup当成此前操作取消；只在宿主接受前用signal守卫，成功后按同文档/目标/版本重绑范围。用户换目标/版本期间的迟到请求仍须由活句柄拒绝。

`PptxApply(op):Promise<boolean>` 的提交前目标校验不能取消已经等待宿主的写入：关闭 Inspector、切页或换选中对象不一定推进文档版本。Editor 须把每次请求的 AbortController 绑定到解析 session、documentId、页、首次持久目标别名和 Inspector 身份，沿 `execute(...,{expectedVersion,signal})` 传入活句柄；对应上下文离开即 abort，并在原生字节提交前拒绝迟到结果。清理只能取消该上下文拥有的请求，不能取消后继请求；新版本接受后旧控件卸载不反转成功事实。`PptxEditor.extended-tools.test.tsx` 用真实宿主生成的迟到字节验证关闭/换页/换目标均不产生版本、dirty或历史，另验证正常裁切/轮廓保存与撤销重做。

### 拖绘提交的自有忙状态

形状Canvas以disabled变化卸载旧gesture时，不能把自己提交所设的manualBusy再次传成外部disabled，否则会在真实异步宿主返回前abort自己的signal。外部忙态与本次提交所有权必须区分，并用真实Editor慢宿主回归核对接受/取消/一次history；单控件mock不足以验证此接缝。


### Antd 复合输入需要显式禁用

`fieldset disabled` 只覆盖原生表单后代，不能禁用 Antd Select 的 div 触发入口。Inspector提交处理中除fieldset外，还须向每个Select等复合组件传入同一disabled状态；回归应点击触发入口验证不能打开弹层，不能只断言fieldset属性。


#### 首次写入和未发布版本的额外边界

仅使用每轮重新计算的elementDurableId还不够：原件没有creationId时，首次原生写入ensureCreationId会把e_cNvPr别名升级为GUID。选择状态应存source+documentId+slidePath+首次elementRef，并通过matchesElementRef解析当前元素；该次选择的key、目标和成功守卫继续使用首次别名。选中对象删除后撤销不能复活已失效的文字范围。

session.view().slides()闭包会暴露原地替换后的数组，宿主重解析完成但accepted onChange尚未发布时，React也可能刷新。控件版本须使用afterEdit已发布的view/version，避免提前清范围或卸载面板abort。不要缓存依赖旧runtime element.id的editable数组；选中文字直接从当前持久目标读取。真实未预处理Agenda、已有GUID、强制中间渲染、延迟select与pending换目标回归见PptxEditor.selection-tools.test.tsx。


保存成功的session.commit()同样推进revision。原version未变、同handle/活动页/稳定目标且仍是原range state时，将选区和pendingFormat一起迁到commit新version，允许保存后继续局部编辑；保存失败、并发版本变化和换目标时不重绑旧范围。只测连续apply而不测试apply→save→再apply会漏掉此退化。


对象列表的 Shift 范围锚点与待恢复焦点也须通过首次别名解析当前行，不能直接比较每轮重算的 GUID。组内文字编辑的成员和父组合 key 同样保留原别名；组合成员文字须先连续输入本地草稿，明确应用时按原件 run 映射提交一次；不能每个字符都禁用并等待宿主，否则快速输入会丢字。接受后按实际文字迁移原光标，避免 applyOps resolve 早于新版本发布时移到末尾；用户已移到外部输入时不得抢焦点。回归见 PptxSelectionControls.test.tsx 与 PptxEditor.multi-selection.test.tsx 的旧 cNvPr 原件、连续输入和保存后再编辑。框选的 Escape 在捕获阶段取消手势并拦截后续 click，防止编辑画布的 Escape 清空原选择；lostpointercapture 与外部 pointercancel 均结束手势。

新增批注是页级追加草稿，Inspector body key 绑定 documentId 与原生 slide path，不随接受版本或保存 commit 重挂；同页元数据刷新须保留尚未提交的文字。成功添加只清本次草稿，待 fieldset 解锁后仅在焦点仍在自身或 BODY 时回到 textarea，用户已聚焦外部时不得抢回。打开和 Escape 返回使用实际启动按钮或快捷键来源。回归见 PptxEditor.multi-selection.test.tsx 的连续添加、保存保留草稿和异步外部焦点用例。

### PPTX 线条不能参与形状填充

原生 line/straight/bent/curved connector 可以接受 XML gradFill，但解析模型不会暴露其不可见填充。不能因此把它们算入混合填充或再次编辑的目标。UI 当前值、数量、格式操作和 manual-fill 宿主共同使用 `pptxSupportsShapeFill`；宿主须在整个选择验证完成后才写入，混入线条时原子拒绝。组合样式仍可修改线条轮廓，仅选线条时不能禁用整个外观分类；填充区域解释原因，组合样式和轮廓保持可达。回归见 `PptxSelectionControls.test.tsx`、`pptx-selection-fill.test.ts` 与 server `pptx-selection-fill-host.test.ts`。

### PPTX 接受剪切后先发布剪贴板引用

成功剪切本身会推进版本、清空选择并卸载旧面板。Editor须在这些状态更新前调用 `publishPptxClipboardResult` 保存宿主接受的引用；不能只让旧控件在 await 后发布，否则它已被自身成功结果取消，用户无法粘贴。未接受的迟到复制/剪切/粘贴仍须拒绝，不能用此成功顺序绕过版本或上下文守卫。粘贴分支先回选宿主返回的新 `elementRefs`，再处理其他操作的 `slideIndex` 导航。`PptxEditor.selection-clipboard.test.tsx` 以真实宿主字节验证成功历史与关闭、换目标、换页、换源、并发版本的迟到结果；同一 executor 的动画样式和母版调用没有 clipboard options 或 slide 参数，须保持兼容。

### HTML 用户确认也必须能停止

`ask_clarification` 与 `plan_page` 的用户问答/提纲确认需接收本轮可选signal。Editor停止时立即resolve取消并关闭仅属于该请求的面板；完成/替换/卸载均清理abort监听，旧请求不能关闭后继面板，旧session迟到规划不能重开确认。Handle每次await答案、规划、确认后复查signal与开始版本，再返回成功或调用writeDocument。仅在execute入口查signal会导致停止后仍返回成功或继续调用写作服务。回归见 `HtmlEditor.test.tsx` 的真实挂载Stop/后继请求/换文档与 `agent/html-agent.test.ts` 的deferred确认。问题ID是任意字符串，读取选择对象须使用Object.hasOwn，防止constructor/__proto__/toString意外命中继承属性。

### DOCX 表格条件预览与原生增量

解析的单元格 fill/color/bold 可能来自条件样式，不能把切换 tblLook 后的显示值写成直接格式。`DocxTableDesignPreview` 用局部视图 CSS 计算实时条件；`docxTableSavePlan` 在行列/合并结构不变时沿原生文本保存计划，只补实际变化的 tblPr、grid/tcW、底纹与边框，保留原件段落、vMerge 继续格、对角线及未改属性。结构变化继续走既有生成路径，不能把结构稳定测试的未知 XML 保真结论扩展过去。回归见 `docx-table-design.test.ts` 的原生保存、合并、条件样式与两次保存/history。

### PDF 画布草稿的命中几何和数值编辑

已有绘图拖移后尚未应用时，命中层必须跟随草稿几何；否则用户只能在旧位置继续拖。轻点同一对象不能清掉其待应用草稿。独立数值新建/已提交对象编辑收在具名折叠区域，明确它不修改当前画布草稿，不能让默认矩形尺寸冒充自由笔当前值。绘图模式先物化 pending 页面几何，且纸面渲染身份匹配后才挂可交互层；本次提交自身的 busy 不得取消本次请求。回归见 `PdfEditor.drawing-canvas.test.tsx` 的连续拖移、折叠入口、四旋转/A5/CropBox、延迟渲染和慢宿主。

### DOCX 引用的来源、字段与范围

手动引用使用 `DocxReferencesExtension` 的运行时根属性 `mimirReferenceSources`；来源和新 CITATION 必须在同一 PM transaction 中写入，不能另存 React 状态而脱离正文 history/dirty/version。保存由 `docxReferenceSaveOptions` 转为原生 bibliography customXml；编辑已知字段时只补对应子元素，不能重建整个来源而丢掉 DOI、多作者或其他未建模信息。源属性为 null 时保留会话原件，撤销后保存同样能移除本轮新建的 customXml 部件。

目录更新仅替换能完整识别的保护字段，忽略段落 pPr 内的制表位但识别正文的 tab/文本；域外文字、嵌入对象、书签/批注或不完整字段必须拒绝，不能吞掉旁边内容。目录/索引原生页码由 Word 更新；UI 不填虚假页码。NodeSelection 的段后插入边界取 `$from.index(0)`，其 `$to` 已位于下一个块，误用会把图片题注插到下一段后。回归见 `docx-references.test.ts` 与 `DocxReferencesControls.test.tsx` 的原生保存、完整 entry 历史、超链接目录及图片选择。
