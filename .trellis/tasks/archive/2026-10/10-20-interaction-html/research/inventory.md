# Research: HTML编辑器交互清单

- Query: 模块11 HTML所有既有交互、状态与真实组件画廊入口
- Scope: internal
- Date: 2026-10-20（Asia/Shanghai）

## Findings

共92组稳定编号；`inventory.json`为机器可读同源清单，所有ID须在gallery可导航。这里是源码盘点，不是浏览器验收；不得把此清单本身当作已覆盖证明。

### 状态适用规则

每一组默认检查普通态、现有控件hover/focus、真实禁用条件及说明、已有loading/empty/error/recovery、Tab/Enter/Space和行内快捷键、长文本、浅深。宽/中/窄指**编辑列实际可用宽度**1100/760或690/420或390；短高320/420需检查内部滚动与动作可达。文档/状态变化才有loading/error，不给纯toggle虚构loading。合同组无独立hover/主题要求，应以字节/版本/消息断言证明，关联入口仍验视觉。原vendor控件的既有限制记录在caveats，不能悄悄删条。

### 编号、来源与入口

| ID | 交互组 | 来源 | 真实入口与适用细节 |
| --- | --- | --- | --- |
| HTML-001 | 读取与外壳 | `packages/office/src/editors/HtmlEditor.tsx:1037` | 打开HTML文档；读取中、解析中、读取失败长错误、重试恢复；加载时无伪工具 |
| HTML-002 | 源码/分栏/预览 | `packages/office/src/editors/HtmlEditor.tsx:1213` | 视图→视图三切换；普通、按下、hover、focus、键盘；切换保留CodeMirror实例/历史/草稿 |
| HTML-003 | 分类与快捷操作 | `packages/office/src/editors/HtmlEditor.tsx:1092` | 开始/插入/视图与固定快捷区；分类左右键/Home/End，分组自动压缩；保存/撤销/重做始终可达 |
| HTML-004 | 保存状态与重试 | `packages/office/src/editors/HtmlEditor.tsx:950` | 修改源码→保存到库；未改禁用、已改、保存中禁用、失败保留内容后重试、已保存；等待时再次修改仍dirty |
| HTML-005 | 源码编辑与行列 | `packages/office/vendor/apps/html/src/renderer/source/SourceEditor.tsx:47` | 源码CodeMirror；文本/多选/折叠/括号/Tab缩进/中文、长行、光标行列；vendor行为保持 |
| HTML-006 | 撤销与重做 | `packages/office/src/editors/HtmlEditor.tsx:1104` | 快捷区或源码Mod+Z/Mod+Shift+Z；空历史禁用原因；手动、Agent与预览改动共用源码画布历史 |
| HTML-007 | 原件格式保真 | `packages/office/src/editors/HtmlEditor.tsx:136` | 加载BOM/CRLF/末尾换行文档并保存；字节级验收BOM、EOL和末尾换行；渲染截图不证明保真 |
| HTML-008 | 源码单栏宽窄 | `packages/office/src/editors/HtmlEditor.tsx:1475` | 视图→只看源码；宽中窄、长文本、短高、浅深、滚动与焦点；无预览栏但未卸载 |
| HTML-009 | 分栏宽窄与高度 | `packages/office/src/editors/HtmlEditor.tsx:1470` | 视图→分栏；源码/预览独立滚动，窄列及短高；现CSS按浏览器1100px媒体查询，非编辑列宽 |
| HTML-010 | 源码高亮与主题 | `packages/office/vendor/apps/html/src/renderer/source/SourceEditor.tsx:60` | 查看源码文字/选区/行号；浅深正文、标签/属性/字符串/注释、选区、光标、活动行与折叠可辨 |
| HTML-011 | 查找打开和重复聚焦 | `packages/office/src/editors/HtmlEditor.tsx:918` | 开始→查找或Mod+F；预览单栏自动分栏；重复Mod+F聚焦当前查询不关闭 |
| HTML-012 | 查找词与结果导航 | `packages/office/src/shell/EditorShell.tsx:2270` | 查询输入→Enter/Shift+Enter或前后箭头；空查询、无匹配、单/多匹配、计数、源码高亮、长查询 |
| HTML-013 | 查找选项 | `packages/office/src/shell/EditorShell.tsx:2418` | Aa与全词匹配；按下/取消、键盘、结果重新计算、中文与边界匹配 |
| HTML-014 | 替换单个与全部 | `packages/office/src/shell/EditorShell.tsx:2460` | 替换框、替换、全部替换；空/非空替换、无匹配禁用、Enter替换当前、源码与历史更新 |
| HTML-015 | 查找关闭与回焦 | `packages/office/src/editors/HtmlEditor.tsx:1419` | 关闭查找或输入框Escape；清除高亮、回源码焦点；当前仅setFindOpen(false)，需浏览器验证回焦缺口 |
| HTML-016 | 预览加载/就绪 | `packages/office/src/editors/HtmlEditor.tsx:1458` | 等待gx:ready；加载中、真实标题、选中状态；旧version消息不使当前预览就绪；长标题应折行或截断 |
| HTML-017 | 桌面/平板/手机 | `packages/office/src/editors/HtmlEditor.tsx:1249` | 视图→设备三档；100%下桌面铺满、平板768、手机390；源码单栏操作自动带回分栏 |
| HTML-018 | 预览缩放 | `packages/office/src/editors/HtmlEditor.tsx:1266` | 视图→缩放字段；50–200%、10步进归一、空/非数字不提交；缩放不改文档/dirty |
| HTML-019 | 预览缩放滚动与快捷键 | `packages/office/vendor/apps/html/src/renderer/preview/inspector.js:991` | iframe焦点→Mod +/-/0与Ctrl/Meta+wheel；放大两端可达，预览独立滚动；还原100%；文档布局不被错误挤窄 |
| HTML-020 | 预览点选与取消 | `packages/office/src/editors/HtmlEditor.tsx:609` | iframe内点击元素/空白；hover轮廓、选中、空白/动态元素清除；source与版本验证不变 |
| HTML-021 | 预览源码互定位 | `packages/office/src/editors/HtmlEditor.tsx:878` | 源码光标/预览点选→定位源码；无选中、预览未ready、源码隐藏各自禁用原因；源码光标同步当前sid |
| HTML-022 | 元素路径 | `packages/office/src/editors/HtmlEditor.tsx:1433` | 选择深层元素→面包屑；祖先到当前、点击选中、键盘、长class/深层路径；只显示首class，分隔装饰 |
| HTML-023 | 清除行内样式 | `packages/office/src/editors/HtmlEditor.tsx:1350` | 开始→清除行内样式；无选择/无style禁用原因；有style整属性移除，历史/dirty更新 |
| HTML-024 | 预览直接文字编辑 | `packages/office/vendor/apps/html/src/renderer/preview/inspector.js:900` | iframe单击文字/双击元素按vendor入口；文字编辑、Mod+Enter/Escape提交、未改不产历史；宿主收到textEditCommit |
| HTML-025 | 预览内部HTML编辑 | `packages/office/src/editors/HtmlEditor.tsx:673` | vendor iframe htmlEditCommit对应入口；源码补丁、当前版本验证；非独立Mimir对话框，不虚构可见按钮 |
| HTML-026 | 预览拖拽移动 | `packages/office/vendor/apps/html/src/renderer/preview/inspector.js:581` | 选中框拖拽→目标前/后；有效/无效目标、取消Escape、拖动提示、源码顺序；另有Inspector键盘等价动作 |
| HTML-027 | 预览手柄缩放 | `packages/office/vendor/apps/html/src/renderer/preview/inspector.js:527` | 选择可缩放元素→拖动八向手柄；实时变化、提交一次set_style、无变化不提交；不修改vendor |
| HTML-028 | 预览键盘选择与删除 | `packages/office/vendor/apps/html/src/renderer/preview/inspector.js:1016` | iframe选中后箭头/Delete/Backspace；父/子/前/后、Escape清除、删除、Alt上下移动；输入字段不误触快捷命令 |
| HTML-029 | 预览文字加粗斜体 | `packages/office/vendor/apps/html/src/renderer/preview/inspector.js:971` | iframe内选中文字→Mod+B/I；提交当前文字后按直接文本节点wrap_text；无选区不伪执行 |
| HTML-030 | 插入类型与普通元素 | `packages/office/src/editors/HtmlInsertMenu.tsx:12` | 插入→插入HTML元素；标题/段落/列表/按钮/图片/表格/章节/分隔线八类型都可见；hover/focus/键盘 |
| HTML-031 | 插入图片URL | `packages/office/src/editors/HtmlInsertMenu.tsx:38` | 插入类型→图片URL；空/无http(s)报错、有效URL成功、长URL；当前消息无role须检查宣读 |
| HTML-032 | 插入表格 | `packages/office/src/editors/HtmlInsertMenu.tsx:45` | 插入类型→表格；行1–8列1–10、非整数/越界/空、有效成功；字段需有可见标签 |
| HTML-033 | 插入结果与位置 | `packages/office/src/editors/HtmlEditor.tsx:1286` | 选中/未选中后插入；当前选中sid、空页面无位置错误、成功反馈、切类型清消息、保存再开 |
| HTML-034 | Inspector打开/关闭 | `packages/office/src/editors/HtmlElementMenu.tsx:802` | 开始→编辑元素；打开聚焦aside，关闭/Escape回触发器，外部已有焦点不抢；宽侧栏/窄覆盖层 |
| HTML-035 | Inspector无选中与刷新 | `packages/office/src/editors/HtmlElementMenu.tsx:342` | 打开未选择/选择后刷新；空态说明可行路径；刷新重挂当前字段/版本，选中变化重新初始化 |
| HTML-036 | Inspector分类键盘 | `packages/office/src/editors/HtmlElementMenu.tsx:314` | 文字样式/内容与结构/图片/CSS；tablist、左右键/Home/End roving tabindex、关联tabpanel；图片tab只img可用 |
| HTML-037 | Inspector过期版本 | `packages/office/src/editors/HtmlElementMenu.tsx:352` | 属性草稿打开→外部源码变更；通知、fieldset禁用、提交禁用、刷新恢复；保留草稿并拒绝旧version写入 |
| HTML-038 | 文字加粗与斜体 | `packages/office/src/editors/HtmlElementMenu.tsx:381` | 文字样式→加粗/斜体；当前computed按下态、即时应用、撤销、请求失败消息 |
| HTML-039 | 文字字号 | `packages/office/src/editors/HtmlElementMenu.tsx:413` | 文字样式→字号−/+；computed当前值、减小下限8px、每次2px；不新增字号能力 |
| HTML-040 | 文字对齐 | `packages/office/src/editors/HtmlElementMenu.tsx:438` | 文字样式→左/中/右；按下值、即时应用、键盘、重复操作结果 |
| HTML-041 | 文字和背景颜色 | `packages/office/src/editors/HtmlElementMenu.tsx:456` | 文字样式→颜色网格/清除；七预设色、当前值与移除；文档色保持作者值，不随应用主题强行变色 |
| HTML-042 | 元素宽高 | `packages/office/src/editors/HtmlElementMenu.tsx:476` | 文字样式→宽度/高度+应用；未修改computed保持作者%/auto，带单位、清空移除、无效提示、长值 |
| HTML-043 | 尺寸锁定比例 | `packages/office/src/editors/HtmlElementMenu.tsx:506` | img→锁定比例→改宽高；默认解锁/锁定按下、px+有效computed才联动；不满足条件解释 |
| HTML-044 | 内容结构快捷移动 | `packages/office/src/editors/HtmlElementMenu.tsx:663` | 内容与结构→上移/下移；首尾不能移动的真实结果、成功消息，版本与源码一致 |
| HTML-045 | 复制元素 | `packages/office/src/editors/HtmlElementMenu.tsx:681` | 内容与结构→复制元素；复制整范围到后方、成功/失败反馈、历史与保存 |
| HTML-046 | 命令选择与参数显示 | `packages/office/src/editors/HtmlElementMenu.tsx:58` | 内容与结构→元素命令；13命令、不同参数显隐、切换清反馈；不隐藏void不适用命令而明确禁用 |
| HTML-047 | 设置纯文本 | `packages/office/src/editors/HtmlElementMenu.tsx:94` | 元素命令→设置纯文本；内容可空、嵌套内容整体替换、错误原子不落地、void禁用 |
| HTML-048 | 设置内部HTML | `packages/office/src/editors/HtmlElementMenu.tsx:96` | 元素命令→设置内部HTML；多行长HTML、允许空、合法/失败反馈、void禁用 |
| HTML-049 | 替换整个元素 | `packages/office/src/editors/HtmlElementMenu.tsx:97` | 元素命令→替换整个元素；长HTML、当前sid版本、整批失败不落地，void也可选 |
| HTML-050 | 插入HTML参数 | `packages/office/src/editors/HtmlElementMenu.tsx:99` | 元素命令→插入HTML；前/后/内头/内尾四位置，void内部位置提交禁用，长内容 |
| HTML-051 | 设置或移除属性 | `packages/office/src/editors/HtmlElementMenu.tsx:107` | 元素命令→设置或移除属性；属性名必填、空值移除、长名称/值、编译失败保留草稿 |
| HTML-052 | 设置或移除样式 | `packages/office/src/editors/HtmlElementMenu.tsx:109` | 元素命令→设置或移除行内样式；CSS属性名必填、空值移除、长值、失败反馈 |
| HTML-053 | 更换标签 | `packages/office/src/editors/HtmlElementMenu.tsx:113` | 元素命令→更换标签；标签名必填、非法标签编译反馈；不另加语法方言 |
| HTML-054 | 移动参照与位置 | `packages/office/src/editors/HtmlElementMenu.tsx:115` | 元素命令→移动到另一元素旁；参照下拉含路径+最多42字符摘要，排除自身/后代，空目标、前/后、长选项 |
| HTML-055 | 替换直接文本节点 | `packages/office/src/editors/HtmlElementMenu.tsx:124` | 元素命令→替换直接文本节点；从0索引、内容、无效/超界结果、void禁用 |
| HTML-056 | 包裹文本片段 | `packages/office/src/editors/HtmlElementMenu.tsx:128` | 元素命令→包裹文本片段；索引、起/止偏移、标签名，非整数/非法范围反馈、void禁用 |
| HTML-057 | 去掉元素标签 | `packages/office/src/editors/HtmlElementMenu.tsx:143` | 元素命令→去掉元素标签；无参数提交保留内容，void禁用；不增加确认业务 |
| HTML-058 | 删除元素 | `packages/office/src/editors/HtmlElementMenu.tsx:144` | 元素命令→删除元素；无参数提交，当前元素消失，选择与源码/历史同步 |
| HTML-059 | 源码替换文字 | `packages/office/src/editors/HtmlElementMenu.tsx:146` | 元素命令→在源码中替换文字；原文必填、新文可空、未命中/歧义按编译合同反馈 |
| HTML-060 | CSS输入与临时预览 | `packages/office/src/editors/HtmlCssControls.tsx:27` | Inspector→CSS→输入声明；250ms debounce、有效/无效声明、长文本；仅替代previewHtml不改版本/源码/dirty |
| HTML-061 | CSS应用/取消/关闭恢复 | `packages/office/src/editors/HtmlCssControls.tsx:42` | 应用CSS/取消预览/切分类/关闭/文档过期；空有效声明反馈、成功清草稿、失败保留；离开分类unmount清preview |
| HTML-062 | 图片类别和替代文字 | `packages/office/src/editors/HtmlElementMenu.tsx:518` | 选img默认图片tab→alt输入和应用；现有alt、空装饰图、长描述；非图片不展示图片tab |
| HTML-063 | 图片填充方式 | `packages/office/src/editors/HtmlElementMenu.tsx:536` | 图片→填充方式；fill/contain/cover/none/scale-down、当前computed、键盘和反馈 |
| HTML-064 | 图片旋转与翻转 | `packages/office/src/editors/HtmlElementMenu.tsx:550` | 图片→左/右转90°、水平/垂直翻转；保留并合成原transform、连续操作、撤销/保存再开 |
| HTML-065 | 图片左中右对齐 | `packages/office/src/editors/HtmlElementMenu.tsx:601` | 图片→对齐三按钮；现有imageAlignStyles真实写路径，源码/预览/历史同步 |
| HTML-066 | 本地图片替换 | `packages/office/src/editors/HtmlElementMenu.tsx:619` | 图片→选择本地图片；png/jpeg/webp/gif/svg、5MB上限、取消、读取失败、选中/文档变化拒绝过期 |
| HTML-067 | 图片URL替换 | `packages/office/src/editors/HtmlElementMenu.tsx:652` | 图片→替换图片URL→替换；http(s)校验、空/无效/长URL、成功/失败反馈，不新增远程资源请求 |
| HTML-068 | 图片像素入口可用性 | `packages/office/src/editors/HtmlElementMenu.tsx:216` | 图片→裁切/去背景；缺src、过大data、相对地址均禁用原因；远程资源CORS失败说明 |
| HTML-069 | 图片像素加载与版本 | `packages/office/src/editors/HtmlEditor.tsx:962` | 启动裁切/去背景等待图片资源；凭据omit、类型校验、5MB、失败消息；读取完成前文档/选择/src改变则拒绝 |
| HTML-070 | 裁切原vendor面板 | `packages/office/vendor/packages/ui/src/image-dialogs.tsx:315` | 图片→裁切图片；加载/加载失败、棋盘格、拖边/角/移动裁区、取消/Escape/遮罩、应用；原vendor不改 |
| HTML-071 | 去背景原vendor面板 | `packages/office/vendor/packages/ui/src/image-dialogs.tsx:115` | 图片→去除背景；初始容差30、滑块0–100和实时预览、移除百分比、处理中禁用、错误/取消 |
| HTML-072 | 像素应用守卫 | `packages/office/src/editors/HtmlEditor.tsx:1003` | 裁切/去背景→应用PNG；>5MB、version/sid/src改变均拒绝，原件未改；错误role=alert，成功关闭dialog |
| HTML-073 | AI预设 | `packages/office/src/editors/HtmlEditor.tsx:1177` | 开始→问AI菜单；美化、极简/杂志/科技/活泼/深色、总结七项；无宿主回调禁用原因 |
| HTML-074 | AI单选问题 | `packages/office/src/editors/HtmlAgentPrompt.tsx:55` | Agent ask_clarification单选；题目/描述、选项+由AI决定、未选默认AI、补充说明、跳过/提交/关闭/Escape |
| HTML-075 | AI多选问题 | `packages/office/src/editors/HtmlAgentPrompt.tsx:96` | Agent ask_clarification multi；Checkbox.Group多选/取消/全空默认AI、按原option顺序返回selections及兼容摘要 |
| HTML-076 | 问题ID与生命周期 | `packages/office/src/editors/HtmlEditor.tsx:783` | 前一问题取消/停止/后继问题/换文档；signal只关闭所属请求、迟到结果不重开、constructor/__proto__等ID安全读取 |
| HTML-077 | 提纲内容主张/标题/读者 | `packages/office/src/editors/HtmlAgentPrompt.tsx:233` | Agent plan_page→确认提纲；现值/长值/空字段，内容主张和至少一章节必填，确认错误不关闭，修正恢复 |
| HTML-078 | 提纲视觉方向 | `packages/office/src/editors/HtmlAgentPrompt.tsx:254` | 确认提纲→选择方向；原方向和alternatives、样本色/名/语气/色板；选择structuredClone并记录user_edited |
| HTML-079 | 提纲配色字体布局 | `packages/office/src/editors/HtmlAgentPrompt.tsx:288` | 展开配色、字体与布局；五色/自定义RGB、语气、标题/正文/层级、圆角/间距/阴影、布局/密度、Word友好 |
| HTML-080 | 提纲章节 | `packages/office/src/editors/HtmlAgentPrompt.tsx:376` | 章节标题/用途、添加、移除；稳定key、最少1最多20、按钮禁用原因、长标题/用途、20章节滚动 |
| HTML-081 | 提纲文档要求与重新拟定 | `packages/office/src/editors/HtmlAgentPrompt.tsx:434` | 展开文档要求→语言/长度/重新拟定说明；可选值、重新拟定返回redo+说明trim/slice2000，取消返回null，确认返回brief |
| HTML-082 | 规划侧栏焦点/动作 | `packages/office/src/editors/HtmlAgentPrompt.tsx:461` | 问题/提纲面板出现、关闭、外部焦点；auto focus aside、Escape取消、回原触发或分类tab、不抢外焦点；长内容固定footer |
| HTML-083 | 生成开始/流式计数 | `packages/office/src/editors/HtmlWritingPreview.tsx:30` | Agent write_document→onDelta；空草稿开始、字符累计、生成中停止、说明尚未写原文；不把临时预览说已保存 |
| HTML-084 | 生成完成与无内容失败 | `packages/office/src/editors/HtmlWritingPreview.tsx:63` | Writer complete或抛错；完整页由handle落地；零内容失败无可保留草稿；200000字符上限 |
| HTML-085 | 停止/错误部分稿 | `packages/office/src/editors/HtmlWritingPreview.tsx:73` | 停止或服务失败且有部分文本；停止说明/服务长错误、保留部分/丢弃；未选择前不改源码 |
| HTML-086 | 过期草稿与外部取消 | `packages/office/src/editors/HtmlWritingPreview.tsx:109` | 部分稿等待时手动编辑/外部abort；过期警告、保留禁用、丢弃可达；外部取消直接终止且不覆盖 |
| HTML-087 | 演示覆盖层 | `packages/office/src/editors/HtmlPresentation.tsx:5` | 视图→演示；dialog/aria-modal、隔离iframe不加编辑映射、退出、Escape、回原焦点、Tab首尾 |
| HTML-088 | 全屏及不支持错误 | `packages/office/src/editors/HtmlPresentation.tsx:48` | 演示→全屏；支持成功/拒绝/不支持短说明；短高/窄屏错误不挤丢退出动作 |
| HTML-089 | 独立窗口演示 | `packages/office/src/editors/html-output.ts:17` | 视图→新窗口；被拦截role=alert，允许后重试；opener=null、隔离srcdoc、不带编辑映射 |
| HTML-090 | 导出HTML | `packages/office/src/editors/html-output.ts:7` | 视图→导出HTML；当前未保存源码+原BOM/EOL，Blob下载page.html、释放URL；截图不证明下载字节 |
| HTML-091 | 安全与消息合同 | `packages/office/src/editors/HtmlEditor.tsx:562` | 预览/演示/伪消息输入；source==iframe.contentWindow且version==handle.version；sandbox无allow-same-origin、no-referrer |
| HTML-092 | 宿主离开守卫 | `packages/office/src/editors/HtmlEditor.tsx:307` | 编辑后导航/换文档/关闭页面；onDirtyChange与onSaveRequest注册现有宿主守卫，UI精修不能跳过保存/丢弃/取消三选项 |

### 相关规范

- `.trellis/spec/office/frontend/editors/{index,conventions,pitfalls}.md`：view hidden保实例、缩放补偿、尺寸单位、不覆盖原%/auto、停止只关闭本请求。
- `.trellis/spec/office/frontend/shell/{index,conventions,pitfalls}.md`：统一组件/分组压缩/属性可见标签、portal主题与焦点。
- `.trellis/spec/office/engine/{index,conventions}.md`：上游闭包、原件保真和browser/server边界。
- `.trellis/spec/project/{design,quality,rules}.md`：浅深token、局部1px字段focus、实际渲染和全仓检查。

## Caveats / Not Found

- 所有状态源自当前源码，不声称已在浏览器逐一执行；预览消息型动作应从真实iframe交互，不能在gallery伪造window消息来冒充真实操作。
- askAi快捷键在vendor inspector发出，但宿主gx:keyCommand没有askAi分支（见HtmlEditor.tsx:703–780）；因此不能在Demo承诺已接通此快捷键。本轮不新增能力。
- 原vendor裁切八向手柄使用div + mouse事件，无键盘调整裁区入口；Cutout容差有原生range可键盘。原vendor view仅观察保留，不能声称裁切全键盘可用。
- HTML源码每次编辑重载预览，滚动会回顶，是engine现行记录的限制，不在纯打磨里改变增量渲染合同。
- HtmlWritingPreview名称含preview但当前只显示计数/状态/动作，不展示draft iframe；不要给画廊编造产品不存在的草稿画布。
- 桌面原生文件选择、真实服务端Agent、浏览器fullscreen/popup/下载写盘需要独立验证。控制式fixture可以模拟IO/服务，但必须标明范围。
- `packages/office/UPSTREAM.json`不存在，正确固定上游位置为`packages/office/vendor/UPSTREAM.json`。
