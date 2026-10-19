import { getTableConfig as pgConfig } from 'drizzle-orm/pg-core'
import { getTableConfig as liteConfig } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import * as pg from './schema.pg.js'
import * as lite from './schema.sqlite.js'

/**
 * 双后端的**结构对齐守卫**（D-045）。
 *
 * `schema.pg.ts`（服务器）与 `schema.sqlite.ts`（本地 / 桌面）是两份手写文件，
 * 没有这份测试，两边会各自漂移——加列只加一边的症状是「本地开发正常、
 * 生产炸了」或者反过来，而且要到运行那条查询时才炸。
 *
 * 断言三层：
 *   1. 表集合一致
 *   2. 每张表的列（名字、顺序、可空性、**归一化的类型类别**）一致
 *      ——`timestamptz` 与 `integer({mode:'timestamp_ms'})` 都是 `date`，
 *      `jsonb` 与 `text({mode:'json'})` 都是 `json`，服务层看到的值形状相同
 *   3. 索引名一致（**PG 专有**的 GIN 全文与 trigram 索引除外——它们在
 *      SQLite 由 FTS5 虚拟表与触发器、全表扫描替代，见 RESEARCH §11）
 *
 * 默认值不比：两边表达同一语义的**字面**不同（`now()` vs 应用侧默认、
 * `'[]'::jsonb` vs `'[]'`），行为由各自的集成测试覆盖。
 */

/** 分发器（schema.ts）转发时用到的全部表名，两边必须一一对应 */
const TABLES = [
  'documents',
  'tags',
  'documentTags',
  'conversations',
  'docxAgentRuns',
  'messages',
  'conversationAttachments',
  'messageAttachments',
  'attachmentLeases',
  'attachmentGarbage',
  'conversationRefs',
  'documentLinks',
  'chunks',
  'feeds',
  'settings',
  'usageLog',
  'user',
  'session',
  'account',
  'verification',
] as const

/** PG 侧的方言专有索引，不参与对齐比较（SQLite 侧的替代物见各注释） */
const PG_ONLY_INDEXES = new Set([
  'documents_search_idx',
  'documents_body_trgm_idx',
  'chunks_search_idx',
  'chunks_content_trgm_idx',
])

/**
 * 双方言**形状本来不同**的列：向量列。
 *
 * PG 是 `halfvec`（半精度、文本形态进出），SQLite 是 BLOB（sqlite-vec 的
 * float32 字节）。两者是同一语义（一段向量）的两种物理表示，跨方言的
 * 等价性由向量通道各自的实现测试守，不靠逐列类型比较。
 */
const DIALECT_SPECIFIC_COLUMNS = new Set(['chunkEmbeddings.embedding'])

describe('schema 双方言对齐（D-045）', () => {
  const pgNs = pg as unknown as Record<string, PgTable>
  const liteNs = lite as unknown as Record<string, SQLiteTable>

  it('表集合一致', () => {
    for (const name of TABLES) {
      expect(pgNs[name], `PG 侧缺表 ${name}`).toBeDefined()
      expect(liteNs[name], `SQLite 侧缺表 ${name}`).toBeDefined()
    }
  })

  for (const name of TABLES) {
    it(`表 ${name} 的列与索引对齐`, () => {
      const pgTable = pgConfig(pgNs[name]!)
      const liteTable = liteConfig(liteNs[name]!)

      const pgColumns = pgTable.columns
        .filter((column) => !DIALECT_SPECIFIC_COLUMNS.has(`${name}.${column.name}`))
        .map((column) => ({
          name: column.name,
          kind: column.dataType,
          notNull: column.notNull,
        }))
      const liteColumns = liteTable.columns
        .filter((column) => !DIALECT_SPECIFIC_COLUMNS.has(`${name}.${column.name}`))
        .map((column) => ({
          name: column.name,
          kind: column.dataType,
          notNull: column.notNull,
        }))
      expect(liteColumns).toEqual(pgColumns)

      const pgIndexes = pgTable.indexes
        .map((index) => index.config.name)
        .filter((indexName) => !PG_ONLY_INDEXES.has(indexName ?? ''))
        .toSorted()
      const liteIndexes = liteTable.indexes
        .map((index) => index.config.name)
        .filter((indexName) => indexName !== undefined)
        .toSorted()
      expect(liteIndexes).toEqual(pgIndexes)
    })
  }
})
