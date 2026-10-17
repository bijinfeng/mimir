/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { openPptx, savePptx } from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn, type Op } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import { openPptxForEdit } from '../pptx.js'
import { selectionFixture } from './pptx-selection-test-fixture.js'
import { pptxSelectionContexts, pptxSelectionText } from './pptx-selection.js'
import { PptxGroupTextControls, type PptxGroupTextControlsProps } from './PptxGroupTextControls.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
async function setup(rich = false) {
  const source = await selectionFixture()
  let bytes = source.bytes
  if (rich) {
    const opened = await openPptx(bytes)
    const first = pptxSelectionContexts(source.elements).find((item) => item.depth === 1)!
    const result = runTxn(opened, {
      isolation: 'atomic',
      ops: [
        {
          op: 'setText',
          group: first.group,
          target: { slide: 0, el: first.ref },
          paragraphs: [
            {
              runs: [
                { text: 'Alpha ', bold: true, fontSize: 18, color: '#123456' },
                { text: 'Beta', italic: true, fontSize: 24, color: '#654321' },
              ],
            },
            { runs: [{ text: 'Tail', underline: true, fontSize: 20 }] },
          ],
        },
      ],
    })
    if (!result.applied) throw new Error(JSON.stringify(result.failures))
    bytes = await savePptx(opened)
  }
  const parsed = await openPptxForEdit(bytes)
  let member = pptxSelectionContexts(parsed.slides()[0]!.elements).find((item) => item.depth === 1)!
  let version = 1
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const apply = vi.fn<PptxGroupTextControlsProps['applyOps']>(async (ops) => {
    const opened = await openPptx(bytes)
    const result = runTxn(opened, { isolation: 'atomic', ops: ops as Op[] })
    expect(result.failures ?? []).toEqual([])
    expect(result.applied).toBe(true)
    bytes = await savePptx(opened)
    const read = await openPptxForEdit(bytes)
    member = pptxSelectionContexts(read.slides()[0]!.elements).find(
      (row) => row.ref === member.ref,
    )!
    version++
    render()
    return true
  })
  const render = () =>
    root.render(
      <PptxGroupTextControls
        element={pptxSelectionText(member)!}
        target={{ slide: 0, el: member.ref }}
        group={member.group!}
        version={version}
        applyOps={apply}
      />,
    )
  await act(async () => render())
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return {
    host,
    apply,
    bytes: () => bytes,
    unmount: () => act(() => root.unmount()),
    change: () =>
      act(() => {
        version++
        render()
      }),
  }
}
function input(area: HTMLTextAreaElement, value: string) {
  act(() => {
    area.focus()
    area.setSelectionRange(area.value.length, area.value.length)
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, value)
    area.setSelectionRange(value.length, value.length)
    area.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function button(host: HTMLElement, label: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!node) throw new Error(`Missing ${label}`)
  return node
}
async function submit(view: Awaited<ReturnType<typeof setup>>) {
  await act(async () => {
    button(view.host, '应用成员文字').click()
    await view.apply.mock.results.at(-1)!.value
  })
}
it('keeps rapid typing local and editable, then applies one native transaction and preserves sibling through consecutive saves', async () => {
  const view = await setup()
  const draftArea = view.host.querySelector('textarea')!
  for (const character of ' 2027') {
    input(draftArea, draftArea.value + character)
    expect(draftArea.disabled).toBe(false)
    expect(document.activeElement).toBe(draftArea)
  }
  expect(view.host.querySelector('textarea')).toBe(draftArea)
  expect(draftArea.value).toBe('First 2027')
  expect(view.host.textContent).toContain('文字草稿未应用')
  expect(view.apply).not.toHaveBeenCalled()
  await submit(view)
  expect(view.apply).toHaveBeenCalledTimes(1)
  expect(view.apply.mock.calls[0]![0][0]).toMatchObject({
    op: 'setText',
    group: expect.any(String),
    target: { slide: 0, el: expect.any(String) },
  })
  const nextArea = view.host.querySelector('textarea')!
  expect(nextArea.value).toBe('First 2027')
  expect([nextArea.selectionStart, nextArea.selectionEnd]).toEqual([10, 10])
  expect(document.activeElement).toBe(nextArea)
  input(nextArea, 'First 2027 again')
  await submit(view)
  const session = await openPptxForEdit(view.bytes())
  const once = await session.save()
  session.commit()
  const twice = await (await openPptxForEdit(once)).save()
  const contexts = pptxSelectionContexts(
    (await openPptxForEdit(twice)).slides()[0]!.elements,
  ).filter((item) => item.depth === 1)
  expect(
    pptxSelectionText(contexts[0]!)!
      .text!.paragraphs[0]!.runs.map((run) => run.text)
      .join(''),
  ).toBe('First 2027 again')
  expect(pptxSelectionText(contexts[0]!)!.text!.paragraphs[0]!.runs[0]).toMatchObject({
    fontSize: 18,
    bold: false,
  })
  expect(pptxSelectionText(contexts[1]!)!.text!.paragraphs[0]!.runs[0]).toMatchObject({
    text: 'Second',
    fontSize: 24,
    bold: true,
  })
})
it('preserves multiple original runs and paragraphs when applying a full text draft once', async () => {
  const view = await setup(true)
  input(view.host.querySelector('textarea')!, 'Alpha Beta\nTail 2027')
  await submit(view)
  const saved = await openPptxForEdit(view.bytes())
  const read = await openPptxForEdit(await saved.save())
  const member = pptxSelectionContexts(read.slides()[0]!.elements).find((item) => item.depth === 1)!
  const paragraphs = pptxSelectionText(member)!.text!.paragraphs
  expect(paragraphs).toHaveLength(2)
  expect(paragraphs[0]!.runs).toMatchObject([
    { text: 'Alpha ', bold: true, fontSize: 18, color: '#123456' },
    { text: 'Beta', italic: true, fontSize: 24, color: '#654321' },
  ])
  expect(paragraphs[1]!.runs.map((run) => run.text).join('')).toBe('Tail 2027')
  for (const run of paragraphs[1]!.runs)
    expect(run).toMatchObject({ underline: true, fontSize: 20 })
})
it('cancels drafts, clears external version changes, preserves failed drafts and ignores stale completion', async () => {
  const view = await setup()
  input(view.host.querySelector('textarea')!, 'Cancelled')
  act(() => button(view.host, '取消文字草稿').click())
  expect(view.host.querySelector('textarea')!.value).toBe('First')
  expect(view.apply).not.toHaveBeenCalled()
  input(view.host.querySelector('textarea')!, 'External')
  view.change()
  expect(view.host.querySelector('textarea')!.value).toBe('First')
  let finish!: (ok: boolean) => void
  view.apply.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  input(view.host.querySelector('textarea')!, 'Changed')
  act(() => button(view.host, '应用成员文字').click())
  expect(button(view.host, '正在应用成员文字').disabled).toBe(true)
  expect(view.apply).toHaveBeenCalledTimes(1)
  await act(async () => finish(false))
  expect(view.host.textContent).toContain('已保留草稿')
  expect(view.host.querySelector('textarea')!.value).toBe('Changed')
  view.apply.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  act(() => button(view.host, '应用成员文字').click())
  view.change()
  await act(async () => finish(false))
  expect(view.host.textContent).not.toContain('已保留草稿')
  expect(view.host.querySelector('textarea')!.value).toBe('First')
  input(view.host.querySelector('textarea')!, 'Late')
  view.apply.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  act(() => button(view.host, '应用成员文字').click())
  view.unmount()
  await act(async () => finish(false))
  expect(view.host.textContent).toBe('')
})

it('does not steal external focus when a delayed accepted text apply completes', async () => {
  const view = await setup()
  const native = view.apply.getMockImplementation()!
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  view.apply.mockImplementationOnce(async (ops) => {
    await gate
    return native(ops)
  })
  input(view.host.querySelector('textarea')!, 'First external')
  act(() => button(view.host, '应用成员文字').click())
  const external = document.createElement('input')
  document.body.append(external)
  cleanup.push(() => external.remove())
  external.focus()
  await act(async () => {
    release()
    await view.apply.mock.results[0]!.value
  })
  expect(document.activeElement).toBe(external)
  expect(view.host.querySelector('textarea')!.value).toBe('First external')
})

it('retains an accepted caret through unchanged save versions without refocusing the external save action', async () => {
  const view = await setup()
  input(view.host.querySelector('textarea')!, 'First 2027')
  await submit(view)
  let area = view.host.querySelector('textarea')!
  expect(area.selectionStart).toBe(10)
  const save = document.createElement('button')
  document.body.append(save)
  cleanup.push(() => save.remove())
  act(() => save.focus())
  view.change()
  expect(document.activeElement).toBe(save)
  area = view.host.querySelector('textarea')!
  expect([area.selectionStart, area.selectionEnd]).toEqual([10, 10])
  act(() => area.focus())
  const insertion = area.selectionStart
  const next = area.value.slice(0, insertion) + ' Q4' + area.value.slice(area.selectionEnd)
  input(area, next)
  expect(area.value).toBe('First 2027 Q4')
  await submit(view)
  area = view.host.querySelector('textarea')!
  act(() => {
    area.focus()
    area.setSelectionRange(2, 5, 'backward')
    area.dispatchEvent(new Event('select', { bubbles: true }))
    save.focus()
  })
  view.change()
  expect(document.activeElement).toBe(save)
  area = view.host.querySelector('textarea')!
  expect([area.selectionStart, area.selectionEnd, area.selectionDirection]).toEqual([
    2,
    5,
    'backward',
  ])
})
