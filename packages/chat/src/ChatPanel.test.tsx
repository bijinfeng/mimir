import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { act, createElement } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { installDomShims } from './test-dom.js'
import { ChatPanel } from './ChatPanel.js'
import type { ChatIo } from './runtime/io.js'
import type {
  ChatComposerStatus,
  ChatDocxAgent,
  ChatDraft,
  ChatPanelProps,
  ChatPptxSnapshot,
} from './types.js'
import type { Message } from '@mimir/shared'

/**
 * 面板的端到端挂载（**不 mock 引擎**）。
 *
 * ## 为什么起一个真的 HTTP 服务
 *
 * 这个包最要紧的一条性质是「服务端推来的事件顺序，能被 AG-UI 客户端
 * 消费」——那是协议层的事实，mock 掉它等于把要验的东西验没了
 * （`apps/server/src/test/chat-stream.test.ts` 从服务端那一头验同一件事）。
 *
 * 这里从**组件这一头**验三件事：
 *
 *  1. 检索过程行：`live` 判定（还在跑 → 计时；跑完 → 服务端耗时），
 *     以及**只认最后一个 trace**（服务端一轮推两份，后者覆盖前者）
 *  2. 停止之后的那一行（消息状态 `incomplete` → `StoppedNotice`）
 *  3. 排队：生成中 Enter 排队 → 停止 → **那条回到输入框**（D-098）
 *
 * 这些都是「不报错但错」的那一类（顺序错 → 整轮空；队列不回填 →
 * 用户的字不见了），所以值得从组件这一头再过一遍。
 */
installDomShims()

/**
 * 「停止」那条用例会**主动中止一个还在打开的流**（那正是它的目的）：
 * 客户端走了、连接断了，happy-dom 底下的 Node http client 抛 `ECONNRESET`。
 * 那个拒绝没人接，vitest 会把整轮报成失败——但它不是断言失败，也不代表
 * 被测代码有问题：**中止一条流式请求就是这样**。
 *
 * 所以这里只放过这一种错误（`aborted` / `ECONNRESET`）。**放过的面越窄
 * 越好**——宽一点就成了一把「把真错误也吞掉」的伞，而那种失败最难查。
 *
 * 试过但**不生效**的两条路（别再试）：
 *  - 在服务端那侧接住：`req.on('error')` / `res.on('error')`。
 *    拒绝不是从服务端 socket 来的，是从**客户端**那条连接上冒出来的
 *    （happy-dom 的 fetch → Node 的 http client），服务端接不到
 *  - 改收尾顺序（先 drain 再卸载组件）：那个已经做了（见 afterEach 的说明），
 *    但「点停止」这条路径本来就是**测试主动中止一个在飞的请求**
 */
const ABORT_NOISE = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false
  const code = (error as { code?: string }).code
  return code === 'ECONNRESET' || error.message === 'aborted'
}

const onUnhandled = (error: unknown) => {
  if (ABORT_NOISE(error)) return
  throw error
}
process.on('unhandledRejection', onUnhandled)

const EMPTY_STATUS: ChatComposerStatus = {
  documents: { items: [], isLoading: false, isError: false, refetch: () => {} },
  modelRoles: { chat: 'test-chat', reasoning: 'test-reasoning' },
  usage: null,
}

/**
 * 起一个按脚本推帧的 SSE 服务。
 *
 * `holdAfter` 是「先发前 N 帧、其余等测试放行」——用来把某一刻定住
 * （比如「检索过程到了、正文还没到」）。不给它就一次发完。
 */
function serve(frames: () => string[], options: { holdAfter?: number } = {}) {
  let release: (() => void) | null = null
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })

  /* 被 gate 挂住、还可能开着响应体的那些 res。收尾时要显式结束它们——
     否则测试卸载组件（abort 请求）时那条连接是「服务端还开着、客户端
     已经走了」，Node 报一个 ECONNRESET，而它会被 vitest 报成
     unhandled error，看着像测试自己坏了 */
  const open: { end: () => void }[] = []

  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    open.push(res)
    const write = () => {
      for (const frame of frames()) res.write(frame)
      res.end()
    }
    if (options.holdAfter !== undefined) {
      const all = frames()
      for (const frame of all.slice(0, options.holdAfter)) res.write(frame)
      void gate.then(() => {
        for (const frame of all.slice(options.holdAfter)) res.write(frame)
        res.end()
      })
      return
    }
    write()
  })

  return {
    server,
    /** 收尾：结束还开着的响应体（见上面 open 的说明） */
    drain: () => {
      for (const res of open.splice(0)) {
        try {
          res.end()
        } catch {
          /* 已经结束/已销毁——没什么要做的 */
        }
      }
    },
    listen: async (): Promise<string> => {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      return `http://127.0.0.1:${port}/api/chat`
    },
    release: () => release?.(),
  }
}

const F = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`

/**
 * 等一个条件成立，而不是猜一个 sleep。
 *
 * ## 为什么不能写死 `setTimeout(200)`
 *
 * 这一条链是「HTTP 分块 → SSE 解析 → 引擎状态 → React 渲染」，机器空闲时
 * 它在一帧内走完，而 `pnpm -r test` 并行跑七个包时可能要几百毫秒。
 * 写死 sleep 的后果是**本机单跑全绿、`pnpm check` 里偶发红**——那正是这
 * 一条用例第一次提交时的样子（红了才发现）。
 *
 * 超时给 5 秒：慢到这个数说明真的坏了，而那时抛出的错误带着**当时的界面
 * 文字**，不必再猜是「没到」还是「到了但内容不对」。
 */
async function waitFor(container: HTMLElement, condition: () => boolean, what: string) {
  const deadline = Date.now() + 5000
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`等不到「${what}」；当前界面文字：${container.textContent ?? ''}`)
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15))
    })
  }
}

/** 界面上的文字（断言里反复用，收成一个） */
const textOf = (container: HTMLElement) => container.textContent ?? ''

/** 一段完整的成功流（顺序与服务端一致：RUN_STARTED 在最前、终局 trace 在 RUN_FINISHED 前） */
function successFrames(traceMs = 1200): string[] {
  return [
    F({ type: 'RUN_STARTED', runId: 'r1', threadId: 'c1' }),
    F({
      type: 'CUSTOM',
      name: 'mimir.trace',
      value: { trace: { rounds: 1, tools: 2, tookMs: 3, steps: [] } },
    }),
    F({
      type: 'CUSTOM',
      name: 'mimir.citations',
      value: {
        citations: [
          {
            documentId: 'd1',
            kind: 'note',
            title: '组件性能优化',
            snippet: '片段',
            start: 0,
            end: 2,
            matchedBy: ['keyword'],
          },
        ],
      },
    }),
    F({ type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' }),
    F({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: '回答' }),
    F({ type: 'TEXT_MESSAGE_END', messageId: 'm1' }),
    F({
      type: 'CUSTOM',
      name: 'mimir.trace',
      value: { trace: { rounds: 1, tools: 2, tookMs: traceMs, steps: [] } },
    }),
    F({ type: 'RUN_FINISHED', runId: 'r1', threadId: 'c1' }),
  ]
}

function makeIo(url: string, overrides: Partial<ChatIo> = {}): ChatIo {
  return {
    createConversation: async () => ({ id: 'c1' }),
    loadConversation: async () => ({ messages: [] }),
    onConversationCreated: () => {},
    onTurnSettled: () => {},
    saveAsNote: async () => ({ noteId: 'n1' }),
    onManageModels: () => {},
    chatUrl: url,
    ...overrides,
  }
}

afterAll(() => {
  process.off('unhandledRejection', onUnhandled)
})

let mounted: { root: Root; container: HTMLElement; io: ChatIo } | null = null
const servers: { server: Server; drain: () => void }[] = []

afterEach(async () => {
  /* **先收服务端、再卸组件。** 反过来（先卸组件）会让引擎在流还开着的时候
     中止请求，那条连接就是「服务端仍开着、客户端已经走了」，Node 会报一个
     `ECONNRESET` 的 unhandled rejection——它会把整轮测试报成失败，
     看着像测试自己坏了。先安安静静把响应收完，再卸 */
  for (const { server, drain } of servers.splice(0)) {
    drain()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  if (mounted) {
    await act(async () => mounted?.root.unmount())
    mounted.container.remove()
    mounted = null
  }
})

async function mount(
  io: ChatIo,
  draft: ChatDraft | null = null,
  docxAgent?: ChatDocxAgent,
  conversationId?: string,
  showReasoningControl?: boolean,
  guideActions?: (ask: (question: string) => void) => ReactNode,
  snapshotOptions: Pick<ChatPanelProps, 'draftAgent' | 'snapshotVisionReady'> = {},
) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      createElement(ChatPanel, {
        conversationId,
        draft,
        onOpenCitation: () => {},
        onOpenNote: () => {},
        io,
        composerStatus: EMPTY_STATUS,
        ...snapshotOptions,
        showReasoningControl,
        ...(guideActions ? { guide: () => null, guideActions } : {}),
        ...(docxAgent?.format && docxAgent.format !== 'docx'
          ? { documentAgent: docxAgent }
          : { docxAgent }),
      }),
    )
  })
  mounted = { root, container, io }
  return container
}

async function rerender(draft: ChatDraft | null) {
  if (!mounted) throw new Error('对话面板尚未挂载')
  const { root, io } = mounted
  await act(async () => {
    root.render(
      createElement(ChatPanel, {
        conversationId: undefined,
        draft,
        onOpenCitation: () => {},
        onOpenNote: () => {},
        io,
        composerStatus: EMPTY_STATUS,
      }),
    )
  })
}

/** 往输入框里打字。React 的受控 textarea 要绕开 value 的 setter */
async function type(container: HTMLElement, text: string) {
  const textarea = container.querySelector('textarea')
  if (!textarea) throw new Error('没有输入框')
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(textarea) as object,
    'value',
  )?.set
  await act(async () => {
    setter?.call(textarea, text)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** 点发送（引擎的 composer.send 由这个按钮触达；空闲相位才有它） */
async function send(container: HTMLElement) {
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === '发送',
  )
  if (!button) throw new Error('没有发送按钮')
  await act(async () => {
    button.click()
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
}

describe('ChatPanel：文档侧栏输入控制', () => {
  it('隐藏思考强度后仍显示聊天模型和发送按钮，发送不启用深入思考', async () => {
    const requests: Record<string, unknown>[] = []
    const server = createServer(async (req, res) => {
      const chunks: Uint8Array[] = []
      for await (const chunk of req) chunks.push(chunk as Uint8Array)
      requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>)
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      for (const frame of successFrames()) res.write(frame)
      res.end()
    })
    servers.push({ server, drain: () => {} })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const container = await mount(
      makeIo(`http://127.0.0.1:${port}/api/chat`),
      null,
      undefined,
      undefined,
      false,
    )

    expect(container.querySelector('[aria-label^="思考强度："]')).toBeNull()
    expect(container.querySelector('[aria-label="当前全局模型：test-chat"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="发送"]')).not.toBeNull()

    await type(container, '总结当前文档')
    await send(container)
    await waitFor(container, () => requests.length === 1, '侧栏请求')
    const forwarded = requests[0]?.forwardedProps as
      | { runConfig?: Record<string, unknown> }
      | undefined
    expect(forwarded?.runConfig?.deepReasoning).toBeUndefined()
  })

  it('主视图仍显示思考强度控制', async () => {
    const container = await mount(makeIo('/api/chat'))
    expect(container.querySelector('[aria-label="思考强度：标准"]')).not.toBeNull()
  })

  it('模型菜单只显示名称，当前模型的勾选紧跟名称且绑定项不可切换', async () => {
    const container = await mount(makeIo('/api/chat'))
    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="当前全局模型：test-chat"]',
    )
    await act(async () => trigger?.click())

    const chatName = document.querySelector<HTMLElement>('[role="menuitem"] [title="test-chat"]')
    const reasoningName = document.querySelector<HTMLElement>(
      '[role="menuitem"] [title="test-reasoning"]',
    )
    const chatItem = chatName?.closest('[role="menuitem"]')
    const reasoningItem = reasoningName?.closest('[role="menuitem"]')
    expect(chatName?.textContent).toBe('test-chat')
    expect(reasoningName?.textContent).toBe('test-reasoning')
    expect(chatName?.nextElementSibling?.tagName.toLowerCase()).toBe('svg')
    expect(reasoningName?.nextElementSibling).toBeNull()
    expect(chatItem?.getAttribute('aria-disabled')).toBe('true')
    expect(reasoningItem?.getAttribute('aria-disabled')).toBe('true')
    expect(chatItem?.textContent).toContain('当前使用')
    expect(
      [...document.querySelectorAll('[role="menuitem"]')].some((item) =>
        item.textContent?.includes('管理模型'),
      ),
    ).toBe(true)
  })

  it('未配置模型时仍可区分两种全局绑定及当前使用项', async () => {
    const io = makeIo('/api/chat')
    await mount(io)
    const root = mounted?.root
    if (!root) throw new Error('对话面板尚未挂载')
    await act(async () =>
      root.render(
        createElement(ChatPanel, {
          conversationId: undefined,
          draft: null,
          onOpenCitation: () => {},
          onOpenNote: () => {},
          io,
          composerStatus: { ...EMPTY_STATUS, modelRoles: {} },
        }),
      ),
    )
    const trigger = mounted?.container.querySelector<HTMLButtonElement>(
      '[aria-label="当前全局模型：未配置"]',
    )
    await act(async () => trigger?.click())

    const names = [...document.querySelectorAll<HTMLElement>('[role="menuitem"] [title="未配置"]')]
    expect(names).toHaveLength(2)
    expect(names[0]?.parentElement?.textContent).toContain('对话模型：未配置当前使用')
    expect(names[1]?.parentElement?.textContent).toContain('深度思考模型：未配置')
    expect(names[0]?.nextElementSibling?.tagName.toLowerCase()).toBe('svg')
    expect(names[1]?.nextElementSibling).toBeNull()
  })

  it('隐藏思考强度后，快捷提问也使用标准强度', async () => {
    const requests: Record<string, unknown>[] = []
    const server = createServer(async (req, res) => {
      const chunks: Uint8Array[] = []
      for await (const chunk of req) chunks.push(chunk as Uint8Array)
      requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>)
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      for (const frame of successFrames()) res.write(frame)
      res.end()
    })
    servers.push({ server, drain: () => {} })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const container = await mount(
      makeIo(`http://127.0.0.1:${port}/api/chat`),
      null,
      undefined,
      undefined,
      false,
      (ask) => <button onClick={() => ask('速读本文')}>速读本文</button>,
    )

    const askButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === '速读本文',
    )
    expect(askButton).toBeDefined()
    await act(async () => {
      askButton?.click()
    })
    await waitFor(container, () => requests.length === 1, '快捷提问请求')
    const forwarded = requests[0]?.forwardedProps as
      | { runConfig?: Record<string, unknown> }
      | undefined
    expect(forwarded?.runConfig?.deepReasoning).toBeUndefined()
  })

  it('由主视图切到隐藏强度后，重新显示时恢复标准强度', async () => {
    const requests: Record<string, unknown>[] = []
    const server = createServer(async (req, res) => {
      const chunks: Uint8Array[] = []
      for await (const chunk of req) chunks.push(chunk as Uint8Array)
      requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>)
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      for (const frame of successFrames()) res.write(frame)
      res.end()
    })
    servers.push({ server, drain: () => {} })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const io = makeIo(`http://127.0.0.1:${port}/api/chat`)
    const container = await mount(io)
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="思考强度：标准"]')
    expect(trigger).not.toBeNull()
    await act(async () => {
      trigger?.click()
    })
    const deepOption = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.includes('深入（推理模型）'),
    )
    expect(deepOption).toBeDefined()
    await act(async () => {
      deepOption?.click()
    })
    expect(container.querySelector('[aria-label="思考强度：深入"]')).not.toBeNull()

    const root = mounted?.root
    if (!root) throw new Error('对话面板尚未挂载')
    const renderWithControl = (showReasoningControl: boolean) =>
      createElement(ChatPanel, {
        conversationId: undefined,
        draft: null,
        onOpenCitation: () => {},
        onOpenNote: () => {},
        io,
        composerStatus: EMPTY_STATUS,
        showReasoningControl,
      })
    await act(async () => root.render(renderWithControl(false)))
    expect(container.querySelector('[aria-label^="思考强度："]')).toBeNull()
    expect(container.querySelector('[aria-label="当前全局模型：test-chat"]')).not.toBeNull()
    await type(container, '标准强度回答')
    await send(container)
    await waitFor(container, () => requests.length === 1, '切换后的发送请求')
    const forwarded = requests[0]?.forwardedProps as
      | { runConfig?: Record<string, unknown> }
      | undefined
    expect(forwarded?.runConfig?.deepReasoning).toBeUndefined()
    await act(async () => root.render(renderWithControl(true)))
    expect(container.querySelector('[aria-label="思考强度：标准"]')).not.toBeNull()
  })
})

describe('ChatPanel：共用格式工具续轮', () => {
  it.each([
    { changedBeforeRetry: false, label: '画布未变' },
    { changedBeforeRetry: true, label: '画布被人工修改' },
  ])('续轮失败后重试：$label', async ({ changedBeforeRetry }) => {
    const requests: Record<string, unknown>[] = []
    let executions = 0
    let version = 1
    const server = createServer(async (req, res) => {
      const chunks: Uint8Array[] = []
      for await (const chunk of req) chunks.push(chunk as Uint8Array)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
      requests.push(body)
      const runId = typeof body.runId === 'string' ? body.runId : 'unknown'
      if (requests.length === 2) {
        res.writeHead(503, { 'Content-Type': 'text/plain' })
        res.end('temporary resume failure')
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      res.write(F({ type: 'RUN_STARTED', runId, threadId: 'c1' }))
      if (requests.length === 1) {
        res.write(F({ type: 'TOOL_CALL_START', toolCallId: 'retry-1', toolCallName: 'fake_read' }))
        res.write(F({ type: 'TOOL_CALL_ARGS', toolCallId: 'retry-1', delta: '{}' }))
        res.write(F({ type: 'TOOL_CALL_END', toolCallId: 'retry-1' }))
        res.write(
          F({
            type: 'RUN_FINISHED',
            runId,
            threadId: 'c1',
            outcome: {
              type: 'interrupt',
              interrupts: [
                {
                  id: 'client_tool_retry-1',
                  reason: 'tanstack:client_tool_execution',
                  metadata: { kind: 'client_tool', toolName: 'fake_read', input: {} },
                },
              ],
            },
          }),
        )
      } else {
        res.write(F({ type: 'TEXT_MESSAGE_START', messageId: 'a2', role: 'assistant' }))
        res.write(F({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'a2', delta: '续轮成功' }))
        res.write(F({ type: 'TEXT_MESSAGE_END', messageId: 'a2' }))
        res.write(F({ type: 'RUN_FINISHED', runId, threadId: 'c1' }))
      }
      res.end()
    })
    servers.push({ server, drain: () => {} })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const agent: ChatDocxAgent = {
      format: 'xlsx',
      documentId: 'd1',
      getVersion: () => version,
      getContext: () => ({ sheet: 'Sheet1' }),
      freezeSelection: () => ({ sheet: 'Sheet1', range: 'A1' }),
      execute: async () => {
        executions++
        return { ok: true, changed: false, version: 1, summary: '读取完成' }
      },
      undoRound: () => true,
    }
    const container = await mount(
      makeIo(`http://127.0.0.1:${port}/api/chat`),
      { documentId: 'd1' },
      agent,
    )
    await type(container, '读取单元格')
    await send(container)
    await waitFor(container, () => requests.length === 2, '首次工具续轮请求')
    await waitFor(container, () => textOf(container).includes('重试续传工具结果'), '重试按钮')
    expect(executions).toBe(1)
    const retry = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('重试续传工具结果'),
    )
    if (!retry) throw new Error('未找到续轮重试按钮')
    if (changedBeforeRetry) version++
    await act(async () => retry.click())
    await waitFor(
      container,
      () => textOf(container).includes(changedBeforeRetry ? '无法续传旧工具结果' : '续轮成功'),
      changedBeforeRetry ? '过期拒绝' : '重试后的回答',
    )
    expect(requests).toHaveLength(changedBeforeRetry ? 2 : 3)
    expect(requests[2]?.resume).toEqual(changedBeforeRetry ? undefined : requests[1]?.resume)
    expect(executions).toBe(1)
  })

  it('把假格式的选区与画布送到模型，将真实失败结果续轮且不误用 DOCX 字段', async () => {
    const requests: Record<string, unknown>[] = []
    let executions = 0
    let conversationsCreated = 0
    const server = createServer(async (req, res) => {
      const chunks: Uint8Array[] = []
      for await (const chunk of req) chunks.push(chunk as Uint8Array)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
      requests.push(body)
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      const runId = typeof body.runId === 'string' ? body.runId : 'unknown'
      if (requests.length === 1) {
        res.write(F({ type: 'RUN_STARTED', runId, threadId: 'c1' }))
        res.write(
          F({
            type: 'TOOL_CALL_START',
            toolCallId: 'fake-1',
            toolCallName: 'fake_write',
            parentMessageId: 'a1',
          }),
        )
        res.write(F({ type: 'TOOL_CALL_ARGS', toolCallId: 'fake-1', delta: '{}' }))
        res.write(F({ type: 'TOOL_CALL_END', toolCallId: 'fake-1' }))
        res.write(
          F({
            type: 'RUN_FINISHED',
            runId,
            threadId: 'c1',
            outcome: {
              type: 'interrupt',
              interrupts: [
                {
                  id: 'client_tool_fake-1',
                  reason: 'tanstack:client_tool_execution',
                  toolCallId: 'fake-1',
                  metadata: { kind: 'client_tool', toolName: 'fake_write', input: { value: 2 } },
                },
              ],
            },
          }),
        )
      } else {
        res.write(F({ type: 'RUN_STARTED', runId, threadId: 'c1' }))
        res.write(F({ type: 'TEXT_MESSAGE_START', messageId: 'a2', role: 'assistant' }))
        res.write(F({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'a2', delta: '写入未完成' }))
        res.write(F({ type: 'TEXT_MESSAGE_END', messageId: 'a2' }))
        res.write(F({ type: 'RUN_FINISHED', runId, threadId: 'c1' }))
      }
      res.end()
    })
    servers.push({ server, drain: () => {} })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const agent: ChatDocxAgent = {
      format: 'xlsx',
      documentId: 'd1',
      getVersion: () => 3,
      getContext: () => ({ sheet: 'Sheet1', unsaved: true }),
      freezeSelection: () => ({ sheet: 'Sheet1', range: 'A1' }),
      execute: async () => {
        executions += 1
        return { ok: false, changed: false, error: '画布版本已变化' }
      },
      undoRound: () => true,
    }
    const container = await mount(
      makeIo(`http://127.0.0.1:${port}/api/chat`, {
        createConversation: async () => {
          conversationsCreated += 1
          return { id: 'c1' }
        },
      }),
      { documentId: 'd1' },
      agent,
    )
    await type(container, '写入 A1')
    await send(container)
    await waitFor(container, () => requests.length === 2, '假格式工具续轮请求')
    await waitFor(container, () => textOf(container).includes('写入未完成'), '续轮回答')
    expect(executions).toBe(1)
    const firstRequest = requests[0]
    const secondRequest = requests[1]
    if (!firstRequest || !secondRequest) throw new Error('缺少工具轮次请求')
    expect(conversationsCreated).toBe(1)
    expect(firstRequest).toMatchObject({
      threadId: 'c1',
      forwardedProps: { conversationId: 'c1' },
    })
    expect(secondRequest).toMatchObject({
      threadId: 'c1',
      forwardedProps: { conversationId: 'c1' },
    })
    const firstConfig = (firstRequest.forwardedProps as { runConfig: Record<string, unknown> })
      .runConfig
    const secondConfig = (secondRequest.forwardedProps as { runConfig: Record<string, unknown> })
      .runConfig
    expect(firstConfig).toMatchObject({
      documentAgent: true,
      agentFormat: 'xlsx',
      agentVersion: 3,
      agentSelection: { sheet: 'Sheet1', range: 'A1' },
      agentContext: { sheet: 'Sheet1', unsaved: true },
    })
    expect(firstConfig.docxAgent).toBeUndefined()
    expect(secondConfig.agentRoundId).toBe(firstConfig.agentRoundId)
    expect(secondRequest.resume).toEqual([
      {
        interruptId: 'client_tool_fake-1',
        status: 'resolved',
        payload: { ok: false, changed: false, error: '画布版本已变化' },
      },
    ])
  })

  it('等中断流彻底结束后才提交工具结果续轮', async () => {
    const requests: Record<string, unknown>[] = []
    let firstResponse: { end: () => void } | null = null
    let executions = 0
    const server = createServer(async (req, res) => {
      const chunks: Uint8Array[] = []
      for await (const chunk of req) chunks.push(chunk as Uint8Array)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
      requests.push(body)
      const runId = typeof body.runId === 'string' ? body.runId : 'unknown'
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      res.write(F({ type: 'RUN_STARTED', runId, threadId: 'c1' }))
      if (requests.length === 1) {
        res.write(
          F({
            type: 'TOOL_CALL_START',
            toolCallId: 'read-1',
            toolCallName: 'fake_read',
            parentMessageId: 'a1',
          }),
        )
        res.write(F({ type: 'TOOL_CALL_ARGS', toolCallId: 'read-1', delta: '{}' }))
        res.write(F({ type: 'TOOL_CALL_END', toolCallId: 'read-1' }))
        res.write(
          F({
            type: 'RUN_FINISHED',
            runId,
            threadId: 'c1',
            outcome: {
              type: 'interrupt',
              interrupts: [
                {
                  id: 'client_tool_read-1',
                  reason: 'tanstack:client_tool_execution',
                  toolCallId: 'read-1',
                  metadata: { kind: 'client_tool', toolName: 'fake_read', input: {} },
                },
              ],
            },
          }),
        )
        // The browser has received RUN_FINISHED, but the HTTP body remains
        // open while the server finishes accounting and persistence.
        firstResponse = res
      } else {
        res.write(F({ type: 'TEXT_MESSAGE_START', messageId: 'a2', role: 'assistant' }))
        res.write(F({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'a2', delta: '读取完成' }))
        res.write(F({ type: 'TEXT_MESSAGE_END', messageId: 'a2' }))
        res.write(F({ type: 'RUN_FINISHED', runId, threadId: 'c1' }))
        res.end()
      }
    })
    servers.push({ server, drain: () => firstResponse?.end() })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const agent: ChatDocxAgent = {
      format: 'xlsx',
      documentId: 'd1',
      getVersion: () => 1,
      getContext: () => ({ sheet: 'Sheet1' }),
      freezeSelection: () => ({ sheet: 'Sheet1', range: 'A1' }),
      execute: async () => {
        executions += 1
        return { ok: true, changed: false, version: 1, summary: '读取完成' }
      },
      undoRound: () => true,
    }
    const container = await mount(
      makeIo(`http://127.0.0.1:${port}/api/chat`),
      { documentId: 'd1' },
      agent,
    )
    await type(container, '读取工作簿')
    await send(container)
    await waitFor(container, () => firstResponse !== null, '中断帧已发出')
    await waitFor(container, () => textOf(container).includes('fake_read'), '工具卡已显示')
    expect(requests).toHaveLength(1)
    expect(executions).toBe(0)

    const responseToFinish = firstResponse as { end: () => void } | null
    responseToFinish?.end()
    await waitFor(container, () => requests.length === 2, '流关闭后的工具续轮')
    await waitFor(container, () => textOf(container).includes('读取完成'), '续轮结果')
    expect(executions).toBe(1)
  })
})

describe('ChatPanel：DOCX 客户端工具续轮', () => {
  it('把当前画布与冻结选区送出，工具只执行一次并用 raw result 续轮', async () => {
    const requests: Record<string, unknown>[] = []
    let executions = 0
    const server = createServer(async (req, res) => {
      const chunks: Uint8Array[] = []
      for await (const chunk of req) chunks.push(chunk as Uint8Array)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
      requests.push(body)
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      const runId = typeof body.runId === 'string' ? body.runId : 'unknown'
      const frames =
        requests.length === 1
          ? [
              F({ type: 'RUN_STARTED', runId, threadId: 'c1' }),
              F({
                type: 'TOOL_CALL_START',
                toolCallId: 'tc1',
                toolCallName: 'get_document_context',
                parentMessageId: 'a1',
              }),
              F({ type: 'TOOL_CALL_ARGS', toolCallId: 'tc1', delta: '{}' }),
              F({ type: 'TOOL_CALL_END', toolCallId: 'tc1' }),
              F({
                type: 'RUN_FINISHED',
                runId,
                threadId: 'c1',
                outcome: {
                  type: 'interrupt',
                  interrupts: [
                    {
                      id: 'client_tool_tc1',
                      reason: 'tanstack:client_tool_execution',
                      toolCallId: 'tc1',
                      metadata: {
                        kind: 'client_tool',
                        toolName: 'get_document_context',
                        input: {},
                      },
                    },
                  ],
                },
              }),
            ]
          : [
              F({ type: 'RUN_STARTED', runId, threadId: 'c1' }),
              F({ type: 'TEXT_MESSAGE_START', messageId: 'a2', role: 'assistant' }),
              F({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'a2', delta: '已读取当前画布' }),
              F({ type: 'TEXT_MESSAGE_END', messageId: 'a2' }),
              F({ type: 'RUN_FINISHED', runId, threadId: 'c1' }),
            ]
      for (const frame of frames) res.write(frame)
      res.end()
    })
    servers.push({ server, drain: () => {} })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const docxAgent: ChatDocxAgent = {
      documentId: 'd1',
      getVersion: () => 4,
      getContext: () => ({ documentId: 'd1', version: 4, text: '未保存的内容' }),
      freezeSelection: () => ({ from: 2, to: 4, text: '内容' }),
      execute: async () => {
        executions += 1
        return { ok: true, summary: '读取完成', changed: false, version: 4 }
      },
      undoRound: () => true,
    }
    const container = await mount(
      makeIo(`http://127.0.0.1:${port}/api/chat`),
      { documentId: 'd1' },
      docxAgent,
    )
    await type(container, '读取当前文档')
    await send(container)
    await waitFor(container, () => requests.length === 2, '工具续轮请求')
    await waitFor(container, () => textOf(container).includes('已读取当前画布'), '续轮回答')

    expect(executions).toBe(1)
    const firstRequest = requests[0]
    const secondRequest = requests[1]
    if (!firstRequest || !secondRequest) throw new Error('缺少工具轮次请求')
    const firstConfig = (firstRequest.forwardedProps as { runConfig?: Record<string, unknown> })
      .runConfig
    expect(firstConfig?.docxContext).toMatchObject({ text: '未保存的内容' })
    expect(firstConfig?.docxSelection).toEqual({ from: 2, to: 4, text: '内容' })
    expect(firstConfig?.docxRoundId).toBeTruthy()
    const resume = secondRequest.resume as {
      interruptId: string
      status: string
      payload: unknown
    }[]
    expect(resume).toEqual([
      {
        interruptId: 'client_tool_tc1',
        status: 'resolved',
        payload: {
          ok: true,
          summary: '读取完成',
          changed: false,
          version: 4,
        },
      },
    ])
    const secondConfig = (secondRequest.forwardedProps as { runConfig?: Record<string, unknown> })
      .runConfig
    expect(secondConfig?.docxRoundId).toBe(firstConfig?.docxRoundId)
  })

  it('同一批中首个写入后拒绝后续过期块操作，并把错误交给模型续轮', async () => {
    const requests: Record<string, unknown>[] = []
    let executions = 0
    const server = createServer(async (req, res) => {
      const chunks: Uint8Array[] = []
      for await (const chunk of req) chunks.push(chunk as Uint8Array)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
      requests.push(body)
      const runId = typeof body.runId === 'string' ? body.runId : 'unknown'
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      if (requests.length === 1) {
        res.write(F({ type: 'RUN_STARTED', runId, threadId: 'c1' }))
        for (const [id, name] of [
          ['tc1', 'insert_content'],
          ['tc2', 'replace_blocks'],
        ]) {
          res.write(
            F({
              type: 'TOOL_CALL_START',
              toolCallId: id,
              toolCallName: name,
              parentMessageId: 'a1',
            }),
          )
          res.write(F({ type: 'TOOL_CALL_ARGS', toolCallId: id, delta: '{}' }))
          res.write(F({ type: 'TOOL_CALL_END', toolCallId: id }))
        }
        res.write(
          F({
            type: 'RUN_FINISHED',
            runId,
            threadId: 'c1',
            outcome: {
              type: 'interrupt',
              interrupts: [
                {
                  id: 'client_tool_tc1',
                  reason: 'tanstack:client_tool_execution',
                  metadata: {
                    kind: 'client_tool',
                    toolName: 'insert_content',
                    input: { html: '<p>新段</p>' },
                  },
                },
                {
                  id: 'client_tool_tc2',
                  reason: 'tanstack:client_tool_execution',
                  metadata: {
                    kind: 'client_tool',
                    toolName: 'replace_blocks',
                    input: { startBlockIndex: 1, endBlockIndex: 1, html: '<p>旧索引</p>' },
                  },
                },
              ],
            },
          }),
        )
      } else {
        res.write(F({ type: 'RUN_STARTED', runId, threadId: 'c1' }))
        res.write(F({ type: 'TEXT_MESSAGE_START', messageId: 'a2', role: 'assistant' }))
        res.write(F({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'a2', delta: '已读取工具结果' }))
        res.write(F({ type: 'TEXT_MESSAGE_END', messageId: 'a2' }))
        res.write(F({ type: 'RUN_FINISHED', runId, threadId: 'c1' }))
      }
      res.end()
    })
    servers.push({ server, drain: () => {} })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    let version = 1
    const agent: ChatDocxAgent = {
      documentId: 'd1',
      getVersion: () => version,
      getContext: () => ({ documentId: 'd1', version, text: '原文' }),
      freezeSelection: () => ({ from: 0, to: 0, text: '' }),
      execute: async () => {
        executions += 1
        version += 1
        return { ok: true, changed: true, version, summary: '已写入' }
      },
      undoRound: () => true,
    }
    const container = await mount(
      makeIo(`http://127.0.0.1:${port}/api/chat`),
      { documentId: 'd1' },
      agent,
    )
    await type(container, '插入并替换')
    await send(container)
    await waitFor(container, () => requests.length === 2, '两个工具结果续轮')
    expect(executions).toBe(1)
    const resume = requests[1]?.resume as {
      interruptId: string
      payload: { ok: boolean; error?: string }
    }[]
    expect(resume).toHaveLength(2)
    expect(resume[0]?.payload.ok).toBe(true)
    expect(resume[1]?.payload).toMatchObject({ ok: false })
    expect(resume[1]?.payload.error).toContain('后续操作需等模型重新读取')
  })
})

describe('ChatPanel：DOCX 历史中断', () => {
  it('重载后显示待处理工具，提供打开文档与取消动作', async () => {
    const base = {
      trace: null,
      citations: [],
      failure: null,
      savedNoteId: null,
      createdAt: '2026-10-11T00:00:00.000Z',
    }
    const messages: Message[] = [
      { ...base, id: 'u1', role: 'user', text: '替换选区' },
      {
        ...base,
        id: 'a1',
        role: 'assistant',
        text: '',
        agent: {
          runId: 'r1',
          documentId: 'd1',
          status: 'pending',
          tools: [{ interruptId: 'client_tool_tc1', name: 'replace_selection', status: 'pending' }],
        },
      },
    ]
    let opened = ''
    let cancelled = ''
    const io = makeIo('http://127.0.0.1:1/api/chat', {
      loadConversation: async () => ({ messages }),
      onOpenDocument: (id) => {
        opened = id
      },
      cancelDocxAgentRun: async (_conversationId, runId) => {
        cancelled = runId
      },
    })
    const container = await mount(io, null, undefined, 'c1')
    await waitFor(container, () => textOf(container).includes('编辑已中断'), '历史工具中断卡')
    expect(textOf(container)).toContain('replace_selection')
    const open = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === '打开文档',
    )
    await act(async () => {
      open?.click()
    })
    expect(opened).toBe('d1')
    const cancel = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === '取消待处理工具',
    )
    await act(async () => {
      cancel?.click()
      await Promise.resolve()
    })
    await waitFor(
      container,
      () => textOf(container).includes('文档编辑工具 · 已取消'),
      '取消后的状态',
    )
    expect(cancelled).toBe('r1')
  })
})

describe('ChatPanel：DOCX 排队选区', () => {
  it('第二问入队时冻结选区，发出前再改选区也不改变该轮目标', async () => {
    const requests: Record<string, unknown>[] = []
    const gate = { release: () => {} }
    const firstGate = new Promise<void>((resolve) => {
      gate.release = resolve
    })
    const open: { end: () => void }[] = []
    const server = createServer(async (req, res) => {
      const chunks: Uint8Array[] = []
      for await (const chunk of req) chunks.push(chunk as Uint8Array)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
      requests.push(body)
      open.push(res)
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      const runId = typeof body.runId === 'string' ? body.runId : 'unknown'
      res.write(F({ type: 'RUN_STARTED', runId, threadId: 'c1' }))
      if (requests.length === 1) await firstGate
      res.write(
        F({ type: 'TEXT_MESSAGE_START', messageId: `m${requests.length}`, role: 'assistant' }),
      )
      res.write(
        F({ type: 'TEXT_MESSAGE_CONTENT', messageId: `m${requests.length}`, delta: '完成' }),
      )
      res.write(F({ type: 'TEXT_MESSAGE_END', messageId: `m${requests.length}` }))
      res.write(F({ type: 'RUN_FINISHED', runId, threadId: 'c1' }))
      res.end()
    })
    servers.push({
      server,
      drain: () => {
        gate.release()
        for (const res of open) res.end()
      },
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    let selected = { from: 1, to: 3, text: '甲' }
    const frozen = new Map<string, typeof selected>()
    const docxAgent: ChatDocxAgent = {
      documentId: 'd1',
      getVersion: () => 1,
      getContext: () => ({ documentId: 'd1', version: 1, selection: selected, text: '甲乙丙' }),
      freezeSelection: (roundId) => {
        const snapshot = { ...selected }
        if (roundId) frozen.set(roundId, snapshot)
        return snapshot
      },
      execute: async () => ({ ok: true, changed: false, version: 1 }),
      undoRound: () => true,
    }
    const container = await mount(
      makeIo(`http://127.0.0.1:${port}/api/chat`),
      { documentId: 'd1' },
      docxAgent,
    )
    await type(container, '先回答第一问')
    await send(container)
    await waitFor(container, () => requests.length === 1, '第一问已发出')

    selected = { from: 4, to: 6, text: '乙' }
    await type(container, '修改选中的字')
    await enter(container)
    await waitFor(container, () => textOf(container).includes('已排队'), '第二问入队')
    selected = { from: 7, to: 9, text: '丙' }
    gate.release()
    await waitFor(container, () => requests.length === 2, '第二问发出')

    const secondRequest = requests[1]
    if (!secondRequest) throw new Error('缺少第二问请求')
    const runConfig = (secondRequest.forwardedProps as { runConfig: Record<string, unknown> })
      .runConfig
    expect(runConfig.docxSelection).toEqual({ from: 4, to: 6, text: '乙' })
    expect(runConfig.docxContext).toMatchObject({ selection: { from: 4, to: 6, text: '乙' } })
    expect(frozen.get(runConfig.docxRoundId as string)).toEqual({ from: 4, to: 6, text: '乙' })
  })
})

describe('ChatPanel：宿主草稿', () => {
  const io = makeIo('http://127.0.0.1:1/api/chat')

  it('从搜索带来的纯文本草稿预填输入框，空态仍是全库提问', async () => {
    const container = await mount(io, { text: '搜索里的问题' })
    expect(container.querySelector('textarea')?.value).toBe('搜索里的问题')
    expect(textOf(container)).toContain('向知识库提问')
    expect(textOf(container)).not.toContain('针对本文提问')
  })

  it('已挂载时消费新草稿一次，同一草稿重渲染不覆盖编辑', async () => {
    const first: ChatDraft = { text: '第一次提问' }
    const container = await mount(io, first)
    await type(container, '用户修改的内容')

    await rerender(first)
    expect(container.querySelector('textarea')?.value).toBe('用户修改的内容')

    const second: ChatDraft = { text: '第二次提问', documentId: 'doc-1' }
    await rerender(second)
    expect(container.querySelector('textarea')?.value).toBe('第二次提问')
    expect(textOf(container)).toContain('针对本文提问')
    expect(textOf(container)).toContain('范围：当前文档')

    await type(container, '在文档内手动改过的问题')
    await rerender({ ...second })
    expect(container.querySelector('textarea')?.value).toBe('第二次提问')

    await rerender({ text: '回到全库提问' })
    expect(container.querySelector('textarea')?.value).toBe('回到全库提问')
    expect(textOf(container)).toContain('向知识库提问')
    expect(textOf(container)).not.toContain('范围：当前文档')
  })

  it('文档入口的空草稿只锁定范围，不清空已经输入的问题', async () => {
    const container = await mount(io, { text: '', documentId: 'doc-1' })
    expect(textOf(container)).toContain('范围：当前文档')
    await type(container, '还没发出的提问')

    await rerender({ text: '', documentId: 'doc-1' })
    expect(container.querySelector('textarea')?.value).toBe('还没发出的提问')
    expect(textOf(container)).toContain('范围：当前文档')
  })

  it('已有一轮回答的对话收到搜索草稿时仍能预填', async () => {
    const handle = serve(() => successFrames())
    servers.push(handle)
    const container = await mount(makeIo(await handle.listen()))
    await type(container, '上一轮问题')
    await send(container)
    await waitFor(container, () => textOf(container).includes('回答'), '上一轮回答')

    await rerender({ text: '从搜索带来的下一问' })
    expect(container.querySelector('textarea')?.value).toBe('从搜索带来的下一问')
  })
})

/**
 * 在输入框里按 Enter。
 *
 * 这是**生成中排队**的那条路径（D-098）：生成中发送键位是「停止」，
 * 排队只能走键盘——引擎的 `submitMode="enter"` 把回车交给
 * `form.requestSubmit()`，运行中且开启队列时消息进 queue。
 */
async function enter(container: HTMLElement) {
  const textarea = container.querySelector('textarea')
  if (!textarea) throw new Error('没有输入框')
  await act(async () => {
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
}

describe('ChatPanel：检索过程行', () => {
  it('跑完之后显示服务端给的整轮耗时（最后一份 trace）', async () => {
    const handle = serve(() => successFrames(1200))
    servers.push(handle)
    const url = await handle.listen()

    const container = await mount(makeIo(url))
    await type(container, '问题')
    await send(container)

    /* 摘要行里的三个数字都来自服务端：最后一份 trace 的 tookMs 是 1200ms。
       若认了先发那一份，这里会是 0.0s（实测的差异信号） */
    await waitFor(container, () => textOf(container).includes('1.2s'), '服务端的整轮耗时')
    expect(textOf(container)).toContain('思考 1 轮')
    expect(textOf(container)).not.toContain('0.0s')
  })

  it('检索结果还没到时是「正在检索知识库 · Ns」', async () => {
    /* 只放行 RUN_STARTED——trace 还没到，正是这个相位的定义 */
    const handle = serve(() => successFrames(), { holdAfter: 1 })
    servers.push(handle)
    const url = await handle.listen()

    const container = await mount(makeIo(url))
    await type(container, '问题')
    await send(container)

    await waitFor(
      container,
      () => textOf(container).includes('正在检索知识库'),
      '正在检索知识库那一行',
    )

    handle.release()
    /* 结果到了就地展开成摘要行（不再有「正在检索」那一句） */
    await waitFor(container, () => textOf(container).includes('思考 1 轮'), '检索过程的摘要行')
    expect(textOf(container)).not.toContain('正在检索知识库')
  })

  it('正文没到时摘要行里的秒数还在走（live 那一口气）', async () => {
    /* 放行到引用为止：trace 有了、正文没有——摘要行应当是「活着的」 */
    const handle = serve(() => successFrames(), { holdAfter: 3 })
    servers.push(handle)
    const url = await handle.listen()

    const container = await mount(makeIo(url))
    await type(container, '问题')
    await send(container)

    await waitFor(container, () => textOf(container).includes('思考 1 轮'), 'trace 到了')
    /* live 那一份显示的是**客户端的钟**：整数秒（0s 起算），而服务端那份
       是带一位小数的 3ms → 「0.0s」。两者的格式不同，这就是判据——
       等的是「秒数在走」，而不是某个具体数字（并行负载下它可能是 1s）。
       格式按官方 Reasoning：`(Ns)` 括号包秒 */
    expect(textOf(container)).toMatch(/次工具 \(\d+s\)/)
    expect(textOf(container)).not.toContain('0.0s')

    handle.release()
    await waitFor(container, () => textOf(container).includes('1.2s'), '服务端的整轮耗时')
  })
})

describe('ChatPanel：排队与停止', () => {
  it('停止之后排队的那条回到输入框', async () => {
    /* 只放行 RUN_STARTED：流挂着不结束 → 一直处于「生成中」 */
    const handle = serve(() => successFrames(), { holdAfter: 1 })
    servers.push(handle)
    const url = await handle.listen()

    const container = await mount(makeIo(url))

    /* 第一问发出去（流被 gate 挂住，一直处于「生成中」） */
    await type(container, '第一个问题')
    await send(container)

    /* 生成中再打一条 → Enter 进队列（生成中发送键位是「停止」——排队
       只有键盘这一条路径，与 D-098 和上游的形态一致） */
    await type(container, '第二个问题')
    await enter(container)
    await waitFor(container, () => textOf(container).includes('已排队'), '排队条')
    expect(textOf(container)).toContain('第二个问题')

    /* 停止：那条要回到输入框（引擎自己只会暂停队列，不会还回来） */
    const stop = [...container.querySelectorAll('button')].find(
      (item) => item.getAttribute('aria-label') === '停止',
    )
    expect(stop).toBeDefined()
    await act(async () => {
      stop?.click()
    })

    await waitFor(
      container,
      () => container.querySelector('textarea')?.value === '第二个问题',
      '排队那条回到输入框',
    )
    expect(textOf(container)).not.toContain('已排队')
  })
})

describe('ChatPanel：停止之后那一行', () => {
  it('点停止 → 消息状态 incomplete → 显示「已停止生成」，且不给动作条', async () => {
    /**
     * 停在「检索过程到了、正文没到」的那一刻：这条消息**有 part**
     * （所以它会渲染），而正文为空（所以不该有动作条）。
     *
     * 用真的停止按钮而不是「让服务端断流」：断流走的是客户端的
     * `onRunFinalized`（它补一条 RUN_FINISHED）——那是「跑完了」，
     * 不是「被停过」。停止才是 `incomplete/cancelled` 那条路径
     * （引擎的取消语义），也正是这一行要表达的事。
     */
    const handle = serve(() => successFrames(), { holdAfter: 3 })
    servers.push(handle)
    const url = await handle.listen()

    const container = await mount(makeIo(url))
    await type(container, '问题')
    await send(container)
    await waitFor(container, () => textOf(container).includes('思考 1 轮'), 'trace 到了')

    const stop = [...container.querySelectorAll('button')].find(
      (item) => item.getAttribute('aria-label') === '停止',
    )
    await act(async () => {
      stop?.click()
    })

    await waitFor(container, () => textOf(container).includes('已停止生成'), '「已停止生成」那一行')
    /* 半截回答留在屏幕上，但没有任何「已回答」的动作条 */
    expect(container.querySelector('[aria-label="复制回答"]')).toBeNull()
  })
})

describe('ChatPanel：失败轮', () => {
  /**
   * 失败的两种坏事都在这一条里守着：
   *
   *  1. **「已停止生成」不许出现**。停止与失败都是 `incomplete`，旧实现在
   *     MessageItem 里只判 `status.type`，于是失败卡下面挂着「已停止生成 ·
   *     以上是已生成的部分」——同一屏两句话互相打架（实测踩过）
   *  2. **动作条不许出现**。失败轮的正文是错误原文（落库那一条就是它），
   *     「存成笔记」会把一个 400 存进知识库、「复制」只会复制报错——旧的
   *     明确决定（PRD §5.7/§5.8：失败卡与动作互斥），重做时丢过一次
   */
  it('失败轮不显示「已停止生成」，也不给「存成笔记」', async () => {
    const handle = serve(() => [
      F({ type: 'RUN_STARTED', runId: 'r1', threadId: 'c1' }),
      F({
        type: 'CUSTOM',
        name: 'mimir.trace',
        value: { trace: { rounds: 1, tools: 1, tookMs: 4, steps: [] } },
      }),
      F({
        type: 'CUSTOM',
        name: 'mimir.failure',
        value: { failure: 'timeout', message: '请求超时' },
      }),
      /* 协议层的错误跟在分类事件之后（服务端顺序：CUSTOM 先、RUN_ERROR 后） */
      F({ type: 'RUN_ERROR', message: '请求超时' }),
    ])
    servers.push(handle)
    const url = await handle.listen()

    const container = await mount(makeIo(url))
    await type(container, '会失败的问题')
    await send(container)

    /* 失败卡渲染出来（标题来自 FAILURE_UI 的 timeout 一类） */
    await waitFor(container, () => textOf(container).includes('请求超时'), '失败卡')
    expect(textOf(container)).not.toContain('已停止生成')
    expect(textOf(container)).not.toContain('存成笔记')
    expect(container.querySelector('[aria-label="复制回答"]')).toBeNull()
  })
})

describe('ChatPanel：AG-UI 的其余消息体类型（不许静默丢弃）', () => {
  /**
   * 从**真实 SSE 帧**到界面的一条端到端：模型思考（THINKING / REASONING）
   * 与工具调用（TOOL_CALL_*）此前会被运行时聚成 part、再被「没挂组件」的
   * parts 表静默丢掉（引擎平台默认 `() => null`）。这一条钉住整条链：
   * 帧 → 运行时聚合（`showThinking: true`）→ parts 槽位 → 渲染。
   */
  it('模型思考与工具调用帧都渲染出官方形态', { timeout: 15000 }, async () => {
    const handle = serve(() => [
      F({ type: 'RUN_STARTED', runId: 'r1', threadId: 'c1' }),
      /* 模型思考（deepReasoning 时服务端会流这一组） */
      F({ type: 'REASONING_MESSAGE_START', messageId: 'rs-1', role: 'reasoning' }),
      F({ type: 'REASONING_MESSAGE_CONTENT', messageId: 'rs-1', delta: '先看检索到的段落。' }),
      F({ type: 'REASONING_MESSAGE_END', messageId: 'rs-1' }),
      /* 工具调用（将来子代理 / MCP 的路径；引擎能聚、界面必须认） */
      F({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-1',
        toolCallName: 'search_docs',
        parentMessageId: 'm1',
      }),
      F({ type: 'TOOL_CALL_ARGS', toolCallId: 'tc-1', delta: '{"query":"组件"}' }),
      F({ type: 'TOOL_CALL_END', toolCallId: 'tc-1' }),
      F({
        type: 'TOOL_CALL_RESULT',
        toolCallId: 'tc-1',
        messageId: 'm2',
        role: 'tool',
        content: '命中 3 段',
      }),
      F({ type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' }),
      F({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: '回答' }),
      F({ type: 'TEXT_MESSAGE_END', messageId: 'm1' }),
      F({ type: 'RUN_FINISHED', runId: 'r1', threadId: 'c1' }),
    ])
    servers.push(handle)
    const url = await handle.listen()

    const container = await mount(makeIo(url))
    await type(container, '跑一遍带思考与工具的流')
    await send(container)

    /* 模型思考：官方 Reasoning 盒的标签（折叠态也要有） */
    await waitFor(container, () => textOf(container).includes('模型思考'), '模型思考的标签')
    /* 工具调用：官方 ToolFallback 文案 + 工具名 */
    await waitFor(container, () => textOf(container).includes('Used tool'), '工具调用行')
    expect(textOf(container)).toContain('search_docs')
    /* 正文照常 */
    expect(textOf(container)).toContain('回答')
  })
})

const SNAPSHOT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/b9sAAAAASUVORK5CYII='
function snapshotFixture(): ChatPptxSnapshot {
  return {
    sourceIsCurrent: () => true,
    id: 'snapshot-1',
    text: '美化本页',
    target: { documentId: 'pptx-1', slidePath: 'ppt/slides/slide4.xml', slideIndex: 2, version: 7 },
    image: {
      name: '第3页截图-snapshot-1.png',
      mimeType: 'image/png',
      dataUrl: SNAPSHOT_PNG,
      width: 1,
      height: 1,
    },
  }
}
function snapshotAgent(version: () => number = () => 7): ChatDocxAgent {
  return {
    format: 'pptx',
    documentId: 'pptx-1',
    getVersion: version,
    getContext: () => ({ slides: [{}, {}, { id: 's_4' }], selection: { slideIndex: 2 } }),
    freezeSelection: () => ({ slideIndex: 2, elementId: 'shape-1', elements: [{ id: 'shape-1' }] }),
    execute: async () => ({ ok: true, changed: false, version: 7, summary: '未修改' }),
    undoRound: () => true,
  }
}
describe('ChatPanel：PPTX真实截图草稿', () => {
  it('移除截图不清除同时发生的普通对话连接错误', async () => {
    const handle = serve(
      () => [
        F({ type: 'RUN_STARTED', runId: 'r1', threadId: 'c1' }),
        F({ type: 'RUN_ERROR', message: '普通对话连接失败' }),
      ],
      { holdAfter: 1 },
    )
    servers.push(handle)
    const io = makeIo(await handle.listen())
    const agent = snapshotAgent()
    const container = await mount(io, null, agent, undefined, false, undefined, {
      snapshotVisionReady: true,
    })
    await type(container, '普通对话')
    await send(container)
    const snapshot = snapshotFixture()
    await act(async () =>
      mounted!.root.render(
        createElement(ChatPanel, {
          conversationId: undefined,
          io,
          documentAgent: agent,
          draft: { documentId: 'pptx-1', text: '保留这段草稿', snapshot },
          snapshotVisionReady: true,
          composerStatus: EMPTY_STATUS,
          onOpenCitation: () => {},
          onOpenNote: () => {},
        }),
      ),
    )
    handle.release()
    await waitFor(container, () => textOf(container).includes('普通对话连接失败'), '普通连接失败')
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="移除第3页截图"]')?.click(),
    )
    expect(container.querySelector('form img[alt="第3页截图"]')).toBeNull()
    expect(container.querySelector('textarea')?.value).toBe('保留这段草稿')
    expect(textOf(container)).toContain('普通对话连接失败')
    expect(container.querySelector('form [role="alert"]')?.textContent).toContain(
      '普通对话连接失败',
    )
  })
  it('无模型仍可预览、编辑和移除草稿，但带图发送不能降级为检索请求', async () => {
    let requests = 0
    const snapshot = snapshotFixture()
    const container = await mount(
      makeIo('/api/chat', {
        createConversation: async () => {
          requests++
          return { id: 'c1' }
        },
      }),
      { documentId: 'pptx-1', text: snapshot.text, snapshot },
      undefined,
      undefined,
      false,
      undefined,
      { draftAgent: snapshotAgent(), snapshotVisionReady: false },
    )
    expect(container.querySelector('img[alt="第3页截图"]')?.getAttribute('src')).toBe(SNAPSHOT_PNG)
    expect(container.querySelector('textarea')?.value).toBe('美化本页')
    expect(requests).toBe(0)
    await type(container, '请美化布局并保留文字')
    await send(container)
    expect(textOf(container)).toContain('截图美化需要可用的聊天模型')
    expect(requests).toBe(0)
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="移除第3页截图"]')?.click(),
    )
    expect(container.querySelector('img[alt="第3页截图"]')).toBeNull()
    expect(container.querySelector('textarea')?.value).toBe('请美化布局并保留文字')
    expect(textOf(container)).not.toContain('截图美化需要可用的聊天模型')
    expect(container.querySelector('[aria-label="关闭截图提示"]')).toBeNull()
  })
  it('仅显式发送后将真实PNG内容和冻结的整页选区交给AG-UI', async () => {
    const requests: Record<string, unknown>[] = []
    const server = createServer(async (req, res) => {
      const chunks: Uint8Array[] = []
      for await (const chunk of req) chunks.push(chunk as Uint8Array)
      requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>)
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      for (const frame of successFrames()) res.write(frame)
      res.end()
    })
    servers.push({ server, drain: () => {} })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const snapshot = snapshotFixture()
    const container = await mount(
      makeIo(`http://127.0.0.1:${port}/api/chat`),
      { documentId: 'pptx-1', text: snapshot.text, snapshot },
      snapshotAgent(),
      undefined,
      false,
      undefined,
      { snapshotVisionReady: true },
    )
    expect(requests).toHaveLength(0)
    await send(container)
    await waitFor(container, () => requests.length === 1, '真实PNG请求')
    const body = requests[0]!
    const messages = body.messages as { role: string; content: unknown }[]
    expect(messages.find((message) => message.role === 'user')?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'image',
          source: { type: 'data', value: SNAPSHOT_PNG.split(',')[1], mimeType: 'image/png' },
        }),
      ]),
    )
    expect(body.forwardedProps).toMatchObject({
      runConfig: {
        documentAgent: true,
        agentFormat: 'pptx',
        agentVersion: 7,
        agentSelection: {
          slideIndex: 2,
          elementId: null,
          elementIds: [],
          elements: [],
          pptxSnapshotId: 'snapshot-1',
        },
      },
    })
    await waitFor(container, () => textOf(container).includes('回答'), '回答')
    expect(container.querySelector('[data-role="user"] img[alt="第3页截图"]')).not.toBeNull()
  })
  it('画布版本已变时点击和Enter都不发送，也保留用户修改后的文字和图片', async () => {
    let version = 7
    let created = 0
    const snapshot = snapshotFixture()
    const container = await mount(
      makeIo('/api/chat', {
        createConversation: async () => {
          created++
          return { id: 'c1' }
        },
      }),
      { documentId: 'pptx-1', text: snapshot.text, snapshot },
      snapshotAgent(() => version),
      undefined,
      false,
      undefined,
      { snapshotVisionReady: true },
    )
    version++
    await type(container, '保留我的新指令')
    await send(container)
    await act(async () =>
      container.querySelector('textarea')?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      ),
    )
    expect(created).toBe(0)
    expect(container.querySelector('textarea')?.value).toBe('保留我的新指令')
    expect(container.querySelector('img[alt="第3页截图"]')).not.toBeNull()
    expect(textOf(container)).toContain('页面或版本已变化')
  })
})

describe('ChatPanel：PPTX截图排队与重试', () => {
  it.each(['stop', 'retrieve'] as const)(
    '通过%s取回队列时一并恢复文字、PNG与原目标',
    async (action) => {
      const handle = serve(() => successFrames(), { holdAfter: 1 })
      servers.push(handle)
      const io = makeIo(await handle.listen())
      const agent = snapshotAgent()
      const container = await mount(io, null, agent, undefined, false, undefined, {
        snapshotVisionReady: true,
      })
      await type(container, '第一问')
      await send(container)
      const snapshot = snapshotFixture()
      const root = mounted!.root
      await act(async () =>
        root.render(
          createElement(ChatPanel, {
            conversationId: undefined,
            io,
            documentAgent: agent,
            draft: { documentId: 'pptx-1', text: '排队美化指令', snapshot },
            snapshotVisionReady: true,
            composerStatus: EMPTY_STATUS,
            onOpenCitation: () => {},
            onOpenNote: () => {},
          }),
        ),
      )
      await enter(container)
      await waitFor(container, () => textOf(container).includes('已排队'), '带PNG草稿入队')
      expect(container.querySelector('textarea')?.value).toBe('')
      await act(async () =>
        container
          .querySelector<HTMLButtonElement>(
            action === 'stop' ? '[aria-label="停止"]' : '[aria-label="取回排队的消息"]',
          )
          ?.click(),
      )
      await waitFor(
        container,
        () => container.querySelector('textarea')?.value === '排队美化指令',
        '原PNG草稿取回',
      )
      expect(container.querySelector('form img[alt="第3页截图"]')?.getAttribute('src')).toBe(
        SNAPSHOT_PNG,
      )
      expect(textOf(container)).not.toContain('已排队')
      if (action === 'retrieve')
        await act(async () =>
          container.querySelector<HTMLButtonElement>('[aria-label="停止"]')?.click(),
        )
    },
  )
  it.each([
    [false, false],
    [true, false],
    [true, true],
  ])(
    '队列自动派发在stale=%s、newDraft=%s时验证原目标并保留用户草稿',
    { timeout: 15000 },
    async (stale, newDraft) => {
      let version = 7
      let received = 0
      const bodies: unknown[] = []
      let release: (() => void) | undefined
      const server = createServer(async (req, res) => {
        const chunks: Uint8Array[] = []
        for await (const chunk of req) chunks.push(chunk as Uint8Array)
        bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        received++
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        res.write(successFrames()[0]!)
        release = () => {
          for (const frame of successFrames().slice(1)) res.write(frame)
          res.end()
        }
      })
      servers.push({ server, drain: () => release?.() })
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      const io = makeIo(
        `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/api/chat`,
      )
      const agent = snapshotAgent(() => version)
      const container = await mount(io, null, agent, undefined, false, undefined, {
        snapshotVisionReady: true,
      })
      await type(container, '第一问')
      await send(container)
      const snapshot = snapshotFixture()
      await act(async () =>
        mounted!.root.render(
          createElement(ChatPanel, {
            conversationId: undefined,
            io,
            documentAgent: agent,
            draft: { documentId: 'pptx-1', text: '过期美化指令', snapshot },
            snapshotVisionReady: true,
            composerStatus: EMPTY_STATUS,
            onOpenCitation: () => {},
            onOpenNote: () => {},
          }),
        ),
      )
      await enter(container)
      await waitFor(container, () => textOf(container).includes('已排队'), '截图排队')
      if (newDraft) await type(container, '用户正在写的新草稿')
      if (stale) version++
      release?.()
      await waitFor(
        container,
        () => textOf(container).includes('页面或版本已变化') || received > 1,
        '队列派发结果',
      )
      expect(bodies).toHaveLength(stale ? 1 : 2)
      const routedSnapshot = expect.objectContaining({
        forwardedProps: expect.objectContaining({
          conversationId: 'c1',
          runConfig: expect.objectContaining({
            documentAgent: true,
            agentFormat: 'pptx',
            agentVersion: 7,
            agentSelection: expect.objectContaining({
              pptxSnapshotId: 'snapshot-1',
              slideIndex: 2,
            }),
          }),
        }),
      })
      expect(bodies[1] ?? null).toEqual(stale ? null : routedSnapshot)
      expect(textOf(container).includes('页面或版本已变化')).toBe(stale)
      expect(container.querySelector('textarea')?.value).toBe(
        newDraft ? '用户正在写的新草稿' : stale ? '过期美化指令' : '',
      )
      expect(Boolean(container.querySelector('form img[alt="第3页截图"]'))).toBe(stale && !newDraft)
      expect(container.querySelector('[data-role="user"] img[alt="第3页截图"]')).not.toBeNull()
      if (!stale) {
        release?.()
        await waitFor(
          container,
          () => !container.querySelector('[aria-label="停止"]'),
          '队列回答完成',
        )
      }
    },
  )
  it('即使文档ID和版本相同，替换了原件来源后也拒绝发送旧截图', async () => {
    let sourceLive = true
    let created = 0
    const snapshot = { ...snapshotFixture(), sourceIsCurrent: () => sourceLive }
    const container = await mount(
      makeIo('/api/chat', {
        createConversation: async () => {
          created++
          return { id: 'c1' }
        },
      }),
      { documentId: 'pptx-1', text: snapshot.text, snapshot },
      snapshotAgent(),
      undefined,
      false,
      undefined,
      { snapshotVisionReady: true },
    )
    sourceLive = false
    await send(container)
    expect(created).toBe(0)
    expect(container.querySelector('textarea')?.value).toBe(snapshot.text)
    expect(textOf(container)).toContain('页面或版本已变化')
  })
})

describe('ChatPanel：截图失败轮的操作', () => {
  it.each(['重试', '只检索，不调模型'])('点击%s保留原PNG，且只检索不能吞图', async (action) => {
    let received = 0
    const server = createServer(async (req, res) => {
      const chunks: Uint8Array[] = []
      for await (const chunk of req) chunks.push(chunk as Uint8Array)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { messages: unknown }
      received++
      expect(JSON.stringify(body.messages)).toContain(SNAPSHOT_PNG.split(',')[1])
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      if (received === 1) {
        res.write(F({ type: 'RUN_STARTED', runId: 'r1', threadId: 'c1' }))
        res.write(
          F({
            type: 'CUSTOM',
            name: 'mimir.failure',
            value: { failure: 'offline', message: '本轮网络不可达' },
          }),
        )
        res.write(F({ type: 'RUN_ERROR', message: '本轮网络不可达' }))
      } else for (const frame of successFrames()) res.write(frame)
      res.end()
    })
    servers.push({ server, drain: () => {} })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const snapshot = snapshotFixture()
    const container = await mount(
      makeIo(
        `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/api/chat`,
      ),
      { documentId: 'pptx-1', text: snapshot.text, snapshot },
      snapshotAgent(),
      undefined,
      false,
      undefined,
      { snapshotVisionReady: true },
    )
    await send(container)
    await waitFor(container, () => textOf(container).includes('本轮网络不可达'), '失败卡')
    const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent?.replace(/\s/g, '') === action,
    )
    expect(button).toBeDefined()
    await act(async () => button?.click())
    if (action === '重试') await waitFor(container, () => received === 2, '带PNG重试')
    expect(received).toBe(action === '重试' ? 2 : 1)
    expect(Boolean(container.querySelector('form img[alt="第3页截图"]'))).toBe(action !== '重试')
    expect(textOf(container).includes('截图美化需要可用的聊天模型')).toBe(action !== '重试')
  })
})
