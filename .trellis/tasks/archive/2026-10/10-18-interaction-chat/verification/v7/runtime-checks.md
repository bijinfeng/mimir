# v7 isolated SDK verification

Checked 2026-10-19. This is planning prototype verification, not product implementation or real provider/Office/Agent certification. Product manifests and pnpm lock are untouched.

## Actual dependency graph

New isolated root `/private/tmp/mimir-chat-tanstack-v7/deps`, exact registry packages: `@tanstack/ai@0.69.0`, `@tanstack/ai-client@0.39.3`, `@tanstack/ai-react@0.30.4`, plus `@tanstack/ai-openai@0.30.0` for a Node-only provider compatibility probe. AG-UI core remains transitive `1.0.0`. Browser graph records one existing project React per standalone document and rejects executing assistant-ui/vendor modules. Provider package is not included in the browser entry graph.

Portable lock is generated from a real `/private/tmp` cwd with explicit package name/version. All 116 installed entries have `node_modules/` keys, registry tarball URLs and integrity values. A separate empty `/private/tmp/mimir-chat-tanstack-v7/repro` directory successfully ran `npm ci --registry https://registry.npmjs.org --cache /tmp/mimir-chat-tanstack-v7/cache --ignore-scripts --no-audit --no-fund --legacy-peer-deps`: 116 packages installed. Legacy peer handling is intentional: browser React/ReactDOM resolve to project dependencies; optional integrations are not asserted to exist.

## Checks executed

- `node prototype/v7/build.mjs`: three standalone documents generated. Expected large self-contained bundle warnings; no API adaptation needed.
- `apps/web/node_modules/.bin/tsc -p prototype/v7/tsconfig.json --pretty false`: pass, including provider factory call signatures and model-specific reasoning narrowing.
- `node prototype/v7/check-artifact.mjs`: pass; 403 stable source routes, 126 inherited catalog items, original current/source evidence unchanged; one React and no assistant-ui executing imports. This does not count as 403 browser tests.
- `python3 prototype/v7/generate-manifest.py`: pass, verifies only; does not regenerate scene content.
- `node prototype/v7/runtime-probe.mjs`: 5 groups pass: asynchronous pre-send identity snapshot, independent A/B queue snapshots and restore guard, preparation cancel retention, actual 3-connection failed-resume/cache recovery without repeated user/tool calls, provider+model and effort validation/default policy.
- `node prototype/v7/protocol-probe.mjs`: pass; 58 default event sequences, 89 variants, 8 explicit sidecar/atomic JSON Patch/legacy lifecycle checks.
- `node prototype/v7/latest-api-probe.mjs`: pass; details below.
- Direct scoped oxlint with v7 tsconfig: exit 0, 0 errors, 40 inherited prototype warnings (including existing React/style diagnostics). New provider and latest API probe files have no diagnostics. No claim of warning-free product code.
- Direct oxfmt using v7 format config: 28 authored TS/TSX/MJS/CSS files pass. Generated media literals and standalone HTML are excluded from authored-source formatting.

All `prototype/v7/...` paths in command shorthand are relative to `.trellis/tasks/10-18-interaction-chat/` except root tools. Actual commands were executed from repository root with full task path.

## Official 0.69 reasoning APIs

`provider-api-probe.ts` type-checks all five current provider factory seams: compatible chat, embedding, summary, image, transcription. Factories construct with an explicit local fixture key and no network. Closures for chat/embed/summarize are compile-only and never invoked. A real `o3` adapter type permits `high` and a `@ts-expect-error` negative check requires `off` to be rejected; this proves the installed metadata type contract, not account/model availability.

Public `ModelReasoning`, `supportedReasoningLevels`, and `clampReasoningLevel` are executed with explicitly synthetic sparse capability `{low, high}`. Output is `[low, high]`; high remains high, medium clamps upward to high, max downward to high. Both false and undefined yield `[off]` in the SDK. Mimir must preserve its unknown/not-supported distinction and explicit selected-model default policy; applying these helpers blindly would change approved behavior.

An actual ai `chat({ reasoning: { level: 'high', summary: false }, stream: false })` with ai-openai `createOpenaiChat('gpt-5.2',...)` uses a controlled local fetch stub returning legal Responses SSE. Exactly one local request is captured with `reasoning: {effort:'high'}`, text is reduced to `local-only`. This verifies installed request mapping and local response reduction only; no real key/provider HTTP is involved. Result shape is `{text,chunks}` for this API, and the probe checks its text field.

## Preservation and limits

No runtime/helper migration was required for v7's existing model/effort UX. The scene JSON is byte-equivalent after restoring only its version field. Source v6 UI files were copied and only own-version identifiers changed; v6 catalog is deliberately reused. Frozen older versions were not built or edited. Main session owns browser evidence, protected baseline comparison, final version freeze and approval status. No product tests or full repository quality gate were run for this planning-only delta.
