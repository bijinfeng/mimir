# Prototype check — 搜索与命令面板 v1

- Date: 2026-10-18
- Reviewer: `search_check` / dispatched `trellis-check`
- Scope: planning-only task artifacts, independent HTML and research evidence. Product implementation is not approved. No product source, shared spec, task phase, other session files or commits were changed by this reviewer.
- Reviewed artifact SHA256: `0e8a90da0c37c509f8fcda8027c9f01bac5f58607c45db83f10d41f8fb950535`.

## Findings (fixed)

These preview-local issues were found during read-only review and corrected in the implementer's consolidated batch, then independently checked against the final source:

- File: `prototype/main.tsx`, `prototype/fixtures.ts`
  - Issue: direct pending and simulated responses used generic document completion, losing new-note body focus and rename/move outcomes; saved-during remained dirty and triggered another save.
  - Fix: explicit pending operation and action-specific settlement, distinct rename/move draft fixtures and saved simulation values; new-note completion enters created body; already-saved guard leaves directly.
- File: `prototype/main.tsx`
  - Issue: manual success/failure could be overwritten by an outstanding simulated timer.
  - Fix: operation/query/recent generations prevent an earlier simulated completion from overriding the explicit response.
- File: `prototype/main.tsx`, `prototype/fixtures.ts`
  - Issue: long-path result row and detail showed different paths; detail focus was not independently owned; baseline row focus/singleflight silently included proposal behavior.
  - Fix: same item owns the path; separate palette/host/detail refs, visible dialog focus and inert underlying palette; proposal-only row-focus selection and busy protection.

Reviewer-local mechanical fixes after final handoff:

- File: `prototype/main.tsx`
  - Issue: successful simulated move Undo changed only feedback text while the displayed saved folder remained at the destination. Undo also stayed available indefinitely, unlike the source's 8-second contract.
  - Fix: capture the previous saved folder, restore it on simulated successful Undo, retain destination on the explicit failure fixture, and expire the Undo affordance after 8 seconds with effect cleanup.
- File: `prototype/main.tsx`
  - Issue: one combined initial-focus selector selected the first matching node in DOM order, allowing the close button to win over an input marked `data-initial-focus`.
  - Fix: select the explicit initial-focus target first, then fall back to ordinary focusable fields/buttons.
- File: `prototype/checks.json`, `prototype/version.json`
  - Issue: prior lint record had empty output without proving hidden-task source enumeration; version hash preceded reviewer fixes.
  - Fix: record strict `--no-ignore --deny-warnings --format json` output (4 files, 201 rules, zero diagnostics) and updated rebuilt artifact hash.

## Findings (not fixed)

No unresolved preview-local blocker found in the reviewed source. The following are deliberate task boundaries, not validated product behavior:

- Native Ctrl/Cmd+K, real IME candidates, assistive technology announcements, browser 200% zoom, actual cross-tab storage, authentication/permission transitions, Electron host behavior and real snippet-offset/highlight/save integration require product implementation and host verification. Coverage/README explicitly qualify these; this review does not report them as passed.
- Source-backed visual baseline is an independent fixture reconstruction. It preserves the 620px/top14vh panel, single-line chunk rows, green selection and existing feedback gaps against `CommandPalette.tsx` and `verification/current-desktop-results.png`; it is not a live product mount or a pixel-identity claim.
- All 152 stable IDs are mapped in exact inventory order to executable recipe entries or qualified host demonstrations. This is 16 groups / 152 coverage items, not 152 independent business pages or every possible state/dimension combination. Main session owns actual browser interaction confirmation and screenshots.
- Whole-repo checks remain separately tracked by the workspace task's `resume-gate-status.md`. No unrelated miniapp/configuration files were repaired, no full suite was rerun, and this report does not turn that gate green.

## Verification

- Lint: **pass** — strict explicit 4-source-file run, 201 rules, 0 warnings/errors.
- TypeCheck: **pass** — renderer TypeScript executable against `prototype/tsconfig.json`.
- Format: **pass** — independent stdin formatter comparison of authored TS/TSX/MJS/CSS/JSON/README files; hidden task directory default ignores bypassed. Final locally touched source formatted before rebuild and metadata formatted after sync.
- Build: **pass** — Vite 8.3.4, standalone HTML regenerated; external CDN, product imports and business requests absent from authored runtime.
- Artifact checks: **pass** — 16 groups, 152 unique IDs, coverage entries exactly match scenes, no external script/stylesheet asset references, inline artifact retained.
- Reference integrity: **pass** — retained WeKnora official HTML, release/tag metadata and all 7 public-source snapshots match recorded bytes and SHA256; version `v0.8.3`, commit `3e22822c1d2397be730c458c7539d0eb8c113a24` is qualified as sampled release evidence.
- Tests: **not applicable to product code** — no product changes. Static artifact assertions pass. Browser QA is reported by the parent session, not inferred from lint/build.
- Spec sync: no current product contract changed; PRD/design/implementation plan preserve approval and native verification requirements. Task remains `planning`.

Review result: suitable to freeze for user HTML review after the parent's bounded GUI confirmation; user approval is still required before product implementation.
