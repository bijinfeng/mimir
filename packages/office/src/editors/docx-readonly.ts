import type { CSSProperties } from 'react'
import type { PmDocJson } from '../docx.js'
import type { NumberingDef } from '../../vendor/packages/docx-engine/src/types.js'
import {
  computeListMarkerInfos,
  type ListItemRef,
} from '../../vendor/packages/docx-engine/src/list-markers.js'
import { extractCompareBody } from './docx-compare.js'
export interface ReadonlyRun {
  text: string
  break?: boolean
  tags: ('strong' | 'em' | 'u' | 's' | 'sup' | 'sub')[]
  style: CSSProperties
}
export interface ReadonlyParagraph {
  kind: 'paragraph'
  level?: number
  list?: 'bullet' | 'ordered'
  listLevel?: number
  marker?: string
  style: CSSProperties
  runs: ReadonlyRun[]
}
export interface ReadonlyCell {
  header: boolean
  colSpan: number
  rowSpan: number
  style: CSSProperties
  paragraphs: ReadonlyParagraph[]
}
export interface ReadonlyTable {
  kind: 'table'
  style: CSSProperties
  rows: ReadonlyCell[][]
}
export type ReadonlyBlock = ReadonlyParagraph | ReadonlyTable
const PARAGRAPHS = new Set(['docParagraph', 'docHeading', 'docListItem', 'paragraph', 'heading'])
const ROWS = new Set(['docTableRow', 'tableRow'])
const CELLS = new Set(['docTableCell', 'docTableHeader', 'tableCell', 'tableHeader'])
const HIGHLIGHTS: Record<string, string> = {
  yellow: '#FFFF00',
  green: '#00FF00',
  cyan: '#00FFFF',
  magenta: '#FF00FF',
  blue: '#0000FF',
  red: '#FF0000',
  darkBlue: '#00008B',
  darkCyan: '#008B8B',
  darkGreen: '#006400',
  darkMagenta: '#8B008B',
  darkRed: '#8B0000',
  darkYellow: '#808000',
  darkGray: '#808080',
  lightGray: '#C0C0C0',
  black: '#000000',
  white: '#FFFFFF',
}
function finite(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : undefined
}
function integer(value: unknown, min: number, max: number): number | undefined {
  const number = finite(value, min, max)
  return number !== undefined && Number.isInteger(number) ? number : undefined
}
function hex(value: unknown): string | undefined {
  return typeof value === 'string' && /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : undefined
}
function font(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length <= 128 &&
    /^[\p{L}\p{N} ._-]+$/u.test(value) &&
    value.trim()
    ? `"${value.trim()}"`
    : undefined
}
function alignment(value: unknown): CSSProperties['textAlign'] {
  return value === 'left' || value === 'right' || value === 'center' || value === 'justify'
    ? value
    : undefined
}
function textRun(node: PmDocJson): ReadonlyRun {
  const tags: ReadonlyRun['tags'] = [],
    style: CSSProperties = {}
  const marks = Array.isArray(node.marks)
    ? (node.marks as { type: string; attrs?: Record<string, unknown> }[])
    : []
  if (marks.length > 64) throw new Error('正文字符格式过多，无法显示拆分副本')
  for (const mark of marks) {
    if (mark.type === 'bold') tags.push('strong')
    else if (mark.type === 'italic') tags.push('em')
    else if (mark.type === 'underline') tags.push('u')
    else if (mark.type === 'strike') tags.push('s')
    else if (mark.type === 'superscript') tags.push('sup')
    else if (mark.type === 'subscript') tags.push('sub')
    else if (mark.type === 'docTextStyle') {
      const attrs = mark.attrs ?? {},
        size = finite(attrs.sizeHalfPoints, 2, 288)
      if (size !== undefined) style.fontSize = `${size / 2}pt`
      const fonts = [font(attrs.fontAscii), font(attrs.font)].filter(
        (value): value is string => !!value,
      )
      if (fonts.length) style.fontFamily = [...new Set(fonts)].join(', ')
      const color = hex(attrs.color),
        background =
          (typeof attrs.highlight === 'string' && Object.hasOwn(HIGHLIGHTS, attrs.highlight)
            ? HIGHLIGHTS[attrs.highlight]
            : undefined) ??
          hex(attrs.shadingDisplay) ??
          hex(attrs.shading)
      if (color) style.color = color
      if (background) style.backgroundColor = background
      if (attrs.vertAlign === 'superscript') tags.push('sup')
      else if (attrs.vertAlign === 'subscript') tags.push('sub')
      if (attrs.boldOff === true) style.fontWeight = 'normal'
      if (attrs.italicOff === true) style.fontStyle = 'normal'
    }
    // Links, revisions, comments and fields contribute their text, never interactive markup.
  }
  return {
    text: node.type === 'text' ? (node.text ?? '') : '',
    ...(node.type === 'hardBreak' ? { break: true } : {}),
    tags,
    style,
  }
}
function paragraphStyle(attrs: Record<string, unknown>): CSSProperties {
  const style: CSSProperties = {}
  const align = alignment(attrs.align)
  if (align) style.textAlign = align
  if (attrs.bidi === true) style.direction = 'rtl'
  const spacing = finite(attrs.lineSpacing, 0.5, 4)
  if (spacing !== undefined && (!attrs.lineRule || attrs.lineRule === 'auto'))
    style.lineHeight = spacing
  // PM paragraphs retain OOXML twips; unlike font size these values divide by 20.
  for (const [name, property, min, max] of [
    ['spaceBefore', 'marginTop', 0, 2880],
    ['spaceAfter', 'marginBottom', 0, 2880],
    ['indentLeft', 'marginInlineStart', 0, 2880],
    ['indentRight', 'marginInlineEnd', 0, 2880],
    ['indentFirstLine', 'textIndent', -1440, 2880],
  ] as const) {
    const value = finite(attrs[name], min, max)
    if (value !== undefined) style[property] = `${value / 20}pt`
  }
  const fill = hex(attrs.shadingDisplay) ?? hex(attrs.shadingFill)
  if (fill) style.backgroundColor = fill
  return style
}
/** Readonly AST from known PM nodes and individually validated scalar styles. Never copies HTML or attrs. */
export function docxReadonlyBody(
  doc: PmDocJson,
  numbering = new Map<string, NumberingDef>(),
): { blocks: ReadonlyBlock[]; excluded: number; unsupportedMarkers: number } {
  const { excluded } = extractCompareBody(doc) // Reuse the same bounded body traversal before creating markup.
  const refs: ListItemRef[] = [],
    listNodes: PmDocJson[] = []
  const collect = (node: PmDocJson) => {
    if (node.type === 'docListItem' || node.type === 'docProtected') {
      const attrs = node.type === 'docProtected' ? node.attrs?.strayList : (node.attrs ?? {})
      if (!attrs || typeof attrs !== 'object') return
      const values = attrs as Record<string, unknown>
      refs.push({
        numId: typeof values.numId === 'string' ? values.numId : null,
        ilvl: integer(values.ilvl, 0, 8) ?? 0,
        ...(node.type === 'docListItem' &&
        (node.attrs?.paraMarkDel ||
          (node.attrs?.blockRevision as { kind?: string } | undefined)?.kind === 'del')
          ? { deleted: true }
          : {}),
      })
      listNodes.push(node)
      return
    }
    if (
      node.type === 'doc' ||
      node.type === 'docTable' ||
      node.type === 'table' ||
      ROWS.has(node.type) ||
      CELLS.has(node.type)
    )
      for (const child of node.content ?? []) collect(child)
  }
  collect(doc)
  let unsupportedMarkers = 0
  const markers = new Map<PmDocJson, string>()
  computeListMarkerInfos(refs, numbering).forEach((marker, index) => {
    const node = listNodes[index]!
    if (node.type !== 'docListItem') return
    const ref = refs[index]!,
      level = ref.numId === null ? undefined : numbering.get(ref.numId)?.levels[ref.ilvl]
    if (
      marker &&
      level?.picBulletId === undefined &&
      !marker.picBulletSrc &&
      marker.text.length <= 256
    )
      markers.set(node, marker.text)
    else unsupportedMarkers++
  })
  const paragraph = (node: PmDocJson): ReadonlyParagraph => {
    const attrs = node.attrs ?? {},
      level = integer(attrs.level, 1, 9)
    const list =
      node.type === 'docListItem' ? (attrs.kind === 'ordered' ? 'ordered' : 'bullet') : undefined
    const listLevel = list ? (integer(attrs.ilvl, 0, 8) ?? 0) : undefined
    return {
      kind: 'paragraph',
      style: paragraphStyle(attrs),
      ...(node.type === 'docHeading' || node.type === 'heading' ? { level: level ?? 1 } : {}),
      ...(list ? { list, listLevel, marker: markers.get(node) } : {}),
      runs: (node.content ?? [])
        .filter((child) => child.type === 'text' || child.type === 'hardBreak')
        .map(textRun),
    }
  }
  const blocks: ReadonlyBlock[] = []
  for (const node of doc.content ?? []) {
    if (PARAGRAPHS.has(node.type)) blocks.push(paragraph(node))
    else if (node.type === 'docTable' || node.type === 'table') {
      const fill = hex(node.attrs?.tblFill),
        style: CSSProperties = {}
      if (fill) style.backgroundColor = fill
      const rows = (node.content ?? [])
        .filter((row) => ROWS.has(row.type))
        .map((row) =>
          (row.content ?? [])
            .filter((cell) => CELLS.has(cell.type))
            .map((cell): ReadonlyCell => {
              const attrs = cell.attrs ?? {},
                cellStyle: CSSProperties = {}
              const background = hex(attrs.fill),
                color = hex(attrs.color),
                align = alignment(attrs.align)
              if (background) cellStyle.backgroundColor = background
              if (color) cellStyle.color = color
              if (attrs.bold === true) cellStyle.fontWeight = 'bold'
              if (align) cellStyle.textAlign = align
              if (attrs.vAlign === 'center') cellStyle.verticalAlign = 'middle'
              else if (attrs.vAlign === 'bottom' || attrs.vAlign === 'top')
                cellStyle.verticalAlign = attrs.vAlign
              const colSpan = integer(attrs.colspan, 1, 64) ?? 1,
                rowSpan = integer(attrs.rowspan, 1, 1000) ?? 1
              const colwidth = Array.isArray(attrs.colwidth)
                ? attrs.colwidth.map((width) => finite(width, 1, 2000))
                : []
              if (
                colwidth.length === colSpan &&
                colwidth.every((width): width is number => width !== undefined)
              )
                cellStyle.width = colwidth.reduce((sum, width) => sum + width, 0)
              const cellMar =
                attrs.cellMar && typeof attrs.cellMar === 'object'
                  ? (attrs.cellMar as Record<string, unknown>)
                  : {}
              for (const [side, property] of [
                ['top', 'paddingTop'],
                ['bottom', 'paddingBottom'],
                ['left', 'paddingLeft'],
                ['right', 'paddingRight'],
              ] as const) {
                const value = finite(cellMar[side], 0, 1440)
                if (value !== undefined) cellStyle[property] = `${value / 20}pt`
              }
              return {
                header: cell.type === 'docTableHeader' || cell.type === 'tableHeader',
                colSpan,
                rowSpan,
                style: cellStyle,
                paragraphs: (cell.content ?? [])
                  .filter((child) => PARAGRAPHS.has(child.type))
                  .map(paragraph),
              }
            }),
        )
      blocks.push({ kind: 'table', style, rows })
    }
  }
  return { blocks, excluded, unsupportedMarkers }
}
