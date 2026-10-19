import { useChat } from '@tanstack/ai-react'
import type { ChatUIHost } from '@tanstack/ai-react/ui'
import type { UIMessage } from '@tanstack/ai'
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { installDomShims } from '../test-dom.js'
import { MessageContext } from '../runtime/runtime-context.js'
import { OfficialChatProvider } from './kit.js'
import { MessageParts } from './MessageParts.js'

installDomShims()

const roots: ReturnType<typeof createRoot>[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount())
  document.body.replaceChildren()
})

// Real SDK host and production composition. This isolates the UI boundary that
// HTTP reducer tests cannot produce: old tool results in separate messages.
function Harness({
  initialMessages,
  ready,
}: {
  initialMessages: UIMessage[]
  ready: (host: ChatUIHost<unknown>) => void
}) {
  const host = useChat({
    initialMessages,
    connection: {
      async *connect() {
        yield* []
      },
    },
  })
  useEffect(() => ready(host), [host, ready])
  return (
    <OfficialChatProvider chat={host}>
      {host.messages.map((message) => (
        <MessageContext
          key={message.id}
          value={{ message, sidecar: { reasoningRunning: false }, running: false }}
        >
          <MessageParts message={message} />
        </MessageContext>
      ))}
    </OfficialChatProvider>
  )
}

async function mount(messages: UIMessage[]) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  let host: ChatUIHost<unknown> | undefined
  const ready = (next: ChatUIHost<unknown>) => {
    host = next
  }
  await act(async () => root.render(<Harness initialMessages={messages} ready={ready} />))
  return {
    container,
    update: async (next: UIMessage[]) => {
      if (!host) throw new Error('SDK host was not mounted')
      await act(async () => host!.setMessages(next))
    },
  }
}

async function click(button: HTMLButtonElement | undefined | null) {
  if (!button) throw new Error('Expected disclosure button')
  await act(async () => button.click())
}
function buttonContaining(container: HTMLElement, text: string) {
  return [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes(text),
  )
}

describe('official UI production composition', () => {
  it('associates cross-message results once, preserves orphan output, and displays unknown tools', async () => {
    const { container } = await mount([
      {
        id: 'assistant',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'legacy',
            name: 'unknown_legacy_tool',
            arguments: '{"q":"old"}',
            state: 'input-complete',
          },
          {
            type: 'tool-call',
            id: 'known',
            name: 'read_blocks',
            arguments: '{}',
            state: 'input-complete',
          },
        ],
      },
      {
        id: 'results',
        role: 'assistant',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'legacy',
            state: 'complete',
            content: 'legacy-result',
          },
          {
            type: 'tool-result',
            toolCallId: 'known',
            state: 'error',
            content: 'known-failed',
          },
          {
            type: 'tool-result',
            toolCallId: 'missing-call',
            state: 'complete',
            content: 'orphan-result',
          },
        ],
      },
    ])
    expect(container.textContent).toContain('工具调用 · 2')
    expect(buttonContaining(container, '工具调用')?.textContent).toContain('调用失败')
    await click(buttonContaining(container, '工具调用'))
    expect(container.textContent).toContain('unknown_legacy_tool')
    expect(container.textContent).toContain('调用失败')
    await click(buttonContaining(container, 'unknown_legacy_tool'))
    await click(buttonContaining(container, 'read_blocks'))
    expect(container.textContent?.match(/legacy-result/g)).toHaveLength(1)
    expect(container.textContent?.match(/known-failed/g)).toHaveLength(1)
    expect(container.querySelectorAll('details')).toHaveLength(1)
    expect(container.textContent).toContain('orphan-result')
    expect(container.textContent).not.toContain('调用中…')
  })

  it('keeps user text literal and never exposes redacted thinking through registered widgets', async () => {
    const { container } = await mount([
      {
        id: 'user',
        role: 'user',
        parts: [{ type: 'text', content: '**原样问题** <script>literal</script>' }],
      },
      {
        id: 'secret',
        role: 'assistant',
        parts: [{ type: 'thinking', content: 'encrypted-private-payload', redacted: true }],
      },
    ])
    expect(container.textContent).toContain('**原样问题** <script>literal</script>')
    expect(container.querySelector('strong')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('加密思考内容不展示')
    expect(container.textContent).not.toContain('encrypted-private-payload')
  })

  it('keeps opened thinking and tool disclosures mounted when the first tool and later chunks arrive', async () => {
    const first: UIMessage = {
      id: 'answer',
      role: 'assistant',
      parts: [
        { type: 'thinking', content: '先检查资料' },
        { type: 'text', content: '初步回答' },
      ],
    }
    const { container, update } = await mount([first])
    const thinking = buttonContaining(container, '思考过程')!
    await click(thinking)
    const withTool: UIMessage = {
      ...first,
      parts: [
        ...first.parts,
        {
          type: 'tool-call',
          id: 't1',
          name: 'read_blocks',
          arguments: '{}',
          state: 'input-complete',
        },
      ],
    }
    await update([withTool])
    expect(buttonContaining(container, '思考过程')).toBe(thinking)
    expect(thinking.getAttribute('aria-expanded')).toBe('true')
    const group = buttonContaining(container, '工具调用')!
    await click(group)
    const tool = buttonContaining(container, 'read_blocks')!
    await click(tool)
    tool.focus()
    await update([
      {
        ...withTool,
        parts: withTool.parts.map((part) =>
          part.type === 'tool-call'
            ? Object.assign({}, part, { state: 'complete' as const, output: '完成结果' })
            : part.type === 'text'
              ? Object.assign({}, part, { content: '初步回答继续增长' })
              : part,
        ),
      },
    ])
    expect(buttonContaining(container, '思考过程')).toBe(thinking)
    expect(buttonContaining(container, '工具调用')).toBe(group)
    expect(buttonContaining(container, 'read_blocks')).toBe(tool)
    expect(tool.getAttribute('aria-expanded')).toBe('true')
    expect(group.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(tool)
    expect(container.textContent).toContain('完成结果')
    expect(container.textContent).toContain('初步回答继续增长')
  })
})
