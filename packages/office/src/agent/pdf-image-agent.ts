import {
  pdfImageOperationSchema,
  type PdfImageOperation,
  type PdfImageSnapshot,
} from '@mimir/shared'
import type { PdfTextIndex } from '../editors/pdf-text.js'
export const PDF_IMAGE_TOOLS = [
  'list_page_images',
  'insert_image',
  'transform_image',
  'rotate_image',
  'replace_image',
  'flip_image',
  'set_image_opacity',
  'crop_image',
  'remove_image_background',
  'delete_image',
] as const
export interface PdfHostImages {
  (input: {
    bytes: Uint8Array
    assetSessionId?: string
    expectedVersion: number
    operation: PdfImageOperation
    signal?: AbortSignal
  }): Promise<{ bytes?: Uint8Array; version: number; images: PdfImageSnapshot }>
}
const number = (value: unknown, max: number, label: string) => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max)
    throw new Error(`${label}必须在1–${max}之间`)
  return value
}
export async function executePdfImageTool(input: {
  tool: string
  args: Record<string, unknown>
  bytes: Uint8Array
  version: number
  pageCount: number
  host?: PdfHostImages
  textIndex(): Promise<PdfTextIndex>
  signal?: AbortSignal
}) {
  const { host, tool, args, bytes, version, signal } = input
  if (!host) throw new Error('PDF图片宿主未连接')
  const page =
    tool === 'list_page_images' && args.page === undefined
      ? undefined
      : number(args.page, input.pageCount, '页号')
  const before = await host({
    bytes,
    expectedVersion: version,
    operation: { op: 'read', pageIndex: page === undefined ? undefined : page - 1 },
    signal,
  })
  if (signal?.aborted) throw new Error('操作已取消')
  if (before.version !== version) throw new Error('PDF图片宿主版本无效')
  if (tool === 'list_page_images') return { data: before.images }
  let operation: Record<string, unknown> = { op: tool }
  if (tool === 'insert_image') {
    operation.pageIndex = page! - 1
    for (const key of ['image', 'url', 'x', 'y', 'width', 'height', 'layer'])
      if (args[key] !== undefined) operation[key] = args[key]
    if (args.anchor_text !== undefined) {
      if (args.x !== undefined || args.y !== undefined) throw new Error('图片锚点与坐标不能混用')
      if (typeof args.anchor_text !== 'string' || !args.anchor_text.trim())
        throw new Error('图片锚点文字无效')
      const index = await input.textIndex(),
        matches =
          index.pages[page! - 1]?.chunks.filter((chunk) => chunk.sourceText === args.anchor_text) ??
          []
      if (matches.length !== 1) throw new Error('图片锚点须为唯一完整文字项')
      const { loadPdfDocument } = await import('../editors/pdf-render.js')
      const viewport = (await (await loadPdfDocument(bytes)).getPage(page!)).getViewport({
          scale: 1,
        }),
        rect = matches[0]!.rect
      operation.anchor = {
        x: rect.x * viewport.width,
        y: rect.y * viewport.height,
        width: rect.width * viewport.width,
        height: rect.height * viewport.height,
        placement: args.placement ?? 'below',
      }
    } else if (args.placement !== undefined) throw new Error('placement需要anchor_text')
  } else {
    const candidates = before.images.images.filter((image) => image.page === page)
    const at = number(args.image_number, candidates.length, '图片序号')
    const selected = candidates.find((image) => image.image_number === at)
    if (!selected?.editable) throw new Error(selected?.reason ?? '图片不可编辑')
    operation.target = selected.target
    if (tool === 'transform_image')
      for (const key of ['x', 'y', 'width', 'height', 'layer']) {
        if (args[key] !== undefined) operation[key] = args[key]
      }
    else if (tool === 'replace_image') {
      operation.image = args.image
      operation.url = args.url
    } else if (tool === 'rotate_image') operation.direction = args.direction ?? 'cw'
    else if (tool === 'flip_image') operation.axis = args.axis
    else if (tool === 'set_image_opacity') operation.alpha = args.opacity
    else if (tool === 'crop_image')
      for (const key of ['left', 'top', 'right', 'bottom']) operation[key] = args[key] ?? 0
    else if (tool === 'remove_image_background') operation.tolerance = args.tolerance
  }
  operation = Object.fromEntries(
    Object.entries(operation).filter(([, value]) => value !== undefined),
  )
  const result = await host({
    bytes,
    expectedVersion: version,
    operation: pdfImageOperationSchema.parse(operation),
    signal,
  })
  if (!result.bytes || result.version !== version + 1) throw new Error('PDF图片宿主写入结果无效')
  return { bytes: result.bytes, data: result.images }
}
