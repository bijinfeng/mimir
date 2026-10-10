import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAX_XML_ENTRY_BYTES, openOoxmlArchive } from '../../../../plugins/parser/src/ooxml.js'
import { createDocxParser } from '../../../../plugins/parser/src/docx.js'
import { createXlsxParser } from '../../../../plugins/parser/src/xlsx.js'
import { createPptxParser } from '../../../../plugins/parser/src/pptx.js'

/** 用标准库写真实 ZIP，避免手工拼一份只对测试自己有效的假包。 */
function makeZip(entries: Record<string, string>): Uint8Array {
  const script = `
import io, json, sys, zipfile
archive = io.BytesIO()
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as z:
    for name, content in json.loads(sys.argv[1]).items():
        z.writestr(name, content)
sys.stdout.buffer.write(archive.getvalue())
`
  return new Uint8Array(execFileSync('python3', ['-c', script, JSON.stringify(entries)]))
}

const tinyLimits = { entryBytes: 1024, totalBytes: 1536, parts: 3 }

describe('OOXML 正文提取的解压预算', () => {
  it('真实 Office 夹具仍可提取正文（三种格式）', async () => {
    const fixtures = [
      {
        parser: createDocxParser(),
        type: 'docx' as const,
        path: '../../../../packages/office/vendor/apps/docs/tests/pagination-corpus/docx/01-simple-english.docx',
      },
      {
        parser: createXlsxParser(),
        type: 'xlsx' as const,
        path: '../../../../packages/office/vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
      },
      {
        parser: createPptxParser(),
        type: 'pptx' as const,
        path: '../../../../packages/office/tests/fixtures/upstream/01_standard_business.pptx',
      },
    ]
    for (const fixture of fixtures) {
      const data = new Uint8Array(readFileSync(new URL(fixture.path, import.meta.url)))
      const result = await fixture.parser.parse({ type: fixture.type, data })
      expect(result.markdown.length).toBeGreaterThan(0)
    }
  })

  it('只解选中的 XML，正常字节和条目清单可读', () => {
    const zip = makeZip({
      'word/document.xml': '<w:t>正文</w:t>',
      'word/media/image.png': 'ignored',
    })
    const archive = openOoxmlArchive(zip, (path) => path.endsWith('.xml'), tinyLimits)
    expect(archive.read('word/document.xml')).toBe('<w:t>正文</w:t>')
    expect(archive.read('word/media/image.png')).toBeNull()
    expect(archive.list('word/media/')).toEqual(['word/media/image.png'])
  })

  it('单条和累计解压量均在边界处拒绝', () => {
    const exact = makeZip({ 'word/document.xml': 'x'.repeat(1024) })
    expect(openOoxmlArchive(exact, () => true, tinyLimits).read('word/document.xml')).toHaveLength(
      1024,
    )

    const one = makeZip({ 'word/document.xml': 'x'.repeat(1025) })
    expect(() => openOoxmlArchive(one, () => true, tinyLimits)).toThrow('部件过大')

    const two = makeZip({ 'xl/a.xml': 'x'.repeat(800), 'xl/b.xml': 'y'.repeat(800) })
    expect(() => openOoxmlArchive(two, () => true, tinyLimits)).toThrow('累计解压量')
  })

  it('ZIP 头声明值偏小时，实际流字节仍会触发上限', () => {
    const zip = makeZip({ 'word/document.xml': 'x'.repeat(2048) })
    // 本夹具首条 local file header 的 uncompressed size；中央目录仍保持原值。
    // 流式 Unzip 读取本地头，不能只相信其声明的 1 字节。
    const forged = new Uint8Array(zip)
    new DataView(forged.buffer).setUint32(22, 1, true)
    expect(() => openOoxmlArchive(forged, () => true, tinyLimits)).toThrow('部件过大')
  })

  it('过多 ZIP 部件即使不解压也会拒绝', () => {
    const zip = makeZip({ 'a.bin': 'a', 'b.bin': 'b', 'c.bin': 'c', 'd.bin': 'd' })
    expect(() => openOoxmlArchive(zip, () => false, tinyLimits)).toThrow('部件数超过')
  })

  it('默认单条限制对高压缩比 XML 生效', () => {
    // Python 直接生成重复文本，压缩包很小；不在 Node 测试进程里持有 16 MiB 字符串。
    const script = `
import io, sys, zipfile
archive = io.BytesIO()
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as z:
    z.writestr('word/document.xml', 'x' * ${MAX_XML_ENTRY_BYTES + 1})
sys.stdout.buffer.write(archive.getvalue())
`
    const zip = new Uint8Array(execFileSync('python3', ['-c', script]))
    expect(zip.byteLength).toBeLessThan(32 * 1024)
    expect(() => openOoxmlArchive(zip, () => true)).toThrow('部件过大')
  })
})
