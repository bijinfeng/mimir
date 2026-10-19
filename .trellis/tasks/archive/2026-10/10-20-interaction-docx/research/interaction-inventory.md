# Research: DOCX 完整交互入口、状态与局部打磨边界

- Query: Module 12 当前真实 DocxEditor 的所有分类、弹层、Inspector、状态及最小局部精修候选
- Scope: internal（外部版本证据另见 references.md）
- Date: 2026-10-20 Asia/Shanghai

## Findings

### 盘点口径与稳定 ID

本清单是**源码交互索引**，不是已完成浏览器验收。`DOCX-Tnnn` 是分类/会话界面，`DOCX-Snnn` 是必须独立覆盖的业务/生命周期状态，`DOCX-Unnn` 是源码可见标签的真实控件/分组/入口。同名不同入口保留独立 ID；动态循环使用 `DOCX-Dnnn:value` 参数化子 ID。ID 固定于本次盘点，不因后续源码重排而重编号；表中行号是精修前位置。不要将 349 条静态标签算成 349 次点击通过，分组 label 也不都是可执行动作。

归档时每个 ID 需要明确 `observed` / `component-test` / `source-only` / `unverified`，保留未验项和限制；重点变化用相同原生内容、主题、容器尺寸的前后真实组件渲染，不用手绘效果图冒充真实 Editor。

### Files found 与代码模式

| 文件 | 职责 |
|---|---|
| `packages/office/src/editors/DocxEditor.tsx` | 唯一 Tiptap/PM 编辑器、工具分类与高级面板接线、save/export/find、阅读/打印/Web/导航 |
| `DocxAdvancedControls.tsx` | 图表/文本框/页面节/水印/新增与管理批注/脚注尾注；`DocxControlForm` 已统一 PropertyForm |
| `DocxStyleControls.tsx`, `DocxListControls.tsx`, `DocxDesignControls.tsx` | 原生样式定义/列表定义/主题字体/背景与边框 |
| `DocxReferencesControls.tsx`, `DocxTocControls.tsx`, `docx-references.ts` | 目录、题注、来源/引文/书目、索引、原生字段；另有插入分类的旧目录入口 |
| `DocxImageControls.tsx`, `DocxImageCropPreview.tsx`, `docx-image.ts` | 当前图片尺寸/旋转/环绕/像素裁切/去背/替换、暂存和一次应用 |
| `DocxProtectionControls.tsx`, `DocxProtectionSettingsControls.tsx` | 原件保护读取/会话密码核验/原生复选框/本地保护设置 |
| `DocxEncryptionControls.tsx`, `use-docx-opening.ts`, `docx-encryption.ts` | 原生打开密码、打开中取消、设置/移除加密意图 |
| `DocxPrivacyControls.tsx`, `docx-privacy.ts` | 保存时清理已知个人元数据意图、已保存清理基线 |
| `DocxCompareControls.tsx`, `DocxComparePanel.tsx`, `DocxSplitView.tsx` | 本地正文对比与只读分屏，非原件写操作 |
| `DocxInkControls.tsx`, `DocxInkOverlay.tsx`, `docx-ink.ts` | 笔/荧光笔/选中擦除、笔迹设置、清空确认、真实 Canvas 手势 |
| `DocxViewControls.tsx`, `DocxViewPanel.tsx`, `docx-view.ts` | 打印/Web/阅读、缩放、页面导航、大纲及标题层级 |
| `docx-tools.css` 与格式局部 CSS | 320px Inspector、实际800px覆盖、body/footer布局；只改自有层 |
| `DocxEditor.*.test.tsx`, `Docx*Controls.test.tsx`, `docx-*.test.ts` | 来源/版本/保存/原件保护与真实控件回归；不能替代浏览器像素和手势证据 |

- `DocxControlForm` 已在 `DocxAdvancedControls.tsx:73–82` 将子项放入 `ToolbarPropertyForm`，不能重复包一层来“补可见标签”。所有面板的 Antd Select busy 需显式 disabled，原生 fieldset 不会禁止 div 触发器。
- `DocxEditor.tsx:2938–3038` 的 advancedMenu 冻结编辑器/原生会话/版本后打开 Inspector，并只为特定组主动收起窄栏父菜单。通用路径可做局部一致化；版本守卫不得放松。
- `docx-tools.css:1–71` 使用工作区实际宽度容器查询，320px Inspector 在≤800px覆盖，至少保留32px上下文。页面几何、字体作者色与原件分页不能为 chrome 调整而重建。
- `DocxEditor.tsx:2305–2340` 唯一 `EditorContent` 常驻；split 为另一个只读视图，不得给打印/Web/阅读切换制造第二个可编辑 PM。
- `DocxStyleControls.tsx:341–377` 当前样式动作位于内部 sticky（`docx-tools.css:66`附近），并有选区应用次动作；迁移为同级固定 footer 时保持“先更新定义才能应用选区”。

### 分类与会话界面

| ID | 界面/入口 | 证据 |
|---|---|---|
| DOCX-T001 | 开始 | `packages/office/src/editors/DocxEditor.tsx:3231` |
| DOCX-T002 | 插入 | `packages/office/src/editors/DocxEditor.tsx:3232` |
| DOCX-T003 | 图片格式（仅当前选中图片） | `packages/office/src/editors/DocxEditor.tsx:3233` |
| DOCX-T004 | 设计 | `packages/office/src/editors/DocxEditor.tsx:3234` |
| DOCX-T005 | 绘图 | `packages/office/src/editors/DocxEditor.tsx:3235` |
| DOCX-T006 | 布局 | `packages/office/src/editors/DocxEditor.tsx:3236` |
| DOCX-T007 | 引用 | `packages/office/src/editors/DocxEditor.tsx:3237` |
| DOCX-T008 | 审阅 | `packages/office/src/editors/DocxEditor.tsx:3238` |
| DOCX-T009 | 表格（无表格时操作准确禁用） | `packages/office/src/editors/DocxEditor.tsx:3239` |
| DOCX-T010 | 视图 | `packages/office/src/editors/DocxEditor.tsx:3240` |
| DOCX-T011 | 阅读工具栏：退出、保存、布局、缩放、导航、拆分、导出 | `packages/office/src/editors/DocxViewControls.tsx:131` |
| DOCX-T012 | 顶部固定快捷区：保存、真实 Undo/Redo；标签独立可滚 | `packages/office/src/editors/DocxEditor.tsx:2551` |
| DOCX-T013 | 文档区、320px Inspector、底部真实状态行 | `packages/office/src/editors/DocxEditor.tsx:2282` |

### 独立状态与生命周期覆盖

每个条目至少记录实现前后的可见结果/不变约束；未实际操作的项标明 source-only。所有写工具共同补 busy/错误/源切换/关闭/版本过期拒绝，不能只覆盖按钮 idle。

| ID | 状态/交互及预期合同 | 证据 |
|---|---|---|
| DOCX-S001 | 源读取中：工具禁用与原因、页状态读取中 | `packages/office/src/editors/DocxEditor.tsx:1961` |
| DOCX-S002 | 源读取失败：错误+重试，保留原始来源 | `packages/office/src/editors/DocxEditor.tsx:1978` |
| DOCX-S003 | 解析失败：原因清楚，不呈现可写画布 | `packages/office/src/editors/DocxEditor.tsx:2000` |
| DOCX-S004 | 加密打开待密码：本地Password、可见标签、取消/Enter/Escape | `packages/office/src/editors/DocxEncryptionControls.tsx:15` |
| DOCX-S005 | 本地解密 busy：禁输，可取消；密码提交后清空 | `packages/office/src/editors/DocxEncryptionControls.tsx:36` |
| DOCX-S006 | 解密错误/密码不匹配/Worker取消：消息与重试焦点，未发布明文 | `packages/office/src/editors/DocxEncryptionControls.tsx:68` |
| DOCX-S007 | 干净：保存禁用并解释；已读原件可导出 | `packages/office/src/editors/DocxEditor.tsx:2046` |
| DOCX-S008 | dirty：手动/Agent正文或附加参数计入，顶部保存可用 | `packages/office/src/editors/DocxEditor.tsx:2037` |
| DOCX-S009 | 保存期间互斥导出、禁重复提交；写入当前原件 | `packages/office/src/editors/DocxEditor.tsx:2034` |
| DOCX-S010 | 保存失败保留dirty；保存中继续编辑不清新版本 | `packages/office/src/editors/DocxEditor.tsx:1824` |
| DOCX-S011 | 当前DOCX副本导出：包含未保存正文/附加参数，下载但不io.save/markSaved | `packages/office/src/editors/DocxEditor.tsx:1908` |
| DOCX-S012 | 加密保存/导出生成中：可停止；停止必须有可见按钮文字 | `packages/office/src/editors/DocxEditor.tsx:2244` |
| DOCX-S013 | Undo/Redo：当前PM真实历史；结构撤销独立，不冒充全局Undo | `packages/office/src/editors/DocxEditor.tsx:2114` |
| DOCX-S014 | 窄栏具名组折叠：全部分类、末组可达；先关父菜单再开Inspector | `packages/office/src/editors/DocxEditor.tsx:2938` |
| DOCX-S015 | Inspector头/关闭/Escape：只收最近层；返回仍挂载入口或当前tab | `packages/office/src/editors/DocxEditor.tsx:1273` |
| DOCX-S016 | Inspector短高与长内容：body内部滚动、固定footer，页纸不横向带宽 | `packages/office/src/editors/DocxEditor.tsx:2385` |
| DOCX-S017 | 查找入口与Ctrl/CmdF：退出阅读/切可见分类再聚焦 | `packages/office/src/editors/DocxEditor.tsx:1474` |
| DOCX-S018 | 查找有匹配/无匹配、上一/下一、Enter/ShiftEnter、大小写/整词 | `packages/office/src/editors/DocxEditor.tsx:2229` |
| DOCX-S019 | 替换单条/全部；受保护原件仅查找，replace函数省略 | `packages/office/src/editors/DocxEditor.tsx:1969` |
| DOCX-S020 | 查找关闭/Escape/toggle：应返回唯一主PM，不创建dirty/history | `packages/office/src/editors/DocxEditor.tsx:2235` |
| DOCX-S021 | 正文选区变化：格式/字体/字号/颜色/对齐当前值随真实交易更新 | `packages/office/src/editors/DocxEditor.tsx:2692` |
| DOCX-S022 | 字号继承：增减禁用并提示先选直接字号 | `packages/office/src/editors/DocxEditor.tsx:2669` |
| DOCX-S023 | 格式刷 armed→选目标应用→退出；清除格式也处理空选区storedMarks | `packages/office/src/editors/DocxEditor.tsx:2508` |
| DOCX-S024 | 大小写四模式、ShiftF3、空/复杂/过期选区拒绝 | `packages/office/src/editors/DocxCaseControls.tsx:16` |
| DOCX-S025 | 图表新建：3类型、增删1–20系列、分类与数值数匹配 | `packages/office/src/editors/DocxAdvancedControls.tsx:89` |
| DOCX-S026 | 图表已有：保留类型/系列数/分类数，空数值保留原数据点 | `packages/office/src/editors/DocxAdvancedControls.tsx:128` |
| DOCX-S027 | 图表错误/busy：不发布文档，数据表单仍可理解 | `packages/office/src/editors/DocxAdvancedControls.tsx:112` |
| DOCX-S028 | 文本框空内容禁用；位置、字号、颜色、环绕可编辑，明确插入一次 | `packages/office/src/editors/DocxAdvancedControls.tsx:230` |
| DOCX-S029 | 目录旧插入入口：有标题预览/无标题/选插入位置 | `packages/office/src/editors/DocxTocControls.tsx:17` |
| DOCX-S030 | 表格插入8×8 hover预览、键盘格选、点格一次插入 | `packages/office/src/editors/DocxEditor.tsx:3869` |
| DOCX-S031 | 脚注/尾注新建：冻结选择、跨段或正文变化拒绝、busy保稿 | `packages/office/src/editors/DocxEditor.tsx:3499` |
| DOCX-S032 | 链接：预填当前、输入/Enter/Escape、应用/移除 | `packages/office/src/editors/DocxEditor.tsx:3885` |
| DOCX-S033 | 文件图片：PNG/JPEG/GIF、读取/尺寸错误通知 | `packages/office/src/editors/DocxEditor.tsx:3089` |
| DOCX-S034 | 图片无选择：格式工具准确禁用；选图出现context tab | `packages/office/src/editors/DocxEditor.tsx:3304` |
| DOCX-S035 | 图片普通草稿：宽/高锁比、旋转/翻转、对齐/环绕/替换；重置与一次应用 | `packages/office/src/editors/DocxImageControls.tsx:47` |
| DOCX-S036 | 图片裁切：8把手/保留区拖动/方向键Shift加速/数值同草稿 | `packages/office/src/editors/DocxImageCropPreview.tsx:21` |
| DOCX-S037 | 图片去背：阈值/预览/取消；像素处理busy可取消；无操作不dirty | `packages/office/src/editors/DocxImageControls.tsx:380` |
| DOCX-S038 | 图片版本/选择过期：提示拒绝不发布旧结果；保存/Undo/Redo保原件 | `packages/office/src/editors/DocxImageControls.tsx:56` |
| DOCX-S039 | 主题：预设/字体方案/色板/恢复原件/预览，应用前不写 | `packages/office/src/editors/DocxDesignControls.tsx:151` |
| DOCX-S040 | 页面底色全文与边框当前节/范围；预览/重置/应用 | `packages/office/src/editors/DocxDesignControls.tsx:303` |
| DOCX-S041 | 设计busy/未知原件/版本过期拒绝，错误或状态在固定动作区 | `packages/office/src/editors/DocxDesignControls.tsx:130` |
| DOCX-S042 | 列表：有/无当前列表、库/预设、级别/编号/缩进/跟随字符预览 | `packages/office/src/editors/DocxListControls.tsx:41` |
| DOCX-S043 | 列表草稿重置、应用一次、原件未知/过期提示 | `packages/office/src/editors/DocxListControls.tsx:322` |
| DOCX-S044 | 样式：读取中/失败、选现有/新建、段落/字符/表格 | `packages/office/src/editors/DocxStyleControls.tsx:21` |
| DOCX-S045 | 样式：更改定义→更新/创建；定义未更新时不允许应用选区 | `packages/office/src/editors/DocxStyleControls.tsx:356` |
| DOCX-S046 | 样式：字符空选区禁用；继承/格式/分页字段不重建未知定义 | `packages/office/src/editors/DocxStyleControls.tsx:354` |
| DOCX-S047 | 页面节：切目标重填当前；横竖切换纸宽高；单位磅 | `packages/office/src/editors/DocxAdvancedControls.tsx:396` |
| DOCX-S048 | 页面节：续前节/重新编号有条件起始值；独立插分节符4类型 | `packages/office/src/editors/DocxAdvancedControls.tsx:611` |
| DOCX-S049 | 水印：文字/图片两种已有入口及移除，草稿不直接改原件 | `packages/office/src/editors/DocxAdvancedControls.tsx:639` |
| DOCX-S050 | 水印图片：20MB/格式/读入失败，已有图片状态；显式应用 | `packages/office/src/editors/DocxAdvancedControls.tsx:765` |
| DOCX-S051 | 页眉脚：切header/footer读取当前；PAGE/NUMPAGES占位；busy/失败保留草稿 | `packages/office/src/editors/DocxEditor.tsx:3613` |
| DOCX-S052 | 引用面板8模式切换：目录/题注/引文/来源/书目/标索引/索引/域 | `packages/office/src/editors/DocxReferencesControls.tsx:28` |
| DOCX-S053 | 目录新建/更新、标题空状态、可识别原生字段范围；页码由Word更新 | `packages/office/src/editors/DocxReferencesControls.tsx:214` |
| DOCX-S054 | 题注：图/表/公式标签与说明/下个真实序号/插入位置 | `packages/office/src/editors/DocxReferencesControls.tsx:254` |
| DOCX-S055 | 来源：现有选择/编辑/收起、新建唯一tag和类型；已知字段补丁保留未知字段 | `packages/office/src/editors/DocxReferencesControls.tsx:303` |
| DOCX-S056 | 引文/书目：来源空状态、列表预览、来源与CITATION同PM历史 | `packages/office/src/editors/DocxReferencesControls.tsx:362` |
| DOCX-S057 | 索引：选区初值/空标词/预览/插入；字段真实code/cache可改 | `packages/office/src/editors/DocxReferencesControls.tsx:375` |
| DOCX-S058 | 引用过期/错误/busy/成功：固定footer说明，不吞原字段范围 | `packages/office/src/editors/DocxReferencesControls.tsx:420` |
| DOCX-S059 | 批注新建：冻结选段、重复文本/跨段/复杂保护锚点拒绝、空内容禁用 | `packages/office/src/editors/DocxAdvancedControls.tsx:836` |
| DOCX-S060 | 管理批注空状态/主讨论/回复选择，切目标清旧回复草稿 | `packages/office/src/editors/DocxAdvancedControls.tsx:932` |
| DOCX-S061 | 批注改文/回复/解决/重开；删除根含回复/删除单回复各确认 | `packages/office/src/editors/DocxAdvancedControls.tsx:1061` |
| DOCX-S062 | 批注comments-only：正文继续只读，各操作显示精确权限原因 | `packages/office/src/editors/DocxAdvancedControls.tsx:1036` |
| DOCX-S063 | 脚注尾注管理：空列表/切选清草稿/首次匹配替换/删除确认 | `packages/office/src/editors/DocxAdvancedControls.tsx:1129` |
| DOCX-S064 | 修订开/关、无修订、接受/拒绝当前/全部、上一下一 | `packages/office/src/editors/DocxEditor.tsx:4260` |
| DOCX-S065 | 强制修订：开关与接收拒绝禁用，段内允许文字编辑，复杂结构只读 | `packages/office/src/editors/DocxProtectionControls.tsx:141` |
| DOCX-S066 | 拼写检查开/关：实际contenteditable spellcheck属性；不作词典引擎承诺 | `packages/office/src/editors/DocxEditor.tsx:3200` |
| DOCX-S067 | 本地对比未选/选文件/读取/busy/失败/重试；仅段落和表格文字 | `packages/office/src/editors/DocxCompareControls.tsx:16` |
| DOCX-S068 | 对比差异/相同空状态，切全部或仅差异；当前文件修改旧结果失效 | `packages/office/src/editors/DocxComparePanel.tsx:4` |
| DOCX-S069 | 原件保护：writable/readOnly/comments/forms/trackedChanges/unknown各状态摘要 | `packages/office/src/editors/DocxProtectionControls.tsx:137` |
| DOCX-S070 | 修改密码：未验证/输入/显隐/Enter/busy/取消/错误/成功；仅当前会话 | `packages/office/src/editors/DocxProtectionControls.tsx:185` |
| DOCX-S071 | 建议只读：显式“仍然编辑”，关闭重开不继承 | `packages/office/src/editors/DocxProtectionControls.tsx:304` |
| DOCX-S072 | forms-only：原生legacy/SDT checkbox、未知/锁定拒绝、鼠标与Space切换 | `packages/office/src/editors/DocxProtectionControls.tsx:219` |
| DOCX-S073 | 保护设置：返回/启停四模式/凭据保留替换清除/当前限制密码核验 | `packages/office/src/editors/DocxProtectionSettingsControls.tsx:197` |
| DOCX-S074 | 保护设置：新密码一致性/本地计算busy可取消/失败保留原件/应用dirty | `packages/office/src/editors/DocxProtectionSettingsControls.tsx:319` |
| DOCX-S075 | 打开密码：当前/已保存加密摘要、设置/更改/移除、两次密码一致 | `packages/office/src/editors/DocxEncryptionControls.tsx:98` |
| DOCX-S076 | 打开密码受保护禁用：与修改/限制密码区分，应用后保存/导出才生效 | `packages/office/src/editors/DocxEncryptionControls.tsx:174` |
| DOCX-S077 | 个人信息：读取中/失败、当前/已保存、开关/应用、已清理基线提示 | `packages/office/src/editors/DocxPrivacyControls.tsx:10` |
| DOCX-S078 | 个人信息过期：禁写+重新读取可见动作，不能恢复清理过姓名 | `packages/office/src/editors/DocxPrivacyControls.tsx:88` |
| DOCX-S079 | 表格无光标/整表/矩形多格/合并单格：行列删/合并/拆分准确禁用 | `packages/office/src/editors/DocxEditor.tsx:4011` |
| DOCX-S080 | 表格操作：插行列/删除、格底纹/垂直对齐/边框、行高/重复标题/列宽/AutoFit | `packages/office/src/editors/DocxEditor.tsx:4144` |
| DOCX-S081 | 表格设计：原样式/预设/6条件、边框预存、布局环绕/定位/距正文/格边距 | `packages/office/src/editors/DocxTableDesignControls.tsx:48` |
| DOCX-S082 | 表格设计：草稿重置/应用、未知浮动定位/过期错误不降级 | `packages/office/src/editors/DocxTableDesignControls.tsx:473` |
| DOCX-S083 | 打印/Web/阅读来回：唯一PM，Web移除分页装饰、回打印重测 | `packages/office/src/editors/DocxViewControls.tsx:29` |
| DOCX-S084 | 缩放：手动/100%/适合页宽/整页；按真实正文剩余宽度含停靠Inspector | `packages/office/src/editors/DocxViewControls.tsx:62` |
| DOCX-S085 | 拆分开/关：只读下半内容，长表/编号/分页状态，不修改dirty/history | `packages/office/src/editors/DocxSplitView.tsx:74` |
| DOCX-S086 | 导航：页面前后/跳页、空大纲/重复空标题/深层级/当前选中 | `packages/office/src/editors/DocxViewPanel.tsx:19` |
| DOCX-S087 | 导航：编辑回原富标题；覆盖Inspector先关；普通0–9与编号特殊禁用原因 | `packages/office/src/editors/DocxViewPanel.tsx:166` |
| DOCX-S088 | 导航：标题层级显式应用一次PM/版本/dirty；纯跳转不写 | `packages/office/src/editors/DocxViewPanel.tsx:245` |
| DOCX-S089 | 阅读：正文不可直接输入，Agent写前退出提示；CtrlF退出并聚焦 | `packages/office/src/editors/DocxEditor.tsx:1451` |
| DOCX-S090 | 墨迹：选择/笔/荧光笔/擦除/退出，真实画布手势与颜色笔宽 | `packages/office/src/editors/DocxInkControls.tsx:21` |
| DOCX-S091 | 墨迹设置：已选/无选/未知原资源原因、删除选中、清除全层二次确认 | `packages/office/src/editors/DocxInkControls.tsx:68` |
| DOCX-S092 | 墨迹手势取消：滚动/缩放/外部写/第二pointer，保存重开像素与UndoRedo | `packages/office/src/editors/DocxInkOverlay.tsx:82` |

### 参数化动态入口（各 value 是独立子 ID）

下列具体枚举来自同一源码的数组/循环，避免只捕获字面 label 后漏掉真正按钮。色板各色值沿当前源码枚举，子 ID 用十六进制值；不新增颜色体系。

| ID / 子 ID | 实际枚举或展开 | 证据 |
|---|---|---|
| DOCX-D001:home/insert/picture/design/draw/layout/references/review/table/view | 分类tab键；picture仅选图 | `DocxEditor.tsx:3230` |
| DOCX-D002:style/font/size/marks/font-extra/alignment/lists/insert/picture-tools/references-toc/references-caption/references-citation/references-index/references-field/paragraph/design-theme/design-background/page-setup/watermark/undo-structure/header-footer/document-compare/document-protection/review/table/table-design/document-view/document-zoom/document-split/document-navigation/find/export-current/ink-tools | 全部具名折叠组，在实际窄宽下逐组进入 | `DocxEditor.tsx:3242–3495` |
| DOCX-D003:p/h0/h1…h9/quote | 文档真实可用标题样式+正文/引用；没有样式不伪造可选 | `DocxEditor.tsx:2568–2577` |
| DOCX-D004:grow/shrink; font:$name; size:$halfPoints | 字体/字号选项按当前实际文档枚举；每项保完整名称 | `DocxEditor.tsx:2588–2682` |
| DOCX-D005:sentence/lower/upper/title | 大小写4模式（含示例） | `docx-case.ts:20–25` |
| DOCX-D006:footnote/endnote | 新增注释分别入口，模式相关标题/文本及真实版本 | `DocxEditor.tsx:3062–3086` |
| DOCX-D007:TEXT_COLORS:$hex/HIGHLIGHT_COLORS:$hex/SHADING_COLORS:$hex/CELL_FILLS:$hex/clear | 各域内每个色块和清除都需可见当前色与准确作用范围；不要混淆作者色和chrome色 | `DocxEditor.tsx:439–511` |
| DOCX-D008:top/right/bottom/left; none/atLeast/exact; ltr/rtl | 页边距、行高/固定行距与文字方向 | `DocxAdvancedControls.tsx:498–537`, `DocxEditor.tsx:2899–2910,3802–3845` |
| DOCX-D009:row-before/row-after/row-del/col-before/col-after/col-del/merge/split/table-del | 表格结构动作与针对当前真实选区禁用理由 | `DocxEditor.tsx:4022–4053` |
| DOCX-D010:top/center/bottom; all/none/bottom-border | 单元格垂直对齐及3种边框操作 | `DocxEditor.tsx:4093–4139` |
| DOCX-D011:track/current-accept/current-reject/all-accept/all-reject/prev/next | 修订开关及6条动作，计数项只是说明 | `DocxEditor.tsx:4288–4340` |
| DOCX-D012:bar/line/pie; series:$index:add/remove/name/values | 新建图表3类型与1–20动态系列；已有图表不允许改变类型与系列数 | `DocxAdvancedControls.tsx:89–229` |
| DOCX-D013:nextPage/continuous/evenPage/oddPage; decimal/lowerRoman/upperRoman/lowerLetter/upperLetter/decimalFullWidth | 分节符/页码格式 | `DocxAdvancedControls.tsx:570–632` |
| DOCX-D014:toc/caption/citation/source/bibliography/mark/index/field | 引用完整8模式，顶部选择与底部动作随mode更换 | `DocxReferencesControls.tsx:27–37,170–190` |
| DOCX-D015:DATE/TIME/PAGE/NUMPAGES/FILENAME/AUTHOR/TITLE/SEQ/REF/PAGEREF/STYLEREF | 原生字段类型选项，字段代码和当前显示文字分别编辑 | `DocxReferencesControls.tsx:38–50` |
| DOCX-D016:Book/JournalArticle/InternetSite/Report/Misc | 来源类型实际 SOURCE_TYPES 的5项 | `docx-references.ts:31–37` |
| DOCX-D017:theme:$name/font:$scheme/palette:$name; original | 原件主题/字体/色板/恢复原件，实际库枚举不人工伪造 | `DocxDesignControls.tsx:194–301` |
| DOCX-D018:bullet/ordered/multilevel; level:0…8; format:$value; after:$value | 列表样式库/9级定义/编号与跟随字符，值沿文档和固定库 | `DocxListControls.tsx:141–307`, `docx-lists.ts` |
| DOCX-D019:paragraph/character/table; style:$styleId; basedOn:$styleId; toggle:$field | 样式类型/文档真实定义/继承及加粗斜体下划线删除线大写小大写/分页3项 | `DocxStyleControls.tsx:243–340` |
| DOCX-D020:crop-top/crop-right/crop-bottom/crop-left; handle:8-directions/move | 裁切数值、8个把手、移动保留区，键盘方向/Shift加速 | `DocxImageControls.tsx:327–395`, `DocxImageCropPreview.tsx:88–198` |
| DOCX-D021:readOnly/comments/forms/trackedChanges; preserve/replace/clear | 编辑限制4模式、修改/限制密码的原生意图，不可因UI改变放宽权限 | `DocxProtectionSettingsControls.tsx:13–24,197–300` |
| DOCX-D022:change/remove; encrypted/plain; match/mismatch | 打开密码操作与当前/已保存状态 | `DocxEncryptionControls.tsx:98–241` |
| DOCX-D023:select/pen/highlighter/eraser; color:$hex; width:$number | 墨迹Ribbon工具与设置，指针手势需真实Canvas另验 | `DocxInkControls.tsx:21–67,112–171` |
| DOCX-D024:firstRow/lastRow/firstColumn/lastColumn/bandedRows/bandedColumns; border:$edge | 表格条件与暂存边框，当前真实类型及浮动定位不丢 | `DocxTableDesignControls.tsx:215–305` |

参数化动态子 ID 标识枚举范围，不承诺所有可能文档/字体组合可穷举；归档列出当前fixture实际出现的值。当前源码的来源类型与表格条件项已逐项复核，保留真实存储值，不使用OOXML反向开关名替代UI模型值。

### 静态标签控件完整索引

包括Toolbar字段/动作/分组、aria-label界面容器。每行保留精修前源码位置；组件类型由最近对应 JSX 开标签标注，动态逻辑另见上表和状态表。

| ID | 组件/范围 | 可见/可访问标签 | 精修前源码证据 |
|---|---|---|---|
| DOCX-U001 | HTMLButtonElement | 拆分视图 | `packages/office/src/editors/DocxEditor.tsx:1732` |
| DOCX-U002 | HTMLButtonElement | 拆分视图 | `packages/office/src/editors/DocxEditor.tsx:1743` |
| DOCX-U003 | HTMLButtonElement | 文档导航 | `packages/office/src/editors/DocxEditor.tsx:1780` |
| DOCX-U004 | ToolbarButton | 重试 | `packages/office/src/editors/DocxEditor.tsx:1980` |
| DOCX-U005 | ToolbarButton | 导出当前 DOCX 副本 | `packages/office/src/editors/DocxEditor.tsx:2203` |
| DOCX-U006 | ToolbarButton | 停止生成副本 | `packages/office/src/editors/DocxEditor.tsx:2244` |
| DOCX-U007 | ToolbarButton | 关闭文档属性面板 | `packages/office/src/editors/DocxEditor.tsx:2397` |
| DOCX-U008 | ToolbarButton | 撤销 (Ctrl+Z) | `packages/office/src/editors/DocxEditor.tsx:2554` |
| DOCX-U009 | ToolbarButton | 重做 (Ctrl+Shift+Z) | `packages/office/src/editors/DocxEditor.tsx:2557` |
| DOCX-U010 | ToolbarButton | 撤销 (Ctrl+Z) | `packages/office/src/editors/DocxEditor.tsx:2582` |
| DOCX-U011 | ToolbarButton | 重做 (Ctrl+Shift+Z) | `packages/office/src/editors/DocxEditor.tsx:2593` |
| DOCX-U012 | ToolbarSelect | 段落样式 | `packages/office/src/editors/DocxEditor.tsx:2607` |
| DOCX-U013 | ToolbarGroup | 字体 | `packages/office/src/editors/DocxEditor.tsx:2615` |
| DOCX-U014 | ToolbarSelect | 中文字体 | `packages/office/src/editors/DocxEditor.tsx:2618` |
| DOCX-U015 | ToolbarSelect | 西文字体 | `packages/office/src/editors/DocxEditor.tsx:2627` |
| DOCX-U016 | ToolbarGroup | 字号 | `packages/office/src/editors/DocxEditor.tsx:2639` |
| DOCX-U017 | ToolbarSelect | 字号（磅） | `packages/office/src/editors/DocxEditor.tsx:2642` |
| DOCX-U018 | ToolbarButton | 减小字号 | `packages/office/src/editors/DocxEditor.tsx:2667` |
| DOCX-U019 | ToolbarButton | 增大字号 | `packages/office/src/editors/DocxEditor.tsx:2679` |
| DOCX-U020 | ToolbarGroup | 字符格式 | `packages/office/src/editors/DocxEditor.tsx:2693` |
| DOCX-U021 | ToolbarButton | 加粗 (Ctrl+B) | `packages/office/src/editors/DocxEditor.tsx:2695` |
| DOCX-U022 | ToolbarButton | 倾斜 (Ctrl+I) | `packages/office/src/editors/DocxEditor.tsx:2703` |
| DOCX-U023 | ToolbarButton | 下划线 (Ctrl+U) | `packages/office/src/editors/DocxEditor.tsx:2711` |
| DOCX-U024 | ToolbarGroup | 其他字符格式 | `packages/office/src/editors/DocxEditor.tsx:2721` |
| DOCX-U025 | ToolbarButton | 删除线 | `packages/office/src/editors/DocxEditor.tsx:2729` |
| DOCX-U026 | ToolbarButton | 上标 | `packages/office/src/editors/DocxEditor.tsx:2737` |
| DOCX-U027 | ToolbarButton | 下标 | `packages/office/src/editors/DocxEditor.tsx:2749` |
| DOCX-U028 | ToolbarColorPicker | 字体颜色 | `packages/office/src/editors/DocxEditor.tsx:2761` |
| DOCX-U029 | ToolbarColorPicker | 文本突出显示 | `packages/office/src/editors/DocxEditor.tsx:2769` |
| DOCX-U030 | ToolbarButton | 清除格式 | `packages/office/src/editors/DocxEditor.tsx:2777` |
| DOCX-U031 | ToolbarToggleGroup | 对齐方式 | `packages/office/src/editors/DocxEditor.tsx:2823` |
| DOCX-U032 | ToolbarGroup | 列表与缩进 | `packages/office/src/editors/DocxEditor.tsx:2837` |
| DOCX-U033 | ToolbarButton | 项目符号列表 | `packages/office/src/editors/DocxEditor.tsx:2839` |
| DOCX-U034 | ToolbarButton | 编号列表 | `packages/office/src/editors/DocxEditor.tsx:2847` |
| DOCX-U035 | ToolbarButton | 减少缩进 | `packages/office/src/editors/DocxEditor.tsx:2854` |
| DOCX-U036 | ToolbarButton | 增加缩进 | `packages/office/src/editors/DocxEditor.tsx:2857` |
| DOCX-U037 | ToolbarSelect | 行距（倍数） | `packages/office/src/editors/DocxEditor.tsx:2865` |
| DOCX-U038 | ToolbarColorPicker | 段落底纹 | `packages/office/src/editors/DocxEditor.tsx:2883` |
| DOCX-U039 | ToolbarToggleGroup | 文字方向 | `packages/office/src/editors/DocxEditor.tsx:2900` |
| DOCX-U040 | ToolbarGroup | 段落位置 | `packages/office/src/editors/DocxEditor.tsx:2910` |
| DOCX-U041 | ToolbarButton | 上移这一段 (Alt+Shift+↑) | `packages/office/src/editors/DocxEditor.tsx:2912` |
| DOCX-U042 | ToolbarButton | 下移这一段 (Alt+Shift+↓) | `packages/office/src/editors/DocxEditor.tsx:2920` |
| DOCX-U043 | ToolbarButton | 表格操作 | `packages/office/src/editors/DocxEditor.tsx:2934` |
| DOCX-U044 | ToolbarButton | 插入表格 | `packages/office/src/editors/DocxEditor.tsx:3052` |
| DOCX-U045 | ToolbarMenu | 插入表格 | `packages/office/src/editors/DocxEditor.tsx:3057` |
| DOCX-U046 | ToolbarGroup | 插入 | `packages/office/src/editors/DocxEditor.tsx:3062` |
| DOCX-U047 | ToolbarButton | 插入脚注或尾注 | `packages/office/src/editors/DocxEditor.tsx:3084` |
| DOCX-U048 | ToolbarFileButton | 插入图片 | `packages/office/src/editors/DocxEditor.tsx:3089` |
| DOCX-U049 | ToolbarButton | 插入链接 | `packages/office/src/editors/DocxEditor.tsx:3103` |
| DOCX-U050 | ToolbarMenu | 插入链接 | `packages/office/src/editors/DocxEditor.tsx:3108` |
| DOCX-U051 | ToolbarButton | 插入分页符 (Ctrl+Enter) | `packages/office/src/editors/DocxEditor.tsx:3116` |
| DOCX-U052 | ToolbarButton | 查找和替换 (Ctrl+F) | `packages/office/src/editors/DocxEditor.tsx:3127` |
| DOCX-U053 | ToolbarMenu | 页眉和页脚 | `packages/office/src/editors/DocxEditor.tsx:3138` |
| DOCX-U054 | ToolbarButton | 页眉和页脚 | `packages/office/src/editors/DocxEditor.tsx:3151` |
| DOCX-U055 | ToolbarMenu | 添加批注 | `packages/office/src/editors/DocxEditor.tsx:3167` |
| DOCX-U056 | ToolbarButton | 添加批注 | `packages/office/src/editors/DocxEditor.tsx:3176` |
| DOCX-U057 | ToolbarMenu | 修订 | `packages/office/src/editors/DocxEditor.tsx:3184` |
| DOCX-U058 | ToolbarButton | 撤销上次结构操作 | `packages/office/src/editors/DocxEditor.tsx:3385` |
| DOCX-U059 | ToolbarButton | 导出当前 DOCX 副本 | `packages/office/src/editors/DocxEditor.tsx:3476` |
| DOCX-U060 | ToolbarMenuFields | 添加批注 | `packages/office/src/editors/DocxEditor.tsx:3589` |
| DOCX-U061 | ToolbarTextArea | 批注内容 | `packages/office/src/editors/DocxEditor.tsx:3595` |
| DOCX-U062 | ToolbarButton | 添加批注到文档 | `packages/office/src/editors/DocxEditor.tsx:3602` |
| DOCX-U063 | ToolbarMenuFields | 页眉和页脚 | `packages/office/src/editors/DocxEditor.tsx:3641` |
| DOCX-U064 | ToolbarSelect | 编辑位置 | `packages/office/src/editors/DocxEditor.tsx:3644` |
| DOCX-U065 | ToolbarButton | 段落间距与缩进 | `packages/office/src/editors/DocxEditor.tsx:3718` |
| DOCX-U066 | ToolbarMenu | 段落间距与缩进 | `packages/office/src/editors/DocxEditor.tsx:3724` |
| DOCX-U067 | ToolbarMenuFields | 段落间距与缩进 | `packages/office/src/editors/DocxEditor.tsx:3728` |
| DOCX-U068 | TwipsField | 段前 | `packages/office/src/editors/DocxEditor.tsx:3730` |
| DOCX-U069 | TwipsField | 段后 | `packages/office/src/editors/DocxEditor.tsx:3735` |
| DOCX-U070 | TwipsField | 左缩进 | `packages/office/src/editors/DocxEditor.tsx:3740` |
| DOCX-U071 | TwipsField | 右缩进 | `packages/office/src/editors/DocxEditor.tsx:3745` |
| DOCX-U072 | TwipsField | 首行（负值=悬挂） | `packages/office/src/editors/DocxEditor.tsx:3754` |
| DOCX-U073 | ToolbarButton | 清除这一段的间距与缩进 | `packages/office/src/editors/DocxEditor.tsx:3760` |
| DOCX-U074 | ToolbarButton | 固定行距 | `packages/office/src/editors/DocxEditor.tsx:3797` |
| DOCX-U075 | ToolbarMenu | 固定行距 | `packages/office/src/editors/DocxEditor.tsx:3803` |
| DOCX-U076 | ToolbarMenuFields | 固定行距 | `packages/office/src/editors/DocxEditor.tsx:3806` |
| DOCX-U077 | ToolbarSelect | 行距规则 | `packages/office/src/editors/DocxEditor.tsx:3808` |
| DOCX-U078 | TwipsField | 行高 | `packages/office/src/editors/DocxEditor.tsx:3828` |
| DOCX-U079 | ToolbarButton | 回到自动行距 | `packages/office/src/editors/DocxEditor.tsx:3839` |
| DOCX-U080 | ToolbarMenuFields | 插入表格 | `packages/office/src/editors/DocxEditor.tsx:3871` |
| DOCX-U081 | ToolbarGridPicker | 插入表格的大小 | `packages/office/src/editors/DocxEditor.tsx:3873` |
| DOCX-U082 | ToolbarMenuFields | 链接地址 | `packages/office/src/editors/DocxEditor.tsx:3907` |
| DOCX-U083 | ToolbarTextField | 链接地址 | `packages/office/src/editors/DocxEditor.tsx:3910` |
| DOCX-U084 | ToolbarButton | 应用链接 | `packages/office/src/editors/DocxEditor.tsx:3917` |
| DOCX-U085 | ToolbarButton | 移除链接 | `packages/office/src/editors/DocxEditor.tsx:3921` |
| DOCX-U086 | ToolbarMenu | 表格 | `packages/office/src/editors/DocxEditor.tsx:4016` |
| DOCX-U087 | ToolbarMenuFields | 单元格 | `packages/office/src/editors/DocxEditor.tsx:4059` |
| DOCX-U088 | ToolbarColorPicker | 单元格底纹 | `packages/office/src/editors/DocxEditor.tsx:4074` |
| DOCX-U089 | ToolbarGroup | 垂直对齐 | `packages/office/src/editors/DocxEditor.tsx:4084` |
| DOCX-U090 | ToolbarGroup | 单元格边框 | `packages/office/src/editors/DocxEditor.tsx:4102` |
| DOCX-U091 | ToolbarMenuFields | 表格属性 | `packages/office/src/editors/DocxEditor.tsx:4144` |
| DOCX-U092 | ToolbarNumberField | 行高 | `packages/office/src/editors/DocxEditor.tsx:4147` |
| DOCX-U093 | ToolbarSelect | 行高规则 | `packages/office/src/editors/DocxEditor.tsx:4159` |
| DOCX-U094 | ToolbarButton | 重复标题行 | `packages/office/src/editors/DocxEditor.tsx:4173` |
| DOCX-U095 | ToolbarNumberField | 左边距 | `packages/office/src/editors/DocxEditor.tsx:4199` |
| DOCX-U096 | ToolbarSelect | 表格对齐 | `packages/office/src/editors/DocxEditor.tsx:4217` |
| DOCX-U097 | ToolbarSelect | 自动调整 | `packages/office/src/editors/DocxEditor.tsx:4230` |
| DOCX-U098 | ToolbarSelect | 图表类型 | `packages/office/src/editors/DocxAdvancedControls.tsx:135` |
| DOCX-U099 | ToolbarTextField | 图表标题 | `packages/office/src/editors/DocxAdvancedControls.tsx:146` |
| DOCX-U100 | ToolbarTextArea | 图表分类（每行一项） | `packages/office/src/editors/DocxAdvancedControls.tsx:148` |
| DOCX-U101 | ToolbarButton | 添加图表系列 | `packages/office/src/editors/DocxAdvancedControls.tsx:188` |
| DOCX-U102 | ToolbarMenuFields | 文本框 | `packages/office/src/editors/DocxAdvancedControls.tsx:248` |
| DOCX-U103 | ToolbarTextArea | 文本框内容 | `packages/office/src/editors/DocxAdvancedControls.tsx:249` |
| DOCX-U104 | ToolbarNumberField | 文本框宽度（磅） | `packages/office/src/editors/DocxAdvancedControls.tsx:251` |
| DOCX-U105 | ToolbarNumberField | 文本框高度（磅） | `packages/office/src/editors/DocxAdvancedControls.tsx:258` |
| DOCX-U106 | ToolbarNumberField | 文本框横向位置（磅） | `packages/office/src/editors/DocxAdvancedControls.tsx:265` |
| DOCX-U107 | ToolbarNumberField | 文本框纵向位置（磅） | `packages/office/src/editors/DocxAdvancedControls.tsx:272` |
| DOCX-U108 | ToolbarSelect | 文本框定位基准 | `packages/office/src/editors/DocxAdvancedControls.tsx:281` |
| DOCX-U109 | ToolbarSelect | 文本框环绕方式 | `packages/office/src/editors/DocxAdvancedControls.tsx:292` |
| DOCX-U110 | ToolbarNumberField | 文本框字号（磅） | `packages/office/src/editors/DocxAdvancedControls.tsx:301` |
| DOCX-U111 | ToolbarSelect | 文本框字重 | `packages/office/src/editors/DocxAdvancedControls.tsx:310` |
| DOCX-U112 | ToolbarSelect | 文本框文字对齐 | `packages/office/src/editors/DocxAdvancedControls.tsx:321` |
| DOCX-U113 | ToolbarMenuFields | 文本框文字颜色 | `packages/office/src/editors/DocxAdvancedControls.tsx:331` |
| DOCX-U114 | ToolbarColorPicker | 文本框文字颜色 | `packages/office/src/editors/DocxAdvancedControls.tsx:336` |
| DOCX-U115 | ToolbarMenuFields | 文本框填充颜色 | `packages/office/src/editors/DocxAdvancedControls.tsx:342` |
| DOCX-U116 | ToolbarColorPicker | 文本框填充颜色 | `packages/office/src/editors/DocxAdvancedControls.tsx:347` |
| DOCX-U117 | ToolbarMenuFields | 文本框边框颜色 | `packages/office/src/editors/DocxAdvancedControls.tsx:354` |
| DOCX-U118 | ToolbarColorPicker | 文本框边框颜色 | `packages/office/src/editors/DocxAdvancedControls.tsx:359` |
| DOCX-U119 | ToolbarButton | 插入文本框到文档 | `packages/office/src/editors/DocxAdvancedControls.tsx:367` |
| DOCX-U120 | ToolbarMenuFields | 页面与节设置 | `packages/office/src/editors/DocxAdvancedControls.tsx:432` |
| DOCX-U121 | ToolbarSelect | 目标节 | `packages/office/src/editors/DocxAdvancedControls.tsx:436` |
| DOCX-U122 | ToolbarSelect | 纸张方向 | `packages/office/src/editors/DocxAdvancedControls.tsx:470` |
| DOCX-U123 | ToolbarNumberField | 纸张宽度（磅） | `packages/office/src/editors/DocxAdvancedControls.tsx:485` |
| DOCX-U124 | ToolbarNumberField | 纸张高度（磅） | `packages/office/src/editors/DocxAdvancedControls.tsx:492` |
| DOCX-U125 | ToolbarMenuFields | 页边距与分栏 | `packages/office/src/editors/DocxAdvancedControls.tsx:498` |
| DOCX-U126 | ToolbarNumberField | 分栏数 | `packages/office/src/editors/DocxAdvancedControls.tsx:510` |
| DOCX-U127 | ToolbarNumberField | 栏间距（磅） | `packages/office/src/editors/DocxAdvancedControls.tsx:517` |
| DOCX-U128 | ToolbarMenuFields | 页眉页脚与页码 | `packages/office/src/editors/DocxAdvancedControls.tsx:524` |
| DOCX-U129 | ToolbarNumberField | 页眉距纸边（磅） | `packages/office/src/editors/DocxAdvancedControls.tsx:526` |
| DOCX-U130 | ToolbarNumberField | 页脚距纸边（磅） | `packages/office/src/editors/DocxAdvancedControls.tsx:533` |
| DOCX-U131 | ToolbarSelect | 首页页眉页脚 | `packages/office/src/editors/DocxAdvancedControls.tsx:542` |
| DOCX-U132 | ToolbarSelect | 页码编号方式 | `packages/office/src/editors/DocxAdvancedControls.tsx:553` |
| DOCX-U133 | ToolbarNumberField | 页码起始值 | `packages/office/src/editors/DocxAdvancedControls.tsx:562` |
| DOCX-U134 | ToolbarSelect | 页码格式 | `packages/office/src/editors/DocxAdvancedControls.tsx:573` |
| DOCX-U135 | ToolbarButton | 应用页面设置 | `packages/office/src/editors/DocxAdvancedControls.tsx:587` |
| DOCX-U136 | ToolbarMenuFields | 插入分节符 | `packages/office/src/editors/DocxAdvancedControls.tsx:611` |
| DOCX-U137 | ToolbarSelect | 分节符类型 | `packages/office/src/editors/DocxAdvancedControls.tsx:615` |
| DOCX-U138 | ToolbarButton | 在当前段后插入分节符 | `packages/office/src/editors/DocxAdvancedControls.tsx:626` |
| DOCX-U139 | ToolbarMenuFields | 文档水印 | `packages/office/src/editors/DocxAdvancedControls.tsx:683` |
| DOCX-U140 | ToolbarTextField | 水印文字 | `packages/office/src/editors/DocxAdvancedControls.tsx:684` |
| DOCX-U141 | ToolbarNumberField | 水印不透明度（百分比） | `packages/office/src/editors/DocxAdvancedControls.tsx:686` |
| DOCX-U142 | ToolbarSelect | 水印方向 | `packages/office/src/editors/DocxAdvancedControls.tsx:695` |
| DOCX-U143 | ToolbarTextField | 水印字体 | `packages/office/src/editors/DocxAdvancedControls.tsx:703` |
| DOCX-U144 | ToolbarSelect | 水印字重 | `packages/office/src/editors/DocxAdvancedControls.tsx:707` |
| DOCX-U145 | ToolbarSelect | 水印字形 | `packages/office/src/editors/DocxAdvancedControls.tsx:718` |
| DOCX-U146 | ToolbarMenuFields | 水印颜色 | `packages/office/src/editors/DocxAdvancedControls.tsx:726` |
| DOCX-U147 | ToolbarColorPicker | 水印颜色 | `packages/office/src/editors/DocxAdvancedControls.tsx:731` |
| DOCX-U148 | ToolbarButton | 应用文字水印 | `packages/office/src/editors/DocxAdvancedControls.tsx:738` |
| DOCX-U149 | ToolbarFileButton | 选择水印图片 | `packages/office/src/editors/DocxAdvancedControls.tsx:756` |
| DOCX-U150 | ToolbarNumberField | 图片水印缩放（百分比） | `packages/office/src/editors/DocxAdvancedControls.tsx:790` |
| DOCX-U151 | ToolbarSelect | 图片水印冲蚀 | `packages/office/src/editors/DocxAdvancedControls.tsx:797` |
| DOCX-U152 | ToolbarButton | 应用图片水印 | `packages/office/src/editors/DocxAdvancedControls.tsx:808` |
| DOCX-U153 | ToolbarButton | 移除文档水印 | `packages/office/src/editors/DocxAdvancedControls.tsx:823` |
| DOCX-U154 | ToolbarMenuFields | 批注位置 | `packages/office/src/editors/DocxAdvancedControls.tsx:887` |
| DOCX-U155 | ToolbarTextArea | 批注内容 | `packages/office/src/editors/DocxAdvancedControls.tsx:899` |
| DOCX-U156 | ToolbarButton | 添加批注到文档 | `packages/office/src/editors/DocxAdvancedControls.tsx:907` |
| DOCX-U157 | ToolbarMenuFields | 当前讨论 | `packages/office/src/editors/DocxAdvancedControls.tsx:985` |
| DOCX-U158 | ToolbarSelect | 选择批注 | `packages/office/src/editors/DocxAdvancedControls.tsx:1004` |
| DOCX-U159 | ToolbarTextArea | 批注正文 | `packages/office/src/editors/DocxAdvancedControls.tsx:1032` |
| DOCX-U160 | ToolbarTextArea | 批注回复 | `packages/office/src/editors/DocxAdvancedControls.tsx:1040` |
| DOCX-U161 | ToolbarButton | 保存批注修改 | `packages/office/src/editors/DocxAdvancedControls.tsx:1061` |
| DOCX-U162 | ToolbarButton | 回复当前批注 | `packages/office/src/editors/DocxAdvancedControls.tsx:1068` |
| DOCX-U163 | ToolbarButton | 重新打开批注讨论 | `packages/office/src/editors/DocxAdvancedControls.tsx:1086` |
| DOCX-U164 | ToolbarButton | 解决当前批注 | `packages/office/src/editors/DocxAdvancedControls.tsx:1097` |
| DOCX-U165 | ToolbarButton | 删除当前批注 | `packages/office/src/editors/DocxAdvancedControls.tsx:1115` |
| DOCX-U166 | ToolbarMenuFields | 管理脚注与尾注 | `packages/office/src/editors/DocxAdvancedControls.tsx:1145` |
| DOCX-U167 | ToolbarSelect | 选择脚注或尾注 | `packages/office/src/editors/DocxAdvancedControls.tsx:1153` |
| DOCX-U168 | ToolbarTextField | 查找注释文字 | `packages/office/src/editors/DocxAdvancedControls.tsx:1172` |
| DOCX-U169 | ToolbarTextArea | 替换注释文字为 | `packages/office/src/editors/DocxAdvancedControls.tsx:1173` |
| DOCX-U170 | ToolbarButton | 应用注释修改 | `packages/office/src/editors/DocxAdvancedControls.tsx:1175` |
| DOCX-U171 | ToolbarButton | 删除当前注释 | `packages/office/src/editors/DocxAdvancedControls.tsx:1211` |
| DOCX-U172 | ToolbarMenu | 大小写 | `packages/office/src/editors/DocxCaseControls.tsx:68` |
| DOCX-U173 | input | 选择对比 DOCX | `packages/office/src/editors/DocxCompareControls.tsx:96` |
| DOCX-U174 | ToolbarButton | 选择对比文档 | `packages/office/src/editors/DocxCompareControls.tsx:107` |
| DOCX-U175 | ol | 文档差异 | `packages/office/src/editors/DocxComparePanel.tsx:29` |
| DOCX-U176 | ToolbarButton | 重置设计草稿 | `packages/office/src/editors/DocxDesignControls.tsx:134` |
| DOCX-U177 | ToolbarButton | 应用设计 | `packages/office/src/editors/DocxDesignControls.tsx:139` |
| DOCX-U178 | ToolbarMenuFields | 文档主题 | `packages/office/src/editors/DocxDesignControls.tsx:194` |
| DOCX-U179 | div | 主题预设 | `packages/office/src/editors/DocxDesignControls.tsx:199` |
| DOCX-U180 | ToolbarMenuFields | 主题字体 | `packages/office/src/editors/DocxDesignControls.tsx:227` |
| DOCX-U181 | ToolbarSelect | 字体方案 | `packages/office/src/editors/DocxDesignControls.tsx:230` |
| DOCX-U182 | ToolbarMenuFields | 主题颜色 | `packages/office/src/editors/DocxDesignControls.tsx:257` |
| DOCX-U183 | div | 主题色板 | `packages/office/src/editors/DocxDesignControls.tsx:259` |
| DOCX-U184 | ToolbarButton | 恢复原件主题 | `packages/office/src/editors/DocxDesignControls.tsx:275` |
| DOCX-U185 | ToolbarMenuFields | 方案预览 | `packages/office/src/editors/DocxDesignControls.tsx:284` |
| DOCX-U186 | div | 主题方案预览 | `packages/office/src/editors/DocxDesignControls.tsx:287` |
| DOCX-U187 | ToolbarMenuFields | 页面颜色 · 全文 | `packages/office/src/editors/DocxDesignControls.tsx:330` |
| DOCX-U188 | ToolbarColorPicker | 页面底色 | `packages/office/src/editors/DocxDesignControls.tsx:338` |
| DOCX-U189 | ToolbarSelect | 边框 | `packages/office/src/editors/DocxDesignControls.tsx:366` |
| DOCX-U190 | ToolbarSelect | 边框应用范围 | `packages/office/src/editors/DocxDesignControls.tsx:385` |
| DOCX-U191 | ToolbarMenuFields | 页面效果预览 | `packages/office/src/editors/DocxDesignControls.tsx:404` |
| DOCX-U192 | div | 页面效果示意 | `packages/office/src/editors/DocxDesignControls.tsx:408` |
| DOCX-U193 | Input.Password | 打开密码 | `packages/office/src/editors/DocxEncryptionControls.tsx:59` |
| DOCX-U194 | ToolbarButton | 取消本地打开 | `packages/office/src/editors/DocxEncryptionControls.tsx:72` |
| DOCX-U195 | ToolbarSelect | 打开密码操作 | `packages/office/src/editors/DocxEncryptionControls.tsx:174` |
| DOCX-U196 | Input.Password | 新的打开密码 | `packages/office/src/editors/DocxEncryptionControls.tsx:196` |
| DOCX-U197 | Input.Password | 再次输入打开密码 | `packages/office/src/editors/DocxEncryptionControls.tsx:207` |
| DOCX-U198 | HTMLButtonElement | 裁切选中图片 | `packages/office/src/editors/DocxImageControls.tsx:67` |
| DOCX-U199 | ToolbarNumberField | 去背景容差 | `packages/office/src/editors/DocxImageControls.tsx:380` |
| DOCX-U200 | ToolbarMenuFields | 尺寸与比例 | `packages/office/src/editors/DocxImageControls.tsx:401` |
| DOCX-U201 | ToolbarButton | 锁定图片纵横比 | `packages/office/src/editors/DocxImageControls.tsx:423` |
| DOCX-U202 | ToolbarMenuFields | 旋转与翻转 | `packages/office/src/editors/DocxImageControls.tsx:431` |
| DOCX-U203 | ToolbarNumberField | 图片旋转角度 | `packages/office/src/editors/DocxImageControls.tsx:433` |
| DOCX-U204 | ToolbarButton | 图片向左旋转90度 | `packages/office/src/editors/DocxImageControls.tsx:444` |
| DOCX-U205 | ToolbarButton | 图片向右旋转90度 | `packages/office/src/editors/DocxImageControls.tsx:451` |
| DOCX-U206 | ToolbarButton | 图片水平翻转 | `packages/office/src/editors/DocxImageControls.tsx:460` |
| DOCX-U207 | ToolbarButton | 图片垂直翻转 | `packages/office/src/editors/DocxImageControls.tsx:468` |
| DOCX-U208 | ToolbarMenuFields | 排列 | `packages/office/src/editors/DocxImageControls.tsx:477` |
| DOCX-U209 | ToolbarSelect | 图片对齐 | `packages/office/src/editors/DocxImageControls.tsx:479` |
| DOCX-U210 | ToolbarSelect | 图片文字环绕 | `packages/office/src/editors/DocxImageControls.tsx:490` |
| DOCX-U211 | ToolbarMenuFields | 调整图片 | `packages/office/src/editors/DocxImageControls.tsx:497` |
| DOCX-U212 | ToolbarButton | 裁切选中图片 | `packages/office/src/editors/DocxImageControls.tsx:500` |
| DOCX-U213 | ToolbarButton | 去除选中图片背景 | `packages/office/src/editors/DocxImageControls.tsx:508` |
| DOCX-U214 | ToolbarFileButton | 替换选中图片 | `packages/office/src/editors/DocxImageControls.tsx:515` |
| DOCX-U215 | ToolbarButton | 取消图片处理 | `packages/office/src/editors/DocxImageControls.tsx:539` |
| DOCX-U216 | ToolbarButton | 取消图片像素调整 | `packages/office/src/editors/DocxImageControls.tsx:544` |
| DOCX-U217 | ToolbarButton | 重置图片修改草稿 | `packages/office/src/editors/DocxImageControls.tsx:557` |
| DOCX-U218 | ToolbarButton | 应用图片格式 | `packages/office/src/editors/DocxImageControls.tsx:568` |
| DOCX-U219 | ToolbarButton | 退出绘图 | `packages/office/src/editors/DocxInkControls.tsx:58` |
| DOCX-U220 | ToolbarMenuFields | 笔 | `packages/office/src/editors/DocxInkControls.tsx:114` |
| DOCX-U221 | ToolbarColorPicker | 笔颜色 | `packages/office/src/editors/DocxInkControls.tsx:116` |
| DOCX-U222 | ToolbarNumberField | 笔宽度 | `packages/office/src/editors/DocxInkControls.tsx:125` |
| DOCX-U223 | ToolbarMenuFields | 荧光笔 | `packages/office/src/editors/DocxInkControls.tsx:136` |
| DOCX-U224 | ToolbarColorPicker | 荧光笔颜色 | `packages/office/src/editors/DocxInkControls.tsx:138` |
| DOCX-U225 | ToolbarNumberField | 荧光笔宽度 | `packages/office/src/editors/DocxInkControls.tsx:148` |
| DOCX-U226 | ToolbarButton | 取消清除笔迹 | `packages/office/src/editors/DocxInkControls.tsx:178` |
| DOCX-U227 | ToolbarButton | 确认清除笔迹 | `packages/office/src/editors/DocxInkControls.tsx:183` |
| DOCX-U228 | ToolbarButton | 删除选中笔迹 | `packages/office/src/editors/DocxInkControls.tsx:195` |
| DOCX-U229 | ToolbarButton | 清除全部笔迹 | `packages/office/src/editors/DocxInkControls.tsx:204` |
| DOCX-U230 | ToolbarMenuFields | 列表样式 | `packages/office/src/editors/DocxListControls.tsx:142` |
| DOCX-U231 | ToolbarSelect | 文档列表 | `packages/office/src/editors/DocxListControls.tsx:144` |
| DOCX-U232 | ToolbarSelect | 样式库 | `packages/office/src/editors/DocxListControls.tsx:161` |
| DOCX-U233 | div | 列表预设 | `packages/office/src/editors/DocxListControls.tsx:171` |
| DOCX-U234 | ToolbarSelect | 应用列表级别 | `packages/office/src/editors/DocxListControls.tsx:199` |
| DOCX-U235 | ToolbarMenuFields | 详细定义 | `packages/office/src/editors/DocxListControls.tsx:213` |
| DOCX-U236 | ToolbarSelect | 编辑级别 | `packages/office/src/editors/DocxListControls.tsx:215` |
| DOCX-U237 | ToolbarSelect | 编号格式 | `packages/office/src/editors/DocxListControls.tsx:225` |
| DOCX-U238 | ToolbarTextField | 编号格式文字 | `packages/office/src/editors/DocxListControls.tsx:240` |
| DOCX-U239 | ToolbarNumberField | 起始编号 | `packages/office/src/editors/DocxListControls.tsx:251` |
| DOCX-U240 | ToolbarNumberField | 文字缩进 | `packages/office/src/editors/DocxListControls.tsx:259` |
| DOCX-U241 | ToolbarNumberField | 悬挂缩进 | `packages/office/src/editors/DocxListControls.tsx:269` |
| DOCX-U242 | ToolbarSelect | 编号对齐 | `packages/office/src/editors/DocxListControls.tsx:279` |
| DOCX-U243 | ToolbarSelect | 编号之后 | `packages/office/src/editors/DocxListControls.tsx:290` |
| DOCX-U244 | div | 当前级别预览 | `packages/office/src/editors/DocxListControls.tsx:300` |
| DOCX-U245 | ToolbarButton | 重置列表草稿 | `packages/office/src/editors/DocxListControls.tsx:322` |
| DOCX-U246 | ToolbarButton | 应用列表 | `packages/office/src/editors/DocxListControls.tsx:333` |
| DOCX-U247 | ToolbarButton | 重新读取设置 | `packages/office/src/editors/DocxPrivacyControls.tsx:144` |
| DOCX-U248 | ToolbarButton | 应用设置 | `packages/office/src/editors/DocxPrivacyControls.tsx:153` |
| DOCX-U249 | ToolbarMenuFields | 原件保护 | `packages/office/src/editors/DocxProtectionControls.tsx:137` |
| DOCX-U250 | ToolbarButton | 更改保护设置 | `packages/office/src/editors/DocxProtectionControls.tsx:176` |
| DOCX-U251 | ToolbarMenuFields | 验证修改密码 | `packages/office/src/editors/DocxProtectionControls.tsx:185` |
| DOCX-U252 | ToolbarMenuFields | 表单复选框 | `packages/office/src/editors/DocxProtectionControls.tsx:219` |
| DOCX-U253 | ToolbarSelect | 选择复选框 | `packages/office/src/editors/DocxProtectionControls.tsx:223` |
| DOCX-U254 | ToolbarMenuFields | 可用操作 | `packages/office/src/editors/DocxProtectionControls.tsx:259` |
| DOCX-U255 | ToolbarButton | 取消验证 | `packages/office/src/editors/DocxProtectionControls.tsx:289` |
| DOCX-U256 | ToolbarButton | 仍然编辑此文档 | `packages/office/src/editors/DocxProtectionControls.tsx:304` |
| DOCX-U257 | ToolbarButton | 返回保护状态 | `packages/office/src/editors/DocxProtectionSettingsControls.tsx:187` |
| DOCX-U258 | ToolbarMenuFields | 编辑限制 | `packages/office/src/editors/DocxProtectionSettingsControls.tsx:197` |
| DOCX-U259 | ToolbarSelect | 启用编辑限制 | `packages/office/src/editors/DocxProtectionSettingsControls.tsx:199` |
| DOCX-U260 | ToolbarSelect | 限制模式 | `packages/office/src/editors/DocxProtectionSettingsControls.tsx:214` |
| DOCX-U261 | ToolbarSelect | 编辑限制密码操作 | `packages/office/src/editors/DocxProtectionSettingsControls.tsx:221` |
| DOCX-U262 | ToolbarMenuFields | 修改密码 | `packages/office/src/editors/DocxProtectionSettingsControls.tsx:261` |
| DOCX-U263 | ToolbarSelect | 修改密码操作 | `packages/office/src/editors/DocxProtectionSettingsControls.tsx:263` |
| DOCX-U264 | ToolbarMenuFields | 只读建议 | `packages/office/src/editors/DocxProtectionSettingsControls.tsx:294` |
| DOCX-U265 | ToolbarSelect | 打开时建议只读 | `packages/office/src/editors/DocxProtectionSettingsControls.tsx:296` |
| DOCX-U266 | ToolbarButton | 取消保护设置 | `packages/office/src/editors/DocxProtectionSettingsControls.tsx:334` |
| DOCX-U267 | ToolbarSelect | 引用工具 | `packages/office/src/editors/DocxReferencesControls.tsx:201` |
| DOCX-U268 | ToolbarMenuFields | 目录内容 | `packages/office/src/editors/DocxReferencesControls.tsx:212` |
| DOCX-U269 | ToolbarSelect | 目录目标 | `packages/office/src/editors/DocxReferencesControls.tsx:214` |
| DOCX-U270 | ol | 目录预览 | `packages/office/src/editors/DocxReferencesControls.tsx:233` |
| DOCX-U271 | ToolbarMenuFields | 题注内容 | `packages/office/src/editors/DocxReferencesControls.tsx:246` |
| DOCX-U272 | ToolbarSelect | 标签 | `packages/office/src/editors/DocxReferencesControls.tsx:248` |
| DOCX-U273 | ToolbarTextField | 题注说明 | `packages/office/src/editors/DocxReferencesControls.tsx:254` |
| DOCX-U274 | ToolbarMenuFields | 文献来源 | `packages/office/src/editors/DocxReferencesControls.tsx:265` |
| DOCX-U275 | ToolbarSelect | 当前来源 | `packages/office/src/editors/DocxReferencesControls.tsx:269` |
| DOCX-U276 | ToolbarButton | 新建来源 | `packages/office/src/editors/DocxReferencesControls.tsx:283` |
| DOCX-U277 | ToolbarTextField | 唯一标签 | `packages/office/src/editors/DocxReferencesControls.tsx:303` |
| DOCX-U278 | ToolbarSelect | 来源类型 | `packages/office/src/editors/DocxReferencesControls.tsx:311` |
| DOCX-U279 | ToolbarMenuFields | 索引标记 | `packages/office/src/editors/DocxReferencesControls.tsx:374` |
| DOCX-U280 | ToolbarTextField | 索引词 | `packages/office/src/editors/DocxReferencesControls.tsx:375` |
| DOCX-U281 | ToolbarMenuFields | 原生域 | `packages/office/src/editors/DocxReferencesControls.tsx:396` |
| DOCX-U282 | ToolbarSelect | 域类型 | `packages/office/src/editors/DocxReferencesControls.tsx:398` |
| DOCX-U283 | ToolbarTextField | 域代码 | `packages/office/src/editors/DocxReferencesControls.tsx:408` |
| DOCX-U284 | ToolbarTextField | 当前显示文字 | `packages/office/src/editors/DocxReferencesControls.tsx:409` |
| DOCX-U285 | ToolbarMenuFields | 文档样式 | `packages/office/src/editors/DocxStyleControls.tsx:48` |
| DOCX-U286 | ToolbarSelect | 选择文档样式 | `packages/office/src/editors/DocxStyleControls.tsx:50` |
| DOCX-U287 | ToolbarTextField | 样式标识 | `packages/office/src/editors/DocxStyleControls.tsx:246` |
| DOCX-U288 | ToolbarTextField | 样式名称 | `packages/office/src/editors/DocxStyleControls.tsx:252` |
| DOCX-U289 | ToolbarSelect | 样式类型 | `packages/office/src/editors/DocxStyleControls.tsx:255` |
| DOCX-U290 | ToolbarSelect | 基于样式 | `packages/office/src/editors/DocxStyleControls.tsx:266` |
| DOCX-U291 | ToolbarMenuFields | 文字 | `packages/office/src/editors/DocxStyleControls.tsx:277` |
| DOCX-U292 | ToolbarTextField | 西文字体 | `packages/office/src/editors/DocxStyleControls.tsx:279` |
| DOCX-U293 | ToolbarTextField | 中文字体 | `packages/office/src/editors/DocxStyleControls.tsx:285` |
| DOCX-U294 | ToolbarTextField | 文字颜色 | `packages/office/src/editors/DocxStyleControls.tsx:292` |
| DOCX-U295 | ToolbarMenuFields | 段落 | `packages/office/src/editors/DocxStyleControls.tsx:306` |
| DOCX-U296 | ToolbarSelect | 段落对齐 | `packages/office/src/editors/DocxStyleControls.tsx:308` |
| DOCX-U297 | ToolbarSelect | 大纲级别 | `packages/office/src/editors/DocxStyleControls.tsx:323` |
| DOCX-U298 | ToolbarMenuFields | 分页 | `packages/office/src/editors/DocxStyleControls.tsx:335` |
| DOCX-U299 | ToolbarButton | 应用样式到选区 | `packages/office/src/editors/DocxStyleControls.tsx:352` |
| DOCX-U300 | ToolbarMenuFields | 表格样式 | `packages/office/src/editors/DocxTableDesignControls.tsx:162` |
| DOCX-U301 | ToolbarSelect | 文档表格样式 | `packages/office/src/editors/DocxTableDesignControls.tsx:165` |
| DOCX-U302 | ToolbarSelect | 快速表格预设 | `packages/office/src/editors/DocxTableDesignControls.tsx:179` |
| DOCX-U303 | ToolbarMenuFields | 样式选项 | `packages/office/src/editors/DocxTableDesignControls.tsx:215` |
| DOCX-U304 | ToolbarMenuFields | 边框 | `packages/office/src/editors/DocxTableDesignControls.tsx:235` |
| DOCX-U305 | ToolbarSelect | 边框应用范围 | `packages/office/src/editors/DocxTableDesignControls.tsx:238` |
| DOCX-U306 | ToolbarSelect | 边框线型 | `packages/office/src/editors/DocxTableDesignControls.tsx:248` |
| DOCX-U307 | ToolbarNumberField | 边框线宽（磅） | `packages/office/src/editors/DocxTableDesignControls.tsx:259` |
| DOCX-U308 | ToolbarTextField | 边框颜色 | `packages/office/src/editors/DocxTableDesignControls.tsx:267` |
| DOCX-U309 | ToolbarMenuFields | 表格布局 | `packages/office/src/editors/DocxTableDesignControls.tsx:308` |
| DOCX-U310 | ToolbarSelect | 表格水平对齐 | `packages/office/src/editors/DocxTableDesignControls.tsx:311` |
| DOCX-U311 | ToolbarSelect | 表格自动调整 | `packages/office/src/editors/DocxTableDesignControls.tsx:322` |
| DOCX-U312 | ToolbarMenuFields | 文字环绕与位置 | `packages/office/src/editors/DocxTableDesignControls.tsx:332` |
| DOCX-U313 | ToolbarSelect | 表格文字环绕 | `packages/office/src/editors/DocxTableDesignControls.tsx:339` |
| DOCX-U314 | ToolbarMenuFields | 默认单元格边距 | `packages/office/src/editors/DocxTableDesignControls.tsx:442` |
| DOCX-U315 | ToolbarButton | 重置表格设计草稿 | `packages/office/src/editors/DocxTableDesignControls.tsx:473` |
| DOCX-U316 | ToolbarButton | 应用表格设计 | `packages/office/src/editors/DocxTableDesignControls.tsx:486` |
| DOCX-U317 | ToolbarMenuFields | 插入目录 | `packages/office/src/editors/DocxTocControls.tsx:50` |
| DOCX-U318 | ToolbarSelect | 目录位置 | `packages/office/src/editors/DocxTocControls.tsx:52` |
| DOCX-U319 | ol | 目录标题预览 | `packages/office/src/editors/DocxTocControls.tsx:69` |
| DOCX-U320 | ToolbarButton | 插入目录到文档 | `packages/office/src/editors/DocxTocControls.tsx:86` |
| DOCX-U321 | ToolbarGroup | 文档视图 | `packages/office/src/editors/DocxViewControls.tsx:31` |
| DOCX-U322 | ToolbarButton | 打印布局 | `packages/office/src/editors/DocxViewControls.tsx:33` |
| DOCX-U323 | ToolbarButton | Web 布局 | `packages/office/src/editors/DocxViewControls.tsx:42` |
| DOCX-U324 | ToolbarGroup | 显示比例 | `packages/office/src/editors/DocxViewControls.tsx:64` |
| DOCX-U325 | ToolbarMenu | 文档缩放 | `packages/office/src/editors/DocxViewControls.tsx:66` |
| DOCX-U326 | ToolbarButton | 实际大小 100% | `packages/office/src/editors/DocxViewControls.tsx:78` |
| DOCX-U327 | ToolbarButton | 适合页宽 | `packages/office/src/editors/DocxViewControls.tsx:85` |
| DOCX-U328 | ToolbarButton | 显示整页 | `packages/office/src/editors/DocxViewControls.tsx:94` |
| DOCX-U329 | ToolbarButton | 拆分视图 | `packages/office/src/editors/DocxViewControls.tsx:108` |
| DOCX-U330 | ToolbarButton | 文档导航 | `packages/office/src/editors/DocxViewControls.tsx:121` |
| DOCX-U331 | div | 阅读视图 | `packages/office/src/editors/DocxViewControls.tsx:135` |
| DOCX-U332 | ToolbarButton | 退出阅读模式 | `packages/office/src/editors/DocxViewControls.tsx:140` |
| DOCX-U333 | ToolbarGroup | 阅读布局 | `packages/office/src/editors/DocxViewControls.tsx:152` |
| DOCX-U334 | ToolbarButton | 打印布局 | `packages/office/src/editors/DocxViewControls.tsx:154` |
| DOCX-U335 | ToolbarButton | Web 布局 | `packages/office/src/editors/DocxViewControls.tsx:162` |
| DOCX-U336 | aside | 文档导航面板 | `packages/office/src/editors/DocxViewPanel.tsx:119` |
| DOCX-U337 | ToolbarButton | 关闭文档导航 | `packages/office/src/editors/DocxViewPanel.tsx:129` |
| DOCX-U338 | div | 页面导航 | `packages/office/src/editors/DocxViewPanel.tsx:135` |
| DOCX-U339 | ToolbarButton | 上一页 | `packages/office/src/editors/DocxViewPanel.tsx:136` |
| DOCX-U340 | ToolbarNumberField | 跳转到页 | `packages/office/src/editors/DocxViewPanel.tsx:140` |
| DOCX-U341 | ToolbarButton | 下一页 | `packages/office/src/editors/DocxViewPanel.tsx:147` |
| DOCX-U342 | section | 当前标题 | `packages/office/src/editors/DocxViewPanel.tsx:158` |
| DOCX-U343 | ToolbarButton | 编辑标题 | `packages/office/src/editors/DocxViewPanel.tsx:166` |
| DOCX-U344 | ToolbarSelect | 标题层级 | `packages/office/src/editors/DocxViewPanel.tsx:182` |
| DOCX-U345 | nav | 标题大纲 | `packages/office/src/editors/DocxViewPanel.tsx:205` |
| DOCX-U346 | ToolbarButton | 应用标题层级 | `packages/office/src/editors/DocxViewPanel.tsx:245` |
| DOCX-U347 | section | 拆分只读副本 | `packages/office/src/editors/DocxSplitView.tsx:93` |
| DOCX-U348 | ToolbarButton | 关闭拆分视图 | `packages/office/src/editors/DocxSplitView.tsx:107` |
| DOCX-U349 | div | 只读副本正文 | `packages/office/src/editors/DocxSplitView.tsx:115` |

### 最小局部精修建议（按可复现根因，不扩引擎）

1. **旧高级表单固定动作**：Chart/Textbox/Page/Watermark/Note 与 Style 的表单仍在同个 Inspector body 里整体滚动（Chart/Textbox/Watermark/Note 主动作无 primary；Page 主应用在分节符区前方，Style 仅CSS内部sticky）。优先统一自有控件布局：内部 scroll、同级固定 footer、当前任务单一 primary；保留所有字段、选区/版本与相同 execute 原语。水印文字/图片/移除和页面应用/插节符若需任务选择，只改变本地呈现，不改变调用参数或能力。
2. **窄栏父菜单退出**：`DocxEditor.tsx:2974–2990` 的 advancedMenu 只对 ink/document-compare/document-protection/comments 收起父具名菜单，图表/样式/页面等没有同等处理。建议对所有实际 Inspector 入口一致先收父层，并在338/390与690px实际编辑器宽度验证标题不被盖；Escape只关最近层，焦点回live入口/折叠组/tab。此处源码已确认路径差异，但未做浏览器实证，不提前称bug已复现。
3. **查找关闭焦点**：`DocxEditor.tsx:2235` 和2055只改findOpen，没有主编辑器focus。建议统一close callback，在Find卸载后回唯一PM的原selection，防止query/replace Escape把焦点留BODY；不改变正文、history或dirty，受保护编辑器仍保持只读。
4. **两个空白恢复/停止按钮（明确源码缺陷）**：`DocxPrivacyControls.tsx:144` 的重新读取设置、`DocxEditor.tsx:2243`的停止生成副本是无children非primary ToolbarButton；共享`EditorShell.tsx:396–397`只有primary自动输出label。补可见短文字/图标即可，勿改共用按钮fallback造成跨格式影响。
5. **设计单主动作**：`DocxDesignControls.tsx:138–147` 已有固定footer但应用设计为普通text button；可改primary且移除重复可见“应用”子文案，只保图标，沿用原label自动呈现。已有照片/引用/列表/保护/导航的成熟scroll/footer需保持，不全盘重写。
6. **样式Select忙态**：`DocxStyleControls.tsx:50,255,265,308,323`未显式disabled，依赖DocxControlForm fieldset（顶层选择在fieldset外）；Antd Select的div触发器不受原生fieldset禁用。若同轮重组Style，应为这些Select传同一busy，避免提交中切类型/继承/目标。无需扩写原生保存。

### 对比与验证矩阵

- 必需尺寸：1100px宽编辑区、690px中栏（浏览器仍1280px）、390/338px窄编辑区、420×500短高、约280px极窄Inspector可用性；宽度按编辑工作区判定。
- 必需主题：同一原件浅/深；作者正文和文档主题色按原件规则，不用chrome色覆盖作者色。前后内容、主题、尺寸相同，保持原件分页几何。
- 明确变更对比：至少旧图表/文本框/页面节/水印/注释/样式长表单，各选足够长内容使body实际滚动；footer仍可达。窄栏从最后具名组打开、子Select/色板Escape与Inspector Escape焦点路径。
- 真实交互：Find输入、下一上一/替换及关闭回PM；空白按钮变可见；图表/页面/水印/注释/样式每个当前任务至少一次有效写与失败/取消；保存/导出回读及Undo/Redo只在相同现有能力内验证。
- 不受改动影响但需源码/既有测试覆盖的高风险：原件readOnly/comments/forms/trackedChanges/密码三类/metadata scrub floor/加密副本、Agent版本与session身份、图裁切和墨迹Canvas、表格原件保真。不得以常规漂亮截图宣称这些端到端通过。
- Gallery可用公开测试fixtures和真实挂载控件；加密/文件选择/Canvas/原件保护若无浏览器证据必须显式未验，不注入伪造成功状态。测试只使用AGENTS统一账号。

### Related specs

- `.trellis/spec/office/frontend/index.md`、`editors/index.md`、`shell/index.md`：质量门`pnpm check`与实际界面验证。
- `editors/conventions.md`：actual-width具名折叠、DOCX Inspector/视图/大纲/受限讨论/原生墨迹/当前副本合同。
- `editors/pitfalls.md`：引用源与字段范围、表格条件样式原生增量、来源取消和版本接缝。
- `shell/conventions.md`：单主动作、固定footer、可见字段、快捷区和主题桥。
- `shell/pitfalls.md`：portal ownership、数字输入first-click、focus、短高和宽度链。
- `engine/conventions.md`：vendor只读、DOCX保护/密码/原件ZIP/保存安全的现行严格合同。

## Caveats / Not Found

- 本研究只读源码，未做任何产品写入、源码/规范修改、依赖升级或git操作，未登录应用；不能作为实际验收通过证据。
- 部分状态由本地Worker/文件/Canvas/后端版本决定，静态索引只能证明入口存在。所有动态配置、陌生原件、任意字体/样式不能穷举；覆盖矩阵按fixture实际值记录。
- 原件保护规范历史分期包含“早期P0不支持完整四模式”的历史说明，当前运行UI与后续W/C/F/T/E/P合同共同判断；不可照搬旧阶段限制当成当前事实。
- 本轮不需要改vendor、安全策略、save/export/Agent协议或添加Office不存在于当前Mimir的功能。先完成局部样式/布局/焦点与恢复路径即可。
