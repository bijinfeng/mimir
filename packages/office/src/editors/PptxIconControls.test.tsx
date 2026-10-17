/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import { PptxIconControls, type PptxIconControlsProps } from './PptxIconControls.js'
import { filterPptxIcons, PPTX_ICONS, PPTX_ICON_GROUPS, pptxIconSvg } from './pptx-icons.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import { rasterizePptxSvg } from '../pptx-output.js'
import { openPptxForEdit } from '../pptx.js'
import { addPicture, openPptx, savePptx } from '../../vendor/packages/pptx-engine/src/index.js'

// Rendering itself requires a real browser Canvas. This test stubs only that boundary,
// preserving actual valid PNG bytes for the native media / relationship save-readback.
vi.mock('../pptx-output.js', () => ({ rasterizePptxSvg: vi.fn<typeof rasterizePptxSvg>() }))
const fixture = new Uint8Array(
  readFileSync(
    resolvePath(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/title-layout.pptx'),
  ),
)
const png = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.resetAllMocks()
})
function click(element: Element) {
  act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
}
function button(host: HTMLElement, name: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
  if (!found) throw new Error(`Missing ${name}`)
  return found
}
function search(host: HTMLElement, text: string) {
  const input = host.querySelector<HTMLInputElement>('[aria-label="搜索图标"]')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return input
}
async function setup(extra: Partial<PptxIconControlsProps> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const upload = vi.fn<PptxIconControlsProps['upload']>().mockResolvedValue(true)
  let props = { slide: 0, sourceKey: 'doc:slide1.xml', version: 1, upload, ...extra }
  const render = () =>
    root.render(
      <ConfigProvider componentSize="small">
        <PptxIconControls {...props} />
      </ConfigProvider>,
    )
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.mocked(rasterizePptxSvg).mockResolvedValue(png)
  await act(async () => render())
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return {
    host,
    upload,
    update: async (next: Partial<PptxIconControlsProps>) => {
      props = { ...props, ...next }
      await act(async () => render())
    },
    unmount: () => act(() => root.unmount()),
  }
}

it('contains the exact fixed-upstream 28 names and trusted SVG geometry, grouped without duplicate entries', () => {
  expect(PPTX_ICONS.map((icon) => icon.id)).toEqual(
    'star heart check cross plus warning info question bulb gear clock calendar mail phone location user team house document folder camera music cloud lock search cart trophy rocket'.split(
      ' ',
    ),
  )
  expect(
    PPTX_ICON_GROUPS.map((group) => PPTX_ICONS.filter((icon) => icon.group === group.id).length),
  ).toEqual([8, 6, 6, 5, 3])
  for (const icon of PPTX_ICONS) {
    const svg = pptxIconSvg(icon, '#4472C4')
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
    expect(parsed.querySelector('parsererror')).toBeNull()
    expect(parsed.querySelectorAll('path,circle,rect').length).toBeGreaterThan(0)
    expect(svg).not.toMatch(/script|href=|NaN|Infinity/)
    expect(svg).toContain('stroke-width="1.5"')
  }
  expect(() => pptxIconSvg(PPTX_ICONS[0]!, 'red" onload="bad')).toThrow('颜色')
  expect(() => pptxIconSvg({ ...PPTX_ICONS[0]! }, '#4472C4')).toThrow('图库')
  expect(filterPptxIcons('rocket').map((icon) => icon.id)).toEqual(['rocket'])
  expect(filterPptxIcons('文件夹').map((icon) => icon.id)).toEqual(['folder'])
})

it('offers one Tab stop, arrow/Home/End selection, category filtering and global search without writing', async () => {
  const { host, upload } = await setup()
  expect(host.querySelectorAll('[role="radio"]')).toHaveLength(28)
  expect(host.querySelectorAll('[role="radio"][tabindex="0"]')).toHaveLength(1)
  const star = button(host, '星标')
  act(() => star.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })))
  expect(button(host, '火箭').getAttribute('aria-checked')).toBe('true')
  expect(document.activeElement).toBe(button(host, '火箭'))
  act(() =>
    button(host, '火箭').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
    ),
  )
  act(() => star.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
  expect(button(host, '加号').getAttribute('aria-checked')).toBe('true')
  pickSelectOption(host, '图标分类', '商务与成就（3）')
  expect(host.querySelectorAll('[role="radio"]')).toHaveLength(3)
  search(host, 'folder')
  expect(host.querySelectorAll('[role="radio"]')).toHaveLength(1)
  click(button(host, '文件夹'))
  expect(host.textContent).toContain('已选：文件夹')
  expect(upload).not.toHaveBeenCalled()
  expect(rasterizePptxSvg).not.toHaveBeenCalled()
})

it('clears search on first Escape, then lets the Inspector handle Escape; cancel never writes', async () => {
  const onCancel = vi.fn<() => void>()
  const { host, upload } = await setup({ onCancel })
  const input = search(host, '没有这样的图标')
  expect(host.textContent).toContain('没有匹配的图标')
  const first = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  act(() => input.dispatchEvent(first))
  expect(first.defaultPrevented).toBe(true)
  expect(input.value).toBe('')
  const second = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  act(() => input.dispatchEvent(second))
  expect(second.defaultPrevented).toBe(false)
  click(button(host, '取消插入图标'))
  expect(onCancel).toHaveBeenCalledOnce()
  expect(upload).not.toHaveBeenCalled()
})

it('uploads the chosen real PNG payload and size once, saving media and native picture geometry through two saves', async () => {
  const { host, upload } = await setup()
  let bytes: Uint8Array = fixture
  upload.mockImplementation(async (input, file) => {
    if (input.kind !== 'picture') throw new Error('Expected picture upload')
    const opened = await openPptx(bytes)
    const picture = addPicture(opened, opened.deck.slides[input.slide]!, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      ext: 'png',
      offset: { x: 12700, y: 25400, cx: input.widthPt! * 12700, cy: input.widthPt! * 12700 },
    })
    expect(picture).not.toBeNull()
    bytes = await savePptx(opened)
    return true
  })
  click(button(host, '火箭'))
  const width = host.querySelector<HTMLInputElement>('[aria-label="图标宽度（磅）"]')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(width, '96')
    width.dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => width.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  await act(async () => button(host, '插入所选图标').click())
  for (let tries = 0; tries < 100 && host.querySelector('[aria-busy="true"]'); tries++)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  expect(upload).toHaveBeenCalledOnce()
  expect(upload.mock.calls[0]![0]).toEqual({
    kind: 'picture',
    slide: 0,
    widthPt: 96,
    keepCrop: false,
  })
  expect(upload.mock.calls[0]![1].name).toBe('火箭.png')
  expect(vi.mocked(rasterizePptxSvg).mock.calls[0]![0]).toBe(
    pptxIconSvg(PPTX_ICONS.at(-1)!, '#404040'),
  )
  const once = await openPptxForEdit(bytes)
  bytes = await once.save()
  once.commit()
  const twice = await openPptxForEdit(bytes)
  bytes = await twice.save()
  const last = twice.slides()[0]!.elements.at(-1)!
  expect(last.type).toBe('picture')
  expect(last.transform.offset.cx).toBe(96 * 12700)
  const after = await JSZip.loadAsync(bytes)
  const before = await JSZip.loadAsync(fixture)
  if (last.type !== 'picture') throw new Error('Expected native picture')
  expect(await after.file(last.mediaRef)!.async('uint8array')).toEqual(png)
  expect(await after.file('ppt/slides/_rels/slide1.xml.rels')!.async('string')).toContain(
    'relationships/image',
  )
  expect(await after.file('ppt/theme/theme1.xml')!.async('uint8array')).toEqual(
    await before.file('ppt/theme/theme1.xml')!.async('uint8array'),
  )
  expect(host.textContent).toContain('已插入图标')
})

it('locks composite selectors, ignores repeated clicks and preserves draft on rejected upload', async () => {
  const { host, upload } = await setup()
  let finish!: (ok: boolean) => void
  upload.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  click(button(host, '购物车'))
  await act(async () => {
    button(host, '插入所选图标').click()
    button(host, '插入所选图标').click()
  })
  expect(upload).toHaveBeenCalledOnce()
  expect(host.querySelector('.ant-select-disabled')).not.toBeNull()
  await act(async () => finish(false))
  expect(host.textContent).toContain('图标未插入')
  expect(button(host, '购物车').getAttribute('aria-checked')).toBe('true')
  expect(button(host, '插入所选图标').disabled).toBe(false)
})

it.each([{ version: 2 }, { slide: 1 }, { sourceKey: 'other-document:slide1.xml' }])(
  'aborts stale rasterization before upload on source change %j and never revives a draft',
  async (change) => {
    const { host, upload, update } = await setup()
    let finish!: (bytes: Uint8Array<ArrayBuffer>) => void
    vi.mocked(rasterizePptxSvg).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    click(button(host, '火箭'))
    click(button(host, '插入所选图标'))
    const signal = vi.mocked(rasterizePptxSvg).mock.calls[0]![3]!
    await update(change)
    expect(signal.aborted).toBe(true)
    await act(async () => finish(png))
    expect(upload).not.toHaveBeenCalled()
    expect(button(host, '星标').getAttribute('aria-checked')).toBe('true')
    await update({ version: 1, slide: 0, sourceKey: 'doc:slide1.xml' })
    expect(button(host, '火箭').getAttribute('aria-checked')).toBe('false')
  },
)

it('does not upload or publish success after closing while rasterization is pending', async () => {
  const { host, upload, unmount } = await setup()
  let finish!: (bytes: Uint8Array<ArrayBuffer>) => void
  vi.mocked(rasterizePptxSvg).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  click(button(host, '插入所选图标'))
  unmount()
  await act(async () => finish(png))
  expect(upload).not.toHaveBeenCalled()
  expect(host.textContent).toBe('')
})
