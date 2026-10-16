// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPptxScreenRecording, type PptxRecordingPhase } from '../pptx-screen-recording.js'
import type { PptxUpload } from './PptxAssetControls.js'
import { PptxScreenRecordControls } from './PptxScreenRecordControls.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
// CC0 sample from https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm
const webm = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../tests/fixtures/screen-recording-flower.webm',
  ),
)
class Track extends EventTarget {
  stop = vi.fn<() => void>()
}
class Recorder extends EventTarget {
  static all: Recorder[] = []
  static isTypeSupported = () => true
  state = 'inactive'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor() {
    super()
    Recorder.all.push(this)
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.onstop?.()
  }
  emit(blob: Blob) {
    this.ondataavailable?.({ data: blob })
  }
}
let track: Track,
  extraTrack: Track,
  getDisplayMedia: ReturnType<typeof vi.fn<() => Promise<MediaStream>>>
const cleanup: Array<() => void> = []
beforeEach(() => {
  track = new Track()
  extraTrack = new Track()
  Recorder.all = []
  getDisplayMedia = vi.fn<() => Promise<MediaStream>>(
    async () =>
      ({
        getTracks: () => [track, extraTrack],
        getVideoTracks: () => [track],
      }) as unknown as MediaStream,
  )
  vi.stubGlobal(
    'navigator',
    Object.assign(Object.create(navigator), { mediaDevices: { getDisplayMedia } }),
  )
  vi.stubGlobal('MediaRecorder', Recorder)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:recording')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function controller() {
  const callbacks = {
    phase: vi.fn<(phase: PptxRecordingPhase) => void>(),
    seconds: vi.fn<(seconds: number) => void>(),
    complete: vi.fn<(file: File) => void>(),
    error: vi.fn<(message: string) => void>(),
  }
  const recording = createPptxScreenRecording(callbacks)
  cleanup.push(() => recording.dispose())
  return { recording, ...callbacks }
}
it('records only after explicit start and stops all tracks with a real WebM file result', async () => {
  const app = controller()
  expect(getDisplayMedia).not.toHaveBeenCalled()
  await app.recording.start()
  expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false })
  Recorder.all[0]!.emit(new Blob([webm]))
  track.dispatchEvent(new Event('ended'))
  expect(track.stop).toHaveBeenCalled()
  expect(extraTrack.stop).toHaveBeenCalled()
  const file = app.complete.mock.calls[0]![0] as File
  expect(file.type).toBe('video/webm')
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array(webm))
})
it('late screen permission after closing stops tracks without producing a preview', async () => {
  let resolveCapture!: (stream: MediaStream) => void
  getDisplayMedia.mockImplementation(
    () =>
      new Promise<MediaStream>((finish) => {
        resolveCapture = finish
      }),
  )
  const app = controller(),
    pending = app.recording.start()
  app.recording.dispose()
  resolveCapture({
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream)
  await pending
  expect(track.stop).toHaveBeenCalled()
  expect(Recorder.all).toHaveLength(0)
  expect(app.complete).not.toHaveBeenCalled()
})
it('over-budget and empty recordings fail without retaining data', async () => {
  const app = controller()
  await app.recording.start()
  Recorder.all[0]!.emit({ size: 32 * 1024 * 1024 + 1 } as Blob)
  expect(app.error).toHaveBeenCalledWith(expect.stringContaining('32 MiB'))
  expect(app.complete).not.toHaveBeenCalled()
  await app.recording.start()
  app.recording.stop()
  expect(app.error).toHaveBeenCalledWith(expect.stringContaining('没有录到'))
})
it('ten-minute limit stops real tracks, while cancellation returns a recoverable reason', async () => {
  vi.useFakeTimers()
  const app = controller()
  await app.recording.start()
  Recorder.all[0]!.emit(new Blob([webm]))
  vi.advanceTimersByTime(600000)
  expect(track.stop).toHaveBeenCalled()
  expect(app.complete).toHaveBeenCalledTimes(1)
  getDisplayMedia.mockRejectedValue(new DOMException('Cancelled', 'NotAllowedError'))
  await app.recording.start()
  expect(app.error).toHaveBeenCalledWith(expect.stringContaining('取消'))
})
it('unmounting while recording stops capture and never emits a late result', async () => {
  const app = controller()
  await app.recording.start()
  Recorder.all[0]!.emit(new Blob([webm]))
  app.recording.dispose()
  expect(track.stop).toHaveBeenCalled()
  expect(app.complete).not.toHaveBeenCalled()
})
it('previews locally, preserves the clip after a failed insertion, and uploads only on explicit insert', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host),
    upload = vi.fn<PptxUpload>(async () => false)
  await act(async () =>
    root.render(
      <ConfigProvider componentSize="small">
        <PptxScreenRecordControls slide={2} upload={upload} />
      </ConfigProvider>,
    ),
  )
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const button = (label: string) =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  await act(async () => button('选择屏幕并开始').click())
  await act(async () => {
    Recorder.all[0]!.emit(new Blob([webm]))
    button('停止屏幕录制').click()
  })
  expect(host.querySelector('video')?.getAttribute('src')).toBe('blob:recording')
  expect(upload).not.toHaveBeenCalled()
  await act(async () => button('将录屏插入幻灯片').click())
  expect(upload).toHaveBeenCalledWith(
    { kind: 'media', slide: 2, mediaKind: 'video' },
    expect.any(File),
  )
  expect(host.querySelector('video')).not.toBeNull()
  await act(async () => button('放弃当前录屏').click())
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:recording')
  expect(host.querySelector('video')).toBeNull()
})
