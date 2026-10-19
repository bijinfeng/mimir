# v2 shared knowledge-base editor implementation

2026-10-18, implementation subagent. User-approved HTML v2 is the scope; prototype and global tokens remain unchanged.

## Changed surfaces

- `KnowledgeBaseCreateModal.tsx` now exports `KnowledgeBaseModal` shared by create/edit, retaining the compatibility creation entry consumed by LibraryView. No icon picker or icon payload is present. Persisted icons are read/displayed unchanged elsewhere.
- Names and optional descriptions start blank for create and prefill for edit. Editing only the description or explicitly clearing it sends PATCH even when the path is unchanged; both fields unchanged close directly. New description drafts have a 500-character limit. A historical 501–2000-character description stays intact and can be omitted from rename PATCH unchanged; changing it requires <=500 characters.
- The same form implements IME-safe Enter, synchronous duplicate-submit prevention, locked pending dismissal, inline field/request errors, both drafts retained on failures, and cancel reset. TextArea count has 24px of body space so the final count is not clipped.
- Failed edits re-fetch the authoritative tree and resolve the original stable code before retrying. Missing/unreadable identity blocks save and offers a read retry. `FOLDER_UPDATE_FAILED` with shared-schema recovery `retrySafe=false` stays blocked even if tree reading succeeds; re-reading cannot prove raw file/index consistency.
- Success invalidates folders, document lists/details, and recent documents. FolderSection uses the shared editor, restores edit trigger focus after closing, retains cached rows on refresh errors with a retry, and exposes full names with hover/focus tooltips.
- Rename updates active nested path suffixes. Description-only saves do not navigate. `onPathChanged(from,to)` allows NavSidebar to update the canonical scope while retaining the current note ID; row selection remains a distinct action.
- `api.folders.move` retains old two-argument calls while accepting optional `{description}` metadata. Shared/server contract is owned by the backend implementer.

## Verification

- Targeted renderer form/folder/library tests passed (21 tests across four files): shared form, FolderSection, path helpers, LibraryView. Includes empty/invalid names, IME, create failure/retry, pending single submit/locked cancel, no icon controls, description-only/clear/both edits, unchanged close, authoritative path recovery, blocked unsafe recovery, lost-state reload, historical long-description preservation, cancel reset, cached refresh errors, and active path callback/default suffix paths.
- `pnpm --filter @mimir/renderer typecheck` passed.
- Focused `oxlint --deny-warnings` on the five owned source/test files passed.
- `oxfmt` applied to owned files; `git diff --check` clean at local handoff.

Product browser verification and final workspace quality gate are coordinated by the main session; unit DOM checks do not replace modal focus/low-height/390px/light/dark visual verification. No commit performed by this worker.
