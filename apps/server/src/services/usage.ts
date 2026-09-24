import { and, gte, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { UsageByRole, UsageDay, UsageRecord, UsageSource, UsageStats } from '@mimir/shared'
import { db } from '../db/client.js'
import { usageLog } from '../db/schema.js'
import { assemble } from '../plugins/host.js'

/**
 * 用量记账与聚合（`docs/TECH.md` §12、D-034）。
 *
 * ## 记账必须**旁路**，不能进链路
 *
 * 一条用量记录写不进去，绝不能让问答失败——记账是观测，不是功能。
 * 所以 `record()` 自己吞掉所有错误，只打一条警告。这与「设置覆盖层读不到
 * 表时当作没有覆盖」是同一个判断（`plugins/settings-store.ts`）。
 *
 * 反过来，如果这里抛错，症状会是「偶尔整个问答失败」——而原因（一次
 * 统计写入）与现象（问不出答案）隔了十万八千里，极难现场诊断。
 *
 * ## 为什么 id 用 nanoid 而不是自增
 *
 * 与全仓其它表一致（documents / messages 都是 text id）。混用两种 id 形状
 * 会让「这只是个内部表」成为唯一的解释，而下一个人会以为它有别的含义。
 */

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * 记一次调用。**永不抛错。**
 *
 * `durationMs` 由调用方测量（它知道自己从哪开始算），不在这里算——
 * 记账发生在调用**之后**，在这里开始计时只会得到 0。
 */
export async function record(entry: UsageRecord): Promise<void> {
  try {
    await db.insert(usageLog).values({
      id: `use_${nanoid(12)}`,
      at: new Date(),
      role: entry.role,
      source: entry.source,
      model: entry.model,
      providerId: entry.providerId,
      baseUrlHost: entry.baseUrlHost,
      promptTokens: entry.promptTokens,
      completionTokens: entry.completionTokens,
      totalTokens: entry.totalTokens,
      durationMs: entry.durationMs,
      ok: entry.ok,
      failureKind: entry.failureKind,
      refId: entry.refId,
    })
  } catch (error) {
    // 记账失败不能影响调用方——见文件头部的说明
    console.warn(
      '[usage] 记账失败（不影响本次调用）：',
      error instanceof Error ? error.message : error,
    )
  }
}

/**
 * 从 provider 的 adapter 里取「这次用哪个模型、哪个端点」。
 *
 * 记账需要它，但**它不该让记账变成一次可能失败的调用**——所以整块包在
 * try 里，失败时记空串。空串在统计里显示为「—」，比记一个错的模型名好。
 */
export async function describeModel(role: string): Promise<{
  model: string
  providerId: string
  baseUrlHost: string
}> {
  try {
    const { seams, settings } = assemble()
    const provider = seams.provider.implementations()[0]
    if (!provider) return { model: '', providerId: '', baseUrlHost: '' }

    const adapter = await provider.impl.adapter(role as never)
    const baseUrl = await settings.getString('model.baseUrl')

    return {
      model: adapter.model,
      providerId: provider.declaration.id,
      // 只存主机名，不存完整 URL——路径里可能带密钥（某些网关把 key 放在 path）
      baseUrlHost: safeHost(baseUrl),
    }
  } catch {
    return { model: '', providerId: '', baseUrlHost: '' }
  }
}

/** 从 URL 里取主机名。解析失败返回空串（宁可显示「—」也不要一个错的域名） */
function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/**
 * 只接受真正的有限数字，其余一律当「未知」。
 *
 * 提到模块作用域是为了不每次调用都重建闭包（lint 的
 * `consistent-function-scoping`）。它不捕获任何状态，天然属于这一层。
 */
function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * 从 SDK 的 usage 对象里取三个 token 数。
 *
 * **`null` 与 `0` 必须分开**（`docs/TECH.md` §12.3）：
 * 缺字段是「供应商没回传」，0 是「确实没花」。所以这里用
 * `typeof === 'number'` 判断而不是 `?? 0`。
 *
 * `total` 缺失但分项在是常见情况，所以由调用方按
 * `total ?? (prompt + completion)` 折算——**两边都缺才算未知**。
 */
export function tokenFields(usage: unknown): {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
} {
  const raw = (usage ?? {}) as {
    promptTokens?: unknown
    completionTokens?: unknown
    totalTokens?: unknown
  }

  const promptTokens = finiteOrNull(raw.promptTokens)
  const completionTokens = finiteOrNull(raw.completionTokens)

  return {
    promptTokens,
    completionTokens,
    totalTokens: finiteOrNull(raw.totalTokens),
  }
}

/** 折算出一条记录的「这次花了多少」。未知返回 null，**不返回 0** */
export function effectiveTokens(fields: {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}): number | null {
  if (fields.totalTokens !== null) return fields.totalTokens

  const { promptTokens, completionTokens } = fields
  if (promptTokens === null && completionTokens === null) return null
  return (promptTokens ?? 0) + (completionTokens ?? 0)
}

/* ── 聚合 ─────────────────────────────────────────────── */

/**
 * 时区。**这一条不做就会静默错一格**（`docs/TECH.md` §12.4、§10 的坑表）。
 *
 * 容器默认跑 UTC，而用户在 UTC+8：不显式转时区的话，凌晨 0 点到 8 点的
 * 消耗全算到前一天，热力图整体左移一格，且不报错。
 *
 * `at` 是 `timestamptz`，所以**换时区只是换聚合方式**，历史数据自动跟着
 * 重算，不需要数据迁移。
 */
async function statsTimezone(): Promise<string> {
  try {
    const { settings } = assemble()
    const value = await settings.getString('stats.timezone')
    return value.trim() || 'Asia/Shanghai'
  } catch {
    return 'Asia/Shanghai'
  }
}

/** 该时区下的「今天」。用它算今日/本周/本月，而不是用 UTC 的今天 */
function localDateOf(date: Date, timezone: string): string {
  // en-CA 的日期格式恰好是 YYYY-MM-DD，省掉手工拼装
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function shiftDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const base = Date.UTC(year!, month! - 1, day! + days)
  return new Date(base).toISOString().slice(0, 10)
}

/** 该日期所在周的周一（ISO 周，周一为第一天） */
function startOfWeek(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const utc = new Date(Date.UTC(year!, month! - 1, day!))
  // getUTCDay: 0 = 周日。ISO 周里周日属于上一周的最后一天
  const weekday = utc.getUTCDay()
  return shiftDays(date, -(weekday === 0 ? 6 : weekday - 1))
}

function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`
}

/**
 * 热力图分档的阈值。
 *
 * **按当前范围的分位数算，不用固定阈值**：固定阈值在忙的月份全是最深色、
 * 闲的月份全是浅色，图就没信息了。代价是换范围颜色会变，所以界面上
 * 图例必须标出真实区间（`docs/TECH.md` §12.4）。
 *
 * 取 50 / 75 / 90 分位作为三档边界（四档）。**只在非零值上取分位**——
 * 把大量零值算进去会把阈值压到 0，于是「有一天用了 100 token」变成最深色。
 */
export function quantileThresholds(values: number[]): number[] {
  const nonZero = values.filter((value) => value > 0).toSorted((a, b) => a - b)
  if (nonZero.length === 0) return []

  const at = (q: number): number => {
    const index = Math.min(nonZero.length - 1, Math.floor(q * nonZero.length))
    return nonZero[index] ?? 0
  }

  // 去重：全是一个值时三档会重复，图例里出现三个相同的数字是噪音
  return [...new Set([at(0.5), at(0.75), at(0.9)])]
}

interface DayRow {
  date: string
  tokens: number
  calls: number
  unknown_count: number
}

interface RoleRow {
  role: string
  model: string
  calls: number
  prompt_tokens: number
  completion_tokens: number
  failed: number
  unknown_count: number
  avg_ms: number
}

/**
 * 聚合出统计页需要的全部数字。
 *
 * 三条查询合成一次调用：它们共享同一个时区与范围，分开查会让界面上的
 * 「今日」与热力图的最后一格有机会用不同的口径。
 */
export async function stats(days: number): Promise<UsageStats> {
  const timezone = await statsTimezone()

  const today = localDateOf(new Date(), timezone)
  const from = shiftDays(today, -(days - 1))

  /**
   * 范围下界，用**参数化**的表达式而不是把 `from` 插进字符串。
   *
   * `(($1::date)::timestamp AT TIME ZONE $2)`：`::timestamp` 给的是该日期的
   * 当地零点，再 `AT TIME ZONE` 转成 UTC 时刻。这是「按当地日期切天」的标准
   * 写法，反过来的 `at AT TIME ZONE tz` 是把时刻转成当地的墙上时间。
   */
  const lowerBound = sql`((${from}::date)::timestamp AT TIME ZONE ${timezone})`

  /**
   * 每条记录折算后的 token 数。三列都可空，所以这条表达式同时承担两件事：
   * 折算（`coalesce`）与「是否未知」（`is null`）的判据。
   *
   * `greatest` 包一层是为了让「三列都 null」与「有值」在比较里都得到一致结果，
   * 而真正的未知判据由下面的 `unknown_count` 单独算——**不靠 tokens = 0 推断**。
   */
  const tokensExpr = sql<number>`coalesce(${usageLog.totalTokens}, coalesce(${usageLog.promptTokens}, 0) + coalesce(${usageLog.completionTokens}, 0))`
  const unknownExpr = sql<number>`case when ${usageLog.totalTokens} is null and ${usageLog.promptTokens} is null and ${usageLog.completionTokens} is null then 1 else 0 end`
  const dayExpr = sql<string>`((${usageLog.at} AT TIME ZONE ${timezone})::date)::text`

  /**
   * **按序号分组（`GROUP BY 1`），不重复那个表达式。**
   *
   * 重写一遍表达式看起来更明确，但 Postgres 匹配分组表达式是**按语法树**
   * 来的：drizzle 会把每个插值渲染成独立的占位符（`AT TIME ZONE $1`
   * 在 SELECT 里、`$4` 在 GROUP BY 里），于是两个「相同」的表达式不相等，
   * 报 `column "usage_log.at" must appear in the GROUP BY clause`。
   * 按序号分组绕开整个问题，而且少一次重复。
   */
  const dayRows = (await db
    .select({
      date: dayExpr.as('date'),
      tokens: sql<number>`coalesce(sum(${tokensExpr}), 0)::int`.as('tokens'),
      calls: sql<number>`count(*)::int`.as('calls'),
      unknown_count: sql<number>`coalesce(sum(${unknownExpr}), 0)::int`.as('unknown_count'),
    })
    .from(usageLog)
    .where(gte(usageLog.at, lowerBound))
    .groupBy(sql`1`)
    .orderBy(sql`1`)) as DayRow[]

  const roleRows = (await db
    .select({
      role: usageLog.role,
      model: sql<string>`max(${usageLog.model})`.as('model'),
      calls: sql<number>`count(*)::int`.as('calls'),
      prompt_tokens: sql<number>`coalesce(sum(${usageLog.promptTokens}), 0)::int`.as(
        'prompt_tokens',
      ),
      completion_tokens: sql<number>`coalesce(sum(${usageLog.completionTokens}), 0)::int`.as(
        'completion_tokens',
      ),
      failed: sql<number>`count(*) filter (where not ${usageLog.ok})::int`.as('failed'),
      unknown_count: sql<number>`coalesce(sum(${unknownExpr}), 0)::int`.as('unknown_count'),
      avg_ms: sql<number>`coalesce(avg(${usageLog.durationMs}), 0)::int`.as('avg_ms'),
    })
    .from(usageLog)
    .groupBy(usageLog.role, usageLog.model)
    .orderBy(sql`count(*) desc`)) as RoleRow[]

  /**
   * 四个范围的合计。
   *
   * **一次查询取回全部**再在内存里按日期分桶，而不是发四条 SQL：
   * 行的粒度是天，一年最多 365 行，客户端的算术比四次往返便宜。
   * 而分开查会引入「四条查询之间数据变了」的可能——统计页的数字
   * 互相之间必须自洽。
   */
  const scopeRows = (await db
    .select({
      date: dayExpr.as('date'),
      tokens: sql<number>`coalesce(sum(${tokensExpr}), 0)::int`.as('tokens'),
      calls: sql<number>`count(*)::int`.as('calls'),
    })
    .from(usageLog)
    .groupBy(sql`1`)) as {
    date: string
    tokens: number
    calls: number
  }[]

  const sumRange = (since: string): number =>
    scopeRows.filter((row) => row.date >= since).reduce((total, row) => total + row.tokens, 0)

  const probeRow = await db
    .select({ calls: sql<number>`count(*)::int` })
    .from(usageLog)
    .where(and(sql`${usageLog.source} = 'probe'`))

  const byDay = new Map(dayRows.map((row) => [row.date, row]))

  /**
   * 补齐没有调用的那一天。
   *
   * **必须补齐**：不补的话前端要自己推日期，而「哪些格子该存在」一旦
   * 由两边各自计算，就会出现某天的数据落在网格之外、静默不显示。
   * 补齐后格子数与 `from`/`to` 严格对应。
   */
  const filled: UsageDay[] = []
  for (let offset = 0; offset < days; offset += 1) {
    const date = shiftDays(from, offset)
    const row = byDay.get(date)
    filled.push({
      date,
      tokens: row?.tokens ?? 0,
      calls: row?.calls ?? 0,
      unknownCount: row?.unknown_count ?? 0,
    })
  }

  return {
    timezone,
    from,
    to: today,
    days: filled,
    byRole: roleRows.map((row): UsageByRole => ({
      role: row.role,
      model: row.model,
      calls: row.calls,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      failed: row.failed,
      unknownCount: row.unknown_count,
      avgMs: row.avg_ms,
    })),
    totals: {
      today: sumRange(today),
      week: sumRange(startOfWeek(today)),
      month: sumRange(startOfMonth(today)),
      all: scopeRows.reduce((total, row) => total + row.tokens, 0),
      calls: scopeRows.reduce((total, row) => total + row.calls, 0),
      unknownCount: dayRows.reduce((total, row) => total + row.unknown_count, 0),
      probeCalls: probeRow[0]?.calls ?? 0,
    },
    thresholds: quantileThresholds(filled.map((day) => day.tokens)),
  }
}

export { nowIso }
export type { UsageSource }
