import { existsSync } from 'node:fs'
import {
  createSecretCipher,
  createSeamHost,
  createSettingRegistry,
  createSettingsApi,
} from '@mimir/core'
import type {
  Capturer,
  DeclarationReader,
  ModelProvider,
  Parser,
  PluginHost,
  PluginSettings,
  RetrievalLeg,
  StorageBackend,
  SettingSpec,
  SettingValue,
} from '@mimir/shared'
import { install as installCapturer } from '@mimir/plugin-capturer'
import { install as installLeg } from '@mimir/plugin-leg'
import { install as installParser } from '@mimir/plugin-parser'
import { install as installProvider } from '@mimir/plugin-provider'
import { install as installStorage } from '@mimir/plugin-storage'
import { db } from '../db/client.js'
import { env } from '../env.js'
import { SettingsTableStore } from './settings-store.js'

/**
 * **装配层：全仓唯一同时知道「宿主」与「插件」的地方。**
 *
 * 这个文件的存在本身就是架构的落点（`.trellis/spec/project/architecture.md` §7）：
 *
 * ```
 *   插件包  ──→ @mimir/shared（契约）       ← 插件不 import 宿主
 *   宿主    ──→ @mimir/core（骨架）         ← 核心不 import 插件
 *   本文件  ──→ 两边都有                      ← 只有它在装配
 * ```
 *
 * 它只做三件事：造设置层、造接缝注册表、把插件装进去。
 * **没有业务逻辑**——抓取怎么落盘、笔记怎么写、引用怎么组装都属于宿主的服务层。
 *
 * ## 单趟装配 + 延迟绑定
 *
 * 插件在 `install()` 里**只保存** settings 的引用，真正读值是运行时
 * （抓取、检索、问答）才发生。所以这一趟可以同时完成两件事：
 *
 *   1. 收集插件的 `params`（它们自己要的配置键）
 *   2. 注册实现
 *
 * 之后再用收集到的键造出真正的 settings，通过 holder 交给插件。
 * 两趟式（先只收集、再装实现）会撞重复 id，而且没有必要。
 */

/**
 * 插件需要的数据库句柄。
 *
 * 收窄成 `execute` 是有意的（契约里 `PluginDatabase` 只有这一个方法）：
 * 插件不该碰宿主的 schema 与事务编排。类型适配只在这里做一次。
 *
 * `dialect`（D-045）告诉插件该说哪种 SQL：服务器部署说 Postgres，
 * 本地开发与桌面端说 SQLite。两个检索通道按它选择方言实现——方言分支
 * 必须收在通道内部，不要散落到宿主（TECH §7.2）。
 * sqlite 驱动的行查询走 `db.all`（drizzle 的 sqlite 侧没有 `execute`）。
 */
const pluginDatabase = {
  dialect: env.dbDriver,
  async execute<T = unknown>(query: unknown): Promise<T[]> {
    if (env.dbDriver === 'sqlite') {
      const rows = await (db as never as { all(query: never): Promise<unknown[]> }).all(
        query as never,
      )
      return rows as T[]
    }
    const rows = await db.execute(query as never)
    return rows as T[]
  },
}

/** settings 的延迟绑定：install 期间先拿着它，运行时才读到真值 */
interface SettingsHolder {
  current: PluginSettings | null
}

function holderSettings(holder: SettingsHolder): PluginSettings {
  const resolve = (): PluginSettings => {
    if (!holder.current) {
      throw new Error('装配顺序错误：插件在设置层建好之前就读了配置')
    }
    return holder.current
  }

  return {
    getNumber: (key) => resolve().getNumber(key),
    getString: (key) => resolve().getString(key),
    getBoolean: (key) => resolve().getBoolean(key),
    getJson: (key) => resolve().getJson(key),
    setJson: (key, value) => resolve().setJson(key, value),
    getSecret: (key) => resolve().getSecret(key),
  }
}

interface Assembled {
  settings: ReturnType<typeof createSettingsApi>
  seams: ReturnType<typeof createSeamHost>
  /**
   * 模型提供方注册表。它是 `seams.provider` 的别名——
   * 模型域被路由层直接用到（`/api/config` 的 modelConfig、探测、拉模型），
   * 每次写 `seams.provider` 会让那几处的意图不如 `providers` 清楚。
   */
  providers: ReturnType<typeof createSeamHost>['provider']
  /**
   * 当前生效的存储后端。**所有文件读写都走它**（`lib/vault.ts`、
   * `services/avatar.ts`、`services/capture.ts`、`services/vault-index.ts`）。
   *
   * 同步返回：调用方在写笔记的路径上不想为了「用哪个后端」多一次 await。
   */
  activeStorage(): StorageBackend
  /** 全部插件的声明（活的 + 规划中），带算好的状态。设置页与 `/api/config` 用它 */
  descriptors(): Promise<ReturnType<ReturnType<typeof createSeamHost>['leg']['descriptors']>>
}

/**
 * 从同步快照里读当前选中的后端 id。
 *
 * 抽出来是因为有两处要用：`activeStorage()` 的缓存判据，以及错误信息里
 * 「你想要的是谁」。它同步、不抛错——`snapshot()` 只读缓存，
 * 未加载时返回空 Map，那时按默认值 `local` 走。
 */
function resolveBackendId(settings: ReturnType<typeof createSettingsApi>): string {
  const value = settings.snapshot().get('storage.backend')?.value
  return String(value ?? 'local').trim() || 'local'
}

let assembled: Assembled | null = null

/** 存储后端的解析缓存。判据是「当前选中的 id」，见 activeStorage 的注释 */
let storageCache: StorageBackend | null = null

/** 装配一次并复用。它持有设置缓存，每次请求重建会让缓存永远命中不了 */
export function assemble(): Assembled {
  if (assembled) return assembled

  const seams = createSeamHost()
  const holder: SettingsHolder = { current: null }
  const collected: SettingSpec[][] = []

  // cipher 在 install 之前就要有——插件的 `fromWire` 钩子需要它
  const cipher = createSecretCipher(env.authSecret)

  const host: PluginHost = {
    db: pluginDatabase,
    settings: holderSettings(holder),
    /**
     * 密钥编解码口。**与设置层的 `secret` 类型用同一个 cipher**——
     * 两处共用一个对象，所以 `AUTH_SECRET` 换掉时它们一起失效，
     * 不会出现「标量密钥能解、结构化里的密钥解不开」这种半坏状态。
     */
    secrets: cipher,

    // 包级键：多个实现共用同一组配置时在这里声明一次（见 PluginHost 的注释）
    params(specs) {
      collected.push([...specs])
    },

    leg(declaration, impl) {
      if (declaration.params) collected.push([...declaration.params])
      seams.leg.register(declaration, impl)
    },
    parser(declaration, impl) {
      if (declaration.params) collected.push([...declaration.params])
      seams.parser.register(declaration, impl)
    },
    capturer(declaration, impl) {
      if (declaration.params) collected.push([...declaration.params])
      seams.capturer.register(declaration, impl)
    },
    provider(declaration, impl) {
      if (declaration.params) collected.push([...declaration.params])
      seams.provider.register(declaration, impl)
    },
    storage(declaration, impl) {
      if (declaration.params) collected.push([...declaration.params])
      seams.storage.register(declaration, impl)
    },
  }

  // 安装全部插件。顺序即注册顺序——它决定 `descriptors()` 的展示顺序，
  // 也决定抓取器的匹配优先级（web 是兜底，由它自己的 matches 保证）
  installLeg(host)
  installProvider(host)
  installParser(host)
  installCapturer(host)
  // 存储后端的根由宿主注入：`DATA_DIR` 是部署事实，不是设置键
  installStorage(host, { dataDir: env.dataDir })

  // 插件的键收齐了，现在造真正的设置层
  const settings = createSettingsApi({
    store: new SettingsTableStore(),
    registry: createSettingRegistry(collected),
    cipher,
    // 传一份拷贝：设置层不直接读全局 process.env，测试才能构造任意环境
    env: { ...process.env },
  })

  holder.current = settings

  const result: Assembled = {
    settings,
    seams,
    providers: seams.provider,

    /**
     * **存储后端解析一次，之后同步取用。**
     *
     * 为什么要有这一步：调用方（`lib/vault.ts`、`services/avatar.ts` 等）
     * 每次读写文件都要问「现在用哪个后端」。如果每次都重新解析设置、
     * 重新查注册表，那是一次异步往返换一个几乎不变的值——
     * 而写笔记的路径上已经有一次文件写入和一次数据库写入。
     *
     * ## 缓存自己失效，不需要外部通知
     *
     * 先读一次同步快照拿到「现在选的是谁」，与缓存里的 id 比一下：
     * 不同就重新解析。这个比较是一次 Map 查找，比任何 pub/sub 都便宜，
     * 而且**不可能忘记调用失效钩子**——设置层的缓存失效是显式的
     * （`settings.invalidate()`），漏掉它的症状是「改了设置没生效」，
     * 那正是这个项目反复否决的一类现象。让缓存以「当前值」为判据就没有这个问题。
     */
    activeStorage(): StorageBackend {
      // 只读快照，同步。插件在 install 期间就注册好了，所以这里一定能查到
      const requested = resolveBackendId(settings)

      if (storageCache && storageCache.id === requested) return storageCache

      const found = seams.storage.find(requested)
      if (!found) {
        /**
         * **不静默回落到 local。**
         *
         * 回落会让用户的笔记写到一个他以为已经换掉的地方——数据落在哪儿
         * 必须是可以确定回答的问题。这里抛错，并把可选项列出来。
         *
         * 走到这里只有两种可能：设置里存了一个不存在的后端名
         * （校验发生在 core 的键表里，而 core 不认识插件，挡不住名字），
         * 或者那个插件被删掉了。
         */
        const available = seams.storage
          .implementations()
          .map((entry) => entry.declaration.id)
          .join('、')
        throw new Error(
          `存储后端「${requested}」没有对应的实现。可用的有：${available || '（无）'}。` +
            '到设置 › 存储改过来，或检查 storage.backend 环境变量',
        )
      }

      storageCache = found.impl
      return found.impl
    },

    async descriptors() {
      const entries = await settings.entries()
      const byKey = new Map(entries.map((entry) => [entry.key, entry]))

      /**
       * 「这个键有没有人配过」。
       *
       * 判据**不是「值非空」**——默认值也非空。只有界面或环境变量
       * 显式给过值才算配过，否则一个带默认值的必填键会让插件永远显示就绪。
       */
      const isProvided = (key: string): boolean => {
        const entry = byKey.get(key)
        if (!entry) return false
        if (entry.type === 'secret') return entry.configured
        return entry.source !== 'default' && String(entry.value ?? '').trim() !== ''
      }

      /**
       * 给 `unavailable(read)` 的同步读取口。
       *
       * 用 `entries()` 的结果而不是 `settings.get()`——后者是异步的，
       * 而 `computeStatus` 必须同步（它在每次 `/api/config` 上对每条接缝跑一遍）。
       *
       * 这里的值**已经过 `toWire`**（json 类）且密钥类是 null，
       * 但对 `unavailable` 的用途（判断「选中了哪个后端」）完全够用：
       * 它读的是 `storage.backend` 这类标量键。**不要在这里读密钥**——
       * 这个 reader 拿不到明文，密钥要读走 `getSecret`。
       */
      const read: DeclarationReader = {
        get(key: string): SettingValue {
          return (byKey.get(key)?.value ?? null) as SettingValue
        },
      }

      return [
        ...seams.capturer.descriptors(isProvided, read),
        ...seams.parser.descriptors(isProvided, read),
        ...seams.leg.descriptors(isProvided, read),
        ...seams.provider.descriptors(isProvided, read),
        ...seams.storage.descriptors(isProvided, read),
      ]
    },
  }

  assembled = result
  return result
}

/** 测试用：丢掉装配结果，下次调用重新装一遍 */
export function resetAssembly(): void {
  assembled = null
  storageCache = null
}

/**
 * 当前生效的存储后端。**这是宿主读取文件的唯一入口。**
 *
 * 提供模块级函数而不是只挂在 `assemble()` 的返回上：调用方
 * （`lib/vault.ts`、`services/avatar.ts`、`services/capture.ts`、
 * `services/vault-index.ts`）只需要这一个东西，让它们各自
 * `assemble().activeStorage()` 会把装配层这个概念漏进每个服务里。
 */
export function activeStorage(): StorageBackend {
  return assemble().activeStorage()
}

/**
 * 方言感知的**裸 SQL** 执行口。宿主自己需要写方言相关查询时用它。
 *
 * 为什么必须有这个东西：`db`（`db/client.ts`）在 SQLite 路径下**没有
 * `.execute()`**（drizzle 的 better-sqlite3 驱动只有 `.all()` /
 * `.run()`）。直接 `db.execute(sql\`...\`)` 在 PG 上跑得好好的、
 * 在 SQLite 上抛 `is not a function`——而本地开发与桌面端走的正是 SQLite。
 *
 * 这个函数与传给插件的 `PluginDatabase` 是**同一个实现**（那里早就有
 * 这层方言适配），所以两处的行为天生一致。别在别处再写一次
 * `if (dbDriver === 'sqlite')`——方言分支按 D-045 应当点名收敛。
 */
export function executeRaw<T = unknown>(query: unknown): Promise<T[]> {
  return pluginDatabase.execute<T>(query)
}

export type { Assembled }
export type LegRegistry = ReturnType<typeof createSeamHost>['leg']
export type { Capturer, ModelProvider, Parser, RetrievalLeg, StorageBackend }

/** Pure parser module for a terminable worker, resolved only by host assembly. */
export function attachmentParserModuleUrl(): string {
  const compiled = new URL('./attachment-parser.js', import.meta.url)
  return existsSync(compiled)
    ? compiled.href
    : new URL('./attachment-parser.ts', import.meta.url).href
}
