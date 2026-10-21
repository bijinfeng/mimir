import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Segmented from '@nutui/nutui-react-taro/dist/es/packages/segmented'
import TextArea from '@nutui/nutui-react-taro/dist/es/packages/textarea'
import '@nutui/nutui-react-taro/dist/es/packages/segmented/style'
import '@nutui/nutui-react-taro/dist/es/packages/textarea/style'
import Taro, { useDidShow, useDidHide, useUnload } from '@tarojs/taro'
import type {
  RetrievalScope,
  ConversationDetail,
  ConversationSummary,
  Citation,
  Trace,
  MiniappStreamEvent,
  MiniappOperation,
  MiniappChatInput,
  Message,
} from '@mimir/shared/miniapp'
import {
  Action,
  Gate,
  ErrorNotice,
  Loading,
  Empty,
  FolderPicker,
  SelectField,
  useFolders,
  flattenFolders,
} from '../../components/ui'
import { Citations } from '../../components/citations'
import { Markdown } from '../../components/markdown'
import {
  api,
  errorMessage,
  operationProblem,
  ApiError,
  sendWrite,
  recoverWrite,
  rememberWrite,
} from '../../lib/api'
import { useSession, getSession } from '../../lib/session'
import { localKey, readStorage, writeStorage, requestId } from '../../lib/storage'
import { scopeLabel, openReader } from '../../lib/navigation'
import { openChat, streamingSupport } from '../../lib/stream'

type Running = {
  input: MiniappChatInput
  text: string
  citations: Citation[]
  trace: Trace | null
  conversationId?: string
  state: 'receiving' | 'interrupted' | 'pending'
  error: string
}
type ChatCache = {
  conversationId?: string
  scope: RetrievalScope
  label: string
  question: string
  running: Running | null
}
export default function ChatPage() {
  const session = useSession()
  return <Gate>{session && <Chat key={session.user.id} ownerId={session.user.id} />}</Gate>
}
function Chat({ ownerId }: { ownerId: string }) {
  const [initial] = useState(() => readStorage<ChatCache>(localKey(ownerId, 'chat')))
  const initialConversationId = useRef(initial?.conversationId)
  const [scope, setScope] = useState<RetrievalScope>(initial?.scope || { type: 'all' })
  const [label, setLabel] = useState(initial?.label || '全库')
  const [question, setQuestion] = useState(initial?.question || '')
  const [mode, setMode] = useState<'ask' | 'search'>('ask')
  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [running, setRunning] = useState<Running | null>(
    initial?.running ? { ...initial.running, state: 'interrupted' } : null,
  )
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<ConversationSummary[]>([])
  const [next, setNext] = useState<number | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [source, setSource] = useState<{ items: Citation[]; selected: number | null } | null>(null)
  const [saveMessage, setSaveMessage] = useState<Message | null>(null)
  const [saveFolder, setSaveFolder] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveRequest, setSaveRequest] = useState('')
  const { folders, error: folderError } = useFolders()
  const flat = flattenFolders(folders)
  const historyBusy = useRef(false)
  const saveBusyRef = useRef(false)
  const stream = useRef<{ abort: () => void } | null>(null)
  const sequence = useRef(0)
  const mounted = useRef(true)
  const started = useRef(false)
  const latest = useRef<ChatCache>({ scope, label, question, running })
  useLayoutEffect(() => {
    latest.current = {
      conversationId: conversation?.id || running?.conversationId || initialConversationId.current,
      scope,
      label,
      question,
      running,
    }
  }, [conversation, scope, label, question, running])
  const valid = () => mounted.current && getSession()?.user.id === ownerId
  const persist = useCallback(() => {
    try {
      writeStorage(localKey(ownerId, 'chat'), latest.current)
    } catch (error) {
      if (mounted.current && getSession()?.user.id === ownerId) setError(errorMessage(error))
    }
  }, [ownerId])
  useEffect(() => {
    const timer = setTimeout(persist, 250)
    return () => clearTimeout(timer)
  }, [conversation, scope, label, question, running, persist])
  useEffect(
    () => () => {
      mounted.current = false
      stream.current?.abort()
    },
    [],
  )
  async function loadHistory(offset = 0) {
    if (historyBusy.current) return []
    historyBusy.current = true
    try {
      const result = await api.conversations(offset)
      if (!valid()) return
      setHistory((previous) => (offset ? [...previous, ...result.items] : result.items))
      setNext(result.nextOffset)
      return result.items
    } catch (error) {
      if (valid()) setError(errorMessage(error))
      return []
    } finally {
      historyBusy.current = false
    }
  }
  async function loadConversation(id: string) {
    const run = ++sequence.current
    stream.current?.abort()
    stream.current = null
    setLoading(true)
    setError('')
    try {
      const result = await api.conversation(id)
      if (!valid() || run !== sequence.current) return
      setConversation(result.conversation)
      setScope(result.conversation.retrievalScope || { type: 'all' })
      setLabel(
        result.conversation.retrievalScope
          ? scopeLabel(result.conversation.retrievalScope)
          : '旧会话（全库）',
      )
      setRunning(null)
      setShowHistory(false)
      initialConversationId.current = id
    } catch (error) {
      if (valid() && run === sequence.current) setError(errorMessage(error))
    } finally {
      if (valid() && run === sequence.current) setLoading(false)
    }
  }
  function newConversation(nextScope = scope, nextLabel = label) {
    sequence.current++
    stream.current?.abort()
    stream.current = null
    setConversation(null)
    setRunning(null)
    setScope(nextScope)
    setLabel(nextLabel)
    setError('')
    setShowHistory(false)
    initialConversationId.current = undefined
    latest.current = { scope: nextScope, label: nextLabel, question, running: null }
    persist()
  }
  async function recover() {
    const active = latest.current.running
    if (!active) {
      if (latest.current.conversationId) await loadConversation(latest.current.conversationId)
      return
    }
    setLoading(true)
    setError('')
    try {
      const operation = await recoverWrite(active.input.requestId)
      if (!valid() || latest.current.running?.input.requestId !== active.input.requestId) return
      const id =
        operation.conversationId ||
        (operation.result?.type === 'chat'
          ? operation.result.conversationId
          : active.conversationId)
      if (operation.status === 'succeeded' && id) {
        await loadConversation(id)
        return
      }
      setRunning(
        (previous) =>
          previous && {
            ...previous,
            conversationId: id || previous.conversationId,
            state: operation.status === 'pending' ? 'pending' : 'interrupted',
            error: operationProblem(operation),
          },
      )
    } catch (error) {
      if (valid())
        setError(
          error instanceof ApiError && error.status === 404
            ? '服务端尚无此操作记录。输入已保留，可用原请求重发；不会新建另一次请求。'
            : errorMessage(error),
        )
    } finally {
      if (valid()) setLoading(false)
    }
  }
  useDidShow(() => {
    const requested = readStorage<{ scope: RetrievalScope; label: string }>(
      localKey(ownerId, 'nextScope'),
    )
    if (requested) {
      Taro.removeStorageSync(localKey(ownerId, 'nextScope'))
      newConversation(requested.scope, requested.label)
      started.current = true
      return
    }
    if (latest.current.running) {
      void recover()
      started.current = true
      return
    }
    if (!started.current) {
      started.current = true
      if (initialConversationId.current) void loadConversation(initialConversationId.current)
      else {
        const selection = sequence.current
        void loadHistory().then((items) => {
          if (
            selection === sequence.current &&
            items?.[0] &&
            valid() &&
            !latest.current.running &&
            !latest.current.question
          )
            void loadConversation(items[0].id)
        })
      }
    }
  })
  useDidHide(() => {
    persist()
    if (stream.current) {
      stream.current.abort()
      stream.current = null
      setRunning(
        (previous) =>
          previous && {
            ...previous,
            state: 'interrupted',
            error: '已停止接收。返回后查询服务端结果，不会自动重新提问。',
          },
      )
    }
  })
  useUnload(() => {
    persist()
    stream.current?.abort()
  })
  function start(input: MiniappChatInput) {
    if (stream.current || latest.current.running?.state === 'receiving') return
    const run = ++sequence.current
    setError('')
    try {
      rememberWrite(ownerId, {
        requestId: input.requestId,
        path: '/chat',
        data: { ...input },
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      setError(errorMessage(error))
      return
    }
    const active: Running = {
      input,
      text: '',
      citations: [],
      trace: null,
      state: 'receiving',
      error: '',
      conversationId: input.conversationId,
    }
    latest.current = { ...latest.current, running: active, question: '' }
    setRunning(active)
    setQuestion('')
    persist()
    const update = (fn: (previous: Running) => Running) => {
      if (valid() && run === sequence.current)
        setRunning((previous) => {
          if (!previous || previous.input.requestId !== input.requestId) return previous
          const next = fn(previous)
          latest.current = { ...latest.current, running: next }
          return next
        })
    }
    try {
      stream.current = openChat(
        input,
        (event: MiniappStreamEvent) => {
          if (!valid() || run !== sequence.current) return
          if (event.type === 'TEXT_MESSAGE_CONTENT' && typeof event.delta === 'string')
            update((previous) => ({ ...previous, text: previous.text + event.delta }))
          if (event.type === 'CUSTOM') {
            if (event.name === 'mimir.conversation') {
              const value = event.value as { conversationId?: string }
              if (value.conversationId)
                update((previous) => ({ ...previous, conversationId: value.conversationId }))
            }
            if (event.name === 'mimir.citations') {
              const value = event.value as { citations?: Citation[] }
              if (Array.isArray(value.citations))
                update((previous) => ({ ...previous, citations: value.citations! }))
            }
            if (event.name === 'mimir.trace') {
              const value = event.value as { trace?: Trace }
              if (value.trace) update((previous) => ({ ...previous, trace: value.trace! }))
            }
            if (event.name === 'mimir.failure') {
              const value = event.value as { message?: string }
              update((previous) => ({
                ...previous,
                error: value.message || '回答未完成。',
                state: 'interrupted',
              }))
            }
            if (event.name === 'mimir.operation') {
              const operation = (event.value as { operation?: MiniappOperation })?.operation
              if (operation?.conversationId)
                update((previous) => ({ ...previous, conversationId: operation.conversationId! }))
            }
          }
          if (event.type === 'RUN_ERROR')
            update((previous) => ({
              ...previous,
              state: 'interrupted',
              error: event.message || '回答未完成，请查询会话。',
            }))
        },
        (error) =>
          update((previous) => ({ ...previous, state: 'interrupted', error: errorMessage(error) })),
        (terminal) => {
          if (!valid() || run !== sequence.current) return
          stream.current = null
          if (terminal) void recover()
          else
            update((previous) => ({
              ...previous,
              state: 'interrupted',
              error: previous.error || '未收到完成事件，回答尚未确认。请查询结果。',
            }))
        },
      )
    } catch (error) {
      update((previous) => ({ ...previous, state: 'interrupted', error: errorMessage(error) }))
    }
  }
  function submit() {
    if (!question.trim() || running || loading) return
    const unsupported = streamingSupport()
    if (unsupported) {
      setError(unsupported)
      return
    }
    start({
      requestId: requestId(),
      question: question.trim(),
      mode,
      scope,
      ...(conversation ? { conversationId: conversation.id } : {}),
    })
  }
  async function resend() {
    if (!running || running.state === 'receiving' || loading) return
    setLoading(true)
    try {
      const result = await recoverWrite(running.input.requestId)
      if (result.status === 'succeeded') await recover()
      else setError(operationProblem(result))
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) start(running.input)
      else setError(errorMessage(error))
    } finally {
      if (valid()) setLoading(false)
    }
  }
  async function saveAnswer() {
    if (!saveMessage || !saveFolder || saveBusyRef.current) return
    saveBusyRef.current = true
    const target = saveMessage
    const id = saveRequest || requestId()
    setSaveRequest(id)
    setSaveBusy(true)
    setSaveError('')
    try {
      writeStorage(localKey(ownerId, `save-answer:${target.id}`), {
        requestId: id,
        folder: saveFolder,
      })
      const operation = saveRequest
        ? await recoverWrite(id).catch((error) => {
            if (error instanceof ApiError && error.status === 404)
              return sendWrite(ownerId, `/messages/${encodeURIComponent(target.id)}/note`, {
                requestId: id,
                folder: saveFolder,
              })
            throw error
          })
        : await sendWrite(ownerId, `/messages/${encodeURIComponent(target.id)}/note`, {
            requestId: id,
            folder: saveFolder,
          })
      if (!valid()) return
      if (operation.status === 'succeeded' && operation.result?.type === 'saved-answer') {
        const saved = operation.result
        Taro.removeStorageSync(localKey(ownerId, `save-answer:${target.id}`))
        setSaveMessage(null)
        setSaveRequest('')
        if (conversation) await loadConversation(conversation.id)
        await Taro.showModal({
          title: saved.alreadySaved ? '此回答已保存' : '已存为笔记',
          content: `位置：${saved.folder || '未归入目录'}`,
          confirmText: '查看笔记',
          cancelText: '返回',
        }).then((result) => {
          if (result.confirm) void openReader(saved.noteId)
        })
      } else {
        setSaveError(operationProblem(operation))
        if (operation.status === 'failed') {
          setSaveRequest('')
          Taro.removeStorageSync(localKey(ownerId, `save-answer:${target.id}`))
        }
      }
    } catch (error) {
      if (valid()) setSaveError(errorMessage(error))
    } finally {
      saveBusyRef.current = false
      if (valid()) setSaveBusy(false)
    }
  }
  const options = ['全库', ...flat.map((item) => item.path)]
  const scopeIndex =
    scope.type === 'folder' ? flat.findIndex((item) => item.path === scope.path) + 1 : 0
  const messages = conversation?.messages || []
  return (
    <View className="chat-page">
      <View className="chat-top">
        <View className="toolbar">
          <Text className="page-title">问答</Text>
          <View className="action-row">
            <Action
              onClick={() => {
                setShowHistory(true)
                void loadHistory()
              }}
            >
              历史
            </Action>
            <Action disabled={running?.state === 'receiving'} onClick={() => newConversation()}>
              新对话
            </Action>
          </View>
        </View>
        <View className="toolbar compact">
          <SelectField
            title="检索范围"
            value={String(Math.max(0, scopeIndex))}
            options={options.map((option, index) => ({ label: option, value: String(index) }))}
            disabled={running?.state === 'receiving'}
            onChange={(selectedValue) => {
              const selected = Number(selectedValue)
              if (selected === 0) newConversation({ type: 'all' }, '全库')
              else {
                const item = flat[selected - 1]
                if (item) newConversation({ type: 'folder', path: item.path }, item.path)
              }
            }}
          >
            <View className="scope-control">
              <Text>范围：{label}</Text>
              <Text className="muted">切换</Text>
            </View>
          </SelectField>
          <Text className="muted small">
            {conversation ? '会话范围已固定' : '切换范围新开会话'}
          </Text>
        </View>
      </View>
      <ScrollView
        scrollY
        className="chat-messages"
        scrollIntoView={
          running
            ? `live-${running.text.length}`
            : conversation?.messages.length
              ? `message-${conversation.messages[conversation.messages.length - 1]!.id}`
              : undefined
        }
      >
        <ErrorNotice error={error || folderError} />
        {loading && <Loading>正在读取…</Loading>}
        {!messages.length && !running && !loading && (
          <View className="chat-empty">
            <Empty>继续上次的问题，或输入新的问题。回答会附上知识库来源。</Empty>
          </View>
        )}
        {messages.map((message) => (
          <View
            key={message.id}
            id={`message-${message.id}`}
            className={`message message-${message.role}`}
          >
            <Text className="message-label">{message.role === 'user' ? '你' : 'Mimir'}</Text>
            {message.role === 'assistant' ? (
              <Markdown
                body={message.text}
                onCitation={(index) => setSource({ items: message.citations, selected: index })}
              />
            ) : (
              <Text className="block" selectable>
                {message.text}
              </Text>
            )}
            {message.failure && (
              <Text className="notice error">
                此回答未完整生成（{message.failure}），请修改问题或稍后重新发起。
              </Text>
            )}
            {message.trace && (
              <Text className="block muted small">
                {message.trace.steps
                  .map((step) => (step.meta ? `${step.text} · ${step.meta}` : step.text))
                  .join('\n')}
              </Text>
            )}
            {message.role === 'assistant' && (
              <View className="action-row section-small">
                {message.citations.length > 0 && (
                  <Action onClick={() => setSource({ items: message.citations, selected: null })}>
                    来源 {message.citations.length}
                  </Action>
                )}
                {!message.failure && (
                  <Action
                    onClick={() => {
                      if (message.savedNoteId) {
                        void openReader(message.savedNoteId)
                        return
                      }
                      setSaveMessage(message)
                      const pending = readStorage<{ requestId: string; folder: string }>(
                        localKey(ownerId, `save-answer:${message.id}`),
                      )
                      setSaveFolder(pending?.folder || (scope.type === 'folder' ? scope.path : ''))
                      setSaveRequest(pending?.requestId || '')
                      setSaveError('')
                    }}
                  >
                    {message.savedNoteId ? '查看已存笔记' : '存为笔记'}
                  </Action>
                )}
                <Action
                  onClick={() => {
                    void Taro.setClipboardData({ data: message.text })
                  }}
                >
                  复制
                </Action>
              </View>
            )}
          </View>
        ))}
        {running && (
          <>
            <View className="message message-user">
              <Text className="message-label">你</Text>
              <Text selectable>{running.input.question}</Text>
            </View>
            <View className="message">
              <Text className="message-label">
                Mimir · {running.state === 'receiving' ? '正在回答' : '待确认'}
              </Text>
              {running.trace && (
                <Text className="block muted small">
                  {running.trace.steps
                    .map((step) => step.text + (step.meta ? ` · ${step.meta}` : ''))
                    .join('\n')}
                </Text>
              )}
              {running.text && (
                <Markdown
                  body={running.text}
                  onCitation={(index) => setSource({ items: running.citations, selected: index })}
                />
              )}
              {running.citations.length > 0 && (
                <Action onClick={() => setSource({ items: running.citations, selected: null })}>
                  来源 {running.citations.length}
                </Action>
              )}
              <ErrorNotice error={running.error} />
              <View className="action-row section-small">
                {running.state === 'receiving' ? (
                  <Action
                    onClick={() => {
                      stream.current?.abort()
                      stream.current = null
                    }}
                  >
                    停止接收
                  </Action>
                ) : (
                  <>
                    <Action
                      disabled={loading}
                      onClick={() => {
                        void recover()
                      }}
                    >
                      查询结果
                    </Action>
                    <Action
                      disabled={loading}
                      onClick={() => {
                        void resend()
                      }}
                    >
                      原请求重发
                    </Action>
                    <Action
                      onClick={() => {
                        void Taro.showModal({
                          title: '新开对话',
                          content: '原操作可能仍在服务端运行。新开后可从历史查找已保存的结果。',
                          confirmText: '新开对话',
                        }).then((result) => {
                          if (result.confirm) newConversation()
                        })
                      }}
                    >
                      新开对话
                    </Action>
                  </>
                )}
              </View>
              <View id={`live-${running.text.length}`} />
            </View>
          </>
        )}
      </ScrollView>
      <View className="composer">
        <Segmented
          className="mode-row"
          options={[
            { label: '提问', value: 'ask' },
            { label: '只搜索', value: 'search' },
          ]}
          value={mode}
          onChange={(value) => setMode(value === 'search' ? 'search' : 'ask')}
        />
        <TextArea
          value={question}
          className="question-field"
          placeholder={mode === 'ask' ? '问问你的知识库…' : '输入要查找的内容…'}
          maxlength={mode === 'search' ? 500 : 2000}
          autoSize
          disabled={Boolean(running)}
          onChange={(value) => setQuestion(value)}
        />
        <View className="composer-bottom">
          <Text className="muted small">{label}</Text>
          <Action
            primary
            disabled={!question.trim() || Boolean(running) || loading}
            onClick={submit}
          >
            {mode === 'ask' ? '发送' : '搜索'}
          </Action>
        </View>
      </View>
      {source && (
        <Citations
          items={source.items}
          selected={source.selected}
          onSelect={(selected) => setSource({ ...source, selected })}
          onClose={() => setSource(null)}
        />
      )}
      {showHistory && (
        <View className="sheet-mask" onClick={() => setShowHistory(false)}>
          <View className="sheet" onClick={(event) => event.stopPropagation()}>
            <View className="toolbar">
              <Text className="section-title">会话历史</Text>
              <Action onClick={() => setShowHistory(false)}>关闭</Action>
            </View>
            <ScrollView scrollY className="sheet-scroll">
              {history.map((item) => (
                <View
                  key={item.id}
                  className="history-row"
                  onClick={() => {
                    void loadConversation(item.id)
                  }}
                >
                  <Text className="row-title">{item.title}</Text>
                  <Text className="row-meta">
                    {item.retrievalScope ? scopeLabel(item.retrievalScope) : '旧会话（全库）'} ·{' '}
                    {new Date(item.updatedAt).toLocaleDateString()}
                  </Text>
                </View>
              ))}
              {!history.length && <Empty>暂无会话。</Empty>}
              {next !== null && (
                <Action
                  onClick={() => {
                    void loadHistory(next)
                  }}
                >
                  加载更多
                </Action>
              )}
            </ScrollView>
          </View>
        </View>
      )}
      {saveMessage && (
        <View className="sheet-mask">
          <View className="sheet">
            <View className="toolbar">
              <Text className="section-title">存为笔记</Text>
              <Action disabled={saveBusy} onClick={() => setSaveMessage(null)}>
                关闭
              </Action>
            </View>
            <Text className="muted">保存完整回答和来源引用。</Text>
            <FolderPicker
              value={saveFolder}
              folders={folders}
              disabled={saveBusy || Boolean(saveRequest)}
              onChange={setSaveFolder}
            />
            <ErrorNotice error={saveError} />
            <Action
              primary
              disabled={saveBusy || !saveFolder}
              onClick={() => {
                void saveAnswer()
              }}
            >
              {saveBusy ? '处理中…' : saveRequest ? '查询 / 恢复保存' : '保存'}
            </Action>
          </View>
        </View>
      )}
    </View>
  )
}
