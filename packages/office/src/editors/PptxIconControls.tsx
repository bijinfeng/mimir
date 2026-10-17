import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from 'antd'
import { rasterizePptxSvg } from '../pptx-output.js'
import {
  ToolbarButton,
  ToolbarColorPicker,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import type { PptxUpload } from './PptxAssetControls.js'
import {
  filterPptxIcons,
  PPTX_ICON_COLORS,
  PPTX_ICON_GROUPS,
  PPTX_ICONS,
  pptxIconSvg,
  type PptxIconDefinition,
} from './pptx-icons.js'
import './pptx-icon-controls.css'

function IconPreview({
  icon,
  color = 'currentColor',
  size = 24,
}: {
  icon: PptxIconDefinition
  color?: string
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  )
}

export interface PptxIconControlsProps {
  slide: number
  upload: PptxUpload
  /** Identity of the document and persistent slide path. */
  sourceKey?: string
  version?: number
  disabled?: boolean
  onCancel?: () => void
}

/** Drafts only write on the footer action. The host also guards the upload version. */
export function PptxIconControls({
  slide,
  upload,
  sourceKey = '',
  version = 0,
  disabled = false,
  onCancel,
}: PptxIconControlsProps) {
  const identity = JSON.stringify([sourceKey, slide, version])
  const current = useRef(identity)
  const [draft, setDraft] = useState({ identity, selected: 'star', color: '#404040', size: 72 })
  if (draft.identity !== identity)
    setDraft({ identity, selected: 'star', color: '#404040', size: 72 })
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [busy, setBusy] = useState(false)
  const pending = useRef<symbol | null>(null)
  const rasterizing = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const [feedback, setFeedback] = useState({ identity, message: '' })
  const gallery = useRef<HTMLDivElement>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      pending.current = null
      rasterizing.current?.abort()
    }
  }, [])
  useEffect(() => {
    current.current = identity
    return () => rasterizing.current?.abort()
  }, [identity])
  const selected = PPTX_ICONS.find((icon) => icon.id === draft.selected) ?? PPTX_ICONS[0]!
  const visible = filterPptxIcons(query, category)
  const tabStop = visible.some((icon) => icon.id === selected.id) ? selected.id : visible[0]?.id
  const locked = disabled || busy
  const pick = (id: string) => {
    setDraft({ ...draft, selected: id })
    setFeedback({ identity, message: '' })
  }
  const navigate = (event: KeyboardEvent, index: number) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[event.key]
    if (delta === undefined && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    event.stopPropagation()
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? visible.length - 1
          : Math.max(0, Math.min(visible.length - 1, index + (delta ?? 0)))
    const icon = visible[next]
    if (!icon || locked) return
    pick(icon.id)
    gallery.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }
  const insert = async () => {
    if (pending.current || disabled) return
    const token = Symbol('icon')
    const controller = new AbortController()
    rasterizing.current = controller
    pending.current = token
    setBusy(true)
    setFeedback({ identity, message: '' })
    const valid = () => mounted.current && pending.current === token && current.current === identity
    try {
      const bytes = await rasterizePptxSvg(
        pptxIconSvg(selected, draft.color),
        512,
        512,
        controller.signal,
      )
      // Rasterization may finish after the user changes document, page or version.
      if (!valid()) return
      const ok = await upload(
        { kind: 'picture', slide, widthPt: draft.size, keepCrop: false },
        new File([bytes], `${selected.label}.png`, { type: 'image/png' }),
      )
      if (valid())
        setFeedback({
          identity,
          message: ok ? '已插入图标' : '图标未插入，已保留所选图标。请重试。',
        })
    } catch (cause) {
      if (valid())
        setFeedback({
          identity,
          message: cause instanceof Error ? cause.message : '图标生成失败，请重试',
        })
    } finally {
      if (pending.current === token) {
        pending.current = null
        if (mounted.current) setBusy(false)
      }
    }
  }
  return (
    <fieldset
      className="mimir-pptx-icons"
      disabled={locked}
      aria-busy={busy}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && query && !event.defaultPrevented) {
          event.preventDefault()
          event.stopPropagation()
          setQuery('')
        }
      }}
    >
      <div className="mimir-pptx-icons__filters">
        <ToolbarTextField
          label="搜索图标"
          placeholder="名称或英文关键词"
          value={query}
          onChange={setQuery}
        />
        <ToolbarSelect
          label="图标分类"
          value={category}
          disabled={locked}
          onChange={setCategory}
          options={[
            { value: 'all', label: `全部图标（${PPTX_ICONS.length}）` },
            ...PPTX_ICON_GROUPS.map((group) => ({
              value: group.id,
              label: `${group.label}（${PPTX_ICONS.filter((icon) => icon.group === group.id).length}）`,
            })),
          ]}
        />
      </div>
      <div className="mimir-pptx-icons__body">
        <div ref={gallery} role="radiogroup" aria-label="图标图库">
          {PPTX_ICON_GROUPS.map((group) => {
            const items = visible.filter((icon) => icon.group === group.id)
            return items.length ? (
              <section key={group.id} className="mimir-pptx-icons__group" aria-label={group.label}>
                <h3>{group.label}</h3>
                <div className="mimir-pptx-icons__grid">
                  {items.map((icon) => (
                    <Button
                      key={icon.id}
                      role="radio"
                      aria-label={icon.label}
                      aria-checked={selected.id === icon.id}
                      className="mimir-pptx-icons__cell"
                      color={selected.id === icon.id ? 'primary' : 'default'}
                      variant="outlined"
                      disabled={locked}
                      tabIndex={tabStop === icon.id ? 0 : -1}
                      title={icon.label}
                      onClick={() => pick(icon.id)}
                      onKeyDown={(event) => navigate(event, visible.indexOf(icon))}
                    >
                      <span className="mimir-pptx-icons__cell-content">
                        <IconPreview icon={icon} />
                        <span>{icon.label}</span>
                      </span>
                    </Button>
                  ))}
                </div>
              </section>
            ) : null
          })}
          {!visible.length && (
            <div className="mimir-pptx-icons__empty" role="status">
              没有匹配的图标，请尝试其他关键词。
            </div>
          )}
        </div>
      </div>
      <div className="mimir-pptx-icons__actions">
        <div className="mimir-pptx-icons__chosen">
          <IconPreview icon={selected} color={draft.color} size={36} />
          <span>
            已选：{selected.label}
            <small>
              透明背景 · {draft.size} × {draft.size} 磅
            </small>
          </span>
        </div>
        <div className="mimir-pptx-icons__settings">
          <ToolbarColorPicker
            label="图标颜色"
            value={draft.color}
            disabled={locked}
            options={PPTX_ICON_COLORS.map((value) => ({ value, label: value, swatch: value }))}
            onPick={(color) => setDraft({ ...draft, color })}
          />
          <ToolbarNumberField
            label="图标宽度（磅）"
            value={draft.size}
            min={6}
            max={720}
            disabled={locked}
            onCommit={(size) => setDraft({ ...draft, size })}
          />
        </div>
        <ToolbarMenuNote>插入为透明 PNG，可用图片工具调整。</ToolbarMenuNote>
        <div className="mimir-pptx-icons__buttons">
          {onCancel && (
            <ToolbarButton label="取消插入图标" disabled={busy} onClick={onCancel}>
              取消
            </ToolbarButton>
          )}
          <ToolbarButton
            primary
            label="插入所选图标"
            disabled={locked}
            disabledReason={busy ? '正在生成并插入图标' : '请等待当前操作完成'}
            onClick={() => void insert()}
          />
        </div>
        <div className="mimir-pptx-icons__status" role="status" aria-live="polite">
          {busy ? '正在生成并插入图标…' : feedback.identity === identity ? feedback.message : ''}
        </div>
      </div>
    </fieldset>
  )
}
