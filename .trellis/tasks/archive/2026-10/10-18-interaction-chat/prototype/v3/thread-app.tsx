import { useEffect, useState, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, useAuiState, useExternalStoreRuntime } from '@assistant-ui/react'
import type { ThreadMessageLike, ThreadUserMessagePart } from '@assistant-ui/react'
import { Thread } from './vendor/packages/ui/src/components/react/assistant-ui/elements/thread.aui'
import {
  createLocalAttachmentAdapter,
  localAttachmentFixture,
  settleLocalAttachments,
} from './attachment-adapter'
import type { AttachmentMode } from './attachment-adapter'
import './official.generated.css'

type Fixture = {
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
  channel: string
  revision?: number
  canReload?: boolean
  attachmentMode?: AttachmentMode
  attachmentCommand?: string
  queue?: string[]
  suggestions?: Array<{ title?: string; prompt: string }>
  restoreFiles?: NonNullable<ThreadMessageLike['attachments']>
}
const initial: Fixture = {
  messages: [],
  running: false,
  draft: '',
  dark: false,
  zoom: false,
  channel: '',
}
const convertMessage = (message: ThreadMessageLike) => message
function sendHost(
  channel: string,
  action: string,
  value?: string,
  attachments?: ThreadMessageLike['attachments'],
) {
  window.parent.postMessage(
    { type: 'mimir-official-thread-event', channel, action, value, attachments },
    '*',
  )
}
function DraftObserver({ channel }: { channel: string }) {
  const draft = useAuiState((s) => s.composer.text)
  const attachments = useAuiState((s) => s.composer.attachments)
  const hadSnapshot = useRef(false)
  useEffect(() => {
    const present = attachments.some((attachment) =>
      attachment.id.startsWith('mimir-snapshot-fixture'),
    )
    if (hadSnapshot.current && !present) sendHost(channel, 'snapshot-removed')
    hadSnapshot.current = present
  }, [attachments, channel])
  useEffect(() => {
    sendHost(channel, 'draft', draft)
  }, [channel, draft])
  return null
}
function ThreadDocument() {
  const [fixture, setFixture] = useState(initial)
  const [local] = useState(() => {
    const context = { fixture: initial }
    const attachments = createLocalAttachmentAdapter(
      () => context.fixture.attachmentMode || 'ready',
      () => ({
        searchOnly: !!context.fixture.searchOnly,
        noVision: !!context.fixture.noVision,
        noModel: !!context.fixture.noModel,
        agentActive: !!context.fixture.agentActive,
        dedicatedSnapshot: !!context.fixture.snapshot,
      }),
    )
    return { context, attachments }
  })
  const restored = useRef(new Set<string>())
  const command = useRef('')
  const lifetime = useRef<number | undefined>(undefined)
  const snapshotInjected = useRef(false)
  const runtime = useExternalStoreRuntime({
    messages: fixture.messages,
    convertMessage,
    isRunning: fixture.running,
    isLoading: fixture.loading,
    suggestions: fixture.suggestions || [],
    isSendDisabled: fixture.blockSend,
    adapters: { attachments: local.attachments },
    queue: {
      items: (fixture.queue || []).map((prompt, index) => ({
        id: `host-queue-${index}`,
        prompt,
        parts: [{ type: 'text', text: prompt }],
      })),
      steerItems: [],
      enqueue(message) {
        sendHost(
          fixture.channel,
          'send',
          message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n'),
          message.attachments,
        )
      },
      steer(message) {
        sendHost(
          fixture.channel,
          'send',
          message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n'),
          message.attachments,
        )
      },
      move() {
        throw new Error('This prototype does not expose queue reordering')
      },
      edit() {
        throw new Error('This prototype does not expose queued message editing')
      },
      remove() {
        throw new Error('Use the Mimir host retrieve action in this prototype')
      },
    },
    onNew: async (message) => {
      const value = message.content
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('\n')
      sendHost(fixture.channel, 'send', value, message.attachments)
    },
    onCancel: async () => {
      sendHost(fixture.channel, 'cancel')
    },
    ...(fixture.canReload
      ? {
          onReload: async () => {
            sendHost(fixture.channel, 'retry')
          },
        }
      : {}),
  })
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== 'mimir-official-thread-fixture')
        return
      const next: Fixture = event.data.fixture
      local.context.fixture = next
      runtime.thread.composer.setText(next.draft)
      setFixture(next)
      document.documentElement.classList.toggle('dark', next.dark)
    }
    window.addEventListener('message', receive)
    sendHost('', 'ready')
    return () => window.removeEventListener('message', receive)
  }, [local, runtime.thread.composer])
  useEffect(
    () =>
      runtime.thread.composer.unstable_on('attachmentAddError', (event) =>
        sendHost(local.context.fixture.channel, 'attachment-error', event.message),
      ),
    [runtime.thread.composer, local],
  )
  useEffect(() => {
    const composer = runtime.thread.composer
    if (fixture.snapshot && !snapshotInjected.current) {
      snapshotInjected.current = true
      if (
        !composer
          .getState()
          .attachments.some((attachment) => attachment.id.startsWith('mimir-snapshot-fixture'))
      )
        void composer.addAttachment({
          id: 'mimir-snapshot-fixture',
          type: 'image',
          name: '第3页截图（本地PNG模拟）.png',
          contentType: 'image/png',
          content: [
            {
              type: 'image',
              image:
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
              filename: 'slide-3-local-fixture.png',
            },
          ],
        })
    } else if (!fixture.snapshot && snapshotInjected.current) {
      snapshotInjected.current = false
      const index = composer
        .getState()
        .attachments.findIndex((attachment) => attachment.id.startsWith('mimir-snapshot-fixture'))
      if (index >= 0) void composer.getAttachmentByIndex(index).remove()
    }
  }, [fixture.snapshot, runtime.thread.composer])
  useEffect(() => {
    if (runtime.thread.composer.getState().text !== fixture.draft)
      runtime.thread.composer.setText(fixture.draft)
  }, [runtime, fixture.draft])
  useEffect(() => {
    for (const attachment of fixture.restoreFiles || []) {
      if (restored.current.has(attachment.id)) continue
      restored.current.add(attachment.id)
      void runtime.thread.composer.addAttachment({
        id: attachment.id,
        type: attachment.type,
        name: attachment.name,
        contentType: attachment.contentType,
        content: attachment.content.filter(
          (part): part is ThreadUserMessagePart =>
            part.type === 'text' || part.type === 'image' || part.type === 'file',
        ),
      })
    }
    if (fixture.attachmentCommand && fixture.attachmentCommand !== command.current) {
      command.current = fixture.attachmentCommand
      const action = fixture.attachmentCommand.split(':')[0]
      if (action === 'multiple') {
        for (let index = 0; index < 5; index++)
          void runtime.thread.composer
            .addAttachment(
              new File(['Local count-limit fixture'], `资料${index + 1}.txt`, {
                type: 'text/plain',
              }),
            )
            .catch((error) => sendHost(fixture.channel, 'attachment-error', String(error)))
      }
      if (action === 'add')
        void runtime.thread.composer
          .addAttachment(localAttachmentFixture(fixture.attachmentMode || 'ready'))
          .catch((error) => sendHost(fixture.channel, 'attachment-error', String(error)))
      if (action === 'complete' || action === 'failed' || action === 'cancel')
        settleLocalAttachments(action)
    }
  }, [
    runtime,
    fixture.attachmentCommand,
    fixture.attachmentMode,
    fixture.restoreFiles,
    fixture.channel,
  ])
  useEffect(() => {
    if (fixture.lifetime === undefined) return
    if (lifetime.current !== undefined && lifetime.current !== fixture.lifetime) {
      void runtime.thread.composer.clearAttachments()
      restored.current.clear()
    }
    lifetime.current = fixture.lifetime
  }, [fixture.lifetime, runtime])
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <DraftObserver channel={fixture.channel} />
      <Thread />
    </AssistantRuntimeProvider>
  )
}
createRoot(document.getElementById('root')!).render(<ThreadDocument />)
