import { useState } from 'react'
import { useChat } from '@tanstack/ai-react'
import type { RunAgentResumeItem } from '@tanstack/ai/client'
import type { ChatResumeState } from '@tanstack/ai-client'
import { createLocalConnection } from './local-connection'
import { ToolResponse } from './component-lab'
import { ChatMessages } from './chat-components'
export function InterruptLab({ id }: { id: string }) {
  const [requests, setRequests] = useState<{ body: unknown; context: unknown }[]>([])
  const [fail, setFail] = useState(id === 'AGUI-HITL-004')
  const [receipt, setReceipt] = useState('')
  const [cached, setCached] = useState<RunAgentResumeItem[] | null>(null)
  // RUN_ERROR clears the SDK's implicit lastResume. Retain the actual interrupted
  // request identity with its answer so retry resumes the same parent, not a tool.
  const [interruptedRun, setInterruptedRun] = useState<ChatResumeState | null>(null)
  const [local] = useState(() =>
    createLocalConnection((_m, body, context) =>
      setRequests((rows) => [...rows, { body, context }]),
    ),
  )
  const chat = useChat({
    threadId: `local-interrupt-${id}`,
    connection: local.connection,
    onChunk(chunk) {
      if (chunk.type === 'RUN_FINISHED' && chunk.outcome?.type === 'interrupt')
        setInterruptedRun({ threadId: chunk.threadId, runId: chunk.runId })
    },
  })
  const [attempt, setAttempt] = useState(0)
  async function start() {
    chat.clear()
    setInterruptedRun(null)
    setCached(null)
    setReceipt('')
    setAttempt(0)
    setRequests([])
    local.next([
      { type: 'TOOL_CALL_START', toolCallId: 'tc-local', toolCallName: 'local_preview_only' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'tc-local', delta: '{}' },
      { type: 'TOOL_CALL_END', toolCallId: 'tc-local' },
      {
        type: 'RUN_FINISHED',
        outcome: {
          type: 'interrupt',
          interrupts: [
            {
              id: 'local-interrupt',
              reason: 'tanstack:client_tool_execution',
              toolCallId: 'tc-local',
              metadata: { kind: 'client_tool', toolName: 'local_preview_only', input: {} },
            },
          ],
        },
      },
    ])
    await chat.sendMessage('本地请求：预览工具交互，不修改文档。')
  }
  async function resume(value: unknown) {
    const target = interruptedRun
    if (!target) {
      setReceipt('缺少原始中断运行记录，请重新开始本地中断。')
      return false
    }
    const responses =
      cached ||
      structuredClone([
        { interruptId: 'local-interrupt', status: 'resolved' as const, payload: value },
      ])
    setCached(responses)
    setAttempt((n) => n + 1)
    local.next(
      fail
        ? [
            {
              type: 'RUN_ERROR',
              message: '模拟续传失败；工具答复已缓存。',
              code: 'LOCAL_RESUME_FAILURE',
            },
          ]
        : [
            {
              type: 'TOOL_CALL_RESULT',
              messageId: 'local-tool-result',
              toolCallId: 'tc-local',
              content: JSON.stringify(responses[0]?.payload),
              role: 'tool',
            },
            { type: 'TEXT_MESSAGE_START', messageId: 'local-resumed-answer', role: 'assistant' },
            {
              type: 'TEXT_MESSAGE_CONTENT',
              messageId: 'local-resumed-answer',
              delta: '本地续传成功，已收到缓存的工具答复。未调用文档工具。',
            },
            { type: 'TEXT_MESSAGE_END', messageId: 'local-resumed-answer' },
          ],
    )
    const ok = await chat.resumeInterruptsUnsafe(structuredClone(responses), { ...target })
    if (ok) {
      setCached(null)
      setInterruptedRun(null)
    }
    setReceipt(ok ? '本地续传成功' : '续传失败，保留缓存答复；请关闭模拟失败后仅重送。')
    return ok
  }
  return (
    <section className="interrupt-lab">
      <div className="demo-toolbar">
        <button
          type="button"
          className="demo-primary"
          onClick={() => void start()}
          disabled={chat.isLoading}
        >
          开始本地中断
        </button>
        <label>
          <input type="checkbox" checked={fail} onChange={(e) => setFail(e.target.checked)} />
          模拟续传失败
        </label>
        <button
          type="button"
          disabled={!cached || chat.isLoading}
          onClick={() => void resume(cached?.[0]?.payload)}
        >
          仅重送缓存答复
        </button>
        <button
          type="button"
          disabled={(!chat.interrupts.length && !cached) || chat.isLoading}
          onClick={() => {
            chat.cancelInterrupts()
            setCached(null)
            setInterruptedRun(null)
            setReceipt('已取消本地中断')
          }}
        >
          取消中断
        </button>
      </div>
      <p className="demo-notice">
        真实 useChat 中断 / resumeUnsafe 沙盒。未执行 Agent 工具；产品传输须过滤 wire
        parentRunId，并保留客户端内部关联。失败通过 false
        返回；缓存答复连同原始中断运行记录保留，重送只创建该运行的续轮，不重跑工具。
      </p>
      <ChatMessages messages={chat.messages} running={chat.isLoading} allowRetry={false} />
      {chat.interrupts.length > 0 && (
        <ToolResponse
          key={`${id}-${attempt}`}
          mode={id === 'AGUI-HITL-002' ? 'questions' : 'decision'}
          onSubmit={resume}
        />
      )}
      <p role="status">{receipt}</p>
      <details>
        <summary>本地请求与答复证据 · {requests.length} 次</summary>
        <pre>{JSON.stringify(requests, null, 2)}</pre>
        <pre>
          {JSON.stringify(
            {
              interruptedRun,
              cachedResponse: cached,
              interrupts: chat.interrupts,
              errors: chat.interruptErrors,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </section>
  )
}
