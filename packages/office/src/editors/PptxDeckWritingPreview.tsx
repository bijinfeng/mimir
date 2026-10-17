import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import { PptxDeckStreamError, type PptxDeckCheckpoint, type PptxDeckProgress } from '@mimir/shared'
import { openPptxForEdit, type PptxEditSession } from '../pptx.js'
import type { PptxHostApply } from '../agent/pptx-agent.js'
import { renderSlide, type PptxRenderable } from '../pptx-render.js'
import { ToolbarButton } from '../shell/EditorShell.js'
import './pptx-deck-writing.css'

export interface PptxDeckWritingDraft {
  generationId: string
  progress?: PptxDeckProgress
  preview?: PptxRenderable
  generating: boolean
  error?: string
  stale: boolean
  stop(): void
  discard(): void
  keep?: () => void
}
/** Local Stop cancels transport only. The handle's outer signal still invalidates the source. */
export function usePptxDeckWriting(
  host: RefObject<PptxHostApply | undefined>,
  session: PptxEditSession | null,
  documentId: string,
  version: number,
) {
  const [draft, setDraft] = useState<
    | (PptxDeckWritingDraft & {
        session: PptxEditSession
        documentId: string
        sourceVersion: number
      })
    | null
  >(null)
  const active = useRef<{
    session: PptxEditSession
    documentId: string
    version: number
    cancel: () => void
  } | null>(null)
  useEffect(() => {
    if (
      active.current &&
      (active.current.session !== session || active.current.version !== version)
    )
      active.current.cancel()
  }, [session, version])
  useEffect(
    () => () => {
      if (active.current?.session === session && active.current.documentId === documentId) {
        active.current.cancel()
        active.current = null
      }
    },
    [session, documentId],
  )
  const apply = useCallback<PptxHostApply>(
    async (request) => {
      if (!host.current) throw new Error('PPTX 宿主执行器未配置')
      if (request.action !== 'generate_deck') return host.current(request)
      if (!session || active.current) throw new Error('请先保留或丢弃现有生成草稿')
      const controller = new AbortController()
      const signal = request.signal
      let resolvePartial: ((keep: boolean) => void) | undefined
      let discarded = false
      let candidate: PptxDeckCheckpoint | undefined
      let progress: PptxDeckProgress | undefined
      let preview: PptxRenderable | undefined
      const generationId = crypto.randomUUID()
      const current = () =>
        active.current === operation &&
        !signal?.aborted &&
        session.version() === request.expectedVersion
      const stop = () => controller.abort()
      const discard = () => {
        discarded = true
        setDraft((currentDraft) =>
          currentDraft?.generationId === generationId ? null : currentDraft,
        )
        controller.abort()
        resolvePartial?.(false)
      }
      const operation = { session, documentId, version: request.expectedVersion, cancel: discard }
      active.current = operation
      const abort = () => discard()
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
      const publish = (generating: boolean, error?: string, keep?: () => void) => {
        if (active.current !== operation) return
        setDraft({
          session,
          documentId,
          sourceVersion: request.expectedVersion,
          generationId,
          progress,
          preview,
          generating,
          error,
          stale: !current(),
          stop,
          discard,
          keep,
        })
      }
      publish(true)
      try {
        const result = await host.current({
          ...request,
          generationId,
          signal: controller.signal,
          onDeckProgress: async (next, checkpoint) => {
            if (!current() || controller.signal.aborted)
              throw new PptxDeckStreamError('生成来源已失效')
            if (next.generationId !== generationId) throw new PptxDeckStreamError('生成会话已失效')
            if (checkpoint) {
              const parsed = await openPptxForEdit(checkpoint.bytes)
              if (!current() || controller.signal.aborted)
                throw new PptxDeckStreamError('生成来源已失效')
              if (
                parsed.slides().length !==
                next.completed + (next.insertMode === 'append' ? next.originalPages : 0)
              )
                throw new PptxDeckStreamError('生成候选页数不一致')
              candidate = checkpoint
              preview = parsed.view()
            }
            progress = next
            publish(true)
          },
        })
        if (!current() || controller.signal.aborted) throw new PptxDeckStreamError('生成已停止')
        return result
      } catch (error) {
        if (!current() || discarded)
          throw new Error('已丢弃生成草稿，原文稿未修改', { cause: error })
        const stopped = controller.signal.aborted
        const allowed = stopped || (error instanceof PptxDeckStreamError && error.partialAllowed)
        if (!candidate || !progress?.completed || !allowed) throw error
        const message = stopped ? '已停止生成' : error instanceof Error ? error.message : '生成失败'
        const keep = await new Promise<boolean>((resolve) => {
          resolvePartial = resolve
          publish(false, message, () => resolve(true))
        })
        if (!keep || !current() || discarded)
          throw new Error('已丢弃生成草稿，原文稿未修改', { cause: error })
        return {
          ...candidate,
          records: [],
          version: request.expectedVersion + 1,
          changed: true,
          data: {
            ...candidate.data,
            keptPartial: true,
            completed: progress.completed,
            missing: progress.total - progress.completed,
            failedPages: stopped ? 0 : 1,
            notGenerated: Math.max(0, progress.total - progress.completed - (stopped ? 0 : 1)),
            stopped,
            failure: stopped ? undefined : message,
          },
        }
      } finally {
        signal?.removeEventListener('abort', abort)
        if (active.current === operation) {
          active.current = null
          setDraft(null)
        }
      }
    },
    [host, session, documentId],
  )
  return {
    draft:
      draft?.session === session && draft.documentId === documentId
        ? { ...draft, stale: draft.stale || version !== draft.sourceVersion }
        : null,
    apply,
  }
}

export function PptxDeckWritingPreview({
  draft,
  focusFallback,
}: {
  draft: PptxDeckWritingDraft
  focusFallback: RefObject<HTMLElement | null>
}) {
  const root = useRef<HTMLElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const [page, setPage] = useState<number | null>(null)
  const id = useId()
  const completed = draft.progress?.completed ?? 0
  const total = draft.progress?.total ?? 0
  const selected = Math.max(0, Math.min(page ?? completed - 1, completed - 1))
  const offset = draft.progress?.insertMode === 'append' ? draft.progress.originalPages : 0
  const rendered = useMemo(
    () =>
      draft.preview && completed
        ? renderSlide(draft.preview, offset + selected, { fitWidthPx: 288, svgIdPrefix: id })
        : null,
    [draft.preview, completed, offset, selected, id],
  )
  useEffect(() => {
    const active = document.activeElement
    // A caller can disable (and blur) its trigger before this preview mounts.
    // In that case use this editor's own canvas, supplied by its owner.
    returnFocus.current =
      active instanceof HTMLElement &&
      active !== document.body &&
      active !== document.documentElement
        ? active
        : focusFallback.current
    const panel = root.current
    panel?.focus()
    return () => {
      const target = returnFocus.current
      const ownsFocus = () =>
        document.activeElement === document.body || !!panel?.contains(document.activeElement)
      if (!target?.isConnected || !ownsFocus()) return
      // The caller releases its busy/disabled trigger only after execute() settles.
      // Wait for that real state change, without stealing focus after the user moves on.
      const finish = () => {
        observer.disconnect()
        document.removeEventListener('focusin', onFocus)
        clearTimeout(expiry)
      }
      const restore = () => {
        if (!target.isConnected || !ownsFocus()) return finish()
        if (target.matches(':disabled') || target.closest('[aria-disabled="true"]')) return
        finish()
        target.focus({ preventScroll: true })
      }
      const onFocus = () => {
        if (!ownsFocus()) finish()
      }
      const observer = new MutationObserver(restore)
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['disabled', 'aria-disabled'],
        childList: true,
        subtree: true,
      })
      document.addEventListener('focusin', onFocus)
      const expiry = setTimeout(finish, 1000)
      restore()
    }
  }, [focusFallback])
  useEffect(() => {
    if (!draft.generating && root.current?.contains(document.activeElement))
      root.current
        .querySelector<HTMLButtonElement>('.mimir-pptx-deck-writing__actions button')
        ?.focus()
  }, [draft.generating])
  return (
    <aside
      className="mimir-pptx-inspector mimir-pptx-deck-writing"
      ref={root}
      tabIndex={-1}
      aria-label="演示文稿生成草稿"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.stopPropagation()
          draft.discard()
        }
      }}
    >
      <header className="mimir-pptx-inspector__head">
        <h2>{draft.generating ? '正在生成文稿' : '文稿尚未完成'}</h2>
        <ToolbarButton label="丢弃生成草稿" onClick={draft.discard}>
          丢弃
        </ToolbarButton>
      </header>
      <div className="mimir-pptx-deck-writing__content">
        <p role="status">
          {draft.generating
            ? draft.progress?.stage === 'planning' || !draft.progress
              ? '正在规划页面…'
              : completed === total
                ? `已完成 ${completed} / ${total} 页 · 正在确认文稿…`
                : `已完成 ${completed} / ${total} 页 · 正在生成第 ${completed + 1} 页`
            : `${draft.error} · 已完成 ${completed} / ${total} 页，未完成 ${total - completed} 页`}
        </p>
        <p className="mimir-pptx-deck-writing__hint">
          {!draft.progress
            ? '正在准备生成计划。'
            : draft.progress.insertMode === 'append'
              ? '完成页将追加到原文稿。'
              : '完成页将替换原文稿。'}
          {draft.generating
            ? '预览暂不修改原文稿；全部完成后统一应用。'
            : '确认保留前原文稿保持不变。'}
        </p>
        {rendered ? (
          <>
            <div
              className="mimir-pptx-deck-writing__page"
              aria-label={`已完成第 ${selected + 1} 页预览`}
              dangerouslySetInnerHTML={{ __html: rendered.svg }}
            />
            <nav aria-label="浏览已完成页">
              <ToolbarButton
                label="上一完成页"
                disabled={selected <= 0}
                onClick={() => setPage(selected - 1)}
              >
                上一页
              </ToolbarButton>
              <span>
                {selected + 1} / {completed}
              </span>
              <ToolbarButton
                label="下一完成页"
                disabled={selected >= completed - 1}
                onClick={() => setPage(selected + 1)}
              >
                下一页
              </ToolbarButton>
            </nav>
          </>
        ) : (
          <p className="mimir-pptx-deck-writing__empty">首个完整页面生成后将在此预览。</p>
        )}
        {draft.progress?.title && (
          <p className="mimir-pptx-deck-writing__hint">当前任务：{draft.progress.title}</p>
        )}
        {draft.stale && <p role="alert">原文稿已修改，请丢弃此草稿后重新生成。</p>}
      </div>
      <footer className="mimir-pptx-deck-writing__actions">
        {draft.generating ? (
          <ToolbarButton label="停止演示文稿生成" primary onClick={draft.stop} />
        ) : (
          <ToolbarButton
            label={`保留已完成 ${completed} 页`}
            primary
            disabled={draft.stale || !draft.keep || !completed}
            disabledReason="生成来源已变化，请丢弃后重新生成"
            onClick={draft.keep}
          />
        )}
      </footer>
    </aside>
  )
}
