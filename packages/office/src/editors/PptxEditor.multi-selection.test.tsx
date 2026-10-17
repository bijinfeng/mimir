/** @vitest-environment happy-dom */
import { act } from 'react'
import { readFileSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRoot } from 'react-dom/client'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import { createBlankPptx } from '../../vendor/packages/pptx-engine/src/blank.js'
import { openPptx, savePptx } from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import { elementCNvPrId } from '../../vendor/packages/pptx-engine/src/identity.js'
import { openPptxForEdit, textOfElement } from '../pptx.js'
import type { PptxAgentHandle, PptxHostApply } from '../agent/pptx-agent.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import { PptxEditor } from './PptxEditor.js'
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
import { applyPptxOpsOnHost } from '../../../../apps/server/src/services/pptx-agent-host.js'
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((close) => close())
  vi.restoreAllMocks()
})
const click = (node: Element, options: MouseEventInit = {}) =>
  act(() => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...options }))
  })
function button(host: HTMLElement, name: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
  if (!node) throw new Error(name)
  return node
}
async function settle(done: () => boolean) {
  for (let i = 0; i < 500 && !done(); i++)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3))
    })
  expect(done()).toBe(true)
}
function textNode(host: HTMLElement, value: string) {
  const node = [...host.querySelectorAll('.mimir-pptx-slide text')].find(
    (item) => item.textContent === value,
  )
  if (!node) throw new Error(`Missing canvas text ${value}`)
  return node
}
function field(host: HTMLElement, name: string, value: string) {
  const node = host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!
  expect(node).not.toBeNull()
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
        .map(async (file) => [file.name, await file.async('string')]),
    ),
  )
}
const unchanged = (values: Record<string, string>) =>
  Object.fromEntries(Object.entries(values).filter(([path]) => path !== 'ppt/slides/slide1.xml'))

async function fixture() {
  const opened = await openPptx(await createBlankPptx())
  expect(
    runTxn(opened, {
      ops: ['对象甲', '对象乙', '成员甲', '成员乙'].map((text, index) => ({
        op: 'addElement',
        target: { slide: 0 },
        kind: 'rect',
        offset: { x: index * 1_800_000, y: 1_000_000, cx: 1_500_000, cy: 1_000_000 },
        paragraphs: [{ runs: [{ text, fontSize: 18 }] }],
        fill: '#EEEEEE',
      })),
    }).applied,
  ).toBe(true)
  const members = opened.deck.slides[0]!.elements.slice(-2)
  expect(
    runTxn(opened, {
      ops: [{ op: 'groupElements', target: { slide: 0 }, els: members.map((item) => item.id) }],
    }).applied,
  ).toBe(true)
  // Simulate common legacy OOXML without creationId. The first host edit upgrades it.
  const zip = await JSZip.loadAsync(await savePptx(opened))
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
  zip.file('ppt/slides/slide1.xml', xml.replace(/<[\w]+:creationId\b[^>]*\/>/g, ''))
  return zip.generateAsync({ type: 'uint8array' })
}
async function mount(hostApply: PptxHostApply = applyPptxOpsOnHost) {
  const bytes = await fixture(),
    saved: Uint8Array[] = []
  let handle: PptxAgentHandle | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await act(async () =>
    root.render(
      <PptxEditor
        documentId="multi-selection"
        io={{
          load: async () => bytes,
          save: async (next) => {
            saved.push(next)
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
  const getHandle = () => {
    if (!handle) throw new Error('Missing handle')
    return handle
  }
  const save = async () => {
    await settle(() => !button(host, '保存到库').disabled)
    const before = saved.length
    click(button(host, '保存到库'))
    await settle(() => saved.length === before + 1 && button(host, '保存到库').disabled)
    return { bytes: saved.at(-1)!, session: await openPptxForEdit(saved.at(-1)!) }
  }
  const apply = async () => {
    const before = getHandle().getVersion()
    click(button(host, '应用对象格式'))
    await settle(
      () => getHandle().getVersion() > before && !host.querySelector('fieldset[aria-busy="true"]'),
    )
  }
  return { host, bytes, getHandle, save, apply }
}
const selected = (host: HTMLElement) => [
  ...host.querySelectorAll('.mimir-pptx-slide .mimir-pptx-selected'),
]
const frozen = (handle: PptxAgentHandle) => handle.freezeSelection() as { elementIds: string[] }
async function stagePictureBullet(host: HTMLElement) {
  const listTab = [...host.querySelectorAll('.ant-segmented-item')].find(
    (item) => item.textContent === '列表',
  )!
  click(listTab)
  const image = readFileSync(
    resolvePath(
      dirname(fileURLToPath(import.meta.url)),
      '../../tests/fixtures/pptx-images/picture.png',
    ),
  )
  const fileField = host.querySelector<HTMLInputElement>('[aria-label="批量图片项目符号文件"]')!
  act(() => {
    Object.defineProperty(fileField, 'files', {
      configurable: true,
      value: [new File([image], 'picture.png', { type: 'image/png' })],
    })
    fileField.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await settle(
    () =>
      host.textContent!.includes('待应用：picture.png') && !button(host, '应用对象格式').disabled,
  )
}
function tab(host: HTMLElement, name: string) {
  click([...host.querySelectorAll('[role="tab"]')].find((node) => node.textContent === name)!)
}

it('focuses a new comment from its entry or keyboard shortcut, persists it and returns to the actual opener', async () => {
  const { host, getHandle, save } = await mount()
  tab(host, '幻灯片')
  const entry = button(host, '新建批注')
  click(entry)
  let input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="新批注"]')!
  expect(document.activeElement).toBe(input)
  expect(button(host, '保存到库').disabled).toBe(true)
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      '请确认组合对象的最终排版',
    )
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const version = getHandle().getVersion()
  click(button(host, '添加本页批注'))
  await settle(() => getHandle().getVersion() > version && !button(host, '保存到库').disabled)
  input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="新批注"]')!
  expect(document.activeElement).toBe(input)
  expect(input.value).toBe('')
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      '下一条批注草稿',
    )
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const saved = await save()
  expect(saved.session.metadata(0).comments.at(-1)?.text).toBe('请确认组合对象的最终排版')
  expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="新批注"]')!.value).toBe(
    '下一条批注草稿',
  )
  expect(document.activeElement).toBe(input)
  expect(host.textContent).toContain('请确认组合对象的最终排版')
  input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="新批注"]')!
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(document.activeElement).toBe(entry)
  const canvas = host.querySelector<HTMLElement>('.mimir-pptx-slide')!
  act(() => {
    canvas.focus()
    canvas.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: true,
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="新批注"]')!
  expect(document.activeElement).toBe(input)
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(document.activeElement).toBe(canvas)
})

it('does not steal external focus when an asynchronous comment addition finishes', async () => {
  let release!: () => void
  const gate = new Promise<void>((done) => {
    release = done
  })
  let started = false
  const { host, getHandle } = await mount(async (request) => {
    started = true
    await gate
    return applyPptxOpsOnHost(request)
  })
  const external = document.createElement('button')
  document.body.append(external)
  cleanup.push(() => external.remove())
  tab(host, '幻灯片')
  click(button(host, '新建批注'))
  const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="新批注"]')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      '异步批注',
    )
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const version = getHandle().getVersion()
  click(button(host, '添加本页批注'))
  await settle(() => started)
  act(() => external.focus())
  await act(async () => release())
  await settle(
    () => getHandle().getVersion() > version && !host.querySelector('fieldset[aria-busy="true"]'),
  )
  expect(input.value).toBe('')
  expect(document.activeElement).toBe(external)
})

it('uses one additive canvas/object/arrange selection without dirtying and supports keyboard clear/all/cycle', async () => {
  const { host, getHandle } = await mount()
  const version = getHandle().getVersion()
  click(textNode(host, '对象甲'))
  click(textNode(host, '对象乙'), { ctrlKey: true })
  expect(selected(host)).toHaveLength(2)
  expect(frozen(getHandle()).elementIds).toHaveLength(2)
  expect(button(host, '保存到库').disabled).toBe(true)
  tab(host, '对象')
  click(button(host, '对齐与组合'))
  const choices = [...host.querySelectorAll<HTMLButtonElement>('button[aria-label^="排列选择 "]')]
  expect(choices.filter((node) => node.getAttribute('aria-pressed') === 'true')).toHaveLength(2)
  click(choices.find((node) => node.getAttribute('aria-pressed') !== 'true')!)
  expect(selected(host)).toHaveLength(3)
  expect(frozen(getHandle()).elementIds).toHaveLength(3)
  const canvas = host.querySelector<HTMLElement>('.mimir-pptx-slide')!
  const key = (name: string, options: KeyboardEventInit = {}) =>
    act(() =>
      canvas.dispatchEvent(
        new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...options }),
      ),
    )
  key('Escape')
  expect(selected(host)).toHaveLength(0)
  key('ArrowLeft')
  expect(selected(host)[0]!.querySelector('[data-element-id]')).not.toBeNull()
  key('Escape')
  key('ArrowRight')
  expect(selected(host)).toHaveLength(1)
  key('ArrowRight', { shiftKey: true })
  expect(selected(host)).toHaveLength(2)
  key('ArrowRight', { shiftKey: true })
  expect(selected(host)).toHaveLength(3)
  key('a', { metaKey: true })
  expect(selected(host)).toHaveLength(3)
  expect(getHandle().getVersion()).toBe(version)
  expect(button(host, '保存到库').disabled).toBe(true)
})

it('bulk formats actual native objects atomically and keeps legacy aliases through reparse, undo/redo and two saves', async () => {
  const calls: Parameters<PptxHostApply>[0][] = []
  const { host, getHandle, save, apply, bytes } = await mount(async (request) => {
    calls.push(request)
    return applyPptxOpsOnHost(request)
  })
  click(textNode(host, '对象甲'))
  click(textNode(host, '对象乙'), { shiftKey: true })
  const refs = frozen(getHandle()).elementIds
  const original = await openPptxForEdit(bytes)
  expect(refs).toEqual(original.slides()[0]!.elements.slice(0, 2).map(elementCNvPrId))
  click(button(host, '打开对象选择与格式'))
  pickSelectOption(host, '批量加粗', '开启')
  pickSelectOption(host, '批量段落对齐', '右对齐')
  field(host, '批量字号（pt）', '26')
  field(host, '批量填充颜色', '#4472C4')
  field(host, '批量轮廓颜色', '#FF0000')
  field(host, '批量轮廓宽度（pt）', '2')
  await apply()
  expect(calls).toHaveLength(1)
  expect(calls[0]!.ops).toHaveLength(8)
  expect(frozen(getHandle()).elementIds).toEqual(refs)
  expect(selected(host)).toHaveLength(2)
  const first = await save()
  for (const element of first.session.slides()[0]!.elements.slice(0, 2)) {
    expect(textOfElement(element)!.paragraphs[0]!.runs[0]).toMatchObject({
      bold: true,
      fontSize: 26,
    })
    expect(textOfElement(element)!.paragraphs[0]!.align).toBe('right')
  }
  const zip = await entries(first.bytes),
    baseline = await entries(bytes)
  expect(zip['ppt/slides/slide1.xml']!.match(/<a:ln w="25400"/g)).toHaveLength(2)
  expect(zip['ppt/slides/slide1.xml']!.match(/<a:srgbClr val="4472C4"/g)).toHaveLength(2)
  expect(unchanged(zip)).toEqual(unchanged(baseline))
  expect(frozen(getHandle()).elementIds).toEqual(refs)
  click(button(host, '撤销'))
  const undone = await save()
  expect(await entries(undone.bytes)).toEqual(baseline)
  click(button(host, '重做'))
  const redone = await save()
  expect(await entries(redone.bytes)).toEqual(zip)
  // A second host edit after committed save must still address both original aliases.
  pickSelectOption(host, '批量倾斜', '开启')
  await apply()
  const second = await save()
  for (const element of second.session.slides()[0]!.elements.slice(0, 2))
    expect(textOfElement(element)!.paragraphs[0]!.runs[0]).toMatchObject({
      bold: true,
      italic: true,
      fontSize: 26,
    })
  expect(frozen(getHandle()).elementIds).toEqual(refs)
})

it('enters immediate group children, normalizes parent plus child and applies native group formatting only to chosen members', async () => {
  const calls: Parameters<PptxHostApply>[0][] = []
  const { host, getHandle, apply, save } = await mount(async (request) => {
    calls.push(request)
    return applyPptxOpsOnHost(request)
  })
  click(textNode(host, '成员甲'))
  expect(selected(host)).toHaveLength(1)
  expect(selected(host)[0]!.querySelector('[data-element-id]')).not.toBeNull()
  click(textNode(host, '成员甲'))
  expect(selected(host)).toHaveLength(1)
  expect(selected(host)[0]!.querySelector('[data-element-id]')).toBeNull()
  click(textNode(host, '成员乙'), { ctrlKey: true })
  expect(frozen(getHandle()).elementIds).toHaveLength(2)
  click(button(host, '打开对象选择与格式'))
  pickSelectOption(host, '批量加粗', '开启')
  field(host, '批量填充颜色', '#123456')
  await apply()
  expect(calls[0]!.ops).toHaveLength(4)
  for (const op of calls[0]!.ops) expect(op).toHaveProperty('group')
  const result = await save()
  const group = result.session.slides()[0]!.elements.find((item) => item.type === 'group')!
  if (group.type !== 'group') throw new Error('Missing group')
  for (const child of group.children)
    expect(textOfElement(child)!.paragraphs[0]!.runs[0]!.bold).toBe(true)
  for (const outside of result.session
    .slides()[0]!
    .elements.filter((item) => item.type !== 'group'))
    expect(textOfElement(outside)!.paragraphs[0]!.runs[0]!.bold).not.toBe(true)
  const list = host.querySelector('[role="listbox"][aria-label="选择幻灯片对象"]')!
  const groupOption = [...list.querySelectorAll('[role="option"]')].find((item) =>
    item.textContent?.includes('组合'),
  )!
  click(groupOption, { ctrlKey: true })
  // A parent subsumes both children; bulk styles never write either child twice.
  expect(frozen(getHandle()).elementIds).toHaveLength(1)
  expect(selected(host)).toHaveLength(1)
  pickSelectOption(host, '批量倾斜', '开启')
  await apply()
  expect(calls[1]!.ops).toHaveLength(2)
})

it('aborts an obsolete bulk picture-bullet host transaction when canvas selection changes and leaves no undo or dirty state', async () => {
  let release!: () => void
  const gate = new Promise<void>((done) => {
      release = done
    }),
    calls: Parameters<PptxHostApply>[0][] = []
  const { host, getHandle } = await mount(async (request) => {
    calls.push(request)
    await gate
    return applyPptxOpsOnHost(request)
  })
  click(textNode(host, '对象甲'))
  click(textNode(host, '对象乙'), { ctrlKey: true })
  click(button(host, '打开对象选择与格式'))
  await stagePictureBullet(host)
  const before = getHandle().getVersion()
  click(button(host, '应用对象格式'))
  await settle(() => calls.length === 1)
  tab(host, '开始')
  expect(button(host, '加粗（所选对象）').disabled).toBe(true)
  click(textNode(host, '成员甲'), { altKey: true })
  expect(calls[0]!.signal?.aborted).toBe(true)
  await act(async () => release())
  await settle(() => !host.querySelector('fieldset[aria-busy="true"]'))
  expect(getHandle().getVersion()).toBe(before)
  expect(button(host, '保存到库').disabled).toBe(true)
  expect(button(host, '撤销').disabled).toBe(true)
  expect(frozen(getHandle()).elementIds).toHaveLength(1)
})

it.each(['top', 'members'] as const)(
  'stages a picture-bullet file for %s and publishes one real host batch with saved history',
  async (scope) => {
    const calls: Parameters<PptxHostApply>[0][] = []
    const { host, bytes, getHandle, apply, save } = await mount(async (request) => {
      calls.push(request)
      return applyPptxOpsOnHost(request)
    })
    click(textNode(host, scope === 'top' ? '对象甲' : '成员甲'), { altKey: scope === 'members' })
    click(textNode(host, scope === 'top' ? '对象乙' : '成员乙'), {
      ctrlKey: true,
      altKey: scope === 'members',
    })
    expect(frozen(getHandle()).elementIds).toHaveLength(2)
    click(button(host, '打开对象选择与格式'))
    await stagePictureBullet(host)
    expect(calls).toHaveLength(0)
    expect(button(host, '保存到库').disabled).toBe(true)
    await apply()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.ops).toHaveLength(2)
    const changed = await save(),
      read = changed.session.slides()[0]!
    const targets =
      scope === 'top'
        ? read.elements.filter((item) => item.type !== 'group').slice(0, 2)
        : read.elements.flatMap((item) => (item.type === 'group' ? item.children : []))
    for (const target of targets)
      expect(textOfElement(target)!.paragraphs[0]!.bullet?.type).toBe('blip')
    click(button(host, '撤销'))
    expect(await entries((await save()).bytes)).toEqual(await entries(bytes))
    expect(button(host, '撤销').disabled).toBe(true)
    click(button(host, '重做'))
    expect(await entries((await save()).bytes)).toEqual(await entries(changed.bytes))
  },
)
it('applies existing Home font controls to a mixed multi-selection and a whole group in one undo step', async () => {
  const { host, getHandle, save } = await mount()
  click(textNode(host, '对象甲'))
  click(textNode(host, '对象乙'), { ctrlKey: true })
  tab(host, '开始')
  expect(button(host, '加粗（所选对象）').disabled).toBe(false)
  let before = getHandle().getVersion()
  click(button(host, '加粗（所选对象）'))
  await settle(
    () => getHandle().getVersion() > before && !host.querySelector('fieldset[aria-busy="true"]'),
  )
  const first = await save()
  for (const element of first.session.slides()[0]!.elements.slice(0, 2))
    expect(textOfElement(element)!.paragraphs[0]!.runs[0]!.bold).toBe(true)
  click(button(host, '撤销'))
  const undone = await save()
  for (const element of undone.session.slides()[0]!.elements.slice(0, 2))
    expect(textOfElement(element)!.paragraphs[0]!.runs[0]!.bold).not.toBe(true)
  click(textNode(host, '成员甲'))
  before = getHandle().getVersion()
  click(button(host, '倾斜（所选对象）'))
  await settle(
    () => getHandle().getVersion() > before && !host.querySelector('fieldset[aria-busy="true"]'),
  )
  const result = await save()
  const group = result.session.slides()[0]!.elements.find((item) => item.type === 'group')!
  if (group.type !== 'group') throw new Error('Missing group')
  for (const child of group.children)
    expect(textOfElement(child)!.paragraphs[0]!.runs[0]!.italic).toBe(true)
  for (const element of result.session
    .slides()[0]!
    .elements.filter((item) => item.type !== 'group'))
    expect(textOfElement(element)!.paragraphs[0]!.runs[0]!.italic).not.toBe(true)
})

it('stages rapid legacy group text input and applies once, preserving its caret across native reparse and saved commit', async () => {
  const { host, getHandle, save } = await mount()
  click(textNode(host, '成员甲'), { altKey: true })
  click(button(host, '打开对象选择与格式'))
  const refs = frozen(getHandle()).elementIds
  const edit = async (next: string, caret: number) => {
    const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
    expect(input).not.toBeNull()
    const version = getHandle().getVersion()
    for (const value of [next.slice(0, -1), next]) {
      act(() => {
        input.focus()
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
          input,
          value,
        )
        input.setSelectionRange(caret, caret)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      expect(input.disabled).toBe(false)
      expect(getHandle().getVersion()).toBe(version)
    }
    expect(host.textContent).toContain('文字草稿未应用')
    click(button(host, '应用成员文字'))
    await settle(
      () =>
        getHandle().getVersion() > version &&
        !host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!.disabled,
    )
    const after = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
    expect(after.value).toBe(next)
    expect([after.selectionStart, after.selectionEnd]).toEqual([caret, caret])
    expect(document.activeElement).toBe(after)
    expect(frozen(getHandle()).elementIds).toEqual(refs)
  }
  await edit('新成员甲', 1)
  await save()
  await edit('新新成员甲', 1)
  const result = await save()
  const group = result.session.slides()[0]!.elements.find((item) => item.type === 'group')!
  if (group.type !== 'group') throw new Error('Missing group')
  expect(
    textOfElement(group.children[0]!)!
      .paragraphs[0]!.runs.map((run) => run.text)
      .join(''),
  ).toBe('新新成员甲')
  expect(
    textOfElement(group.children[1]!)!
      .paragraphs[0]!.runs.map((run) => run.text)
      .join(''),
  ).toBe('成员乙')
})

it('cancels a canvas marquee with Escape before the editor clear-selection shortcut', async () => {
  const { host, getHandle } = await mount()
  click(textNode(host, '对象甲'))
  click(textNode(host, '对象乙'), { ctrlKey: true })
  const before = frozen(getHandle()).elementIds
  const canvas = host.querySelector<HTMLElement>('.mimir-pptx-slide')!
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 960,
    bottom: 540,
    width: 960,
    height: 540,
    toJSON: () => ({}),
  })
  const pointer = (type: string, x: number, y: number) =>
    act(() => {
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          isPrimary: true,
          button: 0,
          clientX: x,
          clientY: y,
        }),
      )
    })
  pointer('pointerdown', 5, 5)
  pointer('pointermove', 600, 300)
  expect(host.querySelector('.mimir-pptx-marquee')).not.toBeNull()
  act(() =>
    canvas.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    ),
  )
  pointer('pointerup', 600, 300)
  click(canvas)
  expect(host.querySelector('.mimir-pptx-marquee')).toBeNull()
  expect(frozen(getHandle()).elementIds).toEqual(before)
  expect(button(host, '保存到库').disabled).toBe(true)
})

it('returns Inspector Escape focus to the actual subbar trigger after canvas or object-row focus', async () => {
  const { host } = await mount()
  const canvas = host.querySelector<HTMLElement>('.mimir-pptx-slide')!
  const trigger = button(host, '打开对象选择与格式')
  act(() => canvas.focus())
  expect(document.activeElement).toBe(canvas)
  act(() => trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })))
  expect(document.activeElement).toBe(canvas)
  click(trigger)
  const inspector = host.querySelector<HTMLElement>('aside[aria-label="对象选择与格式面板"]')!
  expect(document.activeElement).toBe(inspector)
  const row = inspector.querySelector<HTMLButtonElement>('[role="option"]')!
  act(() => {
    row.focus()
    row.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
  })
  expect(host.querySelector('aside[aria-label="对象选择与格式面板"]')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

it('retains the accepted group caret after save and appends on refocus without manually resetting its range', async () => {
  const { host, getHandle, save } = await mount()
  click(textNode(host, '成员甲'), { altKey: true })
  click(button(host, '打开对象选择与格式'))
  const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
  const value = '成员甲 2027'
  const version = getHandle().getVersion()
  act(() => {
    input.focus()
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value)
    input.setSelectionRange(value.length, value.length)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  click(button(host, '应用成员文字'))
  await settle(() => getHandle().getVersion() > version && !button(host, '保存到库').disabled)
  const accepted = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
  expect(accepted.selectionStart).toBe(value.length)
  const saveButton = button(host, '保存到库')
  act(() => saveButton.focus())
  await save()
  expect(document.activeElement).toBe(saveButton)
  const afterSave = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
  act(() => afterSave.focus())
  expect([afterSave.selectionStart, afterSave.selectionEnd]).toEqual([value.length, value.length])
  const next =
    afterSave.value.slice(0, afterSave.selectionStart) +
    '!' +
    afterSave.value.slice(afterSave.selectionEnd)
  const committedVersion = getHandle().getVersion()
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      afterSave,
      next,
    )
    afterSave.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(getHandle().getVersion()).toBe(committedVersion)
  click(button(host, '应用成员文字'))
  await settle(
    () => getHandle().getVersion() > committedVersion && !button(host, '保存到库').disabled,
  )
  const result = await save()
  const group = result.session.slides()[0]!.elements.find((item) => item.type === 'group')!
  if (group.type !== 'group') throw new Error('Missing group')
  expect(
    textOfElement(group.children[0]!)!
      .paragraphs[0]!.runs.map((run) => run.text)
      .join(''),
  ).toBe(`${value}!`)
})

it('deletes a native slide comment and restores exact saved parts through undo and redo', async () => {
  const { host, getHandle, save } = await mount()
  tab(host, '幻灯片')
  click(button(host, '新建批注'))
  const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="新批注"]')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      '复核：仅本页批注',
    )
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  let version = getHandle().getVersion()
  click(button(host, '添加本页批注'))
  await settle(() => getHandle().getVersion() > version && !button(host, '保存到库').disabled)
  const added = await save()
  const comment = added.session.metadata(0).comments[0]!
  expect(comment.text).toBe('复核：仅本页批注')
  version = getHandle().getVersion()
  click(button(host, `删除批注 ${comment.idx}`))
  await settle(() => getHandle().getVersion() > version && !button(host, '保存到库').disabled)
  const deleted = await save()
  expect(deleted.session.metadata(0).comments).toEqual([])
  click(button(host, '撤销'))
  expect(await entries((await save()).bytes)).toEqual(await entries(added.bytes))
  click(button(host, '重做'))
  expect(await entries((await save()).bytes)).toEqual(await entries(deleted.bytes))
})

it.each(['close', 'selection'] as const)(
  'cancels a pending native comment on %s without dirtying or a history round',
  async (scenario) => {
    let release!: () => void
    const gate = new Promise<void>((done) => {
      release = done
    })
    const calls: Parameters<PptxHostApply>[0][] = []
    const { host, getHandle } = await mount(async (request) => {
      calls.push(request)
      await gate
      return applyPptxOpsOnHost(request)
    })
    tab(host, '幻灯片')
    click(button(host, '新建批注'))
    const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="新批注"]')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        input,
        '过期批注不得落地',
      )
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const version = getHandle().getVersion()
    click(button(host, '添加本页批注'))
    await settle(() => calls.length === 1)
    expect(input.disabled || !!input.closest('fieldset:disabled')).toBe(true)
    if (scenario === 'close') click(button(host, '关闭幻灯片属性面板'))
    else click(textNode(host, '对象甲'))
    expect(calls[0]!.signal?.aborted).toBe(true)
    await act(async () => release())
    await settle(() => !host.querySelector('fieldset[aria-busy="true"]'))
    expect(getHandle().getVersion()).toBe(version)
    expect(button(host, '保存到库').disabled).toBe(true)
    expect(button(host, '撤销').disabled).toBe(true)
    expect(host.querySelector('.mimir-pptx-comment-controls__thread article')).toBeNull()
  },
)
