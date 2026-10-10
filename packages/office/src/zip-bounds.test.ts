import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { openDocx } from './docx.js'
import { PptxArchive } from './pptx-archive.js'
import { readXlsx } from './xlsx.js'
import { openXlsxForEdit } from './xlsx-edit.js'
import { BoundedZip } from './zip-bounds.js'

async function makeZip(entries: Record<string, string>) {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(entries)) {
    zip.file(path, content, { createFolders: false })
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

const limits = { inputBytes: 1024 * 1024, parts: 3, entryBytes: 1024, totalBytes: 1536 }

describe('浏览器 Office ZIP 预算', () => {
  it('恰好到单条边界可读，读取后的字节可供补丁式保存', async () => {
    const source = await makeZip({ 'word/document.xml': 'x'.repeat(1024), 'image.bin': 'abc' })
    const zip = await BoundedZip.open(source, limits)
    expect((await zip.read('word/document.xml'))?.byteLength).toBe(1024)
    expect(await zip.readText('word/document.xml')).toBe('x'.repeat(1024))
    const all = await zip.readAll()
    expect(all.get('image.bin')).toEqual(new TextEncoder().encode('abc'))
    expect(all.size).toBe(2)
  })

  it('单条过大时在流读取期间拒绝，而非等完整条目物化', async () => {
    const source = await makeZip({ 'word/document.xml': 'x'.repeat(1025) })
    const zip = await BoundedZip.open(source, limits)
    await expect(zip.read('word/document.xml')).rejects.toThrow('单个部件超过')
  })

  it('ZIP 声明解压大小偏小时，仍以实际流字节为准', async () => {
    const source = await makeZip({ 'word/document.xml': 'x'.repeat(2048) })
    const forged = new Uint8Array(source)
    const view = new DataView(forged.buffer)
    view.setUint32(22, 1, true) // local header 的原始大小
    let central = -1
    for (let index = 0; index < forged.byteLength - 4; index += 1) {
      if (view.getUint32(index, true) === 0x02014b50) {
        central = index
        break
      }
    }
    expect(central).toBeGreaterThan(0)
    view.setUint32(central + 24, 1, true) // central directory 的原始大小
    const zip = await BoundedZip.open(forged, limits)
    await expect(zip.read('word/document.xml')).rejects.toThrow('单个部件超过')
  })

  it('多条分别不超限但累计超限时拒绝', async () => {
    const source = await makeZip({ 'a.xml': 'a'.repeat(800), 'b.xml': 'b'.repeat(800) })
    const zip = await BoundedZip.open(source, limits)
    await expect(zip.readAll()).rejects.toThrow('累计解压量超过')
  })

  it('docx 预检会发现未被解析器主动读取的隐藏大部件', async () => {
    const source = await makeZip({
      'word/document.xml': '<w:t>小</w:t>',
      'word/media/hidden.bin': 'x'.repeat(1025),
    })
    const zip = await BoundedZip.open(source, limits)
    await expect(zip.preflightAll()).rejects.toThrow('单个部件超过')
  })

  it('输入字节和部件数量也有上限', async () => {
    const source = await makeZip({ 'a.bin': 'a', 'b.bin': 'b', 'c.bin': 'c', 'd.bin': 'd' })
    await expect(BoundedZip.open(source, limits)).rejects.toThrow('部件数超过')
    await expect(
      BoundedZip.open(source, { ...limits, inputBytes: source.byteLength - 1 }),
    ).rejects.toThrow('压缩包超过')
  })

  it('docx、xlsx 预览/编辑、pptx 打开都经过共用边界', async () => {
    const guard = vi.spyOn(BoundedZip, 'open').mockRejectedValue(new Error('ZIP 预检拒绝'))
    try {
      const bytes = new Uint8Array()
      await expect(openDocx(bytes)).rejects.toThrow('ZIP 预检拒绝')
      await expect(readXlsx(bytes)).rejects.toThrow('ZIP 预检拒绝')
      await expect(openXlsxForEdit(bytes)).rejects.toThrow('ZIP 预检拒绝')
      await expect(PptxArchive.open(bytes)).rejects.toThrow('ZIP 预检拒绝')
      expect(guard).toHaveBeenCalledTimes(4)
    } finally {
      guard.mockRestore()
    }
  })
})
