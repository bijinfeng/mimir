import { eq, inArray, sql } from 'drizzle-orm'
import { chunkText } from '../lib/chunk.js'
import { db } from '../db/client.js'
import { chunkEmbeddings, chunks, documents } from '../db/schema.js'
import { dbDriver } from '../env.js'
import { assemble, executeRaw } from '../plugins/host.js'
import { callEmbed, modelName } from './model.js'

/**
 * 分块的写入与查询（M1-B，`docs/TECH.md` §4.8 / §4.10）。
 *
 * ## 分块是派生数据，重建的入口只有一个
 *
 * `documents.body` 是真相，`chunks` 完全可从它重算。所以这个文件里
 * **只有 `syncChunks` 一个写入点**：保存笔记、抓取入库、重建索引、
 * 补嵌入，全都调到它。第二处写入会让「分块到底是谁算的」出现两个答案。
 *
 * ## 嵌入失败绝不阻断写入（§4.10）
 *
 * 检索是可选能力，笔记是核心。provider 挂了、没配 key、限流——
 * 都只是「这一段暂时搜不到语义」，文件与数据库的写入必须成功。
 * 所以 `syncChunks` 只管分块（纯计算、同步），嵌入由调用方在写入完成
 * **之后**单独尽力做（`embedDocument`），失败只留日志与计数。
 */

export interface ChunkSyncResult {
  /** 重建后这篇文档的分块数 */
  count: number
  /** 内容没变、跳过了重建（分块与向量都保持原样） */
  unchanged: boolean
}

/**
 * 重建分块并尽力补嵌入（**所有写入路径的统一收尾**）。
 *
 * **两件事分先后、且失败互不影响**（`docs/TECH.md` §4.10）：
 *
 * 1. 分块是纯计算，属于写入路径的一部分——它失败说明代码坏了，直接抛
 * 2. 嵌入要发请求、要花钱，**失败绝不让写入失败**。provider 没配、
 *    限流、断网都只是「这段暂时搜不到语义」，而笔记必须存下来。
 *    失败留一条日志，界面上以「待嵌入 N 段」如实显示
 *
 * 抽成一个函数的理由是**写入路径有三条**（新建笔记、更新笔记、抓取入库），
 * 抄三遍必然会漏掉一处——而漏掉的那条路径上的文档永远搜不到语义，
 * 且没有任何症状。
 */
export async function rebuildChunksAndEmbed(documentId: string, body: string): Promise<void> {
  const result = await syncChunks(documentId, body)
  // 内容没变的（改标题、改标签、改目录、重复抓取）不重跑嵌入：
  // 那些向量仍然有效，重跑一遍是白花钱
  if (result.unchanged) return

  await embedDocument(documentId).catch((error: unknown) => {
    console.warn(`嵌入失败（文档 ${documentId} 已保存，这一段暂时只能按关键词搜到）：`, error)
  })
}

/**
 * 重建一篇文档的分块。
 *
 * **内容没变时直接跳过**：判据是「已有的块与当前正文切出来的块逐块对齐」
 * （id、起止偏移都相同）——那足以说明正文没变（分块是正文的确定性函数）。
 * 没有这个跳过的话，每次保存笔记都要删光重插：分块行本身无所谓，但
 * `chunk_embeddings` 的级联会一起删掉向量，于是每次改一个错别字都要重新掏钱嵌入。
 *
 * 换分块策略（`parser.chunk.size`）后要全量重跑：`rebuildAllChunks` 是入口。
 */
export async function syncChunks(documentId: string, body: string): Promise<ChunkSyncResult> {
  const { settings } = assemble()
  const size = await settings.getNumber('parser.chunk.size')
  const overlap = await settings.getNumber('parser.chunk.overlap')

  /**
   * 标题从**数据库现取**，不由调用方传。
   *
   * 传进来会让「改名之后的分块用的是旧标题」成为一个可能的静默错误
   * （六个调用点里只要有一个在更新标题之前调它就会发生）。
   * 这里是主键查询，代价可以忽略。
   */
  const [doc] = await db
    .select({ title: documents.title })
    .from(documents)
    .where(eq(documents.id, documentId))
  const title = doc?.title ?? ''

  const next = chunkText(body, { size, overlap, title }, documentId)

  const existing = await db
    .select({ id: chunks.id, startAt: chunks.startAt, endAt: chunks.endAt })
    .from(chunks)
    .where(eq(chunks.documentId, documentId))
    .orderBy(chunks.idx)

  if (
    existing.length === next.length &&
    existing.every(
      (row, i) =>
        row.id === next[i]!.id && row.startAt === next[i]!.start && row.endAt === next[i]!.end,
    )
  ) {
    return { count: existing.length, unchanged: true }
  }

  // 先删后插：分块是派生数据，没有「合并写入」的必要。
  // 删掉的行由 chunk_embeddings 的级联一起带走——内容变了的分块
  // 绝不能再留着旧向量（那是静默的错误召回）
  await db.delete(chunks).where(eq(chunks.documentId, documentId))
  if (next.length === 0) return { count: 0, unchanged: false }

  const now = new Date()
  await db.insert(chunks).values(
    next.map((chunk) => ({
      id: chunk.id,
      documentId,
      idx: chunk.index,
      content: chunk.content,
      searchText: chunk.searchText,
      startAt: chunk.start,
      endAt: chunk.end,
      heading: chunk.heading,
      createdAt: now,
      updatedAt: now,
    })),
  )

  return { count: next.length, unchanged: false }
}

/**
 * 向量 → 数据库列值。
 *
 * 两处方言差异的**唯一落点**（与 `db/client.ts`、`schema.ts` 同级；
 * 别在别处再按驱动分支）：
 *
 * - PG（halfvec）：**文本形态** `[0.1,0.2,…]`，由列类型自己解释成半精度。
 *   半精度约 3 位有效数字的精度损失对余弦排序没有实质影响
 * - SQLite（BLOB）：`Float32Array` 的字节。sqlite-vec 的
 *   `vec_distance_cosine` 直接吃这个形状
 */
export function serializeVector(vector: number[]): string | Buffer {
  if (dbDriver === 'postgres') return `[${vector.join(',')}]`

  const floats = new Float32Array(vector)
  return Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength)
}

/**
 * 每批调用一次 `embed()` 的条数。
 *
 * 取 16 而不是「一次全部」：模型接口对单次输入有 token 上限
 * （一个 500 字的分块放几十个进去容易超），而且批量小一点时
 * 某一次失败的重试代价也小。
 */
const EMBED_BATCH = 16

/**
 * 尽力为这篇文档「还没有向量的分块」补嵌入。返回补上的条数。
 *
 * **判据是向量表里有没有行，不是进度计数器**（§4.10）——这让重入成为
 * 天然性质：中途失败或重启，下一次从缺的那些继续。
 */
export async function embedDocument(documentId: string): Promise<{ embedded: number }> {
  const model = await modelName('embed')
  if (model === '') return { embedded: 0 }

  const rows = await db
    .select({ id: chunks.id, content: chunks.content })
    .from(chunks)
    .where(
      sql`${chunks.documentId} = ${documentId} and not exists (
        select 1 from chunk_embeddings ce
        where ce.chunk_id = ${chunks.id} and ce.model = ${model}
      )`,
    )
    .orderBy(chunks.idx)

  if (rows.length === 0) return { embedded: 0 }

  let embedded = 0
  for (let i = 0; i < rows.length; i += EMBED_BATCH) {
    const batch = rows.slice(i, i + EMBED_BATCH)
    const vectors = await callEmbed(
      batch.map((row) => row.content),
      documentId,
    )
    if (vectors.length !== batch.length) {
      throw new Error(`嵌入返回的向量数与输入不符（${vectors.length} ≠ ${batch.length}）`)
    }

    const now = new Date()
    for (const [index, row] of batch.entries()) {
      const vector = vectors[index]!
      /**
       * 逐条 upsert 而不是批量 `insert().values([...])`：
       * `onConflictDoUpdate` 的 `excluded` 在双后端的类型上不同形
       * （BLOB 列与 halfvec 列），逐条写让这段代码只有一种形状。
       * 一批 16 条，每批一次往返的代价在嵌入本身的耗时面前可以忽略。
       */
      await db
        .insert(chunkEmbeddings)
        .values({
          chunkId: row.id,
          model,
          dimension: vector.length,
          embedding: serializeVector(vector) as never,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [chunkEmbeddings.chunkId, chunkEmbeddings.model],
          set: {
            dimension: vector.length,
            embedding: serializeVector(vector) as never,
          },
        })
    }

    embedded += batch.length
  }

  return { embedded }
}

/** 还有多少分块没有向量。null 表示没配 embed 模型（「待嵌入」无从谈起） */
export async function pendingEmbeddingCount(): Promise<number | null> {
  const model = await modelName('embed')
  if (model === '') return null

  const rows = await executeRaw<{ count: number | string }>(sql`
    select count(*) as count from chunks c
    where not exists (
      select 1 from chunk_embeddings ce where ce.chunk_id = c.id and ce.model = ${model}
    )
  `)
  return Number(rows[0]?.count ?? 0)
}

/**
 * 补一批嵌入（`POST /maintenance/embed`）。
 *
 * 按文档逐篇补，`limit` 限制这一轮最多嵌几条——分批是为了**可中断**：
 * 一次请求嵌完全库，中途断线就全白费；分批之后每批都是独立完成的，
 * 而「已完成」的判据就是向量表里那些行（§4.10 的可重入性）。
 *
 * 返回 `processed`（本轮嵌了几条）、`remaining`（还剩几条）与
 * `failed`（失败的文档数，比如 provider 挂了）。`remaining` 为 0
 * 时界面应当说「全部已嵌入」，而不是继续让人点按钮。
 */
export async function embedPending(
  limit: number,
): Promise<{ processed: number; remaining: number | null; failed: number }> {
  const model = await modelName('embed')
  // 没配模型时 `remaining` 是 null——界面据此说「未配置向量化模型」，
  // 而不是显示 0（那会被读成「都嵌好了」）
  if (model === '') return { processed: 0, remaining: null, failed: 0 }

  const pending = await pendingEmbeddingCount()
  if (pending === null || pending === 0) return { processed: 0, remaining: 0, failed: 0 }

  // 哪些文档还有缺向量的分块。取比 limit 多一些的文档数——
  // 单篇可能补不满一批（分块少），下一轮会继续
  const rows = await executeRaw<{ document_id: string }>(sql`
    select distinct c.document_id
    from chunks c
    where not exists (
      select 1 from chunk_embeddings ce where ce.chunk_id = c.id and ce.model = ${model}
    )
    limit ${Math.max(1, limit)}
  `)

  let processed = 0
  let failed = 0

  for (const row of rows) {
    if (processed >= limit) break
    try {
      const result = await embedDocument(row.document_id)
      processed += result.embedded
    } catch (error) {
      // 一篇失败继续下一篇：provider 的问题常常是暂时的（限流），
      // 而整轮中止会让「已经补好的」也报失败
      failed += 1
      console.warn(`补嵌入失败（文档 ${row.document_id}）：`, error)
    }
  }

  return { processed, remaining: await pendingEmbeddingCount(), failed }
}

/** 全部分块的汇总（设置页显示「共 N 段 · 待嵌入 M 段」） */
export async function chunkStats(): Promise<{
  total: number
  documents: number
  pending: number | null
}> {
  const rows = await db.select({ documentId: chunks.documentId }).from(chunks)

  return {
    total: rows.length,
    documents: new Set(rows.map((row) => row.documentId)).size,
    pending: await pendingEmbeddingCount(),
  }
}

/**
 * 全量重建所有文档的分块（**不含嵌入**）。
 *
 * 换分块参数（`parser.chunk.size` / `overlap`）之后必须跑一次——
 * `db:reindex` 与设置页的「重建分块」都走这里。逐篇同步做，不并发：
 * 进度如实可见（哪一篇开始/完成），而并发只会让失败难以定位。
 *
 * 嵌入留在下一步（`POST /maintenance/embed` 分批补）——§4.10 的两条理由：
 * 嵌入要花钱，而重建索引不该顺带花钱；补嵌入按「缺哪些」可重入。
 */
export async function rebuildAllChunks(): Promise<{ documents: number; chunks: number }> {
  const rows = await db
    .select({ id: documents.id, body: documents.body })
    .from(documents)
    .where(sql`${documents.deletedAt} is null`)

  let total = 0
  for (const row of rows) {
    const result = await syncChunks(row.id, row.body)
    total += result.count
  }

  return { documents: rows.length, chunks: total }
}

/** 删除若干文档的分块（批量清理用；单篇删除由级联兜底） */
export async function dropChunks(documentIds: readonly string[]): Promise<void> {
  if (documentIds.length === 0) return
  await db.delete(chunks).where(inArray(chunks.documentId, [...documentIds]))
}
