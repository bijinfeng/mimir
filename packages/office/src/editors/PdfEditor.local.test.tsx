// @vitest-environment happy-dom
import { ConfigProvider } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfLocalInfo } from '@mimir/shared'
import type { PdfAgentHandle } from '../agent/pdf-agent.js'
import { applyPdfLocalOperation } from '../../../../apps/server/src/services/pdf-local.js'
vi.mock('./pdf-render.js', () => ({
  cancelPdfRender() {},
  retainPdfDocuments() {},
  renderPdfPages: async () => ({ dispose() {} }),
}))
import { PdfEditor } from './PdfEditor.js'
import { PdfLocalPanel } from './PdfLocalPanel.js'
import type { PdfPanelAction } from './PdfInspector.js'
import { pickMenuItem, pickSelectOption, selectValueText } from '../shell/antd-test-dom.js'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const clean: Array<() => void> = []
afterEach(() => clean.splice(0).forEach((f) => f()))
async function settle(predicate: () => boolean) {
  const end = Date.now() + 5000
  while (!predicate() && Date.now() < end)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
  expect(predicate()).toBe(true)
}
async function click(node: Element) {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 0))
  })
}
function button(host: HTMLElement, name: string) {
  const b = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
  if (!b) throw new Error(name)
  return b
}
async function mount({ form = false, save }: { form?: boolean; save?: () => Promise<void> } = {}) {
  const pdf = await PDFDocument.create()
  pdf.addPage([400, 600]).drawText('Working document')
  pdf.addPage([400, 600])
  if (form) {
    const field = pdf.getForm().createTextField('name')
    field.setText('Preserved value')
    field.addToPage(pdf.getPage(0), { x: 40, y: 400, width: 180, height: 24 })
  }
  const original = await pdf.save()
  let handle: PdfAgentHandle | null = null
  const saves: Uint8Array[] = []
  const dirty: boolean[] = []
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  clean.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await act(async () =>
    root.render(
      <ConfigProvider componentSize="small">
        <PdfEditor
          documentId="pdf-local"
          io={{
            load: async () => original,
            save: async (bytes) => {
              await save?.()
              saves.push(bytes)
            },
          }}
          hostLocal={async ({ bytes, operation, expectedVersion, assetFile }) => {
            const result = await applyPdfLocalOperation(
              bytes,
              operation,
              assetFile ? new Uint8Array(await assetFile.arrayBuffer()) : undefined,
            )
            return { ...result, version: expectedVersion + (result.bytes ? 1 : 0) }
          }}
          onAgentHandleChange={(h) => {
            handle = h
          }}
          onDirtyChange={(v) => dirty.push(v)}
        />
      </ConfigProvider>,
    ),
  )
  await settle(() => handle !== null)
  return { host, getHandle: () => handle!, saves, dirty }
}
describe('PDF local toolbar and shared history', () => {
  it('commits precise numeric drafts on Enter, cancels Escape and preserves signed large and tiny geometry', async () => {
    const geometry = {
        kind: 'arrow' as const,
        page: 1,
        x: -40163.4210526315,
        y: -33.12078947368421,
        width: 120123.456789123,
        height: 60987.654321987,
        thickness: 1.23456789123e-312,
        color: '#FF0000',
        opacity: 1,
        arrowHeadLength: 11.123456789123,
      },
      drawing = { ...geometry, id: 'derived' },
      info: PdfLocalInfo = {
        metadata: {},
        watermark: null,
        headerFooter: null,
        outline: [],
        drawings: [drawing],
      },
      onAction = vi.fn<PdfPanelAction>(async () => ({ ok: true, changed: true })),
      host = document.createElement('div'),
      root = createRoot(host)
    document.body.append(host)
    clean.push(() => {
      act(() => root.unmount())
      host.remove()
    })
    const render = async (current: PdfLocalInfo) =>
      act(async () =>
        root.render(
          <ConfigProvider componentSize="small">
            <PdfLocalPanel
              mode="drawing"
              page={1}
              pageCount={1}
              info={current}
              outputs={[]}
              busy={false}
              error={null}
              onClose={() => {}}
              onAction={onAction}
            />
          </ConfigProvider>,
        ),
      )
    await render(info)
    pickSelectOption(host, '选择绘图', '1. 箭头')
    const input = (label: string) =>
      host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
    const type = async (label: string, value: string) =>
      act(async () => {
        const node = input(label)
        node.focus()
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value)
        node.dispatchEvent(new Event('input', { bubbles: true }))
      })
    expect(input('左侧距离 pt').value).toBe('-40163.4')
    expect(Number(input('线宽 pt').value)).toBeGreaterThan(0)
    await act(async () => {
      input('左侧距离 pt').focus()
      input('左侧距离 pt').blur()
    })
    await type('高度 pt', input('高度 pt').value)
    await act(async () => input('高度 pt').blur())
    await type('宽度 pt', '120124.123456789')
    await act(async () => {
      input('宽度 pt').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await type('左侧距离 pt', '-50000.987654321')
    await act(async () => {
      input('左侧距离 pt').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
    })
    await act(async () => input('左侧距离 pt').blur())
    await type('线条颜色', '#0000FF')
    await click(
      Array.from(host.querySelectorAll('button')).find((b) => b.textContent === '应用绘图')!,
    )
    expect(onAction).toHaveBeenLastCalledWith('update_drawing', {
      id: drawing.id,
      drawing: { ...geometry, width: 120124.123456789, color: '#0000FF' },
    })
    // An unrelated refresh with the same drawing keeps a legitimate local draft.
    await render({ ...info, metadata: { title: 'Refreshed' }, drawings: [{ ...drawing }] })
    expect(input('线条颜色').value).toBe('#0000FF')
    expect(input('宽度 pt').value).toBe('120124')
    const updated = Object.assign({}, drawing, { x: -222.123456789 })
    await render({ ...info, drawings: [updated] })
    expect(input('左侧距离 pt').value).toBe('-222.123')
    // Returning A -> B -> A must not resurrect A's invalidated blue draft.
    await render(info)
    expect(input('线条颜色').value).toBe(geometry.color)
    expect(input('宽度 pt').value).toBe(String(Number(geometry.width.toPrecision(6))))
    expect(selectValueText(host, '选择绘图')).toBe('1. 箭头')
    await render({ ...info, drawings: [updated] })
    await type('线宽 pt', '1.5e-312')
    await act(async () => input('线宽 pt').blur())
    await click(
      Array.from(host.querySelectorAll('button')).find((b) => b.textContent === '应用绘图')!,
    )
    expect(onAction).toHaveBeenLastCalledWith('update_drawing', {
      id: drawing.id,
      drawing: { ...geometry, x: updated.x, thickness: 1.5e-312 },
    })
  })

  it('keeps selected drawing color synchronized through save, undo and redo when geometry is unchanged', async () => {
    const app = await mount(),
      h = app.getHandle()
    const drawing = {
      kind: 'arrow' as const,
      page: 1,
      x: 40.123456789,
      y: 60.987654321,
      width: 120,
      height: 60,
      color: '#2563EB',
      thickness: 2.2080526315789473,
      opacity: 1,
    }
    let id = ''
    await act(async () => {
      const result = await h.execute('add_drawing', { drawing })
      expect(result.ok).toBe(true)
      id = (result.data as PdfLocalInfo).drawings[0]!.id
    })
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 1)
    await click(
      Array.from(app.host.querySelectorAll('button')).find((b) => b.textContent === '页面')!,
    )
    await click(button(app.host, '页面、绘图与文档属性'))
    await click(
      Array.from(app.host.querySelectorAll('button[role="tab"]')).find(
        (b) => b.textContent === '绘图',
      )!,
    )
    pickSelectOption(app.host, '选择绘图', '1. 箭头')
    const color = () => app.host.querySelector<HTMLInputElement>('input[aria-label="线条颜色"]')!
    await settle(() => color()?.value === '#2563EB')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        color(),
        '#DC2626',
      )
      color().dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(
      Array.from(app.host.querySelectorAll('button')).find((b) => b.textContent === '应用绘图')!,
    )
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 2)
    const readSaved = async (index: number, expected: string) => {
      const saved = (await applyPdfLocalOperation(app.saves[index]!, { op: 'read' })).info!.drawings
      expect(saved).toEqual([{ ...drawing, id, color: expected }])
    }
    await readSaved(1, '#DC2626')
    await click(button(app.host, '撤销'))
    await settle(() => color()?.value === '#2563EB')
    expect(selectValueText(app.host, '选择绘图')).toBe('1. 箭头')
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 3)
    await readSaved(2, '#2563EB')
    expect(color().value).toBe('#2563EB')
    await click(button(app.host, '重做'))
    await settle(() => color()?.value === '#DC2626')
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 4)
    await readSaved(3, '#DC2626')
    expect(color().value).toBe('#DC2626')
    expect(app.getHandle()).toBe(h)
  })

  it('preserves forms through manual crop, paper, duplicate and selected-file import with two saves and history', async () => {
    const app = await mount({ form: true }),
      h = app.getHandle()
    await act(async () => {
      expect((await h.execute('set_watermark', { text: '内部资料' })).ok).toBe(true)
      expect(
        (await h.execute('set_outline', { entries: [{ title: 'First page', page: 1 }] })).ok,
      ).toBe(true)
    })
    await click(
      Array.from(app.host.querySelectorAll('button')).find((b) => b.textContent === '页面')!,
    )
    pickMenuItem(app.host, '页面与版式操作', '四边各裁 10 pt')
    await click(button(app.host, '页面与版式操作'))
    pickSelectOption(app.host, '这一页的纸型（会按比例缩放内容）', 'A5（420 × 595 pt）')
    await click(button(app.host, '页面与版式操作'))
    await act(async () =>
      app.host
        .querySelector('.mimir-page-browser__item')!
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    )
    await settle(() => app.host.querySelector('.ant-dropdown-menu') !== null)
    await click(
      Array.from(app.host.querySelectorAll('.ant-dropdown-menu-item')).find(
        (b) => b.textContent?.trim() === '复制此页',
      )!,
    )
    expect(h.getContext().pageCount).toBe(3)
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 1)
    const first = await PDFDocument.load(app.saves[0]!)
    expect(first.getPageCount()).toBe(3)
    expect(
      first.context
        .enumerateIndirectObjects()
        .filter(
          ([, object]) =>
            object instanceof PDFDict && object.lookup(PDFName.of('Type'))?.toString() === '/Page',
        ),
    ).toHaveLength(3)
    expect(first.getForm().getTextField('name').getText()).toBe('Preserved value')
    expect(first.getForm().getTextField('name').acroField.getWidgets()).toHaveLength(2)
    expect(first.getPage(0).getCropBox().width).toBeCloseTo(419.53)
    expect(first.getPage(1).getCropBox().width).toBeCloseTo(419.53)
    expect(
      (await applyPdfLocalOperation(app.saves[0]!, { op: 'read' })).info!.outline[0]!.page,
    ).toBe(1)
    // Existing file picker path inserts after the selected copy, without saving.
    const source = await PDFDocument.create()
    source.addPage([200, 300]).drawText('Imported source')
    const file = new File([new Uint8Array(await source.save())], 'source.pdf', {
      type: 'application/pdf',
    })
    const picker =
      button(app.host, '从 PDF 导入页面').querySelector('input[type="file"]') ??
      button(app.host, '从 PDF 导入页面').parentElement!.querySelector('input[type="file"]')!
    Object.defineProperty(picker, 'files', { configurable: true, value: [file] })
    await act(async () => picker.dispatchEvent(new Event('change', { bubbles: true })))
    await settle(() => h.getContext().pageCount === 4)
    expect(app.saves).toHaveLength(1)
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 2)
    const second = await PDFDocument.load(app.saves[1]!)
    expect(second.getPage(2).getCropBox().width).toBe(200)
    expect(second.getForm().getTextField('name').acroField.getWidgets()).toHaveLength(2)
    await click(button(app.host, '撤销'))
    expect(h.getContext().pageCount).toBe(3)
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 3)
    await click(button(app.host, '重做'))
    expect(h.getContext().pageCount).toBe(4)
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 4)
    expect((await PDFDocument.load(app.saves[3]!)).getPageCount()).toBe(4)
    expect(button(app.host, '保存到库').disabled).toBe(true)
  })

  it('keeps drawing identities and Inspector coordinates through pending geometry, two saves, re-edit and undo', async () => {
    const app = await mount({ form: true }),
      h = app.getHandle()
    const read = async () => {
      let info: PdfLocalInfo | undefined
      await act(async () => {
        const result = await h.execute('get_document_properties', {})
        expect(result.ok).toBe(true)
        info = result.data as PdfLocalInfo
      })
      return info!
    }
    await act(async () => {
      expect(
        (
          await h.execute('add_drawing', {
            drawing: {
              kind: 'arrow',
              page: 1,
              x: 5,
              y: 5,
              width: 120,
              height: 60,
              color: '#FF0000',
              thickness: 2,
              opacity: 1,
            },
          })
        ).ok,
      ).toBe(true)
    })
    const originalId = (await read()).drawings[0]!.id
    await click(
      Array.from(app.host.querySelectorAll('button')).find((b) => b.textContent === '页面')!,
    )
    pickMenuItem(app.host, '页面与版式操作', '四边各裁 10 pt')
    await click(button(app.host, '页面与版式操作'))
    pickSelectOption(app.host, '这一页的纸型（会按比例缩放内容）', 'A5（420 × 595 pt）')
    await click(button(app.host, '页面与版式操作'))
    await act(async () =>
      app.host
        .querySelector('.mimir-page-browser__item')!
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    )
    await settle(() => app.host.querySelector('.ant-dropdown-menu') !== null)
    await click(
      Array.from(app.host.querySelectorAll('.ant-dropdown-menu-item')).find(
        (b) => b.textContent?.trim() === '复制此页',
      )!,
    )
    const pending = await read()
    expect(pending.drawings).toHaveLength(2)
    expect(new Set(pending.drawings.map((d) => d.id)).size).toBe(2)
    expect(pending.drawings[0]!.id).toBe(originalId)
    expect(pending.drawings[0]!.y).toBeLessThan(0)
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 1)
    expect((await applyPdfLocalOperation(app.saves[0]!, { op: 'read' })).info!.drawings).toEqual(
      pending.drawings,
    )
    const { id, ...drawing } = pending.drawings[0]!
    await act(async () => {
      expect(
        (await h.execute('update_drawing', { id, drawing: { ...drawing, color: '#0000FF' } })).ok,
      ).toBe(true)
    })
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 2)
    const second = (await applyPdfLocalOperation(app.saves[1]!, { op: 'read' })).info!
    expect(second.drawings.find((d) => d.id === id)!.color).toBe('#0000FF')
    await act(async () => {
      expect(
        (
          await h.execute('apply_ops', {
            ops: [
              { op: 'rotatePages', pages: [1], dir: 90 },
              { op: 'setPageOrder', order: [3, 2, 1] },
            ],
          })
        ).ok,
      ).toBe(true)
    })
    const rotated = (await read()).drawings.find((d) => d.id === id)!
    expect(rotated.page).toBe(3)
    expect(rotated.rotation).toBe(90)
    await act(async () => {
      await h.execute('goto_page', { page: 3 })
    })
    await click(button(app.host, '页面、绘图与文档属性'))
    await click(
      Array.from(app.host.querySelectorAll('button[role="tab"]')).find(
        (b) => b.textContent === '绘图',
      )!,
    )
    pickSelectOption(app.host, '选择绘图', '1. 箭头')
    expect(selectValueText(app.host, '绘图方向')).toBe('90°')
    const x = () => app.host.querySelector<HTMLInputElement>('input[aria-label="左侧距离 pt"]')!
    expect(Number(x().value)).toBeCloseTo(rotated.x)
    await act(async () => {
      expect(
        (
          await h.execute('crop_pages', {
            pages: '3',
            left: 0.1,
            top: 0.1,
            right: 0.9,
            bottom: 0.9,
          })
        ).ok,
      ).toBe(true)
    })
    const clipped = (await read()).drawings.find((d) => d.id === id)!
    expect(clipped.x).not.toBe(rotated.x)
    expect(Number(x().value)).toBeCloseTo(clipped.x)
    // The same selected object receives the restored source after undo.
    await click(button(app.host, '撤销'))
    expect((await read()).drawings.find((d) => d.id === id)).toEqual(rotated)
    expect(Number(x().value)).toBeCloseTo(rotated.x)
    await click(button(app.host, '撤销'))
    const restored = (await read()).drawings.find((d) => d.id === id)!
    expect(restored.page).toBe(1)
    await click(button(app.host, '重做'))
    const replayed = await read()
    expect(replayed.drawings.find((d) => d.id === id)).toEqual(rotated)
    await act(async () => {
      const { id: _, ...value } = rotated
      expect(
        (await h.execute('update_drawing', { id, drawing: { ...value, thickness: 4 } })).ok,
      ).toBe(true)
    })
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 3)
    const final = (await applyPdfLocalOperation(app.saves[2]!, { op: 'read' })).info!
    expect(final.drawings.find((d) => d.id === id)!.thickness).toBe(4)
    expect((await PDFDocument.load(app.saves[2]!)).getForm().getTextField('name').getText()).toBe(
      'Preserved value',
    )
    await act(async () => {
      expect((await h.execute('delete_drawing', { id })).ok).toBe(true)
    })
    expect((await read()).drawings.map((d) => d.id)).toEqual([pending.drawings[1]!.id])
    await click(button(app.host, '撤销'))
    expect((await read()).drawings.find((d) => d.id === id)!.thickness).toBe(4)
  })

  it.each([2.2080526315789473, 1.23456789123e-12])(
    'shows concise geometry while blur and color edits retain exact cached values (stroke %s)',
    async (thickness) => {
      const app = await mount(),
        h = app.getHandle()
      const drawing = {
        kind: 'arrow' as const,
        page: 1,
        x: 40.1634210526315,
        y: 33.12078947368421,
        width: 120.123456789123,
        height: 60.987654321987,
        thickness,
        color: '#FF0000',
        opacity: 1,
        arrowHeadLength: 11.123456789123,
      }
      let id: string = ''
      await act(async () => {
        const added = await h.execute('add_drawing', { drawing: { ...drawing, thickness: 2 } })
        expect(added.ok).toBe(true)
        id = (added.data as PdfLocalInfo).drawings[0]!.id
        expect((await h.execute('update_drawing', { id, drawing })).ok).toBe(true)
      })
      await click(
        Array.from(app.host.querySelectorAll('button')).find((b) => b.textContent === '页面')!,
      )
      await click(button(app.host, '页面、绘图与文档属性'))
      await click(
        Array.from(app.host.querySelectorAll('button[role="tab"]')).find(
          (b) => b.textContent === '绘图',
        )!,
      )
      pickSelectOption(app.host, '选择绘图', '1. 箭头')
      for (const [label, value] of [
        ['左侧距离 pt', drawing.x],
        ['顶部距离 pt', drawing.y],
        ['宽度 pt', drawing.width],
        ['高度 pt', drawing.height],
        ['线宽 pt', thickness],
      ] as const) {
        const input = app.host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
        expect(input.value).toBe(String(Number(value.toPrecision(6))))
        expect(Number(input.value)).toBeGreaterThan(0)
        await act(async () => {
          input.focus()
          input.blur()
        })
        // Re-entering the visible value is also a no-op, never a precision change.
        await act(async () => {
          input.focus()
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.blur()
        })
      }
      const color = app.host.querySelector<HTMLInputElement>('input[aria-label="线条颜色"]')!
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          color,
          '#0000FF',
        )
        color.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await click(
        Array.from(app.host.querySelectorAll('button')).find((b) => b.textContent === '应用绘图')!,
      )
      await settle(() => !button(app.host, '保存到库').disabled)
      await click(button(app.host, '保存到库'))
      await settle(() => app.saves.length === 1)
      const saved = (await applyPdfLocalOperation(app.saves[0]!, { op: 'read' })).info!.drawings
      expect(saved).toEqual([{ ...drawing, color: '#0000FF', id }])
    },
  )

  it('rejects an unsupported import without publishing temporary layout bytes or consuming history', async () => {
    const app = await mount({ form: true }),
      h = app.getHandle()
    await click(
      Array.from(app.host.querySelectorAll('button')).find((b) => b.textContent === '页面')!,
    )
    pickMenuItem(app.host, '页面与版式操作', '四边各裁 10 pt')
    const version = h.getVersion()
    const source = await PDFDocument.create()
    source.addPage([200, 300])
    source
      .getForm()
      .createTextField('sourceField')
      .addToPage(source.getPage(0), { x: 20, y: 100, width: 100, height: 20 })
    const file = new File([new Uint8Array(await source.save())], 'source-form.pdf', {
      type: 'application/pdf',
    })
    const picker = button(app.host, '从 PDF 导入页面').parentElement!.querySelector(
      'input[type="file"]',
    )!
    Object.defineProperty(picker, 'files', { configurable: true, value: [file] })
    await act(async () => picker.dispatchEvent(new Event('change', { bubbles: true })))
    await settle(() => app.host.textContent!.includes('导入文件含交互表单'))
    expect(h.getVersion()).toBe(version)
    expect(h.getContext().pageCount).toBe(2)
    expect(app.saves).toHaveLength(0)
    expect(button(app.host, '保存到库').disabled).toBe(false)
    await click(button(app.host, '撤销'))
    expect(button(app.host, '保存到库').disabled).toBe(true)
  })
  it('retains pending geometry and history when persistence fails after successful materialization', async () => {
    const save = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('Storage unavailable'))
      .mockResolvedValue(undefined)
    const app = await mount({ form: true, save }),
      h = app.getHandle()
    await click(
      Array.from(app.host.querySelectorAll('button')).find((b) => b.textContent === '页面')!,
    )
    pickMenuItem(app.host, '页面与版式操作', '四边各裁 20 pt')
    const version = h.getVersion()
    await click(button(app.host, '保存到库'))
    await settle(() => app.host.textContent!.includes('Storage unavailable'))
    expect(app.saves).toHaveLength(0)
    expect(h.getVersion()).toBe(version)
    expect(app.dirty.at(-1)).toBe(true)
    expect(button(app.host, '保存到库').disabled).toBe(false)
    await click(button(app.host, '撤销'))
    expect(button(app.host, '保存到库').disabled).toBe(true)
    await click(button(app.host, '重做'))
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 1)
    const reopened = await PDFDocument.load(app.saves[0]!)
    expect(reopened.getPage(0).getCropBox().width).toBe(360)
    expect(reopened.getForm().getTextField('name').getText()).toBe('Preserved value')
    expect(button(app.host, '保存到库').disabled).toBe(true)
  })

  it('extracts pending geometry from a temporary working copy without saving or clearing dirty state', async () => {
    const app = await mount({ form: true }),
      h = app.getHandle()
    await click(
      Array.from(app.host.querySelectorAll('button')).find((b) => b.textContent === '页面')!,
    )
    pickMenuItem(app.host, '页面与版式操作', '四边各裁 20 pt')
    const version = h.getVersion()
    let result: Awaited<ReturnType<PdfAgentHandle['execute']>> | undefined
    await act(async () => {
      result = await h.execute('extract_pages', { pages: '1' })
    })
    expect(result!.ok).toBe(true)
    expect(h.getVersion()).toBe(version)
    expect(app.saves).toHaveLength(0)
    expect(button(app.host, '保存到库').disabled).toBe(false)
    const content = app.host.querySelector('.mimir-pdf-inspector__content')!
    expect(
      content
        .querySelector('.mimir-pdf-local-outputs')!
        .compareDocumentPosition(content.querySelector('.mimir-pdf-local-group')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 1)
    expect((await PDFDocument.load(app.saves[0]!)).getPage(0).getCropBox().width).toBe(360)
  })

  it('saves manual page edits after form and watermark edits, preserving native structures through history', async () => {
    const app = await mount({ form: true }),
      h = app.getHandle()
    await act(async () => {
      expect((await h.execute('set_watermark', { text: '内部资料' })).ok).toBe(true)
      expect(
        (await h.execute('set_outline', { entries: [{ title: 'First page', page: 1 }] })).ok,
      ).toBe(true)
    })
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 1)
    await act(async () => {
      await h.execute('apply_ops', { ops: [{ op: 'rotatePages', pages: [1], dir: 90 }] })
    })
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 2)
    const saved = await PDFDocument.load(app.saves[1]!)
    expect(saved.getForm().getTextField('name').getText()).toBe('Preserved value')
    expect(saved.getPage(0).getRotation().angle).toBe(90)
    const read = await applyPdfLocalOperation(app.saves[1]!, { op: 'read' })
    expect(read.info!.watermark!.text).toBe('内部资料')
    expect(read.info!.outline).toEqual([{ title: 'First page', page: 1, level: 0 }])
    await click(button(app.host, '撤销'))
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 3)
    expect((await PDFDocument.load(app.saves[2]!)).getPage(0).getRotation().angle).toBe(0)
    await click(button(app.host, '重做'))
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 4)
    expect((await PDFDocument.load(app.saves[3]!)).getPage(0).getRotation().angle).toBe(90)
  })

  it('refreshes Inspector bookmarks from pending layout and restores them on undo without saving', async () => {
    const app = await mount(),
      h = app.getHandle()
    await act(async () => {
      expect((await h.execute('set_outline', { entries: [{ title: 'Target', page: 1 }] })).ok).toBe(
        true,
      )
    })
    await click(
      Array.from(app.host.querySelectorAll('button')).find((b) => b.textContent === '页面')!,
    )
    await click(button(app.host, '页面、绘图与文档属性'))
    await click(
      Array.from(app.host.querySelectorAll('button[role="tab"]')).find(
        (b) => b.textContent === '文档属性',
      )!,
    )
    const outline = () =>
      app.host.querySelector<HTMLTextAreaElement>('textarea[aria-label="书签目录"]')!
    await settle(() => outline()?.value === '1 | Target')
    pickMenuItem(app.host, '页面与版式操作', '整份倒序（第一页与最后一页互换）')
    await settle(() => outline()?.value === '2 | Target')
    expect(app.saves).toHaveLength(0)
    await click(button(app.host, '撤销'))
    await settle(() => outline()?.value === '1 | Target')
  })
  it('keeps actual Inspector metadata after a local dry run returns hypothetical properties', async () => {
    const app = await mount(),
      h = app.getHandle()
    await act(async () => {
      await h.execute('set_metadata', { metadata: { title: 'Actual title' } })
    })
    await click(
      Array.from(app.host.querySelectorAll('button')).find((b) => b.textContent === '页面')!,
    )
    await click(button(app.host, '页面、绘图与文档属性'))
    await click(
      Array.from(app.host.querySelectorAll('button[role="tab"]')).find(
        (b) => b.textContent === '文档属性',
      )!,
    )
    const title = () => app.host.querySelector<HTMLInputElement>('input[aria-label="标题"]')!
    await settle(() => title()?.value === 'Actual title')
    const version = h.getVersion()
    await act(async () => {
      const result = await h.execute('apply_ops', {
        ops: [{ op: 'setMetadata', metadata: { title: 'Hypothetical title' } }],
        dry_run: true,
      })
      expect(result).toMatchObject({ ok: true, changed: false })
    })
    expect(h.getVersion()).toBe(version)
    expect(title().value).toBe('Actual title')
    expect(app.saves).toHaveLength(0)
  })

  it('refreshes current properties after keyboard undo/redo and leaves input undo native', async () => {
    const app = await mount(),
      h = app.getHandle()
    await act(async () => {
      await h.execute('set_metadata', { metadata: { title: 'First' } })
    })
    const tab = Array.from(app.host.querySelectorAll('button')).find(
      (b) => b.textContent === '页面',
    )!
    await click(tab)
    await click(button(app.host, '页面、绘图与文档属性'))
    await click(
      Array.from(app.host.querySelectorAll('button[role="tab"]')).find(
        (b) => b.textContent === '文档属性',
      )!,
    )
    const title = () => app.host.querySelector<HTMLInputElement>('input[aria-label="标题"]')!
    await settle(() => title()?.value === 'First')
    const nativeUndo = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    await act(async () => title().dispatchEvent(nativeUndo))
    expect(nativeUndo.defaultPrevented).toBe(false)
    const undo = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    await act(async () => button(app.host, '撤销').dispatchEvent(undo))
    expect(undo.defaultPrevented).toBe(true)
    await settle(() => title()?.value === '')
    await act(async () =>
      button(app.host, '重做').dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'z',
          metaKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    )
    await settle(() => title()?.value === 'First')
    expect(app.getHandle()).toBe(h)
  })
  it('records Agent byte changes, undo/redo and saving baseline without removing earlier edits', async () => {
    const app = await mount(),
      h = app.getHandle()
    const initial = h.getVersion()
    await act(async () => {
      expect(
        (await h.execute('set_metadata', { metadata: { title: 'First' } }, { roundId: 'r' })).ok,
      ).toBe(true)
    })
    await settle(() => !button(app.host, '撤销').disabled)
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 1)
    expect((await PDFDocument.load(app.saves[0]!)).getTitle()).toBe('First')
    await click(button(app.host, '撤销'))
    await settle(() => !button(app.host, '重做').disabled)
    expect(button(app.host, '保存到库').disabled).toBe(false)
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 2)
    expect((await PDFDocument.load(app.saves[1]!)).getTitle()).not.toBe('First')
    await click(button(app.host, '重做'))
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 3)
    expect((await PDFDocument.load(app.saves[2]!)).getTitle()).toBe('First')
    expect(h.getVersion()).toBeGreaterThan(initial + 2)
    expect(app.getHandle()).toBe(h)
  })
  it('opens compact Inspector and produces extract output without changing canvas version', async () => {
    const app = await mount()
    const tab = Array.from(app.host.querySelectorAll('button')).find(
      (b) => b.textContent === '页面',
    )!
    await click(tab)
    await click(button(app.host, '页面、绘图与文档属性'))
    await settle(() => app.host.querySelector('[aria-label="PDF 文档工具面板"]') !== null)
    const v = app.getHandle().getVersion()
    const extract = Array.from(app.host.querySelectorAll('button')).find(
      (b) => b.textContent === '抽取为新 PDF',
    )!
    await click(extract)
    await settle(() => app.host.textContent!.includes('extracted-pages.pdf'))
    expect(app.getHandle().getVersion()).toBe(v)
    expect(app.saves).toHaveLength(0)
    const panel = app.host.querySelector('.mimir-pdf-inspector')!
    await act(async () =>
      panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    )
    expect(app.host.querySelector('.mimir-pdf-inspector')).toBeNull()
  })
  it('interleaves existing page operations with local content and invalidates redo on a new manual edit', async () => {
    const app = await mount(),
      h = app.getHandle()
    await act(async () => {
      expect(
        (await h.execute('apply_ops', { ops: [{ op: 'rotatePages', pages: [1], dir: 90 }] })).ok,
      ).toBe(true)
    })
    await settle(() => !button(app.host, '撤销').disabled)
    await click(button(app.host, '撤销'))
    expect(h.getContext().pageRotations).toEqual([0, 0])
    await act(async () => {
      expect(
        (await h.execute('set_metadata', { metadata: { author: 'admin' } }, { manual: true })).ok,
      ).toBe(true)
    })
    expect(button(app.host, '重做').disabled).toBe(true)
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 1)
    expect((await PDFDocument.load(app.saves[0]!)).getAuthor()).toBe('admin')
  })
  it('cancels an Agent file request on Escape and on stop without writing bytes', async () => {
    const app = await mount(),
      h = app.getHandle()
    let result: Awaited<ReturnType<PdfAgentHandle['execute']>> | undefined
    await act(async () => {
      void h.execute('replace_pages', { pages: '1' }).then((r) => {
        result = r
      })
    })
    await settle(() => app.host.querySelector('[aria-label="选择 PDF 来源文件"]') !== null)
    expect(button(app.host, '选择来源 PDF 文件').textContent).toContain('选择来源 PDF')
    await act(async () =>
      app.host
        .querySelector('.mimir-pdf-inspector')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    )
    await settle(() => result !== undefined)
    expect(result!.ok).toBe(false)
    expect(result!.changed).toBe(false)
    expect(app.saves).toHaveLength(0)
    const controller = new AbortController()
    result = undefined
    await act(async () => {
      void h.execute('import_pages', { after_page: 0 }, { signal: controller.signal }).then((r) => {
        result = r
      })
    })
    await settle(() => app.host.querySelector('[aria-label="选择 PDF 来源文件"]') !== null)
    await act(async () => controller.abort())
    await settle(() => result !== undefined)
    expect(result!.ok).toBe(false)
    expect(h.getVersion()).toBe(1)
  })
  it('treats save as a history rebase so one undo reverses a saved page rotation', async () => {
    const app = await mount(),
      h = app.getHandle()
    await act(async () => {
      await h.execute('apply_ops', { ops: [{ op: 'rotatePages', pages: [1], dir: 90 }] })
    })
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 1)
    expect((await PDFDocument.load(app.saves[0]!)).getPage(0).getRotation().angle).toBe(90)
    await click(button(app.host, '撤销'))
    expect(h.getContext().pageRotations).toEqual([0, 0])
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 2)
    expect((await PDFDocument.load(app.saves[1]!)).getPage(0).getRotation().angle).toBe(0)
  })
})
