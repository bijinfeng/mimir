import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Button } from 'antd'
import { PPTX_INSERT_SHAPE_KINDS, type PptxManualShape } from '@mimir/shared'
import type { SlideElement } from '../../vendor/packages/pptx-engine/src/types.js'
import {
  ToolbarButton,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarTabs,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import type { PptxTarget } from './PptxControlPanel.js'
import {
  currentPptxShapeStyle,
  isPptxLineKind,
  PPTX_SHAPE_GROUPS,
  PPTX_SHAPE_STYLE_ROWS,
  PPTX_SHAPE_STYLES,
  PPTX_SHAPES,
  pptxInsertShapeOp,
  pptxShapeLabel,
  pptxShapePreview,
  pptxShapeStyleOps,
  type PptxShapeStyle,
} from './pptx-shape-presets.js'
import './pptx-shape-gallery.css'

export function PptxShapePreview({ kind, style }: { kind: string; style?: PptxShapeStyle }) {
  const paths = pptxShapePreview(kind)
  return (
    <svg width="44" height="36" viewBox="-4 -4 44 36" aria-hidden="true">
      <g
        fill={style?.fill ?? 'none'}
        stroke={style?.stroke ?? 'currentColor'}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeDasharray={style?.dash === 'dash' ? '4 3' : undefined}
      >
        {paths?.path && <path d={paths.path} />}
        {paths?.fillPath && <path d={paths.fillPath} stroke="none" />}
        {paths?.strokePath && <path d={paths.strokePath} fill="none" />}
      </g>
    </svg>
  )
}

/** One Tab stop per gallery; arrows select a preview without changing the document. */
function Gallery({
  label,
  items,
  value,
  onChange,
}: {
  label: string
  items: readonly { key: string; label: string; content: ReactNode }[]
  value: string
  onChange: (key: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const active = items.some((item) => item.key === value) ? value : items[0]?.key
  const navigate = (event: KeyboardEvent, index: number) => {
    const offset = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 }[event.key]
    if (offset === undefined && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    event.stopPropagation()
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : Math.max(0, Math.min(items.length - 1, index + (offset ?? 0)))
    const item = items[next]
    if (!item) return
    onChange(item.key)
    ref.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
  }
  return (
    <div ref={ref} className="mimir-pptx-shape-grid" role="radiogroup" aria-label={label}>
      {items.map((item, index) => (
        <Button
          key={item.key}
          className="mimir-pptx-shape-cell"
          color={item.key === value ? 'primary' : 'default'}
          variant="outlined"
          role="radio"
          aria-checked={item.key === value}
          aria-label={item.label}
          tabIndex={item.key === active ? 0 : -1}
          title={item.label}
          onKeyDown={(event) => navigate(event, index)}
          onClick={() => onChange(item.key)}
        >
          <span className="mimir-pptx-shape-cell__content">{item.content}</span>
        </Button>
      ))}
    </div>
  )
}

export interface PptxShapeGalleryProps {
  version: number
  target: PptxTarget | null
  element: SlideElement | null
  slide: number
  width: number
  height: number
  onDrawShape?: (kind: PptxManualShape['kind']) => void
  applyOps: (ops: Record<string, unknown>[]) => Promise<boolean>
}

/** Persistent compact Inspector content; the existing host handles close, Escape and focus return. */
export function PptxShapeGallery({
  version,
  target,
  element,
  slide,
  width,
  height,
  applyOps,
  onDrawShape,
}: PptxShapeGalleryProps) {
  const shape = element?.type === 'shape' || element?.type === 'text' ? element : null
  const currentKind = shape?.presetGeometry
  const currentStyle = currentPptxShapeStyle(element)
  const sourceKey = JSON.stringify([
    version,
    slide,
    target?.el,
    currentKind,
    shape?.fill,
    shape?.stroke,
  ])
  const [section, setSection] = useState<'shapes' | 'styles'>('shapes')
  const [category, setCategory] = useState('rects')
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState({
    sourceKey,
    kind: currentKind ?? 'rect',
    style: currentStyle?.key ?? '',
  })
  const selected =
    draft.sourceKey === sourceKey
      ? draft
      : { sourceKey, kind: currentKind ?? 'rect', style: currentStyle?.key ?? '' }
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [feedback, setFeedback] = useState({ sourceKey, message: '' })
  const status = feedback.sourceKey === sourceKey ? feedback.message : ''
  const setStatus = (message: string) => setFeedback({ sourceKey, message })
  const chosenStyle = PPTX_SHAPE_STYLES.find((style) => style.key === selected.style)
  const query = search.trim().toLowerCase()
  const groups = PPTX_SHAPE_GROUPS.filter(
    (group) => query || category === 'all' || category === group.key,
  )
    .map((group) => ({
      key: group.key,
      label: group.label,
      shapes: group.shapes.filter(
        (item) => !query || `${item.label} ${item.kind}`.toLowerCase().includes(query),
      ),
    }))
    .filter((group) => group.shapes.length)
  const pickKind = (kind: string) => {
    setDraft({ ...selected, kind })
    setStatus('')
  }
  const pickStyle = (style: string) => {
    setDraft({ ...selected, style })
    setStatus('')
  }
  const run = async (ops: Record<string, unknown>[]) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setStatus('')
    try {
      const applied = await applyOps(ops)
      setStatus(applied ? '已应用到当前幻灯片' : '修改未应用，已保留所选草稿')
    } catch {
      setStatus('修改未应用，请重试；已保留所选草稿')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  const canChange =
    !!target &&
    !!shape?.presetGeometry &&
    !isPptxLineKind(selected.kind) &&
    !/^(line|straightConnector|bentConnector|curvedConnector)/.test(shape.presetGeometry)
  const insertKind = PPTX_INSERT_SHAPE_KINDS.find((kind) => kind === selected.kind)
  const canInsert = PPTX_SHAPES.some((item) => item.kind === selected.kind)
  const adjustments =
    shape?.adjust ??
    (currentKind === 'roundRect'
      ? { adj: 16667 }
      : ['rightArrow', 'chevron'].includes(currentKind ?? '')
        ? { adj1: 50000, adj2: 50000 }
        : {})
  return (
    <fieldset className="mimir-pptx-shape-editor" disabled={busy} aria-busy={busy}>
      <div
        className="mimir-pptx-shape-editor__tabs"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next =
            event.key === 'Home'
              ? 'shapes'
              : event.key === 'End'
                ? 'styles'
                : section === 'shapes'
                  ? 'styles'
                  : 'shapes'
          setSection(next)
          const tabs = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
          tabs[next === 'shapes' ? 0 : 1]?.focus()
        }}
      >
        <ToolbarTabs
          label="形状工具分类"
          value={section}
          onChange={setSection}
          items={[
            { value: 'shapes', label: '形状图库' },
            { value: 'styles', label: '组合样式' },
          ]}
        />
      </div>
      <div
        className="mimir-pptx-shape-editor__content"
        role="tabpanel"
        aria-label={section === 'shapes' ? '形状图库' : '组合样式'}
        onKeyDownCapture={(event) => {
          if (
            event.key === 'Escape' &&
            search &&
            event.target instanceof HTMLInputElement &&
            event.target.getAttribute('aria-label') === '搜索形状'
          ) {
            event.preventDefault()
            event.stopPropagation()
            setSearch('')
          }
        }}
      >
        {section === 'shapes' ? (
          <>
            <ToolbarMenuNote>
              当前形状：{shape ? pptxShapeLabel(currentKind) : '未选择形状'}
            </ToolbarMenuNote>
            <ToolbarTextField
              label="搜索形状"
              value={search}
              onChange={setSearch}
              placeholder="名称或几何类型"
            />
            <ToolbarSelect
              label="形状分类"
              disabled={busy}
              value={category}
              options={[
                { value: 'all', label: '全部分类' },
                ...PPTX_SHAPE_GROUPS.map((group) => ({
                  value: group.key,
                  label: `${group.label}（${group.shapes.length}）`,
                })),
              ]}
              onChange={setCategory}
            />
            {!groups.length && <ToolbarMenuNote>没有匹配的形状，请更换关键词。</ToolbarMenuNote>}
            {groups.map((group) => (
              <section className="mimir-pptx-shape-group" key={group.key} aria-label={group.label}>
                <h3>{group.label}</h3>
                <Gallery
                  label={`${group.label}形状`}
                  value={selected.kind}
                  onChange={pickKind}
                  items={group.shapes.map((item) => ({
                    key: item.kind,
                    label: item.label,
                    content: (
                      <>
                        <PptxShapePreview kind={item.kind} />
                        <span className="mimir-pptx-shape-cell__label">{item.label}</span>
                      </>
                    ),
                  }))}
                />
              </section>
            ))}
            {isPptxLineKind(selected.kind) && (
              <ToolbarMenuNote>线条用于插入连接线，不能替换已有形状几何。</ToolbarMenuNote>
            )}
            {shape &&
              target &&
              Object.entries(adjustments).map(([key, value]) => (
                <ToolbarNumberField
                  key={key}
                  label={`形状调节 ${key}`}
                  value={value}
                  min={-1000000}
                  max={1000000}
                  step={1000}
                  onCommit={(next) =>
                    void run([
                      { op: 'setShapeAdjust', target, adjust: { ...shape.adjust, [key]: next } },
                    ])
                  }
                />
              ))}
          </>
        ) : (
          <>
            <ToolbarMenuNote>
              当前样式：{shape ? (currentStyle?.label ?? '自定义样式') : '未选择形状'}
            </ToolbarMenuNote>
            {!shape && (
              <ToolbarMenuNote>先在画布选择形状或文本框，再应用填充与描边组合。</ToolbarMenuNote>
            )}
            {PPTX_SHAPE_STYLE_ROWS.map((row) => (
              <section className="mimir-pptx-shape-group" key={row.key} aria-label={row.label}>
                <h3>{row.label}</h3>
                <Gallery
                  label={`${row.label}样式`}
                  value={selected.style}
                  onChange={pickStyle}
                  items={PPTX_SHAPE_STYLES.filter((style) => style.row === row.key).map(
                    (style) => ({
                      key: style.key,
                      label: style.label,
                      content: (
                        <>
                          <PptxShapePreview
                            kind={
                              currentKind &&
                              !isPptxLineKind(currentKind) &&
                              pptxShapePreview(currentKind)
                                ? currentKind
                                : 'roundRect'
                            }
                            style={style}
                          />
                          <span className="mimir-pptx-shape-cell__label">{style.colorLabel}</span>
                        </>
                      ),
                    }),
                  )}
                />
              </section>
            ))}
          </>
        )}
      </div>
      <div className="mimir-pptx-shape-editor__actions">
        <div className="mimir-pptx-shape-editor__selection">
          {section === 'shapes'
            ? `已选：${pptxShapeLabel(selected.kind)}`
            : `已选：${chosenStyle?.label ?? '请选择组合样式'}`}
        </div>
        {section === 'shapes' ? (
          <div className="mimir-pptx-shape-editor__insertion">
            {onDrawShape && (
              <ToolbarButton
                label="在画布绘制所选形状"
                primary
                disabled={!canInsert}
                disabledReason="请先从图库选择形状"
                onClick={() => insertKind && onDrawShape(insertKind)}
              />
            )}
            <div className="mimir-pptx-shape-editor__buttons">
              <ToolbarButton
                label="更改选中形状"
                disabled={!canChange || selected.kind === currentKind}
                disabledReason={!canChange ? '先选择预设形状；线条仅用于插入' : '形状类型没有变化'}
                onClick={() =>
                  target && void run([{ op: 'setShapeGeometry', target, prst: selected.kind }])
                }
              >
                更改形状
              </ToolbarButton>
              <ToolbarButton
                label="插入所选形状"
                primary={!onDrawShape}
                disabled={!canInsert}
                disabledReason="请先从图库选择形状"
                onClick={() => void run([pptxInsertShapeOp(selected.kind, slide, width, height)])}
              >
                {onDrawShape ? '直接插入' : undefined}
              </ToolbarButton>
            </div>
            {onDrawShape && (
              <ToolbarMenuNote>在画布点击或拖动；也可直接插入默认位置。</ToolbarMenuNote>
            )}
          </div>
        ) : (
          <ToolbarButton
            label="应用组合样式"
            primary
            disabled={!target || !shape || !chosenStyle || chosenStyle.key === currentStyle?.key}
            disabledReason={!shape ? '先选择形状或文本框' : '请选择不同的组合样式'}
            onClick={() =>
              target &&
              shape &&
              chosenStyle &&
              void run(pptxShapeStyleOps(target, shape, chosenStyle))
            }
          />
        )}
        <div role="status" className="mimir-pptx-shape-editor__status">
          {busy ? '正在应用修改…' : status}
        </div>
      </div>
    </fieldset>
  )
}
