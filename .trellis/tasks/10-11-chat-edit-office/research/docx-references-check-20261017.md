# Independent DOCX References check — 2026-10-17

Reviewer: dispatched PDF/PPTX implementer, separate from the DOCX References implementer. No DOCX product code changed in this review.

## Scope and reference evidence

Read the source/save adapters, References Inspector and CSS, Editor Ribbon/save/context integration, helper/control tests, and the relevant native source/field generators. Checked the References contract in `.trellis/spec/office/frontend/editors/pitfalls.md` and implementation research `docx-references-20261017.md`.

Primary Office reference is GenOffice fixed commit `480548fd55f1be3593ee0d8e316a734751d58309`, References Ribbon and native `instrField` usage. The implementation research records WeKnora site/source HTTP200, v0.8.3 commit `3e22822c1d2397be730c458c7539d0eb8c113a24`; its retrieval and sandbox capability gates do not specify Word bibliography/field editing. That evidence supports explicit capability limits, not an Office toolbar model.

## Findings

No blocking defect found in the reviewed scope. Source metadata and new citations share one ProseMirror transaction; native source XML updates retain unedited fields and parts. Save/undo/save/redo/save and reopening are exercised against actual DOCX ZIP entries. Caption insertion honors picture NodeSelection. TOC updates reject unsafe or incomplete regions before mutation. General field caches are explicit and native fields are dirty for Word recalculation. Inspector rejects stale document/selection context and keeps explicit application.

The documented boundaries remain relevant: only safely recognized complete TOC fields can be updated; Word performs actual field/page-number/style recalculation; no native Zotero bridge. This review did not run browser/desktop or configured-model acceptance; root owns browser 1280/420 and HTTP save/history checks against uploaded fixture `jKSPHJDlHk8-1hlV`.

## Executed checks

`pnpm --filter @mimir/office exec vitest run src/editors/docx-references.test.ts src/editors/DocxReferencesControls.test.tsx src/editors/docx-image.test.ts src/editors/DocxImageControls.test.tsx src/docx-image-save.test.ts src/editors/docx-table-design.test.ts src/editors/DocxTableDesignControls.test.tsx src/docx.test.ts`

Result: **8 files, 46/46 tests passed**. This includes 12 References tests plus native picture, table and open/save regressions. Targeted oxlint, six-file oxfmt and Antd References lint also passed during this independent review. The combined Office/Server/Shared type checks, styles gate and diff check had passed at the preceding PPTX freeze; root owns final combined gates after all agents finish.
