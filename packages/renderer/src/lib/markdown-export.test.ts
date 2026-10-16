import { afterEach, expect, it, vi } from 'vitest'
import { downloadMarkdownNote } from './markdown-export'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('downloads live Markdown and custom YAML in a safe filename without changing the document', async () => {
  vi.useFakeTimers()
  let blob: Blob | undefined
  const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
    blob = value as Blob
    return 'blob:markdown-export'
  })
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  let filename: string | undefined
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    filename = this.download
    expect(this.href).toBe('blob:markdown-export')
    expect(this.isConnected).toBe(true)
  })
  const body = '# 当前未保存的内容\n\n```mermaid\nflowchart LR\nA-->B\n```'
  downloadMarkdownNote('标题/非法字符.md', body, 'title: 标题\ncustom: retained\n')
  expect(create).toHaveBeenCalledOnce()
  expect(filename).toBe('标题_非法字符.md')
  expect(await blob!.text()).toBe(`---\ntitle: 标题\ncustom: retained\n---\n\n${body}`)
  expect(document.querySelector('a[download]')).toBeNull()
  expect(revoke).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1000)
  expect(revoke).toHaveBeenCalledWith('blob:markdown-export')
})
