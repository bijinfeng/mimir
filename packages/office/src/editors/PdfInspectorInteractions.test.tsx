// @vitest-environment happy-dom
import { ConfigProvider } from 'antd'
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PDFDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfLocalInfo } from '@mimir/shared'
import type { PdfAgentHandle } from '../agent/pdf-agent.js'
import type { PdfHostAnnotations } from '../agent/pdf-content-agent.js'
import { selectRoot, pressMouseDown } from '../shell/antd-test-dom.js'
import { layoutPdfTextInsert } from '../../../../apps/server/src/services/pdf-insert-layout.js'
const parsing = vi.hoisted(() => ({ tasks: new Map<Uint8Array, ReturnType<typeof getDocument>>() }))
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&url', async () => ({
  default: (await import('node:module'))
    .createRequire(import.meta.url)
    .resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
}))
vi.mock('./pdf-render.js', () => ({
  retainPdfDocument: () => () => {},
  awaitPdfTask: <T,>(task: Promise<T>) => task,
  loadPdfDocument: async (bytes: Uint8Array) => {
    let task = parsing.tasks.get(bytes)
    if (!task) {
      task = getDocument({ data: bytes.slice() })
      parsing.tasks.set(bytes, task)
    }
    return task.promise
  },
  cancelPdfRender() {},
  retainPdfDocuments() {},
  renderPdfPages: async () => ({ dispose() {} }),
}))
import { PdfEditor } from './PdfEditor.js'
import { PdfLocalPanel, type PdfLocalPanelMode } from './PdfLocalPanel.js'
import type { PdfPanelAction } from './PdfInspector.js'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanup: Array<() => void> = []
afterEach(async () => {
  cleanup.splice(0).forEach((fn) => fn())
  for (const task of parsing.tasks.values()) await task.destroy()
  parsing.tasks.clear()
  vi.restoreAllMocks()
})
const info: PdfLocalInfo = {
  metadata: {},
  watermark: null,
  headerFooter: null,
  outline: [],
  drawings: [],
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function settle(done: () => boolean) {
  await vi.waitFor(
    async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(done()).toBe(true)
    },
    { timeout: 5000 },
  )
}
async function click(node: Element) {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}
function button(host: HTMLElement, label: string) {
  const result = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!result) throw new Error(`Missing ${label}`)
  return result
}
function textButton(host: HTMLElement, text: string) {
  const result = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent === text,
  )
  if (!result) throw new Error(`Missing ${text}`)
  return result
}
async function fill(node: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    node.focus()
    Object.getOwnPropertyDescriptor(
      node instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value',
    )!.set!.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function assertLockedSelect(target: HTMLElement) {
  expect(target.querySelector('input')!.disabled).toBe(true)
  expect(target.querySelector('input')!.getAttribute('aria-expanded')).not.toBe('true')
}

function mountRoot() {
  const host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return { host, root }
}
async function mountEditor(annotations?: PdfHostAnnotations) {
  const { host, root } = mountRoot(),
    pdf = await PDFDocument.create()
  pdf.addPage([400, 600])
  const original = await pdf.save()
  let handle: PdfAgentHandle | null = null
  await act(async () =>
    root.render(
      <ConfigProvider componentSize="small">
        <PdfEditor
          documentId="pdf-inspector-interactions"
          io={{ load: async () => original, save: async () => {} }}
          onAgentHandleChange={(value) => {
            handle = value
          }}
          hostLocal={async ({ expectedVersion }) => ({ info, version: expectedVersion })}
          hostImages={async ({ expectedVersion }) => ({
            images: { sha256: '', images: [], unsupportedPages: [] },
            version: expectedVersion,
          })}
          hostBlocks={async ({ expectedVersion }) => ({
            blocks: { sha256: '', blocks: [] },
            version: expectedVersion,
          })}
          hostAnnotations={
            annotations ??
            (async ({ expectedVersion }) => ({
              annotations: { sha256: '', annotations: [] },
              version: expectedVersion,
            }))
          }
          hostApply={async (input) => {
            if (input.kind === 'layout')
              return {
                bytes: input.bytes,
                version: input.expectedVersion,
                layouts: await Promise.all(
                  input.items.map((item) =>
                    layoutPdfTextInsert(
                      input.bytes,
                      item as Parameters<typeof layoutPdfTextInsert>[1],
                    ),
                  ),
                ),
              }
            const document = await PDFDocument.load(input.bytes)
            for (const item of input.items as Array<{ text: string; origin: [number, number] }>)
              document.getPage(0).drawText(item.text, { x: item.origin[0], y: item.origin[1] })
            return { bytes: await document.save(), version: input.expectedVersion + 1 }
          }}
        />
      </ConfigProvider>,
    ),
  )
  await settle(() => handle !== null)
  return { host, handle: handle! }
}

describe('PDF Inspector interaction boundaries', () => {
  it.each([
    ['视图', '扫描文字', '识别扫描文字', '关闭扫描文字识别'],
    ['编辑', '涂黑副本', '标记涂黑副本', '涂黑副本面板'],
    ['视图', '页面图像', '导出页面图像', '页面图像导出面板'],
    ['绘制', '画布绘图', '打开画布绘图', 'PDF 文档工具面板'],
    ['页面', '文档工具', '页面、绘图与文档属性', 'PDF 文档工具面板'],
    ['编辑', '文字', '插入文字', '插入文字面板'],
    ['编辑', '文字', '编辑待保存文字', '待保存文字面板'],
    ['编辑', '文字', '定位原文', '文字标注面板'],
    ['编辑', '原文段落', '原文段落编辑', '原文段落编辑面板'],
    ['编辑', '图片', 'PDF图片工具', 'PDF 图片面板'],
  ])(
    'closes collapsed %s/%s before %s, and restores focus after Escape',
    async (tab, group, command, panel) => {
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
      const app = await mountEditor()
      let setupResult: { ok: boolean } = { ok: true }
      if (command === '编辑待保存文字') {
        await act(async () => {
          setupResult = await app.handle.execute('insert_text', {
            page: 1,
            text: 'PENDING',
            x: 50,
            y: 100,
          })
        })
      }
      expect(setupResult).toMatchObject({ ok: true })
      await click(
        [...app.host.querySelectorAll('[role="tab"]')].find((entry) => entry.textContent === tab)!,
      )
      await click(button(app.host, group))
      await settle(() => !!app.host.querySelector('[role="menu"]'))
      await click(button(app.host, command))
      await settle(() => !!app.host.querySelector(`[aria-label="${panel}"]`))
      expect(app.host.querySelector('[role="menu"]')).toBeNull()
      await settle(() => !button(app.host, group).disabled)
      await act(async () =>
        app.host
          .querySelector('[aria-label="PDF 属性工具"]')!
          .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
      )
      expect(app.host.querySelector('[aria-label="PDF 属性工具"]')).toBeNull()
      expect(document.activeElement).toBe(button(app.host, group))
    },
  )

  it.each([
    ['pages', '目标页码', '拆页网格', '抽取为新 PDF'],
    ['drawing', '线条颜色', '绘图形状', '添加绘图'],
    ['stamps', '水印文字', null, '应用水印'],
    ['properties', '标题', null, '应用文档属性'],
  ] as const)(
    'locks real %s controls during the host request and preserves rejected drafts',
    async (mode, field, select, action) => {
      const { host, root } = mountRoot(),
        pending = deferred(),
        onClose = vi.fn<() => void>(),
        onModeChange = vi.fn<(mode: PdfLocalPanelMode) => void>()
      const onAction = vi.fn<PdfPanelAction>(async () => {
        await pending.promise
        return { ok: false, changed: false, error: '测试拒绝' }
      })
      function Harness() {
        const [busy, setBusy] = useState(false)
        return (
          <PdfLocalPanel
            mode={mode as PdfLocalPanelMode}
            page={1}
            pageCount={2}
            info={info}
            outputs={[]}
            busy={busy}
            error={null}
            onClose={onClose}
            onModeChange={onModeChange}
            onAction={async (...args) => {
              setBusy(true)
              try {
                return await onAction(...args)
              } finally {
                setBusy(false)
              }
            }}
          />
        )
      }
      await act(async () =>
        root.render(
          <ConfigProvider componentSize="small">
            <Harness />
          </ConfigProvider>,
        ),
      )
      if (mode === 'drawing') await click(host.querySelector('.ant-collapse-header')!)
      const input = () => host.querySelector<HTMLInputElement>(`input[aria-label="${field}"]`)!
      await fill(input(), mode === 'pages' ? '1-2' : 'draft')
      await click(textButton(host, action))
      expect(input().disabled).toBe(true)
      for (const control of host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        '.mimir-pdf-local-group input, .mimir-pdf-local-group textarea',
      ))
        expect(control.disabled).toBe(true)
      if (select) {
        const target = selectRoot(host, select)
        pressMouseDown(target.querySelector('.ant-select-content') ?? target)
        await act(async () =>
          target
            .querySelector('input')!
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
        )
        assertLockedSelect(target)
      }
      await click(textButton(host, action))
      expect(onAction).toHaveBeenCalledTimes(1)
      const tabs = host.querySelector('[aria-label="文档工具类别"]')!
      expect(tabs.closest('.mimir-pdf-inspector__content')).not.toBeNull()
      await act(async () => {
        pending.resolve()
        await pending.promise
      })
      await settle(() => !input().disabled)
      expect(input().value).toBe(mode === 'pages' ? '1-2' : 'draft')
      // Busy navigation and close stay available, independently of write controls.
      const second = deferred()
      onAction.mockImplementationOnce(async () => {
        await second.promise
        return { ok: false, changed: false }
      })
      await click(textButton(host, action))
      expect(button(host, '刷新文档属性').disabled).toBe(true)
      const activeTab = tabs.querySelector('[aria-selected="true"]')!
      await act(async () =>
        activeTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
      )
      expect(onModeChange).toHaveBeenCalledTimes(1)
      await click(button(host, '关闭文档工具'))
      expect(onClose).toHaveBeenCalledTimes(1)
      await act(async () => {
        second.resolve()
        await second.promise
      })
      await settle(() => !button(host, '刷新文档属性').disabled)
    },
  )

  it('keeps annotation footer outside scroll, locks pending fields, and restores rejected drafts', async () => {
    const pending = deferred()
    const annotations = vi.fn<PdfHostAnnotations>(async ({ operation, expectedVersion }) => {
      if (operation.op !== 'read') {
        await pending.promise
        throw new Error('批注写入失败')
      }
      return { version: expectedVersion, annotations: { sha256: '', annotations: [] } }
    })
    const { host } = await mountEditor(annotations)
    await click(
      [...host.querySelectorAll('[role="tab"]')].find((entry) => entry.textContent === '编辑')!,
    )
    await click(button(host, '便笺与标注'))
    await settle(() => !button(host, '刷新批注').disabled)
    const panel = host.querySelector('[aria-label="PDF 批注面板"]')!,
      footer = button(host, '添加便笺').parentElement!
    expect(footer.parentElement).toBe(panel)
    expect(footer.classList.contains('mimir-pdf-inspector__footer')).toBe(true)
    const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="批注内容"]')!
    await fill(input, '保留的批注草稿')
    await click(button(host, '添加便笺'))
    await settle(() => button(host, '添加便笺').disabled)
    expect(input.closest('fieldset')?.disabled).toBe(true)
    expect(
      host.querySelector<HTMLInputElement>('input[aria-label="便笺横坐标（pt）"]')!.disabled,
    ).toBe(true)
    const select = selectRoot(host, '选择批注')
    pressMouseDown(select.querySelector('.ant-select-content') ?? select)
    await act(async () =>
      select
        .querySelector('input')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
    )
    expect(select.querySelector('input')!.disabled).toBe(true)
    expect(select.querySelector('input')!.getAttribute('aria-expanded')).not.toBe('true')
    expect(button(host, '关闭批注面板').disabled).toBe(false)
    await click(button(host, '添加便笺'))
    expect(annotations.mock.calls.filter(([call]) => call.operation.op !== 'read')).toHaveLength(1)
    await act(async () => {
      pending.resolve()
      await pending.promise
    })
    await settle(() => !button(host, '添加便笺').disabled)
    expect(input.value).toBe('保留的批注草稿')
    expect(input.closest('fieldset')?.disabled).toBe(false)
    expect(panel.textContent).toContain('批注写入失败')
    await click(button(host, '关闭批注面板'))
    expect(host.querySelector('[aria-label="PDF 批注面板"]')).toBeNull()
  })
})
