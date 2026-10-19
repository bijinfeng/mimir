# Research: Markdown 编辑器全部既有交互清单

- Query: 当前 MarkdownEditor、InlineToolbar、NoteLinkPicker、MarkdownWritingPreview、EditorShell、Ribbon 与 Markdown CSS 有哪些页面、状态和交互，如何逐项验收而不改业务语义？
- Scope: mixed；Mimir 源码盘点为主，固定上游与官方文档用于解释参考边界
- Date: 2026-10-20

## Findings

### 范围、证据与读法

本清单是**源码证据**，尚未运行浏览器，不能把下述待验项写成已观察到的视觉缺陷。每个 MD ID 是稳定交互要求，可在 gallery/coverage 中加主题、尺寸或状态后缀，不要重排编号。代码行号以 `source-inventory-hashes.json` 的快照为准；实施后按符号追踪。没有把静态按钮存在等同于命令可用、保存成功或焦点正确。

主入口是 renderer 的 `NoteEditor`，它传真实方言/主题/正文排版、保存/图片/改写/属性/导出宿主服务。Office 包没有独立叫 Ribbon 的组件：**本地 Ribbon 就是 MarkdownToolbar → CompactToolbar**。`packages/office/vendor` 只固定文件引擎闭包，不含上游 Markdown Ribbon；不要手改 vendor 或新增一套平行工具栏。

源码缩写（均相对仓库根目录）：

| 缩写 | 文件及职责 |
| --- | --- |
| E | `packages/office/src/editors/MarkdownEditor.tsx`：编辑器、自动保存、工具栏、正文建议与专用面板 |
| C | `packages/office/src/editors/CompactToolbar.tsx`：六格式共享 Ribbon、分类、宽度测量、具名折叠菜单 |
| S | `packages/office/src/shell/EditorShell.tsx`：六格式共享壳与控件、就地弹层、查找替换 |
| I | `packages/office/src/editors/InlineToolbar.tsx`：Markdown 文本选区 AI 工具栏 |
| N | `packages/office/src/editors/NoteLinkPicker.tsx`：`[[` 候选及链接面板共用候选行 |
| W | `packages/office/src/editors/MarkdownWritingPreview.tsx`：同一 Agent 句柄的流式草稿与部分保留 |
| H | `packages/renderer/src/components/NoteEditor.tsx`：真实 IO 适配与未保存守卫接线 |
| L | `packages/office/src/editors/note-links.ts`：稳定 ID 内链匹配/写入 |
| X | `packages/office/src/editors/markdown-slash.ts`：方言门控、过滤、Slash 命令 |
| F | `packages/office/src/editors/markdown-format.ts`：样式/表格/链接/列表命令与状态 |
| T | `packages/renderer/src/components/ContentTypography.style.ts`：只读与编辑共用正文排版 |
| M | `packages/renderer/src/editor/math-block.ts`：公式 NodeView |
| D | `packages/renderer/src/editor/diagram-code-block.ts`：图表代码 NodeView |

通用键盘/关闭合同：

- **K1** 普通按钮：Tab 可达、Enter/Space 激活，鼠标按下保留编辑选区（S:342–399）。不能把 disabled 提示丢掉。
- **K2** ToolbarMenu：打开后面板获焦；↑↓循环启用菜单项，Home/End 到首尾；输入/数字/Select 的方向键归控件；Escape 只关闭最近层并回触发器；外部 pointer/滚动/resize 关闭且不主动抢焦。renderPanel 内 Tab 遍历控件，边缘退出关闭（S:1309–1400、1569–1715）。嵌套分类菜单必须实测一层层退出。
- **K3** 正文：真实 Tiptap 方言快捷键、输入规则和 undo history，不另实现文档状态；工具条显示的是订阅选区状态（E:1057；renderer editor spec）。
- **K4** 提示型异步：mock 仅可替换宿主 IO Promise/服务；真实组件、文档模型与事件必须运行。所有模拟结果应在归档注明，不得宣称文件/数据库/模型已验。

### 页面、外壳、Ribbon 与保存

| ID | 入口与必覆盖状态 | 键盘、关闭/恢复与行为证据 | 源码/所有权 |
| --- | --- | --- | --- |
| MD-001 | 现有笔记打开：唯一标题/元信息在正文前，编辑正文居中，正文后元信息保持 | K3；初始正文只读一次，保存回声不覆盖光标；换 documentId 换实例 | E:515–528、540–643、989–998；H:19–31、226–255；Markdown 专属/宿主槽共享 |
| MD-002 | 新建空笔记：Placeholder、正文大片空白可点击，首次焦点到末尾 | focusOnReady 一次消费；不要每次刷新抢焦 | E:780–784；renderer `extensions.ts:42–44`；`editors.css:365–405` |
| MD-003 | 宽列/窄中栏、AI 侧栏开闭、短高、浅/深主题、200% 缩放 | 正文内部纵滚；工具栏/查找区不遮正文；不得整页横溢 | S:189–234；`editors.css:360–405`；共享壳+note 专属 |
| MD-004 | 带 bodySide 的大纲与正文两栏、正文滚到末尾 | bodySide 是宿主注入、绝对浮层；保留原大纲行为，不能按不存在的内部 state 造 UI | S:215–222；E:914；host DocumentPanel 已是前一模块范围 |
| MD-005 | 编辑器尚未 ready 的快捷区 | 保存/历史保留占位与明确 disabled；没有实例不能执行 | E:1063–1087 |
| MD-006 | 默认开始/插入/笔记/审阅分类，当前 Tab | ←→循环、Home/End；active roving tabIndex；换分类清空命令区横滚位置 | E:1152–1160；C:55–89、183–204；共享 |
| MD-007 | 可用命令直接展示；窄列逐组具名折叠；再窄才命令区局部滚 | 44–72px 实际宽度预算；六组末组可达；K2 保留同一组命令 | C:91–130、208–245；`compact-toolbar.css:176–226`；共享 |
| MD-008 | 具名折叠组中再次打开段落/链接/表格/属性弹层 | K2；关闭内层先回内层 live 入口，不能把所有层一次关闭或标题裁掉 | C:225–234；S:1358–1373、1600–1643；共享 |
| MD-009 | 文档刚打开/无改动；即时保存不可点，状态字数可见 | K1；禁用原因不是按钮名；保存状态由宿主另接，不伪造成功 | E:867–883、927–935、1005–1010 |
| MD-010 | 输入后 pending、防抖900ms、saving、saved | 连续输入延迟写；真实请求过程中继续编辑要串行保存新版本 | E:174、624–635、700–735；H:112–126；真实 IO |
| MD-011 | 保存失败：长错误、重试、再次失败、最终恢复 | 失败保 dirty，点击文字动作真实重试；优先于动作错误；不能挤掉字数/动作 | E:717–720、844–857；H:119–122 |
| MD-012 | 图片/导出失败：状态行关闭；和保存失败并存时优先级 | K1；点关闭只清 actionError，不清保存失败、dirty | E:453–456、844–857 |
| MD-013 | 保存中再编辑、离开/切文档/刷新 | 原 beforeunload 与宿主 UnsavedGuard；保存并离开只认真实 Promise<boolean>，失败不离开 | E:700–735、774–801；H:84–103；守卫视觉非本组件 |
| MD-014 | Undo/Redo：空历史、编辑后可撤销、redo恢复 | K1/K3；真实文档/dirty/单事务语义，工具条位置不随分类移动 | E:1127–1148 |
| MD-015 | 字数：空文、长文、模型写入、undo后同步 | 订阅 live doc.textContent.length，不取保存正文缓存 | E:1004–1010 |

### 开始分类：格式、列表、链接

| ID | 入口与必覆盖状态 | 键盘、关闭/恢复与行为证据 | 源码/所有权 |
| --- | --- | --- | --- |
| MD-016 | 段落样式：正文/H1–H6/引用/代码块九种；混合选区 | K2；当前值/勾选跟光标；方言关闭的节点或标题级别不出现 | E:285–312、1100–1107、1235–1250 |
| MD-017 | 加粗/倾斜：关/开、跨选区、缺 mark禁用 | K1/K3；通过真实 toggleMark 命令，选择同步 active | E:1255–1282 |
| MD-018 | 下划线/删除线/行内代码：开关与方言禁用 | K1/K3；下划线 tooltip 仍说明 `++文字++` 非GFM | E:1285–1324 |
| MD-019 | 清除格式：光标/无格式禁用、选中格式可用 | K1；只清 marks，不改整篇块结构；可undo | E:1325–1340 |
| MD-020 | 项目列表/编号列表：当前种类、切换、普通段落 | K1/K3；不隐藏现有节点可用命令 | E:1367–1414 |
| MD-021 | 任务列表：整张转换、checkbox状态、嵌套禁用说明 | K1/K3；不能退成只改当前一项；宿主 taskItem nested=true | E:1396–1409；renderer `extensions.ts:40–41` |
| MD-022 | 减少/增加缩进：非列表、首项/最外层、可缩进任务/普通列表 | K1；正确节点名，理由分别清晰；真实undo | E:1120–1123、1417–1440 |
| MD-023 | 链接触发器：选中文字、空光标、已有链接；外部面板打开 | K2；248px专属panel；外部链接不自动打开，内部链接宿主导航 | E:1705–1733；renderer `extensions.ts:29–32` |
| MD-024 | 地址输入、空地址、合法地址、长URL | Enter执行apply；Escape K2；应用 disabled 受 blocked/href影响，表单按键不得被菜单吞 | E:1754–1755、1787–1827；S:1029–1055 |
| MD-025 | 已有链接改地址、移除；空光标应用禁用 | 扩展完整 link range，移除只改目标；重新打开读当前href | E:1727–1730、1790–1794、1816–1825；F applyLink/removeLink |
| MD-026 | 链接面板“链接到笔记”：初始loading、空结果、最多6条、长标题 | 输入上限100；Tab候选按钮可达；Enter选首条；K2关闭恢复 | E:1756–1785、1828–1871；N:20–32 |
| MD-027 | 链接面板查找失败→重输恢复；快速改查询/迟到响应 | 关闭/换query取消旧发布；错误是该列表局部反馈，不清地址 | E:1765–1785、1835–1858 |
| MD-028 | 选已有笔记：保留已选显示文字；空光标插标题；已有内链替换 | /doc/稳定ID，点击后关闭；不能把标题当永久定位身份 | L:43–58；E:1841–1867 |

### 插入分类、表格与代码块上下文

| ID | 入口与必覆盖状态 | 键盘、关闭/恢复与行为证据 | 源码/所有权 |
| --- | --- | --- | --- |
| MD-029 | 插入表格弹层默认3×3、行1–50/列1–12、编辑中间态 | 数字 Enter/blur提交并clamp，Escape取消draft（外层K2仍适用）；空/非法不提交 | E:1878–1926；S:924–987 |
| MD-030 | 点击插入：真实含表头表格、单步undo；当前不能插入时disabled | 只有命令成功才close；固定headerRow=true，不能加会破坏MD往返的无表头开关 | E:1457–1468、1892–1895、1916–1925 |
| MD-031 | 插入图片：有上传通道显示、无通道不显示；原生文件picker取消 | K1；通过 antd Upload beforeUpload，网络由宿主；取消不能写正文 | E:1470–1473；S:1221–1244 |
| MD-032 | 图片上传成功/失败；大图/长alt/断图 | 先上传入知识库→再插URL；失败不插；实际上传重开另验，mock不能当落盘 | E:210–236、810–813；H:174–184；T:263–270 |
| MD-033 | 插入分隔线、数学公式、Mermaid、WaveDrom | K1/K3；方言和 renderer能力门控；同 uiOp 与真实节点，模型与手工共用 | E:1475–1503；X:34–62 |
| MD-034 | 光标进/出table→表格上下文分类显隐、回默认分类 | Tab K2；上下文消失不能留下死面板 | E:1157、1508–1520；C:55–63 |
| MD-035 | 表格菜单：上/下插行、左/右插列、删行/列/表 | K2；每个命令按真实can token禁用、undo；不能只看在表里就全可用 | E:314–328、1937–1946 |
| MD-036 | 当前列左/中/右对齐，当前项勾选且不可重复 | K2；整列对齐，往返MD分隔线保持；不冒充单元格任意样式 | E:330–335、1950–1958 |
| MD-037 | 第一行设为/取消表头 | K2；只切th/td，不增加行；边界禁用原因 | E:1963–1977 |
| MD-038 | 表格正文：长单元格/横宽/checkbox/节点边界与undo | K3；宿主 Table resizable=false，不能凭空加拖拽列宽功能 | renderer `extensions.ts:36–41`；T表格规则 |
| MD-039 | 光标进/出code→代码块分类与语言Select | K1；选自动识别或实际lowlight语言，更新围栏；无语言表不显示 | E:1158–1160、1524–1538、1980–2001 |
| MD-040 | 普通代码内容/高亮、空代码、长行、语言变更 | K3；编辑DOM保持，代码块内不出现InlineToolbar | D:26–42、64–79；I:103–105；T code/pre规则 |
| MD-041 | 数学公式：正常/空/无效LaTeX、源码编辑同步预览 | textarea Tab/文字输入，更新同一节点attrs，可undo；错误显示原源码，不抛HTML | M:7–19、58–90；T:272–325 |
| MD-042 | Mermaid：首次绘制/loading、成功、无效源码、编辑防抖 | 180ms绘制，旧revision不发布；源码可编辑，预览非编辑；取消卸载不发布 | D:26–78 |
| MD-043 | WaveDrom：同上；大图/横长图在窄列内滚 | 与Mermaid同NodeView；不能截图普通code当作图表完成证据 | D:34–61；T:286–305 |

### 笔记分类、审阅与正文建议

| ID | 入口与必覆盖状态 | 键盘、关闭/恢复与行为证据 | 源码/所有权 |
| --- | --- | --- | --- |
| MD-044 | 导出当前未保存正文+已保存属性；pending防连点/失败 | K1；调用live getMarkdown，宿主读真实YAML后下载；dirty不被导出清除 | E:893–907、1164–1181；H:237–240 |
| MD-045 | 块操作：上移/下移（首/末禁用）、复制、删除 | K2；selection block range，uiOp共用Agent编辑与撤销，非重新拼全文 | E:1112–1116、1540–1578 |
| MD-046 | 属性弹层：有services显示、loading、读取成功/空属性 | K2；360px专属panel；首次读取异步baseline，关闭取消迟到UI更新 | E:1580–1597、1623–1655 |
| MD-047 | 属性编辑：7行YAML、长行、多行、读失败错误 | textarea键盘归控件；关闭丢本地draft，重开重新读取；不假装有脏确认 | E:1656–1665；S:1159 ToolbarTextArea |
| MD-048 | 保存属性：pending/成功关闭/失败保稿重试/冲突原因 | 真实writeFrontmatter(draft, baseline)，独立宿主IO，不混作正文autosave | E:1666–1681；H:209–220 |
| MD-049 | AI总结全文/润色/整理排版：空文/无host禁用，全文/选区指令 | K1；只预填现有composer，不自动发模型请求、不改正文 | E:1184–1220；H:241 |
| MD-050 | 拼写检查默认开、关、换文档、开关后内链仍能点 | K1；立即setOptions到真实spellcheck，保留原editorProps handlers | E:469–476、820–831、1599–1616 |
| MD-051 | 查找入口按钮与Ctrl/Cmd+F，其他分类/折叠状态下也可打开 | 输入自动select；只开subbar，不要求切审阅才能可用 | E:644–645、1223–1233、915–925；S:1082–1109 |
| MD-052 | 查找空串—/无匹配/单个/多个；当前高亮与计数 | Enter下一个、Shift+Enter上一个，循环；大小写/全词选项K1 | S:2291–2312、2338–2449；E:464–468 |
| MD-053 | 替换输入/替换当前/全部替换/无匹配禁用 | 替换框Enter替换当前；真实MD adapter，同history/dirty/save链；不替换其他DOM文本 | S:2344–2355、2378–2387、2458–2490 |
| MD-054 | 关闭查找：按钮/Escape；重新打开保query/options、替换局部state重置 | 卸载clear高亮；目前onClose只setFindOpen(false)，没有明确回正文焦点代码，需验 | E:916–924；S:2314–2325、2372–2375、2452–2456 |
| MD-055 | `[[` 触发：空query、文字过滤、当前笔记排除、长query不再匹配 | 输入留正文，未闭合且≤80字符；无searchNotes不出现 | L:10–20；E:647–676；H:186–191 |
| MD-056 | `[[` 候选：loading/结果/空/失败、长同名标题 | ↑↓循环、Enter/Tab选、Escape本token关闭；点击保选区；listbox/option语义 | E:584–610、650–693、950–959；N:35–63 |
| MD-057 | `[[` 插入/取消后继续写、换query、快速异步竞态 | 稳定/doc/id链接与尾空格；取消不写正文；旧查询结果不覆盖；位置上/下翻转 | L:24–40；E:653–694 |
| MD-058 | 正文点内部笔记链接→宿主导航/未保存守卫/返回 | 仅primary click +规范ID拦截，不直接location跳转；不改外链策略 | E:613–622；H:246；宿主导航前模块保留 |
| MD-059 | `/`菜单：空/按英文id/中文label/keywords过滤、无匹配 | ↑↓循环、Enter命令、Escape退出；保留正文焦点；每次query更新重置选首项 | E:238–283、961–987；X:173–188 |
| MD-060 | Slash 所有既有项：正文/H1/H2/H3/项目/编号/任务/引用/代码/表格/分隔/公式/Mermaid/WaveDrom/图片 | 逐项schema/renderer/upload门控；选中删/query再uiOp；不新增未支持菜单 | X:64–171、191–205 |
| MD-061 | Slash 图片：原生picker取消/抛错；上传成功/失败；等待中人工/Agent改正文 | 取消/query保留并回正文；迟到上传不按旧range插，说明上传已成功但正文变化 | E:176–236、547–568；X:197–200 |
| MD-062 | Slash近底/近顶/短高窗口/正文滚动；`[[`同步定位 | fixed菜单需实测不出视口/不留旧锚点；源码静态风险见下，不宣称已复现 | E:659–663、968–970；`editors.css:408–413` |

### 选区 AI 与流式草稿

| ID | 入口与必覆盖状态 | 键盘、关闭/恢复与行为证据 | 源码/所有权 |
| --- | --- | --- | --- |
| MD-063 | >=2位置跨度的非空文字选区显示BubbleMenu；单光标/代码块/只读不显示 | 官方BubbleMenu top/offset8；点按钮保选区，不重建编辑器 | I:94–108；E:942–949 |
| MD-064 | 改写/翻译/精简/扩写：有/无回调、rewriting禁用、空文本不发 | K1；取模型textBetween，host网络；返回null不替换/不重复报错 | I:39–45、71–74、109–129；H:155–172 |
| MD-065 | 改写结果成功替换、undo；网络失败/没模型提示正文保留 | 用同一live editor insertContent，宿主message；不要假造预览确认层 | I:89–91、121–125；H:157–169 |
| MD-066 | 就这段提问 | 只宿主回调带文本去对话；不自行发消息，不引入平行composer | I:138–143；H:249 |
| MD-067 | 选区浮层多按钮：浅/深、窄列/短高、上缘翻转、滚动 | BubbleMenu测位；专属容器布局/面板规则当前缺失，实际渲染待验 | I:94–145；静态缺口见下 |
| MD-068 | Agent开始整篇写作：等待首字、增量字符计数、流式Markdown预览 | 草稿在正文外，不进autosave；真实服务delta；pre键盘可滚 | W:42–75、147–166、195–197 |
| MD-069 | 停止生成：空草稿、已有部分、等待请求结算 | AbortController；有部分进入选择，无部分抛错清除；停止后焦点按原位置恢复 | W:55–58、78–109、129–143、159–166 |
| MD-070 | 中断/失败有部分：丢弃草稿/保留部分（单primary） | 丢弃回正文；保留resolve(true)由原Agent链提交；不能直接写react缓存 | W:87–102、169–185 |
| MD-071 | 草稿期间人工编辑/undo：stale警告、保留禁用、只可丢弃 | 判原doc对象身份；不能把过期部分写入新正文 | W:126、145、179–193；renderer `markdown-writing.test.tsx:124` |
| MD-072 | 外部Agent整轮取消/切文档/卸载：迟到流/待确认全部销毁 | signal/operation/editor/documentId绑定；partial promise结算false | W:34–41、57–76、100–108 |
| MD-073 | 完整草稿成功：同Agent句柄提交到正文、可保存与整轮undo | preview不是最终真相；不能只验预览文字；真实AI IO单列验收 | E:743–772；renderer `markdown-writing.test.tsx:63` |
| MD-074 | 草稿超长/错误超长/窄与短高：停止或丢弃/保留始终可达 | 100000字符上限；pre独立滚动，header/actions flex-wrap；错误换行需真实量测 | W:70、147–197；`editors.css:1045–1089` |

### CSS/共享变更边界与优先风险

1. **已证实静态缺口：选区浮层没有专属CSS定义。** `I:108` 唯一使用 `.mimir-inline-bar`；`rg -n 'mimir-inline-bar' packages/renderer/src packages/office/src` 只命中该一处。五个动作与divider的容器没有明确的面板背景/布局/窄列约束。应先用真实选区截图，再确定布局；不要描述为已实测的“透明/换行”。
2. **短高Slash负top风险。** `E:968` 为 `Math.min(rect.bottom + 4, innerHeight - 320)`，没有top>=8兜底；viewport高度<320时负值是算式可证。即便更高，实际菜单高度/可用空间与320硬估值也不同。先实测窗口和编辑列组合，保留菜单命令及键盘。
3. **Wiki候选锚点不跟外部滚动/resize主动更新。** `E:653–676` effect只依赖editor/wikiToken/pickerVisible/searchNotes；量位仅一帧，没注册scroll/resize。候选用fixed定位（shell.css:633）；应验证滚动后漂移与关闭恢复，不凭静态源码宣布具体像素偏差。
4. **长候选标题未显式约束。** `N:20–32`把title直接作为antd Button children；`shell.css:646–657`没有min-width/ellipsis/word-break策略。实际antd层叠决定是否溢出，需同名/超长与280px实测。保留完整可访问名称。
5. **属性面板层级弱与忙态。** `E:1657–1681`只有原语textarea、裸alert、菜单项保存，loading/saving时仅保存项disabled，textarea没有disabled参数。不能把“用户仍可编辑”随手改成新业务限制；本轮可调整清晰标签/错误布局，若改变异步编辑语义须有明确行为验证。
6. **查找退出焦点没有显式恢复。** `E:923`只关，S的Esc也只onClose；应先实测activeElement；避免卸载后落body。共享FindReplaceBar涉及其他五格式，优先可选回调或Markdown宿主接线，不悄悄改所有格式。
7. **链接Enter与disabled按钮判据不同。** `E:1787` apply没有重复检查blocked，文本field Enter直接apply；按钮另有disabled。此次不能只修样式而使现有可见/键盘差异更隐蔽。需真实选区回归后，由实现者判定是否按既有合同消除路径差异；不能凭本报告宣称业务已坏。
8. **内联改写等待时选区身份。** `I:121–125` Promise完成后对届时live selection insertContent，没有冻结原from/to/doc；H没有传rewriting prop。改变相关逻辑属于异步语义修复，不能混在CSS里。应至少记录并测，若确认越界再单独明确最小修复边界。
9. **共享CSS不要扩大回归。** S/shell.css所有.me-*、C/compact-toolbar.css默认作用六格式。Markdown专属样式优先作用 `.mimir-editor--note`、`.mimir-markdown-*`，但N候选已有自身类；T影响只读与编辑，是同主题合同。任何共用原语变更必须六格式窄列/深色/嵌套菜单最低回归。

### 覆盖与真实IO边界

- Gallery可以 mock：`onSave`受控Promise（含连续两次保存）、`searchNotes`结果/拒绝/延迟、`onUploadImage`失败/迟到、frontmatter读写、onExport下载准备、onRewrite结果、agentServices.writeDocument受控delta与Abort。组件本体、Tiptap真实extensions、表格/公式/图表renderer、菜单与实际事件不可替换成静态HTML。
- 必须另有真实产品证明：默认账号登录后现有笔记加载→编辑→实际保存→重开读回；内部链接导航/未保存守卫；真实图片上传与获取URL/原件；实际导出含当前正文/属性；真实属性冲突错误；真实模型服务是否可用单列。不能为补QA造第二账号；不可用服务写清限制。
- 各主要表面至少浅/深、宽1440、窄390和实际三栏中列/AI侧栏、短高500；菜单/候选/草稿在同内容同主题同尺寸前后配对。关注的是编辑区实际宽度，不只是viewport。338px压缩下末组可达沿共享spec；200%缩放补工具与表单。
- 源码有多个状态不等于每个都必须一张截图：静态对比覆盖各视觉表面，交互记录覆盖状态转换、键盘、焦点、正文/history/保存结果。coverage.json逐MD ID说明 evidence，不把一张默认页截图充作全部交互。

### 已有测试可复用（本研究未执行）

- `packages/renderer/src/editor/MarkdownEditor.test.tsx:173–546`：真实宿主方言工具条，样式/列表/链接/表格/代码/拼写。
- `markdown-controls.test.tsx:99–224`：真实控件契约、small、禁用原因、就地弹层、保存失败。
- `markdown-save.test.tsx:98–425`：防抖、导出、AI预填、查找替换、Agent同保存路径、保存中继续编辑与离开失败。
- `markdown-writing.test.tsx:63–143`：增量预览/整轮undo、stale、取消待确认。
- `note-links.test.ts`、`markdown-slash-image.test.tsx`、`MarkdownImage.test.tsx`、`math-block.test.ts`、`diagram-block.test.ts`、`drift.test.ts`、`round-trip.test.ts`：内链、图片竞态、真实数学/图表方言与Markdown幂等。
- `packages/office/src/shell/EditorShell.test.tsx`、editors/compact相关测试：共享菜单/字段/查找/具名折叠。新增测试只守新行为缺口，不镜像CSS常量。

### Related specs

已读 `.trellis/workflow.md`、`.trellis/spec/project/rules.md`、`.trellis/spec/guides/index.md`、renderer/frontend/index.md、renderer/frontend/editor/{index,conventions}.md、office/frontend/{index,editors/index,editors/conventions,shell/index,shell/conventions}.md。要求真实方言、useEditor实例、useToolbarState订阅、官方BubbleMenu、同编辑/保存原语、就地弹层主题继承、实际编辑列压缩与全仓pnpm check。研究本身只写task/research，未改实现/规范/其他任务。

## External references

见 [references.md](references.md)：本日重新取回固定GenOffice Markdown Ribbon、WeKnora官网/固定源/最新release/tag、Office与Google官方帮助，全部HTTP200；原始证据与SHA在external-evidence.json。WeKnora **v0.8.3 / 3e22822c1d2397be730c458c7539d0eb8c113a24**，文件编辑主要依据GenOffice固定 **480548fd55f1be3593ee0d8e316a734751d58309** 与Office/Docs官方文档。保留现有Mimir主题，不按竞品源码像素强行替换。

## Caveats / Not Found

- 未运行Mimir或竞品GUI，无本研究新增渲染截图；所列视觉风险必须由主任务真实组件验证。
- Mimir没有独立Markdown Ribbon.tsx，没有源码/预览双栏切换、独立frontmatter sidebar或完整官方Office功能。不能为“覆盖所有页面”发明不存在的页面。
- 标题/大纲/返回/文档菜单属于宿主DocumentPanel既有模块，不重建它们；此轮验证其槽位与编辑器共存即可。
- 本研究不修改业务功能，不接受“因容易测试而缩减既有命令”。涉及实际异步身份修复由主任务明确范围后实施。
