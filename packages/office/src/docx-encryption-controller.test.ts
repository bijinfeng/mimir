import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocxEncryptionController } from './docx-encryption.js'
import { DOCX_ENCRYPTION_DEADLINE_MS, type DocxEncryptionRequest } from './docx-encryption-types.js'
class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = []
  request?: DocxEncryptionRequest
  terminated = false
  constructor(
    readonly url: URL,
    readonly options: WorkerOptions,
  ) {
    super()
    FakeWorker.instances.push(this)
  }
  postMessage(request: DocxEncryptionRequest) {
    this.request = request
  }
  terminate() {
    this.terminated = true
  }
  respond(data: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }
}
const source = {},
  input = new Uint8Array([1, 2, 3]),
  signal = () => new AbortController().signal
const success = (worker: FakeWorker) => ({
  id: worker.request!.id,
  result: { bytes: new Uint8Array([4, 5, 6]), format: 'agile' },
})
beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('private per-source encryption worker lifecycle', () => {
  it('creates a genuine module worker entry URL, copies input and settles/terminates once', async () => {
    const controller = new DocxEncryptionController(source)
    const promise = controller.encrypt(input, 'private secret', signal(), source)
    const worker = FakeWorker.instances[0]!
    expect(worker.url.pathname).toContain('docx-encryption.worker.ts')
    expect(worker.options).toEqual({ type: 'module' })
    expect(worker.request?.bytes).toEqual(input)
    expect(worker.request?.bytes).not.toBe(input)
    worker.respond(success(worker))
    worker.respond({ id: worker.request!.id, error: 'damaged' })
    expect((await promise).format).toBe('agile')
    expect(worker.terminated).toBe(true)
    expect(input).toEqual(new Uint8Array([1, 2, 3]))
  })
  it('cancels and terminates immediately, ignoring late completion', async () => {
    const controller = new DocxEncryptionController(source),
      abort = new AbortController()
    const promise = controller.decrypt(input, 'secret', abort.signal, source)
    const assertion = promise.catch((error: unknown) => error)
    const worker = FakeWorker.instances[0]!
    abort.abort()
    worker.respond(success(worker))
    expect(await assertion).toMatchObject({ name: 'AbortError' })
    expect(worker.terminated).toBe(true)
  })
  it('A→B→A invalidates previous source work and cannot revive it', async () => {
    const controller = new DocxEncryptionController(source)
    const promise = controller.decrypt(input, 'secret', signal(), source)
    const assertion = promise.catch((error: unknown) => error)
    const worker = FakeWorker.instances[0]!
    controller.bindSource({})
    controller.bindSource(source)
    worker.respond(success(worker))
    expect(await assertion).toMatchObject({ name: 'AbortError' })
    expect(worker.terminated).toBe(true)
  })
  it('rechecks after promise resolution before publishing when the source changes in the same turn', async () => {
    const controller = new DocxEncryptionController(source)
    const promise = controller.decrypt(input, 'secret', signal(), source)
    const worker = FakeWorker.instances[0]!
    worker.respond(success(worker))
    controller.bindSource({})
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('explicit cancel also invalidates an already-resolved same-turn result', async () => {
    const controller = new DocxEncryptionController(source)
    const promise = controller.decrypt(input, 'secret', signal(), source)
    const worker = FakeWorker.instances[0]!
    worker.respond(success(worker))
    controller.cancel()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('a replacement request with invalid input still cancels previous intent', async () => {
    const controller = new DocxEncryptionController(source)
    const previous = controller.decrypt(input, 'old-secret', signal(), source)
    const rejected = previous.catch((error: unknown) => error)
    const worker = FakeWorker.instances[0]!
    await expect(controller.encrypt(input, '', signal(), source)).rejects.toMatchObject({
      code: 'budget',
    })
    worker.respond(success(worker))
    expect(await rejected).toMatchObject({ name: 'AbortError' })
    expect(worker.terminated).toBe(true)
  })
  it('superseding a request rejects the old one and only accepts the newest identity', async () => {
    const controller = new DocxEncryptionController(source)
    const first = controller.decrypt(input, 'secret1', signal(), source)
    const rejected = first.catch((error: unknown) => error)
    const old = FakeWorker.instances[0]!,
      second = controller.decrypt(input, 'secret2', signal(), source),
      active = FakeWorker.instances[1]!
    old.respond(success(old))
    active.respond(success(active))
    expect(await rejected).toMatchObject({ name: 'AbortError' })
    expect((await second).format).toBe('agile')
    expect(old.terminated && active.terminated).toBe(true)
  })
  it('terminates on close and rejects future work without starting a worker', async () => {
    const controller = new DocxEncryptionController(source)
    const promise = controller.decrypt(input, 'secret', signal(), source)
    const rejected = promise.catch((error: unknown) => error)
    controller.dispose()
    expect(await rejected).toMatchObject({ name: 'AbortError' })
    await expect(controller.decrypt(input, 'secret', signal(), source)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(FakeWorker.instances).toHaveLength(1)
  })
  it('times out bounded derivation, terminates, and rejects a late result', async () => {
    vi.useFakeTimers()
    const controller = new DocxEncryptionController(source),
      promise = controller.decrypt(input, 'secret', signal(), source)
    const rejected = promise.catch((error: unknown) => error),
      worker = FakeWorker.instances[0]!
    await vi.advanceTimersByTimeAsync(DOCX_ENCRYPTION_DEADLINE_MS)
    worker.respond(success(worker))
    expect(await rejected).toMatchObject({ code: 'timeout' })
    expect(worker.terminated).toBe(true)
  })
  for (const data of [
    { id: 999, result: { bytes: input, format: 'agile' } },
    { id: 1, error: 'private password/error stack' },
    { id: 1, result: { bytes: [], format: 'agile' } },
    { id: 1, result: { bytes: input, format: 'standard' } },
    { id: 1, error: 'damaged', secret: 'hidden' },
  ]) {
    it('sanitizes malformed/forged results and refuses incorrect request identity', async () => {
      const controller = new DocxEncryptionController(source),
        promise = controller.encrypt(input, 'secret', signal(), source)
      const worker = FakeWorker.instances[0]!
      worker.respond(data)
      await expect(promise).rejects.toMatchObject({ code: 'unavailable' })
      expect(worker.terminated).toBe(true)
    })
  }
  it('rejects stale source and pre-abort before worker creation', async () => {
    const controller = new DocxEncryptionController(source),
      abort = new AbortController()
    abort.abort()
    await expect(controller.decrypt(input, 'secret', signal(), {})).rejects.toMatchObject({
      name: 'AbortError',
    })
    await expect(controller.decrypt(input, 'secret', abort.signal, source)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(FakeWorker.instances).toHaveLength(0)
  })
  for (const event of ['error', 'messageerror']) {
    it(`terminates on ${event} without reflecting platform exception details`, async () => {
      const controller = new DocxEncryptionController(source),
        promise = controller.decrypt(input, 'secret', signal(), source)
      const worker = FakeWorker.instances[0]!
      worker.dispatchEvent(new Event(event))
      await expect(promise).rejects.toMatchObject({ code: 'unavailable' })
      expect(worker.terminated).toBe(true)
    })
  }
})
