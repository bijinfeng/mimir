import type { SettingSpec } from '@mimir/shared'

export type { SettingSpec }

/**
 * 宿主的核心键表 + 插件自带键的合并（`docs/TECH.md` §7.5）。
 *
 * ## 为什么键必须在代码里注册
 *
 * 一条键只有注册过，才允许被写入。少这一层的话，界面上能存进
 * 一个没有任何代码读的值——用户以为改了行为，实际什么都没发生，
 * 而且没有任何症状。WeKnora 的 `settingSpec` 是同一个做法
 * （`RESEARCH.md` §1.5）。
 *
 * ## 什么键**不**该进来
 *
 * 端口、数据目录、数据库地址、认证密钥一律不进：它们改了就重启不了，
 * 出现在界面上是假表单——M0 设置页已经用「不画存不进去的表单」否决过
 * 这类东西。**「可写」只应当覆盖真的能生效的键。**
 *
 * ## 插件自带的键
 *
 * 插件在自己的声明里给 `params`，core 在装配时用 `withPluginParams`
 * 把它们并进来。这样「加一个检索通道＝加一个文件」在配置层也成立，
 * 不需要回来改这份表。
 */

/** 数值范围的通用校验：越界值往往是「少打一个 0」这类错误，静默接受很难查 */
export function range(min: number, max: number) {
  return (value: string | number | boolean): string | null => {
    const n = Number(value)
    if (!Number.isFinite(n)) return '必须是数字'
    if (n < min || n > max) return `必须在 ${min} 到 ${max} 之间`
    return null
  }
}

/**
 * **宿主自己的键**：检索编排参数、分块参数。
 *
 * ## 归属规则：谁读它，谁声明
 *
 * | 前缀 | 谁声明 | 为什么 |
 * |---|---|---|
 * | `model.*` | `plugins/provider/` | 是那个适配器的参数，换 provider 就换一套 |
 * | `capture.*` | `plugins/capturer/` | 抓取的超时与上限，抓取器自己用 |
 * | `retrieval.<id>.weight` | `plugins/leg/` | 每个通道自己的权重 |
 * | `retrieval.rrfK` 等 | **这里** | 融合与编排是宿主的决定，不属于任何通道 |
 * | `parser.chunk.*` | 这里 | 分块是宿主的写入路径（M1-B 实现） |
 *
 * 重复声明会在装配时报错（`SettingRegistry` 的构造函数），不静默覆盖——
 * 两个实现声明同一个键说明其中一个写错了，那正是这次重构要消灭的
 * 「两处各说各话」。
 */
export const CORE_SETTING_SPECS: readonly SettingSpec[] = [
  /* ── 检索 ─────────────────────────────────────────── */
  {
    key: 'retrieval.rrfK',
    label: 'RRF k',
    description: '融合公式 weight/(k+rank) 里的 k。60 是原论文取值，作用是压低头部名次的绝对优势',
    group: 'retrieval',
    type: 'number',
    envName: 'RETRIEVAL_RRF_K',
    defaultValue: 60,
    rebuild: 'none',
    validate: range(1, 1000),
  },
  {
    key: 'retrieval.perLegLimit',
    label: '每通道候选数',
    description: '每个通道各取这么多候选再融合。取得比最终结果多，融合才有意义',
    group: 'retrieval',
    type: 'number',
    envName: 'RETRIEVAL_PER_LEG_LIMIT',
    defaultValue: 50,
    rebuild: 'none',
    validate: range(5, 500),
  },
  {
    key: 'retrieval.maxChunksPerDoc',
    label: '每篇最多引用块数',
    description: '防止一篇长文霸占全部上下文。命中同一篇的相邻分块会先合并再计数',
    group: 'retrieval',
    type: 'number',
    envName: null,
    defaultValue: 3,
    rebuild: 'none',
    validate: range(1, 20),
  },

  /* ── 分块（parser 接缝的参数）───────────────────────── */
  {
    key: 'parser.chunk.size',
    label: '分块大小',
    description: '每块的目标字符数。太小会切断上下文，太大会稀释语义。改了要重建分块',
    group: 'parser',
    type: 'number',
    envName: null,
    defaultValue: 500,
    rebuild: 'chunks',
    validate: range(100, 4000),
  },
  {
    key: 'parser.chunk.overlap',
    label: '分块重叠',
    description: '相邻块的重叠字符数，让跨块边界的内容不至于两边都丢。改了要重建分块',
    group: 'parser',
    type: 'number',
    envName: null,
    defaultValue: 80,
    rebuild: 'chunks',
    validate: range(0, 1000),
  },
]

/**
 * 键表：核心键 + 插件自带的键，合并成一个只读的查询接口。
 *
 * **重复键在装载时报错**，不静默覆盖：两个实现声明同一个键，说明
 * 其中一个写错了（或它们本该共用一个键）——那正是这次重构要消灭的
 * 「两处各说各话」。
 */
export class SettingRegistry {
  private readonly byKey = new Map<string, SettingSpec>()

  constructor(specs: readonly SettingSpec[]) {
    for (const spec of specs) {
      if (this.byKey.has(spec.key)) {
        throw new Error(`配置键重复定义：${spec.key}（核心键表与插件声明的键不允许重名）`)
      }
      this.byKey.set(spec.key, spec)
    }
  }

  find(key: string): SettingSpec | undefined {
    return this.byKey.get(key)
  }

  all(): SettingSpec[] {
    // 按 key 排序，保证设置页的行序稳定（与插件注册顺序无关）
    return [...this.byKey.values()].toSorted((a, b) => a.key.localeCompare(b.key))
  }

  withPrefix(prefix: string): SettingSpec[] {
    return this.all().filter((spec) => spec.key.startsWith(prefix))
  }
}

export function createSettingRegistry(pluginParams: readonly SettingSpec[][]): SettingRegistry {
  return new SettingRegistry([...CORE_SETTING_SPECS, ...pluginParams.flat()])
}
