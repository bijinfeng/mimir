import type { PdfSignatureSource } from '@mimir/shared'
export type SignatureRect = { x: number; y: number; width: number; height: number }
export const SIGNATURE_FONTS = [
  { label: '宋体', family: '"Songti SC", "Noto Serif CJK SC", serif', italic: false },
  { label: '楷体', family: '"Kaiti SC", "KaiTi", serif', italic: false },
  { label: '无衬线', family: '"PingFang SC", "Microsoft YaHei", sans-serif', italic: false },
  { label: '斜体', family: '"Times New Roman", "Songti SC", serif', italic: true },
] as const
export function placeSignature(
  width: number,
  height: number,
  size: { width: number; height: number },
  x = size.width / 2,
  y = size.height / 2,
): SignatureRect {
  const scale = Math.min(size.width / 3 / width, size.height / 6 / height)
  const w = width * scale,
    h = height * scale
  return {
    x: Math.max(0, Math.min(size.width - w, x - w / 2)),
    y: Math.max(0, Math.min(size.height - h, y - h / 2)),
    width: w,
    height: h,
  }
}
export function clampSignature(
  rect: SignatureRect,
  size: { width: number; height: number },
): SignatureRect {
  const scale = Math.min(1, size.width / rect.width, size.height / rect.height)
  const width = rect.width * scale,
    height = rect.height * scale
  return {
    width,
    height,
    x: Math.max(0, Math.min(size.width - width, rect.x)),
    y: Math.max(0, Math.min(size.height - height, rect.y)),
  }
}
function croppedCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('浏览器不支持签名绘制')
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let left = width,
    top = height,
    right = -1,
    bottom = -1
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3]! > 0) {
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x)
        bottom = Math.max(bottom, y)
      }
  if (right < left) throw new Error('签名没有可见内容，请重新输入或选择图片')
  const out = document.createElement('canvas')
  out.width = right - left + 5
  out.height = bottom - top + 5
  out
    .getContext('2d')!
    .drawImage(
      canvas,
      left,
      top,
      right - left + 1,
      bottom - top + 1,
      2,
      2,
      right - left + 1,
      bottom - top + 1,
    )
  return out
}
function stamp(canvas: HTMLCanvasElement): PdfSignatureSource {
  const result = croppedCanvas(canvas),
    scale = Math.min(1, 1600 / result.width, 1600 / result.height)
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.ceil(result.width * scale))
  out.height = Math.max(1, Math.ceil(result.height * scale))
  out.getContext('2d')!.drawImage(result, 0, 0, out.width, out.height)
  const png = out.toDataURL('image/png').split(',')[1]!
  if (png.length > 5592408) throw new Error('签名 PNG 不能超过 4 MiB')
  return { kind: 'stamp', width: out.width, height: out.height, png }
}
export async function typedSignature(
  text: string,
  font: number,
  color: string,
): Promise<PdfSignatureSource> {
  if (!text.trim() || text.length > 100) throw new Error('请输入 1–100 字符的姓名')
  const selected = SIGNATURE_FONTS[font]!
  await document.fonts?.load(`${selected.italic ? 'italic ' : ''}120px ${selected.family}`, text)
  await document.fonts?.ready
  const f = SIGNATURE_FONTS[font]!,
    canvas = document.createElement('canvas'),
    ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持签名绘制')
  const style = `${f.italic ? 'italic ' : ''}120px ${f.family}`
  ctx.font = style
  const m = ctx.measureText(text),
    left = Math.max(0, m.actualBoundingBoxLeft || 0),
    right = Math.max(m.width, m.actualBoundingBoxRight || 0),
    ascent = Math.max(120, m.actualBoundingBoxAscent || 0),
    descent = Math.max(36, m.actualBoundingBoxDescent || 0)
  const scale = Math.min(1, 1592 / (left + right + 8))
  canvas.width = Math.ceil((left + right + 8) * scale)
  canvas.height = Math.ceil((ascent + descent + 8) * scale)
  ctx.scale(scale, scale)
  ctx.font = style
  ctx.fillStyle = color
  ctx.fillText(text, left + 4, ascent + 4)
  return stamp(canvas)
}
/** Inspect encoded dimensions before browser allocation. Only PNG and JPEG. */
export async function importedSignature(
  file: File,
  monochrome: boolean,
): Promise<PdfSignatureSource> {
  if (!file.size || file.size > 8 * 1024 * 1024)
    throw new Error('请选择不超过 8 MiB 的 PNG 或 JPEG')
  const bytes = new Uint8Array(await file.arrayBuffer()),
    view = new DataView(bytes.buffer)
  let width = 0,
    height = 0
  if (bytes.length >= 24 && bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10') {
    width = view.getUint32(16)
    height = view.getUint32(20)
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    for (let p = 2; p + 9 < bytes.length;) {
      if (bytes[p++] !== 255) throw new Error('JPEG 数据无效')
      const marker = bytes[p++]!
      if (marker === 217 || marker === 218) break
      if (marker === 216 || marker === 1 || (marker >= 208 && marker <= 215)) continue
      const n = view.getUint16(p)
      if (n < 2 || p + n > bytes.length) throw new Error('JPEG 数据不完整')
      if ([192, 193, 194].includes(marker)) {
        height = view.getUint16(p + 3)
        width = view.getUint16(p + 5)
        break
      }
      p += n
    }
  } else throw new Error('签名图片仅支持 PNG 或 JPEG')
  if (!width || !height || width > 12000 || height > 12000 || width * height > 24_000_000)
    throw new Error('原图尺寸超限（最长边 12000px，2400 万像素）')
  const url = URL.createObjectURL(
    new Blob([bytes], { type: bytes[0] === 137 ? 'image/png' : 'image/jpeg' }),
  )
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, 1596 / width, 1596 / height),
      canvas = document.createElement('canvas')
    canvas.width = Math.ceil(width * scale)
    canvas.height = Math.ceil(height * scale)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('浏览器不支持签名绘制')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    if (monochrome) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < pixels.data.length; i += 4) {
        const l =
          0.299 * pixels.data[i]! + 0.587 * pixels.data[i + 1]! + 0.114 * pixels.data[i + 2]!
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 0
        pixels.data[i + 3] = Math.round(
          pixels.data[i + 3]! * Math.max(0, Math.min(1, (200 - l) / 80)),
        )
      }
      ctx.putImageData(pixels, 0, 0)
    }
    return stamp(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}
