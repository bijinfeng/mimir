/**
 * `@mimir/core` —— 插件宿主。
 *
 * ## 核心只做四件事
 *
 *   1. **注册表**：收下插件（声明 + 实现），提供遍历与查找（`registry.ts`）
 *   2. **配置**：键表 + 三层解析（覆盖行 > 环境变量 > 默认）（`settings/`）
 *   3. **状态**：从声明算出每个实现能不能干活（`registry.ts` 的 `computeStatus`）
 *   4. **编排接缝**：把各接缝的实现串成流水线（`pipeline.ts`）
 *
 * 它**不认识任何具体实现**：不知道有「关键词通道」还是「向量通道」，
 * 不知道有 DeepSeek 还是 Ollama。加一个实现永远不需要改这个包。
 *
 * ## 依赖方向
 *
 * ```
 *   插件实现 ──→ @mimir/shared（契约）
 *      │              ↑
 *      └──→ 宿主装配 ─┘
 *              │
 *              └──→ @mimir/core
 * ```
 *
 * 插件**不 import core**，core 也**不 import 任何插件**——
 * 装配发生在 `apps/server`，那里同时知道两边。这是「核心精简」
 * 与「插件不碰宿主内部」两条要求能同时成立的原因。
 */

export {
  createRegistry,
  createSeamHost,
  computeStatus,
  type Registry,
  type RegisteredPlugin,
  type SeamHost,
} from './registry.js'

export {
  createSettingsApi,
  resolveSetting,
  isProvided,
  type ResolvedSetting,
  type SettingsApi,
  type SettingsHost,
  type SettingsStore,
} from './settings/store.js'

export {
  CORE_SETTING_SPECS,
  SettingRegistry,
  createSettingRegistry,
  range,
  type SettingSpec,
} from './settings/specs.js'

export { createSecretCipher, type SecretCipher } from './settings/crypto.js'

export {
  fuse,
  foldScore,
  DEFAULT_RRF_K,
  type FusionChannel,
  type FusedItem,
  type RankedItem,
} from './fuse.js'

export {
  channelsForMode,
  createPipeline,
  defaultMode,
  KEY_PER_LEG_LIMIT,
  KEY_RRF_K,
  type Pipeline,
  type PipelineDeps,
  type SearchHitResult,
  type SearchOutcome,
  type SearchRequest,
  type SnippetPort,
  type SnippetRow,
} from './pipeline.js'
