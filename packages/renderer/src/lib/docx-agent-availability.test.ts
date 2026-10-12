import { expect, it } from 'vitest'
import type { DocxAgentHandle } from '@mimir/office'
import { availableDocxAgent } from './docx-agent-availability'

it('uses ordinary document Q&A until a chat model is ready', () => {
  const agent = { documentId: 'doc-1' } as DocxAgentHandle
  expect(availableDocxAgent(agent, undefined)).toBeNull()
  expect(
    availableDocxAgent(agent, {
      documentId: 'doc-1',
      modelReady: false,
      availableTools: [],
      unavailableTools: [],
    }),
  ).toBeNull()
  expect(
    availableDocxAgent(agent, {
      documentId: 'doc-1',
      modelReady: true,
      availableTools: ['read_blocks'],
      unavailableTools: [],
    }),
  ).toBe(agent)
})
