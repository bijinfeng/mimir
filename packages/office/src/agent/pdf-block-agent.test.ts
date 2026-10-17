import { PDFDocument, StandardFonts } from 'pdf-lib'
import { expect, it, vi } from 'vitest'
import { executePdfContentTool, type PdfHostBlocks } from './pdf-content-agent.js'
import { applyPdfTextBlockOperation } from '../../../../apps/server/src/services/pdf-agent-host.js'

async function fixture() {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    page = pdf.addPage([400, 600])
  for (const y of [500, 280]) {
    page.drawText('Repeated paragraph first line', { x: 40, y, size: 12, font })
    page.drawText('Repeated paragraph next line', { x: 40, y: y - 18, size: 12, font })
  }
  return pdf.save()
}
const host: PdfHostBlocks = async ({ bytes, operation, expectedVersion, signal }) => {
  const result = await applyPdfTextBlockOperation(bytes, operation, signal)
  return { ...result, version: expectedVersion + (result.bytes ? 1 : 0) }
}
it('rewrites Agent paragraphs and selects repeated partial text by occurrence or frozen manual target', async () => {
  const bytes = await fixture(),
    read = await host({ bytes, expectedVersion: 7, operation: { op: 'read', pageIndex: 0 } }),
    target = read.blocks.blocks[1]!.target!
  await expect(
    execute(bytes, 'edit_block', {
      page: 1,
      paragraph_text: 'Repeated paragraph',
      new_text: 'Cannot choose',
    }),
  ).rejects.toThrow('唯一定位')
  const partial = await execute(bytes, 'edit_text', {
    page: 1,
    old_text: 'Repeated',
    new_text: 'Changed',
    occurrence: 3,
  })
  const after = await host({
    bytes: partial.bytes!,
    expectedVersion: 8,
    operation: { op: 'read', pageIndex: 0 },
  })
  expect(after.blocks.blocks[0]!.text).toBe(read.blocks.blocks[0]!.text)
  expect(after.blocks.blocks[1]!.text).toContain('Changed paragraph first line')
  expect(after.blocks.blocks[1]!.text).toContain('Repeated paragraph next line')
  const rewritten = await execute(
    bytes,
    'edit_block',
    {
      page: 1,
      target,
      new_text: 'A real replacement paragraph with enough words to wrap into a second line.',
    },
    host,
    undefined,
    true,
  )
  const rewrittenRead = await host({
    bytes: rewritten.bytes!,
    expectedVersion: 8,
    operation: { op: 'read', pageIndex: 0 },
  })
  expect(rewrittenRead.blocks.blocks[0]!.text).toBe(read.blocks.blocks[0]!.text)
  expect(rewrittenRead.blocks.blocks[1]!.text.replace(/\s+/g, ' ')).toContain(
    'A real replacement paragraph',
  )
  expect(
    (
      await execute(rewritten.bytes!, 'edit_block', {
        page: 1,
        paragraph_text: 'A real replacement',
        new_text: '',
      })
    ).bytes,
  ).toBeInstanceOf(Uint8Array)
})
it('rejects late rewrite success after cancellation, invalid occurrences and stale read versions', async () => {
  const bytes = await fixture(),
    controller = new AbortController(),
    late: PdfHostBlocks = async (input) => {
      const result = await host(input)
      if (input.operation.op === 'rewrite') controller.abort()
      return result
    }
  await expect(
    execute(
      bytes,
      'edit_text',
      { page: 1, old_text: 'Repeated', new_text: 'Late', occurrence: 2 },
      late,
      controller.signal,
    ),
  ).rejects.toThrow('取消')
  await expect(
    execute(bytes, 'edit_text', {
      page: 1,
      old_text: 'Repeated',
      new_text: 'Invalid',
      occurrence: 0,
    }),
  ).rejects.toThrow('occurrence')
  await expect(
    execute(
      bytes,
      'edit_text',
      { page: 1, old_text: 'Repeated', new_text: 'Stale' },
      staleReadHost,
    ),
  ).rejects.toThrow('版本无效')
})
const staleReadHost: PdfHostBlocks = async (input) => ({ ...(await host(input)), version: 99 })
async function execute(
  bytes: Uint8Array,
  tool: string,
  args: Record<string, unknown>,
  blocks: PdfHostBlocks = host,
  signal?: AbortSignal,
  manual = false,
) {
  return executePdfContentTool({
    bytes,
    version: 7,
    pageCount: 1,
    tool,
    args,
    blocks,
    signal,
    manual,
    textIndex: async () => ({ pages: [], pagesWithText: 0 }),
  })
}
it('lists actual native paragraphs; unique anchoring protects repeats while manual exact targets move one full object set', async () => {
  const bytes = await fixture(),
    original = bytes.slice()
  const listed = await execute(bytes, 'list_text_blocks', { page: 1 })
  expect(listed.bytes).toBeUndefined()
  const read = await host({ bytes, expectedVersion: 7, operation: { op: 'read', pageIndex: 0 } })
  expect(read.blocks.blocks).toHaveLength(2)
  await expect(
    execute(bytes, 'move_text_block', {
      page: 1,
      paragraph_text: 'Repeated paragraph',
      dx: 8,
      dy: 12,
    }),
  ).rejects.toThrow('唯一定位')
  const target = read.blocks.blocks[1]!.target!
  await expect(
    execute(bytes, 'move_text_block', { page: 1, target, dx: 8, dy: 12 }),
  ).rejects.toThrow('Agent 必须')
  const moved = await execute(
    bytes,
    'move_text_block',
    { page: 1, target, dx: 8, dy: 12 },
    host,
    undefined,
    true,
  )
  expect(moved.bytes).toBeInstanceOf(Uint8Array)
  const after = await host({
    bytes: moved.bytes!,
    expectedVersion: 8,
    operation: { op: 'read', pageIndex: 0 },
  })
  expect(after.blocks.blocks[0]!.x).toBe(read.blocks.blocks[0]!.x)
  expect(after.blocks.blocks[1]!.x).toBeCloseTo(read.blocks.blocks[1]!.x + 8, 2)
  expect(after.blocks.blocks[1]!.y).toBeCloseTo(read.blocks.blocks[1]!.y + 12, 2)
  expect(bytes).toEqual(original)
})
it('executes actual Agent move with a unique fragment and rejects stale/late host success and invalid deltas', async () => {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    page = pdf.addPage()
  page.drawText('Unique original paragraph line one', { x: 40, y: 500, size: 12, font })
  page.drawText('Unique original paragraph line two', { x: 40, y: 482, size: 12, font })
  const bytes = await pdf.save()
  expect(
    (
      await execute(bytes, 'move_text_block', {
        page: 1,
        paragraph_text: 'Unique original',
        dx: -9,
        dy: 14,
      })
    ).bytes,
  ).toBeInstanceOf(Uint8Array)
  await expect(
    execute(bytes, 'move_text_block', {
      page: 1,
      paragraph_text: 'Unique original',
      dx: Infinity,
      dy: 1,
    }),
  ).rejects.toThrow(/Too big|expected number/)
  const stale: PdfHostBlocks = async (input) => ({ ...(await host(input)), version: 99 })
  await expect(execute(bytes, 'list_text_blocks', { page: 1 }, stale)).rejects.toThrow('版本无效')
  const controller = new AbortController(),
    late: PdfHostBlocks = async (input) => {
      const result = await host(input)
      if (input.operation.op === 'move') controller.abort()
      return result
    }
  await expect(
    execute(
      bytes,
      'move_text_block',
      { page: 1, paragraph_text: 'Unique original', dx: 3, dy: 4 },
      late,
      controller.signal,
    ),
  ).rejects.toThrow('取消')
  const notCalled = vi.fn<PdfHostBlocks>(host)
  await expect(
    execute(bytes, 'list_text_blocks', { page: 1 }, notCalled, controller.signal),
  ).rejects.toThrow('取消')
  expect(notCalled).not.toHaveBeenCalled()
})
