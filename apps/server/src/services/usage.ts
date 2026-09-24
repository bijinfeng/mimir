import { eq, gte, sql } from 'drizzle-orm'
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

interface RoleRow {
  role: string
  model: string
  calls: number | string
  prompt_tokens: number | string
  completion_tokens: number | string
  failed: number | string
  unknown_count: number | string
  avg_ms: number | string
}

/**
 * 某时区下，日期字符串（YYYY-MM-DD）的**当地零点**对应的 UTC 时刻。
 *
 * 做法：先拿该日期正午附近的 UTC 猜值，用 `Intl` 读出那个时刻在目标时区的
 * 墙上时间，墙上时间与 UTC 的差就是偏移量；用偏移量反推当地零点，再校正
 * 一次（DST 切换日两次迭代足够）。
 *
 * 为什么不用 SQL：`AT TIME ZONE` 是 Postgres 方言，SQLite 只有 `strftime`
 * 的固定偏移、不认时区名。切天本来就需要时区语义，放到 **JS 的 Intl** 里，
 * 双后端共用同一份实现（D-045），历史数据也照旧随设置重算。
 */
function tzOffsetMs(instant: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant))
  const get = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')
  const wallAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return wallAsUtc - instant
}

function localMidnightUtc(date: string, timezone: string): number {
  const [year, month, day] = date.split('-').map(Number)
  const guess = Date.UTC(year!, month! - 1, day!)
  let instant = guess - tzOffsetMs(guess, timezone)
  instant = guess - tzOffsetMs(instant, timezone)
  return instant
}

/** 时刻落在范围内的哪一天。starts 升序；早于范围首日返回 null（调用方丢弃） */
function dateOfInstant(ms: number, dates: string[], starts: number[]): string | null {
  let low = 0
  let high = starts.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (starts[mid]! <= ms) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found === -1 ? null : dates[found]!
}

/** 一条记录折算后的 token 数；三列全空返回 null（=「未知」，≠ 0） */
function rowTokens(row: {
  totalTokens: number | null
  promptTokens: number | null
  completionTokens: number | null
}): number | null {
  return effectiveTokens(row)
}

/** 可移植的 token 合计表达式：sum 在 PG 返回 bigint（字符串）、SQLite 返回 number，统一 Number() 收敛 */
const tokensSumExpr = sql<number>`coalesce(sum(coalesce(${usageLog.totalTokens}, coalesce(${usageLog.promptTokens}, 0) + coalesce(${usageLog.completionTokens}, 0))), 0)`

/** 统计「三列全 null」（供应商没回传）的可移植表达式 */
const unknownCountExpr = sql<number>`coalesce(sum(case when ${usageLog.totalTokens} is null and ${usageLog.promptTokens} is null and ${usageLog.completionTokens} is null then 1 else 0 end), 0)`

async function sumTokensSince(instant: Date | null): Promise<number> {
  const query = db.select({ tokens: tokensSumExpr }).from(usageLog)
  const rows = instant ? await query.where(gte(usageLog.at, instant)) : await query
  return Number(rows[0]?.tokens ?? 0)
}

/**
 * 聚合出统计页需要的全部数字。
 *
 * 按**天**的部分（热力图与填充）把范围内的记录取回后在 JS 里分桶——
 * 「某时刻属于哪个当地日期」是时区语义，`Intl` 是唯一双方言都正确的实现；
 * 按**合计/角色**的部分是纯标量聚合（sum / count / avg / filter），
 * drizzle 构建器在两个方言下生成同义 SQL，留在 SQL 里。
 *
 * 原先按天分组的那条 SQL（`AT TIME ZONE` + `GROUP BY 1`）是全仓最脆的一段：
 * drizzle 把重复表达式渲染成不同占位符，两个「相同」的表达式不相等，
 * 只能按序号分组绕开（当时的注释记录过这个坑）。JS 分桶把整个问题连根移走。
 *
 * 「今日 / 本周 / 本月」各发一条小聚合而不是取回全量再算：行粒度是
 * 一次模型调用，全年可能数万行，按需聚合比全量拉回便宜；
 * 数字之间的自洽性由「同一次调用内完成」保证（与原先一致）。
 */
export async function stats(days: number): Promise<UsageStats> {
  const timezone = await statsTimezone()

  const today = localDateOf(new Date(), timezone)
  const from = shiftDays(today, -(days - 1))

  const dates: string[] = []
  const starts: number[] = []
  for (let offset = 0; offset < days; offset += 1) {
    const date = shiftDays(from, offset)
    dates.push(date)
    starts.push(localMidnightUtc(date, timezone))
  }

  const rangeRows = await db
    .select({
      at: usageLog.at,
      totalTokens: usageLog.totalTokens,
      promptTokens: usageLog.promptTokens,
      completionTokens: usageLog.completionTokens,
    })
    .from(usageLog)
    .where(gte(usageLog.at, new Date(starts[0]!)))

  /**
   * 补齐没有调用的那一天。
   *
   * **必须补齐**：不补的话前端要自己推日期，而「哪些格子该存在」一旦
   * 由两边各自计算，就会出现某天的数据落在网格之外、静默不显示。
   * 补齐后格子数与 `from`/`to` 严格对应。
   */
  const byDay = new Map(dates.map((date) => [date, { tokens: 0, calls: 0, unknown: 0 }]))
  for (const row of rangeRows) {
    const date = dateOfInstant(row.at.getTime(), dates, starts)
    const bucket = date ? byDay.get(date) : undefined
    if (!bucket) continue
    bucket.calls += 1
    const tokens = rowTokens(row)
    if (tokens === null) bucket.unknown += 1
    else bucket.tokens += tokens
  }

  const filled: UsageDay[] = dates.map((date) => {
    const bucket = byDay.get(date)!
    return { date, tokens: bucket.tokens, calls: bucket.calls, unknownCount: bucket.unknown }
  })

  const roleRows = (await db
    .select({
      role: usageLog.role,
      model: sql<string>`max(${usageLog.model})`,
      calls: sql<number>`count(*)`,
      prompt_tokens: sql<number>`coalesce(sum(${usageLog.promptTokens}), 0)`,
      completion_tokens: sql<number>`coalesce(sum(${usageLog.completionTokens}), 0)`,
      failed: sql<number>`count(*) filter (where not ${usageLog.ok})`,
      unknown_count: unknownCountExpr,
      avg_ms: sql<number>`coalesce(avg(${usageLog.durationMs}), 0)`,
    })
    .from(usageLog)
    .groupBy(usageLog.role, usageLog.model)
    .orderBy(sql`count(*) desc`)) as RoleRow[]

  const [allRow] = await db
    .select({ tokens: tokensSumExpr, calls: sql<number>`count(*)` })
    .from(usageLog)
  const [probeRow] = await db
    .select({ calls: sql<number>`count(*)` })
    .from(usageLog)
    .where(eq(usageLog.source, 'probe'))
  const [todayTokens, weekTokens, monthTokens] = await Promise.all([
    sumTokensSince(new Date(localMidnightUtc(today, timezone))),
    sumTokensSince(new Date(localMidnightUtc(startOfWeek(today), timezone))),
    sumTokensSince(new Date(localMidnightUtc(startOfMonth(today), timezone))),
  ])

  return {
    timezone,
    from,
    to: today,
    days: filled,
    byRole: roleRows.map((row): UsageByRole => ({
      role: row.role,
      model: row.model,
      calls: Number(row.calls),
      promptTokens: Number(row.prompt_tokens),
      completionTokens: Number(row.completion_tokens),
      failed: Number(row.failed),
      unknownCount: Number(row.unknown_count),
      avgMs: Number(row.avg_ms),
    })),
    totals: {
      today: todayTokens,
      week: weekTokens,
      month: monthTokens,
      all: Number(allRow?.tokens ?? 0),
      calls: Number(allRow?.calls ?? 0),
      unknownCount: filled.reduce((total, day) => total + day.unknownCount, 0),
      probeCalls: Number(probeRow?.calls ?? 0),
    },
    thresholds: quantileThresholds(filled.map((day) => day.tokens)),
  }
}

export { nowIso }
export type { UsageSource }
