import type { DemoEvent } from './protocol-state'
import { localImage } from './thread-fixtures'
import { localAudio, localVideo } from './media-fixtures'
export type DemoVariant = {
  id: string
  title: string
  events: DemoEvent[]
  note?: string
  request?: DemoEvent
}
const begin = { type: 'RUN_STARTED', threadId: 'demo-thread', runId: 'demo-run' }
const finish = {
  type: 'RUN_FINISHED',
  threadId: 'demo-thread',
  runId: 'demo-run',
  outcome: { type: 'success' },
}
const text = (value: string): DemoEvent[] => [
  { type: 'TEXT_MESSAGE_START', messageId: 'answer', role: 'assistant' },
  { type: 'TEXT_MESSAGE_CONTENT', messageId: 'answer', delta: value },
  { type: 'TEXT_MESSAGE_END', messageId: 'answer' },
]
const run = (...events: DemoEvent[]): DemoEvent[] => [begin, ...events, finish]
const variant = (id: string, events: DemoEvent[], note?: string): DemoVariant => ({
  id,
  title: id,
  events,
  note,
})
const snapshot = (messages: DemoEvent[]): DemoEvent[] =>
  run({ type: 'MESSAGES_SNAPSHOT', messages })
const plain = run(...text('这是本地事件生成的回答。'))
const activity = {
  type: 'ACTIVITY_SNAPSHOT',
  messageId: 'activity-1',
  activityType: 'progress',
  content: { count: 1 },
}
const toolStart = {
  type: 'TOOL_CALL_START',
  toolCallId: 'tool-1',
  toolCallName: 'lookup',
  parentMessageId: 'answer',
}
const toolEnd = { type: 'TOOL_CALL_END', toolCallId: 'tool-1' }
export function extraVariants(id: string): DemoVariant[] {
  if (id === 'AGUI-MSG-001')
    return ['developer', 'system', 'user', 'assistant', 'tool', 'activity', 'reasoning'].map(
      (role) => {
        const message: DemoEvent = {
          id: `role-${role}`,
          role,
          content: `这是 ${role} 角色的本地样例。`,
        }
        if (role === 'tool') message.toolCallId = 'historical-tool'
        if (role === 'activity')
          Object.assign(message, { activityType: 'unknown-type', content: { count: 1 } })
        return variant(
          role,
          snapshot([message]),
          ['developer', 'system'].includes(role)
            ? '上下文只在技术检查器中可见，不作为用户/助手消息展示。'
            : '快照映射结果以实际 TanStack 归约为准；不会凭角色名执行工具。',
        )
      },
    )
  if (id === 'AGUI-MSG-002')
    return [
      variant('plain', plain),
      variant(
        'markdown',
        run(...text('## 整理知识\n\n保留 **来源**，建立联系。\n\n- 记录判断\n- 回看主题')),
      ),
      variant('partial-markdown', run(...text('**尚未结束的强调与 `代码'))),
      variant('code', run(...text('```ts\nconst scope = "all"\nconsole.log(scope)\n```'))),
      variant('table', run(...text('| 主题 | 状态 |\n| --- | --- |\n| 知识整理 | 已记录 |'))),
      variant(
        'link',
        run(...text('[语雀公开文档](https://www.yuque.com/)\n\n[不安全链接](javascript:alert(1))')),
      ),
      variant(
        'long-content',
        run(
          ...text(
            Array.from(
              { length: 18 },
              (_, i) => `${i + 1}. 本地长内容，验证连续阅读、换行与复制。`,
            ).join('\n'),
          ),
        ),
      ),
    ]
  if (
    ['AGUI-MSG-003', 'AGUI-MSG-004', 'AGUI-MSG-005', 'AGUI-MSG-006', 'AGUI-MSG-008'].includes(id)
  ) {
    const type =
      id === 'AGUI-MSG-004'
        ? 'audio'
        : id === 'AGUI-MSG-005'
          ? 'video'
          : id === 'AGUI-MSG-006'
            ? 'document'
            : 'image'
    const url =
      type === 'audio'
        ? localAudio
        : type === 'video'
          ? localVideo
          : type === 'document'
            ? 'data:text/plain,Local%20fixture'
            : localImage
    const media = (source: DemoEvent) =>
      snapshot([
        {
          id: 'media-user',
          role: 'user',
          content: [
            {
              type,
              source: {
                mimeType:
                  type === 'audio'
                    ? 'audio/wav'
                    : type === 'video'
                      ? 'video/mp4'
                      : type === 'document'
                        ? 'text/plain'
                        : 'image/svg+xml',
                ...source,
              },
              mimeType:
                type === 'audio'
                  ? 'audio/wav'
                  : type === 'video'
                    ? 'video/mp4'
                    : type === 'document'
                      ? 'text/plain'
                      : 'image/svg+xml',
              name: 'local-fixture',
            },
          ],
        },
      ])
    return [
      variant(
        'data-source',
        media({
          type: 'data',
          value: url.includes(';base64,')
            ? url.slice(url.indexOf(',') + 1)
            : btoa(decodeURIComponent(url.slice(url.indexOf(',') + 1))),
        }),
      ),
      variant('url-source', media({ type: 'url', value: url })),
      variant(
        'file-handle',
        media({ type: 'file', value: 'opaque-provider-handle' }),
        '1.0 的不透明文件句柄不作为 URL 获取；资源接入待产品实现。',
      ),
      variant(
        'unsafe-source',
        media({ type: 'url', value: 'javascript:alert(1)' }),
        '协议 schema 不替代来源安全守卫；自有媒体组件拒绝该来源。',
      ),
    ]
  }
  if (id === 'AGUI-MSG-007')
    return [
      variant(
        'known-citations',
        run(
          {
            type: 'CUSTOM',
            name: 'mimir.citations',
            value: {
              citations: [
                { documentId: 'fixture-doc', title: '开始使用', snippet: '本地引用样例' },
              ],
            },
          },
          ...text('回答依据来自当前文档。'),
        ),
        '引用定位完整操作见下方宿主入口。',
      ),
      variant(
        'unknown-data',
        run({ type: 'CUSTOM', name: 'unregistered.source', value: { component: 'DoNotExecute' } }),
      ),
      variant('source-url', run(...text('[公开来源](https://www.yuque.com/)'))),
      variant(
        'source-document',
        run({
          type: 'CUSTOM',
          name: 'mimir.citations',
          value: { citations: [{ documentId: 'fixture-doc', title: '本地文档' }] },
        }),
      ),
    ]
  if (id === 'AGUI-ENV-001')
    return ['new-run', 'parent-run', 'resume-run', 'invalid-id'].map((name) => ({
      ...variant(
        name,
        plain,
        '请求是本地合同样例，非真实 HTTP。文档 Agent 续轮在产品 transport 省略 wire parentRunId，保留服务端重放保护。',
      ),
      request: {
        threadId: name === 'invalid-id' ? '' : 'fixture-thread',
        runId: 'fixture-run',
        ...(name === 'parent-run' ? { parentRunId: 'fixture-parent' } : {}),
        ...(name === 'resume-run'
          ? {
              resume: [
                {
                  interruptId: 'fixture-interrupt',
                  status: 'resolved',
                  payload: { approved: true },
                },
              ],
            }
          : {}),
        messages: [{ id: 'input', role: 'user', content: '本地输入' }],
        tools: [],
        context: [],
        state: {},
        forwardedProps: { runConfig: { deepReasoning: false, documentId: 'fixture-doc' } },
      },
    }))
  if (id === 'AGUI-ENV-002')
    return [
      variant('metadata-present', [
        { ...begin, metadata: { requestLabel: 'local-demo' } },
        ...text('metadata不会成为正文。'),
        finish,
      ]),
      variant('usage-present', [
        begin,
        ...text('本地用量样例。'),
        { ...finish, metadata: { usage: { inputTokens: 24, outputTokens: 16 } } },
      ]),
      variant('unknown-keys', [
        { ...begin, metadata: { vendorExtension: { opaque: true } } },
        ...text('未知metadata保留诊断，不变成用户界面。'),
        finish,
      ]),
      variant(
        'capability-missing',
        plain,
        '未声明能力不表示已支持附件、工具或视觉；产品守卫按真实绑定检查。',
      ),
    ]
  if (id === 'AGUI-ACTIVITY-002')
    return [
      variant(
        'valid-patch',
        run(activity, {
          type: 'ACTIVITY_DELTA',
          messageId: 'activity-1',
          activityType: 'progress',
          patch: [{ op: 'replace', path: '/count', value: 2 }],
        }),
      ),
      variant(
        'invalid-patch',
        run(activity, {
          type: 'ACTIVITY_DELTA',
          messageId: 'activity-1',
          activityType: 'progress',
          patch: [{ op: 'replace', path: '/missing', value: 2 }],
        }),
        '非法路径保留count=1并显示诊断。',
      ),
    ]
  if (id === 'AGUI-FLOW-001')
    return [
      variant('first-event-invalid', text('缺开始')),
      variant('nested-run', [begin, begin, finish]),
      variant('after-terminal', [begin, finish, { type: 'CUSTOM', name: 'after-end', value: {} }]),
      variant('valid-next-run', [...plain, ...plain]),
    ]
  if (id === 'AGUI-FLOW-002')
    return [
      variant('explicit-triad', plain),
      variant(
        'chunk-only',
        run(
          { type: 'TEXT_MESSAGE_CHUNK', messageId: 'answer', role: 'assistant', delta: '分片一' },
          { type: 'TEXT_MESSAGE_CHUNK', delta: '，分片二。' },
        ),
      ),
      variant(
        'mixed-conflict',
        run(...text('已有助手消息'), {
          type: 'TEXT_MESSAGE_CHUNK',
          messageId: 'answer',
          role: 'user',
          delta: '冲突身份',
        }),
      ),
      variant('missing-first-id', run({ type: 'TEXT_MESSAGE_CHUNK', delta: '没有身份' })),
    ]
  if (id === 'AGUI-FLOW-003') {
    const child = { type: 'SUBAGENT_STARTED', subagentRunId: 'child', name: 'lookup' }
    return [
      variant(
        'correct-parent',
        run(child, {
          type: 'SUBAGENT_FINISHED',
          subagentRunId: 'child',
          outcome: { type: 'success' },
        }),
      ),
      variant(
        'unknown-parent',
        run({
          type: 'TEXT_MESSAGE_START',
          messageId: 'child-text',
          role: 'assistant',
          subagentRunId: 'unknown',
        }),
      ),
      variant('duplicate-id', run(child, child)),
      variant('subagent-pending', [
        begin,
        child,
        {
          ...finish,
          outcome: { type: 'interrupt', interrupts: [{ id: 'wait', reason: 'local-wait' }] },
        },
      ]),
      variant('root-finished-too-early', run(child)),
    ]
  }
  if (id === 'AGUI-FLOW-004')
    return [
      ...['add', 'remove', 'replace', 'move', 'copy', 'test'].map((op) =>
        variant(
          op,
          run(
            { type: 'STATE_SNAPSHOT', snapshot: { a: 1, b: 2 } },
            {
              type: 'STATE_DELTA',
              delta: [
                op === 'move' || op === 'copy'
                  ? { op, from: '/a', path: '/c' }
                  : op === 'remove'
                    ? { op, path: '/a' }
                    : { op, path: '/a', value: op === 'test' ? 1 : 3 },
              ],
            },
          ),
        ),
      ),
      variant(
        'replace-false',
        run(activity, { ...activity, replace: false, content: { count: 99 } }),
      ),
      variant(
        'invalid-op',
        run(
          { type: 'STATE_SNAPSHOT', snapshot: { count: 1 } },
          { type: 'STATE_DELTA', delta: [{ op: 'replace', path: '/missing', value: 9 }] },
        ),
        '前态count=1保留；不把失败patch的半成品写回。',
      ),
    ]
  if (id === 'AGUI-FLOW-005')
    return [
      variant(
        'old-rejects-cancelled',
        [begin, { ...finish, outcome: { type: 'cancelled' } }],
        '版本探针：0.0.59拒绝此outcome；当前1.0 schema接受。',
      ),
      variant('new-accepts-cancelled', [
        begin,
        ...text('保留已生成部分。'),
        { ...finish, outcome: { type: 'cancelled' } },
      ]),
      variant(
        'host-abort',
        plain,
        '播放后点击停止，实际调用useChat.stop；保留部分文本，不能记为成功。',
      ),
    ]
  if (id === 'AGUI-FLOW-006')
    return [
      variant(
        'string-result',
        run(toolStart, toolEnd, {
          type: 'TOOL_CALL_RESULT',
          messageId: 'result',
          toolCallId: 'tool-1',
          content: '字符串结果',
        }),
      ),
      variant(
        'parts-result',
        run(toolStart, toolEnd, {
          type: 'TOOL_CALL_RESULT',
          messageId: 'result',
          toolCallId: 'tool-1',
          content: [
            { type: 'text', text: '1.0多媒体结果' },
            { type: 'image', source: { type: 'url', value: localImage } },
          ],
        }),
      ),
      ...extraVariants('AGUI-MSG-008').filter((v) => v.id !== 'unsafe-source'),
    ]
  if (id === 'AGUI-FLOW-007')
    return [
      'interrupted',
      'resume-prepared',
      'resolved',
      'cancelled',
      'expired',
      'unknown',
      'missing-entry',
    ].map((name) => ({
      ...variant(
        name,
        [
          begin,
          {
            ...finish,
            outcome: {
              type: 'interrupt',
              interrupts: [{ id: 'approval-1', reason: 'local-approval' }],
            },
          },
        ],
        '中断/响应操作见本页的交互沙盒；此处展示对应请求数据，不创建虚构RESUME事件。',
      ),
      request: {
        threadId: 'fixture-thread',
        runId: 'resume-run',
        resume:
          name === 'missing-entry'
            ? []
            : [
                {
                  interruptId: name === 'unknown' ? 'unknown-id' : 'approval-1',
                  status: name === 'cancelled' ? 'cancelled' : 'resolved',
                  payload: { approved: name === 'resolved' },
                },
              ],
        state: {},
        messages: [],
        tools: [],
        context: [],
      },
    }))
  if (id === 'AGUI-FLOW-008')
    return [
      variant(
        'unknown-custom',
        run({
          type: 'CUSTOM',
          name: 'unknown.component',
          value: { component: 'DoNotExecute', html: '<script>blocked</script>' },
        }),
      ),
      variant('unknown-activity', run({ ...activity, activityType: 'unregistered-widget' })),
      variant(
        'unknown-part',
        run(...text('此前有效回答应保留。'), {
          type: 'MESSAGES_SNAPSHOT',
          messages: [
            {
              id: 'unsafe-part',
              role: 'user',
              content: [{ type: 'generative-ui', component: 'DoNotExecute' }],
            },
          ],
        }),
        'schema拒绝不存在的ContentPart，已有内容保留。',
      ),
      variant('unsafe-link', run(...text('[不可执行链接](javascript:alert(1))'))),
      variant(
        'opaque-reasoning',
        run({
          type: 'REASONING_ENCRYPTED_VALUE',
          subtype: 'message',
          entityId: 'opaque-message',
          encryptedValue: 'opaque-local-signature',
        }),
        '密文不解码、不复制为思考正文。',
      ),
    ]
  return []
}
