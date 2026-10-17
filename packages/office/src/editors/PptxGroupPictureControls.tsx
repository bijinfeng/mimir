import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ImagePlus, RotateCcw } from 'lucide-react'
import {
  PPTX_PICTURE_ACCEPT,
  PPTX_PICTURE_FORMATS,
  type PptxManualPicture,
  type PptxManualUpload,
} from '@mimir/shared'
import { usePptxPicturePreview } from './use-pptx-picture-preview.js'
import type { PictureElement } from '../../vendor/packages/pptx-engine/src/types.js'
import { removeBackground } from '../../vendor/apps/slides/src/renderer/cutout.js'
import { pptxGroupPicturePreviewFrame } from './pptx-group-picture-preview.js'
import {
  ToolbarButton,
  ToolbarFileButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarPropertyForm,
  ToolbarToggleGroup,
} from '../shell/EditorShell.js'
import './pptx-group-picture-controls.css'

type Crop = { l: number; t: number; r: number; b: number }
const edges = [
  ['l', '左'],
  ['r', '右'],
  ['t', '上'],
  ['b', '下'],
] as const
const emptyCrop: Crop = { l: 0, r: 0, t: 0, b: 0 }
export interface PptxGroupPictureControlsProps {
  element: PictureElement
  groupName: string
  target: { slide: number; group: string; elementId: string }
  source: string
  disabled?: boolean
  canUpload?: boolean
  apply: (input: PptxManualPicture, signal: AbortSignal) => Promise<boolean>
  upload: (input: PptxManualUpload, file: File, signal: AbortSignal) => Promise<boolean>
}
/** Parent keys this draft to document, slide, durable selection and published version. */
export function PptxGroupPictureControls({
  element,
  groupName,
  target,
  source,
  disabled = false,
  canUpload = true,
  apply,
  upload,
}: PptxGroupPictureControlsProps) {
  const [tab, setTab] = useState('appearance')
  const currentOpacity = (element.opacity ?? 1) * 100
  const currentCrop = element.srcRect ?? emptyCrop
  const [opacity, setOpacity] = useState(currentOpacity)
  const [crop, setCrop] = useState<Crop>(
    () => Object.fromEntries(edges.map(([key]) => [key, currentCrop[key] * 100])) as Crop,
  )
  const [cropTouched, setCropTouched] = useState(false)
  const picturePreview = usePptxPicturePreview()
  const file = picturePreview.selected?.file ?? null
  const fileSource = picturePreview.selected?.url ?? ''
  const [decoded, setDecoded] = useState<{
    source: string
    data?: ImageData
    error?: string
  } | null>(null)
  const original = decoded?.source === source ? (decoded.data ?? null) : null
  const decodeError = decoded?.source === source ? (decoded.error ?? '') : ''
  const [tolerance, setTolerance] = useState(20)
  const [previewMode, setPreviewMode] = useState('result')
  const [busy, setBusy] = useState(false)
  const [numericDraft, setNumericDraft] = useState(false)
  const [error, setError] = useState('')
  const [failedSource, setFailedSource] = useState('')
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => {
    if (tab !== 'cutout' || !source) return
    let cancelled = false
    const image = new Image()
    const load = () => {
      if (cancelled) return
      try {
        if (!image.naturalWidth || !image.naturalHeight)
          throw new Error('原图尺寸无效，请重新选择图片')
        if (image.naturalWidth * image.naturalHeight > 12_000_000)
          throw new Error('图片超过 1200 万像素，请先缩小后重试')
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('无法准备图片预览，请重新打开面板')
        context.drawImage(image, 0, 0)
        setDecoded({ source, data: context.getImageData(0, 0, canvas.width, canvas.height) })
      } catch (cause) {
        setDecoded({
          source,
          error: cause instanceof Error ? cause.message : '无法读取原图，请重新选择图片',
        })
      }
    }
    const failed = () => {
      if (!cancelled) setDecoded({ source, error: '无法解码原图，请重新选择图片' })
    }
    image.addEventListener('load', load, { once: true })
    image.addEventListener('error', failed, { once: true })
    image.src = source
    return () => {
      cancelled = true
      image.removeEventListener('load', load)
      image.removeEventListener('error', failed)
    }
  }, [source, tab])
  const cutout = useMemo(() => {
    if (!original) return ''
    try {
      const result = removeBackground(original, tolerance)
      const canvas = document.createElement('canvas')
      canvas.width = original.width
      canvas.height = original.height
      const context = canvas.getContext('2d')
      if (!context) return ''
      context.putImageData(new ImageData(result.data, original.width, original.height), 0, 0)
      return canvas.toDataURL('image/png')
    } catch {
      return ''
    }
  }, [original, tolerance])
  const validCrop =
    edges.every(([key]) => Number.isFinite(crop[key]) && crop[key] >= 0 && crop[key] < 100) &&
    crop.l + crop.r < 100 &&
    crop.t + crop.b < 100
  const cropChanged = cropTouched && edges.some(([key]) => crop[key] !== currentCrop[key] * 100)
  const appearanceDirty = opacity !== currentOpacity || cropChanged
  const locked = disabled || busy
  const cancel = () => {
    pending.current?.abort()
    pending.current = null
    picturePreview.cancel()
    setBusy(false)
    setNumericDraft(false)
    setError('')
  }
  const reset = () => {
    cancel()
    setOpacity(currentOpacity)
    setCrop(Object.fromEntries(edges.map(([key]) => [key, currentCrop[key] * 100])) as Crop)
    setCropTouched(false)
    picturePreview.clear()
    setTolerance(20)
  }
  const submit = async () => {
    if (
      locked ||
      picturePreview.preparing ||
      pending.current ||
      (tab === 'appearance' && (!appearanceDirty || !validCrop)) ||
      (tab === 'replace' && !file) ||
      (tab === 'cutout' && !cutout)
    )
      return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setError('')
    try {
      let ok = false
      if (tab === 'appearance') {
        const input: PptxManualPicture = { ...target }
        if (opacity !== currentOpacity) input.opacity = opacity / 100
        if (cropChanged)
          input.srcRect = edges.every(([key]) => crop[key] === 0)
            ? null
            : (Object.fromEntries(edges.map(([key]) => [key, crop[key] / 100])) as Crop)
        ok = await apply(input, controller.signal)
      } else {
        const selected =
          tab === 'replace'
            ? file!
            : new File(
                [Uint8Array.from(atob(cutout.split(',')[1]!), (char) => char.charCodeAt(0))],
                'cutout.png',
                { type: 'image/png' },
              )
        ok = await upload(
          { kind: 'picture', ...target, widthPt: 72, keepCrop: tab === 'cutout' },
          selected,
          controller.signal,
        )
      }
      if (!controller.signal.aborted && !ok) setError('图片未应用，已保留草稿，请重试')
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '图片未应用，已保留草稿，请重试')
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null
        setBusy(false)
      }
    }
  }
  const visibleSource =
    tab === 'replace'
      ? fileSource || source
      : tab === 'cutout' && previewMode === 'result'
        ? cutout || source
        : source
  const previewFailed = !!visibleSource && failedSource === visibleSource
  const cutoutError =
    decodeError || (original && !cutout ? '无法生成去背景预览，请重新打开面板后重试' : '')
  const applyLabel =
    tab === 'appearance' ? '应用修改' : tab === 'replace' ? '替换图片' : '应用去背景'
  const canApply =
    tab === 'appearance'
      ? appearanceDirty && validCrop
      : tab === 'replace'
        ? !!file && !picturePreview.preparing
        : !!cutout
  const previewCrop =
    tab === 'appearance'
      ? crop
      : tab === 'replace'
        ? emptyCrop
        : (Object.fromEntries(edges.map(([key]) => [key, currentCrop[key] * 100])) as Crop)
  return (
    <section
      className="mimir-pptx-group-picture"
      aria-label="组合图片编辑"
      aria-busy={busy}
      onInputCapture={(event) => {
        if (event.target instanceof HTMLInputElement && event.target.closest('.me-input--num'))
          setNumericDraft(true)
      }}
      onBlurCapture={(event) => {
        if (event.target instanceof HTMLInputElement && event.target.closest('.me-input--num'))
          setNumericDraft(false)
      }}
    >
      <div className="mimir-pptx-group-picture__tabs">
        <ToolbarToggleGroup
          label="组合图片工具"
          value={tab}
          options={[
            { value: 'appearance', label: '外观' },
            { value: 'replace', label: '替换', disabled: !canUpload },
            { value: 'cutout', label: '去背景', disabled: !canUpload },
          ]}
          onChange={(value) => {
            cancel()
            setTab(value)
          }}
        />
      </div>
      <div className="mimir-pptx-group-picture__body">
        <p className="mimir-pptx-group-picture__name">
          {groupName || '组合'} › {element.name || '图片'}
        </p>
        {!canUpload && (
          <ToolbarMenuNote>当前未连接图片素材宿主，替换和去背景暂不可用。</ToolbarMenuNote>
        )}
        <div
          className="mimir-pptx-group-picture__preview"
          aria-label="图片预览"
          data-empty={!visibleSource || previewFailed ? '' : undefined}
          style={
            visibleSource && !previewFailed
              ? pptxGroupPicturePreviewFrame(
                  element.transform.offset.cx,
                  element.transform.offset.cy,
                )
              : undefined
          }
        >
          {visibleSource && !previewFailed ? (
            <img
              alt={tab === 'cutout' && previewMode === 'result' ? '去背景结果预览' : '组合图片预览'}
              src={visibleSource}
              onError={() => {
                setFailedSource(visibleSource)
                if (tab === 'replace' && file) {
                  picturePreview.clear()
                  setError('替换图片无法解码，请重新选择图片')
                }
              }}
              style={{
                opacity: (tab === 'appearance' ? opacity : currentOpacity) / 100,
                width: `${10000 / Math.max(1, 100 - previewCrop.l - previewCrop.r)}%`,
                height: `${10000 / Math.max(1, 100 - previewCrop.t - previewCrop.b)}%`,
                left: `${(-previewCrop.l * 100) / Math.max(1, 100 - previewCrop.l - previewCrop.r)}%`,
                top: `${(-previewCrop.t * 100) / Math.max(1, 100 - previewCrop.t - previewCrop.b)}%`,
              }}
            />
          ) : (
            <ToolbarMenuNote>
              {previewFailed
                ? '图片预览无法加载，请重新选择图片或重新打开文档'
                : '图片源未加载，请重新打开文档后重试'}
            </ToolbarMenuNote>
          )}
        </div>
        <fieldset disabled={locked} className="mimir-pptx-group-picture__fields">
          {tab === 'appearance' && (
            <>
              <ToolbarPropertyForm>
                <ToolbarMenuFields label="图片外观">
                  <ToolbarNumberField
                    label="不透明度（%）"
                    value={opacity}
                    min={0}
                    max={100}
                    step={1}
                    disabled={locked}
                    onCommit={setOpacity}
                  />
                </ToolbarMenuFields>
              </ToolbarPropertyForm>
              <ToolbarPropertyForm>
                <ToolbarMenuFields label="四边裁切">
                  {edges.map(([key, label]) => (
                    <ToolbarNumberField
                      key={key}
                      label={`${label}侧（%）`}
                      value={crop[key]}
                      min={0}
                      max={99.9}
                      step={0.1}
                      disabled={locked}
                      onCommit={(value) => {
                        setCrop((old) => ({ ...old, [key]: value }))
                        setCropTouched(true)
                        setError('')
                      }}
                    />
                  ))}
                </ToolbarMenuFields>
              </ToolbarPropertyForm>
              <ToolbarButton
                label="重置裁切"
                onClick={() => {
                  setCrop({ ...emptyCrop })
                  setCropTouched(true)
                  setError('')
                }}
              >
                <RotateCcw size={14} />
                重置裁切
              </ToolbarButton>
              {!validCrop && <p role="alert">对边裁切之和须小于 100%，请保留可见区域</p>}
              <ToolbarMenuNote>修改后点击应用。组内图片暂不支持画布拖动裁切。</ToolbarMenuNote>
            </>
          )}
          {tab === 'replace' && (
            <>
              <ToolbarFileButton
                label="选择替换图片"
                accept={PPTX_PICTURE_ACCEPT}
                disabled={locked}
                onPick={(picked) => {
                  void picturePreview.choose(picked)
                }}
              >
                <ImagePlus size={14} />
                选择图片
              </ToolbarFileButton>
              {picturePreview.preparing && <ToolbarMenuNote>正在准备图片预览…</ToolbarMenuNote>}
              {picturePreview.error && <p role="alert">{picturePreview.error}</p>}
              {picturePreview.selected?.info.ext === 'tiff' && (
                <ToolbarMenuNote>TIFF 显示尺寸最大的安全页面，保存保留全部页面。</ToolbarMenuNote>
              )}
              {file && <p className="mimir-pptx-group-picture__filename">{file.name}</p>}
              <ToolbarMenuNote>
                支持 {PPTX_PICTURE_FORMATS}，最大 8 MiB。替换保留位置、大小和效果，重置原有裁切。
              </ToolbarMenuNote>
            </>
          )}
          {tab === 'cutout' && (
            <>
              <ToolbarMenuNote>结果为静态 PNG；GIF 或 WebP 动画仅使用当前画面。</ToolbarMenuNote>
              <ToolbarPropertyForm>
                <ToolbarMenuFields label="去背景">
                  <ToolbarNumberField
                    label="颜色容差（%）"
                    value={tolerance}
                    min={0}
                    max={100}
                    step={5}
                    disabled={locked}
                    onCommit={setTolerance}
                  />
                </ToolbarMenuFields>
              </ToolbarPropertyForm>
              <ToolbarToggleGroup
                label="去背景预览"
                value={previewMode}
                options={[
                  { value: 'result', label: '处理结果', disabled: locked },
                  { value: 'original', label: '原图', disabled: locked },
                ]}
                onChange={setPreviewMode}
              />
              <ToolbarMenuNote>
                移除与图片边缘相连的相近颜色，适合纯色背景。输出保留原图尺寸和当前裁切。
              </ToolbarMenuNote>
              {cutoutError && <p role="alert">{cutoutError}</p>}
              {!source && <p role="alert">图片源未加载，无法去背景，请重新打开文档</p>}
              {source && !cutoutError && !cutout && <p role="status">正在准备去背景预览…</p>}
            </>
          )}
        </fieldset>
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="mimir-pptx-group-picture__footer">
        <ToolbarButton
          label={busy ? '正在应用图片' : applyLabel}
          primary
          disabled={locked || (!canApply && !(tab === 'appearance' && numericDraft))}
          disabledReason={busy ? '正在应用图片' : '请先调整参数或准备图片'}
          onClick={() => void submit()}
        >
          <Check size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="取消图片草稿"
          disabled={!busy && !appearanceDirty && !numericDraft && !file && tolerance === 20}
          onClick={reset}
        >
          {busy ? '取消操作' : '取消'}
        </ToolbarButton>
      </div>
    </section>
  )
}
