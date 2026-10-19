# Chat review v6 · TanStack AI React + Mimir components

This is a **planning HTML candidate**, not product implementation. It replaces the proposed column and adds a separate interaction detail page. Product files, manifests/lockfiles and v1–v5 are untouched. Approval of this exact candidate is still required before implementation.

- `/v6/review.html?mode=proposed#scene=CHAT-005.user` — Mimir white/gray workspace, green actions, system Chinese fonts, 6px chat controls, 1px chat-field focus borders without halo. The review shell retains its own inspection controls and visible keyboard outlines. The current/source column is retained.
- `/v6/interactions.html` — a searchable independent directory of126 protocol / message / business / component entries; deep links use `#AGUI-TEXT-002`, `#OFF-019`, etc. Component samples use the same custom components as the comparison; host actions link to their original routes.
- `thread.review.html` — standalone iframe document used by the host. It executes real `@tanstack/ai-react useChat` and an in-memory AG-UI ConnectionAdapter. It does not execute assistant-ui or copy its component code/styles.

The existing71 source groups /379 source states plus24 attachment states remain403 stable comparison routes.126 is the catalog count, **not** a count of passing browser tests. Schema/reducer, isolated runtime probes, source mapping and browser verification are separate evidence categories. Examples outside existing Mimir capabilities (activity, approval, audio/video input, subagents, generic UI) are clearly local protocol/component demonstrations; they do not enable product capabilities. `mimir.trace` has no production replacement. Debug events are confined to the interaction detail page.

## Behavior and boundaries

The frozen v4 source is the behavioral reference: Composer keyboard/IME behavior, send/stop, native picker/drop/paste, attachment preparation and removal, reasoning automatic/manual disclosure, tool grouping/args/results, code/message copy, Markdown export, media zoom/player controls, and capability-gated actions. The visible style is Mimir's existing design world. The new detail page exposes source contracts and allows direct operation. Some source capabilities such as feedback, branches and load earlier are enabled only in dedicated local component sandboxes; ordinary review scenes do not invent a backend capability.

Models are selectable and grouped by configured provider instance. Provider ID + model ID are the identity, including duplicate display names. Reasoning options are derived only from the selected model's declared capability. A switch preserves a compatible effort; otherwise it selects the declared default. Unsupported and unknown capabilities expose no invented choices. Every provider, model name and capability in this prototype is explicitly synthetic; no commercial model support is claimed. Document assistants use the same menu and require future Agent/vision validation. Scope remains independent.

`captureSendIntent` takes one deep copy of scope/strength, screenshot/attachment identity and contents, and explicit fixture-only target/version/round/guard context before any async preparation. Mimir's host retains FIFO ownership; TanStack is not allowed to queue the same turn again. Preparation cancellation preserves the draft; stream cancellation calls `chat.stop` and host cancellation separately. Dispatch revalidates current guards without changing the frozen target. The source-level runtime probe exercises shared snapshot helpers, the actual attachment adapter and actual ChatClient; it is not a full host/Agent E2E test.

The standard attachment proposal remains local-only: four files /20MiB per message, documents10MiB/images5MiB,4096 edge/16MP, supported-format gates, and scoped model/search-only/Agent constraints. No file is uploaded, parsed by a service or imported into a knowledge base. Failure recovery uses remove/reselect; canonical IDs, auth, extraction, TTL, retention and model vision enforcement need real implementation and tests.

`InterruptLab` uses real `useChat` interrupt/resume APIs. Local cached reply retry reuses the answer after a false result; no document tool executes. Product migration must filter wire `parentRunId` while preserving client internal resume association, preserve full AGUI metadata/parts and declared client tools, and retain existing Agent version/round/permission guards. Default TanStack fetchSSE is not asserted to be directly compatible with Mimir's current routes.

Legacy THINKING events need an explicitly labelled normalizer/inspector; they are not claimed as native TanStack handling. Pure protocol data has no independent production UI. The details page shows state/reasoning/activity diagnostics without inventing process cards in normal chat. Unsupported/invalid inputs preserve previous state and surface diagnostics rather than passing silently.

## Rebuild

Repository dependencies must already be installed. Isolated exact dependencies remain outside the repository:

```sh
mkdir -p /tmp/mimir-chat-tanstack-v5/deps
cp dependencies/package.json dependencies/package-lock.json /tmp/mimir-chat-tanstack-v5/deps/
npm ci --prefix /tmp/mimir-chat-tanstack-v5/deps --cache /tmp/mimir-chat-tanstack-v5/cache --ignore-scripts --no-audit --no-fund --legacy-peer-deps
```

From repository root:

```sh
node .trellis/tasks/10-18-interaction-chat/prototype/v6/build.mjs
packages/renderer/node_modules/.bin/tsc -p .trellis/tasks/10-18-interaction-chat/prototype/v6/tsconfig.json
python3 .trellis/tasks/10-18-interaction-chat/prototype/v6/generate-manifest.py
node .trellis/tasks/10-18-interaction-chat/prototype/v6/check-artifact.mjs
node .trellis/tasks/10-18-interaction-chat/prototype/v6/runtime-probe.mjs
node .trellis/tasks/10-18-interaction-chat/prototype/v6/protocol-probe.mjs
```

`MIMIR_CHAT_V5_DEPS` changes the builder/probe isolated root. The checked-in tsconfig uses the default fixed `/tmp` root; the builder creates an ignored `node_modules` symlink. Vite emits three standalone documents; build intermediates are ignored. Source formatting uses `format.json`; never format generated HTML. No product package dependency changes are needed to inspect the candidate.

Exact runtime: ai-react0.30.3 / ai-client0.39.2 / ai0.68.0, AGUI core1.0.0 transitive, one existing project React19.3 per document. `runtime-resolution.json` records the executing graph; the builder rejects assistant-ui/vendor imports. `provenance.json`, `dependencies/package-lock.json` and `licenses/` record sources and licenses. Existing Phosphor fixture icons include their license. Local audio/video fixture bytes come from existing Office test fixtures; they are not user uploads.

## Local QA limits

Browser native IME, picker/clipboard, browser200% zoom, OS reduced-motion, screen readers, Electron and real service/Office interactions still require implementation validation. Review width/font controls are layout simulations. The candidate must not be labelled complete solely because routes exist or JSON samples validate; report any observed difference against the source parity table before implementation.
