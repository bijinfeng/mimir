import { useRef, useState } from 'react'
import type { MessagePart } from './local-types'
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from 'lucide-react'
import { useChat } from '@tanstack/ai-react'
import { ChatMessages } from './chat-components'
import { ThreadFrame } from './thread-frame'
import type { ThreadFixture } from './thread-frame'
import type { ComposerSendIntent } from './composer-send-intent'
import { createLocalConnection } from './local-connection'
import { localImage } from './thread-fixtures'
import { localVideo, localAudio } from './media-fixtures'
export function ToolResponse({
  mode = 'decision',
  onSubmit,
}: {
  mode?: string
  onSubmit: (value: unknown) => Promise<boolean>
}) {
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [confirm, setConfirm] = useState(false)
  const [state, setState] = useState('waiting')
  const [error, setError] = useState('')
  const receipt = useRef<HTMLDivElement>(null)
  async function submit(value: unknown) {
    setState('submitting')
    setError('')
    try {
      const result = await onSubmit(value)
      if (!result) throw Error('续传失败，保留答复，可安全重试。')
      setState('queued')
      receipt.current?.focus()
    } catch (e) {
      setState('waiting')
      setError(String(e))
    }
  }
  return (
    <section className="tool-response">
      <h4>
        {mode === 'decision'
          ? '是否允许修改这份文档？'
          : mode === 'question'
            ? '请补充本次写作的目标'
            : '选择希望保留的内容'}
      </h4>
      <p>仅本地交互演示，不执行文档工具、不产生产品审批权限。</p>
      {mode === 'questions' && (
        <fieldset>
          <legend>需要哪些信息？（必填）</legend>
          {['原文来源', '关键结论', '行动建议'].map((item) => (
            <label key={item}>
              <input
                type="checkbox"
                checked={selected.includes(item)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? [...selected, item] : selected.filter((s) => s !== item),
                  )
                }
              />
              {item}
            </label>
          ))}
        </fieldset>
      )}
      <label>
        {mode === 'decision' ? '备注（可选）' : '补充内容'}
        <textarea
          aria-label="工具答复"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={state !== 'waiting'}
        />
      </label>
      {state === 'waiting' ? (
        <div className="response-actions">
          {mode === 'decision' ? (
            confirm ? (
              <>
                <span>确认允许本轮修改？</span>
                <button type="button" onClick={() => setConfirm(false)}>
                  返回
                </button>
                <button type="button" onClick={() => void submit({ decision: 'allow', note })}>
                  确认允许
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setConfirm(true)}>
                  允许
                </button>
                <button type="button" onClick={() => void submit({ decision: 'deny', note })}>
                  拒绝
                </button>
                <button
                  type="button"
                  onClick={() => void submit({ decision: 'review-only', note })}
                >
                  仅分析
                </button>
              </>
            )
          ) : (
            <button
              type="button"
              disabled={mode === 'questions' ? !selected.length : !note.trim()}
              onClick={() => void submit({ answer: note, selected })}
            >
              提交答复
            </button>
          )}
          <button type="button" onClick={() => void submit({ dismissed: true })}>
            Dismiss
          </button>
        </div>
      ) : (
        <div ref={receipt} tabIndex={-1} role="status" className="response-receipt">
          {state === 'submitting' ? (
            <>
              <LoaderCircle size={14} />
              正在提交…
            </>
          ) : (
            <>
              <Check size={14} />
              Reply queued, not sent yet · 本地回执
            </>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </section>
  )
}
export function ComponentLab({ id, states }: { id: string; states: string[] }) {
  const [state, setState] = useState(states[0] || 'idle')
  const [feedback, setFeedback] = useState(false)
  const [earlier, setEarlier] = useState<'available' | 'loading' | 'loaded'>('available')
  const [branch, setBranch] = useState(0)
  const [branches, setBranches] = useState([
    '保留来源，再连接到主题。',
    '先明确正在使用的主题，然后建立联系。',
    '从每周回顾开始，筛选可行动的结论。',
  ])
  const [queue, setQueue] = useState<{ text: string; intent?: ComposerSendIntent }[]>([])
  const [notice, setNotice] = useState('')
  const [draft, setDraft] = useState('')
  const [running, setRunning] = useState(false)
  const [local] = useState(() => createLocalConnection())
  const chat = useChat({
    threadId: `component-lab-${id}`,
    connection: local.connection,
    initialMessages: [
      { id: 'branch-user', role: 'user', parts: [{ type: 'text', content: '怎样整理阅读资料？' }] },
      {
        id: 'branch-answer',
        role: 'assistant',
        parts: [{ type: 'text', content: '保留来源，再连接到主题。' }],
      },
    ],
  })
  const [fixture, setFixture] = useState<ThreadFixture>(() => {
    const text =
      '这里保留原文语境，用自己的话建立联系。\n\n```typescript\nconst note = { title: "知识连接" }\n```'
    let content: MessagePart[] = [{ type: 'text', text }]
    if (['OFF-021', 'OFF-022'].includes(id))
      content = [
        { type: 'reasoning', text: '先明确问题目标，再对照原文语境。\n'.repeat(20) },
        { type: 'text', text },
      ]
    if (['OFF-023', 'OFF-024'].includes(id))
      content = [
        {
          type: 'tool-call',
          toolCallId: 'tool1',
          toolName: 'search_documents',
          args: { query: '知识连接' },
          result: { sources: 3 },
        },
        {
          type: 'tool-call',
          toolCallId: 'tool2',
          toolName: 'read_document',
          args: { documentId: 'fixture-A' },
          result: { text: '保留来源' },
        },
      ]
    if (['OFF-019', 'OFF-020'].includes(id))
      content = [
        {
          type: 'file',
          mimeType: id === 'OFF-020' ? 'video/mp4' : 'audio/wav',
          data: id === 'OFF-020' ? localVideo : localAudio,
          filename: id === 'OFF-020' ? '本地视频模拟.mp4' : '本地音频模拟.wav',
        },
      ]
    if (id === 'OFF-018')
      content = [
        {
          type: 'file',
          mimeType: 'text/plain',
          data: 'data:text/plain;base64,TG9jYWwgcmV2aWV3IGZpeHR1cmU=',
          filename: '本地资料.txt',
        },
      ]
    if (id === 'OFF-010')
      content = [{ type: 'text', text: '保留来源与自己的判断。\n\n'.repeat(90) }]
    if (['OFF-015', 'OFF-016', 'OFF-017'].includes(id))
      content = [{ type: 'image', image: localImage, filename: '本地图片模拟.svg' }]
    return {
      ...({
        messages: [],
        draft: '',
        running: false,
        dark: false,
        zoom: false,
        canReload: true,
        toolbar: {
          scope: '',
          deep: false,
          sidebar: false,
          searchOnly: false,
          documents: ['文档 A', '文档 B', '文档 C'],
          documentsStatus: 'loaded',
          modelRoles: { chat: 'Qwen3', reasoning: 'DeepSeek R1' },
        },
      } as ThreadFixture),
      messages:
        id === 'OFF-009'
          ? []
          : [
              { id: 'lab-user', role: 'user', content: '怎样整理阅读资料？' },
              { id: 'lab-answer', role: 'assistant', content, status: { type: 'complete' } },
            ],
      suggestions:
        id === 'OFF-011'
          ? [
              { prompt: '如何开始每周回顾？' },
              { prompt: '如何保留原文语境？' },
              { prompt: '怎样连接到已有主题？' },
            ]
          : [],
      attachmentMode: ['OFF-013', 'OFF-014', 'OFF-015'].includes(id) ? 'image' : undefined,
    }
  })
  const loadButton = useRef<HTMLButtonElement>(null)
  const afterLoad = useRef<HTMLButtonElement>(null)
  const apply = (next: string) => {
    setState(next)
    const active = next.includes('running') || next.includes('stream')
    setRunning(active)
    setNotice('')
    setFixture((f) => {
      let messages = structuredClone(f.messages)
      if (['OFF-021', 'OFF-022'].includes(id))
        messages = messages.map((m) =>
          m.role === 'assistant' ? { ...m, status: { type: active ? 'running' : 'complete' } } : m,
        )
      if (['OFF-023', 'OFF-024'].includes(id))
        messages = messages.map((m) =>
          m.role === 'assistant'
            ? {
                ...m,
                content: [
                  {
                    type: 'tool-call',
                    toolCallId: 'tool1',
                    toolName: 'search_documents',
                    args: { query: '知识连接' },
                    argsText: next === 'args-partial' ? '{"query":"知' : undefined,
                    ...(active
                      ? {}
                      : {
                          result:
                            next === 'empty-result'
                              ? ''
                              : next === 'failed' || next === 'error'
                                ? '本地调用失败'
                                : { sources: 3 },
                        }),
                    isError: next === 'failed' || next === 'error',
                    demoMetadata: {
                      demoOpen:
                        next === 'tool-expanded' ||
                        next.startsWith('args') ||
                        next.includes('result') ||
                        next === 'error',
                      demoGroupOpen: next !== 'group-collapsed',
                      cancelled: next === 'cancelled',
                    },
                  },
                ],
              }
            : m,
        )
      if (id === 'OFF-016')
        messages = messages.map((m) =>
          m.role === 'assistant'
            ? {
                ...m,
                content:
                  next === 'filtered'
                    ? [{ type: 'text', text: '图片因内容过滤不可显示。' }]
                    : [
                        {
                          type: 'image',
                          image:
                            next === 'broken' ? 'data:image/png;base64,bm90LWltYWdl' : localImage,
                          filename: '本地图片示例.svg',
                        },
                      ],
              }
            : m,
        )
      if (id === 'OFF-019')
        messages = messages.map((m) =>
          m.role === 'assistant'
            ? {
                ...m,
                content: [
                  {
                    type: 'file',
                    mimeType: 'audio/wav',
                    data:
                      next === 'media-error'
                        ? 'data:audio/wav;base64,bm90LWF1ZGlv'
                        : localAudio + (next === 'src-changed' ? '#changed' : ''),
                    filename: '本地音频模拟.wav',
                  },
                ],
              }
            : m,
        )
      if (id === 'OFF-018')
        messages = messages.map((m) =>
          m.role === 'assistant'
            ? {
                ...m,
                content: [
                  {
                    type: 'file',
                    mimeType:
                      next === 'audio'
                        ? 'audio/wav'
                        : next === 'video'
                          ? 'video/mp4'
                          : 'text/plain',
                    data:
                      next === 'unsafe-source'
                        ? 'javascript:alert(1)'
                        : next === 'audio'
                          ? localAudio
                          : next === 'video'
                            ? localVideo
                            : 'data:text/plain;base64,TG9jYWwgcmV2aWV3',
                    filename: '本地资料.txt',
                  },
                ],
              }
            : m,
        )
      const attachments =
        ['OFF-013', 'OFF-014', 'OFF-015'].includes(id) || (id === 'OFF-012' && next === 'preparing')
      return {
        ...f,
        messages,
        running: active,
        loading: next.includes('loading') || next === 'startup',
        canReload: next !== 'ineligible',
        draft: next === 'draft-hides' ? '正在编辑的问题' : f.draft,
        attachmentMode:
          next === 'uploading'
            ? 'uploading'
            : next === 'failed'
              ? 'failed'
              : next === 'preparing'
                ? 'send-pending'
                : next === 'fallback'
                  ? 'ready'
                  : 'image',
        attachmentCommand:
          attachments && next !== 'removed' ? `add:${Date.now()}` : f.attachmentCommand,
      }
    })
    if (next === 'capability-on') setFeedback(true)
    if (next === 'capability-off') setFeedback(false)
    if (id === 'OFF-008')
      setEarlier(
        next === 'unavailable' || next === 'last-page'
          ? 'loaded'
          : next === 'loading'
            ? 'loading'
            : 'available',
      )
    if (next === 'failed' || next === 'error') setNotice('模拟错误：可以重试，当前内容保留。')
  }
  async function regenerate(text = '怎样整理阅读资料？') {
    local.next([
      { type: 'TEXT_MESSAGE_START', messageId: 'lab-generated', role: 'assistant' },
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'lab-generated',
        delta: '这是通过本地 AG-UI connection 生成的新分支。',
      },
      { type: 'TEXT_MESSAGE_END', messageId: 'lab-generated' },
    ])
    await chat.sendMessage(text, {
      body: structuredClone({
        prototype: true,
        scope: fixture.toolbar?.scope,
        deepReasoning: fixture.toolbar?.deep,
      }),
    })
    setBranches((rows) => [...rows, '这是通过本地 AG-UI connection 生成的新分支。'])
    setBranch(branches.length)
  }
  const special = [
    'OFF-004',
    'OFF-005',
    'OFF-006',
    'OFF-007',
    'OFF-008',
    'OFF-025',
    'OFF-026',
    'OFF-027',
    'OFF-028',
  ].includes(id)
  return (
    <section className="component-lab">
      <div className="state-choices" aria-label="组件演示状态">
        {states.map((s) => (
          <button type="button" key={s} aria-pressed={s === state} onClick={() => apply(s)}>
            {s}
          </button>
        ))}
      </div>
      <p className="demo-notice">
        逐组件本地演示；状态开关用于注入前置条件，下面的菜单、输入、折叠、复制及发送可以直接操作。真实
        API、画布修改、权限与消息树持久化仍需实施验证。
      </p>
      {['OFF-025', 'OFF-026', 'OFF-027'].includes(id) ? (
        <ToolResponse
          key={`${id}-${state}`}
          mode={
            id === 'OFF-026'
              ? state === 'question' || state === 'text-answer'
                ? 'question'
                : 'questions'
              : 'decision'
          }
          onSubmit={async (value) => {
            setNotice(`已捕获本地答复：${JSON.stringify(value)}`)
            return state !== 'error' && state !== 'send-failed'
          }}
        />
      ) : id === 'OFF-028' ? (
        <div className="capability-boundary" role="status">
          <h3>语音会话能力未接通</h3>
          <p>
            普通音频附件仍可播放，但不构成麦克风输入、实时通话或 spoken
            session。此处不弹麦克风授权，也不提供无效的录音按钮。
          </p>
        </div>
      ) : special ? (
        <div className="component-special">
          {id === 'OFF-004' && (
            <label>
              <input
                type="checkbox"
                checked={feedback}
                onChange={(e) => setFeedback(e.target.checked)}
              />
              启用本地反馈能力
            </label>
          )}
          {id === 'OFF-007' && branches.length > 1 && (
            <div className="branch-picker">
              <button
                type="button"
                aria-label="Previous"
                disabled={branch === 0}
                onClick={() => {
                  const next = branch - 1
                  setBranch(next)
                  chat.setMessages([
                    {
                      id: 'branch-answer',
                      role: 'assistant',
                      parts: [{ type: 'text', content: branches[next] || '' }],
                    },
                  ])
                }}
              >
                <ArrowLeft size={15} />
              </button>
              <span>
                {branch + 1} / {branches.length}
              </span>
              <button
                type="button"
                aria-label="Next"
                disabled={branch === branches.length - 1}
                onClick={() => {
                  const next = branch + 1
                  setBranch(next)
                  chat.setMessages([
                    {
                      id: 'branch-answer',
                      role: 'assistant',
                      parts: [{ type: 'text', content: branches[next] || '' }],
                    },
                  ])
                }}
              >
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {id === 'OFF-008' && (
            <>
              {earlier !== 'loaded' && (
                <button
                  type="button"
                  ref={loadButton}
                  className="load-earlier"
                  disabled={earlier === 'loading'}
                  onClick={() => {
                    setEarlier('loading')
                    window.setTimeout(() => {
                      const focused = document.activeElement === loadButton.current
                      chat.setMessages([
                        {
                          id: 'older',
                          role: 'user',
                          parts: [{ type: 'text', content: '更早的历史问题' }],
                        },
                        ...chat.messages,
                      ])
                      setEarlier('loaded')
                      if (focused) afterLoad.current?.focus()
                    }, 180)
                  }}
                >
                  {earlier === 'loading' ? '正在加载更早消息…' : 'Load earlier'}
                </button>
              )}
              <button
                type="button"
                ref={afterLoad}
                className="text-button"
                onClick={() => setNotice('已回到当前对话')}
              >
                回到当前对话
              </button>
              <p role="status">{earlier === 'loaded' ? '更早的消息已加载，没有更多历史。' : ''}</p>
            </>
          )}
          <ChatMessages
            messages={chat.messages}
            running={running || chat.isLoading}
            allowRetry={state !== 'ineligible'}
            feedbackEnabled={feedback}
            onRetry={() => void regenerate()}
            onEdit={(_id, text) => void regenerate(text)}
          />
        </div>
      ) : (
        <div className="component-frame">
          <ThreadFrame
            key={state}
            fixture={{ ...fixture, draft: fixture.draft || draft, queue: queue.map((q) => q.text) }}
            onSend={(text, _files, intent) => {
              if (fixture.running) {
                setQueue((rows) => [...rows, { text, intent }])
                setNotice('已加入本地队列；设置按发送开始时冻结。')
              } else {
                setFixture((f) => ({
                  ...f,
                  running: true,
                  draft: '',
                  messages: [
                    ...f.messages,
                    { id: `user-${Date.now()}`, role: 'user', content: text },
                    {
                      id: `pending-${Date.now()}`,
                      role: 'assistant',
                      content: [],
                      status: { type: 'running' },
                    },
                  ],
                }))
                setNotice(`本轮冻结：${JSON.stringify(intent)}`)
              }
            }}
            onCancel={() => {
              setFixture((f) => ({ ...f, running: false }))
              if (queue.length) {
                const [first, ...rest] = queue
                setDraft(first?.text || '')
                setQueue(rest)
                setNotice(`停止后仅取回首项：${JSON.stringify(first?.intent)}`)
              }
            }}
            onRetry={() => {
              setFixture((f) => ({ ...f, running: true }))
              setNotice('已发起本地重试')
            }}
            onDraft={(value) => setDraft(value)}
            onAttachmentError={setNotice}
            onSnapshotRemoved={() => setFixture((f) => ({ ...f, snapshot: false }))}
            onToolbarAction={(action, value) =>
              setFixture((f) => ({
                ...f,
                toolbar: {
                  ...f.toolbar!,
                  ...(action === 'toolbar-scope'
                    ? { scope: value || '' }
                    : action === 'toolbar-strength'
                      ? { deep: value === 'deep' }
                      : {}),
                },
              }))
            }
          />
        </div>
      )}
      {!special && (
        <div className="demo-toolbar">
          <button
            type="button"
            onClick={() =>
              setFixture((f) => ({
                ...f,
                running: false,
                messages: f.messages.map((m) =>
                  m.role === 'assistant'
                    ? {
                        ...m,
                        status: { type: 'complete' },
                        content: [
                          ...(typeof m.content === 'string'
                            ? [{ type: 'text' as const, text: m.content }]
                            : m.content),
                          { type: 'text', text: '本地模拟已完成。' },
                        ],
                      }
                    : m,
                ),
              }))
            }
          >
            模拟完成
          </button>
          {['OFF-013', 'OFF-014', 'OFF-015'].includes(id) && (
            <button
              type="button"
              onClick={() => setFixture((f) => ({ ...f, attachmentCommand: `add:${Date.now()}` }))}
            >
              加入本地示例附件
            </button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="lab-notice">
          {notice}
        </p>
      )}
      {queue.length > 0 && (
        <div className="queue-evidence">
          {queue.map((q, i) => (
            <p key={i}>
              {i + 1}. {q.text}
              <br />
              <code>{JSON.stringify(q.intent)}</code>
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
