import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { Editor } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'
import { useEditorState } from '@tiptap/react'
import type { MarkdownAgentHandle, MarkdownAgentServices } from '../agent/markdown-agent.js'
import { ToolbarButton } from '../shell/EditorShell.js'

type Writer = MarkdownAgentServices['writeDocument']
interface WritingState {
  documentId: string
  editor: Editor
  markdown: string
  source: Node
  generating: boolean
  error?: string
  stop: () => void
  resolve?: (keep: boolean) => void
}

/** Keep temporary model output outside the note and its autosave path. */
export function useMarkdownWriting(
  services: RefObject<MarkdownAgentServices | undefined>,
  handle: RefObject<MarkdownAgentHandle | null>,
  editor: Editor | null,
  documentId: string,
) {
  const [draft, setDraft] = useState<WritingState | null>(null)
  const active = useRef<{
    controller: AbortController
    editor: Editor
    documentId: string
    cancelPartial?: () => void
  } | null>(null)
  useEffect(() => {
    return () => {
      if (active.current?.editor !== editor || active.current.documentId !== documentId) return
      active.current.controller.abort()
      active.current.cancelPartial?.()
      active.current = null
    }
  }, [editor, documentId])
  const writeDocument = useCallback<Writer>(
    async (input, signal, onDelta) => {
      if (!services.current || !handle.current || !editor) throw new Error('笔记写作服务尚未就绪')
      if (active.current) throw new Error('已有写作草稿，请先保留或丢弃')
      const currentHandle = handle.current
      const source = editor.state.doc
      const operation = {
        controller: new AbortController(),
        editor,
        documentId,
        cancelPartial: undefined as (() => void) | undefined,
      }
      active.current = operation
      const abort = () => {
        operation.controller.abort()
        if (signal?.aborted) operation.cancelPartial?.()
      }
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
      let markdown = ''
      const current = () => active.current === operation && handle.current === currentHandle
      setDraft({ documentId, editor, markdown, source, generating: true, stop: abort })
      try {
        const result = await services.current.writeDocument(
          input,
          operation.controller.signal,
          (text) => {
            if (!current() || signal?.aborted) return
            if (markdown.length + text.length > 100_000) throw new Error('草稿超过 100000 字符限制')
            markdown += text
            onDelta?.(text)
            setDraft({ documentId, editor, markdown, source, generating: true, stop: abort })
          },
        )
        if (!current() || signal?.aborted) throw new Error('写作已取消')
        return result
      } catch (error) {
        if (!current() || signal?.aborted)
          throw new Error('写作已取消，正文未修改', { cause: error })
        const message = operation.controller.signal.aborted
          ? '已停止生成'
          : error instanceof Error
            ? error.message
            : '写作失败'
        if (!markdown.trim()) throw new Error(message, { cause: error })
        const keep = await new Promise<boolean>((resolve) => {
          operation.cancelPartial = () => resolve(false)
          setDraft({
            documentId,
            editor,
            markdown,
            source,
            generating: false,
            error: message,
            stop: abort,
            resolve,
          })
        })
        if (!keep || !current() || signal?.aborted)
          throw new Error('已丢弃草稿，正文未修改', { cause: error })
        return { markdown, keptPartial: true }
      } finally {
        signal?.removeEventListener('abort', abort)
        if (active.current === operation) {
          active.current = null
          setDraft(null)
        }
      }
    },
    [services, handle, editor, documentId],
  )
  return {
    draft: draft?.documentId === documentId && draft.editor === editor ? draft : null,
    writeDocument,
  }
}

export function MarkdownWritingPreview({
  draft,
  editor,
}: {
  draft: WritingState
  editor: Editor | null
}) {
  const source = useEditorState({ editor, selector: ({ editor: current }) => current?.state.doc })
  const actions = useRef<HTMLDivElement | null>(null)
  const focusAfterStop = useRef(false)
  useEffect(() => {
    if (!draft.generating && focusAfterStop.current) {
      focusAfterStop.current = false
      if (
        document.activeElement === document.body ||
        actions.current?.contains(document.activeElement)
      )
        actions.current?.querySelector<HTMLButtonElement>('button')?.focus()
    }
  }, [draft.generating])
  useLayoutEffect(
    () => () => {
      if (actions.current?.contains(document.activeElement)) editor?.commands.focus()
    },
    [editor],
  )
  const stale = source !== draft.source
  return (
    <section className="mimir-markdown-writing" aria-label="Markdown 写作草稿">
      <div className="mimir-markdown-writing__header">
        <div>
          <h3>{draft.generating ? '正在撰写草稿' : '草稿尚未完成'}</h3>
          <p role="status">
            {draft.generating
              ? `已收到 ${draft.markdown.length} 字符，正文尚未修改`
              : `${draft.error ?? ''} · ${draft.markdown.length} 字符`}
          </p>
        </div>
        <div className="mimir-markdown-writing__actions" ref={actions}>
          {draft.generating ? (
            <ToolbarButton
              label="停止笔记写作"
              onClick={() => {
                focusAfterStop.current = actions.current?.contains(document.activeElement) ?? false
                draft.stop()
              }}
            >
              停止生成
            </ToolbarButton>
          ) : (
            <>
              <ToolbarButton
                label="丢弃笔记草稿"
                onClick={() => {
                  editor?.commands.focus()
                  draft.resolve?.(false)
                }}
              >
                丢弃草稿
              </ToolbarButton>
              <ToolbarButton
                label="保留部分内容"
                primary
                disabled={stale}
                disabledReason="正文已改变，请丢弃后重新生成"
                onClick={() => draft.resolve?.(true)}
              />
            </>
          )}
        </div>
      </div>
      {stale && (
        <p className="mimir-markdown-writing__warning">
          正文已改变，本次草稿不能写入；请丢弃后重新生成。
        </p>
      )}
      <pre tabIndex={0} aria-label="正在生成的 Markdown 内容">
        {draft.markdown || '等待正文…'}
      </pre>
    </section>
  )
}
