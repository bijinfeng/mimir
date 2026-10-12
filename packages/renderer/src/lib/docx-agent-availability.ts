import type { DocxAgentHandle } from '@mimir/office'
import type { DocxAgentCapabilities } from '@mimir/shared'

/** Until a chat model is ready, document questions use the existing search path. */
export function availableDocxAgent(
  agent: DocxAgentHandle | null | undefined,
  capabilities: DocxAgentCapabilities | undefined,
): DocxAgentHandle | null {
  return capabilities?.modelReady ? (agent ?? null) : null
}
