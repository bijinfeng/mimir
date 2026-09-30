import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * SQLite 方言的 schema（本地开发 / 桌面端，D-045）。
 *
 * 与 `schema.pg.ts` **逐表逐列对齐**：表名、列名、默认值语义、索引名都必须
 * 一致，由 `schema-parity.test.ts` 在两个临时库各自迁移后 introspect 断言。
 * 改任何一边，先看那张守卫测试。
 *
 * 类型映射约定：
 *   timestamp({ withTimezone: true }) → integer({ mode: 'timestamp_ms' })
 *     `defaultNow()`（数据库侧 now()）换成 `$defaultFn(() => new Date())`
 *     （应用侧时钟）——SQLite 没有带时区的时间类型，统一存 UTC 毫秒
 *   jsonb   → text({ mode: 'json' })（drizzle 自动 JSON.parse / stringify）
 *   boolean → integer({ mode: 'boolean' })
 *
 * 索引的差异（刻意的，不是遗漏）：
 *   - PG 的 GIN `to_tsvector('simple', search_text)` 在 SQLite 由 FTS5 虚拟表
 *     `documents_fts` + 触发器替代（见 drizzle-sqlite 之后的 fts 迁移）
 *   - PG 的 trigram GIN（子串兜底加速）在 SQLite 没有等价物；子串通道走
 *     `instr` 全扫，个人库规模可接受（TECH §10）
 */

export const documents = sqliteTable(
  'documents',
  {
    id: text('id').primaryKey(),
    /** note | web | wechat | github | file（kind 是**来源**，格式是 mime 属性） */
    kind: text('kind').notNull(),
    /** ready | failed（archived 已随 D-065 退役，存量行由迁移转 ready） */
    status: text('status').notNull().default('ready'),

    title: text('title').notNull(),
    /** 正文，Markdown。note 时文件是真相，这里是索引副本 */
    body: text('body').notNull().default(''),
    excerpt: text('excerpt').notNull().default(''),

    /**
     * jieba 分词后空格连接的检索文本。FTS5 的 unicode61 分词器按空白切词，
     * 对这份预分词文本恰好得到 jieba 的词元（RESEARCH §11.2）。
     */
    searchText: text('search_text').notNull().default(''),

    /** vault 相对路径，仅 note 有 */
    path: text('path'),
    /** 所属目录，如 `技术/前端/React`。null 表示未归档。语义见 schema.pg.ts */
    folder: text('folder'),
    url: text('url'),
    /** 归一化 URL，用于去重（同一篇文章抓两次只留一条） */
    canonicalUrl: text('canonical_url'),
    /** 正文哈希，用于判断是否需要重新解析/重新嵌入 */
    contentHash: text('content_hash'),

    author: text('author'),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    capturedAt: integer('captured_at', { mode: 'timestamp_ms' }),

    /** 上传原件的存储 key（相对 `DATA_DIR`），仅 `kind === 'file'` 有。语义见 schema.pg.ts */
    sourceKey: text('source_key'),
    /** 原件的 MIME。格式是**属性**，不是 kind（见 packages/shared/src/documents.ts） */
    mime: text('mime'),
    /** 原件字节数，用于元信息行显示；也用于「这个文件还在不在」的快速核对 */
    size: integer('size'),

    /** 正文为空的原因，仅上传件可能非 null。三种原因的区分见 schema.pg.ts */
    parseError: text('parse_error'),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    index('documents_kind_status_idx').on(t.kind, t.status),
    // PG 版同名索引带 DESC；drizzle 0.45 的 sqlite-core 没有 .desc()，
    // 而 SQLite 索引是双向的——ASC 索引反向扫描即可服务 ORDER BY ... DESC
    index('documents_updated_at_idx').on(t.updatedAt),
    index('documents_folder_idx').on(t.folder),
    // 同一来源只收一次
    uniqueIndex('documents_canonical_url_idx').on(t.canonicalUrl),
  ],
)

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex('tags_name_idx').on(t.name)],
)

/**
 * 目录注册表（D-068）。语义见 schema.pg.ts。
 */
export const folders = sqliteTable('folders', {
  /** 完整路径本身是主键，如 `技术/前端/React`。见 schema.pg.ts */
  path: text('path').primaryKey(),
  /** 知识库描述（D-078）。空串 = 没写 */
  description: text('description').notNull().default(''),
  /** 知识库图标的键（shared 的 FOLDER_ICONS 之一）。null = 未选 */
  icon: text('icon'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const documentTags = sqliteTable(
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
 * 对话。会话是一等公民所以必须落库（PRD §5.2）。语义见 schema.pg.ts。
 */
export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    /** 由第一个问题生成，之后不再变。空会话显示为「新对话」 */
    title: text('title').notNull().default(''),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('conversations_updated_at_idx').on(t.updatedAt)],
)

export const messages = sqliteTable(
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
     * 检索过程。存 JSON 而不是拆成表：一次生成的快照，只随消息整体读写。
     */
    trace: text('trace', { mode: 'json' }),
    /** 引用卡片数组，同上 */
    citations: text('citations', { mode: 'json' })
      .notNull()
      .default(sql`'[]'`),
    /** quota | timeout | truncated | offline；非空表示这是一条失败消息 */
    failure: text('failure'),
    /** 「存成笔记」之后指向生成的笔记，界面据此显示「已存为笔记」 */
    savedNoteId: text('saved_note_id'),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt)],
)

/** 本次引用了哪些文档 —— 中栏在对话模式下显示的那一列。语义见 schema.pg.ts */
export const conversationRefs = sqliteTable(
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

/** 文档间的双链。反链靠反向查询，不存两份。语义见 schema.pg.ts */
export const documentLinks = sqliteTable(
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

/** 配置覆盖层。只存显式写入的行，不 seed 默认值（TECH §7.5）。语义见 schema.pg.ts */
export const settings = sqliteTable(
  'settings',
  {
    key: text('key').primaryKey(),
    /** 字符串 / 数字 / 布尔由键表解释；密钥类是密文串（`enc:v1:` 前缀） */
    value: text('value').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('settings_updated_at_idx').on(t.updatedAt)],
)

/** 用量记账。一行 = 一次模型调用（含失败），append-only。四条刻意设计见 schema.pg.ts */
export const usageLog = sqliteTable(
  'usage_log',
  {
    id: text('id').primaryKey(),
    /** 调用时刻。**不可变**——它与业务表的 `updated_at` 是两种东西 */
    at: integer('at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),

    /** chat | reasoning | summarize | embed */
    role: text('role').notNull(),
    /** 这次调用属于哪个功能：chat | ask | summary | embed | probe */
    source: text('source').notNull(),

    model: text('model').notNull(),
    /** provider 插件的 id */
    providerId: text('provider_id').notNull().default(''),
    /** 端点主机名。同一 provider 换了地址后历史数据仍能分辨 */
    baseUrlHost: text('base_url_host').notNull().default(''),

    /** 三列都可空——null 是「供应商没回传」，0 是「确实没花」，两者不能合并 */
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    totalTokens: integer('total_tokens'),

    durationMs: integer('duration_ms').notNull().default(0),
    ok: integer('ok', { mode: 'boolean' }).notNull().default(true),
    /** quota | timeout | truncated | offline，与消息的 failure 同一套分类 */
    failureKind: text('failure_kind'),

    /** 会话 id 或文档 id。**无外键**，见 schema.pg.ts */
    refId: text('ref_id'),
  },
  (t) => [index('usage_log_at_idx').on(t.at)],
)

// Better Auth 的表结构单独一个文件，但必须并入同一个 schema 对象，
// 这样 drizzle(sql, { schema }) 才能让适配器解析到表名。
export * from './auth-schema.sqlite.js'
