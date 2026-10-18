import type { DocumentSummary } from '@mimir/shared'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MimirProvider } from '../../theme/MimirProvider'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fileFormatOf } from './FileFormatIcon'
import { chipOf, displayDocumentTitle, DocCard, DocRow } from './LibraryView'

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
    for (const [extension, format] of [
      ['pdf', 'pdf'],
      ['docx', 'word'],
      ['xlsx', 'excel'],
      ['pptx', 'powerpoint'],
      ['html', 'html'],
      ['txt', 'text'],
      ['png', 'image'],
      ['mp3', 'audio'],
      ['mp4', 'video'],
      ['zip', 'archive'],
    ] as const) {
      expect(fileFormatOf({ ...baseFile, fileExtension: extension })).toBe(format)
    }
    expect(fileFormatOf({ ...baseFile, kind: 'note' })).toBe('note')
    expect(fileFormatOf({ ...baseFile, fileExtension: 'unknown' })).toBe('unknown')
  })

  it('文件卡片不重复显示格式徽标，笔记和网页保留来源徽标', () => {
    expect(chipOf(baseFile)).toBeNull()
    expect(chipOf({ ...baseFile, kind: 'note' })).toBe('笔记')
    expect(chipOf({ ...baseFile, kind: 'web' })).toBe('网页')
  })
})

let cardRoot: ReturnType<typeof createRoot> | undefined
let cardHost: HTMLDivElement | undefined

afterEach(async () => {
  if (cardRoot) await act(async () => cardRoot!.unmount())
  cardRoot = undefined
  cardHost?.remove()
  cardHost = undefined
})

async function mountCard(asRow = false) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  cardHost = document.createElement('div')
  document.body.append(cardHost)
  cardRoot = createRoot(cardHost)
  const open = vi.fn<() => void>()
  const replace = vi.fn<() => void>()
  const remove = vi.fn<() => void>()
  const Component = asRow ? DocRow : DocCard
  await act(async () =>
    cardRoot!.render(
      <MimirProvider>
        <Component
          hasStatus={false}
          doc={baseFile}
          location="当前目录"
          onOpen={open}
          onEdit={open}
          onReplace={replace}
          onDelete={remove}
        />
      </MimirProvider>,
    ),
  )
  return { host: cardHost, open, replace, remove }
}

async function press(node: HTMLElement) {
  await act(async () => {
    node.click()
    await new Promise((resolve) => setTimeout(resolve, 40))
  })
}

describe('知识库卡片操作', () => {
  it('单击卡片空白与摘要都打开一次，标题保留原生按钮键盘入口', async () => {
    const { host, open } = await mountCard()
    const card = host.querySelector<HTMLElement>('.kb-card')!
    await press(card)
    expect(open).toHaveBeenCalledTimes(1)
    await press(
      [...card.querySelectorAll('span')].find((node) => node.textContent === '当前目录 · 128 B')!,
    )
    expect(open).toHaveBeenCalledTimes(2)
    const title = [...card.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.textContent === '报告.pdf',
    )!
    expect(title.type).toBe('button')
    expect(title.tabIndex).toBe(0)
    title.focus()
    expect(document.activeElement).toBe(title)
    await press(title)
    expect(open).toHaveBeenCalledTimes(3)
  })

  it('更多菜单及下载不打开卡片，Escape回到更多按钮', async () => {
    const { host, open } = await mountCard()
    const more = host.querySelector<HTMLButtonElement>('[aria-label="报告 的更多操作"]')!
    await press(more)
    expect(open).not.toHaveBeenCalled()
    const download = [...document.querySelectorAll<HTMLAnchorElement>('[role="menuitem"] a')].find(
      (node) => node.textContent === '下载原件',
    )!
    expect(download.getAttribute('href')).toContain('/api/documents/file-1/file?download=1')
    download.addEventListener('click', (event) => event.preventDefault())
    await press(download)
    expect(open).not.toHaveBeenCalled()
    await press(more)
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }),
      ),
    )
    expect(document.activeElement).toBe(more)
    expect(open).not.toHaveBeenCalled()
  })
})

it('列表更多菜单复用卡片能力，点击替换不会冒泡打开，标题仍可键盘打开', async () => {
  const { host, open, replace } = await mountCard(true)
  await press(host.querySelector<HTMLButtonElement>('[aria-label="报告 的更多操作"]')!)
  const action = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (node) => node.textContent === '替换原件',
  )!
  await press(action)
  expect(replace).toHaveBeenCalledOnce()
  expect(open).not.toHaveBeenCalled()
  const title = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent === '报告.pdf',
  )!
  expect(title.type).toBe('button')
  await press(title)
  expect(open).toHaveBeenCalledOnce()
})
