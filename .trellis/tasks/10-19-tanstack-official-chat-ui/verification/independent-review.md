# Independent review — official TanStack Headless UI

Reviewed 2026-10-19 against planning commit `c6d6c42`, including the complete tracked product diff and all new `packages/chat/src/ui/` files. This review was performed by the independent `trellis-check` agent. No product files were changed by this reviewer.

## Findings (fixed)

- `.trellis/spec/renderer/frontend/conventions.md`: the stale assistant-ui runtime table reported in the initial review has been corrected by the main agent. Independently checked the final diff: it now points to TanStack `useChat`/official Headless UI and the chat contract, retaining the package/host boundary and distinct history-failure behavior.
- `packages/chat/src/parts/CodeBlock.style.ts`: after browser verification found a gap between the code header and `pre` when switching themes, the implementer changed `&[data-code-frame] pre` to `&&[data-code-frame] pre`. Independently reviewed this follow-up diff: the complete frame selector now has specificity `(0,3,1)`, strictly above the thread rule `.thread [data-role='assistant'] pre` at `(0,2,1)`. The repeated frame class remains scoped to the same actual `data-code-frame` DOM element; all spacing, border and radius values are unchanged. This fixes rule ownership without relying on Emotion insertion order or affecting ordinary Markdown `pre` blocks. The corrected explanatory comment accurately counts the generated class.

No additional product defect was found in the reviewed changes. These fixes were made by the main agent/implementer; this reviewer changed only this report.

## Findings (not fixed)

None outstanding.

## Code-path conclusions

- `use-mimir-runtime.ts` exposes its existing `chat` object; it adds neither a runtime nor a second message/queue state. Transport, frozen intents, attachment leases, branch/canonical-ID logic and `DocxInterruptBridge` execution code are unchanged.
- Module-level `createChatUI` registers real message/input/part/tool components. `ChatThread` renders the official `Messages`; `MessageParts` uses official `Message` selection, public `selectChatUI`/`automaticPartsForMessage`, and official `Part` dispatch. The pending pre-token shell is separately rendered through official `Message`, without inserting a fake SDK message.
- Public whole-thread selection associates cross-message tool results; matched results are filtered once, orphan results remain visible, and `displayedToolPart` propagates result failure/completion to both the group and the tool. Unknown tool names take the public manual `Part` path; display registration does not authorize execution. Subagents retain the prior read-only rendering.
- One stable content-composition tree and stable occurrence/tool IDs preserve disclosure DOM/focus when the first tool appears or later chunks arrive. Existing message action and business sidecar guards remain intact.
- Official `TextPart` receives the stable existing code component map and retains the streaming Markdown extension. Its extra wrapper is compensated using scoped `display: contents` and edge-paragraph spacing; this was inspected in code, while actual visual geometry remains the main agent's browser acceptance responsibility.
- The installed client explicitly hides `client-tool-execution` from public `ChatInterrupt`. Retaining the original guarded bridge rather than adding a second approval consumer is correct for this product's supported execution path.

## Verification

- Lint: **pass**, `pnpm exec oxlint packages/chat/src`.
- Formatting: **pass**, `pnpm exec oxfmt --check packages/chat/src` (47 files).
- TypeCheck: **pass**, `pnpm --filter @mimir/chat typecheck`.
- Tests: **pass**, `pnpm --filter @mimir/chat test` — 8 files, 87 tests. Includes genuine local HTTP/SSE runtime regressions and the real-SDK official composition tests; no SDK factory/hook mocking was introduced. The two HTTP 503 messages are expected failure/retry fixtures.
- Diff whitespace: **pass**, `git diff --check`.
- Follow-up code-style fix: **pass**, scoped `oxlint` and `oxfmt --check` for `CodeBlock.style.ts`, and a fresh `pnpm --filter @mimir/chat typecheck`. The complete Chat suite above ran before this CSS-only change and was not repeated; main-session full checks and actual theme-switch browser verification remain the final acceptance gate.

Full-repository checks, Web/Desktop builds and actual browser acceptance are delegated to the main agent and are not claimed as independently executed here. Paid-provider, native Electron/IME and screen-reader certification are not implied by these checks.
