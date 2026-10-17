import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  ToolbarButton,
  ToolbarFileButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarPropertyForm,
  ToolbarSelect,
} from '../shell/EditorShell.js'
import { CropIcon, ImageIcon } from '../shell/icons.js'
import type { DocxAdvancedContext } from './DocxAdvancedControls.js'
import type { PmDocJson } from '../docx.js'
import { docxImageSaveBaselines } from '../docx-image-save.js'
import {
  DOCX_IMAGE_PX_PER_CM,
  applyDocxImageDraft,
  assertDocxImageTarget,
  decodeDocxImage,
  docxImageDraft,
  processDocxImage,
  readDocxImageFile,
  resizeDocxImage,
  selectedDocxImage,
  type DocxImageDraft,
  type DocxImageInsets,
} from './docx-image.js'
import './docx-picture-controls.css'

const WRAPS = [
  ['', '嵌入文字'],
  ['square-left', '文字在右侧'],
  ['square-right', '文字在左侧'],
  ['topBottom', '上下型'],
  ['behind', '衬于文字下方'],
  ['front', '浮于文字上方'],
  ['tight-left', '紧密型 · 文字在右侧'],
  ['tight-right', '紧密型 · 文字在左侧'],
  ['through-left', '穿越型 · 文字在右侧'],
  ['through-right', '穿越型 · 文字在左侧'],
].map(([value, label]) => ({ value: value!, label: label! }))
const ZERO_CROP: DocxImageInsets = { left: 0, top: 0, right: 0, bottom: 0 }

export function DocxImageControls({ context }: { context: DocxAdvancedContext }) {
  const [target, setTarget] = useState(() => selectedDocxImage(context.editor))
  const [draft, setDraft] = useState<DocxImageDraft | null>(() => target && docxImageDraft(target))
  const [keepRatio, setKeepRatio] = useState(true)
  const [mode, setMode] = useState<'crop' | 'cutout' | null>(null)
  const [insets, setInsets] = useState(ZERO_CROP)
  const [tolerance, setTolerance] = useState(30)
  const [busy, setBusy] = useState(false)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => {
    const check = () => setStale(!!target && context.editor.state.doc !== target.doc)
    context.editor.on('transaction', check)
    return () => {
      context.editor.off('transaction', check)
    }
  }, [context.editor, target])
  if (!target || !draft)
    return <ToolbarMenuNote>请先在正文中选中一张图片，再打开图片格式。</ToolbarMenuNote>
  const locked = busy || stale
  const source = draft.replacement ?? String(target.node.attrs.imageDataUrl ?? '')
  const dirty = JSON.stringify(draft) !== JSON.stringify(docxImageDraft(target))
  const change = (patch: Partial<DocxImageDraft>) => {
    setDraft((value) => value && { ...value, ...patch })
    setError('')
    setStatus('')
  }
  const abort = () => {
    pending.current?.abort()
    pending.current = null
    setBusy(false)
  }
  const prepare = async (file?: File) => {
    if (pending.current || locked) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setError('')
    setStatus('')
    try {
      assertDocxImageTarget(context.editor, target)
      let result: { dataUrl: string; width: number; height: number }
      if (file) {
        const dataUrl = await readDocxImageFile(file, controller.signal)
        const image = await decodeDocxImage(dataUrl, controller.signal)
        result = { dataUrl, width: image.naturalWidth, height: image.naturalHeight }
      } else {
        if (!mode) return
        result = await processDocxImage(
          source,
          mode === 'crop' ? { kind: mode, insets } : { kind: mode, tolerance },
          controller.signal,
        )
      }
      if (controller.signal.aborted) return
      assertDocxImageTarget(context.editor, target)
      change({ replacement: result.dataUrl, height: (draft.width * result.height) / result.width })
      setMode(null)
      setInsets(ZERO_CROP)
      setStatus('预览已更新，点击应用写入文档。')
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '处理图片失败，请重试')
    } finally {
      if (pending.current === controller) {
        pending.current = null
        setBusy(false)
      }
    }
  }
  const submit = () => {
    if (locked) return
    try {
      assertDocxImageTarget(context.editor, target)
      // Preflight native transform structure before publishing the transaction.
      const snapshot = structuredClone(context.editor.getJSON()) as PmDocJson
      for (const node of snapshot.content ?? []) {
        const attrs = node.attrs as Record<string, unknown> | undefined
        if (
          attrs &&
          typeof target.node.attrs.docxIndex === 'number' &&
          attrs.docxIndex === target.node.attrs.docxIndex
        ) {
          Object.assign(attrs, {
            imageRotDeg: draft.rotation,
            imageFlipH: draft.flipH,
            imageFlipV: draft.flipV,
          })
        }
      }
      docxImageSaveBaselines(snapshot, context.session.blocks)
      const next = applyDocxImageDraft(context.editor, target, draft)
      setTarget(next)
      setDraft(docxImageDraft(next))
      setStale(false)
      setError('')
      setStatus(next === target ? '图片没有变化。' : '已应用图片修改，可撤销或保存到库。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '应用图片修改失败')
    }
  }
  const startPixels = (kind: 'crop' | 'cutout') => {
    setMode(kind)
    setError('')
    setStatus('')
    const crop = target.node.attrs.imageCrop as {
      l: number
      t: number
      r: number
      b: number
    } | null
    setInsets(
      !draft.replacement && crop
        ? { left: crop.l * 100, top: crop.t * 100, right: crop.r * 100, bottom: crop.b * 100 }
        : ZERO_CROP,
    )
  }
  const invalidCrop = insets.left + insets.right >= 100 || insets.top + insets.bottom >= 100
  const previewScale = Math.min(1, 160 / Math.max(draft.width, draft.height, 1))
  const sourceRect =
    !mode && !draft.replacement
      ? ((target.node.attrs.imageCrop ?? target.node.attrs.imageFillRect) as {
          l: number
          t: number
          r: number
          b: number
        } | null)
      : null
  const sourceStyle: CSSProperties = mode
    ? {}
    : { width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none', objectFit: 'fill' }
  if (sourceRect) {
    const { l, t, r, b } = sourceRect
    const sx = target.node.attrs.imageCrop ? 1 / Math.max(0.01, 1 - l - r) : 1 - l - r
    const sy = target.node.attrs.imageCrop ? 1 / Math.max(0.01, 1 - t - b) : 1 - t - b
    Object.assign(sourceStyle, {
      position: 'absolute',
      width: `${sx * 100}%`,
      height: `${sy * 100}%`,
      left: `${(target.node.attrs.imageCrop ? -l * sx : l) * 100}%`,
      top: `${(target.node.attrs.imageCrop ? -t * sy : t) * 100}%`,
    })
  }
  return (
    <div className="mimir-docx-picture-tools">
      <div className="mimir-docx-picture-tools__scroll">
        <figure className="mimir-docx-picture-preview">
          <div className="mimir-docx-picture-preview__stage">
            {source ? (
              <div
                className="mimir-docx-picture-preview__image"
                style={
                  mode
                    ? undefined
                    : {
                        width: draft.width * previewScale,
                        height: draft.height * previewScale,
                        overflow: 'hidden',
                        transform: `rotate(${draft.rotation}deg) scale(${draft.flipH ? -1 : 1},${draft.flipV ? -1 : 1})`,
                      }
                }
              >
                <img src={source} alt="选中图片的编辑预览" draggable={false} style={sourceStyle} />
                {mode === 'crop' && !invalidCrop && (
                  <div
                    className="mimir-docx-picture-preview__crop"
                    style={{
                      left: `${insets.left}%`,
                      top: `${insets.top}%`,
                      right: `${insets.right}%`,
                      bottom: `${insets.bottom}%`,
                    }}
                  />
                )}
              </div>
            ) : (
              <ToolbarMenuNote>这张图片没有可读取的预览。</ToolbarMenuNote>
            )}
          </div>
          <figcaption>
            {mode === 'crop'
              ? '亮框内为保留区域'
              : `${(draft.width / DOCX_IMAGE_PX_PER_CM).toFixed(2)} × ${(draft.height / DOCX_IMAGE_PX_PER_CM).toFixed(2)} 厘米`}
          </figcaption>
        </figure>
        <fieldset disabled={locked} className="mimir-docx-picture-tools__fields" aria-busy={busy}>
          <ToolbarPropertyForm>
            {mode ? (
              <ToolbarMenuFields label={mode === 'crop' ? '裁切图片' : '去除背景'}>
                {mode === 'crop' ? (
                  <>
                    {(
                      [
                        ['left', '左侧裁去'],
                        ['right', '右侧裁去'],
                        ['top', '顶部裁去'],
                        ['bottom', '底部裁去'],
                      ] as const
                    ).map(([key, label]) => (
                      <ToolbarNumberField
                        key={key}
                        label={label}
                        value={insets[key]}
                        min={0}
                        max={99}
                        step={1}
                        suffix="%"
                        disabled={locked}
                        onCommit={(value) => setInsets((current) => ({ ...current, [key]: value }))}
                      />
                    ))}
                    <ToolbarMenuNote>按原始图片裁切，旋转和翻转继续保留。</ToolbarMenuNote>
                  </>
                ) : (
                  <>
                    <ToolbarNumberField
                      label="去背景容差"
                      value={tolerance}
                      min={0}
                      max={100}
                      step={1}
                      disabled={locked}
                      onCommit={setTolerance}
                    />
                    <ToolbarMenuNote>
                      按边缘颜色去除相连背景。适合纯色背景；提高容差会扩大去除范围。
                    </ToolbarMenuNote>
                  </>
                )}
                {invalidCrop && mode === 'crop' && (
                  <p role="alert" className="mimir-docx-picture-tools__error">
                    裁切后必须保留图片区域。
                  </p>
                )}
              </ToolbarMenuFields>
            ) : (
              <>
                <ToolbarMenuFields label="尺寸与比例">
                  {(['width', 'height'] as const).map((side) => (
                    <ToolbarNumberField
                      key={side}
                      label={side === 'width' ? '图片宽度' : '图片高度'}
                      value={Number((draft[side] / DOCX_IMAGE_PX_PER_CM).toFixed(2))}
                      min={0.03}
                      max={108.37}
                      step={0.1}
                      suffix="厘米"
                      disabled={locked}
                      onCommit={(value) => {
                        setDraft(
                          (current) =>
                            current &&
                            resizeDocxImage(current, side, value * DOCX_IMAGE_PX_PER_CM, keepRatio),
                        )
                        setStatus('')
                      }}
                    />
                  ))}
                  <ToolbarButton
                    label="锁定图片纵横比"
                    active={keepRatio}
                    disabled={locked}
                    onClick={() => setKeepRatio((current) => !current)}
                  >
                    锁定比例
                  </ToolbarButton>
                </ToolbarMenuFields>
                <ToolbarMenuFields label="旋转与翻转">
                  <ToolbarNumberField
                    label="图片旋转角度"
                    value={draft.rotation}
                    min={-360}
                    max={360}
                    step={1}
                    suffix="°"
                    disabled={locked}
                    onCommit={(rotation) => change({ rotation })}
                  />
                  <div className="mimir-docx-picture-tools__row">
                    <ToolbarButton
                      label="图片向左旋转90度"
                      disabled={locked}
                      onClick={() => change({ rotation: (draft.rotation + 270) % 360 })}
                    >
                      左转 90°
                    </ToolbarButton>
                    <ToolbarButton
                      label="图片向右旋转90度"
                      disabled={locked}
                      onClick={() => change({ rotation: (draft.rotation + 90) % 360 })}
                    >
                      右转 90°
                    </ToolbarButton>
                  </div>
                  <div className="mimir-docx-picture-tools__row">
                    <ToolbarButton
                      label="图片水平翻转"
                      active={draft.flipH}
                      disabled={locked}
                      onClick={() => change({ flipH: !draft.flipH })}
                    >
                      水平翻转
                    </ToolbarButton>
                    <ToolbarButton
                      label="图片垂直翻转"
                      active={draft.flipV}
                      disabled={locked}
                      onClick={() => change({ flipV: !draft.flipV })}
                    >
                      垂直翻转
                    </ToolbarButton>
                  </div>
                </ToolbarMenuFields>
                <ToolbarMenuFields label="排列">
                  <ToolbarSelect
                    label="图片对齐"
                    value={draft.align}
                    disabled={locked}
                    options={[
                      { value: 'left', label: '左对齐' },
                      { value: 'center', label: '居中' },
                      { value: 'right', label: '右对齐' },
                    ]}
                    onChange={(align) => change({ align })}
                  />
                  <ToolbarSelect
                    label="图片文字环绕"
                    value={draft.wrap}
                    disabled={locked}
                    options={WRAPS}
                    onChange={(wrap) => change({ wrap })}
                  />
                </ToolbarMenuFields>
                <ToolbarMenuFields label="调整图片">
                  <div className="mimir-docx-picture-tools__row">
                    <ToolbarButton
                      label="裁切选中图片"
                      disabled={locked || !source}
                      onClick={() => startPixels('crop')}
                    >
                      <CropIcon />
                      裁切
                    </ToolbarButton>
                    <ToolbarButton
                      label="去除选中图片背景"
                      disabled={locked || !source}
                      onClick={() => startPixels('cutout')}
                    >
                      去背景
                    </ToolbarButton>
                    <ToolbarFileButton
                      label="替换选中图片"
                      accept="image/png,image/jpeg,image/gif"
                      disabled={locked}
                      onPick={(file) => prepare(file)}
                    >
                      <ImageIcon />
                      替换
                    </ToolbarFileButton>
                  </div>
                </ToolbarMenuFields>
              </>
            )}
          </ToolbarPropertyForm>
        </fieldset>
      </div>
      <div className="mimir-docx-picture-tools__actions">
        {(error || stale) && (
          <p className="mimir-docx-picture-tools__error" role="alert">
            {stale ? '文档已变化，请重新选择图片并打开面板。' : error}
          </p>
        )}
        {status && <p role="status">{status}</p>}
        <div className="mimir-docx-picture-tools__row">
          {busy ? (
            <ToolbarButton label="取消图片处理" onClick={abort}>
              取消处理
            </ToolbarButton>
          ) : mode ? (
            <>
              <ToolbarButton
                label="取消图片像素调整"
                onClick={() => {
                  setMode(null)
                  setError('')
                }}
              >
                返回
              </ToolbarButton>
              <ToolbarButton
                label={mode === 'crop' ? '预览图片裁切' : '预览图片去背景'}
                primary
                disabled={locked || (mode === 'crop' && invalidCrop)}
                onClick={() => void prepare()}
              />
            </>
          ) : (
            <>
              <ToolbarButton
                label="重置图片修改草稿"
                disabled={!dirty}
                onClick={() => {
                  setDraft(docxImageDraft(target))
                  setError('')
                  setStatus('')
                }}
              >
                重置
              </ToolbarButton>
              <ToolbarButton
                label="应用图片格式"
                primary
                disabled={locked || !dirty}
                disabledReason={stale ? '文档已变化，请重新打开面板' : '请先修改图片属性'}
                onClick={submit}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
