# Research: 第六模块文档阅读与整理参考

- Query: 如何在已批准的语雀方向下，精修文档阅读框架、大纲、引用、整理、来源双链、媒体降级及文档助手宿主？
- Scope: mixed（官方公开 HTTP / 固定 commit 源码 / Mimir 当前组件，只读调研）
- Date: 2026-10-18

## Findings

### 结论与参考次序

本轮应保留“中央内容 + 安静工具条 + 按需辅助栏”的既有结构，优先修复操作反馈、焦点、失败恢复和真实能力边界。用户已经认可的语雀样式及模块 1–5 的基础组件合同优先；**Obsidian 是阅读布局与内容组织主参考，WeKnora 是知识库、引用和 Agent 交接参考**。没有证据支持再换一套主题、添加分屏/标签页或公开分享。

本任务处于 HTML 审稿阶段。下述“改进”是提案方向，不是产品代码已修复或业务已验证。

### 固定版本与采证方法

本次重新访问并保存响应，复用了前模块的固定版本，未只复述旧研究：

| 对象 | 固定证据 | 本次结果与边界 |
| --- | --- | --- |
| [WeKnora 官网](https://weknora.weixin.qq.com/) | 2026-10-18 HTTP 响应；页面文字 v0.8.3 | HTTP 200。营销页“回答附来源引用、可打开原文核对”“引用定位对应段落”只证明产品宣称，具体机制以下述源码为准。 |
| [WeKnora release v0.8.3](https://github.com/Tencent/WeKnora/releases/tag/v0.8.3) | latest release 响应，发布于 2026-10-14T07:53:24Z | 与官网版本一致。不能据此把 main 快照称为该 release。 |
| [Tencent/WeKnora](https://github.com/Tencent/WeKnora/commit/2c0d8384398ca756ee414eef01b71caf91e2caa6) | **2c0d8384398ca756ee414eef01b71caf91e2caa6**，2026-10-17T15:25:02Z | 重新取得该 commit 元信息和文档预览/引用源码。它是发布后的 main 快照。 |
| [Obsidian 帮助官网 Outline](https://help.obsidian.md/plugins/outline) | 2026-10-18 HTTP 响应 | HTTP 200，但响应是 Publish 应用壳；其中明确引用的正文/CSS/options URL 均返回 HTTP 403。本轮不把壳或预载样式当作真实阅读 UI 的像素证据。 |
| [官方 obsidianmd/obsidian-help](https://github.com/obsidianmd/obsidian-help/commit/08ef563f07b78dd589f19b1583d089c1e2d2377c) | **08ef563f07b78dd589f19b1583d089c1e2d2377c**，2026-10-11T21:19:01Z | 重新取得 Workspace、Views、Outline、Backlinks、Outgoing links、Properties 官方 Markdown。固定的是文档版本，不能推导 Obsidian 桌面应用版本。 |

原始响应都在 [reference-evidence.json](reference-evidence.json) 的 `sources`：每项有 URL、状态、字节数、完整 body 与 SHA256；源码行号是对应 `body.splitlines()` 的一基行号。官网摘录在 `derived.weknora_site_visible_text.lines`，去掉 script/style 后的文本不代表计算后可见性。Obsidian 403 同样保存，不隐藏失败采证。

### WeKnora：只借鉴有源码依据的阅读与引用细节

以下链接全部固定上述 commit，不使用会变化的 main 链接。

| ID | 具体证据 | 对 Mimir 的应用 | 保留边界 |
| --- | --- | --- | --- |
| WK-D01 | [document-preview.vue:113–143](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/components/document-preview.vue#L113-L143)：焦点交给实际滚动节点，`preventScroll:true`；等待期间用户已移去其他控件则不抢焦点。相应 `document-preview.focus.test.mjs:47–143` 列出加载、隐藏/再打开、文件切换、iframe 与其他输入不抢焦点等断言。 | 打开阅读区、错误重试完成、文档助手开关时，区分“恢复此前阅读焦点”与“用户正在输入”；正文滚动区可通过键盘操作。HTML 展示焦点路径，实施后才验宿主实际行为。 | 不照搬 Vue watch；源码测试是外部项目的静态证据，本轮没有运行其测试，也不能代替 Mimir GUI 验证。 |
| WK-D02 | [document-preview.vue:890–909](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/components/document-preview.vue#L890-L909)：加载、错误+明确重试、不支持分支独立。`:976–1008` 文本/Markdown、原生音频/视频各走自身载体。 | Mimir 首次读取失败应有实际重试；有缓存刷新失败仍保留内容；无原件、无提取正文、不支持查看器、浏览器播放失败不能都叫“文档为空”。下载只在有原件时出现。 | 不移植 WeKnora 的格式支持列表；Mimir `viewerFor` / `parseSupport` 是唯一判据。音视频播放成功、编解码、下载需真实宿主验。 |
| WK-D03 | [ChatReferenceSourceView.vue:133–150](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/components/ChatReferenceSourceView.vue#L133-L150) 区分定位中、精确、部分、块、歧义、陈旧、页、未找到；`:280–286` 内容修改/hash 不同则撤去原定位证据；`:307–310` 整篇摘要不追逐单句。 | 只声明实际完成的定位：Mimir 已有正文命中高亮，不可声称 Office 原件页/坐标定位；没找到时保留文档并明确结果，不跳到相似错误段落。HTML 必须表现成功、未命中、无可高亮正文。 | Mimir 未提供这些定位等级/原件 hash 映射合同，本轮不添加相同八种后台状态或页级定位。可见反馈只基于 Mimir 真实结果。 |
| WK-D04 | [ChatReferenceSourceView.vue:289–310](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/components/ChatReferenceSourceView.vue#L289-L310)：同文件连续引用保留查看器、只移动高亮；异步 `loadVersion` 阻止旧结果落到新目标。 | 同篇换引用不重建编辑器、不清掉未保存正文；切换文档后旧摘要/建议/定位结果不串篇。把等待→切篇→旧响应这个场景加入 HTML 与后续测试计划。 | 引用数据与文档编辑句柄仍走 Mimir 的 ID 校验及离开保护；不新增跨文档合并会话能力。 |
| WK-D05 | [markdownSourceLocate.ts:10–28](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/utils/markdownSourceLocate.ts#L10-L28)：先确认完整来源区域，再缩小到句子；`:43–59` 明确逐字证据、块级上下文与精确引用有区别。 | 重复段落、带代码/表格的片段、异步正文挂载分别覆盖，避免只用第一个文本命中伪造正确定位。 | 不因此换掉 Mimir Tiptap 或引用算法；本轮先如实盘点现有定位合同。大改索引/locator 不在视觉精修范围。 |
| WK-D06 | [document-preview.vue:151–235](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/components/document-preview.vue#L151-L235) 与 `document-preview.fullscreen.test.mjs:66–86,149–163`：最内层 Escape、IME 不干预、退出按钮错误时仍可达、工具条预留布局空间。 | 即使不新增全屏，也可借鉴 Escape 所属层明确、菜单/弹窗关闭只处理一层、布局不随状态改变导致抖动。 | Mimir 没有的统一全屏入口不因参考存在而新增。原生全屏和 iframe 的键盘边界属于真实宿主测试。 |

### Obsidian：阅读布局与信息组织主参考

这些是官方产品文档证据，不是应用源码，也不是像素复刻依据。

| ID | 官方固定文档证据 | Mimir 的采用方式 |
| --- | --- | --- |
| OB-D01 | [Workspace.md:10–23](https://github.com/obsidianmd/obsidian-help/blob/08ef563f07b78dd589f19b1583d089c1e2d2377c/en/User%20interface/Workspace.md#L10-L23)：内容围绕笔记组织，左右侧栏可收起，更多操作属于当前笔记；`:25–34` 移动载体另有组织。 | 中央内容是主角；低频整理归更多菜单；助手、大纲只在空间合适时占栏。具体尺寸继续使用已认可的 Mimir/语雀合同，不从此文档虚构颜色和宽度。 |
| OB-D02 | [Views and editing mode.md:14–30](https://github.com/obsidianmd/obsidian-help/blob/08ef563f07b78dd589f19b1583d089c1e2d2377c/en/Editing%20and%20formatting/Views%20and%20editing%20mode.md#L14-L30)：阅读视图隐藏 Markdown 语法、强调专注阅读；`:40–64` 另分编辑视图/Live Preview/源码。 | 保留正文清晰可读、只读资料没有假编辑控件；不同格式的编辑与只读身份要明确。Mimir 笔记现有编辑器不因参考新增阅读/源码切换。 |
| OB-D03 | [Outline.md:4–8](https://github.com/obsidianmd/obsidian-help/blob/08ef563f07b78dd589f19b1583d089c1e2d2377c/en/Plugins/Outline.md#L4-L8)：列当前笔记标题，点击导航；拖动还可重排。 | 采用“当前文档导航”语义：当前节、键盘、长标题、滚动同步与实际落点一致。拖动重排是编辑行为，Mimir 当前大纲不支持，本轮明确范围外。 |
| OB-D04 | [Backlinks.md:24–36,59–68](https://github.com/obsidianmd/obsidian-help/blob/08ef563f07b78dd589f19b1583d089c1e2d2377c/en/Plugins/Backlinks.md#L24-L36)：反链分已链接/未链接，可在笔记底部显示。 [Outgoing links.md:8–13,20–24](https://github.com/obsidianmd/obsidian-help/blob/08ef563f07b78dd589f19b1583d089c1e2d2377c/en/Plugins/Outgoing%20links.md#L8-L24)：出链/入链相对，重名时完整路径有帮助。 | 保留 Mimir 页脚“来源 / 被引用”的两个实际集合；无链接不画空框；多项长名可换行且焦点清楚。不要把 Mimir `sources` 偷换成 Obsidian 的全部出链，不添加未链接提及、筛选排序或链路图。 |
| OB-D05 | [Properties.md](https://github.com/obsidianmd/obsidian-help/blob/08ef563f07b78dd589f19b1583d089c1e2d2377c/en/Editing%20and%20formatting/Properties.md) 官方元信息类型与编辑说明，完整源码已取证。 | 只参考元信息有独立身份这一原则。Mimir 本轮标签/目录/摘要仍复用现有入口；不引入 Properties 表格、可自定义属性或另一套数据模型。此项非主要版式依据。 |

### Mimir 现状：保留与需要验证的缺口

| 源码 | 当前事实 | 含义 |
| --- | --- | --- |
| `packages/renderer/src/components/DocumentPanel.tsx:137–195,683` | 笔记/有原件文件铺满，普通资料限阅读行宽；大纲 ≥2 标题且非原件、非窄屏、非助手展开时显示。 | 保留，不能为了 Obsidian 风格把 Office 画布整体压到阅读行宽；本轮可精修留白与主从关系。 |
| `DocumentPanel.tsx:529–542,550–628` | 找真实滚动祖先；引用归一化匹配、异步重试、找不到不伪造位置。当前引用流程没有可见的成功/未找到状态。 | 保留定位算法边界，提案补诚实结果提示，不承诺原件定位。 |
| `DocumentPanel.tsx:638–658,726–739` | 无缓存失败只写“文档加载失败”；有缓存失败保留内容并提供“重试刷新”。 | 初次失败缺少可见重试/返回路径；两种失败不能做成同一整页状态。 |
| `document/DocumentTitle.tsx:21–51` | 标题在 Enter/Escape/blur 结束编辑；`onRename` 是 void；未见组合输入排除、等待锁、写入失败保留草稿。 | 源码可见缺口，需要原型覆盖 IME、提交、失败恢复、回焦。不要把失焦即成功当作正确当前合同。 |
| `DocumentPanel.tsx:307–316,769–787` | 标签更新把整对象写入 document query；AI 标签点击后立即移除候选，不等成功。 | 存在正文缓存与失败恢复风险，须在提案/后续实现中与已批准的文档命令“不覆盖活正文”合同对齐；这里只报告风险，未运行重现。 |
| `DocumentPanel.tsx:388–431` | 摘要/AI 标签结果只在会话本地；共享 busy；未配模型有真实警告；结果按 documentId 显示。 | 保留“AI 候选不是已保存内容”；等待/失败/无模型/无候选分别设计。无需照搬竞品持久 Wiki。 |
| `document/headings.ts:15–29` | 正则直接扫 Markdown 的 `#` 行并把 1/2 级压成一级展示、其余归第二层。 | 围栏代码 `#` 可能被当标题，是待测试核实风险；原型不能暗示已有六级大纲/折叠/拖动。 |
| `document/FilePreview.tsx:77–110,115–225,229–309` | viewerFor 分派、原件失败下载降级、纯文本保持原样、无原件不显示下载；图片只缩不放大且新标签看原件；音视频原生控件。 | 保留格式真相，只精修宿主说明、对齐与窄屏折行；不绘制假播放器并声称真实播放通过。文件中旧 PDF iframe 注释已过时，实际 `:177–185` 是 OfficeSourceEditor。 |
| `document/DocumentFooter.tsx:17–71`；`DocumentPanel.tsx:867–874` | 双链是实际 button、无链接不画、导航走未保存守卫。 | 保留可操作语义；改视觉时不能把 button 换成纯 span；显示来源不等于公开分享。 |
| `document/DocChatSidebar.tsx:126–175`；`DocumentPanel.style.ts:525–557` | 右助手有当前文档标题/关闭/能力恢复；宽屏占400px，实际面板 ≤880px 时改覆盖。 | 保留宿主与完整聊天包边界；设计需按实际面板宽度，不能只问 viewport；不要复刻 Office 内部工具条。 |

### 可直接进入 HTML 提案的 9 条方向

1. **保留并精修阅读主次。** 同一内容/同一尺寸对比：安静宿主条（当前 `theme/tokens.ts:229` 为48px，部分组件旧注释仍写44px，应以实际 token 为准），正文保持阅读上限，Office 原件保持铺满；长标题不挤走返回/更多。颜色、圆角、图标继续既有语雀方向及 A 方案，不另起主题。
2. **改进初次失败与缓存失败恢复。** 初次失败给“重试加载”和已有返回入口；缓存刷新失败用不卸载正文的轻提示。HTML 明示模拟，不伪造真实 API 通过；等待不重复触发。
3. **改进标题编辑的完整回路。** 展示静止、hover/focus、输入、IME、空白/超长、等待、写失败保留、已写入刷新失败、取消/回焦。标题铅笔占位固定，hover 不改变行宽/基线；写入失败不把草稿直接丢掉。
4. **保留大纲规则，精修定位与长内容。** 当前节用位置与文字共同表达，长项最多合理换行/截断且可查全名；Tab/Enter、长目录自身滚动、真正滚动祖先与落点偏移有对比。原件/助手/窄屏收起规则保持，不新增拖动或折叠树能力。
5. **改进引用结果的诚实反馈。** 定位中、已找到正文、正文未找到、原件区无正文可定位分别表现；重复片段与连续点同篇不同引用不闪回顶部。没有实际页坐标合同就不出现“已定位到第N页”的成功提示。
6. **改进整理菜单和 AI 候选的恢复。** 当前目录/当前标签准确，读取失败与真空集合分开；点击候选后等待/失败保留/成功加入都有反馈；摘要标明 AI 和模型、仅本会话。AI 没有模型/没有结果都提供真实说明；保留8秒移动撤销与文档命令交接，不顺手增加文档删除入口。
7. **保留来源/被引用双向语义，精修页脚。** 无链接隐藏，多链接长名可读可键盘操作；换文档走同一个未保存守卫；不把外部原站URL、Mimir来源文档、反向引用混成一个“分享”按钮。
8. **保留媒体原件和文本真相，精修降级卡。** 图片大/小/失败、音频/视频、无查看器有正文、无正文有原件、无原件及提取失败分别有截图场景；窄屏卡片动作折到可触达位置。系统新标签、播放器编解码、Range、下载和原生取消标为实施后宿主验证。
9. **改进辅助层的键盘与低高度行为。** 助手关闭回触发按钮，异步内容到达不抢已进入输入框的焦点；菜单/弹窗 Escape 只关闭当前层且排除IME；400px助手在实际窄面板覆盖、低高度保留关闭与底部操作。每个 hover/focus/loading 切换测固定外框，原型覆盖浅深、390px、低高度和长正文；不改聊天消息包及 Office 工具条。

## Files found

- `research/reference-evidence.json` — 本轮官方响应、完整固定源码、HTTP 失败证据与摘要清单。
- `.trellis/tasks/10-18-interaction-library/research/reference-review.md` — 前模块固定版本/研究方法缓存；本轮重新获取文档阅读相关证据。
- `packages/renderer/src/components/DocumentPanel.tsx` — 阅读宿主、正文分派、大纲/引用、整理、守卫和助手挂载。
- `packages/renderer/src/components/document/DocumentHeader.tsx` / `DocumentTitle.tsx` — 宿主动作、路径、保存状态及标题内联编辑。
- `packages/renderer/src/components/document/DocumentPanel.style.ts` — 正文宽度、大纲、菜单、助手的现行样式。
- `packages/renderer/src/components/document/DocumentFooter.tsx` — 来源与被引用集合。
- `packages/renderer/src/components/document/FilePreview.tsx` — 原件/正文/降级的真实分派。
- `packages/renderer/src/components/document/MarkdownBody.tsx` / `headings.ts` — 只读 Tiptap 及大纲序号。
- `packages/renderer/src/components/document/doc-menu.tsx` / `DocChatSidebar.tsx` — 整理菜单及助手宿主边界。
- `packages/renderer/src/components/ContentTypography.style.ts` — 编辑与只读正文共用排版；避免另做一份 Markdown 样式。

## Related specs

- `.trellis/spec/project/rules.md` — 证据/日期/适用条件、非目标清单、只报告已证实能力。
- `.trellis/spec/renderer/frontend/document/index.md`、`conventions.md`、`pitfalls.md` — 文档命令、缓存失败保留活编辑器、viewerFor 和标题样式。
- `.trellis/tasks/10-18-interaction-document/prd.md` — 先 HTML、具体认可后实施；不扩分享/协作/Office 工具条。
- `.trellis/workflow.md` — 研究成果持久化和规划阶段边界。

## Caveats / Not Found

- 本角色只调研，没有修改产品、测试或 spec，也未运行 Mimir 新行为验证。`research.jsonl` 不存在，按原生注入的活动任务与 PRD 读研究上下文；未读取 implement/check jsonl。
- 官网/源码 HTTP 200 不等于竞品登录运行时验收。没有进入 WeKnora 管理端，没有执行其修改操作、自动化测试或测量真实 hover/焦点像素。
- Obsidian 帮助站正文/CSS/options 返回403，故视觉结论限于官方文档确认的结构；具体像素由已批准的 Mimir/语雀方案与当前界面取样决定。不声称已观察官方发布站运行时布局。
- Obsidian 应用主体没有在此研究中取得可固定版本的公开实现；官方帮助仓库是文档源码，不能称为其桌面 UI 源码。
- 原件精确引用、Properties、自定义属性、标签页/分屏、拖动大纲、公开分享、权限、多人协作、图谱、Wiki、全屏及新格式均未获本模块授权。
- 本轮不以 WeKnora Markdown 预览替代 Office for the web / Google Docs / GenOffice 工具条参考；Office 内部各格式控件不在本模块实施范围。
