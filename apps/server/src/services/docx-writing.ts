import { getDocument } from './documents.js'
import { modelReady, streamChat } from './model.js'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const encoder = new TextEncoder()

/** A separate TanStack chat stream for long drafts, consumed by the editor as NDJSON. */
export async function streamDocxWriting(input: {
  documentId: string
  instruction: string
  context: string
  signal?: AbortSignal
}): Promise<Response> {
  const document = await getDocument(input.documentId)
  if (!document || document.kind !== 'file' || document.mime !== DOCX_MIME) {
    return new Response(
      JSON.stringify({
        error: { code: 'DOCX_NOT_FOUND', message: '当前文档不是可编辑的 DOCX 文件' },
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    )
  }
  if (!(await modelReady('chat'))) {
    return new Response(
      JSON.stringify({ error: { code: 'MODEL_NOT_READY', message: '请先配置可用的聊天模型' } }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    )
  }
  const chunks = await streamChat({
    role: 'chat',
    source: 'chat',
    refId: input.documentId,
    stream: true,
    messages: [{ role: 'user', content: input.instruction }],
    systemPrompts: [
      '根据用户要求撰写可直接插入 DOCX 的完整正文。只输出正文 HTML，使用 p、h1-h6、ul、ol、li、strong、em 等基本标签。不输出 Markdown 代码围栏。',
      `当前文档：${document.title}\n上下文：${input.context}`,
    ],
    ...(input.signal ? { abortSignal: input.signal } : {}),
  })
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let length = 0
      try {
        for await (const chunk of chunks) {
          if (input.signal?.aborted) throw new Error('已取消写作')
          if (chunk.type === 'RUN_ERROR') throw new Error(chunk.message)
          if (chunk.type !== 'TEXT_MESSAGE_CONTENT') continue
          length += chunk.delta.length
          if (length > 100_000) throw new Error('写作内容超过 100000 字符限制')
          controller.enqueue(
            encoder.encode(`${JSON.stringify({ type: 'delta', text: chunk.delta })}\n`),
          )
        }
        controller.enqueue(encoder.encode('{"type":"done"}\n'))
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : '写作失败' })}\n`,
          ),
        )
      } finally {
        controller.close()
      }
    },
  })
  return new Response(body, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
