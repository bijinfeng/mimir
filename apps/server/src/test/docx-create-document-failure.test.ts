import { eq } from 'drizzle-orm'
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { db } from '../db/client.js'
import { documents } from '../db/schema.js'
import { createDocxAgentDocument } from '../services/docx-create-document.js'
import { getDocument } from '../services/documents.js'
import { uploadFile } from '../services/upload.js'

vi.mock('../services/extract.js', () => ({
  extractText: vi.fn<() => Promise<{ markdown: string; error: string }>>(async () => ({
    markdown: '',
    error: '模拟解析失败',
  })),
}))

describe('DOCX agent create_document failure cleanup', () => {
  it('hides and removes a generated file when the upload parser reports an error', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', '<w:document/>')
    const source = await uploadFile({
      filename: 'source.docx',
      data: await zip.generateAsync({ type: 'uint8array' }),
    })
    const title = `创建失败-${crypto.randomUUID()}`

    await expect(
      createDocxAgentDocument({
        documentId: source.document.id,
        title,
        format: 'html',
        content:
          '<!doctype html><html><head><title>测试</title></head><body><p>正文</p></body></html>',
      }),
    ).rejects.toThrow('新文档解析失败：模拟解析失败')

    const [created] = await db
      .select({ id: documents.id, deletedAt: documents.deletedAt })
      .from(documents)
      .where(eq(documents.title, title))
    expect(created?.deletedAt).toBeInstanceOf(Date)
    expect(await getDocument(created!.id)).toBeNull()
  })
})
