import { afterEach, expect, it, vi } from 'vitest'
import { prepareVideoAudio, preparePptxVideo } from './docx-media'
import { api, configureApiTransport } from './api'

afterEach(() => vi.unstubAllGlobals())

it('encodes the original decoded stereo audio into a bounded mono WAV and closes the decoder', async () => {
  const close = vi.fn<() => Promise<void>>(async () => {})
  vi.stubGlobal(
    'AudioContext',
    class {
      close = close
      decodeAudioData = async () => ({
        duration: 0.001,
        numberOfChannels: 2,
        length: 16,
        sampleRate: 16000,
        getChannelData: (channel: number) => new Float32Array(16).fill(channel ? 0.5 : 0.25),
      })
    },
  )
  const result = await prepareVideoAudio(
    new File(['original-video'], 'demo.mp4', { type: 'video/mp4' }),
    new AbortController().signal,
  )
  const bytes = Uint8Array.from(atob(result.data), (char) => char.charCodeAt(0)),
    view = new DataView(bytes.buffer)
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF')
  expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('WAVE')
  expect(view.getUint32(24, true)).toBe(16000)
  expect(view.getUint16(22, true)).toBe(1)
  expect(view.getInt16(44, true)).toBe(Math.round(0.375 * 32767))
  expect(bytes.length).toBe(44 + 16 * 2)
  expect(close).toHaveBeenCalledOnce()
})

it('rejects late audio decode after cancellation and oversized original videos before browser decoding', async () => {
  const controller = new AbortController(),
    close = vi.fn<() => Promise<void>>(async () => {})
  vi.stubGlobal(
    'AudioContext',
    class {
      close = close
      decodeAudioData = async () => {
        controller.abort()
        return {}
      }
    },
  )
  await expect(
    prepareVideoAudio(new File(['original'], 'demo.mp4'), controller.signal),
  ).rejects.toThrow('已停止')
  expect(close).toHaveBeenCalledOnce()
  await expect(
    preparePptxVideo(
      new File([''], 'zero.mp4', { type: 'video/mp4' }),
      false,
      new AbortController().signal,
    ),
  ).rejects.toThrow('32 MiB')
})

it('serializes both image aspect contracts and request-scoped original PPTX bytes with credentials and cancellation', async () => {
  const requests: { url: string; init?: RequestInit }[] = []
  configureApiTransport({
    fetchImpl: vi.fn<typeof fetch>(async (url, init) => {
      requests.push({ url: String(url), init })
      return new Response(
        JSON.stringify(
          String(url).includes('apply-ops')
            ? { bytesBase64: 'AQI=', records: [], version: 1, changed: true }
            : { dataUrl: 'data:image/png;base64,eA==', mimeType: 'image/png' },
        ),
        { headers: { 'content-type': 'application/json' } },
      )
    }),
  })
  const signal = new AbortController().signal
  await api.conversations.generateMarkdownImage('note', '图', signal, '16:9')
  await api.conversations.generateDocxImage('doc', '图', signal, '9:16')
  expect(JSON.parse(requests[0]!.init!.body as string)).toMatchObject({
    documentId: 'note',
    aspectRatio: '16:9',
  })
  expect(JSON.parse(requests[1]!.init!.body as string)).toMatchObject({
    documentId: 'doc',
    aspectRatio: '9:16',
  })
  const bytes = new Uint8Array([9, 8, 7])
  await api.documents.applyPptxOps({
    documentId: 'pptx',
    bytes: new Uint8Array([1, 2]),
    expectedVersion: 4,
    action: 'insert_web_image',
    ops: [{ url: 'attachment://logo.png' }],
    attachments: [{ name: 'logo.png', mimeType: 'image/png', bytes }],
    signal,
  })
  const request = requests[2]!,
    form = request.init!.body as FormData,
    file = form.get('attachment') as File
  expect(request.init).toMatchObject({ credentials: 'include', signal })
  expect(form.get('documentId')).toBe('pptx')
  expect(form.get('expectedVersion')).toBe('4')
  expect(file.name).toBe('logo.png')
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes)
  expect(form.get('ops')).toBe('[{"url":"attachment://logo.png"}]')
})

it('extracts only four bounded visual frames at actual timeline positions and releases the original video URL', async () => {
  const create = document.createElement.bind(document),
    positions: number[] = []
  const video = create('video'),
    canvas = create('canvas')
  Object.defineProperties(video, {
    duration: { value: 10 },
    videoWidth: { value: 1920 },
    videoHeight: { value: 1080 },
    readyState: { value: 2 },
  })
  let time = 0
  Object.defineProperty(video, 'currentTime', {
    get: () => time,
    set: (value: number) => {
      time = value
      positions.push(value)
      queueMicrotask(() => video.dispatchEvent(new Event('seeked')))
    },
  })
  video.load = () => {
    if (video.getAttribute('src'))
      queueMicrotask(() => video.dispatchEvent(new Event('loadedmetadata')))
  }
  const drawImage = vi.fn<() => void>()
  vi.spyOn(canvas, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/jpeg;base64,YWJj')
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
    tag === 'video'
      ? video
      : tag === 'canvas'
        ? canvas
        : create(tag)) as typeof document.createElement)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:bounded-video')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  try {
    const result = await preparePptxVideo(
      new File(['native-video-bytes'], 'demo.mp4', { type: 'video/mp4' }),
      false,
      new AbortController().signal,
    )
    expect(result.media).toHaveLength(4)
    expect(result).not.toHaveProperty('audio')
    expect(positions).toEqual([1, 3.5, 6.5, 9])
    expect([canvas.width, canvas.height]).toEqual([1280, 720])
    expect(drawImage).toHaveBeenCalledTimes(4)
    expect(revoke).toHaveBeenCalledWith('blob:bounded-video')
  } finally {
    vi.restoreAllMocks()
  }
})
