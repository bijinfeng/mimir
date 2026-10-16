import type { MarkdownWriteDocumentInput, MarkdownWriteStreamEvent } from '@mimir/shared'
import { getDocument } from './documents.js'
import { modelReady, streamChat } from './model.js'

/** Generate Markdown for a live note; the browser applies it only if its frozen version is still current. */
export async function* streamMarkdownDocument(
  input: MarkdownWriteDocumentInput & { signal?: AbortSignal },
): AsyncGenerator<MarkdownWriteStreamEvent> {
  const document = await getDocument(input.documentId)
  if (!document || document.kind !== 'note') throw new Error('当前文档不是可编辑的笔记')
  if (!(await modelReady('chat'))) throw new Error('请先配置可用的聊天模型')
  const chunks = await streamChat({
    role: 'chat',
    source: 'chat',
    refId: input.documentId,
    stream: true,
    messages: [{ role: 'user', content: input.plan }],
    systemPrompts: [
      '根据计划撰写完整的 Markdown 正文。只输出 Markdown，不输出代码围栏，不添加未经提供的事实。',
      `笔记标题：${input.title || document.title}\n参考材料：${input.context ?? ''}`,
    ],
    ...(input.signal ? { abortSignal: input.signal } : {}),
  })
  let markdown = ''
  let finished = false
  for await (const chunk of chunks) {
    if (input.signal?.aborted) throw new Error('写作已停止')
    if (chunk.type === 'RUN_ERROR') throw new Error(chunk.message)
    if (chunk.type === 'RUN_FINISHED') {
      finished = true
      continue
    }
    if (chunk.type !== 'TEXT_MESSAGE_CONTENT') continue
    markdown += chunk.delta
    if (markdown.length > 100_000) throw new Error('写作内容超过 100000 字符限制')
    yield { type: 'delta', text: chunk.delta }
  }
  if (input.signal?.aborted) throw new Error('写作已停止')
  if (!finished) throw new Error('写作连接中断，正文尚未完成')
  if (!markdown.trim()) throw new Error('写作模型没有返回正文')
  yield { type: 'done', markdown, complete: true }
}

/** Compatibility for callers that explicitly request a complete JSON response. */
export async function writeMarkdownDocument(
  input: MarkdownWriteDocumentInput & { signal?: AbortSignal },
): Promise<string> {
  for await (const event of streamMarkdownDocument(input)) {
    if (event.type === 'done') return event.markdown
  }
  throw new Error('写作正文尚未完成')
}
