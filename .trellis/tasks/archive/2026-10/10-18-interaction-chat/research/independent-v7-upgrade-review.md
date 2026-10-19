# Independent v7 latest TanStack upgrade review

2026-10-19 (Asia/Shanghai). **Verdict: isolated planning candidate passes the reviewed source/runtime checks.** This is evidence for presenting the exact v7 HTML, not approval or completion of the product dependency migration.

## Scope and method

Read the role-injected task/spec context, current PRD/design/implementation plan, `tanstack-latest-upgrade.md` and upstream registry/release evidence. Reviewed the v6→v7 authored source delta and the isolated dependency/build closure. Independently queried npm registry: latest stable versions remain ai **0.69.0**, ai-client **0.39.3**, ai-react **0.30.4**, ai-openai **0.30.0** (all published 2026-10-13). Reviewed library changes and current production provider/chat/media consumers. This reviewer changed only this report; prototype fixes were applied by the active implementer after review feedback. No product files or frozen versions were edited.

The required WeKnora reference reuses the task's same-day immutable evidence, explicitly not a new website fetch: website HTTP200/version0.8.3, public source `2c0d8384398ca756ee414eef01b71caf91e2caa6`, documented in the upstream research. It is relevant to knowledge/Agent business behavior; npm/TanStack releases and published source are the authority for these dependency versions and API changes.

## Findings (fixed)

1. **Nonportable isolated npm lock.** The initial copied lock used `../../../private/tmp/.../node_modules` keys and a `file:` root version due to resolving the existing prototype symlink. Reported to the implementer, who regenerated a standard lock from a clean real directory. Reviewed final structure: named version0.0.0 root, 117 package records, all dependency keys under `node_modules/`, and all four TanStack package versions/integrities match the saved registry metadata. Clean-directory installation evidence is recorded separately in `verification/v7/runtime-checks.md`. Independently checked the resulting `/private/tmp/mimir-chat-tanstack-v7/repro` manifest versions and byte-identical lock (SHA-256 `6d2bfa27b6173956d2770e8f718b8546966d30024a9b835f685046bc3613b08b`).
2. **Provider smoke omitted media factories.** Initial probe covered chat/embedding/summarize only, while production also uses `createOpenaiImage` and `createOpenaiTranscription`. The implementer added both actual constructors and type checks. Independent rerun now covers all five current factory seams without calling an external vendor.

## Verified behavior and provenance

- This is a real graph upgrade: `runtime-resolution.json` records ai-react/client/core modules from `/private/tmp/mimir-chat-tanstack-v7/deps`, with exact latest versions. Build imports actual `useChat`; each of the three standalone documents has exactly one project React root. The build rejects executing assistant-ui/vendor modules. The OpenAI adapter is used in a Node probe and is not bundled in browser documents.
- Four TanStack license files match the newly installed package LICENSE bytes exactly; provenance/isolated manifest record the exact new versions. Lock integrities match registry integrity evidence.
- All v6 scene objects, including proposed descriptions, remain unchanged; only the version envelope differs. The 403 route IDs/current/source records match frozen source, and the 126 detail catalog IDs remain unique. Model settings, toolbar, components and CSS have no behavior/appearance delta from v6. Changed runtime thread IDs/version labels and isolated resolution are deliberate.
- Strict compilation checks current provider constructors and legal/illegal native o3 effort typing. The actual ai+ai-openai local fetch stub proves native Responses request construction maps top-level `reasoning:{level:'high',summary:false}` into `reasoning:{effort:'high'}` and returns the stubbed answer. This proves request shaping, not vendor availability or arbitrary compatible endpoint support.
- The runtime probe executes latest ChatClient with attachment preparation cancellation, synchronously frozen provider/model/effort/scope/target, independent queue snapshots and original-target resume recovery. The third actual local connection after failed resume reuses cached results, retains one user input/one tool call and does not replay a tool.

## Verification

- Build: **pass**, independent rerun of v7 `build.mjs` (standalone bundle size warnings are expected).
- TypeCheck: **pass**, `apps/web/node_modules/.bin/tsc -p .../v7/tsconfig.json --pretty false`.
- Lint: **pass**, 0 errors /40 inherited warnings across24 scoped TS/TSX/MJS files; generated media/HTML, dependencies and build output excluded. No whole-repository warning-free claim.
- Format: **pass**, eight authored changed script/TSX/API-probe files with v7 format config.
- Artifact: **pass**, 403 routes (71/379 source plus24 attachment states),126 catalog entries, executing versions and single React per document.
- Protocol probe: **pass**,58 default sequences +89 variants +8 explicit reducer/sequence checks; these are not GUI case counts.
- Runtime probe: **pass**, five groups as described above.
- Latest API probe: **pass**, five factories, native effort type constraints, helper behavior and local fetch request construction.
- Integrity: **380/380 protected paths unchanged**, including v1–v6, saved product baseline and product manifests/lock. Product implementation remains absent.

## Findings (not fixed) and residual implementation work

No unresolved blocking source defect was found in the reviewed isolated v7 candidate. These product changes remain deliberately outside the planning scope:

- Current production still uses ai0.68.0/ai-openai0.22.8 and assistant-ui. Server/provider/renderer/chat/shared, the product lock and real HTTP/model/Office/attachment regression must migrate together after approval. This review is not a claim that those packages have already been upgraded.
- Current production uses generic `openaiCompatible`, which has no verified model reasoning map; the successful native Responses probe does not prove generic gateway effort forwarding. Per-provider/model capability validation and explicit correct wire mappings remain necessary. SDK helper fallback for unknown capability must not become a false unsupported/off assertion; SDK nearest-level clamping must not replace the user-approved explicit model-default policy.
- ai0.69 changes truncated-tool execution, loop strategy, `blockOrder`/`metadata.tanstack.continues`/source metadata, error ordering and context-overflow codes. ai-openai also crosses OpenAI SDK6→7. These are correctly identified by the research and require controlled actual HTTP, persistence/history and Agent/media validation in product implementation. Existing `parentRunId` server claim/round/version guard must remain intact.
- This reviewer performed no browser automation or OS-native/Electron/vendor tests. Main-session browser evidence is separate. Source/CSS parity cannot establish every native focus/IME/clipboard behavior. No full repository `pnpm check` was run for this planning-only candidate.

## Exact reviewed standalone artifacts

| Artifact | SHA-256 |
| --- | --- |
| `prototype/v7/review.html` | `1537bb796575dc47c8cc5b5661034b5bfa80e23d4a5995e9ff2a6ef39d67e3ff` |
| `prototype/v7/thread.review.html` | `f5f7195aaf4639c52e327078a1e86224026da0f32d2455ec00806b427a1be827` |
| `prototype/v7/interactions.html` | `acbcaf31377a0500ae9402ab07bbd9b495faed30b8c5ddaffe1ba0f804040de6` |

Later authored source/bundle changes require refreshing this checkpoint. Version metadata and approval status are managed by the main session; v7 is awaiting the exact-version user review.
