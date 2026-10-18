import type { DocumentDetail } from '@mimir/shared'
import type { MenuProps } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { MimirProvider } from '../../theme/MimirProvider'
import { UnsavedProvider, useUnsaved } from '../../lib/unsaved'
import { DocumentHeader } from './DocumentHeader'
import { DocumentTitle } from './DocumentTitle'
import { buildDocMenu } from './doc-menu'

const baseDoc: DocumentDetail = {
  id: 'doc-1',
  kind: 'note',
  status: 'ready',
  title: '产品说明',
  excerpt: '',
  tags: [],
  path: null,
  url: null,
  mime: null,
  fileExtension: null,
  size: null,
  folder: null,
  createdAt: '2026-10-12T00:00:00.000Z',
  updatedAt: '2026-10-12T00:00:00.000Z',
  body: '正文',
  sourceKey: null,
  parseError: null,
  links: { sources: [], backlinks: [] },
}

function escapeEvent() {
  const event = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })
  Object.defineProperty(event, 'which', { value: 27 })
  return event
}

function DirtyControl() {
  const { pending, setDirty } = useUnsaved()
  return (
    <>
      <button type="button" aria-label="标记未保存" onClick={() => setDirty(true)}>
        标记未保存
      </button>
      <span data-pending={pending ? 'yes' : 'no'} />
    </>
  )
}

async function renderHeader(
  doc: DocumentDetail,
  onBack = vi.fn<() => void>(),
  menu: MenuProps['items'] = [],
) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const onRename = vi.fn<(title: string) => Promise<unknown>>().mockResolvedValue(undefined)
  const onAskAi = vi.fn<() => void>()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => {
    root.render(
      <MimirProvider>
        <UnsavedProvider>
          <DocumentHeader
            doc={doc}
            onBack={onBack}
            noteSaveState="idle"
            onAskAi={onAskAi}
            menu={menu}
          />
          {doc.kind === 'note' ? (
            <DocumentTitle
              title={doc.title}
              updatedAt={doc.updatedAt}
              onRename={onRename}
              onRefresh={async () => {}}
            />
          ) : null}
          <DirtyControl />
        </UnsavedProvider>
      </MimirProvider>,
    )
  })
  return {
    host,
    onBack,
    onRename,
    onAskAi,
    unmount: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}

describe('共用文档头部', () => {
  it('笔记、文件和只读资料使用同一主布局，仅显示各自可用的操作', async () => {
    for (const doc of [
      baseDoc,
      { ...baseDoc, kind: 'file' as const, sourceKey: 'files/report.docx' },
      { ...baseDoc, kind: 'web' as const, url: 'https://example.com' },
    ]) {
      const view = await renderHeader(doc)
      expect(view.host.querySelectorAll('h1')).toHaveLength(1)
      expect(view.host.querySelector('[aria-label="返回知识库"]')).not.toBeNull()
      expect(view.host.querySelector('[aria-label="询问这篇文档"]')).not.toBeNull()
      expect(view.host.querySelector('[aria-label="更多操作"]')).not.toBeNull()
      expect(Boolean(view.host.querySelector('[aria-label="下载已保存原件"]'))).toBe(
        doc.kind === 'file',
      )
      expect(Boolean(view.host.querySelector('[aria-label^="修改笔记标题"]'))).toBe(
        doc.kind === 'note',
      )
      expect(view.host.textContent).not.toContain('DOCX')
      await view.unmount()
    }
  })

  it('笔记路径不重复主标题，画布标题显示真实更新时间和保存反馈', async () => {
    const view = await renderHeader(baseDoc)
    expect(
      view.host.querySelector('[aria-label="文档路径"]')?.parentElement?.querySelector('h1'),
    ).toBeNull()
    expect(view.host.querySelector('time')?.getAttribute('datetime')).toBe(baseDoc.updatedAt)
    expect(view.host.querySelector('[role="status"]')?.textContent).toBe('已保存')
    await view.unmount()
  })

  it('返回仍经过未保存守卫，问 AI 与笔记改名入口仍可用', async () => {
    const view = await renderHeader(baseDoc)
    const click = async (selector: string) => {
      await act(async () => {
        view.host.querySelector<HTMLButtonElement>(selector)?.click()
      })
    }
    await click('[aria-label="询问这篇文档"]')
    expect(view.onAskAi).toHaveBeenCalledOnce()
    await click('[aria-label^="修改笔记标题"]')
    expect(view.host.querySelector('[aria-label="笔记标题"]')).not.toBeNull()
    await click('[aria-label="标记未保存"]')
    await click('[aria-label="返回知识库"]')
    expect(view.onBack).not.toHaveBeenCalled()
    expect(view.host.querySelector('[data-pending="yes"]')).not.toBeNull()
    await view.unmount()
  })

  it('标题 Enter 只提交一次，Escape 取消并把焦点返回改名按钮', async () => {
    const view = await renderHeader(baseDoc)
    const edit = async (text: string, key: string) => {
      await act(async () =>
        view.host.querySelector<HTMLButtonElement>('[aria-label^="修改笔记标题"]')!.click(),
      )
      const input = view.host.querySelector<HTMLInputElement>('[aria-label="笔记标题"]')!
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await act(async () =>
        input.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true })),
      )
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      expect(view.host.querySelector('[aria-label="笔记标题"]')).toBeNull()
      expect(document.activeElement).toBe(view.host.querySelector('[aria-label^="修改笔记标题"]'))
    }
    await edit(' 新标题 ', 'Enter')
    expect(view.onRename).toHaveBeenCalledExactlyOnceWith('新标题')
    await edit('放弃的标题', 'Escape')
    expect(view.onRename).toHaveBeenCalledTimes(1)
    expect(view.host.querySelector('h1')?.textContent).toBe(baseDoc.title)
    await view.unmount()
  })

  it('更多操作显示当前目录和 AI 用量，菜单动作仍可执行', async () => {
    const doc = { ...baseDoc, folder: '开始使用/产品文档', tags: ['已读'] }
    const onSetTags = vi.fn<(tags: string[]) => void>()
    const onSetFolder = vi.fn<(folder: string) => void>()
    const onSummary = vi.fn<() => void>()
    const longFolder = '开始使用/产品文档/一个名称很长的项目/第二级目录/第三级目录'
    const menu = buildDocMenu({
      doc,
      folders: [doc.folder, longFolder],
      onSetTags,
      onSetFolder,
      onSummary,
    })
    const view = await renderHeader(doc, undefined, menu)

    await act(async () => {
      view.host.querySelector<HTMLButtonElement>('[aria-label="更多操作"]')?.click()
    })

    const popup = document.body.querySelector('[role="menu"]')
    expect(popup?.querySelector('[data-doc-menu-row="folder"]')?.getAttribute('title')).toBe(
      '开始使用/产品文档',
    )
    expect(popup?.querySelector('[data-doc-menu-group]')?.textContent).toContain('产生用量')

    const folderItem = popup?.querySelector<HTMLElement>('[data-doc-menu-row="folder"]')
    await act(async () => {
      folderItem?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 200))
    })
    const subMenu = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menu"]')).find(
      (element) => element !== popup && element.textContent?.includes(longFolder),
    )
    const scopeClass = Array.from(popup?.parentElement?.classList ?? []).find((name) =>
      name.startsWith('acss-'),
    )
    expect(scopeClass).toBeDefined()
    expect(subMenu?.parentElement?.classList.contains(scopeClass ?? '')).toBe(true)
    expect(subMenu?.querySelector(`[title="${longFolder}"]`)).not.toBeNull()

    await act(async () => {
      Array.from(popup?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
        .find((item) => item.textContent?.includes('AI 摘要'))
        ?.click()
    })
    expect(onSummary).toHaveBeenCalledOnce()
    expect(onSetTags).not.toHaveBeenCalled()
    expect(onSetFolder).not.toHaveBeenCalled()
    await view.unmount()
  })
})

it('更多菜单的 Escape 关闭并回到触发按钮，选择动作也回焦', async () => {
  const action = vi.fn<() => void>()
  const view = await renderHeader(baseDoc, undefined, [
    { key: 'test', label: '测试操作', onClick: action },
  ])
  const trigger = view.host.querySelector<HTMLButtonElement>('[aria-label="更多操作"]')!
  await act(async () =>
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
  )
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!
  await act(async () =>
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(trigger)
  await act(async () => trigger.click())
  await act(async () => document.querySelector<HTMLElement>('[role="menuitem"]')!.click())
  expect(action).toHaveBeenCalledOnce()
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(trigger)
  await view.unmount()
})

it('Escape closes only the current submenu before the root menu and restores its trigger', async () => {
  const view = await renderHeader(baseDoc, undefined, [
    { key: 'tags', label: '标签', children: [{ key: 'add', label: '＋ 写作' }] },
  ])
  try {
    const trigger = view.host.querySelector<HTMLButtonElement>('[aria-label="更多操作"]')!
    await act(async () => trigger.click())
    const parent = document.querySelector<HTMLElement>('[role="menuitem"][aria-haspopup]')!
    await act(async () => {
      parent.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 200))
    })
    const child = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (node) => node.textContent === '＋ 写作',
    )!
    expect(child).toBeDefined()
    await act(async () => child.focus())
    await act(async () => child.dispatchEvent(escapeEvent()))
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await act(async () => vi.waitFor(() => expect(document.activeElement).toBe(parent)))
    await act(async () => parent.dispatchEvent(escapeEvent()))
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  } finally {
    await view.unmount()
  }
})
