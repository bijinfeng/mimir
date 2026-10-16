import JSZip from 'jszip'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { readUpload } from '../lib/uploads.js'
import {
  createDocxAgentDocument,
  createDocumentAgentDocument,
} from '../services/docx-create-document.js'
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
        content:
          format === 'html'
            ? '<!doctype html><html lang="zh-CN"><head><title>标题</title></head><body><h1>标题</h1><p>第一段中文文档</p></body></html>'
            : '# 标题\n第一段中文文档',
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

it('preserves raw Markdown and full HTML, including tables, styles and metadata', async () => {
  const documentId = await sourceDocx()
  const markdown =
    '# 标题\n\n| A | B |\n| --- | --- |\n| **粗体** | [链接](https://example.com) |\n'
  const md = await createDocumentAgentDocument({
    documentId,
    title: '原样Markdown',
    format: 'md',
    content: markdown,
  })
  expect((await getDocument(md.documentId))?.body).toBe(markdown.trimEnd())
  const html =
    '<!doctype html><html lang="zh-CN"><head><title>完整页面</title><style>body {color: #123456}</style></head><body><table><tr><td><strong>数据</strong></td></tr></table></body></html>'
  const created = await createDocumentAgentDocument({
    documentId,
    title: '完整HTML',
    format: 'html',
    content: html,
  })
  const saved = await getDocument(created.documentId)
  expect(new TextDecoder().decode(await readUpload(saved!.sourceKey!))).toBe(html)
  expect((await getDocument(documentId))?.body).toContain('源文档')
})

it('supports the PDF source context through the common authenticated creation endpoint', async () => {
  const pdf = await PDFDocument.create()
  pdf.addPage()
  const source = await uploadFile({ filename: '来源.pdf', data: await pdf.save() })
  const response = await app.request('/api/conversations/document-agent/create-document', {
    method: 'POST',
    headers: { Cookie: await getAuthCookie(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentId: source.document.id,
      title: '提取结果',
      format: 'md',
      content: '# 新文档\n\nPDF摘要',
    }),
  })
  expect(response.status).toBe(201)
  const created = (await response.json()) as { documentId: string; format: string }
  expect(created.format).toBe('md')
  expect((await getDocument(created.documentId))?.body).toContain('PDF摘要')
})

it('stores rich DOCX/PDF output and indexes table contents without modifying the source', async () => {
  const documentId = await sourceDocx()
  const content =
    '<h1>创建报告</h1><p><strong>重要结论</strong> <a href="https://example.com">报告链接</a></p><table><tr><th>指标</th><th>数值</th></tr><tr><td><em>营业收入</em></td><td>120 万元</td></tr></table>'
  let richXml = '',
    pdfPageCount = 0
  for (const format of ['docx', 'pdf'] as const) {
    const created = await createDocumentAgentDocument({
      documentId,
      title: `富内容${format}`,
      format,
      content,
    })
    const saved = await getDocument(created.documentId)
    expect(saved?.body).toContain('营业收入')
    expect(saved?.body).toContain('120 万元')
    const bytes = await readUpload(saved!.sourceKey!)
    if (format === 'docx') {
      richXml = await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string')
    } else pdfPageCount = (await PDFDocument.load(bytes)).getPageCount()
  }
  expect(richXml).toContain('<w:tbl>')
  expect(richXml).toContain('<w:hyperlink')
  expect(pdfPageCount).toBe(1)
  expect((await getDocument(documentId))?.body).toContain('源文档')
})
