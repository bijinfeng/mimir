import type { PptxMediaMetadata } from './pptx-media-info.js'
import { invalidMedia as invalid, mediaTag as tag, mediaU32 as u32 } from './pptx-media-binary.js'

function skipId3(b: Uint8Array) {
  if (tag(b, 0, 3) !== 'ID3') return 0
  if (b.length < 10 || b[3]! < 2 || b[3]! > 4 || [6, 7, 8, 9].some((p) => b[p]! > 127))
    invalid('ID3头无效')
  let length = 0
  for (let p = 6; p < 10; p++) length = length * 128 + b[p]!
  const end = 10 + length + (b[5]! & 16 ? 10 : 0)
  if (end > b.length) invalid('ID3内容截断')
  return end
}
const AUDIO_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
]
export function inspectAdtsMedia(b: Uint8Array): PptxMediaMetadata {
  let at = skipId3(b),
    count = 0,
    duration = 0,
    config = ''
  while (at < b.length) {
    if (++count > 262144 || at + 7 > b.length || b[at] !== 255 || (b[at + 1]! & 246) !== 240)
      invalid('AAC需要完整ADTS帧')
    const rateIndex = (b[at + 2]! >> 2) & 15,
      rate = AUDIO_RATES[rateIndex],
      channels = ((b[at + 2]! & 1) << 2) | (b[at + 3]! >> 6)
    const header = b[at + 1]! & 1 ? 7 : 9,
      length = ((b[at + 3]! & 3) << 11) | (b[at + 4]! << 3) | (b[at + 5]! >> 5)
    if (!rate || !channels || length <= header || length > b.length - at)
      invalid('AAC采样参数或帧长度无效')
    const current = `${b[at + 2]! >> 6}/${rateIndex}/${channels}`
    if (config && config !== current) invalid('AAC帧配置不一致')
    config = current
    duration += (1024 * ((b[at + 6]! & 3) + 1)) / rate
    at += length
  }
  if (!count) invalid('AAC没有采样帧')
  return { naturalSize: null, durationSeconds: duration, codecs: ['AAC-ADTS'] }
}
export function inspectMp3Media(b: Uint8Array): PptxMediaMetadata {
  let at = skipId3(b),
    count = 0,
    duration = 0
  while (at < b.length) {
    if (at + 128 === b.length && tag(b, at, 3) === 'TAG') {
      at = b.length
      break
    }
    if (++count > 262144 || at + 4 > b.length || b[at] !== 255 || (b[at + 1]! & 224) !== 224)
      invalid('MP3帧截断或签名无效')
    const version = (b[at + 1]! >> 3) & 3,
      layer = (b[at + 1]! >> 1) & 3,
      bitrateIndex = b[at + 2]! >> 4,
      rateIndex = (b[at + 2]! >> 2) & 3
    if (version === 1 || layer !== 1 || !bitrateIndex || bitrateIndex === 15 || rateIndex === 3)
      invalid('MP3编码参数无效')
    const rate = [44100, 48000, 32000][rateIndex]! / (version === 3 ? 1 : version === 2 ? 2 : 4)
    const bitrate =
      (version === 3
        ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
        : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[bitrateIndex]! * 1000
    const length =
      Math.floor(((version === 3 ? 144 : 72) * bitrate) / rate) + ((b[at + 2]! >> 1) & 1)
    if (length < 4 || length > b.length - at) invalid('MP3采样帧长度越界')
    duration += (version === 3 ? 1152 : 576) / rate
    at += length
  }
  if (!count) invalid('MP3没有采样帧')
  return { naturalSize: null, durationSeconds: duration, codecs: ['MP3'] }
}
export function inspectOggMedia(b: Uint8Array): PptxMediaMetadata {
  let at = 0,
    count = 0,
    rate = 0,
    last = 0,
    codec = ''
  while (at < b.length) {
    if (++count > 16384 || at + 27 > b.length || tag(b, at) !== 'OggS' || b[at + 4] !== 0)
      invalid('Ogg页头无效')
    const segments = b[at + 26]!,
      payload = at + 27 + segments
    if (payload > b.length) invalid('Ogg分段表截断')
    let length = 0
    for (let p = at + 27; p < payload; p++) length += b[p]!
    if (!length || payload + length > b.length) invalid('Ogg采样内容截断')
    if (count === 1) {
      if (tag(b, payload, 8) === 'OpusHead' && length >= 19) {
        codec = 'Opus'
        rate = 48000
      } else if (b[payload] === 1 && tag(b, payload + 1, 6) === 'vorbis' && length >= 30) {
        codec = 'Vorbis'
        rate = u32(b, payload + 12, true)
      } else invalid('Ogg内容不是受支持的音频轨道')
      if (!rate || rate > 384000) invalid('Ogg采样率无效')
    }
    const high = u32(b, at + 10, true),
      low = u32(b, at + 6, true)
    if (high !== 0xffffffff || low !== 0xffffffff) {
      if (high > 0x1fffff) invalid('Ogg采样位置超出范围')
      last = high * 4294967296 + low
    }
    at = payload + length
  }
  if (count < 2 || !last) invalid('Ogg没有完整音频采样')
  return { naturalSize: null, durationSeconds: last / rate, codecs: [codec] }
}
