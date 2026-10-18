import Taro from '@tarojs/taro'
import type { MiniappChatInput, MiniappStreamEvent } from '@mimir/shared/miniapp'
import { authHeaders, requireOrigin, parseError, handleUnauthorized, ApiError } from './api'
import { Utf8Decoder, SseParser, RunCompletion } from './sse'

export function streamingSupport() {
  const version = Taro.getSystemInfoSync().SDKVersion || '0'
  const parts = version.split('.').map(Number)
  if (
    (parts[0] || 0) < 2 ||
    (parts[0] === 2 && ((parts[1] || 0) < 20 || (parts[1] === 20 && (parts[2] || 0) < 2)))
  ) {
    return '当前微信基础库不支持分块问答，请升级微信后重试。'
  }
  return ''
}
export function openChat(
  input: MiniappChatInput,
  onEvent: (event: MiniappStreamEvent) => void,
  onError: (error: Error) => void,
  onComplete: (terminal: boolean) => void,
) {
  const unsupported = streamingSupport()
  if (unsupported) throw new ApiError(0, 'UNSUPPORTED_CLIENT', unsupported)
  const url = `${requireOrigin()}/chat`
  const authorization = authHeaders().Authorization
  const decoder = new Utf8Decoder()
  const completion = new RunCompletion()
  let status = 200
  let received = false
  let invalid = false
  let settled = false
  const parser = new SseParser((data) => {
    if (invalid) return
    try {
      const event = JSON.parse(data) as MiniappStreamEvent
      if (!event || typeof event.type !== 'string') throw new Error('无效的流事件')
      completion.receive(event.type)
      if (event.type === 'RUN_ERROR') invalid = true
      onEvent(event)
    } catch {
      invalid = true
      completion.fail()
      onError(new ApiError(0, 'INVALID_STREAM', '问答数据不完整，请查询已保存的会话。'))
    }
  })
  const done = () => {
    if (!settled) {
      settled = true
      onComplete(completion.complete && !invalid)
    }
  }
  const task = Taro.request({
    url,
    method: 'POST',
    data: input,
    header: {
      Authorization: authorization,
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    enableChunked: true,
    responseType: 'arraybuffer',
    timeout: 300000,
    success(response) {
      status = response.statusCode
      if (status < 200 || status >= 300) {
        handleUnauthorized(status, authorization)
        let body: unknown
        try {
          body = JSON.parse(
            typeof response.data === 'string'
              ? response.data
              : new Utf8Decoder().decode(response.data as ArrayBuffer, true),
          )
        } catch {
          body = null
        }
        onError(parseError(status, body))
        done()
        return
      }
      if (!received && response.data) {
        parser.push(
          typeof response.data === 'string'
            ? response.data
            : decoder.decode(response.data as ArrayBuffer),
        )
      }
      parser.push(decoder.decode(new ArrayBuffer(0), true))
      parser.finish()
      done()
    },
    fail() {
      if (!settled)
        onError(
          new ApiError(
            0,
            'STREAM_INTERRUPTED',
            '连接已中断，部分回答已保留。请查询结果，不会自动重新提问。',
          ),
        )
      done()
    },
  })
  void task.catch(() => undefined)
  task.onChunkReceived((response) => {
    received = true
    if (status >= 200 && status < 300) parser.push(decoder.decode(response.data))
  })
  return {
    abort: () => {
      task.abort()
      done()
    },
  }
}
