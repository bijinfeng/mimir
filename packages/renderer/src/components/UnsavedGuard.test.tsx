import { ConfigProvider } from 'antd'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnsavedProvider, useUnsaved } from '../lib/unsaved'
import { MimirProvider } from '../theme/MimirProvider'
import { UnsavedGuard } from './UnsavedGuard'

let host: HTMLDivElement
let root: Root
let guard: ReturnType<typeof useUnsaved>
const leave = vi.fn<() => void>()
function Harness({ capture = false }: { capture?: boolean }) {
  const value = useUnsaved()
  useEffect(() => {
    guard = value
  }, [value])
  return (
    <>
      <button onClick={() => value.runGuarded(leave)}>返回知识库</button>
      <UnsavedGuard
        documentTitle="阅读与研究"
        captureContext={
          capture
            ? {
                description: '先处理当前改动',
                resultHint: '导入结果保留',
                documentTitle: '阅读与研究',
              }
            : undefined
        }
      />
    </>
  )
}
beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.clearAllMocks()
})
async function render(capture = false) {
  await act(async () =>
    root.render(
      <MimirProvider>
        <ConfigProvider theme={{ token: { motion: false } }}>
          <UnsavedProvider>
            <Harness capture={capture} />
          </UnsavedProvider>
        </ConfigProvider>
      </MimirProvider>,
    ),
  )
}
function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent?.replace(/\s/g, '') === label,
  )
}
async function click(label: string) {
  await act(async () => button(label)!.click())
}
async function arm(
  save: () => Promise<boolean>,
  mode: 'auto' | 'manual' = 'manual',
  canSave = true,
) {
  await act(async () => {
    guard.setSave(save, mode, canSave, 'doc-a')
    guard.setDirty(true)
  })
  button('返回知识库')!.focus()
  await click('返回知识库')
}
function deferred() {
  let resolve!: (ok: boolean) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<boolean>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
describe('document leave guard', () => {
  it('navigates clean documents directly; Office offers only truthful continue and discard', async () => {
    await render()
    await click('返回知识库')
    expect(leave).toHaveBeenCalledOnce()
    leave.mockClear()
    const unsupported = vi.fn<() => Promise<boolean>>(async () => false)
    await arm(unsupported, 'manual', false)
    expect(document.body.textContent).toContain('阅读与研究')
    expect(document.body.textContent).toContain(
      '当前编辑器无法代为保存，请继续编辑并在工具栏中保存。',
    )
    expect(button('保存并离开')).toBeUndefined()
    expect(button('丢弃改动')).toBeDefined()
    await act(async () => guard.resolve('save'))
    expect(unsupported).not.toHaveBeenCalled()
    expect(leave).not.toHaveBeenCalled()
    expect(guard.isDirty).toBe(true)
    await click('丢弃改动')
    expect(guard.isDirty).toBe(false)
    expect(leave).toHaveBeenCalledOnce()
  })
  it('retains capture results when Office cannot save without adding a discard handoff', async () => {
    await render(true)
    await arm(async () => false, 'manual', false)
    expect(button('保存并离开')).toBeUndefined()
    expect(button('丢弃改动')).toBeUndefined()
    expect(document.body.textContent).toContain('导入结果保留')
    await click('继续编辑')
    expect(guard.pending).toBeNull()
    expect(guard.isDirty).toBe(true)
    expect(leave).not.toHaveBeenCalled()
  })
  it('focuses continue first, excludes IME Escape/Enter and restores invoking focus', async () => {
    await render()
    await arm(async () => true)
    await vi.waitFor(() => expect(document.activeElement).toBe(button('继续编辑')))
    await act(async () => {
      button('继续编辑')!.dispatchEvent(new Event('compositionstart', { bubbles: true }))
      const enter = new KeyboardEvent('keydown', {
        key: 'Enter',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      })
      button('继续编辑')!.dispatchEvent(enter)
      expect(enter.defaultPrevented).toBe(true)
      button('继续编辑')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }),
      )
    })
    expect(guard.pending).not.toBeNull()
    await act(async () =>
      button('继续编辑')!.dispatchEvent(new Event('compositionend', { bubbles: true })),
    )
    await click('继续编辑')
    expect(guard.isDirty).toBe(true)
    expect(guard.pending).toBeNull()
    await act(async () => {
      await vi.waitFor(() => expect(document.activeElement).toBe(button('返回知识库')))
    })
  })
  it('locks duplicate save, dismissals and replacement destinations until save completes', async () => {
    const request = deferred(),
      save = vi.fn<() => Promise<boolean>>(() => request.promise),
      otherLeave = vi.fn<() => void>()
    await render()
    await arm(save)
    await click('保存并离开')
    expect(button('保存中…')!.disabled).toBe(true)
    expect(button('继续编辑')!.disabled).toBe(true)
    expect(button('丢弃改动')!.disabled).toBe(true)
    expect(document.body.textContent).toContain('正在保存当前改动…')
    await act(async () => {
      guard.resolve('save')
      guard.resolve('cancel')
      guard.resolve('discard')
      guard.runGuarded(otherLeave)
    })
    expect(save).toHaveBeenCalledOnce()
    expect(guard.pending).not.toBeNull()
    await act(async () => request.resolve(true))
    expect(guard.pending).toBeNull()
    expect(guard.isDirty).toBe(false)
    expect(leave).toHaveBeenCalledOnce()
    expect(otherLeave).not.toHaveBeenCalled()
  })
  it('retains document on false and rejected save and retries the same action', async () => {
    const first = deferred(),
      second = deferred()
    const save = vi
      .fn<() => Promise<boolean>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockResolvedValueOnce(true)
    await render()
    await arm(save)
    await click('保存并离开')
    await act(async () => first.resolve(false))
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('保存未完成')
    expect(guard.isDirty).toBe(true)
    await click('保存并离开')
    await act(async () => second.reject(new Error('磁盘不可写')))
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('磁盘不可写')
    expect(leave).not.toHaveBeenCalled()
    expect(guard.isDirty).toBe(true)
    await click('保存并离开')
    expect(save).toHaveBeenCalledTimes(3)
    expect(leave).toHaveBeenCalledOnce()
  })
  it('does not clear newer edits when an older save reports success', async () => {
    const request = deferred()
    const save = vi
      .fn<() => Promise<boolean>>()
      .mockReturnValueOnce(request.promise)
      .mockResolvedValueOnce(true)
    await render()
    await arm(save)
    await click('保存并离开')
    await act(async () => guard.setDirty(true))
    await act(async () => request.resolve(true))
    expect(guard.isDirty).toBe(true)
    expect(leave).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('保存期间又有新改动')
    await click('保存并离开')
    expect(leave).toHaveBeenCalledOnce()
  })
  it('accepts auto-save flush draining newer edits, never offers to discard persisted notes', async () => {
    const request = deferred()
    await render()
    await arm(() => request.promise, 'auto')
    expect(button('丢弃改动')).toBeUndefined()
    await act(async () => guard.resolve('discard'))
    expect(guard.pending).not.toBeNull()
    await click('保存并离开')
    await act(async () => {
      guard.setDirty(true)
      guard.setDirty(false)
      request.resolve(true)
    })
    expect(leave).toHaveBeenCalledOnce()
  })
  it('reflects completed auto-save and leaves without another write', async () => {
    const save = vi.fn<() => Promise<boolean>>(async () => true)
    await render()
    await arm(save, 'auto')
    await act(async () => guard.setDirty(false))
    expect(document.body.textContent).toContain('改动已自动保存')
    expect(button('离开')).toBeDefined()
    await click('离开')
    expect(save).not.toHaveBeenCalled()
    expect(leave).toHaveBeenCalledOnce()
  })
  it('invalidates previous editor save; late success cannot navigate or unlock new request', async () => {
    const old = deferred(),
      next = deferred()
    await render()
    await arm(() => old.promise)
    await click('保存并离开')
    await act(async () => {
      guard.setSave(null)
      guard.setDirty(false)
      guard.setSave(() => next.promise, 'manual', true, 'doc-b')
      guard.setDirty(true)
      guard.runGuarded(leave)
    })
    await click('保存并离开')
    await act(async () => old.resolve(true))
    expect(leave).not.toHaveBeenCalled()
    expect(guard.saving).toBe(true)
    expect(guard.isDirty).toBe(true)
    await act(async () => next.resolve(true))
    expect(leave).toHaveBeenCalledOnce()
  })
  it('retains an active save across same-document effect unregister and register in one commit', async () => {
    const request = deferred()
    await render()
    await arm(() => request.promise)
    await click('保存并离开')
    const originalPending = guard.pending
    await act(async () => {
      guard.setSave(null)
      guard.setSave(() => request.promise, 'manual', true, 'doc-a')
    })
    expect(guard.pending).toBe(originalPending)
    expect(guard.saving).toBe(true)
    await act(async () => request.resolve(true))
    expect(leave).toHaveBeenCalledOnce()
  })
})
