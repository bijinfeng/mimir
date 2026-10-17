import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { Editor } from '@tiptap/core'
import type { ParsedDoc, TableCondFormat } from '../../vendor/packages/docx-engine/src/types.js'
import { darkPageColor } from '../../vendor/apps/docs/src/renderer/editor/dark-page.js'
import { fillInk } from '../../vendor/apps/docs/src/renderer/editor/shading-ink.js'
import type { DocxSession, PmDocJson } from '../docx.js'
import { TABLE_LOOK } from './docx-table-design.js'
import { docxTableColumnBands, type TableColumnBands } from '../docx-table-bands.js'

interface TableJson {
  type: string
  attrs?: Record<string, unknown>
  content?: TableJson[]
  [key: string]: unknown
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export function docxTableConditionCss(
  doc: PmDocJson,
  session: DocxSession,
  styles: ParsedDoc['styles'],
  columnBands: ReadonlyMap<string, TableColumnBands> = new Map(),
) {
  const rules: string[] = []
  for (const [tableIndex, table] of (doc.content ?? []).entries()) {
    if (table.type !== 'docTable') continue
    const attrs = table.attrs as Record<string, unknown>
    const baseline = session.content.content?.find(
      (node) =>
        node.type === 'docTable' &&
        (node.attrs as Record<string, unknown>)?.docxIndex === attrs.docxIndex,
    ) as TableJson | undefined
    const styleId = String(attrs.tblStyleId ?? '')
    const style = styles.get(styleId)?.tableDisplay
    const vertical = columnBands.get(styleId)
    if (!style && !baseline?.attrs?.tblStyleId) continue
    const look = { ...TABLE_LOOK, ...(attrs.tblLook as object) }
    const rows = table.content as TableJson[] | undefined
    // PM omits continuation cells of vertical merges. Track their real grid slots.
    const occupiedUntil: number[] = []
    const positions = (rows ?? []).map((row, ri) => {
      let column = 0
      return (row.content ?? []).map((cell) => {
        while ((occupiedUntil[column] ?? 0) > ri) column++
        const left = column
        const span = Number(cell.attrs?.colspan ?? 1)
        for (let col = left; col < left + span; col++)
          occupiedUntil[col] = ri + Number(cell.attrs?.rowspan ?? 1)
        column += span
        return left
      })
    })
    const totalCols = occupiedUntil.length
    let headerRows = 0
    for (const row of rows ?? []) {
      if (!row.attrs?.repeatHeader) break
      headerRows++
    }
    headerRows = Math.max(1, headerRows)
    rows?.forEach((row, ri) => {
      row.content?.forEach((cell, ci) => {
        const column = positions[ri]![ci]!
        const span = Number(cell.attrs?.colspan ?? 1)
        const conds: (TableCondFormat | undefined)[] = [
          look.firstRow && ri < headerRows ? style?.firstRow : undefined,
          look.lastRow && ri === rows.length - 1 ? style?.lastRow : undefined,
          look.firstColumn && column === 0 ? style?.firstCol : undefined,
          look.lastColumn && column + span === totalCols ? style?.lastCol : undefined,
        ]
        const bandColumn = column - (look.firstColumn ? 1 : 0)
        const verticalFill =
          look.bandedColumns && bandColumn >= 0
            ? Math.floor(bandColumn / (vertical?.size ?? 1)) % 2
              ? vertical?.second
              : vertical?.first
            : undefined
        const source = baseline?.content?.[ri]?.content?.[ci]
        const raw = String(cell.attrs?.rawTcPr ?? '')
        const directFill =
          !!attrs.mimirTablePreset ||
          /<w:shd\b/.test(raw) ||
          !same(cell.attrs?.fill, source?.attrs?.fill)
        const bandRow = look.firstRow ? ri - headerRows : ri
        const band =
          look.bandedRows && bandRow >= 0
            ? Math.floor(bandRow / (style?.rowBandSize ?? 1)) % 2
              ? style?.band2Fill
              : style?.band1Fill
            : undefined
        const fill =
          (directFill ? (cell.attrs?.fill as string | null) : undefined) ??
          conds.find((v) => v?.fill)?.fill ??
          band ??
          verticalFill ??
          style?.fill
        const color = conds.find((v) => v?.color)?.color ?? style?.wholeTable?.color
        const bold = conds.find((v) => v?.bold !== undefined)?.bold ?? style?.wholeTable?.bold
        const italic =
          conds.find((v) => v?.italic !== undefined)?.italic ?? style?.wholeTable?.italic
        const size =
          conds.find((v) => v?.sizeHalfPoints)?.sizeHalfPoints ?? style?.wholeTable?.sizeHalfPoints
        const font = conds.find((v) => v?.fontAscii)?.fontAscii
        const spacing = conds.find((v) => v?.charSpacingTwips !== undefined)?.charSpacingTwips
        const caps = conds.find((v) => v?.caps)?.caps
        const safeFill = fill && /^[\da-f]{6}$/i.test(fill) ? fill : null
        const ink =
          color && /^[\da-f]{6}$/i.test(color)
            ? `#${color}`
            : safeFill && fillInk(safeFill) === 'light'
              ? '#FFFFFF'
              : 'var(--docs-paper-ink, #000000)'
        const selector = `.doc-page table.doc-table[data-mimir-table-top-index="${tableIndex}"] > tbody > tr:nth-child(${ri + 1}) > :is(td, th):nth-child(${ci + 1})`
        const declarations = [
          `background:${safeFill ? `#${safeFill}` : 'transparent'} !important`,
          `color:${ink} !important`,
          `font-weight:${bold ? 600 : 400} !important`,
          `font-style:${italic ? 'italic' : 'normal'} !important`,
          `font-size:${size ? `${size / 2}pt` : 'inherit'} !important`,
          `font-family:${font ? JSON.stringify(font) : 'inherit'} !important`,
          `letter-spacing:${spacing !== undefined ? `${spacing / 20}pt` : 'normal'} !important`,
          `text-transform:${caps === 'all' ? 'uppercase' : 'none'} !important`,
          `font-variant-caps:${caps === 'small' ? 'small-caps' : 'normal'} !important`,
        ]
        rules.push(`${selector} { ${declarations.join(';')} }`)
        rules.push(
          `@media screen { .page-dark ${selector} { background:${safeFill ? darkPageColor(safeFill) : 'transparent'} !important; color:${ink.startsWith('#') ? darkPageColor(ink) : ink} !important } }`,
        )
      })
    })
  }
  return rules.join('\n')
}
/** View-only CSS: native conditional display attrs never become direct document formatting. */
export function DocxTableDesignPreview({
  editor,
  session,
  styles,
  scope,
  onError,
}: {
  editor: Editor
  session: DocxSession
  styles: ParsedDoc['styles']
  scope: string
  onError: (message: string) => void
}) {
  const [bands, setBands] = useState<ReadonlyMap<string, TableColumnBands>>(new Map())
  useEffect(() => {
    let active = true
    docxTableColumnBands(session)
      .then((value) => {
        if (active) setBands(value)
      })
      .catch((cause) => {
        if (active) onError(`表格条件样式预览失败：${String(cause)}`)
      })
    return () => {
      active = false
    }
  }, [session, onError])
  const subscribe = useCallback(
    (notify: () => void) => {
      editor.on('transaction', notify)
      return () => {
        editor.off('transaction', notify)
      }
    },
    [editor],
  )
  const getSnapshot = useCallback(() => editor.state.doc, [editor])
  const doc = useSyncExternalStore(subscribe, getSnapshot)
  return (
    <style>{`@scope ([data-docx-style-scope="${scope}"]) { ${docxTableConditionCss(doc.toJSON() as PmDocJson, session, styles, bands)} }`}</style>
  )
}
