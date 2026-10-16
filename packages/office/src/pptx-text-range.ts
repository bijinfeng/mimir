import type { Paragraph, TextElement, TextRun } from '../vendor/packages/pptx-engine/src/types.js'
import type { EditParagraph, EditRun } from '../vendor/packages/pptx-ops/src/types.js'
import { applyEditParagraphs } from '../vendor/packages/pptx-ops/src/edit-text.js'
import {
  generateParagraphXml,
  patchTextElementXml,
} from '../vendor/packages/pptx-engine/src/generate.js'

export type PptxRunFormat = Partial<
  Pick<
    EditRun,
    'bold' | 'italic' | 'underline' | 'strike' | 'baseline' | 'fontSize' | 'fontFamily' | 'color'
  >
>
export interface PptxTextSelection {
  start: number
  end: number
  direction?: 'forward' | 'backward' | 'none'
}
interface Source {
  paragraph: number
  run: number
  inserted?: boolean
}
interface Piece {
  edit: EditRun
  source: Source
}
interface EditMetadata {
  original: readonly Paragraph[]
  sources: Source[][]
}
// Identity-bound metadata never crosses a request/serialization boundary.
const metadata = new WeakMap<EditParagraph[], EditMetadata>()

export function pptxTextValue(paragraphs: readonly Paragraph[]): string {
  return paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n')
}
function boundary(text: string, at: number, end: boolean): number {
  let value = Math.max(0, Math.min(text.length, Math.trunc(at)))
  const before = text.charCodeAt(value - 1)
  const after = text.charCodeAt(value)
  if (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) {
    value += end ? 1 : -1
  }
  return value
}
export function normalizePptxTextSelection(
  paragraphs: readonly Paragraph[],
  selection: PptxTextSelection,
): PptxTextSelection {
  const text = pptxTextValue(paragraphs)
  const collapsed = selection.start === selection.end
  const start = boundary(text, Math.min(selection.start, selection.end), false)
  return {
    ...selection,
    start,
    end: collapsed ? start : boundary(text, Math.max(selection.start, selection.end), true),
  }
}
function positions(paragraphs: readonly Paragraph[]) {
  let offset = 0
  return paragraphs.map((p, pi) => {
    const start = offset
    const runs = p.runs.map((run, ri) => {
      const from = offset
      offset += run.text.length
      return { run, pi, ri, start: from, end: offset }
    })
    const end = offset
    if (pi < paragraphs.length - 1) offset++
    return { start, end, runs }
  })
}
function isBreak(run: TextRun) {
  return run.text === '\n' && !run.field
}
export function pptxSelectionRuns(
  paragraphs: readonly Paragraph[],
  selection: PptxTextSelection | null,
): TextRun[] {
  const all = positions(paragraphs).flatMap((p) => p.runs)
  if (!selection) return all.filter((r) => !isBreak(r.run)).map((r) => r.run)
  const range = normalizePptxTextSelection(paragraphs, selection)
  if (range.start !== range.end) {
    return all
      .filter((r) => r.end > range.start && r.start < range.end && !isBreak(r.run))
      .map((r) => r.run)
  }
  // At a run boundary typing continues the preceding character, except after a soft break.
  const paragraph = positions(paragraphs).find(
    (p) => range.start >= p.start && range.start <= p.end,
  )
  const runs = paragraph?.runs.filter((r) => !isBreak(r.run)) ?? []
  const afterBreak = paragraph?.runs.some((r) => r.end === range.start && isBreak(r.run))
    ? runs.find((r) => r.start === range.start)
    : undefined
  const previous = afterBreak ?? runs.findLast((r) => r.start < range.start && r.end >= range.start)
  return previous ? [previous.run] : runs[0] ? [runs[0].run] : []
}
function finish(
  original: readonly Paragraph[],
  paragraphs: Array<{ source: number; pieces: Piece[] }>,
): EditParagraph[] {
  const normalized = paragraphs.map((p) => ({
    ...p,
    pieces: p.pieces.reduce<Piece[]>((pieces, piece) => {
      const previous = pieces.at(-1)
      const source = original[piece.source.paragraph]?.runs[piece.source.run]
      const { text: _text, ...style } = piece.edit
      const { text: _previousText, ...previousStyle } = previous?.edit ?? {}
      if (
        previous &&
        previous.source.paragraph === piece.source.paragraph &&
        previous.source.run === piece.source.run &&
        !source?.field &&
        !source?.rawXml &&
        !isBreak(source ?? { text: '' }) &&
        JSON.stringify(style) === JSON.stringify(previousStyle)
      ) {
        previous.edit = { ...previous.edit, text: previous.edit.text + piece.edit.text }
      } else pieces.push({ ...piece, edit: { ...piece.edit } })
      return pieces
    }, []),
  }))
  const edits = normalized.map((p) => ({ srcPara: p.source, runs: p.pieces.map((r) => r.edit) }))
  metadata.set(edits, { original, sources: normalized.map((p) => p.pieces.map((r) => r.source)) })
  return edits
}
export function formatPptxTextRange(
  paragraphs: readonly Paragraph[],
  selection: PptxTextSelection | null,
  format: PptxRunFormat | ((run: TextRun) => PptxRunFormat),
): EditParagraph[] {
  const range = selection ? normalizePptxTextSelection(paragraphs, selection) : null
  const resolve = typeof format === 'function' ? format : () => format
  return finish(
    paragraphs,
    positions(paragraphs).map((p, pi) => ({
      source: pi,
      pieces: p.runs.flatMap((item): Piece[] => {
        const { run, ri, start, end } = item
        const source = { paragraph: pi, run: ri }
        const unchanged = { edit: { text: run.text, srcRun: ri }, source }
        if (
          isBreak(run) ||
          (range && (range.start === range.end || range.end <= start || range.start >= end))
        )
          return [unchanged]
        const patch = resolve(run)
        const merged = applyEditParagraphs(
          [{ runs: [run] }],
          [{ runs: [{ text: run.text, srcRun: 0, ...patch }] }],
        )[0]!.runs[0]!
        if (JSON.stringify(merged) === JSON.stringify(run)) return [unchanged]
        // A field is an indivisible live value; never duplicate its identity by splitting its cache.
        if (!range || run.field || run.rawXml)
          return [{ edit: { ...unchanged.edit, ...patch }, source }]
        const from = Math.max(0, range.start - start)
        const to = Math.min(run.text.length, range.end - start)
        const pieces: Piece[] = []
        if (from) pieces.push({ edit: { text: run.text.slice(0, from), srcRun: ri }, source })
        pieces.push({ edit: { text: run.text.slice(from, to), srcRun: ri, ...patch }, source })
        if (to < run.text.length)
          pieces.push({ edit: { text: run.text.slice(to), srcRun: ri }, source })
        return pieces
      }),
    })),
  )
}

/** Replace only the actual input delta, preserving both sides across run/paragraph boundaries. */
export function editPptxTextValue(
  paragraphs: readonly Paragraph[],
  nextValue: string,
  pendingFormat?: PptxRunFormat,
  softBreak = false,
  previousSelection?: PptxTextSelection | null,
  inputType?: string,
): EditParagraph[] {
  const previous = pptxTextValue(paragraphs)
  let head = 0
  while (head < Math.min(previous.length, nextValue.length) && previous[head] === nextValue[head])
    head++
  head = boundary(previous, head, false)
  let tail = 0
  while (
    tail < Math.min(previous.length, nextValue.length) - head &&
    previous.at(-1 - tail) === nextValue.at(-1 - tail)
  )
    tail++
  let end = boundary(previous, previous.length - tail, true)
  if (previousSelection) {
    const selection = normalizePptxTextSelection(paragraphs, previousSelection)
    let from = selection.start
    let to = selection.end
    const removed = previous.length - nextValue.length
    if (from === to && removed > 0) {
      if (inputType === 'deleteContentBackward') from = boundary(previous, to - removed, false)
      else if (inputType === 'deleteContentForward') to = boundary(previous, from + removed, true)
    }
    const size = nextValue.length - previous.length + to - from
    if (
      size >= 0 &&
      previous.slice(0, from) === nextValue.slice(0, from) &&
      previous.slice(to) === nextValue.slice(from + size)
    ) {
      head = from
      end = to
    }
  }
  tail = previous.length - end
  const insertion = nextValue.slice(head, nextValue.length - tail)
  const positioned = positions(paragraphs)
  const firstPi = Math.max(
    0,
    positioned.findIndex((p) => head <= p.end),
  )
  const lastPi = Math.max(
    firstPi,
    positioned.findIndex((p) => end <= p.end),
  )
  const first = positioned[firstPi]!
  const last = positioned[lastPi]!
  const before: Piece[] = []
  const after: Piece[] = []
  const keep = (p: typeof first, from: number, to: number): Piece[] =>
    p.runs.flatMap(({ run, pi, ri, start, end: runEnd }) => {
      if (runEnd <= from || start >= to) return []
      const text = run.text.slice(Math.max(0, from - start), Math.min(run.text.length, to - start))
      if (run.rawXml && text !== run.text) throw new Error('公式对象需要整体选择后替换')
      return [
        {
          edit: { text, srcRun: ri },
          source: {
            paragraph: pi,
            run: ri,
            ...(run.field && text !== run.text ? { inserted: true } : {}),
          },
        },
      ]
    })
  before.push(...keep(first, first.start, head))
  after.push(...keep(last, end, last.end))
  // Prefer the preceding real character; a field cache must never turn typed text into another field.
  const candidates = first.runs.filter((r) => !isBreak(r.run) && !r.run.field && !r.run.rawXml)
  const rewritingParagraph = head <= first.start && end >= first.end
  const dominant = candidates
    .filter((r) => !r.run.hyperlink && !r.run.hyperlinkRId && !r.run.hyperlinkAction)
    .toSorted((a, b) => b.run.text.length - a.run.text.length)[0]
  const template =
    (rewritingParagraph ? dominant : undefined) ??
    (first.runs.some((r) => r.end === head && isBreak(r.run))
      ? candidates.find((r) => r.start === head)
      : undefined) ??
    (head !== end ? candidates.find((r) => r.start <= head && r.end > head) : undefined) ??
    candidates.findLast((r) => r.start < head) ??
    candidates[0]
  const source: Source = { paragraph: firstPi, run: template?.ri ?? 0, inserted: true }
  const chunks = softBreak ? [insertion] : insertion.split('\n')
  const changed = chunks.map((text, index) => ({
    source: firstPi,
    pieces: [
      ...(index === 0 ? before : []),
      ...(text ? [{ edit: { text, srcRun: source.run, ...pendingFormat }, source }] : []),
      ...(index === chunks.length - 1 ? after : []),
    ],
  }))
  const untouched = (pi: number) => ({
    source: pi,
    pieces: paragraphs[pi]!.runs.map((r, ri) => ({
      edit: { text: r.text, srcRun: ri },
      source: { paragraph: pi, run: ri },
    })),
  })
  return finish(paragraphs, [
    ...paragraphs.slice(0, firstPi).map((_p, pi) => untouched(pi)),
    ...changed,
    ...paragraphs.slice(lastPi + 1).map((_p, i) => untouched(lastPi + 1 + i)),
  ])
}

interface XmlChild {
  tag: string
  xml: string
}
/** Scan direct children only, so math/extension inner a:r nodes cannot shift provenance. */
function children(xml: string): XmlChild[] {
  const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>/g
  const result: XmlChild[] = []
  let depth = 0
  let start = 0
  let name = ''
  for (const token of xml.matchAll(tokens)) {
    const value = token[0]
    if (value.startsWith('<!') || value.startsWith('<?')) continue
    const closing = value.startsWith('</')
    const self = value.endsWith('/>')
    if (!closing && depth === 0) {
      start = token.index
      name = /^<([^\s/>]+)/.exec(value)?.[1] ?? ''
    }
    if (!closing && !self) depth++
    if (closing) depth--
    if (depth === 0) result.push({ tag: name, xml: xml.slice(start, token.index + value.length) })
  }
  return result
}
function inner(xml: string) {
  return xml.slice(xml.indexOf('>') + 1, xml.lastIndexOf('</'))
}
function isRunTag(tag: string) {
  return tag === 'a:r' || tag === 'a:br' || tag === 'a:fld' || tag === 'mc:AlternateContent'
}
function patchRunXml(xml: string, run: TextRun, inserted: boolean): string {
  if (run.text.includes('\n') && run.text !== '\n' && !run.field) {
    return run.text
      .split('\n')
      .map((text) => (text ? patchRunXml(xml, { ...run, text }, inserted) : ''))
      .join('<a:br/>')
  }
  if (xml.startsWith('<mc:AlternateContent')) {
    if (inserted) throw new Error('不能将公式对象作为新文字的格式来源')
    return xml
  }
  if (run.text === '\n' && !run.field) return xml.startsWith('<a:br') ? xml : '<a:br/>'
  const fieldOpen = /^<a:fld\b[^>]*>/.exec(xml)?.[0]
  let source = xml
  if (fieldOpen) source = source.replace(fieldOpen, '<a:r>').replace(/<\/a:fld>$/, '</a:r>')
  if (source.startsWith('<a:br')) source = '<a:r><a:rPr/><a:t/></a:r>'
  const wrapper = `<p:sp><p:txBody><a:p>${source}</a:p></p:txBody></p:sp>`
  const model = {
    text: { paragraphs: [{ runs: [{ ...run, field: undefined, rawXml: undefined }] }] },
  } as TextElement
  const patched = patchTextElementXml(model, wrapper)
  const body = /<a:p>([\s\S]*?)<\/a:p>/.exec(patched)?.[1]
  if (!body) throw new Error('无法保留原始文字格式')
  if (fieldOpen && !inserted)
    return body.replace(/^<a:r>/, fieldOpen).replace(/<\/a:r>$/, '</a:fld>')
  return body
}

/** Prepare on a clone before publishing either the model or its byte anchor. */
export function preparePptxTextRangeEdit(
  element: TextElement,
  edited: EditParagraph[],
  materialize: () => string,
): { paragraphs: Paragraph[]; xml: string } | null {
  const meta = metadata.get(edited)
  if (!meta) return null
  const old = element.text?.paragraphs
  if (!old || old !== meta.original) throw new Error('文字选区已过期，请重新选择文字')
  const currentXml = materialize()
  const bodyMatch = /<p:txBody\b[^>]*>([\s\S]*?)<\/p:txBody>/.exec(currentXml)
  if (!bodyMatch) throw new Error('此对象没有可编辑的原生文本区')
  const bodyChildren = children(bodyMatch[1]!)
  const originals = bodyChildren.filter((c) => c.tag === 'a:p')
  if (originals.length !== old.length) throw new Error('原生段落结构已变化，请重新打开文稿')
  const sourceRuns = originals.map((p) => children(inner(p.xml)).filter((c) => isRunTag(c.tag)))
  const nextParagraphs: Paragraph[] = []
  const nextXml = edited
    .map((paragraph, pi) => {
      const sourcePi = paragraph.srcPara ?? pi
      const original = originals[sourcePi]
      if (!original) throw new Error('文字段落来源已过期')
      const mapped = applyEditParagraphs(old, [{ ...paragraph, runs: [] }])[0]!
      const pieces = paragraph.runs
        .map((edit, ri) => {
          const source = meta.sources[pi]?.[ri]
          if (!source) throw new Error('文字格式来源已过期')
          const oldRun = old[source.paragraph]?.runs[source.run]
          const next = applyEditParagraphs(old, [{ srcPara: source.paragraph, runs: [edit] }])[0]!
            .runs[0]!
          if (source.inserted) {
            delete next.field
            delete next.rawXml
            delete next.paraMark
          }
          if (next.text.includes('\n') && next.text !== '\n' && !next.field) {
            const parts = next.text.split('\n')
            parts.forEach((part, index) => {
              if (part) mapped.runs.push({ ...next, text: part })
              if (index < parts.length - 1) mapped.runs.push({ text: '\n' })
            })
          } else mapped.runs.push(next)
          const raw = sourceRuns[source.paragraph]?.[source.run]?.xml
          if (raw)
            return !source.inserted && JSON.stringify(next) === JSON.stringify(oldRun)
              ? raw
              : patchRunXml(raw, next, !!source.inserted)
          if (oldRun && oldRun.text) throw new Error('原生文字结构无法保真定位')
          return inner(generateParagraphXml({ runs: [next] }))
        })
        .join('')
      nextParagraphs.push(mapped)
      const nodes = children(inner(original.xml))
      const prefix = nodes
        .filter((c) => !isRunTag(c.tag) && c.tag !== 'a:endParaRPr' && c.tag !== 'a:extLst')
        .map((c) => c.xml)
        .join('')
      const suffix = nodes
        .filter((c) => c.tag === 'a:endParaRPr' || c.tag === 'a:extLst')
        .map((c) => c.xml)
        .join('')
      const open = (/^<a:p\b[^>]*>/.exec(original.xml)?.[0] ?? '<a:p>').replace(/\/>$/, '>')
      return `${open}${prefix}${pieces}${suffix}</a:p>`
    })
    .join('')
  const nonParagraphs = bodyChildren
    .filter((c) => c.tag !== 'a:p')
    .map((c) => c.xml)
    .join('')
  const replacement = bodyMatch[0].replace(bodyMatch[1]!, () => `${nonParagraphs}${nextXml}`)
  return { paragraphs: nextParagraphs, xml: currentXml.replace(bodyMatch[0], () => replacement) }
}
