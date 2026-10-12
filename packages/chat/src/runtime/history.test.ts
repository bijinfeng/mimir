import type { Message } from '@mimir/shared'
import { ExportedMessageRepository } from '@assistant-ui/react'
import { describe, expect, it } from 'vitest'
import { createHistoryAdapter, toThreadMessage } from './history.js'
import type { ChatIo } from './io.js'

/**
 * 落库消息 → 对话引擎消息形状的转换。
 *
 * 这是本次重做里**唯一一处「历史保真」的落点**：历史会话里的检索过程、
 * 引用、失败卡能不能显示，全看这几个字段有没有被转成 data part。
 * 搬迁前那一块靠 `RoundResult.tsx` 的 `resolveRound` 按**位置**对齐
 * （实时份与落库份是两条数据流），现在两者同一个形状。
 *
 * 所以这里的断言盯的是**part 的名字与顺序**，不是「有没有渲染出来」——
 * 渲染那条路由组件的测试管（形状对了、名字对了，渲染就是查表）。
 */
/**
 * 最小可用的 ChatIo：历史适配器只会用到 loadConversation（其余几个是
 * 「包的动作面」其他部分的，这里必须存在以满足类型）。
 */
function ioWith(conversation: { messages: Message[] } | null): ChatIo {
  return {
    createConversation: async () => ({ id: 'new' }),
    loadConversation: async () => conversation,
    onConversationCreated: () => {},
    onTurnSettled: () => {},
    saveAsNote: async () => ({ noteId: 'n1' }),
    onManageModels: () => {},
  }
}

/**
 * 落库消息的构造器。
 *
 * 用它而不是到处写完整字面量：`Message` 有八个字段（含 `savedNoteId`
 * 这种与渲染无关的），逐个补齐会让每条用例的重点被埋掉——
 * 而**补不齐会在类型层报错**，这正是我们要的（契约改了这里会红）。
 */
function storedMessage(
  overrides: Partial<Message> & Pick<Message, 'id' | 'role' | 'text'>,
): Message {
  return {
    trace: null,
    citations: [],
    failure: null,
    savedNoteId: null,
    createdAt: '2026-10-05T00:00:00.000Z',
    ...overrides,
  }
}

describe('history：Message → ThreadMessageLike', () => {
  const stored: Message = storedMessage({
    id: 'a1',
    role: 'assistant',
    text: '这是回答正文。',
    trace: {
      rounds: 2,
      tools: 3,
      tookMs: 4210,
      steps: [{ icon: 'search', text: '通道召回结果', keywords: ['组件'], meta: '词级召回 3 段' }],
    },
    citations: [
      {
        documentId: 'd1',
        kind: 'note',
        title: '组件性能优化',
        snippet: '…',
        start: 0,
        end: 5,
        matchedBy: ['keyword'],
      },
    ],
  })

  it('trace / citations 转成同名 data part，正文在最后', () => {
    const message = toThreadMessage(stored)
    expect(message.id).toBe('a1')
    expect(message.role).toBe('assistant')

    const parts = message.content as unknown as { type: string; name?: string; text?: string }[]
    expect(parts.map((part) => part.name ?? part.type)).toEqual([
      'mimir.trace',
      'mimir.citations',
      'text',
    ])
    expect(parts[2]?.text).toBe('这是回答正文。')
  })

  it('失败也落成 data part（历史会话里那张卡要有依据）', () => {
    const message = toThreadMessage(
      storedMessage({ ...stored, failure: 'quota', text: '余额不足' }),
    )
    const parts = message.content as unknown as { type: string; name?: string; data?: unknown }[]
    const failure = parts.find((part) => part.name === 'mimir.failure')
    expect(failure).toBeDefined()
    /* 落库只存分类、没有原始错误文本（messageSchema 只有 text / trace /
       citations / failure），所以 detail 是空串——界面退回 FAILURE_UI 的
       预设说明。这条断言把这个「已知的缺失」钉住：将来真存了原文，
       它会红，那时该改的是这里与 FailureCard 的 detail 取值 */
    expect(failure?.data).toEqual({ failure: 'quota', message: '' })
  })

  it('用户消息只有正文，没有 data part', () => {
    const message = toThreadMessage(storedMessage({ id: 'u1', role: 'user', text: '问题' }))
    expect(message.content).toEqual([{ type: 'text', text: '问题' }])
  })

  it('引用为空时不落一个空的 citations part', () => {
    const message = toThreadMessage(storedMessage({ ...stored, citations: [], trace: null }))
    const parts = message.content as unknown as { name?: string }[]
    expect(parts.map((part) => part.name)).toEqual([undefined])
  })

  it('DOCX 工具历史只映射摘要，不含参数或正文', () => {
    const agent = {
      runId: 'r1',
      documentId: 'd1',
      status: 'pending' as const,
      tools: [
        { interruptId: 'client_tool_tc1', name: 'replace_selection', status: 'pending' as const },
      ],
    }
    const message = toThreadMessage(storedMessage({ id: 'a2', role: 'assistant', text: '', agent }))
    const parts = message.content as unknown as { type: string; name?: string; data?: unknown }[]
    expect(parts.find((part) => part.name === 'mimir.docxAgent')?.data).toEqual({ agent })
    expect(JSON.stringify(parts)).not.toContain('文档正文')
  })
})

describe('history：适配器', () => {
  it('新会话（没有 id）不请求历史，返回空库', async () => {
    let called = 0
    const io = ioWith(null)
    const adapter = createHistoryAdapter(
      {
        ...io,
        loadConversation: async () => {
          called += 1
          return null
        },
      },
      undefined,
    )
    const repository = await adapter.load()
    expect(called).toBe(0)
    expect(repository.messages).toEqual([])
  })

  it('会话不存在时返回空库（由宿主决定怎么报错）', async () => {
    const adapter = createHistoryAdapter(ioWith(null), 'gone')
    const repository = await adapter.load()
    expect(repository.messages).toEqual([])
  })

  it('有历史时按顺序灌入，data part 能被取到', async () => {
    const adapter = createHistoryAdapter(
      ioWith({
        messages: [
          storedMessage({ id: 'u1', role: 'user', text: '问题' }),
          storedMessage({
            id: 'a1',
            role: 'assistant',
            text: '回答',
            trace: { rounds: 1, tools: 1, tookMs: 900, steps: [] },
          }),
        ],
      }),
      'c1',
    )
    const repository = await adapter.load()
    expect(repository.messages.map((item) => item.parentId)).toEqual([null, 'u1'])

    /* 从仓库里回来的是一条 canonical ThreadMessage——trace 就在它的 parts 里，
       与实时流那条路径产出的形状一致（这正是「历史与实时同一个形状」的
       可执行证据） */
    const assistant = repository.messages[1]?.message
    const tracePart = assistant?.content.find(
      (part) => part.type === 'data' && part.name === 'mimir.trace',
    )
    expect(tracePart).toBeDefined()
  })

  it('往返：写进仓库再取出来，part 名字不变', () => {
    const repository = ExportedMessageRepository.fromArray([
      toThreadMessage(
        storedMessage({
          id: 'a1',
          role: 'assistant',
          text: '回答',
          trace: { rounds: 1, tools: 1, tookMs: 100, steps: [] },
        }),
      ),
    ])
    const part = repository.messages[0]?.message.content.find((item) => item.type === 'data')
    expect(part?.name).toBe('mimir.trace')
  })
})
