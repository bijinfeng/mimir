/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { PptxEditor } from './PptxEditor.js'
import { openPptxForEdit } from '../pptx.js'
import type { PptxAgentHandle, PptxHostApply } from '../agent/pptx-agent.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
vi.mock('../../../../apps/server/src/services/documents.js', () => ({
  getDocument: async (id: string) =>
    id === 'zoom-doc'
      ? {
          id,
          kind: 'file',
          fileExtension: 'pptx',
          mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        }
      : null,
}))
vi.mock('../../../../apps/server/src/services/pptx-agent-services.js', () => ({
  applyPptxService: () => {
    throw new Error('Unexpected model service')
  },
}))
vi.mock('./pptx-zoom-raster.js', () => ({
  pptxZoomSnapshot: vi.fn<() => Promise<string>>(
    async () =>
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X9WQAAAAASUVORK5CYII=',
  ),
}))
import { pptxZoomSnapshot } from './pptx-zoom-raster.js'
import { applyPptxOpsOnHost } from '../../../../apps/server/src/services/pptx-agent-host.js'
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const fixture = new Uint8Array(readFileSync(resolve(rootDir, 'tests/fixtures/title-layout.pptx')))
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.clearAllMocks()
})
async function settle(done: () => boolean) {
  for (let tries = 0; tries < 500 && !done(); tries++)
    await act(async () => {
      await new Promise((tick) => setTimeout(tick, 3))
    })
  expect(done()).toBe(true)
}
function click(node: Element) {
  act(() => node.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}
function button(host: HTMLElement, label: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!node) throw new Error(`Missing ${label}`)
  return node
}
async function mount(override?: PptxHostApply) {
  const session = await openPptxForEdit(fixture)
  session.duplicate(0)
  session.duplicate(1)
  const initial = await session.save(),
    saved: Uint8Array[] = []
  const hostApply = vi.fn<PptxHostApply>(override ?? applyPptxOpsOnHost)
  let handle: PptxAgentHandle | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () =>
    root.render(
      <PptxEditor
        documentId="zoom-doc"
        io={{
          load: async () => initial,
          save: async (bytes) => {
            saved.push(bytes)
          },
        }}
        hostApply={hostApply}
        onAgentHandleChange={(next) => {
          handle = next
        }}
      />,
    ),
  )
  await settle(() => !!handle && !!host.querySelector('.mimir-pptx-slide svg'))
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const open = () => {
    click([...host.querySelectorAll('[role="tab"]')].find((node) => node.textContent === '插入')!)
    click(button(host, '缩放导航'))
  }
  const select = (index: number) =>
    click(host.querySelectorAll('.mimir-pptx-zoom__list button')[index]!)
  const action = async (label: string) => {
    const before = handle!.getVersion()
    click(button(host, label))
    await settle(
      () =>
        handle!.getVersion() === before + 1 &&
        !host.querySelector('[aria-busy="true"].mimir-pptx-zoom'),
    )
  }
  const save = async () => {
    const before = saved.length
    await settle(() => !button(host, '保存到库').disabled)
    click(button(host, '保存到库'))
    await settle(() => saved.length === before + 1 && button(host, '保存到库').disabled)
    return saved.at(-1)!
  }
  return { host, root, initial, hostApply, handle: () => handle!, open, select, action, save }
}
it('真实Editor→handle→host插入slide/section/summary，三模式保存读回且每次仅一步历史', async () => {
  const app = await mount()
  app.open()
  app.select(1)
  await app.action('插入缩放导航')
  expect(app.hostApply.mock.calls.at(-1)![0].action).toBe('manual_zoom')
  expect([...(await openPptxForEdit(await app.save())).view().links!(0).values()]).toEqual([
    { kind: 'slide', slideIndex: 1 },
  ])
  await app.action('撤销')
  expect([...(await openPptxForEdit(await app.save())).view().links!(0).values()]).toEqual([])
  await app.action('重做')
  expect([...(await openPptxForEdit(await app.save())).view().links!(0).values()]).toEqual([
    { kind: 'slide', slideIndex: 1 },
  ])
  // Summary targets are chosen from current pages; it creates real native section heads.
  pickSelectOption(app.host, '缩放导航类型', '摘要缩放')
  app.select(1)
  app.select(2)
  await app.action('插入缩放导航')
  const summaryBytes = await app.save(),
    summary = await openPptxForEdit(summaryBytes)
  expect(summary.slides()).toHaveLength(4)
  expect([...summary.view().links!(1).values()]).toEqual([
    { kind: 'slide', slideIndex: 2 },
    { kind: 'slide', slideIndex: 3 },
  ])
  expect(
    summary.metadata(1).sections.find((section) => section.name === '摘要节')?.slideIndices,
  ).toEqual([1])
  expect(app.host.textContent).toContain('插入第 2 页')
  await app.action('撤销')
  expect((await openPptxForEdit(await app.save())).slides()).toHaveLength(3)
  await app.action('重做')
  await app.save()
  // Open again on the active summary; exact current ranges come from its saved archive.
  if (!app.host.querySelector('.mimir-pptx-zoom')) app.open()
  pickSelectOption(app.host, '缩放导航类型', '节缩放')
  const entries = app.host.querySelectorAll('.mimir-pptx-zoom__list button')
  expect(entries.length).toBeGreaterThanOrEqual(3)
  click(entries[entries.length - 1]!)
  await app.action('插入缩放导航')
  const second = await openPptxForEdit(await app.save())
  const target = app.hostApply.mock.calls.at(-1)![0].ops[0] as {
    slide: number
    targets: { slide: number }[]
  }
  expect([...second.view().links!(target.slide).values()]).toContainEqual({
    kind: 'slide',
    slideIndex: target.targets[0]!.slide,
  })
  await second.save()
  second.commit()
  const reopen = await openPptxForEdit(await second.save())
  expect(reopen.metadata(0).sections).toEqual(second.metadata(0).sections)
  expect([...reopen.view().links!(target.slide).values()]).toEqual([
    ...second.view().links!(target.slide).values(),
  ])
})
it('真实handle rejects stale version, aborted execution and late host success after cancellation', async () => {
  let finish: (() => void) | undefined
  let started = false
  const app = await mount(async (request) => {
    const result = await applyPptxOpsOnHost(request)
    started = true
    await new Promise<void>((done) => {
      finish = done
    })
    return result
  })
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X9WQAAAAASUVORK5CYII='
  const input = { mode: 'summary', slide: 0, targets: [{ slide: 1, png }] }
  const before = app.handle().getVersion()
  expect(
    await app.handle().execute('manual_zoom', input, { expectedVersion: before + 1 }),
  ).toMatchObject({ ok: false })
  expect(
    await app
      .handle()
      .execute('manual_zoom', input, { expectedVersion: before, signal: AbortSignal.abort() }),
  ).toMatchObject({ ok: false })
  const controller = new AbortController()
  const pending = app
    .handle()
    .execute('manual_zoom', input, { expectedVersion: before, signal: controller.signal })
  await settle(() => started)
  controller.abort()
  finish!()
  await expect(pending).resolves.toMatchObject({ ok: false, changed: false })
  expect(app.handle().getVersion()).toBe(before)
  expect(button(app.host, '保存到库').disabled).toBe(true)
  expect(vi.mocked(pptxZoomSnapshot)).not.toHaveBeenCalled()
})
