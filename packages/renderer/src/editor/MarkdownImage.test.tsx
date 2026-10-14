/**
 * @vitest-environment happy-dom
 *
 * 「插入图片」这条路的宿主一侧：**选文件 → 上传 → 地址写进正文**。
 *
 * ## 为什么单独一个文件
 *
 * `MarkdownEditor.test.tsx` 挂的是 `MarkdownToolbar`（只需要编辑器实例），
 * 而插图这条路的入口是 `MarkdownEditor` 的 `onUploadImage` —— 上传通道由
 * 宿主注入，所以只有挂整个 `MarkdownEditor` 才走得到。
 *
 * ## 顺序是硬的
 *
 * **先上传、再写地址**：正文里的地址必须指向一份已经存在的文档，否则存下去
 * 的是一张 404 的图，而只有刷新页面之后才看得出来。失败时**什么都不插**并把
 * 原因写进状态行——留一个半插入的图片比不插更糟。
 */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownEditor } from '@mimir/office'
import { createExtensions } from './extensions.js'

const mounted: { unmount: () => void }[] = []

afterEach(() => {
  for (const item of mounted) item.unmount()
  mounted.length = 0
})

async function mount(
  onUploadImage: (file: File) => Promise<{ url: string; name: string }>,
): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => {
    root.render(
      <MarkdownEditor
        documentId="doc-1"
        extensions={createExtensions()}
        initialContent="正文\n"
        onSave={async () => {}}
        onUploadImage={onUploadImage}
      />,
    )
  })
  mounted.push({
    unmount: () => {
      act(() => root.unmount())
      host.remove()
    },
  })
  return host
}

/** 选一个文件喂给隐藏的 input，并把上传那条 promise 链推完 */
async function pickFile(host: HTMLElement, name: string): Promise<HTMLInputElement> {
  const insertTab = [...host.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].find(
    (button) => button.textContent === '插入',
  )
  expect(insertTab).toBeDefined()
  act(() => insertTab!.click())
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!
  Object.defineProperty(input, 'files', {
    value: [new File(['x'], name, { type: 'image/png' })],
    configurable: true,
  })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((tick) => setTimeout(tick, 0))
  })
  return input
}

describe('MarkdownEditor 的插图', () => {
  it('上传成功后把返回的地址写进正文，alt 用文件名', async () => {
    const picked: string[] = []
    const host = await mount(async (file) => {
      picked.push(file.name)
      return { url: '/api/documents/img-1/file', name: file.name }
    })
    const input = await pickFile(host, '图表.png')

    expect(picked).toEqual(['图表.png'])
    // 读 DOM 里的 img：那是「真的插进去了」最直接的证据
    const image = host.querySelector<HTMLImageElement>('.mimir-markdown-body img')
    expect(image?.getAttribute('src')).toBe('/api/documents/img-1/file')
    expect(image?.getAttribute('alt')).toBe('图表.png')
    // 选完清空 input.value：不清的话再选同一个文件不触发 change（点了没反应）
    expect(input.value).toBe('')
  })

  it('上传失败：一个字都不插，状态行给出原因', async () => {
    const host = await mount(async () => {
      throw new Error('文件太大')
    })
    await pickFile(host, '大图.png')

    expect(host.querySelector('.mimir-markdown-body img')).toBeNull()
    const status = host.querySelector('.mimir-editor__status')?.textContent ?? ''
    expect(status).toContain('插图失败')
    expect(status).toContain('文件太大')
    expect(status).toContain('图片没有插入')
  })
})
