// @vitest-environment happy-dom
import { ConfigProvider } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PDFDocument } from 'pdf-lib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfAgentHandle } from '../agent/pdf-agent.js'
import { applyPreservingPdfFormOperation } from '../../../../apps/server/src/services/pdf-preserving-forms.js'
import { readPdfFormFields } from '../../../../apps/server/src/services/pdf-forms.js'
import { applyPdfLocalOperation } from '../../../../apps/server/src/services/pdf-local.js'
vi.mock('./pdf-render.js', () => ({
  cancelPdfRender() {},
  retainPdfDocuments() {},
  renderPdfPages: async () => ({ dispose() {} }),
}))
import { PdfEditor } from './PdfEditor.js'
import { pickMenuItem } from '../shell/antd-test-dom.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const clean: Array<() => void> = []
afterEach(() => clean.splice(0).forEach((fn) => fn()))
async function settle(predicate: () => boolean) {
  const end = Date.now() + 5000
  while (!predicate() && Date.now() < end)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  expect(predicate()).toBe(true)
}
function button(host: HTMLElement, name: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
  if (!node) throw new Error(`Missing ${name}`)
  return node
}
async function click(node: Element) {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
async function tab(host: HTMLElement, name: string) {
  await click(
    Array.from(host.querySelectorAll('[role="tab"]')).find((node) => node.textContent === name)!,
  )
}
async function mount(beforeApply?: () => Promise<void>) {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage([400, 500])
  pdf.addPage([400, 500])
  page.drawText('KEEP ORIGINAL', { x: 30, y: 450, size: 12 })
  const field = pdf.getForm().createTextField('name')
  field.setText('Original value')
  field.addToPage(page, { x: 30, y: 350, width: 220, height: 40 })
  const choice = pdf.getForm().createDropdown('country')
  choice.addOptions(['China', 'Japan'])
  choice.addToPage(page, { x: 30, y: 280, width: 180, height: 30 })
  let original = (
    await applyPdfLocalOperation(await pdf.save(), {
      op: 'set_outline',
      entries: [{ title: 'Native target', page: 1 }],
    })
  ).bytes!
  original = (await applyPdfLocalOperation(original, { op: 'set_watermark', text: '内部资料' }))
    .bytes!
  const host = document.createElement('div'),
    saves: Uint8Array[] = []
  document.body.append(host)
  const root = createRoot(host)
  clean.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  let handle: PdfAgentHandle | null = null
  await act(async () =>
    root.render(
      <ConfigProvider componentSize="small">
        <PdfEditor
          documentId="pending-preserving-forms"
          io={{
            load: async () => original,
            save: async (bytes) => {
              saves.push(bytes)
            },
          }}
          onAgentHandleChange={(next) => {
            handle = next
          }}
          hostLocal={async ({ bytes, operation, expectedVersion }) => {
            const result = await applyPdfLocalOperation(bytes, operation)
            return { ...result, version: expectedVersion + (result.bytes ? 1 : 0) }
          }}
          hostForms={async ({ bytes, operation, expectedVersion, sha256 }) => {
            if (operation.op === 'apply') await beforeApply?.()
            const result = await applyPreservingPdfFormOperation(bytes, operation, sha256)
            return { ...result, version: expectedVersion + (result.bytes ? 1 : 0) }
          }}
        />
      </ConfigProvider>,
    ),
  )
  await settle(() => handle !== null)
  return { host, saves, getHandle: () => handle! }
}

describe('pending PDF page layout and preserving forms', () => {
  it('reads duplicated pending fields, fills through the inspector, and undoes/redoes one fill across saves', async () => {
    const app = await mount(),
      h = app.getHandle()
    await tab(app.host, '页面')
    pickMenuItem(app.host, '页面与版式操作', '四边各裁 20 pt')
    await click(button(app.host, '页面与版式操作'))
    await act(async () =>
      app.host
        .querySelector('.mimir-page-browser__item')!
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    )
    await settle(() => app.host.querySelector('.ant-dropdown-menu') !== null)
    await click(
      Array.from(app.host.querySelectorAll('.ant-dropdown-menu-item')).find(
        (node) => node.textContent?.trim() === '复制此页',
      )!,
    )
    const pendingVersion = h.getVersion()
    await tab(app.host, '编辑')
    await click(button(app.host, '交互表单'))
    await settle(
      () =>
        !!app.host.querySelector('textarea[aria-label="表单文字值"]') &&
        !button(app.host, '刷新表单字段').disabled,
    )
    expect(app.host.textContent).toContain('第 1、2 页')
    expect(h.getVersion()).toBe(pendingVersion)
    expect(h.getContext().dirty).toBe(true)
    expect(app.saves).toHaveLength(0)
    const input = app.host.querySelector<HTMLTextAreaElement>('textarea[aria-label="表单文字值"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        input,
        '未保存页面后填写',
      )
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(button(app.host, '应用表单字段'))
    await settle(() => !button(app.host, '刷新表单字段').disabled)
    expect(app.getHandle()).toBe(h)
    expect(h.getVersion()).toBe(pendingVersion + 1)
    expect(h.getContext().pageCount).toBe(3)
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 1)
    const first = await PDFDocument.load(app.saves[0]!)
    expect(first.getPageCount()).toBe(3)
    expect(first.getPage(0).getCropBox().width).toBe(360)
    expect(first.getForm().getTextField('name').getText()).toBe('未保存页面后填写')
    expect(first.getForm().getTextField('name').acroField.getWidgets()).toHaveLength(2)
    await click(button(app.host, '撤销'))
    await settle(
      () =>
        app.host.querySelector<HTMLTextAreaElement>('textarea[aria-label="表单文字值"]')?.value ===
        'Original value',
    )
    expect(h.getContext().pageCount).toBe(3)
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 2)
    expect((await PDFDocument.load(app.saves[1]!)).getForm().getTextField('name').getText()).toBe(
      'Original value',
    )
    expect((await PDFDocument.load(app.saves[1]!)).getPage(0).getCropBox().width).toBe(360)
    await click(button(app.host, '重做'))
    await settle(
      () =>
        app.host.querySelector<HTMLTextAreaElement>('textarea[aria-label="表单文字值"]')?.value ===
        '未保存页面后填写',
    )
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 3)
    expect((await readPdfFormFields(app.saves[2]!)).fields[0]!.value).toBe('未保存页面后填写')
    await click(button(app.host, '撤销'))
    await settle(() => !button(app.host, '刷新表单字段').disabled)
    await click(button(app.host, '撤销'))
    expect(h.getContext().pageCount).toBe(2)
  })

  it('keeps pending layout on dry-run, rejected mixed fields, and a cancelled late form response', async () => {
    let release: (() => void) | undefined,
      entered = false
    const app = await mount(async () => {
        if (!release) return
        entered = true
        await new Promise<void>((resolve) => {
          release = resolve
        })
      }),
      h = app.getHandle()
    await tab(app.host, '页面')
    pickMenuItem(app.host, '页面与版式操作', '四边各裁 10 pt')
    const version = h.getVersion()
    let result: Awaited<ReturnType<PdfAgentHandle['execute']>> | undefined
    await act(async () => {
      result = await h.execute('apply_ops', {
        ops: [{ op: 'setFormValue', value: { name: 'name', value: '预检' } }],
        dry_run: true,
      })
    })
    expect(result).toMatchObject({ ok: true, changed: false })
    expect(h.getVersion()).toBe(version)
    await act(async () => {
      result = await h.execute('apply_ops', {
        ops: [
          { op: 'setFormValue', value: { name: 'name', value: '不能部分写入' } },
          { op: 'setFormValue', value: { name: 'country', value: 'missing' } },
        ],
      })
    })
    expect(result).toMatchObject({ ok: false, changed: false })
    expect(h.getVersion()).toBe(version)
    const controller = new AbortController()
    release = () => {}
    let pending!: ReturnType<PdfAgentHandle['execute']>
    await act(async () => {
      pending = h.execute(
        'apply_ops',
        {
          ops: [{ op: 'setFormValue', value: { name: 'name', value: '迟到字段' } }],
        },
        { signal: controller.signal },
      )
    })
    await settle(() => entered)
    expect(button(app.host, '保存到库').disabled).toBe(true)
    expect(button(app.host, '保存到库').getAttribute('title')).toContain('PDF 正在处理')
    await act(async () => {
      controller.abort()
      release!()
      result = await pending
    })
    expect(result).toMatchObject({ ok: false, changed: false })
    expect(h.getVersion()).toBe(version)
    expect(app.saves).toHaveLength(0)
    expect(h.getContext().dirty).toBe(true)
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 1)
    const reopened = await PDFDocument.load(app.saves[0]!)
    expect(reopened.getPage(0).getCropBox().width).toBe(380)
    expect(reopened.getForm().getTextField('name').getText()).toBe('Original value')
    await click(button(app.host, '撤销'))
    expect(h.getContext().pageCount).toBe(2)
    expect(h.getContext().dirty).toBe(true)
  })
})
