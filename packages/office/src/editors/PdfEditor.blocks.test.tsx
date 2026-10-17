// @vitest-environment happy-dom
import { ConfigProvider } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfHostBlocks } from '../agent/pdf-content-agent.js'
import type { PdfAgentHandle } from '../agent/pdf-agent.js'
import { applyPdfTextBlockOperation } from '../../../../apps/server/src/services/pdf-agent-host.js'
import { readPdfNativeBlockObjects } from '../../../../apps/server/src/services/pdf-block-writer.js'
import { applyPdfLocalOperation } from '../../../../apps/server/src/services/pdf-local.js'
const parsing = vi.hoisted(() => ({ tasks: new Map<Uint8Array, ReturnType<typeof getDocument>>() }))
vi.mock('./pdf-render.js', () => ({
  cancelPdfRender() {},
  retainPdfDocuments() {},
  renderPdfPages: async () => ({ dispose() {} }),
  loadPdfDocument: async (bytes: Uint8Array) => {
    let task = parsing.tasks.get(bytes)
    if (!task) {
      task = getDocument({ data: bytes.slice() })
      parsing.tasks.set(bytes, task)
    }
    return task.promise
  },
}))
import { PdfEditor } from './PdfEditor.js'
import { openSelect } from '../shell/antd-test-dom.js'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const clean: Array<() => void> = []
afterEach(async () => {
  clean.splice(0).forEach((dispose) => dispose())
  for (const task of parsing.tasks.values()) await task.destroy()
  parsing.tasks.clear()
})
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}
async function settle(predicate: () => boolean) {
  await vi.waitFor(
    async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
      })
      expect(predicate()).toBe(true)
    },
    { timeout: 5000 },
  )
}
function byLabel<T extends HTMLElement>(host: HTMLElement, name: string): T {
  const node = host.querySelector<T>(`[aria-label="${name}"]`)
  if (!node) throw new Error(`Missing ${name}`)
  return node
}
async function click(node: Element) {
  await act(async () => node.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}
async function type(host: HTMLElement, label: string, value: string) {
  await act(async () => {
    const node = byLabel<HTMLInputElement | HTMLTextAreaElement>(host, label)
    node.focus()
    Object.getOwnPropertyDescriptor(
      node instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value',
    )!.set!.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () =>
    byLabel(host, label).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    ),
  )
}
async function fixture() {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const page = pdf.addPage([500, 700])
  for (const top of [580, 360])
    for (let line = 0; line < 3; line++) {
      const text = [
        'Original paragraph alpha ',
        'Original paragraph bravo ',
        'Original paragraph charlie ',
      ][line]!
      page.drawText(text, { x: 60, y: top - line * 18, size: 12, font })
      page.drawText('bold ending', {
        x: 60 + font.widthOfTextAtSize(text, 12),
        y: top - line * 18,
        size: 12,
        font: bold,
      })
    }
  page.drawRectangle({ x: 30, y: 80, width: 25, height: 20 })
  page.setCropBox(20, 40, 450, 620)
  pdf.addPage([500, 700]).drawText('UNTOUCHED SECOND PAGE', { x: 50, y: 500, size: 18, font })
  return pdf.save()
}
async function mount(afterHost?: (input: Parameters<PdfHostBlocks>[0]) => Promise<void>) {
  const original = await fixture(),
    host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  let handle: PdfAgentHandle | null = null
  const saves: Uint8Array[] = [],
    dirty: boolean[] = []
  const hostBlocks = vi.fn<PdfHostBlocks>(async (input) => {
    const result = await applyPdfTextBlockOperation(input.bytes, input.operation, input.signal)
    await afterHost?.(input)
    // Deliberately permit a late result; the editor must independently discard it.
    return { ...result, version: input.expectedVersion + (result.bytes ? 1 : 0) }
  })
  const render = async (documentId = 'original-blocks') =>
    act(async () =>
      root.render(
        <ConfigProvider componentSize="small">
          <PdfEditor
            documentId={documentId}
            io={{
              load: async () => original,
              save: async (bytes) => {
                saves.push(bytes)
              },
            }}
            hostBlocks={hostBlocks}
            hostLocal={async ({ bytes, expectedVersion, operation }) => {
              const result = await applyPdfLocalOperation(bytes, operation)
              return { ...result, version: expectedVersion + (result.bytes ? 1 : 0) }
            }}
            onAgentHandleChange={(current) => {
              handle = current
            }}
            onDirtyChange={(value) => dirty.push(value)}
          />
        </ConfigProvider>,
      ),
    )
  clean.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await render()
  await settle(() => !!handle)
  return { host, original, saves, dirty, hostBlocks, render, handle: () => handle! }
}
async function open(host: HTMLElement) {
  await click(
    [...host.querySelectorAll('[role="tab"]')].find((node) => node.textContent === '编辑')!,
  )
  await click(byLabel(host, '原文段落编辑'))
  await settle(() => host.textContent!.includes('2 个段落'))
}
async function selectFirst(host: HTMLElement) {
  const option = openSelect(host, '选择原文段落').find((node) =>
    node.textContent?.startsWith('1. Original paragraph alpha'),
  )!
  expect(option).toBeDefined()
  await click(option)
  await settle(() => !!host.querySelector('[aria-label="段落水平偏移（pt）"]'))
}
const moveCalls = (host: ReturnType<typeof vi.fn<PdfHostBlocks>>) =>
  host.mock.calls.filter(([input]) => input.operation.op === 'move')

describe('real original paragraph host through PdfEditor', () => {
  it('rewrites and partly replaces the selected native paragraph through real controls, with exact save/undo/redo bytes', async () => {
    const app = await mount(),
      h = app.handle()
    await open(app.host)
    await selectFirst(app.host)
    const mode = async (name: string) =>
      click(
        [...app.host.querySelectorAll('.ant-segmented-item')].find(
          (node) => node.textContent === name,
        )!,
      )
    await mode('局部替换')
    await type(app.host, '要替换的原文', 'Original')
    await type(app.host, '替换第几处', '2')
    await type(app.host, '替换为', 'Changed')
    const version = h.getVersion()
    await click(byLabel(app.host, '应用局部替换'))
    await settle(() => h.getVersion() === version + 1)
    await click(byLabel(app.host, '保存到库'))
    await settle(() => app.saves.length === 1)
    const replaced = app.saves[0]!,
      native = await readPdfNativeBlockObjects(replaced, 0)
    expect(native.map((object) => object.text).join(' ')).toContain('Changed paragraph bravo')
    expect(
      native.filter((object) => object.text.includes('Original paragraph alpha')),
    ).toHaveLength(2)
    expect(native.filter((object) => object.text.includes('bold ending'))).toHaveLength(6)
    await click(byLabel(app.host, '撤销'))
    await click(byLabel(app.host, '保存到库'))
    await settle(() => app.saves.length === 2)
    expect(app.saves[1]).toEqual(app.original)
    await click(byLabel(app.host, '重做'))
    await click(byLabel(app.host, '保存到库'))
    await settle(() => app.saves.length === 3)
    expect(app.saves[2]).toEqual(replaced)
    // Bytes changed, so select a freshly inspected block rather than reusing its old target.
    await selectFirst(app.host)
    await mode('整段改写')
    await type(
      app.host,
      '段落新文字',
      'New native paragraph with repeat repeat and a different ending.',
    )
    const secondVersion = h.getVersion()
    await click(byLabel(app.host, '应用段落改写'))
    await settle(() => h.getVersion() === secondVersion + 1)
    await click(byLabel(app.host, '保存到库'))
    await settle(() => app.saves.length === 4)
    const rewritten = app.saves[3]!
    expect(
      (await readPdfNativeBlockObjects(rewritten, 0)).map((object) => object.text).join(' '),
    ).toContain('New native paragraph')
    expect(await readPdfNativeBlockObjects(rewritten, 1)).toEqual(
      await readPdfNativeBlockObjects(app.original, 1),
    )
    await click(byLabel(app.host, '撤销'))
    await click(byLabel(app.host, '保存到库'))
    await settle(() => app.saves.length === 5)
    expect(app.saves[4]).toEqual(replaced)
    await click(byLabel(app.host, '重做'))
    await click(byLabel(app.host, '保存到库'))
    await settle(() => app.saves.length === 6)
    expect(app.saves[5]).toEqual(rewritten)
    expect(
      app.hostBlocks.mock.calls.filter(([input]) => input.operation.op === 'rewrite'),
    ).toHaveLength(2)
  })
  it('selects a paragraph on the actual canvas, moves every original member once, saves and restores exact native history', async () => {
    const app = await mount(),
      h = app.handle()
    const before = await applyPdfTextBlockOperation(app.original, { op: 'read', pageIndex: 0 })
    const originalObjects = await readPdfNativeBlockObjects(app.original, 0),
      untouchedPage = await readPdfNativeBlockObjects(app.original, 1)
    await open(app.host)
    const canvas = app.host.querySelector<HTMLCanvasElement>(
      '.mimir-pdf-stage canvas.mimir-pdf-page',
    )!
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 450,
        bottom: 620,
        width: 450,
        height: 620,
      }),
    })
    const b = before.blocks.blocks[0]!
    await act(async () =>
      canvas.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          clientX: b.x + b.width / 2,
          clientY: b.y + b.height / 2,
        }),
      ),
    )
    await settle(() => !!app.host.querySelector('[aria-label="段落水平偏移（pt）"]'))
    const version = h.getVersion()
    expect(byLabel<HTMLButtonElement>(app.host, '保存到库').disabled).toBe(true)
    expect(byLabel<HTMLButtonElement>(app.host, '撤销').disabled).toBe(true)
    await type(app.host, '段落水平偏移（pt）', '17')
    await type(app.host, '段落垂直偏移（pt）', '23')
    expect(h.getVersion()).toBe(version)
    await click(byLabel(app.host, '应用段落移动'))
    await settle(() => h.getVersion() === version + 1)
    expect(moveCalls(app.hostBlocks)).toHaveLength(1)
    const request = moveCalls(app.hostBlocks)[0]![0]
    expect(request.operation).toMatchObject({ op: 'move', dx: 17, dy: 23 })
    await click(byLabel(app.host, '保存到库'))
    await settle(() => app.saves.length === 1)
    const moved = app.saves[0]!,
      objects = await readPdfNativeBlockObjects(moved, 0)
    const members = b.target!.members.map((member) => member.objectIndex)
    expect(members.length).toBeGreaterThanOrEqual(6)
    expect(objects.filter((_, index) => !members.includes(index))).toEqual(
      originalObjects.filter((_, index) => !members.includes(index)),
    )
    for (const index of members) {
      const previous = originalObjects[index]!,
        current = objects[index]!
      expect(current.text).toBe(previous.text)
      expect(current.style).toBe(previous.style)
      expect(current.resource).toBe(previous.resource)
      expect(current.matrix.slice(0, 4)).toEqual(previous.matrix.slice(0, 4))
      expect(current.matrix[4]).toBeCloseTo(previous.matrix[4] + 17, 3)
      expect(current.matrix[5]).toBeCloseTo(previous.matrix[5] - 23, 3)
    }
    expect(await readPdfNativeBlockObjects(moved, 1)).toEqual(untouchedPage)
    await click(byLabel(app.host, '撤销'))
    await settle(() => !byLabel<HTMLButtonElement>(app.host, '重做').disabled)
    expect(byLabel<HTMLButtonElement>(app.host, '撤销').disabled).toBe(true)
    await click(byLabel(app.host, '保存到库'))
    await settle(() => app.saves.length === 2)
    expect(app.saves[1]).toEqual(app.original)
    await click(byLabel(app.host, '重做'))
    await click(byLabel(app.host, '保存到库'))
    await settle(() => app.saves.length === 3)
    expect(app.saves[2]).toEqual(moved)
  })

  it('does not abort a slow accepted move merely because its own contentBusy changes', async () => {
    const gate = deferred()
    let signal: AbortSignal | undefined
    const app = await mount(async (input) => {
      if (input.operation.op === 'move') {
        signal = input.signal
        await gate.promise
      }
    })
    await open(app.host)
    await selectFirst(app.host)
    await type(app.host, '段落水平偏移（pt）', '17')
    const version = app.handle().getVersion()
    await click(byLabel(app.host, '应用段落移动'))
    await settle(() => !!signal)
    expect(signal!.aborted).toBe(false)
    expect(byLabel<HTMLButtonElement>(app.host, '应用段落移动').disabled).toBe(true)
    await act(async () => gate.resolve())
    await settle(() => app.handle().getVersion() === version + 1)
    await click(byLabel(app.host, '保存到库'))
    await settle(() => app.saves.length === 1)
    expect(await readPdfNativeBlockObjects(app.saves[0]!, 0)).not.toEqual(
      await readPdfNativeBlockObjects(app.original, 0),
    )
  })

  it.each(['escape', 'close', 'page', 'source'] as const)(
    'aborts a delayed real-host move on %s and discards its already computed bytes',
    async (cancel) => {
      const gate = deferred()
      let signal: AbortSignal | undefined
      const app = await mount(async (input) => {
        if (input.operation.op === 'move') {
          signal = input.signal
          await gate.promise
        }
      })
      await open(app.host)
      await selectFirst(app.host)
      await type(app.host, '段落水平偏移（pt）', '17')
      const version = app.handle().getVersion()
      await click(byLabel(app.host, '应用段落移动'))
      await settle(() => !!signal)
      if (cancel === 'escape')
        await act(async () =>
          byLabel(app.host, 'PDF 属性工具').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
          ),
        )
      if (cancel === 'close') await click(byLabel(app.host, '关闭原文段落面板'))
      if (cancel === 'page') await click(byLabel(app.host, '第 2 页'))
      if (cancel === 'source') await app.render('other-original-blocks')
      expect(signal!.aborted).toBe(true)
      await act(async () => gate.resolve())
      if (cancel === 'source') {
        await settle(() => app.handle()?.documentId === 'other-original-blocks')
        await click(
          [...app.host.querySelectorAll('[role="tab"]')].find(
            (node) => node.textContent === '编辑',
          )!,
        )
      }
      await settle(() => !byLabel<HTMLButtonElement>(app.host, '原文段落编辑').disabled)
      expect(app.handle().getVersion()).toBe(cancel === 'source' ? 1 : version)
      expect(byLabel<HTMLButtonElement>(app.host, '保存到库').disabled).toBe(true)
      expect(byLabel<HTMLButtonElement>(app.host, '撤销').disabled).toBe(true)
      expect(app.saves).toHaveLength(0)
    },
  )
  it('returns Escape focus to the real block tool trigger without a write or history', async () => {
    const app = await mount()
    await open(app.host)
    await selectFirst(app.host)
    await act(async () =>
      byLabel(app.host, 'PDF 属性工具').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    )
    expect(app.host.querySelector('[aria-label="原文段落编辑面板"]')).toBeNull()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('原文段落编辑')
    expect(moveCalls(app.hostBlocks)).toHaveLength(0)
    expect(byLabel<HTMLButtonElement>(app.host, '撤销').disabled).toBe(true)
  })
})
