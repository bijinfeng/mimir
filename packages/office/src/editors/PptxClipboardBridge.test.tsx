/** @vitest-environment happy-dom */
import { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { PptxClipboardBridge, type PptxClipboardBridgeProps } from './PptxClipboardBridge.js'
import {
  parsePptxClipboardMarker,
  readPptxSystemClipboardImage,
  writePptxClipboardMarker,
} from '../pptx-system-clipboard.js'
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const clip = { kind: 'elements', ref: 'd724172f-c513-4e5c-90d2-f511b2344de9' }
const png = () =>
  new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], 'image.png', {
    type: 'image/png',
  })
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
}
function mount(overrides: Partial<PptxClipboardBridgeProps> = {}) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host),
    canvasRef = createRef<HTMLDivElement>()
  const props: PptxClipboardBridgeProps = {
    canvasRef,
    contextKey: 'one',
    slide: 0,
    disabled: false,
    copyInput: vi.fn<PptxClipboardBridgeProps['copyInput']>((cut) => ({
      kind: cut ? 'cut_slide' : 'copy_slide',
      slide: 0,
    })),
    execute: vi.fn<PptxClipboardBridgeProps['execute']>().mockResolvedValue(clip),
    insertImage: vi
      .fn<NonNullable<PptxClipboardBridgeProps['insertImage']>>()
      .mockResolvedValue(true),
    onError: vi.fn<PptxClipboardBridgeProps['onError']>(),
    ...overrides,
  }
  const render = (next: Partial<PptxClipboardBridgeProps> = {}) =>
    act(() =>
      root.render(
        <div className="mimir-editor">
          <PptxClipboardBridge {...props} {...next} />
          <div className="mimir-pptx-stage">
            <div className="mimir-pptx-sheet">
              <div className="mimir-pptx-slide" ref={canvasRef} tabIndex={0} />
              <input />
              <div contentEditable aria-label="rich" />
            </div>
          </div>
          <div className="mimir-pptx-sorter">
            <button className="mimir-pptx-sorter-item" aria-selected="true" data-slide-index="0" />
            <button className="mimir-pptx-sorter-item" aria-selected="true" data-slide-index="2" />
          </div>
          <aside>
            <button />
          </aside>
        </div>,
      ),
    )
  render()
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return { props, host, canvas: canvasRef.current!, render }
}
function clipboardEvent(target: Element, files: File[], text = '') {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { files, getData: () => text } })
  act(() => target.dispatchEvent(event))
  return event
}
function key(target: Element, name: string) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: name,
    ctrlKey: true,
  })
  act(() => target.dispatchEvent(event))
  return event
}

it('writes a real OS marker and validates it before internal paste; never treats arbitrary text as internal', async () => {
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  expect(await writePptxClipboardMarker(clip)).toBe(true)
  const marker = writeText.mock.calls[0]![0] as string
  expect(parsePptxClipboardMarker(marker, 3)).toEqual({
    kind: 'paste_elements',
    slide: 3,
    ref: clip.ref,
    dx: 190500,
    dy: 190500,
  })
  expect(parsePptxClipboardMarker('external text', 0)).toBeNull()
  expect(
    parsePptxClipboardMarker('mimir:pptx-clipboard:v1:{"kind":"elements","ref":"invalid"}', 0),
  ).toBeNull()
})

it('explicitly reads an actual PNG blob and rejects permission denial, empty images and canceled reads', async () => {
  const file = png(),
    read = vi
      .fn<() => Promise<{ types: string[]; getType: () => Promise<Blob> }[]>>()
      .mockResolvedValue([{ types: ['image/png'], getType: async () => file }])
  vi.stubGlobal('navigator', { clipboard: { read } })
  expect(read).not.toHaveBeenCalled()
  const result = await readPptxSystemClipboardImage(new AbortController().signal)
  expect(result.type).toBe('image/png')
  expect(new Uint8Array(await result.arrayBuffer())).toEqual(
    new Uint8Array(await file.arrayBuffer()),
  )
  read.mockRejectedValueOnce(new Error('NotAllowedError'))
  await expect(readPptxSystemClipboardImage(new AbortController().signal)).rejects.toThrow(/未获准/)
  read.mockResolvedValueOnce([
    { types: ['image/png'], getType: async () => new Blob([], { type: 'image/png' }) },
  ])
  await expect(readPptxSystemClipboardImage(new AbortController().signal)).rejects.toThrow(/大于 0/)
  await expect(readPptxSystemClipboardImage(AbortSignal.abort())).rejects.toThrow(/取消/)
})

it('routes copy/cut by focus and actual sorter selection while leaving input, rich text and Inspector keys untouched', async () => {
  const ui = mount()
  expect(key(ui.canvas, 'c').defaultPrevented).toBe(true)
  await settle()
  expect(ui.props.copyInput).toHaveBeenLastCalledWith(false, null)
  expect(key(ui.host.querySelector('.mimir-pptx-sorter-item')!, 'x').defaultPrevented).toBe(true)
  await settle()
  expect(ui.props.copyInput).toHaveBeenLastCalledWith(true, [0, 2])
  for (const target of [
    ui.host.querySelector('input')!,
    ui.host.querySelector('[contenteditable]')!,
    ui.host.querySelector('aside button')!,
  ])
    expect(key(target, 'c').defaultPrevented).toBe(false)
  expect(ui.props.execute).toHaveBeenCalledTimes(2)
})

it('pastes external files and actual internal markers; text and rich-editor paste remain native', async () => {
  const ui = mount(),
    file = png()
  expect(clipboardEvent(ui.canvas, [file]).defaultPrevented).toBe(true)
  await settle()
  expect(ui.props.insertImage).toHaveBeenCalledWith(file, expect.any(AbortSignal))
  const marker = 'mimir:pptx-clipboard:v1:' + JSON.stringify(clip)
  expect(clipboardEvent(ui.canvas, [], marker).defaultPrevented).toBe(true)
  await settle()
  expect(ui.props.execute).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'paste_elements', ref: clip.ref }),
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  )
  expect(clipboardEvent(ui.canvas, [], 'external text').defaultPrevented).toBe(false)
  expect(clipboardEvent(ui.host.querySelector('[contenteditable]')!, [file]).defaultPrevented).toBe(
    false,
  )
  expect(ui.props.insertImage).toHaveBeenCalledTimes(1)
})

it('drops one actual PNG at the pointer, clears affordance and rejects multiple/invalid files before writing', async () => {
  const ui = mount(),
    file = png()
  vi.spyOn(ui.canvas, 'getBoundingClientRect').mockReturnValue({
    left: 10,
    top: 20,
    width: 400,
    height: 200,
  } as DOMRect)
  const drag = (name: string, files: File[]) => {
    const event = new Event(name, { bubbles: true, cancelable: true })
    Object.assign(event, {
      dataTransfer: { types: ['Files'], files, dropEffect: '' },
      clientX: 110,
      clientY: 170,
    })
    act(() => ui.canvas.dispatchEvent(event))
    return event
  }
  expect(drag('dragover', [file]).defaultPrevented).toBe(true)
  expect(ui.host.querySelector('[data-image-drop]')).not.toBeNull()
  expect(drag('drop', [file]).defaultPrevented).toBe(true)
  await settle()
  expect(ui.props.insertImage).toHaveBeenCalledWith(file, expect.any(AbortSignal), {
    x: 0.25,
    y: 0.75,
  })
  expect(ui.host.querySelector('[data-image-drop]')).toBeNull()
  drag('drop', [file, file])
  await settle()
  expect(ui.props.onError).toHaveBeenLastCalledWith(expect.stringContaining('一次'))
  drag('drop', [new File(['fake'], 'fake.png', { type: 'image/png' })])
  await settle()
  expect(ui.props.onError).toHaveBeenLastCalledWith(expect.stringContaining('真实内容'))
  expect(ui.props.insertImage).toHaveBeenCalledTimes(1)
})

it('aborts a pending operation on context change and Escape without publishing stale errors', async () => {
  let reject!: (cause: Error) => void
  const execute = vi.fn<PptxClipboardBridgeProps['execute']>(
    (_input, _options) =>
      new Promise((_resolve, fail) => {
        reject = fail
      }),
  )
  const ui = mount({ execute })
  key(ui.canvas, 'c')
  const signal = execute.mock.calls[0]![1].signal as AbortSignal
  ui.render({ contextKey: 'two' })
  expect(signal.aborted).toBe(true)
  reject(new Error('late'))
  await settle()
  expect(ui.props.onError).not.toHaveBeenCalled()
  key(ui.canvas, 'c')
  act(() => ui.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect((execute.mock.calls[1]![1].signal as AbortSignal).aborted).toBe(true)
  reject(new Error('canceled'))
  await settle()
  expect(ui.props.onError).not.toHaveBeenCalled()
})

it('reports synchronous selection rejection and releases the shortcut lock for the next valid copy', async () => {
  const copyInput = vi
    .fn<PptxClipboardBridgeProps['copyInput']>()
    .mockImplementationOnce(() => {
      throw new Error('深层组合暂不支持单独复制')
    })
    .mockReturnValue({ kind: 'copy_slide', slide: 0 })
  const ui = mount({ copyInput })
  key(ui.canvas, 'c')
  await settle()
  expect(ui.props.onError).toHaveBeenLastCalledWith('深层组合暂不支持单独复制')
  expect(ui.props.execute).not.toHaveBeenCalled()
  key(ui.canvas, 'c')
  await settle()
  expect(ui.props.execute).toHaveBeenCalledOnce()
})
