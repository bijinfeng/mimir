// @vitest-environment happy-dom
import { ConfigProvider } from 'antd'
import { act, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfAgentHandle } from '../agent/pdf-agent.js'
import { openSelect } from '../shell/antd-test-dom.js'
vi.mock('./pdf-render.js', () => ({
  retainPdfDocument: () => () => {},
  awaitPdfTask: <T,>(task: Promise<T>) => task,
  loadPdfDocument: vi.fn<typeof import('./pdf-render.js').loadPdfDocument>(),
  cancelPdfRender() {},
  retainPdfDocuments() {},
  renderPdfPages: async () => ({ dispose() {} }),
}))
import { PdfFormPanel } from './PdfFormPanel.js'
import { PdfInspector } from './PdfInspector.js'
import { PdfEditor } from './PdfEditor.js'
import { CompactToolbar } from './CompactToolbar.js'
import {
  applyPdfFormOperation,
  readPdfFormFields,
} from '../../../../apps/server/src/services/pdf-forms.js'
const cleanup: Array<() => void> = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
})
async function settle(predicate: () => boolean) {
  const deadline = Date.now() + 5000
  while (!predicate() && Date.now() < deadline)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  expect(predicate()).toBe(true)
}
function button(host: HTMLElement, label: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!found) throw new Error(`Missing ${label}`)
  return found
}
async function click(node: Element) {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function CollapsedPdfInspectorHarness() {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  return (
    <div className="mimir-editor" style={{ width: 420 }}>
      <CompactToolbar
        sections={[
          { key: 'editing', label: '编辑', minWidth: 0, content: <button>编辑文字</button> },
          {
            key: 'forms',
            label: '表单',
            minWidth: 0,
            content: (
              <button ref={trigger} aria-label="交互表单" onClick={() => setOpen(true)}>
                交互表单
              </button>
            ),
          },
        ]}
      />
      {open && (
        <PdfInspector
          triggerRef={trigger}
          fallbackSectionKey="forms"
          onClose={() => setOpen(false)}
        >
          <textarea aria-label="表单文字" />
          <button onClick={() => setOpen(false)}>关闭表单</button>
        </PdfInspector>
      )}
    </div>
  )
}

describe('PDF real form toolbar and Agent', () => {
  it.each([
    ['表单', '交互表单', 'PDF 表单面板'],
    ['批注', '便笺与标注', 'PDF 批注面板'],
  ])(
    'closes the collapsed %s menu before opening its actual Editor inspector',
    async (group, command, panelLabel) => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        return DOMRect.fromRect({
          width: this.classList.contains('mimir-compact-toolbar__commands')
            ? 100
            : this.dataset.sectionKey
              ? this.hasAttribute('data-collapsed')
                ? 72
                : 150
              : 100,
          height: 56,
        })
      })
      const pdf = await PDFDocument.create()
      pdf.addPage([400, 600])
      const original = await pdf.save(),
        host = document.createElement('div'),
        root = createRoot(host)
      document.body.append(host)
      let handle: PdfAgentHandle | null = null
      cleanup.push(() => {
        act(() => root.unmount())
        host.remove()
        vi.restoreAllMocks()
      })
      await act(async () =>
        root.render(
          <PdfEditor
            documentId="collapsed-pdf-tools"
            io={{ load: async () => original, save: async () => {} }}
            onAgentHandleChange={(value) => {
              handle = value
            }}
            hostForms={async ({ expectedVersion }) => ({
              forms: { sha256: '', fields: [] },
              version: expectedVersion,
            })}
            hostAnnotations={async ({ expectedVersion }) => ({
              annotations: { sha256: '', annotations: [] },
              version: expectedVersion,
            })}
          />,
        ),
      )
      await settle(() => handle !== null)
      await click(
        [...host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === '编辑')!,
      )
      await click(button(host, group))
      await settle(() => !!host.querySelector('[role="menu"]'))
      await click(button(host, command))
      await settle(() => !!host.querySelector(`[aria-label="${panelLabel}"]`))
      expect(host.querySelector('[role="menu"]')).toBeNull()
      await settle(() => !button(host, group).disabled)
      await act(async () =>
        host
          .querySelector('[aria-label="PDF 属性工具"]')!
          .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
      )
      expect(document.activeElement).toBe(button(host, group))
    },
  )
  it.each(['escape', 'close'])(
    'returns focus to a collapsed named group after %s closes the inspector',
    async (action) => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        const width = this.classList.contains('mimir-compact-toolbar__commands')
          ? 300
          : this.dataset.sectionKey
            ? this.hasAttribute('data-collapsed')
              ? 72
              : 200
            : 100
        return DOMRect.fromRect({ width, height: 56 })
      })
      const host = document.createElement('div')
      document.body.append(host)
      const root = createRoot(host)
      cleanup.push(() => {
        act(() => root.unmount())
        host.remove()
        vi.restoreAllMocks()
      })
      await act(async () => root.render(<CollapsedPdfInspectorHarness />))
      expect(host.querySelector('[data-section-key="forms"]')?.hasAttribute('data-collapsed')).toBe(
        true,
      )
      await click(button(host, '表单'))
      await click(button(host, '交互表单'))
      await act(async () =>
        host
          .querySelector('textarea')!
          .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })),
      )
      await settle(() => host.querySelector('[aria-label="交互表单"]') === null)
      host.querySelector('textarea')!.focus()
      if (action === 'escape')
        await act(async () =>
          host
            .querySelector('textarea')!
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
        )
      else
        await click(
          Array.from(host.querySelectorAll('button')).find((b) => b.textContent === '关闭表单')!,
        )
      expect(document.activeElement).toBe(button(host, '表单'))
    },
  )
  it('does not steal external focus during inspector cleanup and respects consumed Escape', async () => {
    const host = document.createElement('div')
    const trigger = document.createElement('button')
    const other = document.createElement('button')
    document.body.append(host, trigger, other)
    const root = createRoot(host)
    cleanup.push(() => {
      act(() => root.unmount())
      host.remove()
      trigger.remove()
      other.remove()
    })
    const onClose = vi.fn<() => void>()
    await act(async () =>
      root.render(
        <PdfInspector triggerRef={{ current: trigger }} onClose={onClose}>
          <input aria-label="nested control" onKeyDown={(event) => event.preventDefault()} />
        </PdfInspector>,
      ),
    )
    await act(async () => {
      host
        .querySelector('input')!
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        )
    })
    expect(onClose).not.toHaveBeenCalled()
    other.focus()
    await act(async () => root.render(null))
    expect(document.activeElement).toBe(other)
  })
  it.each([
    ['escape', 'none'],
    ['escape', 'other'],
    ['escape', 'blurred'],
    ['close', 'none'],
    ['close', 'other'],
    ['close', 'blurred'],
  ])(
    'restores a pending inspector closed with %s without stealing focus (user moved: %s)',
    async (closeMethod, moveFocus) => {
      const pdf = await PDFDocument.create()
      pdf.addPage([400, 500])
      const original = await pdf.save()
      let release!: () => void
      const pendingRead = new Promise<void>((resolve) => {
        release = resolve
      })
      const host = document.createElement('div')
      const other = document.createElement('button')
      document.body.append(host, other)
      const root = createRoot(host)
      cleanup.push(() => {
        act(() => root.unmount())
        host.remove()
        other.remove()
      })
      let handle: PdfAgentHandle | null = null
      await act(async () =>
        root.render(
          <PdfEditor
            documentId="pending-forms"
            io={{ load: async () => original, save: async () => {} }}
            onAgentHandleChange={(value) => {
              handle = value
            }}
            hostForms={async ({ sha256, expectedVersion }) => {
              await pendingRead
              return { forms: { sha256: sha256 ?? '', fields: [] }, version: expectedVersion }
            }}
          />,
        ),
      )
      await settle(() => handle !== null)
      await click(
        [...host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === '编辑')!,
      )
      await click(button(host, '交互表单'))
      expect(button(host, '交互表单').disabled).toBe(true)
      if (closeMethod === 'close') await click(button(host, '关闭表单面板'))
      else
        await act(async () => {
          host
            .querySelector('[aria-label="PDF 属性工具"]')!
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        })
      expect(host.querySelector('[aria-label="PDF 属性工具"]')).toBeNull()
      // Real browsers cannot focus a disabled button; keep the same starting state
      // in DOM implementations that allow it.
      ;(document.activeElement as HTMLElement)?.blur()
      if (moveFocus !== 'none') other.focus()
      if (moveFocus === 'blurred') other.blur()
      await act(async () => {
        release()
        await pendingRead
      })
      await settle(() => !button(host, '交互表单').disabled)
      expect(document.activeElement).toBe(
        moveFocus === 'other'
          ? other
          : moveFocus === 'blurred'
            ? document.body
            : button(host, '交互表单'),
      )
    },
  )
  it('keeps Escape reachable when an open inspector refresh disables its focused button', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([400, 500])
    const original = await pdf.save()
    let release!: () => void
    const pendingRead = new Promise<void>((resolve) => {
      release = resolve
    })
    let reads = 0
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    cleanup.push(() => {
      act(() => root.unmount())
      host.remove()
    })
    let handle: PdfAgentHandle | null = null
    await act(async () =>
      root.render(
        <PdfEditor
          documentId="refresh-forms"
          io={{ load: async () => original, save: async () => {} }}
          onAgentHandleChange={(value) => {
            handle = value
          }}
          hostForms={async ({ sha256, expectedVersion }) => {
            if (++reads > 1) await pendingRead
            return { forms: { sha256: sha256 ?? '', fields: [] }, version: expectedVersion }
          }}
        />,
      ),
    )
    await settle(() => handle !== null)
    await click(
      [...host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === '编辑')!,
    )
    await click(button(host, '交互表单'))
    await settle(() => !button(host, '刷新表单字段').disabled)
    button(host, '刷新表单字段').focus()
    await click(button(host, '刷新表单字段'))
    expect(button(host, '刷新表单字段').disabled).toBe(true)
    expect(document.activeElement).toBe(host.querySelector('[aria-label="PDF 属性工具"]'))
    await act(async () => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
    })
    expect(host.querySelector('[aria-label="PDF 属性工具"]')).toBeNull()
    await act(async () => {
      release()
      await pendingRead
    })
    await settle(() => !button(host, '交互表单').disabled)
    expect(document.activeElement).toBe(button(host, '交互表单'))
  })
  it('uses typed controls and Agent on the same byte handle, previews dry runs, undoes a mixed batch and saves twice', async () => {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([400, 500])
    page.drawText('ORIGINAL', {
      font: await pdf.embedFont(StandardFonts.Helvetica),
      x: 20,
      y: 460,
      size: 12,
    })
    pdf.addPage([400, 500])
    pdf.getForm().createTextField('name').addToPage(page, { x: 30, y: 350, width: 250, height: 50 })
    pdf.getForm().createCheckBox('agree').addToPage(page, { x: 30, y: 300, width: 20, height: 20 })
    const original = await pdf.save()
    const saves: Uint8Array[] = []
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
            documentId="pdf-forms"
            io={{
              load: async () => original,
              save: async (bytes) => {
                saves.push(bytes)
              },
            }}
            onAgentHandleChange={(value) => {
              handle = value
            }}
            hostForms={async ({ bytes, expectedVersion, operation, sha256 }) => {
              const result = await applyPdfFormOperation(bytes, operation, sha256)
              return { ...result, version: expectedVersion + (result.bytes ? 1 : 0) }
            }}
          />
        </ConfigProvider>,
      ),
    )
    cleanup.push(() => {
      act(() => root.unmount())
      host.remove()
    })
    await settle(() => handle !== null)
    const initial = handle!
    await click(
      [...host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === '编辑')!,
    )
    await click(button(host, '交互表单'))
    await settle(() => !button(host, '刷新表单字段').disabled)
    await click(openSelect(host, '选择表单字段').find((option) => option.textContent === 'name')!)
    expect(button(host, '应用表单字段').disabled).toBe(true)
    const inspector = host.querySelector('[aria-label="PDF 属性工具"]')!
    expect(inspector.closest('.mimir-editor__subbar')).toBeNull()
    expect(inspector.textContent).toContain('2 个字段')
    const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="表单文字值"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        input,
        '中文姓名',
      )
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(button(host, '应用表单字段'))
    await settle(() => !button(host, '刷新表单字段').disabled)
    expect(button(host, '应用表单字段').disabled).toBe(true)
    expect(handle).toBe(initial)
    expect(handle!.getContext().dirty).toBe(true)
    expect((await handle!.execute('list_form_fields', {})).data).toMatchObject({
      fields: [{ name: 'name', value: '中文姓名' }, { name: 'agree' }],
    })
    await click(button(host, '保存到库'))
    await settle(() => saves.length === 1)
    const version = handle!.getVersion()
    let result: Awaited<ReturnType<PdfAgentHandle['execute']>> | undefined
    await act(async () => {
      result = await handle!.execute('apply_ops', {
        ops: [{ op: 'setFormValue', value: { name: 'name', value: '预检' } }],
        dry_run: true,
      })
    })
    expect(result).toMatchObject({ ok: true, changed: false })
    expect(handle!.getVersion()).toBe(version)
    expect(handle!.getContext().dirty).toBe(false)
    await act(async () => {
      result = await handle!.execute(
        'apply_ops',
        {
          ops: [
            { op: 'setFormValue', value: { name: 'name', value: '回退测试' } },
            { op: 'rotatePages', pages: [1], dir: 90 },
          ],
        },
        { roundId: 'forms-round' },
      )
    })
    expect(result).toMatchObject({ ok: true, changed: true })
    expect(handle!.getContext().pageRotations).toEqual([90, 0])
    act(() => {
      expect(handle!.undoRound('forms-round')).toBe(true)
    })
    expect((await handle!.execute('list_form_fields', {})).data).toMatchObject({
      fields: [{ name: 'name', value: '中文姓名' }, { name: 'agree' }],
    })
    await click(button(host, '刷新表单字段'))
    await settle(() => !button(host, '刷新表单字段').disabled)
    await click(openSelect(host, '选择表单字段').find((option) => option.textContent === 'agree')!)
    await click(host.querySelector('input[aria-label="表单勾选值"]')!)
    await click(button(host, '应用表单字段'))
    await settle(() => !button(host, '刷新表单字段').disabled)
    expect(button(host, '应用表单字段').disabled).toBe(true)
    await click(button(host, '保存到库'))
    await settle(() => saves.length === 2)
    expect((await readPdfFormFields(saves[1]!)).fields.map((field) => field.value)).toEqual([
      '中文姓名',
      true,
    ])
    expect((await PDFDocument.load(saves[1]!)).getPage(0).getRotation().angle).toBe(0)
    await act(async () => {
      result = await handle!.execute('list_form_fields', {})
    })
    expect(result).toMatchObject({
      ok: true,
      changed: false,
      data: {
        fields: [
          { name: 'name', value: '中文姓名' },
          { name: 'agree', value: true },
        ],
      },
    })
    await act(async () => {
      host
        .querySelector('[aria-label="PDF 属性工具"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.activeElement).toBe(button(host, '交互表单'))
  })
  it('shows loading, empty, failure and readonly states and jumps to a selected field page', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    cleanup.push(() => {
      act(() => root.unmount())
      host.remove()
    })
    const onAction = vi.fn<() => Promise<{ ok: boolean; changed: boolean; error: string }>>(
      async () => ({ ok: false, changed: false, error: '字段只读' }),
    )
    const onGotoPage = vi.fn<(page: number) => void>()
    const render = async (props: Partial<Parameters<typeof PdfFormPanel>[0]>) => {
      await act(async () =>
        root.render(
          <PdfFormPanel
            busy={false}
            onAction={onAction}
            onClose={() => {}}
            onGotoPage={onGotoPage}
            {...props}
          />,
        ),
      )
    }
    await render({ busy: true })
    expect(host.querySelector('[aria-label="正在读取表单"]')).not.toBeNull()
    await render({ snapshot: { sha256: 'a', fields: [] } })
    expect(host.textContent).toContain('没有交互表单字段')
    await render({ error: '读取失败，请刷新重试' })
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('读取失败')
    const fields = [
      {
        name: 'first',
        type: 'text' as const,
        value: '原值',
        options: [],
        readOnly: false,
        required: false,
        widgets: [{ page: 1, rect: [0, 0, 1, 1] as [number, number, number, number] }],
      },
      {
        name: 'readonly',
        type: 'text' as const,
        value: '锁定',
        options: [],
        readOnly: true,
        required: false,
        widgets: [2, 2].map((page) => ({
          page,
          rect: [0, 0, 1, 1] as [number, number, number, number],
        })),
      },
    ]
    await render({ snapshot: { sha256: 'b', fields } })
    const panel = host.querySelector('[aria-label="PDF 表单面板"]')!,
      content = panel.querySelector('.mimir-pdf-inspector__content')!,
      footer = panel.querySelector('footer')!
    expect(footer.parentElement).toBe(panel)
    expect(content.contains(footer)).toBe(false)
    expect(footer.contains(button(host, '应用表单字段'))).toBe(true)
    expect(footer.querySelector('[role="status"]')).not.toBeNull()
    expect(button(host, '应用表单字段').disabled).toBe(true)
    const fieldSelector = host.querySelector('[aria-label="选择表单字段"]')
    await click(
      openSelect(host, '选择表单字段').find((option) => option.textContent?.includes('readonly'))!,
    )
    expect(onGotoPage).toHaveBeenCalledWith(2)
    expect(host.querySelector('[aria-label="选择表单字段"]')).toBe(fieldSelector)
    expect(host.textContent).toContain('文本 · 第 2 页')
    expect(host.textContent).not.toContain('第 2、2 页')
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.disabled).toBe(true)
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('锁定')
    expect(button(host, '应用表单字段').disabled).toBe(true)
    expect(host.textContent).toContain('此字段为只读')
  })
})
