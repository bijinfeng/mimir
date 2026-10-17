import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import type { PageViewport } from 'pdfjs-dist'
import { Download, Trash2, X } from 'lucide-react'
import type { PdfAgentHandle } from '../agent/pdf-agent.js'
import type { PdfHostLocal } from '../agent/pdf-local-agent.js'
import { ToolbarButton } from '../shell/EditorShell.js'
import { loadPdfDocument } from './pdf-render.js'
import {
  pdfRedactionRect,
  redactionPoint,
  redactionScreenRect,
  type PdfRedactionRegion,
  type RedactionPoint,
} from './pdf-redaction-copy.js'
import './pdf-redaction-copy.css'

function pointerPoint(event: PointerEvent<HTMLDivElement>) {
  return redactionPoint(
    { x: event.clientX, y: event.clientY },
    event.currentTarget.getBoundingClientRect(),
  )
}

function PdfRedactionOverlay({
  viewport,
  regions,
  pageIndex,
  disabled,
  onAdd,
  onClose,
}: {
  viewport: PageViewport
  regions: PdfRedactionRegion[]
  pageIndex: number
  disabled: boolean
  onAdd(region: PdfRedactionRegion): void
  onClose(): void
}) {
  const [drag, setDrag] = useState<{
    pointer: number
    from: RedactionPoint
    to: RedactionPoint
    width: number
    height: number
  } | null>(null)
  const dragRef = useRef(drag)
  const cancel = () => {
    dragRef.current = null
    setDrag(null)
  }
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    const current = dragRef.current
    if (!current || current.pointer !== event.pointerId) return
    cancel()
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    const to = pointerPoint(event)
    if (
      disabled ||
      Math.abs(to.x - current.from.x) * current.width < 3 ||
      Math.abs(to.y - current.from.y) * current.height < 3
    )
      return
    onAdd({
      id: crypto.randomUUID(),
      pageIndex,
      rect: pdfRedactionRect(viewport, current.from, to),
    })
  }
  const draft = drag ? pdfRedactionRect(viewport, drag.from, drag.to) : null
  return (
    <div
      className="mimir-pdf-redaction-overlay"
      role="group"
      aria-label="拖动标记涂黑区域"
      tabIndex={0}
      data-disabled={disabled || undefined}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0 || event.isPrimary === false || dragRef.current) return
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.focus()
        event.currentTarget.setPointerCapture?.(event.pointerId)
        const box = event.currentTarget.getBoundingClientRect(),
          from = pointerPoint(event)
        const next = {
          pointer: event.pointerId,
          from,
          to: from,
          width: box.width,
          height: box.height,
        }
        dragRef.current = next
        setDrag(next)
      }}
      onPointerMove={(event) => {
        if (!dragRef.current || dragRef.current.pointer !== event.pointerId) return
        const next = { ...dragRef.current, to: pointerPoint(event) }
        dragRef.current = next
        setDrag(next)
      }}
      onPointerUp={finish}
      onPointerCancel={(event) => {
        if (dragRef.current?.pointer === event.pointerId) cancel()
      }}
      onLostPointerCapture={(event) => {
        if (dragRef.current?.pointer === event.pointerId) cancel()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        if (dragRef.current) {
          const pointer = dragRef.current.pointer
          cancel()
          if (event.currentTarget.hasPointerCapture?.(pointer))
            event.currentTarget.releasePointerCapture(pointer)
        } else onClose()
      }}
    >
      {regions
        .filter((region) => region.pageIndex === pageIndex)
        .map((region) => (
          <span
            key={region.id}
            className="mimir-pdf-redaction-region"
            style={redactionScreenRect(viewport, region.rect)}
          />
        ))}
      {draft && (
        <span
          className="mimir-pdf-redaction-region"
          data-draft="true"
          style={redactionScreenRect(viewport, draft)}
        />
      )}
    </div>
  )
}

export function usePdfRedactionCopy({
  identity,
  enabled,
  bytes,
  pageIndex,
  rotation,
  blocked,
  host,
  agent,
  onRequest,
  onClose,
}: {
  identity: object
  enabled: boolean
  bytes: Uint8Array | null
  pageIndex: number
  rotation: number
  blocked: boolean
  host?: PdfHostLocal
  agent: RefObject<PdfAgentHandle | null>
  onRequest(controller: AbortController): void
  onClose(): void
}) {
  const [state, setState] = useState<{
    identity: object
    enabled: boolean
    regions: PdfRedactionRegion[]
    error: string | null
    result: string | null
  }>({ identity, enabled, regions: [], error: null, result: null })
  if (state.identity !== identity || state.enabled !== enabled)
    setState({ identity, enabled, regions: [], error: null, result: null })
  const current =
    state.identity === identity && state.enabled === enabled
      ? state
      : { ...state, regions: [], error: null, result: null }
  const [view, setView] = useState<{
    identity: object
    pageIndex: number
    rotation: number
    viewport: PageViewport
  } | null>(null)
  const [running, setRunning] = useState<{ identity: object; controller: AbortController } | null>(
    null,
  )
  const request = useRef<AbortController | null>(null)
  const live = useRef({ identity, enabled, pageIndex, blocked, bytes })
  useEffect(() => {
    live.current = { identity, enabled, pageIndex, blocked, bytes }
    return () => {
      request.current?.abort()
      request.current = null
    }
  }, [identity, enabled, pageIndex, blocked, bytes])
  useEffect(() => {
    if (!enabled || !bytes) return
    let cancelled = false
    void loadPdfDocument(bytes)
      .then((doc) => doc.getPage(pageIndex + 1))
      .then((page) => {
        if (!cancelled)
          setView({
            identity,
            pageIndex,
            rotation,
            viewport: page.getViewport({ scale: 1, rotation }),
          })
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setState((previous) => ({
            ...previous,
            error: cause instanceof Error ? cause.message : String(cause),
          }))
      })
    return () => {
      cancelled = true
    }
  }, [identity, enabled, bytes, pageIndex, rotation])
  const busy = running?.identity === identity && !running.controller.signal.aborted
  const viewport =
    view?.identity === identity && view.pageIndex === pageIndex && view.rotation === rotation
      ? view.viewport
      : null
  const changeRegions = (regions: PdfRedactionRegion[]) => {
    request.current?.abort()
    setState({ identity, enabled, regions, error: null, result: null })
  }
  const exportCopy = async () => {
    if (
      blocked ||
      busy ||
      request.current ||
      !enabled ||
      !bytes ||
      !host ||
      !current.regions.length
    )
      return
    const handle = agent.current
    if (!handle) return
    const version = handle.getVersion(),
      controller = new AbortController(),
      frozen = current.regions.map(({ pageIndex: targetPage, rect }) => ({
        pageIndex: targetPage,
        rect: [...rect] as [number, number, number, number],
      }))
    request.current = controller
    onRequest(controller)
    setRunning({ identity, controller })
    setState((previous) => ({ ...previous, error: null, result: null }))
    const assertCurrent = () => {
      controller.signal.throwIfAborted()
      const now = live.current
      if (
        now.identity !== identity ||
        !now.enabled ||
        now.pageIndex !== pageIndex ||
        now.blocked ||
        now.bytes !== bytes ||
        agent.current !== handle ||
        handle.getVersion() !== version
      )
        throw new Error('PDF 画布已变化，请重新标记涂黑区域')
    }
    try {
      assertCurrent()
      const result = await host({
        bytes,
        expectedVersion: version,
        operation: { op: 'redact_copy', regions: frozen },
        signal: controller.signal,
      })
      assertCurrent()
      const output = result.outputs?.[0]
      if (
        result.bytes !== undefined ||
        result.info !== undefined ||
        result.version !== version ||
        result.outputs?.length !== 1 ||
        !output ||
        output.name !== 'document-redacted.pdf' ||
        !(output.bytes instanceof Uint8Array) ||
        !output.bytes.byteLength
      )
        throw new Error('涂黑副本响应无效，请重试')
      const url = URL.createObjectURL(
        new Blob([output.bytes.slice().buffer], { type: 'application/pdf' }),
      )
      try {
        const link = document.createElement('a')
        link.href = url
        link.download = output.name
        link.click()
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      setState((previous) => ({ ...previous, result: `已导出 ${frozen.length} 个区域的涂黑副本` }))
    } catch (cause) {
      if (!controller.signal.aborted && live.current.identity === identity)
        setState((previous) => ({
          ...previous,
          error: cause instanceof Error ? cause.message : String(cause),
        }))
    } finally {
      if (request.current === controller) {
        request.current = null
        setRunning(null)
      }
    }
  }
  const overlay =
    enabled && viewport ? (
      <PdfRedactionOverlay
        key={`${pageIndex}:${rotation}:${blocked || busy}`}
        viewport={viewport}
        regions={current.regions}
        pageIndex={pageIndex}
        disabled={blocked || busy || current.regions.length >= 100}
        onClose={onClose}
        onAdd={(region) => {
          if (!blocked && !busy && current.regions.length < 100)
            changeRegions([...current.regions, region])
        }}
      />
    ) : null
  const panel = enabled ? (
    <section className="mimir-pdf-panel" aria-label="涂黑副本面板" aria-busy={busy}>
      <header className="mimir-pdf-inspector__header">
        <div>
          <h2>涂黑副本</h2>
          <span className="mimir-pdf-inspector__meta">
            第 {pageIndex + 1} 页 · 已标记 {current.regions.length} / 100 个区域
          </span>
        </div>
        <ToolbarButton label="关闭涂黑副本" onClick={onClose}>
          <X size={16} />
        </ToolbarButton>
      </header>
      <div className="mimir-pdf-inspector__content">
        <p className="mimir-pdf-inspector__hint">
          在页面上拖动标记区域。导出后，副本中所选区域的内容不可恢复；知识库原件保持不变。
        </p>
        <p className="mimir-pdf-inspector__hint">标记可以跨页保留。请核对全部区域后导出。</p>
        {!viewport && <p role="status">正在读取页面坐标…</p>}
        {current.regions.length === 0 ? (
          <p className="mimir-pdf-inspector__hint">尚未标记区域。</p>
        ) : (
          <ol className="mimir-pdf-redaction-list" aria-label="待涂黑区域">
            {current.regions.map((region, index) => (
              <li key={region.id} data-current={region.pageIndex === pageIndex || undefined}>
                <span>
                  区域 {index + 1} · 第 {region.pageIndex + 1} 页
                </span>
                <ToolbarButton
                  label={`删除涂黑区域 ${index + 1}`}
                  disabled={busy}
                  onClick={() =>
                    changeRegions(current.regions.filter((item) => item.id !== region.id))
                  }
                >
                  <Trash2 size={14} />
                </ToolbarButton>
              </li>
            ))}
          </ol>
        )}
        <ToolbarButton
          label="清空涂黑标记"
          disabled={busy || !current.regions.length}
          onClick={() => changeRegions([])}
        >
          清空标记
        </ToolbarButton>
        {current.regions.length >= 100 && (
          <p className="mimir-pdf-inspector__hint" role="status">
            已达到100个区域，请先删除部分标记。
          </p>
        )}
        {current.error && (
          <p className="mimir-pdf-inspector__error" role="alert">
            {current.error}
          </p>
        )}
        {current.result && (
          <p className="mimir-pdf-inspector__hint" role="status">
            {current.result}
          </p>
        )}
      </div>
      <div className="mimir-pdf-redaction-footer">
        <ToolbarButton
          label="导出涂黑副本"
          disabled={blocked || busy || !viewport || !current.regions.length}
          onClick={() => void exportCopy()}
        >
          <Download size={14} />
          {busy ? '正在导出…' : '导出涂黑副本'}
        </ToolbarButton>
      </div>
    </section>
  ) : null
  return { overlay, panel }
}
