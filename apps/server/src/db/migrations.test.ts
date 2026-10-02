import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 迁移日志的守卫（`drizzle/meta/_journal.json` 与 sqlite 那一份）。
 *
 * ## 它防的是一个**静默跳过**的坑（实测踩过）
 *
 * drizzle 判断「这条迁移跑过没有」的方式是：**把 `created_at`（来自 journal
 * 的 `when`）与库里已应用的最大值比较**，只跑 `when > 最大已应用值` 的那些。
 *
 * 所以只要 `when` 不是单调递增的，后面的迁移就**永远不会执行**——
 * 不报错、不警告、journal 的 hash 也不会进库，看起来就像「没写过这个迁移」。
 *
 * 实测的起因：`0006_kb_code` / `0009_kb_code` 这类条目的 `when` 被手工设成了
 * 未来时间（1791879000000 ≈ 2026-10-13），而 drizzle-kit 生成新迁移时
 * 用的是**真实当前时间**（1790950320258 ≈ 2026-10-02）——新迁移的 `when`
 * 比旧的小，于是 `chunks` / `chunk_embeddings` / `feeds` 三张表在
 * 已有实例上**一张都没建**，而 `pnpm db:migrate` 打印的却是「迁移完成」。
 * 那次是靠「播种的文档一条分块都没有」才反查出来的，不是靠报错。
 *
 * ## 为什么修法是改 journal 而不是别的
 *
 * `when` 只用于**排序与比较**（它就是「这条迁移的时间」）。把它改到
 * 现有最大值之后（保持序号顺序）既不动 SQL、也不动 hash，
 * 已应用的迁移不会重跑（它们仍在库里），未应用的会补上。
 *
 * 手工编造过的 `when` 无法追溯，所以这条测试**不校验「值等于真实时间」**，
 * 只校验它守得住的那条不变量：**严格递增**。
 */

interface Journal {
  entries: { idx: number; when: number; tag: string }[]
}

function readJournal(relative: string): Journal {
  // `../../drizzle` 与 `../../drizzle-sqlite` 相对本文件（src/db/）——
  // 与 db/migrate.ts 用 `../../<name>` 找迁移目录是同一种算法
  const file = fileURLToPath(new URL(relative, import.meta.url))
  return JSON.parse(readFileSync(file, 'utf8')) as Journal
}

const JOURNALS = [
  ['Postgres', '../../drizzle/meta/_journal.json'],
  ['SQLite', '../../drizzle-sqlite/meta/_journal.json'],
] as const

describe('迁移日志：when 必须严格递增（否则后面的迁移被静默跳过）', () => {
  for (const [name, path] of JOURNALS) {
    it(`${name} 的 when 单调递增`, () => {
      const { entries } = readJournal(path)
      expect(entries.length).toBeGreaterThan(0)

      const violations: string[] = []
      for (let i = 1; i < entries.length; i += 1) {
        const previous = entries[i - 1]!
        const current = entries[i]!
        if (current.when <= previous.when) {
          violations.push(
            `${current.tag}（when=${current.when}）不大于前一条 ${previous.tag}（when=${previous.when}）`,
          )
        }
      }

      if (violations.length > 0) {
        throw new Error(
          `这些迁移的 when 没有递增，drizzle 会**静默跳过**它们（不报错，只是不建表）：\n` +
            `${violations.join('\n')}\n` +
            '修法：把新迁移的 when 改到现有最大值之后（`meta/_journal.json`），序号顺序不变',
        )
      }
    })

    it(`${name} 的 idx 连续且从 0 开始`, () => {
      const { entries } = readJournal(path)
      expect(entries.map((entry) => entry.idx)).toEqual(entries.map((_, index) => index))
    })
  }
})
