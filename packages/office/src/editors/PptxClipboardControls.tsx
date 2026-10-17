import { useLayoutEffect, useRef, useState } from 'react'
import { Checkbox } from 'antd'
import { ClipboardPaste, Copy, Scissors, ImagePlus } from 'lucide-react'
import { pptxManualAssetSchema, type PptxManualAsset } from '@mimir/shared'
import type { SlideElement } from '../../vendor/packages/pptx-engine/src/types.js'
import { pptxClipboardTargets, type PptxClipboardTarget } from '../pptx-selection-clipboard.js'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarSelect,
} from '../shell/EditorShell.js'
import { readPptxSystemClipboardImage } from '../pptx-system-clipboard.js'
import './pptx-clipboard-controls.css'

type Clip = {
  ref: string
  kind: 'elements' | 'slide' | 'slides'
  count: number
  itemCount: number
  groupWrapperCount: number
}
const STORAGE_KEY = 'mimir.pptx.internal-clipboard'
const CLIPBOARD_EVENT = 'mimir:pptx-clipboard'
let fallbackClip: Clip | null = null
function validatedClip(value: Record<string, unknown> | null): Clip | null {
  if (
    !value ||
    (value.kind !== 'elements' && value.kind !== 'slide' && value.kind !== 'slides') ||
    typeof value.ref !== 'string'
  )
    return null
  try {
    pptxManualAssetSchema.parse(
      value.kind === 'elements'
        ? { kind: 'paste_elements', slide: 0, ref: value.ref }
        : { kind: 'paste_slide', afterIndex: 0, ref: value.ref },
    )
    const count = Number(value.count),
      itemCount = Number(value.itemCount ?? count),
      groupWrapperCount = Number(value.groupWrapperCount ?? 0)
    if (
      ![count, itemCount].every((n) => Number.isInteger(n) && n >= 1 && n <= 100) ||
      !Number.isInteger(groupWrapperCount) ||
      groupWrapperCount < 0 ||
      groupWrapperCount > itemCount
    )
      return null
    return { ref: value.ref, kind: value.kind, count, itemCount, groupWrapperCount }
  } catch {
    return null
  }
}
/** Editor publishes accepted cut data before updating its version/selection and invalidating the old panel. */
export function publishPptxClipboardResult(data: Record<string, unknown>): Clip | null {
  const clip = validatedClip(data)
  if (!clip) return null
  fallbackClip = clip
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(clip))
  } catch {
    /* Keep this window's in-memory copy. */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CLIPBOARD_EVENT))
  return clip
}
function readClip(): Clip | null {
  try {
    return validatedClip(
      JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as Record<string, unknown> | null,
    )
  } catch {
    return fallbackClip
  }
}
export interface PptxClipboardControlsProps {
  slide: number
  slideCount: number
  slideNames?: readonly string[]
  insertSystemImage?: (file: File, signal: AbortSignal) => Promise<boolean>
  elements?: readonly SlideElement[]
  selectedRefs?: readonly string[]
  elementId?: string | null
  contextKey?: string
  disabled?: boolean
  execute: (
    input: PptxManualAsset,
    options: { signal: AbortSignal },
  ) => Promise<Record<string, unknown> | null>
}
export function PptxClipboardControls({
  slide,
  slideCount,
  slideNames,
  insertSystemImage,
  elements,
  selectedRefs,
  elementId = null,
  contextKey,
  disabled = false,
  execute,
}: PptxClipboardControlsProps) {
  const refs = selectedRefs ?? (elementId ? [elementId] : [])
  const context = contextKey ?? JSON.stringify([slide, refs])
  const liveContext = useRef(context)
  const pending = useRef<AbortController | null>(null)
  const [kind, setKind] = useState(refs.length ? 'element' : 'slide')
  const [clip, setClip] = useState(readClip)
  const [slides, setSlides] = useState<number[]>([slide])
  const [sourceStyle, setSourceStyle] = useState('destination')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [shownContext, setShownContext] = useState(context)
  if (shownContext !== context) {
    setShownContext(context)
    setBusy(false)
    setMessage('')
    setError('')
    setClip(readClip())
    setSlides([slide])
  }
  useLayoutEffect(() => {
    liveContext.current = context
    pending.current?.abort()
    pending.current = null
    return () => {
      pending.current?.abort()
    }
  }, [context])
  useLayoutEffect(() => {
    const update = () => setClip(readClip())
    window.addEventListener(CLIPBOARD_EVENT, update)
    return () => window.removeEventListener(CLIPBOARD_EVENT, update)
  }, [])
  let targets: PptxClipboardTarget[] = []
  let selectionError = ''
  try {
    if (elements && refs.length) targets = pptxClipboardTargets(elements, refs)
    else if (refs.length) targets = refs.map((ref) => ({ elementId: ref }))
  } catch (cause) {
    selectionError = cause instanceof Error ? cause.message : '请重新选择对象'
  }
  const groupCount = new Set(targets.flatMap((target) => (target.group ? [target.group] : []))).size
  const locked = disabled || busy
  const noSelection =
    (kind === 'element' && (!targets.length || !!selectionError)) ||
    (kind === 'slides' && (!slides.length || slides.length > 40))
  const slideInput = (cut: boolean): PptxManualAsset =>
    kind === 'slides'
      ? { kind: cut ? 'cut_slides' : 'copy_slides', slides }
      : { kind: cut ? 'cut_slide' : 'copy_slide', slide }
  const run = async (input: PptxManualAsset) => {
    if (disabled || pending.current) return
    const controller = new AbortController(),
      startedAt = context
    pending.current = controller
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const data = await execute(input, { signal: controller.signal })
      if (controller.signal.aborted || liveContext.current !== startedAt) return
      if (!data) {
        setError('操作未完成，原有复制内容已保留，请重试。')
        return
      }
      const next = publishPptxClipboardResult(data)
      if (next) {
        setClip(next)
        setMessage(
          input.kind.startsWith('cut_')
            ? '已剪切，可粘贴到其他位置。'
            : '已复制，可粘贴到其他位置。',
        )
      } else setMessage('已粘贴，可继续编辑新对象。')
    } catch (cause) {
      if (!controller.signal.aborted && liveContext.current === startedAt)
        setError(cause instanceof Error ? cause.message : '复制粘贴失败，请重试。')
    } finally {
      if (pending.current === controller) {
        pending.current = null
        setBusy(false)
      }
    }
  }
  const selectionInput = (action: 'copy_elements' | 'cut_elements'): PptxManualAsset =>
    elements
      ? { kind: action, slide, targets }
      : { kind: action, slide, elementIds: targets.map((target) => target.elementId) }
  return (
    <fieldset className="mimir-pptx-clipboard" aria-busy={busy}>
      <div className="mimir-pptx-clipboard__content">
        <ToolbarMenuFields label="复制范围">
          <ToolbarSelect
            label="复制内容"
            value={kind}
            disabled={locked}
            options={[
              { value: 'element', label: `所选对象（${targets.length}个）` },
              { value: 'slide', label: `当前幻灯片（第${slide + 1}页）` },
              { value: 'slides', label: `多张幻灯片（已选${slides.length}页）` },
            ]}
            onChange={setKind}
          />
          {kind === 'element' && (
            <ToolbarMenuNote>
              {selectionError ||
                (targets.length
                  ? `当前选择 ${targets.length} 个对象${groupCount ? `，来自 ${groupCount} 个组合的成员以独立组合粘贴。` : '，整组对象保持整组。'}`
                  : '先在画布或对象列表选择要复制的对象。')}
            </ToolbarMenuNote>
          )}
          {kind === 'slides' && (
            <>
              <div
                className="mimir-pptx-clipboard__pages"
                role="group"
                aria-label="选择复制的幻灯片"
              >
                <Checkbox.Group
                  value={slides}
                  disabled={locked}
                  options={Array.from({ length: slideCount }, (_, index) => ({
                    value: index,
                    label: `第${index + 1}页${slideNames?.[index] ? ` · ${slideNames[index]}` : ''}`,
                  }))}
                  onChange={(values) => setSlides(values.map(Number).toSorted((a, b) => a - b))}
                />
              </div>
              <ToolbarMenuNote>
                按原顺序复制，最多40页；页面间跳转请将目标页一起选择。备注随页面保留。
              </ToolbarMenuNote>
            </>
          )}
          <div className="mimir-pptx-clipboard-actions">
            <ToolbarButton
              label={kind === 'element' ? '复制对象' : '复制幻灯片'}
              disabled={locked || noSelection}
              disabledReason={selectionError || '请先选择可复制对象'}
              onClick={() =>
                void run(kind === 'element' ? selectionInput('copy_elements') : slideInput(false))
              }
            >
              <Copy size={14} />
              <span>复制</span>
            </ToolbarButton>
            <ToolbarButton
              label={kind === 'element' ? '剪切对象' : '剪切幻灯片'}
              disabled={
                locked ||
                noSelection ||
                (kind !== 'element' &&
                  (kind === 'slides' ? slides.length >= slideCount : slideCount <= 1))
              }
              disabledReason={
                noSelection
                  ? selectionError || '请先选择可复制对象'
                  : '至少保留一张幻灯片，最后一页可复制'
              }
              onClick={() =>
                void run(kind === 'element' ? selectionInput('cut_elements') : slideInput(true))
              }
            >
              <Scissors size={14} />
              <span>剪切</span>
            </ToolbarButton>
          </div>
        </ToolbarMenuFields>
        <ToolbarMenuFields label="已复制内容">
          <ToolbarMenuNote>
            {clip
              ? clip.kind !== 'elements'
                ? `${clip.count} 张幻灯片，将按原顺序插在当前页之后。`
                : `${clip.count} 个所选对象，将作为 ${clip.itemCount} 个顶层对象粘贴到当前页并稍微错开。${clip.groupWrapperCount ? `其中 ${clip.groupWrapperCount} 个为独立组合。` : ''}`
              : '尚未复制内容。'}
          </ToolbarMenuNote>
          {clip && clip.kind !== 'elements' && (
            <ToolbarSelect
              label="粘贴格式"
              value={sourceStyle}
              disabled={locked}
              options={[
                { value: 'destination', label: '使用目标主题' },
                { value: 'source', label: '保留源格式' },
              ]}
              onChange={setSourceStyle}
            />
          )}
          <ToolbarMenuNote>
            内部复制有效15分钟；系统标记写入成功后，可在画布用复制、剪切、粘贴快捷键。对象粘贴使用目标主题，不携带动画；组内成员以独立组合粘贴。附着连接线、跳转引用和外链媒体须先解除。
          </ToolbarMenuNote>
        </ToolbarMenuFields>
        {insertSystemImage && (
          <ToolbarMenuFields label="系统图片">
            <ToolbarMenuNote>
              从系统剪贴板读取一张 PNG 或 JPEG（≤8 MiB），也可直接拖入画布。读取需浏览器授权。
            </ToolbarMenuNote>
            <ToolbarButton
              label="粘贴系统图片"
              disabled={locked}
              onClick={() => {
                if (disabled || pending.current) return
                const controller = new AbortController(),
                  startedAt = context
                pending.current = controller
                setBusy(true)
                setError('')
                setMessage('')
                void readPptxSystemClipboardImage(controller.signal)
                  .then(async (file) => {
                    if (controller.signal.aborted || liveContext.current !== startedAt) return
                    await insertSystemImage(file, controller.signal)
                  })
                  .catch((cause: unknown) => {
                    if (!controller.signal.aborted && liveContext.current === startedAt)
                      setError(cause instanceof Error ? cause.message : '系统图片粘贴失败')
                  })
                  .finally(() => {
                    if (pending.current === controller) {
                      pending.current = null
                      setBusy(false)
                    }
                  })
              }}
            >
              <ImagePlus size={14} />
              <span>粘贴系统图片</span>
            </ToolbarButton>
            <ToolbarButton
              label="取消图片读取"
              disabled={!busy}
              onClick={() => {
                pending.current?.abort()
                pending.current = null
                setBusy(false)
                setMessage('已取消读取')
              }}
            >
              <span>取消读取</span>
            </ToolbarButton>
          </ToolbarMenuFields>
        )}
      </div>
      <div className="mimir-pptx-clipboard__actions">
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <ToolbarButton
          primary
          label={
            busy ? '正在处理剪贴板' : clip && clip.kind !== 'elements' ? '粘贴幻灯片' : '粘贴对象'
          }
          disabled={locked || !clip}
          disabledReason={locked ? '正在处理修改' : '请先复制对象或幻灯片'}
          onClick={() => {
            if (clip)
              void run(
                clip.kind !== 'elements'
                  ? {
                      kind: clip.kind === 'slides' ? 'paste_slides' : 'paste_slide',
                      afterIndex: slide,
                      ref: clip.ref,
                      keepSourceFormatting: sourceStyle === 'source',
                    }
                  : { kind: 'paste_elements', slide, ref: clip.ref, dx: 190500, dy: 190500 },
              )
          }}
        >
          <ClipboardPaste size={14} />
        </ToolbarButton>
      </div>
    </fieldset>
  )
}
