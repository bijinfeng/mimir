import { Hono } from 'hono'
import {
  aiTextRequestSchema,
  documentListQuerySchema,
  embedRequestSchema,
  folderCreateSchema,
  folderDeleteSchema,
  folderMoveSchema,
  noteCreateSchema,
  noteUpdateSchema,
} from '@mimir/shared'
import { HttpError, parseInput } from '../lib/http.js'
import {
  countDocuments,
  createNote,
  deleteDocument,
  getDocument,
  listAllTags,
  listDocuments,
  updateNote,
} from '../services/documents.js'
import { rewriteText, suggestTagsAi, summarizeText } from '../services/ai-text.js'
import { chunkStats, embedPending, rebuildAllChunks } from '../services/chunks.js'
import { createFolder, deleteFolder, listFolderTree, moveFolder } from '../services/folders.js'
import { suggestTags } from '../services/suggestions.js'
import { countOrphanFiles, reindexVault } from '../services/vault-index.js'
import type { AppEnv } from '../types.js'

export const documentsRoute = new Hono<AppEnv>()

documentsRoute.get('/', async (c) => {
  const query = await parseInput(c, 'query', documentListQuerySchema)
  return c.json({ items: await listDocuments(query) })
})

/**
 * 各视图的计数，供左导航显示。
 *
 * 必须注册在 `/:id` **之前**，否则 `/counts` 会被当成一个文档 id。
 */
documentsRoute.get('/counts', async (c) => c.json(await countDocuments()))

/** 新建笔记。走这条路径创建的一定是 note：其余类型都由抓取流程产生。 */
documentsRoute.post('/notes', async (c) => {
  const input = await parseInput(c, 'json', noteCreateSchema)
  return c.json(await createNote(input), 201)
})

documentsRoute.get('/:id', async (c) => {
  const doc = await getDocument(c.req.param('id'))
  if (!doc) throw new HttpError(404, 'NOT_FOUND', '文档不存在')
  return c.json(doc)
})

documentsRoute.patch('/:id', async (c) => {
  const input = await parseInput(c, 'json', noteUpdateSchema)
  const doc = await updateNote(c.req.param('id'), input)
  if (!doc) throw new HttpError(404, 'NOT_FOUND', '文档不存在')
  return c.json(doc)
})

documentsRoute.delete('/:id', async (c) => {
  const ok = await deleteDocument(c.req.param('id'))
  if (!ok) throw new HttpError(404, 'NOT_FOUND', '文档不存在')
  return c.json({ ok: true })
})

export const tagsRoute = new Hono<AppEnv>()

tagsRoute.get('/', async (c) => c.json({ items: await listAllTags() }))

/**
 * 内联改写（M1-D，`.trellis/spec/project/product.md` §4 M1）。
 *
 * 挂在顶层 `/api/ai` 而不是 `/api/documents/...`：改写的文本**可能还没保存**
 * （编辑器里选中一段直接改），所以它不该要求先有一篇文档。
 * `documentId` 只是可选的记账归属。
 *
 * 三个能力（摘要 / 标签 / 改写）里只有这一个是「不依赖某篇文档」的，
 * 所以它单独一个路由组；另外两个挂在文档下（它们要读正文）。
 */
export const aiTextRoute = new Hono<AppEnv>()

aiTextRoute.post('/rewrite', async (c) => {
  const input = await parseInput(c, 'json', aiTextRequestSchema)
  if (!input.action) {
    throw new HttpError(
      400,
      'INVALID_INPUT',
      '改写需要指定 action（rewrite / translate / shorten / expand）',
    )
  }

  const result = await rewriteText(input.text, input.action, {
    ...(input.instruction ? { instruction: input.instruction } : {}),
    // `refId` 是可选的记账归属：没有 documentId 时**不编一个假值**，
    // 空着比错的归属诚实（账本里「这笔属于谁」必须是真的）
    ...(input.documentId ? { refId: input.documentId } : {}),
  })
  return c.json(result)
})

/**
 * 建议标签。
 *
 * 整理条把它直接摆成按钮（`.trellis/spec/project/product.md` §5.10）——后端早就该算它，
 * 界面上没地方显示等于白算。放在文档路由下（`/:id/suggested-tags`）而不是
 * 单独端点，是因为它需要正文，而正文只有服务端能读到最新的
 * （文件可能被外部编辑器改过，见 services/documents.ts 的 getDocument）。
 */
documentsRoute.get('/:id/suggested-tags', async (c) => {
  const doc = await getDocument(c.req.param('id'))
  if (!doc) throw new HttpError(404, 'NOT_FOUND', '文档不存在')

  const items = await suggestTags(doc.title, doc.body, { exclude: doc.tags })
  return c.json({ items })
})

/**
 * AI 标签建议（M1-D）。
 *
 * 与上面那条共用一个 URL 前缀但语义不同：那是**统计**（jieba 词频，
 * 零成本、随开随算），这是**模型判断**（要花钱、要用户点一下）。
 * 分成两个端点而不是一个带开关的：界面上的两处文案完全不同
 * （「建议标签」vs「让 AI 建议」），而一个带开关的端点会让
 * 「这次花了钱没有」变成要看参数才知道。
 */
documentsRoute.post('/:id/suggested-tags/ai', async (c) => {
  const doc = await getDocument(c.req.param('id'))
  if (!doc) throw new HttpError(404, 'NOT_FOUND', '文档不存在')

  const result = await suggestTagsAi(doc.title, doc.body, {
    exclude: doc.tags,
    refId: doc.id,
  })
  return c.json(result)
})

/**
 * AI 摘要（M1-D）。
 *
 * 走 `summarize` 角色（有自己的适配器，§5.2）。摘要**不落库**——
 * 它是「现在想看一眼这篇讲了什么」，而落库会引入「摘要过期了吗」
 * 这个新状态（正文改了、摘要还是旧的）。要看就重新生成一次，
 * 这在 M1 的量级上比维护一份会过期的缓存便宜。
 */
documentsRoute.post('/:id/summary', async (c) => {
  const doc = await getDocument(c.req.param('id'))
  if (!doc) throw new HttpError(404, 'NOT_FOUND', '文档不存在')

  /**
   * 正文太长时只取前面一段：摘要模型对超长输入会截断或报错，
   * 而**截断由我们做**能保证「取的是开头」这一确定行为
   * （让模型自己截断时，截在哪里不可知）。
   */
  const result = await summarizeText(doc.body.slice(0, 12000), doc.id)
  return c.json(result)
})

/**
 * 目录树与目录管理。
 *
 * 挂在 `/api/folders` 而不是 `/api/documents/folders`：它是**派生的聚合**，
 * 不是文档资源的一部分。放在文档下会让 `/documents/:id` 有歧义
 * （`folders` 会被当成一个 id）。
 *
 * D-068 起目录是实体（folders 表），增删改移都在这里：
 * 改名与移动共用 PATCH（from 子树整体搬到 to），删除时文档保留、指派清空。
 */
export const foldersRoute = new Hono<AppEnv>()

foldersRoute.get('/', async (c) => c.json({ items: await listFolderTree() }))

foldersRoute.post('/', async (c) => {
  const input = await parseInput(c, 'json', folderCreateSchema)
  return c.json(
    {
      path: await createFolder({
        path: input.path,
        description: input.description,
        icon: input.icon,
      }),
    },
    201,
  )
})

foldersRoute.patch('/', async (c) => {
  const input = await parseInput(c, 'json', folderMoveSchema)
  return c.json({ moved: await moveFolder(input.from, input.to) })
})

foldersRoute.delete('/', async (c) => {
  const input = await parseInput(c, 'query', folderDeleteSchema)
  return c.json({ cleared: await deleteFolder(input.path) })
})

/**
 * 重建索引。用于「用外部编辑器改了文件」「从别处拷来一批 md」之后同步。
 * 同时返回尚未入库的文件数，方便界面提示。
 */
export const maintenanceRoute = new Hono<AppEnv>()

maintenanceRoute.post('/reindex', async (c) => {
  const result = await reindexVault()
  return c.json({ ...result, orphans: await countOrphanFiles() })
})

maintenanceRoute.get('/orphans', async (c) => c.json({ orphans: await countOrphanFiles() }))

/**
 * 分块状态（M1-B，`.trellis/spec/project/architecture.md` §4.10）。
 *
 * 返回「共 N 段 · 待嵌入 M 段」，`pending` 为 `null` 表示没配向量化模型——
 * 界面上「待嵌入」这一栏该显式说是「未配置向量化模型」，而不是显示 0：
 * 0 会被读成「都嵌好了」，而实际上一条都没有。
 */
maintenanceRoute.get('/chunks', async (c) => c.json(await chunkStats()))

/**
 * 分批补嵌入。**可重入**（§4.10）：判据是向量表里有没有行，
 * 不是进度计数器——中途失败或重启，下一次从缺的那些继续。
 *
 * 返回 `processed`（本次嵌了几条）与 `remaining`（还剩几条）：
 * 界面按它显示进度条，也用它决定要不要继续调。
 */
maintenanceRoute.post('/embed', async (c) => {
  const input = await parseInput(c, 'json', embedRequestSchema)
  return c.json(await embedPending(input.limit))
})

/**
 * 全量核对分块（换了 `parser.chunk.size` / `overlap`，或升级修复旧索引后用）。
 *
 * **不含嵌入**——重算分块会把变了的分块的旧向量一起删掉（级联），
 * 新的向量要接着调 `/maintenance/embed` 补。两件事分开是刻意的：
 * 一个不花钱、一个花钱，分开的按钮让用户知道钱花在哪一步。
 */
maintenanceRoute.post('/chunks/rebuild', async (c) => c.json(await rebuildAllChunks()))
