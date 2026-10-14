# Implementation plan

1. Capture baseline warning summary for desktop build and server build; keep the original log outside the repository. Confirm the desktop watch script uses the same renderer config.
2. Fix simple React Compiler diagnostics in renderer and office-owned files (`_app`, `DocumentPanel`, `AvatarCropper`, `FilePreview`, `use-source`, `PdfEditor`). Validate after each group so new diagnostics are visible.
3. Refactor `MarkdownBody` static imports and lifecycle; verify no duplicate ProseMirror instance in StrictMode and no ineffective dynamic-import warnings.
4. Refactor `DocxInterruptBridge` async coordinator into compiler-supported boundaries; run focused Agent bridge tests for tool failures, cancellation, drafts, revision mode, undo, and version checks.
5. Exclude immutable vendor React source from compiler participation in both Web and desktop configs; retain compiler diagnostics for Mimir source.
6. Resolve the four Carlito font URLs with project-owned licensed assets and shared build resolution; inspect emitted renderer CSS/asset paths and the font license record.
7. Rebuild Web and desktop, run desktop watch build through one ready cycle, and compare normalized warning inventories. Address any newly exposed warnings; do not suppress them globally.
8. Run targeted lint/format/typecheck/tests and `pnpm check` if available. Launch the real desktop app and run the relevant smoke path if Electron binary can be installed; otherwise record the environment blocker precisely.
9. Review spec relevance and update only if a durable convention or silent pitfall was discovered; commit task changes with validation details, then finish/archve the Trellis task.

## Approved quality-gate follow-up

10. Apply only oxfmt's mechanical change to the pre-existing vendor CSS format failure; verify vendor behavior is untouched.
11. Fix ChatPanel's unchanged-canvas retry rejection while preserving stale-canvas rejection, then rerun the chat integration suite.
12. Rerun `pnpm check` across the repository, followed by a final task-wide quality review.

## Gates and rollback points

- Do not start code edits before task activation after the final planning review.
- Guard behavior-sensitive refactors with existing tests before moving to the next warning family.
- Do not edit `packages/office/vendor/` to resolve build warnings or disable React Compiler for project-owned code. The separately approved CSS formatting fix is limited to one declaration and preserves its selectors and values.
- Watch for changes to DOCX pagination metrics when resolving Carlito assets and for cancellation/cleanup regressions in async control flow.
