import { beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type {
  MiniappLoginResponse,
  MiniappOperation,
  MiniappWriteResponse,
} from '@mimir/shared/miniapp'
import { db } from '../db/client.js'
import { miniappOperations } from '../db/schema.js'
import { createFolder } from '../services/folders.js'
import { authenticateMiniapp } from '../services/miniapp-auth.js'
import { beginMiniappOperation, recoverMiniappOperations } from '../services/miniapp-operations.js'
import { app, getAuthCookie, TEST_USER } from './helpers.js'

vi.mock('../env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../env.js')>()
  return { ...actual, env: { ...actual.env, miniappEnabled: true } }
})

let token: string
let folder: string
const requestId = () => `miniapp-operation-${nanoid(20)}`
async function login() {
  const response = await app.request('/api/miniapp/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: TEST_USER.email, password: TEST_USER.password }),
  })
  expect(response.status).toBe(200)
  return ((await response.json()) as MiniappLoginResponse).token
}
async function request<T>(path: string, payload?: unknown, deviceToken = token) {
  const response = await app.request(`/api/miniapp${path}`, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${deviceToken}`, 'Content-Type': 'application/json' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  return { status: response.status, body: (await response.json()) as T }
}
beforeAll(async () => {
  await getAuthCookie()
  token = await login()
  folder = await createFolder({ path: `miniapp-operations-${nanoid(10)}` })
})

describe('小程序持久操作回执与防重', () => {
  it('相同 requestId 和参数返回同一文档与持久回执', async () => {
    const payload = {
      requestId: requestId(),
      title: '幂等创建',
      body: '只写入一份',
      folder,
      tags: [],
    }
    const first = await request<MiniappWriteResponse>('/notes', payload)
    expect(first.status).toBe(200)
    expect(first.body.operation.status).toBe('succeeded')
    const second = await request<MiniappWriteResponse>('/notes', payload)
    expect(second.status).toBe(200)
    expect(second.body.operation).toEqual(first.body.operation)
    const rows = await db
      .select()
      .from(miniappOperations)
      .where(eq(miniappOperations.requestId, payload.requestId))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.result).toEqual(first.body.operation.result)
    const byId = await request<{ operation: MiniappOperation }>(
      `/operations/${first.body.operation.id}`,
    )
    const byRequest = await request<{ operation: MiniappOperation }>(
      `/operations/${payload.requestId}`,
    )
    expect(byId.body.operation).toEqual(first.body.operation)
    expect(byRequest.body.operation).toEqual(first.body.operation)
  })

  it('同一 requestId 更换内容返回 409，不覆盖原回执', async () => {
    const payload = { requestId: requestId(), title: '固定参数', body: '原内容', folder, tags: [] }
    const first = await request<MiniappWriteResponse>('/notes', payload)
    expect(first.body.operation.status).toBe('succeeded')
    const conflict = await request<{ error: { code: string } }>('/notes', {
      ...payload,
      body: '不同内容',
    })
    expect(conflict.status).toBe(409)
    expect(conflict.body.error.code).toBe('REQUEST_ID_CONFLICT')
    const receipt = await request<{ operation: MiniappOperation }>(
      `/operations/${payload.requestId}`,
    )
    expect(receipt.body.operation.result).toEqual(first.body.operation.result)
  })

  it('业务失败是 HTTP 200 的 failed 回执，重放不会把它误当成功', async () => {
    const payload = {
      requestId: requestId(),
      title: '不存在的目标',
      body: '不能创建',
      folder: `missing-${nanoid(12)}`,
      tags: [],
    }
    const first = await request<MiniappWriteResponse>('/notes', payload)
    expect(first.status).toBe(200)
    expect(first.body.operation.status).toBe('failed')
    expect(first.body.operation.result).toBeNull()
    expect(first.body.operation.error?.code).toBe('SCOPE_NOT_FOUND')
    const replay = await request<MiniappWriteResponse>('/notes', payload)
    expect(replay.status).toBe(200)
    expect(replay.body.operation).toEqual(first.body.operation)
  })

  it('同账号新设备可查询原回执，避免换设备重复写入', async () => {
    const payload = {
      requestId: requestId(),
      title: '跨设备回执',
      body: '同账号去重',
      folder,
      tags: [],
    }
    const first = await request<MiniappWriteResponse>('/notes', payload)
    const anotherToken = await login()
    const receipt = await request<{ operation: MiniappOperation }>(
      `/operations/${payload.requestId}`,
      undefined,
      anotherToken,
    )
    expect(receipt.status).toBe(200)
    expect(receipt.body.operation.id).toBe(first.body.operation.id)
    const replay = await request<MiniappWriteResponse>('/notes', payload, anotherToken)
    expect(replay.body.operation.result).toEqual(first.body.operation.result)
  })

  it('服务重启后的 pending 标为 interrupted，重放不自动抓取', async () => {
    // Seed only the durable receipt; no HTTP fetch or capturer is invoked.
    const payload = { requestId: requestId(), url: 'https://example.com/article', folder }
    const principal = await authenticateMiniapp(`Bearer ${token}`)
    const entry = await beginMiniappOperation(principal, payload.requestId, 'capture', payload)
    expect(entry.fresh).toBe(true)
    expect(entry.operation.status).toBe('pending')
    await db
      .update(miniappOperations)
      .set({ processId: 'a-previous-server-process' })
      .where(eq(miniappOperations.id, entry.operation.id))
    await recoverMiniappOperations()
    const receipt = await request<{ operation: MiniappOperation }>(
      `/operations/${entry.operation.id}`,
    )
    expect(receipt.body.operation.status).toBe('interrupted')
    expect(receipt.body.operation.error?.code).toBe('OPERATION_INTERRUPTED')
    const replay = await request<MiniappWriteResponse>('/capture', payload)
    expect(replay.status).toBe(200)
    expect(replay.body.operation.status).toBe('interrupted')
    expect(replay.body.operation.id).toBe(entry.operation.id)
    expect(replay.body.operation.result).toBeNull()
  })
})
