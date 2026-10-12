import type {
  JsonValue,
  PluginSettings,
  SettingEntry,
  SettingSource,
  SettingSpec,
  SettingValue,
} from '@mimir/shared'
import type { SecretCipher } from './crypto.js'
import type { SettingRegistry } from './specs.js'

/**
 * 设置的三层解析：`覆盖行 > 环境变量 > 代码默认`（`.trellis/spec/project/architecture.md` §7.5）。
 *
 * **每个键独立判断，不整份回落**：某个键在界面改过、另一个键走环境变量，
 * 是完全正常的状态，而且要能在界面上分别显示来源。
 *
 * ## 存储用窄接口，不直接依赖 ORM
 *
 * 这一层只做「读一行、写一行、删一行」。把 ORM 挡在外面有两个好处：
 *
 *  1. core 不需要知道宿主的 schema——与「插件不碰宿主数据库」是同一条边界
 *  2. 三层回落的每条路径都能用**内存实现**测（见 tests），不需要真数据库。
 *     否则「界面覆盖不生效」这类最难现场诊断的问题只能靠手工点
 */

/** 覆盖层的读写口。宿主用真实数据库实现，测试用内存实现 */
export interface SettingsStore {
  loadAll(): Promise<Map<string, string>>
  upsert(rows: { key: string; value: string }[]): Promise<void>
  remove(keys: string[]): Promise<void>
}

export interface SettingsHost {
  store: SettingsStore
  registry: SettingRegistry
  cipher: SecretCipher
  /** 进程环境变量。单独传进来而不是读全局，是为了测试能构造任意环境 */
  env: Record<string, string | undefined>
}

/* ── 值的强制转换 ─────────────────────────────────────── */

type Coerced = { ok: true; value: CoercedValue } | { ok: false; message: string }

/** 落库的值永远是字符串；这是「从字符串还原出来」能得到的形状 */
type CoercedValue = string | number | boolean | JsonValue

/**
 * json 值的下发转换。
 *
 * **这是「密钥不外泄」的执行点之一。** `toWire` 由拥有那个形状的插件提供
 * （只有它知道密钥藏在数组的哪一项里），设置层只负责调用它。
 *
 * 钩子抛错时不让整个 `/api/config` 挂掉——但也不静默：回空值并记日志。
 * 配置页 500 会让用户连别的键都看不见，那比缺一块更糟。
 */
function toWireValue(spec: SettingSpec, value: unknown): unknown {
  if (spec.type !== 'json' || !spec.json) return value

  try {
    return spec.json.toWire(value)
  } catch (error) {
    console.warn(
      `[settings] ${spec.key} 的下发转换失败，本次回空值：`,
      error instanceof Error ? error.message : error,
    )
    return null
  }
}

function coerce(spec: SettingSpec, raw: string): Coerced {
  if (spec.type === 'number') {
    const value = Number(raw)
    if (!Number.isFinite(value)) return { ok: false, message: '必须是数字' }
    return { ok: true, value }
  }

  if (spec.type === 'boolean') {
    if (raw === 'true' || raw === '1') return { ok: true, value: true }
    if (raw === 'false' || raw === '0') return { ok: true, value: false }
    return { ok: false, message: '必须是 true 或 false' }
  }

  if (spec.type === 'json') {
    // 环境变量只可能是字符串，所以 json 键的值在环境变量里是一条 JSON 文本。
    // 这条路径很少用（结构化配置更适合在界面上改），但保留它意味着
    // 「部署时预置一份供应商配置」是可行的
    try {
      return { ok: true, value: JSON.parse(raw) as JsonValue }
    } catch {
      return { ok: false, message: '必须是合法的 JSON' }
    }
  }

  return { ok: true, value: raw }
}

/* ── 解析 ─────────────────────────────────────────────── */

export interface ResolvedSetting {
  spec: SettingSpec
  /** 秘密类恒为 null（不下发）。json 类是已解析的结构化值。其余为标量 */
  value: string | number | boolean | JsonValue | null
  source: SettingSource
  /** 秘密类：是否已有一个能解开的值 */
  configured: boolean
  /**
   * 环境变量里那个值不合法、或密钥解不开。非空时 `value` 已回落到默认值，
   * 界面**必须**把这个原因显示出来——静默回落会让人以为配置没生效
   * 是自己的错。
   */
  problem: string | null
}

/**
 * 解析一个键。**这是读取路径的唯一入口**——
 * 任何模块想读配置都走这里，不自己看 `process.env`，
 * 否则「界面改了不生效」会变成到处都可能的问题。
 */
export function resolveSetting(
  host: SettingsHost,
  spec: SettingSpec,
  overrides: Map<string, string>,
): ResolvedSetting {
  /* 1. 覆盖层 */
  const raw = overrides.get(spec.key)
  if (raw !== undefined) {
    if (spec.type === 'secret') {
      const decrypted = host.cipher.decrypt(raw)
      if (decrypted.ok) {
        return {
          spec,
          value: null,
          source: 'settings',
          configured: decrypted.value.length > 0,
          problem: null,
        }
      }
      return {
        spec,
        value: null,
        source: 'settings',
        configured: false,
        problem:
          decrypted.reason === 'corrupted'
            ? '已存的密钥无法解密（AUTH_SECRET 换过？）。请重新填写'
            : '已存的密钥格式无法识别，请重新填写',
      }
    }

    const coerced = coerce(spec, raw)
    if (coerced.ok) {
      const invalid = spec.validate?.(coerced.value)
      if (!invalid) {
        return { spec, value: coerced.value, source: 'settings', configured: true, problem: null }
      }
      return {
        spec,
        value: spec.defaultValue,
        source: 'default',
        configured: false,
        problem: invalid,
      }
    }
    return {
      spec,
      value: spec.defaultValue,
      source: 'default',
      configured: false,
      // json 类解析失败要把原因说清：结构化的值坏掉之后，
      // 「以为什么都没配」与「知道它坏了」对用户的下一步动作完全不同
      problem:
        spec.type === 'json'
          ? `已存的值无法解析（${coerced.message}）。请重新配置`
          : coerced.message,
    }
  }

  /* 2. 环境变量 */
  const envRaw = spec.envName ? host.env[spec.envName] : undefined
  if (envRaw !== undefined && envRaw !== '') {
    if (spec.type === 'secret') {
      return { spec, value: null, source: 'env', configured: true, problem: null }
    }

    const coerced = coerce(spec, envRaw)
    if (coerced.ok) {
      const invalid = spec.validate?.(coerced.value)
      if (!invalid) {
        return { spec, value: coerced.value, source: 'env', configured: true, problem: null }
      }
      return {
        spec,
        value: spec.defaultValue,
        source: 'default',
        configured: false,
        problem: `环境变量 ${spec.envName} 不合法（${invalid}），已回落到默认值`,
      }
    }
    return {
      spec,
      value: spec.defaultValue,
      source: 'default',
      configured: false,
      problem: `环境变量 ${spec.envName} 不合法（${coerced.message}），已回落到默认值`,
    }
  }

  /* 3. 代码默认 */
  return {
    spec,
    value: spec.type === 'secret' ? null : spec.defaultValue,
    source: 'default',
    configured: false,
    problem: null,
  }
}

/**
 * 「这个键有没有人配过」。用于算出插件的 `needs-config` 状态。
 *
 * 判据刻意不是「值非空」：默认值也非空。**只有界面或环境变量显式给过值
 * 才算「配过」**——否则一个带默认值的必填键会让插件看起来永远就绪，
 * 而那个默认值可能是个占位符（如 `model.embed.model` 默认为空串）。
 */
export function isProvided(resolved: ResolvedSetting): boolean {
  if (resolved.spec.type === 'secret') return resolved.configured
  return resolved.source !== 'default' && String(resolved.value ?? '').trim() !== ''
}

/* ── 对外的高阶接口 ───────────────────────────────────── */

export interface SettingsApi extends PluginSettings {
  /** Move hidden legacy scalar keys to their registered replacement, preserving encrypted bytes. */
  migrateKeys(pairs: readonly { from: string; to: string }[]): Promise<{
    issues: { key: string; message: string }[]
  }>
  /**
   * 下发给浏览器的条目。
   *
   * **json 类键在这里过一次 `toWire`**：结构化值里可能藏着密钥
   * （供应商列表每家一把），而密钥一个字都不该下发。这一步是那条规则的
   * 唯一执行点——漏掉它的症状是密钥随配置一起发出去了，而界面看不出异常。
   */
  entries(): Promise<SettingEntry[]>
  /** 生效值（非密钥）。json 类可能返回结构化值 */
  get(key: string): Promise<SettingValue>
  /** 写回结构化值（插件保存自己的域配置用）*/
  setJson(key: string, value: unknown): Promise<void>
  /** 秘密类的明文。只在即将发请求的那一刻调用 */
  getSecret(key: string): Promise<{ ok: true; value: string } | { ok: false; reason: string }>
  /** 缓存快照，供同步的状态计算使用 */
  snapshot(): Map<string, ResolvedSetting>
  invalidate(): void
  update(values: Record<string, unknown>): Promise<{
    ok: boolean
    issues: { key: string; message: string }[]
  }>
  reload(): Promise<void>
}

/**
 * 一个进程内缓存，**写时失效**。
 *
 * 读取频率是「每次检索、每次问答」，写入频率是「用户在设置页点保存」。
 * 单进程自托管没有第二个写入方，所以不需要 TTL 也不需要 pub/sub——
 * WeKnora 用 Redis 做失效是因为它要多副本，引入 Redis 对单机是把
 * 运维成本换成一个不存在的并发问题。
 */
export function createSettingsApi(host: SettingsHost): SettingsApi {
  let cache: Map<string, ResolvedSetting> | null = null

  async function load(): Promise<Map<string, ResolvedSetting>> {
    if (cache) return cache

    const overrides = await host.store.loadAll()
    cache = new Map(
      host.registry.all().map((spec) => [spec.key, resolveSetting(host, spec, overrides)]),
    )
    return cache
  }

  function specOrThrow(key: string): SettingSpec {
    const spec = host.registry.find(key)
    if (!spec) {
      // 未注册的键出现在读取路径上是**代码错误**（不是配置错误）。
      // 静默返回 undefined 会让一个拼错的键名变成「值永远是默认」这种查不出的问题
      throw new Error(`未注册的配置键：${key}。先在 core 的键表或插件的 params 里注册它`)
    }
    return spec
  }

  return {
    async migrateKeys(pairs) {
      const overrides = await host.store.loadAll()
      const issues: { key: string; message: string }[] = []
      for (const { from, to } of pairs) {
        const oldSpec = specOrThrow(from)
        const newSpec = specOrThrow(to)
        if (!oldSpec.hidden || oldSpec.type !== newSpec.type) {
          throw new Error(`配置迁移不匹配：${from} → ${to}`)
        }
        const oldRaw = overrides.get(from)
        if (oldRaw === undefined) continue
        if (overrides.has(to)) {
          await host.store.remove([from])
          overrides.delete(from)
          continue
        }
        if (oldSpec.type === 'secret' && !host.cipher.decrypt(oldRaw).ok) {
          issues.push({ key: to, message: '已存的密钥无法解密，请重新填写' })
          continue
        }
        // Copying ciphertext avoids exposing plaintext in migration state or logs.
        await host.store.upsert([{ key: to, value: oldRaw }])
        overrides.set(to, oldRaw)
        await host.store.remove([from])
        overrides.delete(from)
      }
      cache = null
      return { issues }
    },
    async entries() {
      const resolved = await load()
      return (
        host.registry
          .all()
          // hidden 的键（旧配置迁移用）不出现在设置列表里，但仍可被读取
          .filter((spec) => spec.hidden !== true)
          .map((spec) => {
            const item = resolved.get(spec.key) ?? resolveSetting(host, spec, new Map())
            return {
              key: spec.key,
              label: spec.label,
              description: spec.description,
              group: spec.group,
              type: spec.type,
              // 秘密类不给值，只给「有没有」——连密文都不给
              value: spec.type === 'secret' ? null : toWireValue(spec, item.value),
              configured: item.configured,
              source: item.source,
              envName: spec.envName,
              defaultValue: spec.defaultValue,
              writable: spec.writable !== false,
              rebuild: spec.rebuild,
              problem: item.problem,
            }
          })
      )
    },

    async get(key) {
      const resolved = await load()
      return (resolved.get(specOrThrow(key).key) ?? null)?.value ?? null
    },

    async getNumber(key) {
      const value = await this.get(key)
      const num = Number(value)
      if (Number.isFinite(num)) return num
      return Number(specOrThrow(key).defaultValue)
    },

    async getString(key) {
      const value = await this.get(key)
      return value === null ? '' : String(value)
    },

    async getBoolean(key) {
      return (await this.get(key)) === true
    },

    async setJson(key: string, value: unknown): Promise<void> {
      const spec = specOrThrow(key)
      if (spec.type !== 'json') {
        throw new Error(`配置键 ${key} 不是 json 类型（是 ${spec.type}）`)
      }

      await host.store.upsert([{ key, value: JSON.stringify(value) }])
      cache = null
    },

    async getJson<T = unknown>(key: string): Promise<T | undefined> {
      const spec = specOrThrow(key)
      if (spec.type !== 'json') {
        // 类型对了才可能拿到结构化值。搞错类型是代码错误，不是配置错误——
        // 静默返回 undefined 会让「取不到供应商列表」看起来像「用户没配」
        throw new Error(`配置键 ${key} 不是 json 类型（是 ${spec.type}）`)
      }

      const resolved = await load()
      const value = resolved.get(spec.key)?.value
      // 生效值来自默认值或环境变量时也要走一遍校验，
      // 否则「默认形状」与「库里那份」可能不同构
      return value === null || value === undefined ? undefined : (value as T)
    },

    async getSecret(key) {
      const spec = specOrThrow(key)
      const resolved = await load()
      const entry = resolved.get(spec.key)
      if (!entry || entry.source === 'default') return { ok: false, reason: 'missing' }

      if (entry.source === 'env') {
        const raw = spec.envName ? host.env[spec.envName] : undefined
        return raw ? { ok: true, value: raw } : { ok: false, reason: 'missing' }
      }

      // 覆盖层：解一次密的明文。缓存里存的是「能不能解开」，不是明文
      const overrides = await host.store.loadAll()
      const stored = overrides.get(spec.key)
      if (!stored) return { ok: false, reason: 'missing' }

      const decrypted = host.cipher.decrypt(stored)
      if (!decrypted.ok) {
        return { ok: false, reason: 'corrupted' }
      }
      return decrypted.value.length > 0
        ? { ok: true, value: decrypted.value }
        : { ok: false, reason: 'missing' }
    },

    snapshot() {
      return cache ?? new Map()
    },

    invalidate() {
      cache = null
    },

    async reload() {
      cache = null
      await load()
    },

    /**
     * 写入一批。**整批校验，任一键不合法则整批拒绝。**
     *
     * 半批成功会让用户面对一个说不清的状态——「我改了三个值，哪几个进去了？」
     * 而这几个值之间可能有关联（维度与模型名要对得上、RRF k 与权重是一组）。
     */
    async update(values) {
      const issues: { key: string; message: string }[] = []
      const writes: { key: string; value: string }[] = []
      const deletes: string[] = []

      /**
       * 已存的原始覆盖层。**json 键的密钥合并要用它**。
       *
       * 刻意读原始行而不是 `resolveSetting` 的结果：后者给的是**生效值**
       * （可能来自环境变量或默认值），而合并要的是「库里那一行」。
       */
      const rawOverrides = await host.store.loadAll()
      const existingOf = (spec: SettingSpec): unknown => {
        const stored = rawOverrides.get(spec.key)
        if (stored === undefined) return undefined
        try {
          return JSON.parse(stored) as unknown
        } catch {
          // 已存的值坏了：当作「没有已存值」，让这一次写入把它修好
          return undefined
        }
      }

      for (const [key, raw] of Object.entries(values)) {
        const spec = host.registry.find(key)
        if (!spec) {
          issues.push({ key, message: '未知的配置键' })
          continue
        }
        if (spec.writable === false) {
          issues.push({ key, message: '这个键不可写' })
          continue
        }

        if (raw === null) {
          // 删除覆盖：回落到环境变量或默认值
          deletes.push(key)
          continue
        }

        if (spec.type === 'secret') {
          const text = String(raw)
          // 空串的语义是「清除」，不写一行空的密文——那会让 secret() 拿到空串
          // 却报告 configured: true，界面上显示「已配置」而实际没有密钥
          if (text === '') deletes.push(key)
          else writes.push({ key, value: host.cipher.encrypt(text) })
          continue
        }

        if (spec.type === 'json') {
          /**
           * json 值走 `fromWire`：**密钥的合并发生在这里**。
           *
           * 界面拿不到密钥（`toWire` 摘掉了），所以它提交的值里密钥位是缺失的。
           * 如果直接覆盖，用户改一下供应商的名字就会把密钥清掉——
           * 而界面上完全看不出发生了什么。`fromWire` 收下已存的值，
           * 由拥有那个形状的插件决定怎么合（它知道密钥在哪一层）。
           */
          const existing = existingOf(spec)

          try {
            const merged = spec.json ? spec.json.fromWire(raw, existing) : raw

            const invalid = spec.validate?.(merged as SettingValue)
            if (invalid) {
              issues.push({ key, message: invalid })
              continue
            }

            writes.push({ key, value: JSON.stringify(merged) })
          } catch (error) {
            issues.push({
              key,
              message: error instanceof Error ? error.message : '值不合法',
            })
          }
          continue
        }

        const coerced = coerce(spec, String(raw))
        if (!coerced.ok) {
          issues.push({ key, message: coerced.message })
          continue
        }

        const invalid = spec.validate?.(coerced.value)
        if (invalid) {
          issues.push({ key, message: invalid })
          continue
        }

        writes.push({ key, value: String(coerced.value) })
      }

      if (issues.length > 0) return { ok: false, issues }

      if (writes.length > 0) await host.store.upsert(writes)
      if (deletes.length > 0) await host.store.remove(deletes)

      cache = null
      return { ok: true, issues: [] }
    },
  }
}
