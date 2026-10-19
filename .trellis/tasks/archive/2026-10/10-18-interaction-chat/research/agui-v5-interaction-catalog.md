# Research: AG-UI v5 interaction catalog

- Query: 用 TanStack AI React 与自定义 UI 替换 assistant-ui，如何保持 v4 的每项交互，并在独立 HTML 中逐一展示协议事件、组件映射及能力边界？
- Scope: mixed; planning only; product and prototype/v1–v4 unchanged
- Date: 2026-10-19

## Findings

### Count and meaning

本目录列 **126 个演示/验收条目**，不是 126 个 AG-UI 协议组件：36 个逐事件条目（其中 5 个是旧版 deprecated THINKING），10 个消息结构/信封条目、6 个 HITL 条目、6 个 Mimir CUSTOM 条目、30 个宿主交互、30 个 v4 官方源码交互和 8 个序列/兼容边界条目。协议是消息、状态与生命周期事件的合同，不定义固定组件库。

`agui-v5-interaction-catalog.json` 是可消费目录；每条有稳定 `id/title/category/events/states/interactions/boundary/evidence/example`，部分含 `exampleVariants`。`boundary.visible=false` 指正常产品不应单独渲染该数据事件；**独立交互页仍须展示其数据变化和不支持原因**，不能从目录隐藏。`status=unsupported/capability-boundary/planning-probe` 不是已接通生产能力。

`v4Parity.routesDetail` 原样保留 403 个 v4 source route 的说明、路径与边界，并逐条加 `catalogIds`。403 条是完整清单及待验收要求，**不是 403 次已执行浏览器测试**。这些条目是从 v4 行为基线迁移；v4 的“必须官方默认样式/业务只能放 Thread 外”等实现方式被用户最新选择取代，业务语义、状态、触发与恢复合同保留。

### Fixed versions and official recheck

| Source | Version/commit | Result |
|---|---|---|
| Current client | `@ag-ui/client@0.0.59` → `@ag-ui/core@0.0.59` | 36 events |
| Current server | `@tanstack/ai@0.68.0` → `@ag-ui/core@1.0.0` | 31 events |
| Official source fetched today | `ag-ui-protocol/ag-ui@81b2aa46a194ee07a3b215cae1f733f68e5d2927`, core package `1.0.3`, protocol `1.0` | 31 events, same enum as installed 1.0.0 |
| v4 official Thread source | `assistant-ui/assistant-ui@a587b2838f2d644549d216098d54cfbeedfac522` | native registry source; minimal Composer extension frozen in v4 |
| v4 isolated runtime | assistant-ui React `0.15.29`, core `0.3.29` | interaction baseline, not new product dependency |

Latest means the specific main-branch snapshot fetched on 2026-10-19, not a promise about future published versions. Fixed official source, docs and SHA manifests are saved in `research/agui-v5-evidence/`.

**Wire differences beyond event count:** `THINKING_*` is gone in 1.0. `RUN_FINISHED.outcome.type=cancelled` is accepted by 1.0.0 and rejected by 0.0.59. 0.0.59 tool results require string; 1.0.0 accepts string or ContentPart[]. 0.0.59 media sources are data/url; 1.0 adds opaque file handles. `protocolVersion` is retained in 1.0 input but stripped from the 0.0.59 parsed input. `resume.status=resolved|cancelled` already exists in both versions. These are measured schema probes in `version-probes.json`, not assumptions from docs.

### Complete event list

| Stable demo ID | Event | Category | Normal product behavior |
|---|---|---|---|
| AGUI-RUN-001 | `RUN_STARTED` | run | visible mapping; capability checked |
| AGUI-RUN-002 | `RUN_FINISHED` | run | visible mapping; capability checked |
| AGUI-RUN-003 | `RUN_ERROR` | run | visible mapping; capability checked |
| AGUI-STEP-001 | `STEP_STARTED` | step | data/compatibility inspection; no independent product component |
| AGUI-STEP-002 | `STEP_FINISHED` | step | data/compatibility inspection; no independent product component |
| AGUI-TEXT-001 | `TEXT_MESSAGE_START` | text | visible mapping; capability checked |
| AGUI-TEXT-002 | `TEXT_MESSAGE_CONTENT` | text | visible mapping; capability checked |
| AGUI-TEXT-003 | `TEXT_MESSAGE_END` | text | visible mapping; capability checked |
| AGUI-TEXT-004 | `TEXT_MESSAGE_CHUNK` | text | visible mapping; capability checked |
| AGUI-TOOL-001 | `TOOL_CALL_START` | tool | visible mapping; capability checked |
| AGUI-TOOL-002 | `TOOL_CALL_ARGS` | tool | visible mapping; capability checked |
| AGUI-TOOL-003 | `TOOL_CALL_END` | tool | visible mapping; capability checked |
| AGUI-TOOL-004 | `TOOL_CALL_CHUNK` | tool | visible mapping; capability checked |
| AGUI-TOOL-005 | `TOOL_CALL_RESULT` | tool | visible mapping; capability checked |
| AGUI-REASON-001 | `REASONING_START` | reasoning | visible mapping; capability checked |
| AGUI-REASON-002 | `REASONING_MESSAGE_START` | reasoning | visible mapping; capability checked |
| AGUI-REASON-003 | `REASONING_MESSAGE_CONTENT` | reasoning | visible mapping; capability checked |
| AGUI-REASON-004 | `REASONING_MESSAGE_END` | reasoning | visible mapping; capability checked |
| AGUI-REASON-005 | `REASONING_MESSAGE_CHUNK` | reasoning | visible mapping; capability checked |
| AGUI-REASON-006 | `REASONING_END` | reasoning | visible mapping; capability checked |
| AGUI-REASON-007 | `REASONING_ENCRYPTED_VALUE` | reasoning | data/compatibility inspection; no independent product component |
| AGUI-LEGACY-001 | `THINKING_START` | legacy | data/compatibility inspection; no independent product component |
| AGUI-LEGACY-002 | `THINKING_END` | legacy | data/compatibility inspection; no independent product component |
| AGUI-LEGACY-003 | `THINKING_TEXT_MESSAGE_START` | legacy | data/compatibility inspection; no independent product component |
| AGUI-LEGACY-004 | `THINKING_TEXT_MESSAGE_CONTENT` | legacy | data/compatibility inspection; no independent product component |
| AGUI-LEGACY-005 | `THINKING_TEXT_MESSAGE_END` | legacy | data/compatibility inspection; no independent product component |
| AGUI-STATE-001 | `STATE_SNAPSHOT` | state | data/compatibility inspection; no independent product component |
| AGUI-STATE-002 | `STATE_DELTA` | state | data/compatibility inspection; no independent product component |
| AGUI-STATE-003 | `MESSAGES_SNAPSHOT` | state | visible mapping; capability checked |
| AGUI-ACTIVITY-001 | `ACTIVITY_SNAPSHOT` | activity | data/compatibility inspection; no independent product component |
| AGUI-ACTIVITY-002 | `ACTIVITY_DELTA` | activity | data/compatibility inspection; no independent product component |
| AGUI-EXT-001 | `RAW` | extension | data/compatibility inspection; no independent product component |
| AGUI-EXT-002 | `CUSTOM` | extension | visible mapping; capability checked |
| AGUI-SUB-001 | `SUBAGENT_STARTED` | subagent | data/compatibility inspection; no independent product component |
| AGUI-SUB-002 | `SUBAGENT_FINISHED` | subagent | data/compatibility inspection; no independent product component |
| AGUI-SUB-003 | `SUBAGENT_ERROR` | subagent | data/compatibility inspection; no independent product component |

### Valid sequences and failure boundaries

- Normal root run: `RUN_STARTED → [payload events] → RUN_FINISHED(success)`. Error uses `RUN_ERROR`, not both terminal events. Root identity must match; avoid nested root starts and payload after terminal. The 0.0.59 verifier has some error recovery tolerance; do not use that tolerance as the server producer contract.
- Text: `START(messageId) → CONTENT(messageId, delta)* → END(messageId)`. Tool calls use `START(toolCallId, toolCallName) → ARGS* → END`; END completes argument streaming, **not tool execution**. `TOOL_CALL_RESULT` correlates the actual result with its toolCallId. A JSON string with an `error` property is not automatically a standard AG-UI tool-error flag.
- CHUNK is a shorthand requiring normalization; first text/reasoning chunk identifies its message, first tool chunk identifies call and tool name. Continuation chunks can omit unchanged identifiers. Do not process both chunk and expanded triad as separate content. Unknown/conflicting identity/role/tool name needs explicit error handling.
- Reasoning span: `REASONING_START → REASONING_MESSAGE_START → CONTENT* → MESSAGE_END → REASONING_END`, sharing the reasoning identity. Opaque `REASONING_ENCRYPTED_VALUE` is retained for continuity; no fake decoding, original-thought UI or copy button.
- Shared state: snapshot replaces, delta patches. `STATE_DELTA.delta` and `ACTIVITY_DELTA.patch` are different fields. RFC 6902 add/remove/replace/move/copy/test and error recovery must be inspectable. Retain the last valid state on an unappliable patch; surface a diagnostic rather than erase state. Activity type requires application registration; there is no standard progress-card UI.
- `MESSAGES_SNAPSHOT` synchronizes the full ordered history. Reconcile identity; do not duplicate snapshot messages beside the stream. system/developer messages are context and must not become user bubbles.
- Subagents use an invocation-specific `subagentRunId`; nested attribution and parent IDs are distinct from the root run. Subagent success/suspended/error is not root run completion. No live Mimir multiagent execution is proven by this catalog.
- `RAW`, STEP, shared STATE and unknown CUSTOM are protocol data, not automatic user-facing cards. Unknown values do not confer permission to execute HTML, dynamic components or document tools.

### Message shapes are not assistant-ui UI-part types

Both current protocol schemas have 7 message roles: developer/system/user/assistant/tool/activity/reasoning. Content part discriminators are `text/image/audio/video/document` (0.0.59 input; 1.0 additionally tool-result content). `data/url` sources carry `value`; 1.0 `file` is an opaque provider-issued handle and must not be fetched or treated as a URL.

assistant-ui `source/file/data/generative-ui/quote` UI parts are not standard AG-UI ContentPart values. Mimir sources come from `mimir.citations` or registered adapter mapping. Markdown, tables, code blocks and their copy behavior are text rendering, not additional protocol events. Media schema acceptance does not prove model vision/video/attachment capability or product parsing support.

### HITL and resume

There is no standard `INTERRUPT`, `RESUME`, `APPROVE`, `CANCEL` or `QUEUE` event. An interrupt is `RUN_FINISHED.outcome={type:'interrupt',interrupts:[...]}`. The next run carries `RunAgentInput.resume[]` with `interruptId/status/payload` and must address all pending interrupts. A meaningful refusal is `resolved + payload.approved=false`; `cancelled` means abandonment without an answer. Validate expiry, missing/unknown interrupt IDs, duplicates, schema and source/round/document/version before execution.

Mimir client tools require the existing explicit resume bridge; a generic `addToolResult` is not an equivalent replacement. If a tool already changed the canvas and continuation HTTP fails, retry cached results under current version guards; never repeat the side effect. Stop, cancel pending interrupt, retain/discard writing draft and roll back one round are distinct actions. Current spec already records the lost-interrupt-on-HTTP-failure patch, so the replacement runtime needs equivalent recovery evidence.

### Mimir CUSTOM disposition

| Name | Required behavior |
|---|---|
| `mimir.conversation` | Keep real conversation identity and active stream through URL handoff. |
| `mimir.citations` | Keep citations, channel/summary, source navigation and unsaved-document guards. |
| `mimir.failure` | Keep failure classification, retry/restore/search-only choices; emit before RUN_ERROR. |
| `mimir.documentAgent` | Keep cross-format execution, result, source and canvas guards. |
| `mimir.docxAgent` | Read compatible older history; prefer the normalized cross-format contract. |
| `mimir.trace` | Remove live/history/protocol-to-UI mapping completely; never reconstruct from STEP/STATE/ACTIVITY. |

Mimir miniapp-specific `mimir.operation` is outside this desktop chat task; it does not add another standard chat protocol event.

### v4 source parity highlights

- More contains **only Export as Markdown**, not PDF/DOCX. Tool fallback shows vertical Args/Result `pre`, not tabs or parameter-copy controls.
- Default Image has zoom overlay, keyboard activation, Escape, overlay/image/close-button dismissal, Tab containment, scroll lock and focus restoration. Image.Actions exports copy/download/regenerate APIs but default ImageImpl does not mount them; adding a default image toolbar would change interaction scope.
- FileImpl mounts AudioPlayer and VideoPlayer when MIME/source match. Preserve audio play/pause/seek/duration/load-error/src reset and native video controls. A file chip is not equivalent.
- Reasoning opens during streaming and returns to default collapsed after completion if the user has never toggled it. The first manual toggle permanently takes control. Inner scrolling suspends token following when the reader scrolls up; it resumes at bottom. Tool groups default collapsed; requires-action opens the individual tool.
- Copy, feedback, refresh, edit/update/cancel, branch picker, earlier-history loading, suggestions, cancel-before-send vs stop-generating, drag/drop/paste and attachments all need their capability/disabled/loading/error/focus contracts preserved. SDK approval options/questions/confirmation/receipt are runtime UI forms, not new protocol events.
- Thread uses `content-visibility:auto` and intrinsic size, not a demonstrated virtual-list engine. Preserve scrolling behavior and pagination without claiming virtualization.

The precise 30-source-item checklist is in `v5-interaction-parity.md` and OFF-001…OFF-030; host UI-001…030 covers model/scope/strength, queues, save, navigation, sources, draft lifetime, attachments and document Agent boundaries.

### Files found / code patterns

- `pnpm-lock.yaml:12560` / `:12573` / `:16468` — pinned client core0.0.59 and server core1.0.0 coexist.
- `packages/chat/src/runtime/agent.ts:1` — current HttpAgent transport wrapper.
- `packages/chat/src/runtime/DocxInterruptBridge.tsx:448` — explicit TanStack tool interrupt/resume bridge, distinct from ordinary assistant-ui addToolResult.
- `packages/chat/src/runtime/history.ts:52` — history data normalization including existing trace/citations/failure/Agent parts; trace removal must include this path.
- `packages/chat/src/parts/data-parts.ts:106` — documentAgent/docxAgent compatibility.
- `packages/shared/src/conversations.ts:172` — CUSTOM names.
- `apps/server/src/services/assistant-stream.ts:61` / `:299` / `:441` — root RUN_STARTED envelope, current trace, failure-before-terminal constraint.
- `apps/server/src/services/docx-agent-stream.ts:75` / `:147` / `:214` — client interrupts, parsed resume and resumed-stream envelope.
- `prototype/v4/vendor/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx:733` — exact action bars and minimal official view contract.
- Same vendor directory `reasoning.tsx:42`, `attachment.aui.tsx:133`, `image.tsx:397`, `file.tsx:292`, `tool-fallback.aui.tsx:728` — stateful interactions summarized above.

### External references / saved evidence

- [AG-UI event concepts](https://docs.ag-ui.com/concepts/events), [messages](https://docs.ag-ui.com/concepts/messages), [interrupts](https://docs.ag-ui.com/concepts/interrupts). Source versions are pinned by `official-api-source-manifest.json`; the initially guessed `/concepts/human-in-the-loop` URL returned 404 and is **not** supporting evidence.
- [Official AG-UI source snapshot](https://github.com/ag-ui-protocol/ag-ui/tree/81b2aa46a194ee07a3b215cae1f733f68e5d2927). Generated type SHA256 `babdb5de14b3ebe41bcc586fcc6c0d914bd6263e34fc67a978090731f2828b77`.
- `local-schema-manifest.json` + archived local type declarations — exact installed event enums and fields.
- `example-validation.json` — schema plus actual 0.0.59 chunk-transform/verify checks on event examples; **not** a complete runtime reducer, Mimir HTTP, clipboard, dialog or browser-UI pass.
- `version-probes.json` — concrete shape acceptance and parsed-value differences.

### WeKnora reference (same-day evidence reused)

Required project reference reuses this task's 2026-10-19 fixed `research/vendor-full-thread/weknora-reference-recheck.json`: website HTTP200 v0.8.3, SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`; public source commit `2c0d8384398ca756ee414eef01b71caf91e2caa6`, frontend package0.8.3. `AgentStreamDisplay.vue:421` gates answer toolbar on fully rendered/done/nonempty answer, and `:448`/`:452` supply copy/add-to-knowledge. These are useful business coverage checks for Mimir copy/save/citation/Agent completion. Its custom thinking/tool events and Vue/TDesign components do not establish AG-UI compatibility, TanStack semantics or this project's UI; do not adopt its process card or Markdown editor as the replacement design model.

### Related specs

- `.trellis/spec/chat/frontend/index.md`, `conventions.md`, `pitfalls.md` — runtime boundary, history, queue restoration, docx resume failure and source lifetime.
- `.trellis/spec/renderer/frontend/index.md` and `conventions.md` — shared theme/accessibility/shell rules.
- `.trellis/spec/shared/contract/docx-agent.md` — original document/version/round/client-tool contract.
- Task `research/composer-v4-contract.md` — read-only global model bindings, deepReasoning boolean, all-or-single-document scope; no per-chat arbitrary model or multi-KB selection.

## Caveats / Not Found

- This is a planning inventory and sandbox specification. No product feature is implemented, enabled or production-supported by its presence here. All 126 entries must be honestly labelled as normal UI / data-only / unsupported / capability-boundary; a simulated approval is not a real canvas write.
- Official AG-UI allows application-defined CUSTOM and activity payloads; the set of all application-generated UIs is unbounded. Completeness means fixed-version event enums and explicit Mimir/v4 interaction scope, not every future arbitrary extension.
- TanStack AI React reducer/runtime and real attachment service support need the separate migration research/probes and later implementation verification. This inventory does not claim their native reducers consume every core schema event.
- Real file picker, clipboard permissions, downloads, drag/drop/paste, media decoding, viewport/IME and canvas/network effects need native browser/product verification after approved HTML. Directory entries and replayable JSON are not substitutes for those checks.

Verification summary: 58/58 default event example groups passed 0.0.59 schema + transformChunks/verifyEvents. All 53 nonlegacy groups passed core1.0.0 schema; the 5 legacy THINKING groups intentionally failed that schema. All 36 old events and 31 current official events have dedicated IDs.
