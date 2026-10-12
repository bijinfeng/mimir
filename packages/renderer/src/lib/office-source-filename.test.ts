import { afterEach, expect, it, vi } from 'vitest'
import { createOfficeSourceIo, officeSourceFilename } from './office-source-filename'

afterEach(() => vi.unstubAllGlobals())

it('preserves the original DOCX filename through load and save', async () => {
  const header =
    'attachment; filename="01-simple-english.docx"; filename*=UTF-8\'\'01-simple-english.docx'
  const replaceSource = vi.fn<(id: string, file: File) => Promise<unknown>>(async () => ({}))
  const fetchSource = vi.fn<typeof fetch>(function (this: unknown) {
    if (this !== globalThis) throw new TypeError('Illegal invocation')
    return Promise.resolve(
      new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Disposition': header } }),
    )
  })
  vi.stubGlobal('fetch', fetchSource)
  const io = createOfficeSourceIo('doc-1', 'uploads/doc-1/01-simple-english.docx', {
    sourceUrl: (id) => `/api/documents/${id}/file`,
    replaceSource,
  })

  await io.load()
  await io.save(new Uint8Array([4, 5, 6]), {
    name: 'document.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })

  expect(fetchSource).toHaveBeenCalledWith('/api/documents/doc-1/file', { credentials: 'include' })
  const file = replaceSource.mock.calls[0]?.[1]
  if (!file) throw new Error('保存请求没有上传文件')
  expect(replaceSource.mock.calls[0]?.[0]).toBe('doc-1')
  expect(file.name).toBe('01-simple-english.docx')
  expect(file.size).toBe(3)
})

it('decodes a Unicode response filename and falls back to the source key', () => {
  expect(
    officeSourceFilename(
      'attachment; filename="____.docx"; filename*=UTF-8\'\'%E5%AD%A3%E5%BA%A6%E6%8A%A5%E5%91%8A.docx',
      'uploads/doc-1/fallback.docx',
    ),
  ).toBe('季度报告.docx')
  expect(officeSourceFilename(null, 'uploads/doc-1/versions/abc/original.docx')).toBe(
    'original.docx',
  )
})
