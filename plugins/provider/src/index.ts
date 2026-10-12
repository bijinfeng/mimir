import type { PluginHost, SettingSpec } from '@mimir/shared'
import { coerceExisting, fromWire, toWire } from './instances.js'
import { PROVIDER_PRESETS } from './presets.js'
import { createOpenAiCompatibleProvider } from './provider.js'

/**
 * 模型提供方插件。
 *
 * ## 一条接缝 = 一个「适配器族」，不是一家服务商
 *
 * 这个实现管的是 **OpenAI 兼容这套协议**：怎么调 chat、怎么拉 `/models`、
 * 错误怎么翻译成人话。**具体是哪一家是数据**（`presets.ts` 的目录），
 * 所以加一家服务商是加一行数据，不是加代码。
 *
 * 什么时候才需要第二个实现：当某家的协议与 OpenAI 兼容层**实质不同**时。
 * 已知的两处（`.trellis/spec/project/architecture.md` §5.2 提过）：Ollama 的原生 API 在流式形状上
 * 不同（NDJSON vs SSE），rerank 的路径各家不一（`/v1/rerank` vs `/v2/rerank`）。
 * 那时加一个文件即可，宿主与设置页都不用改。
 *
 * ## 模型域只有一个配置键
 *
 * `model.config` 装下：供应商列表 + 角色绑定 + 迁移标记。
 *
 * 为什么不是一堆 `model.provider.<id>.baseUrl` 这样的标量键：
 * 供应商是**集合**，标量键表达不了集合。摊平的后果有实例为证——
 * 某个成熟产品用「按位置对齐的三个数组」存多家供应商，删除时要手工重排下标
 * （`.trellis/spec/project/research.md`）。
 *
 * 形状与密钥处理都在 `instances.ts`，这个文件只负责把它声明出来。
 */

const CONFIG_KEY = 'model.config'

/** 供应商列表 + 角色绑定。密钥的摘除与合并由 `toWire` / `fromWire` 负责 */
const MODEL_CONFIG_PARAM: SettingSpec = {
  key: CONFIG_KEY,
  label: '模型配置',
  description: '供应商列表与各角色绑定的模型',
  group: 'models',
  type: 'json',
  envName: null,
  // 空配置：没有供应商、没有绑定。界面据此渲染「还没有配置供应商」
  defaultValue: { providers: [], roles: {} },
  rebuild: 'none',
  json: {
    /**
     * 下发时摘掉每家的密钥。
     *
     * **这是密钥不外泄的执行点。** 漏掉它的症状是密钥随 `/api/config`
     * 一起发到浏览器，而界面上看不出任何异常。
     */
    toWire: (internal) => toWire(coerceExisting(internal)),
    /**
     * 写入时把已存的密钥合回来。
     *
     * 界面拿不到密钥，所以它提交的每个供应商都不带 `apiKey`。
     * 直接覆盖的话，用户改一下供应商的名字就会把密钥清掉——
     * 而界面上完全看不出发生了什么。
     */
    fromWire: (incoming, existing) => {
      if (!currentCipher) {
        // 只可能发生在「install() 还没跑」时——说明装配顺序错了，
        // 而不是用户做了什么。直接报错比静默丢掉密钥好
        throw new Error('模型配置插件尚未装配，无法写入（这是代码错误）')
      }
      return fromWire(incoming, existing, currentCipher).config
    },
  },
}

/** 向量维度：与 embedding 模型绑定，所以归模型域而不是检索域 */
const DIMENSIONS_PARAM: SettingSpec = {
  key: 'model.embed.dimensions',
  label: '向量维度',
  description:
    '必须与 embedding 模型实际的输出维度一致。可以用「测试连接」核对——不一致时它会告诉你实际维度',
  group: 'models',
  type: 'number',
  envName: 'MODEL_EMBED_DIMENSIONS',
  defaultValue: 1024,
  rebuild: 'embeddings',
  validate: (value) => {
    if (value === null || typeof value === 'object' || typeof value === 'boolean') {
      return '必须是数字'
    }
    const n = Number(value)
    if (!Number.isFinite(n)) return '必须是数字'
    if (n < 64 || n > 4000) return '必须在 64 到 4000 之间（超过 2000 需要 halfvec）'
    return null
  },
}

/** Separate subscription for the DOCX agent's web and image search. */
const BRAVE_SEARCH_PARAM: SettingSpec = {
  key: 'docx.brave.apiKey',
  label: 'Brave Search API 密钥',
  description: '供 DOCX 对话编辑中的网页与图片搜索使用',
  group: 'models',
  type: 'secret',
  envName: null,
  defaultValue: '',
  rebuild: 'none',
}

const DOCX_IMAGE_PARAMS: SettingSpec[] = [
  {
    key: 'docx.image.apiKey',
    label: 'DOCX 图片生成 API 密钥',
    description: '供 DOCX 对话编辑生成图片使用',
    group: 'models',
    type: 'secret',
    envName: null,
    defaultValue: '',
    rebuild: 'none',
  },
  {
    key: 'docx.image.baseUrl',
    label: 'DOCX 图片生成接口地址',
    description: 'OpenAI Images API 兼容地址',
    group: 'models',
    type: 'string',
    envName: null,
    defaultValue: 'https://api.openai.com/v1',
    rebuild: 'none',
  },
  {
    key: 'docx.image.model',
    label: 'DOCX 图片生成模型',
    description: 'OpenAI 图片模型，例如 gpt-image-1',
    group: 'models',
    type: 'string',
    envName: null,
    defaultValue: 'gpt-image-1',
    rebuild: 'none',
  },
]

const DOCX_MEDIA_PARAMS: SettingSpec[] = [
  {
    key: 'docx.media.visionEnabled',
    label: 'DOCX 图片与视频分析',
    description: '确认当前聊天模型支持图片输入后启用；视频由浏览器抽帧',
    group: 'models',
    type: 'boolean',
    envName: null,
    defaultValue: false,
    rebuild: 'none',
  },
  {
    key: 'docx.media.apiKey',
    label: 'DOCX 音频转录 API 密钥',
    description: 'OpenAI 音频转录服务密钥',
    group: 'models',
    type: 'secret',
    envName: null,
    defaultValue: '',
    rebuild: 'none',
  },
  {
    key: 'docx.media.baseUrl',
    label: 'DOCX 音频转录接口地址',
    description: 'OpenAI Audio Transcriptions API 兼容地址',
    group: 'models',
    type: 'string',
    envName: null,
    defaultValue: 'https://api.openai.com/v1',
    rebuild: 'none',
  },
  {
    key: 'docx.media.transcriptionModel',
    label: 'DOCX 音频转录模型',
    description: '例如 whisper-1 或 gpt-4o-mini-transcribe',
    group: 'models',
    type: 'string',
    envName: null,
    defaultValue: 'whisper-1',
    rebuild: 'none',
  },
]

/**
 * **历史键**：M1-A 的单供应商形状留下的七个标量键。
 *
 * 它们仍然注册着，只为一件事：**迁移要读它们**。标成 `hidden` 之后
 * 不出现在设置页（用户不该再看到「接口地址」这种全局字段），
 * 但 `getString` / `getSecret` 仍能取到值。
 *
 * ## 为什么不用「读不到就跳过」
 *
 * 未注册的键在读取路径上会**抛错**（`store.ts` 的 `specOrThrow`）——
 * 那是刻意的：一个拼错的键名不该静默变成「值永远是默认」。
 * 所以迁移要读的键必须注册，哪怕它们只是历史残留。
 *
 * ## 什么时候能删
 *
 * 等确认所有部署都升过一次之后。但那时也没有收益——
 * 七个 hidden 键的成本是几十行声明，而删早了会让老部署升级时
 * 丢掉密钥。
 */
const LEGACY_PARAMS: SettingSpec[] = [
  {
    key: 'model.baseUrl',
    label: '接口地址（旧）',
    description: '历史配置',
    group: 'models',
    type: 'string',
    envName: 'MODEL_BASE_URL',
    defaultValue: '',
    rebuild: 'none',
    hidden: true,
  },
  {
    key: 'model.apiKey',
    label: 'API 密钥（旧）',
    description: '历史配置',
    group: 'models',
    type: 'secret',
    envName: 'MODEL_API_KEY',
    defaultValue: '',
    rebuild: 'none',
    hidden: true,
  },
  {
    key: 'model.providerName',
    label: '服务商标识（旧）',
    description: '历史配置',
    group: 'models',
    type: 'string',
    envName: 'MODEL_PROVIDER_NAME',
    defaultValue: '',
    rebuild: 'none',
    hidden: true,
  },
  {
    key: 'model.chat.model',
    label: '对话模型（旧）',
    description: '历史配置',
    group: 'models',
    type: 'string',
    envName: 'MODEL_CHAT_MODEL',
    defaultValue: '',
    rebuild: 'none',
    hidden: true,
  },
  {
    key: 'model.reasoning.model',
    label: '深度思考模型（旧）',
    description: '历史配置',
    group: 'models',
    type: 'string',
    envName: 'MODEL_REASONING_MODEL',
    defaultValue: '',
    rebuild: 'none',
    hidden: true,
  },
  {
    key: 'model.summarize.model',
    label: '摘要模型（旧）',
    description: '历史配置',
    group: 'models',
    type: 'string',
    envName: 'MODEL_SUMMARIZE_MODEL',
    defaultValue: '',
    rebuild: 'none',
    hidden: true,
  },
  {
    key: 'model.embed.model',
    label: '向量化模型（旧）',
    description: '历史配置',
    group: 'models',
    type: 'string',
    envName: 'MODEL_EMBED_MODEL',
    defaultValue: '',
    rebuild: 'none',
    hidden: true,
  },
]

/**
 * `fromWire` 需要加解密口，而 `SettingSpec` 是**声明**（在 `install()` 时构造），
 * 那时的 `host.secrets` 已经可用了——但 `fromWire` 是之后才被调用的。
 *
 * 用模块级变量承接：`install()` 在装配期只跑一次，之后这个引用一直有效。
 * 不用闭包是因为 `fromWire` 的签名被设置层定死了（只有两个参数）——
 * 让设置层多传一个 cipher 会把「谁是插件、谁是宿主」的边界搞混。
 */
let currentCipher: Parameters<typeof fromWire>[2] | null = null

export function install(host: PluginHost): void {
  currentCipher = host.secrets

  // 这个包里的键都属于模型域，包级声明一次
  host.params([
    MODEL_CONFIG_PARAM,
    DIMENSIONS_PARAM,
    BRAVE_SEARCH_PARAM,
    ...DOCX_IMAGE_PARAMS,
    ...DOCX_MEDIA_PARAMS,
    ...LEGACY_PARAMS,
  ])

  host.provider(
    {
      seam: 'provider',
      id: 'openai-compatible',
      name: 'OpenAI 兼容端点',
      description: `一套适配器接住 ${PROVIDER_PRESETS.length - 1} 家预设供应商（DeepSeek / 通义 / 智谱 / 硅基流动 / Ollama …）`,
      file: 'plugins/provider/src/provider.ts',
      configKeys: [CONFIG_KEY, 'model.embed.dimensions'],
      // **不声明 `requires`**：供应商是运行期数据（列表可能为空），
      // 而 `requires` 判的是「标量键有没有配过」。
      // 「有没有可用的供应商」由 `overview()` 的 roles[].ready 如实回答——
      // 那才是知道这个形状的地方
    },
    createOpenAiCompatibleProvider(host.settings, host.secrets),
  )
}

export { migrateLegacySettings, shouldMigrate } from './migrate.js'
export { fromWire, toWire, coerceExisting } from './instances.js'
export { PROVIDER_PRESETS, inferPresetId } from './presets.js'
export { docxImageAdapter, docxImageConfiguration } from './docx-image.js'
export { docxTranscriptionAdapter, docxTranscriptionConfiguration } from './docx-media.js'
