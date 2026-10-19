import { useRef, useState } from 'react'
import type { TableElement } from '../../vendor/packages/pptx-engine/src/types.js'
import type { EditParagraph, EditRun } from '../../vendor/packages/pptx-ops/src/types.js'
import { TABLE_STYLE_PRESETS } from '../../vendor/packages/pptx-engine/src/table-edit.js'
import {
  ToolbarButton,
  ToolbarColorPicker,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTabs,
  ToolbarTextArea,
  type ToolbarColorOption,
} from '../shell/EditorShell.js'

const TABLE_FLAGS = [
  ['firstRow', '标题行'],
  ['lastRow', '汇总行'],
  ['firstCol', '首列'],
  ['lastCol', '末列'],
  ['bandRow', '交替行'],
  ['bandCol', '交替列'],
] as const
const TABLE_PRESETS = [
  {
    key: 'none',
    label: '无样式',
    header: 'var(--me-surface)',
    band: 'var(--me-surface)',
    border: 'transparent',
  },
  {
    key: 'lightGrid',
    label: '浅色网格',
    header: 'var(--me-surface)',
    band: 'var(--me-surface)',
    border: '#BFBFBF',
  },
  {
    key: 'zebraBlue',
    label: '蓝色交替行',
    header: '#4472C4',
    band: '#D6E4F0',
    border: 'transparent',
  },
  {
    key: 'zebraGray',
    label: '灰色交替行',
    header: '#595959',
    band: '#EDEDED',
    border: 'transparent',
  },
  {
    key: 'headerDarkBlue',
    label: '深蓝标题行',
    header: '#1F3864',
    band: '#FFFFFF',
    border: 'transparent',
  },
  {
    key: 'headerOrange',
    label: '橙色标题行',
    header: '#ED7D31',
    band: '#FFFFFF',
    border: 'transparent',
  },
  {
    key: 'noBorder',
    label: '简洁无边框',
    header: 'var(--me-surface)',
    band: '#F2F2F2',
    border: 'transparent',
  },
  {
    key: 'fullBorder',
    label: '完整边框',
    header: 'var(--me-surface)',
    band: 'var(--me-surface)',
    border: '#000000',
  },
] as const
function currentTablePreset(table: TableElement): string {
  const custom = TABLE_PRESETS.find(
    (preset) => TABLE_STYLE_PRESETS[preset.key]?.styleId === table.styleId && table.styleId,
  )
  if (custom) return custom.key
  if (table.styleId !== '{2D5ABB26-0587-4C30-8999-92F81FD0307C}') return ''
  const border = table.rows[0]?.[0]?.borders?.l
  return (border?.fill.type === 'solid' ? border.fill.color : undefined) === '#BFBFBF'
    ? 'lightGrid'
    : (border?.fill.type === 'solid' ? border.fill.color : undefined) === '#000000'
      ? 'fullBorder'
      : 'none'
}

/** Keep all unaffected table paragraphs and runs when changing one cell paragraph. */
export function PptxTableControls({
  table,
  version,
  target,
  apply,
  editParagraphRuns,
  colors,
}: {
  editParagraphRuns: (runs: readonly string[], next: string) => { texts: string[] } | null
  colors: readonly ToolbarColorOption[]
  table: TableElement
  version: number
  target: { slide: number; el: string }
  apply: (op: Record<string, unknown>) => Promise<boolean>
}) {
  const [section, setSection] = useState<'content' | 'layout' | 'style'>('content')
  const [stylePatch, setStylePatch] = useState<Record<string, unknown>>({})
  const [scope, setScope] = useState('cell')
  const [row, setRow] = useState('0')
  const [col, setCol] = useState('0')
  const [paragraphIndex, setParagraphIndex] = useState('0')
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [draftVersion, setDraftVersion] = useState(version)
  const draftRevision = useRef(0)
  // Keep navigation stable, but never apply a draft prepared against an older canvas.
  // Revisions advance through undo/redo too, so returning to old content cannot revive it.
  if (draftVersion !== version) {
    setDraftVersion(version)
    setDraft(null)
    setStylePatch({})
  }
  const rowIndex = Math.min(Number(row), table.rows.length - 1)
  const colIndex = Math.min(Number(col), (table.rows[rowIndex]?.length ?? 1) - 1)
  const cell = table.rows[rowIndex]?.[colIndex]
  const paragraphs = cell?.text?.paragraphs ?? []
  const selectedIndex = Math.min(Number(paragraphIndex), Math.max(0, paragraphs.length - 1))
  const currentText = paragraphs[selectedIndex]?.runs.map((run) => run.text).join('') ?? ''
  const nextText = draft ?? currentText
  const unavailable = cell?.merged ? '合并区域的占位格不能直接编辑，请选择左上角单元格' : undefined

  const submit = async () => {
    if (!cell || unavailable || busy || nextText === currentText) return
    const edited: EditParagraph[] = paragraphs.length
      ? paragraphs.map((paragraph, index) => {
          const runs: EditRun[] = paragraph.runs.map((run, runIndex) => ({
            text: run.text,
            srcRun: runIndex,
          }))
          if (index !== selectedIndex) return { runs, srcPara: index }
          const narrowed = editParagraphRuns(
            runs.map((run) => run.text),
            nextText,
          )
          return {
            runs: narrowed
              ? narrowed.texts.map((text, runIndex) => ({ text, srcRun: runIndex }))
              : [{ text: nextText }],
            srcPara: index,
          }
        })
      : [{ runs: [{ text: nextText }] }]
    const submittedRevision = draftRevision.current
    setBusy(true)
    try {
      const applied = await apply({
        op: 'setTableCell',
        target,
        row: rowIndex,
        col: colIndex,
        paragraphs: edited,
      })
      if (applied && draftRevision.current === submittedRevision) setDraft(null)
    } finally {
      setBusy(false)
    }
  }

  const applyTable = async (op: Record<string, unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await apply({ ...op, target })
    } finally {
      setBusy(false)
    }
  }
  const hasMerges = table.rows.some((cells) =>
    cells.some((item) => item.merged || (item.gridSpan ?? 1) > 1 || (item.rowSpan ?? 1) > 1),
  )
  const scopeCells = scope === 'cell' ? [cell] : table.rows.flat().filter((item) => !item.merged)
  const borderValues = scopeCells.flatMap((item) =>
    (['l', 'r', 't', 'b'] as const).map((edge) => item?.borders?.[edge]),
  )
  const borderKeys = borderValues.map((stroke) =>
    stroke?.fill.type === 'solid' && stroke.width > 0
      ? `${stroke.fill.color}:${stroke.width}`
      : 'none',
  )
  const borderMixed = new Set(borderKeys).size > 1
  const fillKeys = scopeCells.map((item) => JSON.stringify(item?.fill ?? { type: 'none' }))
  const fillMixed = new Set(fillKeys).size > 1
  const currentBorder = borderValues.find((stroke) => stroke?.width && stroke.fill.type === 'solid')
  const color =
    typeof stylePatch.borderColor === 'string'
      ? stylePatch.borderColor
      : currentBorder?.fill.type === 'solid'
        ? currentBorder.fill.color
        : '#000000'
  const width =
    typeof stylePatch.borderWidthPt === 'number'
      ? stylePatch.borderWidthPt
      : Math.max(0.25, (currentBorder?.width ?? 12700) / 12700)
  const shading =
    typeof stylePatch.shadingColor === 'string'
      ? stylePatch.shadingColor
      : !fillMixed && scopeCells[0]?.fill?.type === 'solid'
        ? scopeCells[0].fill.color
        : null
  const preset =
    typeof stylePatch.styleName === 'string' ? stylePatch.styleName : currentTablePreset(table)
  const updateStyle = (patch: Record<string, unknown>) =>
    setStylePatch((current) => ({ ...current, ...patch }))
  const cellStyleUnavailable = scope === 'cell' && Boolean(unavailable)
  const styleUnavailable =
    cellStyleUnavailable &&
    !stylePatch.styleName &&
    (stylePatch.shadingColor !== undefined || stylePatch.borderPreset !== undefined)
  const colorOptions = (current: string | null) =>
    current && !colors.some((item) => item.value === current)
      ? [{ value: current, label: `当前颜色 ${current}`, swatch: current }, ...colors]
      : colors
  const submitStyle = async () => {
    if (busy || !Object.keys(stylePatch).length) return
    setBusy(true)
    try {
      if (
        await apply({
          op: 'setTableStyle',
          target,
          ...stylePatch,
          ...(scope === 'cell' && !stylePatch.styleName
            ? { cells: [{ row: rowIndex, col: colIndex }] }
            : {}),
        })
      )
        setStylePatch((current) => (current === stylePatch ? {} : current))
    } finally {
      setBusy(false)
    }
  }
  return (
    <fieldset disabled={busy} aria-busy={busy} className="mimir-pptx-table-editor">
      <div
        className="mimir-pptx-table-tabs"
        onKeyDown={(event) => {
          const tabs = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
          )
          const index = tabs.indexOf(event.target as HTMLButtonElement)
          if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? tabs.length - 1
                : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
          tabs[next]?.click()
          tabs[next]?.focus()
        }}
      >
        <ToolbarTabs
          label="表格编辑分类"
          value={section}
          items={[
            { value: 'content', label: '内容' },
            { value: 'layout', label: '布局' },
            { value: 'style', label: '样式' },
          ]}
          onChange={setSection}
        />
      </div>
      <div
        className="mimir-pptx-table-editor__content"
        role="tabpanel"
        aria-label={{ content: '表格内容', layout: '表格布局', style: '表格样式' }[section]}
      >
        <ToolbarPropertyForm columns={1}>
          <ToolbarMenuFields label="当前单元格">
            <div className="mimir-pptx-table-cell-selector">
              <ToolbarSelect
                label="行"
                disabled={busy}
                value={String(rowIndex)}
                options={table.rows.map((_, index) => ({
                  value: String(index),
                  label: `第 ${index + 1} 行`,
                }))}
                onChange={(value) => {
                  draftRevision.current += 1
                  setRow(value)
                  setCol('0')
                  setParagraphIndex('0')
                  setDraft(null)
                  setStylePatch({})
                }}
              />
              <ToolbarSelect
                label="列"
                disabled={busy}
                value={String(colIndex)}
                options={(table.rows[rowIndex] ?? []).map((_, index) => ({
                  value: String(index),
                  label: `第 ${index + 1} 列`,
                }))}
                onChange={(value) => {
                  draftRevision.current += 1
                  setCol(value)
                  setParagraphIndex('0')
                  setDraft(null)
                  setStylePatch({})
                }}
              />
            </div>
          </ToolbarMenuFields>
          {section === 'content' && (
            <ToolbarMenuFields label="单元格文字">
              {paragraphs.length > 1 && (
                <ToolbarSelect
                  label="段落"
                  disabled={busy}
                  value={String(selectedIndex)}
                  options={paragraphs.map((_, index) => ({
                    value: String(index),
                    label: `第 ${index + 1} 段`,
                  }))}
                  onChange={(value) => {
                    draftRevision.current += 1
                    setParagraphIndex(value)
                    setDraft(null)
                    setStylePatch({})
                  }}
                />
              )}
              <ToolbarTextArea
                label="单元格文字"
                value={nextText}
                rows={2}
                onChange={(value) => {
                  draftRevision.current += 1
                  setDraft(value)
                }}
              />
            </ToolbarMenuFields>
          )}
          {section === 'layout' && (
            <ToolbarMenuFields label="尺寸与对齐">
              <ToolbarSelect
                label="单元格垂直对齐"
                value={cell?.text?.anchor ?? 'top'}
                options={[
                  { value: 'top', label: '顶端' },
                  { value: 'middle', label: '居中' },
                  { value: 'bottom', label: '底端' },
                ]}
                disabled={busy || Boolean(unavailable)}
                onChange={(anchor) =>
                  void applyTable({
                    op: 'setTableCellAnchor',
                    row: rowIndex,
                    col: colIndex,
                    anchor,
                  })
                }
              />
              <ToolbarNumberField
                key={`height:${version}:${rowIndex}`}
                label="当前行高（pt）"
                value={(table.rowHeights[rowIndex] ?? 12700) / 12700}
                min={1}
                max={2000}
                step={1}
                disabled={busy}
                onCommit={(value) =>
                  void applyTable({
                    op: 'setTableRowHeight',
                    row: rowIndex,
                    hEmu: Math.round(value * 12700),
                  })
                }
              />
              <ToolbarNumberField
                key={`width:${version}:${colIndex}`}
                label="当前列宽（pt）"
                value={(table.colWidths[colIndex] ?? 12700) / 12700}
                min={1}
                max={2000}
                step={1}
                disabled={busy}
                onCommit={(value) =>
                  void applyTable({
                    op: 'setTableColWidth',
                    col: colIndex,
                    wEmu: Math.round(value * 12700),
                  })
                }
              />
              <ToolbarMenuNote>
                {hasMerges
                  ? '含合并单元格的表格须先拆分，才能插入或删除行列'
                  : '行列操作作用于当前所选行或列'}
              </ToolbarMenuNote>
              {(['insert-row', 'insert-col', 'delete-row', 'delete-col'] as const).map((kind) => (
                <ToolbarButton
                  key={kind}
                  label={
                    {
                      'insert-row': '在当前行后插入行',
                      'insert-col': '在当前列后插入列',
                      'delete-row': '删除当前行',
                      'delete-col': '删除当前列',
                    }[kind]
                  }
                  disabled={
                    busy ||
                    hasMerges ||
                    (kind === 'delete-row' && table.rows.length <= 1) ||
                    (kind === 'delete-col' && table.colWidths.length <= 1)
                  }
                  disabledReason={hasMerges ? '请先拆分合并单元格' : '至少保留一行和一列'}
                  onClick={() =>
                    void applyTable({
                      op: 'tableStructure',
                      kind,
                      index: kind.endsWith('row') ? rowIndex : colIndex,
                    })
                  }
                >
                  {
                    {
                      'insert-row': '插入行',
                      'insert-col': '插入列',
                      'delete-row': '删除行',
                      'delete-col': '删除列',
                    }[kind]
                  }
                </ToolbarButton>
              ))}
              {(['merge-right', 'merge-down', 'split'] as const).map((kind) => (
                <ToolbarButton
                  key={kind}
                  label={
                    {
                      'merge-right': '向右合并单元格',
                      'merge-down': '向下合并单元格',
                      split: '拆分单元格',
                    }[kind]
                  }
                  disabled={
                    busy ||
                    Boolean(unavailable) ||
                    (kind === 'merge-right' && colIndex === table.colWidths.length - 1) ||
                    (kind === 'merge-down' && rowIndex === table.rows.length - 1)
                  }
                  onClick={() =>
                    void applyTable({ op: 'tableMerge', kind, row: rowIndex, col: colIndex })
                  }
                >
                  {{ 'merge-right': '向右合并', 'merge-down': '向下合并', split: '拆分' }[kind]}
                </ToolbarButton>
              ))}
            </ToolbarMenuFields>
          )}
          {section === 'style' && (
            <>
              <ToolbarMenuFields label="表格设计">
                <div className="mimir-pptx-table-gallery" role="group" aria-label="表格样式预设">
                  {TABLE_PRESETS.map((item) => (
                    <ToolbarButton
                      key={item.key}
                      label={`表格样式：${item.label}`}
                      active={preset === item.key}
                      disabled={busy}
                      onClick={() => setStylePatch({ styleName: item.key })}
                    >
                      <span className="mimir-pptx-table-swatch" aria-hidden="true">
                        {Array.from({ length: 9 }, (_, index) => (
                          <span
                            key={index}
                            style={{
                              background:
                                index < 3
                                  ? item.header
                                  : Math.floor(index / 3) % 2
                                    ? item.band
                                    : 'var(--me-surface)',
                              borderColor: item.border,
                            }}
                          />
                        ))}
                      </span>
                      <span>{item.label}</span>
                    </ToolbarButton>
                  ))}
                </div>
                <ToolbarMenuNote>
                  {preset
                    ? `${stylePatch.styleName ? '待应用样式' : '当前样式'}：${TABLE_PRESETS.find((item) => item.key === preset)?.label}`
                    : '当前样式：文档原有样式'}
                  ；应用预设会重置直接底纹和边框。
                </ToolbarMenuNote>
              </ToolbarMenuFields>
              {Boolean(stylePatch.styleName) && (
                <ToolbarButton label="取消预设选择" onClick={() => setStylePatch({})}>
                  取消预设选择
                </ToolbarButton>
              )}
              {!stylePatch.styleName && (
                <>
                  <ToolbarMenuFields label="表格选项">
                    <ToolbarSelect
                      label="表格方向"
                      disabled={busy}
                      value={String(stylePatch.rtl ?? table.rtl ?? false)}
                      options={[
                        { value: 'false', label: '从左到右' },
                        { value: 'true', label: '从右到左' },
                      ]}
                      onChange={(value) => updateStyle({ rtl: value === 'true' })}
                    />
                    <div className="mimir-pptx-table-flags">
                      {TABLE_FLAGS.map(([flag, label]) => (
                        <ToolbarButton
                          key={flag}
                          label={`表格${label}`}
                          active={Boolean(stylePatch[flag] ?? table.styleFlags?.[flag])}
                          onClick={() =>
                            updateStyle({ [flag]: !(stylePatch[flag] ?? table.styleFlags?.[flag]) })
                          }
                        >
                          {label}
                        </ToolbarButton>
                      ))}
                    </div>
                  </ToolbarMenuFields>
                  <ToolbarMenuFields label="底纹与边框">
                    <ToolbarSelect
                      label="样式应用范围"
                      disabled={busy}
                      value={scope}
                      options={[
                        {
                          value: 'cell',
                          label: `当前单元格（${rowIndex + 1} 行 ${colIndex + 1} 列）`,
                        },
                        { value: 'table', label: '整个表格' },
                      ]}
                      onChange={(value) => {
                        setScope(value)
                        setStylePatch({})
                      }}
                    />
                    {(fillMixed || borderMixed) && (
                      <ToolbarMenuNote>
                        当前范围含{fillMixed ? '多种底纹' : ''}
                        {fillMixed && borderMixed ? '和' : ''}
                        {borderMixed ? '多种边框' : ''}；应用更改会统一所选范围。
                      </ToolbarMenuNote>
                    )}
                    <ToolbarColorPicker
                      label="表格底纹"
                      value={shading === 'none' ? null : shading}
                      options={colorOptions(shading)}
                      disabled={cellStyleUnavailable}
                      onPick={(shadingColor) => updateStyle({ shadingColor })}
                      onClear={() => updateStyle({ shadingColor: 'none' })}
                      clearLabel="无底纹"
                    />
                    <ToolbarSelect
                      label="表格边框"
                      disabled={busy || cellStyleUnavailable}
                      value={String(
                        stylePatch.borderPreset ??
                          (borderMixed ? 'mixed' : currentBorder?.width ? 'all' : 'none'),
                      )}
                      options={[
                        ...(borderMixed ? [{ value: 'mixed', label: '混合边框' }] : []),
                        { value: 'all', label: '所有边框' },
                        { value: 'none', label: '无边框' },
                      ]}
                      onChange={(borderPreset) =>
                        updateStyle({ borderPreset, borderColor: color, borderWidthPt: width })
                      }
                    />
                    <ToolbarColorPicker
                      label="表格边框颜色"
                      disabled={cellStyleUnavailable}
                      value={color}
                      options={colorOptions(color)}
                      onPick={(borderColor) =>
                        updateStyle({ borderColor, borderPreset: 'all', borderWidthPt: width })
                      }
                    />
                    <ToolbarNumberField
                      key={`${version}:${rowIndex}:${colIndex}:${scope}:${currentBorder?.width ?? 0}`}
                      label="边框宽度（pt）"
                      disabled={cellStyleUnavailable}
                      value={width}
                      min={0.25}
                      max={1584}
                      step={0.25}
                      onCommit={(borderWidthPt) =>
                        updateStyle({ borderWidthPt, borderColor: color, borderPreset: 'all' })
                      }
                    />
                  </ToolbarMenuFields>
                </>
              )}
            </>
          )}
        </ToolbarPropertyForm>
        {unavailable && <ToolbarMenuNote>{unavailable}</ToolbarMenuNote>}
      </div>
      <div className="mimir-pptx-table-editor__actions">
        {section === 'content' ? (
          <ToolbarButton
            primary
            label="应用单元格文字"
            disabled={Boolean(unavailable) || busy || nextText === currentText}
            disabledReason={unavailable ?? (busy ? '正在修改表格' : '文字没有变化')}
            onClick={() => void submit()}
          />
        ) : section === 'style' ? (
          <ToolbarButton
            primary
            label="应用表格样式"
            disabled={busy || !Object.keys(stylePatch).length || styleUnavailable}
            disabledReason={unavailable ?? '样式没有变化'}
            onClick={() => void submitStyle()}
          />
        ) : (
          <ToolbarMenuNote>布局更改即时应用</ToolbarMenuNote>
        )}
      </div>
    </fieldset>
  )
}
