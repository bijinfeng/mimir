import { beforeAll, describe, expect, it, vi } from 'vitest'
import { nanoid } from 'nanoid'
import matter from 'gray-matter'
import type {
  MiniappDocument,
  MiniappLoginResponse,
  MiniappWriteResponse,
} from '@mimir/shared/miniapp'
import { db } from '../db/client.js'
import { documents } from '../db/schema.js'
import { createFolder } from '../services/folders.js'
import { readDocumentVersion, updateNote } from '../services/documents.js'
import { app, getAuthCookie, TEST_USER } from './helpers.js'

vi.mock('../env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../env.js')>()
  return { ...actual, env: { ...actual.env, miniappEnabled: true } }
})

let token: string
let folder: string
const requestId = () => `miniapp-write-${nanoid(20)}`
async function request<T>(path: string, payload?: unknown) {
  const response = await app.request(`/api/miniapp${path}`, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  return { status: response.status, body: (await response.json()) as T }
}
function savedDocument(response: { status: number; body: MiniappWriteResponse }): MiniappDocument {
  expect(response.status).toBe(200)
  expect(response.body.operation.status).toBe('succeeded')
  const result = response.body.operation.result
  if (result?.type !== 'document') throw new Error('预期文档操作结果')
  return result.document
}
async function create(body = '原始正文') {
  return savedDocument(
    await request<MiniappWriteResponse>('/notes', {
      requestId: requestId(),
      title: '小程序编辑用例',
      body,
      folder,
      tags: [],
    }),
  )
}

beforeAll(async () => {
  await getAuthCookie()
  const response = await app.request('/api/miniapp/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: TEST_USER.email, password: TEST_USER.password }),
  })
  expect(response.status).toBe(200)
  token = ((await response.json()) as MiniappLoginResponse).token
  folder = await createFolder({ path: `miniapp-write-${nanoid(10)}` })
})

describe('小程序版本保护与有限编辑', () => {
  it('整理元信息保留不认识的 frontmatter 字段', async () => {
    const note = await create('含有自定义元信息的正文\n')
    const custom = { review: { owner: 'admin', state: 'draft' }, aliases: ['资料别名'] }
    await updateNote(
      note.id,
      { title: note.title },
      {
        expectedRevision: note.revision,
        preserveSource: true,
        extraFrontmatter: custom,
      },
    )
    const baseline = await readDocumentVersion(note.id)
    expect(baseline?.rawNote).toBeTruthy()
    const organized = savedDocument(
      await request<MiniappWriteResponse>(`/documents/${note.id}/update`, {
        requestId: requestId(),
        expectedRevision: baseline!.revision,
        tags: ['已整理'],
      }),
    )
    const version = await readDocumentVersion(note.id)
    expect(matter(version!.rawNote!).data).toMatchObject(custom)
    expect(organized.body).toBe(note.body)
  })

  it('Markdown 高级语法和 CRLF 无改动往返，元信息编辑不回写旧正文', async () => {
    const body =
      '\r\n# 标题\r\n\r\n> [!note] 提示\r\n> 保留两空格  \r\n\r\n$$x^2$$\r\n\r\n```mermaid\r\ngraph LR\r\n A-->B\r\n```\r\n'
    const note = await create(body)
    expect(note.body).toBe(body)
    const metadata = savedDocument(
      await request<MiniappWriteResponse>(`/documents/${note.id}/update`, {
        requestId: requestId(),
        expectedRevision: note.revision,
        title: '仅整理标题',
        tags: ['保留正文'],
      }),
    )
    expect(metadata.body).toBe(body)
    expect(metadata.title).toBe('仅整理标题')
    const exact = await readDocumentVersion(note.id)
    expect(exact?.document.body).toBe(body)
    expect(exact?.rawNote).toContain(body)
    expect(metadata.revision).not.toBe(note.revision)
  })

  it('电脑保存之后，旧 revision 更新失败且不覆盖新正文', async () => {
    const note = await create()
    await updateNote(note.id, { body: '电脑端的新内容' })
    const response = await request<MiniappWriteResponse>(`/documents/${note.id}/update`, {
      requestId: requestId(),
      expectedRevision: note.revision,
      body: '手机旧草稿',
    })
    expect(response.status).toBe(200)
    expect(response.body.operation.status).toBe('failed')
    expect(response.body.operation.error?.code).toBe('DOCUMENT_CONFLICT')
    expect((await readDocumentVersion(note.id))?.document.body.trim()).toBe('电脑端的新内容')
  })

  it('追加只提交增量，旧基线不能重复追加', async () => {
    const note = await create('第一段\r\n')
    const appended = savedDocument(
      await request<MiniappWriteResponse>(`/documents/${note.id}/append`, {
        requestId: requestId(),
        expectedRevision: note.revision,
        text: '第二段',
      }),
    )
    expect(appended.body).toBe('第一段\r\n\r\n第二段')
    const stale = await request<MiniappWriteResponse>(`/documents/${note.id}/append`, {
      requestId: requestId(),
      expectedRevision: note.revision,
      text: '不应写入',
    })
    expect(stale.status).toBe(200)
    expect(stale.body.operation.status).toBe('failed')
    expect(stale.body.operation.error?.code).toBe('DOCUMENT_CONFLICT')
    expect((await readDocumentVersion(note.id))?.document.body).toBe(appended.body)
  })

  it('抓取正文只读，但允许整理元信息', async () => {
    const id = nanoid(16)
    await db
      .insert(documents)
      .values({ id, kind: 'web', title: '抓取资料', body: '抓取原文', folder })
    const detail = await request<{ document: MiniappDocument }>(`/documents/${id}`)
    expect(detail.body.document.canEditBody).toBe(false)
    expect(detail.body.document).not.toHaveProperty('path')
    expect(detail.body.document).not.toHaveProperty('sourceKey')
    const rejected = await request<MiniappWriteResponse>(`/documents/${id}/update`, {
      requestId: requestId(),
      expectedRevision: detail.body.document.revision,
      body: '禁止修改',
    })
    expect(rejected.status).toBe(200)
    expect(rejected.body.operation.status).toBe('failed')
    expect(rejected.body.operation.error?.code).toBe('BODY_READ_ONLY')
    const organized = savedDocument(
      await request<MiniappWriteResponse>(`/documents/${id}/update`, {
        requestId: requestId(),
        expectedRevision: detail.body.document.revision,
        title: '资料新标题',
      }),
    )
    expect(organized.body).toBe('抓取原文')
    expect(organized.title).toBe('资料新标题')
  })
})
