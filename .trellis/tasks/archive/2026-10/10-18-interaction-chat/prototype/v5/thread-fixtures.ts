import type { ThreadMessageLike } from './local-types'
import manifest from './scenes.json'
type Scene = (typeof manifest.scenes)[number]
type Projection = {
  scene: Scene
  phase: string
  delivered: string
  lastQuestion: string
  toolArgs: unknown
  toolResult: unknown
  agentStage: string
  sentSnapshot: boolean
  searchOnly: boolean
  failure: string
  attachments?: ThreadMessageLike['attachments']
}
export const localImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720"><rect width="1200" height="720" fill="#edf2f7"/><text x="60" y="320" font-size="56" fill="#27364b">Knowledge connections</text><text x="60" y="390" font-size="28" fill="#53657c">Local image fixture, not a captured slide</text></svg>')}`
function localWav(): string {
  const samples = 1600
  const bytes = new Uint8Array(44 + samples * 2)
  const view = new DataView(bytes.buffer)
  const word = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i)
  }
  word(0, 'RIFF')
  view.setUint32(4, bytes.length - 8, true)
  word(8, 'WAVE')
  word(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 16000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  word(36, 'data')
  view.setUint32(40, samples * 2, true)
  for (let i = 0; i < samples; i++)
    view.setInt16(44 + i * 2, Math.sin((2 * Math.PI * 440 * i) / 8000) * 1800, true)
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`
}
const reasoning =
  '先明确问题的目标，再把整理方法和可执行的行动联系起来。需要保留原文语境，避免只对收藏做分类。'
const answer =
  '可以从一条清晰的使用路径开始：**保留来源，建立联系，定期回顾。**\n\n不要急着给所有收藏做分类。先选一个正在使用的主题，把它整理成可以继续写下去的材料。\n\n1. 保留原文链接与必要语境。\n2. 用自己的话写一条判断，并连到已有笔记。\n3. 每周回看正在生长的主题，而不是只清空收藏夹。'
export function createThreadMessages({
  scene,
  phase,
  delivered,
  lastQuestion,
  toolArgs,
  toolResult,
  agentStage,
  sentSnapshot,
  searchOnly,
  failure,
  attachments,
}: Projection): ThreadMessageLike[] {
  const ui = scene.ui
  if (['empty', 'creating', 'loading'].includes(phase)) return []
  const running = ['searching', 'streaming'].includes(phase)
  if (
    scene.groupId === 'ATT-001' &&
    ['sent', 'history'].includes(scene.state) &&
    !attachments?.length
  )
    attachments = [
      {
        id: 'local-sent-fixture',
        type: 'document',
        name: '研究资料.txt',
        contentType: 'text/plain',
        status: { type: 'complete' },
        content: [{ type: 'text', text: '[本地附件模拟；没有真实上传、解析或模型请求]' }],
      },
    ]
  const user: ThreadMessageLike = {
    id: 'user-current',
    role: 'user',
    attachments,
    content:
      sentSnapshot && !attachments?.some((file) => file.id.startsWith('mimir-snapshot-fixture'))
        ? [
            { type: 'image', image: localImage, filename: 'slide-3-fixture.svg' },
            { type: 'text', text: lastQuestion },
          ]
        : lastQuestion,
  }
  const content: Exclude<ThreadMessageLike['content'], string>[number][] = []
  if (ui.reasoning)
    content.push({
      type: 'reasoning',
      text:
        reasoning +
        (ui.specialState === 'long'
          ? Array.from(
              { length: 20 },
              (_, i) => `\n\n${i + 1}. 对照原文语境与当前问题，检验整理建议是否成立。`,
            ).join('')
          : ''),
    })
  if (scene.track === 'tool')
    content.push({
      type: 'tool-call',
      toolCallId: 'search-fixture',
      toolName: ui.toolName,
      args: {},
      argsText: JSON.stringify(toolArgs, null, 2),
      ...(agentStage === 'running' ? {} : { result: toolResult, isError: agentStage === 'failed' }),
    })
  if (delivered !== 'none' && !ui.emptyAnswer) {
    let text = searchOnly
      ? '本轮只检索知识库，未调用模型。原文片段与来源在对话外的 Mimir 依据区域。'
      : delivered === 'partial'
        ? '可以从一条清晰的使用路径开始：**保留来源，建立联系，定期回顾。**'
        : answer
    if (scene.track === 'markdown' || scene.track === 'code')
      text +=
        '\n\n## 每周回顾\n\n> 让阅读成为下一次写作的起点。\n\n| 时机 | 行动 |\n| --- | --- |\n| 阅读之后 | 记录判断 |\n| 每周回顾 | 建立联系 |\n\n```typescript\nconst note = { title: "知识连接", sources: ["原始文档"] }\nconsole.log(note.sources)\n```\n\n[安全的外部链接](https://example.com/reference)'
    if (scene.track === 'scroll')
      text += Array.from(
        { length: 24 },
        (_, i) => `\n\n### 回顾 ${i + 1}\n\n保留原文语境，用自己的话建立联系，回到正在使用的主题。`,
      ).join('')
    content.push({ type: 'text', text })
    if (scene.track === 'files')
      content.push({
        type: 'file',
        data: ui.unsafeFile
          ? 'javascript:alert(1)'
          : 'data:text/plain;base64,TG9jYWwgcHJvdG90eXBlIGZpeHR1cmUu',
        mimeType: 'application/pdf',
        filename: ui.longFile ? `${'知识整理与文献回顾'.repeat(16)}.pdf` : '知识管理研究.pdf',
        ...(ui.unsafeFile ? { sourceType: 'url' as const } : {}),
      })
    if (scene.track === 'images')
      content.push({
        type: 'image',
        image: ['error', 'failure', 'broken'].includes(ui.specialState)
          ? 'data:image/png;base64,bm90LWFuLWltYWdl'
          : localImage,
        filename: 'knowledge-fixture.svg',
      })
  }
  if (scene.state === 'audio-demo')
    content.push({
      type: 'file',
      data: localWav(),
      mimeType: 'audio/wav',
      filename: '独立本地媒体模拟.wav',
    })
  const assistant: ThreadMessageLike = {
    id: 'assistant-current',
    role: 'assistant',
    content,
    status: running
      ? { type: 'running' }
      : phase === 'stopped'
        ? { type: 'incomplete', reason: 'cancelled' }
        : failure
          ? {
              type: 'incomplete',
              reason: 'error',
              error: failure === 'stream' ? 'Failed to fetch' : `Model request ${failure}`,
            }
          : { type: 'complete', reason: 'stop' },
  }
  if (ui.multiTurn)
    return [
      user,
      assistant,
      { id: 'user-followup', role: 'user', content: '那每周回顾时，应该优先看什么？' },
      {
        id: 'assistant-followup',
        role: 'assistant',
        content: '优先看正在使用的主题，找出本周新增的联系，以及还缺哪一个关键事实。',
        status: { type: 'complete', reason: 'stop' },
      },
    ]
  return [user, assistant]
}
