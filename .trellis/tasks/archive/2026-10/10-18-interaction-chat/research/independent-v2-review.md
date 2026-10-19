# Research: Independent v2 removal and official-message-component review

- Query: Independently verify v2 against the explicit user decision to remove custom retrieval-process UI and use AG-UI / assistant-ui supported message interactions, while preserving v1 and all unapproved product code.
- Scope: internal / official-source / static artifact-contract verification; GUI verification belongs to the main session.
- Date: 2026-10-19

## Findings

### Final independent conclusion: PASS

The reviewed v2 source, metadata and final standalone artifact satisfy the removal and official-component planning contracts. All concrete source/integration findings raised during review have been repaired; no independent source/artifact blocker remains. This is approval-stage prototype review, not user approval or production implementation.

### Planning scope

- Read `prd.md`, `design.md`, `implement.md` and `research/official-message-ui-contract.md`. R8/R9 clearly remove all proposed custom `mimir.trace` process UI without a replacement summary/timeline, retain current source facts, and distinguish actual reasoning/tool-call parts from retrieval diagnostics.
- Initial document findings are resolved: `implement.md:24` targets `prototype/v2/build.mjs`; `:25,30` include server/shared trace production and future package checks. The task remains planning with product implementation unapproved.
- The 47-file original baseline and 51-file v2 baseline are distinct scopes: `research/v2-product-baseline-hashes.json` adds stream/nonstream assistant services, retrieval preparation and shared conversations. Independent recomputation found **51 / 51 unchanged**. No source/spec/dependency writes or git operations were performed by this reviewer.

### Official source, versions and licensing

- Fixed official repository: <https://github.com/assistant-ui/assistant-ui/tree/a587b2838f2d644549d216098d54cfbeedfac522>; license MIT, copyright 2026 AgentbaseAI Inc.
- Recalculated all **17 retained research originals** in `research/vendor-official/source-manifest.json`: every file exists and matches its recorded SHA256. The v2 `provenance.json` has **12 vendored source/evidence files**, including renamed `vendor/thread.aui.tsx.source.txt`; every file matches its fixed upstream hash and recorded bytes. Component source was not rewritten.
- `prototype/v2/README.md` and `provenance.json` accurately distinguish product react **0.15.28**, react-ag-ui **0.0.68**, AG-UI client **0.0.59**, from isolated prototype react **0.15.29**. The fixed upstream registry's `responseDeliveryStatus` requires the newer type surface; initial inconsistent runtime/type resolution was repaired. `build.mjs:13,63` and `tsconfig.json` resolve the same isolated SDK. This is not a claim of full compatibility with the installed product SDK.
- The dependency package/lock are archived under the v2 artifact's `dependencies/`; upstream Base UI **1.8.0**, CVA **0.7.1**, cn **0.4.0**, actual Tailwind/CLI **4.3.3** and tw-animate-css **1.4.0** remain isolated from repository dependencies. Future product implementation requires an explicit compatible source/SDK decision plus existing AG-UI interrupt-patch and Agent regressions.

### Actual runtime and official component wiring

- `prototype/v2/official-message.tsx:52–83` supplies explicitly simulated reasoning/tool/empty-running protocol messages to a real `useExternalStoreRuntime`.
- `:93–97` establishes `AssistantRuntimeProvider → ThreadPrimitive.Messages → MessagePrimitive.Root → MessagePrimitive.GroupedParts`. The local engine's `MessageGroupedParts` leaf path wraps each leaf in `MessagePartChildren`, so upstream tool hooks receive an actual message-part context. No hook is mocked to return canned runtime state.
- `:102–108` uses official ReasoningRoot/Trigger/Content/Text; `:111–118` uses official ToolFallbackRoot/Trigger/Content/Args/Result/Error. Their upstream source retains its original Base UI state/scroll behavior. No custom reasoning/tool approximation shell is used in proposed.
- `:124` renders the exact official Thread indicator span. Its presence is emitted by real GroupedParts `no-text` running semantics, not `traceReady`, retrieval counts or a custom replacement row. Official English strings remain explicit; no unsupported children-prop or CSS pseudo-text localization was introduced.
- No Allow/Deny approvals are invented. Existing business document interrupt bridge, source/version/cancel/resume actions remain separate from generic tool messages.

### Removal coverage and current/source preservation

- `scenes.json` and `coverage.json` retain **71 groups, 379 stable unique source state IDs, 52 tracks** and exact source descriptions/boundaries. Every CHAT-016 state (waiting/live/manual/done/search/scroll/absent) is explicitly `proposedStatus: removed`; all seven keep current/source mappings. Counts are source coverage, not 379 GUI executions.
- `prototype/v2/main.tsx:1833` restricts the old trace branch to `!after`. Proposed has no retrieval-step log, recall counts, “思考N轮 / 调用M次工具” summary, substitute timeline or renamed trace block. The old reasoning shell is also current-only. Proposed routes use official waiting/reasoning/tool cases.
- `main.tsx:2739` presents removal notes in review chrome, outside product preview. Current-column trace facts remain available for comparison.
- The source diff from frozen v1 is confined to official message integration, trace removal, provenance/review metadata and necessary fixture improvements. Ordered queue entries and frozen per-entry parameters (`:243`), actual-container ResizeObserver / layered Escape (`:610`), failed-turn screenshot isolation (`:329`), zero-content failure recovery, historical retry strength, image recovery and draft/undo mutex logic were not rewritten. Existing v1 independent review findings therefore remain closed; no new R7 regression was found in this targeted source review.

### Repaired integration findings

1. **Runtime/type version mismatch:** resolved by isolated react 0.15.29 for both build and typecheck, with future product upgrade limitation documented.
2. **Generic tool followed by custom document completion/failure Notice:** resolved by `main.tsx:976` excluding those business Notices from proposed ordinary tool scenes; bridge-specific controls retain their separate semantics.
3. **Long tool state had short fixtures:** resolved by `main.tsx:917–948`, with long raw query/filter/result examples. Official wrapping/expansion remains official behavior; no separate custom tool shell is invented.
4. **Cancelled status and duplicate ternary edit residue:** resolved in `official-message.tsx:58–90`; cancelled uses incomplete/cancelled and the official cancelled label path.
5. **Tool-part failure versus whole-answer failure:** resolved without adding a business restriction. Product `MessageItem.tsx:211–219` suppresses answer actions on whole-message incomplete/failure or failed/pending/cancelled documentAgent; it does not turn every failed tool part into a failed answer. The ordinary tool fixture can now have a failed part with a final successful answer (`official-message.tsx:61`), matching outer `lastSuccessful`; whole-turn failure and document Agent gates remain separate.
6. **Old artifact checks:** resolved in `check-artifact.mjs`, which now checks removed states, official symbols/runtime provenance, version, source hashes, real CSS, single React resolution and standalone boundaries. Its “not 379 GUI tests” limitation is retained.

### CSS and dependency resolution

- `official.css` imports the fixed upstream shimmer source and exact registry state/keyframe definitions. Tailwind compiles the original source utility classes; PostCSS mechanically scopes selectors to `.official-message`.
- Inspected generated CSS contains `tw-shimmer` / `tw-shimmer-translate` keyframes, Base UI open/closed variants, collapsible panel-height fallback, `animation-duration:var(--animation-duration)`, `overflow-wrap:anywhere`, and reduced-motion rules. This is actual generated CSS, not manually translated styling.
- `review.css:1924` maps theme/font variables; `:1959` maps the review's 200% typography tokens. Original component layout classes and text remain intact.
- `runtime-resolution.json` reports SDK 0.15.29 and one React 19.3.0 instance; its module paths all point to the existing project React root, not isolated duplicate copies. The build's aliases/deduplication produce this report. Browser computed-style/keyboard/geometry evidence belongs to the main session.

### External-reference applicability

Reused and checked this task's dated official/reference evidence (`official-message-ui-contract.md:103–107`, `trace-ui-origin.md`, `weknora-reference.md`): WeKnora website HTTP 200 / displayed **v0.8.3**, public source pinned to **2c0d8384398ca756ee414eef01b71caf91e2caa6**, `frontend/package.json` **0.8.3**. Website response SHA256 is `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`; deployment commit remains unverified. Its AgentStreamDisplay illustrates real state/action separation, but its custom thinking card is expressly unsuitable after the user's removal decision. assistant-ui fixed official source governs this revision; WeKnora's Markdown editor is not used as an Office-toolbar reference.

## Files found and related specs

- `prototype/v2/official-message.tsx`: real fixture runtime and official message components.
- `prototype/v2/main.tsx`: shared preview scene application, current/proposed gating and retained recovery controls.
- `prototype/v2/provenance.json`, `runtime-resolution.json`, `dependencies/`: source/license/version and actual module-resolution evidence.
- `prototype/v2/scenes.json`, `coverage.json`, `check-artifact.mjs`: state/source mappings, removed classification and static artifact checks.
- `.trellis/spec/chat/frontend/conventions.md`, `pitfalls.md`: theme inheritance, complete part rendering, queue/screenshot/AG-UI runtime contracts; existing trace-display clauses await future approved implementation updates.
- `.trellis/spec/shared/contract/document-agent.md`, `docx-agent.md`: execution/resume/version boundaries.
- `.trellis/spec/renderer/frontend/document/conventions.md`: citation navigation, sidebar and unsaved guards.
- `.trellis/workflow.md`: planning and task-asset-only boundary.

## Caveats / Not Found

- No production changes, real model output, API/HTTP settlement, native PNG/media/file/clipboard behavior, Office execution, Electron or screen-reader validation were performed by this reviewer. Those are simulated or separately owned checks.
- Official reasoning/tool examples are explicit local fixtures, not proof the current Mimir service produces those events. Persisted historical trace cannot be converted into missing real reasoning/tool events.
- The prototype's newer isolated SDK is not a repository upgrade or proof that all product AG-UI/interruption behavior already passes on it.
- User approval is still required before product implementation; this independent pass does not grant that approval.

## Final artifact and integrity closure

Independently read final artifact bytes after the main session announced the completed rebuild:

- `prototype/v2/review.html` SHA256: **`6c18bbd2d936e7b706b7ed3375a6234b82670b961e6be10ba7b81eac306a3af8`**. Recomputed hash equals `checks.json.htmlSha256` and the author's final candidate hash.
- The standalone HTML contains the exact full bytes of `vendor/LICENSE`, including copyright and MIT permission text; single-file sharing retains this attribution.
- Rechecked all 12 provenance source hashes: all match. Rechecked all 51 product source baselines: **51 unchanged, 0 changed**.
- Frozen v1 source SHA256 remains `54c200e07cb2d4086fc31c2c8a74d40006c73cf7ce4ccbe0d3567516720acdd7`.
- Frozen v1 HTML SHA256 remains `70a18bd3622cb98ccde681c539c28336fd730f5e9b380e271109c67c34496f19`, matching `task.json` and the previous independent report.
- Repository `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `packages/chat/package.json` hashes are unchanged from this review's initial pass. Dependency installation remains in the isolated prototype environment.
- Reviewed v2 source SHA256: main `12e54ad2fa5c284aa663457fdb27211f814a2b7d547405faac5c9fea11af9108`; official message wiring `316ace74ada293de5f04df40b3c2ff5d1b1e8b7d59140202516af83c5d3d786f`.

The author/main session separately reports first-party formatting, lint, build and artifact validation passed. Main-session GUI evidence covers dark 390px long-tool layout, failed tool Error/Args/Result without duplicate Notice, 200% reasoning typography, seven removed trace states, official pulse waiting, two-entry queue stop recovery, sidebar Escape/focus layers and zero-content failure refill without success actions. Those GUI results are explicitly attributed; this reviewer did not replay browser tests or claim actual backend/native execution.
