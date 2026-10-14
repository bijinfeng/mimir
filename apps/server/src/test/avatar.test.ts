import { mkdir, readdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { env } from '../env.js'
import { app, getAuthCookie, makeClient, TEST_USER } from './helpers.js'
import { db } from '../db/client.js'
import { user } from '../db/schema.js'

/**
 * 头像与名称的行为断言（`.trellis/spec/project/decisions.md` D-036 的验证方式）。
 *
 * 四类失效都很静默，所以每条断言对应一个：
 *
 *  1. **换图不生效**——文件名固定，浏览器拿缓存里的旧图，看起来像「上传没反应」。
 *     断言的是「第二次上传后 URL 里的 `v` 变了」
 *  2. **头像进了 vault**——那会让它进分词、进导出、进重建索引的扫描范围。
 *     断言 vault 目录下没有它
 *  3. **坏文件被写进磁盘再报错**——先校验后写，否则留下永远不被引用的文件
 *  4. **未鉴权可读**——头像是私人资源，不能裸奔
 */

/** 造一张最小的合法 webp。内容不重要，服务端只验 MIME 与大小 */
function fakeWebp(bytes = 64): Blob {
  const buffer = new Uint8Array(bytes)
  // RIFF....WEBP 的魔数前缀，让文件至少看起来像 webp（服务端不解析，但便于人工排查）
  buffer.set([0x52, 0x49, 0x46, 0x46], 0)
  buffer.set([0x57, 0x45, 0x42, 0x50], 8)
  return new Blob([buffer], { type: 'image/webp' })
}

async function upload(cookie: string, file: Blob): Promise<{ status: number; body: unknown }> {
  const form = new FormData()
  form.append('file', file, 'avatar.webp')

  const res = await app.request('/api/avatar', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: form,
  })

  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

/** 列目录。目录还不存在时返回空数组——测试库刚建时就是空的 */
async function listFiles(dir: string): Promise<string[]> {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

/**
 * 头像与笔记在磁盘上的位置。
 *
 * 这两个目录**不再各自来自一个环境变量**，而是同一个 `DATA_DIR` 下的
 * 两个前缀（`avatars/` 与 `vault/`，见 `StorageBackend` 的契约注释）。
 * 改动之前它们各有独立默认值，容器里漏配 `AVATARS_DIR` 时头像会落到
 * 容器可写层（`.trellis/spec/project/research.md` §10.10）——现在这种漏配不可能发生。
 *
 * 测试仍然断言**物理目录**，因为「头像不进 vault」这条边界
 * 在本地后端上的表现就是「不在那个目录里」（D-036 的验证方式）。
 */
const avatarsDir = resolve(env.dataDir, 'avatars')
const vaultDir = resolve(env.dataDir, 'vault')

let cookie = ''

beforeAll(async () => {
  cookie = await getAuthCookie()
  // 从一个已知状态开始：没有头像
  await db.update(user).set({ image: null })
  await rm(avatarsDir, { recursive: true, force: true })
  await mkdir(avatarsDir, { recursive: true })
})

describe('头像上传与读取', () => {
  it('未登录不能读也不能写', async () => {
    // 头像是私人资源，不是公开静态文件
    const read = await app.request('/api/avatar')
    expect(read.status).toBe(401)

    const write = await upload('', fakeWebp())
    expect(write.status).toBe(401)
  })

  it('上传成功后能读回，且 MIME 正确', async () => {
    const uploaded = await upload(cookie, fakeWebp(128))
    expect(uploaded.status).toBe(200)

    const url = (uploaded.body as { image: string }).image
    expect(url.startsWith('/api/avatar?v=')).toBe(true)

    const read = await app.request(url, { headers: { Cookie: cookie } })
    expect(read.status).toBe(200)
    expect(read.headers.get('Content-Type')).toBe('image/webp')
  })

  it('再次上传后 URL 的版本号必须变化', async () => {
    /**
     * **这条是「上传没反应」那个坑的断言。**
     *
     * 文件名固定成 `<userId>.webp` 是刻意的（不攒孤儿文件、不需要删旧文件），
     * 代价就是浏览器会一直显示缓存里的旧图。版本号进 URL 是唯一的解法。
     *
     * 版本号若不变，缓存键不变，用户会看到旧头像——而他会以为是自己点错了。
     */
    const first = await upload(cookie, fakeWebp(100))
    const firstUrl = (first.body as { image: string }).image

    // 同一毫秒内两次上传会让 Date.now() 相同，等一毫秒让版本必然不同
    await new Promise((done) => setTimeout(done, 2))

    const second = await upload(cookie, fakeWebp(200))
    const secondUrl = (second.body as { image: string }).image

    expect(secondUrl).not.toBe(firstUrl)

    const read = await app.request(secondUrl, { headers: { Cookie: cookie } })
    const data = new Uint8Array(await read.arrayBuffer())
    expect(data.byteLength, '读回的应该是第二张').toBe(200)
  })

  it('带版本的请求可以长缓存，不带版本的必须每次校验', async () => {
    // 这是版本号带来的收益：带 v 的 URL 永远不会指向不同的内容
    const versioned = await app.request('/api/avatar?v=1', { headers: { Cookie: cookie } })
    expect(versioned.headers.get('Cache-Control')).toContain('immutable')

    const bare = await app.request('/api/avatar', { headers: { Cookie: cookie } })
    expect(bare.headers.get('Cache-Control')).toContain('no-cache')
  })

  it('没有头像时回 404（界面据此回落成字母头像）', async () => {
    await db.update(user).set({ image: null })
    await rm(avatarsDir, { recursive: true, force: true })
    await mkdir(avatarsDir, { recursive: true })

    const res = await app.request('/api/avatar', { headers: { Cookie: cookie } })
    expect(res.status).toBe(404)

    // 复位成一个有效状态，供后面的用例使用
    await upload(cookie, fakeWebp(64))
  })
})

describe('校验在写文件之前', () => {
  it('类型不对时 400，且磁盘上不留文件', async () => {
    await rm(avatarsDir, { recursive: true, force: true })
    await mkdir(avatarsDir, { recursive: true })

    const wrongType = new Blob([new Uint8Array(64)], { type: 'application/pdf' })
    const result = await upload(cookie, wrongType)

    expect(result.status).toBe(400)
    expect((result.body as { error: { code: string } }).error.code).toBe('INVALID_TYPE')

    /**
     * **断言目录是空的**，不只是「返回了 400」。
     * 先写后校验的实现在这里会留下一个永远不被引用的文件——
     * 而那种残留没有任何症状，只会让备份越来越大。
     */
    const files = await readdir(avatarsDir)
    expect(files).toEqual([])
  })

  it('超过大小上限时 400，且不留文件', async () => {
    const tooBig = new Blob([new Uint8Array(600 * 1024)], { type: 'image/webp' })
    const result = await upload(cookie, tooBig)

    expect(result.status).toBe(400)
    expect((result.body as { error: { code: string } }).error.code).toBe('TOO_LARGE')

    const files = await readdir(avatarsDir)
    expect(files).toEqual([])
  })

  it('字段名不对时 400（而不是静默通过）', async () => {
    const form = new FormData()
    form.append('avatar', fakeWebp(), 'x.webp')

    const res = await app.request('/api/avatar', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
    })
    expect(res.status).toBe(400)
  })
})

describe('头像不进 vault', () => {
  it('上传后 vault 目录里没有头像文件', async () => {
    /**
     * 头像不是内容：放进 vault 会让它进 jieba 分词、进导出包、
     * 进重建索引的扫描范围——三个地方都要为它加例外（D-036）。
     */
    await upload(cookie, fakeWebp(80))

    const vaultFiles = await listFiles(vaultDir)
    expect(vaultFiles.filter((name) => name.includes('avatar'))).toEqual([])

    // 反过来确认它确实存在：写进了 avatars 目录
    const avatarFiles = await listFiles(avatarsDir)
    expect(avatarFiles.length).toBeGreaterThan(0)
    expect(avatarFiles.every((name) => name.endsWith('.webp'))).toBe(true)
  })
})

describe('头像删除操作不开放', () => {
  it('DELETE 不会删除现有头像', async () => {
    await upload(cookie, fakeWebp(64))

    const deleted = await app.request('/api/avatar', {
      method: 'DELETE',
      headers: { Cookie: cookie },
    })
    expect(deleted.status).toBe(404)

    const read = await app.request('/api/avatar', { headers: { Cookie: cookie } })
    expect(read.status).toBe(200)

    const files = await readdir(avatarsDir)
    expect(files).toHaveLength(1)
  })
})

describe('名称', () => {
  it('通过 Better Auth 的 update-user 改，且库里的值跟着变', async () => {
    const client = makeClient(cookie)
    const result = await client.post('/api/auth/update-user', { name: '新名字' })

    expect(result.status).toBe(200)

    const [row] = await db.select({ name: user.name }).from(user)
    expect(row?.name).toBe('新名字')

    // 复位：别的测试文件按 TEST_USER.name 注册/登录
    await client.post('/api/auth/update-user', { name: TEST_USER.name })
  })

  /**
   * **会话缓存必须关掉**（`apps/server/src/auth.ts` 的注释、D-037）。
   *
   * 这条断言的是「用同一个 cookie 连续请求，看到的资料是最新的」——
   * 打开 `session.cookieCache` 时它会失败，因为那份快照会被复用最多 5 分钟。
   *
   * 为什么值得一条测试：这个 bug 的症状是**界面上头像不动**，
   * 而原因（会话 cookie 里缓存的 user 快照）与现象隔着两层，
   * 极难现场定位——实测是先修了浏览器缓存那个坑（`?v=`）才发现
   * 界面依然不更新，才查到这一层。它属于「不测就会有人重新打开」的开关。
   */
  it('换头像后，同一会话立刻能看到新值（会话缓存没有生效）', async () => {
    const before = await app.request('/api/auth/get-session', { headers: { Cookie: cookie } })
    const beforeImage = ((await before.json()) as { user: { image: string | null } }).user.image

    await upload(cookie, fakeWebp(48))

    const after = await app.request('/api/auth/get-session', { headers: { Cookie: cookie } })
    const afterImage = ((await after.json()) as { user: { image: string | null } }).user.image

    expect(afterImage).toBeTruthy()
    expect(afterImage, '会话返回的仍是旧值——cookieCache 又被打开了？').not.toBe(beforeImage)
  })
})
