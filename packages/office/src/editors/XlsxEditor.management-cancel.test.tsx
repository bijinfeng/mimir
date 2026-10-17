// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { applyXlsxObjectOperation } from '../../../../apps/server/src/services/xlsx-agent-objects.js'
import { workbookOperationSchema } from '../../vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'
import type { XlsxAgentHandle, XlsxHostApply } from '../agent/xlsx-agent.js'
import { readXlsx } from '../xlsx.js'
import { xlsxShapePreviewFixture } from '../xlsx-shape-preview-fixture.test-helper.js'
import { XlsxEditor } from './XlsxEditor.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanups: Array<() => void> = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
async function wait(ready: () => boolean) {
  await vi.waitFor(
    async () => {
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)))
      expect(ready()).toBe(true)
    },
    { timeout: 3000, interval: 10 },
  )
}
function button(host: HTMLElement, label: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!node) throw new Error(`Missing ${label}`)
  return node
}
function task(host: HTMLElement, label: string) {
  const node = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (item) => item.textContent?.trim() === label,
  )
  if (!node) throw new Error(`Missing task ${label}`)
  return node
}
const click = (node: HTMLElement) => act(() => node.click())

it.each(['task', 'close'] as const)(
  'cancels management through the actual host-busy Editor on %s and rejects valid late bytes',
  async (change) => {
    const fixture = await xlsxShapePreviewFixture(),
      host = document.createElement('div'),
      root = createRoot(host),
      dirty = vi.fn<(value: boolean) => void>(),
      saved: Uint8Array[] = []
    let handle: XlsxAgentHandle | null = null,
      valid: Awaited<ReturnType<XlsxHostApply>> | undefined,
      release!: () => void
    const gate = new Promise<void>((resolve) => {
        release = resolve
      }),
      execute = vi.fn<XlsxHostApply>(async ({ bytes, ops, expectedVersion }) => {
        // Intentionally ignore the request's AbortSignal and return a real changed workbook.
        valid = await applyXlsxObjectOperation(
          bytes,
          workbookOperationSchema.parse(ops[0]),
          expectedVersion,
        )
        await gate
        return valid
      })
    document.body.append(host)
    act(() =>
      root.render(
        <XlsxEditor
          documentId="management-cancel"
          io={{
            load: async () => fixture.bytes,
            save: async (bytes) => {
              saved.push(bytes.slice())
            },
          }}
          hostApply={execute}
          onDirtyChange={dirty}
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
    await wait(() => !!handle && !!host.querySelector('.mimir-xlsx-object'))
    const current = () => {
      if (!handle) throw new Error('Missing handle')
      return handle
    }
    click(host.querySelector<HTMLElement>('.mimir-xlsx__cell')!)
    click(host.querySelector<HTMLElement>('.mimir-xlsx-object')!)
    click(task(host, '插入'))
    click(button(host, '图表、形状与结构化表'))
    const worksheet = host.querySelector<HTMLElement>('.mimir-xlsx-wrap')!,
      inspector = host.querySelector<HTMLElement>('[aria-label="工作表对象与表格"]')!,
      worksheetLayers = host.querySelectorAll(
        '.mimir-xlsx__colhead, .mimir-xlsx__gutter, .mimir-xlsx-object',
      )
    // The CSS isolation boundary must contain all worksheet layers, with the overlay outside it.
    expect(worksheet.parentElement).toBe(inspector.parentElement)
    expect(worksheet.closest('.mimir-xlsx-inspector-host')).toBe(inspector.parentElement)
    expect(worksheetLayers.length).toBeGreaterThan(3)
    expect([...worksheetLayers].every((node) => worksheet.contains(node))).toBe(true)
    const cellFields = host.querySelector<HTMLFieldSetElement>('.mimir-xlsx-cell-input')!
    expect(cellFields.disabled).toBe(false)
    const text = host.querySelector<HTMLTextAreaElement>('[aria-label="形状文字"]')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        text,
        '迟到结果不得落地',
      )
      text.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click(button(host, '应用形状属性'))
    try {
      await wait(() => !!valid && cellFields.disabled)
      expect(execute).toHaveBeenCalledOnce()
      const request = execute.mock.calls[0]![0]
      expect(request.signal).toBeInstanceOf(AbortSignal)
      expect(request.signal!.aborted).toBe(false)
      expect(valid!.version).toBe(1)
      await act(async () => {
        expect((await readXlsx(valid!.bytes)).sheets[0]!.visuals![0]!.text).toBe(
          '迟到结果不得落地\n',
        )
      })
      expect(
        host.querySelector<HTMLFieldSetElement>('.mimir-xlsx-management__configuration')!.disabled,
      ).toBe(true)
      expect(host.querySelector<HTMLInputElement>('[aria-label="当前对象"]')!.disabled).toBe(true)
      expect(task(host, '结构化表').closest('fieldset[disabled]')).toBeNull()
      expect(button(host, '应用形状属性').disabled).toBe(true)
      expect(current().getVersion()).toBe(0)
      expect(current().history()).toEqual({ undo: 0, redo: 0 })
      if (change === 'task') {
        click(task(host, '结构化表'))
      } else {
        click(button(host, '关闭工作表对象面板'))
      }
      expect(request.signal!.aborted).toBe(true)
      expect(host.querySelector('[aria-label="工作表对象与表格"]') !== null).toBe(change === 'task')
      expect(host.textContent!.includes('当前工作表没有结构化表')).toBe(change === 'task')
      if (change === 'close') click(button(host, '图表、形状与结构化表'))
      // Other insertion modes keep their existing disabled ancestor while hostBusy is true.
      click(task(host, '图表'))
      expect(button(host, '插入范围图表').closest('fieldset[disabled]')).not.toBeNull()
      expect(cellFields.disabled).toBe(true)
    } finally {
      // Settle both the hostile host and the real execute/finally chain, even for a red test.
      await act(async () => release())
      await wait(() => !cellFields.disabled)
    }
    expect(current().getVersion()).toBe(0)
    expect(current().history()).toEqual({ undo: 0, redo: 0 })
    expect(current().isDirty()).toBe(false)
    expect(current().currentBytes()).toEqual(fixture.bytes)
    expect(dirty).not.toHaveBeenCalledWith(true)
    expect(saved).toHaveLength(0)
    expect(host.textContent).not.toContain('已应用')
  },
)
