import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, LoaderCircle } from 'lucide-react'
import type { PptxManualZoom, PptxZoomMode } from '../../../shared/src/pptx-zoom.js'
import { PPTX_ZOOM_MAX_BASE64, PPTX_ZOOM_MAX_TILES } from '../../../shared/src/pptx-zoom.js'
import { renderSlide, type PptxRenderable } from '../pptx-render.js'
import { pptxZoomGroups, type ZoomSection } from '../pptx-zoom.js'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarPropertyForm,
  ToolbarSelect,
} from '../shell/EditorShell.js'
import { pptxSlideOutline } from './PptxWorkspaceViews.js'
import { pptxZoomSnapshot } from './pptx-zoom-raster.js'
import './pptx-zoom-controls.css'

export const pptxZoomModes = [
  { value: 'slide', label: '幻灯片缩放' },
  { value: 'section', label: '节缩放' },
  { value: 'summary', label: '摘要缩放' },
] as const
export interface PptxZoomControlsProps {
  deck: PptxRenderable
  sections: readonly ZoomSection[]
  slideIndex: number
  version: number
  initialMode?: PptxZoomMode
  disabled?: boolean
  applyZoom(input: PptxManualZoom, signal: AbortSignal): Promise<boolean>
  /** Injection for focused component tests; production always uses the current-canvas rasterizer. */
  snapshot?: typeof pptxZoomSnapshot
}
export function PptxZoomControls(props: PptxZoomControlsProps) {
  return <ZoomEditor key={`${props.version}:${props.slideIndex}`} {...props} />
}
function ZoomEditor({
  deck,
  sections,
  slideIndex,
  initialMode = 'slide',
  disabled,
  applyZoom,
  snapshot = pptxZoomSnapshot,
}: PptxZoomControlsProps) {
  const [mode, setMode] = useState<PptxZoomMode>(initialMode)
  const [selected, setSelected] = useState<string[]>([])
  const [preview, setPreview] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const operation = useRef<AbortController | null>(null)
  useEffect(() => () => operation.current?.abort(), [])
  const slides = deck.slides()
  const titles = useMemo(() => deck.slides().map((slide) => pptxSlideOutline(slide).title), [deck])
  const entries =
    mode === 'section'
      ? pptxZoomGroups(sections, slides.length).map((group) => ({
          index: group.start,
          title: group.name || '默认节',
          detail: `第 ${group.start + 1}–${group.end} 页`,
        }))
      : slides.map((_, index) => ({ index, title: titles[index]!, detail: `第 ${index + 1} 页` }))
  const chosen = entries.filter((entry) => selected.includes(slides[entry.index]!.path))
  const activePreview =
    preview !== null && entries.some((entry) => entry.index === preview)
      ? preview
      : (chosen[0]?.index ?? entries[0]?.index)
  const rendered =
    activePreview === undefined
      ? null
      : renderSlide(deck, activePreview, { fitWidthPx: 320, svgIdPrefix: 'zoom-preview' })
  const select = (index: number) => {
    const path = slides[index]!.path
    setSelected((current) =>
      current.includes(path)
        ? current.filter((item) => item !== path)
        : current.length < PPTX_ZOOM_MAX_TILES
          ? [...current, path]
          : current,
    )
    setPreview(index)
    setError('')
  }
  const insert = async () => {
    if (operation.current || disabled || !chosen.length) return
    const controller = new AbortController()
    operation.current = controller
    setBusy(true)
    setError('')
    try {
      const targets: PptxManualZoom['targets'] = []
      for (const entry of chosen) {
        const png = await snapshot(deck, entry.index, controller.signal)
        if (controller.signal.aborted) return
        targets.push({ slide: entry.index, png })
        if (targets.reduce((sum, item) => sum + item.png.length, 0) > PPTX_ZOOM_MAX_BASE64)
          throw new Error('所选快照总大小过大，请减少幻灯片后重试')
      }
      if (await applyZoom({ mode, slide: slideIndex, targets }, controller.signal)) {
        if (!controller.signal.aborted) setSelected([])
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '插入缩放导航失败，请重试')
    } finally {
      if (operation.current === controller) {
        operation.current = null
        if (!controller.signal.aborted) setBusy(false)
      }
    }
  }
  return (
    <fieldset className="mimir-pptx-zoom" disabled={busy || disabled} aria-busy={busy}>
      <div className="mimir-pptx-zoom__content">
        <ToolbarPropertyForm columns={1}>
          <ToolbarMenuFields label="缩放导航类型">
            <ToolbarSelect
              label="缩放导航类型"
              value={mode}
              options={[...pptxZoomModes]}
              onChange={(value) => {
                setMode(value as PptxZoomMode)
                setSelected([])
                setPreview(null)
                setError('')
              }}
            />
            <ToolbarMenuNote>
              {mode === 'summary'
                ? '在首张所选幻灯片前新增摘要页，并为所选页面建立分节。'
                : mode === 'section'
                  ? '在当前页插入所选节的首页快照，放映时点击可跳转到该节。'
                  : '在当前页插入目标页快照，放映时点击快照跳转。'}
            </ToolbarMenuNote>
          </ToolbarMenuFields>
          <ToolbarMenuFields label={mode === 'section' ? '选择目标节' : '选择目标幻灯片'}>
            <ToolbarMenuNote>
              已选 {chosen.length} / {PPTX_ZOOM_MAX_TILES}
              {mode !== 'summary' ? ` · 插入第 ${slideIndex + 1} 页` : ''}
            </ToolbarMenuNote>
            {entries.length ? (
              <div
                className="mimir-pptx-zoom__list"
                role="group"
                aria-label={mode === 'section' ? '目标节列表' : '目标幻灯片列表'}
              >
                {entries.map((entry) => {
                  const checked = selected.includes(slides[entry.index]!.path)
                  return (
                    <ToolbarButton
                      key={slides[entry.index]!.path}
                      label={`选择${entry.detail}：${entry.title}`}
                      active={checked}
                      disabled={!checked && chosen.length >= PPTX_ZOOM_MAX_TILES}
                      disabledReason="每次最多插入24个缩放导航"
                      onClick={() => select(entry.index)}
                    >
                      <span className="mimir-pptx-zoom__entry">
                        <span className="mimir-pptx-zoom__entry-title">{entry.title}</span>
                        <span className="mimir-pptx-zoom__entry-detail">
                          {entry.detail}
                          {checked ? ' · 已选' : ''}
                        </span>
                      </span>
                    </ToolbarButton>
                  )
                })}
              </div>
            ) : (
              <ToolbarMenuNote>
                当前演示文稿尚未分节。请先使用“管理分节”添加节，或选择“幻灯片缩放”。
              </ToolbarMenuNote>
            )}
          </ToolbarMenuFields>
          {rendered && (
            <ToolbarMenuFields label={`快照预览 · 第 ${activePreview! + 1} 页`}>
              <div
                className="mimir-pptx-zoom__preview"
                aria-label={`第 ${activePreview! + 1} 页快照预览`}
                dangerouslySetInnerHTML={{ __html: rendered.svg }}
              />
            </ToolbarMenuFields>
          )}
          {error && (
            <div role="alert">
              <ToolbarMenuNote>{error}</ToolbarMenuNote>
            </div>
          )}
        </ToolbarPropertyForm>
      </div>
      <div className="mimir-pptx-zoom__actions">
        <ToolbarButton
          primary
          label="插入缩放导航"
          disabled={busy || disabled || chosen.length === 0}
          disabledReason={busy ? '正在生成快照并插入' : '请先选择目标页或节'}
          onClick={() => void insert()}
        >
          {busy ? (
            <LoaderCircle size={14} aria-hidden="true" />
          ) : (
            <ImagePlus size={14} aria-hidden="true" />
          )}
        </ToolbarButton>
        <ToolbarButton
          label="清除缩放目标选择"
          disabled={busy || chosen.length === 0}
          onClick={() => setSelected([])}
        >
          清除选择
        </ToolbarButton>
      </div>
    </fieldset>
  )
}
