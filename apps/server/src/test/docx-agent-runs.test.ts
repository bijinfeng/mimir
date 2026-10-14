import { describe, expect, it } from 'vitest'
import { createConversation } from '../services/conversations.js'
import {
  cancelPendingDocxRun,
  consumeDocxInterrupt,
  loadDocxAgentHistory,
  rememberDocxInterrupt,
  settleDocxInterrupt,
} from '../services/docx-agent-runs.js'

describe('DOCX 工具中断的持久续轮绑定', () => {
  it('only resumes the exact conversation, document, round and interrupt set once', async () => {
    const conversation = await createConversation()
    const runId = `run-${crypto.randomUUID()}`
    const roundId = crypto.randomUUID()
    const input = {
      conversationId: conversation.id,
      documentId: 'doc-a',
      roundId,
      messageId: crypto.randomUUID(),
      interruptIds: ['client_tool_call-1', 'client_tool_call-2'],
      tools: [
        { interruptId: 'client_tool_call-1', name: 'insert_content', status: 'pending' as const },
        { interruptId: 'client_tool_call-2', name: 'read_blocks', status: 'pending' as const },
      ],
    }
    await rememberDocxInterrupt({ runId, ...input })

    expect(await consumeDocxInterrupt({ ...input, documentId: 'doc-b' })).toBeNull()
    expect(await consumeDocxInterrupt({ ...input, roundId: 'other-round' })).toBeNull()
    expect(
      await consumeDocxInterrupt({ ...input, interruptIds: ['client_tool_call-1'] }),
    ).toBeNull()
    expect(
      await consumeDocxInterrupt({ ...input, interruptIds: input.interruptIds.toReversed() }),
    ).toBe(runId)
    expect(await consumeDocxInterrupt(input)).toBeNull()
  })

  it('rejects duplicate or non-client interrupt IDs', async () => {
    const conversation = await createConversation()
    const base = {
      conversationId: conversation.id,
      documentId: 'doc-a',
      roundId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      tools: [{ interruptId: 'approval_x', name: 'insert_content', status: 'pending' as const }],
    }
    await expect(
      rememberDocxInterrupt({ runId: crypto.randomUUID(), ...base, interruptIds: ['approval_x'] }),
    ).rejects.toThrow('不支持的工具中断类型')
    await expect(
      consumeDocxInterrupt({ ...base, interruptIds: ['client_tool_x', 'client_tool_x'] }),
    ).rejects.toThrow('无效的工具中断集合')
  })

  it('cancels a pending run and exposes cancelled history without replay', async () => {
    const conversation = await createConversation()
    const runId = `run-${crypto.randomUUID()}`
    const input = {
      runId,
      conversationId: conversation.id,
      documentId: 'doc-a',
      roundId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      interruptIds: ['client_tool_call-3'],
      tools: [
        {
          interruptId: 'client_tool_call-3',
          name: 'replace_selection',
          status: 'pending' as const,
        },
      ],
    }
    await rememberDocxInterrupt(input)
    expect(await cancelPendingDocxRun(conversation.id, runId)).toBe(true)
    expect(await cancelPendingDocxRun(conversation.id, runId)).toBe(false)
    expect(await consumeDocxInterrupt(input)).toBeNull()
    expect((await loadDocxAgentHistory(conversation.id)).get(input.messageId)).toMatchObject({
      status: 'cancelled',
      tools: [{ status: 'cancelled' }],
    })
  })

  it('does not record a malformed resolved result as a successful edit', async () => {
    const conversation = await createConversation()
    const runId = `run-${crypto.randomUUID()}`
    const messageId = crypto.randomUUID()
    await rememberDocxInterrupt({
      runId,
      conversationId: conversation.id,
      documentId: 'doc-a',
      roundId: crypto.randomUUID(),
      messageId,
      interruptIds: ['client_tool_call-invalid'],
      tools: [
        { interruptId: 'client_tool_call-invalid', name: 'insert_content', status: 'pending' },
      ],
    })
    await settleDocxInterrupt(runId, [
      { interruptId: 'client_tool_call-invalid', status: 'resolved', payload: {} },
    ])
    expect((await loadDocxAgentHistory(conversation.id)).get(messageId)).toMatchObject({
      status: 'failed',
      tools: [{ status: 'failed' }],
    })
  })

  it('allows a cancelled in-flight tool to leave a newer unsaved canvas without replay', async () => {
    const conversation = await createConversation()
    const runId = `run-${crypto.randomUUID()}`
    const input = {
      runId,
      conversationId: conversation.id,
      documentId: 'doc-a',
      roundId: crypto.randomUUID(),
      version: 1,
      messageId: crypto.randomUUID(),
      interruptIds: ['client_tool_partial'],
      tools: [
        { interruptId: 'client_tool_partial', name: 'insert_content', status: 'pending' as const },
      ],
    }
    await rememberDocxInterrupt(input)
    const claim = {
      conversationId: input.conversationId,
      documentId: input.documentId,
      roundId: input.roundId,
      version: 2,
      interruptIds: input.interruptIds,
      responses: [{ interruptId: 'client_tool_partial', status: 'cancelled' as const }],
    }
    expect(await consumeDocxInterrupt(claim)).toBe(runId)
    expect(await consumeDocxInterrupt(claim)).toBeNull()
  })
})
