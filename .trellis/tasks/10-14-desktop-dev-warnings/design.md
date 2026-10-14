# Design: desktop:dev warning cleanup

## Boundaries

- Preserve the `desktop:dev` sequence (server build → desktop three-target build → Electron startup → watch build) and the desktop renderer's same-origin host URL.
- Keep React Compiler enabled for project-owned React source in both Web and desktop. Configure its include/exclude boundary consistently so immutable `packages/office/vendor/` is treated like third-party source, while all Mimir components and hooks remain compiled.
- Do not edit `packages/office/vendor/` to resolve build warnings; use project-owned adapters and build configuration for font asset resolution. The separately approved CSS formatting fix is limited to one declaration and preserves its selectors and values.

## Warning families and approach

1. **React Compiler diagnostics in Mimir source:** change unsupported syntax at the reported sites. For simple `try/finally` cases, move guaranteed cleanup into a supported control-flow shape while preserving all success, failure, cancellation, and early-return paths. For the Agent bridge, extract complex async tool execution/validation from the component into a non-React module function with explicit inputs and outputs rather than flattening its error semantics. Recheck each diagnostic after the corresponding edit.
2. **Vendor React suppression:** scope the React plugin away from the fixed GenOffice vendor path in both platform configs. The vendor code still transforms and bundles via Vite; only project-owned components participate in React Compiler. Avoid a global diagnostic switch or compiler removal.
3. **Carlito font URLs:** obtain the four OFL-licensed metric-compatible faces with recorded source and license, place them in a project-owned asset directory, and resolve the `@genoffice/ui/fonts/...` URLs through shared renderer build configuration. Verify the output references emitted font assets and no runtime-relative unresolved URL survives. This matters for DOCX pagination, so substituting an unrelated font merely to silence the warning is not acceptable.
4. **Ineffective dynamic imports:** make the read-only Markdown viewer's Tiptap dependencies explicit static imports because they already occur in the renderer graph. Preserve its StrictMode cancellation/destroy behavior and heading-anchor behavior.
5. **Electron startup:** distinguish an absent local Electron binary from build warnings. Try the package's supported binary installation from its configured reputable mirror/official source; if network remains unavailable, retain the exact failure and still validate the independent build/watch path.

## Compatibility and rollback

- Shared renderer edits affect Web and desktop, so build both platforms and run focused tests. Changes to the Agent bridge and PDF save path require their existing cancellation, draft, version, and error tests, plus a focused new test only if an uncovered behavior can regress.
- Do not touch data models, persistence format, server APIs, or document save contracts.
- Each warning family is a separate reviewable edit and can be reverted without changing the others. Build logs before/after are the observable gate.

## Quality-gate expansion (approved 2026-10-14)

- The unchanged vendor stylesheet fails the repository's formatter. Run oxfmt on that file only, review its diff for formatting-only changes, and keep the vendor source behavior intact. This follows the existing sync → format convention.
- The ChatPanel retry integration test exposes a stale-round rejection even when the canvas has not changed. Repair the version/round comparison at its runtime owner, retaining rejection when the canvas really changed. Run the retry and full chat test suites before `pnpm check`.
  Investigation found that `@assistant-ui/react-ag-ui` is installed at `0.0.68`, while the repository's retry-restoration patch targets `0.0.63` and is no longer applied. Rebase that patch and its pnpm registration; the bridge must only treat a different active interrupt as a changed round, since the dependency may clear the interrupt list during a failed continuation.

## Evidence

See `research/warning-inventory.md` for versioned log findings and the required WeKnora applicability check. GenOffice is pinned at commit `480548fd55f1be3593ee0d8e316a734751d58309` in `packages/office/vendor/UPSTREAM.json`.
