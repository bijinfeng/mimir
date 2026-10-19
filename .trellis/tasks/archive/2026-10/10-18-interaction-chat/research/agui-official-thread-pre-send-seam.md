# Research: AG-UI official Thread pre-send seam

- Query: 在 react-ag-ui 0.0.68（本地中断恢复补丁）与未覆盖的完整官方 Thread 下，如何在普通发送及 queue.enqueue/steer 前同步冻结文档、版本、选区、runConfig，并保留原 interrupt bridge 的唯一所有权？
- Scope: mixed（本地产品/公开运行时源码、隔离真实 AG-UI HTTP 探针、固定官方 Thread 调用链）
- Date: 2026-10-19

## Findings

### 推荐：装饰公开 AssistantRuntime 动作，不替换运行时

已找到具体可执行且通过最小隔离验证的路径：保留 `useAgUiRuntime()` 返回的原 runtime 及它的 AG-UI core/queue/extras，只给 **Provider 和应用主动发送入口提供一个稳定的公开 API facade**。

- 包装 `runtime.thread.composer.send(options)`：先读公开 composer state；不能发送或已有 submission 时直接返回；同步调用冻结函数、写回公开 `composer.setRunConfig(frozen)`，成功后才调用原 `composer.send(options)`。冻结拒绝则留住原草稿、显示真实宿主错误，不调用原 send。
- 包装 `runtime.thread.append(message)`：官方 suggestions 走此入口而非 composer.send。将 string 正规化为真实 text message，保留 role/content/attachments/metadata/其他字段；仅新用户指令冻结到该消息的 runConfig，再调用原 append。不能从当前 composer 读取附件去替代 message.attachments。
- **必须同步包装 `runtime.thread` 与 `runtime.threads.main`，以及公开 `threads.getById(id)` 返回的 thread。** Provider 的 RuntimeAdapter 主要沿 `threads.main.composer` 取公开对象，只包装根 `thread` 会失效。用 WeakMap 保持每个原 thread/composer 的 facade 身份稳定，其他函数以原对象为 this 透传。
- 业务代码中所有新发送入口要使用 facade（或统一共享同一个冻结函数）。原 `api.ask` 当前会自己 docxRunConfig 再 send，未来应只保留一次冻结，避免生成两个 roundId。纯读取、队列取回、取消、中断续轮继续原公开对象语义。
- 不接管 enqueue/steer 的内部实现，不新增 queueController，不复制 AGUI 的 busy/idle 边沿或 createMessageQueue，不替换 extras，不重注册 tools/data renderers，不修改 Thread/Composer/任何 CSS。完整 Thread 仍是 `<Thread />`。

研究用的可执行最小实现：`research/pre-send-seam-probe/runtime-facade.ts`。它使用公开 `AssistantRuntime` / `ThreadRuntime` / composer/send/append/getState/setRunConfig、通用只读转发 Proxy；不读取或写入 `_core`、queueController、私有 binding，不修改原 runtime 的方法。官方 Provider 自身读取原对象内部实现的行为由通用转发保留，应用实现不依赖私有字段名。

这不是“公开 beforeSend 选项已经存在”：原库没有这个选项；这是公开 runtime 接口的装饰器。无需新增上游补丁即可落实本次发送前置冻结。若团队不接受公共 API facade，可另提出上游正式 pre-send transform，但不是当前必须条件。

### 为什么时间点足够早

| 调用链 | 源码证据 | 冻结时点 |
| --- | --- | --- |
| 官方 Composer 发送 | installed core `src/store/runtime-clients/composer-runtime-client.ts:172–184` 调输入的 `runtime.send(options)`；官方 Thread 未覆盖 ComposerPrimitive | facade 在原 composer.send 前；原 core 尚未捕获 runConfig、清草稿、开始附件finalize、初始化或排队 |
| 官方建议直接发送 | core `src/react/primitive-hooks/useSuggestionTrigger.ts:27–43` 调 `aui.thread.append({content,runConfig})`；ThreadClient `:222–238` 调输入的 `runtime.append` | facade 在原 thread.append 前，覆盖建议及通过 facade 的程序追加 |
| 原 composer 核心 | core `src/runtime/base/base-composer-runtime-core.ts:334–375` 在 `:351` 捕获 runConfig，后续 detach/notify/finalize | facade 先 setRunConfig，原核心捕获的就是该次不可变对象；即使附件finalize异步也不晚 |
| 队列入口 | core `src/runtimes/external-store/external-store-thread-runtime-core.ts:1132–1167` 可能先 await 初始化，再调用 enqueue/steer | facade 已在任何这类 await 前冻结，解决单纯包 queue adapter 仍可能晚于初始化的缺口 |
| 无队列 | 同文件 `:1207` 的 onNew | facade 已完成；不依赖晚到的 onNew |
| 普通 send 事件 | base composer `:486` handleSend后，`:515`才发send | 不能作为前置冻结点；本方案不使用事件订阅 |
| AGUI真实出网 | `AgUiThreadRuntimeCore.ts:1636–1639` 将 message.runConfig.custom 带入 forwardedProps.runConfig | 隔离探针在HTTP真实请求中验证，不只观察UI状态 |

完整 Thread 固定源 `a587b2838f2d644549d216098d54cfbeedfac522`；`elements/thread.aui.tsx` 使用默认 ComposerPrimitive、SuggestionPrimitive.Trigger send。实际默认源码与SDK API详见 `full-official-thread-contract.md`。本研究具体行号以隔离 core0.3.29为主；产品0.3.27同公开接口已运行验证。

### 现有 hook 及 bridge 的所有权

`UseAgUiRuntimeOptions` 位于产品 `@assistant-ui/react-ag-ui/src/runtime/types.ts:79–129`：shared options只有 disabled/sendDisabled/copy/suggestions；adapters包括 attachments/speech/dictation/voice/feedback/history/threadList，没有 queue 或 beforeSend 注入。`useAgUiRuntime.ts:124–158` 自己 createMessageQueue，`:329–362` 自己绑定 onNew/cancel/edit/reload/extras。

`hooks.ts` 的公开 `useAgUiInterrupts`、`useAgUiSubmitInterruptResponses`、`useAgUiSteerAway`、A2UI/state hooks 都读取同一个 agUiExtras。`packages/chat/src/runtime/DocxInterruptBridge.tsx` 使用其中的 interrupts/submit hooks自动执行文档客户端工具并续轮。facade透传原 `getState().extras`，不创建第二份 extras/agent/core，也不把文档中断替换为 ToolFallback approval 或 onAddToolResult。恢复提交继续原 explicit resume[]；它不经过新指令的 composer.send/append，因此**不重新生成 roundId/选区，不重复执行文档工具**。

公开 send/append 装饰器没有覆盖官方用户 Edit、助手 Reload、voice转录、steerAway 新消息等全部动作。这些是独立能力：

- 现有 Mimir 不支持的编辑/重生成/分支不应开放假回调。AGUI hook默认声明onEdit/onReload，shared unstable_capabilities目前只有copy，不能凭传`reload:false`宣称禁用；完整官方产品接入必须通过真实 capability facade/显式安全动作适配或最小上游选项解决，并单独验收。不能CSS藏按钮。
- 若后来确实开放这些动作，必须分别装饰对应公开 `message.reload`/edit composer/startRun/steerAway等业务入口，并按历史目标与缓存结果合同处理。不能把“新指令freeze”套进resume重传。
- 本轮没有voice/dictation业务，不应以视觉组件存在新增服务。Thread defaults未启用相关adapter时保持其真实能力状态。

### 接入 Mimir 的最小步骤

1. 在 `use-mimir-runtime.ts` 保留原 `useAgUiRuntime` 创建、history、onCancel/onError、queue与恢复补丁；将结果命名为rawRuntime，仅用于内部不发新指令的操作。
2. 将现有 `docxRunConfig`/`prepareDocxSend` 抽为同步 `freezeOutgoingIntent({runConfig, attachments, source}) → RunConfig`。保留 `snapshotNames`、1张截图、注册表/来源活性、文档/页/版本、视觉模型、scope禁止search、freezeSelection与新roundId逻辑。普通composer用其真实attachments；append用该message.attachments；不把它们互换。返回新对象，禁止随后修改已发送对象。
3. 为rawRuntime创建稳定facade；回调通过最新ref读取现文档句柄/模型/范围，**不把旧render闭包作为当前文档**。包装对象缓存使用项目既有React Compiler约定；研究探针useMemo只为隔离实验，不强制产品增加memo。
4. Provider、导出的runtime与所有新发送统一用facade。删除原自绘Composer前置onBeforeSubmit接线，默认Thread完全不改。`api.ask`先处理指定历史snapshot和范围覆盖，再经同一freeze发送一次；移除原重复docxRunConfig，sentHere只有实际接受时更新。
5. `getDocxRound/advanceDocxVersion/registerToolCancel`与原DocxInterruptBridge继续绑定同一round/version状态。enqueue后不再根据当前画布重冻；dispatch必须继续原来源/版本/注册表检查，失效拒绝和新稿保护不变。
6. 将安全新发送拒绝显示在Thread外恢复区；composer拒绝因未调用原send天然保稿。append/建议拒绝需保存真实rejected intent供宿主恢复；官方建议callback可能在append返回后清空composer，不可据此声称任意现有草稿都保留。应在实际默认建议可见条件和isSendDisabled下验证，并针对竞争拒绝按草稿generation保护；不要异步无条件setText盖新稿。
7. 完整官方+新业务附件另按 `chat-attachment-planning.md` 处理；本方案不批准永久KB导入伪装临时附件。

### 隔离验证及其边界

探针文件均在 `research/pre-send-seam-probe/`：

| 文件 | 用途 |
| --- | --- |
| `runtime-facade.ts` | 公开接口最小装饰器，无渲染/样式/私有runtime访问 |
| `probe.test.ts` | 真React Provider + 原官方Composer/Suggestion primitives + 实际patched AGUI +真实本地HTTP SSE；只用明确fixture文档/选区/附件 |
| `vitest.config.ts` | 产品React .15.28/core .3.27/AGUI .0.68与原补丁的隔离解析 |
| `result.json` | 4/4 passed；包括一次预期503失败用于补丁恢复测试，不是未处理失败 |
| `tsconfig.json` | 最小facade严格类型检查通过，无产物 |
| `vitest-v29.config.ts` / `result-v29.json` | 另列新SDK兼容性实验，最终状态以结果文件和下方补记为准 |

4项最小探针实际验证：

1. 官方发送动作先freeze A；运行中另两条B/C分别入队；派发时live已D，真实三个HTTP forwardedProps仍为A/B/C，freeze只3次；Thread与threads.main为同一facade，extras与原runtime引用相同。
2. 官方Suggestion Trigger走装饰后的append并传原suggestion上下文；普通composer发送前拒绝不发HTTP、不进队列、草稿原文仍在，真实错误交宿主。
3. 原公开interrupt hooks看到pending；503续轮失败后本地补丁恢复pending；第二次submit成功，只有初次新指令freeze一次，没有新round或重复工具执行管线。探针没有真实写画布，不能把它称文档工具全链验收。
4. 附件adapter.send故意等待异步gate；等待中live A→B，真实发出的runConfig仍A，证明freeze早于finalize，不是仅HTTP派发前取当前值。此附件是明确fixture，未接产品新上传能力。

命令：

```sh
packages/chat/node_modules/.bin/vitest run --root "$PWD/.trellis/tasks/10-18-interaction-chat/research/pre-send-seam-probe" --config "$PWD/.trellis/tasks/10-18-interaction-chat/research/pre-send-seam-probe/vitest.config.ts" --reporter=json --outputFile="$PWD/.trellis/tasks/10-18-interaction-chat/research/pre-send-seam-probe/result.json"
packages/chat/node_modules/.bin/tsc -p .trellis/tasks/10-18-interaction-chat/research/pre-send-seam-probe/tsconfig.json
```

**这是最小官方primitive探针，非完整Thread GUI或产品端到端。** 证明公开接线可行，不证明v3视效已验收、当前文档组件全部接入、真实画布执行/历史保存/取消归还已通过。完整v3由独立source/artifact审查与主会话GUI核查，产品实施时仍需完整集成验收。不得直接把4项映射成原379态通过。

### 参考、相关规范

本次沿用并检查同日 `vendor-full-thread/weknora-reference-recheck.json`：WeKnora官网HTTP200，展示 **v0.8.3**，SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`；公开源固定 `2c0d8384398ca756ee414eef01b71caf91e2caa6`，frontend0.8.3。`AgentStreamDisplay.vue:62–79,421–454`证明其思考与成功动作业务分层，不能提供assistant-ui公开发送seam。对本主题主证据是实际运行时和官方调用链；WeKnora仅适用于KB/Agent恢复/来源合同，不作默认Thread视觉或Office工具栏模板。

相关规范：`.trellis/spec/chat/frontend/conventions.md`、`pitfalls.md`；`.trellis/spec/shared/contract/document-agent.md`、`docx-agent.md`；`.trellis/spec/renderer/frontend/document/conventions.md`；`.trellis/spec/project/research.md`、`quality.md`。尊重已有中断补丁、唯一执行所有权、来源/版本/轮次/dirty守卫、不自动保存和队列归还。

## Caveats / Not Found

- 原hook无现成beforeSend/queue injection；推荐方案是公共runtime动作facade，已提供可运行例证，无需自绘Composer或第二runtime。
- 最小探针只证明公开动作路径与AGUI seam。完整Thread/产品全链仍须实施验收；默认Reload/Edit等能力不能借机无差别放开。
- append拒绝后的建议清草稿竞争、已排队内容编辑/显式重排/新voice/steerAway能力不在4项通过范围内。实现时按本报告的真实所有权和guard分别处理。
- 仅写本任务research目录及其隔离验证文件；未改产品、manifest、spec或旧稿，未执行git操作。Vitest启动的内部缓存属于测试工具运行产物，不是产品依赖更改。

### 新SDK隔离兼容补记

同一4项探针另用 `vitest-v29.config.ts` 强制解析 React SDK **0.15.29** / core **0.3.29** / store **0.3.21**，仍使用产品本地patched react-ag-ui **0.0.68**；最终 **4/4 passed**，见 `result-v29.json`。为避免Vitest外部CJS依赖各自require不同React，这一独立配置统一使用隔离依赖的 React/ReactDOM **19.3.1**；产品基线探针使用原 React/ReactDOM **19.3.0**。中间配置曾因core子路径alias遗漏、CJS双React而启动/挂载失败，修正解析后一轮全通过；这些不是被测业务断言的放宽。v3浏览器打包自身使用单一项目React的检查仍由其build验证，不能用本实验替代。两组结果独立计数，仍是4种行为在两种SDK组合下的最小probe，非8个产品端到端场景。
