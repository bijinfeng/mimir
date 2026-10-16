/** Server-injected PNG/JPEG codec; the shared browser bundle never imports this port. */
export interface PdfNativeImage {
  isEmpty(): boolean
  getSize(): { width: number; height: number }
  toBitmap(): Buffer
  toPNG(): Buffer
}
export interface PdfNativeImageCodec {
  createFromBuffer(bytes: Buffer): PdfNativeImage
  createFromBitmap(bytes: Buffer, size: { width: number; height: number }): PdfNativeImage
}
let codec: PdfNativeImageCodec | undefined
export function configurePdfImageCodec(next: PdfNativeImageCodec): void {
  codec = next
}
export const nativeImage: PdfNativeImageCodec = {
  createFromBuffer(bytes) {
    if (!codec) throw new Error('PDF 图片解码端口未连接')
    return codec.createFromBuffer(bytes)
  },
  createFromBitmap(bytes, size) {
    if (!codec) throw new Error('PDF 图片编码端口未连接')
    return codec.createFromBitmap(bytes, size)
  },
}
