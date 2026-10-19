import { EventSchema } from '@ag-ui/core/schemas'
import jsonPatch from 'fast-json-patch'
import type { Operation } from 'fast-json-patch'

export type DemoEvent = Record<string, unknown>
export type ProtocolState = {
  shared: unknown
  activities: Record<string, { type: string; content: unknown }>
  reasoning: 'idle' | 'running' | 'complete'
  diagnostics: string[]
}
export const emptyProtocolState = (): ProtocolState => ({
  shared: {},
  activities: {},
  reasoning: 'idle',
  diagnostics: [],
})
export const legacyTypes: Record<string, string> = {
  THINKING_START: 'REASONING_START',
  THINKING_END: 'REASONING_END',
  THINKING_TEXT_MESSAGE_START: 'REASONING_MESSAGE_START',
  THINKING_TEXT_MESSAGE_CONTENT: 'REASONING_MESSAGE_CONTENT',
  THINKING_TEXT_MESSAGE_END: 'REASONING_MESSAGE_END',
}
export function normalizeLegacy(event: DemoEvent, messageId = 'legacy-reasoning'): DemoEvent {
  return legacyTypes[String(event.type)]
    ? {
        ...event,
        type: legacyTypes[String(event.type)],
        messageId,
        ...(event.type === 'THINKING_TEXT_MESSAGE_START' ? { role: 'reasoning' } : {}),
      }
    : event
}
export function atomicPatch(value: unknown, patch: unknown): unknown {
  if (!Array.isArray(patch)) throw new Error('Patch 必须是 RFC 6902 数组')
  return jsonPatch.applyPatch(structuredClone(value), patch as Operation[], true, false, true)
    .newDocument
}
/** Local teaching sidecar; it never turns unknown payloads into executable UI. */
export function reduceProtocol(previous: ProtocolState, event: DemoEvent): ProtocolState {
  const next = {
    ...previous,
    activities: { ...previous.activities },
    diagnostics: [...previous.diagnostics],
  }
  try {
    switch (event.type) {
      case 'RUN_STARTED':
        next.reasoning = 'idle'
        break
      case 'STATE_SNAPSHOT':
        next.shared = structuredClone(event.snapshot)
        break
      case 'STATE_DELTA':
        next.shared = atomicPatch(previous.shared, event.delta)
        break
      case 'ACTIVITY_SNAPSHOT': {
        const id = String(event.messageId)
        if (event.replace !== false || !previous.activities[id])
          next.activities[id] = {
            type: String(event.activityType),
            content: structuredClone(event.content),
          }
        if (event.activityType !== 'progress')
          next.diagnostics.push(`Activity ${String(event.activityType)} 无注册界面，仅保存数据。`)
        break
      }
      case 'ACTIVITY_DELTA': {
        const id = String(event.messageId),
          activity = previous.activities[id]
        if (!activity) throw new Error('Activity 尚无快照')
        next.activities[id] = { ...activity, content: atomicPatch(activity.content, event.patch) }
        break
      }
      case 'REASONING_START':
      case 'REASONING_MESSAGE_START':
        next.reasoning = 'running'
        break
      case 'REASONING_END':
        next.reasoning = 'complete'
        break
      case 'RUN_FINISHED':
      case 'RUN_ERROR':
        if (next.reasoning === 'running') next.reasoning = 'complete'
        break
      case 'REASONING_ENCRYPTED_VALUE':
        next.diagnostics.push('不透明推理签名仅用于协议连续性，不解码、不作为思考正文。')
        break
      case 'CUSTOM':
        if (
          !String(event.name).startsWith('mimir.') &&
          !String(event.name).startsWith('structured-output.')
        )
          next.diagnostics.push(`扩展 ${String(event.name)} 无注册界面；保留数据，不执行组件。`)
        break
    }
  } catch (error) {
    next.diagnostics.push(`${String(event.type)} 无法应用，保留最后有效状态：${String(error)}`)
  }
  return next
}
/** Schema + local sequence preflight. Invalid fixture frames do not reach useChat. */
export function prepareEvents(input: DemoEvent[]): {
  accepted: DemoEvent[]
  diagnostics: string[]
} {
  const accepted: DemoEvent[] = [],
    diagnostics: string[] = []
  let active = false,
    ended = false
  let legacyNumber = 0
  const messages = new Map<string, string>(),
    closedMessages = new Set<string>(),
    tools = new Set<string>(),
    closedTools = new Set<string>(),
    children = new Set<string>()
  for (const [index, original] of input.entries()) {
    if (original.type === 'THINKING_START') legacyNumber++
    const event = normalizeLegacy(original, `legacy-reasoning-${legacyNumber}`),
      type = String(event.type)
    const parsed = EventSchema.safeParse(event)
    let problem = parsed.success
      ? ''
      : parsed.error.issues
          .map(
            (i: { path: PropertyKey[]; message: string }) =>
              `${i.path.map(String).join('.')}: ${i.message}`,
          )
          .join('; ')
    if (!problem) {
      if (type === 'RUN_STARTED') {
        if (active) problem = '根运行重复开始'
        else {
          active = true
          ended = false
          messages.clear()
          closedMessages.clear()
          tools.clear()
          closedTools.clear()
          children.clear()
        }
      } else if (!active || ended)
        problem = '事件不在有效运行内（第一帧应为 RUN_STARTED，终态后须开启新运行）'
      else if (type === 'TEXT_MESSAGE_START') {
        const id = String(event.messageId)
        if (messages.has(id)) problem = '消息身份重复或与 CHUNK 序列冲突'
        else messages.set(id, String(event.role))
      } else if (type === 'TEXT_MESSAGE_CONTENT' || type === 'TEXT_MESSAGE_END') {
        if (!messages.has(String(event.messageId))) problem = '找不到匹配的消息开始'
        else if (closedMessages.has(String(event.messageId)))
          problem = '消息已结束，不能继续内容或重复结束'
        else if (type === 'TEXT_MESSAGE_END') closedMessages.add(String(event.messageId))
      } else if (type === 'TEXT_MESSAGE_CHUNK') {
        const id = event.messageId ? String(event.messageId) : [...messages.keys()].at(-1)
        if (!id) problem = '首个 CHUNK 缺 messageId'
        else if (closedMessages.has(id)) problem = '消息已结束，不能继续 CHUNK'
        else if (event.role && messages.has(id) && messages.get(id) !== String(event.role))
          problem = '分片角色冲突'
        else if (!messages.has(id)) messages.set(id, String(event.role || 'assistant'))
      } else if (type === 'TOOL_CALL_START') {
        if (tools.has(String(event.toolCallId))) problem = '工具调用身份重复'
        else tools.add(String(event.toolCallId))
      } else if (
        type === 'TOOL_CALL_ARGS' ||
        type === 'TOOL_CALL_END' ||
        type === 'TOOL_CALL_RESULT'
      ) {
        if (!tools.has(String(event.toolCallId))) problem = '工具结果/分片缺少对应调用'
        else if (type !== 'TOOL_CALL_RESULT' && closedTools.has(String(event.toolCallId)))
          problem = '工具参数已结束'
        else if (type === 'TOOL_CALL_END') closedTools.add(String(event.toolCallId))
      } else if (type === 'TOOL_CALL_CHUNK') {
        if (!tools.size && (!event.toolCallId || !event.toolCallName))
          problem = '首个工具 CHUNK 缺身份或工具名称'
        else if (event.toolCallId) tools.add(String(event.toolCallId))
      } else if (type === 'SUBAGENT_STARTED') {
        if (children.has(String(event.subagentRunId))) problem = '子 Agent 身份重复'
        else children.add(String(event.subagentRunId))
      } else if (type === 'SUBAGENT_FINISHED' || type === 'SUBAGENT_ERROR') {
        if (!children.delete(String(event.subagentRunId))) problem = '找不到对应子 Agent'
      } else if (type === 'RUN_FINISHED' || type === 'RUN_ERROR') {
        if (
          children.size &&
          type === 'RUN_FINISHED' &&
          (event.outcome as { type?: string } | undefined)?.type !== 'interrupt'
        )
          problem = '子 Agent 尚未结束，根运行不能声明成功'
        else {
          active = false
          ended = true
        }
      }
      if (
        !problem &&
        event.subagentRunId &&
        !type.startsWith('SUBAGENT_') &&
        !children.has(String(event.subagentRunId))
      )
        problem = '未知子 Agent 归属'
    }
    if (problem) {
      diagnostics.push(`第 ${index + 1} 帧 ${type} 被本地演示边界拒绝：${problem}`)
      break
    }
    accepted.push(event)
  }
  return { accepted, diagnostics }
}
