import { useMemo } from 'react'
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { ThreadMessageLike, ToolCallMessagePartStatus } from '@assistant-ui/react'
import {
  ReasoningRoot,
  ReasoningTrigger,
  ReasoningContent,
  ReasoningText,
} from './vendor/packages/ui/src/components/react/assistant-ui/elements/reasoning'
import {
  ToolFallbackRoot,
  ToolFallbackTrigger,
  ToolFallbackContent,
  ToolFallbackArgs,
  ToolFallbackResult,
  ToolFallbackError,
} from './vendor/packages/ui/src/components/react/assistant-ui/elements/tool-fallback.aui'
import './official.scoped.css'

type Props = {
  kind: 'waiting' | 'reasoning' | 'tool'
  running?: boolean
  openInitially?: boolean
  text?: string
  toolName?: string
  argsText?: string
  result?: unknown
  cancelled?: boolean
  failed?: boolean
}
const noGroups = () => null
const convertMessage = (message: ThreadMessageLike) => message
const onNew = async () => {}

/** Local protocol fixture only. UI components and indicator branch retain upstream source. */
export function OfficialMessage({
  kind,
  running = false,
  openInitially = false,
  text = '',
  toolName = '',
  argsText = '',
  result,
  failed = false,
  cancelled = false,
}: Props) {
  const messages = useMemo<ThreadMessageLike[]>(
    () => [
      {
        id: 'official-protocol-fixture',
        role: 'assistant',
        status: running
          ? { type: 'running' }
          : cancelled
            ? { type: 'incomplete', reason: 'cancelled' }
            : failed && kind !== 'tool'
              ? { type: 'incomplete', reason: 'error', error: '工具未完成，请查看能力或版本' }
              : { type: 'complete', reason: 'stop' },
        content:
          kind === 'reasoning'
            ? [{ type: 'reasoning', text }]
            : kind === 'tool'
              ? [
                  {
                    type: 'tool-call',
                    toolCallId: 'official-tool-fixture',
                    toolName,
                    argsText,
                    args: {},
                    ...(running ? {} : { result, isError: failed }),
                  },
                ]
              : [],
      },
    ],
    [kind, running, failed, cancelled, text, toolName, argsText, result],
  )
  const runtime = useExternalStoreRuntime({ messages, convertMessage, isRunning: running, onNew })
  const toolStatus: ToolCallMessagePartStatus = running
    ? { type: 'running' }
    : cancelled
      ? { type: 'incomplete', reason: 'cancelled' }
      : failed
        ? { type: 'incomplete', reason: 'error', error: '工具未完成，请查看能力或版本' }
        : { type: 'complete' }
  return (
    <div className="official-message" data-official-kind={kind}>
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Messages>
          {() => (
            <MessagePrimitive.Root>
              <MessagePrimitive.GroupedParts groupBy={noGroups}>
                {({ part }) => {
                  switch (part.type) {
                    case 'reasoning':
                      return (
                        <ReasoningRoot defaultOpen={openInitially} streaming={running}>
                          <ReasoningTrigger active={running} duration={running ? 2 : 2.3} />
                          <ReasoningContent aria-busy={running}>
                            <ReasoningText>{part.text}</ReasoningText>
                          </ReasoningContent>
                        </ReasoningRoot>
                      )
                    case 'tool-call':
                      return (
                        <ToolFallbackRoot defaultOpen={openInitially}>
                          <ToolFallbackTrigger toolName={part.toolName} status={toolStatus} />
                          <ToolFallbackContent>
                            <ToolFallbackError status={toolStatus} />
                            <ToolFallbackArgs argsText={part.argsText} />
                            <ToolFallbackResult result={part.result} />
                          </ToolFallbackContent>
                        </ToolFallbackRoot>
                      )
                    // Exact official Thread AssistantMessage indicator branch, fixed SHA in provenance.
                    case 'indicator':
                      return (
                        <span
                          data-slot="aui_assistant-message-indicator"
                          className="animate-pulse font-sans"
                          aria-label="Assistant is working"
                        >
                          {'●'}
                        </span>
                      )
                    default:
                      return null
                  }
                }}
              </MessagePrimitive.GroupedParts>
            </MessagePrimitive.Root>
          )}
        </ThreadPrimitive.Messages>
      </AssistantRuntimeProvider>
    </div>
  )
}
