/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import type { PptxAgentHandle, PptxHostApply } from '../agent/pptx-agent.js'
import { openPptxForEdit } from '../pptx.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import { PptxEditor } from './PptxEditor.js'
import { selectionFixture } from './pptx-selection-test-fixture.js'
import { pptxSelectionContexts } from './pptx-selection.js'

vi.mock('../../../../apps/server/src/services/documents.js', () => ({
  getDocument: async (id: string) => ({
    id,
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    fileExtension: 'pptx',
  }),
}))
vi.mock('../../../../apps/server/src/services/pptx-agent-services.js', () => ({
  applyPptxService: () => {
    throw new Error('Unexpected model service')
  },
}))
import { applyPptxOpsOnHost } from '../../../../apps/server/src/services/pptx-agent-host.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((close) => close())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
function button(host: HTMLElement, label: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!node) throw new Error(`Missing button ${label}`)
  return node
}
const click = (node: Element) =>
  act(() => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
async function settle(done: () => boolean) {
  for (let i = 0; i < 600 && !done(); i++)
    await act(async () => {
      await new Promise((finish) => setTimeout(finish, 3))
    })
  expect(done()).toBe(true)
}
function segment(host: HTMLElement, label: string) {
  const node = [...host.querySelectorAll('.ant-segmented-item')].find(
    (item) => item.textContent === label,
  )
  if (!node) throw new Error(`Missing segment ${label}`)
  click(node)
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((file) => !file.dir)
        .map(async (file) => [file.name, await file.async('uint8array')]),
    ),
  )
}
async function mount(execute: PptxHostApply = applyPptxOpsOnHost) {
  const { bytes } = await selectionFixture()
  const paper = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../vendor/apps/slides/src/renderer/assets/textures/paper.png',
    ),
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array(paper))),
  )
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const hostApply = vi.fn<PptxHostApply>(execute)
  let handle: PptxAgentHandle | null = null
  const saved: Uint8Array[] = []
  const io = {
    load: async () => bytes,
    save: async (next: Uint8Array) => {
      saved.push(next)
    },
  }
  const render = async (documentId: string) =>
    act(async () =>
      root.render(
        <PptxEditor
          documentId={documentId}
          io={io}
          hostApply={hostApply}
          onAgentHandleChange={(next) => {
            handle = next
          }}
        />,
      ),
    )
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await render('fill-one')
  await settle(() => !!handle && !!host.querySelector('.mimir-pptx-slide svg'))
  const current = () => {
    if (!handle) throw new Error('Missing handle')
    return handle
  }
  const stage = () => {
    click(button(host, '打开对象选择与格式'))
    click(button(host, '选择全部顶层对象'))
    segment(host, '外观')
    pickSelectOption(host, '批量填充类型', '内置纹理')
  }
  const save = async () => {
    await settle(() => !button(host, '保存到库').disabled)
    const count = saved.length
    click(button(host, '保存到库'))
    await settle(() => saved.length > count && button(host, '保存到库').disabled)
    return saved.at(-1)!
  }
  return {
    host,
    bytes,
    hostApply,
    current,
    stage,
    save,
    render,
    ready: (id: string) => handle?.documentId === id,
  }
}

async function verifyConcurrentEdit(bytes: Uint8Array) {
  const reopened = await openPptxForEdit(bytes)
  const rows = pptxSelectionContexts(reopened.slides()[0]!.elements)
  const text = rows.flatMap(({ element }) =>
    'text' in element
      ? (element.text?.paragraphs.flatMap((p) => p.runs.map((r) => r.text)) ?? [])
      : [],
  )
  expect(text).toContain('保留并发的新画布版本')
  expect(rows.some(({ element }) => 'fill' in element && element.fill?.type === 'image')).toBe(
    false,
  )
}

it('stages a mixed selection texture, submits only once while busy, and preserves saved native undo/redo', async () => {
  let release!: () => void
  const gate = new Promise<void>((finish) => {
    release = finish
  })
  const app = await mount(async (request) => {
    await gate
    return applyPptxOpsOnHost(request)
  })
  app.stage()
  expect(button(app.host, '保存到库').disabled).toBe(true)
  expect(app.hostApply).not.toHaveBeenCalled()
  const before = app.current().getVersion()
  const apply = button(app.host, '应用对象填充')
  click(apply)
  await settle(() => app.hostApply.mock.calls.length === 1)
  click(apply)
  expect(app.hostApply).toHaveBeenCalledTimes(1)
  expect(button(app.host, '保存到库').disabled).toBe(true)
  expect(button(app.host, '选择全部顶层对象').disabled).toBe(true)
  const input = app.hostApply.mock.calls[0]![0].ops[0] as {
    kind: string
    targets: { group?: string }[]
  }
  expect(input.kind).toBe('selection')
  expect(input.targets.some((target) => !!target.group)).toBe(true)
  expect(input.targets.some((target) => !target.group)).toBe(true)
  await act(async () => release())
  await settle(() => app.current().getVersion() > before && !button(app.host, '保存到库').disabled)
  const saved = await app.save()
  const reopened = await openPptxForEdit(saved)
  const targets = pptxSelectionContexts(reopened.slides()[0]!.elements).filter(
    (context) => context.element.type === 'shape' || context.element.type === 'text',
  )
  expect(targets.length).toBeGreaterThan(0)
  expect(targets.every(({ element }) => 'fill' in element && element.fill?.type === 'image')).toBe(
    true,
  )
  click(button(app.host, '撤销'))
  expect(await entries(await app.save())).toEqual(await entries(app.bytes))
  click(button(app.host, '重做'))
  expect(await entries(await app.save())).toEqual(await entries(saved))
})

it.each(['close', 'target', 'source', 'version'] as const)(
  'refuses late accepted selection-fill bytes after %s changes',
  async (scenario) => {
    let release!: () => void
    const gate = new Promise<void>((finish) => {
      release = finish
    })
    const app = await mount(async (request) => {
      // Produce genuine accepted native bytes even when the client later cancels.
      const result = await applyPptxOpsOnHost({ ...request, signal: undefined })
      await gate
      return result
    })
    app.stage()
    const original = app.current()
    const version = original.getVersion()
    click(button(app.host, '应用对象填充'))
    await settle(() => app.hostApply.mock.calls.length === 1)
    const request = app.hostApply.mock.calls[0]![0]
    expect(request.signal?.aborted).toBe(false)
    if (scenario === 'close') click(button(app.host, '关闭幻灯片属性面板'))
    else if (scenario === 'target')
      click(app.host.querySelector('.mimir-pptx-slide [data-element-kind="text"]')!)
    else if (scenario === 'source') {
      await app.render('fill-two')
      await settle(() => app.ready('fill-two'))
    } else {
      const target = app.host.querySelector('.mimir-pptx-slide [data-element-kind="text"]')!
      await act(async () => {
        const response = await original.execute(
          'apply_ops',
          {
            ops: [
              {
                op: 'setText',
                target: { slide: 0, el: target.getAttribute('data-element-id') },
                paragraphs: [{ runs: [{ text: '保留并发的新画布版本' }] }],
              },
            ],
          },
          { expectedVersion: version },
        )
        if (!(response as { ok: boolean }).ok) throw new Error('Concurrent native edit failed')
      })
    }
    await act(async () => {
      release()
      await app.hostApply.mock.results[0]!.value
    })
    expect(app.current().getVersion()).toBe(scenario === 'version' ? version + 1 : version)
    expect(button(app.host, '保存到库').disabled).toBe(scenario !== 'version')
    expect(button(app.host, '撤销').disabled).toBe(scenario !== 'version')
    expect(app.hostApply).toHaveBeenCalledTimes(1)
    expect(scenario === 'version' || request.signal?.aborted).toBe(true)
    if (scenario === 'version') await verifyConcurrentEdit(await app.save())
  },
)
