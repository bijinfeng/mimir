import { useMemo, useRef, useState } from 'react'
import { useChat } from '@tanstack/ai-react'
import { Play, RotateCcw, SkipForward, Square } from 'lucide-react'
import { RunAgentInputSchema } from '@ag-ui/core/schemas'
import { ChatMessages, Reasoning } from './chat-components'
import { createLocalConnection } from './local-connection'
import { emptyProtocolState, prepareEvents, reduceProtocol } from './protocol-state'
import type { DemoEvent } from './protocol-state'
import { extraVariants } from './protocol-examples'
import type { DemoVariant } from './protocol-examples'
export type ProtocolItem = {
  id: string
  events: string[]
  boundary: { visible: boolean; notes: string }
  example: { events: DemoEvent[] }
  exampleVariants?: unknown
}
const pretty = (value: unknown) =>
  JSON.stringify(
    value,
    (key, val) =>
      key === 'encryptedValue' ||
      (key === 'value' && typeof val === 'string' && val.includes('signature'))
        ? '[opaque signature]'
        : val,
    2,
  )
export function ProtocolDemo({ item }: { item: ProtocolItem }) {
  const variants = useMemo(() => {
    const extra = extraVariants(item.id)
    const catalog = (item.exampleVariants || []) as DemoVariant[]
    return [...extra, ...catalog.filter((v) => !extra.some((e) => e.id === v.id))]
  }, [item])
  const [variant, setVariant] = useState(variants[0]?.id || 'default')
  const selected = variants.find((v) => v.id === variant)
  const examples = selected?.events || item.example.events
  const [log, setLog] = useState<DemoEvent[]>([])
  const [protocol, setProtocol] = useState(emptyProtocolState)
  const protocolRef = useRef(protocol)
  const [diagnostics, setDiagnostics] = useState<string[]>([])
  const [phase, setPhase] = useState('等待演示')
  const [count, setCount] = useState(0)
  const [captured, setCaptured] = useState<unknown>()
  const [local] = useState(() =>
    createLocalConnection((messages, body, context) => setCaptured({ messages, body, context }), {
      autoComplete: false,
    }),
  )
  const [dark, setDark] = useState(false)
  const chat = useChat({
    threadId: `v5-details-${item.id}`,
    connection: local.connection,
    onChunk: (chunk) => {
      const event = chunk as unknown as DemoEvent
      setLog((rows) => [...rows, event])
      protocolRef.current = reduceProtocol(protocolRef.current, event)
      setProtocol(protocolRef.current)
      if (event.type === 'RUN_ERROR') setPhase('运行失败 · 可重放')
      else if (event.type === 'RUN_FINISHED') {
        const outcome = (event.outcome as { type?: string } | undefined)?.type
        setPhase(
          outcome === 'cancelled'
            ? '运行已取消'
            : outcome === 'interrupt'
              ? '运行等待中断响应'
              : '事件流完成',
        )
      } else setPhase(String(event.type))
    },
  })
  function reset() {
    chat.stop()
    chat.clear()
    setLog([])
    setDiagnostics([])
    setCaptured(undefined)
    protocolRef.current = emptyProtocolState()
    setProtocol(protocolRef.current)
    setCount(0)
    setPhase('等待演示')
  }
  async function play(limit = examples.length) {
    reset()
    setCount(limit)
    const prepared = prepareEvents(examples.slice(0, limit))
    setDiagnostics(prepared.diagnostics)
    if (!prepared.accepted.length) {
      setPhase('本地边界拒绝样本，未发送给运行时')
      return
    }
    setPhase('读取本地事件')
    local.next(prepared.accepted)
    try {
      await chat.sendMessage('本地协议样例输入', {
        body: structuredClone({
          prototype: true,
          item: item.id,
          runConfig: { documentId: 'fixture-document', deepReasoning: false },
        }),
      })
      if (prepared.diagnostics.length) setPhase('非法帧已拒绝 · 合法前缀保留')
    } catch (error) {
      setDiagnostics((rows) => [...rows, `运行时拒绝：${String(error)}`])
    }
  }
  const requestValidation = selected?.request
    ? RunAgentInputSchema.safeParse(selected.request)
    : undefined
  const requestIdentityValid =
    !selected?.request || Boolean(selected.request.threadId && selected.request.runId)
  const hasThinking = chat.messages.some((m) => m.parts.some((p) => p.type === 'thinking'))
  return (
    <div className="detail-demo">
      <div className="demo-toolbar">
        {variants.length > 0 && (
          <select
            aria-label="协议终态变体"
            value={variant}
            onChange={(e) => {
              reset()
              setVariant(e.target.value)
            }}
          >
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
        )}
        <button
          className="demo-primary"
          onClick={() => void play()}
          disabled={chat.isLoading || !examples.length}
        >
          <Play size={14} />
          播放事件
        </button>
        <button
          onClick={() => void play(Math.min(count + 1, examples.length))}
          disabled={chat.isLoading || count >= examples.length}
        >
          <SkipForward size={14} />
          单步重放 {count}/{examples.length}
        </button>
        <button
          onClick={() => {
            chat.stop()
            setPhase('已停止 · 保留部分内容')
          }}
          disabled={!chat.isLoading}
        >
          <Square size={13} />
          停止
        </button>
        <button onClick={reset}>
          <RotateCcw size={14} />
          重置
        </button>
        <label>
          <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
          深色
        </label>
      </div>
      <p className="demo-notice">
        本地事件沙盒：真实 useChat + ConnectionAdapter；无模型、上传、持久化及真实 Agent
        操作。标准事件使用 core 1.0 schema 校验；非法序列在演示边界拒绝。
        {item.id.startsWith('AGUI-LEGACY')
          ? ' 旧 THINKING 经显式兼容层转换为 REASONING，不是 TanStack 原生支持。'
          : ''}
        {selected?.note}
      </p>
      {diagnostics.concat(protocol.diagnostics).map((message, i) => (
        <p role="status" className="lab-notice" key={i}>
          {message}
        </p>
      ))}
      <div className="demo-columns">
        <section className={`demo-output ${dark ? 'dark' : ''}`} aria-label="交互效果">
          <div className="demo-status" role="status">
            {phase}
          </div>
          {protocol.reasoning === 'running' && !hasThinking && <Reasoning text="" running />}
          <ChatMessages
            messages={chat.messages}
            running={chat.isLoading}
            reasoningRunning={protocol.reasoning === 'running'}
            onRetry={() => void play()}
            allowRetry={false}
          />
          {chat.error && (
            <div role="alert" className="message-error">
              {chat.error.message}
              <button onClick={() => void play()}>重放事件</button>
            </div>
          )}
          {!item.boundary.visible && (
            <div className="data-boundary">
              <strong>无独立常态 UI</strong>
              <p>本事件的数据变化见右侧，不生成额外步骤卡或自定义检索思考条。</p>
            </div>
          )}
          {!log.length && <p className="demo-empty">选择样本并播放，或逐帧重放。</p>}
        </section>
        <section className="event-inspector">
          <h3>事件输入 · {examples.length} 帧</h3>
          <div className="event-list">
            {examples.map((event, i) => (
              <details key={i}>
                <summary>
                  <span>{i + 1}</span>
                  <code>{String(event.type)}</code>
                </summary>
                <pre>
                  {event.type === 'REASONING_ENCRYPTED_VALUE'
                    ? pretty({ ...event, value: '[opaque signature]' })
                    : pretty(event)}
                </pre>
              </details>
            ))}
          </div>
          <h3>实际 onChunk 接收 · {log.length}</h3>
          <pre aria-label="已接收协议事件">
            {pretty(
              log.map((e) =>
                e.type === 'REASONING_ENCRYPTED_VALUE' ? { ...e, value: '[opaque signature]' } : e,
              ),
            )}
          </pre>
          <h3>共享状态 / Activity / 推理生命周期</h3>
          <pre aria-label="共享状态归约结果">{pretty(protocol)}</pre>
          <h3>实际 TanStack 消息归约</h3>
          <pre aria-label="TanStack 消息归约结果">{pretty(chat.messages)}</pre>
          {selected?.request && (
            <>
              <h3>请求信封 · 本地合同样例</h3>
              <pre>{pretty(selected.request)}</pre>
              <p role="status">
                {!requestIdentityValid
                  ? '本地身份守卫拒绝空 threadId/runId，不发送真实请求。'
                  : requestValidation?.success
                    ? 'core 1.0 请求 schema 接受；身份/过期等业务校验仍需宿主。'
                    : '请求被 schema 拒绝，不发送真实请求。'}
              </p>
            </>
          )}
          <details>
            <summary>本次连接实际输入（非 HTTP 报文）</summary>
            <pre>{pretty(captured)}</pre>
          </details>
          <p>
            sidecar负责state、activity诊断及推理生命周期；组件复用对比稿。技术数据仅在本详情页呈现。
          </p>
        </section>
      </div>
    </div>
  )
}
