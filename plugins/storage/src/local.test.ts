import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { StorageBackend } from '@mimir/shared'
import { createLocalStorage } from './local.js'

/**
 * 本地后端的行为契约。
 *
 * ## 这些断言是给**两个**后端写的
 *
 * 同一条契约在 S3 后端上也要成立（`move` 的非原子性是唯一被允许的差别，
 * 见 `StorageBackend` 的注释）。所以这里刻意只断言契约本身，
 * 不碰任何本地特有的东西——除了那几个「本地特有」的用例，它们单独分组。
 *
 * 断言的是**契约里那句承诺**，不是实现细节：
 *   - `read` 不存在时抛错（调用方要能区分「读不到」与「读到空」）
 *   - `remove` 幂等（头像清三种扩展名靠它）
 *   - `move` 之后源没了、目标在
 *   - `list` 递归、不给中间目录
 *   - key 越界被拒（安全边界）
 */

let root: string
let storage: StorageBackend

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'mimir-storage-'))
  storage = createLocalStorage({ root })
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('存储后端契约（两个后端都要满足）', () => {
  it('写进去读得出来，中文与换行都不失真', async () => {
    const content = '---\ntitle: 组件性能优化\n---\n\n正文第一行\n正文第二行\n'
    await storage.write('vault/2026/09/测试-a1b2c3d4.md', content)

    const raw = await storage.read('vault/2026/09/测试-a1b2c3d4.md')
    expect(Buffer.from(raw).toString('utf8')).toBe(content)
  })

  it('读不存在的 key 抛错（而不是回空）', async () => {
    // 「读不到」与「读到空字符串」必须可区分：前者要回退到数据库里的副本，
    // 后者是一个真实的空文件。静默回空会让整篇笔记变成空白。
    //
    // 断言里要求错误**点出是哪个 key**：读不到时调用方要能看出是哪一个
    // （而不是「vault 里某处出错了」这种没法排查的话）。这里不断言具体错误码，
    // 那样会把契约绑死在某个后端的实现上。
    await expect(storage.read('vault/2026/09/根本没有这个文件.md')).rejects.toThrow(
      /根本没有这个文件/,
    )
  })

  it('remove 是幂等的（删不存在的 key 也算成功）', async () => {
    await storage.write('avatars/u1.webp', 'x')
    await storage.remove('avatars/u1.webp')
    // 第二次不该抛——头像要依次清三种扩展名，其中两种本来就不存在
    await expect(storage.remove('avatars/u1.webp')).resolves.toBeUndefined()
  })

  it('move 之后源不存在、目标内容一致', async () => {
    const content = '移动测试内容'
    await storage.write('vault/2026/09/老名字-abcd1234.md', content)

    await storage.move('vault/2026/09/老名字-abcd1234.md', 'vault/2026/09/新名字-abcd1234.md')

    // move 之后源必须真的没了。同样要求错误点出 key——
    // 「源不存在」与「move 没生效」是两种不同的失败，靠错误信息区分
    await expect(storage.read('vault/2026/09/老名字-abcd1234.md')).rejects.toThrow(
      /老名字-abcd1234/,
    )
    const moved = await storage.read('vault/2026/09/新名字-abcd1234.md')
    expect(Buffer.from(moved).toString('utf8')).toBe(content)
  })

  it('move 到同一位置是无操作（不报错、内容不动）', async () => {
    await storage.write('vault/same.md', 'same')
    await expect(storage.move('vault/same.md', 'vault/same.md')).resolves.toBeUndefined()
    const raw = await storage.read('vault/same.md')
    expect(Buffer.from(raw).toString('utf8')).toBe('same')
  })

  it('list 递归返回文件、不返回中间目录', async () => {
    await storage.write('vault/list/deep/a.md', 'a')
    await storage.write('vault/list/b.md', 'b')

    const found = await storage.list('vault/list')

    expect(found).toContain('vault/list/deep/a.md')
    expect(found).toContain('vault/list/b.md')
    // 中间层不是「文件」——对象存储里它根本不存在，本地后端也不该把它报出来，
    // 否则两个后端在这里语义分叉
    expect(found).not.toContain('vault/list/deep')
    expect(found.every((key) => key.endsWith('.md'))).toBe(true)
  })

  it('list 一个不存在的 key 给空数组（不是抛错）', async () => {
    // 「没有任何文件」是合法答案：空 vault 重建索引就走这条路
    await expect(storage.list('vault/从来没建过的目录')).resolves.toEqual([])
  })

  it('list 接受带或不带结尾斜杠的前缀', async () => {
    await storage.write('raw/abc/index.html', '<html></html>')

    const withoutSlash = await storage.list('raw')
    const withSlash = await storage.list('raw/')

    expect(withoutSlash).toContain('raw/abc/index.html')
    expect(withSlash).toContain('raw/abc/index.html')
  })

  it('拒绝越出数据根的 key（目录穿越）', async () => {
    /**
     * key 会来自数据库的 `path` 列，而那一列可能被手工改过、
     * 也可能来自别处导入的 frontmatter。`../../../etc/passwd`
     * 必须在**进入文件系统之前**被拒绝。
     */
    await expect(storage.read('../../etc/passwd')).rejects.toThrow(/越界/)
    await expect(storage.write('../../../tmp/evil.md', 'x')).rejects.toThrow(/越界/)
  })

  it('probe 真的写一个、读回、再删掉', async () => {
    const result = await storage.probe?.()
    expect(result?.ok).toBe(true)

    // 探针不能留下垃圾
    const leftovers = await storage.list('.probe')
    expect(leftovers).toEqual([])
  })
})

describe('本地后端特有：数据是普通文件', () => {
  it('写入后磁盘上真的有一个文件，且是 UTF-8 文本', async () => {
    await storage.write('vault/plain/note.md', '# 标题\n\n中文正文\n')

    const abs = join(root, 'vault/plain/note.md')
    const { readFile } = await import('node:fs/promises')
    const text = await readFile(abs, 'utf8')

    expect(text).toBe('# 标题\n\n中文正文\n')
  })

  it('写入会自动建父目录（调用方不必先 mkdir）', async () => {
    await storage.write('vault/2027/01/自动建目录.md', 'x')

    const { readFile } = await import('node:fs/promises')
    await expect(readFile(join(root, 'vault/2027/01/自动建目录.md'), 'utf8')).resolves.toBe('x')
  })

  it('二进制内容不失真（头像走的是这条路）', async () => {
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0xff, 0x57, 0x45, 0x42, 0x50])
    await storage.write('avatars/u9.webp', bytes)

    const raw = await storage.read('avatars/u9.webp')
    expect(Array.from(raw)).toEqual(Array.from(bytes))
  })
})
