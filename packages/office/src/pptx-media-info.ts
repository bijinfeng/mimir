import { PPTX_ASSET_MAX_BYTES } from '@mimir/shared'
import type { PptxMediaSize } from './pptx-media-frame.js'
import { inspectIsoMedia, inspectRiffMedia, inspectWebmMedia } from './pptx-media-containers.js'
import { inspectAdtsMedia, inspectMp3Media, inspectOggMedia } from './pptx-media-audio.js'

export type PptxMediaExtension =
  | 'mp4'
  | 'webm'
  | 'mov'
  | 'm4v'
  | 'avi'
  | 'mp3'
  | 'wav'
  | 'ogg'
  | 'm4a'
  | 'aac'
export interface PptxMediaInfo {
  ext: PptxMediaExtension
  kind: 'video' | 'audio'
  mime: string
  previewMime: string
  naturalSize: PptxMediaSize | null
  durationSeconds?: number
  codecs: string[]
  previewWarning?: string
}
export type PptxMediaMetadata = Pick<PptxMediaInfo, 'naturalSize' | 'durationSeconds' | 'codecs'>
const FORMATS: Record<
  PptxMediaExtension,
  { kind: 'video' | 'audio'; mime: string; aliases: string[] }
> = {
  mp4: { kind: 'video', mime: 'video/mp4', aliases: [] },
  webm: { kind: 'video', mime: 'video/webm', aliases: [] },
  mov: { kind: 'video', mime: 'video/quicktime', aliases: ['video/mov', 'video/x-quicktime'] },
  m4v: { kind: 'video', mime: 'video/x-m4v', aliases: ['video/mp4'] },
  avi: { kind: 'video', mime: 'video/x-msvideo', aliases: ['video/avi', 'video/msvideo'] },
  mp3: { kind: 'audio', mime: 'audio/mpeg', aliases: ['audio/mp3'] },
  wav: {
    kind: 'audio',
    mime: 'audio/wav',
    aliases: ['audio/x-wav', 'audio/wave', 'audio/vnd.wave'],
  },
  ogg: { kind: 'audio', mime: 'audio/ogg', aliases: ['application/ogg'] },
  m4a: { kind: 'audio', mime: 'audio/mp4', aliases: ['audio/x-m4a', 'audio/m4a'] },
  aac: {
    kind: 'audio',
    mime: 'audio/aac',
    aliases: ['audio/aacp', 'audio/x-aac', 'audio/vnd.dlna.adts'],
  },
}
/** Valid container bytes and browser codec support are separate outcomes.
 * Original bytes can be embedded even when preview decoding is unavailable. */
export function inspectPptxMedia(
  bytes: Uint8Array,
  name: string,
  mime: string,
  kind: 'video' | 'audio',
): PptxMediaInfo {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > PPTX_ASSET_MAX_BYTES)
    throw new Error('媒体文件须为不超过32 MiB的非空音视频')
  const extension = name.split('.').at(-1)?.toLowerCase()
  if (!extension || !Object.hasOwn(FORMATS, extension)) throw new Error('不支持此媒体后缀')
  const ext = extension as PptxMediaExtension,
    format = FORMATS[ext],
    declared = mime.split(';')[0]!.trim().toLowerCase()
  if (
    format.kind !== kind ||
    (declared &&
      declared !== 'application/octet-stream' &&
      declared !== format.mime &&
      !format.aliases.includes(declared))
  )
    throw new Error('媒体后缀、MIME与所选音视频类型不一致')
  const metadata = ['mp4', 'mov', 'm4v', 'm4a'].includes(ext)
    ? inspectIsoMedia(bytes, ext)
    : ext === 'avi' || ext === 'wav'
      ? inspectRiffMedia(bytes, ext === 'avi')
      : ext === 'aac'
        ? inspectAdtsMedia(bytes)
        : ext === 'mp3'
          ? inspectMp3Media(bytes)
          : ext === 'ogg'
            ? inspectOggMedia(bytes)
            : inspectWebmMedia(bytes)
  const unsupported = new Set([
    'ac-3',
    'ec-3',
    'ac-4',
    'alac',
    'mlpa',
    'samr',
    'sawb',
    'dtsc',
    'dtse',
    'dtsh',
    'dtsl',
    'dtsx',
  ])
  const previewWarning =
    ext === 'avi'
      ? 'AVI容器已验证，浏览器可能无法预览；仍可按原文件嵌入。'
      : metadata.codecs.some((codec) => unsupported.has(codec.trim().toLowerCase()))
        ? '此媒体含浏览器可能不支持的音频编码，预览可能无声；原文件仍会完整嵌入。'
        : undefined
  return {
    ext,
    kind,
    mime: format.mime,
    previewMime: ext === 'mov' || ext === 'm4v' ? 'video/mp4' : format.mime,
    ...metadata,
    ...(previewWarning ? { previewWarning } : {}),
  }
}
