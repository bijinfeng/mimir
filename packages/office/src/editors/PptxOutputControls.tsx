import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, LoaderCircle, Printer } from 'lucide-react'
import { renderSlide, type PptxRenderable } from '../pptx-render.js'
import {
  buildPptxCopy,
  buildPptxOutput,
  checkPptxOutput,
  downloadPptxOutput,
  pptxOutputIndices,
  pptxPrintDocument,
  pptxPrintPageCount,
  pptxPrintPageSize,
  pptxPrintPreviewDocument,
  printPptx,
  type PptxOutputFormat,
  type PptxPrintLayout,
} from '../pptx-output.js'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import './pptx-output-controls.css'

export interface PptxOutputControlsProps {
  deck: PptxRenderable
  active: number
  documentId?: string
  version?: number
  defaultName?: string
  notes?: (index: number) => string
  /** Native current-session serialization only; must never persist or clear dirty. */
  saveCopy?: (options: { signal: AbortSignal }) => Promise<Uint8Array>
  /** Editor-owned current document/session/version guard, checked before external effects. */
  isCurrent?: () => boolean
}
export function PptxOutputControls(props: PptxOutputControlsProps) {
  return <OutputEditor key={props.documentId ?? 'current'} {...props} />
}
function OutputEditor({
  deck,
  active,
  documentId,
  version,
  defaultName = 'presentation.pptx',
  notes,
  saveCopy,
  isCurrent,
}: PptxOutputControlsProps) {
  const [mode, setMode] = useState<'export' | 'print'>('export')
  const [format, setFormat] = useState<PptxOutputFormat | 'pptx'>(saveCopy ? 'pptx' : 'pdf')
  const [filename, setFilename] = useState(defaultName)
  const [scope, setScope] = useState('visible')
  const [pages, setPages] = useState(String(active + 1))
  const [width, setWidth] = useState('1920')
  const [layout, setLayout] = useState<PptxPrintLayout>('full')
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [frame, setFrame] = useState('none')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controller.current?.abort()
    }
  }, [])
  useEffect(
    () => () =>
      controller.current?.abort(
        new DOMException(`Output ${documentId ?? 'current'}:${version ?? 0} expired`, 'AbortError'),
      ),
    [documentId, version],
  )
  const copy = mode === 'export' && format === 'pptx'
  const selection = useMemo(() => {
    try {
      const indices =
        scope === 'current'
          ? [active]
          : scope === 'custom'
            ? pptxOutputIndices(pages, deck.slides().length)
            : deck
                .slides()
                .flatMap((slide, i) =>
                  scope === 'all' || !/\bshow\s*=\s*["']0["']/.test(slide.bodyPrefix) ? [i] : [],
                )
      if (!indices.length || indices.length > 200) throw new Error('每次请选择 1–200 页')
      if (indices.some((i) => !deck.slides()[i])) throw new Error('所选幻灯片已不存在，请重新选择')
      return { indices, error: '', version }
    } catch (error) {
      return {
        indices: [],
        version,
        error: error instanceof Error ? error.message : '请选择有效页码',
      }
    }
  }, [deck, active, scope, pages, version])
  const printOptions = { layout, orientation, frame: frame === 'frame' }
  const preview = useMemo(() => {
    if (mode !== 'print' || selection.error) return null
    const perPage =
      layout === 'handout2' ? 2 : layout === 'handout3' ? 3 : layout === 'handout6' ? 6 : 1
    const indices = selection.indices.slice(0, perPage)
    const rendered = indices.map((index) =>
      renderSlide(deck, index, {
        fitWidthPx: 640,
        svgIdPrefix: `print-preview-${version ?? 0}-${index}`,
      }),
    )
    if (rendered.some((page) => !page)) return null
    const options = {
      layout,
      orientation,
      frame: frame === 'frame',
      notes: indices.map((index) => notes?.(index) ?? ''),
    }
    const size = pptxPrintPageSize(deck.size.cx / 12700, deck.size.cy / 12700, options)
    const html = pptxPrintDocument(
      rendered.filter((page) => page !== null),
      deck.size.cx / 12700,
      deck.size.cy / 12700,
      options,
    )
    return {
      html: pptxPrintPreviewDocument(html, size.width),
      height: Math.ceil((size.height / size.width) * 252 + 16),
    }
  }, [mode, selection, deck, layout, orientation, frame, notes, version])
  const run = async () => {
    if (controller.current) return
    const abort = new AbortController()
    controller.current = abort
    setBusy(true)
    setMessage('')
    setFailed(false)
    const guard = { signal: abort.signal, isCurrent }
    try {
      checkPptxOutput(guard)
      if (copy) {
        if (!saveCopy) throw new Error('当前编辑会话不可用，请重新打开文稿')
        const file = await buildPptxCopy(saveCopy, filename, guard)
        checkPptxOutput(guard)
        downloadPptxOutput(file)
        setMessage('已下载当前 PPTX 副本，原文稿的保存状态不变')
      } else {
        if (selection.error) throw new Error(selection.error)
        const indices = [...selection.indices]
        if (mode === 'print') {
          const snapshotNotes = indices.map((index) => notes?.(index) ?? '')
          await printPptx(deck, indices, { ...printOptions, notes: snapshotNotes, ...guard })
          checkPptxOutput(guard)
          setMessage('已打开系统打印窗口')
        } else {
          const file = await buildPptxOutput(deck, {
            format: format as PptxOutputFormat,
            indices,
            width: Number(width),
            ...guard,
          })
          checkPptxOutput(guard)
          downloadPptxOutput(file)
          setMessage('已生成下载文件')
        }
      }
    } catch (cause) {
      if (!mounted.current) return
      setFailed(!abort.signal.aborted)
      setMessage(
        abort.signal.aborted
          ? '输出已取消，请按当前文稿重新操作'
          : cause instanceof Error
            ? cause.message
            : '输出失败，请重试',
      )
    } finally {
      if (controller.current === abort) controller.current = null
      if (mounted.current) setBusy(false)
    }
  }
  const action = mode === 'print' ? '打开打印窗口' : copy ? '下载 PPTX 副本' : '导出文件'
  return (
    <div className="mimir-pptx-output" aria-busy={busy}>
      <div className="mimir-pptx-output__body">
        <fieldset className="mimir-pptx-output__fields" disabled={busy}>
          <ToolbarPropertyForm>
            <ToolbarMenuFields label="输出设置">
              <ToolbarSelect
                disabled={busy}
                label="输出操作"
                value={mode}
                options={[
                  { value: 'export', label: '导出文件' },
                  { value: 'print', label: '打印' },
                ]}
                onChange={setMode}
              />
              {mode === 'export' && (
                <ToolbarSelect
                  disabled={busy}
                  label="文件格式"
                  value={format}
                  options={[
                    ...(saveCopy ? [{ value: 'pptx', label: 'PPTX 演示文稿副本' }] : []),
                    { value: 'pdf', label: 'PDF 文档' },
                    { value: 'png', label: 'PNG 图片' },
                    { value: 'svg', label: 'SVG 矢量图' },
                  ]}
                  onChange={(value) => setFormat(value as PptxOutputFormat | 'pptx')}
                />
              )}
              {copy ? (
                <>
                  <ToolbarTextField label="副本文件名" value={filename} onChange={setFilename} />
                  <ToolbarMenuNote>
                    下载整份文稿的当前副本，包含未保存修改、已应用的备注和原生媒体。原文稿仍需按原流程保存。
                  </ToolbarMenuNote>
                </>
              ) : (
                <>
                  <ToolbarSelect
                    disabled={busy}
                    label="输出页面"
                    value={scope}
                    options={[
                      { value: 'visible', label: '全部可见幻灯片' },
                      { value: 'all', label: '全部（含隐藏页）' },
                      { value: 'current', label: `当前第 ${active + 1} 页` },
                      { value: 'custom', label: '指定页码' },
                    ]}
                    onChange={setScope}
                  />
                  {scope === 'custom' && (
                    <ToolbarTextField
                      label="页码范围"
                      value={pages}
                      placeholder="1-3,5"
                      onChange={setPages}
                    />
                  )}
                  {selection.error ? (
                    <span role="alert" className="mimir-pptx-output__error">
                      {selection.error}
                    </span>
                  ) : (
                    <ToolbarMenuNote>
                      {selection.indices.length} 张幻灯片
                      {mode === 'print'
                        ? ` · ${pptxPrintPageCount(selection.indices.length, layout)} 张纸`
                        : ''}
                    </ToolbarMenuNote>
                  )}
                </>
              )}
              {mode === 'export' && !copy && format !== 'svg' && (
                <ToolbarSelect
                  disabled={busy}
                  label="图片宽度"
                  value={width}
                  options={[
                    { value: '1280', label: '1280 px' },
                    { value: '1920', label: '1920 px' },
                    { value: '2560', label: '2560 px' },
                  ]}
                  onChange={setWidth}
                />
              )}
              {mode === 'export' && !copy && (
                <ToolbarMenuNote>
                  包含未保存修改。多张图片打包为 ZIP；PDF
                  为静态图片，文字不可选择。媒体和动画仅输出静态画面。
                </ToolbarMenuNote>
              )}
            </ToolbarMenuFields>
            {mode === 'print' && (
              <ToolbarMenuFields label="打印版式">
                <ToolbarSelect
                  disabled={busy}
                  label="每页内容"
                  value={layout}
                  options={[
                    { value: 'full', label: '完整幻灯片' },
                    { value: 'notes', label: '备注页' },
                    { value: 'handout2', label: '讲义 · 每页 2 张' },
                    { value: 'handout3', label: '讲义 · 每页 3 张（带横线）' },
                    { value: 'handout6', label: '讲义 · 每页 6 张' },
                  ]}
                  onChange={setLayout}
                />
                {layout !== 'full' ? (
                  <ToolbarSelect
                    disabled={busy}
                    label="A4 纸张方向"
                    value={orientation}
                    options={[
                      { value: 'portrait', label: '纵向' },
                      { value: 'landscape', label: '横向' },
                    ]}
                    onChange={setOrientation}
                  />
                ) : (
                  <ToolbarSelect
                    disabled={busy}
                    label="幻灯片边框"
                    value={frame}
                    options={[
                      { value: 'none', label: '无边框' },
                      { value: 'frame', label: '细边框' },
                    ]}
                    onChange={setFrame}
                  />
                )}
                <ToolbarMenuNote>
                  使用当前画布和已应用的备注。系统打印窗口中可选择打印机或另存
                  PDF，媒体与动画为静态画面。
                </ToolbarMenuNote>
              </ToolbarMenuFields>
            )}
            {preview && (
              <ToolbarMenuFields label="首页打印预览">
                <iframe
                  className="mimir-pptx-output__preview"
                  title="首页打印预览"
                  sandbox=""
                  srcDoc={preview.html}
                  style={{ height: preview.height }}
                />
              </ToolbarMenuFields>
            )}
          </ToolbarPropertyForm>
        </fieldset>
        {message && (
          <p
            role={failed ? 'alert' : 'status'}
            className={failed ? 'mimir-pptx-output__error' : undefined}
          >
            {message}
          </p>
        )}
      </div>
      <div className="mimir-pptx-output__footer">
        {busy && (
          <ToolbarButton label="取消输出" onClick={() => controller.current?.abort()}>
            取消输出
          </ToolbarButton>
        )}
        <ToolbarButton
          primary
          label={busy ? '正在准备输出…' : action}
          disabled={busy || (!copy && !!selection.error)}
          disabledReason={busy ? '正在准备输出，可取消后重试' : selection.error}
          onClick={() => void run()}
        >
          {busy ? (
            <LoaderCircle size={14} aria-hidden="true" />
          ) : mode === 'print' ? (
            <Printer size={14} aria-hidden="true" />
          ) : (
            <Download size={14} aria-hidden="true" />
          )}
        </ToolbarButton>
      </div>
    </div>
  )
}
