import type { PluginHost, SettingSpec } from '@mimir/shared'
import { createOpenAiCompatibleProvider } from './provider.js'

/**
 * 模型提供方插件。
 *
 * 目前只有一个实现（OpenAI 兼容），但它值得是一条**接缝**而不是一段代码：
 * Ollama 的原生 API 与 OpenAI 兼容层在**流式形状**上不同
 * （NDJSON vs SSE），要正确支持得写第二个适配器。留出接缝，
 * 那天到了就是「加一个文件」而不是「改问答链路」。
 *
 * ## 角色是固定的，模型是可配的
 *
 * 五个角色（chat / reasoning / summarize / embed，以及未实现的 rerank）
 * 是**产品结构**：它对应「哪些任务值得用不同的模型」这个成本问题。
 * 每个角色对应一个模型名键，所以「摘要换一个便宜模型」不需要改代码。
 *
 * 不做「多套命名的 provider 配置」（WeKnora 的卡片列表 + 各消费者各自绑定）：
 * 那需要一层间接（先建卡片再去别处选），而本项目的角色是固定的几个，
 * 每个角色一行就地改更直接（`docs/DECISIONS.md` D-029 的否决栏）。
 */

/** 模型键都属于这条接缝：它们描述的是「用哪个模型」，与具体实现无关 */
const MODEL_PARAMS: SettingSpec[] = [
  {
    key: 'model.baseUrl',
    label: '接口地址',
    description:
      'OpenAI 兼容端点。DeepSeek / 通义 / 智谱 / Kimi 都提供兼容端点，所以换服务商只需要改这一行',
    group: 'models',
    type: 'string',
    envName: 'MODEL_BASE_URL',
    defaultValue: 'https://api.deepseek.com/v1',
    rebuild: 'none',
    validate: (value) => {
      const text = String(value).trim()
      if (!/^https?:\/\//i.test(text)) return '必须以 http:// 或 https:// 开头'
      return null
    },
  },
  {
    key: 'model.apiKey',
    label: 'API 密钥',
    description: '加密后存库，绝不下发浏览器。留空的含义是「没配模型」，问答走只检索路径',
    group: 'models',
    type: 'secret',
    envName: 'MODEL_API_KEY',
    defaultValue: '',
    rebuild: 'none',
  },
  {
    key: 'model.chat.model',
    label: '对话模型',
    description: '回答提问用的模型。这是唯一必填的角色',
    group: 'models',
    type: 'string',
    envName: 'MODEL_CHAT_MODEL',
    defaultValue: 'deepseek-chat',
    rebuild: 'none',
    validate: (value) => (String(value).trim() === '' ? '不能为空' : null),
  },
  {
    key: 'model.reasoning.model',
    label: '深度思考模型',
    description:
      '提问时打开「深度思考」会切到它。与对话模型是同一家的不同模型名，不需要第二个适配器',
    group: 'models',
    type: 'string',
    envName: 'MODEL_REASONING_MODEL',
    defaultValue: 'deepseek-reasoner',
    rebuild: 'none',
  },
  {
    key: 'model.summarize.model',
    label: '摘要模型',
    description: '自动摘要是量大要求低的任务，值得配一个便宜模型。留空时回落到对话模型',
    group: 'models',
    type: 'string',
    envName: 'MODEL_SUMMARIZE_MODEL',
    defaultValue: '',
    rebuild: 'none',
  },
  {
    key: 'model.embed.model',
    label: '向量化模型',
    description: '配了它才会有向量通道（语义检索）。1024 维最省事——超过 2000 维必须走 halfvec',
    group: 'models',
    type: 'string',
    envName: 'MODEL_EMBED_MODEL',
    defaultValue: '',
    rebuild: 'embeddings',
  },
  {
    key: 'model.embed.dimensions',
    label: '向量维度',
    description: '必须与模型实际的输出维度一致，否则写入时报错。可以用「测试连接」核对',
    group: 'models',
    type: 'number',
    envName: 'MODEL_EMBED_DIMENSIONS',
    defaultValue: 1024,
    rebuild: 'embeddings',
    validate: (value) => {
      const n = Number(value)
      if (!Number.isFinite(n)) return '必须是数字'
      if (n < 64 || n > 4000) return '必须在 64 到 4000 之间（超过 2000 需要 halfvec）'
      return null
    },
  },
]

export function install(host: PluginHost): void {
  host.provider(
    {
      seam: 'provider',
      id: 'openai-compatible',
      name: 'OpenAI 兼容端点',
      description:
        '一套适配器接住 DeepSeek / 通义 / 智谱 / Kimi。chat 走 openaiCompatible，summarize 与 embed 走各自的工厂',
      file: 'plugins/provider/src/provider.ts',
      configKeys: [
        'model.baseUrl',
        'model.apiKey',
        'model.chat.model',
        'model.reasoning.model',
        'model.summarize.model',
        'model.embed.model',
        'model.embed.dimensions',
      ],
      params: MODEL_PARAMS,
      // 没有 key 就没有任何角色可用。这一条让设置页直接显示「需要先配置 model.apiKey」，
      // 而不是让用户去点「测试连接」才发现
      requires: ['model.apiKey'],
    },
    createOpenAiCompatibleProvider(host.settings),
  )
}
