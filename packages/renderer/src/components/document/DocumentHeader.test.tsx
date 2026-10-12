import type { DocumentDetail } from '@mimir/shared'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { MimirProvider } from '../../theme/MimirProvider'
import { UnsavedProvider, useUnsaved } from '../../lib/unsaved'
import { DocumentHeader } from './DocumentHeader'

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

async function renderHeader(doc: DocumentDetail, onBack = vi.fn<() => void>()) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const onRename = vi.fn<(title: string) => void>()
  const onAskAi = vi.fn<() => void>()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => {
    root.render(
      <MimirProvider>
        <UnsavedProvider>
          <DocumentHeader
            doc={doc}
            onBack={onBack}
            onRename={onRename}
            onAskAi={onAskAi}
            menu={[]}
          />
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
      expect(Boolean(view.host.querySelector('[aria-label="下载原件"]'))).toBe(doc.kind === 'file')
      expect(Boolean(view.host.querySelector('[aria-label^="修改笔记标题"]'))).toBe(
        doc.kind === 'note',
      )
      expect(view.host.textContent).not.toContain('2026')
      expect(view.host.textContent).not.toContain('DOCX')
      await view.unmount()
    }
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
})
