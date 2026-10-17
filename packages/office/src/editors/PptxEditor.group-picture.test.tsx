/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import { PptxEditor } from './PptxEditor.js'
import { pptxGroupPictureFixture } from './pptx-group-picture-test-fixture.js'
import type { PptxAgentHandle, PptxHostApply } from '../agent/pptx-agent.js'
import { openPptx } from '../../vendor/packages/pptx-engine/src/index.js'
import { resolvePptxGroupPicture } from '../pptx-picture-edit.js'
import type { PptxHostAsset } from './types.js'
vi.mock('../../../../apps/server/src/services/documents.js', () => ({
  getDocument: async () => ({
    kind: 'file',
    fileExtension: 'pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }),
}))
vi.mock('../../../../apps/server/src/services/pptx-agent-services.js', () => ({
  applyPptxService: () => {
    throw new Error('Unexpected model call')
  },
}))
import {
  applyPptxOpsOnHost,
  applyPptxManualUploadOnHost,
} from '../../../../apps/server/src/services/pptx-agent-host.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((close) => close())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function button(host: HTMLElement, label: string) {
  const result = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!result) throw new Error(`Missing button: ${label}`)
  return result
}
function click(element: Element, init: MouseEventInit = {}) {
  act(() =>
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init })),
  )
}
async function settle(done: () => boolean) {
  for (let index = 0; index < 500 && !done(); index++)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3))
    })
  expect(done()).toBe(true)
}
async function entries(source: Uint8Array) {
  const zip = await JSZip.loadAsync(source)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((f) => !f.dir)
        .map(async (f) => [f.name, await f.async('uint8array')]),
    ),
  )
}
async function mount(hostApply: PptxHostApply = applyPptxOpsOnHost, hostAsset?: PptxHostAsset) {
  const fixture = await pptxGroupPictureFixture()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let handle: PptxAgentHandle | null = null
  const saved: Uint8Array[] = []
  await act(async () =>
    root.render(
      <PptxEditor
        documentId="group-picture"
        io={{
          load: async () => fixture.bytes,
          save: async (bytes) => {
            saved.push(bytes)
          },
        }}
        hostApply={hostApply}
        hostAsset={hostAsset}
        onAgentHandleChange={(value) => {
          handle = value
        }}
      />,
    ),
  )
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await settle(() => !!handle && !!host.querySelector('.mimir-pptx-slide svg'))
  click([...host.querySelectorAll('[role="tab"]')].find((node) => node.textContent === '对象')!)
  click(button(host, '对象选择与格式'))
  const child = [...host.querySelectorAll('[role="option"]')].find((row) =>
    row.textContent?.includes('产品图片'),
  )!
  expect(child).not.toBeNull()
  click(child)
  click(button(host, '组合图片'))
  const getHandle = () => {
    if (!handle) throw new Error('Missing Agent handle')
    return handle
  }
  return { host, saved, getHandle, ...fixture }
}
function numericDraft(host: HTMLElement, label: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  act(() => {
    field.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function save(view: Awaited<ReturnType<typeof mount>>) {
  const count = view.saved.length
  click(button(view.host, '保存到库'))
  await settle(() => view.saved.length === count + 1 && button(view.host, '保存到库').disabled)
  return view.saved.at(-1)!
}
it('applies an unblurred numeric draft on the first pointer action, retains group child selection and exact history after saving', async () => {
  const apply = vi.fn<PptxHostApply>(applyPptxOpsOnHost)
  const view = await mount(apply)
  expect(view.host.querySelector('.mimir-pptx-group-picture__name')?.textContent).toBe(
    '组合图片验收 › 产品图片',
  )
  expect(
    view.host.querySelector<HTMLInputElement>('input[aria-label="不透明度（%）"]')!.value,
  ).toBe('37')
  numericDraft(view.host, '不透明度（%）', '62')
  const applyButton = button(view.host, '应用修改')
  expect(applyButton.disabled).toBe(false)
  act(() =>
    applyButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })),
  )
  click(button(view.host, '应用修改'))
  await settle(
    () =>
      view.getHandle().getVersion() === 1 &&
      !!view.host.querySelector('input[aria-label="不透明度（%）"]'),
  )
  expect(apply).toHaveBeenCalledTimes(1)
  expect(apply.mock.calls[0]![0]).toMatchObject({
    action: 'manual_picture',
    ops: [{ ...view.target, opacity: 0.62 }],
  })
  expect(view.getHandle().freezeSelection()).toMatchObject({
    elementId: view.target.elementId,
    groupId: view.target.group,
  })
  const after = await save(view)
  const reopened = await openPptx(after)
  expect(resolvePptxGroupPicture(reopened.deck.slides[0]!, view.target).picture.opacity).toBe(0.62)
  click(button(view.host, '撤销'))
  const undo = await save(view)
  expect(await entries(undo)).toEqual(await entries(view.bytes))
  click(button(view.host, '重做'))
  expect(await entries(await save(view))).toEqual(await entries(after))
})
it('Escape aborts a pending manual change, restores the actual trigger and ignores its late result', async () => {
  let release!: () => void
  let arrived!: () => void
  const ready = new Promise<void>((resolve) => {
    arrived = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const apply = vi.fn<PptxHostApply>(async (request) => {
    const response = await applyPptxOpsOnHost(request)
    arrived()
    await gate
    return response
  })
  const view = await mount(apply)
  numericDraft(view.host, '不透明度（%）', '62')
  act(() =>
    button(view.host, '应用修改').dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    ),
  )
  click(button(view.host, '应用修改'))
  await act(async () => ready)
  const panel = view.host.querySelector<HTMLElement>('[aria-label="组合图片面板"]')!
  act(() => panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(apply.mock.calls[0]![0].signal?.aborted).toBe(true)
  expect(view.host.querySelector('[aria-label="组合图片面板"]')).toBeNull()
  await act(async () => release())
  await settle(() => !button(view.host, '组合图片').disabled)
  expect(view.getHandle().getVersion()).toBe(0)
  expect(button(view.host, '保存到库').disabled).toBe(true)
  expect(button(view.host, '撤销').disabled).toBe(true)
  await settle(() => document.activeElement === button(view.host, '组合图片'))
})

it('replaces a group picture through the actual asset host once, retains the member selection and exact saved history', async () => {
  vi.stubGlobal(
    'Image',
    class extends EventTarget {
      naturalWidth = 300
      naturalHeight = 200
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.dispatchEvent(new Event('load')))
      }
    },
  )
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:group-replacement')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const upload = vi.fn<PptxHostAsset>(async (request) =>
    applyPptxManualUploadOnHost({
      ...request,
      assetBytes: new Uint8Array(await request.assetFile.arrayBuffer()),
      assetName: request.assetFile.name,
      assetMime: request.assetFile.type,
    }),
  )
  const view = await mount(applyPptxOpsOnHost, upload)
  click([...view.host.querySelectorAll('label')].find((node) => node.textContent === '替换')!)
  const selected = new File([view.image.slice().buffer], 'replacement.png', { type: 'image/png' })
  const picker = view.host.querySelector<HTMLInputElement>(
    '.mimir-pptx-group-picture input[type="file"]',
  )!
  await act(async () => {
    Object.defineProperty(picker, 'files', { configurable: true, value: [selected] })
    picker.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(upload).not.toHaveBeenCalled()
  click(button(view.host, '替换图片'))
  await settle(() => view.getHandle().getVersion() === 1 && !button(view.host, '保存到库').disabled)
  expect(upload).toHaveBeenCalledTimes(1)
  expect(upload.mock.calls[0]![0].input).toMatchObject({
    kind: 'picture',
    ...view.target,
    keepCrop: false,
  })
  expect(view.getHandle().freezeSelection()).toMatchObject({
    elementId: view.target.elementId,
    groupId: view.target.group,
  })
  const after = await save(view)
  expect(
    resolvePptxGroupPicture((await openPptx(after)).deck.slides[0]!, view.target).picture.srcRect,
  ).toBeUndefined()
  click(button(view.host, '撤销'))
  expect(await entries(await save(view))).toEqual(await entries(view.bytes))
  click(button(view.host, '重做'))
  expect(await entries(await save(view))).toEqual(await entries(after))
})

it('changing pages aborts a pending group asset replacement and ignores its late native result', async () => {
  vi.stubGlobal(
    'Image',
    class extends EventTarget {
      naturalWidth = 300
      naturalHeight = 200
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.dispatchEvent(new Event('load')))
      }
    },
  )
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:group-replacement')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  let release!: () => void
  let arrived!: () => void
  const ready = new Promise<void>((resolve) => {
    arrived = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const upload = vi.fn<PptxHostAsset>(async (request) => {
    const response = await applyPptxManualUploadOnHost({
      ...request,
      assetBytes: new Uint8Array(await request.assetFile.arrayBuffer()),
      assetName: request.assetFile.name,
      assetMime: request.assetFile.type,
    })
    arrived()
    await gate
    return response
  })
  const view = await mount(applyPptxOpsOnHost, upload)
  click([...view.host.querySelectorAll('label')].find((node) => node.textContent === '替换')!)
  const picker = view.host.querySelector<HTMLInputElement>(
    '.mimir-pptx-group-picture input[type="file"]',
  )!
  act(() => {
    Object.defineProperty(picker, 'files', {
      configurable: true,
      value: [new File([view.image.slice().buffer], 'replacement.png', { type: 'image/png' })],
    })
    picker.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await settle(() => !button(view.host, '替换图片').disabled)
  click(button(view.host, '替换图片'))
  await act(async () => ready)
  click(button(view.host, '下一页'))
  expect(upload.mock.calls[0]![0].signal?.aborted).toBe(true)
  await act(async () => release())
  await settle(() => !button(view.host, '上一页').disabled)
  expect(view.getHandle().getVersion()).toBe(0)
  expect(button(view.host, '保存到库').disabled).toBe(true)
  expect(button(view.host, '撤销').disabled).toBe(true)
  expect(view.getHandle().freezeSelection()).toMatchObject({ slideIndex: 1 })
})
