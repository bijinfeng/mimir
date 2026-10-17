/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { SlideElement } from '../../vendor/packages/pptx-engine/src/types.js'
import { PptxSelectionControls, type PptxSelectionControlsProps } from './PptxSelectionControls.js'
import { openSelect, pickSelectOption, selectValueText } from '../shell/antd-test-dom.js'
import { PPTX_SHAPE_STYLES } from './pptx-shape-presets.js'
import {
  ensureCreationId,
  elementDurableId,
} from '../../vendor/packages/pptx-engine/src/identity.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
const elements = [false, true, false].map((bold, i) => ({
  id: `runtime-${i}`,
  type: 'shape',
  name: `Object ${i + 1}`,
  anchor: {
    originalXml: `<p:sp><p:nvSpPr><p:cNvPr id="${i + 10}" name="Object ${i + 1}"/></p:nvSpPr></p:sp>`,
  },
  transform: { x: 0, y: 0, cx: 100, cy: 100 },
  fill: { type: 'solid', color: i ? '#FF0000' : '#FFFFFF' },
  text: {
    paragraphs: [
      {
        runs: [{ text: `Text ${i + 1}`, bold, fontSize: i ? 24 : 18, color: '#000000' }],
        align: 'left',
      },
    ],
  },
})) as unknown as SlideElement[]
function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const apply = vi.fn<PptxSelectionControlsProps['applyOps']>(async () => true)
  let props: PptxSelectionControlsProps = {
    elements,
    selectedRefs: ['e_10', 'e_11'],
    slide: 0,
    version: 1,
    sourceKey: 'doc-one',
    applyOps: apply,
    onSelectionChange: (refs) => {
      props = { ...props, selectedRefs: refs }
      render()
    },
  }
  const render = () => root.render(<PptxSelectionControls {...props} />)
  act(render)
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return {
    host,
    apply,
    getProps: () => props,
    change: (patch: Partial<PptxSelectionControlsProps>) =>
      act(() => {
        props = { ...props, ...patch }
        render()
      }),
    unmount: () => act(() => root.unmount()),
  }
}
function button(host: HTMLElement, label: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!found) throw new Error(`Missing ${label}`)
  return found
}
function input(host: HTMLElement, label: string, value: string) {
  act(() => {
    const field = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const click = (node: Element, patch = {}) =>
  act(() => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, ...patch }))
  })
function formatTab(host: HTMLElement, label: string) {
  const tab = [...host.querySelectorAll('.ant-segmented-item')].find(
    (item) => item.textContent === label,
  )
  if (!tab) throw new Error(`Missing format tab ${label}`)
  click(tab)
}
it('shows mixed values, visible labels and actual counts, stages only explicit changes in one batch', async () => {
  const view = mount()
  expect(selectValueText(view.host, '批量加粗')).toContain('混合')
  expect(
    view.host.querySelector('[aria-label="批量字号（pt）"]')!.getAttribute('placeholder'),
  ).toBe('混合')
  expect(view.host.textContent).toContain('文字与段落 · 2 个对象')
  expect(view.host.textContent).toContain('批量文字颜色')
  expect(button(view.host, '应用对象格式').disabled).toBe(true)
  pickSelectOption(view.host, '批量倾斜', '开启')
  expect(view.apply).not.toHaveBeenCalled()
  await act(async () => button(view.host, '应用对象格式').click())
  expect(view.apply).toHaveBeenCalledTimes(1)
  expect(view.apply.mock.calls[0]![0]).toEqual(
    ['e_10', 'e_11'].map((el) => ({
      op: 'setFont',
      target: { slide: 0, el },
      font: { italic: true },
    })),
  )
  expect(button(view.host, '应用对象格式').disabled).toBe(true)
})
it('shares controlled additive/range selection and retains row focus across selection/version drafts', () => {
  const view = mount()
  let rows = [...view.host.querySelectorAll<HTMLButtonElement>('[role="option"]')]
  act(() => rows[0]!.focus())
  click(rows[0]!)
  expect(view.getProps().selectedRefs).toEqual(['e_10'])
  expect((document.activeElement as HTMLElement).dataset.ref).toBe('e_10')
  rows = [...view.host.querySelectorAll<HTMLButtonElement>('[role="option"]')]
  click(rows[2]!, { shiftKey: true })
  expect(view.getProps().selectedRefs).toEqual(['e_10', 'e_11', 'e_12'])
  rows = [...view.host.querySelectorAll<HTMLButtonElement>('[role="option"]')]
  click(rows[1]!, { ctrlKey: true })
  expect(view.getProps().selectedRefs).toEqual(['e_10', 'e_12'])
  act(() => {
    const row = view.host.querySelector<HTMLButtonElement>('[data-ref="e_12"]')!
    row.focus()
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
  })
  expect((document.activeElement as HTMLElement).dataset.ref).toBe('e_10')
  view.change({ version: 2 })
  expect((document.activeElement as HTMLElement).dataset.ref).toBe('e_10')
})
it('guards duplicate submit, preserves rejected drafts and discards version/source changes and late completion', async () => {
  const view = mount()
  let finish!: (ok: boolean) => void
  view.apply.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  input(view.host, '批量字号（pt）', '32')
  click(button(view.host, '应用对象格式'))
  click(button(view.host, '正在应用对象格式'))
  expect(view.apply).toHaveBeenCalledTimes(1)
  expect(view.host.querySelector('.ant-select-disabled')).not.toBeNull()
  await act(async () => finish(false))
  expect(view.host.textContent).toContain('已保留草稿')
  expect(button(view.host, '应用对象格式').disabled).toBe(false)
  view.change({ version: 2 })
  expect(button(view.host, '应用对象格式').disabled).toBe(true)
  input(view.host, '批量填充颜色', 'bad')
  await act(async () => button(view.host, '应用对象格式').click())
  expect(view.host.textContent).toContain('颜色须使用')
  input(view.host, '批量填充颜色', '#4472C4')
  view.apply.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  click(button(view.host, '应用对象格式'))
  view.change({ sourceKey: 'doc-two' })
  await act(async () => finish(false))
  expect(view.host.textContent).not.toContain('已保留草稿')
  expect(button(view.host, '应用对象格式').disabled).toBe(true)
})
it('keeps object selection available without selection and disables unsupported formats explicitly', () => {
  const view = mount()
  view.change({ selectedRefs: [] })
  expect(view.host.textContent).toContain('从画布或上方列表选择对象')
  expect(view.host.querySelector('[aria-label="批量字号（pt）"]')).toBeNull()
  expect(view.host.querySelector('[role="option"]:disabled')).toBeNull()
  click(button(view.host, '选择全部顶层对象'))
  expect(view.getProps().selectedRefs).toHaveLength(3)
  input(view.host, '批量字号（pt）', '40')
  click(button(view.host, '重置对象格式草稿'))
  expect(button(view.host, '应用对象格式').disabled).toBe(true)
  view.change({ disabled: true })
  expect(view.host.querySelector('[role="option"]:not(:disabled)')).toBeNull()
})

it('retains the focused row and Shift range anchor after legacy aliases gain native creation IDs', () => {
  const view = mount()
  const first = view.host.querySelector<HTMLButtonElement>('[data-ref="e_10"]')!
  act(() => first.focus())
  click(first)
  const upgraded = structuredClone(elements)
  for (const element of upgraded) ensureCreationId(element)
  view.change({ version: 2, elements: upgraded })
  expect((document.activeElement as HTMLElement).dataset.ref).toBe(elementDurableId(upgraded[0]!))
  const rows = [...view.host.querySelectorAll<HTMLButtonElement>('[role="option"]')]
  click(rows[2]!, { shiftKey: true })
  expect(view.getProps().selectedRefs).toEqual(upgraded.map(elementDurableId))
})
it('shows current/mixed paragraph values, stages detail and outline across tabs into one explicit transaction', async () => {
  const view = mount()
  const source = structuredClone(elements)
  for (const [index, element] of source.entries()) {
    if (element.type !== 'shape') continue
    const p = element.text!.paragraphs[0]!
    p.rtl = !!index
    p.lineHeight = 125
    p.spaceBefore = index ? 6 : 4
    element.stroke = {
      width: 12700,
      fill: { type: 'solid', color: '#123456' },
      cap: index ? 'round' : 'flat',
      dash: 'dash',
      compound: 'dbl',
    }
  }
  view.change({ elements: source })
  formatTab(view.host, '段落')
  expect(selectValueText(view.host, '批量文字方向')).toContain('混合')
  expect(view.host.querySelector<HTMLInputElement>('[aria-label="批量行距（%）"]')!.value).toBe(
    '125',
  )
  expect(
    view.host.querySelector('[aria-label="批量段前（pt）"]')!.getAttribute('placeholder'),
  ).toBe('混合')
  input(view.host, '批量段后（pt）', '8.5')
  pickSelectOption(view.host, '批量文字方向', '从右向左')
  formatTab(view.host, '轮廓')
  expect(selectValueText(view.host, '批量端点样式')).toContain('混合')
  expect(selectValueText(view.host, '批量复合线条')).toContain('双线')
  pickSelectOption(view.host, '批量端点样式', '方头')
  expect(view.apply).not.toHaveBeenCalled()
  await act(async () => button(view.host, '应用对象格式').click())
  const ops = view.apply.mock.calls[0]![0]
  expect(ops).toHaveLength(4)
  expect(ops.filter((op) => op.op === 'setParagraphFormat').map((op) => op.format)).toEqual([
    { rtl: true, spaceAfterPt: 8.5 },
    { rtl: true, spaceAfterPt: 8.5 },
  ])
  expect(
    ops
      .filter((op) => op.op === 'setStroke')
      .every((op) => (op.stroke as { cap: string }).cap === 'sq'),
  ).toBe(true)
  expect(ops.some((op) => op.op === 'setFont')).toBe(false)
  expect(button(view.host, '应用对象格式').disabled).toBe(true)
})
it('retains detail tab across accepted versions and rejects invalid numbers without dropping failed drafts', async () => {
  const view = mount()
  formatTab(view.host, '段落')
  input(view.host, '批量行距（%）', '-5')
  await act(async () => button(view.host, '应用对象格式').click())
  expect(view.apply).not.toHaveBeenCalled()
  expect(view.host.textContent).toContain('请检查段落数值')
  input(view.host, '批量行距（%）', '150')
  view.apply.mockResolvedValueOnce(false)
  await act(async () => button(view.host, '应用对象格式').click())
  expect(view.host.textContent).toContain('已保留草稿')
  expect(view.host.querySelector<HTMLInputElement>('[aria-label="批量行距（%）"]')!.value).toBe(
    '150',
  )
  view.change({ version: 2 })
  expect(view.host.querySelector('[aria-label="批量行距（%）"]')).not.toBeNull()
  expect(button(view.host, '应用对象格式').disabled).toBe(true)
  input(view.host, '批量段前（pt）', '7')
  view.change({ sourceKey: 'new-source' })
  expect(view.host.querySelector('[aria-label="批量行距（%）"]')).toBeNull()
  expect(button(view.host, '应用对象格式').disabled).toBe(true)
})
it('retains original image bullets, displays fixed spacing and only writes explicitly chosen list details', async () => {
  const view = mount()
  const source = structuredClone(elements)
  for (const element of source) {
    if (element.type !== 'shape') continue
    Object.assign(element.text!.paragraphs[0]!, {
      lineExact: 18,
      spaceBeforePct: 75,
      bullet: { type: 'blip', mediaRef: 'ppt/media/bullet.png', sizePt: 12 },
    })
  }
  view.change({ elements: source })
  formatTab(view.host, '段落')
  expect(view.host.querySelector<HTMLInputElement>('[aria-label="批量行距（%）"]')!.value).toBe(
    '18 pt（固定）',
  )
  expect(view.host.querySelector<HTMLInputElement>('[aria-label="批量段前（pt）"]')!.value).toBe(
    '75%',
  )
  formatTab(view.host, '列表')
  expect(selectValueText(view.host, '批量列表类型')).toContain('图片符号')
  expect(view.host.textContent).toContain('未替换时保留各对象原图片')
  expect(view.host.querySelector<HTMLInputElement>('[aria-label="批量符号大小（%）"]')!.value).toBe(
    '12 pt（固定）',
  )
  input(view.host, '批量符号大小（%）', '110')
  input(view.host, '批量悬挂缩进（pt）', '12')
  await act(async () => button(view.host, '应用对象格式').click())
  expect(view.apply.mock.calls[0]![0].map((op) => op.format)).toEqual([
    { bulletSizePct: 110, bulletHangEmu: 152400 },
    { bulletSizePct: 110, bulletHangEmu: 152400 },
  ])
})
function imageReaderHarness(readFails = false) {
  const readers: Reader[] = []
  class Reader extends EventTarget {
    result: string | null = null
    readAsDataURL = vi.fn<() => void>(() => {
      if (readFails) throw new Error('Read unavailable')
    })
    abort = vi.fn<() => void>(() => {
      this.dispatchEvent(new Event('abort'))
    })
    constructor() {
      super()
      readers.push(this)
    }
    finish(value = 'data:image/png;base64,AAAA') {
      this.result = value
      this.dispatchEvent(new Event('load'))
    }
  }
  const original = globalThis.FileReader
  Object.assign(globalThis, { FileReader: Reader })
  cleanup.push(() => Object.assign(globalThis, { FileReader: original }))
  return readers
}
function chooseBulletImage(host: HTMLElement, file?: File) {
  const fileField = host.querySelector<HTMLInputElement>('[aria-label="批量图片项目符号文件"]')!
  act(() => {
    Object.defineProperty(fileField, 'files', { configurable: true, value: file ? [file] : [] })
    fileField.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
it.each(['png', 'jpeg'])(
  'stages %s picture bullets without publication and submits all targets with one fixed primary action',
  async (type) => {
    const readers = imageReaderHarness(),
      view = mount()
    const source = structuredClone(elements)
    source.slice(0, 2).forEach((element, i) => {
      if (element.type === 'shape')
        element.text!.paragraphs[0]!.bullet = { type: 'blip', mediaRef: `ppt/media/${i}.png` }
    })
    view.change({ elements: source })
    formatTab(view.host, '列表')
    expect(view.host.textContent).toContain('当前图片混合')
    chooseBulletImage(view.host)
    expect(readers).toHaveLength(0)
    chooseBulletImage(view.host, new File(['test'], `bullet.${type}`, { type: `image/${type}` }))
    expect(button(view.host, '应用对象格式').disabled).toBe(true)
    expect(view.apply).not.toHaveBeenCalled()
    act(() => readers[0]!.finish(`data:image/${type};base64,AAAA`))
    expect(view.host.textContent).toContain(`待应用：bullet.${type}`)
    expect(view.host.querySelectorAll('.mimir-pptx-selection-controls__actions')).toHaveLength(1)
    expect(view.apply).not.toHaveBeenCalled()
    view.apply.mockResolvedValueOnce(false)
    await act(async () => button(view.host, '应用对象格式').click())
    expect(view.apply.mock.calls[0]![0].map((op) => op.format)).toEqual(
      [0, 1].map(() => ({
        bullet: 'blip',
        bulletImage: { ext: type === 'png' ? 'png' : 'jpg', base64: 'AAAA' },
      })),
    )
    expect(view.host.textContent).toContain('已保留草稿')
    expect(view.host.textContent).toContain(`待应用：bullet.${type}`)
    view.apply.mockResolvedValueOnce(true)
    await act(async () => button(view.host, '应用对象格式').click())
    expect(view.apply).toHaveBeenCalledTimes(2)
    expect(button(view.host, '应用对象格式').disabled).toBe(true)
  },
)
it.each(['version', 'sourceKey', 'selectedRefs'] as const)(
  'aborts picture reads and ignores late load after %s changes',
  (field) => {
    const readers = imageReaderHarness(),
      view = mount()
    formatTab(view.host, '列表')
    chooseBulletImage(view.host, new File(['test'], 'late.png', { type: 'image/png' }))
    view.change(
      field === 'version'
        ? { version: 2 }
        : field === 'sourceKey'
          ? { sourceKey: 'next' }
          : { selectedRefs: ['e_12'] },
    )
    expect(readers[0]!.abort).toHaveBeenCalledOnce()
    act(() => readers[0]!.finish())
    expect(view.apply).not.toHaveBeenCalled()
    expect(button(view.host, '应用对象格式').disabled).toBe(true)
    expect(view.host.textContent).not.toContain('late.png')
    expect(view.host.querySelector('[role="alert"]')).toBeNull()
  },
)
it('retains readable image errors, blocks invalid image drafts and supports reset without writing', async () => {
  const readers = imageReaderHarness(),
    view = mount()
  formatTab(view.host, '列表')
  for (const file of [
    new File(['test'], 'bad.svg', { type: 'image/svg+xml' }),
    new File([], 'empty.png', { type: 'image/png' }),
    new File([new Uint8Array(524289)], 'huge.jpg', { type: 'image/jpeg' }),
  ]) {
    chooseBulletImage(view.host, file)
    expect(view.host.textContent).toContain('512 KiB')
    expect(readers).toHaveLength(0)
    await act(async () => button(view.host, '应用对象格式').click())
    expect(view.apply).not.toHaveBeenCalled()
  }
  chooseBulletImage(view.host, new File(['test'], 'read-error.png', { type: 'image/png' }))
  act(() => readers[0]!.dispatchEvent(new Event('error')))
  expect(view.host.textContent).toContain('图片读取失败')
  expect(button(view.host, '选择批量图片项目符号').disabled).toBe(false)
  click(button(view.host, '重置对象格式草稿'))
  expect(button(view.host, '应用对象格式').disabled).toBe(true)
  expect(view.apply).not.toHaveBeenCalled()
})
it('recovers controls when the file reader throws before starting', () => {
  imageReaderHarness(true)
  const view = mount()
  formatTab(view.host, '列表')
  chooseBulletImage(view.host, new File(['test'], 'unreadable.png', { type: 'image/png' }))
  expect(view.host.textContent).toContain('图片读取失败')
  expect(button(view.host, '选择批量图片项目符号').disabled).toBe(false)
  expect(view.apply).not.toHaveBeenCalled()
})
it('applies an explicit numbering scheme, stages range validation and disables composite detail fields while pending', async () => {
  const view = mount()
  formatTab(view.host, '列表')
  pickSelectOption(view.host, '批量列表类型', '自动编号')
  pickSelectOption(view.host, '批量编号格式', '一、二、三、')
  input(view.host, '批量起始编号', '3')
  let finish!: (ok: boolean) => void
  view.apply.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  click(button(view.host, '应用对象格式'))
  const select = view.host.querySelector('[aria-label="批量列表类型"]')!
  expect(select.closest('.ant-select-disabled')).not.toBeNull()
  expect(view.host.querySelectorAll('.ant-segmented-item-disabled')).toHaveLength(5)
  expect(view.apply.mock.calls[0]![0].map((op) => op.format)).toEqual([
    { bullet: 'number', numType: 'ea1ChsPeriod', startAt: 3 },
    { bullet: 'number', numType: 'ea1ChsPeriod', startAt: 3 },
  ])
  await act(async () => finish(true))
})

it('shows mixed gradient parameters, stages stop edits per object and keeps one apply action across tabs', async () => {
  const view = mount()
  const source = structuredClone(elements)
  source.forEach((element, i) => {
    if (element.type === 'shape')
      element.fill = {
        type: 'gradient',
        angle: i ? 5400000 : 2700000,
        stops: [
          { pos: 0, color: i ? '#FF000080' : '#00112280' },
          { pos: 0.4, color: '#778899' },
          { pos: 1, color: '#FFFFFF' },
        ],
      }
  })
  view.change({ elements: source })
  formatTab(view.host, '外观')
  expect(selectValueText(view.host, '批量填充类型')).toContain('渐变')
  expect(view.host.querySelector<HTMLInputElement>('[aria-label="批量渐变角度（°）"]')!.value).toBe(
    '',
  )
  expect(view.host.querySelector<HTMLInputElement>('[aria-label="批量色标颜色"]')!.value).toBe('')
  input(view.host, '批量渐变角度（°）', '120')
  pickSelectOption(view.host, '批量当前色标', '色标 2')
  input(view.host, '批量色标位置（%）', '')
  await act(async () => button(view.host, '应用对象格式').click())
  expect(view.apply).not.toHaveBeenCalled()
  expect(view.host.textContent).toContain('请输入色标位置')
  input(view.host, '批量色标位置（%）', '35.5')
  formatTab(view.host, '常用')
  expect(view.host.textContent).toContain('已暂存渐变填充')
  expect(view.host.querySelectorAll('.mimir-pptx-selection-controls__actions')).toHaveLength(1)
  await act(async () => button(view.host, '应用对象格式').click())
  expect(view.apply.mock.calls[0]![0].map((op) => op.fill)).toEqual(
    source.slice(0, 2).map((element) => ({
      angle: 7200000,
      stops:
        element.type === 'shape' && element.fill?.type === 'gradient'
          ? element.fill.stops.map((stop, i) => (i === 1 ? { ...stop, pos: 0.355 } : stop))
          : [],
    })),
  )
})

it('unifies gradient presets and supports extra alpha stops, path gradients and removal without immediate writes', async () => {
  const view = mount()
  formatTab(view.host, '外观')
  pickSelectOption(view.host, '批量填充类型', '渐变')
  const option = openSelect(view.host, '批量渐变预设')[0]!
  click(option)
  expect(selectValueText(view.host, '批量渐变预设')).not.toContain('选择预设')
  pickSelectOption(view.host, '批量渐变类型', '矩形路径')
  click(button(view.host, '添加批量渐变色标'))
  expect(selectValueText(view.host, '批量当前色标')).toContain('色标 3')
  input(view.host, '批量色标颜色', '#22446680')
  input(view.host, '批量色标位置（%）', '65')
  expect(view.apply).not.toHaveBeenCalled()
  await act(async () => button(view.host, '应用对象格式').click())
  expect(
    view.apply.mock.calls[0]![0].every((op) => (op.fill as { path: string }).path === 'rect'),
  ).toBe(true)
  expect((view.apply.mock.calls[0]![0][0]!.fill as { stops: unknown[] }).stops).toContainEqual({
    pos: 0.65,
    color: '#22446680',
  })
})

it('renders all 32 real style previews, navigates by keyboard and merges cross-tab overrides into one transaction', async () => {
  const view = mount()
  formatTab(view.host, '外观')
  formatTab(view.host, '组合样式')
  const styles = [
    ...view.host.querySelectorAll<HTMLButtonElement>('button[aria-label^="批量样式："]'),
  ]
  expect(styles).toHaveLength(32)
  expect(styles.every((style) => style.querySelector('svg'))).toBe(true)
  act(() => {
    styles[0]!.focus()
    styles[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
  })
  expect(document.activeElement).toBe(styles[31])
  expect(styles[31]!.getAttribute('aria-pressed')).toBe('true')
  expect(view.host.textContent).toContain(`待应用：${PPTX_SHAPE_STYLES[31]!.label}`)
  formatTab(view.host, '填充')
  expect(view.host.querySelector<HTMLInputElement>('[aria-label="批量纯色填充"]')!.value).toBe(
    PPTX_SHAPE_STYLES[31]!.fill,
  )
  input(view.host, '批量纯色填充', '#11223380')
  formatTab(view.host, '轮廓')
  pickSelectOption(view.host, '批量连接样式', '圆角')
  await act(async () => button(view.host, '应用对象格式').click())
  expect(view.apply).toHaveBeenCalledTimes(1)
  const ops = view.apply.mock.calls[0]![0]
  expect(ops).toHaveLength(4)
  expect(ops.filter((op) => op.op === 'setFill').map((op) => op.fill)).toEqual([
    '#11223380',
    '#11223380',
  ])
  expect(ops.filter((op) => op.op === 'setStroke').map((op) => op.stroke)).toEqual([
    expect.objectContaining({ dash: 'dash', join: 'round' }),
    expect.objectContaining({ dash: 'dash', join: 'round' }),
  ])
})

it('retains normal format drafts when image fill is locked and uses a single manual-fill footer with explicit reset', async () => {
  const view = mount(),
    applyFill = vi.fn<NonNullable<PptxSelectionControlsProps['applyFill']>>(async () => true)
  view.change({ applyFill })
  input(view.host, '批量字号（pt）', '32')
  formatTab(view.host, '外观')
  expect(view.host.textContent).toContain('应用或重置现有格式草稿')
  expect(
    openSelect(view.host, '批量填充类型')
      .find((item) => item.textContent === '内置纹理')!
      .classList.contains('ant-select-item-option-disabled'),
  ).toBe(true)
  act(() =>
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  click(button(view.host, '重置对象格式草稿'))
  pickSelectOption(view.host, '批量填充类型', '内置纹理')
  expect(view.host.querySelectorAll('button[aria-label^="批量纹理："]')).toHaveLength(8)
  expect(button(view.host, '应用对象填充').disabled).toBe(false)
  expect(view.host.querySelectorAll('.mimir-pptx-selection-controls__actions')).toHaveLength(1)
  const common = [...view.host.querySelectorAll('.ant-segmented-item')].find(
    (item) => item.textContent === '常用',
  )!
  expect(common.classList.contains('ant-segmented-item-disabled')).toBe(true)
  click(button(view.host, '重置对象格式草稿'))
  expect(button(view.host, '应用对象格式').disabled).toBe(true)
  expect(applyFill).not.toHaveBeenCalled()
  expect(view.apply).not.toHaveBeenCalled()
})

it('submits per-object current images once and retains failed image-fill drafts for retry', async () => {
  const view = mount(),
    applyFill = vi.fn<NonNullable<PptxSelectionControlsProps['applyFill']>>(async () => false)
  const source = structuredClone(elements)
  source.forEach((element, i) => {
    if (element.type === 'shape')
      element.fill = {
        type: 'image',
        mediaRef: `ppt/media/image${i}.png`,
        mode: i ? 'tile' : 'stretch',
      }
  })
  view.change({ elements: source, applyFill })
  formatTab(view.host, '外观')
  click(button(view.host, '批量拉伸当前图片'))
  await act(async () => button(view.host, '应用对象填充').click())
  expect(applyFill.mock.calls[0]![0]).toEqual({
    kind: 'selection',
    slide: 0,
    targets: [{ elementId: 'e_10' }, { elementId: 'e_11' }],
    source: { kind: 'current' },
    tile: false,
  })
  expect(view.host.textContent).toContain('已保留草稿')
  expect(selectValueText(view.host, '批量图片填充方式')).toContain('拉伸填满')
  applyFill.mockResolvedValueOnce(true)
  await act(async () => button(view.host, '应用对象填充').click())
  expect(applyFill).toHaveBeenCalledTimes(2)
  expect(view.apply).not.toHaveBeenCalled()
  expect(button(view.host, '应用对象格式').disabled).toBe(true)
})

it.each(['version', 'sourceKey', 'selectedRefs'] as const)(
  'cancels texture reads on %s changes without stale host writes',
  async (kind) => {
    const view = mount(),
      applyFill = vi.fn<NonNullable<PptxSelectionControlsProps['applyFill']>>(async () => true)
    let finish!: (value: Response) => void
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    view.change({ applyFill })
    formatTab(view.host, '外观')
    pickSelectOption(view.host, '批量填充类型', '内置纹理')
    click(button(view.host, '应用对象填充'))
    click(button(view.host, '正在应用对象填充'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const signal = fetchMock.mock.calls[0]![1]!.signal!
    view.change(
      kind === 'version'
        ? { version: 2 }
        : kind === 'sourceKey'
          ? { sourceKey: 'new-doc' }
          : { selectedRefs: ['e_12'] },
    )
    expect(signal.aborted).toBe(true)
    await act(async () =>
      finish({
        ok: true,
        arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer,
      } as Response),
    )
    expect(applyFill).not.toHaveBeenCalled()
    expect(view.host.querySelector('[role="alert"]')).toBeNull()
  },
)

it('retains texture errors and sends the chosen texture through manual_fill without apply_ops', async () => {
  const view = mount(),
    applyFill = vi.fn<NonNullable<PptxSelectionControlsProps['applyFill']>>(async () => true)
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('纹理暂不可用'))
  view.change({ applyFill })
  formatTab(view.host, '外观')
  pickSelectOption(view.host, '批量填充类型', '内置纹理')
  click(button(view.host, '批量纹理：木纹'))
  await act(async () => button(view.host, '应用对象填充').click())
  expect(view.host.textContent).toContain('纹理暂不可用；已保留草稿')
  expect(applyFill).not.toHaveBeenCalled()
  fetchMock.mockResolvedValueOnce({
    ok: true,
    arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer,
  } as Response)
  await act(async () => button(view.host, '应用对象填充').click())
  expect(applyFill).toHaveBeenCalledWith({
    kind: 'selection',
    slide: 0,
    targets: [{ elementId: 'e_10' }, { elementId: 'e_11' }],
    source: { kind: 'texture', id: 'wood', png: 'iVBORw==' },
    tile: true,
  })
  expect(view.apply).not.toHaveBeenCalled()
})

it('keeps line strokes in the style gallery while omitting lines from current fill values, counts and image-fill targets', async () => {
  const view = mount(),
    applyFill = vi.fn<NonNullable<PptxSelectionControlsProps['applyFill']>>(async () => true)
  const source = structuredClone(elements)
  if (source[2]!.type !== 'shape') throw new Error('Expected shape')
  source[2]!.presetGeometry = 'straightConnector1'
  source[2]!.fill = undefined
  view.change({ elements: source, selectedRefs: ['e_10', 'e_11', 'e_12'], applyFill })
  formatTab(view.host, '外观')
  expect(view.host.textContent).toContain('填充 · 2 个对象')
  expect(view.host.textContent).toContain('填充不含 1 条线条')
  pickSelectOption(view.host, '批量填充类型', '内置纹理')
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer,
  } as Response)
  await act(async () => button(view.host, '应用对象填充').click())
  expect(applyFill.mock.calls[0]![0]).toMatchObject({
    targets: [{ elementId: 'e_10' }, { elementId: 'e_11' }],
  })
  view.change({ selectedRefs: ['e_12'] })
  expect(view.host.textContent).toContain('线条可在组合样式或轮廓中调整')
  expect(view.host.querySelector('[aria-label="批量填充类型"]')).toBeNull()
  formatTab(view.host, '组合样式')
  click(button(view.host, '批量样式：蓝色·虚线描边'))
  await act(async () => button(view.host, '应用对象格式').click())
  expect(view.apply.mock.calls[0]![0]).toEqual([
    expect.objectContaining({
      op: 'setStroke',
      target: { slide: 0, el: 'e_12' },
      stroke: expect.objectContaining({ color: '#0A50A1', dash: 'dash' }),
    }),
  ])
})
