import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { HttpAgent } from '@ag-ui/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { app, getAuthCookie, makeClient } from './helpers.js'

/**
 * `/api/chat` 的**事件顺序**（D-099）。
 *
 * ## 为什么要有这条测试
 *
 * 这一轮问答的流原先只有模型那一趟的生命周期事件，于是：
 *
 *  - 流的第一条往往是 `CUSTOM`（会话 id / 检索过程），而 AG-UI 的客户端在
 *    流开头就校验「第一条必须是 RUN_STARTED」——实测 `@ag-ui/client@0.0.59`
 *    直接抛 `AGUIError: First event must be 'RUN_STARTED'`，**整个流一个字节
 *    都用不了**
 *  - 终局那份「整轮耗时」的 trace 发在模型的 RUN_FINISHED 之后，同样被拒
 *    （`Cannot send event type 'CUSTOM': The run has already finished`）
 *
 * 这两条都不是「前端自己注意一下」能解决的：它们是**协议客户端**的硬校验，
 * 而症状是「界面完全空白、控制台里一句 AGUIError」——很容易被归到别的原因上。
 *
 * ## 为什么把真实字节喂给 @ag-ui/client
 *
 * 直接断言「流里有 RUN_STARTED」是不够的：那条断言在顺序错了的时候照样通过
 * （RUN_STARTED 也可能出现在第三位）。这里的做法是**拿真实的响应字节起一个
 * 本地 HTTP 服务，让协议客户端自己跑一遍**——它跑通就说明顺序对，
 * 跑不通会抛出上面那两条错误里的某一条，cause 与症状一一对应。
 *
 * 只检索那条路径也测：它**不调模型**，所以模型那份生命周期事件根本不存在，
 * 是最容易漏掉括号的一支（而且它在测试环境里恰好是默认路径——没有配模型）。
 */
/**
 * 把一段真实的 SSE 字节起成一个本地服务，让 HttpAgent 去消费。
 *
 * 提在 describe 之外（`unicorn(consistent-function-scoping)`）：
 * 它不捕获任何外层变量。
 */
async function feed(frames: string, threadId: string) {
  let server: Server
  const url = await new Promise<string>((resolve) => {
    server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      res.write(frames)
      res.end()
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve(`http://127.0.0.1:${port}/api/chat`)
    })
  })

  const custom: string[] = []
  let text = ''
  let failure: string | null = null
  let finished = false

  const agent = new HttpAgent({ url, threadId })
  /* `runAgent` 的第一个参数只有 runId / tools / context / forwardedProps 与
     resume——**messages 不在里面**（它来自 agent 自己维护的 messages，
     见 `RunAgentParameters` 的类型）。这里只关心事件，所以传空 */
  await agent.runAgent(
    { runId: 'test-run' },
    {
      onCustomEvent: ({ event }) => {
        custom.push(event.name)
      },
      onTextMessageContentEvent: ({ event }) => {
        text += event.delta
      },
      onRunErrorEvent: ({ event }) => {
        failure = event.message ?? 'RUN_ERROR'
      },
      onRunFinishedEvent: () => {
        finished = true
      },
    },
  )

  await new Promise<void>((resolve) => server.close(() => resolve()))
  return { custom, text, failure, finished }
}

describe('对话流的事件顺序（AG-UI 合规）', () => {
  let client: ReturnType<typeof makeClient>
  let cookie: string

  beforeAll(async () => {
    cookie = await getAuthCookie()
    client = makeClient(cookie)
  })

  /** 发一次真实的 /api/chat，返回响应体（SSE 文本） */
  async function chat(body: unknown): Promise<string> {
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(200)
    return res.text()
  }

  it('只检索那条路径（不调模型）的顺序客户端能跑通', async () => {
    const created = await client.post<{ id: string }>('/api/conversations', {})
    const frames = await chat({
      threadId: created.body.id,
      runId: 'r1',
      messages: [{ id: 'u1', role: 'user', content: '知识库里有什么' }],
      tools: [],
      context: [],
      state: {},
      // 只检索：不调模型（测试环境本来也没有可用的 provider，显式写出来
      // 是为了让这条用例的意图不依赖环境）
      forwardedProps: { conversationId: created.body.id, scope: 'search' },
    })

    const seen = await feed(frames, created.body.id)

    expect(seen.custom).toContain('mimir.trace')
    expect(seen.finished, '整轮跑完没有收到 RUN_FINISHED').toBe(true)
    expect(seen.failure).toBeNull()
    expect(seen.text.length).toBeGreaterThan(0)
  })

  it('会话 id 走 forwardedProps.runConfig 也能认出（新前端的通道）', async () => {
    const created = await client.post<{ id: string }>('/api/conversations', {})
    const frames = await chat({
      threadId: created.body.id,
      runId: 'r1',
      messages: [{ id: 'u1', role: 'user', content: '这条走 runConfig' }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: { runConfig: { conversationId: created.body.id, scope: 'search' } },
    })

    // 会话 id 认出来了 → 没有新建会话 → 流里不该有 mimir.conversation
    expect(frames).not.toContain('mimir.conversation')

    const seen = await feed(frames, created.body.id)
    expect(seen.finished).toBe(true)
    expect(seen.text.length).toBeGreaterThan(0)
  })

  it('第一件事是 RUN_STARTED，终局 trace 在 RUN_FINISHED 之前', async () => {
    const created = await client.post<{ id: string }>('/api/conversations', {})
    const frames = await chat({
      threadId: created.body.id,
      runId: 'r1',
      messages: [{ id: 'u1', role: 'user', content: '顺序检查' }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: { conversationId: created.body.id, scope: 'search' },
    })

    const types = frames
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => (JSON.parse(line.slice(6)) as { type: string }).type)

    expect(types[0]).toBe('RUN_STARTED')
    expect(types.at(-1)).toBe('RUN_FINISHED')
    // 模型那一趟的生命周期事件**不能**混进来：叠加会命中
    // `Cannot send 'RUN_STARTED' while a run is still active`
    expect(types.filter((type) => type === 'RUN_STARTED')).toHaveLength(1)
    expect(types.filter((type) => type === 'RUN_FINISHED')).toHaveLength(1)
  })
})
