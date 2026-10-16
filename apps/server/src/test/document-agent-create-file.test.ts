import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { expect, it } from 'vitest'
import { uploadFile } from '../services/upload.js'
import { getDocument } from '../services/documents.js'
import { readUpload } from '../lib/uploads.js'
import { openXlsxForEdit } from '../../../../packages/office/src/xlsx-edit.js'
import { exportXlsxDisplayedSheet } from '../../../../packages/office/src/xlsx-export.js'
import { app, getAuthCookie } from './helpers.js'
const fixture = new URL(
  '../../../../packages/office/vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
  import.meta.url,
)
it('persists current worksheet display exports through authenticated multipart upload without touching the source', async () => {
  const bytes = new Uint8Array(await readFile(fixture))
  const source = await uploadFile({ filename: '创建来源.xlsx', data: bytes })
  const session = await openXlsxForEdit(bytes)
  session.setCell({ sheet: 0, row: 1, col: 0 }, '未保存的导出显示值')
  const sheet = session.view().sheets[0]!
  const original = await getDocument(source.document.id)
  const cookie = await getAuthCookie()
  const xlsxChecks: Array<{ xml: string; sheetCount: number }> = []
  for (const format of ['xlsx', 'csv'] as const) {
    const exported = await exportXlsxDisplayedSheet(sheet, format)
    const form = new FormData()
    form.set('documentId', source.document.id)
    form.set('title', `显示值导出${format}`)
    form.set('format', format)
    form.set(
      'file',
      new File([new Uint8Array(exported.bytes)], exported.fileName, { type: exported.mimeType }),
    )
    const response = await app.request('/api/conversations/document-agent/create-file', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
    })
    expect(response.status).toBe(201)
    const created = (await response.json()) as { documentId: string; format: string }
    expect(created.format).toBe(format)
    const result = await getDocument(created.documentId)
    const saved = await readUpload(result!.sourceKey!)
    expect(saved).toEqual(Buffer.from(exported.bytes))
    if (format === 'xlsx') {
      const zip = await JSZip.loadAsync(saved)
      const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
      xlsxChecks.push({
        xml,
        sheetCount: (await openXlsxForEdit(new Uint8Array(saved))).view().sheets.length,
      })
    }
  }
  expect(xlsxChecks).toHaveLength(1)
  expect(xlsxChecks[0]!.xml).not.toMatch(/<f[\s>]/)
  expect(xlsxChecks[0]!.xml).toContain('inlineStr')
  expect(xlsxChecks[0]!.xml).toContain('未保存的导出显示值')
  expect(xlsxChecks[0]!.sheetCount).toBe(1)
  expect((await getDocument(source.document.id))?.body).toBe(original?.body)
  expect(await readUpload(original!.sourceKey!)).toEqual(Buffer.from(bytes))
})
function rejectedRequest() {
  const form = new FormData()
  form.set('documentId', 'missing')
  form.set('title', '导出')
  form.set('format', 'csv')
  form.set('file', new File(['a,b'], 'sheet.csv'))
  return form
}
it('rejects unauthenticated uploads and non-XLSX sources', async () => {
  expect(
    (
      await app.request('/api/conversations/document-agent/create-file', {
        method: 'POST',
        body: rejectedRequest(),
      })
    ).status,
  ).toBe(401)
  const rejected = await app.request('/api/conversations/document-agent/create-file', {
    method: 'POST',
    headers: { Cookie: await getAuthCookie() },
    body: rejectedRequest(),
  })
  expect(rejected.status).toBe(400)
})
