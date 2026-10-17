import { Extension, type Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { closeHistory, isHistoryTransaction } from '@tiptap/pm/history'
import { NodeSelection, Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { isInTable, selectedRect, TableMap } from '@tiptap/pm/tables'
import type {
  CellBorder,
  CellBorders,
  TableLook,
  SectionInfo,
} from '../../vendor/packages/docx-engine/src/types.js'

import { docxTablePositionIssue } from '../docx-table-save.js'

export const TABLE_LOOK: TableLook = {
  firstRow: true,
  lastRow: false,
  firstColumn: true,
  lastColumn: false,
  bandedRows: true,
  bandedColumns: false,
}
function cellWidths(table: PmNode): string {
  const rows: unknown[][] = []
  table.forEach((row) => {
    const widths: unknown[] = []
    row.forEach((cell) => widths.push(cell.attrs.colwidth))
    rows.push(widths)
  })
  return JSON.stringify(rows)
}

/** Native PM drag changes cells; the DOCX renderer also needs its table-level grid. */
function liveTableWidthAttrs(table: PmNode): Record<string, unknown> | null {
  if (table.attrs.tblAutoFit === 'contents') return null
  const map = TableMap.get(table)
  const widths = Array.from({ length: map.width }, (_, column) => {
    for (let row = 0; row < map.height; row++) {
      const offset = map.map[row * map.width + column]!
      const cell = table.nodeAt(offset)
      const slot = column - map.findCell(offset).left
      const width = Number(cell?.attrs.colwidth?.[slot])
      if (Number.isFinite(width) && width > 0) return width
    }
    return 0
  })
  if (!widths.length || widths.some((width) => width <= 0)) return null
  const total = widths.reduce((sum, width) => sum + width, 0)
  const colWidthsPct = widths.map((width) => (width / total) * 100)
  // Preserve imported percentage/window sizing and all float positioning attrs.
  const widthPx =
    table.attrs.tblAutoFit === 'window' || table.attrs.widthPct ? table.attrs.widthPx : total
  if (
    widthPx === table.attrs.widthPx &&
    JSON.stringify(colWidthsPct) === JSON.stringify(table.attrs.colWidthsPct)
  )
    return null
  return { ...table.attrs, widthPx, colWidthsPct }
}
export const DocxTableDesignExtension = Extension.create({
  name: 'mimirTableDesign',
  addGlobalAttributes() {
    return [
      { types: ['docTable'], attributes: { mimirTablePreset: { default: null, rendered: false } } },
    ]
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged) || transactions.some(isHistoryTransaction))
            return null
          const tr = newState.tr
          oldState.doc.forEach((previous, position) => {
            if (previous.type.name !== 'docTable') return
            const mapped = transactions.reduce(
              (pos, transaction) => transaction.mapping.map(pos),
              position,
            )
            const current = newState.doc.nodeAt(mapped)
            if (
              current?.type.name !== 'docTable' ||
              current.attrs.docxIndex !== previous.attrs.docxIndex ||
              cellWidths(current) === cellWidths(previous)
            )
              return
            const attrs = liveTableWidthAttrs(current)
            if (attrs) tr.setNodeMarkup(mapped, undefined, attrs)
          })
          return tr.docChanged ? tr : null
        },
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            state.doc.forEach((node, pos, index) => {
              if (node.type.name === 'docTable')
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    'data-mimir-table-top-index': String(index),
                  }),
                )
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
export const TABLE_PRESETS = [
  { id: 'grid', name: '简洁网格', header: null, band1: null, band2: null, border: '808080' },
  {
    id: 'blue-header',
    name: '浅蓝表头',
    header: 'D9EAF7',
    band1: null,
    band2: null,
    border: '5B9BD5',
  },
  {
    id: 'blue-banded',
    name: '蓝色条纹',
    header: 'BDD7EE',
    band1: 'DDEBF7',
    band2: 'FFFFFF',
    border: '9DC3E6',
  },
  {
    id: 'gray-banded',
    name: '灰色条纹',
    header: 'D9E1F2',
    band1: 'E7E6E6',
    band2: 'FFFFFF',
    border: 'A5A5A5',
  },
  {
    id: 'green-header',
    name: '浅绿表头',
    header: 'E2F0D9',
    band1: null,
    band2: null,
    border: '70AD47',
  },
] as const
export type BorderMode =
  | 'all'
  | 'none'
  | 'outside'
  | 'inside'
  | 'insideH'
  | 'insideV'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
export interface TableDesignTarget {
  doc: PmNode
  node: PmNode
  pos: number
  selectedCells: number[]
  selectionRect: { top: number; bottom: number; left: number; right: number }
}
export interface TableDesignDraft {
  styleId: string
  look: TableLook
  align: 'left' | 'center' | 'right'
  autoFit: 'fixed' | 'contents' | 'window'
  margins: Record<'top' | 'bottom' | 'left' | 'right', number>
  position: TablePositionDraft
}
export interface TablePositionDraft {
  wrap: 'none' | 'left' | 'right'
  x: number
  y: number
  xSpec: string | null
  xEdited: boolean
  ySpec: string | null
  distance: Record<'top' | 'bottom' | 'left' | 'right', number>
}
export interface TablePositionContext {
  sourceXml?: string
  contentWidthPx: number
}
export const TABLE_TWIPS_PER_CM = 1440 / 2.54
export function tablePositionContext(
  target: TableDesignTarget,
  sections: SectionInfo[],
  sourceXml?: string,
): TablePositionContext {
  const index = Number(target.node.attrs.docxIndex)
  const section = sections.find(
    (item) => index >= item.firstBlockIndex && index <= item.lastBlockIndex,
  )?.settings
  const contentWidthPx = section
    ? (section.pageWidth - section.marginLeft - section.marginRight) / 15
    : NaN
  return { sourceXml, contentWidthPx }
}
function measuredTableWidth(editor: Editor, target: TableDesignTarget): number {
  const attrs = target.node.attrs
  if (Number(attrs.widthPx) > 0) return Number(attrs.widthPx)
  if (Number(attrs.tblFloatWidthPx) > 0) return Number(attrs.tblFloatWidthPx)
  const element = editor.view.nodeDOM(target.pos)
  if (!(element instanceof HTMLElement)) return 0
  const zoomElement = element.closest('.doc-zoom')
  const zoom = zoomElement ? Number.parseFloat(getComputedStyle(zoomElement).zoom || '1') || 1 : 1
  return element.getBoundingClientRect().width / zoom
}
/** Keep raw twips in the draft. Only a user edit converts the displayed centimetres. */
function positionDraft(target: TableDesignTarget): TablePositionDraft {
  const attrs = target.node.attrs
  const side = attrs.tblFloatSource ?? attrs.tblFloat
  const distance = attrs.tblFloatDistance as Record<string, number> | null
  return {
    wrap: side === 'left' || side === 'right' ? side : 'none',
    x: attrs.tblFloatXTwips ?? 0,
    y: attrs.tblFloatYTwips ?? 0,
    xEdited: false,
    xSpec: attrs.tblFloatXSpec ?? null,
    ySpec: attrs.tblFloatYSpec ?? null,
    distance: {
      top: distance?.top ?? 0,
      bottom: distance?.bottom ?? 0,
      left: distance?.left ?? 0,
      right: distance?.right ?? 0,
    },
  }
}
export interface TableBorderDraft {
  scope: 'table' | 'selection'
  mode: BorderMode
  line: CellBorder
}
export function selectedDocxTable(editor: Editor): TableDesignTarget | null {
  try {
    const selection = editor.state.selection
    if (selection instanceof NodeSelection && selection.node.type.name === 'docTable') {
      const map = TableMap.get(selection.node)
      const rect = { top: 0, left: 0, bottom: map.height, right: map.width }
      return {
        doc: editor.state.doc,
        node: selection.node,
        pos: selection.from,
        selectedCells: [...new Set(map.map)],
        selectionRect: rect,
      }
    }
    if (!isInTable(editor.state)) return null
    const rect = selectedRect(editor.state)
    const pos = rect.tableStart - 1
    const node = editor.state.doc.nodeAt(pos)
    if (node?.type.name !== 'docTable') return null
    return {
      doc: editor.state.doc,
      node,
      pos,
      selectedCells: rect.map.cellsInRect(rect),
      selectionRect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right },
    }
  } catch {
    return null
  }
}
export function tableDesignDraft(target: TableDesignTarget): TableDesignDraft {
  const attrs = target.node.attrs
  const margins = attrs.cellMar as Record<string, number> | null
  return {
    position: positionDraft(target),
    styleId: String(attrs.tblStyleId ?? ''),
    look: { ...TABLE_LOOK, ...attrs.tblLook },
    align: attrs.tblAlign === 'center' || attrs.tblAlign === 'right' ? attrs.tblAlign : 'left',
    autoFit:
      attrs.tblAutoFit === 'contents' || attrs.tblAutoFit === 'window' ? attrs.tblAutoFit : 'fixed',
    margins: {
      top: margins?.top ?? 0,
      bottom: margins?.bottom ?? 0,
      left: margins?.left ?? 108,
      right: margins?.right ?? 108,
    },
  }
}
export function tableBorderCurrent(target: TableDesignTarget) {
  const values: (CellBorder | null)[] = []
  const map = TableMap.get(target.node)
  for (const offset of target.selectedCells) {
    const cell = target.node.nodeAt(offset)
    const rect = map.findCell(offset)
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      const outer =
        side === 'top'
          ? rect.top === 0
          : side === 'bottom'
            ? rect.bottom === map.height
            : side === 'left'
              ? rect.left === 0
              : rect.right === map.width
      const fallbackSide = outer
        ? side
        : side === 'top' || side === 'bottom'
          ? 'insideH'
          : 'insideV'
      const line = cell?.attrs.borders?.[side] ?? target.node.attrs.borders?.[fallbackSide]
      values.push((line as CellBorder | undefined) ?? null)
    }
  }
  const first = values[0]
  const mixed = values.some((value) => JSON.stringify(value) !== JSON.stringify(first))
  return { line: mixed ? null : (first ?? null), mixed }
}
export function applyDocxTableDesign(
  editor: Editor,
  target: TableDesignTarget,
  draft: TableDesignDraft,
  presetId: string | null,
  border: TableBorderDraft | null,
  positionContext?: TablePositionContext,
): TableDesignTarget {
  if (
    editor.isDestroyed ||
    editor.state.doc !== target.doc ||
    editor.state.doc.nodeAt(target.pos) !== target.node ||
    selectedDocxTable(editor)?.pos !== target.pos
  )
    throw new Error('文档已变化，请重新选择表格并打开面板')
  if (
    !['left', 'center', 'right'].includes(draft.align) ||
    !['fixed', 'contents', 'window'].includes(draft.autoFit) ||
    Object.keys(TABLE_LOOK).some((key) => typeof draft.look[key as keyof TableLook] !== 'boolean')
  )
    throw new Error('请检查表格布局和样式选项')
  if (presetId !== null && !TABLE_PRESETS.some((preset) => preset.id === presetId))
    throw new Error('表格预设不存在')
  if (
    border &&
    (!['table', 'selection'].includes(border.scope) ||
      ![
        'all',
        'none',
        'outside',
        'inside',
        'insideH',
        'insideV',
        'top',
        'bottom',
        'left',
        'right',
      ].includes(border.mode) ||
      !/^[a-zA-Z]{1,64}$/.test(border.line.style))
  )
    throw new Error('请检查边框范围和线型')
  if (Object.values(draft.margins).some((v) => !Number.isFinite(v) || v < 0 || v > 31680))
    throw new Error('单元格边距须为0–1584磅')
  if (
    border &&
    (!Number.isFinite(border.line.szEighths) ||
      border.line.szEighths! < 2 ||
      border.line.szEighths! > 96 ||
      !/^(?:auto|[\da-f]{6})$/i.test(border.line.color ?? 'auto'))
  )
    throw new Error('请检查边框颜色和线宽')
  const original = tableDesignDraft(target)
  const positionChanged = JSON.stringify(draft.position) !== JSON.stringify(original.position)
  const p = draft.position
  if (positionChanged) {
    if (!positionContext || (!positionContext.sourceXml && target.node.attrs.docxIndex != null))
      throw new Error('无法确认原件表格定位，请重新打开文档')
    const issue = positionContext.sourceXml
      ? docxTablePositionIssue(positionContext.sourceXml)
      : null
    if (issue) throw new Error(issue)
    if (
      !['none', 'left', 'right'].includes(p.wrap) ||
      ![p.x, p.y].every((v) => Number.isSafeInteger(v) && Math.abs(v) <= 31680) ||
      Object.values(p.distance).some((v) => !Number.isSafeInteger(v) || v < 0 || v > 31680) ||
      (p.xSpec !== null && !['left', 'center', 'right', 'inside', 'outside'].includes(p.xSpec)) ||
      (p.ySpec !== null && !['top', 'center', 'bottom', 'inside', 'outside'].includes(p.ySpec))
    )
      throw new Error('请检查表格位置和距正文数值')
  }
  const preset = TABLE_PRESETS.find((item) => item.id === presetId)
  const attrs = { ...target.node.attrs }
  if (draft.styleId !== original.styleId || preset)
    attrs.tblStyleId = preset ? null : draft.styleId || null
  if (preset) attrs.mimirTablePreset = preset.id
  if (JSON.stringify(draft.look) !== JSON.stringify(original.look)) {
    attrs.tblLook = { ...draft.look }
    attrs.tblLookEdited = true
  }
  if (draft.align !== original.align) attrs.tblAlign = draft.align
  if (JSON.stringify(draft.margins) !== JSON.stringify(original.margins)) {
    attrs.cellMar = { ...target.node.attrs.cellMar, ...draft.margins }
    attrs.cellMarEdited = true
  }
  const map = TableMap.get(target.node)
  const cellPatches = new Map<number, Record<string, unknown>>()
  const patchCell = (pos: number, patch: Record<string, unknown>) =>
    cellPatches.set(pos, { ...cellPatches.get(pos), ...patch })
  if (draft.autoFit !== original.autoFit) {
    attrs.tblAutoFit = draft.autoFit
    attrs.tblAutoFitEdited = true
    attrs.tblFixedLayout = draft.autoFit === 'fixed'
    if (draft.autoFit === 'contents') {
      attrs.widthPx = null
      attrs.widthPct = null
      attrs.colWidthsPct = null
      for (const pos of new Set(map.map)) patchCell(pos, { colwidth: null })
    } else if (draft.autoFit === 'window') {
      attrs.widthPx = null
      attrs.widthPct = 100
    } else {
      const widths = target.node.firstChild
        ? Array.from({ length: map.width }, (_, i) => {
            const cell = target.node.nodeAt(map.map[i]!)
            const rect = map.findCell(map.map[i]!)
            const width = Number(cell?.attrs.colwidth?.[i - rect.left])
            if (width > 0) return width
            const measured = editor.view.nodeDOM(target.pos)
            const total =
              Number(attrs.widthPx) ||
              (measured instanceof HTMLElement ? measured.getBoundingClientRect().width : 0)
            if (!(total > 0)) throw new Error('表格宽度无法确定，请先设置列宽')
            return (total * (Number(target.node.attrs.colWidthsPct?.[i]) || 100 / map.width)) / 100
          })
        : []
      const total = widths.reduce((sum, value) => sum + value, 0)
      attrs.widthPx = total
      attrs.widthPct = null
      attrs.colWidthsPct = widths.map((v) => (v / total) * 100)
      for (const pos of new Set(map.map)) {
        const rect = map.findCell(pos)
        patchCell(pos, { colwidth: widths.slice(rect.left, rect.right) })
      }
    }
  }
  if (positionChanged || (draft.autoFit !== original.autoFit && p.wrap !== 'none')) {
    const fresh = original.position.wrap === 'none'
    if (p.wrap === 'none') {
      Object.assign(attrs, {
        tblFloat: null,
        tblFloatSource: null,
        tblFloatSuppressed: false,
        tblFloatXTwips: null,
        tblFloatYTwips: null,
        tblFloatXSpec: null,
        tblFloatYSpec: null,
        tblFloatHorzAnchor: null,
        tblFloatVertAnchor: null,
        tblFloatDistance: null,
        tblFloatWidthPx: null,
      })
    } else {
      let x = p.x
      const width =
        draft.autoFit === 'window'
          ? positionContext?.contentWidthPx
          : measuredTableWidth(editor, target)
      const newRightPreset = p.wrap === 'right' && original.position.wrap !== 'right' && !p.xEdited
      if (newRightPreset) {
        if (
          !(
            Number.isFinite(width) &&
            width! > 0 &&
            Number.isFinite(positionContext?.contentWidthPx)
          )
        )
          throw new Error('无法确定当前节或表格宽度，请先设置列宽')
        x = Math.max(0, Math.round((positionContext!.contentWidthPx - width!) * 15))
      }
      let minimumHeight = 0
      target.node.forEach((row) => {
        minimumHeight += Math.max(Number(row.attrs.heightTwips) || 0, 240)
      })
      const xSpec = p.wrap !== original.position.wrap && !p.xEdited ? p.wrap : p.xSpec
      // Native OOXML has no separate side flag: use the same inference as reopen.
      const side =
        xSpec === 'right' || xSpec === 'outside' || (!xSpec && x > 4680) ? 'right' : 'left'
      const horizontalAnchor = attrs.tblFloatHorzAnchor ?? (fresh ? 'margin' : null)
      const verticalAnchor = attrs.tblFloatVertAnchor ?? (fresh ? 'margin' : null)
      const distance = { ...target.node.attrs.tblFloatDistance }
      for (const edge of ['top', 'bottom', 'left', 'right'] as const)
        if (p.distance[edge] !== original.position.distance[edge]) distance[edge] = p.distance[edge]
      const span = (horizontalAnchor === 'page' ? 0 : x) + (width ?? 0) * 15 + (distance.right ?? 0)
      const noSideRoom =
        (verticalAnchor ?? 'text') === 'text' &&
        x <= (horizontalAnchor === 'page' ? 1440 : 720) &&
        Number.isFinite(positionContext?.contentWidthPx) &&
        span > positionContext!.contentWidthPx * 15 - 1440
      const suppressed = minimumHeight > 12960 || noSideRoom
      Object.assign(attrs, {
        tblFloatSuppressed: suppressed,
        tblFloat: suppressed ? null : side,
        tblFloatSource: side,
        tblFloatXTwips: x,
        tblFloatYTwips: p.y,
        tblFloatXSpec: xSpec,
        tblFloatYSpec: p.ySpec,
        tblFloatHorzAnchor: horizontalAnchor,
        tblFloatVertAnchor: verticalAnchor,
        tblFloatWidthPx: Number.isFinite(width) && width! > 0 ? width : attrs.tblFloatWidthPx,
      })
      // Do not materialize absent distances merely because another field was edited.
      attrs.tblFloatDistance = Object.keys(distance).length ? distance : null
    }
    attrs.tblFloatEdited = true
  }
  if (preset)
    target.node.forEach((row, rowOffset, ri) =>
      row.forEach((cell, cellOffset) => {
        if (cell.attrs.gridGap) return
        const line = { style: 'single', szEighths: 4, color: preset.border }
        patchCell(rowOffset + 1 + cellOffset, {
          fill: ri === 0 ? preset.header : ri % 2 ? preset.band1 : preset.band2,
          borders: { top: line, bottom: line, left: line, right: line },
        })
      }),
    )
  if (border) {
    const box =
      border.scope === 'table'
        ? { top: 0, left: 0, bottom: map.height, right: map.width }
        : target.selectionRect
    const positions = border.scope === 'table' ? [...new Set(map.map)] : target.selectedCells
    for (const pos of positions) {
      const cell = target.node.nodeAt(pos)!
      if (cell.attrs.gridGap) continue
      const rect = map.findCell(pos)
      const borders: CellBorders = {
        ...cell.attrs.borders,
        ...(cellPatches.get(pos)?.borders as CellBorders),
      }
      for (const side of ['top', 'bottom', 'left', 'right'] as const) {
        const outer =
          side === 'top'
            ? rect.top === box.top
            : side === 'bottom'
              ? rect.bottom === box.bottom
              : side === 'left'
                ? rect.left === box.left
                : rect.right === box.right
        const horizontal = side === 'top' || side === 'bottom'
        const chosen =
          border.mode === 'all' ||
          border.mode === 'none' ||
          (border.mode === 'outside' && outer) ||
          (border.mode === 'inside' && !outer) ||
          (border.mode === 'insideH' && horizontal && !outer) ||
          (border.mode === 'insideV' && !horizontal && !outer) ||
          (border.mode === side && outer)
        if (chosen) borders[side] = border.mode === 'none' ? { style: 'nil' } : { ...border.line }
      }
      patchCell(pos, { borders })
    }
  }
  let tr = closeHistory(editor.state.tr)
  for (const [pos, patch] of cellPatches) {
    const cell = target.node.nodeAt(pos)!
    tr = tr.setNodeMarkup(target.pos + 1 + pos, undefined, { ...cell.attrs, ...patch })
  }
  tr = tr.setNodeMarkup(target.pos, undefined, attrs)
  if (tr.doc.eq(editor.state.doc)) return target
  const expected = tr.doc
  editor.view.dispatch(tr)
  if (!editor.state.doc.eq(expected)) throw new Error('表格修改未获允许，请重新选择表格')
  editor.view.dispatch(closeHistory(editor.state.tr).setMeta('addToHistory', false))
  return { ...target, doc: editor.state.doc, node: editor.state.doc.nodeAt(target.pos)! }
}
