import { loadImage } from '@napi-rs/canvas'
import { parentPort, workerData } from 'node:worker_threads'
import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'
import { CHAT_ATTACHMENT_LIMITS as L, extensionOf, mimeFromFilename } from '@mimir/shared'

/** Pure preparation in a terminable worker. Never writes storage, database, or KB. */
export async function inspectChatAttachment(name: string, declaredMime: string, data: Uint8Array) {
  const ext = extensionOf(name)
  const bytes = Buffer.from(data)
  const image = ['png', 'jpg', 'jpeg', 'webp'].includes(ext)
  if (!data.length || data.length > (image ? L.imageBytes : L.documentBytes))
    throw new Error('附件为空或超过单件大小限制')
  const inferredMime = mimeFromFilename(name)
  const mime = inferredMime === 'application/octet-stream' && !image ? 'text/plain' : inferredMime
  const textMime =
    !image &&
    !['docx', 'xlsx', 'pptx', 'pdf'].includes(ext) &&
    (declaredMime.startsWith('text/') ||
      // Native pickers also use the MPEG transport-stream MIME for TypeScript files.
      // The text branch below still validates every byte as strict non-binary UTF-8.
      (ext === 'ts' && declaredMime === 'video/mp2t') ||
      [
        'application/json',
        'application/xml',
        'application/yaml',
        'application/javascript',
        'application/x-yaml',
        'application/x-sh',
        'application/x-python-code',
      ].includes(declaredMime))
  if (
    declaredMime &&
    declaredMime !== 'application/octet-stream' &&
    declaredMime !== mime &&
    !textMime
  )
    throw new Error('文件扩展名与声明的类型不匹配')
  if (image) {
    let width = 0,
      height = 0
    if (ext === 'png') {
      if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        throw new Error('PNG 文件签名无效')
      width = bytes.readUInt32BE(16)
      height = bytes.readUInt32BE(20)
      let offset = 8
      while (offset + 12 <= bytes.length) {
        const size = bytes.readUInt32BE(offset),
          type = bytes.toString('ascii', offset + 4, offset + 8)
        if (type === 'acTL') throw new Error('不支持动画图片')
        if (offset + size + 12 > bytes.length) throw new Error('PNG 容器损坏')
        offset += size + 12
      }
      checkDimensions(width, height)
      PNG.sync.read(bytes, { checkCRC: true })
    } else if (ext === 'webp') {
      if (
        bytes.length < 30 ||
        bytes.toString('ascii', 0, 4) !== 'RIFF' ||
        bytes.toString('ascii', 8, 12) !== 'WEBP' ||
        bytes.readUInt32LE(4) + 8 !== bytes.length
      )
        throw new Error('WebP 容器损坏')
      let offset = 12,
        found = false
      while (offset + 8 <= bytes.length) {
        const type = bytes.toString('ascii', offset, offset + 4),
          size = bytes.readUInt32LE(offset + 4),
          start = offset + 8
        if (start + size > bytes.length) throw new Error('WebP 部件损坏')
        if (type === 'ANIM' || type === 'ANMF' || (type === 'VP8X' && bytes[start]! & 2))
          throw new Error('不支持动画图片')
        if (type === 'VP8 ' && size >= 10) {
          if (bytes.toString('hex', start + 3, start + 6) !== '9d012a')
            throw new Error('WebP 帧损坏')
          width = bytes.readUInt16LE(start + 6) & 0x3fff
          height = bytes.readUInt16LE(start + 8) & 0x3fff
          found = true
        }
        if (type === 'VP8L' && size >= 5 && bytes[start] === 0x2f) {
          const bits = bytes.readUInt32LE(start + 1)
          width = (bits & 0x3fff) + 1
          height = ((bits >>> 14) & 0x3fff) + 1
          found = true
        }
        offset = start + size + (size % 2)
      }
      if (!found || offset !== bytes.length) throw new Error('WebP 缺少有效静态帧')
      checkDimensions(width, height)
      const decoded = await loadImage(bytes)
      if (decoded.width !== width || decoded.height !== height) throw new Error('WebP 帧尺寸不一致')
    } else {
      if (bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217)
        throw new Error('JPEG 文件签名无效')
      // The decoder's resolution budget is enforced before allocation.
      const decoded = jpeg.decode(bytes, {
        maxResolutionInMP: 16,
        maxMemoryUsageInMB: 96,
        tolerantDecoding: false,
        useTArray: true,
      })
      width = decoded.width
      height = decoded.height
      checkDimensions(width, height)
    }
    return { mime, kind: 'image' as const, text: null }
  }
  const binary = ['docx', 'xlsx', 'pptx', 'pdf'].includes(ext)
  const textExtensions = new Set([
    'txt',
    'md',
    'markdown',
    'csv',
    'tsv',
    'json',
    'yaml',
    'yml',
    'xml',
    'js',
    'jsx',
    'ts',
    'tsx',
    'py',
    'java',
    'c',
    'h',
    'cpp',
    'hpp',
    'cs',
    'go',
    'rs',
    'rb',
    'php',
    'swift',
    'kt',
    'kts',
    'sh',
    'bash',
    'zsh',
    'sql',
    'css',
    'scss',
    'html',
    'htm',
    'vue',
    'svelte',
    'toml',
    'ini',
    'conf',
    'log',
    'r',
    'lua',
    'pl',
    'ex',
    'exs',
  ])
  if (!binary && !textExtensions.has(ext)) throw new Error('暂不支持此聊天附件格式')
  if (ext === 'pdf' && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
    throw new Error('PDF 文件签名无效')
  if (binary && ext !== 'pdf' && !bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4])))
    throw new Error('Office 文件不是有效 OOXML 容器')
  // Decode all text strictly, including renamed binary files and late NUL bytes.
  let text: string
  if (!binary) {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(data).replace(/\r\n?/g, '\n')
    } catch {
      throw new Error('附件不是有效 UTF-8 文本，请转换编码后重选')
    }
    if (
      [...text].some(
        (char) => char.charCodeAt(0) < 32 && ![9, 10, 12, 13].includes(char.charCodeAt(0)),
      )
    )
      throw new Error('文件含二进制控制字符')
  } else {
    const { parseAttachmentFile } = await import(workerData.parserModule)
    text = await parseAttachmentFile(ext, data, name)
  }
  if (!text.trim()) throw new Error('附件没有可提取的文字（扫描 PDF 不支持 OCR）')
  if (text.length > L.textCharacters) throw new Error('附件正文超过 12000 字符，请缩小内容后重选')
  return {
    mime: binary ? mime : mime === 'application/octet-stream' ? 'text/plain' : mime,
    kind: 'document' as const,
    text,
  }
}
function checkDimensions(width: number, height: number) {
  if (
    width <= 0 ||
    height <= 0 ||
    width > L.imageEdge ||
    height > L.imageEdge ||
    width * height > L.imagePixels
  )
    throw new Error('图片超过 4096 边长或 16MP 限制')
}

if (parentPort && workerData?.chatAttachment) {
  const port = parentPort
  inspectChatAttachment(workerData.name, workerData.mime, workerData.data).then(
    (result) => port.postMessage({ result }),
    (error) => port.postMessage({ error: error instanceof Error ? error.message : String(error) }),
  )
}
