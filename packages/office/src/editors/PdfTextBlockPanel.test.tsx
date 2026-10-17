// @vitest-environment happy-dom
import { ConfigProvider } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfTextBlockTarget } from '@mimir/shared'
import type { PdfHostBlocks } from '../agent/pdf-content-agent.js'
import { PdfTextBlockPanel } from './PdfTextBlockPanel.js'
import { openSelect } from '../shell/antd-test-dom.js'
import type { PdfTextBlock } from './pdf-text-blocks.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const clean: Array<() => void> = []
afterEach(() => clean.splice(0).forEach((dispose) => dispose()))
const block = (blockIndex = 0): PdfTextBlock => ({
  page: 0,
  blockIndex,
  text: `Original paragraph ${blockIndex}`,
  rect: { x: 0.1, y: 0.2, width: 0.5, height: 0.1 },
  pdfRect: [40, 400, 240, 460],
  items: [{ text: `Original paragraph ${blockIndex}`, bounds: [40, 400, 240, 460] }],
})
function target(selected: PdfTextBlock, hash = 'a'): PdfTextBlockTarget {
  return {
    sha256: hash.repeat(64),
    pageIndex: selected.page,
    blockIndex: selected.blockIndex,
    members: selected.items.map((item, objectIndex) => ({
      ...item,
      objectIndex,
      matrix: [1, 0, 0, 1, 40, 400],
    })),
  }
}
function deferred<T>() {
  let resolve!: (result: T) => void
  const promise = new Promise<T>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}
type ReadResult = Awaited<ReturnType<PdfHostBlocks>>
type ReadGate = ReturnType<typeof deferred<ReadResult>>
const response = (selected: PdfTextBlock, version = 3, hash = 'a'): ReadResult => ({
  version,
  blocks: {
    sha256: hash.repeat(64),
    blocks: [
      {
        page: selected.page + 1,
        blockIndex: selected.blockIndex,
        block_number: selected.blockIndex + 1,
        text: selected.text,
        x: 40,
        y: 140,
        width: 200,
        height: 60,
        editable: true,
        canRewrite: true,
        format: { fontSize: 13.5, leading: 18, align: 'right' },
        target: target(selected, hash),
      },
    ],
  },
  target: target(selected, hash),
})
async function settle(predicate: () => boolean) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
    expect(predicate()).toBe(true)
  })
}
function byLabel<T extends HTMLElement>(host: HTMLElement, name: string): T {
  const node = host.querySelector<T>(`[aria-label="${name}"]`)
  if (!node) throw new Error(`Missing ${name}`)
  return node
}
async function type(host: HTMLElement, label: string, value: string, commit = true) {
  await act(async () => {
    const node = byLabel<HTMLInputElement | HTMLTextAreaElement>(host, label)
    node.focus()
    Object.getOwnPropertyDescriptor(
      node instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value',
    )!.set!.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
  if (commit)
    await act(async () => {
      byLabel(host, label).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
    })
}
async function click(node: HTMLElement) {
  await act(async () => {
    node.click()
  })
}
async function mount(hostBlocks: PdfHostBlocks) {
  const host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  let version = 3
  const getVersion = () => version
  const selected = block(),
    bytes = new Uint8Array([1, 2, 3])
  const onApply = vi.fn<Parameters<typeof PdfTextBlockPanel>[0]['onApply']>(async () => ({
    ok: true,
    changed: true,
  }))
  const props = {
    bytes,
    blocks: [selected, block(1)],
    selected,
    getVersion,
    size: { width: 400, height: 600 },
    host: hostBlocks,
    busy: false,
    ready: true,
    onSelect: vi.fn<(selected: PdfTextBlock) => void>(),
    onApply,
    onClose: vi.fn<() => void>(),
  }
  const render = async (patch: Partial<typeof props> = {}) => {
    Object.assign(props, patch)
    await act(async () =>
      root.render(
        <ConfigProvider componentSize="small">
          <PdfTextBlockPanel {...props} />
        </ConfigProvider>,
      ),
    )
  }
  let live = true
  const unmount = () => {
    if (!live) return
    live = false
    act(() => root.unmount())
    host.remove()
  }
  clean.push(unmount)
  await render()
  return {
    host,
    props,
    render,
    onApply,
    unmount,
    setVersion: (value: number) => {
      version = value
    },
  }
}

const choose = async (host: HTMLElement, label: string) => {
  const option = [...host.querySelectorAll<HTMLElement>('.ant-segmented-item')].find(
    (node) => node.textContent === label,
  )
  if (!option) throw new Error(`Missing mode ${label}`)
  await click(option)
}
describe('verified original PDF paragraph form', () => {
  it('shows native format values and submits a whole rewrite with only changed parameters', async () => {
    const app = await mount(async () => response(block()))
    await choose(app.host, '整段改写')
    expect(byLabel<HTMLTextAreaElement>(app.host, '段落新文字').value).toBe(block().text)
    expect(byLabel<HTMLInputElement>(app.host, '改写字号（pt）').value).toBe('13.5')
    expect(app.host.querySelector('details')?.open).toBe(false)
    expect(app.host.textContent).toContain('右对齐')
    await type(app.host, '段落新文字', 'Changed native paragraph', false)
    await type(app.host, '改写字号（pt）', '16')
    await type(app.host, '文字颜色（留空保留）', '#2468AC', false)
    await click(byLabel(app.host, '应用段落改写'))
    expect(app.onApply.mock.calls[0]!.slice(0, 3)).toEqual([
      'edit_block',
      {
        page: 1,
        target: target(block()),
        new_text: 'Changed native paragraph',
        font_size: 16,
        color: '#2468AC',
      },
      3,
    ])
  })
  it('sends explicit false for the clear-bold and clear-italic options', async () => {
    const app = await mount(async () => response(block()))
    await choose(app.host, '整段改写')
    await act(async () => {
      app.host.querySelector('details')!.open = true
    })
    await click(openSelect(app.host, '改写粗体').find((node) => node.textContent === '取消粗体')!)
    await click(openSelect(app.host, '改写斜体').find((node) => node.textContent === '取消斜体')!)
    await click(byLabel(app.host, '应用段落改写'))
    expect(app.onApply.mock.calls[0]![1]).toEqual({
      page: 1,
      target: target(block()),
      new_text: block().text,
      bold: false,
      italic: false,
    })
  })
  it('locates the chosen repeated match, retains failed drafts, and omits paragraph reflow parameters', async () => {
    const selected = { ...block(), text: 'Alpha repeat middle repeat ending' }
    const app = await mount(async () => response(selected))
    await app.render({ selected, blocks: [selected] })
    await settle(() => app.host.textContent!.includes('原文对象已核验'))
    await choose(app.host, '局部替换')
    await type(app.host, '要替换的原文', 'repeat', false)
    await type(app.host, '替换第几处', '2')
    await type(app.host, '替换为', 'second changed', false)
    expect(app.host.textContent).toContain('共 2 处')
    expect(byLabel(app.host, '替换位置预览').querySelector('mark')?.textContent).toBe('repeat')
    expect(app.host.querySelector('[aria-label="改写段落对齐"]')).toBeNull()
    app.onApply.mockResolvedValueOnce({
      ok: false,
      changed: false,
      error: 'Native readback failed',
    })
    await click(byLabel(app.host, '应用局部替换'))
    expect(app.onApply.mock.calls[0]!.slice(0, 3)).toEqual([
      'edit_text',
      {
        page: 1,
        target: target(selected),
        old_text: 'repeat',
        occurrence: 2,
        new_text: 'second changed',
      },
      3,
    ])
    expect(app.host.textContent).toContain('Native readback failed')
    expect(byLabel<HTMLTextAreaElement>(app.host, '替换为').value).toBe('second changed')
    await click(byLabel(app.host, '应用局部替换'))
    expect(app.onApply).toHaveBeenCalledTimes(2)
  })
  it('makes empty whole deletion explicit, rejects stale versions, and aborts on mode and source changes', async () => {
    const app = await mount(async () => response(block()))
    await choose(app.host, '整段改写')
    await type(app.host, '段落新文字', '', false)
    expect(app.host.textContent).toContain('将移除整段原文对象')
    app.setVersion(4)
    await click(byLabel(app.host, '删除整段'))
    expect(app.onApply).not.toHaveBeenCalled()
    expect(app.host.textContent).toContain('请重新核验段落')
    app.setVersion(3)
    const gate = deferred<{ ok: boolean; changed: boolean }>()
    app.onApply.mockImplementation(() => gate.promise)
    await click(byLabel(app.host, '删除整段'))
    expect(app.onApply.mock.calls[0]![1]).toEqual({
      page: 1,
      target: target(block()),
      new_text: '',
    })
    const signal = app.onApply.mock.calls[0]![3]
    await app.render({ busy: true })
    expect(signal.aborted).toBe(false)
    await choose(app.host, '局部替换')
    expect(signal.aborted).toBe(true)
    await act(async () => gate.resolve({ ok: true, changed: true }))
    await app.render({ busy: false })
    await type(app.host, '要替换的原文', 'paragraph', false)
    const secondGate = deferred<{ ok: boolean; changed: boolean }>()
    app.onApply.mockImplementationOnce(() => secondGate.promise)
    await click(byLabel(app.host, '应用局部替换'))
    const secondSignal = app.onApply.mock.calls[1]![3]
    await app.render({ bytes: new Uint8Array([8]) })
    expect(secondSignal.aborted).toBe(true)
    await act(async () => secondGate.resolve({ ok: true, changed: true }))
  })
  it('keeps movement available with the exact reason when native rewriting is unsupported', async () => {
    const app = await mount(async () => {
      const result = response(block())
      result.blocks.blocks[0]!.canRewrite = false
      result.blocks.blocks[0]!.rewriteReason = '原文含倾斜矩阵，无法重排'
      return result
    })
    expect(app.host.textContent).toContain('原文含倾斜矩阵，无法重排')
    const rewrite = [...app.host.querySelectorAll('.ant-segmented-item')].find(
      (node) => node.textContent === '整段改写',
    )!
    expect(rewrite.querySelector('input')?.disabled).toBe(true)
    expect(app.host.querySelector('[aria-label="段落水平偏移（pt）"]')).not.toBeNull()
  })
  it('aborts a previous selection inspect and ignores its late result after the next selection is verified', async () => {
    const reads: Array<{ input: Parameters<PdfHostBlocks>[0]; gate: ReadGate }> = []
    const app = await mount(async (input) => {
      const gate = deferred<ReadResult>()
      reads.push({ input, gate })
      return gate.promise
    })
    const second = app.props.blocks[1]!
    await app.render({ selected: second })
    expect(reads[0]!.input.signal?.aborted).toBe(true)
    await act(async () => reads[1]!.gate.resolve(response(second, 3, 'b')))
    await settle(() => !!app.host.querySelector('[aria-label="段落水平偏移（pt）"]'))
    await act(async () => reads[0]!.gate.resolve(response(app.props.blocks[0]!)))
    await type(app.host, '段落水平偏移（pt）', '17')
    await click(byLabel(app.host, '应用段落移动'))
    expect(app.onApply).toHaveBeenCalledOnce()
    expect(app.onApply.mock.calls[0]!.slice(0, 3)).toEqual([
      'move_text_block',
      { page: 1, target: target(second, 'b'), dx: 17, dy: 0 },
      3,
    ])
  })
  it('aborts source reads and rejects an inspect arriving at a different live version', async () => {
    const reads: Array<{ signal?: AbortSignal; gate: ReadGate }> = []
    const app = await mount(async ({ signal }) => {
      const gate = deferred<ReadResult>()
      reads.push({ signal, gate })
      return gate.promise
    })
    await app.render({ bytes: new Uint8Array([4, 5, 6]) })
    expect(reads[0]!.signal?.aborted).toBe(true)
    app.setVersion(4)
    await act(async () => {
      reads[0]!.gate.resolve(response(app.props.selected))
      reads[1]!.gate.resolve(response(app.props.selected))
    })
    expect(app.host.querySelector('[aria-label="应用段落移动"]')).toBeNull()
    expect(app.onApply).not.toHaveBeenCalled()
    app.unmount()
    expect(reads[1]!.signal?.aborted).toBe(true)
  })
  it.each(['bytes', 'version', 'target'] as const)(
    'does not expose a move form for an invalid inspect %s',
    async (invalid) => {
      const app = await mount(async () => {
        const result = response(block())
        if (invalid === 'bytes') result.bytes = new Uint8Array([4])
        if (invalid === 'version') result.version++
        if (invalid === 'target') delete result.target
        return result
      })
      await settle(() => app.host.textContent!.includes('原文段落核验结果无效'))
      expect(app.host.querySelector('[aria-label="应用段落移动"]')).toBeNull()
    },
  )
  it('commits the latest numeric draft on the first Apply mousedown and keeps its move alive through busy', async () => {
    const app = await mount(async () => response(block()))
    const gate = deferred<{ ok: boolean; changed: boolean }>()
    app.onApply.mockImplementation(() => gate.promise)
    await type(app.host, '段落水平偏移（pt）', '17')
    await type(app.host, '段落垂直偏移（pt）', '-23', false)
    const apply = byLabel<HTMLButtonElement>(app.host, '应用段落移动')
    await act(async () =>
      apply.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })),
    )
    await click(apply)
    expect(app.onApply.mock.calls[0]!.slice(0, 3)).toEqual([
      'move_text_block',
      { page: 1, target: target(block()), dx: 17, dy: -23 },
      3,
    ])
    const signal = app.onApply.mock.calls[0]![3]
    await app.render({ busy: true })
    expect(signal.aborted).toBe(false)
    expect(apply.disabled).toBe(true)
    expect(byLabel<HTMLInputElement>(app.host, '段落水平偏移（pt）').disabled).toBe(true)
    await act(async () => gate.resolve({ ok: true, changed: true }))
    await app.render({ busy: false })
    expect(signal.aborted).toBe(false)
    expect(apply.disabled).toBe(false)
  })
  it.each(['move', 'rewrite'] as const)(
    'applies a lone %s numeric draft on the first click without requiring another changed field',
    async (mode) => {
      const app = await mount(async () => response(block()))
      if (mode === 'rewrite') {
        await choose(app.host, '整段改写')
        await act(async () => {
          app.host.querySelector('details')!.open = true
        })
      }
      const label = mode === 'move' ? '段落水平偏移（pt）' : '改写字号（pt）'
      const action = mode === 'move' ? '应用段落移动' : '应用段落改写'
      await type(app.host, label, '17', false)
      const apply = byLabel<HTMLButtonElement>(app.host, action)
      expect(apply.disabled).toBe(false)
      await act(async () =>
        apply.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })),
      )
      await click(apply)
      expect(app.onApply).toHaveBeenCalledTimes(1)
      expect(app.onApply.mock.calls[0]![1]).toMatchObject(
        mode === 'move' ? { dx: 17, dy: 0 } : { font_size: 17, new_text: block().text },
      )
    },
  )
  it('retains a rejected draft for retry and aborts an in-flight write on unmount', async () => {
    const app = await mount(async () => response(block()))
    app.onApply.mockResolvedValueOnce({
      ok: false,
      changed: false,
      error: 'Object mapping changed',
    })
    await type(app.host, '段落水平偏移（pt）', '17')
    await click(byLabel(app.host, '应用段落移动'))
    expect(app.host.textContent).toContain('Object mapping changed')
    expect(byLabel<HTMLInputElement>(app.host, '段落水平偏移（pt）').value).toBe('17')
    const gate = deferred<{ ok: boolean; changed: boolean }>()
    app.onApply.mockImplementationOnce(() => gate.promise)
    await click(byLabel(app.host, '应用段落移动'))
    const signal = app.onApply.mock.calls[1]![3]
    app.unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => gate.resolve({ ok: true, changed: true }))
  })
})
