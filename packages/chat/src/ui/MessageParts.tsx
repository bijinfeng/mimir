import { useContext } from 'react'
import type { ComponentType } from 'react'
import type { UIMessage } from '@tanstack/ai'
import { automaticPartsForMessage } from '@tanstack/ai-client/ui'
import type { ChatUISelectedPart } from '@tanstack/ai-client/ui'
import { SelectedMessagesContext, useChatComposition } from './context.js'
import { useChatMessage } from '../runtime/runtime-context.js'
import { ToolGroup } from '../parts/ToolCallPart.js'
import { SubagentWidget, ToolWidget, displayedToolPart, toolsComponents } from './widgets.js'

type SelectedTool = Extract<ChatUISelectedPart, { key: 'toolCall' }>

export function MessageParts({ message }: { message: UIMessage }) {
  const { Message } = useChatComposition()
  // Keep one stable composition tree when a thinking/text stream later adds
  // its first tool call. Switching from automatic Parts here would remount it.
  return <Message message={message}>{renderMessageParts}</Message>
}

function renderMessageParts(parts: ChatUISelectedPart[]) {
  return <SelectedParts localParts={parts} />
}

function SelectedParts({ localParts }: { localParts: ChatUISelectedPart[] }) {
  const { message, sidecar } = useChatMessage()
  const messages = useContext(SelectedMessagesContext)
  const selected = messages.find((item) => item.message.id === message.id)
  const parts = automaticPartsForMessage(selected ?? { message, parts: localParts })
  const { Part } = useChatComposition()
  const rows: { key: string; parts: ChatUISelectedPart[] }[] = []
  const counts = new Map<string, number>()
  for (const part of parts) {
    const occurrence = counts.get(part.key) ?? 0
    counts.set(part.key, occurrence + 1)
    const key = part.key === 'toolCall' ? part.part.id : `${message.id}:${part.key}:${occurrence}`
    const previous = rows.at(-1)
    if (part.key === 'toolCall' && previous?.parts[0]?.key === 'toolCall') previous.parts.push(part)
    else rows.push({ key, parts: [part] })
  }
  return rows.map((row) => {
    const first = row.parts[0]!
    if (first.key !== 'toolCall')
      return (
        <Part key={row.key} part={first}>
          {renderPart}
        </Part>
      )
    const tools = row.parts.filter((part): part is SelectedTool => part.key === 'toolCall')
    return (
      <ToolGroup
        key={row.key}
        parts={tools.map(displayedToolPart)}
        halted={
          sidecar.stopped ? 'cancelled' : sidecar.error || sidecar.failure ? 'error' : undefined
        }
      >
        {tools.map((tool) => (
          <Part key={tool.part.id} part={tool}>
            {renderPart}
          </Part>
        ))}
      </ToolGroup>
    )
  })
}

function renderPart(selected: ChatUISelectedPart & { Render: ComponentType }) {
  // SDK automatic tool/subagent dispatch intentionally has no unknown-name
  // fallback. The public Part render prop keeps historical payloads visible,
  // without registering executable client tools or rebuilding the factory.
  if (selected.key === 'toolCall' && !Object.hasOwn(toolsComponents, selected.part.name))
    return <ToolWidget part={selected.part} result={selected.result} />
  if (selected.key === 'subagent' && selected.part.type === 'subagent')
    return <SubagentWidget part={selected.part} />
  const { Render } = selected
  return <Render />
}
