# Independent review — chat rendering polish

Reviewed current product diff, new process/protocol presentation components, gallery source and shared fixture contracts on 2026-10-19. Reviewer did not run the product browser, full repository gate, or production builds; those belong to the primary session evidence.

## Findings (fixed)

- **AnswerActions.tsx:** the persisted-note color class lost to the containing action row selector. Raised saved-state specificity for default/hover/focus; hover explicitly beats `.actions button:hover:not(:disabled)`. Primary reported the default state green and stable 30×30 geometry; final hover browser recheck remains with primary.
- **Composer.tsx:** removed duplicate `align-items: center` from the bar, retaining the existing effective `flex-end` layout.
- **Gallery main.tsx (coordinated implementer fix):** history fixture cast hid missing required message/citation fields. Replaced cast with actual `messageSchema.parse`, populated nullable history fields and valid `kind: note`; quota is the actual failure enum. All 28 scene/theme/layout variants and 56 messages subsequently passed the shared schema. An intermediate `md` recommendation was rejected by executing the schema and corrected before final screenshot capture.
- **Gallery main.tsx (coordinated implementer fix):** Supplemental now inherits the same ChatThemeBridge; native audio/video/activity/structured-output/subagent/orphan tool-result samples now go through real useChat + official production MessageParts. Added locally available media fixtures; no live model output is claimed.

## Findings (not fixed)

No unresolved product-code finding in the reviewed scope. This is a code/contract/automated review, not certification of every AG-UI event or every actual browser interaction. Primary must complete final paired screenshot capture, HTML archive, full repository checks, saved-hover browser recheck and documentation/acceptance record before completion.

The full-repository server timeout reported by primary was inspected statically only: `chat-attachments.test.ts:210` serially starts five attachment preparations and compresses 17 MiB XML under the default 5-second test timeout; nearby Office/PDF matrix uses an explicit 30-second budget and earlier invalid-input matrix already documents worker-start cumulative cost. Recommendation sent to primary: separate matrix cases or align the explicit bounded test budget. Reviewer did not alter server code or run concurrent server tests.

## Review conclusions

- Official Provider/Messages/Message/Part/Input/TextPart composition remains intact. `ui/kit.tsx`, `ui/MessageParts.tsx`, `ChatPanel.tsx` and runtime algorithms have no diff. No second runtime, queue or tool executor was introduced.
- Markdown now owns prose styles locally; tool/protocol JSON remains readonly and inspectable. Stable disclosure IDs/aria-controls, native buttons, keyboard-accessible local scroll regions and focus outlines preserve interaction access. Table stays semantic and scrollable locally.
- Action rows have fixed geometry and no hover transform. Disabled state still relies on native disabled behavior. Existing save-ID, branch, queue/restore, upload and Agent guards remain in the unchanged business paths and their regression tests.
- Field aliases reuse exported FIELD_COLOR instead of duplicating a palette. ChatThemeBridge injects the existing reading font role and both surfaces inherit the same host theme. No new product ThemeProvider or dependency was added.
- Frozen prior v1–v7 prototypes are unchanged. The gallery uses production imports and clearly identifies fixture IO. Before/after bundle provenance and final screenshot identity must be established by primary/implementer, not inferred from build success.

## Verification

- `pnpm --filter @mimir/chat test`: **PASS**, 8 files / 88 tests, repeated after disclosure keyboard-access changes and local mechanical fixes. Expected 503 fixtures appear in failure-path tests.
- `pnpm --filter @mimir/chat typecheck`: **PASS**, repeated after final saved-hover selector correction.
- `pnpm --filter @mimir/renderer typecheck`: **PASS**.
- `pnpm --filter @mimir/renderer exec vitest run src/theme/design.test.ts src/components/chat`: **PASS**, actual selected suite 1 file / 109 tests (no extra tests exist in components/chat).
- `pnpm --filter @mimir/renderer exec vitest run src/lib/chat-save-note.test.ts src/lib/chat-attachments-api.test.ts src/components/document/DocChatSidebar.test.tsx src/components/document/DocChatGuide.test.tsx`: **PASS**, 4 files / 11 tests.
- Scoped `pnpm exec oxlint` for Chat source, changed renderer bridge/token files and gallery: **PASS**.
- Scoped `pnpm exec oxfmt --check` for Chat source and changed renderer files: **PASS**. Task dot-directory gallery is not implicitly certified by the formatter's normal matching; implementer runs explicit gallery formatting/build.
- `git diff --check`: **PASS** at review.
- Executed gallery source fixture construction using tsx + real shared `messageSchema` for reading/process/states/failure/empty/loading/history-error × light/dark × main/sidebar: **PASS**, 28 variants / 56 message parses.
- Extracted final `diagnosticMessage: UIMessage` into a temporary TS file importing the realpath of the installed TanStack AI package; `tsc --ignoreConfig --noEmit --skipLibCheck --strict --target ES2023 --module ESNext --moduleResolution bundler`: **PASS**. Absolute symlink import initially resolved an unrelated root AG-UI version and produced false diagnostics; only the corrected real dependency result is accepted.

No commit was made by this reviewer.

## Final incremental review — compact sidebar composer and bounded server test

Reviewed the subsequent `Composer.tsx` / `ComposerMenus.tsx` changes following the actual document-sidebar wrapping feedback. Container queries are anchored to the composer width, rather than the viewport, so the same behavior applies inside the document pane. At ≤560px the five existing controls stay in one flex row; only visible labels shorten, while model/scope titles and complete accessible names remain available. The model is the flexible ellipsis item, menus use the container-size cap, and usage moves to its own row only when the actual prompt-token value exists. No send/queue/model-selection/reasoning/scope algorithm, disabled predicate, IME behavior, or real tool execution changed. No additional finding.

Primary supplied actual-product 399px evidence: attachment/model/reasoning/scope/send share the same y coordinate and 30px height; sidebar scrollWidth equals clientWidth (399). Wider/narrower actual-browser verification and fresh after screenshots remain primary-owned evidence, not this reviewer's execution.

Reviewed `apps/server/src/test/chat-attachments.test.ts` separately against server testing guidelines. The change adds only an explanatory comment and an explicit 30,000ms timeout to the serial five-worker/ZIP-compression matrix, matching the adjacent real Office/PDF matrix. All original MIME validation, binary rejection, inflated-XML error, lifecycle cleanup and other assertions remain unchanged. No global timeout, mocked parser, skipped case, or product behavior was added. Primary reports focused server suite 29 tests passed; reviewer did not rerun it concurrently with the full gate.

Incremental commands executed by reviewer:

- `pnpm --filter @mimir/chat typecheck`: **PASS**.
- `pnpm exec oxlint packages/chat/src/composer/Composer.tsx packages/chat/src/composer/ComposerMenus.tsx apps/server/src/test/chat-attachments.test.ts`: **PASS**.
- `pnpm exec oxfmt --check packages/chat/src/composer/Composer.tsx packages/chat/src/composer/ComposerMenus.tsx apps/server/src/test/chat-attachments.test.ts`: **PASS**.
- `git diff --check`: **PASS**.

No unresolved finding from this increment. Full regression suite was not redundantly repeated by reviewer; primary's final full-repository gate is the completion evidence.
