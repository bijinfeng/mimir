import type { DocumentDetail } from '@mimir/shared'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { MimirProvider } from '../../theme/MimirProvider'
import { FilePreview } from './FilePreview'

vi.mock('./OfficeSourceEditor', () => ({ OfficeSourceEditor: () => <div data-office-editor /> }))
vi.mock('./MarkdownBody', () => ({ MarkdownBody: () => <div data-markdown-body /> }))
const doc = {
  id: 'file-preview',
  kind: 'file',
  title: '资料.txt',
  body: '',
  sourceKey: null,
  mime: 'text/plain',
  size: 24,
  parseError: null,
  excerpt: '',
} as unknown as DocumentDetail

async function mount(value: DocumentDetail) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const render = async (next: DocumentDetail) =>
    act(async () =>
      root.render(
        <MimirProvider>
          <FilePreview doc={next} />
        </MimirProvider>,
      ),
    )
  await render(value)
  return {
    host,
    render,
    cleanup: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}

it('无原件不提供下载；原样文本不当作 Markdown，保留换行及井号', async () => {
  const view = await mount(doc)
  try {
    expect(view.host.querySelector('a')).toBeNull()
    expect(view.host.textContent).toContain('当前记录没有原件，无法提供下载')
    const body = '# 标题不是标题\na,b\n1,2\n{"source":"original"}'
    await view.render({ ...doc, body })
    expect(view.host.querySelector('pre')?.textContent).toBe(body)
    expect(view.host.querySelector('[data-markdown-body]')).toBeNull()
  } finally {
    await view.cleanup()
  }
})

it('图片原始大小入口、失败下载与下一篇恢复分离；媒体有可达名称', async () => {
  const image = { ...doc, mime: 'image/png', title: '截图.png', sourceKey: 'saved.png' }
  const view = await mount(image)
  try {
    expect(view.host.querySelector('img')?.alt).toBe('截图.png')
    expect(view.host.querySelector('a')?.target).toBe('_blank')
    await act(async () => view.host.querySelector('img')!.dispatchEvent(new Event('error')))
    expect(view.host.querySelector('img')).toBeNull()
    expect(view.host.querySelector('a')?.textContent).toContain('下载已保存原件')
    await view.render({ ...image, id: 'another-image' })
    expect(view.host.querySelector('img')).not.toBeNull()
    await view.render({ ...image, id: 'audio', title: '录音.mp3', mime: 'audio/mpeg' })
    expect(view.host.querySelector('audio')?.getAttribute('aria-label')).toBe('录音.mp3')
    expect(view.host.querySelector('audio')?.hasAttribute('controls')).toBe(true)
    await view.render({ ...image, id: 'video', title: '演示.mp4', mime: 'video/mp4' })
    expect(view.host.querySelector('video')?.getAttribute('aria-label')).toBe('演示.mp4')
  } finally {
    await view.cleanup()
  }
})

it('五种 Office 原件继续交给既有编辑器，原件无查看器时提供下载', async () => {
  const view = await mount(doc)
  try {
    for (const mime of [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/html',
      'application/pdf',
    ]) {
      await view.render({ ...doc, mime, sourceKey: 'saved', body: '提取正文' })
      expect(view.host.querySelector('[data-office-editor]')).not.toBeNull()
      expect(
        view.host.querySelector('[data-preview-mode]')?.getAttribute('data-preview-mode'),
      ).toBe('editor')
    }
    await view.render({ ...doc, mime: 'application/zip', sourceKey: 'saved.zip' })
    expect(view.host.textContent).toContain('没有在线预览')
    expect(view.host.querySelector('a')?.textContent).toContain('下载已保存原件')
  } finally {
    await view.cleanup()
  }
})
