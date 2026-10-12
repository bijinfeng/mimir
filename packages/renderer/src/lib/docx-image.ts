/** Office's OOXML writer accepts PNG/JPEG/GIF; normalize a fetched WebP before insertion. */
async function rasterizeToJpeg(
  image: { dataUrl: string; mimeType: string },
  signal: AbortSignal,
): Promise<{ dataUrl: string; mimeType: string }> {
  if (signal.aborted) throw new Error('图片下载已停止')
  const response = await fetch(image.dataUrl, { signal })
  const bitmap = await createImageBitmap(await response.blob())
  try {
    const scale = Math.min(1, 4096 / bitmap.width, 4096 / bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法转换 WebP 图片')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    if (signal.aborted) throw new Error('图片下载已停止')
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.88), mimeType: 'image/jpeg' }
  } finally {
    bitmap.close()
  }
}

export function officeImageData(
  image: { dataUrl: string; mimeType: string },
  signal: AbortSignal,
): Promise<{ dataUrl: string; mimeType: string }> {
  return image.mimeType === 'image/webp' ? rasterizeToJpeg(image, signal) : Promise.resolve(image)
}

export function mediaImageData(
  image: { dataUrl: string; mimeType: string },
  signal: AbortSignal,
): Promise<{ dataUrl: string; mimeType: string }> {
  return image.mimeType === 'image/gif' ? rasterizeToJpeg(image, signal) : Promise.resolve(image)
}
