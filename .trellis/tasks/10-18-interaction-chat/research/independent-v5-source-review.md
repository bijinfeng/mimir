# Independent v5 source and contract review

- Date: 2026-10-19
- Scope: independent source/contract delta review of the local planning prototype. Reviewer changed only this report.
- Conclusion: **requested source delta review complete; the previously reported blocking source defects and the final three recovery/lifecycle deltas are resolved in the reviewed checkpoint.** This does not certify exhaustive interaction parity, GUI coverage or product service compatibility. Specific HTML still requires the user's approval before product implementation.
- No browser/GUI was used by this reviewer. Main-supplied representative observations are distinguished below.

## Exact checkpoint

Independently hashed all three artifacts and compared them with current `prototype/v5/checks.json`; all matched:

| Artifact | SHA256 |
| --- | --- |
| review.html | `a8f27896e7272af09f4650f01e36a1df5ffbb021028dd2efb1e8c4a8fb624dd1` |
| thread.review.html | `580a2cab9d024a767aaf483bd3e99a8cfc51ea887207ce2e77eec547d5214701` |
| interactions.html | `03b5d5a0485f8a069094305dc1efbf5c1eb62af2f87365605dd9ba5937a63164` |

These hashes supersede the earlier checkpoint review `b967f376…`, thread `3791b775…`, details `99f69cd4…`. A later build or wording/metadata edit is a new checkpoint; this report must not be represented as having reviewed an unknown future hash.

## Evidence and method

Read PRD/design/implementation plan; `tanstack-v5-runtime.md`; AG-UI catalog Markdown/JSON; `v5-interaction-parity.md`; `apps/web/DESIGN.md`; chat conventions/pitfalls; shared guide. Rechecked source deltas listed in the hash appendix, public pinned SDK source and local probes. The behavior baseline is the frozen mounted v4 source under `prototype/v4/vendor`, commit `a587b2838f2d644549d216098d54cfbeedfac522`. Unmounted exported source APIs are not presumed default interactions.

Required external-reference check used same-day saved public evidence in `research/vendor-full-thread/weknora-reference-recheck.json`: website HTTP200/v0.8.3; Tencent public source commit `2c0d8384398ca756ee414eef01b71caf91e2caa6`, frontend version0.8.3. `AgentStreamDisplay.vue:421` gates answer actions on complete/rendered/nonempty content; :448/:452 expose copy/save. This supports Mimir business action-gating coverage. It does not establish AG-UI/TanStack behavior, custom trace, visual style or Office toolbar contracts. Mounted v4 and Mimir DESIGN remain the primary behavior/appearance references here.

## Findings 0–9 and final disposition

| Finding | Reviewed source disposition |
| --- | --- |
| 0 Implicit form submission | **Resolved.** `chat-components.tsx:81` IconButton and embedded preview/close/remove controls use explicit button type. `composer-toolbar.tsx:85` and all trigger/menu choices likewise use button type. Only Send submits. |
| 1 Preparation versus run cancellation | **Resolved.** `thread-app.tsx:153` clears preparation/pending before dispatch; run Cancel calls `chat.stop()` and posts host cancel. Busy send bypasses a second SDK queue and posts to the one host-owned queue. |
| 2 Queue recovery overwrote newer draft | **Resolved in the modeled host.** `main.tsx:421` refuses recovery into nonempty proposed draft; stop/error keep C and queue A/B. Empty draft returns only the first item. |
| 3 Incomplete immutable send record | **Resolved for local modeled scope.** `composer-send-intent.ts:17` structured-clones scope/deep/snapshot/context/attachment IDs plus records before any attachment await; `thread-app.tsx:120` calls it synchronously. `main.tsx:478` validates document/version/round/page/format/Agent context; independent queued records clone settings/files. Fixture IDs do not prove production canonical-resource lifetime. |
| 4 Reasoning lifecycle/scroll | **Resolved source gaps.** `chat-components.tsx:150` has inner pin/unpin following; thread has outer pin behavior. `protocol-state.ts:76` tracks real reasoning start/end even without text. `protocol-demo.tsx:187` now passes `reasoningRunning={protocol.reasoning === 'running'}` into the shared renderer, so root run continuation no longer keeps completed reasoning visually active. isLast uses message ID rather than a filtered-array index. Geometry/scroll-lock behavior remains a GUI boundary. |
| 5 Image dismissal | **Resolved.** `chat-components.tsx:309` image click closes, matching mounted v4 image.tsx:479–490; backdrop/Escape/close, Tab containment, scroll lock and focus restoration are present. Native/browser effects remain separately verified. |
| 6 Audio/tool source mechanisms | **Resolved main missing mechanisms.** `chat-components.tsx:313` custom audio implements play rejection, metadata/time/seek step0.1, disabled controls on media error and keyed source remount. Tool action-open derives dynamically; explicit cancelled metadata has separate text. Native media decoding and all approval adapter effects are outside this source pass. |
| 7 Context role leakage | **Resolved.** `chat-components.tsx:516` filters display to user/assistant/activity; system/developer context remains in technical inspector. Seven-role examples now exist. |
| 8 Inventory without concrete protocol paths | **Major gaps resolved; coverage claim remains bounded.** New `protocol-examples.ts` supplies explicit roles, media/opaque handles, unknown/unsafe payloads, sequence and JSON Patch variants. ComponentLab now mutates tool/media/attachment examples. Counts establish inventory and probe coverage, not every state being forced in a browser or every UI item passed. |
| 9 Invalid activity/unknown diagnostics | **Resolved.** `protocol-state.ts:35` patches cloned prior values atomically; :69 preserves previous activity on invalid patch with diagnostic. Unknown custom/activity is data-only and non-executable. Schema/sequence preflight rejects invalid frames and preserves accepted prefix. |

## Additional final deltas

**Preparation completing after a newer draft/file was added:** the original send completion unconditionally cleared the composer. `thread-app.tsx:31` now maintains draftRef through both user edits and host fixture changes. Completion clears text only when latest text still equals captured prompt and removes only captured attachment IDs from latest files. Thus C or a newly added file is not cleared by A's delayed preparation. This is a source confirmation. Main additionally reports a fresh-build GUI run where original prompt and one old attachment were sent, while input C and the newly added attachment remained.

**Terminal RUN_ERROR cleared the implicit resume target:** main's GUI found cached retry made no third connection. `interrupt-lab.tsx:15` now preserves the actual interrupted thread/run identity independently from the cached response. It captures identity from real RUN_FINISHED interrupt, passes both cloned response and explicit target to `resumeInterruptsUnsafe`, retains both on false, and clears them on success/cancel/new start. Cancellation remains available when SDK descriptors are gone but local cached state survives. It does not execute a document tool.

The independent read-only actual-ChatClient recovery probe confirmed: first interrupted run; failed terminal RUN_ERROR second connection returns false and clears implicit target; implicit retry creates no connection; explicit cached original target creates **third connection**, carrying identical parent/thread/resume answers with a fresh run ID. Transcript has one user input and one tool-call, and successful recovered text. This proves local SDK continuation behavior, not canvas execution, actual HTTP acceptance or server guards.

## Independent verification

- Read-only Node rerun against current source: **58 default sequences and 89 variants** match intended accepted/rejected status.
- Invalid STATE and ACTIVITY Patch assertions: previous value retained and diagnostic produced.
- `local-connection.ts` with `autoComplete:false`: exact supplied RUN_STARTED/REASONING_START prefix emitted; **no synthetic terminal**. ProtocolDemo opts into this mode; ordinary fixture connections retain explicit auto-completion convenience.
- Actual ChatClient0.39.2 Promise probe confirms sendMessage spans connection streaming; no premature-settlement assumption remains.
- Actual ChatClient0.39.2 failed-resume recovery probe described above passes with three actual connection calls.
- Source/build closure: true `@tanstack/ai-react` imports, real ConnectionAdapter, exact react0.30.3/client0.39.2/ai0.68.0 resolution. `build.mjs:47–65` rejects assistant-ui/vendor module execution and enforces one React. No assistant-ui execution import found in reviewed v5 source. Static artifact hashes match checks metadata; this reviewer did not rebuild or mutate outputs.

The stored protocol probe's eight checks are consistent with its source and the independently rerun recovery assertions. Probe writing scripts were not executed by this reviewer; read-only equivalents did not change prototype or result files.

## GUI evidence supplied by main

Main reported representative GUI observations: nonempty draft opens model menu without submitting and Escape returns focus; attachment-pending scope/deep changes still dispatch frozen earlier settings; busy Enter queues A and Cancel preserves newer C plus A; Shift+Enter inserts newline; invalid Patch preserves state with diagnostic; system messages appear only in technical inspector. On the final hashes, main additionally reports fresh reload HITL004 failed resume → turn failure off → cached retry: recovered answer/tool completion appeared, request count became3 and retry disabled; attachment pending → edit C/add new file → complete retained C/new file while sending original prompt/old file. This reviewer did not independently perform or inspect all GUI paths. These observations cannot be generalized to 403 route tests or every catalog/state item.

## Remaining acceptance boundaries

- Some ComponentLab selector labels, including audio play-rejected and reasoning token append/outer scroll lock, are not proof of forced native fault or measured layout. Full native/browser coverage, light/dark/narrow geometry, focus, IME/screen reader, picker/clipboard/download, media/Electron remain for explicit verification.
- Local attachment IDs/context are fixtures. Upload/parse/model/storage/auth/lifetime/history roundtrip are not product-implemented by the HTML.
- Interrupt proof is local SDK continuation only. Real Mimir wire parentRunId filtering, resume HTTP behavior, document/source/version/round/replay guards and cached canvas side effects require approved product implementation and real-service tests.
- Catalog mapping and source parity remain a traceable acceptance checklist. Neither126 catalog entries,403 routes nor147 tested protocol sequences establishes exhaustive interaction/GUI parity.
- Product code/dependencies and v1–v4 were not modified by this reviewer. No whole-product certification, actual HTTP pass, real Agent write or all-GUI pass is given.

## Reviewed source hashes

| Source under prototype/v5 | SHA256 |
| --- | --- |
| thread-app.tsx | `d3804fd450353500ab4864a200015eda45b175c92f5875489f207b3a0b083ba9` |
| composer-send-intent.ts | `332ff52eae84cc7bf06e7890cda0e3fce938554e7ae556c8ff6d4e44667cf493` |
| composer-toolbar.tsx | `38c1311b1192f94d0c2086c354bd2657d0ce940ed61591dcea896bfc920f65a6` |
| main.tsx | `63d4dca571671abec8301f9bd3a878f39f725d1787406a00727bcf8154bf5b69` |
| chat-components.tsx | `b8e84c40d1312c5c18d0bcf0c36b96b268cce67379f1ef667798542ede0f1cc1` |
| component-lab.tsx | `97eb7d458b19e13ae406f3b371566365cfc4c2138ab3e6681e4ec50733b788e5` |
| local-connection.ts | `5d56a20cfcd9a4d98edab7be68350ad1c3f0da8b92eb7f4ecc0726582010829f` |
| protocol-state.ts | `e66b6cb07ff7ddf44dd54b673fba2fe142ff96910591715dabaaa920683b6562` |
| protocol-examples.ts | `f7689a3b36e556fb99e780c76cc86c7a0a99e4444f8e14990a0a75e32bc7febc` |
| protocol-demo.tsx | `d6e4852393c5d0a41887dba69267e5053d1042d8e6bd0936bb5ada850d7d26f0` |
| interactions-app.tsx | `9e25de2ecab58753cc2681d2ee39e0d679675f728fd9063188f259cfe0302199` |
| interrupt-lab.tsx | `3f11df3caef977304c94e23aea1da1a4a83c9dff3cbb8cd99aca98b584c5c04b` |
| runtime-probe.mjs | `f07085c3cb9e226200e3ef7cf0a18966555ebae5a3a445b857a9be4a0f9f8bf8` |
| protocol-probe.mjs | `21c30441dbb8905631ca48e6cece2259453a5c15bf9644266362115f9035c0ba` |
| build.mjs | `8b2acdd9876d2149bcfbbf9d81d6731f8eab0b3d0bf8ff412661797e09e96ee5` |

## Final checkpoint update — lint and shared brand only (2026-10-19)

This appendix supersedes only the artifact checkpoint above; earlier review findings, probe executions and their exact historical hashes remain accurate. No new interaction hunt or probe rerun was performed.

| Artifact | Independently confirmed SHA256 |
| --- | --- |
| review.html | `0f5499762f4ac97e3b69e7a50bc708139a8b1e3bf1662b5ba7e43f51df874869` |
| thread.review.html | `4ec0f7be0bf807731f47af672d63efcc429939d7466402bbc0d56f9b53114bc2` |
| interactions.html | `27b9b9de663ec90d1e21145d78ad2567882f9c11b0deae5ad351c83b9cab91de` |

Confirmed limited source deltas: ChatMessages maps with `(message)` after removing its unused index; proposed navigation imports the existing renderer `BrandLockup` and mounts `markSize={20}`, while current retains its old glyph; `.rail-brand > b` shares the former strong typography/flex rule. Stale official-component wording is removed from the relevant source comments; historical CSS class names do not establish an assistant-ui execution dependency. These are lint, brand reuse/layout and description changes, with no interaction contract change identified in this targeted delta.

Build closure recheck: `build.mjs` hash remains `8b2acdd9876d2149bcfbbf9d81d6731f8eab0b3d0bf8ff412661797e09e96ee5`; its Rollup guard still rejects assistant-ui/vendor module execution and requires one React root. Latest resolution records one React root in thread/review/details, with 308/538/337 modules respectively and real TanStack imports in thread/details (55 modules each). Exact versions remain ai-react0.30.3/client0.39.2/ai0.68.0. Added review modules are consistent with importing the shared BrandLockup/antd-style closure. Artifact/source metadata comparison passed; reviewer did not rebuild.

| Changed source | SHA256 |
| --- | --- |
| chat-components.tsx | `8dd8319d757d83d38d862d9a697d5c5a832b792af8e2eb410c03ac4e5d4bb4f4` |
| main.tsx | `1869795811adeadb56a694a4c1276b723bb9341bed1f6fd4ab640af4e3d49c4d` |
| review.css | `09e3b3afbee44598eaa52235cdc0f823f541d598946205b68ce18c42b5143a03` |

Conclusion unchanged: requested source delta review is complete at these final hashes. No independent GUI, all-state parity, real HTTP or product pass is claimed. Prior documented native/service and representative-coverage boundaries remain.
