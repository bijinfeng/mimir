// @vitest-environment happy-dom

import { ConfigProvider } from 'antd'
import { openSelect } from '../shell/antd-test-dom.js'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfAgentHandle } from '../agent/pdf-agent.js'
import type { EditorIo } from './types.js'
import { layoutPdfTextInsert } from '../../../../apps/server/src/services/pdf-insert-layout.js'
import type { PdfHostApply } from './PdfEditor.js'

const { pdfTextMode } = vi.hoisted(() => ({
  pdfTextMode: {
    real: false,
    lifecycle: false,
    afterLoad: null as
      | ((
          doc: import('pdfjs-dist/legacy/build/pdf.mjs').PDFDocumentProxy,
        ) => Promise<import('pdfjs-dist/legacy/build/pdf.mjs').PDFDocumentProxy>)
      | null,
    rendered: [] as Uint8Array[],
  },
}))

vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&url', async () => ({
  default: (await import('node:module'))
    .createRequire(import.meta.url)
    .resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
}))

vi.mock('./pdf-render.js', async () => {
  const renderer = await vi.importActual<typeof import('./pdf-render.js')>('./pdf-render.js')
  return {
    awaitPdfTask: renderer.awaitPdfTask,
    retainPdfDocument: (bytes: Uint8Array) =>
      pdfTextMode.lifecycle ? renderer.retainPdfDocument(bytes) : () => {},
    cancelPdfRender: () => {},
    retainPdfDocuments: (bytes: readonly (Uint8Array | null)[]) => {
      if (pdfTextMode.lifecycle) renderer.retainPdfDocuments(bytes)
    },
    renderPdfPages: async (options: { bytes: Uint8Array }) => {
      pdfTextMode.rendered.push(options.bytes)
      return { dispose: () => {} }
    },
    loadPdfDocument: async (bytes: Uint8Array) => {
      if (pdfTextMode.lifecycle) {
        const doc = await renderer.loadPdfDocument(bytes)
        const afterLoad = pdfTextMode.afterLoad
        pdfTextMode.afterLoad = null
        return afterLoad ? afterLoad(doc) : doc
      }
      return pdfTextMode.real
        ? (await import('pdfjs-dist/legacy/build/pdf.mjs')).getDocument({ data: bytes.slice() })
            .promise
        : {
            getPage: async () => ({
              getViewport: ({ scale }: { scale: number }) => ({
                width: 300 * scale,
                height: 400 * scale,
                convertToPdfPoint: (x: number, y: number) => [x / scale, 400 - y / scale],
                convertToViewportPoint: (x: number, y: number) => [x * scale, (400 - y) * scale],
              }),
            }),
          }
    },
  }
})

import { PdfEditor } from './PdfEditor.js'

const mounted: Array<() => void> = []
afterEach(() => {
  for (const unmount of mounted) unmount()
  pdfTextMode.lifecycle = false
  pdfTextMode.real = false
  pdfTextMode.afterLoad = null
  pdfTextMode.rendered.length = 0
  mounted.length = 0
})

async function settle(done: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000
  while (!done() && Date.now() < deadline)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  expect(done()).toBe(true)
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  if (label === '页面与版式操作') {
    const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '页面',
    )
    if (tab && tab.getAttribute('aria-selected') !== 'true') {
      act(() => tab.click())
    }
  }
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.getAttribute('aria-label') === label,
  )
  if (!found) throw new Error(`没有按钮：${label}`)
  return found
}

async function click(element: Element, options: MouseEventInit = {}): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, ...options }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const withTextLayout =
  (apply: PdfHostApply): PdfHostApply =>
  async (input) =>
    input.kind === 'layout'
      ? {
          bytes: input.bytes,
          version: input.expectedVersion,
          layouts: await Promise.all(
            input.items.map((item) =>
              layoutPdfTextInsert(input.bytes, item as Parameters<typeof layoutPdfTextInsert>[1]),
            ),
          ),
        }
      : apply(input)

describe('PDF manual content canvas', () => {
  it('shares real note threads between toolbar and Agent, saves twice and deletes from actual controls', async () => {
    pdfTextMode.real = true
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    pdf.addPage([300, 400]).drawText('ORIGINAL', { x: 40, y: 300, size: 12, font })
    const original = await pdf.save()
    const saved: Uint8Array[] = []
    let handle: PdfAgentHandle | null = null
    const host = document.createElement('div')
    host.style.width = '691px'
    document.body.append(host)
    const root = createRoot(host)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    await act(async () =>
      root.render(
        <ConfigProvider componentSize="small">
          <PdfEditor
            documentId="pdf-notes"
            io={{
              load: async () => original,
              save: async (bytes) => {
                saved.push(bytes)
              },
            }}
            onAgentHandleChange={(next) => {
              handle = next
            }}
            hostInspect={async ({ bytes, probe }) =>
              (
                await import('../../../../apps/server/src/services/pdf-agent-host.js')
              ).inspectPdfTextTarget(bytes, probe)
            }
            hostMarkup={async ({ bytes, markup, expectedVersion }) => ({
              bytes: await (
                await import('../../../../apps/server/src/services/pdf-agent-host.js')
              ).applyPdfVerifiedMarkup(bytes, markup),
              version: expectedVersion + 1,
            })}
            hostApply={async () => {
              throw new Error('not used')
            }}
            hostAnnotations={async ({ bytes, operation, sha256, expectedVersion }) => {
              const service =
                await import('../../../../apps/server/src/services/pdf-annotations.js')
              const result = await service.applyPdfAnnotationOperation(
                bytes,
                operation,
                sha256,
                (operation.op === 'add_note' || operation.op === 'reply_note') &&
                  operation.authorship === 'user'
                  ? 'admin'
                  : 'AI Assistant',
              )
              return {
                bytes: operation.op === 'read' ? undefined : result.bytes,
                annotations: result.annotations,
                version: expectedVersion + (operation.op === 'read' ? 0 : 1),
              }
            }}
          />
        </ConfigProvider>,
      ),
    )
    mounted.push(() => {
      act(() => root.unmount())
      host.remove()
    })
    await settle(() => handle !== null)
    await click(
      [...host.querySelectorAll('[role="tab"]')].find((item) => item.textContent === '编辑')!,
    )
    await click(button(host, '便笺与标注'))
    await settle(() => !button(host, '刷新批注').disabled)
    const panel = host.querySelector('[aria-label="PDF 批注面板"]')!
    expect(panel.closest('[aria-label="PDF 属性工具"]')).not.toBeNull()
    expect(panel.closest('.mimir-editor__subbar')).toBeNull()
    expect(panel.querySelector('textarea')?.getAttribute('rows')).toBe('2')
    expect(button(host, '关闭批注面板').closest('.mimir-pdf-inspector__header')).not.toBeNull()
    expect(button(host, '添加便笺').closest('.mimir-pdf-annotations__actions')).not.toBeNull()
    expect(button(host, '添加便笺').classList.contains('ant-btn-variant-solid')).toBe(true)
    expect(host.querySelector('[aria-label="回复便笺"]')).toBeNull()
    expect(host.querySelector('[aria-label="修改批注内容"]')).toBeNull()
    expect(host.querySelector('[aria-label="删除所选批注"]')).toBeNull()
    const confirmDelete = async () => {
      await click(button(host, '删除所选批注'))
      const confirm = [
        ...document.querySelectorAll<HTMLButtonElement>('.ant-popconfirm button'),
      ].find((entry) => entry.textContent === '删除批注')
      expect(confirm).toBeDefined()
      await click(confirm!)
    }
    const inputNote = async (value: string) => {
      await act(async () => {
        const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="批注内容"]')!
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
          input,
          value,
        )
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    const initialHandle = handle
    await inputNote('手动便笺')
    await click(button(host, '添加便笺'))
    await settle(() => host.textContent?.includes('admin：手动便笺') ?? false)
    expect(panel.querySelector('[aria-label="本页批注与回复"]')?.textContent).toContain(
      'admin：手动便笺',
    )
    expect(handle).toBe(initialHandle)
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('编辑')
    let result: Awaited<ReturnType<PdfAgentHandle['execute']>> | undefined
    await act(async () => {
      result = await handle!.execute('read_annotations', {})
    })
    const rootId = (result!.data as { annotations: Array<{ id: string }> }).annotations[0]!.id
    expect(result!.changed).toBe(false)
    const options = openSelect(host, '选择批注')
    await click(options.find((option) => option.textContent === '便笺：手动便笺')!)
    await inputNote('手动回复')
    await click(button(host, '回复便笺'))
    await settle(() => host.textContent?.includes('admin：手动回复') ?? false)
    await click(button(host, '保存到库'))
    await settle(() => saved.length === 1 && button(host, '保存到库').disabled)
    const versionAfterSave = handle!.getVersion()
    await act(async () => {
      result = await handle!.execute(
        'edit_note',
        { page: 1, note_id: rootId, text: 'Agent 修改便笺' },
        { expectedVersion: handle!.getVersion(), roundId: 'note-round' },
      )
    })
    expect(result!.ok).toBe(true)
    expect(handle).toBe(initialHandle)
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('编辑')
    expect(button(host, '保存到库').disabled).toBe(false)
    expect(handle!.getVersion()).toBe(versionAfterSave + 1)
    await act(async () => {
      expect(handle!.undoRound('note-round')).toBe(true)
    })
    expect(handle).toBe(initialHandle)
    expect(button(host, '保存到库').disabled).toBe(true)
    await act(async () => {
      result = await handle!.execute(
        'edit_note',
        { page: 1, note_id: rootId, text: 'Agent 修改便笺' },
        { expectedVersion: handle!.getVersion(), roundId: 'note-round' },
      )
    })
    expect(result!.ok).toBe(true)

    await click(button(host, '刷新批注'))
    await settle(() => host.textContent?.includes('admin：Agent 修改便笺') ?? false)
    const nextOptions = openSelect(host, '选择批注')
    await click(nextOptions.find((option) => option.textContent === '便笺：Agent 修改便笺')!)
    await inputNote('手动再次修改')
    await click(button(host, '修改批注内容'))
    await settle(() => host.textContent?.includes('admin：手动再次修改') ?? false)
    expect(handle!.undoRound('note-round')).toBe(false)
    await click(button(host, '保存到库'))
    await settle(() => saved.length === 2 && button(host, '保存到库').disabled)
    const { readPdfAnnotations } =
      await import('../../../../apps/server/src/services/pdf-annotations.js')
    const read = await readPdfAnnotations(saved[1]!)
    expect(read.annotations).toMatchObject([
      { id: rootId, text: '手动再次修改' },
      { parentId: rootId, text: '手动回复' },
    ])
    const task = getDocument({ data: saved[1]!.slice() })
    try {
      expect(
        (await (await (await task.promise).getPage(1)).getAnnotations()).map(
          (entry) => entry.contentsObj.str,
        ),
      ).toEqual(['手动再次修改', '手动回复'])
    } finally {
      await task.destroy()
    }
    await confirmDelete()
    await settle(() => !host.textContent?.includes('admin：手动再次修改'))
    await act(async () => {
      result = await handle!.execute('read_annotations', {})
    })
    expect((result!.data as { annotations: unknown[] }).annotations).toEqual([])
    expect(button(host, '保存到库').disabled).toBe(false)
    await act(async () => {
      result = await handle!.execute('markup_text', {
        page: 1,
        text: 'ORIGINAL',
        type: 'highlight',
      })
    })
    expect(result!.ok).toBe(true)
    await click(button(host, '刷新批注'))
    await settle(() => !button(host, '刷新批注').disabled)
    const markOptions = openSelect(host, '选择批注')
    await click(markOptions.find((option) => option.textContent?.startsWith('highlight：'))!)
    expect(button(host, '修改批注内容').disabled).toBe(true)
    await confirmDelete()
    await settle(() => !button(host, '刷新批注').disabled)
    await act(async () => {
      result = await handle!.execute('read_annotations', {})
    })
    expect((result!.data as { annotations: unknown[] }).annotations).toEqual([])
  })

  it('rejects cancelled or stale annotation results before publishing bytes and preserves dirty manual edits', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([300, 400])
    const original = await pdf.save()
    let handle: PdfAgentHandle | null = null
    let release: (() => void) | undefined
    let started = false
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    await act(async () =>
      root.render(
        <PdfEditor
          documentId="pdf-notes-cancel"
          io={{ load: async () => original, save: async () => {} }}
          onAgentHandleChange={(next) => {
            handle = next
          }}
          hostApply={async () => {
            throw new Error('not used')
          }}
          hostAnnotations={async ({ bytes, operation, sha256, expectedVersion }) => {
            if (operation.op !== 'read') {
              started = true
              await new Promise<void>((resolve) => {
                release = resolve
              })
            }
            const service = await import('../../../../apps/server/src/services/pdf-annotations.js')
            const result = await service.applyPdfAnnotationOperation(
              bytes,
              operation,
              sha256,
              (operation.op === 'add_note' || operation.op === 'reply_note') &&
                operation.authorship === 'user'
                ? 'admin'
                : 'AI Assistant',
            )
            return {
              bytes: operation.op === 'read' ? undefined : result.bytes,
              annotations: result.annotations,
              version: expectedVersion + (operation.op === 'read' ? 0 : 1),
            }
          }}
        />,
      ),
    )
    mounted.push(() => {
      act(() => root.unmount())
      host.remove()
    })
    await settle(() => handle !== null)
    const controller = new AbortController()
    let pending: ReturnType<PdfAgentHandle['execute']> | undefined
    await act(async () => {
      pending = handle!.execute(
        'add_note',
        { page: 1, text: 'cancelled', x: 20, y: 20 },
        { signal: controller.signal },
      )
    })
    await settle(() => started)
    controller.abort()
    let result: Awaited<ReturnType<PdfAgentHandle['execute']>> | undefined
    await act(async () => {
      release!()
      result = await pending!
    })
    expect(result!.ok).toBe(false)
    expect(button(host, '保存到库').disabled).toBe(true)
    expect(pdfTextMode.rendered.at(-1)).toBe(original)
    started = false
    await act(async () => {
      pending = handle!.execute('add_note', { page: 1, text: 'stale', x: 20, y: 20 })
    })
    await settle(() => started)
    await act(async () => {
      await handle!.execute('apply_ops', { ops: [{ op: 'rotatePages', pages: [1], dir: 90 }] })
    })
    await act(async () => {
      release!()
      result = await pending!
    })
    expect(result!.ok).toBe(false)
    expect(handle!.getContext()).toMatchObject({ dirty: true, pageRotations: [90] })
    expect(button(host, '保存到库').disabled).toBe(false)
    expect(pdfTextMode.rendered.at(-1)).toBe(original)
  })

  it('marks a verified original run on canvas, saves the annotation, and keeps failures clean', async () => {
    pdfTextMode.real = true
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    pdf.addPage([300, 400]).drawText('ORIGINAL', { x: 40, y: 300, size: 12, font })
    const original = await pdf.save()
    const saved: Uint8Array[] = []
    let fail = true
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    await act(async () => {
      root.render(
        <PdfEditor
          documentId="pdf-markup-original"
          io={{
            load: async () => original,
            save: async (bytes) => {
              saved.push(bytes)
            },
          }}
          hostInspect={async ({ bytes, probe }) => {
            const service = await import('../../../../apps/server/src/services/pdf-agent-host.js')
            return service.inspectPdfTextTarget(bytes, probe)
          }}
          hostMarkup={async (input) => {
            if (fail) throw new Error('标注写入被拒绝')
            const service = await import('../../../../apps/server/src/services/pdf-agent-host.js')
            const bytes = await service.applyPdfVerifiedMarkup(input.bytes, input.markup)
            return { bytes, version: input.expectedVersion + 1 }
          }}
          hostApply={async () => {
            throw new Error('此测试不执行插字')
          }}
        />,
      )
    })
    mounted.push(() => {
      act(() => root.unmount())
      host.remove()
    })
    await settle(() => host.querySelector('.mimir-pdf-sheet .mimir-pdf-page') !== null)
    const editTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '编辑',
    )!
    await click(editTab)
    await click(button(host, '定位原文'))
    await settle(() => host.textContent?.includes('点选页面上的一整段原文') ?? false)
    const canvas = host.querySelector<HTMLCanvasElement>('.mimir-pdf-sheet .mimir-pdf-page')!
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 300, 400)
    await click(canvas, { clientX: 50, clientY: 94 })
    await settle(() => host.textContent?.includes('已核验原文对象') ?? false)
    await click(button(host, '添加标注'))
    await settle(() => host.textContent?.includes('标注原文失败：标注写入被拒绝') ?? false)
    expect(button(host, '保存到库').disabled).toBe(true)
    expect(host.querySelector('[data-markup="highlight"]')).toBeNull()
    fail = false
    await click(button(host, '添加标注'))
    await settle(() => host.textContent?.includes('已添加 1 处标注') === true)
    expect(button(host, '保存到库').disabled).toBe(false)
    await click(button(host, '保存到库'))
    await settle(() => saved.length === 1)
    const task = getDocument({ data: saved[0]!.slice() })
    try {
      const page = await (await task.promise).getPage(1)
      expect((await page.getAnnotations()).some((item) => item.subtype === 'Highlight')).toBe(true)
    } finally {
      await task.destroy()
    }
  })

  it('replaces a host-verified original run, updates canvas bytes, saves and reopens', async () => {
    pdfTextMode.real = true
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    pdf.addPage([300, 400]).drawText('ORIGINAL', { x: 40, y: 300, size: 12, font })
    const original = await pdf.save()
    const saved: Uint8Array[] = []
    let appliedBytes: Uint8Array | null = null
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    await act(async () => {
      root.render(
        <PdfEditor
          documentId="pdf-replace-original"
          io={{
            load: async () => original,
            save: async (bytes) => {
              saved.push(bytes)
            },
          }}
          hostInspect={async ({ bytes, probe }) => {
            const service = await import('../../../../apps/server/src/services/pdf-agent-host.js')
            return service.inspectPdfTextTarget(bytes, probe)
          }}
          hostApply={async (input) => {
            const service = await import('../../../../apps/server/src/services/pdf-agent-host.js')
            const edit = input.items[0] as Parameters<
              typeof service.applyPdfVerifiedTextEdit
            >[1] & {
              target: Parameters<typeof service.applyPdfVerifiedTextEdit>[2]
            }
            appliedBytes = await service.applyPdfVerifiedTextEdit(input.bytes, edit, edit.target)
            return { bytes: appliedBytes, version: input.expectedVersion + 1 }
          }}
        />,
      )
    })
    mounted.push(() => {
      act(() => root.unmount())
      host.remove()
    })
    await settle(() => host.querySelector('.mimir-pdf-sheet .mimir-pdf-page') !== null)
    const editTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '编辑',
    )!
    await click(editTab)
    await click(button(host, '定位原文'))
    await settle(() => host.textContent?.includes('点选页面上的一整段原文') ?? false)
    const canvas = host.querySelector<HTMLCanvasElement>('.mimir-pdf-sheet .mimir-pdf-page')!
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 300, 400)
    await click(canvas, { clientX: 50, clientY: 94 })
    await settle(() => host.textContent?.includes('已核验原文对象') ?? false)
    const field = host.querySelector<HTMLInputElement>('input[aria-label="替换为"]')!
    expect(field).not.toBeNull()
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        field,
        'REVISED',
      )
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(button(host, '替换原文'))
    await settle(() => appliedBytes !== null && !button(host, '保存到库').disabled)
    expect(pdfTextMode.rendered).toContain(appliedBytes)
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('已修改，未保存')
    await click(button(host, '保存到库'))
    await settle(() => saved.length === 1)
    expect(saved[0]).toEqual(appliedBytes)
    const task = getDocument({ data: saved[0]!.slice() })
    const reopened = await task.promise
    const text = (await (await reopened.getPage(1)).getTextContent()).items
      .map((item) => ('str' in item ? item.str : ''))
      .join('')
    expect(text).toContain('REVISED')
    expect(text).not.toContain('ORIGINAL')
    await task.destroy()
  })

  it('pins a clicked original run to a host identity and keeps rejected targets read-only', async () => {
    pdfTextMode.real = true
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    pdf.addPage([300, 400]).drawText('ORIGINAL', { x: 40, y: 300, size: 12, font })
    const original = await pdf.save()
    const probes: Array<{ oldText: string; rect: number[] }> = []
    let reject = false
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    await act(async () => {
      root.render(
        <PdfEditor
          documentId="pdf-inspect"
          io={{ load: async () => original, save: async () => {} }}
          hostInspect={async ({ probe }) => {
            probes.push(probe)
            if (reject) throw new Error('对象有歧义')
            return {
              sha256: 'a'.repeat(64),
              pageIndex: 0,
              objectIndex: 1,
              text: 'ORIGINAL',
              bounds: [40, 299, 100, 312],
            }
          }}
          hostApply={async () => {
            throw new Error('写入被拒绝')
          }}
        />,
      )
    })
    mounted.push(() => {
      act(() => root.unmount())
      host.remove()
    })
    await settle(() => host.querySelector('.mimir-pdf-page') !== null)
    const editTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '编辑',
    )!
    await click(editTab)
    await click(button(host, '定位原文'))
    await settle(() => host.textContent?.includes('点选页面上的一整段原文') ?? false)
    const canvas = host.querySelector<HTMLCanvasElement>('.mimir-pdf-sheet .mimir-pdf-page')!
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 300, 400)
    await click(canvas, { clientX: 50, clientY: 94 })
    expect(probes).toHaveLength(1)
    await settle(() => host.textContent?.includes('已核验原文对象') ?? false)
    expect(probes[0]?.oldText).toBe('ORIGINAL')
    expect(probes[0]?.rect[0]).toBeCloseTo(40)
    expect(probes[0]?.rect[2]).toBeGreaterThan(97)

    const field = host.querySelector<HTMLInputElement>('input[aria-label="替换为"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        field,
        'REVISED',
      )
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(button(host, '替换原文'))
    await settle(() => host.textContent?.includes('替换原文失败：写入被拒绝') ?? false)
    expect(button(host, '保存到库').disabled).toBe(true)
    expect(pdfTextMode.rendered).toContain(original)

    reject = true
    await click(canvas, { clientX: 50, clientY: 94 })
    await settle(() => host.textContent?.includes('原文对象未通过核验') ?? false)
    expect(host.textContent).toContain('只读定位')
    expect(host.textContent).not.toContain('已核验原文对象')
  })

  it('lets the Agent insert into a manually rotated canvas and saves readable bytes', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([300, 400])
    const original = await pdf.save()
    const saved: Uint8Array[] = []
    const dirtyStates: boolean[] = []
    let agent: PdfAgentHandle | null = null
    let sentBytes: Uint8Array | null = null
    let hostCalls = 0
    const hostApply: PdfHostApply = async (input) => {
      hostCalls++
      sentBytes = input.bytes
      const doc = await PDFDocument.load(input.bytes)
      const font = await doc.embedFont(StandardFonts.Helvetica)
      const item = input.items[0] as { origin: [number, number]; text: string }
      doc.getPage(0).drawText(item.text, { x: item.origin[0], y: item.origin[1], font })
      return { bytes: await doc.save(), version: input.expectedVersion + 1 }
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    pdfTextMode.lifecycle = true
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    await act(async () => {
      root.render(
        <PdfEditor
          documentId="pdf-agent-manual"
          io={{
            load: async () => original,
            save: async (bytes) => {
              saved.push(bytes)
            },
          }}
          hostApply={withTextLayout(hostApply)}
          onDirtyChange={(value) => dirtyStates.push(value)}
          onAgentHandleChange={(value) => {
            agent = value
          }}
        />,
      )
    })
    mounted.push(() => {
      act(() => root.unmount())
      host.remove()
    })
    await settle(() => agent !== null && host.querySelector('.mimir-pdf-page') !== null)
    const quickAccess = host.querySelector('.mimir-compact-toolbar__quick-access')
    expect(quickAccess?.querySelectorAll('button')).toHaveLength(3)
    expect(quickAccess?.querySelector('button[aria-label="保存到库"]')).toBe(
      button(host, '保存到库'),
    )
    expect(host.querySelector('.mimir-editor__status button[aria-label="保存到库"]')).toBeNull()
    expect(button(host, '撤销').getAttribute('title')).toBe('没有可撤销的编辑')
    expect(button(host, '重做').getAttribute('title')).toBe('没有可重做的编辑')
    await click(button(host, '页面与版式操作'))
    const rotate = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === '向右旋转 90 度',
    )!
    await click(rotate)
    const version = agent!.getVersion()
    let result: Awaited<ReturnType<PdfAgentHandle['execute']>> | null = null
    await act(async () => {
      result = await agent!.execute(
        'insert_text',
        { page: 1, text: 'AGENT TEXT', x: 60, y: 100 },
        { expectedVersion: version, roundId: 'agent-insert' },
      )
    })
    expect(result).toMatchObject({ ok: true, changed: true, version: version + 1 })
    const editTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '编辑',
    )!
    await click(editTab)
    await click(button(host, '编辑待保存文字'))
    const pendingField = host.querySelector<HTMLInputElement>(
      'textarea[aria-label="插入文字内容"]',
    )!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter!.call(pendingField, 'MANUAL FINAL')
      pendingField.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(button(host, '更新插入文字'))
    await settle(() => hostCalls === 2)
    const listed = await agent!.execute('list_inserted_text', {})
    expect(listed.data).toMatchObject({
      inserts: [{ text: 'MANUAL FINAL' }],
    })
    const pendingId = (listed.data as { inserts: Array<{ id: string }> }).inserts[0]!.id
    await act(async () => {
      result = await agent!.execute('move_inserted_text', { id: pendingId, dx: 20, dy: 10 })
    })
    expect(result).toMatchObject({ ok: true, changed: true })
    expect((await PDFDocument.load(sentBytes!)).getPage(0).getRotation().angle).toBe(90)
    await settle(
      () =>
        host.querySelector('.mimir-editor__status')?.textContent?.includes('已修改，未保存') ===
        true,
    )
    await click(button(host, '保存到库'))
    await settle(() => saved.length === 1)
    const task = getDocument({ data: saved[0]!.slice() })
    const read = await task.promise
    const content = await (await read.getPage(1)).getTextContent()
    expect(content.items.map((item) => ('str' in item ? item.str : '')).join('')).toContain(
      'MANUAL FINAL',
    )
    await task.destroy()
    expect((await agent!.execute('list_inserted_text', {})).data).toEqual({ inserts: [] })
    let next: Awaited<ReturnType<PdfAgentHandle['execute']>> | null = null
    await act(async () => {
      next = await agent!.execute('insert_text', {
        page: 1,
        text: 'TEMPORARY',
        x: 80,
        y: 140,
      })
    })
    expect(next).toMatchObject({ ok: true, changed: true })
    const nextId = (next as unknown as { data: { id: string } }).data.id
    await act(async () => {
      next = await agent!.execute('delete_inserted_text', { id: nextId })
    })
    expect(next).toMatchObject({ ok: true, changed: true })
    await settle(() => button(host, '保存到库').disabled)
    expect(dirtyStates.at(-1)).toBe(false)
    expect(saved).toHaveLength(1)
    expect((await agent!.execute('list_inserted_text', {})).data).toEqual({ inserts: [] })
  })

  it('sends the live unsaved page layout to the host, renders returned bytes, then saves them', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([300, 400])
    const original = await pdf.save()
    const saved: Uint8Array[] = []
    let hostInput: Parameters<PdfHostApply>[0] | null = null
    let hostOutput: Uint8Array | null = null
    const hostApply: PdfHostApply = async (input) => {
      hostInput = input
      const doc = await PDFDocument.load(input.bytes)
      const font = await doc.embedFont(StandardFonts.Helvetica)
      doc.getPage(0).drawText('INSERTED', { x: 60, y: 300, font })
      hostOutput = await doc.save()
      return { bytes: hostOutput, version: input.expectedVersion + 1 }
    }
    const io: EditorIo = {
      load: async () => original,
      save: async (bytes) => {
        saved.push(bytes)
      },
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    await act(async () => {
      root.render(<PdfEditor documentId="pdf-1" io={io} hostApply={withTextLayout(hostApply)} />)
    })
    mounted.push(() => {
      act(() => root.unmount())
      host.remove()
    })
    await settle(() => host.querySelector('.mimir-pdf-page') !== null)

    await click(button(host, '页面与版式操作'))
    const rotate = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === '向右旋转 90 度',
    )
    if (!rotate) throw new Error('没有旋转命令')
    await click(rotate)
    await click(button(host, '页面与版式操作'))
    const insert = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === '点击页面位置插入文字',
    )
    if (!insert) throw new Error('没有插入文字命令')
    await click(insert)
    const canvas = host.querySelector<HTMLCanvasElement>('.mimir-pdf-sheet .mimir-pdf-page')!
    canvas.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 300,
      bottom: 400,
      width: 300,
      height: 400,
      toJSON: () => ({}),
    })
    await click(canvas, { clientX: 60, clientY: 100 })
    await settle(
      () =>
        host.querySelector('.mimir-pdf-insert-bar')?.textContent?.includes('已选择纸面位置') ===
        true,
    )
    const field = host.querySelector<HTMLInputElement>('textarea[aria-label="要插入的文字"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter!.call(field, 'INSERTED')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(button(host, '插入到页面').disabled).toBe(false)
    await click(button(host, '插入到页面'))
    await settle(() => hostInput !== null && hostOutput !== null)
    expect((await PDFDocument.load(hostInput!.bytes)).getPage(0).getRotation().angle).toBe(90)
    expect(hostInput!.items).toMatchObject([{ pageIndex: 0, text: 'INSERTED' }])
    await settle(
      () =>
        host.querySelector('.mimir-editor__status')?.textContent?.includes('已修改，未保存') ===
        true,
    )
    await click(button(host, '保存到库'))
    await settle(() => saved.length === 1)
    expect(saved[0]).toEqual(hostOutput)
    await settle(
      () => host.querySelector('.mimir-editor__status')?.textContent?.includes('已保存') === true,
    )
    await click(button(host, '页面与版式操作'))
    const rotateBack = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === '向左旋转 90 度',
    )
    if (!rotateBack) throw new Error('没有反向旋转命令')
    await click(rotateBack)
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('已修改，未保存')
    await click(button(host, '保存到库'))
    await settle(() => saved.length === 2)
    expect((await PDFDocument.load(saved[1]!)).getPage(0).getRotation().angle).toBe(0)
    expect(saved[1]).not.toEqual(original)
  })

  it('rejects a delayed host result after a manual page edit', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([300, 400])
    const original = await pdf.save()
    const saved: Uint8Array[] = []
    let resolveHost: ((value: { bytes: Uint8Array; version: number }) => void) | null = null
    let request: Parameters<PdfHostApply>[0] | null = null
    const hostApply: PdfHostApply = (input) => {
      request = input
      return new Promise((resolve) => {
        resolveHost = resolve
      })
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    await act(async () => {
      root.render(
        <PdfEditor
          documentId="pdf-2"
          io={{
            load: async () => original,
            save: async (bytes) => {
              saved.push(bytes)
            },
          }}
          hostApply={withTextLayout(hostApply)}
        />,
      )
    })
    mounted.push(() => {
      act(() => root.unmount())
      host.remove()
    })
    await settle(() => host.querySelector('.mimir-pdf-page') !== null)
    await click(button(host, '页面与版式操作'))
    const insert = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === '点击页面位置插入文字',
    )!
    await click(insert)
    const canvas = host.querySelector<HTMLCanvasElement>('.mimir-pdf-sheet .mimir-pdf-page')!
    canvas.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 300,
      bottom: 400,
      width: 300,
      height: 400,
      toJSON: () => ({}),
    })
    await click(canvas, { clientX: 60, clientY: 100 })
    await settle(
      () =>
        host.querySelector('.mimir-pdf-insert-bar')?.textContent?.includes('已选择纸面位置') ===
        true,
    )
    const field = host.querySelector<HTMLInputElement>('textarea[aria-label="要插入的文字"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        field,
        'LATE',
      )
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(button(host, '插入到页面'))
    await settle(() => request !== null)
    await click(button(host, '页面与版式操作'))
    const rotate = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === '向右旋转 90 度',
    )!
    await click(rotate)
    await act(async () => {
      resolveHost!({ bytes: original, version: request!.expectedVersion + 1 })
    })
    await settle(
      () =>
        host.querySelector('.mimir-editor__footer')?.textContent?.includes('结果未应用') === true,
    )
    await click(button(host, '保存到库'))
    await settle(() => saved.length === 1)
    expect((await PDFDocument.load(saved[0]!)).getPage(0).getRotation().angle).toBe(90)
  })

  it('returns to the exact saved bytes when a newer insertion is deleted before an older save completes', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([300, 400])
    const original = await pdf.save()
    const saved: Uint8Array[] = []
    const dirtyStates: boolean[] = []
    let agent: PdfAgentHandle | null = null
    let finishFirstSave: (() => void) | null = null
    let insertionCount = 0
    const hostApply: PdfHostApply = async (input) => {
      const doc = await PDFDocument.load(input.bytes)
      const font = await doc.embedFont(StandardFonts.Helvetica)
      doc.getPage(0).drawText(`INSERT ${++insertionCount}`, { x: 60, y: 300, font })
      return { bytes: await doc.save(), version: input.expectedVersion + 1 }
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    await act(async () => {
      root.render(
        <PdfEditor
          documentId="pdf-save-race"
          io={{
            load: async () => original,
            save: async (bytes) => {
              saved.push(bytes)
              if (saved.length === 1)
                await new Promise<void>((resolve) => {
                  finishFirstSave = resolve
                })
            },
          }}
          hostApply={withTextLayout(hostApply)}
          onDirtyChange={(value) => dirtyStates.push(value)}
          onAgentHandleChange={(value) => {
            agent = value
          }}
        />,
      )
    })
    mounted.push(() => {
      act(() => root.unmount())
      host.remove()
    })
    await settle(() => host.querySelector('.mimir-pdf-page') !== null)

    const insert = async (value: string) => {
      await click(button(host, '页面与版式操作'))
      const item = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
        (candidate) => candidate.textContent?.trim() === '点击页面位置插入文字',
      )!
      await click(item)
      const canvas = host.querySelector<HTMLCanvasElement>('.mimir-pdf-sheet .mimir-pdf-page')!
      canvas.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 300,
        bottom: 400,
        width: 300,
        height: 400,
        toJSON: () => ({}),
      })
      await click(canvas, { clientX: 60, clientY: 100 })
      await settle(() => host.querySelector('.mimir-pdf-insert-bar') !== null)
      const field = host.querySelector<HTMLInputElement>('textarea[aria-label="要插入的文字"]')!
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
          field,
          value,
        )
        field.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await click(button(host, '插入到页面'))
      await settle(() => host.querySelector('.mimir-pdf-insert-bar') === null)
    }

    await insert('FIRST')
    await click(button(host, '保存到库'))
    await settle(() => finishFirstSave !== null)
    await insert('SECOND')
    const listed = await agent!.execute('list_inserted_text', {})
    const pending = (listed.data as { inserts: Array<{ id: string }> }).inserts
    expect(pending).toHaveLength(2)
    await act(async () => {
      expect((await agent!.execute('delete_inserted_text', { id: pending[1]!.id })).ok).toBe(true)
    })
    await act(async () => finishFirstSave!())
    await settle(() => button(host, '保存到库').disabled)
    expect(dirtyStates.at(-1)).toBe(false)
    expect(saved).toHaveLength(1)
    await insert('THIRD')
    await click(button(host, '保存到库'))
    await settle(() => saved.length === 2)
    expect(saved[1]).not.toEqual(saved[0])
    expect((await PDFDocument.load(saved[1]!)).getPageCount()).toBe(1)
  })

  it('reuses the exact page-only save bytes for an insertion made while saving', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([300, 400])
    const original = await pdf.save()
    const saved: Uint8Array[] = []
    const dirtyStates: boolean[] = []
    let finishSave: (() => void) | null = null
    let agent: PdfAgentHandle | null = null
    let hostInput: Parameters<PdfHostApply>[0] | null = null
    const hostApply: PdfHostApply = async (input) => {
      hostInput = input
      const doc = await PDFDocument.load(input.bytes)
      const font = await doc.embedFont(StandardFonts.Helvetica)
      for (const raw of input.items) {
        const item = raw as { pageIndex: number; origin: [number, number]; text: string }
        doc.getPage(item.pageIndex).drawText(item.text, {
          x: item.origin[0],
          y: item.origin[1],
          font,
        })
      }
      return { bytes: await doc.save(), version: input.expectedVersion + 1 }
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    await act(async () => {
      root.render(
        <PdfEditor
          documentId="pdf-page-save-race"
          io={{
            load: async () => original,
            save: async (bytes) => {
              saved.push(bytes)
              await new Promise<void>((resolve) => {
                finishSave = resolve
              })
            },
          }}
          hostApply={withTextLayout(hostApply)}
          onDirtyChange={(value) => dirtyStates.push(value)}
          onAgentHandleChange={(value) => {
            agent = value
          }}
        />,
      )
    })
    mounted.push(() => {
      act(() => root.unmount())
      host.remove()
    })
    await settle(() => agent !== null && host.querySelector('.mimir-pdf-page') !== null)
    await click(button(host, '页面与版式操作'))
    const rotate = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === '向右旋转 90 度',
    )!
    await click(rotate)
    await click(button(host, '保存到库'))
    await settle(() => finishSave !== null)
    let result: Awaited<ReturnType<PdfAgentHandle['execute']>> | null = null
    await act(async () => {
      result = await agent!.execute('insert_text', { page: 1, text: 'RACE', x: 50, y: 100 })
    })
    expect(result).toMatchObject({ ok: true, changed: true })
    expect(hostInput!.bytes).toBe(saved[0])
    const listed = await agent!.execute('list_inserted_text', {})
    const id = (listed.data as { inserts: Array<{ id: string }> }).inserts[0]!.id
    await act(async () => {
      expect((await agent!.execute('delete_inserted_text', { id })).ok).toBe(true)
    })
    await act(async () => finishSave!())
    await settle(() => button(host, '保存到库').disabled)
    expect(dirtyStates.at(-1)).toBe(false)
    expect(saved).toHaveLength(1)
    expect((await PDFDocument.load(saved[0]!)).getPage(0).getRotation().angle).toBe(90)
  })
})

describe('PDF native text layout persistence', () => {
  it.each([
    ['load', 'cancel'],
    ['page', 'cancel'],
    ['load', 'source'],
    ['page', 'source'],
  ] as const)(
    'settles an Editor %s wait on %s before a late proxy result',
    async (phase, action) => {
      ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
      pdfTextMode.lifecycle = true
      const pdf = await PDFDocument.create()
      pdf.addPage([300, 400])
      const original = await pdf.save()
      const other = await PDFDocument.create()
      other.addPage([320, 420])
      const replacement = await other.save()
      let agent: PdfAgentHandle | null = null
      const hostApply = vi.fn<PdfHostApply>(async () => {
        throw new Error('a cancelled read must never reach native insertion')
      })
      const save = vi.fn<EditorIo['save']>(async () => {})
      const host = document.createElement('div')
      document.body.append(host)
      const root = createRoot(host)
      const render = (documentId: string, bytes: Uint8Array) => (
        <PdfEditor
          documentId={documentId}
          io={{ load: async () => bytes, save }}
          hostApply={hostApply}
          onAgentHandleChange={(value) => {
            agent = value
          }}
        />
      )
      await act(async () => root.render(render('lifecycle-original', original)))
      mounted.push(() => {
        act(() => root.unmount())
        host.remove()
      })
      await settle(() => agent !== null && host.querySelector('.mimir-pdf-page') !== null)
      await click(
        [...host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === '编辑')!,
      )
      let resume!: () => void
      let entered = false
      const gate = new Promise<void>((resolve) => {
        resume = resolve
      })
      pdfTextMode.afterLoad = async (doc) => {
        if (phase === 'load') {
          entered = true
          await gate
        } else {
          const actual = doc.getPage.bind(doc)
          const spy = vi.spyOn(doc, 'getPage').mockImplementationOnce(async (pageNumber) => {
            const page = await actual(pageNumber)
            entered = true
            await gate
            spy.mockRestore()
            return page
          })
        }
        return doc
      }
      const controller = new AbortController()
      const originalHandle = agent!
      const version = originalHandle.getVersion()
      let run!: ReturnType<PdfAgentHandle['execute']>
      await act(async () => {
        run = originalHandle.execute(
          'insert_text',
          { page: 1, text: 'must never be inserted', x: 20, y: 20 },
          { signal: controller.signal },
        )
      })
      await settle(() => entered)
      expect(button(host, '插入文字').disabled).toBe(true)
      let completed = false
      let result: Awaited<typeof run> | undefined
      void run.then((value) => {
        result = value
        completed = true
      })
      if (action === 'cancel') await act(async () => controller.abort())
      else await act(async () => root.render(render('lifecycle-replacement', replacement)))
      // The request and its busy state must settle while the transport remains pending.
      await settle(
        () =>
          completed &&
          agent !== null &&
          agent.documentId ===
            (action === 'cancel' ? 'lifecycle-original' : 'lifecycle-replacement'),
      )
      if (action === 'source')
        await click(
          [...host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === '编辑')!,
        )
      await settle(() => !button(host, '插入文字').disabled)
      expect(result).toMatchObject({ ok: false, changed: false })
      expect(originalHandle.getVersion()).toBe(version)
      const currentHandle = agent!
      const currentVersion = currentHandle.getVersion()
      await act(async () => {
        resume()
        await gate
      })
      expect(hostApply).not.toHaveBeenCalled()
      expect(save).not.toHaveBeenCalled()
      expect(currentHandle.getVersion()).toBe(currentVersion)
      expect(currentHandle.getContext()).toMatchObject({ dirty: false })
      expect((await currentHandle.execute('list_inserted_text', {})).data).toEqual({ inserts: [] })
      expect(button(host, '保存到库').disabled).toBe(true)
      expect(button(host, '撤销').disabled).toBe(true)
      expect(button(host, '重做').disabled).toBe(true)
      expect(pdfTextMode.rendered.at(-1)).toBe(action === 'cancel' ? original : replacement)
    },
  )

  it('keeps Chinese wrapping/font/align through edits, batch survivors, history and two saves', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    pdfTextMode.real = true
    pdfTextMode.lifecycle = true
    const pdf = await PDFDocument.create()
    pdf.addPage([500, 600])
    const original = await pdf.save()
    const saved: Uint8Array[] = []
    let agent: PdfAgentHandle | null = null
    const native = await import('../../../../apps/server/src/services/pdf-agent-host.js')
    const local = await import('../../../../apps/server/src/services/pdf-local.js')
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () =>
      root.render(
        <PdfEditor
          documentId="pdf-text-native-layout"
          io={{
            load: async () => original,
            save: async (bytes) => {
              saved.push(bytes)
            },
          }}
          onAgentHandleChange={(value) => {
            agent = value
          }}
          hostApply={withTextLayout(async (input) => ({
            bytes: await native.applyPdfTextInserts(
              input.bytes,
              input.items as Parameters<typeof native.applyPdfTextInserts>[1],
            ),
            version: input.expectedVersion + 1,
          }))}
          hostLocal={async (input) => {
            const result = await local.applyPdfLocalOperation(
              input.bytes,
              input.operation,
              undefined,
              input.signal,
            )
            return { ...result, version: input.expectedVersion + (result.bytes ? 1 : 0) }
          }}
        />,
      ),
    )
    mounted.push(() => {
      act(() => root.unmount())
      host.remove()
    })
    await settle(() => agent !== null)
    const execute = async (tool: string, args: Record<string, unknown>) => {
      let result!: Awaited<ReturnType<PdfAgentHandle['execute']>>
      await act(async () => {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          result = await Promise.race([
            agent!.execute(tool, args),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error(`PDF lifecycle request ${tool} did not settle`)),
                3000,
              )
            }),
          ])
        } finally {
          clearTimeout(timer)
        }
      })
      return result
    }
    expect(
      await execute('insert_text', {
        page: 1,
        text: '第一段中文用于真实字体换行和保存测试 English one',
        max_width: 150,
        align: 'right',
        font: 'times',
        bold: true,
        italic: true,
        color: '#123456',
      }),
    ).toMatchObject({ ok: true, changed: true })
    let listed = (await execute('list_inserted_text', {})).data as {
      inserts: {
        id: string
        text: string
        wrapped_text: string
        align: string
        max_width: number
        font: string
        bold: boolean
        italic: boolean
      }[]
    }
    expect(listed.inserts[0]).toMatchObject({
      align: 'right',
      font: 'times',
      bold: true,
      italic: true,
      max_width: 150,
    })
    expect(listed.inserts[0]!.wrapped_text).toContain('\n')
    const id = listed.inserts[0]!.id
    const beforeOverflow = agent!.getVersion()
    expect(await execute('move_inserted_text', { id, x: 490 })).toMatchObject({
      ok: false,
      changed: false,
      version: beforeOverflow,
    })
    expect(await execute('move_inserted_text', { id, y: 570 })).toMatchObject({
      ok: false,
      changed: false,
      version: beforeOverflow,
    })
    expect(await execute('move_inserted_text', { id, dx: 8, dy: 5 })).toMatchObject({
      ok: true,
      changed: true,
    })
    expect(await execute('edit_inserted_text', { id, max_width: 130 })).toMatchObject({
      ok: true,
      changed: true,
    })
    expect(await execute('edit_inserted_text', { id, align: 'center' })).toMatchObject({
      ok: true,
      changed: true,
    })
    const version = agent!.getVersion()
    expect(await execute('edit_inserted_text', { id })).toMatchObject({
      ok: true,
      changed: false,
      version,
    })
    expect(await execute('edit_inserted_text', { id, align: 'center' })).toMatchObject({
      ok: true,
      changed: false,
      version,
    })
    await click(
      [...host.querySelectorAll('[role="tab"]')].find((item) => item.textContent === '编辑')!,
    )
    await click(button(host, '编辑待保存文字'))
    const pendingInput = host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="插入文字内容"]',
    )!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        pendingInput,
        'STALE DRAFT',
      )
      pendingInput.dispatchEvent(new Event('input', { bubbles: true }))
      pendingInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(
      host.querySelector<HTMLTextAreaElement>('textarea[aria-label="插入文字内容"]')!.value,
    ).toBe('STALE DRAFT')
    await click(button(host, '撤销'))
    expect(
      host.querySelector<HTMLTextAreaElement>('textarea[aria-label="插入文字内容"]')!.value,
    ).toBe(listed.inserts[0]!.text)
    await click(button(host, '重做'))
    expect(
      host.querySelector<HTMLTextAreaElement>('textarea[aria-label="插入文字内容"]')!.value,
    ).toBe(listed.inserts[0]!.text)
    await click(button(host, '关闭文字面板'))
    await click(button(host, '保存到库'))
    await settle(() => saved.length === 1)
    expect(await execute('insert_text', { page: 1, text: 'REMOVE', x: 20, y: 400 })).toMatchObject({
      ok: true,
    })
    expect(
      await execute('insert_text', {
        page: 1,
        text: '第二次保存的中文段落 English survivor',
        x: 240,
        y: 240,
        max_width: 180,
        align: 'right',
        font: 'courier',
        bold: true,
        color: '#123456',
      }),
    ).toMatchObject({ ok: true })
    listed = (await execute('list_inserted_text', {})).data as typeof listed
    const survivor = listed.inserts[1]!
    expect(
      await execute('apply_ops', {
        ops: [
          { op: 'removeTextInsert', id: listed.inserts[0]!.id },
          { op: 'setMetadata', metadata: { title: 'text parameters' } },
        ],
      }),
    ).toMatchObject({ ok: true, changed: true })
    expect(((await execute('list_inserted_text', {})).data as typeof listed).inserts).toMatchObject(
      [
        {
          id: survivor.id,
          align: 'right',
          font: 'courier',
          bold: true,
          max_width: 180,
          wrapped_text: survivor.wrapped_text,
        },
      ],
    )
    await click(button(host, '撤销'))
    expect(((await execute('list_inserted_text', {})).data as typeof listed).inserts).toHaveLength(
      2,
    )
    await click(button(host, '重做'))
    expect(((await execute('list_inserted_text', {})).data as typeof listed).inserts).toHaveLength(
      1,
    )
    await click(button(host, '保存到库'))
    await settle(() => saved.length === 2)
    const task = getDocument({ data: saved[1]!.slice() })
    try {
      const content = await (await (await task.promise).getPage(1)).getTextContent()
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join('')
        .replace(/\s/g, '')
      expect(text).toContain('第一段中文用于真实字体换行和保存测试Englishone')
      expect(text).toContain('第二次保存的中文段落Englishsurvivor')
      expect(text).not.toContain('REMOVE')
    } finally {
      await task.destroy()
    }
    expect((await PDFDocument.load(saved[1]!)).getTitle()).toBe('text parameters')
    await click(button(host, '撤销'))
    await click(button(host, '保存到库'))
    await settle(() => saved.length === 3)
    expect((await PDFDocument.load(saved[2]!)).getTitle()).not.toBe('text parameters')
    await click(button(host, '重做'))
    await click(button(host, '保存到库'))
    await settle(() => saved.length === 4)
    expect(saved[3]).toEqual(saved[1])
  })
})
