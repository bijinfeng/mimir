/**
 * 头像的客户端裁剪（`.trellis/spec/project/architecture.md` §12.6、D-036）。
 *
 * ## 两条路径
 *
 * 1. **可视化裁切**（`AvatarCropper` 组件）：用户在 cropperjs 里拖拽、缩放，
 *    选好区域后调 `canvasToAvatar()` 把裁切 canvas 转成 blob + 预览 URL。
 * 2. **自动中心裁切**（`cropAvatar()`）：从中心取正方形、缩到 256×256。
 *    保留作为无 UI 场景的兜底（测试、批量处理）。
 *
 * ## 三条约束
 *
 * 1. **裁成正方形**。界面上的头像是圆的，方形是它的最小包围盒；
 *    保留原比例会让服务端还要处理「非正方形」这种情况
 * 2. **缩到 256×256**。display 尺寸最大是 72px（账号分区），256 已经给足了
 *    高 DPI 余量，而文件通常只有十几 KB
 * 3. **编码 webp**。`toBlob` 失败时（老浏览器不支持）退回 png——
 *    静默产出一个空 blob 会让「上传成功但没头像」变成一个查不出的问题
 */

const MAX_SIDE = 256

export interface CroppedAvatar {
  blob: Blob
  /** 预览用的本地 URL。调用方负责 `URL.revokeObjectURL` */
  previewUrl: string
}

/**
 * 把一个 canvas 转成头像 blob + 预览 URL。
 *
 * 可视化裁切路径用它：cropperjs 产出裁切 canvas，这里统一做缩放（到 256）、
 * webp 编码、预览 URL 生成。
 */
export async function canvasToAvatar(
  source: HTMLCanvasElement,
  size = MAX_SIDE,
): Promise<CroppedAvatar> {
  // 源可能比 256 大（用户选的是大图），统一缩到 MAX_SIDE 以控制文件体积
  const scale = Math.min(1, size / Math.max(source.width, source.height))
  const target = Math.max(1, Math.round(Math.max(source.width, source.height) * scale))

  const canvas = document.createElement('canvas')
  canvas.width = target
  canvas.height = target

  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器不支持 canvas 2d，无法裁剪')

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, target, target)

  const blob = await toBlob(canvas)
  return { blob, previewUrl: URL.createObjectURL(blob) }
}

export async function cropAvatar(file: File): Promise<CroppedAvatar> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error('这个文件不是能读的图片')

  /**
   * 取中心的正方形。
   *
   * 用 `Math.min` 而不是分别判断两个方向：短边决定正方形的边长，
   * 长边裁掉两侧——这是「从中心裁」的标准做法。
   */
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = Math.floor((bitmap.width - side) / 2)
  const sy = Math.floor((bitmap.height - side) / 2)
  const target = Math.min(MAX_SIDE, side)

  const canvas = document.createElement('canvas')
  canvas.width = target
  canvas.height = target

  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器不支持 canvas 2d，无法裁剪')

  /**
   * 高质量缩放。默认的 `low` 在缩小时会出现明显的锯齿，
   * 而头像正是「缩小后看细节」的场景。
   */
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, sx, sy, side, side, 0, 0, target, target)

  // 用完就关：ImageBitmap 占的是 GPU 内存，不释放会在连续换头像时累积
  bitmap.close()

  const blob = await toBlob(canvas)
  return { blob, previewUrl: URL.createObjectURL(blob) }
}

/**
 * canvas → webp blob，失败退回 png。
 *
 * 导出给 `AvatarCropper` 用——可视化裁切拿到的是 cropperjs 的 canvas，
 * 它已经是正方形且尺寸合适，只需要编码。
 */
export function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        // webp 在部分浏览器上会静默返回 null（不是抛错），所以这里要判空并退回 png
        if (blob) {
          resolve(blob)
          return
        }
        canvas.toBlob(
          (fallback) => {
            if (fallback) resolve(fallback)
            else reject(new Error('图片编码失败，换一张试试'))
          },
          'image/png',
          0.92,
        )
      },
      'image/webp',
      0.9,
    )
  })
}
