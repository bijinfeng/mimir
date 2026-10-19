# Research: v4 输入框内三项控制的最小扩展合同

- Query: 用户同意仅扩展 Composer 底部工具栏；如何将模型、思考强度、知识库范围放回输入框内，同时保持官方消息/基础件/默认 CSS 与现行业务语义？
- Scope: mixed；仅研究及 v4 HTML 方案，不改产品。
- Date: 2026-10-19

## Findings

### 已批准边界与建议

用户已同意“仅扩展输入框底部工具栏”。这是组合边界批准，尚非具体 v4 HTML 或产品实施批准。v1/v2/v3 保持原样。v4 应明确称为“官方 Thread + Composer 业务工具栏扩展”，不能继续宣称整个 Thread 源码一字不改。

**最小、诚实且便于审计的改法：**复制固定官方 Thread 到 v4 独立 patched 路径，保留原件另存；只增加一个业务工具栏 import，并在 `Composer` 的原 `<ComposerAction />` 前增加 `<ComposerBusinessToolbar />`。这样三项都在 `data-slot="aui_composer-shell"` 内，原附件、输入、Action/发送/停止完整保留，消息链及原有 className 完全不动。无需改 ThreadProps、components 表、消息/part/tool renderer，无 DOM 注入、Portal 定位或叠加遮挡。

新增工具栏内部可以有自己的排布容器（换行/布局），控件全部用固定官方通用 `Button` + `DropdownMenu`/RadioItem 默认实现及其公开 variant/size，不添加控件 className、token 或样式覆盖。不要为了看似用了语义官方组件而套用错误的 ModelSelector 业务模型。

### 模型、强度与范围的真实合同

| 维度 | 源码事实 | v4 应保留的行为 |
| --- | --- | --- |
| 模型 | `packages/chat/src/composer/ComposerMenus.tsx:213–293` ModelDropdown 只有两个 disabled 的全局绑定信息项，以及“管理模型”跳转；模型名由宿主配置来 | 显示有效角色的模型名；菜单“对话模型 / 深度思考模型”两项只读，标明当前角色；管理项可点。不是按会话选择任意模型 |
| 思考强度 | 同文件 `:170–211`；`ChatPanel.tsx:195–207` | 主对话可选“标准（对话模型）/深入（推理模型）”；只写 `deepReasoning` 布尔值，联动当前模型名，不写 provider effort |
| 范围 | `ComposerMenus.tsx:111–168`；`Composer.tsx:234–285,387–403` | **单篇或全部文档**，不是多知识库/多文档选择。null=全部文档；最近20篇，选择 `{id,title}`；替换、移除→null；无新增搜索功能 |
| 侧栏 | `types.ts:113–114`、`ChatPanel.tsx:198–206`、`renderer/src/components/document/DocChatSidebar.tsx:216` | 现行强度入口隐藏，并且有效值强制 false，不能仅隐藏后残留 deep。v4 来源 hidden 状态必须有明确映射；如果设计要展示“标准”状态，只能只读且解释侧栏限制，不能擅自开放深入 |
| 模型数据 | `renderer/src/lib/use-chat-composer-status.ts:23–55` | host 取 config，roles.chat/reasoning 的模型名注入；同名模型仍由角色区分；缺失如实“未配置”，管理入口保留 |
| Agent 目标 | `runtime/agent.ts:145–205` | 真 Agent 路由以画布句柄 documentId 覆盖请求目标；范围选择不是编辑目标选择或执行权限。仍保留来源/版本/轮次/画布守卫 |
| 容量 | `ComposerMenus.tsx:296` 后 | 非本次三项控件必要组成；v3 外部真实 usage 仍可保留；没有真实 usage 不填0，不扩大本次例外 |

**禁止直接用 `model-selector.aui.tsx`：**固定官方文件 `:58–75` 会自动往 ModelContext 注册 `config.modelName` 和 `config.reasoningEffort`。现行 Mimir 服务端只根据 `deepReasoning` 选择 chat/reasoning 角色，根本没有该轮随意换模型合同。`model-selector.tsx` 纯 UI Root 虽可不注册，仍携带模型/effort语义；本轮优先通用 DropdownMenu，避免把知识库文档包装成 models、把标准/深入包装成 provider effort。

### 公开基础件证据

固定版本仍为 assistant-ui/assistant-ui `a587b2838f2d644549d216098d54cfbeedfac522`，MIT，沿用已归档完整 LICENSE。

- 完整 Thread：`prototype/v3/vendor/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx:497–519` Composer shell，`:521–607` 原 ComposerAction；无 toolbar slot，单插入节点是明确源码补丁，不能称现成 slot。
- Button：同 vendor `components/react/ui/base/button.tsx:6–40` 提供原生 ghost/outline 等 variant 与 sm/xs 等 size；`:43–54` 透传公开 props。使用公开变体不是自绘 CSS。
- 通用 dropdown：同 commit `packages/ui/src/components/react/ui/base/dropdown-menu.tsx`，2026-10-19 在线读取成功，8553 bytes，SHA256 `897df3d3b32c9f292b7bf09e3c00f475c1c28916a660ebe810a8ca8d8337630d`；直接基于 `@base-ui/react/menu`，提供 Trigger/Content/Group/Label/Item/RadioGroup/RadioItem/Separator。URL：`https://raw.githubusercontent.com/assistant-ui/assistant-ui/a587b2838f2d644549d216098d54cfbeedfac522/packages/ui/src/components/react/ui/base/dropdown-menu.tsx`。
- 通用 select：同 commit `packages/ui/src/components/react/ui/base/select.tsx`，6112 bytes，SHA256 `9615f9d4a5d72f55ea0519152e1a69ba555237d8ba21cffa24ff071cd5cf9596`。也可用，但模型菜单同时包含管理动作，统一 DropdownMenu 更直接；不需要同时导入两套。
- 官方 ModelSelector 原件及哈希：`research/composer-controls/source-manifest.json`；这些是能力证据，不是要求错误注册字段。

建议三项菜单均由通用 DropdownMenu 组合：模型以 disabled radio 项展示 chat/reasoning 当前绑定，独立管理 Item；强度以受控 radio standard/deep；范围以受控 radio all/documentId 并保留恢复动作。控件应有 type=button 与真实 aria-label，不能触发表单发送。长标题只在新增业务文字 wrapper 中截断/换行，并通过 title/菜单保留全名；不要修改官方 Button 或 Content 的类。

### 状态表与来源映射

| 来源与状态 | v4 交互/真实数据 | 必须验证 |
| --- | --- | --- |
| CHAT-009 all/menu | 输入框内“范围：全部文档”；菜单最近20文档 | 选中单篇实际 ID，菜单关闭，草稿不变 |
| CHAT-009 loading/error/empty | disabled“加载中…”；error 单独“读取失败，点此重试”；empty disabled“知识库还没有文档” | error 不冒充 empty；重试确实恢复 fixture 列表 |
| CHAT-009 dismiss/keyboard | 原生菜单关闭/焦点管理 | Escape 仅关菜单、不触发停止/清草稿；方向键/Enter 选择 |
| CHAT-010 selected/long/replace/remove | 显示选中范围，支持替换与清除→all | 全标题可获知；普通草稿不被清掉 |
| CHAT-010 queued | 已入队按原单篇ID；当前输入框可改为另一范围 | 当前变化不回写旧队列 |
| CHAT-011 standard/menu/deep/dismiss | 两种角色路由；改动后当前模型名随对应角色变化 | deepReasoning 精确 true/false，不出现 reasoningEffort |
| CHAT-011 hidden；HOST-014 reasoning | 侧栏有效 standard；沿用隐藏或明确只读状态 | 不出现可选深入，不暗中发送 deep |
| CHAT-012 chat/reasoning/menu | 角色绑定只读，当前项标示 | 点击信息项不切模型/角色；管理可用 |
| CHAT-012 missing/same-name/long/manage | 未配置、角色区分、长名称、管理跳转 | 不显示假模型或任意模型选择；未配置仍可管理 |
| HOST-011 loading/empty/error/items/retry | 与范围菜单共享同一数据源 | 不另造第二份文档列表/多选索引 |
| HOST-012 bound/missing/manage | 同模型菜单 | 管理是宿主动作，原型只模拟明确的管理目的地 |
| 正在生成 | 控件可改，为下一次输入服务 | Enter 队列继续用官方路径；停止键仍完全原件 |
| 发送准备/异步附件 finalize | 建议固定本次 submission 的配置，UI 当前配置仍可改变，但必须准确解释其影响下一次发送 | 发送开始就冻结，不能 finalize 后再读当前控件 |
| 截图/Agent/no-vision/search-only | 原守卫先于 send/append 生效；通用附件不混进 Agent/专用截图 | 拒绝保留草稿/附件；不能借模型菜单或范围菜单绕过执行校验 |
| 深浅/窄屏/缩放/hover/focus | 原控件 CSS；只调整扩展容器布局 | 三项仍在 shell 内，无覆盖/横溢/hover 布局抖动，无重复宿主三项 |

### 冻结与请求字段

`Composer.tsx:278–285` 现行字段是 `runConfig.custom.documentId` 与可选 `deepReasoning:true`。v4 新工具栏应发布这两个规范值，发送 facade 在原 composer.send 前同步读取最新选择并产生新对象；运行中的队列每项保存各自原对象。通过官方 suggestion 的 thread.append 也走同一冻结函数，不能只改 Composer 点击路径。

队列冻结的是**请求角色意图和范围/画布快照**，不是客户端模型显示名称。`apps/server/src/services/assistant-stream.ts:147,331` 根据 `deepReasoning` 选择角色；`assistant.ts:90` 相同。现行没有每条消息固化 provider/model ID 的合同，不能宣称“之后用户改全局绑定，队列仍必定使用原模型ID”。模型名是当前全局绑定展示；增加 per-request model override 超出本次有限扩展。

保留既有 `research/agui-official-thread-pre-send-seam.md` 公共 runtime facade：同一原 runtime/core/queue/interrupt extras，包装 composer.send 和 thread.append，在异步 finalize/初始化/入队之前冻结；不新增第二运行时、不替换 AGUI 队列、resume 不重新 freeze、不重复执行工具。代理覆盖 thread / threads.main / threads.getById。原研究两组SDK各4项探针只证明接线，不证明 v4 完整产品。

v4 fixture 最好把 `documentId/deepReasoning` 作为实际 send/queue event 的结构化 snapshot（连同 Agent 场景既有快照）记录在宿主检查区；不是仅切换视觉标签。用明显的来源fixture文档ID，如已经存在的两篇示例内容，不捏造知识库服务。A=单篇1+标准，发送/入队；B=单篇2+深入，再入队；后改 C=全部+标准；派发/取回都能证明各自 A/B。模型只读菜单不得产生 modelName/reasoningEffort 或虚假网络写入。

### 最小实施顺序（仅 v4 HTML）

1. v3 原样冻结，另存 v4 原型和官方 original/patched 源、统一原件/闭包哈希与单独补丁 diff。
2. 获取同commit dropdown 原件及其实际闭包，统一官方默认 CSS；不得混入其他版本shadcn或Mimir token。
3. Thread 只增加工具栏 import + shell 内一处调用；新增文件实现三项业务组合及结构化状态。保留原 ComposerAction/输入/附件源码与全部消息依赖哈希。
4. 移除 v4 外部重复范围/模型/强度控件，宿主保留队列/恢复/引用/usage/Agent守卫等本来非官方的能力；更新三项位置映射和真实业务分类，不把它们重新计为官方原生语义。
5. 覆盖表内状态，恢复所有原403 routes及来源ID，三项位置各相关页面同步变化；新增测试状态单列，不把来源状态数量当GUI实测。
6. 浏览器走代表完整路径，提供 v4 HTML 对比审阅；用户认可具体稿后方进入产品实施。

### 验收清单

- 两种对话布局都能确认控件是 Composer shell 的后代；不存在视觉浮层伪装位置或外部重复三项。
- patch diff 除一处工具栏接入不改官方 Thread 其他块；消息/markdown/reasoning/tools/attachment/actions 与 CSS 哈希不变。新增通用UI文件有固定来源、闭包和许可。
- 模型只读/未配置/同名/长名/管理，范围7态及单篇替换清除，强度5态都有实际可交互或明确来源边界。
- main 标准↔深入时字段/有效角色联动，sidebar 有效 false，绝不写 modelName/reasoningEffort。
- 运行中改控件→入队A/B→再改C，队列与异步附件发送保留原冻结；建议发送/拒绝/停止/取回同一runtime，没有草稿覆盖。
- 真实来源/文档版本/截图/模型视觉/仅检索/通用附件排斥守卫保留；范围变化绝不改变可执行文档目标。
- 深浅、窄屏、键盘关闭/回焦、hover无抖动和长名可访问性验收；真实IME/系统picker/上传/模型/产品持久化仍明确待产品验证。

### 项目参考与规范

按用户研究规则，复用本任务同日固定 WeKnora 证据 `research/vendor-full-thread/weknora-reference-recheck.json`：官网 `https://weknora.weixin.qq.com/` HTTP200，v0.8.3，SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`；公开源码 `https://github.com/Tencent/WeKnora` 固定 commit `2c0d8384398ca756ee414eef01b71caf91e2caa6`，frontend0.8.3。适用于知识库/Agent范围、来源与权限分工的业务核查；本次三项仍按Mimir真实单篇/全局角色合同，不能照搬WeKnora能力或自定义过程样式。对话视觉和组件主证据是固定 assistant-ui；本主题非Office工具栏，不以WeKnora Markdown编辑器为参照。

相关规范：`.trellis/spec/chat/frontend/index.md`、`conventions.md`、`pitfalls.md`，`.trellis/spec/project/rules.md`，既有`research/full-official-feature-mapping.md`与发送seam研究。旧规范Mimir主题继承与本次用户官方组件/default CSS要求冲突时，用户最新要求优先，但研究不自行修改spec。

## Caveats / Not Found

- 官方没有现成 Thread toolbar slot；这是经过用户允许的有限源码扩展，不能称未修改完整Thread。
- 尚无证据表明现行Mimir支持按会话任选模型、provider effort、多知识库/多文档范围；本轮不新增这些业务。
- 侧栏强度现行确为隐藏且强制标准；用户泛称“三项需要”不应被解释为自动授权Agent侧栏深入模式。
- 本报告研究/在线原件检查不等于v4 UI已实现/验收；真实产品源码、原型、其他任务、spec及git均未修改。
