# Research: Independent chat planning contract review

- Query: Independently verify source completeness, current/proposed fidelity, genuine state rendering, and recovery interaction coverage for module 7.
- Scope: internal review, with existing external evidence assessed for applicability
- Date: 2026-10-18

## Findings

### Materials and source anchors checked

- `prd.md`, `design.md`, `implement.md`: planning-only boundary, exact-version approval, scoped business contracts.
- `research/chat-package-inventory.json`: 46 groups / 250 states. All group source file/line anchors exist; no duplicate group/state IDs.
- `research/chat-host-inventory.json`: 25 groups / 129 states. All group source file/line anchors exist; no duplicate group/state IDs.
- `packages/chat/src/ChatPanel.tsx:227`: guide vs main empty-state dispatch; same composer is not duplicated.
- `packages/chat/src/ChatThread.tsx:56`: history skeleton precedes empty handling.
- `packages/chat/src/parts/MessageItem.tsx:140`: settled zero-part assistant is hidden; its normal transport failure card is bypassed.
- `packages/chat/src/parts/MessageItem.tsx:158` and `parts/TraceActivity.tsx:202`: actual trace follows running, not first text arrival; manual expansion is overwritten when expanded prop flips.
- `packages/chat/src/runtime/use-mimir-runtime.ts:176`, `:345`, `:356`: sentHere is panel-level, ask merges current runConfig, and only api.ask explicitly sets sentHere. Current historical failure prose does not enforce standard reasoning.
- `packages/chat/src/parts/FailureNotice.tsx:202`: current historical notice promises standard mode. Current and proposed must not conflate that prose with a parameter guarantee.
- `packages/chat/src/composer/Composer.tsx:296`: current settings sync preserves existing single send path; generating input remains editable, Enter queues, same mouse button stops.
- `packages/chat/src/parts/MediaParts.tsx:232`, `:262`: file/audio are chips with conditional download; image links to original. No inline audio/video player exists.
- `packages/chat/src/runtime/DocxInterruptBridge.tsx:707`, `:752`, `:764`, `:804`, `:846`: cached-result retry validates environment and never reruns write tool; bridge status/media chooser/partial-draft/revert are separate UI before ChatPanelBody, not invented assistant approval bubbles.
- `packages/chat/src/parts/DocxAgentHistoryNotice.tsx:58`: pending historical tool offers open document/cancel, distinct from live bridge execution controls.

### Initial source/design assessment

1. The inventories cover the principal package renderers and renderer host contracts, with careful explicit native/API/Office boundaries. State totals are planning enumeration, not a GUI acceptance count.
2. A contradiction was raised to the main session: design initially asserted standard historical retry as preserved behavior. The updated `design.md` now describes current visible-strength inheritance and puts standard retry in an explicit proposed correction. Updated PRD R7/AC5 also includes clipboard error feedback, empty-error recovery, and manual trace persistence. This resolves the document-level ambiguity; actual HTML still requires inspection.
3. Trace current behavior is correctly captured in CHAT-016 and design. Both columns must show the full transition: manually expand during live run, complete run, current collapses while proposed retains user selection.
4. Native media selection cancel leaves existing Upload waiting; the prototype must not turn cancel into successful completion or fabricate a current picker-cancel callback. Live media cards must distinguish choose-image/audio/video, document-image condition, analyzing, stale result rejection, and stop.
5. ImagePart currently has only max-width:320px with no percent clamp and no onError fallback (`MediaParts.tsx:137`, `:262`). Proposed narrow fit and failure feedback must be explicit reviewed improvements, not painted as current behavior. Partial-draft keep/discard has no submit loading or click mutex (`DocxInterruptBridge.tsx:804`); a proposed pending/mutex interaction similarly needs explicit documentation. Only-search currently forces scope search and documentId null (`MessageItem.tsx:201`, `chat-context.tsx:144`), rather than retaining the original single-document retrieval filter.
6. Existing WeKnora research records website response fingerprint/version plus fixed repository commit `2c0d8384398ca756ee414eef01b71caf91e2caa6` / package 0.8.3, with exact file/line evidence and per-pattern applicability. It explicitly avoids claiming a verified deployed SHA, logged-in GUI tests, or transplanting unavailable tool approval and steer/inject capabilities. This meets the research-reference requirement for the planning artifacts.

### Prototype gate

Pending: `prototype/main.tsx`, scene/coverage artifacts and compiled `review.html` were not yet present during initial source review. This section must be supplemented after actual renderer inspection; source coverage counts alone do not satisfy HTML coverage.

### Prototype first complete source review — blocking findings

Inspected initial `main.tsx`, `generate-manifest.py`, `scenes.json`, `coverage.json` and standalone HTML build. These are intermediate files under active repair; line anchors refer to this reviewed revision and may move. No browser actions were performed by this reviewer.

- **P1 / BR-01 — capacity data is invented.** `main.tsx:167`, `:223` show 12% and 15,360/128,000, while `ComposerMenus.tsx:295–344` has prompt/output/total token counts and no model-window denominator. CHAT-013.unknown-input means prompt/completion null with known total, not unknown capacity. Preserve actual data shape in both columns; show null as — and actual prompt tok.
- **P1 / BR-02 — trace waiting/current initialization incorrect.** `main.tsx:217` always uses clickable Disclosure for CHAT-016.waiting, while `TraceActivity.tsx:215–226` returns noninteractive status without chevron. CHAT-016.manual starts closed in recipe despite current expanded=running. Show null-trace waiting separately, live expansion correctly, and demonstrate manual-open → complete preserving only proposed choice. Disclosure now has after-aware completion logic, so the initial missing behavior is partly repaired.
- **P1 / BR-03 — sidebar overlay accessibility path absent.** HOST-018 recipes only differ in ignored specialState; `main.tsx:214` sidebar section has no dialog/aria-modal, background inert or sidebar Tab trap. `handleRootKey:136` prioritizes busy stopping even from unrelated sidebar controls. CSS hides document beneath 880px but cannot replace focus, backdrop, nested Escape and return-focus behavior. Implement genuine local overlay state driven by actual demo container and trap only the top active layer; keep composer Escape semantics distinct from outer sidebar Escape.
- **P1 / BR-04 — snapshot and queue recovery paths contradict contracts.** CHAT-044.stale-new recipe puts old screenshot into composer beside a new draft; actual should preserve new composer and retain screenshot only on failed user message. `retry:116` does not check snapshot expiry/validation and lets CHAT-045.expired enter searching. It also bypasses queue when CHAT-029.running retries. Add local original-turn snapshot metadata and environment-valid flag, use one send/queue route, and restore screenshot when explicitly refilling. Clearing visible hint must not clear source invalidity.
- **P1 / BR-05 — guarded destinations are discarded.** `chooseHistory:120`, `showSettings:121`, new-chat/search/citation controls open the same dialog with no pending target; guard confirm at `main.tsx:224` always sets viewingSource=true. Confirmed new-chat/history/settings/search do not reach their real local endpoint. Retain explicit pending action and execute that action on confirm, preserve it on cancel, and avoid inventing actual save success.
- **P1 / BR-06 — creation/open boundary has no observable destination.** `main.tsx:202` only writes a sentence for CHAT-040.autoopen and “打开新文档” sets viewingSource; in sidebar that only highlights the original document. Represent a clearly simulated different document ID/title and one-time finish transition, with cancelled-after-created staying put. A real API boundary may remain explicitly unverified.
- **P2 / BR-07 — empty/error current column contains impossible content.** CHAT-028.zero hides failureCard but still shows mimir heading, default trace and citations in `main.tsx:217`; source settled zero parts hides entire assistant. CHAT-004.missing recipe shows loadError, whereas package null history returns empty (host’s separate error route is distinct). Render these current states accurately before proposing recovery.
- **P2 / BR-08 — enumeration/coverage overstates renderer proof.** `coverage.json` labels every state “source recipe + rendered component binding”; ignored specialState variants (e.g. HOST-017.switch, CHAT-003 repeated/replacement, HOST-002 owned-ID) do not show their observable lifetime/retention result. Either provide actual local contract scenarios with meaningful before/action/after or mark internal/native-only evidence explicitly and narrow the claim. Distinct route strings and descriptive labels alone do not establish full state coverage.

### Intermediate repairs observed

- Main/Agent bridge and tool-message/history renderers are now separate; live bridge does not always fabricate Args/Result inside an assistant bubble.
- Partial-draft keep/discard and undo now show actual proposed pending controls, mutex, result/error settlement; current controls remain without that protection.
- Code-copy failure now returns silently for current and shows visible proposed feedback.
- Historical retry now sets proposed deep=false; current retains deep. Its current announce still incorrectly says standard mode, so text must also distinguish columns.
- Image error/retry controls and current fixed-width versus proposed container clamp are represented. Native image load correctness still not verified by this mockup.

### Prototype gate status

**BLOCKED pending repairs and final-build re-review.** These findings concern the review artifact, not authorization to change product code. Compilation is not equivalent to source/current fidelity or complete interactive-state coverage. Prior count/source-anchor findings remain valid; HTML-specific acceptance does not yet pass.

## Related specs

- `.trellis/spec/chat/frontend/index.md`, `conventions.md`, `pitfalls.md`: host-owned theme, all AG-UI parts, model bindings, side-panel standard reasoning, queue and snapshot behavior.
- `.trellis/spec/shared/contract/document-agent.md`, `docx-agent.md`: execution/version/continuation boundaries.
- `.trellis/workflow.md`: planning assets and explicit implementation gate.

## Caveats / Not Found

- Research role has no product/prototype write or git authority; only this research artifact is written.
- This initial pass validates source anchors and selected code paths, not every runtime branch in a browser.
- Prototype and real backend/native integration are distinct gates. No API writes, native picker, OS IME, real clipboard failure, or Office execution has been verified here.

## Re-review after first repair build

The standalone artifact inspected during this pass had SHA256 `3dc54cd99d2686d055ec8154b27c8286082440c6af649b6def7facdbde433fd3` (files continued changing during review; do not treat this as the eventual frozen delivery hash).

### Structural checks

Independent read-only Python comparison confirms exactly 379 source states, 379 scene IDs and 379 coverage entries; no missing/extra IDs and no duplicate IDs. This is a mapping check, not 379 interactive behavior tests.

### BR-01–08 disposition

| Finding | Latest source assessment |
| --- | --- |
| BR-01 capacity | Resolved: token labels and prompt/output/total replace fictional percentage/window limit. |
| BR-02 trace | Waiting now correctly noninteractive. After-aware completion/manual retention exists. Remaining current initialization: CHAT-016.manual recipe still traceOpen=false with phase streaming, although actual current initializes expanded=running. |
| BR-03 overlay | Partial: dialog/aria-modal/inert/backdrop/trap added. Remaining container-width derivation and outer Escape priority need correction below. |
| BR-04 snapshots/queue | Partial: expired retry rejected and running retry queues. Remaining stale-new only hides attachment visually while retaining composer-bound snapshot state; explicit refill restores text only. |
| BR-05 guards | Main defect resolved: pendingNavigation closure and guarded history/settings/new-chat/citation paths exist. Search handoff still warrants GUI validation of correct draft/guard endpoint; no backend save claimed. |
| BR-06 created document | Resolved as a local boundary scene: distinct sourceTarget new/history-original and visible document title, autoopen initial endpoint, stopped-after does not autoopen. This does not verify actual one-time API-triggered navigation. |
| BR-07 empty/error | Resolved in source recipe/render guard: package missing history now empty; settled empty/zero-current assistant is wholly suppressed; proposed recovery remains. |
| BR-08 coverage | Still incomplete: exact ID mapping passes but renderer-binding evidence is still blanket text, and the unrendered state examples below remain. |

### Remaining delivery blockers and concrete repros

1. **P1 / snapshot isolation (main.tsx:61, :108–110, :174).** Open CHAT-044.stale-new, keep its new question, click Send: `snapshot` is true despite hidden Snapshot and old `validationIssue` blocks the new text. Separate failedTurnSnapshot from composerSnapshot; new composer must contain no old attachment until explicit refill. The transport-card refill at :182 only sets text and never restores attachment/target. Repro CHAT-045.refill: remove draft snapshot then click refill; expected original PNG returns, current mock does not.
2. **P1 / actual container and Escape layering (main.tsx:145–163, :226, :263).** `narrow` is passed solely from top-level size enum, while CSS uses @container(max-width:880px). Consequently accessibility semantics can disagree with the visible overlay in actual narrow available canvas, and medium/phone flags are not measured document container state. Measure demo content container and use that one value for CSS/role/inert/trap. `handleRootKey` still stops any busy run before closing an overlay regardless of focus. Real Composer handles Escape stop only in textarea; document outer layer should honor defaultPrevented and close overlay from other controls, retaining IME/top-menu rules.
3. **P2 / unsupported completeness claims (generate-manifest.py:161 + main.tsx render paths).** CHAT-001.overflow has special=short but no short-height binding anywhere; CHAT-033.wav always renders “访谈录音.mp3”, and other-mime does not demonstrate MIME variants; CHAT-042.other omits the fallback attachment name altogether; HOST-017.switch has no observable leave/unmount transition or explicit internally-verified classification. Fix visible details; classify each coverage state as visual/interaction/internal/native boundary rather than every state claiming rendered binding. Internal lifetimes need not become product debug controls, but the review must label their actual evidence honestly.
4. **P2 / misleading current retry feedback (main.tsx:124).** Current retains deep=true on CHAT-029.current-config, yet announces “本次使用标准模式重试” for both columns. Distinguish current (“按当前输入区设置重试”) from proposed standard mode. CHAT-016.manual initial current expansion also needs alignment as noted above.

### Delivery judgment

**Not yet ready to claim complete source-faithful interactive HTML approval.** Several earlier substantive issues are repaired, but the above concrete contract/fidelity gaps remain. Continue targeted artifact corrections, then freeze/rebuild and recheck those exact paths. The main session is independently exercising GUI paths; this report does not claim any browser run, real clipboard, native picker, media service, Agent write, or backend integration acceptance.

## Targeted final-four re-review

Only the four previously outstanding classes and the newly introduced queued-parameter freezing were reread after the next repair build. Unchanged source inventories were not redundantly re-audited.

- Screenshot isolation/refill: repaired. Composer snapshot initializes false for stale-new/freeze/dispatch; sentSnapshot independently retains failed-turn original; transport refill restores sentSnapshot. New unrelated text can send despite old failed-turn validation; explicit screenshot retry remains blocked when target invalid.
- Rendering details: repaired for the listed concrete examples. short-height class is bound to overflow, WAV has distinct filename, generic attachment fallback is visible, and switch-document scene removes chat panel and resets local state before opening a new helper. These are prototype mechanisms, not real runtime/API validation.
- Current/proposed fidelity: manual trace current initializes open while streaming; historical current toast now explicitly reports retained visible strength, proposed reports standard. Clipboard and error recovery differences remain represented.
- Overlay: ResizeObserver now measures `.demo-main` and computes overlay = sidebar && hostWidth <= 880 for role/inert/trap. **Two residual references remain:** Escape busy match still uses the whole `.chat-panel,.bridge-panel` at main.tsx:594; close fallback still uses the enum `narrow` at :597. Hence Escape from a close/range button still stops the run, and a measured compact container with size=wide cannot close via outer Escape. Use composer-local textarea stop plus defaultPrevented and actual overlay for outer close.
- Queue parameters: ref now freezes scope/deep/snapshot at enqueue and reapplies on dispatch/restore; expired snapshot dispatch checks validity and preserves newer input. **But a second enqueue overwrites the first** through scalar setQueued(value) / queuedParams assignment (main.tsx:368). CHAT-014.multiple source requires first item visible while later entries remain queued. Use a local array of text/config/snapshot entries, process head, and retain tail; do not present overwriting as the actual queue contract.

Targeted judgment at this revision: **two residual artifact issues (Escape layering/condition and multi-entry queue overwrite) remain blocking fidelity acceptance.** The other previously listed concrete corrections are present in source. Browser checks and final artifact hashes remain the main session's separate gate.

## Final targeted closure — last two blockers

This section supersedes the earlier two-residual-blocker judgment for the inspected artifact. Only those two issues were rechecked; unchanged areas were not re-audited or claimed as new GUI tests.

- **Escape/overlay: resolved.** `prototype/main.tsx:580–588` observes the actual `.demo-main` content width through ResizeObserver. The computed overlay value drives modal semantics, inert, focus trap, backdrop and now Escape close. `:609–632` returns for defaultPrevented/IME, consumes top dialog then menu, stops a busy run only for an HTMLTextAreaElement target, and otherwise closes actual overlay. The old broad `.chat-panel,.bridge-panel` stop selector is absent from compiled review.html. Thus focusing close/range controls no longer invokes the busy-stop branch.
- **Multiple queued messages: resolved.** `prototype/main.tsx:242–265` uses an ordered array of per-item text/scope/deep/snapshot snapshots; enqueue appends without changing prior entries. CHAT-014.multiple initializes two distinct prompts. `:367–377` restores only head then slice(1); `:422–444` dispatches head with its frozen parameters and keeps tail. Both manual send (`:398`) and busy historical retry (`:470`) append through the same helper. A later enqueue no longer overwrites the first prompt or its parameters.

Inspected source SHA256: `54c200e07cb2d4086fc31c2c8a74d40006c73cf7ce4ccbe0d3567516720acdd7`.
Inspected standalone HTML SHA256: `70a18bd3622cb98ccde681c539c28336fd730f5e9b380e271109c67c34496f19`. HTML modification time is later than source and the compiled artifact lacks the retired broad Escape selector.

**Final targeted judgment: PASS; no remaining blocker from these last two findings.** This closes the independent source/prototype-contract findings raised in this review. The main session's final GUI screenshots, geometry/keyboard checks, artifact validation and exact frozen-hash delivery remain separate evidence; this reviewer performed read-only source/artifact inspection and makes no real API/native/Office execution claim.
