/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import { openPptx, savePptx } from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import { matchesElementRef } from '../../vendor/packages/pptx-engine/src/identity.js'
import { getSlideAnimations } from '../../vendor/packages/pptx-engine/src/animation.js'
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
import {
  applyPptxManualUploadOnHost,
  applyPptxOpsOnHost,
} from '../../../../apps/server/src/services/pptx-agent-host.js'

const STORAGE_KEY = 'mimir.pptx.internal-clipboard'
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((close) => close())
  sessionStorage.removeItem(STORAGE_KEY)
  vi.restoreAllMocks()
})
function button(host: HTMLElement, label: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!node) throw new Error(`Missing button ${label}`)
  return node
}
const click = (node: Element, options: MouseEventInit = {}) =>
  act(() => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...options }))
  })
async function settle(done: () => boolean) {
  for (let i = 0; i < 600 && !done(); i++)
    await act(async () => {
      await new Promise((finish) => setTimeout(finish, 3))
    })
  expect(done()).toBe(true)
}
function tab(host: HTMLElement, label: string) {
  const node = [...host.querySelectorAll('[role="tab"]')].find((item) => item.textContent === label)
  if (!node) throw new Error(`Missing tab ${label}`)
  click(node)
}
function field(host: HTMLElement, label: string, value: string) {
  const node = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
  if (!node) throw new Error(`Missing field ${label}`)
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
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
const frozen = (handle: PptxAgentHandle) =>
  handle.freezeSelection() as { slideIndex: number; elementIds: string[] }

async function mount(execute: PptxHostApply = applyPptxOpsOnHost) {
  sessionStorage.removeItem(STORAGE_KEY)
  const source = await openPptx((await selectionFixture()).bytes)
  expect(
    runTxn(source, { isolation: 'atomic', ops: [{ op: 'duplicateSlide', target: { slide: 0 } }] })
      .applied,
  ).toBe(true)
  const bytes = await savePptx(source)
  const initial = await openPptxForEdit(bytes)
  const contexts = pptxSelectionContexts(initial.slides()[0]!.elements)
  const top = contexts.find((context) => context.depth === 0 && context.element.type === 'text')!
  const member = contexts.find(
    (context) => context.depth === 1 && context.element.type !== 'group',
  )!
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const hostApply = vi.fn<PptxHostApply>(execute)
  let handle: PptxAgentHandle | null = null
  const hostAsset = vi.fn<NonNullable<Parameters<typeof PptxEditor>[0]['hostAsset']>>(
    async (request) =>
      applyPptxManualUploadOnHost({
        ...request,
        assetBytes: new Uint8Array(await request.assetFile.arrayBuffer()),
        assetName: request.assetFile.name,
        assetMime: request.assetFile.type,
      }),
  )
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
          hostAsset={hostAsset}
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
  await render('clipboard-one')
  await settle(() => !!handle && !!host.querySelector('.mimir-pptx-slide svg'))
  const current = () => {
    if (!handle) throw new Error('Missing handle')
    return handle
  }
  const openClipboard = () => {
    tab(host, '开始')
    const trigger = button(host, '剪贴板')
    if (
      !host.querySelector('[aria-label="剪贴板面板"]') &&
      trigger.getAttribute('aria-expanded') !== 'true'
    )
      click(trigger)
  }
  const select = () => {
    click(button(host, '打开对象选择与格式'))
    const row = (ref: string) => {
      const node = host.querySelector(`[role="option"][data-ref="${ref}"]`)
      if (!node) throw new Error(`Missing selection row ${ref}`)
      return node
    }
    click(row(top.ref))
    click(row(member.ref), { ctrlKey: true })
    expect(frozen(current()).elementIds).toHaveLength(2)
    click(button(host, '关闭幻灯片属性面板'))
    openClipboard()
  }
  const save = async () => {
    await settle(() => !button(host, '保存到库').disabled)
    const count = saved.length
    click(button(host, '保存到库'))
    await settle(() => saved.length > count && button(host, '保存到库').disabled)
    return saved.at(-1)!
  }
  const run = async (label: string) => {
    const before = current().getVersion()
    click(button(host, label))
    await settle(() => current().getVersion() > before && !button(host, '保存到库').disabled)
  }
  return {
    host,
    bytes,
    hostApply,
    hostAsset,
    current,
    select,
    openClipboard,
    save,
    run,
    render,
    top,
    member,
    ready: (id: string) => handle?.documentId === id,
  }
}

it('copies multiple native targets once without dirtying and keeps an accepted cut available after selection cleanup', async () => {
  let release!: () => void
  const gate = new Promise<void>((finish) => {
    release = finish
  })
  const app = await mount(async (request) => {
    if ((request.ops[0] as { kind?: string }).kind === 'copy_elements') await gate
    return applyPptxOpsOnHost(request)
  })
  app.select()
  const version = app.current().getVersion()
  const copy = button(app.host, '复制对象')
  click(copy)
  await settle(() => app.hostApply.mock.calls.length === 1)
  click(copy)
  expect(app.hostApply).toHaveBeenCalledTimes(1)
  expect(button(app.host, '保存到库').disabled).toBe(true)
  expect(button(app.host, '撤销').disabled).toBe(true)
  await act(async () => release())
  await settle(() => !!sessionStorage.getItem(STORAGE_KEY))
  expect(app.current().getVersion()).toBe(version)
  expect(button(app.host, '保存到库').disabled).toBe(true)
  expect(button(app.host, '撤销').disabled).toBe(true)
  const copyRequest = app.hostApply.mock.calls[0]![0].ops[0] as { targets: { group?: string }[] }
  expect(copyRequest.targets).toHaveLength(2)
  expect(copyRequest.targets.some((target) => !!target.group)).toBe(true)
  expect(copyRequest.targets.some((target) => !target.group)).toBe(true)
  await app.run('剪切对象')
  expect(frozen(app.current()).elementIds).toHaveLength(0)
  const cutClip = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!) as { ref: string; count: number }
  expect(cutClip.count).toBe(2)
  app.openClipboard()
  expect(button(app.host, '粘贴对象').disabled).toBe(false)
  await app.run('粘贴对象')
  expect(frozen(app.current()).elementIds).toHaveLength(2)
})

it('records one history step per native multi-target cut and paste, preserves saved undo/redo, then formats the pasted selection', async () => {
  const app = await mount()
  app.select()
  const before = app.current().getVersion()
  await app.run('剪切对象')
  expect(app.current().getVersion()).toBe(before + 1)
  const cut = await app.save()
  click(button(app.host, '撤销'))
  expect(button(app.host, '撤销').disabled).toBe(true)
  expect(await entries(await app.save())).toEqual(await entries(app.bytes))
  click(button(app.host, '重做'))
  expect(await entries(await app.save())).toEqual(await entries(cut))
  app.openClipboard()
  await app.run('粘贴对象')
  const pastedRefs = frozen(app.current()).elementIds
  expect(pastedRefs).toHaveLength(2)
  const pasted = await app.save()
  expect(frozen(app.current()).elementIds).toEqual(pastedRefs)
  click(button(app.host, '撤销'))
  expect(await entries(await app.save())).toEqual(await entries(cut))
  click(button(app.host, '重做'))
  expect(await entries(await app.save())).toEqual(await entries(pasted))
  app.openClipboard()
  await app.run('粘贴对象')
  const newestRefs = frozen(app.current()).elementIds
  expect(newestRefs).toHaveLength(2)
  click(button(app.host, '打开对象选择与格式'))
  pickSelectOption(app.host, '批量加粗', '开启')
  field(app.host, '批量字号（pt）', '27')
  await app.run('应用对象格式')
  const saved = await openPptxForEdit(await app.save())
  const contexts = pptxSelectionContexts(saved.slides()[0]!.elements)
  const latest = contexts.filter((context) =>
    newestRefs.some((ref) => context.ref === ref || matchesElementRef(context.element, ref)),
  )
  expect(latest).toHaveLength(2)
  const text = latest.flatMap((context) =>
    context.element.type === 'group' ? context.element.children : [context.element],
  )
  expect(text.every((element) => 'text' in element && !!element.text)).toBe(true)
  for (const element of text)
    expect('text' in element && element.text?.paragraphs[0]?.runs[0]).toMatchObject({
      bold: true,
      fontSize: 27,
    })
})

type Scenario = 'close' | 'target' | 'page' | 'source' | 'version'
async function changeContext(app: Awaited<ReturnType<typeof mount>>, scenario: Scenario) {
  if (scenario === 'close') click(button(app.host, '剪贴板'))
  else if (scenario === 'target')
    click(app.host.querySelector('.mimir-pptx-slide [data-element-kind="text"]')!)
  else if (scenario === 'page') click(button(app.host, '下一页'))
  else if (scenario === 'source') {
    await app.render('clipboard-two')
    await settle(() => app.ready('clipboard-two'))
  } else
    await act(async () => {
      const result = await app.current().execute(
        'apply_ops',
        {
          ops: [
            {
              op: 'setText',
              target: { slide: 0, el: app.top.ref },
              paragraphs: [{ runs: [{ text: '保留并发的新版本' }] }],
            },
          ],
        },
        { expectedVersion: app.current().getVersion() },
      )
      if (!(result as { ok?: boolean }).ok) throw new Error('Concurrent native edit failed')
    })
}

it.each(
  (['copy', 'cut', 'paste'] as const).flatMap((action) =>
    (['close', 'target', 'page', 'source', 'version'] as const).map((scenario) => ({
      action,
      scenario,
    })),
  ),
)('rejects late accepted $action after $scenario changes', async ({ action, scenario }) => {
  let release!: () => void
  const gate = new Promise<void>((finish) => {
    release = finish
  })
  let accepted = false
  const app = await mount(async (request) => {
    const result = await applyPptxOpsOnHost({ ...request, signal: undefined })
    if ((request.ops[0] as { kind?: string }).kind === `${action}_elements`) {
      accepted = true
      await gate
    }
    return result
  })
  app.select()
  if (action === 'paste') {
    click(button(app.host, '复制对象'))
    await settle(() => !!sessionStorage.getItem(STORAGE_KEY))
  }
  const oldClip = sessionStorage.getItem(STORAGE_KEY)
  const version = app.current().getVersion()
  const trigger = button(app.host, { copy: '复制对象', cut: '剪切对象', paste: '粘贴对象' }[action])
  click(trigger)
  await settle(() => accepted)
  click(trigger)
  expect(app.hostApply).toHaveBeenCalledTimes(action === 'paste' ? 2 : 1)
  const request = app.hostApply.mock.calls.at(-1)![0]
  expect(request.signal?.aborted).toBe(false)
  await changeContext(app, scenario)
  await act(async () => {
    release()
    await app.hostApply.mock.results.at(-1)!.value
  })
  expect(app.current().getVersion()).toBe(version + Number(scenario === 'version'))
  expect(button(app.host, '保存到库').disabled).toBe(scenario !== 'version')
  expect(button(app.host, '撤销').disabled).toBe(scenario !== 'version')
  expect(sessionStorage.getItem(STORAGE_KEY)).toBe(oldClip)
  expect(scenario === 'version' || request.signal?.aborted).toBe(true)
  if (scenario === 'version') await verifyConcurrentVersion(app)
})

async function verifyConcurrentVersion(app: Awaited<ReturnType<typeof mount>>) {
  const original = await openPptxForEdit(app.bytes)
  const current = await openPptxForEdit(await app.save())
  const contexts = pptxSelectionContexts(current.slides()[0]!.elements)
  expect(contexts).toHaveLength(pptxSelectionContexts(original.slides()[0]!.elements).length)
  const top = contexts.find((context) => matchesElementRef(context.element, app.top.ref))!
  expect('text' in top.element && top.element.text?.paragraphs[0]?.runs[0]?.text).toBe(
    '保留并发的新版本',
  )
}

it('keeps the animation-style caller working without clipboard options and persists real effect and direction', async () => {
  const app = await mount()
  await act(async () => {
    const result = await app.current().execute(
      'apply_ops',
      {
        ops: [
          {
            op: 'addAnimation',
            target: { slide: 0, el: app.top.ref },
            effect: 'fade',
            trigger: 'onClick',
            durationMs: 850,
            delayMs: 120,
          },
        ],
      },
      { expectedVersion: app.current().getVersion() },
    )
    expect(result).toMatchObject({ ok: true, changed: true })
  })
  tab(app.host, '幻灯片')
  click(button(app.host, '备注与放映'))
  tab(app.host, '时间线')
  const version = app.current().getVersion()
  pickSelectOption(app.host, '动画 1 效果', '飞入')
  await settle(() => app.current().getVersion() > version)
  pickSelectOption(app.host, '动画 1 方向', '从左侧')
  await settle(() => app.current().getVersion() > version + 1)
  const saved = await openPptxForEdit(await app.save())
  expect(getSlideAnimations(saved.slides()[0]!)[0]).toMatchObject({
    effect: 'flyIn',
    direction: 'left',
    durationMs: 850,
    delayMs: 120,
  })
  expect(
    app.hostApply.mock.calls.filter(
      ([request]) => (request.ops[0] as { kind?: string }).kind === 'animation_style',
    ),
  ).toHaveLength(2)
  expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
})

it('reads and edits a native master through the shared caller without a clipboard slide or options', async () => {
  const app = await mount()
  tab(app.host, '视图')
  click(button(app.host, '母版编辑'))
  await settle(() => !!app.host.querySelector('[aria-label="母版预览"]'))
  expect(app.current().getVersion()).toBe(0)
  expect(button(app.host, '保存到库').disabled).toBe(true)
  const result = await app.hostApply.mock.results[0]!.value
  const parts = (
    result.data as {
      parts: {
        partPath: string
        kind: string
        name: string
        elements: { id: string; name: string; type: string }[]
      }[]
    }
  ).parts
  const part = parts.find((item) =>
    item.elements.some((element) => element.type === 'shape' || element.type === 'text'),
  )!
  const element = part.elements.find((item) => item.type === 'shape' || item.type === 'text')!
  pickSelectOption(
    app.host,
    '编辑范围',
    `${part.kind === 'master' ? '母版' : '版式'} · ${part.name}`,
  )
  pickSelectOption(app.host, '母版对象', `${element.name} · ${element.type}`)
  field(app.host, '填充色（#RRGGBB）', '#123456')
  await app.run('应用母版填充')
  const saved = await entries(await app.save())
  const original = await entries(app.bytes)
  expect(new TextDecoder().decode(saved[part.partPath])).toContain('123456')
  expect(saved['ppt/slides/slide1.xml']).toEqual(original['ppt/slides/slide1.xml'])
  expect(saved['ppt/slides/slide2.xml']).toEqual(original['ppt/slides/slide2.xml'])
  expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
})

it('copies two real pages from the Inspector, pastes once and restores every native ZIP entry through saved undo/redo', async () => {
  const app = await mount()
  app.openClipboard()
  pickSelectOption(app.host, '复制内容', '多张幻灯片（已选1页）')
  const boxes = app.host.querySelectorAll<HTMLInputElement>(
    '.mimir-pptx-clipboard__pages input[type="checkbox"]',
  )
  expect(boxes).toHaveLength(2)
  click(boxes[1]!)
  click(button(app.host, '复制幻灯片'))
  await settle(() => JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null')?.count === 2)
  expect(button(app.host, '保存到库').disabled).toBe(true)
  await app.run('粘贴幻灯片')
  const pasted = await app.save()
  expect((await openPptxForEdit(pasted)).slides()).toHaveLength(4)
  click(button(app.host, '撤销'))
  expect(await entries(await app.save())).toEqual(await entries(app.bytes))
  click(button(app.host, '重做'))
  expect(await entries(await app.save())).toEqual(await entries(pasted))
})

it('inserts real external PNG clipboard bytes, selects the native picture and preserves saved history', async () => {
  const app = await mount()
  const source = await openPptx(app.bytes),
    image = source.archive.readBytes('ppt/media/image1.png')
  const fallback = await openPptx(
    new Uint8Array(
      (await import('node:fs')).readFileSync(
        (await import('node:path')).resolve(process.cwd(), 'tests/fixtures/image-deck.pptx'),
      ),
    ),
  )
  const imageBytes = image ?? fallback.archive.readBytes('ppt/media/image1.png')!
  const file = new File([new Uint8Array(imageBytes)], 'external.png', { type: 'image/png' })
  const canvas = app.host.querySelector('.mimir-pptx-slide')!
  const version = app.current().getVersion(),
    event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { files: [file], getData: () => '' } })
  act(() => canvas.dispatchEvent(event))
  await settle(() => app.current().getVersion() === version + 1)
  expect(event.defaultPrevented).toBe(true)
  expect(app.hostAsset).toHaveBeenCalledOnce()
  expect(frozen(app.current()).elementIds).toHaveLength(1)
  const inserted = await app.save()
  expect((await openPptxForEdit(inserted)).slides()[0]!.elements.at(-1)?.type).toBe('picture')
  click(button(app.host, '撤销'))
  expect(await entries(await app.save())).toEqual(await entries(app.bytes))
  click(button(app.host, '重做'))
  expect(await entries(await app.save())).toEqual(await entries(inserted))
})

it.each(['escape', 'page', 'source'] as const)(
  'rejects late native image bytes after %s and clears the processing message',
  async (scenario) => {
    const app = await mount()
    const fallback = await openPptx(
      new Uint8Array(
        (await import('node:fs')).readFileSync(
          (await import('node:path')).resolve(process.cwd(), 'tests/fixtures/image-deck.pptx'),
        ),
      ),
    )
    const file = new File(
      [new Uint8Array(fallback.archive.readBytes('ppt/media/image1.png')!)],
      'late-image.png',
      { type: 'image/png' },
    )
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let accepted = false
    app.hostAsset.mockImplementationOnce(async (request) => {
      const response = await applyPptxManualUploadOnHost({
        ...request,
        signal: undefined,
        assetBytes: new Uint8Array(await request.assetFile.arrayBuffer()),
        assetName: request.assetFile.name,
        assetMime: request.assetFile.type,
      })
      accepted = true
      await gate
      return response
    })
    const canvas = app.host.querySelector('.mimir-pptx-slide')!,
      event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { files: [file], getData: () => '' } })
    act(() => canvas.dispatchEvent(event))
    await settle(() => accepted)
    const request = app.hostAsset.mock.calls[0]![0]
    expect(app.host.textContent).toContain('正在处理素材')
    if (scenario === 'escape')
      act(() =>
        canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
      )
    else await changeContext(app, scenario)
    expect(request.signal?.aborted).toBe(true)
    await act(async () => {
      release()
      await app.hostAsset.mock.results[0]!.value
    })
    await settle(() => !app.host.textContent?.includes('正在处理素材'))
    expect(app.current().getVersion()).toBe(0)
    expect(button(app.host, '保存到库').disabled).toBe(true)
    expect(button(app.host, '撤销').disabled).toBe(true)
    expect(app.hostAsset).toHaveBeenCalledOnce()
  },
)
