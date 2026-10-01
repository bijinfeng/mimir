import { Hono } from 'hono'
import {
  documentListQuerySchema,
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
 * 建议标签。
 *
 * 整理条把它直接摆成按钮（`docs/PRD.md` §5.10）——后端早就该算它，
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
