# Research: 全产品交互模块与覆盖盘点

- Query: 建立模块/页面/浮层/交互入口/状态覆盖地图，为先HTML对比认可后实现提供可追溯清单。
- Scope: internal；竞品核查由主会话统一处理。
- Date: 2026-10-18

## Findings

所有条目均为**已索引、待设计/认可/实现/验收**。源码索引不是最终覆盖率，也不是可交互HTML已完成的声明。控件标签和交互事件逐行证据见同名JSON。

### 数量与路由边界

- 建议16个评审模块（含主会话负责的基础组件）、63个语义场景组，索引209个自有TSX文件、421个大写组件函数、2577个文件内去重的静态控件标签。后两项不能当独立页面/验收用例数量。
- 共享页为`/docs`、`/chat`、`/settings`、`/login`；`/`重定向。Desktop多`/client/about`和独立setup.html首次选择入口。
- `/docs`通过`id`区分库与文档，`scope=folder:…/tag:…/all`为目录或标签筛选；`/chat`用id标会话。设置有10个共享分区+Desktop client。
- 未发现顶层工作区标签条，编辑器Ribbon、工作表页签、幻灯片导航分别归编辑格式。

| 源码 | 行 | 路由 |
|---|---:|---|
| `packages/renderer/src/routes/index.tsx` | 9 | `createFileRoute('/')` |
| `packages/renderer/src/routes/login.tsx` | 45 | `createFileRoute('/login')` |
| `packages/renderer/src/routes/_app.docs.tsx` | 16 | `createFileRoute('/_app/docs')` |
| `packages/renderer/src/routes/_app.chat.tsx` | 39 | `createFileRoute('/_app/chat')` |
| `packages/renderer/src/routes/_app.settings.tsx` | 110 | `createFileRoute('/_app/settings')` |
| `apps/desktop/src/renderer/routes/about.tsx` | 21 | `createFileRoute('/client/about')` |

### 候选模块顺序、页面与交互分支

下述顺序不构成效果批准。依赖栏是复用/联动关系，不是执行先决条件图，可以存在双向关系。文档助手与主对话分别评审宿主边界后再验证联动。每个Office格式仍须内部拆为若干完整切片，不能只画主画布便声称全部面板覆盖。

#### 1. 基础组件与系统反馈（foundation）

依赖：无。候选评审切片：主会话负责独立对比稿。


#### 2. 工作区导航与账户菜单（workspace）

依赖：foundation。候选评审切片：导航布局与目录树；最近笔记/历史会话/账户菜单。

| 场景ID与界面 | 来源 | 操作路径 | 状态 |
|---|---|---|---|
| `workspace.01` 应用壳与导航 | `packages/renderer/src/routes/_app.tsx:112` | 知识库/对话/设置切换；展开/收起及偏好记忆；窄屏rail与导航Drawer；关闭/Esc/遮罩/回焦 | default；selected；narrow；unsaved |
| `workspace.02` 目录树 | `packages/renderer/src/components/nav/FolderSection.tsx:349` | 展开折叠；选择目录；知识库创建/重命名/删除；更多菜单；键盘树导航 | loading；empty；error-retry；selected；pending；confirm |
| `workspace.03` 最近与历史 | `packages/renderer/src/components/nav/RecentNotes.tsx:7` | 最近笔记打开；历史对话选择；超长标题提示；历史读取失败重试 | loading；empty；selected；error |
| `workspace.04` 账户菜单 | `packages/renderer/src/components/nav/AccountRow.tsx:16` | 个人资料/统计/设置跳转；主题级联浅/深/系统；关闭回焦；云端登出 | session-loading；collapsed；local-mode；cloud-mode；selected |

#### 3. 搜索与命令面板（search）

依赖：foundation, workspace。候选评审切片：搜索/最近项/命令/失败恢复。

| 场景ID与界面 | 来源 | 操作路径 | 状态 |
|---|---|---|---|
| `search.01` 全局搜索与命令 | `packages/renderer/src/components/CommandPalette.tsx:300` | Cmd/Ctrl+K；输入搜索/命令；最近文档；上下键/Enter/Esc；悬停选择；打开命中与片段定位；当前文档重命名/移动/查找 | initial；loading；empty；error；results；stale-query；focus-return |

#### 4. 收集与导入（capture）

依赖：foundation, workspace。候选评审切片：网页收集；文件与文件夹上传/部分失败。

| 场景ID与界面 | 来源 | 操作路径 | 状态 |
|---|---|---|---|
| `capture.01` 链接收集 | `packages/renderer/src/components/CaptureDialog.tsx:190` | 网页/公众号/GitHub来源识别；URL/上传切换；阶段反馈；失败保留已完成阶段；成功打开；关闭取消回焦 | empty；invalid-url；valid；busy-locked；stage-error；success |
| `capture.02` 文件上传 | `packages/renderer/src/components/UploadPanel.tsx:70` | 点击/拖放；文件夹结构；串行进度；单文件超限；未知格式保存原件；部分成功；打开成功结果/继续上传 | pending；uploading；oversized；failed；partial-success；all-success；disabled |

#### 5. 知识库与目录浏览管理（library）

依赖：foundation, workspace, capture。候选评审切片：首次引导/创建；列表卡片/面包屑/标签；目录文件动作/替换删除。

| 场景ID与界面 | 来源 | 操作路径 | 状态 |
|---|---|---|---|
| `library.01` 知识库引导 | `packages/renderer/src/components/library/LibraryView.tsx:1229` | 首个知识库引导；名称/描述/图标创建；创建成功定位 | empty；invalid-name；pending；error；success |
| `library.02` 列表卡片 | `packages/renderer/src/components/library/LibraryView.tsx:96` | 库/子目录面包屑；知识库ID复制；列表/卡片偏好；tag筛选；打开笔记/文件；格式/位置/长标题 | loading；load-error；empty-folder；empty-filter；list；card；narrow |
| `library.03` 目录管理 | `packages/renderer/src/components/library/LibraryView.tsx:207` | 新建笔记/文件夹；重命名及子树定位；删除目录确认；取消保留位置 | empty；invalid-path；pending；error；success；confirm |
| `library.04` 文件动作 | `packages/renderer/src/components/library/LibraryView.tsx:192` | 行/卡片更多；编辑/下载；替换原件；删除确认；拖入收集；系统文件选择取消 | hover；keyboard；confirm；pending；error；file-cancel |

#### 6. 文档阅读与共享文档流程（document）

依赖：foundation, library, search, chat。候选评审切片：阅读框架/标题/大纲/引用；整理菜单/摘要/双链；图片音视频/降级；助手宿主与未保存流程。

| 场景ID与界面 | 来源 | 操作路径 | 状态 |
|---|---|---|---|
| `document.01` 阅读框架 | `packages/renderer/src/components/DocumentPanel.tsx:66` | 返回库/对话；标题就地编辑；重命名/移动命令弹窗；大纲锚点/滚动恢复；引用定位；保存状态 | loading；not-found；load-error；reading；dirty；saving；save-error；narrow |
| `document.02` 整理菜单 | `packages/renderer/src/components/document/doc-menu.tsx:63` | 标签建议添加/移除/清空；目录级联/移出；空菜单说明；AI建议标签/摘要 | empty-choice；current-disabled；no-body-disabled；ai-busy；error；success |
| `document.03` 非Office预览 | `packages/renderer/src/components/document/FilePreview.tsx:60` | 图片原图；音视频原生播放；Office入口；无查看器显示正文；无正文原因及下载；解码失败降级 | has-source；missing-source；parse-error；unsupported；media-error；empty-body |
| `document.04` 文档助手 | `packages/renderer/src/components/document/DocChatSidebar.tsx:72` | 打开关闭；指南/快捷提问；锁定当前文档；选段提问；窄屏返回；文档Agent能力提示 | empty-guide；history；streaming；agent-unavailable；narrow |
| `document.05` 来源双链 | `packages/renderer/src/components/document/DocumentFooter.tsx:17` | 来源跳转；标签筛选；相关笔记/双链跳转 | empty；long-source；links |
| `document.06` 离开守卫 | `packages/renderer/src/components/UnsavedGuard.tsx:37` | 继续编辑；手动丢弃；保存并离开；自动保存等待；导航/会话/设置/返回库；浏览器返回/刷新/窗口关闭路径待核实；失败留原位 | dirty-manual；dirty-auto；saving；save-failure；saved-auto；focus-return |

#### 7. AI对话与生成交互（chat）

依赖：foundation, workspace, settings, document。候选评审切片：输入范围/模型/队列；消息思考/工具/引用/媒体；失败与历史；Agent中断/截图写作交接。

| 场景ID与界面 | 来源 | 操作路径 | 状态 |
|---|---|---|---|
| `chat.01` 会话宿主 | `packages/renderer/src/routes/_app.chat.tsx:54` | 新对话空态；历史会话读取；新建URL归属；会话切换；失败重试 | empty；history-loading；history-error；long-thread |
| `chat.02` 输入与队列 | `packages/chat/src/composer/Composer.tsx:251` | Enter/Shift+Enter/IME；生成中排队/Esc停止；范围选择/移除；强度/模型菜单；上下文容量；取回队列；PPT截图草稿移除/能力设置 | empty-disabled；draft；running；queued；stopped；snapshot-error；unconfigured；narrow |
| `chat.03` 消息生成 | `packages/chat/src/parts/MessageItem.tsx:58` | 流式正文；思考折叠；检索/工具追踪；中断/工具结果；跟随滚动/回底；用户与助手信息层级 | streaming；reasoning；tool-pending；tool-success；tool-error；stopped |
| `chat.04` 引用与操作 | `packages/chat/src/parts/AnswerActions.tsx:113` | 引用预览/原文跳转；代码/回答复制；存笔记/打开笔记；图像/文件/音频；DOCX历史编辑提示 | copied；clipboard-error；note-saving；note-error；note-saved；missing-source |
| `chat.05` 失败恢复 | `packages/chat/src/parts/FailureNotice.tsx:127` | 缺配置跳设置；检索/模型错误原因；流错误重试；停止提示；保留已有正文 | configuration-error；request-error；partial-stream；cancelled；retry |

#### 8. 设置全分区（settings）

依赖：foundation, workspace。候选评审切片：供应商/模型；网络搜索；检索；订阅；存储；支持能力；统计；数据备份；外观；账号头像；客户端（Desktop）。

| 场景ID与界面 | 来源 | 操作路径 | 状态 |
|---|---|---|---|
| `settings.01` 供应商与模型 | `packages/renderer/src/components/settings/ModelsSection.tsx:45` | 列表/新增/编辑同页；预设；密钥保留替换；拉取模型/人工添加/移除；放弃更改确认；用途/任务Cascader；真实测试 | loading；empty；draft-invalid；dirty-confirm；pull-pending；probe-error；save-error；saved |
| `settings.02` 网络搜索 | `packages/renderer/src/components/settings/NetworkSearchSection.tsx:53` | Brave配置；密钥/生效状态；保存/失败恢复 | loading；error；unset；configured；disabled-source；saving |
| `settings.03` 检索索引 | `packages/renderer/src/components/settings/RetrievalSection.tsx:11` | 索引统计；补全/重建；测试检索；结果跳转 | loading；partial-index；pending；partial-failure；empty-results；error；success |
| `settings.04` RSS/Atom订阅 | `packages/renderer/src/components/settings/FeedsSection.tsx:34` | URL订阅；单源/全量更新；成功失败时间；退订确认 | loading；empty；invalid-url；pending；partial-success；error；confirm |
| `settings.05` 文件存储 | `packages/renderer/src/components/settings/StorageSection.tsx:29` | 本地/S3切换；S3凭据；测试连接；有效来源提示 | loading；local；s3；required；saving；probe-success；probe-error |
| `settings.06` 支持能力 | `packages/renderer/src/components/settings/PluginsSection.tsx:39` | 按接缝查看能力；状态原因；不可用解释 | loading；error；empty；ready；unconfigured；disabled |
| `settings.07` 统计 | `packages/renderer/src/components/settings/StatsSection.tsx:94` | 日周月用量；热力图单日提示；任务汇总；用量未上报 | loading；error；zero；unknown-usage；long-period；hover；keyboard |
| `settings.08` 数据备份 | `packages/renderer/src/components/settings/DataSection.tsx:10` | 重新扫描；Markdown/JSON导出；文件统计 | loading；pending；scan-success；scan-error；download |
| `settings.09` 外观 | `packages/renderer/src/components/settings/AppearanceSection.tsx:39` | 浅/深/系统切换；即时同步；偏好持久化 | light；dark；auto；keyboard-selected |
| `settings.10` 账号 | `packages/renderer/src/components/settings/AccountSection.tsx:46` | 头像选择/裁切/缩放/保存取消；名称保存；邮箱/本地用户 | loading；invalid-file；crop；uploading；save-error；saved；local |
| `settings.11` 客户端 | `packages/renderer/src/components/settings/ClientSection.tsx:30` | 当前模式；切换使用方式；关于页 | desktop-only；local；cloud；bridge-error |

#### 9. 登录与全局故障（login）

依赖：foundation, workspace。候选评审切片：登录/校验/本地模式；全局故障恢复。

| 场景ID与界面 | 来源 | 操作路径 | 状态 |
|---|---|---|---|
| `login.01` 登录 | `packages/renderer/src/routes/login.tsx:45` | 邮箱密码；显隐；键盘提交；验证/认证错误；成功重定向；本地模式回客户端 | empty；required；invalid-email；submitting；auth-error；local；narrow |
| `login.02` 根错误兜底 | `packages/renderer/src/routes/__root.tsx:54` | 鉴权守卫网络/HTTP错误；重试重跑守卫；Desktop更换方式 | offline；http-error；retry；desktop-fallback |

#### 10. Markdown笔记编辑器（markdown）

依赖：foundation, document, chat。候选评审切片：正文/Ribbon/查找；链接斜杠/表格/属性/特殊节点；AI草稿/保存失败。

| 场景ID与界面 | 来源 | 操作路径 | 状态 |
|---|---|---|---|
| `markdown.01` 正文与工具 | `packages/office/src/editors/MarkdownEditor.tsx:420` | 段落/字形/列表/缩进；链接/笔记链接；表格上下文；代码语言；块移动复制删除；frontmatter；查找替换；校对/导出；选区AI浮条；斜杠/图片；Math/diagram特殊节点 | loading；load-error-retry；parse-error；ready；selection；disabled-reason；dirty；saving；save-error；saved；undo-redo；narrow；focus-return |
| `markdown.02` AI草稿 | `packages/office/src/editors/MarkdownWritingPreview.tsx:119` | 生成预览；停止；完整/部分草稿；接受/丢弃；版本失效；焦点恢复 | generating；empty-partial；partial-error；stopped；accepted；discarded；stale |

实际Ribbon分类：开始、插入、笔记、审阅、表格、代码块。

实际静态工具组：导出（packages/office/src/editors/MarkdownEditor.tsx:1160）；AI（packages/office/src/editors/MarkdownEditor.tsx:1180）；查找和替换（packages/office/src/editors/MarkdownEditor.tsx:1219）；段落样式（packages/office/src/editors/MarkdownEditor.tsx:1231）；基础格式（packages/office/src/editors/MarkdownEditor.tsx:1251）；其他字形（packages/office/src/editors/MarkdownEditor.tsx:1281）；链接（packages/office/src/editors/MarkdownEditor.tsx:1342）；列表（packages/office/src/editors/MarkdownEditor.tsx:1363）；缩进（packages/office/src/editors/MarkdownEditor.tsx:1413）；插入（packages/office/src/editors/MarkdownEditor.tsx:1441）；表格（packages/office/src/editors/MarkdownEditor.tsx:1505）；代码块语言（packages/office/src/editors/MarkdownEditor.tsx:1521）；块操作（packages/office/src/editors/MarkdownEditor.tsx:1537）；属性（packages/office/src/editors/MarkdownEditor.tsx:1577）；校对（packages/office/src/editors/MarkdownEditor.tsx:1596）。

#### 11. HTML页面编辑器（html）

依赖：foundation, document, chat。候选评审切片：源码预览/设备/插入演示；元素CSS/图片；AI问题提纲/草稿。

| 场景ID与界面 | 来源 | 操作路径 | 状态 |
|---|---|---|---|
| `html.01` 编辑工作区 | `packages/office/src/editors/HtmlEditor.tsx:307` | 源码/预览/并排；设备宽度缩放；查找；撤销重做；插元素/本地图片；演示/新窗口；导出保存 | loading；load-error-retry；parse-error；ready；selection；disabled-reason；dirty；saving；save-error；saved；undo-redo；narrow；focus-return |
| `html.02` 元素与CSS | `packages/office/src/editors/HtmlElementMenu.tsx:813` | 画布选元素；文字链接/颜色尺寸；图片比例替代文字/翻转裁切去背景；来源替换；元素移动复制删除；文本范围；CSS预览应用 | none；unsupported；draft；invalid；pending；applied；cancelled |
| `html.03` AI页面规划 | `packages/office/src/editors/HtmlAgentPrompt.tsx:37` | 问题回答/跳过；视觉方向/颜色字体/密度；章节增删/重新拟定；确认提纲；生成草稿接受丢弃 | question；brief；draft；regenerating；validation-error；writing；partial-error；stale |

实际Ribbon分类：开始、插入、视图。

实际静态工具组：HTML 输出（packages/office/src/editors/HtmlEditor.tsx:1135）；问 AI（packages/office/src/editors/HtmlEditor.tsx:1172）；视图（packages/office/src/editors/HtmlEditor.tsx:1214）；查找和替换（packages/office/src/editors/HtmlEditor.tsx:1232）；预览设备与缩放（packages/office/src/editors/HtmlEditor.tsx:1243）；插入元素（packages/office/src/editors/HtmlEditor.tsx:1281）。

动态分组：home: selection工具组按选中元素动态显示元素名称，含定位源码/清行内样式/属性等。

#### 12. Word / DOCX编辑器（docx）

依赖：foundation, document, chat。候选评审切片：开始文字列表查找；插入图片图表表格；布局设计引用；审阅批注墨迹对比；视图拆分；加密保护隐私/保存输出。

| 场景ID与界面 | 来源 | 操作路径 | 状态 |
|---|---|---|---|
| `docx.01` 文字与文档布局 | `packages/office/src/editors/DocxEditor.tsx:1207` | 完整Ribbon；字形段落列表；表格插入/行列/合并/设计；页眉页脚；页面节纸张水印；导航/拆分/阅读缩放；查找；图片图表文本框；保存当前副本 | loading；load-error-retry；parse-error；ready；selection；disabled-reason；dirty；saving；save-error；saved；undo-redo；narrow；focus-return |
| `docx.02` 引用对象 | `packages/office/src/editors/DocxReferencesControls.tsx:67` | 目录/题注；引文书目；索引域；脚注尾注；图表文本框；图片裁切 | no-object；selected；draft；invalid-reference；pending；applied |
| `docx.03` 审阅 | `packages/office/src/editors/DocxAdvancedControls.tsx:836` | 批注添加回复编辑删除；修订接受拒绝；本地对比与只读拆分；墨迹；去署名隐私设置 | selection；protected-comments；tracking；empty-comments；compare-pending；compare-error；local-only |
| `docx.04` 加密保护 | `packages/office/src/editors/DocxEncryptionControls.tsx:15` | 密码打开/验证重试取消；只读建议；修改密码验证；只读/表单/批注/强制修订；保护密码保留更换移除；加密保存 | password-required；wrong-password；worker-busy；cancelled；read-only；forms-only；comments-only；forced-tracking；encryption-save-error |

实际Ribbon分类：开始、插入、图片格式、设计、绘图、布局、引用、审阅、表格、视图。

实际静态工具组：墨迹（packages/office/src/editors/DocxEditor.tsx:3246）；样式（packages/office/src/editors/DocxEditor.tsx:3262）；字体选择（packages/office/src/editors/DocxEditor.tsx:3273）；字级（packages/office/src/editors/DocxEditor.tsx:3274）；常用字形（packages/office/src/editors/DocxEditor.tsx:3275）；更多字形（packages/office/src/editors/DocxEditor.tsx:3277）；对齐（packages/office/src/editors/DocxEditor.tsx:3283）；列表（packages/office/src/editors/DocxEditor.tsx:3285）；表格、图片与链接（packages/office/src/editors/DocxEditor.tsx:3297）；调整选中图片（packages/office/src/editors/DocxEditor.tsx:3304）；目录（packages/office/src/editors/DocxEditor.tsx:3315）；题注（packages/office/src/editors/DocxEditor.tsx:3322）；引文与书目（packages/office/src/editors/DocxEditor.tsx:3329）；索引（packages/office/src/editors/DocxEditor.tsx:3336）；域（packages/office/src/editors/DocxEditor.tsx:3343）；段落（packages/office/src/editors/DocxEditor.tsx:3349）；文档格式（packages/office/src/editors/DocxEditor.tsx:3351）；页面背景（packages/office/src/editors/DocxEditor.tsx:3358）；页面与节（packages/office/src/editors/DocxEditor.tsx:3365）；水印（packages/office/src/editors/DocxEditor.tsx:3372）；撤销结构操作（packages/office/src/editors/DocxEditor.tsx:3379）；页眉和页脚（packages/office/src/editors/DocxEditor.tsx:3395）；文档对比（packages/office/src/editors/DocxEditor.tsx:3402）；保护（packages/office/src/editors/DocxEditor.tsx:3409）；修订与拼写（packages/office/src/editors/DocxEditor.tsx:3421）；表格操作（packages/office/src/editors/DocxEditor.tsx:3422）；表格设计（packages/office/src/editors/DocxEditor.tsx:3424）；文档视图（packages/office/src/editors/DocxEditor.tsx:3437）；显示比例（packages/office/src/editors/DocxEditor.tsx:3444）；拆分（packages/office/src/editors/DocxEditor.tsx:3451）；导航（packages/office/src/editors/DocxEditor.tsx:3458）；查找与替换（packages/office/src/editors/DocxEditor.tsx:3466）；导出（packages/office/src/editors/DocxEditor.tsx:3470）。

动态分组：选中图片出现picture tab；reading-mode布局/缩放/导航/拆分/导出。

#### 13. Excel / XLSX编辑器（xlsx）

依赖：foundation, document, chat。候选评审切片：网格公式工作表；格式范围行列查找；剪贴板粘贴填充；数据规则排序验证；对象图表透视；打印冻结保护。

| 场景ID与界面 | 来源 | 操作路径 | 状态 |
|---|---|---|---|
| `xlsx.01` 网格与工作表 | `packages/office/src/editors/XlsxEditor.tsx:123` | 单元格范围；地址/公式输入；Enter/Escape确认取消；表页切换新增改名删除隐藏；缩放网格；查找结果；撤销重做保存 | loading；load-error-retry；parse-error；ready；selection；disabled-reason；dirty；saving；save-error；saved；undo-redo；narrow；focus-return |
| `xlsx.02` 格式范围剪贴板 | `packages/office/src/editors/XlsxRangeControls.tsx:31` | 字体对齐边框数值格式；写入复制筛选复制公式转值；行列尺寸隐藏增删；多条件排序筛选；选择性粘贴/外部导入；填充闪填分级 | range-invalid；protected；large-range；draft；busy；stale-source；clipboard-denied；paste-disabled |
| `xlsx.03` 数据规则与布局 | `packages/office/src/editors/XlsxPropertyControls.tsx:18` | 列表/引用/数字日期/公式验证；条件格式迷你图；命名范围；纸张打印范围页眉；冻结；验证下拉与错误输入 | existing-rule；draft；invalid；unsupported-format；pending；applied |
| `xlsx.04` 对象与检查 | `packages/office/src/editors/XlsxObjectControls.tsx:19` | 图片形状图表表格；对象选择位置格式管理；透视；链接批注保护；公式计算检查 | none；selected；unsupported；inspect；pending；error |

实际Ribbon分类：开始、插入、数据、布局、公式、审阅、视图。

实际静态工具组：剪贴板与导入（packages/office/src/editors/XlsxEditor.tsx:966）；对象与表格（packages/office/src/editors/XlsxEditor.tsx:986）；工作表（packages/office/src/editors/XlsxEditor.tsx:1069）；工作表名称（packages/office/src/editors/XlsxEditor.tsx:1104）；工作表管理（packages/office/src/editors/XlsxEditor.tsx:1151）；公式计算（packages/office/src/editors/XlsxEditor.tsx:1235）；数据检查（packages/office/src/editors/XlsxEditor.tsx:1265）；排序与筛选（packages/office/src/editors/XlsxEditor.tsx:1283）；范围内容（packages/office/src/editors/XlsxEditor.tsx:1301）；行列（packages/office/src/editors/XlsxEditor.tsx:1318）；链接与审阅（packages/office/src/editors/XlsxEditor.tsx:1335）；数据规则（packages/office/src/editors/XlsxEditor.tsx:1352）；命名范围（packages/office/src/editors/XlsxEditor.tsx:1353）；打印布局（packages/office/src/editors/XlsxEditor.tsx:1354）；冻结窗格（packages/office/src/editors/XlsxEditor.tsx:1355）；字体与对齐（packages/office/src/editors/XlsxEditor.tsx:1392）；查找（packages/office/src/editors/XlsxEditor.tsx:1413）；查找结果（packages/office/src/editors/XlsxEditor.tsx:1447）；公式格（packages/office/src/editors/XlsxEditor.tsx:1476）；单元格（packages/office/src/editors/XlsxEditor.tsx:1502）；行列（packages/office/src/editors/XlsxEditor.tsx:1573）；范围操作（packages/office/src/editors/XlsxEditor.tsx:1642）；视图（packages/office/src/editors/XlsxEditor.tsx:1668）。

动态分组：manual-home格式刷；manual-data填充；manual-layout尺寸与分级；property rules/names/print/freeze；home合并后的格式/剪贴板/工作表/单元格/查找；内部members仍需全覆盖。

#### 14. PowerPoint / PPTX编辑器（pptx）

依赖：foundation, document, chat。候选评审切片：工作区视图文字；对象多选形状排列；图表表格图片；插入多媒体录屏墨迹；主题页面母版批注；动画放映排练输出；AI与整稿草稿。

| 场景ID与界面 | 来源 | 操作路径 | 状态 |
|---|---|---|---|
| `pptx.01` 工作区 | `packages/office/src/editors/PptxEditor.tsx:772` | 完整Ribbon；缩略图新增复制删除拖排右键长按；普通/大纲/浏览/阅读；隐藏页/分节；单多选/拖移缩放；文字范围格式/查找 | loading；load-error-retry；parse-error；ready；selection；disabled-reason；dirty；saving；save-error；saved；undo-redo；narrow；focus-return |
| `pptx.02` 对象与画布 | `packages/office/src/editors/PptxSelectionControls.tsx:79` | 对象混合值多选；位置几何/排列对齐组合；填充轮廓效果链接；形状顶点连接线；图表数据外观；表格；图片裁切去背景/组合图片 | none；single；multi；unsupported；mixed；busy；invalid-geometry；draft |
| `pptx.03` 资产多媒体 | `packages/office/src/editors/PptxInsertControls.tsx:31` | 图标图示艺术字公式字段；图片模型导入；音视频播放；屏幕录制；墨迹；画布插形状 | permission-denied；loading；invalid-file；unsupported-media；preview；recording；cancelled |
| `pptx.04` 文稿设计 | `packages/office/src/editors/PptxDeckControls.tsx:30` | 尺寸版式；主题颜色字体背景；页脚；分节批注；母版；备注 | draft；pending；empty-comments；selected-layout；master-mode；error |
| `pptx.05` 动画输出 | `packages/office/src/editors/PptxAdvancedControls.tsx:354` | 动画库/触发/路径/预览；过渡时长；放映/排练/演讲者/缩放；PPTX/PDF/PNG/SVG；打印讲义 | preview；playing；paused；ended；hidden；range-invalid；exporting；print-error |
| `pptx.06` AI交接 | `packages/office/src/editors/PptxAiControls.tsx:19` | 选区AI编辑/校对翻译；截图美化草稿；澄清选择；整稿逐页生成预览；停止/保留部分/丢弃 | model-unavailable；question；running；partial-deck；stopped；error；accepted；discarded；stale |

实际Ribbon分类：开始、插入、对象、绘图、幻灯片、视图。

实际静态工具组：剪贴板（packages/office/src/editors/PptxEditor.tsx:3574）；字形与查找（packages/office/src/editors/PptxEditor.tsx:3614）；格式刷（packages/office/src/editors/PptxEditor.tsx:3616）；段落与文本框（packages/office/src/editors/PptxEditor.tsx:3685）；字体与颜色（packages/office/src/editors/PptxEditor.tsx:3732）；AI 编辑（packages/office/src/editors/PptxEditor.tsx:3739）；检查与翻译（packages/office/src/editors/PptxEditor.tsx:3758）；对象（packages/office/src/editors/PptxEditor.tsx:3777）；公式（packages/office/src/editors/PptxEditor.tsx:3878）；音视频（packages/office/src/editors/PptxEditor.tsx:3898）；录屏（packages/office/src/editors/PptxEditor.tsx:3913）；图片填充（packages/office/src/editors/PptxEditor.tsx:3924）；形状填充（packages/office/src/editors/PptxEditor.tsx:3943）；背景（packages/office/src/editors/PptxEditor.tsx:3963）；绘图（packages/office/src/editors/PptxEditor.tsx:3981）；导入（packages/office/src/editors/PptxEditor.tsx:4013）；媒体播放（packages/office/src/editors/PptxEditor.tsx:4026）；图示（packages/office/src/editors/PptxEditor.tsx:4043）；艺术字（packages/office/src/editors/PptxEditor.tsx:4058）；动态字段（packages/office/src/editors/PptxEditor.tsx:4073）；形状库（packages/office/src/editors/PptxEditor.tsx:4088）；对象选择与格式（packages/office/src/editors/PptxEditor.tsx:4117）；对齐与组合（packages/office/src/editors/PptxEditor.tsx:4124）；效果（packages/office/src/editors/PptxEditor.tsx:4141）；链接（packages/office/src/editors/PptxEditor.tsx:4158）；轮廓（packages/office/src/editors/PptxEditor.tsx:4176）；组合图片（packages/office/src/editors/PptxEditor.tsx:4194）；图片裁切（packages/office/src/editors/PptxEditor.tsx:4203）；编辑顶点（packages/office/src/editors/PptxEditor.tsx:4244）；连接线端点（packages/office/src/editors/PptxEditor.tsx:4266）；排列（packages/office/src/editors/PptxEditor.tsx:4286）；位置与大小（packages/office/src/editors/PptxEditor.tsx:4326）；属性与位置（packages/office/src/editors/PptxEditor.tsx:4366）；页面（packages/office/src/editors/PptxEditor.tsx:4373）；尺寸与版式（packages/office/src/editors/PptxEditor.tsx:4417）；主题（packages/office/src/editors/PptxEditor.tsx:4433）；页脚（packages/office/src/editors/PptxEditor.tsx:4443）；分节与批注（packages/office/src/editors/PptxEditor.tsx:4453）；放映（packages/office/src/editors/PptxEditor.tsx:4481）；缩放导航（packages/office/src/editors/PptxEditor.tsx:4564）；备注与放映（packages/office/src/editors/PptxEditor.tsx:4605）；图标（packages/office/src/editors/PptxEditor.tsx:4655）；图片去背景（packages/office/src/editors/PptxEditor.tsx:4672）；3D 模型（packages/office/src/editors/PptxEditor.tsx:4694）；3D 预览（packages/office/src/editors/PptxEditor.tsx:4704）；母版编辑（packages/office/src/editors/PptxEditor.tsx:4728）；导出与打印（packages/office/src/editors/PptxEditor.tsx:4735）；演示文稿视图（packages/office/src/editors/PptxEditor.tsx:4774）；画布视图（packages/office/src/editors/PptxEditor.tsx:4783）；查找（packages/office/src/editors/PptxEditor.tsx:4790）。

#### 15. PDF编辑器（pdf）

依赖：foundation, document, chat。候选评审切片：页面缩略图/查找保存；文字段落/OCR标注；图片表单批注；签名绘图属性；本地页面工具输出；涂黑副本/图片导出。

| 场景ID与界面 | 来源 | 操作路径 | 状态 |
|---|---|---|---|
| `pdf.01` 分页与页面 | `packages/office/src/editors/PdfEditor.tsx:363` | 翻页查找缩放；缩略图右键长按拖排；旋转重排删除空白；裁剪纸型；保存 | loading；load-error-retry；parse-error；ready；selection；disabled-reason；dirty；saving；save-error；saved；undo-redo；narrow；focus-return |
| `pdf.02` 文字与扫描 | `packages/office/src/editors/PdfTextBlockPanel.tsx:196` | 画布插字；待插入列表编辑删除；选中文字标注；段落移动/重写/替换；扫描文字选择复制 | no-text；selection；unsupported；draft；pending；font-limit；stale |
| `pdf.03` 对象与填写 | `packages/office/src/editors/PdfFormPanel.tsx:133` | 表单扫描填写；图片读取替换提取；批注新建回复编辑删除；签名画布应用；数值图形/画布绘制 | scanning；empty；unsupported-field；read-error；dirty；pending；cancelled |
| `pdf.04` 本地临时工具 | `packages/office/src/editors/PdfLocalPanel.tsx:124` | 来源PDF导入替换；抽取拆分合并拼版压缩；水印页眉；文档属性书签；输出下载打印；页面图像导出 | file-required；invalid-source；local-session；pending；outputs；download；print |
| `pdf.05` 涂黑副本 | `packages/office/src/editors/PdfRedactionCopy.tsx:141` | 拖动标记；删除清空区域；导出副本；进行中取消；关闭回焦/版本过期 | no-mark；marked；busy；cancelled；error；stale；exported |

实际Ribbon分类：开始、编辑、页面、绘制、视图。

实际静态工具组：扫描文字（packages/office/src/editors/PdfEditor.tsx:3552）；涂黑副本（packages/office/src/editors/PdfEditor.tsx:3584）；页面图像（packages/office/src/editors/PdfEditor.tsx:3620）；签名（packages/office/src/editors/PdfEditor.tsx:3646）；画布绘图（packages/office/src/editors/PdfEditor.tsx:3654）；文档工具（packages/office/src/editors/PdfEditor.tsx:3681）；导航与查找（packages/office/src/editors/PdfEditor.tsx:3708）；文字（packages/office/src/editors/PdfEditor.tsx:3715）；旋转（packages/office/src/editors/PdfEditor.tsx:3793）；原文段落（packages/office/src/editors/PdfEditor.tsx:3809）；图片（packages/office/src/editors/PdfEditor.tsx:3839）；表单（packages/office/src/editors/PdfEditor.tsx:3862）；批注（packages/office/src/editors/PdfEditor.tsx:3870）；顺序（packages/office/src/editors/PdfEditor.tsx:3878）；裁剪与纸型（packages/office/src/editors/PdfEditor.tsx:3914）；删除（packages/office/src/editors/PdfEditor.tsx:3921）；缩放（packages/office/src/editors/PdfEditor.tsx:3944）。

#### 16. Desktop专属载体（desktop）

依赖：foundation, workspace, login, settings。候选评审切片：首启/模式切换/故障；标题栏窗口关于；原生菜单与系统对话框。

| 场景ID与界面 | 来源 | 操作路径 | 状态 |
|---|---|---|---|
| `desktop.01` 首启选择 | `apps/desktop/src/renderer/setup/SetupPage.tsx:39` | 本地云端；地址自动聚焦；准备/连接/打开；当前预填；取消返回；配置失败重试 | first-run；existing；load-failure；bridge-missing；pending；connection-failure |
| `desktop.02` 窗口控件 | `apps/desktop/src/renderer/components/WindowControls.tsx:36` | 标题拖动；最小化/最大化还原/关闭；平台差异；setup省略最大化 | macOS；Windows/Linux；maximized；setup |
| `desktop.03` 原生故障 | `apps/desktop/src/main/index.ts:532` | 菜单更换使用方式/CmdOrCtrl+Shift+M；原生编辑；来源切换确认；不可达重试更换退出；启动错误 | cloud；unreachable；switch-confirm；startup-error |
| `desktop.04` 关于 | `apps/desktop/src/renderer/routes/about.tsx:62` | 版本模式；错误重试；client设置模式切换 | loading；error；local；cloud |

### 全部UI源码/独立面板登记

含入口、复用件和桥接件，文件不是页面数量。大写组件函数定位同文件额外面板；JSON同时给出可见标签、键盘/拖拽/浮层/焦点/异步证据行。共享EditorShell、CompactToolbar、FindReplaceBar、ThumbnailSidebar、InlineToolbar要先定义规范，再在六格式真实宿主逐一复验。

**基础组件与系统反馈**

- `packages/renderer/src/components/BrandMark.tsx`：BrandMark@22, BrandLockup@49。
- `packages/renderer/src/components/DocumentBadges.tsx`：Badge@91, StatusBadge@109。
- `packages/renderer/src/components/LoadError.tsx`：LoadError@29。
- `packages/renderer/src/main.tsx`：入口/复用适配器（见JSON事件）。
- `packages/renderer/src/platform.tsx`：PlatformProvider@67。
- `packages/renderer/src/router.tsx`：入口/复用适配器（见JSON事件）。
- `packages/renderer/src/routes/index.tsx`：入口/复用适配器（见JSON事件）。
- `packages/renderer/src/theme/MimirProvider.tsx`：MimirProvider@41。
- `packages/office/src/editors/CompactToolbar.tsx`：CompactToolbar@31。
- `packages/office/src/editors/InlineToolbar.tsx`：InlineToolbar@76。
- `packages/office/src/editors/ThumbnailSidebar.tsx`：ThumbnailItem@41, ThumbnailSidebar@232。
- `packages/office/src/shell/EditorShell.tsx`：ToolbarPropertyForm@91, ToolbarPropertyField@107, EditorShell@189, ToolbarButton@348, ToolbarGroup@402, ToolbarDivider@414, ToolbarSpacer@438, ToolbarLabel@443, ToolbarNote@460, ToolbarNotice@486, ToolbarConfirm@536, ToolbarTextButton@636, ToolbarNumberField@924, ToolbarTextField@1029, ToolbarTextArea@1159, ToolbarFileButton@1221, ToolbarMenuItemRow@1485, ToolbarMenuSeparator@1520, ToolbarMenuFields@1536, ToolbarMenuNote@1551, ToolbarMenu@1569, ToolbarCustomRgb@1783, ToolbarColorGrid@1855, ToolbarColorPicker@1936, ToolbarGridPicker@2102, FindReplaceBar@2269, EditorState@2536。
- `packages/office/src/shell/icons.tsx`：Svg@131, PageBreakIcon@150, TextColorIcon@160, ListOpsIcon@170, FindIcon@179, CrossHighlightIcon@189, LtrIcon@198, RtlIcon@207, ParaShadingIcon@216。

**工作区导航与账户菜单**

- `packages/renderer/src/components/NavSidebar.tsx`：NavSidebar@50。
- `packages/renderer/src/components/nav/AccountRow.tsx`：AccountRow@16。
- `packages/renderer/src/components/nav/FolderSection.tsx`：FolderRow@274, FolderSection@349。
- `packages/renderer/src/components/nav/NavigationAction.tsx`：NavigationAction@6。
- `packages/renderer/src/components/nav/RecentNotes.tsx`：RecentNotes@7。
- `packages/renderer/src/components/nav/folder-icons.tsx`：FolderGlyph@75。
- `packages/renderer/src/components/nav/menu-items.tsx`：入口/复用适配器（见JSON事件）。
- `packages/renderer/src/routes/_app.tsx`：AppShell@112。

**搜索与命令面板**

- `packages/renderer/src/components/CommandPalette.tsx`：CommandPalette@300, PaletteBody@305, PaletteRow@659。

**收集与导入**

- `packages/renderer/src/components/CaptureDialog.tsx`：CaptureDialog@190。
- `packages/renderer/src/components/UploadPanel.tsx`：UploadPanel@70。

**知识库与目录浏览管理**

- `packages/renderer/src/components/KnowledgeBaseCreateModal.tsx`：KnowledgeBaseCreateModal@93。
- `packages/renderer/src/components/library/LibraryView.tsx`：LibraryView@96, DocumentName@886, FolderCard@989, FolderRowMenu@1036, DocCard@1101, OnboardCreate@1229。
- `packages/renderer/src/routes/_app.docs.tsx`：DocsRoute@20。

**文档阅读与共享文档流程**

- `packages/renderer/src/components/DocumentPanel.tsx`：DocumentPanel@66。
- `packages/renderer/src/components/NoteEditor.tsx`：NoteEditor@65。
- `packages/renderer/src/components/UnsavedGuard.tsx`：UnsavedGuard@37。
- `packages/renderer/src/components/document/DocChatGuide.tsx`：DocQuickAsks@19。
- `packages/renderer/src/components/document/DocChatSidebar.tsx`：DocChatSidebar@72。
- `packages/renderer/src/components/document/DocumentFooter.tsx`：DocumentFooter@17。
- `packages/renderer/src/components/document/DocumentHeader.tsx`：DocumentHeader@29。
- `packages/renderer/src/components/document/DocumentTitle.tsx`：DocumentTitle@7。
- `packages/renderer/src/components/document/DocxCapabilityStatus.tsx`：DocxCapabilityStatus@6。
- `packages/renderer/src/components/document/FilePreview.tsx`：FilePreview@60。
- `packages/renderer/src/components/document/MarkdownBody.tsx`：MarkdownBody@14。
- `packages/renderer/src/components/document/OfficeSourceEditor.tsx`：OfficeSourceEditor@34。
- `packages/renderer/src/components/document/doc-menu.tsx`：入口/复用适配器（见JSON事件）。
- `packages/renderer/src/lib/unsaved.tsx`：UnsavedProvider@47。

**AI对话与生成交互**

- `packages/renderer/src/components/chat/ChatThemeBridge.tsx`：ChatThemeBridge@28。
- `packages/renderer/src/routes/_app.chat.tsx`：ChatRoute@54。
- `packages/chat/src/ChatHostVars.tsx`：ChatHostVars@71。
- `packages/chat/src/ChatPanel.tsx`：ChatPanel@38, ChatPanelBody@107。
- `packages/chat/src/ChatThread.tsx`：ChatThread@37。
- `packages/chat/src/EmptyStage.tsx`：EmptyStage@19。
- `packages/chat/src/composer/Composer.tsx`：Composer@251, QueueRow@464。
- `packages/chat/src/composer/ComposerMenus.tsx`：AddContextDropdown@119, StrengthDropdown@167, ModelDropdown@202, ContextUsageChip@279。
- `packages/chat/src/parts/AnswerActions.tsx`：AnswerActions@113。
- `packages/chat/src/parts/CitationList.tsx`：CitationList@184。
- `packages/chat/src/parts/CodeBlock.tsx`：CodeBlock@31, CodeBar@93。
- `packages/chat/src/parts/DocxAgentHistoryNotice.tsx`：DocxAgentHistoryNotice@42。
- `packages/chat/src/parts/FailureNotice.tsx`：FailureCard@127, StreamErrorCard@223。
- `packages/chat/src/parts/MarkdownPart.tsx`：MarkdownPart@34。
- `packages/chat/src/parts/MediaParts.tsx`：SourcePart@191, FileChip@219, FilePart@249, AudioPart@258, ImagePart@262。
- `packages/chat/src/parts/MessageItem.tsx`：MessageItem@58, UserMessage@64, UserText@82, AssistantMessage@87, AssistantText@238, StreamErrorLine@253。
- `packages/chat/src/parts/PptxSnapshotAttachment.tsx`：SnapshotAttachment@42, ComposerSnapshot@68, MessageSnapshot@71。
- `packages/chat/src/parts/ReasoningPart.tsx`：ReasoningPart@39。
- `packages/chat/src/parts/StoppedNotice.tsx`：StoppedNotice@31。
- `packages/chat/src/parts/ToolCallPart.tsx`：ToolCallPart@183。
- `packages/chat/src/parts/TraceActivity.tsx`：LiveSeconds@159, TraceDisclosure@173。
- `packages/chat/src/parts/reasoning-shell.tsx`：LiveSeconds@134, ReasoningRoot@149, ReasoningTrigger@160, ReasoningContent@187。
- `packages/chat/src/runtime/DocxInterruptBridge.tsx`：DocxInterruptBridge@452。
- `packages/chat/src/runtime/chat-context.tsx`：MimirChatProvider@88。

**设置全分区**

- `packages/renderer/src/components/AvatarCropper.tsx`：AvatarCropper@101。
- `packages/renderer/src/components/settings/AccountSection.tsx`：AccountSection@46, AvatarColumn@109, NameField@219。
- `packages/renderer/src/components/settings/AppearanceSection.tsx`：AppearanceSection@39。
- `packages/renderer/src/components/settings/ClientSection.tsx`：ClientSection@30。
- `packages/renderer/src/components/settings/DataSection.tsx`：DataSection@10。
- `packages/renderer/src/components/settings/FeedsSection.tsx`：FeedsSection@34, FeedRow@187。
- `packages/renderer/src/components/settings/ModelsSection.tsx`：ModelsSection@45, ModelServiceSettings@158, RoleRow@199, StatusDot@291。
- `packages/renderer/src/components/settings/NetworkSearchSection.tsx`：BraveSettings@12, NetworkSearchSection@53。
- `packages/renderer/src/components/settings/PluginsSection.tsx`：PluginsSection@39, StatusLabel@105, StatusReason@113。
- `packages/renderer/src/components/settings/ProviderForm.tsx`：ProviderForm@96, PresetPanel@546, ModelRow@603, KeyState@699。
- `packages/renderer/src/components/settings/ProviderList.tsx`：ProviderList@33, ProviderCard@111, KeyBadge@246。
- `packages/renderer/src/components/settings/RetrievalSection.tsx`：RetrievalSection@11。
- `packages/renderer/src/components/settings/SettingControl.tsx`：SettingControl@43, SaveButton@227。
- `packages/renderer/src/components/settings/StatsSection.tsx`：StatsSection@94。
- `packages/renderer/src/components/settings/StorageSection.tsx`：StorageSection@29, StorageProbe@155。
- `packages/renderer/src/components/settings/UsageHeatmap.tsx`：WhenVisible@252, UsageHeatmap@278。
- `packages/renderer/src/components/settings/parts.tsx`：Panel@23, Row@55, Block@75, BlockTitle@81, BlockDesc@91, StatusBadge@103, Note@109, Stats@115。
- `packages/renderer/src/routes/_app.settings.tsx`：SettingsPage@125, SectionBody@201。

**登录与全局故障**

- `packages/renderer/src/routes/__root.tsx`：RootError@54。
- `packages/renderer/src/routes/login.tsx`：LoginPage@189, IdentifierField@404, PasswordField@437, LoginForm@465, SignUpForm@512。

**Markdown笔记编辑器**

- `packages/office/src/editors/MarkdownEditor.tsx`：MarkdownEditor@420, CharCount@1001, MarkdownToolbar@1039, FrontmatterPanel@1619, LinkMenu@1701, LinkPanel@1739, InsertTableMenu@1875, InsertTablePanel@1885, TableMenu@1933, CodeLanguageSelect@1977。
- `packages/office/src/editors/MarkdownWritingPreview.tsx`：MarkdownWritingPreview@119。
- `packages/office/src/editors/NoteLinkPicker.tsx`：NoteLinkOption@20, NoteLinkPicker@36。

**HTML页面编辑器**

- `packages/office/src/editors/HtmlAgentPrompt.tsx`：HtmlAgentPrompt@37, HtmlBriefPrompt@138, HtmlPromptPanel@445。
- `packages/office/src/editors/HtmlCssControls.tsx`：HtmlCssControls@18。
- `packages/office/src/editors/HtmlEditor.tsx`：HtmlEditor@307。
- `packages/office/src/editors/HtmlElementMenu.tsx`：HtmlElementControls@137, HtmlElementMenu@813。
- `packages/office/src/editors/HtmlInsertMenu.tsx`：HtmlInsertMenu@23。
- `packages/office/src/editors/HtmlPresentation.tsx`：HtmlPresentation@5。
- `packages/office/src/editors/HtmlWritingPreview.tsx`：HtmlWritingPreview@94。

**Word / DOCX编辑器**

- `packages/office/src/editors/DocxAdvancedControls.tsx`：DocxControlForm@73, DocxChartControls@89, DocxTextboxControls@230, DocxPageControls@396, DocxWatermarkControls@639, DocxAddCommentControls@836, DocxCommentControls@932, DocxNoteControls@1129。
- `packages/office/src/editors/DocxCaseControls.tsx`：CaseMenu@16, DocxCaseControls@65。
- `packages/office/src/editors/DocxCompareControls.tsx`：DocxCompareControls@16。
- `packages/office/src/editors/DocxComparePanel.tsx`：DocxComparePanel@4。
- `packages/office/src/editors/DocxDesignControls.tsx`：Palette@28, DesignFrame@101, DocxThemeControls@151, DocxPageBackgroundControls@303。
- `packages/office/src/editors/DocxDesignPreview.tsx`：DocxDesignPreview@117。
- `packages/office/src/editors/DocxEditor.tsx`：DocxCompareInspector@852, DocxInkInspector@858, DocxEditor@1207, DocxToolbar@2470, NotePanel@3499, CommentPanel@3557, HeaderFooterPanel@3613, TwipsField@3685, ParagraphSpacingMenu@3707, LineRuleMenu@3786, InsertTablePanel@3869, LinkPanel@3885, TableActions@3982, TableMenu@4011, RevisionsPanel@4260。
- `packages/office/src/editors/DocxEncryptionControls.tsx`：DocxOpeningControls@15, DocxEncryptionControls@98, EncryptionForm@119。
- `packages/office/src/editors/DocxImageControls.tsx`：DocxImageControls@47。
- `packages/office/src/editors/DocxImageCropPreview.tsx`：DocxImageCropPreview@21。
- `packages/office/src/editors/DocxInkControls.tsx`：DocxInkRibbon@21, DocxInkControls@68。
- `packages/office/src/editors/DocxInkOverlay.tsx`：DocxInkOverlay@82。
- `packages/office/src/editors/DocxListControls.tsx`：DocxListControls@41。
- `packages/office/src/editors/DocxPrivacyControls.tsx`：DocxPrivacyControls@10。
- `packages/office/src/editors/DocxProtectionControls.tsx`：DocxProtectionControls@22。
- `packages/office/src/editors/DocxProtectionSettingsControls.tsx`：DocxProtectionSettingsControls@26。
- `packages/office/src/editors/DocxReferencesControls.tsx`：DocxReferencesControls@67。
- `packages/office/src/editors/DocxSplitView.tsx`：Run@15, Paragraph@20, ReadonlyBlock@50, DocxSplitView@74。
- `packages/office/src/editors/DocxStyleControls.tsx`：DocxStyleControls@21, StyleForm@76。
- `packages/office/src/editors/DocxTableDesignControls.tsx`：DocxTableDesignControls@48。
- `packages/office/src/editors/DocxTableDesignPreview.tsx`：DocxTableDesignPreview@133。
- `packages/office/src/editors/DocxTocControls.tsx`：DocxTocControls@17。
- `packages/office/src/editors/DocxViewControls.tsx`：DocxLayoutControls@29, DocxZoomControls@62, DocxSplitControl@105, DocxNavigationControl@118, DocxReadingControls@131。
- `packages/office/src/editors/DocxViewPanel.tsx`：DocxViewPanel@19。

**Excel / XLSX编辑器**

- `packages/office/src/editors/XlsxCellFeatureControls.tsx`：XlsxCellFeatureControls@13。
- `packages/office/src/editors/XlsxClipboardControls.tsx`：XlsxClipboardControls@30。
- `packages/office/src/editors/XlsxDataControls.tsx`：XlsxDataControls@21, DataDraft@115。
- `packages/office/src/editors/XlsxEditor.tsx`：XlsxEditor@123。
- `packages/office/src/editors/XlsxFillControls.tsx`：FillColor@70, FillDraft@145, XlsxFillControls@453。
- `packages/office/src/editors/XlsxFindControls.tsx`：XlsxFindControls@12。
- `packages/office/src/editors/XlsxFormatControls.tsx`：XlsxFormatControls@28。
- `packages/office/src/editors/XlsxInspectControls.tsx`：XlsxInspectControls@10。
- `packages/office/src/editors/XlsxManualControls.tsx`：XlsxManualControls@22。
- `packages/office/src/editors/XlsxObjectControls.tsx`：XlsxObjectControls@19。
- `packages/office/src/editors/XlsxObjectLayer.tsx`：XlsxObjectLayer@12。
- `packages/office/src/editors/XlsxObjectManagement.tsx`：XlsxObjectManagement@18, ManagementConfirm@292。
- `packages/office/src/editors/XlsxPivotControls.tsx`：AxisFields@61, XlsxPivotControls@138。
- `packages/office/src/editors/XlsxPropertyControls.tsx`：XlsxPropertyControls@18。
- `packages/office/src/editors/XlsxRangeControls.tsx`：XlsxRangeControls@31。
- `packages/office/src/editors/XlsxShapeGallery.tsx`：XlsxShapeGallery@32。
- `packages/office/src/editors/XlsxShapePreview.tsx`：Paint@27, XlsxShapePreview@89。
- `packages/office/src/editors/XlsxSparkline.tsx`：XlsxSparkline@1。
- `packages/office/src/editors/XlsxValidationDropdown.tsx`：XlsxValidationDropdown@8。
- `packages/office/src/editors/XlsxValidationOptionsControls.tsx`：XlsxValidationOptionsControls@17, ValidationDraft@117。
- `packages/office/src/editors/XlsxVisualProperties.tsx`：XlsxVisualProperties@26。

**PowerPoint / PPTX编辑器**

- `packages/office/src/editors/PptxAdvancedControls.tsx`：ChartEditControls@50, SlidePlaybackControls@354, MotionPathControl@825。
- `packages/office/src/editors/PptxAiControls.tsx`：PptxAiControls@19。
- `packages/office/src/editors/PptxAnimationGallery.tsx`：EffectIcon@56, PptxAnimationGallery@73。
- `packages/office/src/editors/PptxAnimationPreview.tsx`：PptxAnimationPreview@227。
- `packages/office/src/editors/PptxAssetControls.tsx`：PptxImageFillControls@34, PptxImportControls@153, PptxMediaPlayer@268。
- `packages/office/src/editors/PptxChartAppearance.tsx`：PptxChartAppearance@54。
- `packages/office/src/editors/PptxClarificationControls.tsx`：PptxClarificationControls@11。
- `packages/office/src/editors/PptxClipboardBridge.tsx`：PptxClipboardBridge@25。
- `packages/office/src/editors/PptxClipboardControls.tsx`：PptxClipboardControls@91。
- `packages/office/src/editors/PptxCommentControls.tsx`：PptxCommentControls@14。
- `packages/office/src/editors/PptxControlPanel.tsx`：PptxControlPanel@22。
- `packages/office/src/editors/PptxCurveControls.tsx`：PptxCurveControls@57。
- `packages/office/src/editors/PptxDeckControls.tsx`：PptxPageControls@30, PptxThemeControls@131, ThemePreview@148, PptxThemeDraftControls@167, PptxHeaderFooterControls@423, PptxReviewControls@485。
- `packages/office/src/editors/PptxDeckWritingPreview.tsx`：PptxDeckWritingPreview@181。
- `packages/office/src/editors/PptxEditor.tsx`：ChartInsertControls@187, PptxThumbnail@385, PptxEditor@772。
- `packages/office/src/editors/PptxFillControls.tsx`：FillColor@39, FillEditor@75, PptxShapeFillControls@566, PptxBackgroundControls@596。
- `packages/office/src/editors/PptxGroupPictureControls.tsx`：PptxGroupPictureControls@45。
- `packages/office/src/editors/PptxGroupTextControls.tsx`：PptxGroupTextControls@22, GroupTextDraft@88。
- `packages/office/src/editors/PptxIconControls.tsx`：IconPreview@23, PptxIconControls@59。
- `packages/office/src/editors/PptxInkCanvas.tsx`：PptxInkCanvas@39, InkGesture@42。
- `packages/office/src/editors/PptxInkControls.tsx`：PenIcon@52, PptxInkControls@70。
- `packages/office/src/editors/PptxInsertControls.tsx`：PptxEquationControls@31, PptxWordArtControls@135, PptxFieldControls@216, PptxDiagramControls@270。
- `packages/office/src/editors/PptxMasterControls.tsx`：PptxMasterControls@31。
- `packages/office/src/editors/PptxMediaControls.tsx`：PptxMediaControls@56, PptxMediaDraft@59。
- `packages/office/src/editors/PptxModelControls.tsx`：PptxModelControls@16。
- `packages/office/src/editors/PptxObjectControls.tsx`：PptxParagraphControls@96, ParagraphEditor@102, PptxPictureControls@646, PptxEffectsControls@782, PptxLinkControls@887, PptxShapeControls@992, PptxArrangeControls@1092, PptxFreeformControls@1253, PptxConnectorControls@1348。
- `packages/office/src/editors/PptxOutlineControls.tsx`：PptxOutlineControls@49, OutlineEditor@54。
- `packages/office/src/editors/PptxOutputControls.tsx`：PptxOutputControls@40, OutputEditor@43。
- `packages/office/src/editors/PptxPictureCropCanvas.tsx`：PptxPictureCropCanvas@57, PictureCropGesture@79。
- `packages/office/src/editors/PptxPictureTools.tsx`：PptxCutoutControls@15。
- `packages/office/src/editors/PptxPresentation.tsx`：PptxPresentation@147。
- `packages/office/src/editors/PptxScreenRecordControls.tsx`：PptxScreenRecordControls@11。
- `packages/office/src/editors/PptxSelectionAppearanceFields.tsx`：PptxSelectionAppearanceFields@35。
- `packages/office/src/editors/PptxSelectionCanvas.tsx`：PptxSelectionCanvas@5。
- `packages/office/src/editors/PptxSelectionControls.tsx`：PptxSelectionControls@79, SelectionScope@82, SelectionEditor@125。
- `packages/office/src/editors/PptxSelectionFormatFields.tsx`：PptxSelectionParagraphFields@41, PptxSelectionOutlineFields@325。
- `packages/office/src/editors/PptxSelectionGeometryControls.tsx`：PptxSelectionGeometryControls@37, GeometryDraft@48。
- `packages/office/src/editors/PptxShapeGallery.tsx`：PptxShapePreview@29, Gallery@49, PptxShapeGallery@113。
- `packages/office/src/editors/PptxShapeInsertCanvas.tsx`：PptxShapeInsertCanvas@29, ShapeGesture@39。
- `packages/office/src/editors/PptxShowControls.tsx`：PptxShowControls@36, ShowControls@39。
- `packages/office/src/editors/PptxTableControls.tsx`：PptxTableControls@99。
- `packages/office/src/editors/PptxTextRangeEditor.tsx`：PptxTextRangeEditor@31。
- `packages/office/src/editors/PptxViewControls.tsx`：PptxWorkspaceModeControls@17, PptxViewControls@39, PptxViewOverlay@81。
- `packages/office/src/editors/PptxWorkspaceViews.tsx`：SlidePreview@80, PptxWorkspaceViews@103。
- `packages/office/src/editors/PptxZoomControls.tsx`：PptxZoomControls@34, ZoomEditor@37。

**PDF编辑器**

- `packages/office/src/editors/PdfDrawingCanvas.tsx`：Shape@315, PdfDrawingCanvas@349, PdfDrawingRibbonIcon@572。
- `packages/office/src/editors/PdfEditor.tsx`：PdfEditor@363, PdfThumbnail@4314, PdfSheet@4417, CropOverlay@4607, PdfCanvas@4636。
- `packages/office/src/editors/PdfExternalImageSource.tsx`：PdfExternalImageSource@26。
- `packages/office/src/editors/PdfFormPanel.tsx`：FieldEditor@22, PdfFormPanel@133。
- `packages/office/src/editors/PdfImageExportControls.tsx`：PdfImageExportControls@16。
- `packages/office/src/editors/PdfImagePanel.tsx`：NumberControl@32, ExternalImageApply@54, ImageControls@110, PdfImagePanel@494。
- `packages/office/src/editors/PdfInspector.tsx`：PdfInspector@30, PdfInspectorHeader@86。
- `packages/office/src/editors/PdfLocalPanel.tsx`：NumberField@59, ConciseNumberInput@67, Field@108, PdfLocalPanel@124, PageTools@315, DrawingTools@477, StampTools@643, PropertyTools@750, PdfLocalAssetRequest@816。
- `packages/office/src/editors/PdfOcrControls.tsx`：PdfOcrControls@8。
- `packages/office/src/editors/PdfOcrOverlay.tsx`：PdfOcrOverlay@46。
- `packages/office/src/editors/PdfPendingTextOverlay.tsx`：PdfPendingTextOverlay@6。
- `packages/office/src/editors/PdfRedactionCopy.tsx`：PdfRedactionOverlay@24。
- `packages/office/src/editors/PdfSignatureCanvas.tsx`：PdfSignatureCanvas@288。
- `packages/office/src/editors/PdfSignaturePanel.tsx`：PdfSignaturePanel@16。
- `packages/office/src/editors/PdfTextBlockPanel.tsx`：BlockMoveForm@23, BlockTools@142, PdfTextBlockPanel@196。
- `packages/office/src/editors/PdfTextBlockRewriteForm.tsx`：PdfTextBlockRewriteForm@15。
- `packages/office/src/editors/PdfTextInsertPanel.tsx`：PdfTextInsertPanel@25。
- `packages/office/src/editors/PdfTextMarkupPanel.tsx`：PdfTextMarkupPanel@12。

**Desktop专属载体**

- `apps/desktop/src/renderer/components/TitleBar.tsx`：TitleBar@61。
- `apps/desktop/src/renderer/components/WindowControls.tsx`：WindowControls@36。
- `apps/desktop/src/renderer/index.tsx`：入口/复用适配器（见JSON事件）。
- `apps/desktop/src/renderer/routes/about.tsx`：AboutPage@62。
- `apps/desktop/src/renderer/setup/SetupPage.tsx`：SetupPage@39。
- `apps/desktop/src/renderer/setup.tsx`：入口/复用适配器（见JSON事件）。

### 跨模块检查维度

- **states**：每项操作适用的default/hover/focus/pressed/selected/disabled及原因/loading/empty/error/success/cancel/recovery；不适用须标原因。
- **keyboard**：Tab/Shift+Tab；Enter/Space；Esc先关最上层；上下键；IME组合期；关闭回live入口，焦点不落body。
- **layout**：浅/深/系统；1280×800；窄屏约420×500及低高；长文案/列表/缩放；内部滚动/固定footer；覆盖层可达。
- **async**：慢请求/重复点击/失败重试/取消；切文档使旧结果失效；草稿与原件；保存导出与编辑竞态。
- **alternate-input**：现有拖放/右键/触控长按及对应普通可发现入口；所有操作逐项核实鼠标/键盘/触控路径。
- **platform**：Web、Desktop本地与云端；本地不登出；文件选择/剪贴板权限/打印/系统对话框准确说明原生限制。

### 具体易漏合同

- `packages/renderer/src/components/document/OfficeSourceEditor.tsx:97`起的saveFromHere当前提示先按工具条“保存到库”并返回false，共享“保存并离开”不能直接代存。基线必须如实呈现；若要改善须把合同变化明列给用户评审。
- 笔记自动保存和Office手动保存的离开提示及丢弃分支不同（UnsavedGuard.tsx），保存失败都应留原位。
- DOCX加密/受保护批注/强制修订/隐私去署名，PDF本地临时OCR/涂黑副本，XLSX选择性粘贴，以及三类生成草稿都有身份、取消或版本过期分支，不能只画一次成功。
- 主对话有思考强度，文档侧栏固定标准模型；首次发送引起URL变化不能使新会话丢流。
- HTML图片操作还调用vendored UI：`packages/office/vendor/packages/ui/src/image-dialogs.tsx:103` CutoutDialog与`:315` CropDialog（预览拖动/范围/接受/取消/失败）；它们是实际依赖的额外面板，不能因不在自有TSX索引里而跳过。
- 尚未发现renderer/desktop里beforeunload/useBlocker，浏览器返回、刷新和窗口关闭的未保存联动必须专项实测，当前不作已拦截声明。

### External references / versions

内部GenOffice vendored清单`packages/office/vendor/UPSTREAM.json`记录commit `480548fd55f1be3593ee0d8e316a734751d58309`，syncedAt `2026-10-16T11:39:20.376Z`，Apache-2.0。这是当前引擎/图片弹窗来源事实，不等于已核查最新上游。

WeKnora官网和public source由主会话统一核查并写入`research/reference-review.md`；版本、SHA及具体证据以该文件为准，本文件不重复网络研究，不新增未经核实的竞品事实。知识库/Agent选WeKnora；布局选Obsidian并保留已认可语雀方向；Office工具条参考Office for web/Google Docs/GenOffice，不能以WeKnora Markdown编辑器替代。

### Related specs

- `.trellis/spec/project/product.md`
- `.trellis/spec/project/design.md`
- `.trellis/spec/renderer/frontend/conventions.md`
- `.trellis/spec/renderer/frontend/document/conventions.md`
- `.trellis/spec/renderer/frontend/editor/conventions.md`
- `.trellis/spec/chat/frontend/conventions.md`
- `.trellis/spec/office/frontend/editors/conventions.md`
- `.trellis/spec/desktop/runtime/conventions.md`

## Caveats / Not Found

- 本代理只读源码，未实际操作界面或截图；所有模块均未出效果稿、未获模块认可、未实施。
- 所有自有TSX已归属，但未穷举每个编辑命令/动态设置项/引擎内快捷键的全部状态转移。模块开始前必须逐项展开。
- 运行时SettingEntry、插件支持与模型能力由服务器配置决定，进入对应模块时要采集真实RuntimeConfig，不能凭静态源码声称覆盖。
- 原生媒体播放器/系统文件选择/剪贴板权限/打印及Electron系统对话框的HTML仅示意流程，实际宿主需独立验收。
- 并行Office开发会改变面板和行号，每格式评审前重新索引。
- 源码注释部分过时（如FilePreview历史说PDF iframe），以实际JSX与状态逻辑为准。
- 未发现顶层工作区标签条；不要混淆Ribbon、工作表标签与幻灯片分页。
- regex提取标签/函数有工具性局限，含帮助件且不等价于独立页面数量；动态标签由语义组补充并待进一步展开。
- 未发现renderer/desktop源码中的beforeunload或useBlocker；刷新/浏览器原生返回/窗口关闭与未保存的联动需专项实测，不能宣称已具备全局拦截。

每模块开始前须把场景组展开为“每个界面/面板 × 入口 × 状态 × 退出/恢复”覆盖表并给稳定ID。真实浏览器采集基线后才能标可评审；每版HTML认可单独记录，所有本文件模块当前均为not_requested。
