/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { pickSelectOption, selectRoot, pressMouseDown } from '../shell/antd-test-dom.js'
import { PptxMediaControls, pptxVideoPoster } from './PptxMediaControls.js'
import { PptxMediaPlayer, type PptxUpload } from './PptxAssetControls.js'
import { openPptxForEdit } from '../pptx.js'
import { addMedia, openPptx, savePptx } from '../../vendor/packages/pptx-engine/src/index.js'
import type { PictureElement } from '../../vendor/packages/pptx-engine/src/types.js'
const here = dirname(fileURLToPath(import.meta.url)),
  cleanups: (() => void)[] = []
const bytes = (name: string) =>
  new Uint8Array(readFileSync(resolve(here, '../../tests/fixtures', name)))
const file = (name: string, type = '') =>
  new File([bytes(`pptx-media/${name}`).buffer], name, { type })
beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:media-${Math.random()}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
  vi.useRealTimers()
})
function mount(upload = vi.fn<PptxUpload>(async () => true)) {
  const host = document.createElement('div'),
    root = createRoot(host)
  host.className = 'mimir-editor'
  document.body.append(host)
  let alive = true
  const render = (slide = 0) =>
    act(() => root.render(<PptxMediaControls slide={slide} upload={upload} />))
  const close = () => {
    if (alive) {
      act(() => root.unmount())
      alive = false
    }
    host.remove()
  }
  cleanups.push(close)
  render()
  return { host, upload, render, close }
}
const primary = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>('button[aria-label="插入音视频"]')!
async function choose(host: HTMLElement, selected: File) {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
  await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: [selected] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
const click = (element: Element) =>
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
const kind = (host: HTMLElement, label: string) => pickSelectOption(host, '媒体类型', label)
it('keeps one primary action in a separate footer, validates all video formats and previews portrait video in its true ratio', async () => {
  const { host } = mount()
  expect(host.querySelector('input[type="file"]')?.getAttribute('accept')).toBe(
    '.mp4,.webm,.mov,.m4v,.avi',
  )
  expect(primary(host).textContent).toBe('插入音视频')
  expect(primary(host).closest('.mimir-pptx-media-insert__footer')).not.toBeNull()
  expect(host.querySelector('.mimir-pptx-media-insert__body')!.contains(primary(host))).toBe(false)
  await choose(host, file('portrait.m4v', 'video/x-m4v'))
  expect(primary(host).disabled).toBe(false)
  const preview = host.querySelector('video')!
  expect(preview.style.aspectRatio).toBe('180 / 320')
  expect(preview.style.width).toBe('100%')
  expect(preview.style.maxWidth).toBe('123.75px')
  expect(preview.style.height).toBe('auto')
  expect(host.textContent).toContain('180 × 320')
  const blob = vi.mocked(URL.createObjectURL).mock.calls.at(-1)![0] as Blob
  expect(blob.type).toBe('video/mp4')
})
it('distinguishes valid but unpreviewable AVI from corrupt media and embeds original bytes after a preview error', async () => {
  const { host, upload } = mount(),
    selected = file('landscape.avi', 'video/x-msvideo')
  await choose(host, selected)
  expect(host.querySelector('[role="status"]')?.textContent).toContain('AVI')
  act(() => host.querySelector('video')!.dispatchEvent(new Event('error')))
  expect(host.textContent).toContain('仍可插入原文件')
  expect(primary(host).disabled).toBe(false)
  await act(async () => click(primary(host)))
  expect(upload).toHaveBeenCalledOnce()
  expect(upload.mock.calls[0]![0]).toEqual({ kind: 'media', slide: 0, mediaKind: 'video' })
  expect(upload.mock.calls[0]![1]).toBe(selected)
  expect(upload.mock.calls[0]![2]).toBeUndefined()
  expect(upload.mock.calls[0]![3]).toBeInstanceOf(AbortSignal)
  await choose(host, new File([new Uint8Array(20)], 'fake.avi', { type: 'video/x-msvideo' }))
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('媒体文件无效')
  expect(primary(host).disabled).toBe(true)
  expect(host.querySelector('video')).toBeNull()
})
it('uses mp4 preview MIME for MOV while retaining the original File passed to upload', async () => {
  const { host, upload } = mount(),
    selected = file('landscape.mov', 'video/quicktime')
  await choose(host, selected)
  const blob = vi.mocked(URL.createObjectURL).mock.calls.at(-1)![0] as Blob
  expect(blob.type).toBe('video/mp4')
  await act(async () => click(primary(host)))
  expect(upload.mock.calls[0]![1].name).toBe('landscape.mov')
  expect(upload.mock.calls[0]![1].type).toBe('video/quicktime')
})
it('clears old media on kind changes and rejects late file reads from the previous kind', async () => {
  const { host, upload } = mount(),
    slow = file('landscape.mp4')
  let finish!: (value: ArrayBuffer) => void
  vi.spyOn(slow, 'arrayBuffer').mockImplementation(
    () =>
      new Promise((done) => {
        finish = done
      }),
  )
  await choose(host, slow)
  expect(host.textContent).toContain('正在检查')
  kind(host, '音频')
  expect(host.querySelector('input[type="file"]')?.getAttribute('accept')).toBe(
    '.mp3,.wav,.ogg,.m4a,.aac',
  )
  await act(async () => finish(bytes('pptx-media/landscape.mp4').buffer))
  expect(host.querySelector('video')).toBeNull()
  expect(primary(host).disabled).toBe(true)
  expect(upload).not.toHaveBeenCalled()
  await choose(host, file('tone.aac', 'audio/aac'))
  expect(host.querySelector('audio')).not.toBeNull()
  expect(host.textContent).toContain('64pt')
  expect(primary(host).disabled).toBe(false)
})
it('keeps the chosen file on failed upload and suppresses duplicate submissions while pending', async () => {
  let finish!: (value: boolean) => void
  const upload = vi.fn<PptxUpload>(
      () =>
        new Promise((done) => {
          finish = done
        }),
    ),
    { host } = mount(upload)
  kind(host, '音频')
  await choose(host, file('tone.m4a', 'audio/mp4'))
  await act(async () => {
    click(primary(host))
    click(primary(host))
  })
  expect(upload).toHaveBeenCalledOnce()
  expect(primary(host).disabled).toBe(true)
  const select = selectRoot(host, '媒体类型')
  expect(select.classList.contains('ant-select-disabled')).toBe(true)
  pressMouseDown(select.querySelector('.ant-select-content') ?? select)
  expect(select.querySelector('[aria-expanded="true"]')).toBeNull()
  await act(async () => finish(false))
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('请重试')
  expect(host.querySelector('audio')).not.toBeNull()
  expect(primary(host).disabled).toBe(false)
  await act(async () => click(primary(host)))
  expect(upload).toHaveBeenCalledTimes(2)
})
it('aborts pending uploads and pauses/releases old preview when changing slides or closing', async () => {
  const upload = vi.fn<PptxUpload>(() => new Promise(() => {})),
    { host, render, close } = mount(upload)
  kind(host, '音频')
  await choose(host, file('tone.wav', 'audio/wav'))
  const url = host.querySelector('audio')!.getAttribute('src')
  await act(async () => click(primary(host)))
  const signal = upload.mock.calls[0]![3]!
  render(1)
  expect(signal.aborted).toBe(true)
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
  expect(primary(host).disabled).toBe(true)
  close()
})
it('cancels a late optional poster before it can upload to an old slide and preserves aspect under the 1280px budget', async () => {
  const { host, upload, render } = mount()
  await choose(host, file('landscape.mp4', 'video/mp4'))
  const video = host.querySelector('video')!
  Object.defineProperties(video, {
    readyState: { value: 2 },
    videoWidth: { value: 3840 },
    videoHeight: { value: 2160 },
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn<(...args: unknown[]) => void>(),
  } as unknown as CanvasRenderingContext2D)
  let finish!: BlobCallback
  const capture = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    cb,
  ) {
    expect(this.width).toBe(1280)
    expect(this.height).toBe(720)
    finish = cb
  })
  await act(async () => click(primary(host)))
  expect(capture).toHaveBeenCalledOnce()
  render(1)
  await act(async () => finish(new Blob(['late'], { type: 'image/png' })))
  expect(upload).not.toHaveBeenCalled()
})
it('bounds optional poster capture to three seconds and rejects decode/draw failures without blocking valid embedding', async () => {
  vi.useFakeTimers()
  const video = document.createElement('video'),
    controller = new AbortController()
  Object.defineProperties(video, {
    readyState: { value: 2 },
    videoWidth: { value: 320 },
    videoHeight: { value: 180 },
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn<(...args: unknown[]) => void>(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(() => {})
  const pending = pptxVideoPoster(video, controller.signal)
  await vi.advanceTimersByTimeAsync(3000)
  expect(await pending).toBeUndefined()
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(() => {
    throw new Error('decode failed')
  })
  expect(await pptxVideoPoster(video, controller.signal)).toBeUndefined()
})
it('stops a native MOV player on close and never dirties or advances the source session while playing', async () => {
  const original = await openPptx(bytes('title-layout.pptx'))
  addMedia(original, 0, {
    kind: 'video',
    ext: 'mov',
    bytes: bytes('pptx-media/landscape.mov'),
    offset: { x: 10000, y: 10000, cx: 1000000, cy: 1000000 },
  })
  const session = await openPptxForEdit(await savePptx(original)),
    element = session
      .slides()[0]!
      .elements.find((e): e is PictureElement => e.type === 'picture' && !!e.media)!,
    host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  act(() =>
    root.render(
      <PptxMediaPlayer session={session} element={element} version={session.version()} />,
    ),
  )
  const video = host.querySelector('video')!
  expect(video.getAttribute('src')).toMatch(/^data:video\/mp4;base64,/)
  act(() => {
    video.volume = 0.4
    video.currentTime = 0.1
    video.dispatchEvent(new Event('play'))
  })
  expect(session.version()).toBe(0)
  expect(session.isDirty(0)).toBe(false)
  act(() => root.unmount())
  host.remove()
  expect(video.getAttribute('src')).toBeNull()
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
  expect(HTMLMediaElement.prototype.load).toHaveBeenCalled()
})
