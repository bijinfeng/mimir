import { useState } from 'react'
import { parseRange } from '../../vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import { parseXlsxInput } from '../xlsx-input.js'
import type { XlsxSheet } from '../xlsx.js'
import {
  ToolbarPropertyForm,
  ToolbarButton,
  ToolbarMenu,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarTabs,
  ToolbarTextArea,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import './xlsx-tools.css'

function validRange(value: string): boolean {
  try {
    const b = parseRange(value)
    return (
      b.endRow < 1_048_576 &&
      b.endColumn < 16_384 &&
      (b.endRow - b.startRow + 1) * (b.endColumn - b.startColumn + 1) <= 2000
    )
  } catch {
    return false
  }
}
export function XlsxRangeControls({
  range,
  sheet,
  sheets,
  busy,
  group,
  onOperation,
}: {
  range: string
  sheet: XlsxSheet
  sheets: XlsxSheet[]
  busy: boolean
  group: 'data' | 'layout'
  onOperation: (op: Record<string, unknown>) => Promise<boolean>
}) {
  const [mode, setMode] = useState('write')
  const [axis, setAxis] = useState('row')
  const [content, setContent] = useState('')
  const [source, setSource] = useState(range)
  const [sourceSheetId, setSourceSheetId] = useState(sheet.id)
  const [target, setTarget] = useState('')
  const [filterColumn, setFilterColumn] = useState('')
  const [filterValues, setFilterValues] = useState('')
  const [rowHeight, setRowHeight] = useState<number | null>(null)
  const [colWidth, setColWidth] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const locked = !!sheet.extras?.protected
  const bounds = validRange(range) ? parseRange(range) : null
  const start = bounds ? range.split(':')[0]!.replaceAll('$', '') : ''
  const rows = bounds
    ? sheet.rows.filter((r) => r.number > bounds.startRow && r.number <= bounds.endRow + 1)
    : []
  const cols = bounds ? sheet.columns.slice(bounds.startColumn, bounds.endColumn + 1) : []
  const height = rowHeight ?? (rows[0] ? Math.round(rows[0].height * 0.75 * 100) / 100 : 15)
  const width = colWidth ?? Math.round(cols[0]?.width ?? 80)
  const values = content.split('\n').map((line) => line.split('\t').map(parseXlsxInput))
  const rectangular = values.every((row) => row.length === values[0]?.length)
  const batchIssue = !content
    ? '输入要写入的内容'
    : !rectangular
      ? '每行列数必须一致'
      : content.split(/\n|\t/).some((cell) => cell.startsWith("'="))
        ? '以等号开头的纯文字请使用单格编辑'
        : values.length > 500 ||
            (values[0]?.length ?? 0) > 100 ||
            values.length * (values[0]?.length ?? 0) > 2000
          ? '单次最多500行、100列、2000格'
          : !bounds
            ? '先输入有效范围'
            : bounds.startRow + values.length > 1_048_576 ||
                bounds.startColumn + (values[0]?.length ?? 0) > 16_384
              ? '内容超出工作表边界'
              : range.includes(':') &&
                  (values.length !== bounds.endRow - bounds.startRow + 1 ||
                    values[0]?.length !== bounds.endColumn - bounds.startColumn + 1)
                ? '内容行列数必须与范围一致'
                : undefined
  const copyValid = validRange(source) && validRange(target)
  const sourceArgs = { source, sourceSheetId, target }
  const apply = async (op: Record<string, unknown>, done?: () => void) => {
    setFeedback(null)
    if (await onOperation(op)) {
      done?.()
      setFeedback('已应用')
    } else setFeedback('未应用，请查看编辑器下方的错误说明')
  }
  const rowMode = axis === 'row'
  const axisIssue = !bounds
    ? '先输入有效范围'
    : rowMode && bounds.endRow - bounds.startRow + 1 > 500
      ? '单次最多500行'
      : !rowMode && bounds.endColumn - bounds.startColumn + 1 > 100
        ? '单次最多100列'
        : undefined
  const firstRow = (bounds?.startRow ?? 0) + 1
  const rowCount = (bounds?.endRow ?? 0) - (bounds?.startRow ?? 0) + 1
  const columnCount = (bounds?.endColumn ?? 0) - (bounds?.startColumn ?? 0) + 1
  const axisOp = (op: string, extra: Record<string, unknown>) => ({
    op,
    ...(rowMode
      ? { row: firstRow, count: rowCount }
      : { column: start.replace(/\d/g, ''), count: columnCount }),
    ...extra,
  })
  return (
    <ToolbarMenu
      label={group === 'data' ? '范围写入与复制' : '行列尺寸与显示'}
      text={group === 'data' ? '写入与复制' : '行高与列宽'}
      panelWidth={360}
      renderPanel={() => (
        <ToolbarPropertyForm columns={1}>
          <div className="mimir-xlsx-tools">
            <ToolbarMenuNote>
              当前范围：{range || '未选择'}
              {locked ? ' · 工作表已保护，请先取消保护' : ''}
            </ToolbarMenuNote>
            {group === 'data' ? (
              <ToolbarTabs
                label="范围内容工具"
                value={mode}
                onChange={(value) => {
                  setMode(value)
                  setFeedback(null)
                }}
                items={[
                  { value: 'write', label: '写入' },
                  { value: 'copy', label: '复制' },
                  { value: 'filter', label: '筛选复制' },
                  { value: 'values', label: '公式转值' },
                ]}
              />
            ) : (
              <ToolbarTabs
                label="行列设置"
                value={axis}
                onChange={(value) => {
                  setAxis(value)
                  setFeedback(null)
                }}
                items={[
                  { value: 'row', label: '行' },
                  { value: 'column', label: '列' },
                ]}
              />
            )}
            <fieldset disabled={busy || locked} aria-busy={busy}>
              {group === 'data' && mode === 'write' && (
                <ToolbarMenuFields label="批量写入">
                  <ToolbarTextArea
                    label="批量单元格内容（Tab分列，换行分行）"
                    value={content}
                    onChange={(value) => {
                      setContent(value)
                      setFeedback(null)
                    }}
                    rows={5}
                    placeholder="从表格粘贴内容"
                  />

                  <ToolbarMenuNote>
                    Tab 分列，换行分行。数字、TRUE/FALSE 与 =公式按类型写入。单格范围作为起点。
                  </ToolbarMenuNote>
                  <span role="status">{content ? '待应用' : ''}</span>
                  <ToolbarButton
                    label="写入范围内容"
                    disabled={!!batchIssue}
                    disabledReason={batchIssue}
                    onClick={() =>
                      void apply(
                        {
                          op: 'set_range',
                          ...(range.includes(':') ? { range } : { start }),
                          values,
                        },
                        () => setContent(''),
                      )
                    }
                  >
                    写入内容
                  </ToolbarButton>
                </ToolbarMenuFields>
              )}
              {group === 'data' && (mode === 'copy' || mode === 'filter') && (
                <ToolbarMenuFields label="复制与填充">
                  <ToolbarSelect
                    label="复制源工作表"
                    value={sourceSheetId}
                    options={sheets.map((s) => ({
                      value: s.id,
                      label: s.hidden ? `${s.name}（隐藏）` : s.name,
                    }))}
                    onChange={setSourceSheetId}
                  />

                  <div className="mimir-xlsx-tools__columns">
                    <ToolbarTextField
                      label="复制与填充源范围"
                      value={source}
                      onChange={(v) => setSource(v.toUpperCase())}
                      placeholder="A1:B5"
                    />

                    <ToolbarTextField
                      label="复制与填充目标范围"
                      value={target}
                      onChange={(v) => setTarget(v.toUpperCase())}
                      placeholder="D2 或 D2:E6"
                    />
                  </div>
                  {mode === 'copy' ? (
                    <>
                      <ToolbarMenuNote>
                        保留源格式与单元格类型，相对公式随位置调整。平铺填充的目标须容纳完整源区域。
                      </ToolbarMenuNote>
                      <div className="mimir-xlsx-tools__actions">
                        <ToolbarButton
                          label="复制范围并保留格式"
                          disabled={!copyValid}
                          disabledReason="输入有效源与目标范围（最多2000格）"
                          onClick={() => void apply({ op: 'copy_range', ...sourceArgs })}
                        >
                          复制一次
                        </ToolbarButton>
                        <ToolbarButton
                          label="平铺填充范围并保留格式"
                          disabled={!copyValid}
                          disabledReason="输入有效源与目标范围（最多2000格）"
                          onClick={() => void apply({ op: 'fill_range', ...sourceArgs })}
                        >
                          平铺填充
                        </ToolbarButton>
                      </div>
                    </>
                  ) : (
                    <>
                      <ToolbarTextField
                        label="筛选复制匹配列"
                        value={filterColumn}
                        onChange={(v) => setFilterColumn(v.toUpperCase())}
                        placeholder="源范围内列字母"
                      />

                      <ToolbarTextArea
                        label="筛选复制保留值（每行一个）"
                        value={filterValues}
                        onChange={setFilterValues}
                        rows={3}
                      />

                      <ToolbarMenuNote>
                        只复制匹配行。公式使用缓存值；建议先重新计算。
                      </ToolbarMenuNote>
                      <ToolbarButton
                        label="筛选复制为缓存值"
                        disabled={
                          !copyValid || !/^[A-Z]{1,3}$/.test(filterColumn) || !filterValues.trim()
                        }
                        disabledReason="填写源范围、目标起点、匹配列与保留值"
                        onClick={() =>
                          void apply({
                            op: 'copy_range',
                            ...sourceArgs,
                            filterColumn,
                            filterValues: filterValues.split('\n'),
                          })
                        }
                      >
                        复制匹配行
                      </ToolbarButton>
                    </>
                  )}
                </ToolbarMenuFields>
              )}
              {group === 'data' && mode === 'values' && (
                <ToolbarMenuFields label="公式转值">
                  <ToolbarMenuNote>
                    将当前范围中的公式替换为已有缓存结果，保留格式。建议先在“公式”中重新计算；缺少缓存时无法应用。
                  </ToolbarMenuNote>
                  <ToolbarButton
                    label="公式转为缓存值"
                    disabled={!bounds}
                    disabledReason="先输入有效范围"
                    onClick={() => void apply({ op: 'convert_to_values', range })}
                  >
                    公式转为缓存值
                  </ToolbarButton>
                </ToolbarMenuFields>
              )}
              {group === 'layout' && (
                <ToolbarMenuFields label={rowMode ? '行高与显隐' : '列宽与显隐'}>
                  <ToolbarMenuNote>
                    当前首{rowMode ? '行' : '列'}：{rowMode ? `${height} 磅` : `${width} 像素`}
                    ；范围内已隐藏{' '}
                    {rowMode
                      ? rows.filter((r) => r.hidden).length
                      : cols.filter((c) => c.hidden).length}{' '}
                    {rowMode ? '行' : '列'}。
                  </ToolbarMenuNote>

                  <ToolbarNumberField
                    label={rowMode ? '行高（磅）' : '列宽（像素）'}
                    value={rowMode ? height : width}
                    min={rowMode ? 2 : 20}
                    max={rowMode ? 409 : 2000}
                    onCommit={rowMode ? setRowHeight : setColWidth}
                  />

                  <span role="status">
                    {(rowMode ? rowHeight : colWidth) !== null ? '待应用' : ''}
                  </span>
                  <ToolbarButton
                    label={rowMode ? '应用范围行高' : '应用范围列宽'}
                    disabled={!!axisIssue}
                    disabledReason={axisIssue}
                    onClick={() =>
                      void apply(
                        axisOp(
                          rowMode ? 'set_row_height' : 'set_col_width',
                          rowMode ? { heightPoints: height } : { widthPx: width },
                        ),
                        () => (rowMode ? setRowHeight(null) : setColWidth(null)),
                      )
                    }
                  >
                    {rowMode ? '设置行高' : '设置列宽'}
                  </ToolbarButton>
                  <div className="mimir-xlsx-tools__actions">
                    {[true, false].map((hidden) => (
                      <ToolbarButton
                        key={String(hidden)}
                        label={`${hidden ? '隐藏' : '显示'}范围${rowMode ? '行' : '列'}`}
                        disabled={!!axisIssue}
                        disabledReason={axisIssue}
                        onClick={() =>
                          void apply(
                            axisOp(rowMode ? 'set_rows_hidden' : 'set_cols_hidden', { hidden }),
                          )
                        }
                      >
                        {hidden ? '隐藏' : '显示'}
                        {rowMode ? '行' : '列'}
                      </ToolbarButton>
                    ))}
                  </div>
                </ToolbarMenuFields>
              )}
            </fieldset>
            <div role="status" className="mimir-xlsx-tools__feedback">
              {busy ? '正在应用…' : feedback}
            </div>
          </div>
        </ToolbarPropertyForm>
      )}
    />
  )
}
