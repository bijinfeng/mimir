/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { PptxEditor } from './PptxEditor.js'
import { openPptxForEdit, textOfElement } from '../pptx.js'
import * as pptxApi from '../pptx.js'
import type { PptxAgentHandle, PptxHostApply } from '../agent/pptx-agent.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import { elementDurableId } from '../../vendor/packages/pptx-engine/src/identity.js'
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
const click = (node: Element) =>
  act(() => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
function button(host: HTMLElement, name: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
  if (!node) throw new Error(name)
  return node
}
function tab(host: HTMLElement, name: string) {
  click([...host.querySelectorAll('[role="tab"]')].find((node) => node.textContent === name)!)
}
async function settle(done: () => boolean) {
  for (let i = 0; i < 500 && !done(); i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 3))
    })
  expect(done()).toBe(true)
}
async function textFixture() {
  const initial = await openPptxForEdit(
    new Uint8Array(
      readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/title-layout.pptx'),
      ),
    ),
  )
  const element = initial.slides()[0]!.elements.find((item) => textOfElement(item))!
  initial.setText(
    0,
    element.id,
    ['Alpha', 'Beta', 'Gamma'].map((text) => ({ runs: [{ text }] })),
  )
  return initial.save()
}
async function mount(
  hostApply: PptxHostApply = applyPptxOpsOnHost,
  sourceBytes?: Uint8Array,
  saveImpl?: (bytes: Uint8Array) => Promise<void>,
) {
  const bytes = sourceBytes ?? (await textFixture())
  const saved: Uint8Array[] = []
  let handle: PptxAgentHandle | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const render = () =>
    root.render(
      <PptxEditor
        documentId="selection-tools"
        io={{
          load: async () => bytes,
          save: async (next) => {
            await saveImpl?.(next)
            saved.push(next)
          },
        }}
        hostApply={hostApply}
        onAgentHandleChange={(next) => {
          handle = next
        }}
      />,
    )
  await act(async () => render())
  await settle(() => !!handle && !!host.querySelector('.mimir-pptx-slide svg'))
  const getHandle = () => {
    if (!handle) throw new Error('Missing handle')
    return handle
  }
  const save = async () => {
    const count = saved.length
    click(button(host, '保存到库'))
    await settle(() => saved.length === count + 1 && button(host, '保存到库').disabled)
    return openPptxForEdit(saved.at(-1)!)
  }
  return { host, getHandle, save, bytes, saved, render }
}
function selectBeta(host: HTMLElement) {
  const text = [...host.querySelectorAll('.mimir-pptx-slide text')].find(
    (node) => node.textContent === 'Beta',
  )!
  click(text)
  const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
  act(() => {
    input.focus()
    input.setSelectionRange(6, 10)
    input.dispatchEvent(new Event('select', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Shift' }))
  })
}
const read = (session: Awaited<ReturnType<typeof openPptxForEdit>>) =>
  textOfElement(
    session
      .slides()[0]!
      .elements.find((e) =>
        textOfElement(e)?.paragraphs.some((p) => p.runs.some((r) => r.text === 'Beta')),
      )!,
  )!.paragraphs

it('keeps the durable target and text range during an intervening render after native host reparse', async () => {
  const realOpen = pptxApi.openPptxForEdit
  let replaced = false
  let resume!: () => void
  const gate = new Promise<void>((done) => {
    resume = done
  })
  vi.spyOn(pptxApi, 'openPptxForEdit').mockImplementation(async (...args) => {
    const session = await realOpen(...args)
    const replace = session.replaceFromHost.bind(session)
    session.replaceFromHost = async (...input) => {
      await replace(...input)
      replaced = true
      await gate
    }
    return session
  })
  const { host, getHandle, render, save } = await mount()
  selectBeta(host)
  tab(host, '开始')
  click(button(host, '段落与文本框'))
  pickSelectOption(host, '段落对齐', '右对齐')
  const version = getHandle().getVersion()
  click(button(host, '应用段落格式'))
  await settle(() => replaced)
  await act(async () => render())
  expect(host.querySelector('textarea[aria-label="文本框文字"]')).not.toBeNull()
  await act(async () => resume())
  await settle(() => !host.querySelector('fieldset[aria-busy="true"]'))
  expect(getHandle().getVersion()).toBe(version + 1)
  expect(host.querySelector('.mimir-pptx-paragraph')?.textContent).toContain('第 2 段')
  expect(host.querySelector('.mimir-pptx-text-range__head')?.textContent).toContain('已选 4 个字符')
  pickSelectOption(host, '文字基础方向', '从右到左')
  click(button(host, '应用段落格式'))
  await settle(() => !host.querySelector('fieldset[aria-busy="true"]'))
  const paragraphs = read(await save())
  expect(paragraphs.map((p) => !!p.rtl)).toEqual([false, true, false])
})

it('retains Product updates in the original Agenda after host formatting and delayed textarea select events', async () => {
  const sourceBytes = new Uint8Array(
    readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../tests/fixtures/upstream/01_standard_business.pptx',
      ),
    ),
  )
  const { host, getHandle, save } = await mount(applyPptxOpsOnHost, sourceBytes)
  tab(host, '2')
  const text = [...host.querySelectorAll('.mimir-pptx-slide text')].find(
    (node) => node.textContent === 'Product updates',
  )!
  click(text)
  const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
  act(() => {
    input.focus()
    input.setSelectionRange(18, 33)
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Shift' }))
  })
  tab(host, '开始')
  click(button(host, '段落与文本框'))
  expect(host.querySelector('.mimir-pptx-paragraph')?.textContent).toContain('第 2 段')
  pickSelectOption(host, '段落对齐', '右对齐')
  const version = getHandle().getVersion()
  click(button(host, '应用段落格式'))
  await settle(
    () =>
      getHandle().getVersion() === version + 1 && !host.querySelector('fieldset[aria-busy="true"]'),
  )
  expect(
    host.querySelector('.mimir-pptx-paragraph')?.textContent,
    'immediately after accepted host apply',
  ).toContain('第 2 段')
  // Browsers may queue select after programmatic setSelectionRange and disable/enable.
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0))
    input.dispatchEvent(new Event('select', { bubbles: true }))
  })
  expect(host.querySelector('.mimir-pptx-paragraph')?.textContent).toContain('第 2 段')
  expect(host.querySelector('.mimir-pptx-text-range__head')?.textContent).toContain(
    '已选 15 个字符',
  )
  expect([input.selectionStart, input.selectionEnd]).toEqual([18, 33])
  pickSelectOption(host, '文字基础方向', '从右到左')
  click(button(host, '应用段落格式'))
  await settle(
    () =>
      getHandle().getVersion() === version + 2 && !host.querySelector('fieldset[aria-busy="true"]'),
  )
  click(button(host, '加粗（选中文字）'))
  const saved = await save()
  expect(host.querySelector('.mimir-pptx-paragraph')?.textContent).toContain('第 2 段')
  expect(host.querySelector('.mimir-pptx-text-range__head')?.textContent).toContain(
    '已选 15 个字符',
  )
  const body = saved
    .slides()[1]!
    .elements.map((element) => textOfElement(element))
    .find((value) =>
      value?.paragraphs.some((p) => p.runs.some((run) => run.text === 'Product updates')),
    )!
  expect(body.paragraphs.map((p) => p.align ?? 'left')).toEqual(['left', 'right', 'left'])
  expect(body.paragraphs.map((p) => !!p.rtl)).toEqual([false, true, false])
  expect(body.paragraphs.map((p) => p.runs.every((run) => !!run.bold))).toEqual([
    false,
    true,
    false,
  ])
  pickSelectOption(host, '文字基础方向', '从左到右')
  const savedVersion = getHandle().getVersion()
  click(button(host, '应用段落格式'))
  await settle(
    () =>
      getHandle().getVersion() === savedVersion + 1 &&
      !host.querySelector('fieldset[aria-busy="true"]'),
  )
  const afterSaveEdit = (await save())
    .slides()[1]!
    .elements.map((element) => textOfElement(element))
    .find((value) =>
      value?.paragraphs.some((p) => p.runs.some((run) => run.text === 'Product updates')),
    )!
  expect(afterSaveEdit.paragraphs.map((p) => p.rtl)).toEqual([undefined, false, undefined])
})

it('keeps caret marks through a successful save and applies them only to newly inserted text', async () => {
  const { host, getHandle, save } = await mount()
  selectBeta(host)
  click(button(host, '加粗（选中文字）'))
  const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
  act(() => {
    input.focus()
    input.setSelectionRange(6, 6)
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowLeft' }))
  })
  click(button(host, '倾斜（插入点）'))
  const version = getHandle().getVersion()
  await save()
  expect(getHandle().getVersion()).toBe(version + 1)
  expect(host.querySelector('.mimir-pptx-text-range__head')?.textContent).toContain('插入点格式')
  expect(button(host, '倾斜（插入点）').getAttribute('aria-pressed')).toBe('true')
  act(() => {
    input.dispatchEvent(
      new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: 'X' }),
    )
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      'Alpha\nXBeta\nGamma',
    )
    input.setSelectionRange(7, 7)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const saved = await save()
  const paragraphs = textOfElement(
    saved
      .slides()[0]!
      .elements.find((element) =>
        textOfElement(element)?.paragraphs.some((p) =>
          p.runs.some((run) => run.text.includes('Beta')),
        ),
      )!,
  )!.paragraphs
  expect(paragraphs[1]!.runs.some((run) => run.text === 'X' && run.italic)).toBe(true)
  expect(
    paragraphs[1]!.runs.filter((run) => run.text.includes('Beta')).every((run) => !run.italic),
  ).toBe(true)
})

it.each(['failure', 'version', 'selection'] as const)(
  'does not restore an obsolete saved range after %s changes',
  async (scenario) => {
    let resume!: () => void
    let saving = false
    const gate = new Promise<void>((done) => {
      resume = done
    })
    const { host, getHandle } = await mount(applyPptxOpsOnHost, undefined, async () => {
      saving = true
      await gate
      if (scenario === 'failure') throw new Error('Save failed')
    })
    selectBeta(host)
    click(button(host, '加粗（选中文字）'))
    const version = getHandle().getVersion()
    click(button(host, '保存到库'))
    await settle(() => saving)
    let concurrentResult: unknown = { ok: true }
    if (scenario === 'selection') {
      click(
        [...host.querySelectorAll('.mimir-pptx-slide text')].find(
          (node) => node.textContent === '第一条',
        )!,
      )
    } else if (scenario === 'version') {
      await act(async () => {
        concurrentResult = await getHandle().execute(
          'apply_ops',
          { ops: [{ op: 'setNotes', target: { slide: 0 }, text: 'Concurrent edit' }] },
          { expectedVersion: version },
        )
      })
    }
    await act(async () => resume())
    await settle(
      () => !host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!.disabled,
    )
    expect(concurrentResult).toMatchObject({ ok: true })
    expect(getHandle().getVersion()).toBe(version + (scenario === 'failure' ? 0 : 1))
    expect(host.querySelector('.mimir-pptx-text-range__head')?.textContent).toContain(
      scenario === 'failure' ? '已选 4 个字符' : '整个文本框',
    )
    expect(button(host, '保存到库').disabled).toBe(scenario === 'selection')
  },
)

it('still cancels a pending paragraph request when another object is selected', async () => {
  let resume!: () => void
  const gate = new Promise<void>((done) => {
    resume = done
  })
  const calls: Parameters<PptxHostApply>[0][] = []
  const bytes = new Uint8Array(
    readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../tests/fixtures/upstream/01_standard_business.pptx',
      ),
    ),
  )
  const { host, getHandle } = await mount(async (request) => {
    calls.push(request)
    await gate
    return applyPptxOpsOnHost(request)
  }, bytes)
  tab(host, '2')
  click(
    [...host.querySelectorAll('.mimir-pptx-slide text')].find(
      (node) => node.textContent === 'Product updates',
    )!,
  )
  const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
  act(() => {
    input.focus()
    input.setSelectionRange(18, 33)
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Shift' }))
  })
  tab(host, '开始')
  click(button(host, '段落与文本框'))
  pickSelectOption(host, '段落对齐', '右对齐')
  const version = getHandle().getVersion()
  click(button(host, '应用段落格式'))
  await settle(() => calls.length === 1)
  click(
    [...host.querySelectorAll('.mimir-pptx-slide text')].find(
      (node) => node.textContent === 'Agenda',
    )!,
  )
  expect(calls[0]!.signal?.aborted).toBe(true)
  await act(async () => resume())
  await settle(
    () => !host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!.disabled,
  )
  expect(getHandle().getVersion()).toBe(version)
  expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!.value).toBe(
    'Agenda',
  )
  expect(host.querySelector('.mimir-pptx-text-range__head')?.textContent).toContain('整个文本框')
  expect(button(host, '保存到库').disabled).toBe(true)
})

it('retains a real paragraph range after one host version change and saves/undoes/redoes only its paragraph patches', async () => {
  const { host, getHandle, save } = await mount()
  selectBeta(host)
  tab(host, '开始')
  click(button(host, '段落与文本框'))
  pickSelectOption(host, '段落对齐', '右对齐')
  expect(button(host, '保存到库').disabled).toBe(true)
  let before = getHandle().getVersion()
  click(button(host, '应用段落格式'))
  await settle(
    () =>
      getHandle().getVersion() === before + 1 && !host.querySelector('fieldset[aria-busy="true"]'),
  )
  pickSelectOption(host, '文字基础方向', '从右到左')
  before = getHandle().getVersion()
  click(button(host, '应用段落格式'))
  await settle(
    () =>
      getHandle().getVersion() === before + 1 && !host.querySelector('fieldset[aria-busy="true"]'),
  )
  let paragraphs = read(await save())
  expect(paragraphs.map((p) => p.align ?? 'left')).toEqual(['center', 'right', 'center'])
  expect(paragraphs.map((p) => !!p.rtl)).toEqual([false, true, false])
  click(button(host, '撤销'))
  paragraphs = read(await save())
  expect(paragraphs.map((p) => p.align ?? 'left')).toEqual(['center', 'right', 'center'])
  expect(paragraphs.map((p) => !!p.rtl)).toEqual([false, false, false])
  click(button(host, '重做'))
  paragraphs = read(await save())
  expect(paragraphs.map((p) => !!p.rtl)).toEqual([false, true, false])
})
it('clears a deleted durable selection and does not revive its old range when undo restores the object', async () => {
  const { host, getHandle, bytes } = await mount()
  selectBeta(host)
  const session = await openPptxForEdit(bytes)
  const element = session
    .slides()[0]!
    .elements.find((item) =>
      textOfElement(item)?.paragraphs.some((p) => p.runs.some((run) => run.text === 'Beta')),
    )!
  await act(async () => {
    const result = await getHandle().execute(
      'apply_ops',
      {
        ops: [{ op: 'deleteElement', target: { slide: 0, el: elementDurableId(element)! } }],
      },
      { expectedVersion: getHandle().getVersion() },
    )
    expect(result).toMatchObject({ ok: true })
  })
  expect(host.querySelector('textarea[aria-label="文本框文字"]')).toBeNull()
  click(button(host, '撤销'))
  expect(
    [...host.querySelectorAll('.mimir-pptx-slide text')].some(
      (node) => node.textContent === 'Beta',
    ),
  ).toBe(true)
  expect(host.querySelector('textarea[aria-label="文本框文字"]')).toBeNull()
  click(
    [...host.querySelectorAll('.mimir-pptx-slide text')].find(
      (node) => node.textContent === 'Gamma',
    )!,
  )
  expect(host.querySelector('.mimir-pptx-text-range__head')?.textContent).toContain('整个文本框')
})

it('does not abort its own slow native shape write, then selects the added shape and keeps one undo entry', async () => {
  let release!: () => void
  const gate = new Promise<void>((resume) => {
    release = resume
  })
  const calls: Parameters<PptxHostApply>[0][] = []
  const { host, getHandle, save } = await mount(async (request) => {
    calls.push(request)
    await gate
    return applyPptxOpsOnHost(request)
  })
  tab(host, '插入')
  click(button(host, '形状库'))
  pickSelectOption(host, '形状分类', '线条（5）')
  click(host.querySelector('[role="radio"][aria-label="箭头"]')!)
  click(button(host, '在画布绘制所选形状'))
  const surface = host.querySelector<SVGSVGElement>('.mimir-pptx-shape-insert-canvas')!
  expect(surface).not.toBeNull()
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 960,
    height: 540,
    right: 960,
    bottom: 540,
    toJSON() {},
  })
  const pointer = (type: string, x: number, y: number) =>
    act(() => {
      surface.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 1,
          button: 0,
          clientX: x,
          clientY: y,
          isPrimary: true,
        }),
      )
    })
  const version = getHandle().getVersion()
  pointer('pointerdown', 600, 350)
  pointer('pointermove', 300, 200)
  pointer('pointerup', 300, 200)
  await settle(() => calls.length === 1)
  expect(calls[0]!.signal?.aborted).toBe(false)
  expect(button(host, '保存到库').disabled).toBe(true)
  await act(async () => {
    release()
  })
  await settle(
    () =>
      getHandle().getVersion() === version + 1 &&
      !host.querySelector('.mimir-pptx-shape-insert-canvas'),
  )
  const changed = await save()
  const added = changed.slides()[0]!.elements.at(-1)!
  expect(added.transform.flipH).toBe(true)
  expect(added.transform.flipV).toBe(true)
  expect(host.querySelector('.mimir-pptx-slide .mimir-pptx-selected')).not.toBeNull()
  const count = changed.slides()[0]!.elements.length
  click(button(host, '撤销'))
  expect((await save()).slides()[0]!.elements).toHaveLength(count - 1)
  click(button(host, '重做'))
  expect((await save()).slides()[0]!.elements).toHaveLength(count)
})
