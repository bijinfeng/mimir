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
} from '../../vendor/packages/docx-engine/src/types.js'

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
): TableDesignTarget {
  if (
    editor.isDestroyed ||
    editor.state.doc !== target.doc ||
    editor.state.doc.nodeAt(target.pos) !== target.node
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
  editor.view.dispatch(tr)
  editor.view.dispatch(closeHistory(editor.state.tr).setMeta('addToHistory', false))
  return { ...target, doc: editor.state.doc, node: editor.state.doc.nodeAt(target.pos)! }
}
