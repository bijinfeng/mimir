import type { XlsxPivotLayoutEligibility } from '../xlsx-pivot-editability.js'
import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { XlsxSheet } from '../xlsx.js'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarSelect,
  ToolbarTabs,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import {
  createXlsxPivotDraft,
  PIVOT_AGGREGATES,
  xlsxPivotOperation,
  xlsxPivotReadback,
  xlsxPivotSource,
  xlsxPivotValue,
  type XlsxPivotDraft,
  type XlsxPivotOperation,
  type XlsxPivotFilterDraft,
  type XlsxPivotGroupingDraft,
} from './xlsx-pivot-controls.js'
import './xlsx-pivot-controls.css'

export interface XlsxPivotControlsProps {
  readLayoutEligibility?: (path: string, signal: AbortSignal) => Promise<XlsxPivotLayoutEligibility>
  sheet: XlsxSheet
  sheets?: readonly XlsxSheet[]
  acceptedSignal?: AbortSignal
  range: string
  sourceKey: unknown
  contextKey: string
  busy: boolean
  onOperation: (op: XlsxPivotOperation, options: { signal: AbortSignal }) => Promise<boolean>
}
const GROUP_MODES = [
  { value: 'year', label: '按年' },
  { value: 'quarter', label: '按季度' },
  { value: 'month', label: '按月份' },
  { value: 'range', label: '数值区间' },
] as const
const FILTER_MODES = [
  { value: 'equal', label: '标签等于' },
  { value: 'contains', label: '标签包含' },
  { value: 'beginsWith', label: '标签开头为' },
  { value: 'top', label: '数值前几项' },
  { value: 'greaterThan', label: '数值大于' },
  { value: 'between', label: '数值介于' },
] as const
const LABEL_FILTERS = new Set(['equal', 'contains', 'beginsWith'])
const SHOW_AS = [
  { value: '', label: '原始汇总值' },
  { value: 'percentOfTotal', label: '占总计百分比' },
  { value: 'percentOfRow', label: '占行汇总百分比' },
  { value: 'percentOfCol', label: '占列汇总百分比' },
] as const
const asOptions = (fields: readonly string[]) =>
  fields.map((field) => ({ value: field, label: field }))
function AxisFields({
  label,
  values,
  fields,
  disabled,
  minimum = 0,
  limit = 8,
  onChange,
}: {
  label: string
  values: string[]
  fields: string[]
  disabled: boolean
  minimum?: number
  limit?: number
  onChange: (values: string[]) => void
}) {
  const move = (index: number, delta: number) => {
    const next = [...values],
      target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    onChange(next)
  }
  return (
    <ToolbarMenuFields label={label}>
      {values.map((field, index) => (
        <div className="mimir-xlsx-pivot__axis" key={field}>
          <ToolbarSelect
            label={`${label} ${index + 1}`}
            value={field}
            disabled={disabled}
            options={fields.map((value) => ({
              value,
              label: value,
              disabled: value !== field && values.includes(value),
            }))}
            onChange={(value) => onChange(values.map((item, i) => (i === index ? value : item)))}
          />
          <div className="mimir-xlsx-pivot__row-actions">
            <ToolbarButton
              label={`上移${label} ${index + 1}`}
              disabled={disabled || !index}
              onClick={() => move(index, -1)}
            >
              <ArrowUp size={13} />
            </ToolbarButton>
            <ToolbarButton
              label={`下移${label} ${index + 1}`}
              disabled={disabled || index === values.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown size={13} />
            </ToolbarButton>
            <ToolbarButton
              label={`移除${label} ${index + 1}`}
              disabled={disabled || values.length <= minimum}
              onClick={() => onChange(values.filter((_, i) => i !== index))}
            >
              <Trash2 size={13} />
            </ToolbarButton>
          </div>
        </div>
      ))}
      <ToolbarButton
        label={`添加${label}`}
        disabled={
          disabled || values.length >= limit || !fields.some((field) => !values.includes(field))
        }
        onClick={() => onChange([...values, fields.find((field) => !values.includes(field))!])}
      >
        <Plus size={13} />
        <span>添加字段</span>
      </ToolbarButton>
    </ToolbarMenuFields>
  )
}
export function XlsxPivotControls({
  sheet,
  sheets: availableSheets,
  acceptedSignal,
  readLayoutEligibility,
  range,
  sourceKey,
  contextKey,
  busy,
  onOperation,
}: XlsxPivotControlsProps) {
  const sheets = availableSheets ?? [sheet]
  const [editing, setEditing] = useState(false)
  const [eligibilityState, setEligibilityState] = useState<{
    sourceKey: unknown
    contextKey: string
    path: string
    reader: XlsxPivotControlsProps['readLayoutEligibility']
    result: XlsxPivotLayoutEligibility
  } | null>(null)
  const editorRoot = useRef<HTMLFieldSetElement>(null)
  const [sourceSheetId, setSourceSheetId] = useState(sheet.id)
  const [draft, setDraft] = useState(() => createXlsxPivotDraft(sheet, range))
  const [shownSource, setShownSource] = useState({ sourceKey, contextKey })
  const [tab, setTab] = useState('fields'),
    [selectedPivot, setSelectedPivot] = useState('')
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('')
  const [submittedSignal, setSubmittedSignal] = useState<AbortSignal | null>(null)
  const sequence = useRef(0),
    controller = useRef<AbortController | null>(null),
    effectSource = useRef({ sourceKey, contextKey })
  if (shownSource.sourceKey !== sourceKey || shownSource.contextKey !== contextKey) {
    setShownSource({ sourceKey, contextKey })
    if (
      shownSource.contextKey !== contextKey ||
      !acceptedSignal ||
      acceptedSignal !== submittedSignal ||
      acceptedSignal.aborted
    ) {
      setEditing(false)
      setSubmittedSignal(null)
      setSourceSheetId(sheet.id)
      setDraft(createXlsxPivotDraft(sheet, range))
      setPending(false)
      setMessage('')
      setError('')
    }
    if (shownSource.contextKey !== contextKey) setSelectedPivot('')
  }
  useLayoutEffect(() => {
    if (
      effectSource.current.sourceKey === sourceKey &&
      effectSource.current.contextKey === contextKey
    )
      return
    const sameContext = effectSource.current.contextKey === contextKey
    effectSource.current = { sourceKey, contextKey }
    if (
      sameContext &&
      acceptedSignal &&
      acceptedSignal === submittedSignal &&
      !acceptedSignal.aborted
    )
      return
    controller.current?.abort()
    controller.current = null
  }, [sourceKey, contextKey, acceptedSignal, submittedSignal])
  useLayoutEffect(() => () => controller.current?.abort(), [])
  const sourceSheet = sheets.find((item) => item.id === sourceSheetId)
  const locked = busy || pending
  const pivot = sheet.pivots?.find((item) => item.path === selectedPivot)
  const eligibility =
    eligibilityState !== null &&
    eligibilityState.sourceKey === sourceKey &&
    eligibilityState.contextKey === contextKey &&
    eligibilityState.path === selectedPivot &&
    eligibilityState.reader === readLayoutEligibility
      ? eligibilityState.result
      : null
  const readback = pivot ? xlsxPivotReadback(pivot) : null
  useLayoutEffect(() => {
    if (!selectedPivot || !readLayoutEligibility) return
    const request = new AbortController()
    void readLayoutEligibility(selectedPivot, request.signal)
      .then((result) => {
        if (!request.signal.aborted)
          setEligibilityState({
            sourceKey,
            contextKey,
            path: selectedPivot,
            reader: readLayoutEligibility,
            result,
          })
      })
      .catch((cause) => {
        if (!request.signal.aborted)
          setEligibilityState({
            sourceKey,
            contextKey,
            path: selectedPivot,
            reader: readLayoutEligibility,
            result: {
              eligible: false,
              reasons: [cause instanceof Error ? cause.message : '无法确认原件编辑资格'],
            },
          })
      })
    return () => request.abort()
  }, [sourceKey, contextKey, selectedPivot, readLayoutEligibility])
  const cancelEditing = () => {
    controller.current?.abort()
    controller.current = null
    setPending(false)
    setEditing(false)
    setError('')
    setMessage('')
    requestAnimationFrame(() => {
      const root = editorRoot.current
      if (
        document.activeElement === document.body ||
        (document.activeElement && root?.contains(document.activeElement))
      )
        root?.querySelector<HTMLButtonElement>('button[aria-label="编辑布局"]')?.focus()
    })
  }
  const editSource =
    editing && eligibility
      ? sheets.find((item) => item.id === eligibility.sourceSheetId)
      : sourceSheet

  let fields: string[] = [],
    issue = '',
    preview: ReturnType<typeof xlsxPivotOperation> | undefined
  try {
    if (!editSource) throw new Error('来源工作表已失效，请重新选择')
    if (editSource.extras?.protected) throw new Error('来源工作表已保护，请先取消保护')
    fields = xlsxPivotSource(editSource, draft.sourceRange).fields
    preview = xlsxPivotOperation(editSource, draft, sheet)
  } catch (cause) {
    issue = cause instanceof Error ? cause.message : '请检查透视配置'
  }
  const unchanged =
    editing &&
    eligibility?.seed &&
    JSON.stringify(eligibility.seed) ===
      JSON.stringify({
        rowFields: draft.rowFields,
        columnFields: draft.columnFields,
        values: draft.values.map(({ field, agg }) => ({ field, agg })),
      })
  if (unchanged) issue = '配置未变化'
  const axes = [...draft.rowFields, ...draft.columnFields]
  const patch = (value: Partial<XlsxPivotDraft>) => {
    setDraft((current) => ({ ...current, ...value }))
    setError('')
    setMessage('')
  }
  const groupPatch = (index: number, value: Partial<XlsxPivotGroupingDraft>) =>
    patch({
      groupings: draft.groupings.map((group, i) => (i === index ? { ...group, ...value } : group)),
    })
  const filterPatch = (index: number, value: Partial<XlsxPivotFilterDraft>) =>
    patch({
      filters: draft.filters.map((filter, i) => (i === index ? { ...filter, ...value } : filter)),
    })
  const submit = async () => {
    if (locked || controller.current || ((!pivot || editing) && (!preview || unchanged))) return
    const request = new AbortController()
    controller.current = request
    setSubmittedSignal(request.signal)
    setPending(true)
    setError('')
    setMessage('')
    try {
      const ok = await onOperation(
        editing && pivot
          ? {
              op: 'edit_pivot_layout',
              sheetId: sheet.id,
              pivotPath: pivot.path,
              rowFields: [...draft.rowFields],
              columnFields: [...draft.columnFields],
              values: draft.values.map(({ field, agg }) => ({ field, agg })),
            }
          : pivot
            ? { op: 'refresh_pivot', sheetId: sheet.id }
            : { ...preview!.operation },
        { signal: request.signal },
      )
      if (request.signal.aborted) return
      if (ok) {
        setMessage(
          editing
            ? '布局已应用，汇总结果已更新。'
            : pivot
              ? '已刷新当前表的透视表。'
              : '已创建，汇总结果已显示在网格中。',
        )
        setEditing(false)
      } else setError('未应用，配置已保留；请查看编辑器错误说明后重试。')
    } catch (cause) {
      if (!request.signal.aborted)
        setError(cause instanceof Error ? cause.message : '未应用，请重试。')
    } finally {
      if (controller.current === request) {
        controller.current = null
        setPending(false)
      }
    }
  }
  return (
    <fieldset
      ref={editorRoot}
      className="mimir-xlsx-pivot"
      aria-busy={pending}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        if (event.target instanceof Element && event.target.closest('[aria-expanded="true"]')) {
          event.stopPropagation()
          return
        }
        if (!editing) return
        event.preventDefault()
        event.stopPropagation()
        cancelEditing()
      }}
    >
      <fieldset className="mimir-xlsx-pivot__body" disabled={locked} aria-label="透视配置字段">
        <div className="mimir-xlsx-pivot__navigation">
          <ToolbarSelect
            label="透视表"
            value={pivot?.path ?? ''}
            disabled={locked}
            options={[
              { value: '', label: '新建透视表' },
              ...(sheet.pivots ?? []).map((item) => ({ value: item.path, label: item.name })),
            ]}
            onChange={(value) => {
              controller.current?.abort()
              controller.current = null
              setEditing(false)
              setEligibilityState(null)
              setSelectedPivot(value)
              setError('')
              setMessage('')
            }}
          />
          <ToolbarTabs
            label="透视设置分类"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'fields', label: '字段' },
              { value: 'values', label: '汇总' },
              { value: 'filters', label: '筛选' },
            ]}
          />
        </div>
        <div className="mimir-xlsx-pivot__configuration">
          {pivot && readback && !editing ? (
            <>
              <ToolbarMenuNote>
                现有配置来自原件，可按源数据刷新。{pivot.name} · {pivot.definition.outputRef}
              </ToolbarMenuNote>
              <ToolbarButton
                label="编辑布局"
                disabled={locked || !eligibility?.eligible}
                disabledReason={eligibility?.reasons[0] ?? '正在检查原件布局'}
                onClick={() => {
                  if (!eligibility?.eligible || !eligibility.seed) return
                  setDraft({
                    name: pivot.name,
                    sourceRange: eligibility.sourceRef!,
                    targetCell: eligibility.outputRef!.split(':')[0]!,
                    rowFields: [...eligibility.seed.rowFields],
                    columnFields: [...eligibility.seed.columnFields],
                    pageFields: [],
                    values: eligibility.seed.values.map((value, i) => ({
                      ...xlsxPivotValue(`existing-${i}`, value.field),
                      agg: value.agg,
                    })),
                    groupings: [],
                    filters: [],
                  })
                  setEditing(true)
                  setTab('fields')
                  setError('')
                  setMessage('')
                }}
              >
                <span>编辑布局</span>
              </ToolbarButton>
              {eligibility && !eligibility.eligible && (
                <ToolbarMenuNote>{eligibility.reasons.join('；')}</ToolbarMenuNote>
              )}
              {tab === 'fields' && (
                <ToolbarMenuFields label="原生字段布局">
                  <dl className="mimir-xlsx-pivot__readback">
                    <dt>源范围</dt>
                    <dd>
                      {pivot.definition.sourceSheet}!{pivot.definition.sourceRef}
                    </dd>
                    <dt>行字段</dt>
                    <dd>{readback.rows.join(' → ') || '无'}</dd>
                    <dt>列字段</dt>
                    <dd>{readback.columns.join(' → ') || '无'}</dd>
                    <dt>报告筛选</dt>
                    <dd>
                      {readback.pages.map((page) => `${page.field}：${page.value}`).join('；') ||
                        '无'}
                    </dd>
                  </dl>
                </ToolbarMenuFields>
              )}
              {tab === 'values' && (
                <ToolbarMenuFields label="原生汇总值">
                  {readback.values.map((value) => (
                    <div className="mimir-xlsx-pivot__native-item" key={JSON.stringify(value)}>
                      <strong>{value.name || value.fieldName}</strong>
                      <span>
                        {PIVOT_AGGREGATES.find((item) => item.value === value.subtotal)?.label ??
                          value.subtotal}
                        {value.showDataAs
                          ? ` · ${SHOW_AS.find((item) => item.value === value.showDataAs)?.label ?? value.showDataAs}`
                          : ''}
                      </span>
                      {value.formula && <span>公式：{value.formula}</span>}
                    </div>
                  ))}
                </ToolbarMenuFields>
              )}
              {tab === 'filters' && (
                <>
                  <ToolbarMenuFields label="原生分组">
                    {readback.groupings.length ? (
                      readback.groupings.map((group) => (
                        <ToolbarMenuNote key={group.field}>
                          {group.field} ·{' '}
                          {group.kind === 'date'
                            ? GROUP_MODES.find((mode) => mode.value === group.dateUnit)?.label
                            : `每 ${group.rangeStep}，起点 ${group.rangeStart ?? 0}`}
                        </ToolbarMenuNote>
                      ))
                    ) : (
                      <ToolbarMenuNote>未设置分组。</ToolbarMenuNote>
                    )}
                  </ToolbarMenuFields>
                  <ToolbarMenuFields label="原生筛选">
                    {readback.filters.length ? (
                      readback.filters.map((filter) => (
                        <ToolbarMenuNote key={JSON.stringify(filter)}>
                          {filter.fieldName} ·{' '}
                          {FILTER_MODES.find((mode) => mode.value === filter.op)?.label} ·{' '}
                          {filter.kind === 'label'
                            ? filter.value
                            : `${readback.values[filter.dataField]?.name ?? `汇总 ${filter.dataField + 1}`}：${filter.op === 'top' ? filter.count : filter.op === 'between' ? `${filter.from} – ${filter.to}` : filter.from}`}
                        </ToolbarMenuNote>
                      ))
                    ) : (
                      <ToolbarMenuNote>未设置标签或数值筛选。</ToolbarMenuNote>
                    )}
                  </ToolbarMenuFields>
                </>
              )}
              {!!readback.unsupported.length && (
                <ToolbarMenuNote>原件限制：{readback.unsupported.join('；')}</ToolbarMenuNote>
              )}
            </>
          ) : (
            <>
              {tab === 'fields' && (
                <>
                  {editing ? (
                    <ToolbarMenuFields label="原件位置">
                      <dl className="mimir-xlsx-pivot__readback">
                        <dt>名称</dt>
                        <dd>{pivot?.name}</dd>
                        <dt>源范围</dt>
                        <dd>
                          {editSource?.name}!{draft.sourceRange}
                        </dd>
                        <dt>输出位置</dt>
                        <dd>
                          {sheet.name} · {draft.targetCell}
                        </dd>
                      </dl>
                    </ToolbarMenuFields>
                  ) : (
                    <ToolbarMenuFields label="数据与位置">
                      <div className="mimir-xlsx-pivot__source">
                        <ToolbarSelect
                          label="来源工作表"
                          value={sourceSheetId}
                          disabled={locked}
                          disabledReason="正在应用透视配置"
                          options={sheets.map((item) => ({
                            value: item.id,
                            label: `${item.name}${item.hidden ? '（隐藏）' : ''}${item.extras?.protected ? '（已保护）' : ''}`,
                            disabled: !!item.extras?.protected,
                          }))}
                          onChange={(id) => {
                            if (id === sourceSheetId || locked) return
                            controller.current?.abort()
                            controller.current = null
                            setSourceSheetId(id)
                            const next = sheets.find((item) => item.id === id)
                            const initial = next
                              ? createXlsxPivotDraft(next, draft.sourceRange)
                              : null
                            patch({
                              ...(initial ?? {
                                rowFields: [],
                                values: [xlsxPivotValue('value-0')],
                              }),
                              name: draft.name,
                              sourceRange: draft.sourceRange,
                              targetCell: draft.targetCell,
                              columnFields: [],
                              pageFields: [],
                              groupings: [],
                              filters: [],
                            })
                            setMessage('来源已切换，请确认字段。')
                          }}
                        />
                      </div>
                      <dl className="mimir-xlsx-pivot__readback" aria-label="输出工作表">
                        <dt>输出工作表</dt>
                        <dd>{sheet.name}</dd>
                      </dl>
                      <ToolbarTextField
                        label="源数据范围"
                        value={draft.sourceRange}
                        placeholder="A1:D20"
                        onChange={(value) => {
                          const sourceRange = value.toUpperCase().trim()
                          const initial =
                            !draft.rowFields.length && draft.values.every((item) => !item.field)
                              ? sourceSheet && createXlsxPivotDraft(sourceSheet, sourceRange)
                              : null
                          patch({
                            sourceRange,
                            ...(initial?.rowFields.length
                              ? { rowFields: initial.rowFields, values: initial.values }
                              : {}),
                          })
                        }}
                      />
                      <ToolbarTextField
                        label="输出左上角"
                        value={draft.targetCell}
                        placeholder="I1（空白区域）"
                        onChange={(value) => patch({ targetCell: value.toUpperCase().trim() })}
                      />
                      {!fields.length && issue && (
                        <p className="mimir-xlsx-pivot__source-issue" role="alert">
                          {issue}
                        </p>
                      )}
                      <ToolbarTextField
                        label="透视名称"
                        value={draft.name}
                        placeholder="留空自动命名"
                        onChange={(name) => patch({ name })}
                      />
                      <ToolbarMenuNote>
                        第一行为字段标题；源数据和输出各最多2000格，使用当前数值或公式缓存。
                      </ToolbarMenuNote>
                    </ToolbarMenuFields>
                  )}
                  <AxisFields
                    label="行字段"
                    values={draft.rowFields}
                    fields={fields}
                    disabled={locked}
                    minimum={1}
                    onChange={(rowFields) => patch({ rowFields })}
                  />
                  <AxisFields
                    label="列字段"
                    values={draft.columnFields}
                    fields={fields}
                    disabled={locked}
                    onChange={(columnFields) => patch({ columnFields })}
                  />
                  <ToolbarMenuNote>
                    行、列字段从上到下决定外层到内层；有列字段时仅支持一个汇总值。
                  </ToolbarMenuNote>
                </>
              )}
              {tab === 'values' && (
                <ToolbarMenuFields label={`汇总值（${draft.values.length}/8）`}>
                  {draft.values.map((value, index) => (
                    <details
                      className="mimir-xlsx-pivot__entry"
                      key={value.key}
                      open={draft.values.length === 1 || undefined}
                    >
                      <summary>
                        {index + 1}. {value.field || '请选择字段'} ·{' '}
                        {PIVOT_AGGREGATES.find((item) => item.value === value.agg)?.label}
                      </summary>
                      <div className="mimir-xlsx-pivot__entry-fields">
                        <ToolbarSelect
                          label={`汇总字段 ${index + 1}`}
                          value={value.field}
                          disabled={locked}
                          options={asOptions(fields)}
                          onChange={(field) =>
                            patch({
                              values: draft.values.map((item, i) =>
                                i === index ? { ...item, field } : item,
                              ),
                            })
                          }
                        />
                        <ToolbarSelect
                          label={`汇总方式 ${index + 1}`}
                          value={value.agg}
                          disabled={locked}
                          options={PIVOT_AGGREGATES}
                          onChange={(agg) =>
                            patch({
                              values: draft.values.map((item, i) =>
                                i === index ? { ...item, agg } : item,
                              ),
                            })
                          }
                        />
                        {!editing && (
                          <>
                            <ToolbarSelect
                              label={`显示方式 ${index + 1}`}
                              value={value.showDataAs}
                              disabled={locked}
                              options={SHOW_AS}
                              onChange={(showDataAs) =>
                                patch({
                                  values: draft.values.map((item, i) =>
                                    i === index ? { ...item, showDataAs } : item,
                                  ),
                                })
                              }
                            />
                            <ToolbarTextField
                              label={`数字格式 ${index + 1}`}
                              value={value.numFmt}
                              placeholder="自动，如 #,##0.00"
                              onChange={(numFmt) =>
                                patch({
                                  values: draft.values.map((item, i) =>
                                    i === index ? { ...item, numFmt } : item,
                                  ),
                                })
                              }
                            />
                          </>
                        )}
                        <ToolbarButton
                          label={`移除汇总值 ${index + 1}`}
                          disabled={locked || draft.values.length <= 1}
                          onClick={() =>
                            patch({ values: draft.values.filter((_, i) => i !== index) })
                          }
                        >
                          <Trash2 size={13} />
                          <span>移除汇总值</span>
                        </ToolbarButton>
                      </div>
                    </details>
                  ))}
                  <ToolbarButton
                    label="添加汇总值"
                    disabled={locked || draft.values.length >= 8}
                    onClick={() => {
                      const key = `value-${++sequence.current}`
                      patch({
                        values: [
                          ...draft.values,
                          xlsxPivotValue(
                            key,
                            fields.find(
                              (field) => !axes.includes(field) && !draft.pageFields.includes(field),
                            ) ?? '',
                          ),
                        ],
                      })
                    }}
                  >
                    <Plus size={13} />
                    <span>添加汇总值</span>
                  </ToolbarButton>
                  <ToolbarMenuNote>
                    {editing
                      ? '可对同一字段使用不同汇总方式；应用后更新原有透视表。'
                      : '可对同一字段使用不同汇总方式；自定义数字格式会限制新增分类后的自动扩展。'}
                  </ToolbarMenuNote>
                </ToolbarMenuFields>
              )}
              {tab === 'filters' &&
                (editing ? (
                  <ToolbarMenuNote>
                    当前透视表未设置筛选；编辑布局时不新增筛选或分组。
                  </ToolbarMenuNote>
                ) : (
                  <>
                    <AxisFields
                      label="报告筛选字段"
                      values={draft.pageFields}
                      fields={fields}
                      disabled={locked}
                      limit={4}
                      onChange={(pageFields) => patch({ pageFields })}
                    />
                    <ToolbarMenuNote>
                      报告筛选字段随文件保存，当前网格汇总全部项；可在 Excel 中选择报告筛选项。
                    </ToolbarMenuNote>
                    <ToolbarMenuFields label="维度分组">
                      {draft.groupings.map((group, index) => (
                        <details className="mimir-xlsx-pivot__entry" key={group.key} open>
                          <summary>
                            {group.field || '请选择字段'} ·{' '}
                            {GROUP_MODES.find((mode) => mode.value === group.mode)?.label}
                          </summary>
                          <div className="mimir-xlsx-pivot__entry-fields">
                            <ToolbarSelect
                              label={`分组字段 ${index + 1}`}
                              value={group.field}
                              disabled={locked}
                              options={asOptions(axes)}
                              onChange={(field) => groupPatch(index, { field })}
                            />
                            <ToolbarSelect
                              label={`分组方式 ${index + 1}`}
                              value={group.mode}
                              disabled={locked}
                              options={GROUP_MODES}
                              onChange={(mode) => groupPatch(index, { mode })}
                            />
                            {group.mode === 'range' && (
                              <>
                                <ToolbarTextField
                                  label={`分组间隔 ${index + 1}`}
                                  value={group.step}
                                  onChange={(step) => groupPatch(index, { step })}
                                />
                                <ToolbarTextField
                                  label={`分组起点 ${index + 1}`}
                                  value={group.start}
                                  placeholder="默认0"
                                  onChange={(start) => groupPatch(index, { start })}
                                />
                              </>
                            )}
                            <ToolbarButton
                              label={`移除分组 ${index + 1}`}
                              disabled={locked}
                              onClick={() =>
                                patch({ groupings: draft.groupings.filter((_, i) => i !== index) })
                              }
                            >
                              <Trash2 size={13} />
                              <span>移除分组</span>
                            </ToolbarButton>
                          </div>
                        </details>
                      ))}
                      <ToolbarButton
                        label="添加维度分组"
                        disabled={
                          locked ||
                          draft.groupings.length >= 8 ||
                          !axes.some(
                            (field) => !draft.groupings.some((group) => group.field === field),
                          )
                        }
                        onClick={() =>
                          patch({
                            groupings: [
                              ...draft.groupings,
                              {
                                key: `group-${++sequence.current}`,
                                field: axes.find(
                                  (field) =>
                                    !draft.groupings.some((group) => group.field === field),
                                )!,
                                mode: 'year',
                                step: '100',
                                start: '',
                              },
                            ],
                          })
                        }
                      >
                        <Plus size={13} />
                        <span>添加分组</span>
                      </ToolbarButton>
                      <ToolbarMenuNote>
                        季度、月份会跨年合并。分组可在 Mimir 中保存和刷新；在 Excel
                        中刷新可能改回原始明细。
                      </ToolbarMenuNote>
                    </ToolbarMenuFields>
                    <ToolbarMenuFields label="标签与数值筛选">
                      {draft.filters.map((filter, index) => (
                        <details className="mimir-xlsx-pivot__entry" key={filter.key} open>
                          <summary>
                            {filter.field || '请选择字段'} ·{' '}
                            {FILTER_MODES.find((mode) => mode.value === filter.op)?.label}
                          </summary>
                          <div className="mimir-xlsx-pivot__entry-fields">
                            <ToolbarSelect
                              label={`筛选字段 ${index + 1}`}
                              value={filter.field}
                              disabled={locked}
                              options={asOptions(axes)}
                              onChange={(field) => filterPatch(index, { field })}
                            />
                            <ToolbarSelect
                              label={`筛选条件 ${index + 1}`}
                              value={filter.op}
                              disabled={locked}
                              options={FILTER_MODES}
                              onChange={(op) => filterPatch(index, { op })}
                            />
                            {LABEL_FILTERS.has(filter.op) ? (
                              <ToolbarTextField
                                label={`筛选文字 ${index + 1}`}
                                value={filter.text}
                                onChange={(text) => filterPatch(index, { text })}
                              />
                            ) : (
                              <>
                                <ToolbarSelect
                                  label={`筛选汇总值 ${index + 1}`}
                                  value={filter.valueKey}
                                  disabled={locked}
                                  options={draft.values.map((value, i) => ({
                                    value: value.key,
                                    label: `${i + 1}. ${value.field} · ${PIVOT_AGGREGATES.find((item) => item.value === value.agg)?.label}`,
                                  }))}
                                  onChange={(valueKey) => filterPatch(index, { valueKey })}
                                />
                                {filter.op === 'top' ? (
                                  <ToolbarTextField
                                    label={`前几项 ${index + 1}`}
                                    value={filter.count}
                                    onChange={(count) => filterPatch(index, { count })}
                                  />
                                ) : (
                                  <ToolbarTextField
                                    label={`筛选下限 ${index + 1}`}
                                    value={filter.from}
                                    onChange={(from) => filterPatch(index, { from })}
                                  />
                                )}
                                {filter.op === 'between' && (
                                  <ToolbarTextField
                                    label={`筛选上限 ${index + 1}`}
                                    value={filter.to}
                                    onChange={(to) => filterPatch(index, { to })}
                                  />
                                )}
                              </>
                            )}
                            <ToolbarButton
                              label={`移除筛选 ${index + 1}`}
                              disabled={locked}
                              onClick={() =>
                                patch({ filters: draft.filters.filter((_, i) => i !== index) })
                              }
                            >
                              <Trash2 size={13} />
                              <span>移除筛选</span>
                            </ToolbarButton>
                          </div>
                        </details>
                      ))}
                      <ToolbarButton
                        label="添加透视筛选"
                        disabled={
                          locked ||
                          draft.filters.length >= 8 ||
                          !axes.some(
                            (field) => !draft.filters.some((filter) => filter.field === field),
                          )
                        }
                        onClick={() =>
                          patch({
                            filters: [
                              ...draft.filters,
                              {
                                key: `filter-${++sequence.current}`,
                                field: axes.find(
                                  (field) =>
                                    !draft.filters.some((filter) => filter.field === field),
                                )!,
                                op: 'contains',
                                text: '',
                                valueKey: draft.values[0]?.key ?? '',
                                count: '10',
                                from: '',
                                to: '',
                              },
                            ],
                          })
                        }
                      >
                        <Plus size={13} />
                        <span>添加筛选</span>
                      </ToolbarButton>
                      <ToolbarMenuNote>
                        每个行或列字段最多一条筛选；数值条件按所选汇总值计算。
                      </ToolbarMenuNote>
                    </ToolbarMenuFields>
                  </>
                ))}
            </>
          )}
        </div>
      </fieldset>
      <div className="mimir-xlsx-pivot__footer">
        {error ? (
          <p role="alert">{error}</p>
        ) : message ? (
          <p role="status">{message}</p>
        ) : (
          <p>
            {editing
              ? unchanged
                ? '配置未变化'
                : preview
                  ? `更新为 ${preview.outputRef} · ${preview.layout.height} 行 × ${preview.layout.width} 列`
                  : issue
              : pivot
                ? `刷新当前表全部 ${sheet.pivots?.length ?? 0} 张透视表。`
                : preview
                  ? `输出至 ${sheet.name} · ${preview.outputRef} · ${preview.layout.height} 行 × ${preview.layout.width} 列`
                  : issue}
          </p>
        )}
        <div className="mimir-xlsx-pivot__footer-actions">
          {editing && (
            <ToolbarButton label="取消编辑" onClick={cancelEditing}>
              <span>取消编辑</span>
            </ToolbarButton>
          )}
          <ToolbarButton
            primary
            label={
              pending
                ? '正在应用透视配置'
                : editing
                  ? '应用布局'
                  : pivot
                    ? '刷新当前表全部透视表'
                    : '创建数据透视表'
            }
            disabled={locked || ((!pivot || editing) && (!preview || unchanged))}
            disabledReason={issue || '正在处理工作簿'}
            onClick={() => void submit()}
          />
        </div>
      </div>
    </fieldset>
  )
}
