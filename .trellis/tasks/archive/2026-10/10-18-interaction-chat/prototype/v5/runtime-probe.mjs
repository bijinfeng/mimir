import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createLocalConnection } from './local-connection.ts'
import { captureSendIntent, canRestoreQueuedDraft } from './composer-send-intent.ts'
import { createLocalAttachmentAdapter, settleLocalAttachments } from './attachment-adapter.ts'
const isolated = process.env.MIMIR_CHAT_V5_DEPS || '/tmp/mimir-chat-tanstack-v5/deps'
const { ChatClient } = await import(
  pathToFileURL(`${isolated}/node_modules/@tanstack/ai-client/dist/esm/index.js`)
)
const result = {
  date: '2026-10-19',
  scope: 'isolated actual ChatClient + shared snapshot + attachment adapter; not product E2E',
  checks: [],
}
let toolbar = {
  scope: 'A',
  deep: true,
  sidebar: false,
  searchOnly: false,
  documents: [],
  documentsStatus: 'loaded',
  modelRoles: { chat: 'Qwen3' },
}
let context = {
  fixtureOnly: true,
  documentId: 'fixture-A',
  canvasVersion: 1,
  pageIndex: 2,
  agentRoundId: 'fixture-round',
}
const adapter = createLocalAttachmentAdapter(
  () => 'send-pending',
  () => ({
    searchOnly: false,
    noVision: false,
    noModel: false,
    agentActive: false,
    dedicatedSnapshot: false,
  }),
)
let file
for await (const next of adapter.add({
  file: new File(['prototype fixture'], '资料.txt', { type: 'text/plain' }),
}))
  file = next
const captured = captureSendIntent(toolbar, 'composer', false, context, [file])
const controller = new AbortController()
const preparing = adapter.send(captured.attachments[0], { signal: controller.signal })
toolbar.scope = 'C'
toolbar.deep = false
context.documentId = 'fixture-C'
file.name = 'later mutation'
settleLocalAttachments('complete')
await preparing
assert.equal(captured.intent.scope, 'A')
assert.equal(captured.intent.deep, true)
assert.equal(captured.intent.context.documentId, 'fixture-A')
assert.equal(captured.attachments[0].name, '资料.txt')
const requests = []
const local = createLocalConnection((_messages, body) => requests.push(body))
local.next([
  { type: 'TEXT_MESSAGE_START', messageId: 'a', role: 'assistant' },
  { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: '真实本地事件归约。' },
  { type: 'TEXT_MESSAGE_END', messageId: 'a' },
])
const client = new ChatClient({ threadId: 'v5-probe', connection: local.connection })
await client.sendMessage('test', undefined, { body: { mimirComposerIntent: captured.intent } })
assert.equal(requests[0].mimirComposerIntent.scope, 'A')
assert(
  client
    .getMessages()
    .some((m) => m.parts.some((p) => p.type === 'text' && p.content === '真实本地事件归约。')),
)
client.dispose()
result.checks.push({
  name: 'async preparation captures A before C; actual adapter finalize + actual ChatClient dispatch retains A and attachment bytes',
  passed: true,
})
const a = captureSendIntent(
  { ...toolbar, scope: 'A', deep: true },
  'composer',
  false,
  { ...context, documentId: 'fixture-A' },
  [],
)
const b = captureSendIntent(
  { ...toolbar, scope: 'B', deep: false },
  'composer',
  false,
  { ...context, documentId: 'fixture-B' },
  [],
)
const queue = structuredClone([a, b])
toolbar.scope = 'C'
context.documentId = 'fixture-C'
assert.deepEqual(
  queue.map((q) => q.intent.scope),
  ['A', 'B'],
)
assert.deepEqual(
  queue.map((q) => q.intent.deep),
  [true, false],
)
assert(!canRestoreQueuedDraft('新的草稿'))
assert(canRestoreQueuedDraft('  '))
assert.equal(queue.length, 2)
result.checks.push({
  name: 'shared source snapshot helper preserves independent A/B; nonempty draft blocks host restore; not a full host GUI test',
  passed: true,
})
const cancelling = createLocalAttachmentAdapter(
  () => 'send-pending',
  () => ({
    searchOnly: false,
    noVision: false,
    noModel: false,
    agentActive: false,
    dedicatedSnapshot: false,
  }),
)
let pending
for await (const next of cancelling.add({
  file: new File(['original'], '取消.txt', { type: 'text/plain' }),
}))
  pending = next
const copy = captureSendIntent(toolbar, 'composer', false, context, [pending])
const abort = new AbortController()
const finishing = cancelling.send(copy.attachments[0], { signal: abort.signal })
abort.abort()
await assert.rejects(finishing, { name: 'AbortError' })
assert.equal(copy.attachments[0].name, '取消.txt')
result.checks.push({
  name: 'cancelling preparation rejects finalization and retains captured draft attachment',
  passed: true,
})
const resumeRequests = []
const interruptConnection = createLocalConnection((_messages, body, runContext) =>
  resumeRequests.push(structuredClone({ body, context: runContext })),
)
const interrupted = new ChatClient({
  threadId: 'v5-interrupt-recovery-probe',
  connection: interruptConnection.connection,
})
interruptConnection.next([
  { type: 'TOOL_CALL_START', toolCallId: 'tc-local', toolCallName: 'local_preview_only' },
  { type: 'TOOL_CALL_ARGS', toolCallId: 'tc-local', delta: '{}' },
  { type: 'TOOL_CALL_END', toolCallId: 'tc-local' },
  {
    type: 'RUN_FINISHED',
    outcome: {
      type: 'interrupt',
      interrupts: [
        {
          id: 'local-interrupt',
          reason: 'tanstack:client_tool_execution',
          toolCallId: 'tc-local',
          metadata: { kind: 'client_tool', toolName: 'local_preview_only', input: {} },
        },
      ],
    },
  },
])
await interrupted.sendMessage('本地中断恢复探针')
const originalResumeState = structuredClone(interrupted.getResumeState())
assert(originalResumeState)
assert.equal(originalResumeState.runId, resumeRequests[0].context.runId)
const answer = [{ interruptId: 'local-interrupt', status: 'resolved', payload: { approved: true } }]
const cachedAnswer = structuredClone(answer)
interruptConnection.next([
  { type: 'RUN_ERROR', message: '模拟续传失败', code: 'LOCAL_RESUME_FAILURE' },
])
assert.equal(await interrupted.resumeInterruptsUnsafe(cachedAnswer, originalResumeState), false)
assert.equal(resumeRequests.length, 2)
assert.equal(interrupted.getResumeState(), null)
assert.equal(await interrupted.resumeInterruptsUnsafe(cachedAnswer), false)
assert.equal(
  resumeRequests.length,
  2,
  'implicit retry must demonstrate the original missing-resume bug',
)
interruptConnection.next([
  {
    type: 'TOOL_CALL_RESULT',
    messageId: 'local-result',
    toolCallId: 'tc-local',
    content: JSON.stringify(cachedAnswer[0].payload),
    role: 'tool',
  },
  { type: 'TEXT_MESSAGE_START', messageId: 'recovered-answer', role: 'assistant' },
  { type: 'TEXT_MESSAGE_CONTENT', messageId: 'recovered-answer', delta: '已恢复缓存答复。' },
  { type: 'TEXT_MESSAGE_END', messageId: 'recovered-answer' },
])
assert.equal(
  await interrupted.resumeInterruptsUnsafe(structuredClone(cachedAnswer), {
    ...originalResumeState,
  }),
  true,
)
assert.equal(resumeRequests.length, 3)
for (const request of resumeRequests.slice(1)) {
  assert.equal(request.context.parentRunId, originalResumeState.runId)
  assert.equal(request.context.threadId, originalResumeState.threadId)
  assert.deepEqual(request.context.resume, answer)
}
assert.notEqual(resumeRequests[1].context.runId, resumeRequests[2].context.runId)
assert.equal(interrupted.getMessages().filter((message) => message.role === 'user').length, 1)
assert.equal(
  interrupted
    .getMessages()
    .flatMap((message) => message.parts)
    .filter((part) => part.type === 'tool-call' && part.id === 'tc-local').length,
  1,
)
assert(
  interrupted
    .getMessages()
    .some((message) =>
      message.parts.some((part) => part.type === 'text' && part.content === '已恢复缓存答复。'),
    ),
)
assert.equal(interrupted.getInterrupts().length, 0)
interrupted.dispose()
result.checks.push({
  name: 'actual ChatClient failed resume clears implicit pointer; explicit cached original run creates a third connection with identical answers and parentRunId, one user input and one tool call',
  passed: true,
})
await writeFile(
  new URL('./runtime-probe-result.json', import.meta.url),
  JSON.stringify(result, null, 2) + '\n',
)
console.log(JSON.stringify(result, null, 2))
