import { Button, Popconfirm, Skeleton } from 'antd'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { PdfImageSnapshot, PdfPageImage } from '@mimir/shared'
import {
  ToolbarFileButton,
  ToolbarLabel,
  ToolbarNumberField,
  ToolbarSelect,
} from '../shell/EditorShell.js'

import type { PdfHostAssetReadiness, PdfHostAssetPreview } from '../agent/pdf-asset-agent.js'
import {
  PdfExternalImageSource,
  type PdfImageSource,
  type PdfExternalSelection,
  type PdfAssetAction,
} from './PdfExternalImageSource.js'
import { PdfInspectorHeader } from './PdfInspector.js'

const captions: Record<string, string> = {
  '图片横坐标（pt）': '横坐标 · pt',
  '图片纵坐标（pt）': '纵坐标 · pt',
  '图片宽度（pt）': '宽度 · pt',
  '图片高度（pt）': '高度 · pt',
  '设置图片不透明度（%）': '目标不透明度 · %',
  图片去背景容差: '背景容差',
  '图片左裁切（%）': '左侧 · %',
  '图片上裁切（%）': '上侧 · %',
  '图片右裁切（%）': '右侧 · %',
  '图片下裁切（%）': '下侧 · %',
}
function NumberControl(props: Parameters<typeof ToolbarNumberField>[0]) {
  return (
    <label className="mimir-pdf-inspector__control">
      <span>{captions[props.label] ?? props.label}</span>
      <ToolbarNumberField {...props} />
    </label>
  )
}

const operations = [
  { value: 'insert', label: '插入图片', action: '插入PDF图片' },
  { value: 'replace', label: '替换图片', action: '替换所选PDF图片' },
  { value: 'transform', label: '位置与尺寸', action: '应用图片位置和尺寸' },
  { value: 'rotate', label: '旋转', action: '旋转所选PDF图片' },
  { value: 'flip', label: '翻转', action: '翻转所选PDF图片' },
  { value: 'opacity', label: '不透明度', action: '应用图片不透明度' },
  { value: 'background', label: '去除背景', action: '去除图片背景' },
  { value: 'crop', label: '裁切', action: '裁切所选PDF图片' },
  { value: 'delete', label: '删除图片', action: '删除所选PDF图片' },
] as const
type Operation = (typeof operations)[number]['value']

function ImageControls({
  image,
  page,
  busy,
  onAction,
  getVersion,
  children,
}: {
  image?: PdfPageImage
  page: number
  busy: boolean
  onAction: PdfAssetAction
  getVersion(): number
  children: ReactNode
}) {
  const [boundVersion] = useState(getVersion)
  const [operation, setOperation] = useState<Operation>(image ? 'transform' : 'insert')
  const initial = {
    x: image?.x ?? 40,
    y: image?.y ?? 40,
    width: image?.width ?? 100,
    height: image?.height ?? 50,
    layer: image?.layer ?? 'below_text',
    opacity: (image?.opacity ?? 1) * 100,
    tolerance: 30,
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    direction: 'cw',
    axis: 'horizontal',
  }
  const [draft, setDraft] = useState(initial)
  const [material, setMaterial] = useState<{ file: File; url: string } | null>(null)
  const file = material?.file
  const preview = material?.url
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const request = useRef<AbortController | null>(null)
  const alive = useRef(true)
  const picker = useRef<HTMLDivElement>(null)
  const primary = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      request.current?.abort()
    }
  }, [])
  useEffect(
    () => () => {
      if (material) URL.revokeObjectURL(material.url)
    },
    [material],
  )
  const update = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))
  const blocked = busy || pending || (operation !== 'insert' && !image?.editable)
  const requiresFile = operation === 'insert' || operation === 'replace'
  const cropInvalid =
    operation === 'crop' && (draft.left + draft.right >= 100 || draft.top + draft.bottom >= 100)
  const disabled = blocked || (requiresFile && !file) || cropInvalid
  const run = async () => {
    if (disabled || request.current) return
    if (getVersion() !== boundVersion) {
      setError('文档已变化，请重新选择图片后应用')
      return
    }
    const controller = new AbortController(),
      version = getVersion()
    request.current = controller
    setPending(true)
    setError(null)
    setConfirming(false)
    const target = { page, image_number: image?.image_number }
    try {
      let tool: string, args: Record<string, unknown>
      if (requiresFile) {
        if (!file) return
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          const abort = () => {
            reader.abort()
            reject(new Error('已取消图片读取'))
          }
          const cleanup = () => controller.signal.removeEventListener('abort', abort)
          controller.signal.addEventListener('abort', abort, { once: true })
          reader.addEventListener(
            'load',
            () => {
              cleanup()
              const value = String(reader.result).split(',')[1]
              if (value) resolve(value)
              else reject(new Error('图片读取失败，请重新选择'))
            },
            { once: true },
          )
          reader.addEventListener(
            'error',
            () => {
              cleanup()
              reject(new Error('图片读取失败，请重新选择'))
            },
            { once: true },
          )
          reader.addEventListener(
            'abort',
            () => {
              cleanup()
              reject(new Error('已取消图片读取'))
            },
            { once: true },
          )
          reader.readAsDataURL(file)
        })
        if (controller.signal.aborted || !alive.current || version !== getVersion()) return
        tool = operation === 'replace' ? 'replace_image' : 'insert_image'
        args =
          operation === 'replace'
            ? { ...target, image: data }
            : {
                page,
                image: data,
                x: draft.x,
                y: draft.y,
                width: draft.width,
                height: draft.height,
                layer: draft.layer,
              }
      } else {
        const choices: Record<string, [string, Record<string, unknown>]> = {
          transform: [
            'transform_image',
            {
              x: draft.x,
              y: draft.y,
              width: draft.width,
              height: draft.height,
              layer: draft.layer,
            },
          ],
          rotate: ['rotate_image', { direction: draft.direction }],
          flip: ['flip_image', { axis: draft.axis }],
          opacity: ['set_image_opacity', { opacity: draft.opacity / 100 }],
          background: ['remove_image_background', { tolerance: draft.tolerance }],
          crop: [
            'crop_image',
            {
              left: draft.left / 100,
              top: draft.top / 100,
              right: draft.right / 100,
              bottom: draft.bottom / 100,
            },
          ],
          delete: ['delete_image', {}],
        }
        const choice = choices[operation]!
        tool = choice[0]
        args = { ...target, ...choice[1] }
      }
      const result = await onAction(tool, args, version, controller.signal)
      if (!controller.signal.aborted && alive.current) {
        if (result?.ok && requiresFile) setMaterial(null)
      }
    } catch (reason) {
      if (!controller.signal.aborted && alive.current)
        setError(reason instanceof Error ? reason.message : '图片读取失败，请重新选择')
    } finally {
      if (request.current === controller) {
        request.current = null
        if (alive.current) setPending(false)
      }
    }
  }
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    if (confirming) {
      event.preventDefault()
      event.stopPropagation()
      setConfirming(false)
      primary.current?.focus()
    } else if (pending || file || JSON.stringify(draft) !== JSON.stringify(initial)) {
      event.preventDefault()
      event.stopPropagation()
      request.current?.abort()
      request.current = null
      setPending(false)
      setMaterial(null)
      setError(null)
      setDraft(initial)
      if (pending) event.currentTarget.closest<HTMLElement>('.mimir-pdf-inspector')?.focus()
      else (picker.current?.querySelector<HTMLButtonElement>('button') ?? primary.current)?.focus()
    }
  }
  const numberKeys = {
    '图片横坐标（pt）': 'x',
    '图片纵坐标（pt）': 'y',
    '图片宽度（pt）': 'width',
    '图片高度（pt）': 'height',
    '设置图片不透明度（%）': 'opacity',
    图片去背景容差: 'tolerance',
    '图片左裁切（%）': 'left',
    '图片上裁切（%）': 'top',
    '图片右裁切（%）': 'right',
    '图片下裁切（%）': 'bottom',
  } as const
  const numbers = (keys: Array<keyof typeof numberKeys>) =>
    keys.map((label) => {
      const key = numberKeys[label]
      const percent = ['opacity', 'tolerance', 'left', 'top', 'right', 'bottom'].includes(key)
      return (
        <NumberControl
          key={label}
          label={label}
          min={key === 'width' || key === 'height' ? 1 : 0}
          max={percent ? (key === 'opacity' || key === 'tolerance' ? 100 : 99) : undefined}
          disabled={blocked}
          value={draft[key]}
          onCommit={(value) => update(key, value)}
        />
      )
    })
  const primaryLabel = operations.find((item) => item.value === operation)!.action
  return (
    <>
      <div className="mimir-pdf-inspector__content" onKeyDown={escape}>
        {children}
        {error && (
          <p className="mimir-pdf-inspector__error" role="alert">
            {error}
          </p>
        )}
        <div className="mimir-pdf-inspector__control">
          <span>操作</span>
          <ToolbarSelect
            label="PDF图片操作"
            value={operation}
            disabled={busy || pending}
            options={operations.map((item) => ({
              value: item.value,
              label: item.label,
              disabled: item.value !== 'insert' && !image,
            }))}
            onChange={(value) => {
              setOperation(value)
              setMaterial(null)
              setDraft(initial)
              setError(null)
            }}
          />
        </div>
        {operation !== 'insert' && image?.reason && (
          <p className="mimir-pdf-inspector__hint">{image.reason}</p>
        )}
        {requiresFile && (
          <div ref={picker} className="mimir-pdf-image-upload">
            <ToolbarFileButton
              label="选择PDF图片文件"
              accept="image/png,image/jpeg"
              disabled={blocked}
              onPick={(next) => {
                setError(null)
                setMaterial(null)
                if (next.size > 8 * 1024 * 1024) setError('图片不得超过8MiB，请重新选择')
                else if (!['image/png', 'image/jpeg'].includes(next.type))
                  setError('请选择 PNG 或 JPEG 图片')
                else setMaterial({ file: next, url: URL.createObjectURL(next) })
              }}
            >
              选择图片
            </ToolbarFileButton>
            {file ? (
              <figure className="mimir-pdf-image-source__preview">
                {preview && <img src={preview} alt="待上传图片预览" />}
                <figcaption>{file.name}</figcaption>
              </figure>
            ) : (
              <p className="mimir-pdf-inspector__hint">
                PNG 或 JPEG，最大 8MiB。选择后点击底部按钮应用。
              </p>
            )}
          </div>
        )}
        {(operation === 'insert' || operation === 'transform') && (
          <div className="mimir-pdf-inspector__grid">
            {numbers(['图片横坐标（pt）', '图片纵坐标（pt）', '图片宽度（pt）', '图片高度（pt）'])}
            <div className="mimir-pdf-inspector__control">
              <span>层次</span>
              <ToolbarSelect
                label="图片层次"
                value={draft.layer}
                options={[
                  { value: 'below_text', label: '文字下方' },
                  { value: 'above_text', label: '文字上方' },
                ]}
                onChange={(value) => update('layer', value)}
                disabled={blocked}
              />
            </div>
          </div>
        )}
        {operation === 'rotate' && (
          <div className="mimir-pdf-inspector__control">
            <span>旋转方向</span>
            <ToolbarSelect
              label="PDF图片旋转方向"
              value={draft.direction}
              disabled={blocked}
              options={[
                { value: 'cw', label: '向右 90°' },
                { value: 'ccw', label: '向左 90°' },
                { value: '180', label: '旋转 180°' },
              ]}
              onChange={(value) => update('direction', value)}
            />
          </div>
        )}
        {operation === 'flip' && (
          <div className="mimir-pdf-inspector__control">
            <span>翻转方向</span>
            <ToolbarSelect
              label="PDF图片翻转方向"
              value={draft.axis}
              disabled={blocked}
              options={[
                { value: 'horizontal', label: '水平翻转' },
                { value: 'vertical', label: '垂直翻转' },
              ]}
              onChange={(value) => update('axis', value)}
            />
          </div>
        )}
        {operation === 'opacity' && (
          <>
            {image?.opacity === undefined && (
              <p className="mimir-pdf-inspector__hint">当前不透明度未读取；应用时使用所填数值。</p>
            )}
            {numbers(['设置图片不透明度（%）'])}
          </>
        )}
        {operation === 'background' && numbers(['图片去背景容差'])}
        {operation === 'crop' && (
          <>
            <div className="mimir-pdf-inspector__grid">
              {numbers([
                '图片左裁切（%）',
                '图片上裁切（%）',
                '图片右裁切（%）',
                '图片下裁切（%）',
              ])}
            </div>
            <p className="mimir-pdf-inspector__hint">
              按当前图片各边向内裁切；相对两侧之和须小于100%。
            </p>
            {cropInvalid && (
              <p className="mimir-pdf-inspector__error" role="alert">
                裁切后须保留图片区域。
              </p>
            )}
          </>
        )}
        {operation === 'delete' && (
          <p className="mimir-pdf-inspector__hint">
            删除第 {page} 页的图片{image?.image_number}，保存后写入文件。可通过撤销恢复。
          </p>
        )}
      </div>
      <div className="mimir-pdf-inspector__footer" onKeyDown={escape}>
        <Popconfirm
          title="删除所选图片？"
          description="改动会在保存后写入文件"
          open={confirming}
          onOpenChange={(value) => {
            if (operation === 'delete' && !disabled) setConfirming(value)
          }}
          okText="确认删除图片"
          cancelText="取消"
          okButtonProps={{ danger: true, autoInsertSpace: false }}
          cancelButtonProps={{ autoInsertSpace: false }}
          onConfirm={() => void run()}
          onCancel={() => setConfirming(false)}
        >
          <Button
            ref={primary}
            type="primary"
            block
            danger={operation === 'delete'}
            loading={pending}
            aria-label={primaryLabel}
            disabled={disabled}
            onClick={() => {
              if (operation !== 'delete') void run()
            }}
          >
            {primaryLabel}
          </Button>
        </Popconfirm>
      </div>
    </>
  )
}
export function PdfImagePanel({
  sourceKey,
  snapshot,
  page,
  selected,
  busy,
  onSelect,
  onAction,
  onClose,
  getVersion,
  contextVersion,
  assetSessionId,
  hostAssetReadiness,
  hostAssetPreview,
  onAssetSettings,
  error: hostError,
}: {
  sourceKey: string
  contextVersion: number
  assetSessionId: string
  hostAssetReadiness?: PdfHostAssetReadiness
  hostAssetPreview?: PdfHostAssetPreview
  onAssetSettings?(kind: 'search' | 'generate'): void
  snapshot?: PdfImageSnapshot
  page: number
  selected: number | null
  busy: boolean
  onSelect(number: number | null): void
  onAction: PdfAssetAction
  error?: string | null
  onClose(): void
  getVersion(): number
}) {
  const [source, setSource] = useState<PdfImageSource>('upload')
  const identity = `${sourceKey}:${page}:${selected}:${source}`
  const externalKey = `${identity}:${contextVersion}`
  const [external, setExternal] = useState<{
    key: string
    selection: PdfExternalSelection | null
  }>({ key: externalKey, selection: null })
  if (external.key !== externalKey) setExternal({ key: externalKey, selection: null })
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const live = useRef<string | null>(identity)
  useEffect(() => {
    live.current = identity
    return () => {
      live.current = null
    }
  }, [identity])
  const perform: PdfAssetAction = async (tool, args, expectedVersion = getVersion(), signal) => {
    setError(null)
    setFeedback(null)
    try {
      const result = await onAction(tool, args, expectedVersion, signal)
      if (live.current === identity && !signal?.aborted && result && !result.ok)
        setError(result.error ?? '图片操作失败，请重试')
      if (
        live.current === identity &&
        result?.ok &&
        result.changed &&
        getVersion() === expectedVersion + 1
      )
        setFeedback('已应用到文档。')
      return result
    } catch (reason) {
      if (live.current === identity && !signal?.aborted)
        setError(reason instanceof Error ? reason.message : '图片操作失败，请重试')
      return undefined
    }
  }
  const currentExternal = external.key === externalKey ? external.selection : null
  const images = snapshot?.images.filter((item) => item.page === page) ?? [],
    image = images.find((item) => item.image_number === selected)
  const common = (
    <>
      {(error || hostError) && (
        <p className="mimir-pdf-inspector__error" role="alert">
          {error || hostError}
        </p>
      )}
      {feedback && (
        <p className="mimir-pdf-inspector__hint" role="status">
          {feedback}
        </p>
      )}
      {!snapshot && busy && <Skeleton title={false} paragraph={{ rows: 3 }} />}
      <div className="mimir-pdf-inspector__control">
        <span>目标</span>
        <ToolbarSelect
          label="选择PDF图片"
          value={image ? String(image.image_number) : ''}
          disabled={busy}
          options={[
            { value: '', label: '插入新图片' },
            ...images.map((item) => ({
              value: String(item.image_number),
              label: `图片${item.image_number} · ${Math.round(item.width)}×${Math.round(item.height)} pt${item.editable ? '' : '（只读）'}`,
            })),
          ]}
          onChange={(value) => onSelect(value ? Number(value) : null)}
        />
      </div>
      {source !== 'upload' && image?.reason && (
        <p className="mimir-pdf-inspector__hint">{image.reason}</p>
      )}
      {snapshot?.unsupportedPages.includes(page) && (
        <ToolbarLabel>此页含嵌套图片结构，暂不能编辑</ToolbarLabel>
      )}
      {!images.length && snapshot && (
        <p className="mimir-pdf-inspector__hint">本页没有图片，可上传 PNG 或 JPEG 插入。</p>
      )}
      <PdfExternalImageSource
        key={externalKey}
        source={source}
        onSource={setSource}
        getVersion={getVersion}
        assetSessionId={assetSessionId}
        readinessHost={hostAssetReadiness}
        previewHost={hostAssetPreview}
        onSettings={onAssetSettings}
        onSelection={(selection) => setExternal({ key: externalKey, selection })}
        onAction={onAction}
        busy={busy}
      />
    </>
  )
  return (
    <section
      className="mimir-pdf-panel mimir-pdf-image-panel"
      role="region"
      aria-label="PDF 图片面板"
      aria-busy={busy}
    >
      <PdfInspectorHeader
        title="图片"
        detail={`第 ${page} 页 · ${images.length} 张图片`}
        busy={busy}
        refreshLabel="刷新PDF图片"
        closeLabel="关闭PDF图片面板"
        onRefresh={() => void perform('list_page_images', {})}
        onClose={onClose}
      />
      {source === 'upload' ? (
        <ImageControls
          key={`${externalKey}:${snapshot?.sha256 ?? 'loading'}`}
          image={image}
          page={page}
          busy={busy}
          onAction={perform}
          getVersion={getVersion}
        >
          {common}
        </ImageControls>
      ) : (
        <div className="mimir-pdf-inspector__content">{common}</div>
      )}
      {source !== 'upload' && (
        <div className="mimir-pdf-inspector__footer">
          <Button
            type="primary"
            block
            disabled={busy || !currentExternal || (!!image && !image.editable)}
            onClick={() => {
              if (!currentExternal) return
              void perform(
                image ? 'replace_image' : 'insert_image',
                image
                  ? { page, image_number: image.image_number, url: currentExternal.url }
                  : { page, url: currentExternal.url, width: 180 },
                getVersion(),
              )
            }}
          >
            {image ? '替换所选图片' : '插入所选图片'}
          </Button>
        </div>
      )}
    </section>
  )
}
