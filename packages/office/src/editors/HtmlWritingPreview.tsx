import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { HtmlAgentHandle, HtmlAgentHooks } from '../agent/html-agent.js'
import { ToolbarButton, ToolbarNote } from '../shell/EditorShell.js'

type Writer = NonNullable<HtmlAgentHooks['writeDocument']>
export interface HtmlWritingState {
  html: string
  version: number
  generating: boolean
  error?: string
  stop: () => void
  resolve?: (keep: boolean) => void
}

/** Temporary output is separate from CodeMirror; only the handle commits a confirmed result. */
export function useHtmlWriting(
  services: RefObject<{ writeDocument: Writer } | undefined>,
  handle: RefObject<HtmlAgentHandle | null>,
) {
  const [draft, setDraft] = useState<HtmlWritingState | null>(null)
  const active = useRef<{ controller: AbortController; cancelPartial?: () => void } | null>(null)
  useEffect(
    () => () => {
      active.current?.controller.abort()
      active.current?.cancelPartial?.()
      active.current = null
    },
    [],
  )
  const writeDocument = useCallback<Writer>(
    async (input) => {
      if (!services.current || !handle.current) throw new Error('页面写作服务尚未就绪。')
      if (active.current) throw new Error('已有页面草稿，请先保留或丢弃。')
      const currentHandle = handle.current
      const version = currentHandle.getVersion()
      const operation = {
        controller: new AbortController(),
        cancelPartial: undefined as (() => void) | undefined,
      }
      active.current = operation
      const abort = () => {
        operation.controller.abort()
        if (input.signal?.aborted) operation.cancelPartial?.()
      }
      input.signal?.addEventListener('abort', abort, { once: true })
      if (input.signal?.aborted) abort()
      let html = ''
      const current = () => active.current === operation && handle.current === currentHandle
      setDraft({ html, version, generating: true, stop: abort })
      try {
        const result = await services.current.writeDocument({
          ...input,
          signal: operation.controller.signal,
          onDelta: (delta) => {
            if (!current() || input.signal?.aborted) return
            if (html.length + delta.length > 200_000)
              throw new Error('HTML 草稿超过 200000 字符限制')
            html += delta
            setDraft({ html, version, generating: true, stop: abort })
          },
        })
        if (!current() || input.signal?.aborted) throw new Error('页面写作已取消。')
        if (!result.complete) throw new Error('页面生成未完成。')
        return result
      } catch (error) {
        if (!current() || input.signal?.aborted)
          throw new Error('页面写作已取消，画布未修改。', { cause: error })
        const message = operation.controller.signal.aborted
          ? '已停止生成。'
          : error instanceof Error
            ? error.message
            : '页面写作失败。'
        if (!html.trim()) throw new Error(message, { cause: error })
        const keep = await new Promise<boolean>((resolve) => {
          operation.cancelPartial = () => resolve(false)
          setDraft({ html, version, generating: false, error: message, stop: abort, resolve })
        })
        if (!keep || !current() || input.signal?.aborted)
          throw new Error('已丢弃页面草稿，画布未修改。', { cause: error })
        return { html, complete: false, keptPartial: true }
      } finally {
        input.signal?.removeEventListener('abort', abort)
        if (active.current === operation) {
          active.current = null
          setDraft(null)
        }
      }
    },
    [services, handle],
  )
  return { draft, writeDocument }
}

export function HtmlWritingPreview({
  draft,
  currentVersion,
}: {
  draft: HtmlWritingState
  currentVersion: number
}) {
  const stale = draft.version !== currentVersion
  return (
    <section className="mimir-html-agent-prompt" aria-label="HTML 生成草稿">
      <div className="mimir-html-writing__copy">
        <strong role="status">{draft.generating ? '正在生成页面' : '页面草稿待处理'}</strong>
        <ToolbarNote>
          {draft.generating
            ? `已收到 ${draft.html.length} 字符；尚未写入原文。`
            : `已收到 ${draft.html.length} 字符，页面尚未完成。`}
        </ToolbarNote>
        {draft.error && !draft.generating && (
          <div role="status">
            <ToolbarNote>{draft.error}</ToolbarNote>
          </div>
        )}
        {stale && (
          <div role="alert">
            <ToolbarNote>原文已改变，本次草稿不能覆盖当前内容；请丢弃后重新生成。</ToolbarNote>
          </div>
        )}
      </div>
      <div className="mimir-html-writing__actions">
        {draft.generating ? (
          <ToolbarButton label="停止生成页面" onClick={draft.stop}>
            停止生成
          </ToolbarButton>
        ) : (
          <>
            <ToolbarButton
              label="保留部分 HTML 草稿"
              primary
              disabled={stale}
              disabledReason="原文已改变，请丢弃后重新生成"
              onClick={() => draft.resolve?.(true)}
            />
            <ToolbarButton label="丢弃 HTML 草稿" onClick={() => draft.resolve?.(false)}>
              丢弃草稿
            </ToolbarButton>
          </>
        )}
      </div>
    </section>
  )
}
