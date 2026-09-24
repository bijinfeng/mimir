import { z } from 'zod'

/**
 * 用量统计的传输契约（`docs/TECH.md` §12）。
 *
 * ## 为什么不复用业务表的计数
 *
 * 用量是**观测数据**，不是从 `documents` / `messages` 推导出来的：
 *
 * | | 业务表 | 用量记账 |
 * |---|---|---|
 * | 时间 | 可变（`updated_at` 随编辑变） | 不可变（调用发生的那一刻） |
 * | 生命周期 | 随文档/会话级联删除 | 必须活过业务删除 |
 *
 * 第二条最要紧：删一个会话，「我这个月花了多少钱」不能跟着变少。
 *
 * ## token 的三个字段为什么都可空
 *
 * **`null` ≠ `0`，这是这张契约最容易做错的一处。** 兼容端点不一定回传
 * usage；如果写入时把「没回传」填成 0，统计页会显示「今天 0 token」，
 * 而那天明明调用了 8 次——那是一个确定的谎言，不是一个诚实的未知。
 *
 * 所以三个字段都可空，取值用 `total ?? (prompt + completion)`：
 * `total` 缺失但分项在是常见情况，不该白扔。两边都缺才算「未知」。
 */

/** 一次调用的来源。它回答「这笔钱花在哪个功能上」 */
export const usageSourceSchema = z.enum(['chat', 'ask', 'summary', 'embed', 'probe'])
export type UsageSource = z.infer<typeof usageSourceSchema>

/**
 * 写入一条记账。**内部契约**（服务端的 `services/usage.ts` 用），
 * 但放在 shared 里与其它契约同址，避免它长成一个私有的形状。
 */
export interface UsageRecord {
  role: string
  source: UsageSource
  model: string
  /** provider 插件的 id。换服务商后历史数据仍能分辨 */
  providerId: string
  /** 端点主机名。同一 provider 换了地址时仍能分辨 */
  baseUrlHost: string
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  durationMs: number
  ok: boolean
  failureKind: string | null
  /** 会话 id 或文档 id。**不加外键**——见本文件顶部的理由 */
  refId: string | null
}

/**
 * 热力图的一格。
 *
 * `tokens` 与 `unknownCount` 同时存在是刻意的：
 *
 * ```
 * tokens: 0, unknownCount: 0   → 那天没用（空格子）
 * tokens: 0, unknownCount: 3   → 用了三次但都没上报用量（斜纹）
 * tokens: 1234, ...            → 正常着色
 * ```
 *
 * 三种状态必须能分开，否则「有调用但用量未知」会被画成空格子，
 * 而那是图在否认发生过的事。
 */
export const usageDaySchema = z.object({
  /** 该日期的本地日期，`YYYY-MM-DD`。按 `timezone` 聚合出来的，不是 UTC 日期 */
  date: z.string(),
  tokens: z.number().int().nonnegative(),
  calls: z.number().int().nonnegative(),
  /** 有调用但供应商没回传用量的次数。> 0 时格子画斜纹 */
  unknownCount: z.number().int().nonnegative(),
})
export type UsageDay = z.infer<typeof usageDaySchema>

/** 按角色的用量。一行 = 一个角色 */
export const usageByRoleSchema = z.object({
  role: z.string(),
  model: z.string(),
  calls: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  /** 未上报用量的次数。表格里单列一列，页脚要写清「这 N 次消耗未知」 */
  unknownCount: z.number().int().nonnegative(),
  avgMs: z.number().int().nonnegative(),
})
export type UsageByRole = z.infer<typeof usageByRoleSchema>

export const usageStatsQuerySchema = z.object({
  /**
   * 热力图覆盖的天数。默认一年——贡献图的肌肉记忆来自 GitHub，
   * 那里就是一年。
   */
  days: z.coerce.number().int().min(7).max(730).default(370),
})
export type UsageStatsQuery = z.infer<typeof usageStatsQuerySchema>

export const usageStatsSchema = z.object({
  /** 实际聚合用的时区。界面上必须显示它——否则「为什么这格是昨天」无解 */
  timezone: z.string(),
  /** 覆盖范围的起止日期（含），`YYYY-MM-DD` */
  from: z.string(),
  to: z.string(),
  days: z.array(usageDaySchema),
  byRole: z.array(usageByRoleSchema),
  totals: z.object({
    today: z.number().int().nonnegative(),
    week: z.number().int().nonnegative(),
    month: z.number().int().nonnegative(),
    all: z.number().int().nonnegative(),
    calls: z.number().int().nonnegative(),
    unknownCount: z.number().int().nonnegative(),
    /** `probe` 来源的调用次数。单独报，不让它混进「我的用量」 */
    probeCalls: z.number().int().nonnegative(),
  }),
  /**
   * 分位分档的阈值（升序，最多三档边界）。
   *
   * 分档按**当前范围的分位数**算，所以换范围颜色会变——图例必须把
   * 真实区间标出来，否则对比两张不同范围的截图会看不懂。
   */
  thresholds: z.array(z.number().nonnegative()),
})
export type UsageStats = z.infer<typeof usageStatsSchema>

/** 头像上传的请求体形状。文件走 multipart，服务端只校验类型与大小 */
export const AVATAR_MAX_BYTES = 512 * 1024
export const AVATAR_MIME_TYPES = ['image/webp', 'image/png', 'image/jpeg'] as const

export const updateProfileInputSchema = z.object({
  name: z.string().trim().min(1, '名称不能为空').max(60, '名称最长 60 个字符'),
})
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>
