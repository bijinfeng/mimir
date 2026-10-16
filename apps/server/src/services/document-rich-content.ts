import { parseHTML } from 'linkedom'
import JSZip from 'jszip'
import {
  abstractNumXml,
  buildBlankDocx,
} from '../../../../packages/office/vendor/packages/docx-engine/src/blank.js'
import {
  generateParagraphXml,
  generateTableModelXml,
} from '../../../../packages/office/vendor/packages/docx-engine/src/generate.js'
import { latexToOmml } from '../../../../packages/office/vendor/packages/docx-engine/src/math.js'
import type {
  GeneratedBlock,
  Run,
  TableCell,
  TableModel,
} from '../../../../packages/office/vendor/packages/docx-engine/src/types.js'

type HtmlNode = {
  nodeType: number
  textContent: string | null
  localName?: string
  childNodes: ArrayLike<HtmlNode>
  attributes?: ArrayLike<{ name: string }>
  getAttribute(name: string): string | null
}
export type RichParagraph = GeneratedBlock & { quote?: boolean; code?: boolean; marker?: string }
export type RichCell = {
  row: number
  col: number
  rowSpan: number
  colSpan: number
  paragraphs: RichParagraph[]
  fill?: string
}
export type RichTable = {
  kind: 'table'
  rows: number
  cols: number
  cells: RichCell[]
  headerRows: number
}
export type RichBlock = RichParagraph | RichTable
export type RichContent = {
  blocks: RichBlock[]
  lists: Array<{ id: string; ordered: boolean; start: number }>
}

const escapeXml = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
const children = (node: HtmlNode) => Array.from(node.childNodes)
const tagOf = (node: HtmlNode) => node.localName?.toLowerCase() ?? ''
const hasInvalidControl = (text: string) =>
  Array.from(text).some((char) => char.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(char))
const inlineTags = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'strike',
  'del',
  'span',
  'a',
  'code',
  'sub',
  'sup',
  'br',
  'formula',
])
const allowedStyles = new Set([
  'color',
  'background-color',
  'font-weight',
  'font-style',
  'text-decoration',
  'font-size',
  'text-align',
])

function styles(node: HtmlNode): Record<string, string> {
  const out: Record<string, string> = {}
  for (const entry of (node.getAttribute('style') ?? '').split(';')) {
    if (!entry.trim()) continue
    const colon = entry.indexOf(':')
    const key = entry.slice(0, colon).trim().toLowerCase()
    if (colon < 0 || !allowedStyles.has(key)) throw new Error(`新文档不支持样式：${key || entry}`)
    out[key] = entry.slice(colon + 1).trim()
  }
  return out
}
function color(value: string | undefined): string | undefined {
  if (!value) return undefined
  const named: Record<string, string> = {
    black: '000000',
    white: 'FFFFFF',
    red: 'FF0000',
    green: '008000',
    blue: '0000FF',
    gray: '808080',
    yellow: 'FFFF00',
  }
  if (named[value.toLowerCase()]) return named[value.toLowerCase()]
  if (/^#[\da-f]{6}$/i.test(value)) return value.slice(1).toUpperCase()
  if (/^#[\da-f]{3}$/i.test(value))
    return Array.from(value.slice(1))
      .map((c) => c + c)
      .join('')
      .toUpperCase()
  const match = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(value)
  if (match && match.slice(1).every((x) => Number(x) <= 255))
    return match
      .slice(1)
      .map((x) => Number(x).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  throw new Error(`新文档不支持颜色：${value}`)
}
function alignment(node: HtmlNode) {
  const value = styles(node)['text-align']
  if (value && !['left', 'center', 'right', 'justify'].includes(value))
    throw new Error('新文档段落对齐值无效')
  return value as 'left' | 'center' | 'right' | 'justify' | undefined
}
function runFormat(node: HtmlNode, inherited: Partial<Run>): Partial<Run> {
  const next = { ...inherited },
    tag = tagOf(node),
    css = styles(node)
  if (['b', 'strong'].includes(tag)) next.bold = true
  if (['i', 'em'].includes(tag)) next.italic = true
  if (tag === 'u') next.underline = true
  if (['s', 'strike', 'del'].includes(tag)) next.strike = true
  if (tag === 'sub' || tag === 'sup') next.vertAlign = tag === 'sub' ? 'subscript' : 'superscript'
  if (tag === 'code') {
    next.font = 'Consolas'
    next.shading = 'F2F3F5'
  }
  if (css.color) next.color = color(css.color)
  if (css['background-color']) next.shading = color(css['background-color'])
  if (css['font-weight']) {
    if (!/^(normal|bold|[1-9]00)$/.test(css['font-weight']))
      throw new Error('新文档 font-weight 值无效')
    next.bold = /^(bold|[6-9]00)$/.test(css['font-weight'])
  }
  if (css['font-style']) {
    if (!['normal', 'italic'].includes(css['font-style']))
      throw new Error('新文档 font-style 仅支持 normal 或 italic')
    next.italic = css['font-style'] === 'italic'
  }
  if (css['text-decoration']) {
    if (
      !css['text-decoration']
        .split(/\s+/)
        .every((x) => ['none', 'underline', 'line-through'].includes(x))
    )
      throw new Error('新文档 text-decoration 值不支持')
    next.underline = css['text-decoration'].includes('underline')
    next.strike = css['text-decoration'].includes('line-through')
  }
  if (css['font-size']) {
    const m = /^(\d+(?:\.\d+)?)(pt|px)$/.exec(css['font-size'])
    if (!m || Number(m[1]) < 6 || Number(m[1]) > 72) throw new Error('新文档字号仅支持 6–72 pt/px')
    next.sizeHalfPoints = Math.round(Number(m[1]) * (m[2] === 'px' ? 1.5 : 2))
  }
  if (tag === 'a') {
    const href = node.getAttribute('href') ?? ''
    if (
      !/^(https?:\/\/|mailto:)/i.test(href) ||
      Array.from(href).some((char) => char.charCodeAt(0) <= 32)
    )
      throw new Error('新文档链接仅支持 http、https 或 mailto 完整地址')
    next.link = { href }
    next.underline ??= true
    next.color ??= '0563C1'
  }
  return next
}
function inline(node: HtmlNode, inherited: Partial<Run> = {}, preserve = false, depth = 0): Run[] {
  if (depth > 32) throw new Error('新文档嵌套层级过深')
  const out: Run[] = []
  for (const child of children(node)) {
    if (child.nodeType === 3) {
      const text = preserve
        ? (child.textContent ?? '')
        : (child.textContent ?? '').replace(/\s+/g, ' ')
      if (text) out.push({ ...inherited, text })
    } else if (child.nodeType === 1) {
      const tag = tagOf(child)
      if (!inlineTags.has(tag))
        throw new Error(`新文档行内不支持 <${tag}>，请使用段落、列表或表格结构`)
      if (tag === 'br') out.push({ ...inherited, text: '\n' })
      else if (tag === 'formula') {
        const latex = (child.textContent ?? '').trim()
        if (!latex) throw new Error('新文档公式不能为空')
        out.push({ text: latex, math: { omml: `<m:oMath>${latexToOmml(latex)}</m:oMath>` } })
      } else out.push(...inline(child, runFormat(child, inherited), preserve, depth + 1))
    }
  }
  return out
}
function paragraph(node: HtmlNode, kind: 'paragraph' | 'heading' = 'paragraph'): RichParagraph {
  const tag = tagOf(node),
    align = alignment(node)
  const quote = tag === 'blockquote',
    code = tag === 'pre'
  const format = {
    ...(align ? { align: align as 'left' | 'center' | 'right' | 'justify' } : {}),
    ...(quote ? { indentLeft: 480, indentRight: 240 } : {}),
    spaceAfter: 120,
  }
  return {
    type: kind,
    ...(kind === 'heading' ? { level: Number(tag[1]) } : {}),
    quote,
    code,
    format,
    runs: inline(
      node,
      {
        ...runFormat(node, {}),
        ...(quote ? { italic: true, color: '555555' } : {}),
        ...(code ? { font: 'Consolas', shading: 'F2F3F5' } : {}),
      },
      code,
    ),
  }
}

/** A bounded restricted-HTML adapter; unsupported structure fails before upload. */
export function parseRichContent(raw: string): RichContent {
  if (hasInvalidControl(raw)) throw new Error('新文档包含无效控制字符')
  let text = raw.trim()
  const fence = /^```(?:html)?\s*([\s\S]*?)```$/.exec(text)
  if (fence) text = fence[1]!.trim()
  const model: RichContent = { blocks: [], lists: [] }
  if (!/<[a-z][\s\S]*>/i.test(text)) {
    for (const line of text.split(/\r?\n/).filter((x) => x.trim())) {
      const heading = /^(#{1,6})\s+(.+)$/.exec(line)
      const listMatch = /^(?:[-*+] |\d+[.)] )(.+)$/.exec(line.trim())
      model.blocks.push({
        type: heading ? 'heading' : 'paragraph',
        level: heading?.[1]?.length,
        runs: [{ text: heading?.[2] ?? (listMatch ? `• ${listMatch[1]}` : line) }],
      })
    }
    return model
  }
  const { document } = parseHTML(`<html><body>${text}</body></html>`)
  const body = document.body as unknown as HtmlNode
  const validate = (node: HtmlNode, depth = 0) => {
    if (depth > 32) throw new Error('新文档嵌套层级过深')
    if (node.nodeType === 3 && hasInvalidControl(node.textContent ?? ''))
      throw new Error('新文档包含无效控制字符')
    if (node.nodeType === 1) {
      const tag = tagOf(node)
      const attrs = new Set([
        'style',
        ...(tag === 'a' ? ['href', 'title'] : []),
        ...(tag === 'ol' ? ['start'] : []),
        ...(['td', 'th'].includes(tag) ? ['colspan', 'rowspan'] : []),
      ])
      for (const attr of Array.from(node.attributes ?? []))
        if (!attrs.has(attr.name)) throw new Error(`新文档 <${tag}> 不支持属性：${attr.name}`)
      if (
        ['table', 'thead', 'tbody', 'tfoot', 'tr', 'ul', 'ol', 'li'].includes(tag) &&
        node.getAttribute('style')
      )
        throw new Error(`新文档 <${tag}> 暂不支持容器样式`)
      if (['formula', 'br'].includes(tag) && node.getAttribute('style'))
        throw new Error(`新文档 <${tag}> 不支持样式`)
      styles(node)
    }
    for (const child of children(node)) validate(child, depth + 1)
  }
  for (const node of children(body)) validate(node)
  function blocks(node: HtmlNode, depth = 0): RichBlock[] {
    if (depth > 20) throw new Error('新文档块嵌套层级过深')
    const out: RichBlock[] = []
    let pending: HtmlNode[] = []
    const flush = () => {
      if (!pending.length) return
      const runs = inline({ ...node, childNodes: pending })
      if (runs.some((r) => r.text.trim())) out.push({ type: 'paragraph', runs })
      pending = []
    }
    for (const child of children(node)) {
      if (child.nodeType === 8) continue
      const tag = tagOf(child)
      if (child.nodeType === 3 || inlineTags.has(tag)) {
        pending.push(child)
        continue
      }
      flush()
      if (child.nodeType !== 1) continue
      if (/^h[1-6]$/.test(tag)) out.push(paragraph(child, 'heading'))
      else if (tag === 'blockquote') {
        const quoted = blocks(child, depth + 1)
        const inherited = runFormat(child, {}),
          align = alignment(child)
        for (const p of quoted) {
          if ('kind' in p) throw new Error('引用中的表格暂不支持')
          p.quote = true
          p.format = { ...(align ? { align } : {}), ...p.format, indentLeft: 480, indentRight: 240 }
          p.runs = p.runs.map((run) => ({ ...inherited, ...run }))
          for (const run of p.runs) {
            run.italic ??= true
            run.color ??= '555555'
          }
        }
        out.push(...quoted)
      } else if (['p', 'pre'].includes(tag)) out.push(paragraph(child))
      else if (tag === 'div') {
        const containsBlocks = children(child).some(
          (n) => n.nodeType === 1 && !inlineTags.has(tagOf(n)),
        )
        if (!containsBlocks) out.push(paragraph(child))
        else {
          if (child.getAttribute('style')) throw new Error('包含子块的 div 暂不支持容器样式')
          out.push(...blocks(child, depth + 1))
        }
      } else if (tag === 'ul' || tag === 'ol') out.push(...list(child, 0))
      else if (tag === 'table') out.push(table(child))
      else throw new Error(`新文档不支持 <${tag}>，初始内容请使用文字、列表、表格和公式`)
    }
    flush()
    return out
  }
  function list(node: HtmlNode, level: number): RichParagraph[] {
    if (level > 8) throw new Error('新文档列表最多支持 9 层')
    if (node.getAttribute('type') || node.getAttribute('reversed'))
      throw new Error('新文档列表仅支持正序数字或项目符号')
    const ordered = tagOf(node) === 'ol',
      start = Number(node.getAttribute('start') ?? 1)
    if (!Number.isInteger(start) || start < 1 || start > 99999)
      throw new Error('新文档列表起始值无效')
    const id = String(model.lists.length + 10)
    model.lists.push({ id, ordered, start })
    const out: RichParagraph[] = []
    let index = start
    for (const item of children(node)) {
      if (item.nodeType === 3 && !item.textContent?.trim()) continue
      if (tagOf(item) !== 'li') throw new Error('列表中只能包含 li')
      let pending: HtmlNode[] = [],
        numbered = false
      const flushItem = () => {
        const itemBlocks = blocks({ ...item, childNodes: pending })
        pending = []
        if (itemBlocks.some((b) => 'kind' in b)) throw new Error('列表项中的表格暂不支持')
        const paragraphs = itemBlocks as RichParagraph[]
        if (!numbered && !paragraphs.length) paragraphs.push({ type: 'paragraph', runs: [] })
        for (const p of paragraphs) {
          out.push({
            ...p,
            ...(!numbered
              ? {
                  type: 'listItem' as const,
                  styleId: p.type === 'heading' ? `Heading${p.level}` : p.styleId,
                  list: {
                    kind: ordered ? ('ordered' as const) : ('bullet' as const),
                    numId: id,
                    ilvl: level,
                  },
                  marker: ordered ? `${index}.` : '•',
                }
              : { format: { ...p.format, indentLeft: (level + 1) * 480 } }),
          })
          numbered = true
        }
      }
      for (const part of children(item)) {
        if (['ul', 'ol'].includes(tagOf(part))) {
          flushItem()
          out.push(...list(part, level + 1))
        } else pending.push(part)
      }
      flushItem()
      index++
    }
    return out
  }
  function table(node: HtmlNode): RichTable {
    const rowNodes: HtmlNode[] = []
    let headerRows = 0
    for (const part of children(node)) {
      const tag = tagOf(part)
      if (part.nodeType === 3 && !part.textContent?.trim()) continue
      if (tag === 'tr') rowNodes.push(part)
      else if (['thead', 'tbody', 'tfoot'].includes(tag)) {
        const rows = children(part).filter((p) => p.nodeType === 1)
        if (rows.some((r) => tagOf(r) !== 'tr')) throw new Error('表格分组中只能包含 tr')
        if (tag === 'thead') headerRows = rows.length
        rowNodes.push(...rows)
      } else throw new Error(`新文档表格不支持 <${tag}>`)
    }
    if (!rowNodes.length || rowNodes.length > 1000) throw new Error('表格需要 1–1000 行')
    const cells: RichCell[] = [],
      occupied: boolean[][] = rowNodes.map(() => [])
    let cols = 0
    rowNodes.forEach((row, r) => {
      let col = 0
      for (const cell of children(row)) {
        if (cell.nodeType === 3 && !cell.textContent?.trim()) continue
        if (!['td', 'th'].includes(tagOf(cell))) throw new Error('表格行中只能包含 td 或 th')
        while (occupied[r]![col]) col++
        const colSpan = Number(cell.getAttribute('colspan') ?? 1),
          rowSpan = Number(cell.getAttribute('rowspan') ?? 1)
        if (
          ![colSpan, rowSpan].every((x) => Number.isInteger(x) && x > 0 && x <= 64) ||
          r + rowSpan > rowNodes.length ||
          col + colSpan > 64
        )
          throw new Error('表格合并单元格范围无效')
        for (let y = r; y < r + rowSpan; y++)
          for (let x = col; x < col + colSpan; x++) {
            if (occupied[y]![x]) throw new Error('表格合并单元格重叠')
            occupied[y]![x] = true
          }
        const rich = blocks(cell)
        if (rich.some((b) => 'kind' in b)) throw new Error('新文档暂不支持嵌套表格')
        const paragraphs = rich as RichParagraph[]
        const inherited = runFormat(cell, {}),
          align = alignment(cell)
        for (const p of paragraphs) {
          p.format = { ...(align ? { align } : {}), ...p.format }
          p.runs = p.runs.map((run) => Object.assign({}, inherited, run))
        }
        if (tagOf(cell) === 'th')
          for (const p of paragraphs) for (const run of p.runs) run.bold ??= true
        cells.push({
          row: r,
          col,
          rowSpan,
          colSpan,
          paragraphs,
          fill:
            color(styles(cell)['background-color']) ??
            (tagOf(cell) === 'th' ? 'EEF2F6' : undefined),
        })
        col += colSpan
        cols = Math.max(cols, col)
      }
    })
    if (
      !cols ||
      occupied.some(
        (row) =>
          row.length !== cols || Array.from({ length: cols }, (_, i) => !row[i]).some(Boolean),
      )
    )
      throw new Error('表格各行列数不一致')
    return { kind: 'table', rows: rowNodes.length, cols, cells, headerRows }
  }
  model.blocks = blocks(body)
  if (
    !model.blocks.length ||
    !model.blocks.some((b) => 'kind' in b || b.runs.some((r) => r.text.trim()))
  )
    throw new Error('新文档没有可写入的内容')
  return model
}

const numberingLevels = (ordered: boolean) =>
  Array.from({ length: 9 }, (_, i) => ({
    numFmt: ordered ? 'decimal' : 'bullet',
    lvlText: ordered ? `%${i + 1}.` : '•',
    indentLeft: (i + 1) * 480,
    hanging: 240,
  }))

export async function richDocxOf(model: RichContent): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(await buildBlankDocx({ eastAsiaFont: 'Noto Sans CJK SC' }))
  const links = new Map<string, string>()
  const allocateHyperlinkRel = (href: string) => {
    if (!links.has(href)) links.set(href, `rId${links.size + 10}`)
    return links.get(href)!
  }
  const ctx = {
    headingStyleIds: new Map(Array.from({ length: 6 }, (_, i) => [i + 1, `Heading${i + 1}`])),
    listParagraphStyleId: 'ListParagraph',
    allocateHyperlinkRel,
  }
  const content = model.blocks
    .map((block) => {
      if (!('kind' in block)) return generateParagraphXml(block, ctx)
      const rows: TableCell[][] = []
      const cellBodies: string[] = []
      for (let r = 0; r < block.rows; r++) {
        rows.push(
          block.cells
            .filter((c) => c.row <= r && c.row + c.rowSpan > r)
            .toSorted((a, b) => a.col - b.col)
            .map((cell) => {
              const continuing = cell.row !== r
              cellBodies.push(
                continuing || !cell.paragraphs.length
                  ? generateParagraphXml({ type: 'paragraph', runs: [] }, ctx)
                  : cell.paragraphs.map((p) => generateParagraphXml(p, ctx)).join(''),
              )
              const paras = continuing
                ? []
                : cell.paragraphs.map((p) => ({
                    ...p.format,
                    list: p.list,
                    runs: p.runs.map((run) =>
                      run.link
                        ? {
                            ...run,
                            link: { ...run.link, rId: allocateHyperlinkRel(run.link.href) },
                          }
                        : run,
                    ),
                  }))
              return {
                paras: paras.map((p) => p.runs.map((run) => run.text).join('')),
                richParas: paras,
                colSpan: cell.colSpan,
                vMerge: cell.rowSpan > 1 ? (continuing ? 'continue' : 'restart') : undefined,
                fill: cell.fill,
              }
            }),
        )
      }
      const border = { style: 'single', szEighths: 4, color: 'BCC4CE' }
      const tableModel: TableModel = {
        rows,
        widthPct: 100,
        colWidthsPct: Array(block.cols).fill(100 / block.cols),
        borders: {
          top: border,
          left: border,
          bottom: border,
          right: border,
          insideH: border,
          insideV: border,
        },
        repeatHeaderRows: rows.map((_, i) => i < block.headerRows),
      }
      // The pinned table generator omits TableParagraph.styleId. Reuse its
      // cell properties/merges and the paragraph generator for authored bodies.
      let cellIndex = 0
      const xml = generateTableModelXml(tableModel).replace(
        /<w:tc>(<w:tcPr>[\s\S]*?<\/w:tcPr>)[\s\S]*?<\/w:tc>/g,
        (_match, properties: string) => {
          const body = cellBodies[cellIndex++]
          if (body === undefined) throw new Error('新文档表格段落生成数量不一致')
          return `<w:tc>${properties}${body}</w:tc>`
        },
      )
      if (cellIndex !== cellBodies.length) throw new Error('新文档表格段落生成数量不一致')
      return xml
    })
    .join('')
  const doc = await zip.file('word/document.xml')!.async('string')
  zip.file(
    'word/document.xml',
    doc.replace(
      /<w:body>[\s\S]*?(<w:sectPr>[\s\S]*?<\/w:sectPr>)<\/w:body>/,
      (_match, section: string) => `<w:body>${content}${section}</w:body>`,
    ),
  )
  let rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
  rels = rels.replace(
    '</Relationships>',
    () =>
      [...links]
        .map(
          ([href, id]) =>
            `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(href)}" TargetMode="External"/>`,
        )
        .join('') + '</Relationships>',
  )
  zip.file('word/_rels/document.xml.rels', rels)
  let numbering = await zip.file('word/numbering.xml')!.async('string')
  numbering = numbering.replace(
    '</w:numbering>',
    abstractNumXml('10', 'bullet', numberingLevels(false)) +
      abstractNumXml('11', 'ordered', numberingLevels(true)) +
      '</w:numbering>',
  )
  numbering = numbering.replace(
    '</w:numbering>',
    model.lists
      .map(
        ({ id, ordered, start }) =>
          `<w:num w:numId="${id}"><w:abstractNumId w:val="${ordered ? 11 : 10}"/>${Array.from({ length: 9 }, (_, level) => `<w:lvlOverride w:ilvl="${level}"><w:startOverride w:val="${start}"/></w:lvlOverride>`).join('')}</w:num>`,
      )
      .join('') + '</w:numbering>',
  )
  zip.file('word/numbering.xml', numbering)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
