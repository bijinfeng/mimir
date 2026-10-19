import { useEffect, useId, useRef } from 'react'
import type { ThreadMessageLike } from '@assistant-ui/react'
import type { ComposerSendIntent } from './composer-send-intent'
import type { ComposerToolbarState } from './composer-toolbar'
import type { AttachmentMode } from './attachment-adapter'
import documentHtml from './thread.review.html?raw'
export type ThreadFixture = {
  toolbar?: ComposerToolbarState
  messages: ThreadMessageLike[]
  running: boolean
  loading?: boolean
  draft: string
  dark: boolean
  zoom: boolean
  blockSend?: boolean
  searchOnly?: boolean
  noVision?: boolean
  noModel?: boolean
  snapshot?: boolean
  agentActive?: boolean
  lifetime?: number
  canReload?: boolean
  attachmentMode?: AttachmentMode
  attachmentCommand?: string
  queue?: string[]
  suggestions?: Array<{ title?: string; prompt: string }>
  restoreFiles?: NonNullable<ThreadMessageLike['attachments']>
}
export function ThreadFrame({
  fixture,
  onSend,
  onCancel,
  onRetry,
  onDraft,
  onAttachmentError,
  onSnapshotRemoved,
  onToolbarAction,
}: {
  fixture: ThreadFixture
  onSend: (
    value: string,
    attachments?: ThreadMessageLike['attachments'],
    intent?: ComposerSendIntent,
  ) => void
  onCancel: () => void
  onRetry: () => void
  onDraft: (value: string) => void
  onAttachmentError: (value: string) => void
  onToolbarAction: (action: string, value?: string) => void
  onSnapshotRemoved: () => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const channel = useId()
  useEffect(() => {
    const post = () =>
      frame.current?.contentWindow?.postMessage(
        { type: 'mimir-official-thread-fixture', fixture: { ...fixture, channel } },
        '*',
      )
    post()
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== 'mimir-official-thread-event'
      )
        return
      if (event.data.action === 'ready') {
        post()
        return
      }
      if (event.data.channel !== channel) return
      const action = event.data.action
      if (action.startsWith('toolbar-')) onToolbarAction(action, event.data.value)
      else if (action === 'snapshot-removed') onSnapshotRemoved()
      else if (action === 'attachment-error') onAttachmentError(String(event.data.value))
      else if (action === 'draft') onDraft(event.data.value)
      else if (action === 'send')
        onSend(event.data.value, event.data.attachments, event.data.intent)
      else if (action === 'cancel') onCancel()
      else if (action === 'retry') onRetry()
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [
    fixture,
    channel,
    onDraft,
    onSend,
    onCancel,
    onRetry,
    onAttachmentError,
    onSnapshotRemoved,
    onToolbarAction,
  ])
  return (
    <iframe
      ref={frame}
      title="Official assistant-ui Thread"
      srcDoc={documentHtml}
      sandbox="allow-scripts allow-forms allow-downloads allow-popups"
      allow="clipboard-write"
      onLoad={() =>
        frame.current?.contentWindow?.postMessage(
          { type: 'mimir-official-thread-fixture', fixture: { ...fixture, channel } },
          '*',
        )
      }
      style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
    />
  )
}
