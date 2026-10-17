import type { PptxMediaExtension, PptxMediaMetadata } from './pptx-media-info.js'
import {
  invalidMedia as invalid,
  mediaTag as tag,
  mediaU32 as u32,
  mediaI32 as i32,
  mediaU16 as u16,
  mediaUint as uint,
  mediaSize as size,
} from './pptx-media-binary.js'

type Box = { type: string; start: number; payload: number; end: number }
type Budget = { count: number }
function boxes(b: Uint8Array, start: number, end: number, budget: Budget): Box[] {
  const out: Box[] = []
  for (let at = start; at < end;) {
    if (++budget.count > 8192 || at + 8 > end) invalid('容器盒数量超限或头部截断')
    let length = u32(b, at),
      header = 8
    if (length === 1) {
      if (at + 16 > end || u32(b, at + 8) !== 0) invalid('扩展盒长度无效')
      length = u32(b, at + 12)
      header = 16
    } else if (length === 0) length = end - at
    if (length < header || length > end - at) invalid('容器盒长度越界')
    out.push({ type: tag(b, at + 4), start: at, payload: at + header, end: at + length })
    at += length
  }
  return out
}
function one(items: Box[], type: string, required = false) {
  const matches = items.filter((item) => item.type === type)
  if (matches.length > 1 || (required && !matches.length)) invalid(`${type}结构缺失或重复`)
  return matches[0]
}
type FragmentTrack = { duration: number; samples: number }
/** Fragmented MP4 uses empty initial sample tables. Validate the actual trun
 * samples against mdat instead of treating those valid empty tables as corrupt. */
function fragments(b: Uint8Array, top: Box[], moov: Box[], budget: Budget) {
  const mvex = one(moov, 'mvex'),
    movies = top.filter((box) => box.type === 'moof'),
    result = new Map<number, FragmentTrack>()
  if (!mvex && !movies.length) return result
  if (!mvex || !movies.length) invalid('分片初始化或媒体分片缺失')
  const defaults = new Map<number, { duration: number; size: number }>()
  for (const entry of boxes(b, mvex.payload, mvex.end, budget).filter(
    (box) => box.type === 'trex',
  )) {
    if (entry.end - entry.payload !== 24) invalid('分片默认采样描述无效')
    const id = u32(b, entry.payload + 4)
    if (!id || defaults.has(id)) invalid('分片轨道身份无效')
    defaults.set(id, { duration: u32(b, entry.payload + 12), size: u32(b, entry.payload + 16) })
  }
  for (const movie of movies) {
    let previousEnd: number | undefined
    const tracks = boxes(b, movie.payload, movie.end, budget).filter((box) => box.type === 'traf')
    if (!tracks.length || tracks.length > 32) invalid('分片轨道缺失或超限')
    for (const track of tracks) {
      const items = boxes(b, track.payload, track.end, budget),
        head = one(items, 'tfhd', true)!
      if (head.end - head.payload < 8 || b[head.payload] !== 0) invalid('分片轨道头截断')
      const flags = u32(b, head.payload) & 0xffffff,
        id = u32(b, head.payload + 4),
        fallback = defaults.get(id)
      if (!fallback || flags & ~0x03003b) invalid('分片轨道或参数无效')
      let at = head.payload + 8,
        base = flags & 0x020000 ? movie.start : (previousEnd ?? movie.start),
        duration = fallback.duration,
        sampleSize = fallback.size
      const field = () => {
        if (at + 4 > head.end) invalid('分片轨道参数截断')
        const value = u32(b, at)
        at += 4
        return value
      }
      if (flags & 1) {
        if (field() !== 0) invalid('分片媒体位置溢出')
        base = field()
      }
      if (flags & 2) field()
      if (flags & 8) duration = field()
      if (flags & 16) sampleSize = field()
      if (flags & 32) field()
      if (at !== head.end) invalid('分片轨道参数长度错误')
      let dataEnd: number | undefined
      const runs = items.filter((box) => box.type === 'trun')
      if (!runs.length || flags & 0x010000) invalid('分片没有实际采样')
      for (const run of runs) {
        if (run.end - run.payload < 8 || b[run.payload]! > 1) invalid('分片采样头截断')
        const runFlags = u32(b, run.payload) & 0xffffff,
          count = u32(b, run.payload + 4),
          totals = result.get(id) ?? { duration: 0, samples: 0 }
        if (
          runFlags & ~0x000f05 ||
          (runFlags & 4 && runFlags & 0x400) ||
          !count ||
          count + totals.samples > 1000000
        )
          invalid('分片采样数量或参数无效')
        let p = run.payload + 8
        const read = () => {
          if (p + 4 > run.end) invalid('分片采样参数截断')
          const value = u32(b, p)
          p += 4
          return value
        }
        let start = dataEnd ?? base
        if (runFlags & 1) start = base + (read() | 0)
        if (runFlags & 4) read()
        let bytes = 0
        for (let i = 0; i < count; i++) {
          const sampleDuration = runFlags & 0x100 ? read() : duration,
            length = runFlags & 0x200 ? read() : sampleSize
          if (!sampleDuration || !length) invalid('分片采样为空')
          totals.duration += sampleDuration
          bytes += length
          if (runFlags & 0x400) read()
          if (runFlags & 0x800) read()
        }
        dataEnd = start + bytes
        if (
          p !== run.end ||
          !top.some((box) => box.type === 'mdat' && start >= box.payload && dataEnd! <= box.end)
        )
          invalid('分片采样位置或长度无效')
        totals.samples += count
        result.set(id, totals)
      }
      previousEnd = dataEnd
    }
  }
  return result
}
/** Only descend the fixed moov/trak/mdia/minf/stbl path. Opaque payloads never
 * trigger recursion. All lengths, sample counts, and offsets are bounded. */
export function inspectIsoMedia(b: Uint8Array, ext: PptxMediaExtension): PptxMediaMetadata {
  const budget = { count: 0 },
    top = boxes(b, 0, b.length, budget),
    ftyp = one(top, 'ftyp', true)!,
    moov = one(top, 'moov', true)!
  if (
    ftyp.end - ftyp.payload < 8 ||
    ftyp.end - ftyp.payload > 4096 ||
    (ftyp.end - ftyp.payload) % 4
  )
    invalid('ftyp品牌结构错误')
  const brands = [tag(b, ftyp.payload)]
  for (let p = ftyp.payload + 8; p < ftyp.end; p += 4) brands.push(tag(b, p))
  if (
    !brands.some((brand) =>
      [
        'isom',
        'iso2',
        'iso3',
        'iso4',
        'iso5',
        'iso6',
        'mp41',
        'mp42',
        'avc1',
        'M4V ',
        'M4A ',
        'qt  ',
        'MSNV',
        'dash',
      ].includes(brand),
    )
  )
    invalid('不支持的ISO媒体品牌')
  if (ext === 'mov' && !brands.includes('qt  ')) invalid('MOV品牌与文件后缀不一致')
  const media = top.filter((box) => box.type === 'mdat' && box.end > box.payload)
  if (!media.length) invalid('媒体数据为空')
  const mediaBytes = media.reduce((total, box) => total + box.end - box.payload, 0)
  const movie = boxes(b, moov.payload, moov.end, budget),
    fragmented = fragments(b, top, movie, budget),
    tracks = movie.filter((box) => box.type === 'trak')
  if (!tracks.length || tracks.length > 32) invalid('媒体轨道缺失或超限')
  const parsed = tracks.map((track) => {
    const items = boxes(b, track.payload, track.end, budget),
      tkhd = one(items, 'tkhd', true)!,
      mdia = one(items, 'mdia', true)!
    const content = boxes(b, mdia.payload, mdia.end, budget),
      hdlr = one(content, 'hdlr', true)!,
      mdhd = one(content, 'mdhd', true)!
    if (hdlr.end - hdlr.payload < 12) invalid('媒体轨道类型截断')
    const kind = tag(b, hdlr.payload + 8)
    if (kind !== 'vide' && kind !== 'soun')
      return { kind, codecs: [] as string[], naturalSize: null, durationSeconds: undefined }
    const minf = one(content, 'minf', true)!,
      stbl = one(boxes(b, minf.payload, minf.end, budget), 'stbl', true)!
    const samples = boxes(b, stbl.payload, stbl.end, budget),
      stsd = one(samples, 'stsd', true)!,
      stsz = one(samples, 'stsz', true)!
    if (stsd.end - stsd.payload < 8 || stsz.end - stsz.payload < 12) invalid('采样表截断')
    const entries = boxes(b, stsd.payload + 8, stsd.end, budget),
      entryCount = u32(b, stsd.payload + 4)
    if (!entryCount || entryCount > 32 || entries.length !== entryCount) invalid('编码采样描述错误')
    for (const entry of entries)
      if (entry.end - entry.payload < (kind === 'vide' ? 78 : 28)) invalid('编码采样描述截断')
    const count = u32(b, stsz.payload + 8),
      fixed = u32(b, stsz.payload + 4),
      tkVersion = b[tkhd.payload],
      widthAt = tkhd.payload + (tkVersion === 1 ? 88 : 76)
    if ((tkVersion !== 0 && tkVersion !== 1) || widthAt + 8 > tkhd.end) invalid('轨道头截断')
    const fragment = fragmented.get(u32(b, tkhd.payload + (tkVersion === 1 ? 20 : 12)))
    if (
      (!count && !fragment) ||
      count > 1000000 ||
      stsz.end - stsz.payload !== (fixed ? 12 : 12 + count * 4)
    )
      invalid('采样数量无效或超限')
    let total = fixed * count
    if (!fixed) for (let at = stsz.payload + 12; at < stsz.end; at += 4) total += u32(b, at)
    if ((!total && !fragment) || total > mediaBytes) invalid('采样数据长度无效')
    if (samples.some((box) => box.type === 'stco') && samples.some((box) => box.type === 'co64'))
      invalid('采样位置表类型冲突')
    const offsets = one(samples, 'stco') ?? one(samples, 'co64')
    if (!offsets || offsets.end - offsets.payload < 8) invalid('采样位置缺失')
    const offsetCount = u32(b, offsets.payload + 4),
      stride = offsets.type === 'co64' ? 8 : 4
    if (
      (!offsetCount && !fragment) ||
      offsetCount > 1000000 ||
      offsets.end - offsets.payload !== 8 + offsetCount * stride
    )
      invalid('采样位置表无效')
    const stsc = one(samples, 'stsc', true)!
    if (stsc.end - stsc.payload < 8) invalid('采样分块表截断')
    const chunkCount = u32(b, stsc.payload + 4)
    if (
      chunkCount > offsetCount ||
      stsc.end - stsc.payload !== 8 + chunkCount * 12 ||
      Boolean(chunkCount) !== Boolean(offsetCount)
    )
      invalid('采样分块表无效')
    const chunks: { first: number; count: number }[] = []
    for (let at = stsc.payload + 8; at < stsc.end; at += 12) {
      const first = u32(b, at),
        perChunk = u32(b, at + 4),
        description = u32(b, at + 8)
      if (
        first < 1 ||
        first > offsetCount ||
        (chunks.length ? first <= chunks[chunks.length - 1]!.first : first !== 1) ||
        !perChunk ||
        perChunk > count ||
        !description ||
        description > entryCount
      )
        invalid('采样分块映射无效')
      chunks.push({ first, count: perChunk })
    }
    let sampleIndex = 0,
      chunkIndex = 0
    for (let index = 0; index < offsetCount; index++) {
      const at = offsets.payload + 8 + index * stride
      if (stride === 8 && u32(b, at) !== 0) invalid('采样位置超出范围')
      const position = u32(b, at + (stride === 8 ? 4 : 0))
      if (chunks[chunkIndex + 1]?.first === index + 1) chunkIndex++
      const perChunk = chunks[chunkIndex]!.count
      if (sampleIndex + perChunk > count) invalid('采样分块数量超出采样表')
      let length = fixed * perChunk
      if (!fixed)
        for (let sample = sampleIndex; sample < sampleIndex + perChunk; sample++)
          length += u32(b, stsz.payload + 12 + sample * 4)
      if (!length || !media.some((box) => position >= box.payload && position + length <= box.end))
        invalid('采样位置或长度不在媒体数据内')
      sampleIndex += perChunk
    }
    if (sampleIndex !== count) invalid('采样分块数量与采样表不一致')
    const version = b[mdhd.payload],
      timeAt = mdhd.payload + (version === 1 ? 20 : 12)
    if ((version !== 0 && version !== 1) || timeAt + (version === 1 ? 12 : 8) > mdhd.end)
      invalid('媒体时间信息截断')
    const timescale = u32(b, timeAt),
      duration =
        version === 1 ? (u32(b, timeAt + 4) === 0 ? u32(b, timeAt + 8) : NaN) : u32(b, timeAt + 4)
    if (!timescale || !Number.isFinite(duration) || (duration <= 0 && !fragment))
      invalid('媒体时长无效')
    let naturalSize = null
    if (kind === 'vide') {
      naturalSize = size(u32(b, widthAt) / 65536, u32(b, widthAt + 4) / 65536)
      const matrix = widthAt - 36
      if (
        naturalSize &&
        i32(b, matrix) === 0 &&
        i32(b, matrix + 16) === 0 &&
        i32(b, matrix + 4) !== 0 &&
        i32(b, matrix + 12) !== 0
      )
        naturalSize = { width: naturalSize.height, height: naturalSize.width }
    }
    return {
      kind,
      codecs: entries.map((entry) => entry.type),
      naturalSize,
      durationSeconds: (duration + (fragment?.duration ?? 0)) / timescale,
    }
  })
  const chosen = parsed.find((track) => track.kind === (ext === 'm4a' ? 'soun' : 'vide'))
  if (!chosen || (ext === 'm4a' && parsed.some((track) => track.kind === 'vide')))
    invalid('媒体轨道与音视频类型不一致')
  return {
    naturalSize: chosen.naturalSize,
    durationSeconds: chosen.durationSeconds,
    codecs: parsed.flatMap((track) => track.codecs),
  }
}

function riffChunks(b: Uint8Array, start: number, end: number, budget: Budget): Box[] {
  const out: Box[] = []
  for (let at = start; at < end;) {
    if (++budget.count > 16384 || at + 8 > end) invalid('RIFF块数量超限或截断')
    const length = u32(b, at + 4, true),
      next = at + 8 + length
    if (next > end || next + (length & 1) > end) invalid('RIFF块长度越界')
    out.push({ type: tag(b, at), start: at, payload: at + 8, end: next })
    at = next + (length & 1)
  }
  return out
}
export function inspectRiffMedia(b: Uint8Array, avi: boolean): PptxMediaMetadata {
  if (
    b.length < 12 ||
    tag(b, 0) !== 'RIFF' ||
    tag(b, 8) !== (avi ? 'AVI ' : 'WAVE') ||
    u32(b, 4, true) + 8 !== b.length
  )
    invalid('RIFF容器签名或长度错误')
  const budget = { count: 0 },
    chunks = riffChunks(b, 12, b.length, budget)
  if (!avi) {
    const fmt = one(chunks, 'fmt ', true)!,
      data = one(chunks, 'data', true)!
    if (fmt.end - fmt.payload < 16 || data.end === data.payload) invalid('WAV格式或音频数据为空')
    const p = fmt.payload,
      format = u16(b, p),
      channels = u16(b, p + 2),
      rate = u32(b, p + 4, true),
      bytesPerSecond = u32(b, p + 8, true),
      align = u16(b, p + 12)
    if (
      !format ||
      !channels ||
      channels > 32 ||
      !rate ||
      rate > 384000 ||
      !bytesPerSecond ||
      !align
    )
      invalid('WAV音频参数无效')
    if ((format === 1 || format === 3) && (data.end - data.payload) % align)
      invalid('WAV采样帧截断')
    return {
      naturalSize: null,
      durationSeconds: (data.end - data.payload) / bytesPerSecond,
      codecs: [`wave-${format}`],
    }
  }
  const lists = chunks.filter((c) => c.type === 'LIST' && c.end - c.payload >= 4),
    headers = lists.filter((c) => tag(b, c.payload) === 'hdrl'),
    movies = lists.filter((c) => tag(b, c.payload) === 'movi')
  if (headers.length !== 1 || !movies.some((c) => c.end - c.payload > 12))
    invalid('AVI头或视频帧缺失')
  let hasVideoFrame = false
  const pending = movies.map((movie) => ({ start: movie.payload + 4, end: movie.end, depth: 0 }))
  for (let at = 0; at < pending.length; at++) {
    const current = pending[at]!
    for (const frame of riffChunks(b, current.start, current.end, budget)) {
      if (/^\d\d(?:dc|db)$/.test(frame.type) && frame.end > frame.payload) hasVideoFrame = true
      if (
        frame.type === 'LIST' &&
        frame.end - frame.payload >= 4 &&
        tag(b, frame.payload) === 'rec '
      ) {
        if (current.depth >= 4) invalid('AVI帧容器嵌套超限')
        pending.push({ start: frame.payload + 4, end: frame.end, depth: current.depth + 1 })
      }
    }
  }
  if (!hasVideoFrame) invalid('AVI缺少实际视频采样帧')
  const hdrl = riffChunks(b, headers[0]!.payload + 4, headers[0]!.end, budget),
    avih = one(hdrl, 'avih', true)!
  if (avih.end - avih.payload < 56) invalid('AVI主头截断')
  const microseconds = u32(b, avih.payload, true),
    frames = u32(b, avih.payload + 16, true)
  if (!microseconds || !frames) invalid('AVI没有有效视频帧')
  const streams = hdrl.filter(
    (c) => c.type === 'LIST' && c.end - c.payload >= 4 && tag(b, c.payload) === 'strl',
  )
  if (!streams.length || streams.length > 32) invalid('AVI轨道数量无效')
  const tracks = streams.map((stream) => {
    const items = riffChunks(b, stream.payload + 4, stream.end, budget),
      strh = one(items, 'strh', true)!,
      strf = one(items, 'strf', true)!
    if (strh.end - strh.payload < 56) invalid('AVI轨道头截断')
    const type = tag(b, strh.payload)
    if (type !== 'vids') return { type, codec: tag(b, strh.payload + 4), naturalSize: null }
    if (
      !u32(b, strh.payload + 20, true) ||
      !u32(b, strh.payload + 24, true) ||
      !u32(b, strh.payload + 32, true)
    )
      invalid('AVI视频采样时序无效')
    if (strf.end - strf.payload < 40 || u32(b, strf.payload, true) < 40) invalid('AVI视频格式截断')
    return {
      type,
      codec: tag(b, strh.payload + 4),
      naturalSize: size(i32(b, strf.payload + 4, true), Math.abs(i32(b, strf.payload + 8, true))),
    }
  })
  const video = tracks.find((t) => t.type === 'vids')
  if (!video) invalid('AVI文件缺少视频轨道')
  return {
    naturalSize: video.naturalSize,
    durationSeconds: (frames * microseconds) / 1000000,
    codecs: tracks.map((t) => t.codec),
  }
}

function vint(b: Uint8Array, at: number, end: number, id = false, sizeValue = true) {
  if (at >= end || b[at] === 0) invalid('WebM整数头截断')
  let length = 1
  while (length <= 8 && !(b[at]! & (128 >> (length - 1)))) length++
  if (length > (id ? 4 : 8) || at + length > end) invalid('WebM整数长度无效')
  let value = id ? b[at]! : b[at]! & (255 >> length),
    unknown = !id && sizeValue && value === 255 >> length
  for (let p = 1; p < length; p++) {
    value = value * 256 + b[at + p]!
    unknown = unknown && b[at + p] === 255
  }
  if (!unknown && !Number.isSafeInteger(value)) invalid('WebM长度溢出')
  return { length, value: unknown ? -1 : value }
}
type Ebml = { id: number; payload: number; end: number }
function ebml(b: Uint8Array, start: number, end: number, budget: Budget): Ebml[] {
  const out: Ebml[] = []
  for (let at = start; at < end;) {
    if (++budget.count > 8192) invalid('WebM元素数量超限')
    const id = vint(b, at, end, true),
      length = vint(b, at + id.length, end),
      payload = at + id.length + length.length
    if (length.value < 0 && id.value !== 0x18538067 && id.value !== 0x1f43b675)
      invalid('WebM未知长度只允许Segment/Cluster')
    const next = length.value < 0 ? end : payload + length.value
    if (next > end) invalid('WebM元素越界')
    out.push({ id: id.value, payload, end: next })
    at = next
  }
  return out
}
/** Validate the block header and every laced frame range without decoding codecs. */
function webmBlock(b: Uint8Array, block: Ebml) {
  const track = vint(b, block.payload, block.end, false, false)
  let at = block.payload + track.length
  if (!track.value || at + 3 >= block.end) invalid('WebM采样头截断或轨道无效')
  const lacing = (b[at + 2]! >> 1) & 3
  at += 3
  if (!lacing) return track.value
  const frames = b[at++]! + 1
  if (frames < 2 || at >= block.end) invalid('WebM采样分帧头无效')
  if (lacing === 2) {
    if ((block.end - at) % frames || block.end - at < frames) invalid('WebM固定采样分帧长度无效')
    return track.value
  }
  let sum = 0,
    previous = 0
  for (let index = 0; index < frames - 1; index++) {
    let length = 0
    if (lacing === 1) {
      let part: number
      do {
        if (at >= block.end) invalid('WebM采样分帧长度截断')
        part = b[at++]!
        length += part
      } while (part === 255)
    } else {
      const field = vint(b, at, block.end, false, false)
      at += field.length
      length =
        index === 0 ? field.value : previous + field.value - (2 ** (field.length * 7 - 1) - 1)
    }
    if (!Number.isSafeInteger(length) || length <= 0) invalid('WebM采样分帧长度无效')
    sum += length
    previous = length
  }
  if (sum >= block.end - at) invalid('WebM采样分帧数据越界')
  return track.value
}
export function inspectWebmMedia(b: Uint8Array): PptxMediaMetadata {
  const budget = { count: 0 },
    top = ebml(b, 0, b.length, budget),
    headers = top.filter((n) => n.id === 0x1a45dfa3),
    segments = top.filter((n) => n.id === 0x18538067)
  if (headers.length !== 1 || segments.length !== 1) invalid('WebM文件头或Segment无效')
  const header = ebml(b, headers[0]!.payload, headers[0]!.end, budget),
    doc = header.find((n) => n.id === 0x4282)
  if (!doc || doc.end - doc.payload !== 4 || tag(b, doc.payload, 4) !== 'webm')
    invalid('WebM文档类型错误')
  const children = ebml(b, segments[0]!.payload, segments[0]!.end, budget),
    tracks = children.filter((n) => n.id === 0x1654ae6b)
  if (tracks.length !== 1 || !children.some((n) => n.id === 0x1f43b675 && n.end > n.payload))
    invalid('WebM轨道或采样缺失')
  const entries = ebml(b, tracks[0]!.payload, tracks[0]!.end, budget).filter((n) => n.id === 0xae)
  if (!entries.length || entries.length > 32) invalid('WebM轨道数量无效')
  const parsed = entries.map((entry) => {
    const fields = ebml(b, entry.payload, entry.end, budget),
      number = fields.find((n) => n.id === 0xd7),
      type = fields.find((n) => n.id === 0x83),
      codec = fields.find((n) => n.id === 0x86),
      video = fields.find((n) => n.id === 0xe0)
    if (!number || !type || !codec || codec.end === codec.payload || codec.end - codec.payload > 64)
      invalid('WebM轨道类型或编码缺失')
    const trackType = uint(b, type.payload, type.end - type.payload),
      trackNumber = uint(b, number.payload, number.end - number.payload)
    if (!trackNumber) invalid('WebM轨道编号无效')
    let naturalSize = null
    if (trackType === 1 && video) {
      const values = ebml(b, video.payload, video.end, budget),
        read = (id: number) => {
          const n = values.find((v) => v.id === id)
          return n ? uint(b, n.payload, n.end - n.payload) : 0
        }
      const dw = read(0x54b0),
        dh = read(0x54ba),
        unit = read(0x54b2)
      naturalSize = size(
        dw && dh && unit === 0 ? dw : read(0xb0),
        dw && dh && unit === 0 ? dh : read(0xba),
      )
    }
    return {
      trackNumber,
      trackType,
      codec: tag(b, codec.payload, codec.end - codec.payload),
      naturalSize,
    }
  })
  if (new Set(parsed.map((track) => track.trackNumber)).size !== parsed.length)
    invalid('WebM轨道编号重复')
  const video = parsed.find((t) => t.trackType === 1)
  if (!video) invalid('WebM文件没有视频轨道')
  let videoSamples = 0
  for (const cluster of children.filter((n) => n.id === 0x1f43b675)) {
    for (const entry of ebml(b, cluster.payload, cluster.end, budget)) {
      const blocks =
        entry.id === 0xa3
          ? [entry]
          : entry.id === 0xa0
            ? ebml(b, entry.payload, entry.end, budget).filter((n) => n.id === 0xa1)
            : []
      for (const block of blocks) {
        const number = webmBlock(b, block),
          track = parsed.find((t) => t.trackNumber === number)
        if (!track) invalid('WebM采样引用未知轨道')
        if (track.trackType === 1) videoSamples++
      }
    }
  }
  if (!videoSamples) invalid('WebM视频采样缺失')
  return { naturalSize: video.naturalSize, codecs: parsed.map((t) => t.codec) }
}
