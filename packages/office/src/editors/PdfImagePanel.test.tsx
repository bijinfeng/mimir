// @vitest-environment happy-dom
import { ConfigProvider } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfImageSnapshot } from '@mimir/shared'
import { openSelect } from '../shell/antd-test-dom.js'
import { PdfImagePanel } from './PdfImagePanel.js'
import type { PdfAssetAction } from './PdfExternalImageSource.js'

const cleanup: Array<() => void> = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
const snapshot: PdfImageSnapshot = {
  sha256: 'original',
  unsupportedPages: [],
  images: [
    {
      target: {} as never,
      page: 1,
      image_number: 1,
      x: 20,
      y: 30,
      width: 80,
      height: 40,
      layer: 'above_text',
      opacity: 0.6,
      editable: true,
    },
  ],
}
async function click(node: Element) {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
  })
}
function button(host: HTMLElement, name: string) {
  const node = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.getAttribute('aria-label') === name || item.textContent === name,
  )
  if (!node) throw new Error(`Missing ${name}`)
  return node
}
async function choose(host: HTMLElement, name: string, value: string) {
  const option = openSelect(host, name).find((item) => item.textContent === value)
  if (!option) throw new Error(`Missing option ${name}: ${value}`)
  await click(option)
}
async function number(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
}
async function setup(selected: number | null = null, action?: PdfAssetAction) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let version = 0
  let props = { sourceKey: 'source-a', page: 1, selected, contextVersion: 0, snapshot, busy: false }
  const calls = vi.fn<PdfAssetAction>(action ?? (async () => ({ ok: true, changed: true })))
  const close = vi.fn<() => void>()
  const render = () =>
    root.render(
      <ConfigProvider componentSize="small">
        <PdfImagePanel
          {...props}
          assetSessionId="asset-a"
          hostAssetReadiness={async () => ({
            image_search: { available: true },
            generate_image: { available: true },
          })}
          hostAssetPreview={async () => new Blob(['png'], { type: 'image/png' })}
          getVersion={() => version}
          onSelect={(value) => {
            props = { ...props, selected: value }
            render()
          }}
          onClose={close}
          onAction={calls}
        />
      </ConfigProvider>,
    )
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-image')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  await act(async () => render())
  const update = async (next: Partial<typeof props>, nextVersion = version) => {
    version = nextVersion
    props = { ...props, ...next }
    await act(async () => render())
  }
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const pick = async (file = new File(['png'], '很长的图片名称.png', { type: 'image/png' })) => {
    const input = button(host, '选择PDF图片文件')
      .closest('.ant-upload')!
      .querySelector('input[type="file"]')!
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  return { host, calls, close, update, pick }
}

describe('PDF image upload Inspector tasks', () => {
  it.each(['source', 'page', 'target', 'version'])(
    'never revives a hidden external material after a %s roundtrip',
    async (change) => {
      const h = await setup(null, async () => ({
        ok: true,
        changed: false,
        data: {
          url: 'mimir-generated://prepared',
          width: 2,
          height: 1,
          mimeType: 'image/png',
          actualRatio: 2,
          requestedRatio: 'auto',
          expiresAt: Date.now() + 1200000,
        },
      }))
      const source = async (name: string) =>
        click(
          [...h.host.querySelectorAll('.ant-segmented-item')].find(
            (item) => item.textContent === name,
          )!,
        )
      await source('生成')
      const prompt = h.host.querySelector<HTMLTextAreaElement>('textarea')!
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
          prompt,
          'test',
        )
        prompt.dispatchEvent(new Event('input', { bubbles: true }))
        prompt.dispatchEvent(new Event('change', { bubbles: true }))
      })
      await click(button(h.host, '生成图片'))
      expect(button(h.host, '插入所选图片').disabled).toBe(false)
      if (change === 'source') {
        await source('上传')
        await source('生成')
      }
      if (change === 'page') {
        await h.update({ page: 2 })
        await h.update({ page: 1 })
      }
      if (change === 'target') {
        await h.update({ selected: 1 })
        await h.update({ selected: null })
      }
      if (change === 'version') await h.update({ contextVersion: 1 }, 1)
      expect(h.host.querySelector('img[alt="生成图片预览"]')).toBeNull()
      expect(button(h.host, '插入所选图片').disabled).toBe(true)
      expect(h.calls).toHaveBeenCalledTimes(1)
    },
  )
  it('prepares a preview without reading or writing; fixed footer applies exactly once at the bound version', async () => {
    const h = await setup()
    const reads: FileReader[] = []
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      reads.push(this)
    })
    await h.pick()
    expect(h.calls).not.toHaveBeenCalled()
    expect(reads).toHaveLength(0)
    expect(h.host.querySelector('img[alt="待上传图片预览"]')).not.toBeNull()
    const primary = button(h.host, '插入PDF图片')
    expect(primary.closest('.mimir-pdf-inspector__content')).toBeNull()
    expect(
      primary
        .closest('.mimir-pdf-inspector__footer')
        ?.parentElement?.classList.contains('mimir-pdf-image-panel'),
    ).toBe(true)
    expect(h.host.querySelectorAll('.ant-btn-primary')).toHaveLength(1)
    await click(primary)
    await click(primary)
    expect(reads).toHaveLength(1)
    expect(h.calls).not.toHaveBeenCalled()
    await act(async () => {
      Object.defineProperty(reads[0]!, 'result', { value: 'data:image/png;base64,UE5H' })
      reads[0]!.dispatchEvent(new Event('load'))
      await Promise.resolve()
    })
    expect(h.calls).toHaveBeenCalledTimes(1)
    expect(h.calls.mock.calls[0]!.slice(0, 3)).toEqual([
      'insert_image',
      { page: 1, image: 'UE5H', x: 40, y: 40, width: 100, height: 50, layer: 'below_text' },
      0,
    ])
    expect(button(h.host, '插入PDF图片').disabled).toBe(true)
  })
  it.each([
    [
      '旋转',
      'PDF图片旋转方向',
      '向左 90°',
      '旋转所选PDF图片',
      'rotate_image',
      { direction: 'ccw' },
    ],
    ['翻转', 'PDF图片翻转方向', '垂直翻转', '翻转所选PDF图片', 'flip_image', { axis: 'vertical' }],
  ])(
    'passes the selected %s parameter through one action',
    async (operation, selector, choice, label, tool, args) => {
      const h = await setup(1)
      await choose(h.host, 'PDF图片操作', operation)
      expect(h.host.querySelector('input[aria-label="图片宽度（pt）"]')).toBeNull()
      await choose(h.host, selector, choice)
      await click(button(h.host, label))
      expect(h.calls.mock.calls[0]!.slice(0, 3)).toEqual([
        tool,
        { page: 1, image_number: 1, ...args },
        0,
      ])
    },
  )
  it('keeps actual geometry, layer and opacity values and passes crop/background percentages', async () => {
    const h = await setup(1)
    expect(
      h.host.querySelector<HTMLInputElement>('input[aria-label="图片横坐标（pt）"]')!.value,
    ).toBe('20')
    await number(h.host, '图片宽度（pt）', '120')
    await click(button(h.host, '应用图片位置和尺寸'))
    expect(h.calls.mock.calls.at(-1)![1]).toEqual({
      page: 1,
      image_number: 1,
      x: 20,
      y: 30,
      width: 120,
      height: 40,
      layer: 'above_text',
    })
    await choose(h.host, 'PDF图片操作', '不透明度')
    expect(
      h.host.querySelector<HTMLInputElement>('input[aria-label="设置图片不透明度（%）"]')!.value,
    ).toBe('60')
    await number(h.host, '设置图片不透明度（%）', '25')
    await click(button(h.host, '应用图片不透明度'))
    expect(h.calls.mock.calls.at(-1)![1]).toEqual({ page: 1, image_number: 1, opacity: 0.25 })
    await choose(h.host, 'PDF图片操作', '去除背景')
    await number(h.host, '图片去背景容差', '12')
    await click(button(h.host, '去除图片背景'))
    expect(h.calls.mock.calls.at(-1)![1]).toEqual({ page: 1, image_number: 1, tolerance: 12 })
    await choose(h.host, 'PDF图片操作', '裁切')
    await number(h.host, '图片左裁切（%）', '15')
    await number(h.host, '图片上裁切（%）', '20')
    await click(button(h.host, '裁切所选PDF图片'))
    expect(h.calls.mock.calls.at(-1)![1]).toEqual({
      page: 1,
      image_number: 1,
      left: 0.15,
      top: 0.2,
      right: 0,
      bottom: 0,
    })
    await number(h.host, '图片右裁切（%）', '90')
    expect(button(h.host, '裁切所选PDF图片').disabled).toBe(true)
  })
  it('requires explicit delete confirmation and Escape dismisses the nearest confirmation', async () => {
    const h = await setup(1)
    await choose(h.host, 'PDF图片操作', '删除图片')
    await click(button(h.host, '删除所选PDF图片'))
    expect(h.calls).not.toHaveBeenCalled()
    await act(async () => {
      const confirm = button(document.body, '确认删除图片')
      confirm.focus()
      confirm.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      )
    })
    expect(h.close).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(button(h.host, '删除所选PDF图片'))
    await click(button(h.host, '删除所选PDF图片'))
    await click(button(document.body, '确认删除图片'))
    expect(h.calls.mock.calls.at(-1)!.slice(0, 3)).toEqual([
      'delete_image',
      { page: 1, image_number: 1 },
      0,
    ])
  })
  it.each(['source', 'page', 'target', 'version', 'close'])(
    'aborts a pending file read after %s changes and rejects late completion',
    async (change) => {
      const h = await setup()
      const reads: FileReader[] = []
      vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (
        this: FileReader,
      ) {
        reads.push(this)
      })
      const abort = vi.spyOn(FileReader.prototype, 'abort')
      await h.pick()
      await click(button(h.host, '插入PDF图片'))
      if (change === 'source') await h.update({ sourceKey: 'source-b' })
      if (change === 'page') await h.update({ page: 2 })
      if (change === 'target') await h.update({ selected: 1 })
      if (change === 'version') await h.update({ contextVersion: 1 }, 1)
      if (change === 'close') cleanup.pop()!()
      expect(abort).toHaveBeenCalledTimes(1)
      await act(async () => {
        Object.defineProperty(reads[0]!, 'result', { value: 'data:image/png;base64,UE5H' })
        reads[0]!.dispatchEvent(new Event('load'))
        await Promise.resolve()
      })
      expect(h.calls).not.toHaveBeenCalled()
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-image')
    },
  )
  it('clears a prepared file before closing on Escape and rejects unsupported/oversized files', async () => {
    const h = await setup()
    await h.pick(new File(['gif'], 'bad.gif', { type: 'image/gif' }))
    expect(h.host.textContent).toContain('请选择 PNG 或 JPEG')
    expect(button(h.host, '插入PDF图片').disabled).toBe(true)
    const large = new File(['png'], 'large.png', { type: 'image/png' })
    Object.defineProperty(large, 'size', { value: 9 * 1024 * 1024 })
    await h.pick(large)
    expect(h.host.textContent).toContain('不得超过8MiB')
    await h.pick()
    await act(async () =>
      button(h.host, '选择PDF图片文件').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      ),
    )
    expect(h.host.querySelector('img[alt="待上传图片预览"]')).toBeNull()
    expect(h.calls).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(button(h.host, '选择PDF图片文件'))
  })
  it('rebinds its own successful version and displays the new native geometry without retaining a file draft', async () => {
    let h: Awaited<ReturnType<typeof setup>>
    h = await setup(1, async () => {
      await h.update(
        {
          contextVersion: 1,
          snapshot: { ...snapshot, sha256: 'changed', images: [{ ...snapshot.images[0]!, x: 75 }] },
        },
        1,
      )
      return { ok: true, changed: true }
    })
    await click(button(h.host, '应用图片位置和尺寸'))
    expect(
      h.host.querySelector<HTMLInputElement>('input[aria-label="图片横坐标（pt）"]')!.value,
    ).toBe('75')
    expect(h.host.textContent).toContain('已应用到文档')
    expect(button(h.host, '应用图片位置和尺寸').disabled).toBe(false)
  })
  it('aborts an in-flight native request on target change and ignores its late feedback', async () => {
    let release!: (value: { ok: boolean; changed: boolean }) => void
    const h = await setup(
      1,
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    await click(button(h.host, '应用图片位置和尺寸'))
    const signal = h.calls.mock.calls[0]![3]!
    await h.update({ selected: null })
    expect(signal.aborted).toBe(true)
    await act(async () => {
      release({ ok: true, changed: true })
      await Promise.resolve()
    })
    expect(h.host.textContent).not.toContain('已应用到文档')
    expect(button(h.host, '插入PDF图片').disabled).toBe(true)
  })
  it('replaces only the bound native target after explicit apply and reports file read failure without a write', async () => {
    const h = await setup(1)
    await choose(h.host, 'PDF图片操作', '替换图片')
    const reads: FileReader[] = []
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      reads.push(this)
    })
    await h.pick()
    await click(button(h.host, '替换所选PDF图片'))
    await act(async () => {
      reads[0]!.dispatchEvent(new Event('error'))
      await Promise.resolve()
    })
    expect(h.calls).not.toHaveBeenCalled()
    expect(h.host.textContent).toContain('图片读取失败')
    await click(button(h.host, '替换所选PDF图片'))
    await act(async () => {
      Object.defineProperty(reads[1]!, 'result', { value: 'data:image/png;base64,UE5H' })
      reads[1]!.dispatchEvent(new Event('load'))
      await Promise.resolve()
    })
    expect(h.calls.mock.calls[0]!.slice(0, 3)).toEqual([
      'replace_image',
      { page: 1, image_number: 1, image: 'UE5H' },
      0,
    ])
  })
  it('cancels an active file read with Escape and never publishes its later load event', async () => {
    const h = await setup()
    const reads: FileReader[] = []
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      reads.push(this)
    })
    const abort = vi.spyOn(FileReader.prototype, 'abort')
    await h.pick()
    await click(button(h.host, '插入PDF图片'))
    await act(async () =>
      button(h.host, '插入PDF图片').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      ),
    )
    expect(abort).toHaveBeenCalledTimes(1)
    expect(button(h.host, '插入PDF图片').disabled).toBe(true)
    expect(h.host.querySelector('img[alt="待上传图片预览"]')).toBeNull()
    await act(async () => {
      Object.defineProperty(reads[0]!, 'result', { value: 'data:image/png;base64,UE5H' })
      reads[0]!.dispatchEvent(new Event('load'))
      await Promise.resolve()
    })
    expect(h.calls).not.toHaveBeenCalled()
  })
  it('shows native readonly reason and refuses modifying a readonly target', async () => {
    const h = await setup(1)
    await h.update({
      snapshot: {
        ...snapshot,
        images: [
          {
            ...snapshot.images[0]!,
            editable: false,
            opacity: undefined,
            reason: '未知图片结构，保留原件',
          },
        ],
      },
    })
    expect(h.host.textContent).toContain('未知图片结构，保留原件')
    expect(button(h.host, '应用图片位置和尺寸').disabled).toBe(true)
    await choose(h.host, 'PDF图片操作', '不透明度')
    expect(h.host.textContent).toContain('当前不透明度未读取')
    expect(button(h.host, '应用图片不透明度').disabled).toBe(true)
    expect(h.calls).not.toHaveBeenCalled()
  })
})
