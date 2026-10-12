import JSZip from 'jszip'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { readUpload } from '../lib/uploads.js'
import { createDocxAgentDocument } from '../services/docx-create-document.js'
import { getDocument } from '../services/documents.js'
import { uploadFile } from '../services/upload.js'
import { app, getAuthCookie } from './helpers.js'

async function sourceDocx(): Promise<string> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  )
  zip.file(
    'word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>源文档</w:t></w:r></w:p></w:body></w:document>',
  )
  const uploaded = await uploadFile({
    filename: '源文档.docx',
    data: await zip.generateAsync({ type: 'uint8array' }),
  })
  return uploaded.document.id
}

describe('DOCX agent create_document', () => {
  it('creates four openable formats through the knowledge-base upload path', async () => {
    const documentId = await sourceDocx()
    const outcomes: Array<{ format: string; kind: string | undefined; text: string | undefined }> =
      []
    let docxXml = ''
    let pdfPages = 0
    let html = ''
    for (const format of ['docx', 'pdf', 'md', 'html'] as const) {
      const created = await createDocxAgentDocument({
        documentId,
        format,
        title: `新建${format}`,
        content: '# 标题\n第一段中文文档',
      })
      expect(created.format).toBe(format)
      expect(created.parseError).toBeNull()
      const document = await getDocument(created.documentId)
      expect(document).not.toBeNull()
      expect(document?.body).toContain('第一段中文文档')
      outcomes.push({ format, kind: document?.kind, text: document?.body })
      if (format === 'md') continue
      const bytes = await readUpload(document!.sourceKey!)
      if (format === 'docx') {
        const zip = await JSZip.loadAsync(bytes)
        docxXml = await zip.file('word/document.xml')!.async('string')
      } else if (format === 'pdf') {
        pdfPages = (await PDFDocument.load(bytes)).getPageCount()
      } else {
        html = new TextDecoder().decode(bytes)
      }
    }
    expect(outcomes.map(({ format, kind }) => ({ format, kind }))).toEqual([
      { format: 'docx', kind: 'file' },
      { format: 'pdf', kind: 'file' },
      { format: 'md', kind: 'note' },
      { format: 'html', kind: 'file' },
    ])
    expect(docxXml).toContain('第一段中文文档')
    expect(pdfPages).toBeGreaterThan(0)
    expect(html).toContain('第一段中文文档')
  })

  it('rejects missing DOCX context before creating a record', async () => {
    await expect(
      createDocxAgentDocument({
        documentId: 'missing',
        title: 'bad',
        format: 'docx',
        content: 'text',
      }),
    ).rejects.toThrow('当前文档不是可编辑的 DOCX 文件')
  })

  it('rejects PDF content with missing glyphs before upload', async () => {
    const documentId = await sourceDocx()
    await expect(
      createDocxAgentDocument({
        documentId,
        title: '不完整 PDF',
        format: 'pdf',
        content: '正文 😀',
      }),
    ).rejects.toThrow('PDF 字体不支持字符：😀')
  })

  it('requires authentication on the creation endpoint', async () => {
    const response = await app.request('/api/conversations/docx-agent/create-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: 'missing', title: 'test', format: 'md', content: 'text' }),
    })
    expect(response.status).toBe(401)
    const cookie = await getAuthCookie()
    const documentId = await sourceDocx()
    const created = await app.request('/api/conversations/docx-agent/create-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ documentId, title: 'via route', format: 'md', content: '中文内容' }),
    })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ format: 'md', parseError: null })
  })
})
