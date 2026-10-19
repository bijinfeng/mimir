import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useChat } from '@tanstack/ai-react'
import { ArrowDown, ArrowUp, Paperclip, Square } from 'lucide-react'
import type { ThreadFixture } from './thread-frame'
import type { Attachment } from './local-types'
import {
  createLocalAttachmentAdapter,
  localAttachmentFixture,
  settleLocalAttachments,
} from './attachment-adapter'
import { createLocalConnection } from './local-connection'
import { ComposerBusinessToolbar } from './composer-toolbar'
import { AttachmentTile, ChatMessages, IconButton, toMessages } from './chat-components'
import { captureSendIntent } from './composer-send-intent'
import type { ComposerSendIntent } from './composer-send-intent'
import './chat.css'
const initial: ThreadFixture = { messages: [], running: false, draft: '', dark: false, zoom: false }
function ThreadDocument() {
  const [fixture, setFixture] = useState(initial)
  const [current] = useState(() => {
    let value = initial
    return {
      get: () => value,
      set: (next: ThreadFixture) => {
        value = next
      },
    }
  })
  const [draft, setDraft] = useState('')
  const draftRef = useRef('')
  const [files, setFiles] = useState<Attachment[]>([])
  const filesRef = useRef<Attachment[]>([])
  const [pending, setPending] = useState(false)
  const [localError, setLocalError] = useState('')
  const [away, setAway] = useState(false)
  const scroll = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const input = useRef<HTMLTextAreaElement>(null)
  const chooser = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const lastCommand = useRef('')
  const restored = useRef(new Set<string>())
  const preparation = useRef<AbortController | null>(null)
  const life = useRef<number | undefined>(undefined)
  const post = (
    action: string,
    value?: string,
    attachments?: Attachment[],
    intent?: ComposerSendIntent,
  ) =>
    window.parent.postMessage(
      {
        type: 'mimir-tanstack-thread-event',
        channel: (current.get() as ThreadFixture & { channel?: string }).channel,
        action,
        value,
        attachments,
        intent,
      },
      '*',
    )
  const [adapter] = useState(() =>
    createLocalAttachmentAdapter(
      () => current.get().attachmentMode || 'ready',
      () => ({
        searchOnly: !!current.get().searchOnly,
        noVision: !!current.get().noVision,
        noModel: !!current.get().noModel,
        agentActive: !!current.get().agentActive,
        dedicatedSnapshot: !!current.get().snapshot,
      }),
    ),
  )
  const [local] = useState(() => createLocalConnection())
  const chat = useChat({ threadId: 'mimir-v5-review-local', connection: local.connection })
  useEffect(() => {
    if (pinned.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
  }, [chat.messages])
  const updateFiles = (next: Attachment[]) => {
    filesRef.current = next
    setFiles(next)
  }
  const updateDraft = (text: string) => {
    draftRef.current = text
    setDraft(text)
    post('draft', text)
  }
  const report = (error: unknown) => {
    setLocalError(String(error))
    post('attachment-error', String(error))
  }
  async function add(file: File) {
    try {
      for await (const next of adapter.add({ file })) {
        updateFiles([...filesRef.current.filter((a) => a.id !== next.id), next])
      }
    } catch (error) {
      report(error)
    }
  }
  const remove = (attachment: Attachment) => {
    void adapter.remove(attachment)
    updateFiles(filesRef.current.filter((a) => a.id !== attachment.id))
    if (attachment.id.startsWith('mimir-snapshot-fixture')) post('snapshot-removed')
  }
  async function send(prompt = draft, kind: ComposerSendIntent['kind'] = 'composer') {
    if (
      pending ||
      current.get().blockSend ||
      composing.current ||
      (!prompt.trim() && !filesRef.current.length)
    )
      return
    const toolbar = current.get().toolbar
    if (!toolbar) {
      report('本轮设置尚未就绪')
      return
    }
    const captured = captureSendIntent(
      toolbar,
      kind,
      !!current.get().snapshot,
      current.get().sendContext,
      filesRef.current,
    )
    const intent = captured.intent
    const originalFiles = captured.attachments
    const snapshot = originalFiles.filter((a) => a.id.startsWith('mimir-snapshot-fixture'))
    const generic = originalFiles.filter((a) => !a.id.startsWith('mimir-snapshot-fixture'))
    const controller = new AbortController()
    preparation.current = controller
    setPending(true)
    setLocalError('')
    try {
      if (
        originalFiles.some((a) => a.status?.type === 'incomplete' || a.status?.type === 'running')
      )
        throw new Error('附件尚未准备完成，请移除后重选或等待准备。')
      const prepared = await Promise.all(
        generic.map((a) => adapter.send(a, { signal: controller.signal })),
      )
      if (controller.signal.aborted) return
      const attachments = [...snapshot, ...prepared]
      const text =
        prompt.trim() ||
        (attachments.some((a) => a.type !== 'image') ? '请概括附件内容' : '请描述并分析这些图片')
      const body = structuredClone({
        mimirComposerIntent: intent,
        attachmentIds: attachments.map((a) => a.id),
        prototype: true,
      })
      preparation.current = null
      setPending(false)
      // Mimir owns FIFO. Never enqueue the same turn again inside TanStack.
      const request =
        current.get().running || chat.isLoading ? undefined : chat.sendMessage(text, { body })
      post('send', text, attachments, intent)
      // Preparation may finish after the user has started the next draft.
      updateDraft(draftRef.current === prompt ? '' : draftRef.current)
      const submittedIds = new Set(originalFiles.map((attachment) => attachment.id))
      updateFiles(filesRef.current.filter((attachment) => !submittedIds.has(attachment.id)))
      await request
    } catch (error) {
      if (!controller.signal.aborted) report(error)
    } finally {
      setPending(false)
      if (preparation.current === controller) preparation.current = null
    }
  }
  function cancel() {
    if (preparation.current) {
      preparation.current.abort()
      settleLocalAttachments('cancel')
      setPending(false)
    } else {
      chat.stop()
      post('cancel')
    }
  }
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== 'mimir-tanstack-thread-fixture')
        return
      const next = event.data.fixture as ThreadFixture
      current.set(next)
      setFixture(next)
      draftRef.current = next.draft
      setDraft(next.draft)
      document.documentElement.classList.toggle('dark', next.dark)
      chat.setMessages(toMessages(next.messages))
    }
    window.addEventListener('message', receive)
    post('ready')
    return () => window.removeEventListener('message', receive)
  }, [])
  useEffect(() => {
    if (life.current !== undefined && life.current !== fixture.lifetime) {
      updateFiles([])
      restored.current.clear()
    }
    life.current = fixture.lifetime
  }, [fixture.lifetime])
  useEffect(() => {
    if (fixture.snapshot && !filesRef.current.some((a) => a.id === 'mimir-snapshot-fixture'))
      updateFiles([
        ...filesRef.current,
        {
          id: 'mimir-snapshot-fixture',
          type: 'image',
          name: '第3页截图（本地PNG模拟）.png',
          contentType: 'image/png',
          status: { type: 'complete' },
          content: [
            {
              type: 'image',
              image:
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
              filename: 'slide3.png',
            },
          ],
        },
      ])
    else if (!fixture.snapshot)
      updateFiles(filesRef.current.filter((a) => a.id !== 'mimir-snapshot-fixture'))
  }, [fixture.snapshot])
  useEffect(() => {
    for (const a of fixture.restoreFiles || [])
      if (!restored.current.has(a.id)) {
        restored.current.add(a.id)
        updateFiles([...filesRef.current, a])
      }
    if (fixture.attachmentCommand && lastCommand.current !== fixture.attachmentCommand) {
      lastCommand.current = fixture.attachmentCommand
      const action = fixture.attachmentCommand.split(':')[0]
      if (action === 'add') void add(localAttachmentFixture(fixture.attachmentMode || 'ready'))
      if (action === 'multiple')
        for (let i = 0; i < 5; i++)
          void add(new File(['Local fixture'], `资料${i + 1}.txt`, { type: 'text/plain' }))
      if (action === 'complete' || action === 'failed' || action === 'cancel')
        settleLocalAttachments(action)
    }
  }, [fixture.attachmentCommand, fixture.restoreFiles])
  const toolbarAction = (action: string, value?: string) => {
    const previous = current.get()
    if (previous.toolbar && (action === 'toolbar-scope' || action === 'toolbar-strength')) {
      const next = {
        ...previous,
        toolbar: {
          ...previous.toolbar,
          ...(action === 'toolbar-scope'
            ? { scope: value || '' }
            : { deep: previous.toolbar.sidebar ? false : value === 'deep' }),
        },
      }
      current.set(next)
      setFixture(next)
    }
    post(action, value)
  }
  const running = fixture.running || chat.isLoading
  return (
    <div className="thread-root">
      <div
        className="thread-scroll"
        ref={scroll}
        onScroll={() => {
          const el = scroll.current
          if (el) {
            const off = el.scrollHeight - el.clientHeight - el.scrollTop > 80
            pinned.current = !off
            setAway(off)
          }
        }}
      >
        {fixture.loading ? (
          <div className="chat-loading" role="status">
            正在读取对话…
            <div />
            <div />
            <div />
          </div>
        ) : chat.messages.length ? (
          <div className="thread-inner">
            <ChatMessages
              messages={chat.messages}
              source={fixture.messages}
              running={running}
              allowRetry={fixture.canReload}
              onRetry={() => post('retry')}
              onEdit={(_id, text) => void send(text, 'append')}
            />
          </div>
        ) : (
          <div className="thread-welcome">
            <h2>今天想了解什么？</h2>
            <p>从一个问题开始，连接你的知识。</p>
            {fixture.suggestions?.length && !draft.trim() ? (
              <div className="suggestions">
                {fixture.suggestions.map((s) => (
                  <button
                    type="button"
                    key={s.prompt}
                    onClick={() => void send(s.prompt, 'append')}
                  >
                    {s.title || s.prompt}
                    <ArrowUp size={14} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
      {away && (
        <button
          type="button"
          className="jump-bottom"
          aria-label="Scroll to bottom"
          onClick={() =>
            scroll.current?.scrollTo({
              top: scroll.current.scrollHeight,
              behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'instant'
                : 'smooth',
            })
          }
        >
          <ArrowDown size={17} />
        </button>
      )}
      <div className="composer-area">
        <form
          className="composer-shell"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault()
              e.currentTarget.classList.add('dragging')
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node))
              e.currentTarget.classList.remove('dragging')
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.currentTarget.classList.remove('dragging')
            Array.from(e.dataTransfer.files).forEach((file) => void add(file))
          }}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault()
              Array.from(e.clipboardData.files).forEach((file) => void add(file))
            }
          }}
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          {files.length > 0 && (
            <div className="composer-attachments">
              {files.map((a) => (
                <AttachmentTile key={a.id} attachment={a} onRemove={() => remove(a)} />
              ))}
            </div>
          )}
          <textarea
            ref={input}
            className="composer-input"
            aria-label="Message input"
            placeholder="输入问题，或继续追问…"
            value={draft}
            rows={2}
            onChange={(e) => {
              updateDraft(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 190)}px`
            }}
            onCompositionStart={() => {
              composing.current = true
            }}
            onCompositionEnd={() => {
              composing.current = false
            }}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                !composing.current
              ) {
                e.preventDefault()
                void send()
              }
              if (e.key === 'Escape' && pending) cancel()
            }}
          />
          <div className="composer-bottom">
            <input
              ref={chooser}
              type="file"
              multiple
              accept={adapter.accept}
              hidden
              onChange={(e) => {
                Array.from(e.target.files || []).forEach((file) => void add(file))
                e.target.value = ''
              }}
            />
            <IconButton label="Add attachment" onClick={() => chooser.current?.click()}>
              <Paperclip size={17} />
            </IconButton>
            <ComposerBusinessToolbar state={fixture.toolbar} onAction={toolbarAction} />
            {pending || running ? (
              <IconButton label="Cancel" onClick={cancel}>
                <Square size={15} fill="currentColor" />
              </IconButton>
            ) : (
              <button
                className="send-button"
                type="submit"
                aria-label="Send message"
                disabled={fixture.blockSend || (!draft.trim() && !files.length)}
              >
                <ArrowUp size={18} />
              </button>
            )}
          </div>
        </form>
        {localError && (
          <div className="composer-error" role="alert">
            {localError}
          </div>
        )}
        <div className="composer-hint">
          Enter {running ? '加入追问队列' : '发送'} · Shift + Enter 换行
        </div>
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<ThreadDocument />)
