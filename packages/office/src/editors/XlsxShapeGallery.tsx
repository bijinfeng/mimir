import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from 'antd'
import { TextCursorInput } from 'lucide-react'
import {
  ToolbarButton,
  ToolbarColorPicker,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarSelect,
  ToolbarTextArea,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import { XLSX_COLORS } from './XlsxFormatControls.js'
import {
  createXlsxShapeDraft,
  filterXlsxShapes,
  XLSX_SHAPE_GROUPS,
  xlsxShapeLabel,
  xlsxShapeOperation,
  xlsxShapePreview,
  type XlsxShapeKind,
} from './xlsx-shape-gallery.js'
import './xlsx-shape-gallery.css'

export interface XlsxShapeGalleryProps {
  range: string
  sourceKey: unknown
  contextKey: string
  busy: boolean
  onOperation: (op: Record<string, unknown>, options: { signal: AbortSignal }) => Promise<boolean>
}
export function XlsxShapeGallery({
  range,
  sourceKey,
  contextKey,
  busy,
  onOperation,
}: XlsxShapeGalleryProps) {
  const [draft, setDraft] = useState(() => createXlsxShapeDraft(range)),
    [query, setQuery] = useState(''),
    [category, setCategory] = useState('all'),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [shownSource, setShownSource] = useState({ sourceKey, contextKey })
  const request = useRef<AbortController | null>(null),
    gallery = useRef<HTMLDivElement>(null),
    liveSource = useRef({ sourceKey, contextKey })
  if (shownSource.sourceKey !== sourceKey || shownSource.contextKey !== contextKey) {
    setShownSource({ sourceKey, contextKey })
    setPending(false)
    setMessage('')
    setError('')
    if (shownSource.contextKey !== contextKey) {
      setDraft(createXlsxShapeDraft(range))
      setQuery('')
      setCategory('all')
    }
  }
  useLayoutEffect(() => {
    liveSource.current = { sourceKey, contextKey }
    request.current?.abort()
    request.current = null
    return () => request.current?.abort()
  }, [sourceKey, contextKey])
  const locked = busy || pending,
    groups = filterXlsxShapes(query, category),
    visible = groups.flatMap((group) => group.shapes),
    active = visible.some((shape) => shape.kind === draft.kind) ? draft.kind : visible[0]?.kind
  let issue = ''
  try {
    xlsxShapeOperation(draft)
  } catch (cause) {
    issue = cause instanceof Error ? cause.message : '请检查形状设置'
  }
  const choose = (kind: XlsxShapeKind) => {
    setDraft((before) => ({ ...before, kind }))
    setMessage('')
    setError('')
  }
  const navigate = (event: KeyboardEvent, index: number) => {
    const offset = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 }[event.key]
    if (locked || (offset === undefined && event.key !== 'Home' && event.key !== 'End')) return
    event.preventDefault()
    event.stopPropagation()
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : index + (offset ?? 0)
    const shape = visible[Math.max(0, Math.min(visible.length - 1, next))]
    if (!shape) return
    choose(shape.kind)
    gallery.current?.querySelector<HTMLButtonElement>(`button[data-shape="${shape.kind}"]`)?.focus()
  }
  const insert = async () => {
    if (locked || request.current) return
    const controller = new AbortController()
    const startedAt = liveSource.current
    request.current = controller
    setPending(true)
    setMessage('')
    setError('')
    try {
      const operation = xlsxShapeOperation(draft),
        ok = await onOperation(operation, { signal: controller.signal })
      if (
        controller.signal.aborted ||
        request.current !== controller ||
        liveSource.current !== startedAt
      )
        return
      if (ok) setMessage(`已插入${xlsxShapeLabel(draft.kind)}`)
      else setError('形状未插入，设置已保留，请查看编辑器错误说明后重试')
    } catch (cause) {
      if (!controller.signal.aborted && request.current === controller)
        setError(cause instanceof Error ? cause.message : '形状未插入，请重试')
    } finally {
      if (request.current === controller) {
        request.current = null
        setPending(false)
      }
    }
  }
  return (
    <fieldset className="mimir-xlsx-shapes" disabled={locked}>
      <div className="mimir-xlsx-shapes__search">
        <ToolbarTextField
          label="搜索形状"
          value={query}
          onChange={setQuery}
          placeholder="名称或英文预设"
        />
        <ToolbarSelect
          label="形状分组"
          value={category}
          disabled={locked}
          onChange={setCategory}
          options={[
            { value: 'all', label: '全部形状' },
            ...XLSX_SHAPE_GROUPS.map((group) => ({ value: group.key, label: group.label })),
          ]}
        />
      </div>
      <div className="mimir-xlsx-shapes__body">
        <details className="mimir-xlsx-shapes__settings">
          <summary>文字、位置与填充</summary>
          <ToolbarMenuFields label="插入设置">
            <ToolbarTextField
              label="左上角单元格"
              value={draft.anchorCell}
              onChange={(anchorCell) =>
                setDraft({ ...draft, anchorCell: anchorCell.toUpperCase() })
              }
              placeholder="E2"
            />
            <ToolbarTextArea
              label="形状文字"
              value={draft.text}
              onChange={(text) => setDraft({ ...draft, text })}
            />
            <ToolbarColorPicker
              label="形状填充"
              value={draft.fillColor}
              options={XLSX_COLORS}
              onPick={(fillColor) => setDraft({ ...draft, fillColor })}
            />
            <ToolbarMenuNote>插入后可在“管理”中修改文字、填充或位置。</ToolbarMenuNote>
          </ToolbarMenuFields>
        </details>
        <div
          ref={gallery}
          role="radiogroup"
          aria-label="工作表形状库"
          className="mimir-xlsx-shapes__gallery"
        >
          {groups.map((group) => (
            <section className="mimir-xlsx-shapes__group" key={group.key} aria-label={group.label}>
              <h3>{group.label}</h3>
              <div className="mimir-xlsx-shapes__grid">
                {group.shapes.map((shape) => {
                  const paths = xlsxShapePreview(shape.kind)
                  return (
                    <Button
                      key={shape.kind}
                      className="mimir-xlsx-shapes__cell"
                      role="radio"
                      aria-checked={shape.kind === draft.kind}
                      aria-label={shape.label}
                      title={shape.label}
                      data-shape={shape.kind}
                      tabIndex={shape.kind === active ? 0 : -1}
                      color={shape.kind === draft.kind ? 'primary' : 'default'}
                      variant="outlined"
                      disabled={locked}
                      onClick={() => choose(shape.kind)}
                      onKeyDown={(event) =>
                        navigate(
                          event,
                          visible.findIndex((item) => item.kind === shape.kind),
                        )
                      }
                    >
                      <span className="mimir-xlsx-shapes__cell-content">
                        {shape.kind === 'textbox' ? (
                          <TextCursorInput size={30} aria-hidden="true" />
                        ) : (
                          <svg width="40" height="32" viewBox="-2 -2 40 32" aria-hidden="true">
                            <g
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinejoin="round"
                            >
                              {paths?.path && <path d={paths.path} />}
                              {paths?.fillPath && (
                                <path d={paths.fillPath} stroke="none" fill="currentColor" />
                              )}
                              {paths?.strokePath && <path d={paths.strokePath} fill="none" />}
                            </g>
                          </svg>
                        )}
                        <span className="mimir-xlsx-shapes__label">
                          {shape.label.replace('流程图: ', '')}
                        </span>
                      </span>
                    </Button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
        {!visible.length && (
          <p className="mimir-xlsx-shapes__empty" role="status">
            没有匹配的形状，请换个名称或分组
          </p>
        )}
      </div>
      <footer className="mimir-xlsx-shapes__footer">
        <p className="mimir-xlsx-shapes__selection">
          已选：{xlsxShapeLabel(draft.kind)} · {draft.anchorCell || '待填写位置'}
        </p>
        <ToolbarButton
          label="插入形状"
          primary
          disabled={locked || !!issue}
          disabledReason={locked ? '正在应用，请稍候' : issue}
          onClick={() => void insert()}
        />
        {(error || issue) && <p role={error ? 'alert' : undefined}>{error || issue}</p>}
        <p role="status">{pending ? '正在插入…' : message}</p>
      </footer>
    </fieldset>
  )
}
