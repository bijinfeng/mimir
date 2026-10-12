import { dbDriver } from '../env.js'
import * as pg from './schema.pg.js'
import * as sqlite from './schema.sqlite.js'

/**
 * schema 分发器：按 `DATABASE_URL` 判定的驱动（D-045）导出对应的表对象。
 *
 * **类型一律按 PG 形状声明**。这是双后端唯一的一处类型接缝：
 * 服务层的历史契约（insert/update 的值形状、返回类型）以 PG 版为准，
 * SQLite 版由 schema-parity 守卫测试保证逐表逐列对齐——所以运行时换表对象
 * 不需要改任何服务层代码。此前的 `db`（`client.ts`）做了同一个方向的断言，
 * 两处合起来构成接缝的全部，别在别处再引入方言判断。
 *
 * 为什么不做通用的「schema 定义一次、双方言生成」：两边的列类型没有
 * 一一对应的字面（timestamptz vs integer ms、jsonb vs text json、
 * GIN vs FTS5），强行统一会发明一门中间语言。两份**同形**的文件 +
 * 一条守卫测试，比一门中间语言便宜（D-045）。
 */
const dialect = dbDriver === 'postgres' ? pg : sqlite

function pick<K extends keyof typeof pg>(key: K): (typeof pg)[K] {
  return dialect[key] as (typeof pg)[K]
}

export const documents = pick('documents')
export const tags = pick('tags')
export const folders = pick('folders')
export const documentTags = pick('documentTags')
export const conversations = pick('conversations')
export const docxAgentRuns = pick('docxAgentRuns')
export const messages = pick('messages')
export const conversationRefs = pick('conversationRefs')
export const documentLinks = pick('documentLinks')
export const chunks = pick('chunks')
export const chunkEmbeddings = pick('chunkEmbeddings')
export const feeds = pick('feeds')
export const settings = pick('settings')
export const usageLog = pick('usageLog')
export const user = pick('user')
export const session = pick('session')
export const account = pick('account')
export const verification = pick('verification')
