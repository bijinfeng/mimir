import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { USAGE_HISTORY_DAYS } from '@mimir/shared'
import { db } from '../db/client.js'
import { settings, usageLog } from '../db/schema.js'
import {
  effectiveTokens,
  quantileThresholds,
  record,
  stats,
  tokenFields,
} from '../services/usage.js'
import { app, getAuthCookie, makeClient } from './helpers.js'

/**
 * 用量记账的行为断言（`.trellis/spec/project/decisions.md` D-034 的四条验证方式）。
 *
 * ## 为什么这四条
 *
 * 记账的两个失效模式都是**静默**的：
 *
 *  1. 记不上（`null` 被当成 `0`）→ 统计页显示「今天 0 token」，
 *     而那天明明调了 8 次。这是一个确定的谎言
 *  2. 时区错 → 图整体左移一格，不报错。而「图看起来有点怪」是最难
 *     被当成 bug 报出来的症状
 *
 * 所以断言落在可复算的性质上：null 与 0 可区分、时区切天正确、
 * 失败也入账、聚合与热力图同源。**跑一遍看着对**在这里不够——
 * 一条数据看起来怎么都对。
 */

/**
 * 直接写一条记录。不走 `record()` 之外的路：`at` 需要精确控制
 * （测时区必须给一个跨日界的时刻），而 `record()` 固定用 `new Date()`。
 */
async function seed(
  rows: {
    at: Date
    role?: string
    source?: string
    prompt?: number | null
    completion?: number | null
    total?: number | null
    ok?: boolean
  }[],
): Promise<void> {
  await db.insert(usageLog).values(
    rows.map((row, index) => ({
      id: `use_test_${Date.now()}_${index}`,
      at: row.at,
      role: row.role ?? 'chat',
      source: row.source ?? 'chat',
      model: 'test-model',
      providerId: 'test',
      baseUrlHost: 'example.com',
      promptTokens: row.prompt ?? null,
      completionTokens: row.completion ?? null,
      totalTokens: row.total ?? null,
      durationMs: 100,
      ok: row.ok ?? true,
      failureKind: row.ok === false ? 'timeout' : null,
      refId: null,
    })),
  )
}

beforeAll(async () => {
  // 别的测试文件可能已经写过日志，先清干净，断言才不受顺序影响
  await db.delete(usageLog)
})

/** `YYYY-MM-DD` 加减天数。测试里用来推「次日」 */
function shiftIso(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10)
}

describe('token 字段的折算', () => {
  it('三列都缺 → 未知（null），不是 0', () => {
    const fields = tokenFields(undefined)
    expect(fields).toEqual({ promptTokens: null, completionTokens: null, totalTokens: null })
    // 这一条是整个设计的关键：未知与零必须能分开
    expect(effectiveTokens(fields)).toBeNull()
  })

  it('total 缺失但分项在 → 折算成分项之和', () => {
    // 「total 缺失」是常见情况，不该白扔
    expect(effectiveTokens({ promptTokens: 100, completionTokens: 20, totalTokens: null })).toBe(
      120,
    )
  })

  it('确实为零与未知是两回事', () => {
    // 供应商报了 0（真实的一次零消耗调用）
    expect(effectiveTokens({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })).toBe(0)
    // 供应商什么都没报
    expect(effectiveTokens({ promptTokens: null, completionTokens: null, totalTokens: null })).toBe(
      null,
    )
  })

  it('非数字的值一律当未知，不当 0', () => {
    // SDK 不同版本可能给 undefined / 字符串，硬转成 0 会污染统计
    const fields = tokenFields({
      promptTokens: undefined,
      completionTokens: '12',
      totalTokens: NaN,
    })
    expect(fields.totalTokens).toBeNull()
    expect(fields.promptTokens).toBeNull()
    expect(fields.completionTokens).toBeNull()
  })
})

describe('分档阈值', () => {
  it('只在非零值上取分位', () => {
    /**
     * 把大量零值算进去会把阈值压到 0，于是「有一天用了 100 token」
     * 变成最深色——分档就失去了意义。
     */
    const values = [0, 0, 0, 0, 0, 0, 0, 0, 100, 200, 300, 400]
    const thresholds = quantileThresholds(values)
    expect(thresholds.length).toBeGreaterThan(0)
    for (const threshold of thresholds) expect(threshold).toBeGreaterThan(0)
  })

  it('没有任何用量时返回空数组（界面上显示「范围内还没有用量」）', () => {
    expect(quantileThresholds([0, 0, 0])).toEqual([])
  })

  it('全是同一个值时不产生重复档位', () => {
    // 三个相同的数字出现在图例里是噪音
    expect(quantileThresholds([5, 5, 5, 5])).toEqual([5])
  })

  it('阈值升序', () => {
    const thresholds = quantileThresholds([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    for (let i = 1; i < thresholds.length; i += 1) {
      expect(thresholds[i]!).toBeGreaterThanOrEqual(thresholds[i - 1]!)
    }
  })
})

describe('聚合与时区', () => {
  it('按 Asia/Shanghai 切天——UTC 17:30 属于次日', async () => {
    /**
     * **这是最容易悄悄错的一条。** 容器默认跑 UTC，而用户在 UTC+8：
     *
     *   UTC 某日 17:30  =  北京次日 01:30
     *
     * 不显式转时区的话这一条会落在当天，热力图整体左移一格，且不报错。
     *
     * 日期由「今天往前 10 天」算出（固定写死会随日历漂出 370 天的窗口，
     * 而那时断言失败看起来像时区算错了，实际只是范围没盖到）。
     */
    await db.delete(usageLog)

    const utcDay = new Date()
    utcDay.setUTCDate(utcDay.getUTCDate() - 10)
    const stamp = utcDay.toISOString().slice(0, 10)

    // 该 UTC 日期的 17:30 = 北京次日 01:30
    await seed([{ at: new Date(`${stamp}T17:30:00Z`), total: 1000, prompt: 800, completion: 200 }])

    const result = await stats(370)

    const nextDay = shiftIso(stamp, 1)
    const sameDay = result.days.find((day) => day.date === stamp)

    expect(
      result.days.find((day) => day.date === nextDay)?.tokens,
      `UTC ${stamp} 17:30 应算在北京的 ${nextDay}`,
    ).toBe(1000)
    expect(sameDay?.tokens, `落在 UTC 的 ${stamp} 就是时区没转`).toBe(0)
  })

  it('无调用但有用量的日子补齐成 0 调用', async () => {
    // 补齐是必需的：不补的话前端要自己推日期，格子可能与数据错位
    await db.delete(usageLog)
    await seed([{ at: new Date(), total: 500 }])

    const result = await stats(30)
    expect(result.days).toHaveLength(30)
    expect(result.days.at(-1)?.tokens).toBe(500)
    expect(result.days[0]?.tokens).toBe(0)
    expect(result.days[0]?.calls).toBe(0)
  })

  it('未上报的用量单独计数，不混进 token 合计', async () => {
    /**
     * 这是「null ≠ 0」在聚合层的断言：3 次调用都没 usage，
     * 结果必须是 tokens=0 且 unknownCount=3——而不是两者都 0
     * （那会让界面把「未知」画成「没有」）。
     */
    await db.delete(usageLog)
    await seed([
      { at: new Date(), prompt: null, completion: null, total: null },
      { at: new Date(), prompt: null, completion: null, total: null },
      { at: new Date(), prompt: null, completion: null, total: null },
    ])

    const result = await stats(7)
    const today = result.days.at(-1)

    expect(today?.calls).toBe(3)
    expect(today?.tokens).toBe(0)
    expect(today?.unknownCount, '三次未上报必须被数出来').toBe(3)
    expect(result.totals.unknownCount).toBe(3)
  })

  it('按角色分组，模型名与失败数都在', async () => {
    await db.delete(usageLog)
    await seed([
      { at: new Date(), role: 'chat', prompt: 100, completion: 50, total: 150 },
      { at: new Date(), role: 'chat', prompt: 100, completion: 50, total: 150, ok: false },
      { at: new Date(), role: 'embed', prompt: 400, completion: null, total: 400 },
    ])

    const result = await stats(7)
    const chat = result.byRole.find((row) => row.role === 'chat')
    const embed = result.byRole.find((row) => row.role === 'embed')

    expect(chat?.calls).toBe(2)
    expect(chat?.failed, '失败的调用也要出现在分组里').toBe(1)
    expect(chat?.promptTokens).toBe(200)
    expect(embed?.calls).toBe(1)
  })

  it('probe 单独计数，不混进「我的用量」', async () => {
    await db.delete(usageLog)
    await seed([
      { at: new Date(), source: 'chat', total: 1000 },
      { at: new Date(), source: 'probe', prompt: null, completion: null, total: null },
    ])

    const result = await stats(7)
    expect(result.totals.calls).toBe(2)
    expect(result.totals.probeCalls, '探测次数要能被单独报出来').toBe(1)
  })
})

describe('记账是旁路，不能影响调用方', () => {
  it('record() 永不抛错——即使数据库写入失败', async () => {
    /**
     * 这条断言的是**契约**而不是某次调用：`record()` 吞掉所有错误。
     *
     * 不吞的话症状会是「偶尔整个问答失败」，而原因（一次统计写入）
     * 与现象（问不出答案）隔了十万八千里——那是最难现场诊断的一类。
     *
     * 用一个必然失败的值触发：`role` 列是 notNull，传 undefined。
     */
    const bad = {
      role: undefined as unknown as string,
      source: 'chat' as const,
      model: '',
      providerId: '',
      baseUrlHost: '',
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      durationMs: 1,
      ok: true,
      failureKind: null,
      refId: null,
    }

    // 不 reject 就是通过
    await expect(record(bad)).resolves.toBeUndefined()
  })
})

describe('统计端点', () => {
  it('未登录访问返回 401', async () => {
    const res = await app.request('/api/stats')
    expect(res.status).toBe(401)
  })

  it('登录后返回契约形状，且覆盖固定一年', async () => {
    const cookie = await getAuthCookie()
    const client = makeClient(cookie)

    const { status, body } = await client.get<{
      timezone: string
      from: string
      to: string
      days: unknown[]
      totals: { calls: number; unknownCount: number; probeCalls: number }
      thresholds: number[]
    }>('/api/stats')

    expect(status).toBe(200)
    expect(typeof body.timezone).toBe('string')
    /**
     * **覆盖范围是固定的**（`USAGE_HISTORY_DAYS`），不吃查询参数。
     *
     * 这条断言同时守住「参数被去掉了」这件事：如果哪天有人把
     * `?days=` 加回来，这里的长度就不会等于常量。
     */
    expect(body.days).toHaveLength(USAGE_HISTORY_DAYS)
    // 三个合计必须都在——缺一个时页脚的说明会静默少一句
    expect(body.totals.calls).toBeTypeOf('number')
    expect(body.totals.unknownCount).toBeTypeOf('number')
    expect(body.totals.probeCalls).toBeTypeOf('number')
    expect(Array.isArray(body.thresholds)).toBe(true)
  })

  it('查询参数被忽略（范围不由客户端决定）', async () => {
    /**
     * 传一个 `days` 不该改变结果——参数在路由里已经不存在了，
     * 所以它只是一个被忽略的多余 query。
     *
     * 这条比「返回 400」更准确地表达了意图：**不是「这个值不合法」，
     * 而是「这个维度不归你管」**。
     */
    const cookie = await getAuthCookie()
    const client = makeClient(cookie)

    const { status, body } = await client.get<{ days: unknown[] }>('/api/stats?days=30')
    expect(status).toBe(200)
    expect(body.days).toHaveLength(USAGE_HISTORY_DAYS)
  })
})

describe('统计时区配置项', () => {
  it('非法时区名被拒绝（而非等到聚合时抛异常）', async () => {
    /**
     * 时区名写错（`Asia/Shangai` 少个 h）时 `Intl.DateTimeFormat` 会抛，
     * 而抛在聚合查询里就是统计页整页 500。必须在写入时就挡住。
     */
    const cookie = await getAuthCookie()
    const client = makeClient(cookie)

    const bad = await client.patch<{
      error: { code: string; message: string; details: { key: string; message: string }[] }
    }>('/api/config/settings', { values: { 'stats.timezone': 'Asia/Shangai' } })

    expect(bad.status).toBe(400)
    // 错误外壳是 `{ error: { code, message, details } }`——details 里带键名
    expect(bad.body.error.code).toBe('INVALID_SETTING')
    expect(bad.body.error.details[0]?.key).toBe('stats.timezone')

    const good = await client.patch('/api/config/settings', {
      values: { 'stats.timezone': 'Asia/Shanghai' },
    })
    expect(good.status).toBe(200)

    // 清理：删掉覆盖，回落到默认值（默认也是 Asia/Shanghai，但保持表干净）
    await db.delete(settings).where(eq(settings.key, 'stats.timezone'))
  })
})
