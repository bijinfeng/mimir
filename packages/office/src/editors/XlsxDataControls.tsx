import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react'
import type { XlsxManualSort } from '@mimir/shared'
import {
  parseRange,
  columnLabel,
  rangeCellCount,
} from '../../vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import {
  ToolbarPropertyForm,
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarSelect,
  ToolbarTextArea,
  ToolbarTextField,
  ToolbarTabs,
  ToolbarMenuNote,
} from '../shell/EditorShell.js'
import './xlsx-data-controls.css'

export function XlsxDataControls({
  range,
  column,
  filterRange,
  busy,
  sourceKey,
  contextKey,
  trigger,
  onClose,
  onOperation,
}: {
  range: string
  column: string
  filterRange?: string
  busy?: boolean
  sourceKey: unknown
  contextKey: string
  trigger: HTMLButtonElement | null
  onClose: () => void
  onOperation: (op: Record<string, unknown>, signal: AbortSignal) => Promise<boolean>
}) {
  const [initial] = useState(() => ({ sourceKey, contextKey }))
  const stale = initial.sourceKey !== sourceKey || initial.contextKey !== contextKey
  const panel = useRef<HTMLElement>(null)
  const liveTrigger = useRef(trigger)
  useLayoutEffect(() => {
    liveTrigger.current = trigger
  }, [trigger])
  useLayoutEffect(() => {
    if (stale) onClose()
  }, [stale, onClose])
  useEffect(() => {
    const node = panel.current,
      editor = node?.closest('.mimir-editor')
    const container = node?.parentElement
    container?.classList.add('mimir-xlsx-inspector-host')
    node?.focus()
    return () => {
      container?.classList.remove('mimir-xlsx-inspector-host')
      if (
        document.activeElement === document.body ||
        document.activeElement === node ||
        node?.contains(document.activeElement)
      ) {
        ;(liveTrigger.current?.isConnected
          ? liveTrigger.current
          : editor?.querySelector<HTMLButtonElement>(
              'button[aria-label="范围数据操作"], button[aria-label="排序与筛选"]',
            )
        )?.focus()
      }
    }
  }, [])
  if (stale) return null
  return (
    <aside
      ref={panel}
      tabIndex={-1}
      aria-label="范围数据设置"
      className="mimir-xlsx-inspector mimir-xlsx-data-panel"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <header className="mimir-xlsx-inspector__header">
        <h2>排序与筛选</h2>
        <ToolbarButton label="关闭范围数据设置" onClick={onClose}>
          <X size={16} />
        </ToolbarButton>
      </header>
      <DataDraft
        range={range}
        column={column}
        filterRange={filterRange}
        busy={busy}
        onOperation={onOperation}
      />
    </aside>
  )
}
function selectedColumns(range: string): string[] {
  try {
    const area = parseRange(range)
    if (area.endColumn >= 16384 || area.endRow >= 1048576 || rangeCellCount(area) > 2000) return []
    return Array.from({ length: area.endColumn - area.startColumn + 1 }, (_, i) =>
      columnLabel(area.startColumn + i),
    )
  } catch {
    return []
  }
}
function DataDraft({
  range,
  column,
  filterRange,
  busy,
  onOperation,
}: Pick<
  Parameters<typeof XlsxDataControls>[0],
  'range' | 'column' | 'filterRange' | 'busy' | 'onOperation'
>) {
  const columns = selectedColumns(range)
  const [mode, setMode] = useState('sort')
  const [rules, setRules] = useState<XlsxManualSort['rules']>(() => [
    { column: columns.includes(column) ? column : (columns[0] ?? ''), order: 'asc' },
  ])
  const [hasHeader, setHasHeader] = useState(true)
  const [filterTask, setFilterTask] = useState('enable')
  const [replaceTask, setReplaceTask] = useState('replace')
  const [byColumn, setByColumn] = useState(column)
  const [values, setValues] = useState('')
  const [find, setFind] = useState(''),
    [replace, setReplace] = useState('')
  const [matchCase, setMatchCase] = useState(false),
    [wholeCell, setWholeCell] = useState(false)
  const [pending, setPending] = useState(false),
    [feedback, setFeedback] = useState('')
  const request = useRef<AbortController | null>(null),
    lock = useRef(false)
  useLayoutEffect(() => () => request.current?.abort(), [])
  const cancel = () => {
    request.current?.abort()
    lock.current = false
    setPending(false)
    setFeedback('')
  }
  const switchMode = (value: string) => {
    cancel()
    setMode(value)
  }
  const available = columns.filter((value) => !rules.some((rule) => rule.column === value))
  const invalidSort =
    !columns.length ||
    rules.some((rule) => !columns.includes(rule.column)) ||
    (() => {
      try {
        const bounds = parseRange(range)
        return bounds.endRow - bounds.startRow + 1 - Number(hasHeader) < 2
      } catch {
        return true
      }
    })()
  const validColumn = /^[A-Z]{1,3}$/.test(byColumn)
  const disabled =
    busy ||
    pending ||
    (mode === 'sort'
      ? invalidSort
      : mode === 'replace'
        ? replaceTask === 'replace' && !find
        : filterTask === 'enable'
          ? !columns.length
          : !filterRange || (['values', 'clear-column'].includes(filterTask) && !validColumn))
  const apply = async () => {
    if (lock.current || disabled) return
    lock.current = true
    setPending(true)
    setFeedback('')
    const controller = new AbortController()
    request.current = controller
    const operation =
      mode === 'sort'
        ? { op: 'sort_range_multi', range, rules, hasHeader }
        : mode === 'replace'
          ? replaceTask === 'clear'
            ? { op: 'clear_range', range }
            : { op: 'find_replace', range, find, replace, matchCase, wholeCell }
          : filterTask === 'enable'
            ? { op: 'set_filter', range }
            : filterTask === 'clear'
              ? { op: 'clear_filter' }
              : {
                  op: 'set_filter_criteria',
                  column: byColumn,
                  values: filterTask === 'clear-column' ? null : values.split('\n'),
                }
    try {
      const ok = await onOperation(operation, controller.signal)
      if (!controller.signal.aborted) setFeedback(ok ? '已应用' : '未应用，请查看错误提示后重试')
    } catch (error) {
      if (!controller.signal.aborted)
        setFeedback(error instanceof Error ? error.message : '未应用，请重试')
    } finally {
      if (request.current === controller) {
        lock.current = false
        if (!controller.signal.aborted) setPending(false)
      }
    }
  }
  const reorder = (index: number, offset: number) =>
    setRules((current) => {
      const next = [...current]
      ;[next[index], next[index + offset]] = [next[index + offset]!, next[index]!]
      return next
    })
  return (
    <>
      <div className="mimir-xlsx-data-panel__nav">
        <ToolbarMenuNote>
          范围：{range || '未选择'} · 筛选：{filterRange ?? '未启用'}
        </ToolbarMenuNote>
        <ToolbarTabs
          label="数据工具"
          value={mode}
          onChange={switchMode}
          items={[
            { value: 'sort', label: '排序' },
            { value: 'filter', label: '筛选' },
            { value: 'replace', label: '替换' },
          ]}
        />
      </div>
      <div className="mimir-xlsx-inspector__content">
        <ToolbarPropertyForm columns={1}>
          <fieldset disabled={!!busy || pending} aria-busy={pending}>
            {mode === 'sort' && (
              <>
                <ToolbarButton
                  label="排序包含标题行"
                  active={hasHeader}
                  onClick={() => setHasHeader(!hasHeader)}
                >
                  首行为标题
                </ToolbarButton>
                <ToolbarMenuNote>按下列优先级排序；空值始终排在末尾。</ToolbarMenuNote>
                {rules.map((rule, index) => (
                  <section
                    className="mimir-xlsx-sort-level"
                    key={rule.column}
                    aria-label={`排序级别 ${index + 1}`}
                  >
                    <div className="mimir-xlsx-sort-level__heading">
                      <strong>{index === 0 ? '主要排序' : `次要排序 ${index}`}</strong>
                      <div>
                        <ToolbarButton
                          label={`上移排序级别 ${index + 1}`}
                          disabled={index === 0 || !!busy || pending}
                          onClick={() => reorder(index, -1)}
                        >
                          <ArrowUp size={14} />
                        </ToolbarButton>
                        <ToolbarButton
                          label={`下移排序级别 ${index + 1}`}
                          disabled={index === rules.length - 1 || !!busy || pending}
                          onClick={() => reorder(index, 1)}
                        >
                          <ArrowDown size={14} />
                        </ToolbarButton>
                        <ToolbarButton
                          label={`删除排序级别 ${index + 1}`}
                          disabled={rules.length === 1 || !!busy || pending}
                          onClick={() => setRules(rules.filter((_rule, i) => i !== index))}
                        >
                          <Trash2 size={14} />
                        </ToolbarButton>
                      </div>
                    </div>
                    <ToolbarSelect
                      label={`第 ${index + 1} 级排序列`}
                      disabled={!!busy || pending}
                      value={rule.column}
                      options={columns.map((value) => ({
                        value,
                        label: `列 ${value}`,
                        disabled: rules.some((other, i) => i !== index && other.column === value),
                      }))}
                      onChange={(value) =>
                        setRules(
                          rules.map((item, i) => (i === index ? { ...item, column: value } : item)),
                        )
                      }
                    />
                    <ToolbarSelect
                      label={`第 ${index + 1} 级排序顺序`}
                      disabled={!!busy || pending}
                      value={rule.order}
                      options={[
                        { value: 'asc', label: '升序' },
                        { value: 'desc', label: '降序' },
                      ]}
                      onChange={(value) =>
                        setRules(
                          rules.map((item, i) => (i === index ? { ...item, order: value } : item)),
                        )
                      }
                    />
                  </section>
                ))}
                <ToolbarButton
                  label="添加排序级别"
                  disabled={!available.length || rules.length >= 8 || !!busy || pending}
                  disabledReason="最多8级，每列只能使用一次"
                  onClick={() => setRules([...rules, { column: available[0]!, order: 'asc' }])}
                >
                  <Plus size={14} />
                  添加级别
                </ToolbarButton>
                {invalidSort && (
                  <ToolbarMenuNote>请选择最多2000格、至少包含两行数据的有效范围。</ToolbarMenuNote>
                )}
              </>
            )}
            {mode === 'filter' && (
              <>
                <ToolbarSelect
                  label="筛选操作"
                  disabled={!!busy || pending}
                  value={filterTask}
                  onChange={setFilterTask}
                  options={[
                    { value: 'enable', label: '启用范围筛选' },
                    { value: 'clear', label: '清除工作表筛选' },
                    { value: 'values', label: '设置列保留值' },
                    { value: 'clear-column', label: '清除列条件' },
                  ]}
                />
                {['values', 'clear-column'].includes(filterTask) && (
                  <ToolbarTextField
                    label="筛选列"
                    value={byColumn}
                    onChange={(value) => setByColumn(value.toUpperCase())}
                  />
                )}
                {filterTask === 'values' && (
                  <ToolbarTextArea
                    label="筛选保留值（每行一个，空行匹配空值）"
                    value={values}
                    onChange={setValues}
                    rows={3}
                  />
                )}
              </>
            )}
            {mode === 'replace' && (
              <>
                <ToolbarSelect
                  label="范围文字操作"
                  disabled={!!busy || pending}
                  value={replaceTask}
                  onChange={setReplaceTask}
                  options={[
                    { value: 'replace', label: '替换文字' },
                    { value: 'clear', label: '清空内容' },
                  ]}
                />
                {replaceTask === 'replace' && (
                  <ToolbarMenuFields label="替换文字">
                    <ToolbarTextField label="范围查找文字" value={find} onChange={setFind} />
                    <ToolbarTextField label="范围替换为" value={replace} onChange={setReplace} />
                    <ToolbarButton
                      label="范围替换区分大小写"
                      active={matchCase}
                      onClick={() => setMatchCase(!matchCase)}
                    >
                      区分大小写
                    </ToolbarButton>
                    <ToolbarButton
                      label="范围替换匹配整个单元格"
                      active={wholeCell}
                      onClick={() => setWholeCell(!wholeCell)}
                    >
                      全格匹配
                    </ToolbarButton>
                  </ToolbarMenuFields>
                )}
              </>
            )}
          </fieldset>
          {feedback && (
            <div role="status">
              <ToolbarMenuNote>{feedback}</ToolbarMenuNote>
            </div>
          )}
        </ToolbarPropertyForm>
      </div>
      <footer className="mimir-xlsx-data-panel__footer">
        <ToolbarButton
          primary
          label={
            pending
              ? '正在应用数据操作'
              : mode === 'sort'
                ? '应用排序'
                : mode === 'filter'
                  ? '应用筛选'
                  : replaceTask === 'clear'
                    ? '清空范围内容'
                    : '替换范围文字'
          }
          disabled={!!disabled}
          disabledReason={
            invalidSort && mode === 'sort'
              ? '选择至少两行数据、最多2000格的范围'
              : '请完成当前设置，或等待操作结束'
          }
          onClick={() => void apply()}
        />
      </footer>
    </>
  )
}
