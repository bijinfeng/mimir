import { expect, it, vi } from 'vitest'
import type { ChatDocxAgent } from '../types.js'
import { executeBridgeTool } from './DocxInterruptBridge.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function options(controller: AbortController) {
  const execute = vi.fn<ChatDocxAgent['execute']>()
  const agent: ChatDocxAgent = {
    documentId: 'pptx-current',
    format: 'pptx',
    getVersion: () => 3,
    getContext: () => ({}),
    freezeSelection: () => ({}),
    execute,
    undoRound: () => true,
  }
  return {
    agent,
    roundId: 'current-round',
    expectedVersion: 3,
    signal: controller.signal,
    batchChanged: false,
    revisionMode: false,
    setProgress: () => {},
    onCreatedDocument: () => {},
    requestMediaSource: async () => new File(['original'], 'logo.png', { type: 'image/png' }),
    tool: { name: 'insert_web_image', input: { url: 'attachment://logo.png' } },
  }
}

it('drops original attachment bytes when stopped during the file read without dispatching a host request', async () => {
  const controller = new AbortController(),
    value = options(controller)
  const reading = deferred<void>(),
    data = deferred<ArrayBuffer>()
  const file = new File(['original'], 'logo.png', { type: 'image/png' })
  vi.spyOn(file, 'arrayBuffer').mockImplementation(() => {
    reading.resolve()
    return data.promise
  })
  const pending = executeBridgeTool({ ...value, requestMediaSource: async () => file })
  const outcome = pending.then(
    () => null,
    (error: unknown) => error,
  )
  await reading.promise
  controller.abort()
  data.resolve(new Uint8Array([1, 2, 3]).buffer)
  expect(await outcome).toMatchObject({ message: expect.stringContaining('已停止') })
  expect(value.agent.execute).not.toHaveBeenCalled()
})

it('drops a late original-video analysis after stopping and never calls a writing executor', async () => {
  const controller = new AbortController(),
    value = options(controller)
  const analyzed = deferred<{ text: string }>(),
    started = deferred<void>()
  const pending = executeBridgeTool({
    ...value,
    tool: { name: 'analyze_media', input: { kind: 'video', requirements: '分析' } },
    requestMediaSource: async () => new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
    analyzeDocxMedia: async () => {
      started.resolve()
      return analyzed.promise
    },
  })
  const outcome = pending.then(
    () => null,
    (error: unknown) => error,
  )
  await started.promise
  controller.abort()
  analyzed.resolve({ text: 'late content' })
  expect(await outcome).toMatchObject({ message: expect.stringContaining('已停止') })
  expect(value.agent.execute).not.toHaveBeenCalled()
})
