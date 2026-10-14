// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfAgentHandle } from '../agent/pdf-agent.js'
import type { EditorIo } from './types.js'
import type { PdfHostApply } from './PdfEditor.js'

vi.mock('./pdf-render.js', () => ({
  cancelPdfRender: () => {},
  retainPdfDocuments: () => {},
  renderPdfPages: async () => ({ dispose: () => {} }),
  loadPdfDocument: async () => ({
    getPage: async () => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 300 * scale,
        height: 400 * scale,
        convertToPdfPoint: (x: number, y: number) => [x / scale, 400 - y / scale],
        convertToViewportPoint: (x: number, y: number) => [x * scale, (400 - y) * scale],
      }),
    }),
  }),
}))

import { PdfEditor } from './PdfEditor.js'

const mounted: Array<() => void> = []
afterEach(() => {
  for (const unmount of mounted) unmount()
  mounted.length = 0
})

async function settle(done: () => boolean): Promise<void> {
  for (let i = 0; i < 80 && !done(); i += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2))
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

describe('PDF manual content canvas', () => {
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
          hostApply={hostApply}
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
    expect(button(host, '撤销').getAttribute('title')).toBe('PDF 编辑尚不支持完整撤销历史')
    expect(button(host, '重做').getAttribute('title')).toBe('PDF 编辑尚不支持完整重做历史')
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
    const pendingField = host.querySelector<HTMLInputElement>('input[aria-label="插入文字内容"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
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
      root.render(<PdfEditor documentId="pdf-1" io={io} hostApply={hostApply} />)
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
      () => host.querySelector('.mimir-pdf-insert-bar')?.textContent?.includes('X 60') === true,
    )
    const field = host.querySelector<HTMLInputElement>('input[aria-label="要插入的文字"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter!.call(field, 'INSERTED')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(button(host, '插入文字').disabled).toBe(false)
    await click(button(host, '插入文字'))
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
          hostApply={hostApply}
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
      () => host.querySelector('.mimir-pdf-insert-bar')?.textContent?.includes('X 60') === true,
    )
    const field = host.querySelector<HTMLInputElement>('input[aria-label="要插入的文字"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, 'LATE')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(button(host, '插入文字'))
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
          hostApply={hostApply}
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
      const field = host.querySelector<HTMLInputElement>('input[aria-label="要插入的文字"]')!
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          field,
          value,
        )
        field.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await click(button(host, '插入文字'))
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
          hostApply={hostApply}
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
