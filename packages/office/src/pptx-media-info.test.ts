import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { inspectPptxMedia } from './pptx-media-info.js'
const fixture = async (name: string) =>
  new Uint8Array(await readFile(new URL(`../tests/fixtures/${name}`, import.meta.url)))
it('reads the existing actual VP8 screen recording as video without relying on extension or browser APIs', async () => {
  const bytes = await fixture('screen-recording-flower.webm')
  const info = inspectPptxMedia(bytes, 'recording.webm', 'video/webm', 'video')
  expect(info.codecs).toContain('V_VP8')
  expect(info.naturalSize).toMatchObject({ width: expect.any(Number), height: expect.any(Number) })
  expect(info.previewMime).toBe('video/webm')
  expect(() => inspectPptxMedia(bytes, 'recording.webm', 'video/webm', 'audio')).toThrow(
    '类型不一致',
  )
})
it.each([
  'movie.mp4',
  'movie.mov',
  'movie.m4v',
  'movie.avi',
  'tone.m4a',
  'tone.aac',
  'tone.mp3',
  'tone.wav',
  'tone.ogg',
  'movie.webm',
])('rejects fake empty headers as%s', (name) => {
  const bytes = new Uint8Array(32)
  expect(() =>
    inspectPptxMedia(bytes, name, '', name.startsWith('tone') ? 'audio' : 'video'),
  ).toThrow('媒体文件无效')
})
it('rejects media bytes over the32MiB budget before allocating container tables', () => {
  expect(() =>
    inspectPptxMedia(new Uint8Array(32 * 1024 * 1024 + 1), 'video.mp4', 'video/mp4', 'video'),
  ).toThrow('32 MiB')
})

const mediaCases = [
  ['landscape.mp4', 'video/mp4', 'video', 320, 180, 'avc1'],
  ['fragmented.mp4', 'video/mp4', 'video', 320, 180, 'avc1'],
  ['landscape.mov', 'video/quicktime', 'video', 320, 180, 'avc1'],
  ['portrait.m4v', 'video/x-m4v', 'video', 180, 320, 'avc1'],
  ['landscape.avi', 'video/x-msvideo', 'video', 320, 180, 'MJPG'],
  ['landscape.webm', 'video/webm', 'video', 320, 180, 'V_VP8'],
  ['tone.m4a', 'audio/mp4', 'audio', 0, 0, 'mp4a'],
  ['tone.aac', 'audio/aac', 'audio', 0, 0, 'AAC-ADTS'],
  ['tone.mp3', 'audio/mpeg', 'audio', 0, 0, 'MP3'],
  ['tone.wav', 'audio/wav', 'audio', 0, 0, 'wave-1'],
  ['tone.ogg', 'audio/ogg', 'audio', 0, 0, 'Vorbis'],
  ['alac.mov', 'video/quicktime', 'video', 320, 180, 'alac'],
] as const
it.each(mediaCases)(
  'reads real%s with decoded streams, recorded hash, dimensions and duration',
  async (name, mime, kind, width, height, codec) => {
    const bytes = await fixture(`pptx-media/${name}`)
    const manifest = JSON.parse(
      await readFile(
        new URL('../tests/fixtures/pptx-media/manifest.json', import.meta.url),
        'utf8',
      ),
    ) as {
      files: {
        name: string
        sha256: string
        bytes: number
        decodeExitCode: number
        durationSecondsReported: number
      }[]
    }
    const recorded = manifest.files.find((item) => item.name === name)!
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(recorded.sha256)
    expect(bytes.length).toBe(recorded.bytes)
    expect(recorded.decodeExitCode).toBe(0)
    expect(recorded.durationSecondsReported).toBeGreaterThan(0.5)
    expect(recorded.durationSecondsReported).toBeLessThan(0.75)
    const info = inspectPptxMedia(bytes, name, mime, kind)
    expect(info.codecs).toContain(codec)
    expect(info.naturalSize).toEqual(width ? { width, height } : null)
    const durationMatcher = expect.any(Number),
      warningMatcher = expect.stringContaining('仍')
    expect(info.durationSeconds).toEqual(name.endsWith('.webm') ? undefined : durationMatcher)
    expect(info.durationSeconds ?? 0.6).toBeGreaterThan(0.5)
    expect(info.durationSeconds ?? 0.6).toBeLessThan(0.75)
    expect(info.previewMime).toBe(
      name.endsWith('.mov') || name.endsWith('.m4v') ? 'video/mp4' : mime,
    )
    expect(info.previewWarning).toEqual(
      name === 'landscape.avi' || name === 'alac.mov' ? warningMatcher : undefined,
    )
  },
)

function patchTag(source: Uint8Array, needle: string, replacement: string) {
  const bytes = source.slice(),
    at = Buffer.from(bytes).indexOf(needle)
  expect(at).toBeGreaterThanOrEqual(0)
  expect(replacement.length).toBe(needle.length)
  bytes.set(new TextEncoder().encode(replacement), at)
  return bytes
}
it('refuses audio renamed as video, video renamed as audio, and incompatible MOV brands', async () => {
  const audio = await fixture('pptx-media/tone.m4a'),
    video = await fixture('pptx-media/landscape.mp4')
  expect(() => inspectPptxMedia(audio, 'renamed.mp4', 'video/mp4', 'video')).toThrow('轨道')
  expect(() =>
    inspectPptxMedia(patchTag(audio, 'M4A ', 'qt  '), 'renamed.mov', 'video/quicktime', 'video'),
  ).toThrow('轨道')
  expect(() => inspectPptxMedia(video, 'renamed.m4a', 'audio/mp4', 'audio')).toThrow('轨道')
  expect(() => inspectPptxMedia(video, 'renamed.mov', 'video/quicktime', 'video')).toThrow('品牌')
  expect(() => inspectPptxMedia(video, 'movie.mp4', 'audio/mp4', 'video')).toThrow('MIME')
  expect(() => inspectPptxMedia(video, 'movie.mp4', 'video/mp4', 'audio')).toThrow('类型')
})
it('rejects truncated/overflowing boxes, oversized sample tables, out-of-data sample offsets and wrong tracks', async () => {
  const original = await fixture('pptx-media/landscape.mp4')
  for (const length of [0x7fffffff, 7, 1]) {
    const bytes = original.slice()
    new DataView(bytes.buffer).setUint32(0, length)
    expect(() => inspectPptxMedia(bytes, 'movie.mp4', 'video/mp4', 'video')).toThrow('盒')
  }
  expect(() => inspectPptxMedia(original.slice(0, -3), 'movie.mp4', '', 'video')).toThrow('越界')
  const samples = original.slice(),
    sampleAt = Buffer.from(samples).indexOf('stsz')
  new DataView(samples.buffer).setUint32(sampleAt + 12, 0xffffffff)
  expect(() => inspectPptxMedia(samples, 'movie.mp4', '', 'video')).toThrow('采样数量')
  const offsets = original.slice(),
    offsetAt = Buffer.from(offsets).indexOf('stco')
  new DataView(offsets.buffer).setUint32(offsetAt + 12, 0)
  expect(() => inspectPptxMedia(offsets, 'movie.mp4', '', 'video')).toThrow('采样位置')
  expect(() =>
    inspectPptxMedia(patchTag(original, 'vide', 'soun'), 'movie.mp4', '', 'video'),
  ).toThrow('轨道')
})
it('rejects regular MP4 chunks extending beyond mdat and inconsistent sample-to-chunk mappings', async () => {
  const original = await fixture('pptx-media/landscape.mp4'),
    offsetAt = Buffer.from(original).indexOf('stco'),
    chunkAt = Buffer.from(original).indexOf('stsc'),
    mediaAt = Buffer.from(original).indexOf('mdat')
  expect(offsetAt).toBeGreaterThan(0)
  expect(chunkAt).toBeGreaterThan(0)
  expect(mediaAt).toBeGreaterThan(0)
  const crossing = original.slice(),
    mediaEnd = mediaAt - 4 + new DataView(original.buffer).getUint32(mediaAt - 4)
  new DataView(crossing.buffer).setUint32(offsetAt + 12, mediaEnd - 1)
  expect(() => inspectPptxMedia(crossing, 'movie.mp4', '', 'video')).toThrow('采样')
  for (const [position, value] of [
    [chunkAt + 12, 2],
    [chunkAt + 16, 7],
    [chunkAt + 20, 2],
  ]) {
    const bytes = original.slice()
    new DataView(bytes.buffer).setUint32(position!, value!)
    expect(() => inspectPptxMedia(bytes, 'movie.mp4', '', 'video')).toThrow('采样')
  }
})
it('validates RIFF AVI independently from WAVE and requires real video frames', async () => {
  const audio = await fixture('pptx-media/tone.wav'),
    video = await fixture('pptx-media/landscape.avi')
  expect(() => inspectPptxMedia(audio, 'fake.avi', 'video/x-msvideo', 'video')).toThrow('RIFF')
  const bad = video.slice()
  new DataView(bad.buffer).setUint32(4, bad.length, true)
  expect(() => inspectPptxMedia(bad, 'bad.avi', '', 'video')).toThrow('RIFF')
  expect(() => inspectPptxMedia(patchTag(video, 'vids', 'auds'), 'bad.avi', '', 'video')).toThrow(
    '视频轨道',
  )
})
it('requires complete ADTS frames rather than generic MPEG sync or renamed MP3', async () => {
  const aac = await fixture('pptx-media/tone.aac'),
    mp3 = await fixture('pptx-media/tone.mp3')
  expect(() => inspectPptxMedia(mp3, 'fake.aac', 'audio/aac', 'audio')).toThrow('ADTS')
  expect(() => inspectPptxMedia(aac.slice(0, -1), 'bad.aac', '', 'audio')).toThrow('帧长度')
  const bad = aac.slice()
  bad[2] = (bad[2]! & 195) | 60
  expect(() => inspectPptxMedia(bad, 'bad.aac', '', 'audio')).toThrow('采样参数')
})
it('bounds the WebM hierarchy and rejects a mismatched document type', async () => {
  const bytes = await fixture('pptx-media/landscape.webm')
  expect(() =>
    inspectPptxMedia(patchTag(bytes, 'webm', 'matr'), 'movie.webm', '', 'video'),
  ).toThrow('文档类型')
  const overflow = bytes.slice()
  overflow[4] = 255
  expect(() => inspectPptxMedia(overflow, 'movie.webm', '', 'video')).toThrow('未知长度')
})
it('validates actual fragmented MP4 sample ranges and rejects corrupt trun offsets and counts', async () => {
  const bytes = await fixture('pptx-media/fragmented.mp4')
  const badOffset = bytes.slice(),
    at = Buffer.from(bytes).indexOf('trun')
  expect(at).toBeGreaterThan(0)
  new DataView(badOffset.buffer).setInt32(at + 12, -2000000000)
  expect(() => inspectPptxMedia(badOffset, 'movie.mp4', '', 'video')).toThrow('分片采样位置')
  const badCount = bytes.slice()
  new DataView(badCount.buffer).setUint32(at + 8, 1000001)
  expect(() => inspectPptxMedia(badCount, 'movie.mp4', '', 'video')).toThrow('分片采样数量')
  expect(() => inspectPptxMedia(patchTag(bytes, 'mvex', 'skip'), 'movie.mp4', '', 'video')).toThrow(
    '分片初始化',
  )
})
it('rejects WebM clusters without actual video blocks or with unknown block tracks', async () => {
  const original = await fixture('pptx-media/landscape.webm')
  // These are the six SimpleBlock element boundaries in the hash-checked real fixture.
  const blocks = [477, 6762, 7445, 8186, 9077, 9872]
  const missing = original.slice(),
    unknown = original.slice()
  for (const at of blocks) {
    expect(original[at]).toBe(0xa3)
    expect(original[at + 3]).toBe(0x81)
    missing[at] = 0xec // Void keeps the element size/payload intact.
    unknown[at + 3] = 0x82 // Track 2 does not exist in this fixture.
  }
  expect(() => inspectPptxMedia(missing, 'movie.webm', '', 'video')).toThrow('采样')
  expect(() => inspectPptxMedia(unknown, 'movie.webm', '', 'video')).toThrow('轨道')
})
function encodeSize(value: number) {
  if (value < 0 || value >= 16383) throw new Error('WebM test fixture size exceeds two-byte budget')
  return Buffer.from([0x40 | (value >> 8), value & 255])
}
const webmElement = (id: number[], data: Uint8Array) =>
  Buffer.concat([Buffer.from(id), encodeSize(data.length), data])
function lacedWebmFixture(original: Uint8Array, lacing: number) {
  const frames =
    lacing === 2
      ? [original.slice(484, 6762), original.slice(484, 6762)]
      : [
          original.slice(484, 6762),
          original.slice(6769, 7445),
          original.slice(7452, 8186),
          original.slice(8193, 9077),
        ]
  const lengths: number[] = []
  if (lacing === 1) {
    for (const frame of frames.slice(0, -1)) {
      let remaining = frame.length
      while (remaining >= 255) {
        lengths.push(255)
        remaining -= 255
      }
      lengths.push(remaining)
    }
  } else if (lacing === 3) {
    lengths.push(...encodeSize(frames[0]!.length))
    for (let i = 1; i < frames.length - 1; i++)
      lengths.push(...encodeSize(frames[i]!.length - frames[i - 1]!.length + 8191))
  }
  const block = Buffer.concat([
    Buffer.from([0x81, 0, 0, lacing << 1, ...(lacing ? [frames.length - 1, ...lengths] : [])]),
    ...(!lacing ? frames.slice(0, 1) : frames),
  ])
  const make = (data: Uint8Array) =>
    Buffer.concat([
      original.slice(0, 36), // Real WebM EBML header.
      webmElement(
        [0x18, 0x53, 0x80, 0x67],
        Buffer.concat([
          original.slice(262, 340), // Real track metadata, including video TrackNumber 1.
          webmElement([0x1f, 0x43, 0xb6, 0x75], webmElement([0xa0], webmElement([0xa1], data))),
        ]),
      ),
    ])
  return { block, make }
}
it.each([0, 1, 2, 3])(
  'accepts actual video frames in WebM BlockGroups with lacing mode %s',
  async (lacing) => {
    const { block, make } = lacedWebmFixture(await fixture('pptx-media/landscape.webm'), lacing)
    expect(inspectPptxMedia(make(block), 'movie.webm', '', 'video').codecs).toEqual(['V_VP8'])
  },
)
it.each([1, 2, 3])(
  'rejects WebM lace mode %s with more frames than available ranges',
  async (lacing) => {
    const { block, make } = lacedWebmFixture(await fixture('pptx-media/landscape.webm'), lacing)
    const bad = block.slice()
    bad[4] = 255
    expect(() => inspectPptxMedia(make(bad), 'movie.webm', '', 'video')).toThrow('WebM')
  },
)
