import { createHash } from 'node:crypto'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import {
  pdfTextBlockOperationSchema,
  type PdfPageTextBlock,
  type PdfTextBlockOperation,
  type PdfTextBlockSnapshot,
  type PdfTextBlockTarget,
} from '@mimir/shared'
import { buildPdfTextIndex } from '../../../../packages/office/src/editors/pdf-text.js'
import {
  groupPdfTextBlocks,
  pdfTextBlockDelta,
  type PdfTextBlock,
} from '../../../../packages/office/src/editors/pdf-text-blocks.js'
import { assertSafeToRewrite, initializePdfAgentHost } from './pdf-agent-host.js'
import {
  pdfBlockReplacement,
  pdfBlockRewriteLayout,
  writePdfNativeBlockRewrite,
} from './pdf-block-rewrite.js'
import {
  assertPdfBlockActive,
  readPdfNativeBlockObjects,
  samePdfBlockMembers,
  writePdfNativeBlockMove,
  type PdfNativeBlockObject,
} from './pdf-block-writer.js'

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const squash = (text: string) => text.replace(/\s+/g, '')
const near = (a: readonly number[], b: readonly number[], tolerance = 0.05) =>
  a.length === b.length && a.every((value, index) => Math.abs(value - b[index]!) < tolerance)
const area = (r: readonly number[]) => Math.max(0, r[2]! - r[0]!) * Math.max(0, r[3]! - r[1]!)
function overlap(a: readonly number[], b: readonly number[]): number {
  const intersection =
    Math.max(0, Math.min(a[2]!, b[2]!) - Math.max(a[0]!, b[0]!)) *
    Math.max(0, Math.min(a[3]!, b[3]!) - Math.max(a[1]!, b[1]!))
  return intersection / Math.max(1e-8, Math.min(area(a), area(b)))
}
async function pageBlocks(bytes: Uint8Array, pageIndex: number, signal?: AbortSignal) {
  assertPdfBlockActive(signal)
  const task = getDocument({ data: bytes.slice() })
  try {
    const document = await task.promise
    if (pageIndex < 0 || pageIndex >= document.numPages) throw new Error('PDF 段落页号已失效')
    if (document.numPages > 1000) throw new Error('PDF 超过 1000 页校验预算')
    const page = await document.getPage(pageIndex + 1),
      viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent(),
      operators = await page.getOperatorList()
    if (content.items.length > 10000) throw new Error('PDF 页面文字项超过校验预算')
    const clipped = operators.fnArray.some(
      (op, index) =>
        op === OPS.clip ||
        op === OPS.eoClip ||
        (op === OPS.setTextRenderingMode && Number(operators.argsArray[index]?.[0]) >= 4),
    )
    const index = await buildPdfTextIndex(
      [{ bytes, index: pageIndex, rotation: page.rotate }],
      async () => document,
    )
    const blocks = groupPdfTextBlocks(index, 0).map((block) =>
      Object.assign(block, { page: pageIndex }),
    )
    assertPdfBlockActive(signal)
    const items = content.items
      .filter((item) => 'str' in item && item.str.trim() !== '')
      .map((item) => {
        if (!('str' in item)) throw new Error('PDF 原文项无效')
        const [a, b, c, d, e, f] = item.transform as [
          number,
          number,
          number,
          number,
          number,
          number,
        ]
        const advance = Math.hypot(a, b),
          rise = Math.hypot(c, d)
        const ux = (a / advance) * item.width,
          uy = (b / advance) * item.width,
          vx = (c / rise) * item.height,
          vy = (d / rise) * item.height
        const xs = [e, e + ux, e + vx, e + ux + vx],
          ys = [f, f + uy, f + vy, f + uy + vy]
        return {
          text: item.str,
          bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
          transform: item.transform,
          width: item.width,
          height: item.height,
          font: content.styles[item.fontName]?.fontFamily ?? item.fontName.replace(/^g_d\d+_/, ''),
          dir: item.dir,
        }
      })
    return { blocks, viewport, items, clipped }
  } finally {
    await task.destroy()
  }
}

function mapBlock(
  block: PdfTextBlock,
  all: PdfTextBlock[],
  native: PdfNativeBlockObject[],
  sha256: string,
  clipped: boolean,
): PdfTextBlockTarget {
  if (clipped) throw new Error('页面含有裁切内容流，无法证明原文可完整移动')
  if (block.items.length > 500 || block.text.length > 10000)
    throw new Error('段落超过 500 对象或 10000 字符预算')
  const candidates = native.filter(
    (object) =>
      block.items.some((item) => overlap(object.bounds, item.bounds) > 0.35) &&
      (object.type === 1 || object.type === 5),
  )
  if (
    !candidates.length ||
    candidates.some(
      (object) =>
        object.type !== 1 ||
        object.clipped ||
        !object.text.trim() ||
        object.matrix.some((value) => !Number.isFinite(value)) ||
        Math.abs(object.matrix[0] * object.matrix[3] - object.matrix[1] * object.matrix[2]) < 1e-8,
    )
  )
    throw new Error('段落不是可核验的独立顶层文字对象')
  const otherItems = all.filter((item) => item !== block).flatMap((item) => item.items)
  if (
    candidates.some((object) =>
      otherItems.some((item) => overlap(object.bounds, item.bounds) > 0.35),
    )
  )
    throw new Error('原生文字对象跨越多个段落，不能部分移动')
  for (const [index, item] of candidates.entries()) {
    if (candidates.slice(index + 1).some((other) => overlap(item.bounds, other.bounds) > 0.5))
      throw new Error('段落包含重叠文字对象，无法安全归属')
  }
  // Join in the actual paragraph's line order; PDF.js can merge adjacent native
  // objects into one item or split a native object at spaces/style boundaries.
  const ordered = candidates.toSorted((a, b) => {
    const firstA = block.items.findIndex((item) => overlap(a.bounds, item.bounds) > 0.35),
      firstB = block.items.findIndex((item) => overlap(b.bounds, item.bounds) > 0.35)
    return firstA - firstB || a.bounds[0] - b.bounds[0]
  })
  if (
    squash(ordered.map((object) => object.text).join('')) !== squash(block.text) ||
    block.items.some(
      (item) => !candidates.some((object) => overlap(object.bounds, item.bounds) > 0.35),
    )
  )
    throw new Error('PDF.js 段落与完整 PDFium 原文对象不一致')
  return {
    sha256,
    pageIndex: block.page,
    blockIndex: block.blockIndex,
    members: candidates
      .toSorted((a, b) => a.objectIndex - b.objectIndex)
      .map(({ objectIndex, text, bounds, matrix }) => ({ objectIndex, text, bounds, matrix })),
  }
}

async function readBlocks(bytes: Uint8Array, pageIndex: number, signal?: AbortSignal) {
  const page = await pageBlocks(bytes, pageIndex, signal),
    sha256 = digest(bytes)
  const native = await readPdfNativeBlockObjects(bytes, pageIndex, signal)
  const blocks: PdfPageTextBlock[] = page.blocks.map((block) => {
    const base = {
      page: pageIndex + 1,
      blockIndex: block.blockIndex,
      block_number: block.blockIndex + 1,
      text: block.text,
      x: block.rect.x * page.viewport.width,
      y: block.rect.y * page.viewport.height,
      width: block.rect.width * page.viewport.width,
      height: block.rect.height * page.viewport.height,
    }
    try {
      const target = mapBlock(block, page.blocks, native, sha256, page.clipped)
      let rewrite: Pick<PdfPageTextBlock, 'canRewrite' | 'rewriteReason' | 'format'>
      try {
        const layout = pdfBlockRewriteLayout(target, native, block.pdfRect[2] - block.pdfRect[0])
        rewrite = {
          canRewrite: true,
          format: { fontSize: layout.fontSize, leading: layout.leading, align: layout.align },
        }
      } catch (error) {
        rewrite = {
          canRewrite: false,
          rewriteReason: error instanceof Error ? error.message : '无法重排此段落',
        }
      }
      return {
        ...base,
        editable: true,
        target,
        ...rewrite,
      }
    } catch (error) {
      return {
        ...base,
        editable: false,
        reason: error instanceof Error ? error.message : '段落无法安全定位',
      }
    }
  })
  assertPdfBlockActive(signal)
  return { snapshot: { sha256, blocks } satisfies PdfTextBlockSnapshot, page }
}

/** Exact-byte, independently identified native block operations; caller owns history/save. */
export async function applyPdfTextBlockOperation(
  bytes: Uint8Array,
  raw: PdfTextBlockOperation,
  signal?: AbortSignal,
): Promise<{ bytes?: Uint8Array; blocks: PdfTextBlockSnapshot; target?: PdfTextBlockTarget }> {
  const operation = pdfTextBlockOperationSchema.parse(raw)
  assertPdfBlockActive(signal)
  if (bytes.length > 50 * 1024 * 1024) throw new Error('PDF 超过 50 MiB 上限')
  await assertSafeToRewrite(bytes)
  assertPdfBlockActive(signal)
  initializePdfAgentHost()
  const pageIndex =
    operation.op === 'read'
      ? operation.pageIndex
      : operation.op === 'inspect'
        ? operation.probe.pageIndex
        : operation.target.pageIndex
  if (
    (operation.op === 'move' || operation.op === 'rewrite') &&
    digest(bytes) !== operation.target.sha256
  )
    throw new Error('PDF 原件已变化，请重新选择段落')
  const { snapshot, page } = await readBlocks(bytes, pageIndex, signal)
  if (operation.op === 'read') return { blocks: snapshot }
  if (operation.op === 'inspect') {
    const matches = page.blocks.filter(
      (block) =>
        block.items.length === operation.probe.items.length &&
        block.items.every(
          (item, index) =>
            item.text === operation.probe.items[index]!.text &&
            near(item.bounds, operation.probe.items[index]!.bounds),
        ),
    )
    if (matches.length !== 1) throw new Error('请选择当前原件中的完整段落，不能部分或跨段落定位')
    const selected = snapshot.blocks[matches[0]!.blockIndex]!
    if (!selected.editable || !selected.target)
      throw new Error(selected.reason ?? '段落无法安全定位')
    return { blocks: snapshot, target: selected.target }
  }
  const selected = snapshot.blocks[operation.target.blockIndex]
  if (
    !selected?.editable ||
    !selected.target ||
    !samePdfBlockMembers(operation.target.members, selected.target.members)
  )
    throw new Error(selected?.reason ?? 'PDF 段落目标对象已变化或成员不完整')
  if (operation.op === 'rewrite') {
    if (!selected.canRewrite) throw new Error(selected.rewriteReason ?? '此段落无法重排')
    const block = page.blocks[operation.target.blockIndex]!,
      native = await readPdfNativeBlockObjects(bytes, pageIndex, signal),
      layout = pdfBlockRewriteLayout(selected.target, native, block.pdfRect[2] - block.pdfRect[0])
    const logical = pdfBlockReplacement(block.text, operation.replace, operation.newText)
    if (logical.length > 10000) throw new Error('替换后段落超过10000字符')
    const result = await writePdfNativeBlockRewrite(
      bytes,
      selected.target,
      block.text,
      logical,
      operation,
      layout,
      signal,
    )
    const after = await pageBlocks(result, pageIndex, signal)
    // Non-target PDF.js items retain their exact text, font and geometry even when
    // repeated original text is intentionally left elsewhere on the page.
    const remaining = [...after.items]
    const untouched = page.items.filter(
      (item) =>
        !block.items.some(
          (member) => member.text === item.text && near(member.bounds, item.bounds),
        ),
    )
    for (const item of untouched) {
      const at = remaining.findIndex(
        (current) =>
          current.text === item.text &&
          current.font === item.font &&
          current.dir === item.dir &&
          near(current.transform, item.transform) &&
          near([current.width, current.height], [item.width, item.height]),
      )
      if (at < 0) throw new Error('PDF.js 非目标原文读回不一致，未写入')
      remaining.splice(at, 1)
    }
    const ordered = remaining.toSorted((a, b) =>
      Math.abs(b.transform[5]! - a.transform[5]!) > 0.5
        ? b.transform[5]! - a.transform[5]!
        : a.transform[4]! - b.transform[4]!,
    )
    if (
      squash(ordered.map((item) => item.text).join('')).normalize('NFKC') !==
      squash(logical).normalize('NFKC')
    )
      throw new Error('PDF.js 替换原文独立读回不一致，未写入')
    assertPdfBlockActive(signal)
    return { bytes: result, blocks: (await readBlocks(result, pageIndex, signal)).snapshot }
  }
  if (operation.dx === 0 && operation.dy === 0) throw new Error('请提供非零段落位移')
  const delta = pdfTextBlockDelta(page.viewport, operation.dx, operation.dy)
  const result = await writePdfNativeBlockMove(bytes, selected.target, delta, signal)
  const after = await pageBlocks(result, pageIndex, signal)
  // Independent PDF.js read-back uses item geometry, not page-level contains()
  // checks: repeated text elsewhere must remain untouched and searchable.
  if (page.items.length !== after.items.length) throw new Error('PDF 原文项数读回不一致，未写入')
  const block = page.blocks[operation.target.blockIndex]!
  for (const [index, item] of page.items.entries()) {
    const current = after.items[index]!
    const moved = block.items.some(
      (member) => member.text === item.text && near(member.bounds, item.bounds),
    )
    const expected = [...item.transform]
    if (moved) {
      expected[4]! += delta[0]
      expected[5]! += delta[1]
    }
    if (
      current.text !== item.text ||
      current.font !== item.font ||
      current.dir !== item.dir ||
      !near([current.width, current.height], [item.width, item.height]) ||
      !near(current.transform, expected)
    )
      throw new Error('PDF 原文或非目标文字位置读回不一致，未写入')
  }
  assertPdfBlockActive(signal)
  const refreshed = await readBlocks(result, pageIndex, signal)
  return { bytes: result, blocks: refreshed.snapshot }
}
