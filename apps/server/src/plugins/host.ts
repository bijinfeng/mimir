import {
  createSecretCipher,
  createSeamHost,
  createSettingRegistry,
  createSettingsApi,
} from '@mimir/core'
import type {
  Capturer,
  ModelProvider,
  Parser,
  PluginHost,
  PluginSettings,
  RetrievalLeg,
  SettingSpec,
} from '@mimir/shared'
import { install as installCapturer } from '@mimir/plugin-capturer'
import { install as installLeg } from '@mimir/plugin-leg'
import { install as installParser } from '@mimir/plugin-parser'
import { install as installProvider } from '@mimir/plugin-provider'
import { db } from '../db/client.js'
import { env } from '../env.js'
import { SettingsTableStore } from './settings-store.js'

/**
 * **装配层：全仓唯一同时知道「宿主」与「插件」的地方。**
 *
 * 这个文件的存在本身就是架构的落点（`docs/TECH.md` §7）：
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
 */
const pluginDatabase = {
  async execute<T = unknown>(query: unknown): Promise<T[]> {
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
    getSecret: (key) => resolve().getSecret(key),
  }
}

interface Assembled {
  settings: ReturnType<typeof createSettingsApi>
  seams: ReturnType<typeof createSeamHost>
  /** 全部插件的声明（活的 + 规划中），带算好的状态。设置页与 `/api/config` 用它 */
  descriptors(): Promise<ReturnType<ReturnType<typeof createSeamHost>['leg']['descriptors']>>
}

let assembled: Assembled | null = null

/** 装配一次并复用。它持有设置缓存，每次请求重建会让缓存永远命中不了 */
export function assemble(): Assembled {
  if (assembled) return assembled

  const seams = createSeamHost()
  const holder: SettingsHolder = { current: null }
  const collected: SettingSpec[][] = []

  const host: PluginHost = {
    db: pluginDatabase,
    settings: holderSettings(holder),

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
  }

  // 安装全部插件。顺序即注册顺序——它决定 `descriptors()` 的展示顺序，
  // 也决定抓取器的匹配优先级（web 是兜底，由它自己的 matches 保证）
  installLeg(host)
  installProvider(host)
  installParser(host)
  installCapturer(host)

  // 插件的键收齐了，现在造真正的设置层
  const settings = createSettingsApi({
    store: new SettingsTableStore(),
    registry: createSettingRegistry(collected),
    cipher: createSecretCipher(env.authSecret),
    // 传一份拷贝：设置层不直接读全局 process.env，测试才能构造任意环境
    env: { ...process.env },
  })

  holder.current = settings

  const result: Assembled = {
    settings,
    seams,

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

      return [
        ...seams.capturer.descriptors(isProvided),
        ...seams.parser.descriptors(isProvided),
        ...seams.leg.descriptors(isProvided),
        ...seams.provider.descriptors(isProvided),
      ]
    },
  }

  assembled = result
  return result
}

/** 测试用：丢掉装配结果，下次调用重新装一遍 */
export function resetAssembly(): void {
  assembled = null
}

export type { Assembled }
export type LegRegistry = ReturnType<typeof createSeamHost>['leg']
export type { Capturer, ModelProvider, Parser, RetrievalLeg }
