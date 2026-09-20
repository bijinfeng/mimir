import { Hono } from 'hono'
import { documentListQuerySchema, noteCreateSchema, noteUpdateSchema } from '@mimir/shared'
import { HttpError, parseInput } from '../lib/http.js'
import {
  createNote,
  deleteDocument,
  getDocument,
  listAllTags,
  listDocuments,
  updateNote,
} from '../services/documents.js'
import { countOrphanFiles, reindexVault } from '../services/vault-index.js'
import type { AppEnv } from '../types.js'

export const documentsRoute = new Hono<AppEnv>()

documentsRoute.get('/', async (c) => {
  const query = await parseInput(c, 'query', documentListQuerySchema)
  return c.json({ items: await listDocuments(query) })
})

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
 * 重建索引。用于「用外部编辑器改了文件」「从别处拷来一批 md」之后同步。
 * 同时返回尚未入库的文件数，方便界面提示。
 */
export const maintenanceRoute = new Hono<AppEnv>()

maintenanceRoute.post('/reindex', async (c) => {
  const result = await reindexVault()
  return c.json({ ...result, orphans: await countOrphanFiles() })
})

maintenanceRoute.get('/orphans', async (c) => c.json({ orphans: await countOrphanFiles() }))
