import { useChatMessage } from '../runtime/runtime-context.js'
export function useCitationsPart() {
  return useChatMessage().sidecar.citations ?? []
}
export function useFailurePart() {
  return useChatMessage().sidecar.failure ?? null
}
export function useDocxAgentPart() {
  return useChatMessage().sidecar.agent ?? null
}
export function textOfParts(
  parts: readonly { type: string; text?: string; content?: unknown }[],
): string {
  return parts
    .map((part) =>
      part.type === 'text'
        ? (part.text ?? (typeof part.content === 'string' ? part.content : ''))
        : '',
    )
    .join('')
}
