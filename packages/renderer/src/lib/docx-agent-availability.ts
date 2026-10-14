import type { ChatDocumentAgent } from '@mimir/chat'
import type { DocxAgentCapabilities } from '@mimir/shared'

/** Until a chat model is ready, document questions use the existing search path. */
export function availableDocxAgent(
  agent: ChatDocumentAgent | null | undefined,
  capabilities: DocxAgentCapabilities | undefined,
): ChatDocumentAgent | null {
  return capabilities?.modelReady ? (agent ?? null) : null
}
