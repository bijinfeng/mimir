import { createApp } from '../app.js'

export const app = createApp()

export const TEST_USER = {
  email: 'owner@example.com',
  password: 'test-password-123',
  name: 'owner',
}

function readCookie(res: Response): string {
  const raw = res.headers.getSetCookie?.() ?? []
  return raw.map((entry) => entry.split(';')[0]).join('; ')
}

/**
 * 拿到登录态。
 *
 * 先试登录再试注册：注册接口在「已有用户」时会被拒（单用户规则），
 * 而多个测试文件共用同一个测试库时，谁是第一个跑的不确定。
 * 做成幂等的，文件顺序就不影响结果。
 */
export async function getAuthCookie(): Promise<string> {
  const signIn = await app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
  })
  if (signIn.status === 200) return readCookie(signIn)

  const signUp = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TEST_USER),
  })
  if (signUp.status !== 200) {
    throw new Error(`测试用户登录与注册都失败：sign-up=${signUp.status}`)
  }
  return readCookie(signUp)
}

export function makeClient(cookie: string) {
  return {
    async request<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
      const res = await app.request(path, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          ...init.headers,
        },
      })
      const text = await res.text()
      return {
        status: res.status,
        body: (text ? JSON.parse(text) : null) as T,
      }
    },
    get<T>(path: string) {
      return this.request<T>(path)
    },
    post<T>(path: string, payload: unknown) {
      return this.request<T>(path, { method: 'POST', body: JSON.stringify(payload) })
    },
    patch<T>(path: string, payload: unknown) {
      return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(payload) })
    },
    delete<T>(path: string) {
      return this.request<T>(path, { method: 'DELETE' })
    },
  }
}

export interface SearchResponseShape {
  mode: string
  channels: string[]
  tookMs: number
  total: number
  hits: {
    documentId: string
    title: string
    snippet: { text: string; start: number; end: number }
    matchedBy: string[]
    score: number
  }[]
}
