/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import { XlsxShapeGallery, type XlsxShapeGalleryProps } from './XlsxShapeGallery.js'
import { XlsxEditor } from './XlsxEditor.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import { readXlsx } from '../xlsx.js'
import { applyXlsxObjectOperation } from '../../../../apps/server/src/services/xlsx-agent-objects.js'
import { workbookOperationSchema } from '../../vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'
import type { XlsxAgentHandle, XlsxHostApply } from '../agent/xlsx-agent.js'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((dispose) => dispose()))
const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
async function wait(ready: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (ready()) return
    await tick()
  }
  expect(ready()).toBe(true)
}
function button(host: HTMLElement, label: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!found) throw new Error(`Missing ${label}`)
  return found
}
const click = (host: HTMLElement, label: string) => act(() => button(host, label).click())
function type(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[aria-label="${label}"]`,
  )!
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value)
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })))
}
function tab(host: HTMLElement, name: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (item) => item.textContent?.trim() === name,
  )
  if (!found) throw new Error(`Missing tab ${name}`)
  act(() => found.click())
}
function mountGallery(initial: Partial<XlsxShapeGalleryProps> = {}) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div'),
    root = createRoot(host),
    execute = vi.fn<XlsxShapeGalleryProps['onOperation']>().mockResolvedValue(true),
    props: XlsxShapeGalleryProps = {
      range: 'E2:G5',
      sourceKey: {},
      contextKey: 'document/sheet',
      busy: false,
      onOperation: execute,
      ...initial,
    }
  document.body.append(host)
  const render = (next = props) =>
    act(() =>
      root.render(
        <ConfigProvider componentSize="small">
          <XlsxShapeGallery {...next} />
        </ConfigProvider>,
      ),
    )
  render()
  let live = true
  const dispose = () => {
    if (!live) return
    live = false
    act(() => root.unmount())
    host.remove()
  }
  cleanups.push(dispose)
  return { host, execute, props, render, dispose }
}

it('offers every native shape, searches and groups with a persistent selection, and inserts only on the fixed action', async () => {
  const { host, execute } = mountGallery()
  expect(host.querySelectorAll('[role="radio"]')).toHaveLength(105)
  expect(host.querySelectorAll('[role="radio"][tabindex="0"]')).toHaveLength(1)
  type(host, '搜索形状', 'CLOUD')
  expect(host.querySelectorAll('[role="radio"]')).toHaveLength(2)
  click(host, '云形标注')
  expect(execute).not.toHaveBeenCalled()
  expect(host.querySelector('.mimir-xlsx-shapes__selection')?.textContent).toContain('云形标注')
  pickSelectOption(host, '形状分组', '箭头')
  expect(host.textContent).toContain('没有匹配的形状')
  expect(host.querySelector('.mimir-xlsx-shapes__selection')?.textContent).toContain('云形标注')
  type(host, '形状文字', '保留 & <文字>')
  type(host, '左上角单元格', 'h8')
  click(host, '插入形状')
  await tick()
  expect(execute).toHaveBeenCalledOnce()
  expect(execute.mock.calls[0]![0]).toEqual({
    op: 'add_shape',
    shapeType: 'cloudCallout',
    anchorCell: 'H8',
    text: '保留 & <文字>',
    fillColor: '#4472C4',
  })
  expect(execute.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal)
  expect(host.querySelector('.mimir-xlsx-shapes__footer [role="status"]')?.textContent).toContain(
    '已插入云形标注',
  )
  expect(button(host, '插入形状').closest('.mimir-xlsx-shapes__body')).toBeNull()
})

it('uses one keyboard stop with arrows/Home/End and disables compound controls while pending without cancelling itself', async () => {
  let finish!: (ok: boolean) => void
  const execute = vi.fn<XlsxShapeGalleryProps['onOperation']>(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const ui = mountGallery({ onOperation: execute }),
    { host } = ui
  const first = host.querySelector<HTMLButtonElement>('[role="radio"][tabindex="0"]')!
  act(() => {
    first.focus()
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
  })
  expect(button(host, '云形标注').getAttribute('aria-checked')).toBe('true')
  expect(document.activeElement).toBe(button(host, '云形标注'))
  act(() =>
    button(host, '云形标注').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
    ),
  )
  expect(button(host, '文本框').getAttribute('aria-checked')).toBe('true')
  click(host, '插入形状')
  click(host, '插入形状')
  expect(execute).toHaveBeenCalledOnce()
  ui.render({ ...ui.props, busy: true })
  expect(execute.mock.calls[0]![1].signal.aborted).toBe(false)
  expect(host.querySelector('.ant-select-disabled')).not.toBeNull()
  expect(
    [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].every((item) => item.disabled),
  ).toBe(true)
  await act(async () => finish(false))
  ui.render(ui.props)
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('设置已保留')
  click(host, '插入形状')
  expect(execute.mock.calls[1]![0]).toEqual(execute.mock.calls[0]![0])
  await act(async () => finish(true))
})

it.each(['source', 'context', 'unmount'])(
  'aborts %s changes and rejects late success',
  async (mode) => {
    let finish!: (ok: boolean) => void
    const execute = vi.fn<XlsxShapeGalleryProps['onOperation']>(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const ui = mountGallery({ onOperation: execute })
    click(ui.host, '心形')
    type(ui.host, '形状文字', '旧草稿')
    click(ui.host, '插入形状')
    if (mode === 'unmount') ui.dispose()
    else
      ui.render({
        ...ui.props,
        ...(mode === 'source' ? { sourceKey: {} } : { contextKey: 'new/sheet', range: 'J5' }),
      })
    expect(execute.mock.calls[0]![1].signal.aborted).toBe(true)
    await act(async () => finish(true))
    expect(ui.host.textContent).not.toContain('已插入心形')
    expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="形状文字"]')?.value).toBe(
      mode === 'source' ? '旧草稿' : mode === 'context' ? '' : undefined,
    )
    expect(ui.host.querySelector<HTMLInputElement>('[aria-label="左上角单元格"]')?.value).toBe(
      mode === 'source' ? 'E2' : mode === 'context' ? 'J5' : undefined,
    )
  },
)

async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes),
    result: Record<string, Uint8Array> = {}
  for (const [path, entry] of Object.entries(zip.files))
    if (!entry.dir) result[path] = await entry.async('uint8array')
  return result
}
async function mountEditor(hostApply: XlsxHostApply) {
  const bytes = new Uint8Array(
      readFileSync(
        join(
          import.meta.dirname,
          '../../vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
        ),
      ),
    ),
    host = document.createElement('div'),
    root = createRoot(host),
    saved: Uint8Array[] = []
  let handle: XlsxAgentHandle | null = null
  document.body.append(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  act(() =>
    root.render(
      <XlsxEditor
        documentId="xlsx-shape-test"
        io={{
          load: async () => bytes,
          save: async (next) => {
            saved.push(next.slice())
          },
        }}
        hostApply={hostApply}
        onAgentHandleChange={(next) => {
          handle = next
        }}
      />,
    ),
  )
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await wait(() => !!handle && !!host.querySelector('.mimir-xlsx'))
  tab(host, '插入')
  click(host, '图表、形状与结构化表')
  tab(host, '形状')
  return { host, bytes, saved, handle: () => handle! }
}
const realApply: XlsxHostApply = async ({ bytes, ops, expectedVersion }) => {
  expect(ops).toHaveLength(1)
  return applyXlsxObjectOperation(bytes, workbookOperationSchema.parse(ops[0]), expectedVersion)
}
it('real editor inserts one native shape with a slow host, saves twice, and restores every ZIP part on undo/save/redo/save', async () => {
  let finish!: () => void
  const execute = vi.fn<XlsxHostApply>(async (input) => {
      const result = await realApply(input)
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      return result
    }),
    ui = await mountEditor(execute),
    { host } = ui
  type(host, '搜索形状', 'heart')
  click(host, '心形')
  type(host, '左上角单元格', 'F2')
  type(host, '形状文字', '原生心形 & <保留>')
  click(host, '插入形状')
  await wait(() => !!finish)
  expect(execute.mock.calls[0]![0].signal?.aborted).toBe(false)
  expect(ui.handle().history().undo).toBe(0)
  await act(async () => finish())
  await wait(() => ui.handle().history().undo === 1)
  expect(execute).toHaveBeenCalledOnce()
  expect(ui.handle().getVersion()).toBe(1)
  expect(host.querySelector('.mimir-xlsx-object__shape path')?.getAttribute('d')).toContain('C')
  const workbook = await readXlsx(ui.handle().currentBytes()),
    visual = workbook.sheets[0]!.visuals![0]!
  expect(visual.shapeType).toBe('heart')
  expect(visual.text).toBe('原生心形 & <保留>')
  expect(visual.anchor.fromColumn).toBe(5)
  click(host, '保存到库')
  await wait(() => ui.saved.length === 1 && !ui.handle().isDirty())
  const first = ui.saved[0]!,
    before = await entries(ui.bytes)
  expect(new TextDecoder().decode((await entries(first))[visual.drawingPath])).toContain(
    'prst="heart"',
  )
  // A second insertion after saving must retain the first native drawing and history.
  type(host, '搜索形状', 'cloudCallout')
  click(host, '云形标注')
  type(host, '左上角单元格', 'K3')
  type(host, '形状文字', '第二个形状')
  const previousFinish = finish
  click(host, '插入形状')
  await wait(() => finish !== previousFinish)
  expect(execute.mock.calls[1]![0].signal?.aborted).toBe(false)
  await act(async () => finish())
  await wait(() => ui.handle().history().undo === 2)
  click(host, '保存到库')
  await wait(() => ui.saved.length === 2 && !ui.handle().isDirty())
  const second = ui.saved[1]!
  expect((await readXlsx(second)).sheets[0]!.visuals?.map((item) => item.shapeType)).toEqual([
    'heart',
    'cloudCallout',
  ])
  await act(async () => {
    expect(await ui.handle().undo()).toBe(true)
  })
  click(host, '保存到库')
  await wait(() => ui.saved.length === 3 && !ui.handle().isDirty())
  expect(await entries(ui.saved[2]!)).toEqual(await entries(first))
  await act(async () => {
    expect(await ui.handle().undo()).toBe(true)
  })
  click(host, '保存到库')
  await wait(() => ui.saved.length === 4 && !ui.handle().isDirty())
  expect(await entries(ui.saved[3]!)).toEqual(before)
  await act(async () => {
    expect(await ui.handle().redo()).toBe(true)
  })
  click(host, '保存到库')
  await wait(() => ui.saved.length === 5 && !ui.handle().isDirty())
  expect(await entries(ui.saved[4]!)).toEqual(await entries(first))
  await act(async () => {
    expect(await ui.handle().redo()).toBe(true)
  })
  click(host, '保存到库')
  await wait(() => ui.saved.length === 6 && !ui.handle().isDirty())
  expect(await entries(ui.saved[5]!)).toEqual(await entries(second))
})

it.each(['关闭工作表对象面板', 'Escape', '切换类型'])(
  'real editor rejects delayed native bytes after %s',
  async (action) => {
    let finish!: () => void
    const execute = vi.fn<XlsxHostApply>(async (input) => {
        const result = await realApply(input)
        await new Promise<void>((resolve) => {
          finish = resolve
        })
        return result
      }),
      ui = await mountEditor(execute)
    click(ui.host, '心形')
    type(ui.host, '左上角单元格', 'F2')
    click(ui.host, '插入形状')
    await wait(() => !!finish)
    if (action === 'Escape')
      act(() =>
        ui.host
          .querySelector('aside')!
          .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
      )
    else if (action === '切换类型') tab(ui.host, '图表')
    else click(ui.host, action)
    expect(execute.mock.calls[0]![0].signal?.aborted).toBe(true)
    await act(async () => finish())
    await tick()
    expect(ui.handle().getVersion()).toBe(0)
    expect(ui.handle().history().undo).toBe(0)
    expect(ui.handle().currentBytes()).toEqual(ui.bytes)
    expect(ui.handle().isDirty()).toBe(false)
  },
)
