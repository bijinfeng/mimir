import { expect, it } from 'vitest'
import type { ChatDocumentAgent } from '@mimir/chat'
import type { DocumentAgentCapabilities, DocxAgentCapabilities } from '@mimir/shared'
import { availableDocumentAgent, availableDocxAgent } from './docx-agent-availability'

const docx: DocxAgentCapabilities = {
  documentId: 'doc-1',
  modelReady: false,
  mediaKinds: [],
  availableTools: [],
  unavailableTools: [],
}
it('keeps a verified DOCX canvas available independently of the legacy role model', () => {
  const agent = { documentId: 'doc-1', format: 'docx' } as ChatDocumentAgent
  expect(availableDocxAgent(agent, undefined)).toBeNull()
  expect(availableDocxAgent(agent, docx)).toBe(agent)
  expect(availableDocxAgent(agent, { ...docx, modelReady: true })).toBe(agent)
  expect(availableDocxAgent(null, docx)).toBeNull()
  expect(availableDocxAgent(agent, { ...docx, documentId: 'other' })).toBeNull()
  expect(availableDocxAgent({ ...agent, format: 'pptx' }, docx)).toBeNull()
})
it('requires the exact document, format and executable canvas without gating on legacy modelReady', () => {
  const agent = { documentId: 'doc-1', format: 'pptx' } as ChatDocumentAgent
  const capabilities: DocumentAgentCapabilities = { ...docx, format: 'pptx', executorReady: true }
  expect(availableDocumentAgent(agent, capabilities)).toBe(agent)
  expect(availableDocumentAgent(agent, { ...capabilities, modelReady: true })).toBe(agent)
  expect(availableDocumentAgent(null, capabilities)).toBeNull()
  expect(availableDocumentAgent(agent, undefined)).toBeNull()
  expect(availableDocumentAgent(agent, { ...capabilities, executorReady: false })).toBeNull()
  expect(availableDocumentAgent(agent, { ...capabilities, documentId: 'other' })).toBeNull()
  expect(availableDocumentAgent(agent, { ...capabilities, format: 'xlsx' })).toBeNull()
})
