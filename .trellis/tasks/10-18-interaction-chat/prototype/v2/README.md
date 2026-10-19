# Chat HTML review v2

This revision removes custom `mimir.trace` from every proposed view, retains source/current evidence, and uses the fixed official assistant-ui registry components for actual reasoning and tool-call fixtures. Product code and the frozen v1 prototype are unchanged. This is a review prototype awaiting approval, not an implementation.

Open `review.html` directly, or use `http://127.0.0.1:5189/v2/review.html`. Routes still cover 71 source groups / 379 states / 52 rendered tracks. The seven CHAT-016 routes have `proposedStatus: removed`; their current views remain for comparison. Counts describe source mappings, not 379 browser tests.

## Official source and integration

Official repository: `assistant-ui/assistant-ui`, commit `a587b2838f2d644549d216098d54cfbeedfac522`, MIT, Copyright (c) 2026 AgentbaseAI Inc. `vendor/LICENSE` and `provenance.json` preserve attribution, exact source paths, original SHA-256, integration decisions and versions. The standalone `review.html` also embeds the complete official MIT notice in a safely escaped HTML comment.

- ReasoningRoot / Trigger / Content / Text, ToolFallback Root / Trigger / Content / Args / Result / Error and their component dependencies are copied byte for byte into `vendor/`.
- Original `@/lib/utils` and `@/components/ui/*` imports are adapted through explicit Vite and TypeScript aliases, without rewriting vendor source.
- `official-message.tsx` supplies local protocol fixtures to a real `useExternalStoreRuntime`, renders real message parts with `MessagePrimitive.GroupedParts`, and composes the official exported UI components. No `mimir.trace` event is converted into reasoning/tool-call.
- The waiting dot is the exact JSX node from official Thread's `case "indicator"` (`thread.aui.tsx`, lines 705–716; preserved original in `vendor/thread.aui.tsx.source.txt`). Its visibility comes from the SDK's default `indicator="no-text"`, not trace readiness.
- Official registry CSS, tw-shimmer and actual Tailwind 4.3.3 are used. The only CSS adaptations are import/candidate scope, mechanical selector prefix `.official-message` to isolate official preflight, and Mimir theme/font variables (including official text tokens for the existing 200% font review mode). Utility layout and interaction styles are compiled from the official source, not hand translated. English component strings are unchanged.

The official source uses `@assistant-ui/react` 0.15.29. Product 0.15.28 does not type-check this exact source because `responseDeliveryStatus` is missing. The isolated prototype therefore uses **0.15.29 at both runtime and type-check**. Future product implementation requires an explicit minimal SDK upgrade or an official compatible registry revision, with regression checks. This prototype does not establish full AG-UI/product compatibility. Product react-ag-ui 0.0.68 and AG-UI client 0.0.59 remain untouched.

## Reproduce

Dependencies are installed only under `/tmp/mimir-chat-official-v2/official-deps`; no repository package/lock changes. The dependency manifest and lock are archived under `dependencies/`. Use a separate writable npm cache and the public npm registry:

```sh
mkdir -p /tmp/mimir-chat-official-v2/official-deps
cp .trellis/tasks/10-18-interaction-chat/prototype/v2/dependencies/package.json .trellis/tasks/10-18-interaction-chat/prototype/v2/dependencies/package-lock.json /tmp/mimir-chat-official-v2/official-deps/
npm ci --prefix /tmp/mimir-chat-official-v2/official-deps --cache /tmp/mimir-chat-official-v2/npmjs-cache --registry https://registry.npmjs.org --ignore-scripts --no-audit --no-fund
python3 .trellis/tasks/10-18-interaction-chat/prototype/v2/generate-manifest.py
node .trellis/tasks/10-18-interaction-chat/prototype/v2/build.mjs
packages/renderer/node_modules/.bin/tsc -p .trellis/tasks/10-18-interaction-chat/prototype/v2/tsconfig.json
node_modules/.bin/oxlint .trellis/tasks/10-18-interaction-chat/prototype/v2/main.tsx .trellis/tasks/10-18-interaction-chat/prototype/v2/official-message.tsx .trellis/tasks/10-18-interaction-chat/prototype/v2/build.mjs .trellis/tasks/10-18-interaction-chat/prototype/v2/check-artifact.mjs
node .trellis/tasks/10-18-interaction-chat/prototype/v2/check-artifact.mjs
```

First copy `dependencies/package.json` and `dependencies/package-lock.json` into the isolated directory before `npm ci`. `build.mjs` creates a prototype-only ignored `node_modules` symlink for stylesheet resolution, compiles/scopes official CSS, and embeds the result in one standalone HTML. `MIMIR_CHAT_PROTOTYPE_DEPS` may override the build dependency directory; if used, update prototype TypeScript paths to the same directory. Vite aliases and deduplication use the project's single React / ReactDOM instances.

The CLI uses the available Node binary. An npm engine warning for a transitive nanoid release does not establish support on that Node version; artifact build/type-check/runtime are independently verified. For recreation prefer Node 24 LTS.

## Review routes

- `CHAT-016.waiting`, `.live`, `.manual`, `.done`, `.search`, `.scroll`, `.absent`: trace removed in proposed; current preserved.
- `CHAT-008.creating` and `CHAT-016.waiting`: official SDK's waiting indicator before answer parts. Use the prototype controls to begin text, finish or fail.
- `CHAT-017.live`, `.toggle`, `.long`, `.empty`: official reasoning streaming/manual/scroll/absence.
- `CHAT-020.running`, `.complete`, `.failed`, `.collapsed`, `.expanded`, `.long`: official tools, matching search fixtures and long raw data. A normal tool-call has no document-edit bridge notice.
- All other routes retain v1's business and recovery contracts, including Agent bridge, queue, snapshots, history, guards, citations and save/copy boundaries.

API settlement, actual model output, Agent execution, clipboard, file selection, native media, PNG capture, Office writes and Electron are simulated or boundary-only. Main chat is read-only; no new tool approval/denial capabilities are implied. The prototype does not request or persist business data.

Parent review owns final GUI evidence and approval/freeze. Build hashes in `checks.json` identify the reviewed artifact but are not an approval record.
