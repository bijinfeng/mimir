import type { DesktopUpdateApi, DesktopUpdatePrepareRequest } from '@mimir/shared/desktop'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnsavedProvider, useUnsaved } from './unsaved'

let host: HTMLDivElement
let root: Root
let guard: ReturnType<typeof useUnsaved>
let prepare: (request: DesktopUpdatePrepareRequest) => void
let cancel: () => void
let bridge: DesktopUpdateApi
const respond = vi.fn<(requestId: string, ready: boolean) => void>()
function Harness() {
  const state = useUnsaved()
  useEffect(() => {
    guard = state
  }, [state])
  return <button>编辑文档</button>
}
function deferred() {
  let resolve!: (value: boolean) => void
  const promise = new Promise<boolean>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
beforeEach(async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  respond.mockClear()
  bridge = {
    getState: async () => ({
      status: 'downloaded',
      currentVersion: '0.1.0',
      version: '0.2.0',
      releaseUrl: '',
      platform: 'win32',
      arch: 'x64',
      capability: 'automatic',
      autoDownload: true,
    }),
    open: () => {},
    setAppearance: () => {},
    onState: () => () => {},
    respondPrepare: respond,
    onPrepare: (listener) => {
      prepare = listener
      return () => {}
    },
    onPrepareCancelled: (listener) => {
      cancel = listener
      return () => {}
    },
  }
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () =>
    root.render(
      <UnsavedProvider desktopUpdate={bridge}>
        <Harness />
      </UnsavedProvider>,
    ),
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})
async function request(requestId = 'request-a') {
  await act(async () => prepare({ requestId, version: '0.2.0' }))
}
function unload() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe('update preparation reuses the document leave guard', () => {
  it('acknowledges a clean editor and blocks new user edits until close or cancellation', async () => {
    expect(unload()).toBe(false)
    await request()
    expect(respond).toHaveBeenCalledExactlyOnceWith('request-a', true)
    const key = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
    document.querySelector('button')!.dispatchEvent(key)
    expect(key.defaultPrevented).toBe(true)
    await act(async () => cancel())
    const after = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
    document.querySelector('button')!.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })
  it('protects ordinary beforeunload and requires a truthful explicit discard for manual documents', async () => {
    await act(async () => {
      guard.setSave(async () => false, 'manual', false, 'office-file')
      guard.setDirty(true)
    })
    expect(unload()).toBe(true)
    await request()
    expect(guard.pending?.reason).toBe('update')
    expect(respond).not.toHaveBeenCalled()
    await act(async () => guard.resolve('save'))
    expect(respond).not.toHaveBeenCalled()
    expect(guard.saveError).toContain('无法代为保存')
    await act(async () => guard.resolve('discard'))
    expect(respond).toHaveBeenCalledExactlyOnceWith('request-a', true)
    expect(unload()).toBe(false)
  })
  it('cancel preserves contents and tells main to cancel only its active intent', async () => {
    await act(async () => guard.setDirty(true))
    await request()
    await act(async () => guard.resolve('cancel'))
    expect(respond).toHaveBeenCalledExactlyOnceWith('request-a', false)
    expect(guard.isDirty).toBe(true)
    expect(unload()).toBe(true)
  })
  it('does not discard automatic-save content and only confirms the actual flush', async () => {
    const save = deferred()
    await act(async () => {
      guard.setSave(() => save.promise, 'auto', true, 'note-a')
      guard.setDirty(true)
    })
    await request()
    await act(async () => guard.resolve('discard'))
    expect(respond).not.toHaveBeenCalled()
    await act(async () => guard.resolve('save'))
    expect(guard.saving).toBe(true)
    expect(unload()).toBe(true)
    await act(async () => {
      guard.setDirty(false)
      save.resolve(true)
    })
    expect(respond).toHaveBeenCalledExactlyOnceWith('request-a', true)
  })
  it('does not acknowledge old snapshots, failed writes, or a replaced editor', async () => {
    const first = deferred()
    const second = deferred()
    const save = vi
      .fn<() => Promise<boolean>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    await act(async () => {
      guard.setSave(save, 'manual', true, 'note-a')
      guard.setDirty(true)
    })
    await request()
    await act(async () => guard.resolve('save'))
    await act(async () => {
      guard.setDirty(true)
      first.resolve(true)
    })
    expect(respond).not.toHaveBeenCalled()
    expect(guard.saveError).toContain('又有新改动')
    await act(async () => guard.resolve('save'))
    await act(async () => guard.setSave(async () => true, 'manual', true, 'note-b'))
    expect(respond).toHaveBeenCalledExactlyOnceWith('request-a', false)
    await act(async () => second.resolve(true))
    expect(respond).toHaveBeenCalledTimes(1)
  })
  it('a cancelled native request cannot be completed by a late successful save', async () => {
    const save = deferred()
    await act(async () => {
      guard.setSave(() => save.promise, 'manual', true, 'note-a')
      guard.setDirty(true)
    })
    await request()
    await act(async () => guard.resolve('save'))
    await act(async () => cancel())
    await act(async () => save.resolve(true))
    expect(respond).not.toHaveBeenCalled()
    expect(guard.isDirty).toBe(true)
    expect(unload()).toBe(true)
  })
  it('new background edits still veto beforeunload after an earlier clean acknowledgement', async () => {
    await request()
    await act(async () => guard.setDirty(true))
    expect(unload()).toBe(true)
  })
})
