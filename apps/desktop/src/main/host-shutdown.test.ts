import { afterEach, expect, it, vi } from 'vitest'
import { HostShutdown } from './host-shutdown.js'

afterEach(() => vi.useRealTimers())

it('counts connection draining and host closing against one unchanged shutdown budget', async () => {
  vi.useFakeTimers()
  let drained!: () => void
  let closed!: () => void
  const drain = new Promise<void>((resolve) => {
    drained = resolve
  })
  const closing = new Promise<void>((resolve) => {
    closed = resolve
  })
  const closeHost = vi.fn<() => Promise<void>>(() => closing)
  const shutdown = new HostShutdown(closeHost, 100)
  const operation = shutdown.close(() => drain)
  const failure = operation.catch((error: unknown) => error)
  await vi.advanceTimersByTimeAsync(40)
  expect(closeHost).not.toHaveBeenCalled()
  drained()
  await vi.advanceTimersByTimeAsync(59)
  expect(closeHost).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(1)
  await expect(failure).resolves.toMatchObject({ message: '宿主关闭超时' })
  closed()
  await expect(shutdown.close()).rejects.toThrow('宿主关闭超时')
})
