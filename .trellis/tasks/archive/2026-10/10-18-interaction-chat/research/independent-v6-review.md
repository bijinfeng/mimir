# Independent v6 model and reasoning capability review

2026-10-19. **Verdict: source/contract delta review passed for the checkpoint below.** No unresolved blocking defect was found in the reviewed v6 model/effort revision after the implementer fixed the reported paths. This is approval to present the planning HTML for user review, not product implementation approval or a complete GUI/product certification.

## Scope and method

Reviewed current PRD/design/implementation plan, v6-model-capabilities.md, UI-013/UI-014 catalog overrides, model/settings/send helpers, both comparison hosts and the shared iframe/ComponentLab/ModelLab. Compared against frozen v5 source. The source routes/current/source provenance remain historical; v6 proposed model behavior explicitly supersedes readonly roles, boolean deepReasoning and forced-standard sidebars. No product or frozen prototype was edited by this reviewer. Reviewer owns this report; fixes below were communicated to and applied by the prototype implementer while their ownership was active.

Required external-reference evidence is reused from the same-day fixed research, not independently fetched again: WeKnora website HTTP200 advertised v0.8.3, public source 2c0d8384398ca756ee414eef01b71caf91e2caa6. v6-model-capabilities.md records capability-driven levels, model-switch reset and absence of off for always-on models. It explicitly rejects generic fallback ladders for unknown metadata. This supports business semantics; Mimir DESIGN and the user reference remain the appearance/grouping authority.

## Findings (fixed)

1. **Direct host send bypassed the model snapshot.** `main.tsx` host “排队当前草稿” called send without an intent. Proposed send now captures synchronously before its side effects; seeded queue fixtures have explicit model identities too. Normal iframe send continues to deep-clone before attachment preparation.
2. **Retry retained legacy settings and omitted idle snapshots.** Retry now uses a separate lastRunIntent for the original executed turn, validates current availability, captures a fallback only when no saved run configuration exists, and handles invalid capture without clearing the draft. Both busy and idle retry paths set or enqueue the same explicit configuration. Queue scope/snapshot derive from the frozen retry intent, avoiding restoration of the current composer's different scope. Old-history fallback has explicit explanatory copy.
3. **Restore/dispatch could accept stale model identity.** Both compare-host restore and dispatch validate the captured tuple and effort against the current model directory. Missing/invalid model or effort preserves the queue and gives feedback. New nonempty draft protection remains intact. ComponentLab restoration likewise retains model and scope in its modeled path; product availability/lifetime requires real-service implementation.
4. **Independent hosts duplicated strength changes.** Main now calls the shared updateToolbar transition rather than accepting an arbitrary effort string. The transition accepts only exact capability options or a permitted inheritance action. ComponentLab regeneration uses captureSendIntent instead of passing live state unchecked.
5. **Proposed narrative drift.** Affected scene descriptions and coverage formerly asserted readonly role bindings, forced-standard sidebars or boolean switching. They now describe provider/model identity and model capability levels. Current/source fields and stable route IDs were preserved; coverage declares v6. Legacy names in source evidence remain historical.

## Confirmed behavior

- Configured-provider-instance groups use providerId; option identity is the structured providerId/modelId tuple. Same displayed model A under two providers remains distinct. Selected row reserves right checkmark space and uses neutral selected background; non-submit controls explicitly use type=button.
- Supported choices alone populate the effort menu; no guessed real vendor capability is claimed. Nine clearly synthetic model fixtures exercise graded levels, incompatible defaults, fixed single level, toggle, inherited provider default, unsupported, unknown, loading and error.
- Compatible explicit effort survives a model switch; incompatible effort resets to the declared default. Fixed capability is display-only; inheritance omits the wire field rather than sending a made-up auto value. Scope is independent and the same toolbar serves main and sidebar.
- Unknown/loading/error **reasoning capability** permits ordinary chat with no effort. Missing/loading/error **model directory** prevents dispatch. Unsupported or unknown capability never sends a stale explicit effort.
- Shared capture preserves provider/model/effort, scope, context and files before await. Actual ChatClient dispatch receives the captured record; queued records remain independent. Existing explicit resume-target recovery and attachment cancellation probes still pass.

## Independent verification

- TypeCheck: **pass**, apps/web/node_modules/.bin/tsc with v6 tsconfig.
- Lint: **pass with 40 warnings, 0 errors** across 23 scoped source files (media-fixtures, generated build directories and node_modules excluded). Warnings include inherited array keys/effect dependencies/compiler-related prototype patterns plus new map-spread/shadow notices; this is not a warning-free or whole-repository lint claim.
- Formatting: **pass**, 10 authored v6 changed TS/TSX/CSS/probe files under v6 format.json; generated standalone HTML excluded.
- Artifact checker: **pass**, 403 stable route IDs/current/source records match frozen source, 126 distinct catalog items, fixed runtime versions and one React per document, no executing assistant-ui imports in the build closure.
- Protocol probe rerun: **pass**, 58 default sequences, 89 variants, 8 assertions. These are local schema/reducer checks, not 147 GUI cases.
- Runtime probe rerun: **pass**, five groups for actual ChatClient dispatch after async preparation, separate queue snapshots/new-draft protection, attachment cancellation, failed-resume third connection with cached original target, and explicit model/effort behavior.
- Additional independent read-only helper matrix: **pass** for all 9 model fixtures, tuple collision resistance (a/b,c versus a,b/c), duplicate-name identity, valid preserve/reset, default omission, unknown/error/loading effort omission, missing directory rejection, invalid effort rejection and removed provider validation. Sidebar scope remained unchanged.
- Integrity: **316/316** protected files in total (prior prototypes, saved product baseline and manifests); **51/51** saved product baseline files are a subset of that total match their recorded hashes. No git diff exists under apps/packages/plugins or product manifests/lock at this checkpoint.

## Findings (not fixed) and acceptance boundaries

No blocking v6 source delta remains. The following are intentionally outside this planning-only review:

- Provider metadata, adapter mappings, server validation/auth, real model request options, per-run provider/model selection and usage attribution are still a cross-layer product migration. Synthetic fixtures do not prove any commercial endpoint supports these grades.
- This reviewer did not perform browser automation. Main reported A→B reset medium to off, B high→A retained high, unsupported/unknown appeared distinctly disabled, F's local receipt omitted effort, and the final tabs had no console errors. Main also verified Escape closes the model menu and restores focus to 当前模型：模型 A. Reviewer opened all four final supplied screenshots under verification/v6 (model-menu, reasoning-levels, dark-menu, narrow-menu) and confirmed the visible provider headings, reserved check alignment, model-derived levels and available controls fit the shown layouts. The narrow image is an embedded 390px layout simulation, not an OS/mobile viewport test. Screenshot inspection cannot prove every focus/hover/keyboard or host state.
- Native picker/IME/clipboard/download, real attachments/auth/lifetime/history, service/Office/Agent/vision/tool execution and exhaustive interaction parity remain future implementation verification. Counts of routes/catalog entries are inventory evidence only.
- Nonblocking scoped lint warnings were left in this prototype rather than widening this revision into inherited component/refactor work. Product quality checks must run on approved implementation; no full-repository quality-gate pass is claimed here.

## Reviewed artifact checkpoint

| Artifact | SHA256 |
| --- | --- |
| review.html | `0946cf191be8491e6d4606f6be1bbe90a925bfef26e373115124c04ce3fe6ad0` |
| thread.review.html | `4abc19f040b7d55cfb8bbb45c55d542d91d12da4b36ae518a136423392421d87` |
| interactions.html | `baa09f5fd2c22cd008f0f519c8403d8163683aa7ba7ac077e8dc829451334ee4` |

A subsequent source rebuild is a new checkpoint. Main should refresh final artifact hashes and recheck relevant fixes if it changes the delivered bundle.

## Reviewed source checkpoint

| Source under prototype/v6 | SHA256 |
| --- | --- |
| model-settings.ts | `41fccf9e89a207664ce26d722bcf4f4950e9a93d4565b844954c1b56a4d85f5e` |
| composer-toolbar.tsx | `2234dd5596c0a581ccd53cf5530040e4845209a5fa7b8cf3bff945d028d892bd` |
| composer-send-intent.ts | `6952a1550a8c7b92ea9cc92741151d1c8b745a706ae05372828f65aaf6a37f87` |
| main.tsx | `f957f527018c46f0e9bfa7ab3884fb4eec2ac13360256c9e8148b527f13d5c09` |
| thread-app.tsx | `0582d705f414053faeb281747cb7a78fc505caeb4c604853b6b763e0621d0092` |
| component-lab.tsx | `6d1e2698bd86bd259c1d2585513c1f2d46dba7581c4a04b69dba16b9f8f0b5b5` |
| model-lab.tsx | `db4356821ace349780953877d92bde54e5d2c21793351e597476f06df104d01b` |
| interactions-app.tsx | `8a0dbd2ae7d0bf32b1cfd0687fc71b9d285ed94777ef63a1161239cff34210e0` |
| scenes.json | `61ff3238def8924d852a306f89943610fe12c1b39c1e8729b70ca567d996fe27` |
| coverage.json | `f4c7ae71ed4dd306cc1e9cac57c873eec620fbafd5130b1a035a2bd4f2c24cb7` |
| runtime-probe.mjs | `5367b3d527874e3233dd94903e30288dfa188a7a8a6b7c36e23e419cb8ab8217` |
