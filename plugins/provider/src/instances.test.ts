import { describe, expect, it } from 'vitest'
import type { SecretCodec } from '@mimir/shared'
import {
  canServe,
  coerceExisting,
  fromWire,
  toWire,
  type InternalModelConfig,
} from './instances.js'
import { migrateLegacySettings, shouldMigrate } from './migrate.js'
import { PROVIDER_PRESETS, inferPresetId } from './presets.js'

/**
 * 供应商实例的存取。
 *
 * ## 为什么这一组必须有测试
 *
 * 这里的两类错误都**不会报错，只在界面上静默出错**：
 *
 *  1. **密钥下发**：`toWire` 漏摘一个字段，密钥就随 `/api/config`
 *     到了浏览器——而界面上看不出任何异常
 *  2. **密钥被清掉**：`fromWire` 少合一次，用户改一下供应商的名字
 *     就把密钥弄没了——而界面上也看不出异常（`hasKey` 会变成 false，
 *     但用户不会盯着那个徽标）
 *
 * 两类都属于「用户拿它做判断，它却在说谎」，所以断言必须落在
 * 具体的字段与值上。
 */

/** 假的 cipher：可逆但不真加密，用来看清值有没有被处理过 */
const fakeCipher: SecretCodec = {
  encrypt: (plain) => `enc:v1:${Buffer.from(plain).toString('base64')}`,
  decrypt: (stored) => {
    if (!stored.startsWith('enc:v1:')) return { ok: false, reason: 'not-encrypted' }
    return { ok: true, value: Buffer.from(stored.slice(7), 'base64').toString('utf8') }
  },
}

function configWith(apiKey: string): InternalModelConfig {
  return {
    providers: [
      {
        id: 'p1',
        preset: 'deepseek',
        name: 'DeepSeek',
        family: 'openai-compatible',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey,
        models: [{ id: 'deepseek-chat', source: 'preset', purposes: ['chat'] }],
        modelsFetchedAt: null,
      },
    ],
    roles: { chat: { providerId: 'p1', model: 'deepseek-chat' } },
  }
}

describe('下发时摘掉密钥', () => {
  it('密文一个字都不出现在 toWire 的结果里', () => {
    const internal = configWith(fakeCipher.encrypt('sk-super-secret'))
    const wire = toWire(internal) as { providers: Record<string, unknown>[] }

    const serialized = JSON.stringify(wire)
    expect(serialized).not.toContain('sk-super-secret')
    expect(serialized).not.toContain('enc:v1:')

    // 只留一个布尔位
    expect(wire.providers[0]?.hasKey).toBe(true)
    expect(wire.providers[0]).not.toHaveProperty('apiKey')
  })

  it('没配密钥时 hasKey 为 false', () => {
    const wire = toWire(configWith('')) as { providers: { hasKey: boolean }[] }
    expect(wire.providers[0]?.hasKey).toBe(false)
  })

  it('迁移标记不下发（它可能带着旧密钥）', () => {
    const internal = configWith(fakeCipher.encrypt('x'))
    internal.migratedFrom = { apiKey: 'sk-old-plaintext' }

    const serialized = JSON.stringify(toWire(internal))
    expect(serialized).not.toContain('sk-old-plaintext')
  })
})

describe('写入时合并密钥', () => {
  it('不传密钥草稿时保留已存的那把（改名字不该清掉密钥）', () => {
    const existing = configWith(fakeCipher.encrypt('sk-keep-me'))

    // 用户只改了名字：提交的形状里没有 keyDrafts
    const result = fromWire(
      {
        providers: [{ ...wireOf(existing), name: '改了个名字' }],
        roles: { chat: { providerId: 'p1', model: 'deepseek-chat' } },
      },
      existing,
      fakeCipher,
    )

    expect(result.config.providers[0]?.name).toBe('改了个名字')
    // 密钥原样保留——这是「改名字不该清掉密钥」那条不变量的断言点
    expect(result.config.providers[0]?.apiKey).toBe(existing.providers[0]?.apiKey)
  })

  it('传了密钥草稿就替换成新的', () => {
    const existing = configWith(fakeCipher.encrypt('sk-old'))

    const result = fromWire(
      {
        providers: [wireOf(existing)],
        roles: {},
        keyDrafts: { p1: 'sk-new' },
      },
      existing,
      fakeCipher,
    )

    const stored = result.config.providers[0]?.apiKey ?? ''
    expect(fakeCipher.decrypt(stored)).toEqual({ ok: true, value: 'sk-new' })
  })

  it('传空串表示「清除」，不是「别动」', () => {
    const existing = configWith(fakeCipher.encrypt('sk-remove-me'))

    const result = fromWire(
      { providers: [wireOf(existing)], roles: {}, keyDrafts: { p1: '' } },
      existing,
      fakeCipher,
    )

    expect(result.config.providers[0]?.apiKey).toBe('')
  })

  it('新增的供应商用草稿里的密钥', () => {
    const result = fromWire(
      {
        providers: [
          {
            id: 'p-new',
            preset: 'custom',
            name: '新供应商',
            family: 'openai-compatible',
            baseUrl: 'https://example.dev/v1',
            hasKey: false,
            models: [],
            modelsFetchedAt: null,
          },
        ],
        roles: {},
        keyDrafts: { 'p-new': 'sk-brand-new' },
      },
      undefined,
      fakeCipher,
    )

    const stored = result.config.providers[0]?.apiKey ?? ''
    expect(fakeCipher.decrypt(stored)).toEqual({ ok: true, value: 'sk-brand-new' })
  })

  it('缺少接口地址时拒绝写入（而不是存一条发不出请求的配置）', () => {
    expect(() =>
      fromWire(
        {
          providers: [{ id: 'p1', name: 'x', baseUrl: '', models: [], modelsFetchedAt: null }],
          roles: {},
        },
        undefined,
        fakeCipher,
      ),
    ).toThrow(/接口地址/)
  })

  it('地址不是 http(s) 时拒绝', () => {
    expect(() =>
      fromWire(
        {
          providers: [
            {
              id: 'p1',
              name: 'x',
              baseUrl: 'ftp://nope',
              models: [],
              modelsFetchedAt: null,
            },
          ],
          roles: {},
        },
        undefined,
        fakeCipher,
      ),
    ).toThrow(/http/)
  })
})

describe('角色绑定', () => {
  it('指向不存在的供应商的绑定被丢掉', () => {
    const result = fromWire(
      {
        providers: [wireOf(configWith(''))],
        roles: {
          // p-gone 不在 providers 里
          chat: { providerId: 'p-gone', model: 'x' },
        },
      },
      undefined,
      fakeCipher,
    )

    expect(result.config.roles.chat).toBeNull()
  })

  it('留空是合法的（摘要会回落到对话）', () => {
    const result = fromWire(
      { providers: [wireOf(configWith(''))], roles: { summarize: null } },
      undefined,
      fakeCipher,
    )

    expect(result.config.roles.summarize).toBeNull()
  })

  it('绑定一个用途不符的模型时被清空（向量化绑到对话模型是错的）', () => {
    const result = fromWire(
      {
        providers: [wireOf(configWith(''))],
        roles: { embed: { providerId: 'p1', model: 'deepseek-chat' } },
      },
      undefined,
      fakeCipher,
    )

    // deepseek-chat 的用途是 ['chat']，不覆盖 embed → 不保留
    expect(result.config.roles.embed).toBeNull()
  })

  it('绑定一个用途覆盖的模型时保留', () => {
    const existing = configWith('')
    existing.providers[0]!.models = [
      { id: 'deepseek-chat', source: 'preset', purposes: ['chat'] },
      { id: 'bge-m3', source: 'manual', purposes: ['embed', 'rerank'] },
    ]

    const result = fromWire(
      {
        providers: [wireOf(existing)],
        roles: { embed: { providerId: 'p1', model: 'bge-m3' } },
      },
      undefined,
      fakeCipher,
    )

    expect(result.config.roles.embed).toEqual({ providerId: 'p1', model: 'bge-m3' })
  })
})

describe('模型用途', () => {
  it('缺失用途时按模型名回填（旧配置读取路径）', () => {
    const coerced = coerceExisting({
      providers: [
        {
          id: 'p1',
          preset: 'custom',
          name: 'x',
          family: 'openai-compatible',
          baseUrl: 'https://example.dev/v1',
          apiKey: '',
          // 旧形状：没有 purposes 字段
          models: [
            { id: 'text-embedding-3-small', source: 'fetched' },
            { id: 'bge-reranker-v2-m3', source: 'fetched' },
            { id: 'gpt-4o-mini', source: 'fetched' },
          ],
          modelsFetchedAt: null,
        },
      ],
      roles: {},
    })

    const purposes = coerced.providers[0]!.models.map((model) => model.purposes)
    expect(purposes).toEqual([['embed'], ['rerank'], ['chat']])
  })

  it('写入时提交的空用途数组按模型名回填（不是一个都不剩）', () => {
    const result = fromWire(
      {
        providers: [
          {
            id: 'p1',
            preset: 'custom',
            name: 'x',
            family: 'openai-compatible',
            baseUrl: 'https://example.dev/v1',
            hasKey: false,
            models: [{ id: 'BAAI/bge-m3', source: 'manual', purposes: [] }],
            modelsFetchedAt: null,
          },
        ],
        roles: {},
        keyDrafts: { p1: 'k' },
      },
      undefined,
      fakeCipher,
    )

    expect(result.config.providers[0]!.models[0]!.purposes).toEqual(['embed'])
  })

  it('不认识的用途值被丢掉，认得出的保留', () => {
    const result = fromWire(
      {
        providers: [
          {
            id: 'p1',
            preset: 'custom',
            name: 'x',
            family: 'openai-compatible',
            baseUrl: 'https://example.dev/v1',
            hasKey: false,
            models: [{ id: 'm', source: 'manual', purposes: ['chat', 'bogus'] }],
            modelsFetchedAt: null,
          },
        ],
        roles: {},
        keyDrafts: { p1: 'k' },
      },
      undefined,
      fakeCipher,
    )

    expect(result.config.providers[0]!.models[0]!.purposes).toEqual(['chat'])
  })

  it('canServe 按角色用途表判定', () => {
    const embedModel = { id: 'e', source: 'manual' as const, purposes: ['embed' as const] }

    expect(canServe(embedModel, 'embed')).toBe(true)
    expect(canServe(embedModel, 'chat')).toBe(false)
    // 摘要与推理都接受 chat 用途
    const chatModel = { id: 'c', source: 'manual' as const, purposes: ['chat' as const] }
    expect(canServe(chatModel, 'summarize')).toBe(true)
    expect(canServe(chatModel, 'reasoning')).toBe(true)
  })
})

describe('预设目录', () => {
  it('每个预设都有 id / 名称 / 家族 / 地址', () => {
    const incomplete = PROVIDER_PRESETS.filter((preset) => {
      if (preset.id === '' || preset.name === '') return true
      if (preset.family !== 'openai-compatible') return true
      // custom 是「自己填地址」的那一项，地址允许为空
      if (preset.id !== 'custom' && !/^https?:\/\//.test(preset.baseUrl)) return true
      return false
    }).map((preset) => preset.id)

    // 不用 if + expect（vitest 的条件断言规则会拦）：把不满足的那些列出来，
    // 失败信息里直接能看到是哪一个预设有问题
    expect(incomplete).toEqual([])
  })

  it('id 不重复', () => {
    const ids = PROVIDER_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('从地址能认出预设（迁移用）', () => {
    expect(inferPresetId('https://api.deepseek.com/v1')).toBe('deepseek')
    expect(inferPresetId('https://api.moonshot.cn/v1')).toBe('moonshot')
    // 认不出就用 custom——猜错的代价只是界面上的名字不准
    expect(inferPresetId('https://my-own-gateway.internal/v1')).toBe('custom')
  })
})

describe('旧配置迁移', () => {
  const baseUrl = 'https://api.deepseek.com/v1'

  it('新配置里已有供应商时不迁移（不覆盖用户现在的配置）', () => {
    const needs = shouldMigrate({
      current: configWith('x'),
      legacy: { baseUrl: 'https://old.example/v1', apiKey: 'sk-old' },
      newProviderId: 'p-new',
      encrypt: (plain) => plain,
    })

    expect(needs).toBe(false)
  })

  it('全新部署（旧键也没配过）不迁移——不凭空造一个供应商', () => {
    const needs = shouldMigrate({
      current: { providers: [], roles: {} },
      legacy: {},
      newProviderId: 'p-new',
      encrypt: (plain) => plain,
    })

    expect(needs).toBe(false)
  })

  it('旧配置有值时迁移，且密钥被加密落库', () => {
    const migrated = migrateLegacySettings({
      current: { providers: [], roles: {} },
      legacy: {
        baseUrl,
        apiKey: 'sk-legacy-plain',
        chatModel: 'deepseek-chat',
        embedModel: 'BAAI/bge-m3',
      },
      newProviderId: 'p-migrated',
      encrypt: (plain) => fakeCipher.encrypt(plain),
    })

    const provider = migrated.providers[0]!
    expect(provider.preset).toBe('deepseek')
    // 明文绝不落库
    expect(provider.apiKey).not.toContain('sk-legacy-plain')
    expect(fakeCipher.decrypt(provider.apiKey)).toEqual({ ok: true, value: 'sk-legacy-plain' })

    // 配过的模型要全部保留——迁移不等于「把配置清了」
    const modelIds = provider.models.map((model) => model.id)
    expect(modelIds).toContain('deepseek-chat')
    expect(modelIds).toContain('BAAI/bge-m3')

    // 角色绑定跟着过来
    expect(migrated.roles.chat).toEqual({ providerId: 'p-migrated', model: 'deepseek-chat' })
    expect(migrated.roles.embed).toEqual({ providerId: 'p-migrated', model: 'BAAI/bge-m3' })
    // 摘要旧值为空 → 不写绑定（它允许留空）
    expect(migrated.roles.summarize).toBeNull()
  })

  it('重复的模型名只留一个', () => {
    const migrated = migrateLegacySettings({
      current: { providers: [], roles: {} },
      legacy: {
        baseUrl,
        apiKey: 'k',
        chatModel: 'same-model',
        reasoningModel: 'same-model',
      },
      newProviderId: 'p1',
      encrypt: (plain) => plain,
    })

    const ids = migrated.providers[0]!.models.map((model) => model.id)
    expect(ids.filter((id) => id === 'same-model')).toHaveLength(1)
  })
})

describe('坏数据的兜底', () => {
  it('undefined / 非对象 / 缺字段都收敛成空配置', () => {
    expect(coerceExisting(undefined).providers).toEqual([])
    expect(coerceExisting('garbage').providers).toEqual([])
    expect(coerceExisting({ providers: 'not-an-array' }).providers).toEqual([])
  })
})

/** 取一个内部实例的下发形状（模拟界面提交的东西）*/
function wireOf(internal: InternalModelConfig) {
  const wire = toWire(internal) as { providers: Record<string, unknown>[] }
  return wire.providers[0]!
}
