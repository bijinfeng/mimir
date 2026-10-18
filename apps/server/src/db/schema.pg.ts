import { user as authUser, session as authSession } from './auth-schema.js'
import { sql } from 'drizzle-orm'
import {
  boolean,
  customType,
  index,
  integer,
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
    /** note | web | wechat | github | file（kind 是**来源**，格式是 mime 属性） */
    kind: text('kind').notNull(),
    /** ready | failed（archived 已随 D-065 退役，存量行由迁移转 ready） */
    status: text('status').notNull().default('ready'),

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

    /**
     * 上传原件的存储 key（相对 `DATA_DIR`），仅 `kind === 'file'` 有。
     *
     * 抓取的资料没有这一列的值——它们的原件是 `raw/<hash>/index.html`，
     * 而那个 key 是**派生值**（重算正文 hash 即可得到，见 `services/capture.ts`），
     * 不需要存。上传的原件不同：文件名里有用户给的扩展名、目录里有 id，
     * 无法从正文反推，所以必须显式记住。
     *
     * 这也是下载端点与重建索引的入口——两处都靠它、而不是靠猜路径。
     */
    sourceKey: text('source_key'),
    /** 原件的 MIME。格式是**属性**，不是 kind（见 packages/shared/src/documents.ts） */
    mime: text('mime'),
    /** 原件字节数，用于元信息行显示；也用于「这个文件还在不在」的快速核对 */
    size: integer('size'),

    /**
     * 正文为空的原因，仅上传件可能非 null。
     *
     * 为什么不留到界面里现推：**空正文有三个完全不同的原因**，而它们给用户的
     * 下一步动作不同——
     *   1. 这个格式还没有提取实现（`NULL`，由 `parseSupport()` 在界面层判断）
     *   2. 提取试过、失败了（这一列存原因，如「不是 UTF-8 编码的文本」）
     *   3. 文件本身就是空的（`NULL` 且 `size = 0`）
     * 把它们压成一句「暂无正文」是静默说谎；而失败原因只在「当时那一次」
     * 才知道（比如换了提取实现后重跑会变），所以必须当场记下来。
     */
    parseError: text('parse_error'),

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

/**
 * 目录注册表（D-068）。
 *
 * 曾经由文档的 folder 字段纯派生、刻意不建表（见 packages/shared/src/structure.ts
 * 的旧注释）；「侧边栏直接增删改移目录」推翻了它——**空目录没有文档，在派生
 * 模型里无处存在**。现在这张表是树结构的唯一真相，`documents.folder` 是归档
 * 指派（冗余路径串）。一致性由服务端维护：指派到新路径自动补建祖先
 * （mkdir -p），改/删目录批量重写指派（含笔记 frontmatter 与上传件 meta.json）。
 */
export const folders = pgTable('folders', {
  /** 完整路径本身是主键，如 `技术/前端/React`——目录没有 id，路径就是身份 */
  path: text('path').primaryKey(),
  /** 知识库描述（D-078）。空串 = 没写 */
  description: text('description').notNull().default(''),
  /** 知识库图标的键（shared 的 FOLDER_ICONS 之一）。null = 未选 */
  icon: text('icon'),
  /**
   * 知识库短码（如 `7ZZRF7`）。路径会随改名/移动变化，界面上能复制分享的
   * 是这个稳定的短码；只有顶层（知识库）在界面上用，但每行都生成——
   * 子目录将来被移动成顶层时不用补号。
   */
  code: text('code').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

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
 * 会话优先的导航（`.trellis/spec/project/product.md` §5.2）意味着会话是一等公民：它出现在左导航、
 * 占据中栏的「本次引用」、在右栏展开检索过程。所以必须落库——
 * 只存在内存里的话，刷新一次「会话历史」就空了，那这个导航结构就是假的。
 */
export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    /** 由第一个问题生成，之后不再变。空会话显示为「新对话」 */
    title: text('title').notNull().default(''),
    retrievalScope: jsonb('retrieval_scope').$type<import('@mimir/shared').RetrievalScope>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('conversations_updated_at_idx').on(t.updatedAt.desc())],
)

/** Durable binding for a DOCX agent run awaiting client tool results. */
export const docxAgentRuns = pgTable(
  'docx_agent_runs',
  {
    runId: text('run_id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    documentId: text('document_id').notNull(),
    format: text('format').notNull().default('docx'),
    version: integer('version').notNull().default(0),
    roundId: text('round_id').notNull(),
    messageId: text('message_id').notNull(),
    interruptIds: jsonb('interrupt_ids').$type<string[]>().notNull(),
    tools: jsonb('tools').$type<import('@mimir/shared').DocxAgentToolHistory[]>().notNull(),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => [index('docx_agent_runs_conversation_idx').on(t.conversationId, t.documentId)],
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
 * 文档间的链接 —— 让双链是双向的（`.trellis/spec/project/product.md` §5.10）。
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
 * 检索单元（M1-B，`.trellis/spec/project/architecture.md` §4.8）。
 *
 * 「引用指回原文位置」的前提是检索单元自带偏移——M0 的文档级命中点不出位置，
 * 只能拿查询词去猜。分块是**派生数据**：`documents.body` 完全可重建，
 * 所以删库后由「重建索引」恢复（`services/chunks.ts` 的 syncChunks）。
 *
 * 三处刻意的设计（`.trellis/spec/project/architecture.md` §4.8）：
 *
 * 1. **id 确定性**（`文档 id:序号`）。重建后同一篇的同一段还是同一个 id，
 *    于是向量表上的冲突是更新而不是插入——否则每重建一次攒一批孤儿向量
 * 2. **偏移相对完整正文**（不是相对分块），引用与高亮直接可用
 * 3. **不存 is_enabled**。它的用途是「不删也能把某段排除出检索」，
 *    而那需要一个「排除这一段」的动作才成立——先加后忘的字段会变成
 *    没人读的列
 */
export const chunks = pgTable(
  'chunks',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    /** 从 0 开始。相邻（idx 连续）的分块在引用组装时会被合并 */
    idx: integer('idx').notNull(),
    /** 分块正文。**逐字节等于 `body.slice(start_at, end_at)`**（测试断言守着） */
    content: text('content').notNull(),
    /** jieba 预分词（铁律 4）：词级通道走这一列，子串通道走 content */
    searchText: text('search_text').notNull().default(''),
    /** 相对完整正文的字符偏移 */
    startAt: integer('start_at').notNull(),
    endAt: integer('end_at').notNull(),
    /** 所属标题路径，如「部署 / 已知坑」 */
    heading: text('heading'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('chunks_document_idx_idx').on(t.documentId, t.idx),
    // 与 documents 上那两个同构：词级走 search_text，子串兜底走 content。
    // 这两条是 PG 专有索引（SQLite 由 chunks_fts 虚拟表与触发器替代），
    // parity 守卫测试把它们排除在跨方言比较之外
    index('chunks_search_idx').using('gin', sql`to_tsvector('simple', ${t.searchText})`),
    index('chunks_content_trgm_idx').using('gin', sql`${t.content} gin_trgm_ops`),
  ],
)

/**
 * 分块的向量（M1-B，`.trellis/spec/project/architecture.md` §4.8）。
 *
 * **独立成表**（WeKnora 的生产实践）而不是往 chunks 上加列：换 embedding
 * 模型时旧向量共存、不立刻删；同一分块可以有多个模型的行。
 * 主键 `(chunk_id, model)` 让「补嵌入」天然可重入——判据是表里有没有行，
 * 不需要进度计数器（`.trellis/spec/project/architecture.md` §4.10）。
 *
 * **PG 用 `halfvec`**：维度上限 2000 → 4000（`.trellis/spec/project/architecture.md` §4.5 实测）。
 * 列上不带维度修饰符（`halfvec` 而不是 `halfvec(1024)`）——同一列要容纳
 * 不同维度的模型，维度写在 `dimension` 列里。HNSW 索引是**按维度的
 * 表达式索引**，由迁移手写（drizzle 表达不了），见 `drizzle/0010_chunks.sql`；
 * 查询必须写成同一个表达式并带 `dimension = N`，否则索引静默不命中。
 *
 * `embedding` 的列类型在 SQLite 侧是 BLOB（sqlite-vec 的 float32 字节），
 * 这一列**不参与**双方言的逐列对齐断言（见 `schema-parity.test.ts`）。
 */
const halfvec = customType<{ data: string; driverData: string }>({
  dataType: () => 'halfvec',
})

export const chunkEmbeddings = pgTable(
  'chunk_embeddings',
  {
    chunkId: text('chunk_id')
      .notNull()
      .references(() => chunks.id, { onDelete: 'cascade' }),
    /** 产生这个向量的模型名。换模型后的旧行保留（可回滚、可对比） */
    model: text('model').notNull(),
    /** 向量的实际维度。查询按它筛选，与模型名一起决定用哪批行 */
    dimension: integer('dimension').notNull(),
    /** 半精度向量，文本形态（`[0.1,0.2,…]`）进出，由查询里的 `::halfvec` 解释 */
    embedding: halfvec('embedding').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.chunkId, t.model] })],
)

/**
 * 配置覆盖层。**只存「界面显式设置过」的行**，不 seed 默认值。
 *
 * 解析顺序是 `本表 > 环境变量 > 代码默认`（`.trellis/spec/project/architecture.md` §7.5）。
 * 不 seed 是关键：插一批默认行会让部署方在 `.env` 里配的值被空默认值
 * **静默覆盖**，而那是最难查的一类问题（配置明明写了，行为却是默认的）。
 *
 * 按 key 一行而不是一个 JSON 列：单行 JSON 的并发写法是「读-改-写」，
 * 两个设置同时改会丢一个；按 key 一行可以用 `ON CONFLICT DO UPDATE`。
 *
 * 哪些键可写是**闭集**（`@mimir/core` 的键表 + 插件声明的 params），
 * 写入端点在写之前会校验——这个表只负责承载值，不负责解释它。
 */
/**
 * RSS / Atom 订阅源（M1-E，`.trellis/spec/project/product.md` §3.1）。
 *
 * 「技术博客的主路径是 RSS / Atom 订阅」——它比爬首页稳得多，
 * 也不需要处理反爬。这张表记的是**订阅关系**，不是文章：
 * 文章本身仍然走 `documents`（统一形状，铁律 3）。
 *
 * `last_item_at` 是**水位线**：轮询时只关心比它新的条目，
 * 所以重复轮询的代价与「库里已有多少篇」无关。
 * 不用「已入库的文章列表」做判据的原因是那需要每个源一遍 join——
 * 而 `canonical_url` 唯一索引本来就会挡住重复入库（第二道保险）。
 */
export const feeds = pgTable(
  'feeds',
  {
    /** 订阅源的 URL（feed 地址本身，不是站点首页） */
    url: text('url').primaryKey(),
    /** 显示名。首次拉取时从 feed 的 <title> 取，用户可改 */
    title: text('title').notNull().default(''),
    /** 新文章归入的目录。null = 未指派 */
    folder: text('folder'),
    /**
     * 最后成功拉取的时间。null = 还没成功拉过。
     *
     * **与 `last_error` 分开**：拉取失败时这里的值不动——它回答的是
     * 「上次成功是什么时候」，而界面要能同时说「3 天前成功过」
     * 与「昨天那次失败了：404」。
     */
    lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
    /**
     * 最后一次失败的说明。null = 上次成功了。
     *
     * 只在「这次失败」时写、成功时清空：一个永远不会被清空的错误字段
     * 会让用户以为它一直在坏。
     */
    lastError: text('last_error'),
    /** 累计入库的条数（这一轮加的）。**只增不减**，用于界面上「共收了多少」 */
    itemCount: integer('item_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('feeds_folder_idx').on(t.folder)],
)

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

/**
 * 用量记账。**一行 = 一次模型调用**（含失败），append-only。
 *
 * ## 为什么不是从现有表现算
 *
 * `messages` / `documents` 都有 `created_at`，看起来「问了多少次、写了多少篇」
 * 可以直接聚合。但**现有表里没有 token 数**，而 token 只有调用那一刻才知道、
 * 事后无可挽回；`updated_at` 又是可变的（只反映最后一次编辑）。
 *
 * ## 四个刻意的设计（`.trellis/spec/project/architecture.md` §12、D-034）
 *
 * 1. **不加外键**到 conversations / documents，只存 `refId` 字符串。
 *    `messages.conversation_id` 是 `onDelete: 'cascade'`——加外键的话，
 *    删一个会话，「我这个月花了多少钱」会**静默变少**。账本不该被业务删除改写
 * 2. **token 三列可为 null，且 null ≠ 0**。兼容端点不一定回传 usage；
 *    填 0 会让界面显示「今天 0 token」而那天明明调了 8 次——确定的谎言
 *    比诚实的未知糟得多
 * 3. **失败也记**（`ok = false`）。失败的调用可能已经计费（流式中断、超时），
 *    而且失败率本身解释了「为什么这个月体验差」
 * 4. **只记数字，不记 prompt 内容**。存了内容它就成了第二个消息存储，
 *    检索、导出、删除都要跟着处理它
 */
export const usageLog = pgTable(
  'usage_log',
  {
    id: text('id').primaryKey(),
    /** 调用时刻。**不可变**——它与业务表的 `updated_at` 是两种东西 */
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),

    /** chat | reasoning | summarize | embed */
    role: text('role').notNull(),
    /**
     * 这次调用属于哪个功能：chat | ask | summary | embed | probe。
     *
     * 它是「这笔钱花在哪个功能上」的唯一答案。`probe`（设置页的测试连接）
     * 必须单列一类：它是真实调用，混进「我的用量」是另一种说谎。
     */
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
    ok: boolean('ok').notNull().default(true),
    /** quota | timeout | truncated | offline，与消息的 failure 同一套分类 */
    failureKind: text('failure_kind'),

    /** 会话 id 或文档 id。**无外键**，见上 */
    refId: text('ref_id'),
  },
  (t) => [index('usage_log_at_idx').on(t.at.desc())],
)

// Better Auth 的表结构单独一个文件，但必须并入同一个 schema 对象，
// 这样 drizzle(sql, { schema }) 才能让适配器解析到表名。
export * from './auth-schema.js'

/** Separate limited device credentials; raw tokens never enter the database. */
export const miniappDevices = pgTable(
  'miniapp_devices',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => authSession.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    credentialHash: text('credential_hash').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('miniapp_devices_token_idx').on(t.tokenHash),
    index('miniapp_devices_owner_idx').on(t.ownerId),
  ],
)

/** Durable operation receipts survive a disconnected client and process restart. */
export const miniappOperations = pgTable(
  'miniapp_operations',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').notNull(),
    requestId: text('request_id').notNull(),
    kind: text('kind').notNull(),
    fingerprint: text('fingerprint').notNull(),
    status: text('status').notNull(),
    processId: text('process_id').notNull(),
    conversationId: text('conversation_id'),
    result: jsonb('result').$type<import('@mimir/shared/miniapp').MiniappOperationResult>(),
    error: jsonb('error').$type<{ code: string; message: string }>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('miniapp_operations_request_idx').on(t.ownerId, t.requestId),
    index('miniapp_operations_status_idx').on(t.status),
  ],
)
