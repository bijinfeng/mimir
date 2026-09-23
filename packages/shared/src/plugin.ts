import type { PluginDescriptor, PluginSeam, PluginStatus, SettingSpec } from './config.js'
import type { Capturer, ModelProvider, Parser, RetrievalLeg } from './seams.js'

/**
 * 插件契约：**宿主交给插件的东西**，以及插件对宿主的声明。
 *
 * ## 为什么契约放在 shared，而不是 core
 *
 * 依赖方向必须是：`插件 → shared`、`core → shared + 插件`。
 * 如果契约放在 core，插件就要 import core，而 core 又要 import 插件来组注册表——
 * 形成包级循环。放在 shared（只有 zod 一个依赖的契约包）里，这个环就不存在。
 *
 * ## 插件的两副面孔
 *
 * | | 给谁看 | 在哪 |
 * |---|---|---|
 * | **运行接口**（各接缝自有形状） | 编排层 | `seams.ts`（`leg.run` / `capturer.run` …） |
 * | **声明**（四条接缝共用一个形状） | 设置页、`/api/config` | 本文件 `PluginDeclaration` |
 *
 * 分开的理由：声明必须能在**没有数据库**的环境里构造（测试、构建期、前端）。
 * 把 `run` 塞进声明会让 `/api/config` 与设置页间接拖进数据库连接。
 */

export type { PluginSeam, PluginStatus }

/**
 * 插件对宿主的声明。**是数据，不是代码**——它要能在没有数据库的环境里求值。
 *
 * 可用性不在这里写死，而是由两个可选字段描述，由 core 统一算出最终状态：
 *
 * | 字段 | 含义 | 算出来的状态 |
 * |---|---|---|
 * | `requires` | 缺这些设置键就不能干活 | `needs-config`（reason 列出缺的键） |
 * | `unavailable()` | 代码在、配置也可能齐，但就是干不了（如探测失败） | `unavailable` |
 *
 * **为什么状态由 core 算而不是各实现自己写**：把「缺配置」这个最常见的情况
 * 收敛成一条规则，就不会出现八个实现各自编八种理由。实现只需要声明
 * 它依赖什么，而 `unavailable()` 留给真正需要自定义判断的那几个
 * （见 `docs/TECH.md` §7.4）。
 */
export interface PluginDeclaration {
  seam: PluginSeam
  /** 稳定 id。会写进 `matchedBy` 与 URL，改名等于破坏契约 */
  id: string
  name: string
  description: string
  /** 仓库相对路径。「要改这个实现，去改这个文件」——设置页的核心价值 */
  file: string
  /** 这个实现读哪些设置键。反查「改了 X 会影响谁」 */
  configKeys: readonly string[]
  /**
   * 这个实现**自带**的配置键定义。它会被并进全局键表，所以加一个实现
   * 不需要回来改核心的键表——「加一个实现＝加一个文件」在配置层也成立。
   *
   * 只声明这个实现真正拥有的参数（如通道权重）。跨实现共享的键
   * （如 `model.baseUrl`）由宿主的核心键表提供，实现只在 `requires` 里引用。
   */
  params?: readonly SettingSpec[]
  /** 缺任一个就不能干活。core 据此算出 `needs-config` */
  requires?: readonly string[]
  /** 代码在但不能干活的其它原因。返回 null 表示没有额外阻塞 */
  unavailable?: () => string | null
}

/* ── 宿主交给插件的东西 ───────────────────────────────── */

/**
 * 宿主交给插件的数据库句柄。
 *
 * **刻意只暴露 `execute`**：插件需要的是「跑一条查询」，不是宿主的 schema、
 * 迁移或事务编排。收窄成这个方法，插件就不可能悄悄依赖宿主的表结构，
 * 也不可能替宿主做业务写入——那是 core 与 service 的职责。
 *
 * 参数与返回值都是 `unknown`：drizzle 的 `sql` 模板对插件是透明的，
 * 宿主在装配处把真实的 db 传进来（那里做一次类型断言）。
 */
export interface PluginDatabase {
  execute<T = unknown>(query: unknown): Promise<T[]>
}

/** 插件读配置的方式。与设置页共用同一套解析结果（`docs/TECH.md` §7.5） */
export interface PluginSettings {
  getNumber(key: string): Promise<number>
  getString(key: string): Promise<string>
  getBoolean(key: string): Promise<boolean>
  /** 密钥类：拿明文。只在**即将发请求**的那一刻调用，不要缓存 */
  getSecret(key: string): Promise<{ ok: true; value: string } | { ok: false; reason: string }>
}

/**
 * 一条接缝的注册表。
 *
 * `register` 同时收下声明与实现：这样「注册表里有实现」与
 * 「设置页里有这一行」是同一件事，不会各说各话——那正是这次重构的起因
 * （`docs/DECISIONS.md` D-030）。
 */
export interface Registry<TImpl> {
  /** 注册一个实现。id 重复会在注册时报错，而不是静默覆盖 */
  register(declaration: PluginDeclaration, impl: TImpl): void
  /** 规划中的条目：出现在设置页，但不进编排（编排拿不到实现就只能编个空壳） */
  plan(declaration: PluginDeclaration): void
  /** 活的实现。顺序即注册顺序 */
  implementations(): readonly RegisteredPlugin<TImpl>[]
  /** 按 id 取。找不到返回 undefined，由调用方决定是降级还是报错 */
  find(id: string): RegisteredPlugin<TImpl> | undefined
  /** 给设置页与 `/api/config`：活的 + 规划中的，都带上算好的状态 */
  descriptors(isProvided: (key: string) => boolean): PluginDescriptor[]
}

export interface RegisteredPlugin<TImpl> {
  declaration: PluginDeclaration
  impl: TImpl
}

/**
 * 宿主交给**插件入口**的东西：数据、配置、以及四条接缝的注册口。
 *
 * ## 插件只需要实现一个函数
 *
 * ```ts
 * // plugins/leg/src/index.ts
 * export function install(host: PluginHost): void {
 *   host.leg(declaration, createKeywordLeg(host.db))
 * }
 * ```
 *
 * 这就是全部的插件协议。没有生命周期钩子、没有依赖注入容器、没有配置文件——
 * 那些是插件**框架**的东西，而这里要的是「加一个实现＝加一个文件」
 * （`docs/DECISIONS.md` D-007 与 D-031）。
 *
 * ## 为什么按接缝分方法，而不是一个通用的 `register(seam, ...)`
 *
 * 通用签名会让实现参数退化成 `unknown`，插件作者要靠读文档才知道该传什么；
 * 按接缝分方法后，类型检查直接告诉他。代价是宿主多四个方法，
 * 而那四个方法各自只有一行。
 */
export interface PluginHost {
  readonly db: PluginDatabase
  readonly settings: PluginSettings
  /**
   * 声明**包级**配置键：一个插件包里多个实现共用同一组键时用它。
   *
   * 不这么做的话，三个抓取器各声明一份 `capture.maxBytes` 就会撞
   * 「键重复定义」——而那个检查是对的（两份定义说明有人写错了）。
   * 让共用的键归属于**包**而不是某个实现，冲突就消失了，语义也更准：
   * 「抓取超时」是抓取这件事的参数，不属于微信公众号或 GitHub 任何一个。
   *
   * 实现自己独占的键仍然写在 `declaration.params` 里（如每个通道的权重）。
   */
  params(specs: readonly SettingSpec[]): void
  /** 注册一个检索通道 */
  leg(declaration: PluginDeclaration, impl: RetrievalLeg): void
  /** 注册一个解析器 */
  parser(declaration: PluginDeclaration, impl: Parser): void
  /** 注册一个抓取器 */
  capturer(declaration: PluginDeclaration, impl: Capturer): void
  /** 注册一个模型提供方 */
  provider(declaration: PluginDeclaration, impl: ModelProvider): void
}

/** 一个插件包的入口。`install` 收到宿主，把自己注册进去 */
export type PluginInstaller = (host: PluginHost) => void
