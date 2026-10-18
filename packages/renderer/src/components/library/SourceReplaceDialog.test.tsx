import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { DocumentSummary, FileUploadResponse } from '@mimir/shared'
import { MimirProvider } from '../../theme/MimirProvider'
import { api } from '../../lib/api'
import { SourceReplaceDialog } from './SourceReplaceDialog'
let root: ReturnType<typeof createRoot> | undefined
let host: HTMLDivElement
const doc = { id: 'existing-file', title: '研究报告', kind: 'file' } as DocumentSummary
const file = new File(['正文'], '新版报告.pdf')
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (node) => node.textContent?.replace(/\s/g, '') === text,
  )!
async function mount(start = true) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  const saved = vi.fn<() => void>()
  const closed = vi.fn<() => void>()
  await act(async () => {
    root!.render(
      <MimirProvider>
        <SourceReplaceDialog doc={doc} onSaved={saved} onClosed={closed} />
      </MimirProvider>,
    )
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
  expect(api.documents.replaceSource).not.toHaveBeenCalled()
  expect(button('替换原件').disabled).toBe(true)
  const picker = document.querySelector<HTMLInputElement>('[aria-label="选择替换文件"]')!
  await act(async () => {
    Object.defineProperty(picker, 'files', { configurable: true, value: [file] })
    picker.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(api.documents.replaceSource).not.toHaveBeenCalled()
  if (start) await act(async () => button('替换原件').click())
  return { saved, closed }
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = undefined
  host?.remove()
  vi.restoreAllMocks()
})
it('替换同一目标请求失败后保留原File；同帧重试单飞，等待时不能关闭', async () => {
  let finish!: (result: FileUploadResponse) => void
  const replace = vi
    .spyOn(api.documents, 'replaceSource')
    .mockRejectedValueOnce(new Error('连接中断'))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
  const { saved, closed } = await mount()
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('连接中断')
  const retry = button('重试')
  await act(async () => {
    retry.click()
    retry.click()
  })
  expect(replace).toHaveBeenCalledTimes(2)
  expect(replace).toHaveBeenLastCalledWith(doc.id, file)
  expect(button('取消').disabled).toBe(true)
  expect(document.querySelector('.ant-modal-close')).toBeNull()
  expect(closed).not.toHaveBeenCalled()
  await act(async () => finish({ document: doc, charCount: 0, parseError: null }))
  expect(saved).toHaveBeenCalledOnce()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    '原件已保存，未提取到可搜索正文',
  )
})
it('原件保存后解析失败仍报告保存成功，显示实际原因而不重新上传', async () => {
  const replace = vi
    .spyOn(api.documents, 'replaceSource')
    .mockResolvedValue({ document: doc, charCount: 0, parseError: '加密PDF无法提取' })
  const { saved } = await mount()
  expect(saved).toHaveBeenCalledOnce()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    '原件已保存，正文提取失败',
  )
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('加密PDF无法提取')
  expect(button('完成')).toBeDefined()
  expect(replace).toHaveBeenCalledOnce()
})

it('选择替换文件后仍待用户确认，原生取消或重选相同文件不会自动发请求', async () => {
  const replace = vi
    .spyOn(api.documents, 'replaceSource')
    .mockResolvedValue({ document: doc, charCount: 10, parseError: null })
  await mount(false)
  const picker = document.querySelector<HTMLInputElement>('[aria-label="选择替换文件"]')!
  await act(async () => {
    Object.defineProperty(picker, 'files', { configurable: true, value: [] })
    picker.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(file.name)
  expect(replace).not.toHaveBeenCalled()
  await act(async () => {
    Object.defineProperty(picker, 'files', { configurable: true, value: [file] })
    picker.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(replace).not.toHaveBeenCalled()
  await act(async () => button('替换原件').click())
  expect(replace).toHaveBeenCalledExactlyOnceWith(doc.id, file)
})
