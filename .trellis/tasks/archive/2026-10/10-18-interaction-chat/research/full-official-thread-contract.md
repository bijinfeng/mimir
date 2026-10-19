# Research: 完整 assistant-ui 官方 Thread 与宿主业务边界

- Query: 整个对话使用固定版本 assistant-ui 官方 Thread、完整递归依赖与默认主题；不使用自定义组件、components overrides、渲染片段拼装或样式覆盖，同时保留 Mimir 业务与执行安全。
- Scope: mixed；v3 规划研究和独立原型输入，不修改 v1/v2、产品、spec 或任务元数据。
- Date: 2026-10-19

## Findings

### 本轮合同

用户最新要求将 v2 的“局部官方件 + Mimir 主题映射”收紧为完整默认 Thread。这一文档取代上一份研究中的视觉组合建议，但保留其真实事件、禁止将检索 trace 冒充 reasoning/tool、不中断业务链等结论。

原型应直接 `<Thread />`，不传 `components`，不注册自绘 tool/data UI，不复写 Markdown 的 components，也不从 Thread 拆下片段重组。Thread 内原生采用的内部组件表是官方源码自身的一部分，可以保持；“不传 overrides”指应用层不能另行替换。以 alias 解析上游源码导入和用 Tailwind 编译其原始 class 属于构建配置，不是组件重写。不得改 className/children/inline style/状态机，也不映射 Mimir token、prefix 官方 selector、以 CSS 隐藏按钮或复制一套近似 renderer。

默认 Thread 的英文欢迎、placeholder、tooltip、reasoning/tool 标签原样保留。本轮不通过字符串补丁或伪元素中文化。独立 iframe 文档使用官方 global/theme 和官方依赖 CSS；Mimir 宿主交互放在 iframe 外，由显式业务 IO 连接，两者样式不串入。

### 固定来源与已落完整闭包

主源仓库：<https://github.com/assistant-ui/assistant-ui>；固定 commit `a587b2838f2d644549d216098d54cfbeedfac522`。通过 GitHub tree API 确认 tree 未截断，使用 Contents API `?ref=<commit>` 获取、base64 原样解码；此前相同 ref 的原件直接复用，不依赖浮动 main 或 registry 在线最新响应。

`research/vendor-full-thread/source-manifest.json` 保存：35 个原件/元数据路径、逐文件 SHA256、大小、固定 URL、import→实际文件映射；其中 **25 个是从 Thread 入口可达的运行时源码，unresolved=0**。其余包括默认 CSS、registry 声明/模式、包 metadata 和 LICENSE。`runtime_source_files` 是原型应消费的递归清单，`runtime_external_imports` 与 registry 分析模块的依赖分开；registry 元数据自身用到的 zod、generative-ui 等不属于 Thread 的必要运行时依赖。

25 个运行时源码（相对上游 `packages/ui/src/`）：

- `components/react/assistant-ui/elements/`：`thread.aui.tsx`、`attachment.aui.tsx`、`file.tsx`、`follow-up-suggestions.aui.tsx`、`image.tsx`、`markdown-text.tsx`、`media-player.tsx`、`reasoning.aui.tsx`、`reasoning.tsx`、`tool-fallback.aui.tsx`、`tool-group.aui.tsx`、`tooltip-icon-button.tsx`、`collapsible-root.tsx`、`surfaces.tsx`。
- `components/react/assistant-ui/utils/`：`href.ts`、`useIsomorphicLayoutEffect.ts`。
- `components/react/ui/base/`：`avatar.tsx`、`button.tsx`、`dialog.tsx`、`skeleton.tsx`、`textarea.tsx`、`tooltip.tsx`。
- `hooks/`：`use-attachment-src.ts`、`use-copy-to-clipboard.ts`；`lib/utils.ts`。

`@/components/assistant-ui/*` 对应 `packages/ui/src/components/react/assistant-ui/*`，`@/components/ui/*` 选择上游 **base** 目录，`@/hooks/*` 和 `@/lib/*` 对应源目录。Base variant 是官方来源，不是自定义 Radix wrapper；不能混用两套 dialog/tooltip/trigger 实现。registry `elements-collapsible-root` 明确区分 baseDependencies 与 radixDependencies。

`@assistant-ui/ui` 是上游 monorepo 中 private `0.0.0` 的源码包；不是安装 `@assistant-ui/react` 后就自动拥有 Thread 样式件。`apps/registry/src/registry.ts:1225–1252` 的 thread 项声明完整 registry 依赖：button、skeleton、attachment、file、follow-up-suggestions、image、markdown-text、reasoning、tooltip-icon-button、tool-fallback、tool-group。本次递归清单与其源码导入交叉核对。

MIT 根 LICENSE 已保存，copyright (c) 2026 AgentbaseAI Inc.；复制 substantial source 保留版权和许可文字，原型 vendor 与研究 manifest 均需可追溯。

### 包版本与构建依赖

| 依赖 | 固定源码环境证据 | 使用边界 |
| --- | --- | --- |
| `@assistant-ui/react` | 固定 ref `0.15.29`；产品当前 `0.15.28` | 隔离预览可用 0.15.29；不隐式升级产品 |
| `@assistant-ui/core` | 已实际读取隔离 react 0.15.29 对应 core `0.3.29`；产品为 `0.3.27` | 动作/附件结论区分版本，见 installed evidence |
| `@assistant-ui/react-markdown` | 固定 ref `0.14.23`；peer react包 `^0.15.0` | 同时导入该包 `styles/dot.css`，由官方 MarkdownText 原件完成 |
| `@assistant-ui/react-ag-ui` | 固定 ref `0.0.70`；产品 `0.0.68` + 本地中断恢复 patch | 完整 Thread 不要求重写/升级业务适配器 |
| `@base-ui/react` | ui package `^1.8.0` | avatar/button/collapsible/dialog/tooltip 子入口 |
| `class-variance-authority`、`cn` | `^0.7.1`、`^0.4.0` | `cn` 是实际依赖名，不替换另一套合并函数 |
| `lucide-react`、`remark-gfm`、`zustand` | ui/registry `^1.52.0`、`^4.0.1`、`^5.0.15` | zustand 的 `react/shallow` 是 attachment hook 闭包 |
| React / ReactDOM | 组件 peer `^18 || ^19`，官方工作区开发版本 `^19.3.0` | 预览记录实际 lock 版本，不声称整套源码与所有 peer 均已实测 |
| Tailwind / tw-animate-css | registry `^4.3.3` / `^1.4.0` | 使用真实编译器生成 utilities 和动画，不手译 class |
| tw-shimmer | 固定源码包 `0.4.14`，peer Tailwind `>=4.0.0-0` | Reasoning/Tool/Surfaces 的真实 shimmer utility；原件 CSS 已保存 |

完整递归源码的直接外部 imports 见 manifest。react-markdown 的 react-markdown/classnames/micromark 等为其 npm 包传递依赖，不必将整个上游 UI 仓库全部安装；react-syntax-highlighter/shiki 并未被默认 MarkdownText 入口导入，不应为“全官方”虚增语法着色依赖并改变其默认外观。

### 默认 CSS 的确切来源与隔离方式

`vendor-full-thread/apps/registry/app/globals.css` 原样含 Tailwind、tw-animate-css imports、data-open/data-closed variants、collapsible keyframes、dark variant、theme role映射、完整 `:root`/`.dark` 默认 OKLCH 主题以及 base border/body 层。这是本次采用的**官方 registry 默认环境**；不等于声明官方营销网站每个页面恰好同色。`packages/ui/src/globals.css` 只有 Tailwind import，不能代替这一完整环境。

registry `:1465–1490`、`:1739–1759`、`:1763` 声明 reasoning/tool/group 需要 `@import "tw-shimmer"` 与 collapsibleStateCss；该 shimmer 原件位于 `packages/tw-shimmer/src/index.css`。入口仅补真实 registry 依赖 import/`@source` 扫描配置，不能添加自定义主题值或覆盖组件 selector。`@assistant-ui/react-markdown/styles/dot.css` 由官方组件 import；漏引会让流式呈现不完整。

独立 iframe 的 document 加载上述 CSS，挂载 `<AssistantRuntimeProvider runtime={runtime}><Thread /></AssistantRuntimeProvider>`。应用可以为 iframe/root 提供正常视口尺寸和高度容器，但不可进入 `.aui-*`/`data-slot`/后代选择器修改细节，也不可把 Mimir CSS variables 传到 iframe，不能延用 v2 的机械 prefix。深色若演示，使用官方 `.dark` 模式，保留原默认值。审阅控制器、场景选项、业务依据/恢复/文档操作位于 iframe 外并明确为应用宿主。

### 默认 Thread 覆盖范围（源码而非端到端验收）

以下 anchor 相对 `packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx`：

| 区域 | 官方默认内容与前提 | 不应扩大声称 |
| --- | --- | --- |
| 欢迎/建议 | `:453` 英文欢迎；`:463` runtime suggestions；`:248` 仅新会话且输入空时显示 | 不保留自绘 Mimir 欢迎覆盖；建议需真实数据/明确 fixture |
| Composer | `:497–607` 输入、附件、发送/停止、按 capability 条件启用语音输入；键盘和发送走运行时 | 没有 Mimir 范围/强度/模型菜单；不是自动具备模型/上传/语音服务 |
| 消息/Markdown/code | `:620` 官方 AssistantMessage + GroupedParts；`:827` UserMessage；MarkdownText 原件含 GFM表格/列表/段落/代码语言头与复制 | 不调用旧 MarkdownPart/CodeBlock；默认代码不是另加 Shiki 高亮版 |
| 图片/文件 | `:692–702` 与 `:800–825`，图片缩放预览与文件组件；附件独立原件处理移除/状态/预览 | 真实 image/file 数据可以展示，上传接受范围和 PNG 来源校验由 adapter负责 |
| Reasoning/tools | `:665–689` 真 reasoning 分组、ToolFallback、默认 ghost工具组；官方开合与等待状态 | 不把 retrieval trace 变成工具/推理；不注册 Mimir 自绘工具 UI |
| 错误/加载 | `:157` 历史 skeleton；`:610` MessagePrimitive.Error/原始错误；`:704` pulsing ●；`:388` 按 hasEarlier 加载更早历史 | 仅 CUSTOM mimir.failure 不是自动官方错误；默认并无分类失败出路卡 |
| 动作 | `:733` Copy、capability feedback、Refresh、Export as Markdown；`:855` 用户 Edit | Export文件不是存知识库笔记；反馈/重试/编辑必须有真实 adapter 能力 |
| 分支 | `:899` BranchPicker hideWhenSingleBranch；默认前后切换按钮 | 不自动让 Mimir 持久层支持分支、历史重写或编辑重发 |
| 语音/后续建议 | `:272` voice modality视图；follow-up-suggestions.aui `:72` 按状态显示建议 | 没有实际 voice/dictation adapter 不展示为已开通业务 |
| 原生 source/audio 等 | assistant switch `:684–715` **没有** source/audio/generative/quote 专用 case，default null | 外部库有 Sources 或播放器不代表完整Thread自动覆盖所有类型；当前 file组件内部媒体支持与audio part不是同一件事 |

完整 Thread 自身没有 QueueList / queue item UI。实际 react0.15.29 `ComposerInput.tsx:258–296` 核实：仅 running 且无 queue capability/voice 时阻止 Enter；有真实 queue adapter 且 canSend 时普通 Enter 经 requestSubmit 进入官方 composer.send，可排队。core0.3.29 `primitive-predicates.ts:13–18` 同样允许 running+queue发送。屏幕右侧显示取消按钮与键盘可排队是不同默认判据，不能据取消图标断定Enter不可用。显式排队查看/取回面板仍需在宿主外部提供；不能声称默认 Composer 已带完整队列列表，也无需为支持Enter重写官方Input。

### 附件与复制错误的精核（实际 .15.29，而非仅推测 .28）

已只读检查 `/private/tmp/mimir-chat-official-v2/official-deps/node_modules/@assistant-ui/react`，版本 **0.15.29**；其 `@assistant-ui/core` 实际 **0.3.29**。精确路径、源码 SHA256 与行号摘录保存到 `vendor-full-thread/installed-api-evidence.json`。这是安装产物证据，不以它替换固定 registry 原件。

- `attachment.aui.tsx:262–285` 无条件挂 ComposerPrimitive.AddAttachment。ThreadProps `:134` 只有 `components`/`autoFocus`，不存在隐藏 AddAttachment 的官方 Thread 配置项。
- react `ComposerAddAttachment.ts:18,69–70` 根据 hook.disabled 返回回调；core `useComposerAddAttachment.ts:7–8` **仅**检查 `s.thread.isDisabled || !s.composer.isEditing`，没有检查 attachments capability。
- react `createActionButton.tsx:42–47` 即使回调不存在也返回禁用 button，不隐藏。core `base-composer-runtime-core.ts:49` 主输入默认 isEditing=true；`:773–781` 真实 File 在缺少 attachment adapter 时发 `composer.attachmentAddError` 并抛 `Attachments are not supported`。Add 文件选择 callback 吞掉 rejection；不能宣称默认提供可见的错误说明卡。
- 因此完整原件 + 无 adapter 会保留“+”入口；正常可编辑时仍可打开文件选择，选择后 unsupported。不能用 CSS、components override 或人为把整线程 disabled 来只藏附件。产品必须明确选择真实附件 adapter/允许范围，或接受并说明官方默认 unsupported 的边界；研究不擅自扩展服务端上传能力。原型若做附件场景需使用真实 fixture附件adapter、明确模拟，不假装产品已开通。
- 历史 image part 或带 image content 的 complete attachment，不依赖新上传 adapter 即可读取展示（`use-attachment-src.ts:44–58`）；PNG 本身并不会因此丢失。Mimir 原有 PNG 的内存寿命、视觉模型、文档/页/版本校验不能因改默认 UI 删除。
- 官方 `image.tsx:208–304` 有加载图标和 ImageOff 失败占位；`:621–648` 默认 ImageImpl 包含 zoom/preview/filename，running 与content-filter另分支。虽导出 copy/download 子件，但默认 ImageImpl **没有挂这两项**，不能加上后仍称完整默认。attachment 的独立 preview仅onLoad，不等同ImagePreview的完整错误支路。
- Markdown代码复制 hook `hooks/use-copy-to-clipboard.ts`：Clipboard API 缺失直接返回，Promise reject吞掉且不显示成功；没有自绘失败提示、execCommand降级。ActionBar Copy 也只在成功后亮勾；iframe必须满足浏览器 clipboard权限/用户手势，不能宣称浏览器拒绝时已复制。

### 默认动作门控与执行安全

实际 core0.3.29 `store/primitive-predicates.ts`（installed evidence）与产品0.3.27的关键判据一致：Copy仅“非running且有非空 text”；ExportMarkdown同样。**没有** Mimir failed/Agent/只检索专属过滤。Thread ActionBar hideWhenRunning + autohide=not-last 并不等于旧“仅成功最后一条动作”。最新全默认要求允许改变这些视觉门控，不能为沿用 v2 覆盖源码/隐藏默认动作；但不能因此放开执行。

Reload 只检查 running/disabled/voice/assistant/capabilities.reload，后者由 external-store `onReload` 是否存在决定；缺少时原按钮 disabled，通常仍存在。刷新动作会启动重生成，不是恢复已执行工具。提供 onReload 时必须按 target/sourceId 和原Mimir上下文选择已有安全 retry 或缓存结果 resume。Agent 已执行结果重送不能重新执行画布工具；版本/来源变化继续拒绝。若宿主不能安全实现某种重载，不提供能力，保留官方 disabled 外观；不能给所有场景接一个无差别 onNew 重跑。普通队列、PNG截图、只检索降级亦须走原有参数/恢复守卫。

Copy/Export 可以处理错误正文，这是完整官方默认的真实行为；它们不写文档。保存笔记仍是独立宿主 IO，依旧只允许可保存的成功正文。不要通过将失败消息标成 running 来骗取官方隐藏，这会损坏真实状态和取消逻辑。

### Runtime/AG-UI 和宿主 IO 接缝

完整 Thread 需要真实 AssistantRuntimeProvider；仅往 DOM 放相似 HTML不算。独立预览可用官方 `useExternalStoreRuntime`：最小输入/发送为稳定 `messages` + 必需 `onNew(AppendMessage)`，如用非标准数据则提供convertMessage。按真实支持提供 onCancel/onReload/onEdit、setMessages、hasEarlier/onLoadEarlier、suggestions/adapters。未实现的能力不挂假回调。`onNew`/流式更新更新真实 store；不要另画“模拟输入框”替代官方 Composer。

产品可继续用已存在 `useAgUiRuntime` 和 Mimir agent/history/IO（兼容性待实际验收），在 provider下替换为完整 Thread；无需为了视觉变更改服务端协议。真实 reasoning/tool-call/文本按适配器 canonical parts 输入。引用、分类失败、Agent历史等 CUSTOM 数据若不注册data renderer，Thread `:690–691` 的 `part.dataRendererUI` 通常为空；必须让外部应用宿主同步消费既有业务数据，不能静默丢失，也不能在Thread内部再注册自绘data UI伪称全官方。

| Mimir 业务 | 官方是否直接覆盖 | 保留位置/边界 |
| --- | --- | --- |
| 普通输入/发送/停止/复制/Markdown/code/常规错误 | 基本有，实际依赖runtime能力 | 完整Thread；动作的执行参数与失败恢复由原adapter保障 |
| 引用列表与同篇定位/跨篇未保存守卫 | 默认Thread无 Mimir citation UI；原生source也无默认case | 对话外“本轮依据”宿主面板，继续原citation IO；不向模型正文插虚拟引用组件 |
| 范围、强度、模型管理入口 | 无 | 对话外真实宿主控制；模型两项只读、侧栏标准强度合同保留 |
| 队列显式列表/取回 | 运行时有queue，完整Thread没有列表UI | 外部宿主面板；停止/失败归还文字/PNG/目标规则保留 |
| 分类失败出路、草稿取回 | 默认Error无业务按钮 | 宿主恢复区接已有安全动作；不自绘塞回消息流 |
| 保存成笔记/打开笔记 | Export Markdown不等价 | 宿主文档操作，通过原ChatIo；不隐藏官方Export |
| PNG截图草稿与发送校验 | 官方附件/图片负责视觉，不识别原文档寿命 | 原registry/adapter保证来源、页、版本、视觉模型和恢复；host管理来源，Thread呈现真attachment |
| documentAgent/docxAgent与interrupt/resume | 官方ToolFallback支持真tool事件和approval，不能替代自动执行桥 | 原桥保留为无视觉runtime/业务逻辑，宿主区呈现应用执行/恢复控制；禁用重复自动工具执行管线 |
| 切会话/历史/分支 | Thread可显示历史/分支，持久化不自动具备 | 保留会话宿主和稳定runtime寿命；分支/编辑未真正支持时官方能力不可用 |

“全官方对话”与“保留宿主业务”应在 HTML 明确分区，并列出每个入口迁移位置，不能为了视觉纯净删功能。本研究不授权增加通用上传、点赞后端、多分支存储或语音服务。

### WeKnora 本轮复查与适用性

已并发重新 GET 官网、固定源码 package、AgentStreamDisplay，三者 HTTP200，结果与摘要摘录保存 `vendor-full-thread/weknora-reference-recheck.json`。官网展示 v0.8.3，标题“ WeKnora — 帮你找到答案，并将知识付诸实践”，HTML 113529 bytes，SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`。公开源固定 `2c0d8384398ca756ee414eef01b71caf91e2caa6`，frontend包版本0.8.3；AgentStreamDisplay源码 SHA256 `7d20b094fb912beab810ba1ad603873276827fd5275a463d56f60eff38bc6a88`。

`AgentStreamDisplay.vue:62–79` 有自绘thinking卡和开合，`:421–454` 成功且非空时才显示动作。这仍能说明过程与结果、可恢复动作需真实分层，但其视觉和严格成功门控**不作为本次Thread模板**：用户选择完全官方默认，不能重画WeKnora。引用/队列/恢复证据沿用 `weknora-reference.md` 的固定来源，对本轮只适用于宿主业务边界。未将它的Markdown编辑器用作Office工具栏参照；官网展示版本不等于已证明线上部署SHA。

### Related specs

- `.trellis/spec/chat/frontend/conventions.md`、`pitfalls.md`：现有runtime/IO、真实parts、队列归还、PNG、Agent bridge与patch；视觉现状条款需未来实施验收后另行更新。
- `.trellis/spec/shared/contract/document-agent.md`、`docx-agent.md`：执行/中断/续轮/版本安全。
- `.trellis/spec/renderer/frontend/document/conventions.md`：引用定位、未保存守卫与侧栏生命周期。
- `.trellis/spec/project/research.md`、`rules.md`、`quality.md`：固定证据、范围和效果验证。

### 写入范围与基线

本研究仅新增 `research/full-official-thread-contract.md`、`research/vendor-full-thread/**`，不改v1/v2、产品或spec，也未执行git操作。闭包35份原件逐一SHA256复算一致，unresolved=0；按已有product-baseline-hashes.json复算47个来源，47/47未变。未运行产品测试。

## Caveats / Not Found

- 这是源级闭包研究，不声称新完整Thread已构建、全场景浏览器或产品测试通过；由原型作者提供实际安装lock、构建和GUI结果。
- product0.15.28与prototype0.15.29/core0.3.29分开；未隐式删除或升级本地AG-UI0.0.68中断恢复patch。完整原件兼容旧产品适配器需后续实际验证。
- 默认Thread不自动具备全部AG-UI part UI与Mimir业务。default null的source/audio等、未注册CUSTOM、附件无adapter的unsupported以及默认复制失败无可见说明均已明确；不得靠自绘补丁后仍声称“零覆盖”。
- 研究源码清单含registry分析证据而非仅可执行源，消费时以runtime_source_files为准；保留LICENSE。网络获取失败不能用近似自绘代码代替原件。
- 首次完整官方预览仍在规划审阅范围；既有v1/v2保留，产品实现仍须用户对完整方案认可。
