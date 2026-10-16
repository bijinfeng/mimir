import {
  markdownWriteStreamEventSchema,
  type ApiError,
  type MarkdownWriteDocumentInput,
} from '@mimir/shared'
import { appBasePath } from './app-path'
import { ApiRequestError, type RpcConfig } from './api'

/** Read model deltas as they arrive. A truncated transport never counts as a complete page. */
export async function streamMarkdownWriting(
  transport: RpcConfig,
  input: MarkdownWriteDocumentInput,
  signal?: AbortSignal,
  onDelta?: (text: string) => void,
): Promise<{ markdown: string; complete: true }> {
  const response = await (transport.fetchImpl ?? fetch)(
    `${transport.baseUrl ?? appBasePath}/api/conversations/markdown-agent/write-document?stream=1`,
    {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: { 'Content-Type': 'application/json', ...transport.headers },
      body: JSON.stringify(input),
    },
  )
  if (!response.ok) {
    const body = (await response.json()) as ApiError
    throw new ApiRequestError(
      response.status,
      body.error?.code ?? 'MARKDOWN_WRITE_FAILED',
      body.error?.message ?? '长文写作失败',
    )
  }
  if (!response.body) throw new Error('长文写作服务没有返回内容流')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let total = 0
  let result: { markdown: string; complete: true } | null = null
  const consume = (line: string) => {
    if (!line.trim()) return
    if (result) throw new Error('长文写作服务在结束后仍返回内容')
    const event = markdownWriteStreamEventSchema.parse(JSON.parse(line))
    if (event.type === 'error') throw new Error(event.message)
    if (event.type === 'done') result = { markdown: event.markdown, complete: true }
    else {
      total += event.text.length
      if (total > 100_000) throw new Error('Markdown 草稿超过 100000 字符限制')
      onDelta?.(event.text)
    }
  }
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      pending += decoder.decode(chunk.value, { stream: true })
      if (pending.length > 1_500_000) throw new Error('长文写作响应过长')
      let newline = pending.indexOf('\n')
      while (newline >= 0) {
        consume(pending.slice(0, newline))
        pending = pending.slice(newline + 1)
        newline = pending.indexOf('\n')
      }
    }
    pending += decoder.decode()
    if (pending.trim()) consume(pending)
    if (!result) throw new Error('长文生成未完成；可保留已有草稿或丢弃重试')
    return result
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
