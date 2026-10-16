import { Skeleton } from 'antd'
import { useEffect, useRef, useState } from 'react'
import type { PdfImageSnapshot, PdfPageImage } from '@mimir/shared'
import {
  ToolbarButton,
  ToolbarConfirm,
  ToolbarFileButton,
  ToolbarLabel,
  ToolbarNumberField,
  ToolbarSelect,
} from '../shell/EditorShell.js'

import { PdfInspectorHeader, type PdfPanelResult } from './PdfInspector.js'

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

type Action = (tool: string, args: Record<string, unknown>, expectedVersion?: number) => void
function ImageControls({
  image,
  page,
  busy,
  onAction,
  onUpload,
}: {
  image?: PdfPageImage
  page: number
  busy: boolean
  onAction: Action
  onUpload(file: File, replace: boolean, args: Record<string, unknown>): Promise<void>
}) {
  const [x, setX] = useState(image?.x ?? 40),
    [y, setY] = useState(image?.y ?? 40),
    [width, setWidth] = useState(image?.width ?? 100),
    [height, setHeight] = useState(image?.height ?? 50)
  const [layer, setLayer] = useState<'above_text' | 'below_text'>(image?.layer ?? 'below_text')
  const [opacity, setOpacity] = useState((image?.opacity ?? 1) * 100),
    [tolerance, setTolerance] = useState(30)
  const [left, setLeft] = useState(0),
    [top, setTop] = useState(0),
    [right, setRight] = useState(0),
    [bottom, setBottom] = useState(0)
  const target = { page, image_number: image?.image_number }
  const blocked = busy || !image?.editable
  return (
    <>
      {image?.reason && <ToolbarLabel>{image.reason}</ToolbarLabel>}
      <h3 className="mimir-pdf-inspector__section-title">位置与尺寸</h3>
      <div className="mimir-pdf-inspector__grid">
        <NumberControl label="图片横坐标（pt）" min={0} value={x} onCommit={setX} />
        <NumberControl label="图片纵坐标（pt）" min={0} value={y} onCommit={setY} />
        <NumberControl label="图片宽度（pt）" min={1} value={width} onCommit={setWidth} />
        <NumberControl label="图片高度（pt）" min={1} value={height} onCommit={setHeight} />
        <div className="mimir-pdf-inspector__control">
          <span>层次</span>
          <ToolbarSelect
            label="图片层次"
            value={layer}
            options={[
              { value: 'below_text', label: '文字下方' },
              { value: 'above_text', label: '文字上方' },
            ]}
            onChange={setLayer}
            disabled={busy}
          />
        </div>
        {image && (
          <ToolbarButton
            label="应用图片位置和尺寸"
            disabled={blocked}
            onClick={() => onAction('transform_image', { ...target, x, y, width, height, layer })}
          >
            应用位置与尺寸
          </ToolbarButton>
        )}
        <ToolbarFileButton
          label="插入PDF图片"
          accept="image/png,image/jpeg"
          disabled={busy}
          onPick={(file) => onUpload(file, false, { page, x, y, width, height, layer })}
        >
          插入图片
        </ToolbarFileButton>
        {image && (
          <ToolbarFileButton
            label="替换所选PDF图片"
            accept="image/png,image/jpeg"
            disabled={blocked}
            onPick={(file) => onUpload(file, true, target)}
          >
            替换图片
          </ToolbarFileButton>
        )}
      </div>
      {image && (
        <>
          <h3 className="mimir-pdf-inspector__section-title">旋转与翻转</h3>
          <div className="mimir-pdf-annotations__actions">
            {(
              [
                ['cw', '向右旋转图片'],
                ['ccw', '向左旋转图片'],
                ['180', '旋转图片180度'],
              ] as const
            ).map(([direction, label]) => (
              <ToolbarButton
                key={direction}
                label={label}
                disabled={blocked}
                onClick={() => onAction('rotate_image', { ...target, direction })}
              >
                {label}
              </ToolbarButton>
            ))}
            <ToolbarButton
              label="水平翻转图片"
              disabled={blocked}
              onClick={() => onAction('flip_image', { ...target, axis: 'horizontal' })}
            >
              水平翻转
            </ToolbarButton>
            <ToolbarButton
              label="垂直翻转图片"
              disabled={blocked}
              onClick={() => onAction('flip_image', { ...target, axis: 'vertical' })}
            >
              垂直翻转
            </ToolbarButton>
            <ToolbarConfirm
              title="删除所选图片？"
              description="改动会在保存后写入文件"
              confirmLabel="确认删除图片"
              disabled={blocked}
              onConfirm={() => onAction('delete_image', target)}
            >
              <ToolbarButton label="删除所选PDF图片" disabled={blocked}>
                删除图片
              </ToolbarButton>
            </ToolbarConfirm>
          </div>
          <h3 className="mimir-pdf-inspector__section-title">外观</h3>
          {image.opacity === undefined && (
            <p className="mimir-pdf-inspector__hint">当前不透明度未读取；应用时使用所填数值。</p>
          )}
          <div className="mimir-pdf-inspector__grid">
            <NumberControl
              label="设置图片不透明度（%）"
              min={0}
              max={100}
              value={opacity}
              onCommit={setOpacity}
            />
            <ToolbarButton
              label="应用图片不透明度"
              disabled={blocked}
              onClick={() => onAction('set_image_opacity', { ...target, opacity: opacity / 100 })}
            >
              应用不透明度
            </ToolbarButton>
            <NumberControl
              label="图片去背景容差"
              min={0}
              max={100}
              value={tolerance}
              onCommit={setTolerance}
            />
            <ToolbarButton
              label="去除图片背景"
              disabled={blocked}
              onClick={() => onAction('remove_image_background', { ...target, tolerance })}
            >
              去除背景
            </ToolbarButton>
          </div>
          <h3 className="mimir-pdf-inspector__section-title">裁切</h3>
          <div className="mimir-pdf-inspector__grid">
            <NumberControl
              label="图片左裁切（%）"
              min={0}
              max={99}
              value={left}
              onCommit={setLeft}
            />
            <NumberControl label="图片上裁切（%）" min={0} max={99} value={top} onCommit={setTop} />
            <NumberControl
              label="图片右裁切（%）"
              min={0}
              max={99}
              value={right}
              onCommit={setRight}
            />
            <NumberControl
              label="图片下裁切（%）"
              min={0}
              max={99}
              value={bottom}
              onCommit={setBottom}
            />
            <ToolbarButton
              label="裁切所选PDF图片"
              disabled={blocked}
              onClick={() =>
                onAction('crop_image', {
                  ...target,
                  left: left / 100,
                  top: top / 100,
                  right: right / 100,
                  bottom: bottom / 100,
                })
              }
            >
              裁切图片
            </ToolbarButton>
          </div>
        </>
      )}
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
  error: hostError,
}: {
  sourceKey: string
  snapshot?: PdfImageSnapshot
  page: number
  selected: number | null
  busy: boolean
  onSelect(number: number | null): void
  onAction(
    tool: string,
    args: Record<string, unknown>,
    expectedVersion?: number,
  ): Promise<PdfPanelResult | undefined>
  error?: string | null
  onClose(): void
  getVersion(): number
}) {
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const perform = async (tool: string, args: Record<string, unknown>, expectedVersion?: number) => {
    setError(null)
    setFeedback(null)
    const result = await onAction(tool, args, expectedVersion)
    if (result?.ok && result.changed) setFeedback('已应用到文档。')
    return result
  }
  const pendingUpload = useRef<{
    sourceKey: string
    page: number
    selected: number | null
    signal: AbortSignal
  } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    pendingUpload.current = { sourceKey, page, selected, signal: controller.signal }
    return () => controller.abort()
  }, [sourceKey, page, selected])
  const images = snapshot?.images.filter((image) => image.page === page) ?? [],
    image = images.find((item) => item.image_number === selected)
  const upload = async (file: File, replace: boolean, args: Record<string, unknown>) => {
    const version = getVersion(),
      started = pendingUpload.current
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('图片须小于8MiB')
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.addEventListener('load', () => resolve(String(reader.result).split(',')[1] ?? ''), {
          once: true,
        })
        reader.addEventListener('error', () => reject(new Error('图片读取失败')), { once: true })
        reader.readAsDataURL(file)
      })
      if (
        !started ||
        started.signal.aborted ||
        started.sourceKey !== sourceKey ||
        started.page !== page ||
        started.selected !== selected
      )
        return
      await perform(replace ? 'replace_image' : 'insert_image', { ...args, image: data }, version)
    } catch (reason) {
      if (started && !started.signal.aborted)
        setError(reason instanceof Error ? reason.message : '图片读取失败')
    }
  }
  return (
    <section className="mimir-pdf-panel" role="region" aria-label="PDF 图片面板" aria-busy={busy}>
      <PdfInspectorHeader
        title="图片"
        detail={`第 ${page} 页 · ${images.length} 张图片`}
        busy={busy}
        refreshLabel="刷新PDF图片"
        closeLabel="关闭PDF图片面板"
        onRefresh={() => void perform('list_page_images', {})}
        onClose={onClose}
      />
      <div className="mimir-pdf-inspector__content">
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
        <div className="mimir-pdf-annotations__selection">
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
        {snapshot?.unsupportedPages.includes(page) && (
          <ToolbarLabel>此页含嵌套图片结构，暂不能编辑</ToolbarLabel>
        )}
        {!images.length && snapshot && (
          <p className="mimir-pdf-inspector__hint">本页没有图片，可上传 PNG 或 JPEG 插入。</p>
        )}
        <ImageControls
          key={`${snapshot?.sha256}:${image?.image_number ?? 'new'}`}
          image={image}
          page={page}
          busy={busy}
          onAction={(tool, args) => void perform(tool, args)}
          onUpload={upload}
        />
      </div>
    </section>
  )
}
