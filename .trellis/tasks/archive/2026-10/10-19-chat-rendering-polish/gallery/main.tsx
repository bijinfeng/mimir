import { useChat } from '@gallery-sdk'
import type { UIMessage } from '@tanstack/ai'
import { OfficialChatProvider } from '@gallery-repo/packages/chat/src/ui/kit'
import { MessageContext } from '@gallery-repo/packages/chat/src/runtime/runtime-context'
import { MessageParts } from '@gallery-repo/packages/chat/src/ui/MessageParts'
import { createRoot } from 'react-dom/client'
import { App } from 'antd'
import { ThemeProvider } from 'antd-style'
import { ChatPanel } from '@gallery-repo/packages/chat/src/ChatPanel'
import { ChatThemeBridge } from '@gallery-repo/packages/renderer/src/components/chat/ChatThemeBridge'
import { themeConfigFor } from '@gallery-repo/packages/renderer/src/theme/tokens'
import { customTokenFor } from '@gallery-repo/packages/renderer/src/theme/customToken'
import type { ChatComposerStatus, ChatIo } from '@gallery-repo/packages/chat/src/types'
import { messageSchema } from '@mimir/shared'
import { ReasoningPart } from '@gallery-repo/packages/chat/src/parts/ReasoningPart'
import { ToolCallPart, ToolGroup } from '@gallery-repo/packages/chat/src/parts/ToolCallPart'
import { StoppedNotice } from '@gallery-repo/packages/chat/src/parts/StoppedNotice'
import { StreamErrorCard } from '@gallery-repo/packages/chat/src/parts/FailureNotice'
import { ImagePart, FilePart, SourcePart } from '@gallery-repo/packages/chat/src/parts/MediaParts'
import './style.css'
const query = new URLSearchParams(location.search)
const scene = query.get('scene') ?? 'reading'
const appearance = query.get('theme') === 'dark' ? 'dark' : 'light'
const sidebar = query.get('layout') === 'sidebar'
const rich = `## 把收集变成可以复用的知识
资料只有重新进入工作，才会产生价值。mimir 将**收集、整理与使用**连成同一条路径，保留回到原文的依据。

### 一个轻量的整理方法
1. 先记录问题，再收集与问题相关的资料。
2. 用自己的话整理关键结论。
   - 保留原文出处，区分事实与判断。
   - 为下次检索补上简短标题。
3. 在实际工作中验证并修订。

> 不必把所有资料一次整理完。先让正在使用的知识变得清楚。

| 内容 | 适合的组织方式 | 下一步 |
| --- | --- | --- |
| 零散灵感 | 简短笔记与关键词 | 在具体问题中补充上下文 |
| 项目资料 | 文件夹与原始来源 | 汇总可验证的结论 |
| 长期知识 | 主题笔记与相关链接 | 定期回顾并修订 |

### 配置示例
下面的 \`modelSelection\` 使用明确的供应商与模型：

\`\`\`typescript
const modelSelection = { providerId: 'research-provider', modelId: 'knowledge-assistant', reasoningEffort: 'medium' }
const answer = await ask({ question: '如何组织资料？', scope: 'all', modelSelection })
\`\`\`

更多说明见[知识整理指南](https://example.com/guide)。超长路径同样保持在阅读区域内：\`workspace/research/knowledge-management/notes/2026/continuous-learning-and-evidence-backed-decisions.md\`。

---

最后，**从一个真实问题开始**，比预先设计复杂的分类体系更有效。`
const processEvents = [
  { type: 'REASONING_START' },
  { type: 'REASONING_MESSAGE_START', messageId: 'reason', role: 'reasoning' },
  {
    type: 'REASONING_MESSAGE_CONTENT',
    messageId: 'reason',
    delta:
      '先确认问题关注的知识整理方式，再对照原文区分短期资料与长期主题。\n\n需要保留可以核对的来源，避免把示例当作真实结论。',
  },
  { type: 'REASONING_MESSAGE_END', messageId: 'reason' },
  { type: 'REASONING_END' },
  { type: 'TEXT_MESSAGE_START', messageId: 'answer', role: 'assistant' },
  {
    type: 'TOOL_CALL_START',
    toolCallId: 'read',
    toolCallName: 'read_blocks',
    parentMessageId: 'answer',
  },
  { type: 'TOOL_CALL_ARGS', toolCallId: 'read', delta: '{"documentId":"guide","range":[1,3]}' },
  { type: 'TOOL_CALL_END', toolCallId: 'read' },
  {
    type: 'TOOL_CALL_RESULT',
    messageId: 'tool-result',
    toolCallId: 'read',
    role: 'tool',
    content: '{"ok":true,"blocks":3,"text":"先记录问题，再整理可验证的结论。"}',
  },
  {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'answer',
    delta:
      '可以先围绕当前问题整理资料，再逐步建立长期主题。\n\n建议保留原文出处，并把**事实、判断和待验证的想法**分开记录。',
  },
  { type: 'TEXT_MESSAGE_END', messageId: 'answer' },
]
const base = {
  trace: null,
  failure: null,
  savedNoteId: null,
  createdAt: '2026-10-19T00:00:00Z',
  citations: [],
}
const messages = [
  { ...base, id: 'question', role: 'user', text: '如何把收集的资料整理成真正能复用的知识？' },
  {
    ...base,
    id: 'answer',
    role: 'assistant',
    text: scene === 'reading' ? rich : '可以先围绕当前问题整理资料，再逐步建立长期主题。',
    ...(scene === 'process' ? { protocolEvents: processEvents } : {}),
    ...(scene === 'failure' ? { failure: 'quota', text: '' } : {}),
    ...(scene === 'reading' || scene === 'process'
      ? {
          citations: [
            {
              documentId: 'guide',
              kind: 'note',
              title: '知识整理指南 · 从收集到使用',
              snippet: '**保留出处**，围绕真实问题整理结论，让资料回到实际工作。',
              start: 0,
              end: 40,
              matchedBy: ['keyword', 'vector'],
            },
          ],
        }
      : {}),
  },
].map((message) => messageSchema.parse(message))
const io: ChatIo = {
  createConversation: async () => ({ id: 'fixture-chat' }),
  loadConversation: async () => {
    if (scene === 'loading') return new Promise(() => {})
    if (scene === 'history-error') throw new Error('无法读取会话，请检查连接后重试')
    return { messages }
  },
  onConversationCreated() {},
  onTurnSettled() {},
  saveAsNote: async () => ({ noteId: 'fixture-note' }),
  onManageModels() {
    window.alert('场景演示：管理模型由宿主打开')
  },
}
const status: ChatComposerStatus = {
  documents: {
    items: [{ id: 'guide', title: '知识整理指南' }],
    isLoading: false,
    isError: false,
    refetch() {},
  },
  models: {
    isLoading: false,
    isError: false,
    refetch() {},
    catalog: {
      defaultSelection: { providerId: 'demo', modelId: 'knowledge-assistant' },
      providers: [
        {
          providerId: 'demo',
          providerName: '演示供应商',
          models: [
            {
              providerId: 'demo',
              modelId: 'knowledge-assistant',
              label: 'Knowledge Assistant',
              vision: 'supported',
              tools: 'supported',
              reasoning: { status: 'supported', levels: ['low', 'medium', 'high'] },
            },
          ],
        },
      ],
    },
  },
  usage: null,
}
const sampleImage = new URL('./attachment.png', location.href).href
const sampleTool = {
  type: 'tool-call' as const,
  id: 'state-tool',
  name: 'read_blocks',
  arguments: '{"documentId":"guide"}',
  state: 'complete' as const,
  output: { ok: true, blocks: 3 },
}
const diagnosticMessage: UIMessage = {
  id: 'protocol-fixture',
  role: 'assistant',
  parts: [
    { type: 'audio', source: { type: 'url', value: './fixture-audio.wav' } },
    { type: 'video', source: { type: 'url', value: './fixture-video.mp4' } },
    {
      type: 'activity',
      activityType: '资料校对状态',
      content: { state: 'complete', checkedSources: 2 },
    },
    {
      type: 'structured-output',
      status: 'complete',
      raw: '{"verified":true}',
      data: { verified: true, title: '可复用的知识' },
    },
    {
      type: 'subagent',
      subagent: {
        id: 'child-fixture',
        name: '资料校对',
        status: 'finished',
        messages: [
          {
            id: 'child-answer',
            role: 'assistant',
            parts: [{ type: 'text', content: '已核对两条来源。' }],
          },
        ],
      },
    },
    {
      type: 'tool-result',
      toolCallId: 'missing-historical-call',
      state: 'complete',
      content: '历史独立工具结果：保留可检查的原始内容。',
    },
  ],
}
function NativePartSamples() {
  const host = useChat({
    initialMessages: [diagnosticMessage],
    connection: {
      async *connect() {
        yield* []
      },
    },
  })
  return (
    <OfficialChatProvider chat={host}>
      <MessageContext value={{ message: diagnosticMessage, sidecar: {}, running: false }}>
        <MessageParts message={diagnosticMessage} />
      </MessageContext>
    </OfficialChatProvider>
  )
}
function Supplemental() {
  return (
    <div className="supplemental">
      <h2>过程与终局状态</h2>
      <ReasoningPart
        text="正在对照资料确认结论。\n\n保留来源，以便核对。"
        status={{ type: 'running' }}
      />
      <ToolCallPart part={{ ...sampleTool, state: 'input-streaming', output: undefined }} />
      <ToolCallPart
        part={{ ...sampleTool, output: { ok: false, error: '文档已更新，请重新读取' } }}
      />
      <ToolGroup parts={[sampleTool, { ...sampleTool, id: 'second', name: 'get_document_info' }]} />
      <StoppedNotice />
      <StreamErrorCard detail="连接中断，输入已保留。" onRetry={() => {}} onRefill={() => {}} />
      <h2>媒体与来源</h2>
      <ImagePart image={sampleImage} name="知识整理示例.png" />
      <FilePart
        data={new URL('./fixture-document.txt', location.href).href}
        mimeType="text/plain"
        filename="知识整理方法与实际案例-长文件名称-2026.txt"
      />
      <SourcePart sourceType="url" title="知识整理指南" url="https://example.com/guide" />
      <h2>协议内容组件</h2>
      <p>
        固定协议
        fixture：音频、视频、活动、结构化输出、子任务与独立工具结果。展示真实组件，不声称服务端生成过这些数据。
      </p>
      <NativePartSamples />
    </div>
  )
}
createRoot(document.getElementById('root')!).render(
  <ThemeProvider
    appearance={appearance}
    theme={themeConfigFor(appearance)}
    customToken={customTokenFor(appearance)}
  >
    <App>
      <main data-theme={appearance} className={sidebar ? 'gallery sidebar' : 'gallery'}>
        <header>
          <strong>对话渲染 · 真实组件</strong>
          <span>固定模拟资料与内存 IO · 不连接真实模型</span>
        </header>
        <nav>
          {['reading', 'process', 'states', 'failure', 'empty', 'loading', 'history-error'].map(
            (id) => (
              <a
                key={id}
                href={`?scene=${id}&theme=${appearance}&layout=${sidebar ? 'sidebar' : 'main'}`}
              >
                {id}
              </a>
            ),
          )}
          <a
            href={`?scene=${scene}&theme=${appearance === 'dark' ? 'light' : 'dark'}&layout=${sidebar ? 'sidebar' : 'main'}`}
          >
            切换主题
          </a>
        </nav>
        <section className="surface">
          <ChatThemeBridge gutter={sidebar ? '16px' : '24px'}>
            {scene === 'states' ? (
              <Supplemental />
            ) : (
              <ChatPanel
                key={scene}
                conversationId={scene === 'empty' ? undefined : 'fixture-chat'}
                draft={null}
                io={io}
                composerStatus={status}
                onOpenCitation={() => window.alert('场景演示：由真实宿主定位原文')}
                onOpenNote={() => {}}
              />
            )}
          </ChatThemeBridge>
        </section>
      </main>
    </App>
  </ThemeProvider>,
)
