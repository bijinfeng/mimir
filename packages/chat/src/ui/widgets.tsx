import type { ChatUIComponents, PartProps, ToolProps } from '@tanstack/ai-react/ui'
import { DOCX_ALL_TOOLS } from '@mimir/shared'
import { MarkdownPart } from '../parts/MarkdownPart.js'
import { ReasoningPart } from '../parts/ReasoningPart.js'
import { FilePart, ImagePart } from '../parts/MediaParts.js'
import { ToolCallPart } from '../parts/ToolCallPart.js'
import { useChatMessage } from '../runtime/runtime-context.js'

function TextWidget({ part }: PartProps<unknown, 'text'>) {
  const { message } = useChatMessage()
  return message.role === 'user' ? <div>{part.content}</div> : <MarkdownPart text={part.content} />
}
function ThinkingWidget({ part }: PartProps<unknown, 'thinking'>) {
  const { sidecar, running } = useChatMessage()
  if ('redacted' in part && part.redacted) return <p>加密思考内容不展示</p>
  return (
    <ReasoningPart
      text={part.content}
      status={{ type: (sidecar.reasoningRunning ?? running) ? 'running' : 'complete' }}
    />
  )
}
export function displayedToolPart({
  part,
  result,
}: Pick<ToolProps<unknown>, 'part' | 'result'>): ToolProps<unknown>['part'] {
  return {
    ...part,
    state:
      result?.state === 'error' ? 'error' : result?.state === 'complete' ? 'complete' : part.state,
    output: result ? result.content : part.output,
  }
}
export function ToolWidget({ part, result }: ToolProps<unknown>) {
  const { sidecar } = useChatMessage()
  return (
    <ToolCallPart
      part={displayedToolPart({ part, result })}
      halted={
        sidecar.stopped ? 'cancelled' : sidecar.error || sidecar.failure ? 'error' : undefined
      }
    />
  )
}
function ToolResultWidget({ part }: PartProps<unknown, 'toolResult'>) {
  return (
    <details>
      <summary>工具结果</summary>
      <pre>
        {typeof part.content === 'string' ? part.content : JSON.stringify(part.content, null, 2)}
      </pre>
    </details>
  )
}
function MediaWidget({ part }: PartProps<unknown, 'image' | 'document' | 'audio' | 'video'>) {
  const { sidecar } = useChatMessage()
  if (part.type === 'image' && sidecar.snapshot) return null
  const source = part.source
  const mime = source.type === 'data' ? source.mimeType : 'application/octet-stream'
  const value =
    source.type === 'url'
      ? source.value
      : source.type === 'data'
        ? `data:${mime};base64,${source.value}`
        : ''
  if (part.type === 'image') return <ImagePart image={value} />
  if (part.type === 'audio') return <audio controls src={value} aria-label="音频附件" />
  if (part.type === 'video')
    return <video controls src={value} aria-label="视频附件" style={{ maxWidth: '100%' }} />
  const metadata = part.metadata as Record<string, unknown> | undefined
  return (
    <FilePart
      data={value}
      mimeType={mime}
      filename={typeof metadata?.filename === 'string' ? metadata.filename : '附件'}
    />
  )
}
function ActivityWidget({ part }: PartProps<unknown, 'activity'>) {
  return (
    <details>
      <summary>{part.activityType}</summary>
      <pre>{JSON.stringify(part.content, null, 2)}</pre>
    </details>
  )
}
function StructuredWidget({ part }: PartProps<unknown, 'structuredOutput'>) {
  return <pre>{JSON.stringify(part.data ?? part.partial, null, 2)}</pre>
}
export function SubagentWidget({ part }: PartProps<unknown, 'subagent'>) {
  return (
    <details>
      <summary>子任务 · {part.subagent.status}</summary>
      <pre>{JSON.stringify(part.subagent.messages, null, 2)}</pre>
    </details>
  )
}
export const partsComponents = {
  text: TextWidget,
  thinking: ThinkingWidget,
  toolResult: ToolResultWidget,
  image: MediaWidget,
  document: MediaWidget,
  audio: MediaWidget,
  video: MediaWidget,
  activity: ActivityWidget,
  structuredOutput: StructuredWidget,
} satisfies ChatUIComponents<unknown>['partsComponents']

export const toolsComponents = Object.fromEntries(
  DOCX_ALL_TOOLS.map((tool) => [tool.name, ToolWidget]),
)
