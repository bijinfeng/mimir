import type { ChatDocumentAgent } from '@mimir/chat'
import type { DocxAgentCapabilities, DocumentAgentCapabilities } from '@mimir/shared'

/** Host readiness is independent of the legacy role; each send validates its selected model. */
export function availableDocxAgent(
  agent: ChatDocumentAgent | null | undefined,
  capabilities: DocxAgentCapabilities | undefined,
): ChatDocumentAgent | null {
  return agent &&
    capabilities?.documentId === agent.documentId &&
    (agent.format ?? 'docx') === 'docx'
    ? agent
    : null
}

export function availableDocumentAgent(
  agent: ChatDocumentAgent | null | undefined,
  capabilities: DocumentAgentCapabilities | undefined,
): ChatDocumentAgent | null {
  return agent &&
    capabilities?.executorReady &&
    capabilities.documentId === agent.documentId &&
    capabilities.format === (agent.format ?? 'docx')
    ? agent
    : null
}
