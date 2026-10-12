import type { DocumentSummary } from '@mimir/shared'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { chipOf, displayDocumentTitle, docIcon } from './LibraryView'

const baseFile: DocumentSummary = {
  id: 'file-1',
  kind: 'file',
  status: 'ready',
  title: '报告',
  excerpt: '',
  tags: [],
  path: null,
  url: null,
  mime: 'application/octet-stream',
  fileExtension: 'pdf',
  size: 128,
  folder: null,
  createdAt: '2026-10-12T00:00:00.000Z',
  updatedAt: '2026-10-12T00:00:00.000Z',
}

describe('知识库文件名和类型图标', () => {
  it('补当前原件后缀，不重复追加已在改名标题里的后缀', () => {
    expect(displayDocumentTitle(baseFile)).toBe('报告.pdf')
    expect(displayDocumentTitle({ ...baseFile, title: '报告.PDF' })).toBe('报告.PDF')
    expect(displayDocumentTitle({ ...baseFile, title: '报告.v2' })).toBe('报告.v2.pdf')
    expect(displayDocumentTitle({ ...baseFile, title: '报告', fileExtension: null })).toBe('报告')
    expect(displayDocumentTitle({ ...baseFile, kind: 'note', title: '报告' })).toBe('报告')
  })

  it('不同格式使用各自的图形和语义色，未知格式回退普通文件', () => {
    for (const [extension, icon, tone] of [
      ['pdf', 'pdf', 'pdf'],
      ['docx', 'document', 'document'],
      ['xlsx', 'table', 'table'],
      ['pptx', 'slides', 'slides'],
      ['html', 'code', 'code'],
      ['txt', 'text', 'neutral'],
      ['png', 'image', 'media'],
      ['mp3', 'audio', 'media'],
      ['mp4', 'video', 'media'],
      ['zip', 'archive', 'neutral'],
    ] as const) {
      const markup = renderToStaticMarkup(docIcon({ ...baseFile, fileExtension: extension }))
      expect(markup).toContain(`data-file-icon="${icon}"`)
      expect(markup).toContain(`data-file-tone="${tone}"`)
      expect(markup).toContain('mask-image:')
    }
    expect(renderToStaticMarkup(docIcon({ ...baseFile, kind: 'note' }))).toContain(
      'data-file-icon="note"',
    )
    expect(renderToStaticMarkup(docIcon({ ...baseFile, fileExtension: 'unknown' }))).toContain(
      'data-file-icon="unknown"',
    )
  })

  it('文件卡片不重复显示格式徽标，笔记和网页保留来源徽标', () => {
    expect(chipOf(baseFile)).toBeNull()
    expect(chipOf({ ...baseFile, kind: 'note' })).toBe('笔记')
    expect(chipOf({ ...baseFile, kind: 'web' })).toBe('网页')
  })
})
