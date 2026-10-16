/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PptxParagraphControls, type PptxParagraphControlsProps } from './PptxObjectControls.js'
import { pickSelectOption, selectValueText } from '../shell/antd-test-dom.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanup: Array<() => void> = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
const settle = () =>
  act(async () => {
    await new Promise((done) => setTimeout(done, 0))
  })
function mount(patch: Partial<PptxParagraphControlsProps> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const apply = vi.fn<PptxParagraphControlsProps['apply']>(async () => true)
  const scoped = vi.fn<NonNullable<PptxParagraphControlsProps['applyParagraphFormat']>>(
    async () => true,
  )
  let props: PptxParagraphControlsProps = {
    text: {
      paragraphs: [
        {
          runs: [{ text: 'first' }],
          align: 'left',
          spaceBefore: 4,
          bullet: { type: 'char', char: '•', font: 'Arial' },
        },
        {
          runs: [{ text: 'second' }],
          align: 'right',
          spaceBefore: 8,
          bullet: { type: 'char', char: '★', font: 'Georgia' },
        },
        { runs: [{ text: 'third' }], align: 'left' },
      ],
    },
    target: { slide: 0, el: 'shape-A' },
    version: 4,
    selection: { start: 1, end: 13 },
    apply,
    applyParagraphFormat: scoped,
    ...patch,
  }
  const render = (update: Partial<PptxParagraphControlsProps> = {}) => {
    props = { ...props, ...update }
    act(() => root.render(<PptxParagraphControls {...props} />))
  }
  render()
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const click = (label: string) => {
    const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
    if (!button) throw new Error('Missing ' + label)
    act(() => button.click())
  }
  const field = (label: string) =>
    host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  const input = (label: string, value: string) =>
    act(() => {
      const node = field(label)
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value)
      node.dispatchEvent(new Event('input', { bubbles: true }))
    })
  return { host, scoped, apply, render, click, field, input, settle }
}
describe('PPTX paragraph inspector', () => {
  it('shows mixed values and the real scope; submits only edited fields once with end-exclusive paragraph indices', async () => {
    const view = mount()
    expect(view.host.textContent).toContain('第 1–2 段 · 共 2 段')
    expect(selectValueText(view.host, '段落对齐')).toContain('混合')
    expect(view.field('段前（pt）').value).toBe('')
    pickSelectOption(view.host, '段落对齐', '居中')
    expect(view.scoped).not.toHaveBeenCalled()
    view.click('应用段落格式')
    view.click('应用段落格式')
    await view.settle()
    expect(view.scoped).toHaveBeenCalledTimes(1)
    expect(view.scoped).toHaveBeenCalledWith({ align: 'center' }, [0, 1], expect.any(AbortSignal))
    expect(view.apply).not.toHaveBeenCalled()
    expect(
      view.host.querySelector('.mimir-pptx-paragraph__actions [aria-label="应用段落格式"]'),
    ).not.toBeNull()
  })
  it('permanently drops drafts on selection, target or version changes, including an A→B→A selection loop', async () => {
    const view = mount({ selection: { start: 6, end: 6 } })
    view.input('段前（pt）', '18')
    view.render({ selection: { start: 0, end: 0 } })
    view.render({ selection: { start: 6, end: 6 } })
    expect(view.field('段前（pt）').value).toBe('8')
    view.click('应用段落格式')
    await view.settle()
    expect(view.scoped).not.toHaveBeenCalled()
    view.input('段前（pt）', '19')
    view.render({ version: 5 })
    expect(view.field('段前（pt）').value).toBe('8')
    view.input('段前（pt）', '20')
    view.render({ target: { slide: 1, el: 'shape-B' } })
    expect(view.field('段前（pt）').value).toBe('8')
  })
  it('collects numbering details, exact font/glyph preset, color/size/hanging and keeps the chosen tab after a version update', async () => {
    const view = mount({ selection: { start: 6, end: 6 } })
    view.click('列表设置')
    pickSelectOption(view.host, '列表样式', '数字编号')
    pickSelectOption(view.host, '编号格式', 'I. II. III.')
    view.input('起始编号', '4')
    view.input('符号大小（%）', '125')
    view.input('悬挂缩进（pt）', '13.5')
    view.input('符号颜色', '#2255AA')
    view.click('应用段落格式')
    await view.settle()
    expect(view.scoped.mock.calls[0]?.slice(0, 2)).toEqual([
      {
        bullet: 'number',
        numType: 'romanUcPeriod',
        startAt: 4,
        bulletSizePct: 125,
        bulletHangEmu: 171450,
        bulletColor: '#2255AA',
      },
      [1],
    ])
    view.render({ version: 5 })
    expect(view.host.querySelector('[aria-label="列表设置"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    )
    view.click('对勾')
    view.click('应用段落格式')
    await view.settle()
    expect(view.scoped.mock.calls[1]?.[0]).toEqual({
      bullet: 'char',
      bulletChar: 'ü',
      bulletFont: 'Wingdings',
    })
  })
  it('aborts an in-flight apply when selection changes and refuses invalid numeric drafts without changing the document', async () => {
    const pending = vi.fn<NonNullable<PptxParagraphControlsProps['applyParagraphFormat']>>(
      () => new Promise(() => {}),
    )
    const view = mount({ applyParagraphFormat: pending })
    view.input('段前（pt）', 'bad')
    view.click('应用段落格式')
    await view.settle()
    expect(view.host.querySelector('[role="alert"]')?.textContent).toContain('请输入有效数字')
    expect(pending).not.toHaveBeenCalled()
    view.input('段前（pt）', '12')
    view.click('应用段落格式')
    await view.settle()
    const signal = pending.mock.calls[0]![2]
    expect(signal.aborted).toBe(false)
    expect(
      view.host
        .querySelector('[aria-label="段落对齐"]')
        ?.closest('.ant-select')
        ?.classList.contains('ant-select-disabled'),
    ).toBe(true)
    expect(
      view.host
        .querySelector('[aria-label="文字基础方向"]')
        ?.closest('.ant-select')
        ?.classList.contains('ant-select-disabled'),
    ).toBe(true)
    view.render({ selection: null })
    expect(signal.aborted).toBe(true)
    expect(view.host.textContent).toContain('整个文本框 · 3 段')
  })
  it('retains whole-textbox controls under a separate clearly named scope', async () => {
    const view = mount({ selection: { start: 6, end: 6 } })
    view.click('文本框设置')
    expect(view.host.textContent).toContain('整个文本框 · 即时应用')
    pickSelectOption(view.host, '文本垂直对齐', '中部')
    await view.settle()
    expect(view.apply).toHaveBeenCalledWith({
      op: 'setTextAnchor',
      target: { slide: 0, el: 'shape-A' },
      anchor: 'middle',
    })
    expect(view.scoped).not.toHaveBeenCalled()
  })
})
