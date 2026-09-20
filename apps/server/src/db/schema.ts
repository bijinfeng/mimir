import { sql } from 'drizzle-orm'
import { index, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

/**
 * 文档主表。一条贯穿全局的规则：无论来源是手写笔记、网页、公众号还是 GitHub，
 * 入库后都是同一条 documents 记录 + 同一套 Markdown 正文，
 * 因此检索、引用、导出都只需要处理一种形状。
 */
export const documents = pgTable(
  'documents',
  {
    id: text('id').primaryKey(),
    /** note | web | wechat | github | pdf | file */
    kind: text('kind').notNull(),
    /** inbox | ready | failed | archived */
    status: text('status').notNull().default('inbox'),

    title: text('title').notNull(),
    /** 正文，Markdown。note 时文件是真相，这里是索引副本 */
    body: text('body').notNull().default(''),
    excerpt: text('excerpt').notNull().default(''),

    /**
     * jieba 分词后空格连接的检索文本。
     * 为什么单独一列：Postgres 对中文没有词边界，unicode61/simple 会把
     * 连续汉字当成一个 token。在写入时用 jieba 切好，索引才能命中「组件」「纪录片」这类词。
     */
    searchText: text('search_text').notNull().default(''),

    /** vault 相对路径，仅 note 有 */
    path: text('path'),
    url: text('url'),
    /** 归一化 URL，用于去重（同一篇文章抓两次只留一条） */
    canonicalUrl: text('canonical_url'),
    /** 正文哈希，用于判断是否需要重新解析/重新嵌入 */
    contentHash: text('content_hash'),

    author: text('author'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    capturedAt: timestamp('captured_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('documents_kind_status_idx').on(t.kind, t.status),
    index('documents_updated_at_idx').on(t.updatedAt.desc()),
    // 同一来源只收一次
    uniqueIndex('documents_canonical_url_idx').on(t.canonicalUrl),
    // 词级召回：走 jieba 预分词后的 search_text
    index('documents_search_idx').using('gin', sql`to_tsvector('simple', ${t.searchText})`),
    // 子串兜底：分词切错时（如「组件」被切成「组 件」）仍能命中
    index('documents_body_trgm_idx').using('gin', sql`${t.body} gin_trgm_ops`),
  ],
)

export const tags = pgTable(
  'tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tags_name_idx').on(t.name)],
)

export const documentTags = pgTable(
  'document_tags',
  {
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.documentId, t.tagId] }),
    index('document_tags_tag_idx').on(t.tagId),
  ],
)

// Better Auth 的表结构单独一个文件，但必须并入同一个 schema 对象，
// 这样 drizzle(sql, { schema }) 才能让适配器解析到表名。
export * from './auth-schema.js'
