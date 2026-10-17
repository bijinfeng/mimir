import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  verifyDocxModificationPassword,
  DOCX_PASSWORD_DEADLINE_MS,
} from './docx-protection-password.js'
import {
  PASSWORD_VECTORS,
  RealDocxPasswordWorker,
  vectorCredential,
} from './docx-protection-password-test-helper.js'

beforeEach(() => {
  RealDocxPasswordWorker.instances.length = 0
  vi.stubGlobal('Worker', RealDocxPasswordWorker)
})
afterEach(() => {
  RealDocxPasswordWorker.instances.forEach((worker) => worker.terminate())
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('dedicated local DOCX password worker', () => {
  it.each(PASSWORD_VECTORS)(
    'matches independently calculated SHA512 vector: $spinCount',
    async (vector) => {
      expect(
        await verifyDocxModificationPassword(
          vector.password,
          vectorCredential(vector),
          new AbortController().signal,
        ),
      ).toBe(true)
      expect(RealDocxPasswordWorker.instances).toHaveLength(1)
      expect(RealDocxPasswordWorker.instances[0]!.terminated).toBe(true)
    },
  )
  it('rejects a wrong password and terminates the real worker', async () => {
    expect(
      await verifyDocxModificationPassword(
        'wrong',
        vectorCredential(),
        new AbortController().signal,
      ),
    ).toBe(false)
    expect(RealDocxPasswordWorker.instances[0]!.terminated).toBe(true)
  })
  it.each([
    { spinCount: -1 },
    { spinCount: 1.5 },
    { spinCount: 1_000_001 },
    { spinCount: NaN },
    { algorithmSid: 12 },
    { salt: '' },
    { salt: btoa('x'.repeat(65)) },
    { hash: btoa('x'.repeat(63)) },
    { hash: 'bad' },
    { salt: 'AB==' },
  ])('refuses malformed or over-budget values before spawning: %s', async (changes) => {
    await expect(
      verifyDocxModificationPassword(
        'editor',
        { ...vectorCredential(), ...changes } as ReturnType<typeof vectorCredential>,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/凭据|算法/)
    expect(RealDocxPasswordWorker.instances).toHaveLength(0)
  })
  it('bounds password size before a worker and handles already-aborted requests', async () => {
    await expect(
      verifyDocxModificationPassword(
        'x'.repeat(1025),
        vectorCredential(),
        new AbortController().signal,
      ),
    ).rejects.toThrow('长度')
    const controller = new AbortController()
    controller.abort()
    await expect(
      verifyDocxModificationPassword('editor', vectorCredential(), controller.signal),
    ).rejects.toThrow('aborted')
    expect(RealDocxPasswordWorker.instances).toHaveLength(0)
  })
  it('terminates a real worker during a maximum-spin request and settles cancellation once', async () => {
    const controller = new AbortController()
    const result = verifyDocxModificationPassword(
      'editor',
      { ...vectorCredential(), spinCount: 1_000_000 },
      controller.signal,
    )
    const worker = RealDocxPasswordWorker.instances[0]!
    await new Promise<void>((resolve) => worker.native.once('online', resolve))
    controller.abort()
    await expect(result).rejects.toThrow('取消')
    expect(worker.terminated).toBe(true)
  })
  it('enforces its deadline by terminating the real worker and settling the promise', async () => {
    vi.useFakeTimers()
    const result = verifyDocxModificationPassword(
      'editor',
      { ...vectorCredential(), spinCount: 1_000_000 },
      new AbortController().signal,
    )
    const outcome = result.catch((error: Error) => error)
    await vi.advanceTimersByTimeAsync(DOCX_PASSWORD_DEADLINE_MS)
    expect(await outcome).toMatchObject({ message: expect.stringContaining('30 秒') })
    expect(RealDocxPasswordWorker.instances[0]!.terminated).toBe(true)
  })
  it('fails closed on runtime errors and malformed replies, without serializing input into errors', async () => {
    for (const fail of ['error', 'messageerror', 'message'] as const) {
      const result = verifyDocxModificationPassword(
        'private-value',
        vectorCredential(),
        new AbortController().signal,
      )
      const worker = RealDocxPasswordWorker.instances.at(-1)!
      if (fail === 'error') worker.emit('error', {} as ErrorEvent)
      else if (fail === 'messageerror') worker.emit('messageerror', null)
      else worker.emit('message', { data: { matches: 'true' } } as MessageEvent)
      await expect(result).rejects.toThrow(/本地密码/)
      expect(worker.terminated).toBe(true)
    }
  })
})
