/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as inkModule from './pptx-ink-raster.js'
import { PptxEditor } from './PptxEditor.js'
import { pptxSlideMoveOps } from './PptxWorkspaceViews.js'
import { openPptxForEdit } from '../pptx.js'
import { openPptx, savePptx } from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn, type Op } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import type { PptxAgentHandle, PptxHostApply } from '../agent/pptx-agent.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'

const fixtureBytes = new Uint8Array(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/title-layout.pptx'),
  ),
)
const fixture = (async () => {
  const session = await openPptxForEdit(fixtureBytes)
  session.duplicate(0)
  return session.save()
})()
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((close) => close())
  vi.restoreAllMocks()
})
async function settle(done: () => boolean) {
  for (let i = 0; i < 500 && !done(); i++)
    await act(async () => {
      await new Promise((tick) => setTimeout(tick, 3))
    })
  expect(done()).toBe(true)
}
function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}
function button(host: HTMLElement, label: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!node) throw new Error(label)
  return node
}
function mode(host: HTMLElement, label: string) {
  const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (node) => node.textContent === '视图',
  )!
  click(tab)
  click(button(host, `${label}视图`))
}
function press(node: Element, key: string, extras: KeyboardEventInit = {}) {
  act(() => {
    node.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extras }),
    )
  })
}
async function mount(hostApply?: PptxHostApply) {
  const saved: Uint8Array[] = [],
    dirty = vi.fn<(value: boolean) => void>()
  let handle: PptxAgentHandle | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => {
    root.render(
      <PptxEditor
        documentId="views"
        io={{
          load: async () => await fixture,
          save: async (bytes) => {
            saved.push(bytes)
          },
        }}
        hostApply={hostApply}
        onDirtyChange={dirty}
        onAgentHandleChange={(next) => {
          handle = next
        }}
      />,
    )
  })
  await settle(() => !!host.querySelector('.mimir-pptx-slide svg') && !!handle)
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return { host, saved, dirty, handle: () => handle! }
}
const realHost: PptxHostApply = async ({ bytes, ops, expectedVersion }) => {
  const opened = await openPptx(bytes)
  const result = runTxn(opened, { ops: ops as Op[], isolation: 'atomic' })
  if (!result.applied) throw new Error(result.failures?.[0]?.error)
  return {
    bytes: await savePptx(opened),
    version: expectedVersion + 1,
    records: result.records ?? [],
  }
}

describe('PPTX 工作区视图', () => {
  it('形状填充与背景整合保持内部滚动和独立底部操作，渐变预设明确分两行', async () => {
    const app = await mount(realHost)
    const style = document.createElement('style')
    style.textContent = ['pptx-tools.css', 'pptx-fill-controls.css']
      .map((name) => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), name), 'utf8'))
      .join('\n')
    document.head.append(style)
    cleanups.push(() => style.remove())
    click(app.host.querySelector('.mimir-pptx-slide [data-element-id]')!)
    for (const [tab, panel] of [
      ['对象', '形状填充'],
      ['幻灯片', '设置背景'],
    ]) {
      click(
        [...app.host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
          (node) => node.textContent === tab,
        )!,
      )
      click(button(app.host, panel!))
      const body = app.host.querySelector<HTMLElement>(
        `.mimir-pptx-inspector__body[data-panel="${panel}"]`,
      )!
      const inspector = body.closest<HTMLElement>('.mimir-pptx-inspector')!
      expect(getComputedStyle(inspector).width).toBe('320px')
      expect(getComputedStyle(inspector).boxSizing).toBe('border-box')
      const editor = body.querySelector<HTMLElement>('.mimir-pptx-fill-editor')!
      const content = editor.querySelector<HTMLElement>('.mimir-pptx-fill-editor__content')!
      const actions = editor.querySelector<HTMLElement>('.mimir-pptx-fill-editor__actions')!
      expect(getComputedStyle(body).display).toBe('flex')
      expect(getComputedStyle(body).minHeight).toBe('0')
      expect(getComputedStyle(body).overflow).toBe('hidden')
      expect(getComputedStyle(editor).minHeight).toBe('0')
      expect(getComputedStyle(content).overflow).toBe('auto')
      expect(getComputedStyle(actions).flexShrink).toBe('0')
      expect(content.contains(actions)).toBe(false)
      expect(actions.parentElement).toBe(editor)
      pickSelectOption(body, '填充类型', '渐变')
      const presets = [...body.querySelectorAll('.mimir-pptx-fill-gradient-presets button')]
      expect(presets).toHaveLength(8)
      for (const preset of presets) {
        const lines = [...preset.querySelectorAll('.mimir-pptx-fill-direction-label > span')]
        expect(lines).toHaveLength(2)
        expect(lines.every((line) => line.textContent?.length === 2)).toBe(true)
        expect(preset.getAttribute('aria-label')).toBe(
          `渐变：${lines[0]!.textContent}·${lines[1]!.textContent}`,
        )
        expect(getComputedStyle(lines[0]!).whiteSpace).toBe('nowrap')
      }
      click(button(app.host, '关闭幻灯片属性面板'))
    }
    expect(app.dirty.mock.calls.some(([value]) => value === true)).toBe(false)
  })
  it('多页块移动保持原序，原地移动不产生写操作', () => {
    expect(pptxSlideMoveOps(['a', 'b', 'c', 'd', 'e'], ['b', 'd'], 5)).toEqual([
      { op: 'moveSlide', target: { slide: 2 }, to: 1 },
      { op: 'moveSlide', target: { slide: 4 }, to: 2 },
    ])
    expect(pptxSlideMoveOps(['a', 'b', 'c'], ['b'], 2)).toEqual([])
    expect(pptxSlideMoveOps(['a', 'b', 'c'], ['b'], 0)).toEqual([
      { op: 'moveSlide', target: { slide: 1 }, to: 0 },
    ])
  })
  it('大纲读取真实文字并导航到可编辑画布；纯视图切换不增加版本或 dirty', async () => {
    const app = await mount(realHost),
      before = app.handle().getVersion()
    mode(app.host, '大纲')
    const entries = [...app.host.querySelectorAll<HTMLButtonElement>('.mimir-pptx-outline-item')]
    expect(entries).toHaveLength(2)
    expect(entries[0]!.textContent).toContain('用版式建的标题页')
    click(entries[1]!)
    expect(entries[1]!.getAttribute('aria-current')).toBe('page')
    expect(app.host.querySelector('.mimir-pptx-slide svg')?.textContent).toContain(
      '用版式建的标题页',
    )
    mode(app.host, '阅读')
    mode(app.host, '普通')
    expect(app.handle().getVersion()).toBe(before)
    expect(app.dirty.mock.calls.some(([value]) => value === true)).toBe(false)
    expect(button(app.host, '保存到库').disabled).toBe(true)
  })
  it('大纲旁的原编辑画布可直接改字，列表即时刷新且保存重开保留', async () => {
    const app = await mount(realHost)
    mode(app.host, '大纲')
    click(app.host.querySelector('.mimir-pptx-slide [data-element-id]')!)
    const field = app.host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
    expect(field).not.toBeNull()
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        field,
        '在大纲视图编辑的标题',
      )
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(app.host.querySelector('.mimir-pptx-outline-item strong')?.textContent).toBe(
      '在大纲视图编辑的标题',
    )
    click(button(app.host, '保存到库'))
    await settle(() => app.saved.length === 1 && button(app.host, '保存到库').disabled)
    const reopened = await openPptxForEdit(app.saved[0]!)
    expect(reopened.slides()[0]!.originalXml).toContain('在大纲视图编辑的标题')
    expect(reopened.slides()[1]!.originalXml).toContain('用版式建的标题页')
  })
  it('浏览排序走原子宿主且保存后撤销重做各保留正确页序', async () => {
    const hostApply = vi.fn<PptxHostApply>(realHost),
      app = await mount(hostApply)
    const original = (await openPptxForEdit(await fixture)).slides().map((slide) => slide.path)
    mode(app.host, '幻灯片浏览')
    expect(app.host.querySelectorAll('[role="option"][data-slide-index]')).toHaveLength(2)
    click(button(app.host, '后移所选幻灯片'))
    await settle(() => !button(app.host, '保存到库').disabled)
    expect(hostApply).not.toHaveBeenCalled() // moveSlide uses the guarded local executor.
    click(button(app.host, '保存到库'))
    await settle(() => app.saved.length === 1 && button(app.host, '保存到库').disabled)
    expect((await openPptxForEdit(app.saved[0]!)).slides().map((slide) => slide.path)).toEqual(
      original.toReversed(),
    )
    click(button(app.host, '撤销'))
    click(button(app.host, '保存到库'))
    await settle(() => app.saved.length === 2 && button(app.host, '保存到库').disabled)
    expect((await openPptxForEdit(app.saved[1]!)).slides().map((slide) => slide.path)).toEqual(
      original,
    )
    click(button(app.host, '重做'))
    click(button(app.host, '保存到库'))
    await settle(() => app.saved.length === 3 && button(app.host, '保存到库').disabled)
    expect((await openPptxForEdit(app.saved[2]!)).slides().map((slide) => slide.path)).toEqual(
      original.toReversed(),
    )
  })
  it('浏览支持键盘范围/全选与回到编辑；本地排序无需网络宿主', async () => {
    const app = await mount()
    mode(app.host, '幻灯片浏览')
    const view = app.host.querySelector<HTMLElement>('.mimir-pptx-sorter')!
    press(view, 'ArrowRight', { shiftKey: true })
    expect(app.host.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(2)
    press(view, 'a', { ctrlKey: true })
    expect(app.host.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(2)
    expect(button(app.host, '前移所选幻灯片').disabled).toBe(true)
    press(view, 'Enter')
    expect(app.host.querySelector('.mimir-pptx-slide svg')?.textContent).toContain(
      '用版式建的标题页',
    )
  })
  it('阅读在应用内适配原件比例，方向键翻页，Escape 回到普通且恢复入口焦点', async () => {
    const app = await mount()
    mode(app.host, '阅读')
    const reading = app.host.querySelector<HTMLElement>('.mimir-pptx-reading')!
    expect(document.activeElement).toBe(reading)
    expect(reading.style.getPropertyValue('--reading-ratio')).not.toBe('')
    press(reading, 'ArrowRight')
    expect(reading.textContent).toContain('第 2 / 2 页')
    expect(reading.querySelector('svg')?.textContent).toContain('用版式建的标题页')
    press(reading, 'Home')
    expect(reading.textContent).toContain('第 1 / 2 页')
    press(reading, 'Escape')
    await settle(() => document.activeElement === button(app.host, '普通视图'))
    expect(app.host.querySelector('.mimir-pptx-reading')).toBeNull()
    expect(app.saved).toHaveLength(0)
  })
  it('绘图请求在切阅读视图后取消，迟到宿主结果不会改变版本、dirty或历史', async () => {
    vi.spyOn(inkModule, 'rasterizeInk').mockReturnValue(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X9WQAAAAASUVORK5CYII=',
    )
    let finish: ((result: Awaited<ReturnType<PptxHostApply>>) => void) | undefined
    const hostApply = vi.fn<PptxHostApply>(
      async () =>
        new Promise((complete) => {
          finish = complete
        }),
    )
    const app = await mount(hostApply),
      version = app.handle().getVersion()
    const drawingTab = [...app.host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (node) => node.textContent === '绘图',
    )!
    click(drawingTab)
    click(
      [...app.host.querySelectorAll<HTMLButtonElement>('button')].find((node) =>
        node.getAttribute('aria-label')?.startsWith('笔预设1'),
      )!,
    )
    const canvas = app.host.querySelector<SVGSVGElement>('.mimir-pptx-ink-canvas')!
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 960, 720))
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
      })
      Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } })
      act(() => canvas.dispatchEvent(event))
    }
    pointer('pointerdown', 100, 100)
    pointer('pointermove', 180, 140)
    pointer('pointerup', 220, 150)
    await settle(() => hostApply.mock.calls.length === 1)
    expect(hostApply.mock.calls[0]![0].action).toBe('manual_ink')
    mode(app.host, '阅读')
    expect(hostApply.mock.calls[0]![0].signal?.aborted).toBe(true)
    await act(async () => {
      finish!({ bytes: await fixture, version: version + 1, changed: true, records: [] })
    })
    await settle(() => !app.host.querySelector('[aria-busy="true"]'))
    expect(app.handle().getVersion()).toBe(version)
    expect(app.dirty.mock.calls.some(([value]) => value === true)).toBe(false)
    expect(button(app.host, '撤销').disabled).toBe(true)
    expect(app.host.textContent).not.toContain('宿主处理期间画布已变化')
  })
})
