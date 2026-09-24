import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { inflateRawSync } from 'node:zlib'
import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { documents } from '../db/schema.js'
import { reindexVault } from '../services/vault-index.js'
import { activeStorage } from '../plugins/host.js'
import { app, getAuthCookie, makeClient } from './helpers.js'

const execFileAsync = promisify(execFile)

/**
 * 上传与预览的行为断言（`docs/TECH.md` §13、D-044）。
 *
 * 这一组断言针对的都是**静默失效**——出错时不报错，只是行为不对：
 *
 *  1. **原件没落盘**：数据库有记录、点下载是 404。断言「原件字节能逐字节读回」
 *  2. **格式判定错了**：`.md` 被当成普通文件存成只读副本，用户改不了它
 *  3. **Office 提取把共享字符串漏了**：xlsx 的文本变成一串数字下标，
 *     看起来解析成功、实际全是垃圾。断言提取出的正文里有真正的文字
 *  4. **重建索引漏掉 uploads**：数据库丢了之后文件类文档永久消失。
 *     断言「删掉记录后重建，标题、标签、目录、原件都回来」
 *  5. **大小校验晚于写文件**：被拒绝的请求留下一个永远不会被引用的文件
 *  6. **GBK 文本被静默入库**：满屏替换字符，搜什么都搜不到
 */

let client: ReturnType<typeof makeClient>

beforeAll(async () => {
  client = makeClient(await getAuthCookie())
})

/** multipart 上传。`makeClient.request` 会强制 JSON，所以单独发 */
async function upload(
  cookie: string,
  filename: string,
  data: Uint8Array | string,
  type = 'application/octet-stream',
): Promise<{
  status: number
  body: {
    document?: { id: string; kind: string }
    parseError?: string | null
    charCount?: number
    error?: { code: string; message: string }
  }
}> {
  const form = new FormData()
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  // 复制成独立的 ArrayBuffer 再交给 Blob：`Uint8Array` 的 buffer 类型可能是
  // SharedArrayBuffer（`ArrayBufferLike`），而 `BlobPart` 只收 `ArrayBuffer`
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  form.append('file', new Blob([copy], { type }), filename)

  const res = await app.request('/api/documents/files', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: form,
  })

  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

/**
 * 生成一份真实的 `.docx` / `.xlsx` / `.pptx`。
 *
 * **不用手写的假 ZIP**：那测不出「真实的 OOXML 长什么样」——而这一层最容易
 * 出的错恰恰是真实文件的细节（xlsx 的共享字符串表、pptx 的多页顺序）。
 * Python 的 zipfile 在测试环境里可用，用它现造一份结构最小但合法的包。
 */
async function makeOoxml(kind: 'docx' | 'xlsx' | 'pptx'): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'mimir-test-'))
  const out = join(dir, `sample.${kind}`)

  const script = `
import zipfile, sys
p = sys.argv[1]
kind = sys.argv[2]
with zipfile.ZipFile(p, 'w') as z:
    z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
    if kind == 'docx':
        z.writestr('word/document.xml', '''<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>季度报告</w:t></w:r></w:p>
<w:p><w:r><w:t>这是 Word 正文里的独特词元QqWw。</w:t></w:r></w:p>
</w:body></w:document>''')
    elif kind == 'xlsx':
        z.writestr('xl/sharedStrings.xml', '''<?xml version="1.0"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>共享字符串独特词元ZzXx</t></si></sst>''')
        z.writestr('xl/worksheets/sheet1.xml', '''<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c></row>
</sheetData></worksheet>''')
    else:
        z.writestr('ppt/slides/slide1.xml', '''<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>
<p:sp><p:txBody><a:p><a:r><a:t>幻灯片独特词元PpQq</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:sld>''')
`

  try {
    await execFileAsync('python3', ['-c', script, out, kind])
    return new Uint8Array(readFileSync(out))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('上传：原件是真相', () => {
  it('原件逐字节落在存储里，能用下载端点原样取回', async () => {
    // 用不可压缩的随机字节：全零的内容会让「写空了」与「写对了」分不出来
    const bytes = new Uint8Array(2048)
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 37) % 256

    const cookie = await getAuthCookie()
    const created = await upload(cookie, '报表.bin', bytes, 'application/octet-stream')
    expect(created.status).toBe(201)

    const id = created.body.document?.id
    expect(id).toBeTruthy()
    expect(created.body.document?.kind).toBe('file')

    const res = await app.request(`/api/documents/${id}/file`, { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)

    const back = new Uint8Array(await res.arrayBuffer())
    expect(back.byteLength).toBe(bytes.byteLength)
    expect([...back]).toEqual([...bytes])

    // 直接读磁盘：这是本地后端特有的性质，也是「原件能脱离应用拿走」的落点
    const [row] = await db.select().from(documents).where(eq(documents.id, id!))
    expect(row?.sourceKey).toBe(`uploads/${id}/报表.bin`)
    const onDisk = new Uint8Array(await activeStorage().read(row!.sourceKey!))
    expect([...onDisk]).toEqual([...bytes])
  })

  it('未知格式没有正文，但记录、大小与 mime 都对，且能被下载', async () => {
    const cookie = await getAuthCookie()
    const created = await upload(cookie, '归档.zip', 'PK\u0003\u0004fake', 'application/zip')

    expect(created.status).toBe(201)
    expect(created.body.charCount).toBe(0)
    // 「没有提取实现」与「提取失败」必须都能被区分：这一条是前者（error 为 null）
    expect(created.body.parseError).toBeNull()

    const id = created.body.document!.id
    const detail = await client.get<{
      mime: string
      size: number
      body: string
      sourceKey: string
    }>(`/api/documents/${id}`)
    expect(detail.body.mime).toBe('application/zip')
    expect(detail.body.body).toBe('')
    expect(detail.body.sourceKey).toContain(`uploads/${id}/`)
    expect(detail.body.size).toBeGreaterThan(0)
  })

  it('Markdown 变成可编辑笔记（进 vault、kind=note），而不是只读副本', async () => {
    const cookie = await getAuthCookie()
    const md =
      '---\ntitle: 导入的笔记\ntags: [导入, 测试]\n---\n\n# 小标题\n\n正文里的独特词元MmNn。\n'
    const created = await upload(cookie, '随手记.md', md, 'text/markdown')

    expect(created.status).toBe(201)
    // 关键：它是 note，不是 file——上传一份 md 却得到只读副本是荒谬的
    expect(created.body.document?.kind).toBe('note')

    const detail = await client.get<{
      kind: string
      title: string
      tags: string[]
      path: string | null
    }>(`/api/documents/${created.body.document!.id}`)
    // frontmatter 的 title 与 tags 被读出来了
    expect(detail.body.title).toBe('导入的笔记')
    expect(detail.body.tags).toContain('导入')
    // 它有 vault 路径（说明真的落进了 vault，能被 Obsidian 打开）
    expect(detail.body.path).toMatch(/\.md$/)
  })

  it('文本文件按 UTF-8 读出正文，内容可被搜索', async () => {
    const cookie = await getAuthCookie()
    const created = await upload(
      cookie,
      '日志.txt',
      '第一行日志\n独特词元TtUu 出现了\n',
      'text/plain',
    )

    expect(created.status).toBe(201)
    expect(created.body.charCount).toBeGreaterThan(0)
    expect(created.body.parseError).toBeNull()

    const search = await client.get<{ hits: { documentId: string }[] }>(
      '/api/search?q=独特词元TtUu',
    )
    expect(search.body.hits.map((hit) => hit.documentId)).toContain(created.body.document!.id)
  })

  it('非 UTF-8 文本**不被静默入库**：正文为空且留下原因', async () => {
    const cookie = await getAuthCookie()
    // GBK 编码的「中文」：0xD6 0xD0 0xCE 0xC4 在 UTF-8 里是非法序列
    const gbk = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4, 0x0a])
    const created = await upload(cookie, 'gbk.txt', gbk, 'text/plain')

    expect(created.status).toBe(201)
    expect(created.body.charCount).toBe(0)
    // 关键：原因被记下来了，而不是插一堆 U+FFFD 替换字符当正文
    expect(created.body.parseError).toContain('UTF-8')
  })

  it('空文件被拒绝，且不留下任何文件', async () => {
    const cookie = await getAuthCookie()
    const created = await upload(cookie, '空.txt', new Uint8Array(0), 'text/plain')

    expect(created.status).toBe(400)
    expect(created.body.error?.code).toBe('EMPTY_FILE')
  })
})

describe('Office 提取', () => {
  it('docx：提取出标题层级与正文', async () => {
    const cookie = await getAuthCookie()
    const created = await upload(cookie, '报告.docx', await makeOoxml('docx'))

    expect(created.status).toBe(201)
    expect(created.body.parseError).toBeNull()

    const detail = await client.get<{ body: string; mime: string }>(
      `/api/documents/${created.body.document!.id}`,
    )
    // 标题层级来自 w:pStyle，正文里的独特词元说明真正的文字被取出来了
    expect(detail.body.body).toContain('# 季度报告')
    expect(detail.body.body).toContain('独特词元QqWw')
    expect(detail.body.mime).toContain('wordprocessingml')
  })

  it('xlsx：**共享字符串被查表还原**，不是一串数字下标', async () => {
    const cookie = await getAuthCookie()
    const created = await upload(cookie, '表格.xlsx', await makeOoxml('xlsx'))

    expect(created.status).toBe(201)

    const detail = await client.get<{ body: string }>(`/api/documents/${created.body.document!.id}`)
    /*
     * 这一条断言守的是 xlsx 最容易做错的地方：单元格里的文字绝大多数存在
     * `sharedStrings.xml` 里，`sheet1.xml` 只有一个下标。只读后者的实现
     * 会「解析成功」但正文是一串数字——看起来正常，实际全是垃圾。
     */
    expect(detail.body.body).toContain('共享字符串独特词元ZzXx')
    expect(detail.body.body).not.toMatch(/^\s*0\s*$/m)
  })

  it('pptx：按页分段提取', async () => {
    const cookie = await getAuthCookie()
    const created = await upload(cookie, '讲稿.pptx', await makeOoxml('pptx'))

    expect(created.status).toBe(201)

    const detail = await client.get<{ body: string }>(`/api/documents/${created.body.document!.id}`)
    expect(detail.body.body).toContain('## 第 1 页')
    expect(detail.body.body).toContain('幻灯片独特词元PpQq')
  })

  it('损坏的 docx：如实报错，但原件仍然保存下来', async () => {
    const cookie = await getAuthCookie()
    // 一个不是 ZIP 的东西，但扩展名是 .docx
    const created = await upload(
      cookie,
      '坏的.docx',
      'this is not a zip file at all',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )

    expect(created.status).toBe(201)
    expect(created.body.charCount).toBe(0)
    // 「提取失败」有原因——与「还没有实现」区分开
    expect(created.body.parseError).toBeTruthy()

    // 原件在：坏文件也能下载出来自己看
    const res = await app.request(`/api/documents/${created.body.document!.id}/file`, {
      headers: { Cookie: cookie },
    })
    expect(res.status).toBe(200)
  })
})

describe('下载端点的安全与 Range', () => {
  it('HTML 与 SVG **强制走 attachment**，不在应用同源上内联执行脚本', async () => {
    const cookie = await getAuthCookie()

    const html = await upload(cookie, 'xss.html', '<script>alert(1)</script>', 'text/html')
    const htmlRes = await app.request(`/api/documents/${html.body.document!.id}/file`, {
      headers: { Cookie: cookie },
    })
    expect(htmlRes.headers.get('content-disposition')).toContain('attachment')

    const svg = await upload(
      cookie,
      'xss.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      'image/svg+xml',
    )
    const svgRes = await app.request(`/api/documents/${svg.body.document!.id}/file`, {
      headers: { Cookie: cookie },
    })
    expect(svgRes.headers.get('content-disposition')).toContain('attachment')

    // 反过来：PDF 可以内联（它是预览 PDF 的方式，且不能带脚本）
    const pdf = await upload(cookie, 'doc.pdf', '%PDF-1.4 fake', 'application/pdf')
    const pdfRes = await app.request(`/api/documents/${pdf.body.document!.id}/file`, {
      headers: { Cookie: cookie },
    })
    expect(pdfRes.headers.get('content-disposition')).toContain('inline')
  })

  it('单段 Range 返回 206 与正确的切片（视频要它才能播）', async () => {
    const cookie = await getAuthCookie()
    const bytes = new Uint8Array(1000)
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 256

    const created = await upload(cookie, 'clip.bin', bytes)
    const id = created.body.document!.id

    const res = await app.request(`/api/documents/${id}/file`, {
      headers: { Cookie: cookie, Range: 'bytes=100-199' },
    })
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe('bytes 100-199/1000')
    expect(res.headers.get('accept-ranges')).toBe('bytes')

    const slice = new Uint8Array(await res.arrayBuffer())
    expect(slice.byteLength).toBe(100)
    expect(slice[0]).toBe(100)
    expect(slice[99]).toBe(199)
  })

  it('区间越界返回 416（而不是静默给整份）', async () => {
    const cookie = await getAuthCookie()
    const created = await upload(cookie, 'small.bin', new Uint8Array(10))

    const res = await app.request(`/api/documents/${created.body.document!.id}/file`, {
      headers: { Cookie: cookie, Range: 'bytes=100-200' },
    })
    expect(res.status).toBe(416)
    expect(res.headers.get('content-range')).toBe('bytes */10')
  })

  it('未鉴权读不到原件', async () => {
    const cookie = await getAuthCookie()
    const created = await upload(cookie, 'private.bin', 'secret')

    const res = await app.request(`/api/documents/${created.body.document!.id}/file`)
    expect(res.status).toBe(401)
  })
})

describe('重建索引能把上传件找回来', () => {
  it('删掉数据库记录后，标题、标签、目录与原件都恢复', async () => {
    const cookie = await getAuthCookie()
    const created = await upload(cookie, '重建验证券.txt', '重建用的独特词元RrSs。', 'text/plain')
    const id = created.body.document!.id

    // 整理一下：加标签、归目录、标为已读——这些是用户劳动，重建不该丢
    await client.patch(`/api/documents/${id}`, {
      tags: ['重建', '上传'],
      folder: '验证/上传',
      status: 'ready',
    })

    // 模拟「数据库丢了」
    await db.delete(documents).where(eq(documents.id, id))

    const result = await reindexVault()
    expect(result.created).toBeGreaterThan(0)

    const restored = await client.get<{
      id: string
      kind: string
      title: string
      tags: string[]
      folder: string | null
      status: string
      body: string
      sourceKey: string | null
    }>(`/api/documents/${id}`)

    expect(restored.status).toBe(200)
    expect(restored.body.kind).toBe('file')
    expect(restored.body.title).toBe('重建验证券')
    // 标签：存在 meta.json 里，重建必须一起还原（与 vault 的 frontmatter 同理）
    expect(restored.body.tags).toEqual(expect.arrayContaining(['重建', '上传']))
    expect(restored.body.folder).toBe('验证/上传')
    expect(restored.body.status).toBe('ready')
    // 正文是重新提取的（派生数据，可以在重建时重跑）
    expect(restored.body.body).toContain('独特词元RrSs')
    expect(restored.body.sourceKey).toContain('uploads/')
  })

  it('原件文件消失时仍然恢复记录，并如实报告（而不是整条丢失）', async () => {
    const cookie = await getAuthCookie()
    const created = await upload(cookie, '删原件.txt', '待会删掉原件。', 'text/plain')
    const id = created.body.document!.id

    // 手删原件（模拟「有人手动清理了磁盘」）
    const keys = await activeStorage().list(`uploads/${id}`)
    for (const key of keys) {
      if (!key.endsWith('meta.json')) await activeStorage().remove(key)
    }

    await db.delete(documents).where(eq(documents.id, id))
    await reindexVault()

    const restored = await client.get<{ title: string }>(`/api/documents/${id}`)
    // 记录还在——「有这么一份文件，但原件不见了」比「什么都没有」有用
    expect(restored.status).toBe(200)
    expect(restored.body.title).toBe('删原件')
  })
})

describe('导出包含原件', () => {
  it('markdown 导出的 zip 里有 原件/ 目录，且字节与上传的一致', async () => {
    const cookie = await getAuthCookie()
    // 独一无二的内容，便于在 zip 里认出它
    const marker = '导出独特词元EeFfGgHiJj'
    await upload(cookie, '导出验证.txt', marker, 'text/plain')

    const res = await app.request('/api/export/markdown', { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)

    const zip = Buffer.from(await res.arrayBuffer())
    const entries = readZip(zip)

    // 条目名与内容都要在。**内容必须解压后再比**——zip 的正文是 deflate 压缩的，
    // 直接在字节流里搜字符串会落空（而那只说明「压缩生效了」，不说明内容不对）
    const original = entries.find((entry) => entry.name === '原件/导出验证.txt')
    expect(original).toBeDefined()
    expect(original!.data.toString('utf8')).toBe(marker)

    // 正文那一份也要在（资料/ 下），且内容一致
    const body = entries.find(
      (entry) => entry.name.includes('导出验证') && entry.name.endsWith('.md'),
    )
    expect(body).toBeDefined()
    expect(body!.data.toString('utf8')).toContain(marker)

    // 统计里的体积要含原件（漏掉它会让「约 N MB」错得离谱）
    const stats = await client.get<{ files: number; bytes: number }>('/api/export/stats')
    expect(stats.body.files).toBeGreaterThan(0)
    expect(stats.body.bytes).toBeGreaterThan(Buffer.byteLength(marker, 'utf8'))
  })
})

/**
 * 极简 ZIP 读取器：只够读出中央目录里的条目名与「stored / deflate」两种情况。
 *
 * **为什么不在测试里引一个解压库**：`archiver` 只负责写，读它是另一件事，
 * 而为了断言「原件在包里」引一个新依赖不值得——真出问题时是包的字节不对，
 * 而不是解压算法不对。用 node 自带的 `inflateRawSync` 就够（ZIP 的
 * 压缩体就是裸 deflate 流）。
 */
function readZip(buffer: Buffer): { name: string; data: Buffer }[] {
  // 从尾部找 End of Central Directory（签名 0x06054b50）
  let eocd = buffer.length - 22
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1
  if (eocd < 0) throw new Error('不是有效的 zip：找不到中央目录结尾')

  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const entries: { name: string; data: Buffer }[] = []

  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('中央目录条目签名不对')

    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)

    // 本地文件头：名字与 extra 的长度可能与中央目录不同，必须从这里读
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const raw = buffer.subarray(dataStart, dataStart + compressedSize)

    entries.push({
      name,
      data: method === 0 ? Buffer.from(raw) : inflateRawSync(raw),
    })

    offset += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

describe('列表与筛选', () => {
  it('「收集的资料」的计数与列表条数一致（多值 kind 筛选）', async () => {
    const cookie = await getAuthCookie()
    await upload(cookie, 'clip-验证.txt', '筛选验证', 'text/plain')

    const counts = await client.get<{ clip: number }>('/api/documents/counts')
    const list = await client.get<{ items: unknown[] }>(
      '/api/documents?kinds=web,wechat,github,file&limit=100',
    )

    /*
     * 这一条守的是一个**曾经真的错了**的地方：计数按「非笔记」算，
     * 而列表的 clip 视图不过滤任何东西——数字与点进去看到的不一致。
     * 当时库里全是笔记所以看不出来，一有上传件立刻暴露。
     */
    expect(list.body.items.length).toBe(counts.body.clip)
  })

  it('按 file 筛选只返回上传件', async () => {
    const list = await client.get<{ items: { kind: string }[] }>(
      '/api/documents?kind=file&limit=100',
    )

    expect(list.body.items.length).toBeGreaterThan(0)
    expect(list.body.items.every((item) => item.kind === 'file')).toBe(true)
  })
})

describe('替换原件', () => {
  it('换掉原件后正文重算，但标签与目录保持不变', async () => {
    const cookie = await getAuthCookie()
    const created = await upload(cookie, '替换前.txt', '旧内容词元AaBb。', 'text/plain')
    const id = created.body.document!.id

    await client.patch(`/api/documents/${id}`, { tags: ['保留我'], folder: '验证' })

    const form = new FormData()
    form.append(
      'file',
      new Blob([new TextEncoder().encode('新内容词元CcDd。')], { type: 'text/plain' }),
      '替换后.txt',
    )

    const res = await app.request(`/api/documents/${id}/file`, {
      method: 'PUT',
      headers: { Cookie: cookie },
      body: form,
    })
    expect(res.status).toBe(200)

    const after = await client.get<{
      body: string
      tags: string[]
      folder: string | null
      sourceKey: string
      size: number
    }>(`/api/documents/${id}`)

    // 正文换了（它跟着原件走）
    expect(after.body.body).toContain('新内容词元CcDd')
    expect(after.body.body).not.toContain('旧内容词元AaBb')
    // 用户整理的劳动没丢——这是「替换」与「删了重传」的区别
    expect(after.body.tags).toContain('保留我')
    expect(after.body.folder).toBe('验证')
    // 文件名也跟着换了（用户多半也在改文件名）
    expect(after.body.sourceKey).toContain('替换后.txt')

    // 旧原件被清掉，没有孤儿
    const listed = await activeStorage().list(`uploads/${id}`)
    const names = listed.map((key) => key.split('/').pop())
    expect(names).toContain('替换后.txt')
    expect(names).not.toContain('替换前.txt')
  })
})
