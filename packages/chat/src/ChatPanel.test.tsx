import { App as AntApp } from 'antd'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { act, createElement, StrictMode } from 'react'
import { flushSync } from 'react-dom'
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
  models: {
    catalog: {
      providers: [
        {
          providerId: 'test-provider',
          providerName: '测试供应商',
          models: [
            {
              providerId: 'test-provider',
              modelId: 'test-chat',
              label: 'test-chat',
              reasoning: {
                status: 'supported',
                levels: ['low', 'medium', 'high'],
                default: 'medium',
              },
              vision: 'supported',
              tools: 'supported',
            },
            {
              providerId: 'test-provider',
              modelId: 'test-reasoning',
              label: 'test-reasoning',
              reasoning: { status: 'supported', levels: ['high'], default: 'high' },
              vision: 'supported',
              tools: 'supported',
            },
          ],
        },
      ],
      defaultSelection: {
        providerId: 'test-provider',
        modelId: 'test-chat',
        reasoningEffort: 'medium',
      },
    },
    isLoading: false,
    isError: false,
    refetch: () => {},
  },
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

function withTestApp(panel: ReactNode, enabled?: boolean, strict?: boolean) {
  const wrapped = enabled ? createElement(AntApp, null, panel) : panel
  return strict ? createElement(StrictMode, null, wrapped) : wrapped
}

async function mount(
  io: ChatIo,
  draft: ChatDraft | null = null,
  docxAgent?: ChatDocxAgent,
  conversationId?: string,
  showReasoningControl?: boolean,
  guideActions?: (ask: (question: string) => void) => ReactNode,
  snapshotOptions: Pick<ChatPanelProps, 'draftAgent' | 'snapshotVisionReady'> & {
    withApp?: boolean
    strict?: boolean
  } = {},
) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      withTestApp(
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
        snapshotOptions.withApp,
        snapshotOptions.strict,
      ),
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

describe('ChatPanel：供应商模型与推理等级', () => {
  it('主对话和侧栏共用模型、实际等级与范围控件', async () => {
    const container = await mount(makeIo('/api/chat'), null, undefined, undefined, false)
    expect(container.querySelector('[aria-label="当前模型：test-chat"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="推理等级：中"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="本轮检索范围：全部文档"]')).not.toBeNull()
  })
  it('供应商分组可切换模型，固定等级不伪造选项，Escape 返回触发器', async () => {
    const container = await mount(makeIo('/api/chat'))
    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="当前模型：test-chat"]',
    )!
    await act(async () => trigger.click())
    expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('测试供应商')
    const models = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
    expect(models.map((item) => item.textContent)).toEqual(['test-chat', 'test-reasoning'])
    await act(async () => models[1]!.click())
    expect(container.querySelector('[aria-label="当前模型：test-reasoning"]')).not.toBeNull()
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="推理等级：高"]')?.disabled,
    ).toBe(true)
    const next = container.querySelector<HTMLButtonElement>(
      '[aria-label="当前模型：test-reasoning"]',
    )!
    await act(async () => next.click())
    await act(async () =>
      container
        .querySelector('[role="menu"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    )
    expect(document.activeElement).toBe(next)
  })
  it('快捷提问发送实际模型与等级，旧角色开关不参与路由', async () => {
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
    const container = await mount(
      makeIo(`http://127.0.0.1:${port}/api/chat`),
      null,
      undefined,
      undefined,
      false,
      (ask) => (
        <button type="button" onClick={() => ask('速读本文')}>
          速读本文
        </button>
      ),
    )
    await act(async () =>
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent === '速读本文')!
        .click(),
    )
    await waitFor(container, () => requests.length === 1, '快捷提问请求')
    const forwarded = requests[0]!.forwardedProps as Record<string, unknown>
    expect(forwarded.modelSelection).toEqual({
      providerId: 'test-provider',
      modelId: 'test-chat',
      reasoningEffort: 'medium',
    })
    expect((forwarded.runConfig as Record<string, unknown>).deepReasoning).toBeUndefined()
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
    await waitFor(container, () => textOf(container).includes('工具调用'), '工具卡已显示')
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
    expect(textOf(container)).toContain('当前文档')

    await type(container, '在文档内手动改过的问题')
    await rerender({ ...second })
    expect(container.querySelector('textarea')?.value).toBe('第二次提问')

    await rerender({ text: '回到全库提问' })
    expect(container.querySelector('textarea')?.value).toBe('回到全库提问')
    expect(textOf(container)).toContain('向知识库提问')
    expect(textOf(container)).not.toContain('当前文档')
  })

  it('文档入口的空草稿只锁定范围，不清空已经输入的问题', async () => {
    const container = await mount(io, { text: '', documentId: 'doc-1' })
    expect(textOf(container)).toContain('当前文档')
    await type(container, '还没发出的提问')

    await rerender({ text: '', documentId: 'doc-1' })
    expect(container.querySelector('textarea')?.value).toBe('还没发出的提问')
    expect(textOf(container)).toContain('当前文档')
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

function commitBeforeActivation() {
  flushSync(() => {})
}

describe('ChatPanel：取消自定义检索过程', () => {
  it('忽略旧 trace，成功正文和引用保留', async () => {
    const handle = serve(() => successFrames())
    servers.push(handle)
    const container = await mount(makeIo(await handle.listen()))
    await type(container, '问题')
    await send(container)
    await waitFor(container, () => textOf(container).includes('组件性能优化'), '引用')
    expect(textOf(container)).not.toContain('思考 1 轮')
    expect(textOf(container)).not.toContain('次工具')
  })
  it('首 token 前提供真实等待状态，结束后撤销', async () => {
    const handle = serve(() => successFrames(), { holdAfter: 1 })
    servers.push(handle)
    const container = await mount(makeIo(await handle.listen()))
    await type(container, '问题')
    await send(container)
    await waitFor(
      container,
      () => !!container.querySelector('[aria-label="正在生成回答"]'),
      '等待状态',
    )
    expect(textOf(container)).not.toContain('正在检索知识库')
    handle.release()
    await waitFor(container, () => !container.querySelector('[aria-label="停止"]'), '流结束')
    expect(container.querySelector('[aria-label="正在生成回答"]')).toBeNull()
  })
})

describe('ChatPanel：排队与停止', () => {
  it('停止点击提交渲染后不触发表单默认发送，队首回填且剩余队列暂停', async () => {
    const handle = serve(() => successFrames(), { holdAfter: 1 })
    servers.push(handle)
    let requests = 0
    handle.server.on('request', () => {
      requests++
    })
    const container = await mount(makeIo(await handle.listen()))
    await type(container, '生成中的原问题')
    await send(container)
    await type(container, '取回到输入框的队首')
    await enter(container)
    await type(container, '仍然暂停的第二条')
    await enter(container)
    const stop = container.querySelector<HTMLButtonElement>('button[aria-label="停止"]')!
    expect(stop.type).toBe('button')
    // Browsers can commit discrete React updates before click's default action.
    // Flush at the end of bubbling so happy-dom exercises that same ordering.
    document.addEventListener('click', commitBeforeActivation, { once: true })
    try {
      await act(async () => stop.click())
    } finally {
      document.removeEventListener('click', commitBeforeActivation)
    }
    handle.release()
    await waitFor(container, () => !container.querySelector('[aria-label="停止"]'), '停止完成')
    expect(container.querySelector('textarea')?.value).toBe('取回到输入框的队首')
    expect(textOf(container)).toContain('仍然暂停的第二条')
    expect(container.querySelectorAll('article[data-role="user"]')).toHaveLength(1)
    expect(textOf(container)).toContain('已停止生成')
    expect(requests).toBe(1)
  })

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
    await waitFor(
      container,
      () => !!container.querySelector('[aria-label="正在生成回答"]'),
      'trace 到了',
    )

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
  it('连续两轮纯工具回答按 parentMessageId 保留各自文档来源与终态', async () => {
    let turn = 0
    const handle = serve(() => {
      turn++
      return [
        F({ type: 'RUN_STARTED', runId: `run-${turn}`, threadId: 'c1' }),
        F({
          type: 'TOOL_CALL_START',
          toolCallId: `tool-${turn}`,
          toolCallName: 'read_document',
          parentMessageId: `answer-${turn}`,
        }),
        F({ type: 'TOOL_CALL_ARGS', toolCallId: `tool-${turn}`, delta: '{}' }),
        F({ type: 'TOOL_CALL_END', toolCallId: `tool-${turn}` }),
        F({
          type: 'TOOL_CALL_RESULT',
          toolCallId: `tool-${turn}`,
          messageId: `result-${turn}`,
          role: 'tool',
          content: '{}',
        }),
        F({
          type: 'CUSTOM',
          name: 'mimir.documentAgent',
          value: {
            agent: {
              runId: `run-${turn}`,
              documentId: `document-${turn}`,
              format: 'docx',
              status: turn === 1 ? 'completed' : 'failed',
              tools: [],
            },
          },
        }),
        F({ type: 'RUN_FINISHED', runId: `run-${turn}`, threadId: 'c1' }),
      ]
    })
    servers.push(handle)
    const container = await mount(makeIo(await handle.listen()))
    await type(container, '第一轮纯工具')
    await send(container)
    await waitFor(container, () => !container.querySelector('[aria-label="停止"]'), '首轮完成')
    expect(textOf(container)).toContain('文档编辑工具 · 已完成')
    await type(container, '第二轮纯工具')
    await send(container)
    await waitFor(container, () => !container.querySelector('[aria-label="停止"]'), '第二轮完成')
    const assistants = container.querySelectorAll('article[data-role="assistant"]')
    expect(assistants).toHaveLength(2)
    expect(assistants[0]?.textContent).toContain('文档编辑工具 · 已完成')
    expect(assistants[0]?.textContent).not.toContain('文档编辑工具 · 失败')
    expect(assistants[1]?.textContent).toContain('文档编辑工具 · 失败')
    expect(turn).toBe(2)
  })

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
    await waitFor(container, () => textOf(container).includes('思考过程'), '模型思考的标签')
    /* 工具调用：官方 ToolFallback 文案 + 工具名 */
    await waitFor(container, () => textOf(container).includes('工具调用'), '工具调用行')
    await act(async () => {
      ;[...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('工具调用'))
        ?.click()
    })
    expect(textOf(container)).toContain('已完成')
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
      container.querySelector<HTMLButtonElement>('[aria-label="移除截图"]')?.click(),
    )
    expect(container.querySelector('form img[alt="第3页截图-snapshot-1.png"]')).toBeNull()
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
    expect(
      container.querySelector('img[alt="第3页截图-snapshot-1.png"]')?.getAttribute('src'),
    ).toBe(SNAPSHOT_PNG)
    expect(container.querySelector('textarea')?.value).toBe('美化本页')
    expect(requests).toBe(0)
    await type(container, '请美化布局并保留文字')
    await send(container)
    expect(textOf(container)).toContain('截图美化需要可用的聊天模型')
    expect(requests).toBe(0)
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="移除截图"]')?.click(),
    )
    expect(container.querySelector('img[alt="第3页截图-snapshot-1.png"]')).toBeNull()
    expect(container.querySelector('textarea')?.value).toBe('请美化布局并保留文字')
    expect(textOf(container)).not.toContain('截图美化需要可用的聊天模型')
    expect(container.querySelector('[aria-label="关闭提示"]')).toBeNull()
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
    expect(
      container.querySelector('[data-role="user"] img[alt="第3页截图-snapshot-1.png"]'),
    ).not.toBeNull()
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
    expect(container.querySelector('img[alt="第3页截图-snapshot-1.png"]')).not.toBeNull()
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
      expect(
        container.querySelector('form img[alt="第3页截图-snapshot-1.png"]')?.getAttribute('src'),
      ).toBe(SNAPSHOT_PNG)
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
      expect(Boolean(container.querySelector('form img[alt="第3页截图-snapshot-1.png"]'))).toBe(
        stale && !newDraft,
      )
      expect(
        container.querySelector('[data-role="user"] img[alt="第3页截图-snapshot-1.png"]'),
      ).not.toBeNull()
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
    expect(Boolean(container.querySelector('form img[alt="第3页截图-snapshot-1.png"]'))).toBe(
      action !== '重试',
    )
    expect(textOf(container).includes('截图美化需要可用的聊天模型')).toBe(action !== '重试')
  })
})

const historyBase = {
  trace: null,
  citations: [],
  failure: null,
  savedNoteId: null,
  createdAt: '2026-10-19T00:00:00.000Z',
}

describe('ChatPanel：迁移后的恢复与本地分支', () => {
  it('历史 Agent 问题的来源标记独立阻止普通重试，即使失败回答缺少 Agent 元数据', async () => {
    const handle = serve(() => successFrames())
    servers.push(handle)
    const container = await mount(
      makeIo(await handle.listen(), {
        loadConversation: async () => ({
          messages: [
            {
              ...historyBase,
              id: 'agent-user',
              role: 'user',
              text: '修改原文档',
              agent: {
                runId: 'failed-run',
                documentId: 'doc-original',
                status: 'cancelled',
                tools: [],
              },
            },
            {
              ...historyBase,
              id: 'failed-answer',
              role: 'assistant',
              text: '',
              failure: 'timeout',
            },
          ],
        }),
      }),
      null,
      undefined,
      'c1',
    )
    await waitFor(container, () => textOf(container).includes('请求超时'), 'Agent 历史失败')
    await act(async () => {
      ;[...container.querySelectorAll('button')]
        .find((button) => button.textContent?.replace(/\s/g, '') === '重试')
        ?.click()
    })
    await waitFor(
      container,
      () => textOf(container).includes('这条文档指令需要重新打开原文档'),
      '原文档重发保护',
    )
    expect(container.querySelector('button[aria-label="停止生成"]')).toBeNull()
  })

  it('缺终态的完整 SSE 行仍视为断流，保留部分正文且不给成功动作', async () => {
    const handle = serve(() => [
      F({ type: 'RUN_STARTED', threadId: 'c1', runId: 'r1' }),
      F({ type: 'TEXT_MESSAGE_START', messageId: 'partial', role: 'assistant' }),
      F({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'partial', delta: '已经收到的部分正文' }),
    ])
    servers.push(handle)
    const container = await mount(makeIo(await handle.listen()))
    await type(container, '读取完整回答')
    await send(container)
    await waitFor(container, () => textOf(container).includes('连接中断'), '截断流错误')
    expect(textOf(container)).toContain('已经收到的部分正文')
    expect(container.querySelector('button[aria-label="存成笔记"]')).toBeNull()
    expect(textOf(container)).not.toContain('已停止生成')
  })

  it('编辑历史问题使用原分支前缀，切回旧分支后保存旧回答的持久化 ID', async () => {
    const requests: Record<string, unknown>[] = []
    const saved: string[] = []
    const server = createServer(async (req, res) => {
      const chunks: Uint8Array[] = []
      for await (const chunk of req) chunks.push(chunk as Uint8Array)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
      requests.push(body)
      const messages = body.messages as { id: string; role: string }[]
      const userId = messages.findLast((message) => message.role === 'user')?.id
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.end(
        [
          F({ type: 'RUN_STARTED', threadId: 'c1', runId: String(body.runId) }),
          F({
            type: 'CUSTOM',
            name: 'mimir.message',
            value: { role: 'user', clientMessageId: userId, messageId: 'db-new-user' },
          }),
          F({ type: 'TEXT_MESSAGE_START', messageId: 'sdk-new-answer', role: 'assistant' }),
          F({
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: 'sdk-new-answer',
            delta: '重新生成后的回答',
          }),
          F({ type: 'TEXT_MESSAGE_END', messageId: 'sdk-new-answer' }),
          F({
            type: 'CUSTOM',
            name: 'mimir.message',
            value: {
              role: 'assistant',
              clientMessageId: 'sdk-new-answer',
              messageId: 'db-new-answer',
            },
          }),
          F({ type: 'RUN_FINISHED', threadId: 'c1', runId: String(body.runId) }),
        ].join(''),
      )
    })
    servers.push({ server, drain: () => {} })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const messages: Message[] = [
      { ...historyBase, id: 'u0', role: 'user', text: '第一问' },
      { ...historyBase, id: 'a0', role: 'assistant', text: '第一答' },
      { ...historyBase, id: 'u1', role: 'user', text: '原来第二问' },
      { ...historyBase, id: 'a1', role: 'assistant', text: '原来第二答' },
    ]
    const container = await mount(
      makeIo(`http://127.0.0.1:${port}/api/chat`, {
        loadConversation: async () => ({ messages }),
        saveAsNote: async (_conversationId, id) => {
          saved.push(id ?? 'missing')
          return { noteId: 'note' }
        },
      }),
      null,
      undefined,
      'c1',
      undefined,
      undefined,
      { withApp: true },
    )
    await waitFor(container, () => textOf(container).includes('原来第二答'), '历史加载')
    await act(async () => {
      ;[...container.querySelectorAll<HTMLButtonElement>('button[aria-label="编辑消息"]')]
        .at(-1)
        ?.click()
    })
    const editor = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="编辑消息"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(editor), 'value')!.set!
      setter.call(editor, '修改后的第二问')
      editor.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      ;[...container.querySelectorAll('button')]
        .find((button) => button.textContent === '保存并重新发送')
        ?.click()
    })
    await waitFor(container, () => textOf(container).includes('重新生成后的回答'), '编辑分支回答')
    const forwarded = requests[0]?.forwardedProps as Record<string, unknown>
    expect(forwarded.historyMessageIds).toEqual(['u0', 'a0'])
    expect(forwarded.branchMode).toBe('edit')
    expect(textOf(container)).not.toContain('原来第二答')
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="上一个分支"]')?.click()
    })
    expect(textOf(container)).toContain('原来第二答')
    expect(textOf(container)).not.toContain('重新生成后的回答')
    await act(async () => {
      ;[...container.querySelectorAll<HTMLButtonElement>('button[aria-label="存成笔记"]')]
        .at(-1)
        ?.click()
    })
    expect(saved).toEqual(['a1'])
    expect(container.querySelectorAll('button[aria-label="复制回答"]')).toHaveLength(2)
  })

  it(
    '历史失败重试携带原模型、推理等级、检索范围与 canonical 附件引用',
    { timeout: 10000 },
    async () => {
      const requests: Record<string, unknown>[] = []
      const server = createServer(async (req, res) => {
        const chunks: Uint8Array[] = []
        for await (const chunk of req) chunks.push(chunk as Uint8Array)
        requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>)
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        res.end(successFrames().join(''))
      })
      servers.push({ server, drain: () => {} })
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      const attachment = {
        id: 'attachment',
        conversationId: 'c1',
        name: 'note.txt',
        mime: 'text/plain',
        size: 1,
        sha256: 'a'.repeat(64),
        kind: 'document' as const,
        status: 'ready' as const,
        originalUrl: '/protected/file',
        createdAt: historyBase.createdAt,
        bound: true,
      }
      const modelSelection = {
        providerId: 'test-provider',
        modelId: 'test-chat',
        reasoningEffort: 'high',
      }
      const container = await mount(
        makeIo(`http://127.0.0.1:${port}/api/chat`, {
          loadConversation: async () => ({
            messages: [
              {
                ...historyBase,
                id: 'u1',
                role: 'user',
                text: '附件问题',
                modelSelection,
                retrievalScope: { type: 'document', documentId: 'doc-original' },
                attachments: [attachment],
              },
              { ...historyBase, id: 'a1', role: 'assistant', text: '', failure: 'timeout' },
            ],
          }),
        }),
        null,
        undefined,
        'c1',
      )
      await waitFor(container, () => textOf(container).includes('请求超时'), '历史失败')
      await act(async () => {
        ;[...container.querySelectorAll('button')]
          .find((button) => button.textContent?.replace(/\s/g, '') === '重试')
          ?.click()
      })
      await waitFor(container, () => requests.length === 1, '重试 HTTP')
      const forwarded = requests[0]?.forwardedProps as Record<string, unknown>
      expect(forwarded.modelSelection).toEqual(modelSelection)
      expect(forwarded.attachments).toEqual([{ id: 'attachment', sha256: attachment.sha256 }])
      expect(forwarded.runConfig).toMatchObject({ documentId: 'doc-original' })
    },
  )
})

it('上传中的每个文件都有名称和独立取消，移除草稿先释放 lease 再删除', async () => {
  let finishUpload!: (value: import('@mimir/shared').ChatAttachment) => void
  let uploadSignal: AbortSignal | undefined
  const calls: string[] = []
  const attachment = {
    id: 'ready-file',
    conversationId: 'c1',
    name: 'second.txt',
    mime: 'text/plain',
    size: 1,
    sha256: 'b'.repeat(64),
    kind: 'document' as const,
    status: 'ready' as const,
    originalUrl: '/protected/file',
    createdAt: historyBase.createdAt,
    bound: false,
  }
  let attempt = 0
  const container = await mount(
    makeIo('http://127.0.0.1:1/api/chat', {
      uploadChatAttachment: async (_conversationId, _file, _operation, signal) => {
        attempt++
        if (attempt > 1) return attachment
        uploadSignal = signal
        return new Promise((resolve) => {
          finishUpload = resolve
        })
      },
      leaseChatAttachment: async (_conversationId, id) => {
        calls.push(`lease:${id}`)
      },
      releaseChatAttachmentLease: async (_conversationId, id) => {
        calls.push(`release:${id}`)
      },
      deleteChatAttachment: async (_conversationId, id) => {
        calls.push(`delete:${id}`)
      },
    }),
  )
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  function choose(name: string) {
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['x'], name, { type: 'text/plain' })],
    })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
  await act(async () => choose('first.txt'))
  expect(textOf(container)).toContain('first.txt')
  expect(textOf(container)).toContain('正在处理')
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="移除 first.txt"]')?.click(),
  )
  expect(uploadSignal?.aborted).toBe(true)
  expect(textOf(container)).not.toContain('first.txt')
  await act(async () => finishUpload({ ...attachment, id: 'cancelled-result', name: 'first.txt' }))
  await act(async () => choose('second.txt'))
  await waitFor(container, () => calls.includes('lease:ready-file'), '草稿 lease')
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="移除 second.txt"]')?.click(),
  )
  await waitFor(container, () => calls.includes('delete:ready-file'), '草稿删除')
  expect(calls.indexOf('release:ready-file')).toBeLessThan(calls.indexOf('delete:ready-file'))
  expect(textOf(container)).not.toContain('second.txt')
})

it('只检索在模型目录读取失败时仍可派发', async () => {
  let requests = 0
  const handle = serve(() => {
    requests++
    return successFrames()
  })
  servers.push(handle)
  const io = makeIo(await handle.listen(), {
    loadConversation: async () => ({
      messages: [
        { ...historyBase, id: 'u', role: 'user', text: '只要知识库片段' },
        { ...historyBase, id: 'a', role: 'assistant', text: '', failure: 'quota' },
      ],
    }),
  })
  const container = await mount(io, null, undefined, 'c1')
  await waitFor(container, () => textOf(container).includes('模型请求受限'), '失败卡')
  await act(async () =>
    mounted!.root.render(
      createElement(ChatPanel, {
        io,
        conversationId: 'c1',
        draft: null,
        onOpenCitation: () => {},
        onOpenNote: () => {},
        composerStatus: {
          ...EMPTY_STATUS,
          models: { catalog: undefined, isLoading: false, isError: true, refetch: () => {} },
        },
      }),
    ),
  )
  await act(async () =>
    [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('只检索，不调模型'))
      ?.click(),
  )
  await waitFor(container, () => requests === 1, '不依赖模型的检索请求')
  expect(textOf(container)).not.toContain('模型列表尚未就绪')
})

it('停止在途截图后恢复原文、PNG与目标，不需要猜测截图注册名称', async () => {
  const handle = serve(() => successFrames(), { holdAfter: 1 })
  servers.push(handle)
  const snapshot = snapshotFixture()
  const container = await mount(
    makeIo(await handle.listen()),
    { documentId: 'pptx-1', text: snapshot.text, snapshot },
    snapshotAgent(),
    undefined,
    false,
    undefined,
    { snapshotVisionReady: true },
  )
  await send(container)
  await waitFor(
    container,
    () => Boolean(container.querySelector('button[aria-label="停止"]')),
    '在途截图',
  )
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="停止"]')?.click(),
  )
  expect(container.querySelector('textarea')?.value).toBe(snapshot.text)
  expect(container.querySelector('form img')?.getAttribute('src')).toBe(SNAPSHOT_PNG)
  expect(textOf(container)).toContain('当前文档')
  handle.release()
})

it('StrictMode 下上传临时项不请求租约，上传完成后保留并仅租赁真实附件', async () => {
  let finishUpload!: (value: import('@mimir/shared').ChatAttachment) => void
  const leases: { conversationId: string; id: string }[] = []
  const deletes: string[] = []
  const attachment = {
    id: 'persisted-attachment',
    conversationId: 'persisted-conversation',
    name: 'retained.txt',
    mime: 'text/plain',
    size: 8,
    sha256: 'c'.repeat(64),
    kind: 'document' as const,
    status: 'ready' as const,
    originalUrl: '/protected/retained.txt',
    createdAt: historyBase.createdAt,
    bound: false,
  }
  const container = await mount(
    makeIo('http://127.0.0.1:1/api/chat', {
      createConversation: async () => ({ id: attachment.conversationId }),
      uploadChatAttachment: async () =>
        new Promise((resolve) => {
          finishUpload = resolve
        }),
      leaseChatAttachment: async (conversationId, id) => {
        leases.push({ conversationId, id })
        if (!conversationId || id.startsWith('upload-')) throw new Error('接口不存在')
      },
      deleteChatAttachment: async (_conversationId, id) => {
        deletes.push(id)
      },
    }),
    null,
    undefined,
    undefined,
    undefined,
    undefined,
    { strict: true },
  )
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  await act(async () => {
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['retained'], attachment.name, { type: attachment.mime })],
    })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(textOf(container)).toContain(attachment.name)
  expect(textOf(container)).toContain('正在处理')
  expect(leases).toEqual([])
  expect(deletes).toEqual([])
  await act(async () => finishUpload(attachment))
  await waitFor(container, () => leases.some((lease) => lease.id === attachment.id), '真实附件租约')
  expect(leases).toEqual([{ conversationId: attachment.conversationId, id: attachment.id }])
  expect(deletes).toEqual([])
  expect(textOf(container)).toContain(attachment.name)
  expect(textOf(container)).not.toContain('正在处理')
  expect(textOf(container)).not.toContain('接口不存在')
  expect(container.querySelector<HTMLButtonElement>('button[aria-label="发送"]')?.disabled).toBe(
    false,
  )
})
