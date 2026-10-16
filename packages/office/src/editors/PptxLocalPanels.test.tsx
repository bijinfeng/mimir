/** @vitest-environment happy-dom */
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PptxMasterControls } from './PptxMasterControls.js'
import type { PptxUpload } from './PptxAssetControls.js'
import { PptxModelControls } from './PptxModelControls.js'
import { PptxOutputControls } from './PptxOutputControls.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import type { PptxManualAsset } from '@mimir/shared'
vi.mock('@google/model-viewer', () => ({}))
const mounted: (() => void)[] = []
afterEach(() => {
  for (const unmount of mounted) unmount()
  mounted.length = 0
  vi.restoreAllMocks()
})
async function mount(content: ReactNode) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => {
    root.render(<ConfigProvider componentSize="small">{content}</ConfigProvider>)
    await Promise.resolve()
  })
  mounted.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return host
}
describe('PPTX persistent local tool panels', () => {
  it('shows actual master values and visible apply/delete actions, sending only the chosen native part', async () => {
    const part = {
      partPath: 'ppt/slideMasters/slideMaster1.xml',
      kind: 'master',
      name: '测试母版',
      svg: '<svg/>',
      elements: [
        {
          id: 'native-1',
          name: '标题',
          type: 'text',
          text: '原件文字',
          fill: '#DC2626',
          strokeColor: '#16A34A',
          strokeWidth: 2,
          box: { x: 10, y: 20, width: 300, height: 80, rotation: 0 },
        },
      ],
    }
    const execute = vi
      .fn<(input: PptxManualAsset) => Promise<Record<string, unknown> | null>>()
      .mockResolvedValue({ parts: [part] })
    const host = await mount(<PptxMasterControls execute={execute} />)
    pickSelectOption(host, '母版对象', '标题 · text')
    expect((host.querySelector('[aria-label="对象文字"]') as HTMLTextAreaElement).value).toBe(
      '原件文字',
    )
    expect((host.querySelector('[aria-label="填充色（#RRGGBB）"]') as HTMLInputElement).value).toBe(
      '#DC2626',
    )
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="应用母版填充"]')!
    expect(button.textContent).toBe('应用母版填充')
    expect(host.querySelector('button[aria-label="删除母版对象"]')?.textContent).toBe(
      '删除母版对象',
    )
    await act(async () => {
      button.click()
      await Promise.resolve()
    })
    expect(execute).toHaveBeenLastCalledWith({
      kind: 'master_edit',
      part: part.partPath,
      elementId: 'native-1',
      operation: { action: 'fill', color: '#DC2626' },
    })
  })
  it('shows a visible model file picker and keeps insertion disabled before preview', async () => {
    const host = await mount(
      <PptxModelControls slide={0} upload={vi.fn<PptxUpload>().mockResolvedValue(true)} />,
    )
    expect(host.querySelector('button[aria-label="选择 GLB 模型"]')?.textContent).toBe(
      '选择 GLB 模型',
    )
    expect(
      host.querySelector<HTMLButtonElement>('button[aria-label="插入模型与当前封面"]')?.disabled,
    ).toBe(true)
  })
  it('rejects an oversized GLB before reading its bytes', async () => {
    const host = await mount(
      <PptxModelControls slide={0} upload={vi.fn<PptxUpload>().mockResolvedValue(true)} />,
    )
    const file = new File([], 'too-large.glb', { type: 'model/gltf-binary' })
    const read = vi.fn<() => Promise<ArrayBuffer>>().mockResolvedValue(new ArrayBuffer(0))
    Object.defineProperties(file, {
      size: { value: 32 * 1024 * 1024 + 1 },
      arrayBuffer: { value: read },
    })
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('32 MiB')
    expect(read).not.toHaveBeenCalled()
  })
  it('keeps invalid existing models out of the viewer and exposes an actionable error', async () => {
    const upload = vi.fn<PptxUpload>().mockResolvedValue(true)
    const host = await mount(
      <PptxModelControls
        slide={0}
        upload={upload}
        existing={{ bytes: new Uint8Array(10), name: 'bad.glb' }}
      />,
    )
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('28 字节')
    expect(host.querySelector('model-viewer')).toBeNull()
    expect(upload).not.toHaveBeenCalled()
  })
  it('renders a visible print action with an explicit raster PDF explanation', async () => {
    const host = await mount(
      <PptxOutputControls
        active={0}
        deck={{ size: { cx: 9144000, cy: 6858000 }, slides: () => [], media: new Map() }}
      />,
    )
    expect(host.querySelector('button[aria-label="打印幻灯片"]')?.textContent).toBe('打印幻灯片')
    expect(host.textContent).toContain('文字不可选择')
  })
})
