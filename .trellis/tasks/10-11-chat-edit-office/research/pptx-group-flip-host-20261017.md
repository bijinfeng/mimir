# Grouped native flip persistence, 2026-10-17

## Change boundary

Bare Agent `flipElements` on direct group members toggles the native model but
does not patch the parent XML, so save/reopen discards it. Repair the server
host transaction dispatch with a narrow synchronous native definition adapter;
add dedicated actual Agent/host tests. Keep native whole-batch planning and
atomic rollback, original operation names, public whitelist and non-group
behavior. Vendor, Editor, geometry helper and Agent validation stay owned by
their existing slices.

The fixed registry has no unregister. Rather than permanently adding a private
name to its error directory, temporarily wrap the existing same-name native
definition only during synchronous runTxn, restoring it in finally. Both
runTxn and apply are synchronous; this scope must never introduce await or
Promise. Flush the exact native compensated transform after every group flip,
before the next operation; do not copy the native orbit formula or split the
transaction. Failure to patch throws into the existing atomic snapshot.

## References

- GenOffice fixed commit `480548fd55f1be3593ee0d8e316a734751d58309`, verified
  `/tmp/mimir-genoffice-html-git` HEAD again. Fixed vendor `pptx-ops/src/ops/element-ops.ts`
  234–294 calculates center-preserving flips and sets `dirtyTransform` but does
  not patch grouped XML. `pptx-engine/src/index.ts` 4365–4384 exports
  `editGroupChildTransform`, which patches the exact child slice with flip
  flags and sets structureDirty. `ops/executor.ts` validates the complete batch,
  snapshots slides/archive, applies synchronously, and restores on failure.
- WeKnora website fetched HTTP 200 again on 2026-10-17
  (`/tmp/mimir-group-flip-weknora-site.html`). Public v0.8.3 source
  `3e22822c1d2397be730c458c7539d0eb8c113a24/internal/agent/tools/definitions.go`
  fetched HTTP 200 (`/tmp/mimir-group-flip-weknora-definitions.go`). Its
  lines 14–21 define knowledge retrieval; 35–49 gate sandbox file tools by
  capability; 69–75 scope wiki tools to wiki knowledge bases. This remains
  relevant to capability boundaries;
  it supplies no PPTX geometry or native group transaction model. GenOffice is
  the main editing behavior reference.

## Verification

- `pnpm --filter @mimir/server exec vitest run src/test/pptx-group-flip-host.test.ts src/test/pptx-agent-host.test.ts src/test/pptx-selection-format-host.test.ts`:
  **3 files, 29/29 passed** (including 10 new targeted tests).
- Actual Agent → actual host service (document lookup mocked,
  native engine/ZIP/transaction/save real): bare H, V and H+V grouped flips on
  a nonzero-rotation member; direct shape/text/picture members; native-center
  compensation; sibling XML and all other archive entries untouched; original
  operation names/counts in records; two saves and save/undo/save/redo/save.
- Same-batch flip→ungroup and flip→duplicate match their two-call saved native
  results entry-for-entry. This catches a save-only/end-of-batch flush.
- A later native apply failure restores the complete pretransaction model and
  archive map and leaves Agent version/bytes unchanged. Invalid group/member,
  stale version, cancellation and unknown external operation remain rejected.
- Concurrent host requests, native top-level output equivalence, original
  registry identity/name list after normal/failed requests, and a snapshot
  exception outside native apply catch all pass. The wrapper finally restores
  the original definition even in that exception path.
- Server and Office `tsc --noEmit`, targeted Oxlint/Oxfmt and `git diff --check` passed.

The previous geometry helper remains compatible; its older diagnostic assertion
that raw host group flip stays unchanged must be updated by the geometry owner
to the now-persisted native transform. No geometry files changed in this slice.

Browser/model/Desktop acceptance is not implied by service tests; no real model
is configured and Desktop is user-owned. Overall editor-completion task remains
in progress; this server slice is frozen for independent review.
