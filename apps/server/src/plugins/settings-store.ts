import { inArray } from 'drizzle-orm'
import type { SettingsStore } from '@mimir/core'
import { db } from '../db/client.js'
import { settings } from '../db/schema.js'

/**
 * 设置覆盖层的数据库实现。
 *
 * 表在 `db/schema.ts`（`settings`），**只存界面显式写入的行**——
 * 迁移不 seed 默认值，否则部署方在 `.env` 里配的值会被空默认值静默覆盖
 * （`docs/TECH.md` §7.5）。
 *
 * ## 读不到表时当作「没有覆盖」，而不是启动失败
 *
 * 迁移没跑时表不存在。这时**继续跑**：覆盖层是可选的东西，它的缺失
 * 不该让写笔记、检索这些核心功能不可用。代价只是第一次写设置会失败——
 * 而那时迁移肯定跑过了，否则用户根本进不了设置页。
 */
export class SettingsTableStore implements SettingsStore {
  async loadAll(): Promise<Map<string, string>> {
    try {
      const rows = await db.select().from(settings)
      return new Map(rows.map((row) => [row.key, row.value]))
    } catch (error) {
      console.warn(
        '[settings] 读取配置覆盖层失败，本次按「无覆盖」处理（迁移是否已跑？）：',
        error instanceof Error ? error.message : error,
      )
      return new Map()
    }
  }

  async upsert(rows: { key: string; value: string }[]): Promise<void> {
    if (rows.length === 0) return

    for (const row of rows) {
      await db
        .insert(settings)
        .values({ key: row.key, value: row.value })
        // 冲突时更新值并刷新时间戳。用逐行 upsert 而不是批量：
        // 设置数量是个位数，而逐行能拿到每条的具体错误
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: row.value, updatedAt: new Date() },
        })
    }
  }

  async remove(keys: string[]): Promise<void> {
    if (keys.length === 0) return
    await db.delete(settings).where(inArray(settings.key, keys))
  }
}
