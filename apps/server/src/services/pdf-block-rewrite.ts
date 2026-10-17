import type { PdfTextBlockOperation, PdfTextBlockTarget } from '@mimir/shared'
import type { TextEditInput } from '../../../../packages/office/vendor/apps/pdf/src/shared/ipc.js'
import {
  applyTextEdits,
  foldMap,
} from '../../../../packages/office/vendor/apps/pdf/src/main/text-edit.js'
import {
  assertPdfBlockActive,
  clearPdfNativeBlockBoldStroke,
  measurePdfNativeBlockText,
  readPdfNativeBlockObjects,
  type PdfNativeBlockObject,
} from './pdf-block-writer.js'

type Rewrite = Extract<PdfTextBlockOperation, { op: 'rewrite' }>
const normalized = (text: string) => foldMap(text).units.join('')
const near = (a: number[], b: number[]) =>
  a.length === b.length && a.every((n, i) => Math.abs(n - b[i]!) < 0.03)
const spread = (values: number[]) => Math.max(...values) - Math.min(...values)
const countObjects = (objects: PdfNativeBlockObject[]): number =>
  objects.reduce((sum, object) => sum + 1 + countObjects(object.children), 0)
// PDFium's text-page association can add/remove a trailing gap after neighboring
// objects reflow. Interior glyphs and every geometric/resource attribute stay exact.
const glyphKey = (glyphs: number[]) => String.fromCodePoint(...glyphs).trimEnd()
const boldFont = (object: PdfNativeBlockObject) =>
  (object.font?.weight ?? 0) >= 600 ||
  /bold|black|heavy|semibold|demibold/i.test(object.font?.name ?? '')
const italicFont = (object: PdfNativeBlockObject) =>
  !!object.font?.italicAngle || /italic|oblique/i.test(object.font?.name ?? '')
const selectedFontFamily = (object: PdfNativeBlockObject): Rewrite['font'] => {
  const name = `${object.font?.name} ${object.font?.family}`
  if (/arial|helvetica|liberationsans/i.test(name)) return 'arial'
  if (/times|liberationserif/i.test(name)) return 'times'
  if (/courier|liberationmono/i.test(name)) return 'courier'
  return undefined
}

function clearingStyle(operation: Rewrite, objects: PdfNativeBlockObject[]) {
  if (operation.bold !== false && operation.italic !== false) return {}
  const needFace =
    (operation.bold === false && objects.some(boldFont)) ||
    (operation.italic === false && objects.some(italicFont))
  if (!needFace) return {}
  const families = new Set(objects.map(selectedFontFamily))
  const font = operation.font ?? (families.size === 1 ? families.values().next().value : undefined)
  if (!font)
    throw new Error('无法核验此原字体的普通字面，请明确选择 Arial、Times 或 Courier 后重试')
  const inherited = (field: 'bold' | 'italic', read: (object: PdfNativeBlockObject) => boolean) => {
    if (operation[field] !== undefined) return operation[field]
    const states = new Set(objects.map(read))
    if (states.size !== 1)
      throw new Error(`原段含混合${field === 'bold' ? '粗体' : '斜体'}，请明确指定该项后重试`)
    return states.values().next().value
  }
  return {
    newFont: font,
    newBold: inherited('bold', boldFont),
    newItalic: inherited('italic', italicFont),
  }
}
function sameObject(a: PdfNativeBlockObject, b: PdfNativeBlockObject) {
  return (
    a.type === b.type &&
    a.text.trimEnd() === b.text.trimEnd() &&
    glyphKey(a.glyphs) === glyphKey(b.glyphs) &&
    a.style === b.style &&
    a.resource === b.resource &&
    a.clipped === b.clipped &&
    near(a.bounds, b.bounds) &&
    near(a.matrix, b.matrix) &&
    JSON.stringify(a.children) === JSON.stringify(b.children)
  )
}
export function pdfBlockReplacement(
  text: string,
  replace: Rewrite['replace'],
  replacement: string,
): string {
  if (!replace) return replacement.replace(/\r\n?/g, '\n')
  const source = foldMap(text),
    needle = foldMap(replace.oldText).units
  if (!needle.length) throw new Error('部分替换原文不能为空白')
  let found = 0
  for (let at = 0; at <= source.units.length - needle.length; at++) {
    if (!needle.every((unit, offset) => source.units[at + offset] === unit)) continue
    if (++found === replace.occurrence) {
      const end = at + needle.length - 1
      // A folded ligature may expand to several units; never split its source glyph.
      if (
        (at > 0 && source.idx[at]! < source.end[at - 1]!) ||
        (end + 1 < source.units.length && source.idx[end + 1]! < source.end[end]!)
      )
        throw new Error('替换边界不能拆分原文字形')
      return text.slice(0, source.idx[at]) + replacement + text.slice(source.end[end])
    }
    at += needle.length - 1
  }
  throw new Error('当前段落中没有指定次序的原文')
}
export interface PdfBlockRewriteLayout {
  origin: [number, number]
  width: number
  fontSize: number
  leading: number
  align: 'left' | 'center' | 'right'
}
export function pdfBlockRewriteLayout(
  target: PdfTextBlockTarget,
  native: PdfNativeBlockObject[],
  width: number,
): PdfBlockRewriteLayout {
  const members = target.members.map((member) => native[member.objectIndex]!)
  if (
    members.some(
      (object) =>
        object.type !== 1 ||
        object.clipped ||
        Math.abs(object.matrix[1]) > 0.0001 ||
        Math.abs(object.matrix[2]) > 0.0001 ||
        object.matrix[0] <= 0 ||
        object.matrix[3] <= 0,
    )
  )
    throw new Error('此段落含旋转、倾斜或不可核验字形，无法重排')
  const sizes = members
    .map((object) => Number((JSON.parse(object.style) as unknown[])[2]) * object.matrix[3])
    .toSorted((a, b) => a - b)
  const baselines = [
      ...new Set(members.map((object) => Math.round(object.matrix[5] * 100) / 100)),
    ].toSorted((a, b) => b - a),
    leads = baselines
      .slice(1)
      .map((y, i) => baselines[i]! - y)
      .toSorted((a, b) => a - b)
  const fontSize = sizes[Math.floor(sizes.length / 2)]!
  if (!Number.isFinite(fontSize) || fontSize <= 0 || !Number.isFinite(width) || width <= 0)
    throw new Error('段落原文字号或宽度无法核验')
  const rows = baselines.map((baseline) =>
      members.filter((member) => Math.abs(member.matrix[5] - baseline) < 0.05),
    ),
    lefts = rows.map((row) => Math.min(...row.map((member) => member.matrix[4]))),
    rights = rows.map((row) => Math.max(...row.map((member) => member.bounds[2]))),
    centers = lefts.map((left, index) => (left + rights[index]!) / 2)
  const align =
    rows.length > 1 && spread(lefts) > fontSize * 0.6
      ? spread(rights) < fontSize * 0.6
        ? 'right'
        : spread(centers) < fontSize * 0.6
          ? 'center'
          : 'left'
      : 'left'
  return {
    origin: [Math.min(...members.map((o) => o.matrix[4])), baselines[0]!],
    width,
    fontSize,
    leading: leads[Math.floor(leads.length / 2)] ?? fontSize * 1.2,
    align,
  }
}
function remainingObjects(
  before: PdfNativeBlockObject[],
  after: PdfNativeBlockObject[],
  selected: Set<number>,
): PdfNativeBlockObject[] {
  const remaining = [...after]
  for (const previous of before.filter((object) => !selected.has(object.objectIndex))) {
    const at = remaining.findIndex((object) => sameObject(previous, object))
    if (at < 0) throw new Error('PDF 非目标字形、字体、图像或对象读回不一致，未写入')
    remaining.splice(at, 1)
  }
  if (remaining.some((object) => object.type !== 1 || object.clipped))
    throw new Error('段落重写出现非文字覆盖对象，未写入')
  return remaining.toSorted((a, b) =>
    Math.abs(b.matrix[5] - a.matrix[5]) > 0.5
      ? b.matrix[5] - a.matrix[5]
      : a.matrix[4] - b.matrix[4],
  )
}
export function wrapPdfMeasuredText(
  text: string,
  measured: { text: string; advances: number[]; spaceAdvance: number }[],
  width: number,
) {
  const units = measured.flatMap((run) =>
      [...run.text].flatMap((ch, i) =>
        foldMap(ch).units.map((unit) => ({
          unit,
          width: run.advances[i]!,
          spaceAdvance: run.spaceAdvance,
        })),
      ),
    ),
    wanted = foldMap(text)
  if (units.map((item) => item.unit).join('') !== wanted.units.join(''))
    throw new Error('原生字体测量与替换文字不一致')
  let rank = 0
  const widths = [...text].map((ch) => {
    const count = foldMap(ch).units.length
    if (!count) return /[\r\n]/.test(ch) ? 0 : (units[rank] ?? units.at(-1))!.spaceAdvance
    const value = units.slice(rank, rank + count).reduce((sum, item) => sum + item.width, 0) / count
    rank += count
    return value
  })
  const chars = [...text],
    lines: string[] = [],
    lineWidths: number[] = []
  let start = 0,
    cursor = 0,
    lastSpace = -1,
    lastSpaceWidth = 0
  const push = (end: number, advance: number) => {
    while (end > start && /\s/.test(chars[end - 1]!)) {
      end--
      advance -= widths[end]!
    }
    lines.push(chars.slice(start, end).join('').trimEnd())
    lineWidths.push(advance)
  }
  for (let at = 0; at < chars.length; at++) {
    const char = chars[at]!
    if (char === '\n') {
      push(at, cursor)
      start = at + 1
      cursor = 0
      lastSpace = -1
      continue
    }
    if (/\s/.test(char)) {
      lastSpace = at
      lastSpaceWidth = cursor
    }
    if (cursor + widths[at]! > width + 0.01 && at > start) {
      if (lastSpace >= start) {
        push(lastSpace, lastSpaceWidth)
        start = lastSpace + 1
        at = start - 1
      } else {
        push(at, cursor)
        start = at
        at--
      }
      cursor = 0
      lastSpace = -1
      continue
    }
    if (widths[at]! > width + 0.01) throw new Error('替换字形宽于原段落，无法安全重排')
    cursor += widths[at]!
  }
  push(chars.length, cursor)
  return { text: lines.join('\n'), widths: lineWidths }
}

/** True native removal/rebuild; unaffected resources are independently checked. */
export async function writePdfNativeBlockRewrite(
  bytes: Uint8Array,
  target: PdfTextBlockTarget,
  sourceText: string,
  logical: string,
  operation: Rewrite,
  layout: PdfBlockRewriteLayout,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (operation.replace) {
    const source = foldMap(sourceText),
      needle = foldMap(operation.replace.oldText),
      ordered = target.members.toSorted((a, b) =>
        Math.abs(b.matrix[5] - a.matrix[5]) > 0.5
          ? b.matrix[5] - a.matrix[5]
          : a.matrix[4] - b.matrix[4],
      )
    let occurrence = 0,
      start = -1
    for (let at = 0; at <= source.units.length - needle.units.length; at++)
      if (needle.units.every((unit, i) => source.units[at + i] === unit)) {
        if (++occurrence === operation.replace.occurrence) {
          start = at
          break
        }
        at += needle.units.length - 1
      }
    if (start < 0) throw new Error('部分替换原文已经失效')
    let rank = 0,
      firstRank = 0
    const members = ordered.filter((member) => {
      const count = foldMap(member.text).units.length,
        touched = rank < start + needle.units.length && rank + count > start
      if (touched && rank <= start) firstRank = rank
      rank += count
      return touched
    })
    const container = members.map((member) => member.text).join(''),
      map = foldMap(container),
      from = start - firstRank,
      to = from + needle.units.length - 1
    if (!members.length || map.idx[from] === undefined || map.end[to] === undefined)
      throw new Error('原文容器无法准确归属')
    sourceText = container
    logical = container.slice(0, map.idx[from]) + operation.newText + container.slice(map.end[to])
    target = { ...target, members }
  }
  const before: PdfNativeBlockObject[][] = []
  // Read through the actual page tree once, keeping the same bounded budget as moves.
  const { PDFDocument } = await import('pdf-lib'),
    document = await PDFDocument.load(bytes),
    selected = new Set(target.members.map((member) => member.objectIndex))
  if (document.getPageCount() > 1000) throw new Error('PDF 超过1000页校验预算')
  let count = 0
  for (let page = 0; page < document.getPageCount(); page++) {
    const objects = await readPdfNativeBlockObjects(bytes, page, signal)
    count += countObjects(objects)
    if (count > 30000) throw new Error('PDF 原生对象超过校验预算')
    before.push(objects)
  }
  const rect: [number, number, number, number] = [
    Math.min(...target.members.map((m) => m.bounds[0])),
    Math.min(...target.members.map((m) => m.bounds[1])),
    Math.max(...target.members.map((m) => m.bounds[2])),
    Math.max(...target.members.map((m) => m.bounds[3])),
  ]
  const size = operation.fontSize ?? layout.fontSize,
    leading = (layout.leading * size) / layout.fontSize,
    align = operation.align ?? layout.align
  const style = logical.trim()
    ? clearingStyle(
        operation,
        before[target.pageIndex]!.filter((object) => selected.has(object.objectIndex)),
      )
    : {}
  const prepared =
    operation.bold === false && logical.trim()
      ? await clearPdfNativeBlockBoldStroke(bytes, target.pageIndex, [...selected], signal)
      : bytes
  const base: TextEditInput = {
    pageIndex: target.pageIndex,
    rect,
    oldText: sourceText,
    newText: logical,
    fontSize: layout.fontSize,
    newFontSize: operation.fontSize,
    newFont: operation.font,
    newColor: operation.color
      ? ([1, 3, 5].map((at) => parseInt(operation.color!.slice(at, at + 2), 16)) as [
          number,
          number,
          number,
        ])
      : undefined,
    newBold: operation.bold,
    newItalic: operation.italic,
    origin: operation.replace ? undefined : layout.origin,
    lineLeading: operation.replace ? undefined : leading,
    ...style,
  }
  let plan = { text: logical, widths: [] as number[] },
    result = bytes
  for (let pass = 0; pass < 4; pass++) {
    assertPdfBlockActive(signal)
    const rewritten = await applyTextEdits(prepared, [
      {
        ...base,
        newText: plan.text,
        lineXOffsets:
          align === 'left'
            ? undefined
            : plan.widths.map((w) =>
                Math.max(0, (layout.width - w) / (align === 'center' ? 2 : 1)),
              ),
      },
    ])
    if (rewritten.skipped.length)
      throw new Error(`段落原文重写失败：${rewritten.skipped[0]!.reason}`)
    result = rewritten.bytes
    assertPdfBlockActive(signal)
    const native = await readPdfNativeBlockObjects(result, target.pageIndex, signal),
      remaining = remainingObjects(before[target.pageIndex]!, native, selected)
    if (
      (operation.bold === false &&
        remaining.some(
          (object) => boldFont(object) || Number((JSON.parse(object.style) as unknown[])[3]) !== 0,
        )) ||
      (operation.italic === false && remaining.some(italicFont))
    )
      throw new Error('原文粗斜体取消未通过原生字体核验，未写入')
    if (normalized(remaining.map((o) => o.text).join('')) !== normalized(logical))
      throw new Error('替换原文字形读回不一致，未写入')
    if (!logical.trim() || operation.replace) break
    const measured = await measurePdfNativeBlockText(
        result,
        target.pageIndex,
        remaining.map((o) => o.objectIndex),
      ),
      next = wrapPdfMeasuredText(logical, measured, layout.width)
    if (next.text === plan.text && (align === 'left' || near(next.widths, plan.widths))) break
    if (pass === 3) throw new Error('实际字体重排未收敛，未写入')
    plan = next
  }
  for (let page = 0; page < before.length; page++) {
    assertPdfBlockActive(signal)
    const after = await readPdfNativeBlockObjects(result, page, signal)
    if (page === target.pageIndex) remainingObjects(before[page]!, after, selected)
    else if (
      after.length !== before[page]!.length ||
      after.some((object, index) => !sameObject(before[page]![index]!, object))
    )
      throw new Error('PDF 非目标页面读回不一致，未写入')
  }
  return result
}
