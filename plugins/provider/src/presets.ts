import type { ProviderPreset } from '@mimir/shared'

/**
 * 预设供应商目录。
 *
 * ## 这是**数据**，不是代码
 *
 * 每一行只说四件事：用哪个适配器族、baseURL 是什么、建议哪些模型、
 * 能不能拉列表。所以**加一家服务商不需要写代码**——只要它说 OpenAI 兼容
 * 协议，`openai-compatible` 那个族就能接住它。
 *
 * 对照：`.trellis/spec/project/research.md` 记的四个成熟产品都有这份目录
 * （最大的列了约 90 家）。没有目录的产品（某个用 7 条 URL 做浏览器
 * 自动补全的）用户得自己记 baseURL，而那是最容易填错的一栏。
 *
 * ## 为什么每家带「建议模型」
 *
 * 拉取模型列表需要网络且要花一次请求。用户刚填完密钥时**可能连不上**
 * （比如在容器里、或端点被墙），那时预设列表让他仍然能建起一个能用的配置。
 * 拉取成功后再用真实列表覆盖它（`source: 'preset' → 'fetched'`）。
 *
 * ## 为什么每家的模型只有两三个
 *
 * 它的作用是「抛砖引玉」，不是穷举。穷举会过期（模型上下架很频繁），
 * 而过期的清单比没有清单更糟——用户会以为自己看到的全部选项。
 */
export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    family: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    canFetchModels: true,
    note: '对话便宜且质量稳。它没有 embedding 模型，向量化要另配一家',
    popular: true,
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    family: 'openai-compatible',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['Qwen/Qwen3-8B', 'BAAI/bge-m3'],
    canFetchModels: true,
    note: '聚合了多家开源模型，embedding 与 rerank 都有。模型名带斜杠，是它的命名方式',
    popular: true,
  },
  {
    id: 'dashscope',
    name: '通义千问',
    family: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-turbo', 'text-embedding-v4'],
    canFetchModels: true,
    note: '阿里云。它要求用「兼容模式」的路径，直连 dashscope.aliyuncs.com 是不通的',
    popular: true,
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    family: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-plus', 'glm-4-flash', 'embedding-3'],
    canFetchModels: true,
    note: 'glm-4-flash 有免费额度，适合放在摘要这种量大的角色上',
    popular: true,
  },
  {
    id: 'moonshot',
    name: '月之暗面 Kimi',
    family: 'openai-compatible',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k'],
    canFetchModels: true,
    note: '长上下文见长。它没有 embedding 模型',
    popular: false,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    family: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'text-embedding-3-small'],
    canFetchModels: true,
    note: '需要能直连。embedding 维度记得与「向量维度」对上',
    popular: false,
  },
  {
    id: 'ollama',
    name: 'Ollama（本地）',
    family: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    models: [],
    canFetchModels: true,
    note: '本机运行，不花钱。Ollama 的密钥随便填一个非空值即可，它不校验。容器里跑要改成宿主机地址',
    popular: true,
  },
  {
    id: 'lmstudio',
    name: 'LM Studio（本地）',
    family: 'openai-compatible',
    baseUrl: 'http://localhost:1234/v1',
    models: [],
    canFetchModels: true,
    note: '本机运行，不花钱。要在界面里先把模型加载进内存，端点才有模型可列',
    popular: false,
  },
  {
    id: 'custom',
    name: '自定义（OpenAI 兼容）',
    family: 'openai-compatible',
    baseUrl: '',
    models: [],
    canFetchModels: true,
    note: '任何提供 OpenAI 兼容端点的服务都行。填它的 baseURL（通常以 /v1 结尾）',
    popular: true,
  },
]

/** 按 id 找预设 */
export function findPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((preset) => preset.id === id)
}

/**
 * 从 baseURL 猜预设。
 *
 * 用途是**迁移**：老配置（M1-A 的单供应商形状）只有一个 baseURL 与一把密钥，
 * 转成供应商实例时要给 `preset` 一个值。猜不到就用 `custom`——
 * 猜错的代价只是界面上的名字不准，用户能改。
 */
export function inferPresetId(baseUrl: string): string {
  const normalized = baseUrl.toLowerCase()
  const hit = PROVIDER_PRESETS.find(
    (preset) => preset.baseUrl !== '' && normalized.startsWith(preset.baseUrl.toLowerCase()),
  )
  return hit?.id ?? 'custom'
}
