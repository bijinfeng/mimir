import { useEffect, useMemo, useState } from 'react'
import { removeBackground } from '../../vendor/apps/slides/src/renderer/cutout.js'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarSelect,
} from '../shell/EditorShell.js'
import { PptxControlPanel } from './PptxControlPanel.js'
import type { PptxUpload } from './PptxAssetControls.js'

export { PptxIconControls } from './PptxIconControls.js'

export function PptxCutoutControls({
  slide,
  elementId,
  source,
  upload,
}: {
  slide: number
  elementId: string
  source: string
  upload: PptxUpload
}) {
  const [tolerance, setTolerance] = useState(20),
    [mode, setMode] = useState('removed')
  const [original, setOriginal] = useState<ImageData | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.addEventListener(
      'load',
      () => {
        if (cancelled) return
        if (image.naturalWidth * image.naturalHeight > 12_000_000) {
          setMessage('图片超过 1200 万像素，请先缩小后重试')
          return
        }
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return
        ctx.drawImage(image, 0, 0)
        setOriginal(ctx.getImageData(0, 0, canvas.width, canvas.height))
      },
      { once: true },
    )
    image.addEventListener(
      'error',
      () => {
        if (!cancelled) setMessage('无法解码原图，请重新选择图片')
      },
      { once: true },
    )
    image.src = source
    return () => {
      cancelled = true
    }
  }, [source])
  const preview = useMemo(() => {
    if (!original) return ''
    const result = removeBackground(original, tolerance)
    const canvas = document.createElement('canvas')
    canvas.width = original.width
    canvas.height = original.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.putImageData(new ImageData(result.data, original.width, original.height), 0, 0)
    return canvas.toDataURL('image/png')
  }, [original, tolerance])
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="图片去背景">
        <ToolbarNumberField
          label="颜色容差（%）"
          value={tolerance}
          min={0}
          max={100}
          step={5}
          onCommit={setTolerance}
        />
        <ToolbarSelect
          label="预览"
          disabled={busy}
          value={mode}
          options={[
            { value: 'removed', label: '处理结果' },
            { value: 'original', label: '原图' },
          ]}
          onChange={setMode}
        />
        <div className="mimir-pptx-cutout-preview">
          {(preview || source) && (
            <img alt="去背景预览" src={mode === 'original' ? source : preview || source} />
          )}
        </div>
        <ToolbarMenuNote>
          移除与图片边缘相连的相近颜色。适合纯色背景；增加容差会移除更多颜色。应用保留原尺寸、位置、裁切和效果。结果为静态
          PNG，GIF 或 WebP 动画仅使用当前画面。
        </ToolbarMenuNote>
      </ToolbarMenuFields>
      <ToolbarButton
        primary
        label="应用去背景"
        disabled={!preview || !original}
        disabledReason="正在准备图片预览"
        onClick={() => {
          setBusy(true)
          void (async () => {
            const bytes = Uint8Array.from(atob(preview.split(',')[1]!), (c) => c.charCodeAt(0))
            if (
              await upload(
                { kind: 'picture', slide, elementId, widthPt: 72, keepCrop: true },
                new File([bytes], 'cutout.png', { type: 'image/png' }),
              )
            )
              setMessage('已应用去背景')
          })()
            .catch((cause: unknown) =>
              setMessage(cause instanceof Error ? cause.message : '去背景失败'),
            )
            .finally(() => setBusy(false))
        }}
      />
      {message && <span role="status">{message}</span>}
    </PptxControlPanel>
  )
}
