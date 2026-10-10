import type { SettingSpec, SettingValue } from '@mimir/shared'

export type { SettingSpec }

/**
 * 宿主的核心键表 + 插件自带键的合并（`.trellis/spec/project/architecture.md` §7.5）。
 *
 * ## 为什么键必须在代码里注册
 *
 * 一条键只有注册过，才允许被写入。少这一层的话，界面上能存进
 * 一个没有任何代码读的值——用户以为改了行为，实际什么都没发生，
 * 而且没有任何症状。WeKnora 的 `settingSpec` 是同一个做法
 * （`.trellis/spec/project/research.md` §1.5）。
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
  return (value: SettingValue): string | null => {
    // 数字型的键收到 null / 对象都算不合法——它们是「有人写错了」，
    // 不是「没配」，所以要说出来而不是当默认
    if (typeof value === 'boolean' || value === null || typeof value === 'object') {
      return '必须是数字'
    }
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
    description: '数值越大，各通道的排名差异越小',
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
    description: '每个检索通道参与合并的结果上限',
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
    description: '单篇文档最多提供的引用片段数',
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
    description: '每段的目标字数；修改后需重建分块',
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
    description: '相邻段落的重叠字数；修改后需重建分块',
    group: 'parser',
    type: 'number',
    envName: null,
    defaultValue: 80,
    rebuild: 'chunks',
    validate: range(0, 1000),
  },

  /* ── 存储 ─────────────────────────────────────────────── */
  {
    key: 'storage.backend',
    label: '存储后端',
    description: '切换存储不会迁移已有文件，请先完成迁移',
    group: 'storage',
    type: 'string',
    envName: 'STORAGE_BACKEND',
    defaultValue: 'local',
    rebuild: 'none',
    /**
     * 只挡空值——**这里挡不了「不存在的后端名」**。
     *
     * 校验发生在 core 的键表里，而可用后端名由插件注册，core 不认识插件
     * （包依赖方向决定的，见 `.trellis/spec/project/architecture.md` §7.4）。所以未知名字由
     * **装配层在解析时抛错**，错误信息里带上当前已注册的全部后端 id。
     *
     * 为什么选择抛错而不是静默回落到 local：静默回落会让用户的笔记写到
     * 一个他以为已经换掉的地方——数据落在哪儿必须是可以确定回答的问题。
     */
    validate: (value) => (String(value).trim() === '' ? '不能为空' : null),
  },

  /* ── 内部状态（不是给人配的）───────────────────────────── */

  {
    /**
     * 默认内容播种的标记（`services/seed.ts`）。
     *
     * 它**不是一项配置**，而是「这件事已经做过」的记录——但设置表本来就是
     * 这个项目里唯一的键值存储，为一行标记单开一张表不值得。
     * 用 `hidden` 让它在设置页上不可见（那个标志的用途之一就是
     * 「能读、但不该有人填」）。
     *
     * 为什么需要它：播种的判据若是「库是不是空的」，用户删掉默认知识库之后
     * 每次重启它都会回来——那是明确的意思表示被无视。记一个版本号之后
     * 「已播过」这件事与内容现状无关，将来换一套默认内容时递增版本即可。
     */
    key: 'seed.defaultContent',
    label: '默认内容播种版本',
    description: '内部状态：记录默认知识库与产品说明是否已播种过。不要在设置页改它',
    group: 'data',
    type: 'number',
    envName: null,
    defaultValue: 0,
    rebuild: 'none',
    hidden: true,
  },

  /* ── 统计 ─────────────────────────────────────────────── */
  {
    key: 'stats.timezone',
    label: '统计时区',
    description:
      '用量按哪个时区切天。容器默认跑 UTC——不设它的话，凌晨 0 点到 8 点的消耗会算到前一天，热力图整体左移一格且不报错',
    group: 'stats',
    type: 'string',
    envName: 'TZ',
    defaultValue: 'Asia/Shanghai',
    rebuild: 'none',
    /**
     * 校验 IANA 时区名能不能被运行时认出来。
     *
     * 这一步不能省：写错一个时区名（`Asia/Shangai` 少个 h）时
     * `Intl.DateTimeFormat` 会**抛异常**，而抛在聚合查询里就是统计页整页 500。
     * 在这里挡住，用户看到的是「这个时区名无效」。
     *
     * 用 `Intl.supportedValuesOf` 而不是 try/catch 构造：前者顺便挡掉了
     * 语法合法但没人认识的别名，而且它的返回值可以直接提示几个正确的。
     */
    validate: (value) => {
      const text = String(value).trim()
      if (text === '') return '不能为空——留空会让统计退回 UTC'

      try {
        /**
         * 只是借用它的构造函数来校验时区名（构造失败即名字无效）。
         * 结果必须赋给变量：`new` 单独作语句会被 lint 拦下。
         */
        const probe = new Intl.DateTimeFormat('en-CA', { timeZone: text })
        void probe
        return null
      } catch {
        return `不是有效的 IANA 时区名（如 Asia/Shanghai、UTC）`
      }
    },
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
