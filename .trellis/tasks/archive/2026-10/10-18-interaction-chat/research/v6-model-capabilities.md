# Research: v6 provider-grouped models and actual reasoning capabilities

- Query: How can Mimir expose selectable models grouped by configured provider and show only the selected model's actual supported reasoning levels, replacing chat/reasoning role switching?
- Scope: mixed; read-only product architecture and immutable WeKnora public reference; planning prototype only.
- Date: 2026-10-19

## Findings

### Product facts and files found

| File and evidence | Current behavior and implication |
| --- | --- |
| `packages/shared/src/config.ts:257–265` | `ProviderModel` has `id`, `source`, `purposes`; it has no reasoning level metadata, default, parameter mapping or discovery status. `purposes=['chat']` says usable for chat, not adjustable reasoning. |
| `packages/shared/src/config.ts:274–283` | Fetched models contain only ID and nullable purpose. OpenAI-compatible model enumeration is not reasoning capability discovery. |
| `packages/shared/src/config.ts:314–328` | Configured provider instances expose stable `id`, editable `name`, adapter `family`, base URL, `hasKey`, and models. Names can repeat; identity is the ID. Browser must not receive secrets. |
| `packages/shared/src/config.ts:360–365` | Existing role binding already uses provider ID plus model name, correctly avoiding collisions between identical model names on different connections. |
| `packages/shared/src/config.ts:380–386` | Runtime config contains the configured provider list, role statuses and presets; no new fabricated provider directory is necessary. |
| `packages/renderer/src/lib/use-chat-composer-status.ts:35–67` | Host currently reduces runtime config to two role model names; provider groups and capabilities do not reach chat. This host data slot must expand for product implementation. |
| `packages/chat/src/composer/ComposerMenus.tsx:166–184` | Strength is a boolean; labels standard/deep select different roles, not different effort of one model. |
| `packages/chat/src/composer/ComposerMenus.tsx:202–267` | Model menu is readonly chat/reasoning bindings; checkmark and trigger depend on `deepReasoning`. Simply changing row labels would falsely imply selection. |
| `apps/server/src/services/assistant-stream.ts:78–83,117–151,330–333` | AG-UI forwardedProps parser recognizes `deepReasoning`; stream then chooses reasoning/chat role. It does not parse provider ID, model ID or effort. |
| `apps/server/src/services/assistant.ts:90` | Nonstream ask path similarly chooses role from boolean; parity must be accounted for if still supported during migration. |
| `packages/shared/src/seams.ts:216–219,247–253` | Model adapter and provider seams resolve only a role. Arbitrary per-run selected provider/model is not currently a supported seam. |
| `plugins/provider/src/provider.ts:127–139,150–171,265–291` | Provider resolves configured instance and decrypts credentials privately; `adapter(role)` resolves binding then constructs SDK adapter. Per-run resolution belongs here, not in server or browser. |
| `plugins/provider/src/provider.ts:59–67,455–467` | Chat factory uses TanStack's OpenAI-compatible adapter; model enumeration strips data down to ID and purpose. No effort mapping exists here. |
| `apps/server/src/services/model.ts:40–60,177–184,216–229,282–299` | Call options require role; generic modelOptions can be forwarded but cannot establish valid capability or select provider. Both adapters and usage attribution need intentional extension. |
| `plugins/provider/package.json:dependencies` | Product uses `@tanstack/ai` 0.68.0 and `@tanstack/ai-openai` 0.22.8. Do not assume SDK acceptance proves the remote endpoint supports an option. |

### Required identity and grouping

Use only saved configured provider instances for groups. Heading is the instance display name (e.g. DeepSeek account A, DeepSeek account B), not a guessed brand from model text or a task role. Select by `{ providerId, modelId }`; duplicate model IDs under distinct providers remain independently selectable. Stable option key must preserve the tuple (structured encoding, not ambiguous delimiter concatenation). Only chat-purpose candidates appear; embed/rerank are not chat candidates. Missing credentials or removed models need explicit availability handling rather than silently selecting another provider. Global role bindings can seed an initial model but changing this menu must not mutate those bindings.

### Reasoning contract recommended for review

The user explicitly requires actual model support; no universal guessed low/medium/high ladder and no standard/deep-to-role routing.

Recommended conceptual capability data, to become a shared validated contract during approved implementation:

- Distinguish `unknown` (no authoritative metadata), `loading`, `error`, and known capability. Known unsupported reasoning is a separate state from unknown.
- Known capability contains an exact finite set of supported effort values, a source/provenance/version, and a documented default behavior. Internal values can be normalized to a bounded vocabulary only when provider-specific semantics genuinely match; labels are presentation. Do not turn arbitrary unsupported vendor strings into supported choices.
- A known default can be explicit (`medium`, for example) or provider-default omission. The latter is not `auto` unless `auto` is an actual supported vendor value. UI may offer “模型默认” as an inheritance action; it must omit the request parameter and remain visibly distinct from enumerated vendor effort values.
- Toggle-only models show only actual supported toggles. Always-on/fixed reasoning has no invented off choice. A model with a single real fixed level is display-only rather than implying multiple intensities. Known no configurable reasoning shows “此模型不支持推理设置”; unknown shows “推理能力未确认”. Neither sends fabricated effort.
- Capability loading/errors should have distinct status and retry where appropriate; do not represent failed discovery as unsupported. In planned product, plain chat may still run with omitted effort if provider supports chat; inability to configure effort alone does not justify disabling plain chat.
- Model switch preserves the current explicit effort only if new model's known supported values include it. Otherwise synchronously clear to that model's documented default/inherit state, clear stale wire option, and show brief accurate feedback. Never silently reuse high/xhigh on an incompatible model. Loading into a model with unknown metadata cannot retain an explicit outgoing effort.
- Switching provider/model never changes retrieval scope; switching effort never changes selected provider/model. All controls work before sending, and a row click never submits the form.

Capability provenance priority should be explicit: validated endpoint metadata if available; a versioned provider+model+API catalog with matching adapter support; an explicit verified per-model configuration override. A bare `/models` ID or name containing “reasoner” is insufficient. No automatic real vendor calls merely on opening a menu. Any real capability probe is explicit and must distinguish successful generation from proving a finite complete set of supported values.

### Future run and queue contract

Capture synchronously at send time before any attachment preparation awaits: `{ providerId, modelId, reasoningEffort? }`, capability provenance/version if needed for diagnosis, retrieval scope and original attachment/context values. Queue entries own this immutable selection; changing composer from model A to B during preparation or streaming cannot alter an already captured A request. Queue restoration restores the captured model and effort only after current availability validation, and must not overwrite a newer nonempty draft.

AG-UI `forwardedProps` can carry this application configuration but AG-UI does not prescribe a model menu or reasoning option component. Server must validate configured provider and model membership, chat purpose, supported effort and adapter mapping; resolve credentials through provider seam. Reject invalid/removed/unsupported explicit selection with actionable feedback; do not silently select a globally bound model. Internal source/usage role attribution must not masquerade as selecting a different provider. Resume/retry must reuse the original resolved run choice consistently and preserve existing Agent guardrails. Legacy deepReasoning is migration compatibility only and must not override explicit new model/effort selection.

Product work crosses shared contract → provider capability/adapter resolution → model service and assistant routes → host config data → chat composer/runtime. Updating HTML controls alone does not implement this functionality. v6 prototype can use clearly labeled synthetic capabilities and actual local state transitions; it must not assert real provider support from invented fixture names.

### WeKnora reference checked

Existing same-day site check is reused: `research/vendor-full-thread/weknora-reference-recheck.json` records website `https://weknora.weixin.qq.com/` HTTP 200, advertised version **0.8.3**, and public source commit **2c0d8384398ca756ee414eef01b71caf91e2caa6**. This research additionally fetched the following exact immutable source files through GitHub Contents API at that commit (2026-10-19):

- [frontend/src/api/model/index.ts](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/api/model/index.ts#L9): lines 9–32 define protocol-neutral reasoning levels and `ModelCapabilities` with `cataloged`, `reasoning`, `thinking_levels`, `thinking_format`; empty thinking levels mean it cannot be asked to think. Lines 85–90 say backend derives capabilities from provider+name+overrides; lines 235–237 place effort above legacy boolean.
- [frontend/src/components/Input-field.vue](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/components/Input-field.vue#L1144): lines 1144–1164 compute levels from selected model capabilities, distinguish inherited display from explicit override, and synchronously clear unsupported override on model change. Lines 3020–3037 implement selected radio-menu choices from that derived list.
- [frontend/src/utils/reasoningEffort.ts](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/utils/reasoningEffort.ts#L38): lines 38–42 canonicalize known values and deduplicate; lines 80–82 return exact metadata levels; lines 87–91 explain always-on models must not offer off; lines 110–114 detect absence of off.
- [internal/models/api/options.go](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/internal/models/api/options.go#L10): lines 10–23 sanitize invalid values; lines 52–59 distinguish legacy bool from graded effort and parameter omission; lines 92–108 preserve no-preference default semantics.
- [frontend/src/components/ModelSelector.vue](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/components/ModelSelector.vue#L24): lines 24–44 render flat model IDs, and lines 107–109 separate display name from underlying name. It does **not** establish the provider-grouped menu requested here; use user's reference for grouping and existing Mimir provider identity for data.

Applicability: reuse capability-driven menu population, no off for always-on models, explicit-vs-inherited effort, and reset on model change. **Do not copy** `reasoningEffort.ts:26–27,93–103`'s generic fallback ladder for missing metadata: it would promise unverified levels and contradict this user's exact-capability requirement. Its `clampLevel:117–124` can select first/auto/off for unsupported values; Mimir should reset visibly to documented model default/inheritance, not imply an unverified “first level” default. WeKnora is knowledge-base/Agent behavior evidence; Mimir's established theme remains visual authority.

### Related specs

- `.trellis/spec/plugin-provider/backend/index.md`: adapter construction remains provider-only, configured instances are data.
- `.trellis/spec/shared/contract/index.md`: shared schemas/seams are sole cross-layer contract.
- `.trellis/spec/project/rules.md:5`: model calls go through TanStack, provider constructs adapters.
- `.trellis/spec/project/architecture.md:710–752` (§5.7): connection/model identity already sound; chat/reasoning role routing needs a planned explicit run override extension. Existing role defaults for background tasks need not be deleted.
- `.trellis/spec/chat/frontend/conventions.md`: current readonly global-role model menu and boolean standard/deep policy are historical product behavior; latest user request supersedes them for the proposed revision. Change current specs only alongside approved product implementation, while recording planned override in task design now.

## Caveats / Not Found

- No actual model capability metadata or selected per-run provider/model API exists in the inspected product. This is a genuine cross-layer migration, not only a style revision.
- No real vendor credentials or model capability probes were run. Exact effort values for any displayed real model have not been verified by this research; prototype synthetic values must be labeled as such.
- No assumption that a global fixed vocabulary directly maps across all OpenAI-compatible gateways. Per-provider API mapping and serialization must be verified in approved implementation.
- Product code, current specifications, task manifests and frozen v1–v5 artifacts were not edited by this researcher. Only this research file is owned.
