/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { PptxDeckStreamError } from '@mimir/shared'
import { PptxEditor } from './PptxEditor.js'
import { openPptxForEdit } from '../pptx.js'
import type { PptxAgentHandle, PptxHostApply } from '../agent/pptx-agent.js'
const here = dirname(fileURLToPath(import.meta.url))
const original = new Uint8Array(
  readFileSync(resolve(here, '../../tests/fixtures/title-layout.pptx')),
)
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
async function settle(done: () => boolean) {
  for (let i = 0; i < 500 && !done(); i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 3))
    })
  expect(done()).toBe(true)
}
function button(host: HTMLElement, label: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!node) throw new Error(label)
  return node
}
function click(node: Element) {
  act(() => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}
async function mount(hostApply: PptxHostApply) {
  let handle: PptxAgentHandle | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host),
    saved: Uint8Array[] = [],
    dirty = vi.fn<(value: boolean) => void>()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const render = (documentId: string) =>
    root.render(
      <PptxEditor
        documentId={documentId}
        hostApply={hostApply}
        onAgentHandleChange={(next) => {
          handle = next
        }}
        onDirtyChange={dirty}
        io={{
          load: async () => original,
          save: async (bytes) => {
            saved.push(bytes)
          },
        }}
      />,
    )
  await act(async () => render('deck-test'))
  await settle(() => !!handle && !!host.querySelector('.mimir-pptx-slide svg'))
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return {
    host,
    handle: () => handle!,
    saved,
    dirty,
    navigate: (id: string) => act(() => render(id)),
  }
}
async function candidates(mode: 'append' | 'replace') {
  const session = await openPptxForEdit(original),
    originalPages = session.slides().length
  const output: Uint8Array[] = []
  for (let i = 0; i < 2; i++) {
    const at = mode === 'replace' && i === 0 ? 0 : session.duplicate(0)
    const el = session.slides()[at]!.elements.find((element) => element.type === 'text')!
    session.setText(at, el.id, [{ runs: [{ text: `完成页面${i + 1}` }] }])
    output.push(await session.save())
  }
  return { output, originalPages }
}
function controlled(
  mode: 'append' | 'replace',
  result: 'stop' | 'failure' | 'truncated' | 'success' | 'late' = 'stop',
) {
  let received!: Parameters<PptxHostApply>[0]
  let release!: () => void
  const host: PptxHostApply = async (request) => {
    received = request
    const { output, originalPages } = await candidates(mode)
    for (let i = 0; i < 2; i++)
      await request.onDeckProgress!(
        {
          generationId: request.generationId!,
          total: result === 'success' ? 2 : 3,
          completed: i + 1,
          stage: 'checkpoint',
          originalPages,
          insertMode: mode,
        },
        {
          bytes: output[i]!,
          sampleData: false,
          data: { pages: i + 1, style: '蓝白', topic: '主题' },
        },
      )
    if (result === 'failure') throw new PptxDeckStreamError('第三页失败', true)
    if (result === 'truncated') throw new PptxDeckStreamError('流未完整结束')
    if (result !== 'success')
      await new Promise<void>((releaseWait, reject) => {
        release = releaseWait
        request.signal!.addEventListener(
          'abort',
          () => (result === 'late' ? releaseWait() : reject(new Error('aborted'))),
          { once: true },
        )
        if (request.signal!.aborted) reject(new Error('aborted'))
      })
    return {
      bytes: output[1]!,
      version: request.expectedVersion + 1,
      changed: true,
      records: [],
      data: { pages: 2, style: '蓝白', topic: '主题' },
    }
  }
  return { host, received: () => received, release: () => release?.() }
}
async function start(app: Awaited<ReturnType<typeof mount>>, signal?: AbortSignal) {
  let value: unknown,
    finished = false
  act(() => {
    void app
      .handle()
      .execute('generate_deck', { topic: '三页主题' }, { roundId: 'round', signal })
      .then((result) => {
        value = result
        finished = true
      })
  })
  return { value: () => value, finished: () => finished }
}

const paths = (zip: JSZip) =>
  Object.keys(zip.files)
    .filter((p) => !zip.files[p]!.dir)
    .toSorted()
async function nativePartEqual(actual: Uint8Array, expected: Uint8Array, path: string) {
  const a = await JSZip.loadAsync(actual),
    b = await JSZip.loadAsync(expected)
  expect(await a.file(path)!.async('uint8array')).toEqual(await b.file(path)!.async('uint8array'))
}
async function nativeEqual(actual: Uint8Array, expected: Uint8Array) {
  const a = await JSZip.loadAsync(actual),
    b = await JSZip.loadAsync(expected)
  expect(paths(a)).toEqual(paths(b))
  for (const path of paths(a))
    expect(await a.file(path)!.async('uint8array')).toEqual(await b.file(path)!.async('uint8array'))
}

describe('PPTX staged generation with real Editor/native publication', () => {
  it.each(['replace', 'append'] as const)(
    'keeps exactly two complete pages only after explicit choice, one history step/save/reopen (%s)',
    async (mode) => {
      const ctl = controlled(mode),
        app = await mount(ctl.host)
      const pending = await start(app)
      await settle(() => app.host.textContent!.includes('已完成 2 / 3'))
      expect(app.handle().getVersion()).toBe(0)
      expect(app.dirty.mock.calls.some(([dirty]) => dirty)).toBe(false)
      expect(button(app.host, '保存到库').disabled).toBe(true)
      expect(app.host.querySelector('[aria-label="已完成第 2 页预览"] svg')).not.toBeNull()
      const style = document.createElement('style')
      style.textContent = ['pptx-tools.css', 'pptx-deck-writing.css']
        .map((p) => readFileSync(resolve(here, p), 'utf8'))
        .join('\n')
      document.head.append(style)
      cleanups.push(() => style.remove())
      const panel = app.host.querySelector<HTMLElement>('.mimir-pptx-deck-writing')!,
        body = panel.querySelector<HTMLElement>('.mimir-pptx-deck-writing__content')!,
        footer = panel.querySelector<HTMLElement>('footer')!
      expect(getComputedStyle(panel).width).toBe('320px')
      expect(getComputedStyle(body).overflow).toBe('auto')
      expect(body.contains(footer)).toBe(false)
      expect(getComputedStyle(footer).flexShrink).toBe('0')
      expect(button(app.host, '停止演示文稿生成').textContent).toBe('停止演示文稿生成')
      click(button(app.host, '停止演示文稿生成'))
      await settle(() => !!app.host.querySelector('[aria-label="保留已完成 2 页"]'))
      expect(app.handle().getVersion()).toBe(0)
      expect(pending.finished()).toBe(false)
      expect(button(app.host, '保留已完成 2 页').textContent).toBe('保留已完成 2 页')
      click(button(app.host, '保留已完成 2 页'))
      await settle(pending.finished)
      expect(pending.value()).toMatchObject({
        ok: true,
        changed: true,
        version: 1,
        data: { keptPartial: true, completed: 2, missing: 1, stopped: true },
      })
      click(button(app.host, '保存到库'))
      await settle(() => app.saved.length === 1 && button(app.host, '保存到库').disabled)
      const saved = app.saved[0]!,
        reopened = await openPptxForEdit(saved)
      expect(reopened.slides()).toHaveLength(mode === 'append' ? 3 : 2)
      expect(JSON.stringify(reopened.slides())).toContain('完成页面2')
      if (mode === 'append') await nativePartEqual(saved, original, 'ppt/slides/slide1.xml')
      click(button(app.host, '撤销'))
      expect(button(app.host, '撤销').disabled).toBe(true)
      click(button(app.host, '保存到库'))
      await settle(() => app.saved.length === 2 && button(app.host, '保存到库').disabled)
      await nativeEqual(app.saved[1]!, original)
      click(button(app.host, '重做'))
      click(button(app.host, '保存到库'))
      await settle(() => app.saved.length === 3 && button(app.host, '保存到库').disabled)
      await nativeEqual(app.saved[2]!, saved)
    },
  )
  it('allows a clean later-page failure to be retained and guards round rollback after manual edits', async () => {
    const app = await mount(controlled('replace', 'failure').host),
      pending = await start(app)
    await settle(() => !!app.host.querySelector('[aria-label="保留已完成 2 页"]'))
    expect(app.host.textContent).toContain('第三页失败')
    click(button(app.host, '保留已完成 2 页'))
    await settle(pending.finished)
    expect(pending.value()).toMatchObject({
      data: { stopped: false, failedPages: 1, notGenerated: 0 },
    })
    const context = app.handle().getContext() as {
      slides: { elements: { id: string; type: string }[] }[]
    }
    const target = context.slides[0]!.elements.find((element) => element.type === 'text')!
    await act(async () => {
      await app.handle().execute(
        'apply_ops',
        {
          ops: [
            {
              op: 'setText',
              target: { slide: 0, el: target.id },
              paragraphs: [{ runs: [{ text: '后续人工作品' }] }],
            },
          ],
        },
        {},
      )
    })
    expect(app.handle().undoRound('round')).toBe(false)
    expect(JSON.stringify(app.handle().getContext())).toContain('后续人工作品')
  })
  it.each(['truncated', 'stop'] as const)('discards without publishing (%s)', async (result) => {
    const ctl = controlled('replace', result),
      app = await mount(ctl.host),
      pending = await start(app)
    if (result === 'stop') {
      await settle(() => app.host.textContent!.includes('已完成 2 / 3'))
      click(button(app.host, '停止演示文稿生成'))
      await settle(() => !!app.host.querySelector('[aria-label="保留已完成 2 页"]'))
      click(button(app.host, '丢弃生成草稿'))
    }
    await settle(pending.finished)
    expect(pending.value()).toMatchObject({ ok: false, changed: false, version: 0 })
    expect(button(app.host, '保存到库').disabled).toBe(true)
    expect(button(app.host, '撤销').disabled).toBe(true)
  })
  it('source cancellation discards pending partial choices; late success after local Stop cannot publish', async () => {
    const ctl = controlled('replace', 'late'),
      app = await mount(ctl.host),
      controller = new AbortController(),
      pending = await start(app, controller.signal)
    await settle(() => app.host.textContent!.includes('已完成 2 / 3'))
    click(button(app.host, '停止演示文稿生成'))
    await settle(() => !!app.host.querySelector('[aria-label="保留已完成 2 页"]'))
    expect(app.handle().getVersion()).toBe(0)
    act(() => controller.abort())
    await settle(pending.finished)
    expect(pending.value()).toMatchObject({ ok: false, version: 0 })
  })
  it('manual changes invalidate a pending completed-page choice and preserve the later text', async () => {
    const app = await mount(controlled('replace', 'failure').host),
      pending = await start(app)
    await settle(() => !!app.host.querySelector('[aria-label="保留已完成 2 页"]'))
    const context = app.handle().getContext() as {
      slides: { elements: { id: string; type: string }[] }[]
    }
    const target = context.slides[0]!.elements.find((el) => el.type === 'text')!
    await act(async () => {
      await app.handle().execute(
        'apply_ops',
        {
          ops: [
            {
              op: 'setText',
              target: { slide: 0, el: target.id },
              paragraphs: [{ runs: [{ text: '保留后续人工文字' }] }],
            },
          ],
        },
        {},
      )
    })
    await settle(pending.finished)
    expect(pending.value()).toMatchObject({ ok: false, changed: false })
    expect(JSON.stringify(app.handle().getContext())).toContain('保留后续人工文字')
    expect(app.host.querySelector('[aria-label="保留已完成 2 页"]')).toBeNull()
  })
  it('zero completed pages and Escape discard produce no history and return focus', async () => {
    const app = await mount(async () => {
      throw new PptxDeckStreamError('首个页面失败', true)
    })
    const pending = await start(app)
    await settle(pending.finished)
    expect(pending.value()).toMatchObject({ ok: false, changed: false, version: 0 })
    expect(app.host.querySelector('.mimir-pptx-deck-writing')).toBeNull()
    expect(button(app.host, '撤销').disabled).toBe(true)
    const second = await mount(controlled('replace').host)
    const entry = button(second.host, '查找和替换')
    entry.focus()
    const stopped = await start(second)
    await settle(() => second.host.textContent!.includes('已完成 2 / 3'))
    const panel = second.host.querySelector<HTMLElement>('.mimir-pptx-deck-writing')!
    act(() =>
      panel.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      ),
    )
    await settle(stopped.finished)
    expect(second.handle().getVersion()).toBe(0)
    expect(document.activeElement).toBe(entry)
  })
  it.each([false, true])(
    'returns to its own canvas when the busy caller has already blurred (moved=%s)',
    async (moveFocus) => {
      const app = await mount(controlled('replace').host)
      const trigger = document.createElement('button')
      const other = document.createElement('button')
      document.body.append(trigger, other)
      cleanups.push(() => {
        trigger.remove()
        other.remove()
      })
      trigger.focus()
      // Browsers blur a disabled focused button before the preview effect runs.
      // happy-dom does not implement that side effect, so reproduce its final state.
      trigger.blur()
      trigger.disabled = true
      expect(document.activeElement).toBe(document.body)
      const canvas = app.host.querySelector<HTMLElement>('[aria-label="幻灯片对象画布"]')!
      const focus = vi.spyOn(canvas, 'focus')
      const pending = await start(app)
      await settle(() => app.host.textContent!.includes('已完成 2 / 3'))
      const discard = button(app.host, '丢弃生成草稿')
      discard.focus()
      act(() => {
        discard.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        )
        if (moveFocus) other.focus()
      })
      await settle(pending.finished)
      expect(document.activeElement).toBe(moveFocus ? other : canvas)
      expect(focus).toHaveBeenCalledTimes(moveFocus ? 0 : 1)
      expect(app.handle().getVersion()).toBe(0)
      expect(button(app.host, '撤销').disabled).toBe(true)
      expect(app.saved).toHaveLength(0)
      expect(app.dirty.mock.calls.some(([dirty]) => dirty)).toBe(false)
    },
  )
  it.each([false, true])(
    'waits for the real caller to release its disabled trigger and respects later focus (moved=%s)',
    async (moveFocus) => {
      const app = await mount(controlled('replace').host)
      const trigger = document.createElement('button')
      const other = document.createElement('button')
      trigger.textContent = '生成文稿'
      other.textContent = '其他操作'
      document.body.append(trigger, other)
      cleanups.push(() => {
        trigger.remove()
        other.remove()
      })
      trigger.focus()
      const focus = vi.spyOn(trigger, 'focus')
      let releaseBusy!: () => void
      const busy = new Promise<void>((resolve) => {
        releaseBusy = resolve
      })
      let executionFinished = false
      let callerFinished = false
      let execution!: Promise<unknown>
      act(() => {
        execution = app
          .handle()
          .execute('generate_deck', { topic: '三页主题' }, { roundId: 'focus' })
          .then((result) => {
            executionFinished = true
            return result
          })
          .finally(async () => {
            await busy
            trigger.disabled = false
            callerFinished = true
          })
      })
      await settle(() => app.host.textContent!.includes('已完成 2 / 3'))
      trigger.disabled = true
      const discard = button(app.host, '丢弃生成草稿')
      discard.focus()
      act(() =>
        discard.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        ),
      )
      await settle(() => executionFinished && !app.host.querySelector('.mimir-pptx-deck-writing'))
      expect(trigger.disabled).toBe(true)
      expect(focus).not.toHaveBeenCalled()
      if (moveFocus) other.focus()
      await act(async () => {
        releaseBusy()
        await execution
      })
      await settle(() => callerFinished && document.activeElement === (moveFocus ? other : trigger))
      expect(focus).toHaveBeenCalledTimes(moveFocus ? 0 : 1)
      expect(app.handle().getVersion()).toBe(0)
      expect(button(app.host, '撤销').disabled).toBe(true)
      expect(app.saved).toHaveLength(0)
      expect(app.dirty.mock.calls.some(([dirty]) => dirty)).toBe(false)
    },
  )
  it('switching source and returning cannot revive a completed draft', async () => {
    const app = await mount(controlled('replace', 'failure').host),
      pending = await start(app)
    await settle(() => !!app.host.querySelector('[aria-label="保留已完成 2 页"]'))
    const oldHandle = app.handle()
    app.navigate('other-document')
    await settle(() => !!app.handle() && app.handle() !== oldHandle)
    await settle(pending.finished)
    expect(pending.value()).toMatchObject({ ok: false, changed: false })
    expect(app.host.querySelector('.mimir-pptx-deck-writing')).toBeNull()
    app.navigate('deck-test')
    await settle(() => app.handle()?.documentId === 'deck-test')
    expect(app.host.querySelector('.mimir-pptx-deck-writing')).toBeNull()
    expect(app.handle().getVersion()).toBe(0)
    expect(app.saved).toHaveLength(0)
  })
  it('normal completion publishes once and its round rollback restores original bytes', async () => {
    const app = await mount(controlled('replace', 'success').host),
      pending = await start(app)
    await settle(pending.finished)
    expect(pending.value()).toMatchObject({ ok: true, changed: true, version: 1 })
    act(() => {
      expect(app.handle().undoRound('round')).toBe(true)
    })
    expect(button(app.host, '保存到库').disabled).toBe(true)
    expect(JSON.stringify(app.handle().getContext())).not.toContain('完成页面')
    expect(app.saved).toHaveLength(0)
  })
})
