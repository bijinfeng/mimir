import { afterEach, expect, it, vi } from 'vitest'
import { preparePptxVideo, prepareVideoAudio } from './docx-media'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('times out audio decoding, closes the context, and ignores late decoded audio', async () => {
  vi.useFakeTimers()
  let finish!: (audio: AudioBuffer) => void
  let markStarted!: () => void
  const started = new Promise<void>((resolve) => {
    markStarted = resolve
  })
  const close = vi.fn<() => Promise<void>>(async () => {})
  vi.stubGlobal(
    'AudioContext',
    class {
      close = close
      decodeAudioData() {
        markStarted()
        return new Promise<AudioBuffer>((resolve) => {
          finish = resolve
        })
      }
    },
  )
  const pending = prepareVideoAudio(
    new File(['original'], 'clip.mp4'),
    new AbortController().signal,
  )
  const outcome = pending.then(
    () => null,
    (error: unknown) => error,
  )
  await started
  await vi.advanceTimersByTimeAsync(15_000)
  expect(await outcome).toMatchObject({ message: expect.stringContaining('15秒') })
  expect(close).toHaveBeenCalledOnce()
  const readSamples = vi.fn<() => Float32Array>()
  finish({ duration: 1, getChannelData: readSamples } as unknown as AudioBuffer)
  await Promise.resolve()
  expect(readSamples).not.toHaveBeenCalled()
})

it.each([
  { duration: 121, numberOfChannels: 1, length: 16 },
  { duration: 1, numberOfChannels: 9, length: 16 },
  { duration: 1, numberOfChannels: 8, length: 4_000_001 },
])('rejects decoded audio budgets before reading samples: %j', async (audio) => {
  const readSamples = vi.fn<() => Float32Array>()
  const close = vi.fn<() => Promise<void>>(async () => {})
  vi.stubGlobal(
    'AudioContext',
    class {
      close = close
      decodeAudioData = async () => ({ ...audio, sampleRate: 16000, getChannelData: readSamples })
    },
  )
  await expect(
    prepareVideoAudio(new File(['original'], 'clip.mp4'), new AbortController().signal),
  ).rejects.toThrow('分析限制')
  expect(readSamples).not.toHaveBeenCalled()
  expect(close).toHaveBeenCalledOnce()
})

it('rejects empty original video before allocating a local URL or decoder', async () => {
  const create = vi.spyOn(URL, 'createObjectURL')
  try {
    await expect(
      preparePptxVideo(
        new File([], 'empty.mp4', { type: 'video/mp4' }),
        true,
        new AbortController().signal,
      ),
    ).rejects.toThrow('32 MiB')
    expect(create).not.toHaveBeenCalled()
  } finally {
    create.mockRestore()
  }
})
