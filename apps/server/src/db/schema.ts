import { sql } from 'drizzle-orm'
import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

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
    /**
     * 所属目录，如 `技术/前端/React`。null 表示未归档。
     *
     * 目录树由这一列派生，**不单独建 folders 表**：目录是文件系统的形状，
     * 而「文件是真相」。单独建表会立刻产生两个真相源——表里有目录、
     * vault 里没有对应文件夹，或者反过来。
     */
    folder: text('folder'),
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
    index('documents_folder_idx').on(t.folder),
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

/**
 * 对话。
 *
 * 会话优先的导航（`docs/PRD.md` §5.2）意味着会话是一等公民：它出现在左导航、
 * 占据中栏的「本次引用」、在右栏展开检索过程。所以必须落库——
 * 只存在内存里的话，刷新一次「会话历史」就空了，那这个导航结构就是假的。
 */
export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    /** 由第一个问题生成，之后不再变。空会话显示为「新对话」 */
    title: text('title').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('conversations_updated_at_idx').on(t.updatedAt.desc())],
)

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    /** user | assistant */
    role: text('role').notNull(),
    text: text('text').notNull().default(''),

    /**
     * 检索过程。存 jsonb 而不是拆成表：它是**一次生成的快照**，
     * 只随消息整体读写，从不单独查询。拆表会引入一个只为可读性服务的连接。
     */
    trace: jsonb('trace'),
    /** 引用卡片数组，同上 */
    citations: jsonb('citations')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** quota | timeout | truncated | offline；非空表示这是一条失败消息 */
    failure: text('failure'),
    /** 「存成笔记」之后指向生成的笔记，界面据此显示「已存为笔记」 */
    savedNoteId: text('saved_note_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt)],
)

/**
 * 本次引用了哪些文档 —— 中栏在对话模式下显示的那一列。
 *
 * 之所以单独一张表而不是从 messages.citations 里现算：
 * 中栏要在**打开会话的瞬间**渲染出来，而 citations 是嵌在每条消息的 jsonb 里的，
 * 现算意味着把整个会话的消息全捞出来解 JSON。单独一张小表让这件事变成一次连接。
 */
export const conversationRefs = pgTable(
  'conversation_refs',
  {
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.documentId] })],
)

/**
 * 文档间的链接 —— 让双链是双向的（`docs/PRD.md` §5.10）。
 *
 * 链接从 Markdown 正文里的站内链接解析出来（`[标题](/doc/<id>)`），
 * 在每次保存正文时重建该文档的出链。反链不存，靠反向查询得到：
 * 存一份反链等于把同一个事实写两遍，必然有一天对不上。
 */
export const documentLinks = pgTable(
  'document_links',
  {
    fromId: text('from_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    toId: text('to_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.fromId, t.toId] }), index('document_links_to_idx').on(t.toId)],
)

/**
 * 配置覆盖层。**只存「界面显式设置过」的行**，不 seed 默认值。
 *
 * 解析顺序是 `本表 > 环境变量 > 代码默认`（`docs/TECH.md` §7.5）。
 * 不 seed 是关键：插一批默认行会让部署方在 `.env` 里配的值被空默认值
 * **静默覆盖**，而那是最难查的一类问题（配置明明写了，行为却是默认的）。
 *
 * 按 key 一行而不是一个 JSON 列：单行 JSON 的并发写法是「读-改-写」，
 * 两个设置同时改会丢一个；按 key 一行可以用 `ON CONFLICT DO UPDATE`。
 *
 * 哪些键可写是**闭集**（`@mimir/core` 的键表 + 插件声明的 params），
 * 写入端点在写之前会校验——这个表只负责承载值，不负责解释它。
 */
export const settings = pgTable(
  'settings',
  {
    key: text('key').primaryKey(),
    /** 字符串 / 数字 / 布尔由键表解释；密钥类是密文串（`enc:v1:` 前缀） */
    value: text('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('settings_updated_at_idx').on(t.updatedAt.desc())],
)

// Better Auth 的表结构单独一个文件，但必须并入同一个 schema 对象，
// 这样 drizzle(sql, { schema }) 才能让适配器解析到表名。
export * from './auth-schema.js'
