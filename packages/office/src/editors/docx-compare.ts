import { openDocx, type PmDocJson } from '../docx.js'
import { BoundedZip } from '../zip-bounds.js'

export const DOCX_COMPARE_LIMITS = {
  inputBytes: 3 * 1024 * 1024,
  parts: 500,
  entryBytes: 2 * 1024 * 1024,
  totalBytes: 8 * 1024 * 1024,
  blocks: 2000,
  characters: 200_000,
  nodes: 30_000,
  cells: 1_000_000,
} as const
export type CompareBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'table'; rows: string[][][] }
export interface CompareBody {
  blocks: CompareBlock[]
  excluded: number
}
const PARAGRAPHS = new Set(['docParagraph', 'docHeading', 'docListItem', 'paragraph', 'heading'])
const TABLES = new Set(['docTable', 'table'])
const ROWS = new Set(['docTableRow', 'tableRow'])
const CELLS = new Set(['docTableCell', 'docTableHeader', 'tableCell', 'tableHeader'])

/** A shared live/parsed PM extractor. Never consults OOXML previews or live DOM. */
export function extractCompareBody(doc: PmDocJson): CompareBody {
  let nodes = 0,
    characters = 0,
    excluded = 0
  const blocks: CompareBlock[] = []
  const visit = (node: PmDocJson) => {
    if (++nodes > DOCX_COMPARE_LIMITS.nodes)
      throw new Error('正文结构过多，请选择较短的文档进行对比')
    if (node.type === 'text') {
      const value = node.text ?? ''
      characters += value.length
      if (characters > DOCX_COMPARE_LIMITS.characters)
        throw new Error('正文超过 20 万字，无法进行本地对比')
      return value
    }
    if (node.type === 'hardBreak') return '\n'
    return null
  }
  const inline = (node: PmDocJson): string => {
    const value = visit(node)
    if (value !== null) return value
    // Only known text containers may contribute text. Object previews/labels are excluded.
    if (PARAGRAPHS.has(node.type)) return (node.content ?? []).map(inline).join('')
    excluded++
    return ''
  }
  const walk = (node: PmDocJson) => {
    if (PARAGRAPHS.has(node.type)) blocks.push({ kind: 'paragraph', text: inline(node) })
    else if (TABLES.has(node.type)) {
      visit(node)
      const rows: string[][][] = []
      for (const row of node.content ?? []) {
        visit(row)
        if (!ROWS.has(row.type)) {
          excluded++
          continue
        }
        const cells: string[][] = []
        for (const cell of row.content ?? []) {
          visit(cell)
          if (!CELLS.has(cell.type)) {
            excluded++
            continue
          }
          const paragraphs: string[] = []
          for (const child of cell.content ?? []) {
            if (PARAGRAPHS.has(child.type)) paragraphs.push(inline(child))
            else {
              visit(child)
              excluded++
            }
          }
          cells.push(paragraphs)
        }
        rows.push(cells)
      }
      blocks.push({ kind: 'table', rows })
    } else if (node.type === 'doc') {
      visit(node)
      for (const child of node.content ?? []) walk(child)
    } else {
      visit(node)
      excluded++
    }
    if (blocks.length > DOCX_COMPARE_LIMITS.blocks)
      throw new Error('正文超过 2000 个段落或表格，请缩小对比范围')
  }
  walk(doc)
  return { blocks, excluded }
}
/** Content keys with a duplicate occurrence number, without assuming paragraph uniqueness. */
export function keyedCompareItems<T>(items: readonly T[]): { key: string; value: T }[] {
  const occurrences = new Map<string, number>()
  return items.map((value) => {
    const content = JSON.stringify(value)
    const occurrence = (occurrences.get(content) ?? 0) + 1
    occurrences.set(content, occurrence)
    return { key: `${content}:${occurrence}`, value }
  })
}
export function compareBlockText(block: CompareBlock): string {
  return block.kind === 'paragraph'
    ? block.text
    : block.rows
        .map((row, r) =>
          row
            .map(
              (cell, c) =>
                `第 ${r + 1} 行 · 第 ${c + 1} 格\n${cell.map((p) => p || '（空段落）').join('\n¶\n')}`,
            )
            .join('\n'),
        )
        .join('\n\n')
}
export interface CompareChange {
  kind: 'same' | 'added' | 'removed' | 'changed'
  before?: CompareBlock
  after?: CompareBlock
}
export interface CompareResult {
  changes: CompareChange[]
  added: number
  removed: number
  changed: number
  excluded: number
}
export function compareDocxBodies(before: CompareBody, after: CompareBody): CompareResult {
  const a = before.blocks,
    b = after.blocks
  if (
    a.length > DOCX_COMPARE_LIMITS.blocks ||
    b.length > DOCX_COMPARE_LIMITS.blocks ||
    a.length * b.length > DOCX_COMPARE_LIMITS.cells
  )
    throw new Error('两份文档的对比运算量过大，请选择较短的文档（段落数乘积不超过 100 万）')
  const ak = a.map((block) => JSON.stringify(block)),
    bk = b.map((block) => JSON.stringify(block))
  const stride = b.length + 1
  const lcs = new Uint16Array((a.length + 1) * stride)
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i * stride + j] =
        ak[i] === bk[j]
          ? lcs[(i + 1) * stride + j + 1]! + 1
          : Math.max(lcs[(i + 1) * stride + j]!, lcs[i * stride + j + 1]!)
  const changes: CompareChange[] = []
  let i = 0,
    j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && ak[i] === bk[j]) {
      changes.push({ kind: 'same', before: a[i++], after: b[j++] })
      continue
    }
    const removed: CompareBlock[] = [],
      added: CompareBlock[] = []
    while ((i < a.length || j < b.length) && !(i < a.length && j < b.length && ak[i] === bk[j])) {
      if (
        i < a.length &&
        (j === b.length || lcs[(i + 1) * stride + j]! >= lcs[i * stride + j + 1]!)
      )
        removed.push(a[i++]!)
      else added.push(b[j++]!)
    }
    // Pair the entire contiguous edit segment in sequence; retain unpaired additions/removals.
    for (let k = 0; k < Math.max(removed.length, added.length); k++)
      changes.push({
        kind: removed[k] && added[k] ? 'changed' : removed[k] ? 'removed' : 'added',
        ...(removed[k] ? { before: removed[k] } : {}),
        ...(added[k] ? { after: added[k] } : {}),
      })
  }
  return {
    changes,
    added: changes.filter((c) => c.kind === 'added').length,
    removed: changes.filter((c) => c.kind === 'removed').length,
    changed: changes.filter((c) => c.kind === 'changed').length,
    excluded: before.excluded + after.excluded,
  }
}
export async function readCompareDocx(
  file: File,
  isCurrent: () => boolean = () => true,
): Promise<CompareBody> {
  const current = () => {
    if (!isCurrent()) throw new Error('本次对比已取消，请重新比较')
  }
  current()
  if (!/\.docx$/i.test(file.name)) throw new Error('请选择 .docx 文档')
  if (file.size > DOCX_COMPARE_LIMITS.inputBytes)
    throw new Error('本地对比文件不能超过 3 MiB，请选择较小的 DOCX')
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    current()
    const zip = await BoundedZip.open(bytes, DOCX_COMPARE_LIMITS)
    await zip.preflightAll()
    current()
    if (!zip.list().includes('word/document.xml')) throw new Error('不是有效的 Word 文档')
    const parsed = await openDocx(bytes)
    current()
    return extractCompareBody(parsed.content)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : ''
    if (/^(本次对比|Office ZIP|正文)/.test(message)) throw cause
    throw new Error('无法读取 DOCX：文件可能损坏、加密或不是有效的 Word 文档，请重新选择', {
      cause,
    })
  }
}
