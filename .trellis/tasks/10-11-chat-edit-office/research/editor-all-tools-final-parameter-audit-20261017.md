# 六格式固定 GenOffice 工具与参数最终审计

## 2026-10-17 最终补齐状态

下文16:32审计确认的六类源码缺口及XLSX R3均已补齐，并完成独立检查与对应浏览器验收。第三轮原样 `pnpm check` exit0：4606通过、2既有跳过；最终生产构建exit0，1764个源码/配置起止不变。范围与证据见 `all-tools-final-scope-independent-check-20261017.md`、`all-tools-completion-ledger-20261017.md`、`final-quality-check-20261017.md`。真实provider未配置，DOCX新密码用户稍后亲输、Desktop用户自验；不将这些边界称为代码缺口或已自动通过。以下原审计结论保留历史时点。

2026-10-17 16:32 Asia/Shanghai，只读审计。范围是六格式当前 Agent 工具、手动工具栏及已要求的子参数；不是新的生产浏览器验收。仅新增本报告，不改生产、测试、规范或其他报告，不安装依赖、不运行共享测试 runner。

## 结论

**当前仍不能声称“所有工具和参数完备”。** 已有六格式工具名和大部分手动工具有真实实现，但仍确认以下源码缺口：

1. DOCX、Markdown、PPTX 的 `generate_image.aspectRatio` 均未贯通。
2. PPTX 图片生成的引用图编辑、真实透明背景语义未接。
3. PPTX 多选/直接组成员的图片项目符号替换被明确拒绝。
4. PPTX `attachment://` 原附件图片插入/替换缺少解析桥。
5. PPTX `analyze_media` 只支持图片/预抽取图片帧，缺原音视频输入的转录/抽帧路径。
6. PPTX `generate_deck` 缺上游逐页进度、逐页可见结果与停止后保留已完成页的交互。

XLSX R3 特殊粘贴正在由专属 owner 接线，尚未独立检查及 root 生产浏览器验收，不能用准备阶段 37 项 helper 测试当作运行时完成。该状态由 root 后续报告更新；本报告不并写 R3 文件。

模型未配置、Desktop 用户自验、新建/更改密码的用户输入交接，与上述源码缺口分列，不能互相替代。原生复杂结构的明确拒绝也不等于常规目标参数已经齐全。

## 1. 参考版本与证据

- 主参考是固定 GenOffice **`480548fd55f1be3593ee0d8e316a734751d58309`**；本次实际执行 `git -C /tmp/mimir-genoffice-html-git rev-parse HEAD`，与固定版本相符。以下上游路径均相对此 checkout，未运行其 GUI。
- 文件编辑的交互主参考仍为 GenOffice、Office 网页版和 Google Docs，页面布局沿既定 Obsidian 外壳；未以 WeKnora Markdown 编辑器代替 Office Ribbon。
- 按仓库要求，本次实际读取已有 WeKnora 官网及公开源码缓存，复核 SHA256；没有新发 HTTP 请求。
  - 官网缓存 `/tmp/mimir-group-flip-weknora-site.html`：SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`。
  - `Tencent/WeKnora` **v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`**，`internal/agent/tools/definitions.go` 缓存 `/tmp/mimir-group-flip-weknora-definitions.go`：SHA256 `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`。
  - 该文件 14–21 行知识检索、35–49 行 sandbox 能力门控、69–75 行 Wiki 范围门控适用于 KB/Agent 权限与真实能力报告；不提供六格式原件 writer 或 Ribbon 参数语义。

行号是本次只读审计时点定位；其他 owner 正在工作，后续应以符号和具体调用链复核，不以行号漂移否定证据。

## 2. 六格式覆盖与现状

| 格式 | 固定工具/操作基线 | 当前已落地的主要手动参数组 | 本次结论与主要入口 |
| --- | --- | --- | --- |
| DOCX | 36 顶层工具；15 个 apply_ops 子操作 | 字形/段落/详细列表、图片八把手像素裁切、引用/域、设计/绘图、表格设计与浮动位置、视图/对比/拆分、评论/受保护评论锚点/表单、保护密码/强制修订/隐私/整文件加密 | 目录不是缺名状态；图片生成比例仍缺。`shared/src/docx-agent.ts` → `document-agent-catalog.ts` → renderer chat IO → `conversations.ts`；画布 `office/src/agent/docx-agent.ts` 和各 Docx Controls。 |
| Markdown | 8 顶层工具；15 MdOp | 标题/字符/列表/表格、图片、数学/Mermaid/WaveDrom、方言/代码语言、当前快照导出、AI 预设、NDJSON 增量草稿及停止后保留/丢弃 | 工具名齐但 `generate_image.aspectRatio` 缺。`markdown-agent-catalog.ts` → `agent/markdown-agent.ts` → `renderer/components/NoteEditor.tsx` → API/route。 |
| HTML | 6 顶层工具；13 个实际 HtmlOp（不按较窄上游 AI enum 的 9 项误减） | 13 元素命令、8 插入预设、文字/图片/CSS 临时预览、视图/设备/缩放/导出、多选澄清、丰富 brief/备选风格/redo/user_edited/meta pin | 本次核对未发现新的确定缺名或参数遗漏；真实模型仍待用户配置后验。`html-agent-catalog.ts`、`agent/html-agent.ts`、`html-agent-writing.ts`、HtmlAgentPrompt/HtmlEditor。 |
| XLSX | 13 顶层工具（含 create_document）；55 DSL | 基础格式/公式、18 图案及渐变、CF/DV 实际显示与输入约束、对象/表格/透视、管理、多级排序、复制/移动与公式/merge/link/CF/DV 迁移 | R1、R2a、R2b 有最新独立检查及原生浏览器证据；R3 特殊粘贴运行时尚未收口。`xlsx-agent-catalog.ts`、`xlsx-agent-host.ts`、`xlsx-manual-ops.ts`、`xlsx-special-paste*.ts`、XlsxEditor/Controls。 |
| PPTX | 17 顶层工具；71 引擎操作，其中 61 AI-callable；96 Ribbon 回调 | 字符范围与 pending marks、统一多选/直接组成员格式、109 形状/32 样式、渐变/纹理、表格/图表、组图真实裁切/六图片来源、音视频、3D 附件封面、内部/系统图片/多页剪贴板、动画/视图/放映/导出 | 不能由 17/96 入口数推出参数完备；本报告 §3.2–3.6 为仍存在的实际缺口。`pptx-agent-catalog.ts`、`pptx-agent-services.ts`、`pptx-selection.ts`、PptxSelectionFormatFields。 |
| PDF | 45 顶层工具；26 内部编辑操作；另有用户明确追加本地临时 OCR | 页面/书签/纸张/水印/页眉、表单/批注、原文段/部分/all/颜色、插字 anchor/wrap/align/font/bold/italic、图片完整参数/外部素材、绘图/签名/真正涂黑副本、当前 PDF 本地 OCR 搜索复制 | 旧“edit_block/文字参数/图片生成/OCR 未接”已过时。外部图片 `max_results/aspect_ratio` 已有 schema 与真实转发；不与本报告发现的另外三格式比例漏传混同。`pdf-agent-catalog.ts`、`pdf-image-catalog.ts`、`pdf-local-catalog.ts`、`pdf-external-assets.ts`、PdfEditor。 |

这些计数是审计索引，**不是验收通过数**。服务依赖工具按配置隐藏是已接受的能力门控；无供应商时不能把隐藏工具误计为代码漏注册。上游非 AI-callable 操作通过明确的手动 action 适配不等于必须开放任意模型原始 XML。

## 3. 确认的源码缺口与最小验收

### 3.1 三格式图片生成比例没有贯通

| 格式 | 固定上游真实参数与执行 | 当前 Mimir 证据 |
| --- | --- | --- |
| DOCX | `apps/docs/src/renderer/ai/tools.ts:496–513` 有 aspectRatio；`:955–963` 读取并传入 aiGenerateImage | `packages/shared/src/docx-agent.ts:82` 的 schema 只有 prompt/afterBlockIndex/maxWidthPx；`apps/server/src/routes/conversations.ts:1205–1220` 只收并传 prompt。 |
| Markdown | `apps/markdown/src/renderer/ai/tools.ts:220–244` 有 aspectRatio（16:9/1:1/4:3 示例） | `apps/server/src/services/markdown-agent-catalog.ts:135–146` 无该字段；`packages/office/src/agent/markdown-agent.ts:185` 只传 prompt+signal；`packages/renderer/src/components/NoteEditor.tsx:195` 与 `conversations.ts:1083–1095` 继续丢比例。image_search.maxResults 已有，不列缺口。 |
| PPTX | `apps/slides/src/renderer/ai/slides-skill.ts:344–376` 有 aspectRatio；`:1494–1506` 实际转发 | `apps/server/src/services/pptx-agent-catalog.ts:165–173` 只有 prompt；`pptx-agent-services.ts:219–224` strict schema 和服务调用也只有 prompt。 |

公共生成服务 `apps/server/src/services/docx-image-generation.ts:29–64` 已为 PDF 支持 `options.aspectRatio` 与模型尺寸映射。因此仅给 catalog 增字段不够，须贯通 shared/Office services/renderer API/server schema；保留默认不传时的行为及取消/版本守卫。

**最小验收**：三格式各证明 schema 参数→实际 provider adapter 请求→真实返回像素宽高→当前文档插入或受控引用。覆盖 auto、1:1、横向、纵向、非法比例、不支持尺寸模型的预拒绝；不得把 provider 离散尺寸近似宣称任意精确比例。mock 证明转发；本轮无配置 provider，真实供应商验收单列。

### 3.2 PPTX 引用图编辑、透明背景语义没有实现

- 上游 `slides-skill.ts:344–376` 的 `referenceImageUrls`、`transparentBackground` 不是说明文字；`:1494–1506` 把它们传给真实 generateImage。上游明确指出只在 prompt 写“透明”不能保证 alpha。
- Mimir `pptx-agent-catalog.ts:165` 明确只支持文字生成；`pptx-agent-services.ts:219–224` 的 strict prompt-only 输入不会接受上述参数。手动去背景已有实现，但不能代替 Agent 的引用图编辑/生成透明素材语义。
- 上游 `model` 参数描述为 **Genspark only** 的特殊模型选择；它是现有平台/供应商差异，不建议照抄 Genspark 模型名或新增第二套凭据。应按当前通用图片能力提供可支持的编辑模式和明确不支持原因。

**最小验收**：真实引用图输入沿受控下载与大小/类型限制进入支持编辑的 adapter；取消/失败不发布；透明输出实际解码具有 alpha，不能仅断言 prompt。生成结果经受控引用做原位 replace_image，保留对象身份/位置/层级/边框及 history。若当前供应商不支持编辑，能力门控须准确，不得注册后忽略参数。

### 3.3 PPTX 批量图片项目符号被明确拒绝

上游完整可执行链：

1. `apps/slides/src/renderer/components/RibbonHomeTab.tsx:204–206` 的图片选择器调用 `onParagraphFormat({bullet:'blip', bulletImage:picked})`。
2. `style-actions.ts:190–237` 对未处于文字编辑的选择把 **ctx.selectedIds** 整批传给 setElementParagraphFormat，显式图片不会触发同类 toggle-off。
3. `apps/slides/src/main/slides-main.ts:1495–1523` 将 bulletImage 纳入 format，并对 sourceIds.map 产生真实 setParagraphFormat 操作。

Mimir `packages/office/src/editors/pptx-selection.ts` 的 `pptxSelectionParagraphPatch` 明确抛“批量图片符号暂不支持替换”；`PptxSelectionFormatFields.tsx` 的 blip 选项 disabled。单文字框图片符号已接，不能代称多选/直接组成员参数已齐。

**最小验收**：两顶层文字对象、同直接父组的两个文字成员分别选择同一 PNG/JPEG bullet；一次提交、一个 history；独立 XML 校验每目标段落 blip/relationship/media，保留非目标文字/编号/未知属性，保存重开及 Undo/Redo。混合不支持目标、取消/变版/迟到整体不发布。320px Inspector 和 420×500 中选图只是准备，唯一固定主动作明确执行；Escape 分层回焦。

**纠正旧疑点**：多对象“更改形状预设”没有同等上游证据。固定上游 `App.tsx:3315–3327` 只调用 selectedNode.sourceId，因而不把当前单目标形状预设认定为确定遗漏。

### 3.4 PPTX attachment:// 原附件图片桥缺失

- 上游 `slides-skill.ts:402–424` 明确要求附件 logo/照片通过 insert_web_image 或 replace_image，`url=attachment://<file name>` 嵌入原 bytes；系统 prompt 和 files-skill 也明确不得生成替身。
- Mimir `apps/server/src/services/pptx-agent-services.ts:68–76` 的 imagePayload 只有 mimir-generated 受控引用分支，否则交 fetchDocxImage 公网下载；没有附件名→当前鉴权会话原附件 bytes 的解析分支。catalog 描述也只有 HTTP(S) 与 mimir-generated。
- 已实现的系统图片粘贴/拖放、手动媒体上传和 AI 美化截图发送，是不同入口；它们不能证明该模型工具参数可解析。

**最小验收**：用户上传的 PNG/JPEG 原附件得到绑定当前用户/文档/轮次的私有引用，工具解析后保存 bytes/hash 精确；同名附件不串用，跨用户/源切换/过期拒绝；insert/replace 两路径保留目标与 history。不要让模型任意读取本机路径，也不要把原附件重新生成。

### 3.5 PPTX analyze_media 原音视频路径缺失

- 上游 `slides-skill.ts:382–399` 声明图片/音频/视频，实际服务有媒体 provider 路径；本地任意路径应在 Mimir 改为用户显式上传，不照搬 Electron 路径权限。
- Mimir `pptx-agent-catalog.ts:178–194` 明确只接受公开图片 URL 或最多 4 个已抽取视频帧 URL；`pptx-agent-services.ts:236–254` strict `mediaUrls`→对所有输入调用 fetchDocxImage→将多图片称作 kind=video。没有原音频上传/转录、视频抽帧入口。
- `D` 片真实音视频**嵌入与播放**已完成，不能再列未接，但它不等于模型能分析该原媒体。

**最小验收**：用户显式上传原音频/视频→受控暂存→转录/有界抽帧→已有通用服务分析；无配置显示明确原因。覆盖媒体类型/预算/取消/切源/迟到、零画布修改与真实结果；供模型续轮时保留素材来源。mock 路由与真实媒体前处理可独立于供应商验证，真实模型另列待验。

### 3.6 PPTX 整份生成缺逐页可见与保留部分结果

- 上游 `slides-skill.ts:576` 工具语义明确 page-by-page/live display；`:1867` 等发送 stage/page progress，`:2133` 起逐页生成落地，`:2320` 附近取消时保留 landedPages 并诚实返回 cancelled。
- Mimir `apps/server/src/services/pptx-agent-services.ts:140` 的 modelJson 使用 stream:false；`:347–500` 完整生成所有页后一次返回 savePptx(output)。catalog 也明确“全部页生成成功后才整体更新；任一失败或停止保留原画布”。因此是已知未对齐交互，不能仅写“真实模型待验”。
- 本地生成器 `:85–130` 另明确只输出有限形状/文字/图片；没有原生表格/图表生成 schema。该本地能力边界保留，但本审计没有证明固定上游在每种生成场景都保证原生表格/图表，不能将其自动升级为新必补项。

**最小验收**：受控逐页生成器先证明已完成页进度可见、临时预览不混入未完成页；停止后用户可明确保留完成页或丢弃，缺页与失败准确呈现；切源/人工改稿拒绝过期结果。最终发布/整轮回退与 dirty/保存合同有唯一归属，失败不能覆盖已有原件。此项涉及生成协议与 UI 状态设计，应专片实施，不能用简单循环逐页多次 publish 代替原子性设计。

## 4. 已有证据关闭的历史缺口

以下是对旧矩阵的纠正索引，不删除失败记录，也不重复运行已接受浏览器测试：

| 过时表述 | 现行证据/状态 |
| --- | --- |
| Markdown write_document 没有流式草稿 | `10-13-markdown-agent-manual/research/capability-matrix.md` 最后“真实增量草稿补全”：NDJSON、停止保留/丢弃、420 与键盘回焦受控流组件实证；非真实模型。 |
| HTML brief 仅简单四字段，没有多选/redo/pin/restyle/extract | `html-rich-brief-check`、`toolbar-design-rewrite-browser` 及 HTML 矩阵末段；`html-agent.ts:437–517`、`html-agent-writing.ts:41–88` 有真实元数据 pin。restyle/extract pin 不能谎称 CSS 已改版。 |
| DOCX crop 拖把手、浮动表格、C2 锚点、forms、W1/W2/T/P/E 尚未实施 | 对应 `toolbar-docx-{crop,table-position,protected-anchors,forms,w2,forced-tracking,privacy,encryption-final}-browser-20261017.md` 已有后续证据。Standard/Agile 编辑保存与第三方密码/HMAC、Worker、history/reopen 已过；新建/改密码输入仍用户交接。 |
| DOCX 整文件加密 CFB Worker 故障、E1S A→B→A 仍红 | 精确 CFB 导出补丁及真 ESM Worker 专报、`toolbar-docx-encryption-final-browser` 已结清；E1S SQLite+实际 PG 同 9 文件各115/115，见 `docx-encryption-server-index-check`。历史失败留档。 |
| PDF edit_block/partial/all/color/插字参数、拖动永久 busy/图片来源/OCR 未接 | `toolbar-pdf-text-browser` 最新节已验证真实拖动/宽度/对齐/保存后 UndoRedo 逐字节/重开；`toolbar-pdf-image-browser` 最新节及 `toolbar-pdf-ocr-browser` 已有当前图像/本地WASM证据。真实忙碌取消以独立组件证据为限。 |
| XLSX fill/pivot/DV/shape preview/manage/S/R1/R2a/R2b 未接或一直待浏览器 | 对应 `toolbar-xlsx-{pivot-layout,validation,preview,manage-final,multilevel-sort,range-r2a,range-r2b}-browser-20261017.md`。R2b 独立 Server16文件454/454、Office8文件79/79及 root 原生浏览器已过；不能延伸到 R3。 |
| PPTX 图表主题变体/任意RGB、组内画布裁切、六图片格式、媒体、统一选择复杂填充/内部剪贴板未接 | `toolbar-design-rewrite-browser`、`toolbar-pptx-{c1,image-formats,media,snapshot}-browser`、`docx-pptx-toolbar-browser` 与 Ribbon audit 最新段落已有代码及浏览器证据。保留本报告中明确未齐子参数。 |
| 全仓仍被480项 bundled skill lint阻断 | 已解决；正式稳定窗口原样 pnpm check 为4231通过/2既有skip。**这个数只覆盖旧稳定源码窗口，新R3及后续改动仍需最终门禁。** |

`all-tools-completion-ledger-20261017.md` 主表中的 E/P/Manage/S/R2 旧“在途/待验”与其末尾新证据不一致；应由 root 在最终收口时同步当前主表。`editor-remaining-tools-current-20261017.md` 当前权威头部已覆盖旧失败，但正文保留的历史缺口不能再被当当前队列。各格式早期矩阵中的“待桌面”“待两端”须沿用户选择改为精确的验收类型，不应要求本轮重复桌面。

## 5. 明确边界，不制造固定上游不存在的差距

- **DOCX 排序**：固定 `apps/docs/src/renderer/components/Ribbon.tsx:3532–3540` 排序按钮本身 disabled/NotSupported，不能再列为固定版已证执行器。
- **PDF 数字证书签署**：固定 `apps/pdf/src/renderer/App.tsx:1588` 明确不核验证书签名；视觉 Ink/Stamp 不能称为数字签名。没有已证证书导入/签署执行器，不据营销或视觉签名要求新 PKI 模块。
- **PPTX 表格边框**：固定上游实际 only all/none；outer/inner/horizontal/vertical 是可选扩展，不是已证遗漏。
- **PPTX 深层组**：上游脚本也将 nested in sub-group 标记 read-only，要求先解组；当前顶层及直接成员与深层区别是明确结构边界。多选几何预设见 §3.3 的反例。
- **PPTX 3D**：固定 addModel3d 本身是模型附件+封面；当前浏览器交互预览与原件附件不等于原生交互 am3d，不能因没有 PowerPoint 原生3D虚构固定版差距。
- **XLSX 格式刷**：官方 Univer0.25.1 只复制基样式，不复制源 rich textRuns；不能再要求以此作为固定版已支持参数。批注剪切/复制目前缺固定上游 native-save 全链证明，列未知，不列确定遗漏。
- **Markdown 元数据**：`agent/markdown-agent.ts:270–275` setFrontmatter 要独立批次并 flushBody；这是 Mimir 文件/索引一致性合同，不建议为计数移除。整批正文+元数据需要独立一致性设计。
- **原件保真/预算**：DOCX opaque/复杂保护锚点/受限强制修订结构，PDF Form/clip/AcroForm/未知Catalog，XLSX复杂表/透视/cache/扩展及超预算，PPTX深层组/复杂复制资源，均应逐目标显示真实拒绝原因。它们是当前明确支持子集，不能宣称全部 Office 任意原件兼容；也不能借这些守卫掩盖 §3 的常规可实现目标缺参。
- **create_document**：四格式 md/html/docx/pdf 创建已有富内容与入库证据，PDF旧矩阵“待接”已失效。`create-document-rich-matrix.md` 明确 DOCX/PDF初始图片/图表/任意CSS拒绝、PDF数学/嵌套表/超页合并等限制；不得把整个四格式创建标成无限富内容。

## 6. 待验、交接和质量门

1. **未配置供应商**：当前账号没有可用模型/provider。没有真实六格式模型工具轮、真实图片生成/搜索/媒体分析闭环；本轮用户已选“先完成代码与界面”，可以先完成可独立证明的 schema/adapter/本地前处理/错误门控。不能称 provider 已通过，也不能拿无配置解释 §3 的代码缺失。
2. **用户输入交接**：新建/更改 DOCX 加密密码已准备具体浏览器页面，但自动化规则要求用户亲自输入/确认/提交。现有已知夹具密码打开、Standard/Agile 编辑保存等已验，不能因交接重新列 E1U 整类未完成。
3. **Desktop/OS**：用户已明确 Desktop 自行验收。系统打印窗口、屏幕录制 chooser、独立双屏演讲者等未证，不冒称通过；浏览器内预览/代码存在与系统实际执行分列。当前未配置供应商不是要求用户再授权的理由。
4. **样式交互**：新片仍应沿紧凑单行 Ribbon、320px Inspector、body 内滚动与固定单一主动作、1280×800/420×500、完整可见标签/当前值/逐层 Escape 和回焦。新增字段不应重新堆回长表单或屏外按钮。
5. **最终质量门**：R3及本报告确认缺口修补、独立检查和 root 生产浏览器之后，再冻结新源码执行最终统一 lint/format/types/tests/build；旧4231绿色窗口不能覆盖新改动。

## Verification（本报告）

- 源码：固定 GenOffice HEAD、WeKnora 缓存 SHA、六格式现行目录/执行接缝及历史矩阵/最新证据交叉核对。
- Lint / TypeCheck / Tests：**本次未运行**；只读研究不占用 R3 独占的 Server runner，不重跑旧浏览器验收。本报告不把先前专项或旧完整门拼接为新全绿。
- 修改：仅本 Markdown 报告。生产缺口均未在本次越权修补，交 root 安排 owner 与独立检查；总体仍 in_progress。
