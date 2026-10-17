# DOCX protection password, settings and forced revisions — next execution plan

2026-10-17, root. Continues the approved all-tools scope; implementation must run in separate owner/check slices, preserving the completed protected comments/forms paths. This is a plan, not a passed implementation gate.

## Concrete reference and applicability

- Main file-editing reference: fixed GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`, read from `/tmp/mimir-genoffice-html-git`.
- `packages/docx-engine/src/protection.ts`: UTF16LE, h0=SHA512(salt||password), hi=SHA512(previous||LE32(i)), default100000, max1000000. Verify rejects over-budget native spin; Mimir must reject malformed counts instead of substituting/clamping. Existing upstream helper alone has no cancellation/deadline worker.
- `apps/docs/src/renderer/components/ProtectDialog.tsx`: distinct open-file password, modification password, four restriction modes + password, removePersonalInfo. Lines108–136 preserve untouched credentials and require verification for changing an enforced password restriction. `App.tsx` submitModifyPwd only unlocks current session; applyProtectDialog marks actual settings changes dirty. Whole-file encryption is a separate main-process implementation in `apps/docs/src/main/docx-encryption.ts`, using officecrypto-tool, with current-disk versus desired-next-save password state.
- WeKnora: reused same-day verified official site `https://weknora.weixin.qq.com/` and public source `https://github.com/Tencent/WeKnora`, v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`. Root reread cached site/definitions: SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe` / `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`. Not a new network-success claim. Definitions14–21 knowledge tools/29–49 capability-gated sandbox registration apply to truthful permission gates, not Word credential hashing or Ribbon design. Visual reference remains compact current Inspector/Obsidian conventions.

## Gap and change boundary

Current `docx-protection.ts` conservatively aggregates document/write credentials and denies writable; `DocxProtectionControls` only displays unsupported password status. `DocxSession.save` rejects public options overriding settings. This protects originals but lacks actual verification/settings commands. Do not grant a caller ordinary writable access just because a hash is recognized.

### W1 — modification password verification, ephemeral access

Ownership: `docx-protection.ts`, new `docx-protection-password.ts` + module worker and tests, `DocxProtectionControls.tsx`/local CSS/tests, minimal `DocxEditor` access subscription seam only when demonstrated necessary. Preserve original forms/comments modules; no vendor/shared shell changes.

1. Parse private per-node credentials and intent. Public summaries never contain hash/salt/password. WriteProtection verification unlocks only the modification gate; documentProtection mode continues to apply. A correct modification password cannot stop readOnly/comments/forms/trackedChanges restrictions.
2. SHA512 verify runs in a real cancellable dedicated worker, with size/spin/deadline budgets, terminate+promise settlement on timeout/abort/error/unmount/source change. Validate before hashing; support UTF16LE surrogate pairs/Chinese, spin0 and absent spin default, strict base64 sizes and native sid14. Do not use main-thread repeated digest. No password to Agent tools/logs/API/localStorage/index.
3. Controller owns authorization and epoch. Bind pending verify to current session/controller/native credential identity and request token; recheck after await; no caller-provided success boolean, public options or mutable snapshot bypass. Successful verification updates live access only, increments epoch and invalidates stale handles. Failure/cancel/late result leaves bytes/history/dirty/access exact.
4. Unlocking current session is not changing the saved file. Saving untouched session must return whole original bytes. After actual edits, writeProtection/settings stay exact. A→B→A/reopen requires verification again. Combined restriction+writePassword grants only that restriction's supported current capability; never turn forms/comments into body writable.
5. Current 320px Inspector: reveal only current verification fields; password input with standard show/hide, clear error on editing, one fixed primary "验证并继续编辑" and busy/cancel state. No permanent new modal. Enter submits the relevant form, Escape cancels/clears then closes through existing focus contract. Pending password disappears when source changes.

W1 acceptance: native known hash fixtures and independent vectors including Chinese/emoji; wrong password, malformed/mixed/unsupported credentials, bounded real worker terminate; combined document/write gates; real PM/Agent final-save guard; actual native body edit after authorized unlock with settings/non-target entries exact; untouched zero dirty/history; save/reopen and source switch; 420×500 fixed footer/scroll/error/keyboard/focus. Root owns browser/build/full suites; independent checker must reproduce bounded targeted gates.

### W2 — native protection settings and stop restriction

Starts only after W1 freezes/checks. Ownership same controller and UI, new surgical settings writer, `docx.ts` private privileged save seam, actual-editor/history/native tests; explicit root coordination before shared Editor writes.

- Settings UI provides restriction enable/mode/password-preserve/replace/clear, modification password preserve/replace/clear, recommended readonly, and the fixed upstream privacy setting if actual writer semantics are confirmed. Do not use sentinel password strings as actual credentials. Empty new value is not an implicit remove; explicit intent avoids accidental changes.
- Stopping/changing enforced password restriction requires verification of **documentProtection** credentials, separately from modification unlock. Unsupported/uncertain native settings remain preserved and disallow modifications. No-password restriction still requires an explicit settings action, not body-click unlock.
- Keep authorization inside the private controller with session epoch and frozen candidate; generic public save options/partXml remain blocked. One atomic native settings candidate and one history entry; verify/hash preparation alone is no-op. No UI-only disabled gate.
- Namespace-aware span patch only touched native attrs/nodes, preserve all opaque settings/namespace/comments/order/non-target ZIP entries. Follow actual settings relationship; if absent, create one valid part/relationship/contentType atomically. No blanket regex replacement of w-prefixed tags. On failure/cancel/epoch change: zero publish/bytes/history. Saved state and Undo/Redo reopen correctly; settings dirty participates in current-copy export and manual save once.
- Creating a new password uses random16-byte salt and default100000 spin in same worker. Password fields never persist, serialize, leak to Agent, or restore plaintext in Undo. Tests can invoke pure/vector/native paths; actual browser changing/setting credentials must honor CUA handoff requirement at that action, without blocking code completion beforehand.

### T — enforced tracked changes

Starts after W2. `trackedChanges` mode is not equivalent to normal writable + optional toolbar toggle. Fixed upstream forces recording. Current Mimir toolbar and Agent revision-restore can switch storage off; all must agree on controller policy.

- Enable mandatory recording before every real manual/Agent text transaction. Keep it enabled after round restore/Undo/Redo/source hydration. Disable stopping recording and accept/reject while enforcement remains; revision navigation/read are allowed.
- Document model and final session.save must verify permitted tracked deltas, rather than trust mutable storage. Unsupported untrackable structural/format operations need precise supported-boundary handling; no plain insertion/accept-all bypass through Agent or a forged PM/save call.
- Actual insertion/deletion/replacement produces correct w:ins/w:del with metadata, retains originals/non-target settings and pre-existing revisions. Cancel/no-op/late results and final-save tampering fail closed. Once stop restriction is authorized through W2, normal revision controls return.

## Separate confirmed remaining scope, not silently omitted

Fixed ProtectDialog also has **password to open (whole-file ECMA376 encryption)** and **remove personal information**. Mimir currently rejects the encrypted OLE container and has no open/decrypt path. These cannot be marked complete by W1/W2. Whole-file decrypt/re-encrypt requires a separate browser/server/KB plaintext-retention design and bounded worker/crypto review; queue it explicitly after these slices. Privacy switch is not just a settings flag if upstream actually scrubs metadata; audit `patch.ts` scrubPersonalInfo behavior before W2 claims parity. No digital certificate tool is inferred.

## Gates and ownership rules

Each slice implement → independent check → root real browser1280/420×500 and native save/readback; scoped types/lint/format and Antd checks, no global480-skill baseline rerun. Root alone runs full Office/server/build. Preserve unrelated dirty files; no vendor edits/stage/commit/archive/test-file deletion. User chose code+browser/no real model configuration and Desktop self-acceptance. Do not present this plan as implementation evidence or whole-tool completion.
