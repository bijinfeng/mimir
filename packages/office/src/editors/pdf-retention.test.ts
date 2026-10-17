import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  tasks: [] as Array<{
    destroyed: boolean
    resolve(): void
    reject(reason: Error): void
    page(): void
  }>,
  loading: false,
  pagePending: false,
  pageStarted: false,
}))
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => {
    let resolve!: (value: unknown) => void
    let reject!: (reason: Error) => void
    let page!: (value: unknown) => void
    const viewport = {
      width: 300,
      height: 400,
      rotation: 0,
      convertToPdfPoint: (x: number, y: number) => [x, 400 - y],
    }
    const pageValue = { getViewport: () => viewport }
    const doc = {
      getPage: async () => {
        state.pageStarted = true
        // pdf.js can leave requests on a destroyed transport pending forever.
        if (entry.destroyed) return new Promise(() => {})
        return state.pagePending
          ? new Promise((done) => {
              page = done
            })
          : pageValue
      },
    }
    const entry = {
      destroyed: false,
      resolve: () => resolve(doc),
      reject: (reason: Error) => reject(reason),
      page: () => page(pageValue),
    }
    state.tasks.push(entry)
    return {
      promise: state.loading
        ? new Promise((done, fail) => {
            resolve = done
            reject = fail
          })
        : Promise.resolve(doc),
      destroy: async () => {
        entry.destroyed = true
      },
    }
  },
}))
import {
  awaitPdfTask,
  loadPdfDocument,
  retainPdfDocument,
  retainPdfDocuments,
  retainPdfImageExport,
} from './pdf-render.js'
import { replayPdfPendingText } from '../agent/pdf-batch.js'

afterEach(() => {
  retainPdfDocuments([])
  state.tasks.length = 0
  state.loading = false
  state.pagePending = false
  state.pageStarted = false
})
const insert = {
  id: 'T1',
  pageIndex: 0,
  x: 20,
  y: 20,
  text: 'retained',
  fontSize: 12,
  color: [0, 0, 0] as [number, number, number],
}
const request = (base: Uint8Array, signal?: AbortSignal) => ({
  base,
  inserts: [insert],
  version: 2,
  signal,
  assertCurrent() {
    signal?.throwIfAborted()
  },
  apply: vi.fn<() => Promise<{ bytes: Uint8Array; version: number }>>(async () => ({
    bytes: new Uint8Array([2]),
    version: 3,
  })),
})

describe('PDF request-owned document lifecycle', () => {
  it('releases a cancelled load even before a viewer source set exists', async () => {
    state.loading = true
    const bytes = new Uint8Array([0])
    const release = retainPdfDocument(bytes)
    const run = loadPdfDocument(bytes)
    release()
    expect(state.tasks.at(-1)?.destroyed).toBe(true)
    state.tasks.at(-1)!.resolve()
    await run
    expect(state.tasks.at(-1)?.destroyed).toBe(true)
  })
  it('pins an unpublished replay source until the native call completes, releases on success/error', async () => {
    retainPdfDocuments([])
    const base = new Uint8Array([1])
    const args = request(base)
    args.apply.mockImplementationOnce(async () => {
      expect(state.tasks.at(-1)?.destroyed).toBe(false)
      retainPdfDocuments([new Uint8Array([99])])
      expect(state.tasks.at(-1)?.destroyed).toBe(false)
      return { bytes: new Uint8Array([2]), version: 3 }
    })
    await expect(replayPdfPendingText(args)).resolves.toEqual(new Uint8Array([2]))
    expect(state.tasks.at(-1)?.destroyed).toBe(true)
    const failed = request(base)
    failed.apply.mockRejectedValueOnce(new Error('native failure'))
    await expect(replayPdfPendingText(failed)).rejects.toThrow('native failure')
    expect(state.tasks.at(-1)?.destroyed).toBe(true)
  })
  it('shares leases with image export and the viewer, with idempotent independent release', async () => {
    const base = new Uint8Array([3])
    retainPdfDocuments([base])
    const first = retainPdfDocument(base),
      second = retainPdfImageExport(base)
    const doc = await loadPdfDocument(base)
    retainPdfDocuments([])
    first()
    first()
    expect(await loadPdfDocument(base)).toBe(doc)
    expect(state.tasks.at(-1)?.destroyed).toBe(false)
    second()
    expect(state.tasks.at(-1)?.destroyed).toBe(true)
  })
  it.each(['load', 'page'] as const)(
    'cancels a pending %s await and never calls native insertion on a late result',
    async (phase) => {
      retainPdfDocuments([])
      state.loading = phase === 'load'
      state.pagePending = phase === 'page'
      const controller = new AbortController()
      const args = request(new Uint8Array([4]), controller.signal)
      const run = replayPdfPendingText(args)
      for (let turn = 0; !state.pageStarted && turn < 20; turn++) await Promise.resolve()
      expect(state.pageStarted).toBe(phase === 'page')
      controller.abort(new Error('cancel request'))
      await expect(run).rejects.toThrow('cancel request')
      const entry = state.tasks.at(-1)!
      expect(entry.destroyed).toBe(true)
      if (phase === 'load') entry.resolve()
      else entry.page()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      expect(args.apply).not.toHaveBeenCalled()
      expect(entry.destroyed).toBe(true)
    },
  )
  it('cancels one shared reader without destroying the viewer document', async () => {
    const bytes = new Uint8Array([5])
    retainPdfDocuments([bytes])
    const doc = await loadPdfDocument(bytes)
    const controller = new AbortController()
    const waiting = awaitPdfTask(new Promise(() => {}), controller.signal)
    controller.abort(new Error('cancel shared reader'))
    await expect(waiting).rejects.toThrow('cancel shared reader')
    expect(await loadPdfDocument(bytes)).toBe(doc)
    expect(state.tasks.at(-1)?.destroyed).toBe(false)
  })
  it('does not let a cancelled old load replace a new lease for the same bytes', async () => {
    retainPdfDocuments([])
    state.loading = true
    const bytes = new Uint8Array([6])
    const oldRelease = retainPdfDocument(bytes)
    const oldLoad = loadPdfDocument(bytes)
    const old = state.tasks.at(-1)!
    oldRelease()
    const nextRelease = retainPdfDocument(bytes)
    const nextLoad = loadPdfDocument(bytes)
    const next = state.tasks.at(-1)!
    expect(next).not.toBe(old)
    next.resolve()
    const doc = await nextLoad
    old.resolve()
    await oldLoad
    expect(await loadPdfDocument(bytes)).toBe(doc)
    expect(next.destroyed).toBe(false)
    nextRelease()
    expect(next.destroyed).toBe(true)
  })
  it('consumes late failures even when the signal is already cancelled', async () => {
    const controller = new AbortController()
    controller.abort(new Error('already cancelled'))
    await expect(
      awaitPdfTask(Promise.reject(new Error('late parse failure')), controller.signal),
    ).rejects.toThrow('already cancelled')
  })
  it('destroys a failed loading task and allows a new same-bytes request', async () => {
    retainPdfDocuments([])
    state.loading = true
    const bytes = new Uint8Array([8])
    const release = retainPdfDocument(bytes)
    const failed = loadPdfDocument(bytes)
    const old = state.tasks.at(-1)!
    old.reject(new Error('invalid PDF'))
    await expect(failed).rejects.toThrow('invalid PDF')
    release()
    expect(old.destroyed).toBe(true)
    const nextRelease = retainPdfDocument(bytes)
    const nextLoad = loadPdfDocument(bytes)
    const next = state.tasks.at(-1)!
    expect(next).not.toBe(old)
    next.resolve()
    await nextLoad
    expect(next.destroyed).toBe(false)
    nextRelease()
    expect(next.destroyed).toBe(true)
  })
  it('keeps an in-flight task alive until both request users release it', async () => {
    retainPdfDocuments([])
    state.loading = true
    const bytes = new Uint8Array([9])
    const firstRelease = retainPdfDocument(bytes)
    const secondRelease = retainPdfDocument(bytes)
    const first = loadPdfDocument(bytes)
    const second = loadPdfDocument(bytes)
    const task = state.tasks.at(-1)!
    firstRelease()
    expect(task.destroyed).toBe(false)
    expect(state.tasks).toHaveLength(1)
    task.resolve()
    expect(await first).toBe(await second)
    expect(task.destroyed).toBe(false)
    secondRelease()
    expect(task.destroyed).toBe(true)
  })
  it('does not let a released old load failure delete a newer same-bytes load', async () => {
    retainPdfDocuments([])
    state.loading = true
    const bytes = new Uint8Array([7])
    const oldRelease = retainPdfDocument(bytes)
    const oldLoad = loadPdfDocument(bytes)
    const old = state.tasks.at(-1)!
    oldRelease()
    const nextRelease = retainPdfDocument(bytes)
    const nextLoad = loadPdfDocument(bytes)
    const next = state.tasks.at(-1)!
    old.reject(new Error('late old failure'))
    await expect(oldLoad).rejects.toThrow('late old failure')
    const sharedLoad = loadPdfDocument(bytes)
    expect(state.tasks).toHaveLength(2)
    next.resolve()
    expect(await sharedLoad).toBe(await nextLoad)
    expect(next.destroyed).toBe(false)
    nextRelease()
    expect(next.destroyed).toBe(true)
  })
})
