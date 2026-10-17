export function invalidMedia(detail: string): never {
  throw new Error(`媒体文件无效：${detail}`)
}
export const mediaTag = (b: Uint8Array, p: number, n = 4) =>
  String.fromCharCode(...b.subarray(p, p + n))
export const mediaU32 = (b: Uint8Array, p: number, le = false) =>
  new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(p, le)
export const mediaI32 = (b: Uint8Array, p: number, le = false) =>
  new DataView(b.buffer, b.byteOffset, b.byteLength).getInt32(p, le)
export const mediaU16 = (b: Uint8Array, p: number) =>
  new DataView(b.buffer, b.byteOffset, b.byteLength).getUint16(p, true)
export const mediaUint = (b: Uint8Array, p: number, n: number) => {
  if (n < 1 || n > 6) invalidMedia('整数超出安全预算')
  let value = 0
  for (let i = 0; i < n; i++) value = value * 256 + b[p + i]!
  return value
}
export function mediaSize(width: number, height: number) {
  if (!width && !height) return null
  if (![width, height].every((n) => Number.isFinite(n) && n > 0 && n <= 32768))
    invalidMedia('视频尺寸超出范围')
  return { width, height }
}
