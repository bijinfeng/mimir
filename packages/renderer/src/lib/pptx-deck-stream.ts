import {
  PPTX_DECK_CANDIDATE_MAX_BYTES,
  PPTX_DECK_STREAM_MAX_BYTES,
  PPTX_DECK_STREAM_MAX_EVENTS,
  PPTX_DECK_STREAM_MAX_LINE,
  PptxDeckStreamError,
  pptxDeckStreamEventSchema,
  type PptxDeckCheckpoint,
  type PptxDeckProgressListener,
} from '@mimir/shared'
import type { RpcConfig } from './api'
import { appBasePath } from './app-path'

export async function streamPptxDeck(
  transport: RpcConfig,
  form: FormData,
  expectedVersion: number,
  generationId: string,
  signal: AbortSignal | undefined,
  onProgress: PptxDeckProgressListener,
) {
  const response = await (transport.fetchImpl ?? fetch)(
    `${transport.baseUrl ?? appBasePath}/api/conversations/pptx-agent/apply-ops?stream=1`,
    { method: 'POST', credentials: 'include', headers: transport.headers, body: form, signal },
  )
  if (!response.ok) throw new PptxDeckStreamError('演示文稿生成请求失败，请检查模型配置后重试')
  if (!response.body) throw new PptxDeckStreamError('生成服务没有返回内容流')
  const reader = response.body.getReader(),
    decoder = new TextDecoder('utf-8', { fatal: true })
  let pending = '',
    total = 0,
    events = 0,
    completed = 0,
    terminal = false
  let terminalError: PptxDeckStreamError | undefined
  let last: PptxDeckCheckpoint | undefined
  let identity: { total: number; insertMode: string; originalPages: number } | undefined
  const consume = async (line: string) => {
    if (!line) return
    if (terminal || ++events > PPTX_DECK_STREAM_MAX_EVENTS)
      throw new PptxDeckStreamError('生成事件数量或终局无效')
    const event = pptxDeckStreamEventSchema.parse(JSON.parse(line))
    if ('generationId' in event && event.generationId !== generationId)
      throw new PptxDeckStreamError('生成会话已失效')
    if (event.type === 'error') {
      terminal = true
      terminalError = new PptxDeckStreamError(event.message, event.recoverable && completed > 0)
      return
    }
    if (event.type === 'done') {
      if (!last || event.completed !== completed || completed !== identity?.total)
        throw new PptxDeckStreamError('生成终局不完整')
      terminal = true
      return
    }
    const p = event.progress
    if (p.generationId !== generationId) throw new PptxDeckStreamError('生成会话已失效')
    identity ??= { total: p.total, insertMode: p.insertMode, originalPages: p.originalPages }
    if (
      identity.total !== p.total ||
      identity.insertMode !== p.insertMode ||
      identity.originalPages !== p.originalPages
    )
      throw new PptxDeckStreamError('生成计划在传输中改变')
    if (event.type === 'checkpoint') {
      if (
        p.stage !== 'checkpoint' ||
        p.completed !== completed + 1 ||
        event.data.pages !== p.completed
      )
        throw new PptxDeckStreamError('生成页序不完整')
      const decoded = atob(event.bytesBase64)
      if (decoded.length > PPTX_DECK_CANDIDATE_MAX_BYTES)
        throw new PptxDeckStreamError('生成候选超过50 MiB')
      const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0))
      const candidate = { bytes, data: event.data, sampleData: event.sampleData }
      await onProgress(p, candidate)
      last = candidate
      completed = p.completed
    } else {
      if (p.completed !== completed || p.stage === 'checkpoint')
        throw new PptxDeckStreamError('生成进度无效')
      await onProgress(p)
    }
  }
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > PPTX_DECK_STREAM_MAX_BYTES) throw new PptxDeckStreamError('生成预览超过传输预算')
      pending += decoder.decode(chunk.value, { stream: true })
      let newline = pending.indexOf('\n')
      while (newline >= 0) {
        if (newline > PPTX_DECK_STREAM_MAX_LINE) throw new PptxDeckStreamError('生成事件过长')
        await consume(pending.slice(0, newline))
        pending = pending.slice(newline + 1)
        newline = pending.indexOf('\n')
      }
      if (pending.length > PPTX_DECK_STREAM_MAX_LINE) throw new PptxDeckStreamError('生成事件过长')
    }
    pending += decoder.decode()
    if (pending || !terminal) throw new PptxDeckStreamError('生成流未完整结束，请重新生成')
    if (terminalError) throw terminalError
    if (!last) throw new PptxDeckStreamError('生成缺少完整候选')
    return { ...last, version: expectedVersion + 1, records: [], changed: true }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
