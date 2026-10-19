# Research: TanStack AI React v5 runtime migration

- Query: Replace assistant-ui with TanStack AI React and Mimir UI while preserving v4 interaction semantics and exposing all AG-UI interactions on a separate review page.
- Scope: mixed; planning only, no product or previous prototype edits.
- Date: 2026-10-19

## Findings

### Decision and pinned versions

Use **`@tanstack/ai-react@0.30.3`, `@tanstack/ai-client@0.39.2`, and existing `@tanstack/ai@0.68.0`** as the compatibility candidate. These are individually published versions, not one shared release number. Pin both frontend packages exactly: react 0.30.3 declares client `^0.39.2`, which can resolve client 0.39.3 and introduce ai 0.69.0.

| Package | Current registry latest | Relevant constraint | Candidate |
| --- | --- | --- | --- |
| @tanstack/ai-react | 0.30.4 | peer ai ^0.69.0; client ^0.39.3 | 0.30.3 (peer ai ^0.68.0) |
| @tanstack/ai-client | 0.39.3 | ai ^0.69.0 | 0.39.2 (ai ^0.68.0) |
| @tanstack/ai | registry metadata saved | repository already 0.68.0 | retain 0.68.0 |
| @ag-ui/core | 1.0.3 | current ai 0.68.0 pins 1.0.0 | retain ai's 1.0.0 |

Evidence: `tanstack-v5-evidence/*metadata.json` contains npm distribution integrity/tarball URLs/dependencies; selected source and hashes in `source-manifest.json`. npm distribution source is authoritative for the chosen versions; latest website documentation is not a version guarantee.

The existing lockfile contains **two core versions**: `@ag-ui/core@0.0.59` for `@ag-ui/client@0.0.59` and `@ag-ui/core@1.0.0` for ai 0.68.0 (`pnpm-lock.yaml:1147`, `:1150`, `:12562`, `:16470`). Product chat uses assistant-ui 0.15.28/react-ag-ui 0.0.68 (`packages/chat/package.json:17`). Do not cast arbitrary event objects between the two packages or globally collapse their versions as part of this UI migration. Prefer TanStack's public `StreamChunk`/client types for the new runtime; validate the actual Mimir wire contract.

### Public React API and source files

Paths below prefixed `evidence/` refer to `research/tanstack-v5-evidence/`.

- `evidence/ai-react-compatible/src/use-chat.ts:36`: `useChat(options)`; `initialMessages` at :54, construction :152, identity dependency :308.
- `evidence/ai-react-compatible/src/use-chat.ts:463`: `sendMessage(content, sendOptions?)`, forwarding to `client.sendMessage(content, undefined, sendOptions)`.
- `evidence/ai-react-compatible/src/use-chat.ts:639`: messages, sendMessage, append, reload, stop, setMessages, clear, addToolResult, addToolApprovalResponse, queue/cancelQueued, runId, interrupt state/resolution/cancel/retry/low-level resume.
- `evidence/ai-client-compatible/src/types.ts:498`: `SendMessageOptions.body` is the per-send forwarded-properties channel; it wins shallow collisions.
- `evidence/ai-client-compatible/src/connection-adapters.ts:925`: `connect(messages, data?, abortSignal?, runContext?): AsyncIterable<StreamChunk>`.
- `evidence/ai-client-compatible/src/connection-adapters.ts:907`: run context carries threadId/runId, optional parentRunId/resume, clientTools, forwardedProps, headers.

Minimal shape for an **isolated prototype**, not a product-ready migration:

```tsx
import { useChat } from '@tanstack/ai-react'
import type { ConnectConnectionAdapter } from '@tanstack/ai-client'

// Stable connection object for this mounted panel. Each emitted fixture is an
// actual StreamChunk consumed by useChat; fixture controls are not service proof.
const connection: ConnectConnectionAdapter = {
  async *connect(messages, data, signal, runContext) {
    // Yield actual AG-UI events; honor signal in every pending fixture wait.
  },
}

const chat = useChat({
  threadId: 'local-fixture',
  connection,
  initialMessages: [],
  onChunk: observeProtocolForStateAndLifecycle,
  onCustomEvent: observeMimirBusinessEvents,
})

// Freeze BEFORE any attachment finalization / conversation creation awaits.
const frozen = structuredClone({ runConfig: { documentId, deepReasoning } })
await chat.sendMessage(text, { body: frozen })
```

The new hook is headless. Mimir owns keyboard behavior, focus, IME, attachment UI, scroll following, accessibility, dropdowns, tool/reasoning disclosure, branch/edit UI and message actions. It does not inherit assistant-ui primitives merely because streaming uses the same protocol.

### Request body: current fetchServerSentEvents is already AG-UI

**Do not assume this version sends the old `{messages,data}`-only body.** `connection-adapters.ts:1360–1389` builds `threadId`, `runId`, optional `parentRunId`/`resume`, `state:{}`, wire messages, tools, `context:[]`, `forwardedProps`, plus legacy `data` mirror. Merge precedence is adapter `options.body` < runContext.forwardedProps < per-message data. `:1426–1499` sends POST JSON and passes abort signal; default credentials is same-origin, so Mimir must explicitly use `include` for cross-origin deployment.

A dynamic async options function is awaited **before** building that body (:1436); use it for authentication/transport setup, not to read mutable current composer controls after the send has begun.

Custom connection can wrap the stock SSE adapter or perform a Mimir request explicitly. It must preserve all messages/media, thread/run IDs, tools, resume and frozen forwardedProps rather than rebuilding a reduced request that drops fields. A fetchClient boundary is available (:1337). Retain the fixed endpoint contract (`runtime/io.ts`, `agent.ts:80`) rather than putting conversation ID into the URL.

**Real backend incompatibility discovered:** TanStack's interrupt resume automatically includes `parentRunId` (`chat-client.ts:2668–2683`), but Mimir's document-Agent route rejects client-supplied parentRunId on resume (`apps/server/src/services/docx-agent-stream.ts:163`, 400 DOCX_AGENT_RESUME_INVALID). The server claims its own pending interrupt parent using persisted conversation/document/round/version/responses (:166–179). A Mimir transport adapter must omit **wire** parentRunId for this route while retaining internal TanStack resume correlation. Never relax server replay guards to make a UI library fit.

### Runtime event coverage and UI obligations

The chosen ai 0.68.0 `StreamProcessor` implementation is archived at `evidence/ai/src/activities/chat/stream/processor.ts`. Its dispatch switch :703–838 is the concrete boundary.

| Event family | Built-in behavior | Mimir responsibility |
| --- | --- | --- |
| RUN_STARTED/FINISHED/ERROR | Run status, interrupt handling, finish/error state | User-visible busy/failed/stopped distinctions; preserve existing recoveries |
| TEXT_MESSAGE_START/CONTENT/END | text parts, streamed content | Markdown/code/table/link UI, copying, edit/retry/actions, partial/loading accessibility |
| TEXT_MESSAGE_CHUNK | expanded into lifecycle events (:852+) | Display parity with explicit sequence |
| TOOL_CALL_START/ARGS/END/RESULT and TOOL_CALL_CHUNK | tool-call/tool-result parts, streaming args/result state | Exact pending/arguments/execution/result/error/approval/stop views; safe output formatting |
| REASONING_MESSAGE_CONTENT | accumulated **`thinking`** part (:2869), not part type `reasoning` | Collapsible reasoning with correct active/completed state |
| REASONING_START/MESSAGE_START/MESSAGE_END/END | explicit no-op (:792–797) | Track lifecycle in onChunk sidecar, including start without text and completion; do not invent thinking from retrieval trace |
| REASONING_MESSAGE_CHUNK | expanded (:919+) | Same final lifecycle semantics |
| REASONING_ENCRYPTED_VALUE | provider signature bookkeeping (:2909) | Treat as opaque signature, do not render ciphertext as readable reasoning |
| STEP_STARTED/FINISHED | reasoning step/signature tracking; not standalone step UI | Optional protocol-detail view/state, no invented progress narrative |
| MESSAGES_SNAPSHOT | replaces/reconstructs transcript | Ensure history/loading/edit/retry parity, no duplicate messages |
| ACTIVITY_SNAPSHOT/DELTA | real activity messages, RFC6902 patch (:2810/:2822) | Renderer by explicit activityType; unknown type fallback; invalid patch leaves prior state |
| Legacy THINKING_START/END/THINKING_TEXT_MESSAGE_* (core0.0.59) | No processing case or inbound alias conversion | Explicit compatibility normalizer or labelled legacy inspector; do not claim native REASONING parity |
| STATE_SNAPSHOT/DELTA | dispatch default no-op (:835–837) | onChunk state reducer with snapshot replace / RFC6902; visible details page and error fallback |
| RAW | no automatic message part | Read-only inspect/debug presentation; no HTML execution |
| CUSTOM | reserved TanStack events consumed; others onCustomEvent | Mimir citation/failure/Agent event sidecar keyed to actual round/message IDs |
| SUBAGENT_STARTED/FINISHED/ERROR | subagent handles, nested routing | Protocol detail UI; do not describe an assistant-ui-specific bespoke workflow as standard |

`chat-client.ts:2163–2212` observes each non-ignored normalized chunk in `onChunk` **before** processor dispatch, then handles lifecycle and interrupts. This permits explicit coverage of state/raw/reasoning lifecycle gaps without replacing TanStack's message engine. Cleared/stopped stale streams can intentionally be ignored; do not claim a global callback receives every raw network byte.

Public parts are **text/image/audio/video/document/tool-call/tool-result/thinking/activity/structured-output/ui-resource/subagent**, not assistant-ui's `data/source/file/reasoning` enum (`types.ts:722–766`). Mimir citations and failures need a typed adapter/sidecar or metadata; adding unsupported fake `type:'data'` to the library's message union is incorrect. All current/historical business events must map through the same domain representation. The old `mimir.trace` must remain removed by the v5 plan.

**Protocol vs extensions:** AG-UI defines event envelopes and data flow, not a standard visual widget gallery. `CUSTOM` is standard, but `structured-output.start/complete`, approval legacy customs, `mimir.citations/failure`, and their payloads are producer-specific. `processor.ts:2973–2982` explicitly says modern TanStack approvals/client-tool interruptions use RUN_FINISHED interrupt outcome; old `approval-requested` custom is replay compatibility. `ui-resource`/MCP Apps, structured output and multimodal parts must be labelled separately from AG-UI event names. The independent details page should show protocol payload, runtime-supported part/state, user interaction, and adapter responsibility in separate columns.

### Interrupts, resume and replay

Current product bridge `packages/chat/src/runtime/DocxInterruptBridge.tsx:448–450` deliberately uses explicit interrupt resume instead of ordinary addToolResult. It executes each document-tool batch once, preserving document/format/round/selection/version, aborting pending tools and caching responses on failed submit (:518–648). Retry validates the same target and canvas before submitting cached responses (:707–737). The existing assistant-ui patch cannot simply be removed until these cases pass under the replacement runtime.

TanStack 0.39.2:

- Legacy `{kind:'client_tool',toolName,input}` metadata remains recognized (`interrupt-manager.ts:188–207`). Without a matching registered client tool, the observed interrupt is generic; it is not automatically an editable Mimir canvas tool.
- Bound APIs resolve/cancel/retry via InterruptManager; low-level `resumeInterruptsUnsafe(responses,state?)` returns `Promise<boolean>` (`chat-client.ts:1629–1683`). Existing `resumeInterrupts` is deprecated.
- Low-level resume waits until the parent run settles (:1651–1670), carries preserved thread/parent/resume entries, and does not inherently execute Mimir tools.
- **HTTP failure may resolve `false` instead of rejecting**. A bridge that treats a fulfilled await as success loses its pending result. Check return value and current correlated interrupt state.
- Stock `stop()` aborts local stream, invalidates deferred continuations, flushes queue and resets interrupts (:2916–2929). Mimir's cancelled responses/server cancellation and canvas changes need explicit lifecycle handling. Do not call stop first and thereby destroy the descriptors needed to cancel the server interrupt.

Retain a Mimir bridge/domain layer independent of React presentation. Either bind typed client tools while preserving all existing guards, or adapt the explicit cached submission path through the public low-level API. Do not run both and execute a canvas edit twice. Real server tests must cover source/version changes, failed resume, request accepted but response lost, unknown interrupt, multi-tool partial change, cancellation, stale retry, and regenerated identifiers.

### Queue, send-start freezing, recovery and attachments

TanStack busy sends default to queue/FIFO. `types.ts:1102–1109` explicitly discards queued input on abort/error/stop/clear/unsubscribe/reload. Mimir's existing contract restores pending draft/PNG/target after failure or stop. Therefore this default is **not equivalent**.

`chat-client.ts:2355` shallow merges per-send body; `enqueueMessage` (:2460–2479) stores that body by reference. Public `getQueue()` (:3495) returns only id/content/createdAt, not the frozen body. A real isolated probe showed changing a nested `runConfig.documentId` after queueing changes the eventual request. The queue does not deep-freeze business settings.

Recommended migration boundary: a Mimir send coordinator owns an immutable full draft/task record before any await, and its recovery journal survives library queue clearing. Every click Send, Enter, suggestion, retry, regenerate/edit, and dispatched queue entry must use the same coordinator. Freeze `deepReasoning`, all-or-single-document scope, Agent format/document/round/version/selection and attachment identities together. Preserve role-routing semantics: model menu displays global chat/reasoning bindings; standard/deep is boolean role selection, not provider reasoningEffort; side panel standard/false. Neither scope nor display model name changes the Agent execution target.

A normal new send uses fresh immutable data in `sendMessage(content,{body:{runConfig:...}})`. New conversation creation and attachment conversion are abortable preparatory steps; a changed dropdown while those await must not change the task. At dispatch revalidate source/version/vision/readiness; a failed validation restores the frozen draft without overwriting text the user has since typed.

Standard chat attachments remain a separately planned ephemeral capability, not KB import. The hook accepts multimodal content but does not provide upload preparation/progress/remove/failure/cancel/finalize UI or a server storage policy. Preserve the v4 attachment state matrix and actual first-send payload contract. `state:{}` in default transport also means shared state is not automatically echoed into future input; explicit state forwarding, if needed, belongs to the adapter contract.

### History, editing, branches, actions and scroll

Current product history conversion is `packages/chat/src/runtime/history.ts:48–89`, server persistence ownership :109–120. Convert Mimir Message to TanStack UIMessage/metadata and the same business sidecar used live. Do not copy persisted historical traces into the removed custom trace view. Existing historical Agent records must remain summarized read-only; no reconnect or tool execution solely because history contains tool names.

The current hook seeds initialMessages at construction and is keyed by thread identity (`use-chat.ts:54,111–155,308`), not reactive prop-array hydration. Load before mount, call public setMessages after a guarded history load, or implement its hydrate contract; never allow a late old-conversation response to replace new stream state. Its server-driven persistence expects TanStack hydrate/join endpoints; Mimir's existing ChatIo.loadConversation is not automatically such an endpoint. Do not enable stock persistence blindly.

Default reload truncates after last user and reissues (`chat-client.ts:2905–2910`); this is not an assistant-ui branch repository. Mimir needs explicit reviewed v4 edit/cancel/regenerate/previous-next branch semantics if those remain in its acceptance matrix. The new headless UI must implement copy feedback, save-note, follow/unfollow scroll, bottom jump, keyboard/focus/IME, dropdown escape and narrow layout as observable behavior. These cannot be certified by event-processing tests.

## Isolated verification and evidence

Only `/tmp/mimir-tanstack-v5/probe` was installed. Product manifests/lock/node_modules were not modified. npm's default cache initially failed EACCES; retry used a dedicated `/tmp/.../npm-cache` and succeeded. No cache permissions were changed.

- `tanstack-v5-evidence/probe.mjs` and `probe-result.json`: real ChatClient 0.39.2 + ai0.68.0, stock fetchSSE with injected fetch Response. Captures full RunAgentInput and include credentials; sixteen actual events observed; thinking text and activity RFC6902 replacement to count2 appear in actual library messages; state/raw are observable but not message parts. A delayed real queue proves nested body mutation, and stop clears queue/returns ready.
- `tanstack-v5-evidence/interrupt-probe.mjs` and `interrupt-probe-result.json`: real library interrupt from legacy Mimir-like metadata; first resume HTTP503 returns false with original resume preserved; retry of cached synthetic responses succeeds and keeps identical resume array/parent ID. This proves transport/runtime behavior, **not real canvas effects or live Mimir service compatibility**; the captured parent ID demonstrates why the adapter is required.
- Npm metadata/tarball integrity + archived selected sources + `source-manifest.json`; website attempts and GitHub docs evidence are recorded separately in `docs-manifest.json`.

## External references and WeKnora applicability

- Official package metadata: https://registry.npmjs.org/@tanstack%2fai-react, https://registry.npmjs.org/@tanstack%2fai-client, https://registry.npmjs.org/@tanstack%2fai. Exact candidate metadata saved, including npm integrity values.
- Official source: https://github.com/TanStack/ai; fixed current main commit and docs fetch outcome in `tanstack-v5-evidence/github-head.json` / `docs-manifest.json`. The registry-source snapshots correspond to their exact package versions and take precedence over current-main docs.
- Official source documentation was successfully read via GitHub API: `docs/migration/ag-ui-compliance.md` at commit `85c2956c68f3226ef409b3a4e54d5be82198931e` (archived `tanstack-v5-evidence/ag-ui-compliance.md`). It confirms full RunAgentInput, metadata.tanstack, wire messages without parts, forwardedProps/data bridge and no automatic conversationId emission. Its core-bump prose references an older canary version, so package metadata/source remains the version authority.
- Official React/connection documentation URLs were requested; tanstack.com returned HTTP403 in this environment. This is recorded, not presented as successfully read web evidence.
- **WeKnora check reused from this same task/date:** `research/vendor-full-thread/weknora-reference-recheck.json`, 2026-10-19. Website HTTP200, version0.8.3, SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`; public source commit `2c0d8384398ca756ee414eef01b71caf91e2caa6`; frontend package SHA256 `22a673ec3715689f3f1cc308625d618db2defcc1d6a12a7b0eb65b1179f72e13`; AgentStreamDisplay.vue SHA256 `7d20b094fb912beab810ba1ad603873276827fd5275a463d56f60eff38bc6a88`. It independently supports separating knowledge/Agent interactions and answer actions. Its Vue/TDesign custom event renderer is not evidence of TanStack or AG-UI runtime equivalence, and its custom thought/trace presentation does not override the user's removal of mimir.trace. Mimir's visual style is the current project design; protocol behavior must be source-backed.

## Related specs

- `.trellis/spec/chat/frontend/index.md`, `conventions.md`, `pitfalls.md`: current assistant-ui architecture; send/queue, host theme, history, real HTTP tests, interrupt patch, screenshot source lifetime. These describe current behavior; latest user request supersedes the engine choice, not business safety contracts.
- `.trellis/spec/renderer/frontend/index.md`: host boundary and validation.
- `.trellis/tasks/10-18-interaction-chat/research/composer-v4-contract.md`: authoritative model/strength/scope and pre-send freeze business semantics.
- `.trellis/tasks/10-18-interaction-chat/research/agui-official-thread-pre-send-seam.md`: former assistant-ui runtime seam; its exact wrapper is retired with that runtime, while freeze timing remains mandatory.

## Caveats / Not Found

- No product migration, full-browser interaction certification, live model run, live Mimir HTTP/Agent roundtrip, server replay integration, real attachment upload or real history hydration was performed in this research.
- Exact versions and a passing fixture are a compatibility **candidate**, not proof that replacing imports preserves UI or service semantics. The parentRunId rejection, shallow queue body, queue clearing and reasoning/state gaps are implementation requirements.
- AG-UI is a protocol without an exhaustive prescribed visual component list. The interaction-details page must label fixture-only vs wired, native protocol vs TanStack extension vs Mimir business UI; every event and payload needs an honest mapped or intentionally invisible state.
- The existing 403 review routes are coverage records, not 403 executed browser tests. Preserve all business requirements and assess new headless interactions individually.
