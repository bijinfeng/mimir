import { describe, expect, it } from 'vitest'
import {
  createSecretCipher,
  createSettingsApi,
  isProvided,
  resolveSetting,
  SettingRegistry,
  type SettingsStore,
} from '@mimir/core'
import type { SettingSpec } from '@mimir/shared'

/**
 * 配置层的行为断言。
 *
 * ## 为什么要专门测这一层
 *
 * 三层解析（覆盖行 > 环境变量 > 默认）有 3 条回落路径 × 2 类失败
 * （环境变量不合法、密钥解不开），而它们的表现全是**静默**的：
 * 界面显示一个值、实际用的是另一个。「界面改了不生效」是这类问题里
 * 最难现场诊断的一种——用户只会觉得「这个设置坏了」。
 *
 * 用内存 store 而不是真数据库：这一层的逻辑与存储无关，
 * 而真库会让每条断言都要先造数据、跑迁移。
 */

/** 内存实现。它同时证明了 store 这个端口足够窄——只需要三个方法 */
function memoryStore(initial: Record<string, string> = {}): SettingsStore & {
  rows: Map<string, string>
} {
  const rows = new Map(Object.entries(initial))
  return {
    rows,
    async loadAll() {
      return new Map(rows)
    },
    async upsert(values) {
      for (const { key, value } of values) rows.set(key, value)
    },
    async remove(keys) {
      for (const key of keys) rows.delete(key)
    },
  }
}

const SPECS: SettingSpec[] = [
  {
    key: 'retrieval.rrfK',
    label: 'RRF k',
    description: 'test',
    group: 'retrieval',
    type: 'number',
    envName: 'RETRIEVAL_RRF_K',
    defaultValue: 60,
    rebuild: 'none',
  },
  {
    key: 'model.baseUrl',
    label: '接口地址',
    description: 'test',
    group: 'models',
    type: 'string',
    envName: 'MODEL_BASE_URL',
    defaultValue: 'https://api.deepseek.com/v1',
    rebuild: 'none',
    // 与核心键表同一条规则：必须是 http(s)。没有它「整批拒绝」那条断言
    // 就测不到东西——坏值会被接受，于是整批都写进去
    validate: (value) => (/^https?:\/\//i.test(String(value)) ? null : '必须以 http(s) 开头'),
  },
  {
    key: 'model.apiKey',
    label: 'API 密钥',
    description: 'test',
    group: 'models',
    type: 'secret',
    envName: 'MODEL_API_KEY',
    defaultValue: '',
    rebuild: 'none',
  },
]

const SECRET = 'test-secret-at-least-32-chars-long!!'

function makeApi(store: SettingsStore, env: Record<string, string | undefined> = {}) {
  const cipher = createSecretCipher(SECRET)
  return createSettingsApi({
    store,
    registry: new SettingRegistry(SPECS),
    cipher,
    env,
  })
}

describe('配置三层解析', () => {
  it('三条回落路径：覆盖 > 环境变量 > 默认', async () => {
    const store = memoryStore()

    // 1. 都没有 → 默认
    let api = makeApi(store, {})
    expect(await api.getNumber('retrieval.rrfK')).toBe(60)

    // 2. 环境变量存在 → 取环境变量
    api = makeApi(store, { RETRIEVAL_RRF_K: '42' })
    expect(await api.getNumber('retrieval.rrfK')).toBe(42)

    // 3. 覆盖行存在 → 取覆盖行（**优先于环境变量**）
    await api.update({ 'retrieval.rrfK': 80 })
    expect(await api.getNumber('retrieval.rrfK')).toBe(80)

    // 4. 删掉覆盖 → 回落到环境变量，不是默认
    await api.update({ 'retrieval.rrfK': null })
    expect(await api.getNumber('retrieval.rrfK')).toBe(42)
  })

  it('每个键独立判断，不整份回落', async () => {
    const store = memoryStore({ 'retrieval.rrfK': '80' })
    const api = makeApi(store, { MODEL_BASE_URL: 'https://example.dev/v1' })

    // 一个键来自覆盖、另一个来自环境变量，两者互不影响
    expect(await api.getNumber('retrieval.rrfK')).toBe(80)
    expect(await api.getString('model.baseUrl')).toBe('https://example.dev/v1')
    expect(await api.getString('model.apiKey')).toBe('')
  })

  it('来源标注如实反映值的来处', async () => {
    const store = memoryStore({ 'retrieval.rrfK': '80' })
    const api = makeApi(store, { MODEL_BASE_URL: 'https://example.dev/v1' })

    const entries = await api.entries()
    const byKey = new Map(entries.map((entry) => [entry.key, entry]))

    expect(byKey.get('retrieval.rrfK')?.source).toBe('settings')
    expect(byKey.get('model.baseUrl')?.source).toBe('env')
    // 没人配过的键必须报 default——界面据此显示「默认值」而不是「已配置」
    expect(byKey.get('model.apiKey')?.source).toBe('default')
  })

  it('环境变量不合法时回落并说明原因，不静默吞掉', async () => {
    const api = makeApi(memoryStore(), { RETRIEVAL_RRF_K: '不是数字' })

    const entries = await api.entries()
    const entry = entries.find((item) => item.key === 'retrieval.rrfK')

    expect(entry?.value).toBe(60)
    expect(entry?.source).toBe('default')
    // 这一条是关键：静默回落会让用户以为是自己配错了地方
    expect(entry?.problem).toContain('RETRIEVAL_RRF_K')
  })
})

describe('通用 AI 服务旧键迁移', () => {
  const specs: SettingSpec[] = [
    {
      key: 'docx.brave.apiKey',
      label: '旧搜索密钥',
      description: '',
      group: 'models',
      type: 'secret',
      envName: null,
      defaultValue: '',
      rebuild: 'none',
      hidden: true,
      writable: false,
    },
    {
      key: 'search.web.brave.apiKey',
      label: '搜索密钥',
      description: '',
      group: 'search',
      type: 'secret',
      envName: null,
      defaultValue: '',
      rebuild: 'none',
    },
  ]

  it('moves encrypted bytes once without exposing plaintext or overwriting the replacement', async () => {
    const cipher = createSecretCipher(SECRET)
    const encrypted = cipher.encrypt('legacy-brave-key')
    const store = memoryStore({ 'docx.brave.apiKey': encrypted })
    const api = createSettingsApi({ store, registry: new SettingRegistry(specs), cipher, env: {} })
    const pairs = [{ from: 'docx.brave.apiKey', to: 'search.web.brave.apiKey' }]
    expect(await api.migrateKeys(pairs)).toEqual({ issues: [] })
    expect(store.rows.get('search.web.brave.apiKey')).toBe(encrypted)
    expect(store.rows.has('docx.brave.apiKey')).toBe(false)
    expect(await api.getSecret('search.web.brave.apiKey')).toEqual({
      ok: true,
      value: 'legacy-brave-key',
    })
    expect(JSON.stringify(await api.entries())).not.toContain('legacy-brave-key')
    expect(JSON.stringify(await api.entries())).not.toContain('docx.brave.apiKey')
    await api.update({ 'search.web.brave.apiKey': 'new-key' })
    expect(await api.migrateKeys(pairs)).toEqual({ issues: [] })
    expect(await api.getSecret('search.web.brave.apiKey')).toEqual({ ok: true, value: 'new-key' })
  })

  it('retains an unreadable legacy secret and reports a repair action', async () => {
    const store = memoryStore({ 'docx.brave.apiKey': 'enc:v1:broken' })
    const api = createSettingsApi({
      store,
      registry: new SettingRegistry(specs),
      cipher: createSecretCipher(SECRET),
      env: {},
    })
    const result = await api.migrateKeys([
      { from: 'docx.brave.apiKey', to: 'search.web.brave.apiKey' },
    ])
    expect(result.issues[0]).toMatchObject({
      key: 'search.web.brave.apiKey',
      message: expect.stringContaining('无法解密'),
    })
    expect(store.rows.get('docx.brave.apiKey')).toBe('enc:v1:broken')
    expect(store.rows.has('search.web.brave.apiKey')).toBe(false)
  })

  it('keeps the legacy row when writing the replacement fails', async () => {
    const cipher = createSecretCipher(SECRET)
    const encrypted = cipher.encrypt('legacy-brave-key')
    const store = memoryStore({ 'docx.brave.apiKey': encrypted })
    store.upsert = async () => {
      throw new Error('database write failed')
    }
    const api = createSettingsApi({ store, registry: new SettingRegistry(specs), cipher, env: {} })
    await expect(
      api.migrateKeys([{ from: 'docx.brave.apiKey', to: 'search.web.brave.apiKey' }]),
    ).rejects.toThrow('database write failed')
    expect(store.rows.get('docx.brave.apiKey')).toBe(encrypted)
    expect(store.rows.has('search.web.brave.apiKey')).toBe(false)
  })
})

describe('写入校验', () => {
  it('拒绝未知的键（键集是闭集）', async () => {
    const api = makeApi(memoryStore())
    const result = await api.update({ 'nope.unknown': 1 })

    expect(result.ok).toBe(false)
    expect(result.issues[0]?.key).toBe('nope.unknown')
  })

  it('整批拒绝：一个键不合法则全部不写入', async () => {
    const api = makeApi(memoryStore())
    const result = await api.update({
      'retrieval.rrfK': 80,
      'model.baseUrl': 'ftp://nope', // 校验失败：不是 http(s)
    })

    expect(result.ok).toBe(false)
    // 合法的那个也不该被写进去——半批成功会让用户面对一个说不清的状态
    expect(await api.getNumber('retrieval.rrfK')).toBe(60)
  })

  it('数字类型拒绝非数字', async () => {
    const api = makeApi(memoryStore())
    const result = await api.update({ 'retrieval.rrfK': 'abc' })
    expect(result.ok).toBe(false)
  })
})

describe('密钥的存取', () => {
  it('落库是密文，读出来是明文', async () => {
    const store = memoryStore()
    const api = makeApi(store)

    await api.update({ 'model.apiKey': 'sk-super-secret-value' })

    // 落库的必须是密文，且带版本前缀
    const stored = store.rows.get('model.apiKey')
    expect(stored).not.toContain('sk-super-secret-value')
    expect(stored?.startsWith('enc:v1:')).toBe(true)

    // 读出来是原文
    const secret = await api.getSecret('model.apiKey')
    expect(secret.ok).toBe(true)
    expect(secret.ok ? secret.value : null).toBe('sk-super-secret-value')
  })

  it('密钥的明文绝不出现在 entries() 里（不下发浏览器）', async () => {
    const api = makeApi(memoryStore())
    await api.update({ 'model.apiKey': 'sk-never-send-this' })

    const entries = await api.entries()
    const entry = entries.find((item) => item.key === 'model.apiKey')

    // 值必须是 null，只留一个「有没有」的布尔位
    expect(entry?.value).toBeNull()
    expect(entry?.configured).toBe(true)
  })

  it('空串等于清除覆盖，而不是存一个空密钥', async () => {
    const api = makeApi(memoryStore())
    await api.update({ 'model.apiKey': 'sk-temp' })
    await api.update({ 'model.apiKey': '' })

    const secret = await api.getSecret('model.apiKey')
    expect(secret.ok).toBe(false)

    // configured 必须跟着变回 false，否则界面会显示「已配置」而实际没有密钥
    const entry = (await api.entries()).find((item) => item.key === 'model.apiKey')
    expect(entry?.configured).toBe(false)
  })

  it('AUTH_SECRET 换过之后解不开，且与「没配」区分开', async () => {
    const store = memoryStore()
    const cipher = createSecretCipher(SECRET)

    // 用另一个密钥写进去
    store.rows.set(
      'model.apiKey',
      createSecretCipher('another-secret-32-chars-long-here!!').encrypt('sk-x'),
    )

    const api = createSettingsApi({
      store,
      registry: new SettingRegistry(SPECS),
      cipher,
      env: {},
    })

    const secret = await api.getSecret('model.apiKey')
    expect(secret.ok).toBe(false)
    // 这一条是重点：不是 'missing'，是 'corrupted'
    expect(secret.ok ? null : secret.reason).toBe('corrupted')

    const entry = (await api.entries()).find((item) => item.key === 'model.apiKey')
    expect(entry?.problem).toContain('无法解密')
  })
})

describe('「有没有人配过」的判据', () => {
  it('默认值不算配过', () => {
    const spec = SPECS[0]!
    const resolved = resolveSetting(
      {
        store: memoryStore(),
        registry: new SettingRegistry(SPECS),
        cipher: createSecretCipher(SECRET),
        env: {},
      },
      spec,
      new Map(),
    )

    // 默认值非空（60），但它不算「配过」——否则带默认值的必填键
    // 会让插件永远显示就绪
    expect(resolved.value).toBe(60)
    expect(isProvided(resolved)).toBe(false)
  })

  it('环境变量给了值才算配过', () => {
    const spec = SPECS[0]!
    const resolved = resolveSetting(
      {
        store: memoryStore(),
        registry: new SettingRegistry(SPECS),
        cipher: createSecretCipher(SECRET),
        env: { RETRIEVAL_RRF_K: '30' },
      },
      spec,
      new Map(),
    )

    expect(isProvided(resolved)).toBe(true)
  })
})
