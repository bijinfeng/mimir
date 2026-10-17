/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import { PptxAiControls, type PptxAiControlsProps } from './PptxAiControls.js'
import { PPTX_AI_LANGUAGES } from './pptx-ai-presets.js'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
function click(element: Element) {
  act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
}
function named(host: HTMLElement, label: string) {
  const found = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
  if (!found) throw new Error(`Missing ${label}`)
  return found
}
function setup(extra: Partial<PptxAiControlsProps> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const onAiPreset = vi.fn<(instruction: string) => void>()
  const onSnapshot = vi.fn<() => void>()
  let props = {
    documentId: 'doc-1',
    slidePath: 'ppt/slides/slide4.xml',
    slideIndex: 2,
    version: 7,
    onAiPreset,
    onSnapshot,
    ...extra,
  }
  const render = () =>
    root.render(
      <ConfigProvider componentSize="small">
        <PptxAiControls {...props} />
      </ConfigProvider>,
    )
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  act(() => render())
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return {
    host,
    onAiPreset,
    onSnapshot,
    update: (next: Partial<PptxAiControlsProps>) => {
      props = { ...props, ...next }
      act(() => render())
    },
  }
}

it.each([
  ['事实核查', '可核验的来源'],
  ['生成配图', '先读取本页内容与布局'],
  ['拼写检查', '逐页检查这份演示文稿'],
])(
  'prepares a readable %s draft with an identifiable page and current unsaved content',
  (label, expected) => {
    const { host, onAiPreset } = setup()
    click(named(host, label))
    expect(onAiPreset).toHaveBeenCalledOnce()
    const text = onAiPreset.mock.calls[0]![0]
    expect(text).toContain(expected)
    expect(text).toContain('准备指令时的第 3 页（页面标识：s_4）')
    expect(text).toContain('先读取当前未保存的内容和布局')
    expect(text).toContain('按页面标识找到最新位置')
    expect(text).not.toMatch(
      /doc-1|ppt\/slides|slideIndex|read_slide|画布版本|文档 ID|data:image|base64|已附加截图|已修改|已美化|已插入图片/,
    )
  },
)

it('offers all eight upstream translation targets and keeps the original format instruction', () => {
  const { host, onAiPreset } = setup({ section: 'review' })
  for (const language of PPTX_AI_LANGUAGES) {
    click(named(host, '翻译本页'))
    const items = host.querySelectorAll('[role="menuitem"]')
    expect(items).toHaveLength(8)
    click([...items].find((item) => item.textContent === `翻译为${language}`)!)
    expect(onAiPreset.mock.lastCall![0]).toContain(`翻译成${language}`)
    expect(onAiPreset.mock.lastCall![0]).toContain('保持版式、字号和配色不变')
  }
  expect(onAiPreset).toHaveBeenCalledTimes(8)
})

it('uses the latest page at activation without dumping version metadata into the draft', () => {
  const { host, onAiPreset, update } = setup({ section: 'create' })
  expect(host.querySelectorAll('button')).toHaveLength(3)
  expect(host.textContent).not.toContain('翻译')
  update({ section: 'review', slideIndex: 5, slidePath: 'ppt/slides/slide8.xml', version: 9 })
  expect(host.querySelectorAll('button')).toHaveLength(2)
  expect(host.textContent).not.toContain('美化本页')
  click(named(host, '拼写检查'))
  expect(onAiPreset.mock.lastCall![0]).toContain('第 6 页（页面标识：s_8）')
  expect(onAiPreset.mock.lastCall![0]).not.toMatch(/画布版本|ppt\/slides|slideIndex/)
})

it.each([
  [{ onAiPreset: undefined, onSnapshot: undefined }, '当前宿主没有接入截图草稿'],
  [{ disabled: true }, '请等待当前编辑操作完成'],
  [{ slidePath: '' }, '请先打开可编辑的幻灯片'],
])('keeps unavailable commands explicit and never prepares a draft: %j', (extra, reason) => {
  const { host, onAiPreset } = setup(extra)
  expect(named(host, '美化本页').disabled).toBe(true)
  expect(named(host, '美化本页').title).toBe(reason)
  click(named(host, '美化本页'))
  click(named(host, '翻译本页'))
  const items = host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
  expect(items).toHaveLength(8)
  expect([...items].every((item) => item.disabled)).toBe(true)
  click(items[0]!)
  expect(onAiPreset).not.toHaveBeenCalled()
})

it('requests a real screenshot draft and offers a cancellable pending action without string fallback', () => {
  const { host, onAiPreset, onSnapshot, update } = setup()
  click(named(host, '美化本页'))
  expect(onSnapshot).toHaveBeenCalledOnce()
  expect(onAiPreset).not.toHaveBeenCalled()
  update({ snapshotPending: true, disabled: true })
  expect(named(host, '取消准备美化草稿').disabled).toBe(false)
  click(named(host, '取消准备美化草稿'))
  expect(onSnapshot).toHaveBeenCalledTimes(2)
})
