import { Download, Image, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ToolbarButton, ToolbarSelect, ToolbarTextField } from '../shell/EditorShell.js'
import { exportPdfPageImages, pdfImagePages, type PdfPageImageOutput } from './pdf-image-export.js'
import './pdf-image-export.css'

export interface PdfImageExportProps {
  identity: object
  page: number
  pageCount: number
  blocked: boolean
  getSnapshot(signal: AbortSignal): Promise<Uint8Array>
  onClose(): void
}

export function PdfImageExportControls({
  identity,
  page,
  pageCount,
  blocked,
  getSnapshot,
  onClose,
}: PdfImageExportProps) {
  const [scope, setScope] = useState('current')
  const [range, setRange] = useState('')
  const [dpi, setDpi] = useState('150')
  const [running, setRunning] = useState<{ identity: object; done: number; total: number } | null>(
    null,
  )
  const [error, setError] = useState<{ identity: object; message: string } | null>(null)
  const [prepared, setPrepared] = useState<{
    identity: object
    config: string
    output: PdfPageImageOutput
    previewUrl: string
  } | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const previewRef = useRef<string | null>(null)
  const liveIdentity = useRef(identity)
  useEffect(() => {
    liveIdentity.current = identity
    return () => {
      controllerRef.current?.abort()
      controllerRef.current = null
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
      previewRef.current = null
    }
  }, [identity])
  const config = `${scope}:${range}:${dpi}:${scope === 'current' ? page : ''}`
  const busy = running?.identity === identity
  const ready = prepared?.identity === identity && prepared.config === config ? prepared : null
  let pages: number[] = []
  let issue = ''
  try {
    pages = pdfImagePages(
      scope === 'all' ? `1-${pageCount}` : scope === 'current' ? `${page}` : range,
      pageCount,
    )
  } catch (cause) {
    issue = cause instanceof Error ? cause.message : String(cause)
  }
  const generate = async () => {
    if (blocked || busy || issue) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setRunning({ identity, done: 0, total: pages.length })
    setError(null)
    setPrepared(null)
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = null
    const assertCurrent = () => {
      controller.signal.throwIfAborted()
      if (liveIdentity.current !== identity) throw new Error('文档已变化，请重新生成页面图像')
    }
    try {
      const bytes = await getSnapshot(controller.signal)
      assertCurrent()
      const output = await exportPdfPageImages({
        bytes,
        pages,
        dpi: Number(dpi),
        signal: controller.signal,
        assertCurrent,
        onProgress: (done, total) => {
          assertCurrent()
          setRunning({ identity, done, total })
        },
      })
      assertCurrent()
      const previewUrl = URL.createObjectURL(
        new Blob([output.preview.slice().buffer], { type: 'image/png' }),
      )
      previewRef.current = previewUrl
      setPrepared({ identity, config, output, previewUrl })
    } catch (cause) {
      if (!controller.signal.aborted && liveIdentity.current === identity)
        setError({ identity, message: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setRunning(null)
      }
    }
  }
  const download = () => {
    if (!ready || blocked || busy || liveIdentity.current !== identity) return
    const output = ready.output
    const url = URL.createObjectURL(new Blob([output.bytes.slice().buffer], { type: output.mime }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = output.name
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  }
  return (
    <section className="mimir-pdf-panel" aria-label="页面图像导出面板" aria-busy={busy}>
      <header className="mimir-pdf-inspector__header">
        <div>
          <h2>导出页面图像</h2>
          <span className="mimir-pdf-inspector__meta">
            第 {page} 页 · 共 {pageCount} 页
          </span>
        </div>
        <ToolbarButton label="关闭页面图像导出" onClick={onClose}>
          <X size={16} />
        </ToolbarButton>
      </header>
      <div className="mimir-pdf-inspector__content">
        <fieldset disabled={busy} className="mimir-pdf-image-export__fields">
          <ToolbarSelect
            label="导出页面范围"
            value={scope}
            disabled={busy}
            onChange={setScope}
            options={[
              { value: 'current', label: '当前页' },
              { value: 'all', label: '全部页' },
              { value: 'custom', label: '指定页码' },
            ]}
          />
          {scope === 'custom' && (
            <ToolbarTextField
              label="导出页码"
              value={range}
              onChange={setRange}
              placeholder="例如 1-3,5"
            />
          )}
          <ToolbarSelect
            label="图像分辨率"
            value={dpi}
            disabled={busy}
            onChange={setDpi}
            options={[
              { value: '72', label: '72 dpi · 屏幕预览' },
              { value: '150', label: '150 dpi · 标准' },
              { value: '300', label: '300 dpi · 高清' },
            ]}
          />
        </fieldset>
        <p className="mimir-pdf-inspector__hint">
          按当前页序导出，包含已应用的未保存修改、旋转和裁剪。单页下载 PNG，多页打包为 ZIP。
        </p>
        {issue && (
          <p className="mimir-pdf-inspector__error" role="alert">
            {issue}
          </p>
        )}
        {error?.identity === identity && (
          <p className="mimir-pdf-inspector__error" role="alert">
            {error.message}
          </p>
        )}
        {prepared && prepared.identity !== identity && (
          <p className="mimir-pdf-inspector__hint" role="status">
            文档已变化，请重新生成页面图像。
          </p>
        )}
        {busy && (
          <p className="mimir-pdf-inspector__hint" role="status">
            正在生成 {running.done} / {running.total} 页…
          </p>
        )}
        {ready && (
          <figure className="mimir-pdf-image-export__preview">
            <img src={ready.previewUrl} alt={`第 ${ready.output.pages[0]!.page} 页导出预览`} />
            <figcaption>
              第 {ready.output.pages[0]!.page} 页 · {ready.output.pages[0]!.width} ×{' '}
              {ready.output.pages[0]!.height} px
            </figcaption>
          </figure>
        )}
      </div>
      <div className="mimir-pdf-image-export__actions">
        {ready && (
          <p className="mimir-pdf-inspector__meta" role="status">
            已生成 {ready.output.pages.length} 页 ·{' '}
            {(ready.output.bytes.byteLength / 1024).toFixed(1)} KiB
          </p>
        )}
        <ToolbarButton
          label={busy ? '正在生成页面图像' : ready ? '重新生成页面图像' : '生成页面图像'}
          primary={!ready}
          disabled={blocked || busy || !!issue}
          disabledReason={issue || 'PDF 正在处理'}
          onClick={() => void generate()}
        >
          <Image size={16} />
          {ready && '重新生成'}
        </ToolbarButton>
        {ready && (
          <ToolbarButton
            label={ready.output.mime === 'image/png' ? '下载 PNG 图像' : '下载图像 ZIP'}
            primary
            disabled={blocked || busy}
            onClick={download}
          >
            <Download size={16} />
          </ToolbarButton>
        )}
        {busy && (
          <ToolbarButton label="取消页面图像生成" onClick={() => controllerRef.current?.abort()}>
            取消生成
          </ToolbarButton>
        )}
      </div>
    </section>
  )
}
