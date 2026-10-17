/**
 * @vitest-environment happy-dom
 *
 * pptx 编辑器的**按钮 → 命令**契约。
 *
 * ## 为什么必须有这一组（而不是只测模型层）
 *
 * 这个仓库最怕的失效是「**点了没反应，也不报错**」。工具条上的每一个按钮都
 * 只是「拼一份 `EditParagraph[]` 交给 `session.setText`」，写错一处（格式项名字
 * 拼错、`srcRun` 漏了、`slideIndex` 传成本页序号）不会抛错——界面上看不出
 * 任何异常，文件里那一项却没写进去。
 *
 * 所以这里**挂真的组件、点真的按钮**，然后去保存出来的字节里读 XML：
 *
 *   - 断言 `b="1"` / `i="1"` / `u="sng"` / `strike="sngStrike"` / `baseline` /
 *     `sz` / `<a:latin typeface>` / `<a:srgbClr val>` 真的落到了那一条 run 上
 *   - 断言**同段兄弟 run 的格式一个都没动**（「加粗标签 + 普通正文」那种段落
 *     被压成一条 run 是这个界面最容易踩的坑，文件头写着实测过程）
 *   - 断言查找到的元素在别的页上时会被带过来（跨页匹配），而替换之后原文没了
 *
 * 用 `dangerouslySetInnerHTML` 注入的 SVG 在 happy-dom 里是真节点，所以点画布
 * 选中元素这一步走的也是**与浏览器里同一条路**（事件代理 + `data-element-id`）。
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { PptxEditor } from './PptxEditor.js'
import { applyPptxManualAnimation } from '../../../../apps/server/src/services/pptx-manual-animation.js'
import { applyPptxManualParagraph } from '../../../../apps/server/src/services/pptx-manual-paragraph.js'
import { pptxInsertShapeOp } from './pptx-shape-presets.js'
import { openPptxForEdit } from '../pptx.js'
import {
  openPptx as openUpstreamPptx,
  savePptx as saveUpstreamPptx,
  addMedia,
  copyElementData,
  pasteElements,
  elementDurableId,
} from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn, type Op } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import {
  getSlideAnimations,
  setSlideAnimations,
} from '../../vendor/packages/pptx-engine/src/animation.js'
import type { PptxAgentHandle, PptxHostApply } from '../agent/pptx-agent.js'
import { pptxAnimationTimingOpSchema } from '@mimir/shared'
import { pptxPlaybackSteps } from './PptxPresentation.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import type { EditorIo, PptxHostAsset } from './types.js'

/**
 * 夹具路径**不能用 `new URL(…, import.meta.url)`**：这个文件跑在 happy-dom 下，
 * 它替换了全局的 `URL`，`readFileSync` 会拒收那个对象（`The URL must be of
 * scheme file`）——`vitest.config.ts` 顶部就写着这条，所以解析类的测试默认不进
 * DOM 环境。这里要 DOM（要挂真组件），于是路径走 `node:url` + `node:path`。
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => resolve(HERE, '../../tests/fixtures', name)

function load(name: string): Uint8Array {
  return new Uint8Array(readFileSync(fixture(name)))
}

const upstreamHostApply: PptxHostApply = async ({ bytes, expectedVersion, ops, action }) => {
  if (action === 'manual_animation')
    return applyPptxManualAnimation({ documentId: 'doc-1', bytes, expectedVersion, ops, action })
  if (action === 'manual_paragraph')
    return applyPptxManualParagraph(
      { documentId: 'doc-1', bytes, expectedVersion, ops, action },
      () => ({ ext: 'png', width: 1, height: 1 }),
    )
  const opened = await openUpstreamPptx(bytes)
  if (action === 'edit_animation') {
    const input = pptxAnimationTimingOpSchema.parse(ops[0])
    const slide = opened.deck.slides[input.target.slide]!
    const items = getSlideAnimations(slide)
    items[input.seq] = {
      ...items[input.seq]!,
      ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
      ...(input.delayMs === undefined ? {} : { delayMs: input.delayMs }),
    }
    setSlideAnimations(slide, items)
    return { bytes: await saveUpstreamPptx(opened), version: expectedVersion + 1, records: [] }
  }
  const transaction = runTxn(opened, { ops: ops as Op[], isolation: 'atomic' })
  if (!transaction.applied) throw new Error(transaction.failures?.[0]?.error ?? 'PPTX 操作失败')
  const savedOutput = await saveUpstreamPptx(opened)
  return {
    bytes: savedOutput,
    records: transaction.records ?? [],
    version: expectedVersion + 1,
  }
}
type HostPicture = NonNullable<Parameters<typeof PptxEditor>[0]['hostPicture']>
/* ── 挂载 / 交互 ─────────────────────────────────────────────── */

const handles = new WeakMap<HTMLElement, PptxAgentHandle>()
const mounted: { unmount: () => void }[] = []

afterEach(() => {
  for (const item of mounted) item.unmount()
  mounted.length = 0
  sessionStorage.removeItem('mimir.pptx.internal-clipboard')
  vi.restoreAllMocks()
})

/** 写回时收到的字节（保存按钮按下去才有内容） */
interface Recorder {
  saved: Uint8Array[]
}

/**
 * 把挂起的工作推进完（直到 `done` 为真或超时）。
 *
 * **不能只 `await Promise.resolve()`**：读原件与解析 pptx 走的是真 promise 链
 * （内部有 `setImmediate` 一类），光弹微任务队列推不动它——实测症状是画布一直
 * 不出现。所以每轮让出一次宏任务。
 */
async function settle(done: () => boolean): Promise<void> {
  for (let i = 0; i < 600 && !done(); i += 1) {
    await act(async () => {
      await new Promise((tick) => setTimeout(tick, 2))
    })
  }
}

/**
 * 挂载编辑器并等到它渲染出 SVG。
 *
 * `useSource` 与 `useParsed` 都是异步的（读字节 → 解析），所以要等两段 promise
 * 各自落地；`settle` 负责这件事。
 */
async function mountEditor(
  bytes: Uint8Array,
  options: {
    record?: Recorder
    hostApply?: PptxHostApply
    hostPicture?: HostPicture
    hostAsset?: PptxHostAsset
  } = {},
): Promise<{ host: HTMLElement; record: Recorder }> {
  const record: Recorder = options.record ?? { saved: [] }
  const io: EditorIo = {
    load: async () => bytes,
    save: async (next) => {
      record.saved.push(next)
    },
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => {
    root.render(
      <PptxEditor
        documentId="doc-1"
        io={io}
        onAgentHandleChange={(value) => {
          if (value) handles.set(host, value)
        }}
        hostApply={options.hostApply}
        hostPicture={options.hostPicture}
        hostAsset={options.hostAsset}
      />,
    )
  })
  await settle(() => host.querySelector('.mimir-pptx-slide svg') !== null)
  expect(host.querySelector('.mimir-pptx-slide svg'), '画布没有渲染出来').not.toBeNull()
  mounted.push({
    unmount: () => {
      act(() => root.unmount())
      host.remove()
    },
  })
  return { host, record }
}

/** 按无障碍名称找工具条 / 次工具条上的按钮 */
function button(host: HTMLElement, label: string): HTMLButtonElement {
  if (label === '对象与幻灯片操作') {
    const objectTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '对象',
    )
    if (objectTab && objectTab.getAttribute('aria-selected') !== 'true') click(objectTab)
  }
  const found = [...host.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === label,
  )
  if (found === undefined) throw new Error(`没有名为「${label}」的按钮`)
  return found as HTMLButtonElement
}

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

function typeInField(host: HTMLElement, label: string, value: string): void {
  const field = [
    ...host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
  ].find((item) => item.getAttribute('aria-label') === label)
  if (!field) throw new Error(`没有名为「${label}」的输入框`)
  act(() => {
    const owner = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(owner.prototype, 'value')?.set
    setter!.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** 点画布上的第 `index` 个元素（走事件代理，与浏览器里同一条路） */
function selectOnCanvas(host: HTMLElement, index = 0): string {
  const nodes = [...host.querySelectorAll('.mimir-pptx-slide [data-element-id]')]
  const node = nodes[index]
  if (node === undefined) throw new Error(`画布上没有第 ${index} 个元素`)
  click(node)
  const id = node.getAttribute('data-element-id')
  if (id === null) throw new Error('元素没有 data-element-id')
  return id
}

async function saveAndRead(host: HTMLElement, record: Recorder, entry: string): Promise<string> {
  const before = record.saved.length
  click(button(host, '保存到库'))
  /*
   * 等**这一次**保存（计数增长）而不是「有字节了」：一个测试里保存两次时，
   * 后者会立刻满足「有字节了」并读到上一次的结果——那样断言看着通过、实际
   * 检查的是旧字节。踩过。
   */
  await settle(() => record.saved.length > before)
  const bytes = record.saved.at(-1)
  if (bytes === undefined || record.saved.length <= before) {
    throw new Error('保存没有写回新的字节:' + host.textContent)
  }
  const zip = await JSZip.loadAsync(bytes)
  const file = zip.file(entry)
  if (!file) throw new Error(`zip 里没有 ${entry}`)
  return file.async('string')
}

function tab(host: HTMLElement, name: string) {
  const node = [...host.querySelectorAll('[role="tab"]')].find((item) => item.textContent === name)
  if (!node) throw new Error(name)
  click(node)
}
function menu(host: HTMLElement, name: string, tabName: string) {
  tab(host, tabName)
  const trigger = button(host, name)
  if (
    !host.querySelector(`[aria-label="${name}面板"]`) &&
    trigger.getAttribute('aria-expanded') !== 'true'
  )
    click(trigger)
}
function number(host: HTMLElement, label: string, value: number) {
  typeInField(host, label, String(value))
  act(() => {
    host
      .querySelector(`[aria-label="${label}"]`)!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}
async function change(host: HTMLElement, action: () => void | Promise<void>) {
  const before = handles.get(host)!.getVersion()
  await action()
  await settle(() => handles.get(host)!.getVersion() > before)
  expect(handles.get(host)!.getVersion()).toBeGreaterThan(before)
}
function pick(host: HTMLElement, label: string, value: string) {
  pickSelectOption(host, label, value)
}
async function savedXml(bytes: Uint8Array, path = 'ppt/slides/slide1.xml') {
  return (await JSZip.loadAsync(bytes)).file(path)!.async('string')
}

function cropKey(host: HTMLElement, key: string, handle?: string, shiftKey = false) {
  const node = host.querySelector(
    handle ? `[data-crop-handle="${handle}"]` : '.mimir-pptx-picture-crop-canvas',
  )!
  act(() => {
    node.dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
    )
  })
}

function startPictureCrop(host: HTMLElement) {
  click(host.querySelector('.mimir-pptx-slide [data-element-kind="picture"]')!)
  menu(host, '图片裁切', '对象')
  click(button(host, '在画布裁切图片'))
  expect(host.querySelector('.mimir-pptx-picture-crop-canvas')).not.toBeNull()
}

function checkPendingCropSelectionLock(host: HTMLElement, request: Parameters<PptxHostApply>[0]) {
  const selection = handles.get(host)!.freezeSelection()
  click(host.querySelector('.mimir-pptx-slide [data-element-kind="text"]')!)
  expect(handles.get(host)!.freezeSelection()).toEqual(selection)
  expect(request.signal?.aborted).toBe(false)
  expect(host.querySelector('.mimir-pptx-picture-crop-canvas')).not.toBeNull()
  click(button(host, '打开对象选择与格式'))
  const rows = [...host.querySelectorAll<HTMLButtonElement>('[role="listbox"] [role="option"]')]
  expect(rows.length).toBeGreaterThan(0)
  expect(rows.every((row) => row.disabled)).toBe(true)
  const other = rows.find((row) => row.getAttribute('aria-selected') === 'false')!
  expect(other).toBeDefined()
  click(other)
  expect(handles.get(host)!.freezeSelection()).toEqual(selection)
  expect(request.signal?.aborted).toBe(false)
}

async function expectSameArchive(actual: Uint8Array, expected: Uint8Array) {
  const [left, right] = await Promise.all([JSZip.loadAsync(actual), JSZip.loadAsync(expected)])
  const paths = Object.keys(left.files).filter((path) => !left.files[path]!.dir)
  expect(paths.toSorted()).toEqual(
    Object.keys(right.files)
      .filter((path) => !right.files[path]!.dir)
      .toSorted(),
  )
  for (const path of paths)
    expect(await left.file(path)!.async('uint8array')).toEqual(
      await right.file(path)!.async('uint8array'),
    )
}

describe('PPTX extended named toolbar tools', () => {
  it('exports current unsaved text as SVG through the Inspector and changes view aids without dirtying the deck', async () => {
    const { host } = await mountEditor(load('title-layout.pptx'), { hostApply: upstreamHostApply })
    tab(host, '视图')
    pick(host, '幻灯片缩放', '150%')
    expect(host.querySelector<HTMLElement>('.mimir-pptx-sheet')?.style.width).toBe('1440px')
    click(button(host, '标尺（英寸）'))
    click(button(host, '网格线（半英寸）'))
    click(button(host, '中心参考线'))
    expect(host.querySelector('[aria-label="水平标尺（英寸）"]')).not.toBeNull()
    expect(host.querySelector('.mimir-pptx-gridlines line')).not.toBeNull()
    expect(host.querySelectorAll('.mimir-pptx-center-guides line')).toHaveLength(2)
    expect(button(host, '保存到库').disabled).toBe(true)
    selectOnCanvas(host)
    typeInField(host, '文本框文字', '未保存的导出内容')
    let captured: Blob | undefined
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      captured = blob as Blob
      return 'blob:output'
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    menu(host, '导出与打印', '视图')
    pick(host, '文件格式', 'SVG 矢量图')
    pick(host, '输出页面', '当前第 1 页')
    click(button(host, '导出文件'))
    await settle(() => !!captured)
    expect(await captured!.text()).toContain('未保存的导出内容')
    expect(await captured!.text()).not.toContain('mimir-pptx-gridlines')
    expect(button(host, '保存到库').disabled).toBe(false)
  })
  it('copies and pastes a native object through the real compact clipboard menu without dirtying a copy', async () => {
    let items: ReturnType<typeof copyElementData>[] = []
    const ref = crypto.randomUUID()
    const hostApply: PptxHostApply = async (request) => {
      if (request.action !== 'manual_asset') return upstreamHostApply(request)
      const input = request.ops[0] as {
        kind: string
        slide: number
        elementIds?: string[]
        targets?: { elementId: string }[]
      }
      const opened = await openUpstreamPptx(request.bytes)
      if (input.kind === 'copy_elements') {
        const slide = opened.deck.slides[input.slide]!
        const refs = input.targets?.map((target) => target.elementId) ?? input.elementIds!
        items = slide.elements
          .filter((item) => refs.includes(elementDurableId(item)!))
          .map((item) => copyElementData(opened, slide, item))
        return {
          bytes: request.bytes,
          records: [],
          version: request.expectedVersion,
          changed: false,
          data: { ref, kind: 'elements', count: items.length },
        }
      }
      const pasted = pasteElements(opened, input.slide, items, { dx: 190500, dy: 190500 })!
      return {
        bytes: await saveUpstreamPptx(opened),
        records: [],
        version: request.expectedVersion + 1,
        changed: true,
        data: { elementIds: pasted.elementIds, slideIndex: input.slide },
      }
    }
    const { host, record } = await mountEditor(load('title-layout.pptx'), { hostApply })
    selectOnCanvas(host)
    const count = host.querySelectorAll('.mimir-pptx-slide [data-element-id]').length
    menu(host, '剪贴板', '开始')
    click(button(host, '复制对象'))
    await settle(
      () =>
        host.querySelector<HTMLButtonElement>('button[aria-label="粘贴对象"]')?.disabled === false,
    )
    expect(handles.get(host)!.getVersion()).toBe(0)
    expect(button(host, '保存到库').disabled).toBe(true)
    expect(button(host, '粘贴对象').textContent).toBe('粘贴对象')
    await change(host, () => click(button(host, '粘贴对象')))
    expect(host.querySelectorAll('.mimir-pptx-slide [data-element-id]')).toHaveLength(count + 1)
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    menu(host, '剪贴板', '开始')
    await change(host, () => click(button(host, '粘贴对象')))
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect((await openPptxForEdit(record.saved.at(-1)!)).slides()[0]!.elements).toHaveLength(
      count + 2,
    )
  })
  it('inserts an audio file through the Inspector, shows a media badge and real player, and preserves native audio across saves', async () => {
    const filename = '讲解.wav'
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:audio-test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const hostAsset: PptxHostAsset = async (request) => {
      const opened = await openUpstreamPptx(request.bytes)
      const input = request.input
      if (input.kind !== 'media') throw new Error('Unexpected upload')
      const added = addMedia(opened, input.slide, {
        kind: input.mediaKind,
        bytes: new Uint8Array(await request.assetFile.arrayBuffer()),
        ext: 'wav',
        offset: { x: 1000000, y: 1000000, cx: 2000000, cy: 1000000 },
        name: filename,
      })!
      const created = added.slide.elements.find((item) => item.id === added.elementId)!
      return {
        bytes: await saveUpstreamPptx(opened),
        version: request.expectedVersion + 1,
        data: { elementId: elementDurableId(created), slideIndex: input.slide },
      }
    }
    const { host, record } = await mountEditor(load('title-layout.pptx'), {
      hostApply: upstreamHostApply,
      hostAsset,
    })
    menu(host, '音视频', '插入')
    pick(host, '媒体类型', '音频')
    const bytes = load('pptx-media/tone.wav')
    const file = new File([bytes.slice().buffer], filename, { type: 'audio/wav' })
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
    await act(async () => {
      Object.defineProperty(input, 'files', { configurable: true, value: [file] })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(button(host, '插入音视频').disabled).toBe(false)
    expect(button(host, '插入音视频').textContent).toBe('插入音视频')
    await change(host, () => click(button(host, '插入音视频')))
    expect(host.querySelector('.mimir-pptx-slide [aria-label="音频"]')).not.toBeNull()
    const player = host.querySelector<HTMLAudioElement>('[aria-label="媒体播放面板"] audio')
    expect(player?.getAttribute('src')).toMatch(/^data:audio\/wav;base64,/)
    const materialStatuses = () =>
      Array.from(host.querySelectorAll('[role="status"]')).filter((node) =>
        node.textContent?.includes('已插入音频'),
      )
    expect(materialStatuses()).toHaveLength(1)
    const first = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(first).toContain('a:audioFile')
    expect(materialStatuses()).toHaveLength(1)
    expect(
      Array.from(host.querySelectorAll('[role="status"]')).some((node) =>
        node.textContent?.includes('正在保存'),
      ),
    ).toBe(false)
    expect(host.querySelector('[aria-label="媒体播放面板"]')?.textContent).not.toContain('尚未保存')
    expect(host.querySelector('.mimir-editor__status')?.textContent).not.toContain('未保存')
    const reopened = await mountEditor(record.saved.at(-1)!, {
      hostApply: upstreamHostApply,
      hostAsset,
    })
    expect(reopened.host.querySelector('.mimir-pptx-slide [aria-label="音频"]')).not.toBeNull()
    tab(reopened.host, '插入')
    await change(reopened.host, () => click(button(reopened.host, '插入矩形')))
    expect(await saveAndRead(reopened.host, reopened.record, 'ppt/slides/slide1.xml')).toContain(
      'a:audioFile',
    )
  })
  it.each(['video', 'audio'] as const)(
    'edits only the native %s poster through the actual canvas, cancels cleanly and saves one history step with exact AV/relationship undo and redo',
    async (kind) => {
      const opened = await openUpstreamPptx(load('title-layout.pptx')),
        imageZip = await JSZip.loadAsync(load('image-deck.pptx')),
        poster = await imageZip.file('ppt/media/image1.png')!.async('uint8array')
      addMedia(opened, 0, {
        kind,
        ext: kind === 'video' ? 'mov' : 'm4a',
        bytes: load(`pptx-media/${kind === 'video' ? 'landscape.mov' : 'tone.m4a'}`),
        poster: { bytes: poster, ext: 'png' },
        offset: { x: 1000000, y: 1000000, cx: 4000000, cy: 2250000 },
      })
      const baseline = await saveUpstreamPptx(opened),
        hostApply = vi.fn<PptxHostApply>(upstreamHostApply),
        { host, record } = await mountEditor(baseline, { hostApply })
      startPictureCrop(host)
      cropKey(host, 'ArrowRight', 'w', true)
      expect(button(host, '应用拖动裁切').disabled).toBe(true)
      cropKey(host, 'Escape')
      expect(handles.get(host)!.getVersion()).toBe(0)
      expect(hostApply).not.toHaveBeenCalled()
      startPictureCrop(host)
      act(() =>
        host
          .querySelector('.mimir-pptx-picture-crop-canvas image')!
          .dispatchEvent(new Event('load')),
      )
      cropKey(host, 'ArrowRight', 'w', true)
      await change(host, () => click(button(host, '应用拖动裁切')))
      expect(handles.get(host)!.getVersion()).toBe(1)
      expect(hostApply).toHaveBeenCalledOnce()
      expect(hostApply.mock.calls[0]![0].ops).toHaveLength(1)
      await saveAndRead(host, record, 'ppt/slides/slide1.xml')
      const cropped = record.saved.at(-1)!,
        [beforeZip, afterZip] = await Promise.all([
          JSZip.loadAsync(baseline),
          JSZip.loadAsync(cropped),
        ])
      for (const entryPath of Object.keys(beforeZip.files).filter(
        (name) => !beforeZip.files[name]!.dir && name !== 'ppt/slides/slide1.xml',
      ))
        expect(await afterZip.file(entryPath)!.async('uint8array')).toEqual(
          await beforeZip.file(entryPath)!.async('uint8array'),
        )
      const beforePicture = (await openPptxForEdit(baseline))
          .slides()[0]!
          .elements.find((e) => e.type === 'picture')!,
        afterPicture = (await openPptxForEdit(cropped))
          .slides()[0]!
          .elements.find((e) => e.type === 'picture')!
      if (beforePicture.type !== 'picture' || afterPicture.type !== 'picture')
        throw new Error('media missing')
      expect(afterPicture.media).toEqual(beforePicture.media)
      expect(afterPicture.srcRect!.l).toBeGreaterThan(0)
      await settle(() => button(host, '保存到库').disabled)
      await change(host, () => click(button(host, '撤销')))
      await saveAndRead(host, record, 'ppt/slides/slide1.xml')
      await expectSameArchive(record.saved.at(-1)!, baseline)
      await settle(() => button(host, '保存到库').disabled)
      await change(host, () => click(button(host, '重做')))
      await saveAndRead(host, record, 'ppt/slides/slide1.xml')
      await expectSameArchive(record.saved.at(-1)!, cropped)
    },
  )
  it('undo and redo include manual and hosted changes after saving and via keyboard', async () => {
    const { host, record } = await mountEditor(load('title-layout.pptx'), {
      hostApply: upstreamHostApply,
    })
    expect(button(host, '撤销').disabled).toBe(true)
    tab(host, '插入')
    await change(host, () => click(button(host, '插入矩形')))
    const count = host.querySelectorAll('.mimir-pptx-slide [data-element-id]').length
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    click(button(host, '撤销'))
    expect(host.querySelectorAll('.mimir-pptx-slide [data-element-id]')).toHaveLength(count - 1)
    expect(button(host, '重做').disabled).toBe(false)
    click(button(host, '重做'))
    expect(host.querySelectorAll('.mimir-pptx-slide [data-element-id]')).toHaveLength(count)
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    button(host, '撤销').focus()
    act(() => {
      button(host, '撤销').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }),
      )
    })
    expect(host.querySelectorAll('.mimir-pptx-slide [data-element-id]')).toHaveLength(count - 1)
    act(() => {
      button(host, '重做').dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'z',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      )
    })
    expect(host.querySelectorAll('.mimir-pptx-slide [data-element-id]')).toHaveLength(count)
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect((await openPptxForEdit(record.saved.at(-1)!)).slides()[0]!.elements).toHaveLength(count)
  })
  it('keeps WordArt outline visible on canvas and saves native dynamic fields twice', async () => {
    const { host, record } = await mountEditor(load('title-layout.pptx'), {
      hostApply: upstreamHostApply,
    })
    menu(host, '艺术字', '插入')
    typeInField(host, '艺术字文字', '季度成果')
    pick(host, '艺术字样式', '白字橙边')
    await change(host, () => click(button(host, '插入艺术字')))
    expect(host.querySelector('.mimir-pptx-slide text[stroke="#ED7D31"]')).not.toBeNull()
    const first = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(first).toContain('季度成果')
    expect(first).toContain('ED7D31')
    const next = await mountEditor(record.saved.at(-1)!, { hostApply: upstreamHostApply })
    menu(next.host, '动态字段', '插入')
    await change(next.host, () => click(button(next.host, '插入动态字段')))
    const second = await saveAndRead(next.host, next.record, 'ppt/slides/slide1.xml')
    expect(second).toContain('type="slidenum"')
    expect(second).toContain('季度成果')
    const reopened = await openPptxForEdit(next.record.saved.at(-1)!)
    expect(
      reopened
        .slides()[0]!
        .elements.some(
          (element) =>
            (element.type === 'text' || element.type === 'shape') &&
            element.text?.paragraphs.some((p) => p.runs.some((run) => run.field === 'slidenum')),
        ),
    ).toBe(true)
  })
  it('inserts an Office equation and editable diagram with previews and two saved readbacks', async () => {
    const bytes = load('title-layout.pptx')
    const { host, record } = await mountEditor(bytes, { hostApply: upstreamHostApply })
    menu(host, '公式', '插入')
    expect(button(host, '插入公式').textContent).toBe('插入公式')
    expect(host.querySelector('[aria-label="公式预览"] math')).not.toBeNull()
    typeInField(host, '公式内容（LaTeX）', '\\frac{a}{b} = 2')
    await change(host, () => click(button(host, '插入公式')))
    const first = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(first).toContain('<m:f>')
    expect(first).toContain('<mc:AlternateContent')
    const next = await mountEditor(record.saved.at(-1)!, { hostApply: upstreamHostApply })
    menu(next.host, '图示', '插入')
    expect(next.host.querySelectorAll('[aria-label="图示预览"] rect').length).toBe(3)
    typeInField(next.host, '节点文字（每行一个）', '调研\n设计\n交付')
    await change(next.host, () => click(button(next.host, '插入图示')))
    expect(next.host.querySelector('.mimir-pptx-slide [data-element-kind="group"]')).not.toBeNull()
    const second = await saveAndRead(next.host, next.record, 'ppt/slides/slide1.xml')
    expect(second).toContain('<m:f>')
    expect(second).toContain('调研')
    expect(second).toContain('交付')
    const reopened = await openPptxForEdit(next.record.saved.at(-1)!)
    expect(reopened.slides()[0]!.elements.some((item) => item.type === 'group')).toBe(true)
    expect(await savedXml(next.record.saved.at(-1)!, 'ppt/theme/theme1.xml')).toBe(
      await savedXml(bytes, 'ppt/theme/theme1.xml'),
    )
  })
  it('edits cubic and quadratic open paths with two saves, without closing the geometry', async () => {
    const { host, record } = await mountEditor(load('title-layout.pptx'), {
      hostApply: upstreamHostApply,
    })
    tab(host, '插入')
    await change(host, () => click(button(host, '插入矩形')))
    selectOnCanvas(host, host.querySelectorAll('.mimir-pptx-slide [data-element-id]').length - 1)
    menu(host, '编辑顶点', '对象')
    await pick(host, '路径编辑方式', '曲线与开放路径')
    await pick(host, '路径闭合', '开放路径')
    click(button(host, '添加路径节点'))
    number(host, '横向（%）', 30)
    await change(host, () => click(button(host, '应用曲线路径')))
    const first = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(first).toContain('<a:cubicBezTo>')
    expect(/<a:path[^>]*>[\s\S]*?<a:close\//.test(first)).toBe(false)
    const next = await mountEditor(record.saved.at(-1)!, { hostApply: upstreamHostApply })
    selectOnCanvas(
      next.host,
      next.host.querySelectorAll('.mimir-pptx-slide [data-element-id]').length - 1,
    )
    menu(next.host, '编辑顶点', '对象')
    expect(button(next.host, '应用曲线路径').disabled).toBe(true)
    await pick(next.host, '新节点类型', '二次曲线（一个控制点）')
    click(button(next.host, '添加路径节点'))
    await change(next.host, () => click(button(next.host, '应用曲线路径')))
    const second = await saveAndRead(next.host, next.record, 'ppt/slides/slide1.xml')
    expect(second).toContain('<a:cubicBezTo>')
    expect(second).toContain('<a:quadBezTo>')
    expect(
      (await openPptxForEdit(next.record.saved.at(-1)!)).slides()[0]!.elements.at(-1)!.anchor
        .originalXml,
    ).toContain('<a:quadBezTo>')
  })
  it('clarification confirms choices and cancels when a different inspector replaces it', async () => {
    const { host } = await mountEditor(load('title-layout.pptx'), { hostApply: upstreamHostApply })
    const handle = handles.get(host)!
    const input = {
      questions: [{ id: 'audience', label: '受众', options: ['管理层', '技术团队'] }],
    }
    let result: unknown
    await act(async () => {
      void handle.execute('ask_clarification', input, {}).then((value) => {
        result = value
      })
    })
    expect(button(host, '确认演示需求').disabled).toBe(true)
    click(button(host, '受众：管理层'))
    await act(async () => click(button(host, '确认演示需求')))
    await settle(() => result !== undefined)
    expect(result).toMatchObject({
      ok: true,
      changed: false,
      data: { answers: [{ id: 'audience', choices: ['管理层'] }] },
    })
    result = undefined
    await act(async () => {
      void handle.execute('ask_clarification', input, {}).then((value) => {
        result = value
      })
    })
    menu(host, '主题', '幻灯片')
    await settle(() => result !== undefined)
    expect(result).toMatchObject({ ok: false, changed: false })
    expect(host.querySelector('[aria-label="演示需求面板"]')).toBeNull()
    expect(host.querySelector('[aria-label="主题面板"]')).not.toBeNull()
    expect(button(host, '保存到库').disabled).toBe(true)
  })
  it('paragraph, text anchor and body props render and survive two saves', async () => {
    const { host, record } = await mountEditor(load('upstream/01_standard_business.pptx'), {
      hostApply: upstreamHostApply,
    })
    selectOnCanvas(host)
    menu(host, '段落与文本框', '开始')
    expect(host.querySelector('.mimir-pptx-inspector h2')?.textContent).toBe('段落与文本框')
    expect(
      [...host.querySelectorAll('.mimir-pptx-inspector .me-property-field__label')].some(
        (item) => item.textContent === '段落对齐',
      ),
    ).toBe(true)
    pick(host, '段落对齐', '右对齐')
    await change(host, () => click(button(host, '应用段落格式')))
    click(button(host, '文本框设置'))
    await change(host, () => pick(host, '文本垂直对齐', '底部'))
    await change(host, () => pick(host, '文本方向', '垂直'))
    const first = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(first).toContain('algn="r"')
    expect(first).toContain('anchor="b"')
    expect(first).toContain('vert="vert"')
    const next = await mountEditor(record.saved.at(-1)!, { hostApply: upstreamHostApply })
    selectOnCanvas(next.host)
    menu(next.host, '段落与文本框', '开始')
    typeInField(next.host, '段后（pt）', '12')
    await change(next.host, () => click(button(next.host, '应用段落格式')))
    const second = await saveAndRead(next.host, next.record, 'ppt/slides/slide1.xml')
    expect(second).toContain('algn="r"')
    expect(second).toContain('<a:spcPts val="1200"')
  })
  it('picture crop, effects, hyperlink and rotation show canvas feedback and persist twice', async () => {
    const { host, record } = await mountEditor(load('image-deck.pptx'), {
      hostApply: upstreamHostApply,
    })
    click(host.querySelector('.mimir-pptx-slide [data-element-kind="picture"]')!)
    menu(host, '图片裁切', '对象')
    number(host, '裁去左侧（%）', 20)
    await change(host, () => click(button(host, '应用图片裁切')))
    expect(host.querySelector('.mimir-pptx-slide image')?.getAttribute('x')).not.toBe('0')
    menu(host, '对象效果', '对象')
    await change(host, () => number(host, '发光半径（pt）', 8))
    await change(host, () => number(host, '柔化边缘（pt）', 3))
    await change(host, () => pick(host, '倒影', '半透明倒影'))
    expect(host.querySelector('.mimir-pptx-slide')!.innerHTML).toContain('reflectionFade')
    // Inline thumbnails and canvas must never resolve effects into another SVG instance.
    const svgIds = [...host.querySelectorAll('svg [id]')].map((node) => node.id)
    expect(new Set(svgIds).size).toBe(svgIds.length)
    const reflectionSvgs = [...host.querySelectorAll('svg')].filter((svg) =>
      svg.querySelector('use[href^="#"]'),
    )
    expect(reflectionSvgs.length).toBeGreaterThanOrEqual(2)
    for (const svg of reflectionSvgs) {
      const ownIds = new Set([...svg.querySelectorAll('[id]')].map((node) => node.id))
      const references = [...svg.querySelectorAll('[href], [filter], [mask], [clip-path], [fill]')]
        .flatMap((node) =>
          ['href', 'filter', 'mask', 'clip-path', 'fill'].map((attribute) => {
            const value = node.getAttribute(attribute) ?? ''
            return attribute === 'href'
              ? /^#(.+)$/.exec(value)?.[1]
              : /^url\(#(.+)\)$/.exec(value)?.[1]
          }),
        )
        .filter((reference): reference is string => Boolean(reference))
      expect(references.every((reference) => ownIds.has(reference))).toBe(true)
    }
    menu(host, '对象链接', '对象')
    typeInField(host, '链接地址', 'https://example.com/pptx')
    await change(host, () => click(button(host, '应用对象链接')))
    expect(host.querySelector('.mimir-pptx-slide [data-pptx-link]')).not.toBeNull()
    const first = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(first).toContain('l="20000"')
    expect(first).toContain('<a:glow rad="101600"')
    const next = await mountEditor(record.saved.at(-1)!, { hostApply: upstreamHostApply })
    click(next.host.querySelector('.mimir-pptx-slide [data-element-kind="picture"]')!)
    menu(next.host, '图片裁切', '对象')
    await change(next.host, () => number(next.host, '旋转角度（°）', 30))
    const second = await saveAndRead(next.host, next.record, 'ppt/slides/slide1.xml')
    expect(second).toContain('rot="1800000"')
    expect(second).toContain('l="20000"')
    expect(await savedXml(next.record.saved.at(-1)!, 'ppt/slides/_rels/slide1.xml.rels')).toContain(
      'https://example.com/pptx',
    )
  })
  it('crop rejects empty visible regions and failed host keeps save clean', async () => {
    const failed = vi.fn<PptxHostApply>().mockRejectedValue(new Error('宿主离线'))
    const { host } = await mountEditor(load('image-deck.pptx'), { hostApply: failed })
    click(host.querySelector('.mimir-pptx-slide [data-element-kind="picture"]')!)
    menu(host, '图片裁切', '对象')
    number(host, '裁去左侧（%）', 70)
    number(host, '裁去右侧（%）', 40)
    expect(button(host, '应用图片裁切').disabled).toBe(true)
    expect(failed).not.toHaveBeenCalled()
    number(host, '裁去右侧（%）', 10)
    click(button(host, '应用图片裁切'))
    await settle(() => host.textContent!.includes('宿主离线'))
    expect(button(host, '保存到库').disabled).toBe(true)
  })
  it('disables canvas crop with an actionable reason when the native picture relationship has no media part', async () => {
    const bytes = load('image-deck.pptx')
    const session = await openPptxForEdit(bytes)
    const picture = session.slides()[0]!.elements.find((element) => element.type === 'picture')!
    if (picture.type !== 'picture') throw new Error('picture fixture missing')
    const zip = await JSZip.loadAsync(bytes)
    expect(zip.file(picture.mediaRef)).not.toBeNull()
    // Keep the real native picture, blip relationship and frame, but remove its payload.
    zip.remove(picture.mediaRef)
    const missing = await zip.generateAsync({ type: 'uint8array' })
    const hostApply = vi.fn<PptxHostApply>(upstreamHostApply)
    const { host } = await mountEditor(missing, { hostApply })
    const version = handles.get(host)!.getVersion()
    click(host.querySelector('.mimir-pptx-slide [data-element-kind="picture"]')!)
    menu(host, '图片裁切', '对象')
    const trigger = button(host, '在画布裁切图片')
    expect(trigger.disabled).toBe(true)
    expect(trigger.title).toBe('图片源未加载，请重新打开文档后重试')
    click(trigger)
    expect(host.querySelector('.mimir-pptx-picture-crop-canvas')).toBeNull()
    expect(host.querySelector<HTMLInputElement>('[aria-label="裁去左侧（%）"]')!.disabled).toBe(
      false,
    )
    expect(handles.get(host)!.getVersion()).toBe(version)
    expect(button(host, '保存到库').disabled).toBe(true)
    expect(button(host, '撤销').disabled).toBe(true)
    expect(hostApply).not.toHaveBeenCalled()
  })
  it('cancels canvas crop cleanly, returns Escape to the actual Ribbon, and saves native crop/frame through undo and redo', async () => {
    const bytes = load('image-deck.pptx')
    const calls: Parameters<PptxHostApply>[0][] = []
    let finish!: () => void
    const gate = new Promise<void>((done) => {
      finish = done
    })
    const { host, record } = await mountEditor(bytes, {
      hostApply: async (request) => {
        calls.push(request)
        await gate
        return upstreamHostApply(request)
      },
    })
    const version = handles.get(host)!.getVersion()
    startPictureCrop(host)
    cropKey(host, 'ArrowRight', 'w', true)
    cropKey(host, 'Escape')
    await settle(() => document.activeElement === button(host, '图片裁切'))
    expect(host.querySelector('.mimir-pptx-picture-crop-canvas')).toBeNull()
    expect(document.activeElement).toBe(button(host, '图片裁切'))
    expect(handles.get(host)!.getVersion()).toBe(version)
    expect(button(host, '保存到库').disabled).toBe(true)
    expect(calls).toHaveLength(0)
    startPictureCrop(host)
    cropKey(host, 'ArrowRight', 'w', true)
    cropKey(host, 'ArrowRight', 'w', true)
    click(button(host, '应用拖动裁切'))
    await settle(() => calls.length === 1)
    // Own busy rerenders must neither unmount the gesture nor abort its write.
    expect(calls[0]!.signal?.aborted).toBe(false)
    expect(host.querySelector('.mimir-pptx-picture-crop-canvas')).not.toBeNull()
    await act(async () => finish())
    await settle(() => handles.get(host)!.getVersion() > version)
    expect(handles.get(host)!.getVersion()).toBe(version + 1)
    expect(host.querySelector('.mimir-pptx-picture-crop-canvas')).toBeNull()
    const croppedXml = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const cropped = record.saved.at(-1)!
    const original = (await openPptxForEdit(bytes))
      .slides()[0]!
      .elements.find((e) => e.type === 'picture')!
    const changed = (await openPptxForEdit(cropped))
      .slides()[0]!
      .elements.find((e) => e.type === 'picture')!
    expect(changed.type).toBe('picture')
    if (changed.type !== 'picture' || original.type !== 'picture')
      throw new Error('picture missing')
    expect(changed.srcRect!.l).toBeGreaterThan(0)
    expect(changed.srcRect).toMatchObject({ t: 0, r: 0, b: 0 })
    expect(croppedXml).toContain('creationId')
    expect(changed.transform.offset.cy).toBe(original.transform.offset.cy)
    expect(changed.transform.offset.cx / (1 - changed.srcRect!.l)).toBeCloseTo(
      original.transform.offset.cx,
      -2,
    )
    expect(changed.transform.offset.x + changed.transform.offset.cx).toBe(
      original.transform.offset.x + original.transform.offset.cx,
    )
    await settle(() => button(host, '保存到库').disabled)
    // Preserve the initial e_<cNvPr> alias after ensureCreationId upgraded the picture.
    menu(host, '图片裁切', '对象')
    expect(host.querySelector<HTMLInputElement>('[aria-label="裁去左侧（%）"]')!.value).not.toBe(
      '0',
    )
    await change(host, () => click(button(host, '撤销')))
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    await expectSameArchive(record.saved.at(-1)!, bytes)
    await settle(() => button(host, '保存到库').disabled)
    await change(host, () => click(button(host, '重做')))
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    await expectSameArchive(record.saved.at(-1)!, cropped)
  })
  it.each(['cancel', 'locked-selection-then-cancel', 'page', 'version'] as const)(
    'cancels pending canvas crop through %s and refuses a late accepted native response',
    async (scenario) => {
      const opened = await openUpstreamPptx(load('image-deck.pptx'))
      expect(
        runTxn(opened, {
          isolation: 'atomic',
          ops: [{ op: 'duplicateSlide', target: { slide: 0 } }],
        }).applied,
      ).toBe(true)
      const bytes = await saveUpstreamPptx(opened)
      const calls: Parameters<PptxHostApply>[0][] = []
      let finish!: () => void
      const gate = new Promise<void>((done) => {
        finish = done
      })
      const { host } = await mountEditor(bytes, {
        hostApply: async (request) => {
          calls.push(request)
          await gate
          return upstreamHostApply(request)
        },
      })
      const version = handles.get(host)!.getVersion()
      startPictureCrop(host)
      cropKey(host, 'ArrowRight', 'w', true)
      click(button(host, '应用拖动裁切'))
      await settle(() => calls.length === 1)
      expect(calls[0]!.signal?.aborted).toBe(false)
      let concurrentResponse: unknown = { ok: true }
      if (scenario === 'cancel') click(button(host, '取消图片拖动裁切'))
      else if (scenario === 'locked-selection-then-cancel') {
        checkPendingCropSelectionLock(host, calls[0]!)
        click(button(host, '取消图片拖动裁切'))
      } else if (scenario === 'page') click(host.querySelector('[aria-label^="第 2 幻灯片"]')!)
      else {
        const title = host.querySelector('.mimir-pptx-slide [data-element-kind="text"]')!
        await act(async () => {
          concurrentResponse = await handles.get(host)!.execute(
            'apply_ops',
            {
              ops: [
                {
                  op: 'setText',
                  target: { slide: 0, el: title.getAttribute('data-element-id') },
                  paragraphs: [{ runs: [{ text: '新的画布版本' }] }],
                },
              ],
            },
            { expectedVersion: version },
          )
        })
      }
      expect(concurrentResponse).toMatchObject({ ok: true })
      expect(calls[0]!.signal?.aborted).toBe(true)
      expect(host.querySelector('.mimir-pptx-picture-crop-canvas')).toBeNull()
      await act(async () => finish())
      await settle(() => !host.querySelector('[aria-busy="true"]'))
      if (scenario === 'version') await settle(() => !button(host, '保存到库').disabled)
      expect(handles.get(host)!.getVersion()).toBe(version + (scenario === 'version' ? 1 : 0))
      expect(host.querySelector('.mimir-pptx-slide')!.innerHTML).not.toContain('clipPath')
      expect(button(host, '保存到库').disabled).toBe(scenario !== 'version')
      expect(button(host, '撤销').disabled).toBe(scenario !== 'version')
      expect(host.textContent!.includes('新的画布版本')).toBe(scenario === 'version')
    },
  )
  it('applies arbitrary picture opacity and both quarter-turn shortcuts without losing native crop', async () => {
    const { host, record } = await mountEditor(load('image-deck.pptx'), {
      hostApply: upstreamHostApply,
    })
    click(host.querySelector('.mimir-pptx-slide [data-element-kind="picture"]')!)
    menu(host, '图片裁切', '对象')
    number(host, '裁去左侧（%）', 17)
    await change(host, () => click(button(host, '应用图片裁切')))
    await change(host, () => number(host, '图片不透明度（%）', 37))
    await change(host, () => click(button(host, '图片向右旋转90度')))
    expect(await saveAndRead(host, record, 'ppt/slides/slide1.xml')).toContain('rot="5400000"')
    await settle(() => button(host, '保存到库').disabled)
    await change(host, () => click(button(host, '图片向左旋转90度')))
    const xml = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(xml).toContain('l="17000"')
    expect(xml).toContain('amt="37000"')
    const picture = (await openPptxForEdit(record.saved.at(-1)!))
      .slides()[0]!
      .elements.find((e) => e.type === 'picture')!
    expect(picture.type === 'picture' && picture.opacity).toBeCloseTo(0.37)
    expect(picture.transform.rot).toBe(0)
  })
  it.each(['selection', 'page', 'close'] as const)(
    'cancels a pending native outline on Inspector %s without dirtying or creating history from late bytes',
    async (scenario) => {
      const opened = await openUpstreamPptx(load('title-layout.pptx'))
      const ops = [
        pptxInsertShapeOp('lineArrowDouble', 0, opened.deck.size.cx, opened.deck.size.cy),
      ]
      expect(runTxn(opened, { isolation: 'atomic', ops }).applied).toBe(true)
      expect(
        runTxn(opened, {
          isolation: 'atomic',
          ops: [{ op: 'duplicateSlide', target: { slide: 0 } }],
        }).applied,
      ).toBe(true)
      const calls: Parameters<PptxHostApply>[0][] = []
      let finish!: () => void
      let returned = false
      const gate = new Promise<void>((done) => {
        finish = done
      })
      const { host } = await mountEditor(await saveUpstreamPptx(opened), {
        hostApply: async (request) => {
          calls.push(request)
          await gate
          const result = await upstreamHostApply(request)
          returned = true
          return result
        },
      })
      selectOnCanvas(host, host.querySelectorAll('.mimir-pptx-slide [data-element-id]').length - 1)
      menu(host, '轮廓', '对象')
      number(host, '轮廓宽度（pt）', 8)
      pick(host, '轮廓线型', '长双点划线')
      const version = handles.get(host)!.getVersion()
      click(button(host, '应用轮廓'))
      await settle(() => calls.length === 1)
      expect(calls[0]!.signal?.aborted).toBe(false)
      if (scenario === 'selection') selectOnCanvas(host)
      else if (scenario === 'page') click(host.querySelector('[aria-label^="第 2 幻灯片"]')!)
      else click(button(host, '关闭幻灯片属性面板'))
      expect(calls[0]!.signal?.aborted).toBe(true)
      await act(async () => finish())
      await settle(() => returned)
      // Allow the accepted host promise to run its before-commit cancellation check.
      await act(async () => {
        await new Promise((done) => setTimeout(done, 10))
      })
      expect(handles.get(host)!.getVersion()).toBe(version)
      expect(button(host, '保存到库').disabled).toBe(true)
      expect(button(host, '撤销').disabled).toBe(true)
      expect(host.textContent).not.toContain('当前轮廓：8pt')
    },
  )
  it('applies native outline width and dash with current values and preserves them when quick-picking another color', async () => {
    const opened = await openUpstreamPptx(load('title-layout.pptx'))
    expect(
      runTxn(opened, {
        isolation: 'atomic',
        ops: [pptxInsertShapeOp('lineArrowDouble', 0, opened.deck.size.cx, opened.deck.size.cy)],
      }).applied,
    ).toBe(true)
    const bytes = await saveUpstreamPptx(opened)
    const { host, record } = await mountEditor(bytes, { hostApply: upstreamHostApply })
    selectOnCanvas(host, host.querySelectorAll('.mimir-pptx-slide [data-element-id]').length - 1)
    menu(host, '轮廓', '对象')
    const panel = host.querySelector('[data-panel="轮廓"]')!
    expect(panel.textContent).toContain('轮廓宽度（pt）')
    expect(panel.textContent).toContain('轮廓线型')
    expect(panel.textContent).toContain('端点样式')
    expect(host.textContent).toContain('当前轮廓：1pt · 实线')
    number(host, '轮廓宽度（pt）', 4.5)
    pick(host, '轮廓线型', '点划线')
    expect(button(host, '保存到库').disabled).toBe(true)
    await change(host, () => click(button(host, '应用轮廓')))
    const first = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const firstBytes = record.saved.at(-1)!
    expect(first).toContain('w="57150"')
    expect(first).toContain('val="dashDot"')
    expect(host.textContent).toContain('当前轮廓：4.5pt · 点划线')
    await settle(() => button(host, '保存到库').disabled)
    await change(host, () => click(button(host, '撤销')))
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    await expectSameArchive(record.saved.at(-1)!, bytes)
    await settle(() => button(host, '保存到库').disabled)
    await change(host, () => click(button(host, '重做')))
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    await expectSameArchive(record.saved.at(-1)!, firstBytes)
    menu(host, '对象与幻灯片操作', '对象')
    click(button(host, '轮廓颜色'))
    await change(host, () => click(button(host, '靛蓝')))
    const next = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(next).toContain('w="57150"')
    expect(next).toContain('val="dashDot"')
    expect(next).toContain('val="4472C4"')
    expect(next).toContain('<a:headEnd type="triangle"')
    expect(next).toContain('<a:tailEnd type="triangle"')
  })
  it('shows readable chart field labels before data is entered without dirtying the deck', async () => {
    const hostApply = vi.fn<PptxHostApply>(upstreamHostApply)
    const { host } = await mountEditor(load('title-layout.pptx'), { hostApply })
    menu(host, '插入图表', '插入')
    const panel = host.querySelector('[data-panel="插入图表"]')!
    // Accessible names alone do not explain bare values to a sighted user.
    expect(panel.textContent).toContain('图表类型')
    expect(panel.textContent).toContain('图表标题（可选）')
    expect(panel.textContent).toContain('数据系列名称')
    expect(panel.textContent).toContain('图表类别（每行一项）')
    expect(panel.textContent).toContain('图表数值（每行一项）')
    expect(button(host, '按输入数据插入图表').disabled).toBe(true)
    expect(button(host, '保存到库').disabled).toBe(true)
    expect(hostApply).not.toHaveBeenCalled()
  })
  it('shape gallery, align/distribute/group/ungroup and connector change live objects and saved XML', async () => {
    const { host, record } = await mountEditor(load('upstream/01_standard_business.pptx'), {
      hostApply: upstreamHostApply,
    })
    menu(host, '形状库', '插入')
    typeInField(host, '搜索形状', '六边形')
    click(button(host, '六边形'))
    await change(host, () => click(button(host, '插入所选形状')))
    menu(host, '对齐与组合', '对象')
    const choose = (count: number) =>
      [...host.querySelectorAll('button[aria-label^="排列选择"]')].forEach((item, index) => {
        // Inserted shapes are selected automatically; choose an exact set.
        if ((item.getAttribute('aria-pressed') === 'true') !== index < count) click(item)
      })
    choose(3)
    await change(host, () => click(button(host, '对齐所选对象')))
    choose(3)
    await change(host, () => click(button(host, '分布所选对象')))
    choose(2)
    await change(host, () => click(button(host, '组合所选对象')))
    expect(host.querySelector('.mimir-pptx-slide [data-element-kind="group"]')).not.toBeNull()
    expect(await saveAndRead(host, record, 'ppt/slides/slide1.xml')).toContain('<p:grpSp>')
    const next = await mountEditor(record.saved.at(-1)!, { hostApply: upstreamHostApply })
    click(next.host.querySelector('.mimir-pptx-slide [data-element-kind="group"]')!)
    menu(next.host, '对齐与组合', '对象')
    await change(next.host, () => click(button(next.host, '取消所选组合')))
    await change(next.host, () => click(button(next.host, '插入对象连接线')))
    const second = await saveAndRead(next.host, next.record, 'ppt/slides/slide1.xml')
    expect(second).toContain('<a:stCxn')
    expect(second).toContain('prst="hexagon"')
  })
  it.each([false, true])(
    'selects an inserted shape for immediate styling with an existing selection=%s',
    async (selectExisting) => {
      const { host, record } = await mountEditor(load('title-layout.pptx'), {
        hostApply: upstreamHostApply,
      })
      if (selectExisting) selectOnCanvas(host)
      menu(host, '形状库', '插入')
      typeInField(host, '搜索形状', '五角星')
      click(button(host, '五角星'))
      await change(host, () => click(button(host, '插入所选形状')))
      expect(host.textContent).toContain('当前形状：五角星')
      expect(host.textContent).toContain('已选：五角星')
      expect(button(host, '五角星').getAttribute('aria-checked')).toBe('true')
      expect(host.querySelector('.mimir-pptx-slide .mimir-pptx-selected')).not.toBeNull()
      tab(host, '组合样式')
      click(button(host, '紫色·虚线描边'))
      expect(button(host, '应用组合样式').disabled).toBe(false)
      await change(host, () => click(button(host, '应用组合样式')))
      const saved = await saveAndRead(host, record, 'ppt/slides/slide1.xml'),
        parsed = (await openPptxForEdit(record.saved.at(-1)!)).slides()[0]!.elements,
        star = parsed.find(
          (item) =>
            (item.type === 'shape' || item.type === 'text') && item.presetGeometry === 'star5',
        )!
      expect(saved).toContain('prst="star5"')
      expect(star.type === 'shape' || star.type === 'text').toBe(true)
      if (star.type !== 'shape' && star.type !== 'text') throw new Error('Expected native star')
      expect(star.fill).toMatchObject({ type: 'solid', color: '#FFFFFF' })
      expect(star.stroke).toMatchObject({ fill: { type: 'solid', color: '#7030A0' }, dash: 'dash' })
    },
  )

  it('preserves both connector ends through the shape-style host byte roundtrip and two saves', async () => {
    const { host, record } = await mountEditor(load('title-layout.pptx'), {
      hostApply: upstreamHostApply,
    })
    menu(host, '形状库', '插入')
    typeInField(host, '搜索形状', '双箭头')
    click(button(host, '双箭头'))
    await change(host, () => click(button(host, '插入所选形状')))
    expect(host.textContent).toContain('当前形状：直线连接线')
    tab(host, '组合样式')
    click(button(host, '紫色·虚线描边'))
    await change(host, () => click(button(host, '应用组合样式')))
    expect(host.textContent).toContain('当前样式：紫色·虚线描边')
    expect(host.textContent).toContain('已选：紫色·虚线描边')
    expect(button(host, '紫色·虚线描边').getAttribute('aria-checked')).toBe('true')
    expect(button(host, '应用组合样式').disabled).toBe(true)
    const first = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(first).toContain('<a:headEnd type="triangle"')
    expect(first).toContain('<a:tailEnd type="triangle"')
    const next = await mountEditor(record.saved.at(-1)!, { hostApply: upstreamHostApply })
    selectOnCanvas(
      next.host,
      next.host.querySelectorAll('.mimir-pptx-slide [data-element-id]').length - 1,
    )
    menu(next.host, '形状库', '插入')
    tab(next.host, '组合样式')
    expect(next.host.textContent).toContain('当前样式：紫色·虚线描边')
    expect(button(next.host, '紫色·虚线描边').getAttribute('aria-checked')).toBe('true')
    click(button(next.host, '蓝色·彩色描边'))
    await change(next.host, () => click(button(next.host, '应用组合样式')))
    expect(next.host.textContent).toContain('当前样式：自定义样式')
    expect(next.host.textContent).toContain('已选：请选择组合样式')
    expect(button(next.host, '蓝色·彩色描边').getAttribute('aria-checked')).toBe('false')
    const second = await saveAndRead(next.host, next.record, 'ppt/slides/slide1.xml')
    expect(second).toContain('<a:headEnd type="triangle"')
    expect(second).toContain('<a:tailEnd type="triangle"')
    const saved = (await openPptxForEdit(next.record.saved.at(-1)!)).slides()[0]!.elements.at(-1)!
    if (saved.type !== 'shape' && saved.type !== 'text') throw new Error('Expected saved connector')
    expect(saved.stroke?.headEnd?.type).toBe('triangle')
    expect(saved.stroke?.tailEnd?.type).toBe('triangle')
    expect(saved.stroke?.fill).toMatchObject({ type: 'solid', color: '#0A50A1' })
  })

  it('shape combinations use one transaction, survive save/undo/redo, and Escape returns to the named trigger', async () => {
    const opened = await openUpstreamPptx(load('title-layout.pptx'))
    runTxn(opened, {
      isolation: 'atomic',
      ops: [pptxInsertShapeOp('hexagon', 0, 9144000, 5143500)],
    })
    const hostApply = vi.fn<PptxHostApply>(upstreamHostApply)
    const { host, record } = await mountEditor(await saveUpstreamPptx(opened), { hostApply })
    selectOnCanvas(host, host.querySelectorAll('.mimir-pptx-slide [data-element-id]').length - 1)
    menu(host, '形状库', '插入')
    const panel = host.querySelector<HTMLElement>('[aria-label="形状库面板"]')!
    expect(document.activeElement).toBe(panel)
    tab(host, '组合样式')
    click(button(host, '紫色·虚线描边'))
    await change(host, () => click(button(host, '应用组合样式')))
    expect(hostApply).toHaveBeenCalledTimes(1)
    expect(hostApply.mock.calls[0]![0].ops.map((op) => (op as Op).op)).toEqual([
      'setFill',
      'setStroke',
    ])
    const styled = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(styled).toContain('<a:prstDash val="dash"')
    expect(styled).toContain('val="7030A0"')
    await settle(() => button(host, '保存到库').disabled)
    click(button(host, '红色·实心填充'))
    expect(button(host, '应用组合样式').disabled).toBe(false)
    await change(host, () => click(button(host, '撤销')))
    expect(host.textContent).toContain('当前样式：自定义样式')
    expect(host.textContent).toContain('已选：请选择组合样式')
    expect(button(host, '应用组合样式').disabled).toBe(true)
    const undone = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(undone).not.toContain('<a:prstDash val="dash"')
    await settle(() => button(host, '保存到库').disabled)
    await change(host, () => click(button(host, '重做')))
    expect(host.textContent).toContain('当前样式：紫色·虚线描边')
    expect(await saveAndRead(host, record, 'ppt/slides/slide1.xml')).toContain(
      '<a:prstDash val="dash"',
    )
    act(() => panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(host.querySelector('[aria-label="形状库面板"]')).toBeNull()
    expect(document.activeElement).toBe(button(host, '形状库'))
  })
  it('failed shape combination preserves the current canvas, clean save state and selected draft', async () => {
    const opened = await openUpstreamPptx(load('title-layout.pptx'))
    runTxn(opened, {
      isolation: 'atomic',
      ops: [pptxInsertShapeOp('hexagon', 0, 9144000, 5143500)],
    })
    const failed = vi.fn<PptxHostApply>().mockRejectedValue(new Error('样式宿主离线'))
    const { host } = await mountEditor(await saveUpstreamPptx(opened), { hostApply: failed })
    selectOnCanvas(host, host.querySelectorAll('.mimir-pptx-slide [data-element-id]').length - 1)
    const before = host.querySelector('.mimir-pptx-slide')!.innerHTML
    menu(host, '形状库', '插入')
    tab(host, '组合样式')
    click(button(host, '蓝色·实心填充'))
    click(button(host, '应用组合样式'))
    await settle(() => host.textContent!.includes('样式宿主离线'))
    expect(host.querySelector('.mimir-pptx-slide')!.innerHTML).toBe(before)
    expect(button(host, '保存到库').disabled).toBe(true)
    expect(button(host, '蓝色·实心填充').getAttribute('aria-checked')).toBe('true')
    expect(host.textContent).toContain('已保留所选草稿')
  })
  it('original layout/theme, deck size and footer have current values and two saved readbacks', async () => {
    const { host, record } = await mountEditor(load('upstream/01_standard_business.pptx'), {
      hostApply: upstreamHostApply,
    })
    menu(host, '尺寸与版式', '幻灯片')
    number(host, '幻灯片宽（pt）', 800)
    await change(host, () => click(button(host, '应用幻灯片尺寸')))
    // Layout can be unchanged visually; wait for hosted round via a spy.
    await change(host, () => click(button(host, '应用当前页版式')))
    menu(host, '主题', '幻灯片')
    typeInField(host, '主题名称', '工具栏测试主题')
    const inspector = host.querySelector<HTMLElement>('[aria-label="主题面板"]')!
    expect(document.activeElement).toBe(inspector)
    expect([...inspector.querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual(
      expect.arrayContaining(['基础颜色', '强调色', '链接色']),
    )
    expect(inspector.querySelectorAll('button[aria-label^="主题"]').length).toBe(12)
    click(button(host, '主题强调1'))
    click(button(host, '#C03060'))
    expect(button(host, '主题强调1').textContent).toContain('#C03060')
    click(button(host, '自定义主题色'))
    typeInField(host, '自定义色值', '#C03061')
    click(button(host, '设置自定义主题色'))
    expect(button(host, '主题强调1').textContent).toContain('#C03061')
    await change(host, () => click(button(host, '应用整份主题')))
    act(() => {
      inspector.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(host.querySelector('[aria-label="主题面板"]')).toBeNull()
    expect(document.activeElement).toBe(button(host, '主题'))
    menu(host, '页脚与页码', '幻灯片')
    typeInField(host, '页脚文字', '季度汇报')
    await pick(host, '显示幻灯片页码', '显示')
    await change(host, () => click(button(host, '应用所有幻灯片页脚')))
    expect(host.querySelector('.mimir-pptx-slide')!.textContent).toContain('季度汇报')
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(await savedXml(record.saved.at(-1)!, 'ppt/presentation.xml')).toContain('cx="10160000"')
    expect(await savedXml(record.saved.at(-1)!, 'ppt/theme/theme1.xml')).toContain('C03061')
    const next = await mountEditor(record.saved.at(-1)!, { hostApply: upstreamHostApply })
    menu(next.host, '页脚与页码', '幻灯片')
    typeInField(next.host, '页脚日期', '2026-10-16')
    await change(next.host, () => click(button(next.host, '应用所有幻灯片页脚')))
    const second = await saveAndRead(next.host, next.record, 'ppt/slides/slide1.xml')
    expect(second).toContain('季度汇报')
    expect(second).toContain('2026-10-16')
  })
  it('section and comments project current archive and survive two saves', async () => {
    const { host, record } = await mountEditor(load('upstream/01_standard_business.pptx'), {
      hostApply: upstreamHostApply,
    })
    menu(host, '分节与批注', '幻灯片')
    typeInField(host, '新分节名称', '第一部分')
    await change(host, () => click(button(host, '从当前页添加分节')))
    typeInField(host, '新批注', '本页待确认')
    await change(host, () => click(button(host, '添加本页批注')))
    await saveAndRead(host, record, 'ppt/presentation.xml')
    const next = await mountEditor(record.saved.at(-1)!, { hostApply: upstreamHostApply })
    menu(next.host, '分节与批注', '幻灯片')
    expect(next.host.textContent).toContain('本页待确认')
    typeInField(next.host, '分节名称', '已确认部分')
    await change(next.host, () => click(button(next.host, '重命名分节')))
    await saveAndRead(next.host, next.record, 'ppt/presentation.xml')
    const deck = await openPptxForEdit(next.record.saved.at(-1)!)
    expect(deck.metadata(0).comments[0]?.text).toBe('本页待确认')
    expect(deck.metadata(0).sections[0]?.name).toBe('已确认部分')
  })
  it('timing edit preserves effect and survives second save', async () => {
    const { host, record } = await mountEditor(load('upstream/01_standard_business.pptx'), {
      hostApply: upstreamHostApply,
    })
    selectOnCanvas(host)
    menu(host, '备注与放映', '幻灯片')
    click(button(host, '为选中对象添加动画'))
    await settle(() => host.textContent!.includes('共 1 个动画'))
    tab(host, '时间线')
    number(host, '动画 1 持续毫秒', 900)
    await settle(() => host.textContent!.includes('900ms'))
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const next = await mountEditor(record.saved.at(-1)!, { hostApply: upstreamHostApply })
    menu(next.host, '备注与放映', '幻灯片')
    tab(next.host, '时间线')
    number(next.host, '动画 1 延迟毫秒', 200)
    await settle(() => next.host.textContent!.includes('延迟 200ms'))
    await saveAndRead(next.host, next.record, 'ppt/slides/slide1.xml')
    expect(
      getSlideAnimations((await openPptxForEdit(next.record.saved.at(-1)!)).slides()[0]!)[0],
    ).toMatchObject({ effect: 'fade', durationMs: 900, delayMs: 200 })
  })
  it('shape adjustment and custom points update geometry over two saves', async () => {
    const { host, record } = await mountEditor(load('upstream/01_standard_business.pptx'), {
      hostApply: upstreamHostApply,
    })
    menu(host, '形状库', '插入')
    typeInField(host, '搜索形状', '椭圆')
    click(button(host, '椭圆'))
    await change(host, () => click(button(host, '插入所选形状')))
    selectOnCanvas(host, host.querySelectorAll('.mimir-pptx-slide [data-element-id]').length - 1)
    menu(host, '形状库', '插入')
    typeInField(host, '搜索形状', '圆角矩形')
    click(button(host, '圆角矩形'))
    await change(host, () => click(button(host, '更改选中形状')))
    await change(host, () => number(host, '形状调节 adj', 25000))
    expect(await saveAndRead(host, record, 'ppt/slides/slide1.xml')).toContain('val 25000')
    const next = await mountEditor(record.saved.at(-1)!, { hostApply: upstreamHostApply })
    selectOnCanvas(
      next.host,
      next.host.querySelectorAll('.mimir-pptx-slide [data-element-id]').length - 1,
    )
    menu(next.host, '编辑顶点', '对象')
    typeInField(next.host, '形状顶点（每行x,y）', '0,100\n50,0\n100,100')
    await change(next.host, () => click(button(next.host, '应用自定义多边形')))
    expect(next.host.querySelector('.mimir-pptx-slide path')).not.toBeNull()
    expect(await saveAndRead(next.host, next.record, 'ppt/slides/slide1.xml')).toContain(
      '<a:custGeom>',
    )
  })
  it('connector endpoint edits detach and persist point geometry across two saves', async () => {
    const { host, record } = await mountEditor(load('upstream/01_standard_business.pptx'), {
      hostApply: upstreamHostApply,
    })
    menu(host, '对齐与组合', '对象')
    await change(host, () => click(button(host, '插入对象连接线')))
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const next = await mountEditor(record.saved.at(-1)!, { hostApply: upstreamHostApply })
    const line = [
      ...next.host.querySelectorAll<SVGGElement>('.mimir-pptx-slide [data-element-id]'),
    ].find((item) => item.querySelector('path[fill="none"]'))!
    click(line)
    menu(next.host, '连接线端点', '对象')
    pick(next.host, '端点1连接对象', '不连接对象')
    pick(next.host, '端点2连接对象', '不连接对象')
    number(next.host, '端点1 横坐标（pt）', 40)
    number(next.host, '端点1 纵坐标（pt）', 50)
    number(next.host, '端点2 横坐标（pt）', 180)
    number(next.host, '端点2 纵坐标（pt）', 200)
    await change(next.host, () => click(button(next.host, '应用连接线端点')))
    const raw = await saveAndRead(next.host, next.record, 'ppt/slides/slide1.xml')
    expect(raw).toContain('<a:off x="508000" y="635000"')
    expect(raw).toContain('<a:ext cx="1778000" cy="1905000"')
    expect(raw).not.toContain('<a:stCxn')
  })
  it('resets placeholder geometry to the current layout and preserves content across undo and two saves', async () => {
    const opened = await openUpstreamPptx(load('title-layout.pptx'))
    expect(
      runTxn(opened, {
        ops: [{ op: 'setSlideLayout', target: { slide: 0 } }] as Op[],
        isolation: 'atomic',
      }).applied,
    ).toBe(true)
    const original = await saveUpstreamPptx(opened)
    const baseline = await openUpstreamPptx(original)
    const placeholder = baseline.deck.slides[0]!.elements.find(
      (el) => el.placeholder && el.type === 'text',
    )!
    expect(placeholder).toBeTruthy()
    const expected = { ...placeholder.transform.offset }
    expect(
      runTxn(baseline, {
        ops: [
          {
            op: 'setTransform',
            target: { slide: 0, el: elementDurableId(placeholder)! },
            box: { ...expected, x: expected.x + 1270000, y: expected.y + 635000 },
          },
        ] as Op[],
        isolation: 'atomic',
      }).applied,
    ).toBe(true)
    const moved = await saveUpstreamPptx(baseline)
    const { host, record } = await mountEditor(moved, { hostApply: upstreamHostApply })
    menu(host, '尺寸与版式', '幻灯片')
    await change(host, () => click(button(host, '重置本页占位符位置')))
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const restored = await openPptxForEdit(record.saved.at(-1)!)
    expect(
      restored.slides()[0]!.elements.find((el) => el.nvId === placeholder.nvId)!.transform.offset,
    ).toEqual(expected)
    const originalZip = await JSZip.loadAsync(original),
      resultZip = await JSZip.loadAsync(record.saved.at(-1)!)
    for (const path of Object.keys(originalZip.files).filter(
      (name) =>
        /ppt\/(theme|slideLayouts|slideMasters)\//.test(name) && !originalZip.files[name]!.dir,
    ))
      expect(await resultZip.file(path)!.async('string')).toBe(
        await originalZip.file(path)!.async('string'),
      )
    await change(host, () => click(button(host, '撤销')))
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(
      (await openPptxForEdit(record.saved.at(-1)!))
        .slides()[0]!
        .elements.find((el) => el.nvId === placeholder.nvId)!.transform.offset.x,
    ).toBe(expected.x + 1270000)
    await change(host, () => click(button(host, '重做')))
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const next = await mountEditor(record.saved.at(-1)!, { hostApply: upstreamHostApply })
    menu(next.host, '尺寸与版式', '幻灯片')
    await change(next.host, () => click(button(next.host, '重置本页占位符位置')))
    await saveAndRead(next.host, next.record, 'ppt/slides/slide1.xml')
    expect(
      (await openPptxForEdit(next.record.saved.at(-1)!))
        .slides()[0]!
        .elements.find((el) => el.nvId === placeholder.nvId)!.transform.offset,
    ).toEqual(expected)
    const originalText = [
      ...(await savedXml(original)).matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g),
    ].map((match) => match[1])
    const savedText = [
      ...(await savedXml(next.record.saved.at(-1)!)).matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g),
    ].map((match) => match[1])
    expect(savedText).toEqual(originalText)
  })
  it('chooses real layouts and adds a slide with that layout over two saves', async () => {
    const bytes = load('upstream/01_standard_business.pptx'),
      source = await openPptxForEdit(bytes)
    const layout = source
      .metadata(0)
      .layouts.find((item) => item.path !== source.slides()[0]!.layoutPath)!
    const { host, record } = await mountEditor(bytes, { hostApply: upstreamHostApply })
    menu(host, '尺寸与版式', '幻灯片')
    pick(host, '选择原件版式', `${layout.name}${layout.type ? ` · ${layout.type}` : ''}`)
    await change(host, () => click(button(host, '应用当前页版式')))
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(await savedXml(record.saved.at(-1)!, 'ppt/slides/_rels/slide1.xml.rels')).toContain(
      layout.path.replace('ppt/', '../'),
    )
    const next = await mountEditor(record.saved.at(-1)!, { hostApply: upstreamHostApply })
    menu(next.host, '尺寸与版式', '幻灯片')
    await change(next.host, () => click(button(next.host, '以所选版式新建幻灯片')))
    await saveAndRead(next.host, next.record, 'ppt/presentation.xml')
    const reopened = await openPptxForEdit(next.record.saved.at(-1)!)
    expect(reopened.slides()).toHaveLength(6)
    expect(reopened.slides()[0]!.layoutPath).toBe(layout.path)
    expect(reopened.slides()[1]!.layoutPath).toBe(layout.path)
    expect(await savedXml(next.record.saved.at(-1)!, 'ppt/slides/_rels/slide6.xml.rels')).toContain(
      layout.path.replace('ppt/', '../'),
    )
  })
  it('section movement, explicit range and removal keep slides and persist updated section ids', async () => {
    const opened = await openUpstreamPptx(load('upstream/01_standard_business.pptx'))
    expect(
      runTxn(opened, {
        ops: [
          { op: 'addSection', atSlideIndex: 0, name: 'A' },
          { op: 'addSection', atSlideIndex: 2, name: 'B' },
          { op: 'addSection', atSlideIndex: 4, name: 'C' },
        ] as Op[],
        isolation: 'atomic',
      }).applied,
    ).toBe(true)
    const { host, record } = await mountEditor(await saveUpstreamPptx(opened), {
      hostApply: upstreamHostApply,
    })
    menu(host, '分节与批注', '幻灯片')
    await change(host, () => click(button(host, '分节下移')))
    // Current slide index is now inside B; shrink its explicit range to its first slide.
    number(host, '分节结束页', 1)
    await change(host, () => click(button(host, '更新分节范围')))
    await saveAndRead(host, record, 'ppt/presentation.xml')
    const first = await openPptxForEdit(record.saved.at(-1)!)
    expect(first.metadata(0).sections.map((item) => item.name)).toEqual(['B', 'A', 'C'])
    expect(first.metadata(0).sections[0]!.slideIndices).toEqual([0])
    const next = await mountEditor(record.saved.at(-1)!, { hostApply: upstreamHostApply })
    menu(next.host, '分节与批注', '幻灯片')
    click(button(next.host, '移除分节'))
    const confirmation = [
      ...document.querySelectorAll<HTMLButtonElement>('.ant-popconfirm .ant-btn-primary'),
    ].at(-1)!
    await change(next.host, () => click(confirmation))
    await saveAndRead(next.host, next.record, 'ppt/presentation.xml')
    const second = await openPptxForEdit(next.record.saved.at(-1)!)
    expect(second.slides()).toHaveLength(5)
    expect(second.metadata(0).sections.map((item) => item.name)).toEqual(['A', 'C'])
    expect(await savedXml(next.record.saved.at(-1)!, 'ppt/presentation.xml')).not.toContain(
      'name="B"',
    )
  })
  it('deletes a persisted classic comment without deleting slide content', async () => {
    const { host, record } = await mountEditor(load('upstream/01_standard_business.pptx'), {
      hostApply: upstreamHostApply,
    })
    menu(host, '分节与批注', '幻灯片')
    typeInField(host, '新批注', '待删除批注')
    await change(host, () => click(button(host, '添加本页批注')))
    await saveAndRead(host, record, 'ppt/presentation.xml')
    const next = await mountEditor(record.saved.at(-1)!, { hostApply: upstreamHostApply })
    menu(next.host, '分节与批注', '幻灯片')
    await change(next.host, () => click(button(next.host, '删除批注 1')))
    await saveAndRead(next.host, next.record, 'ppt/slides/slide1.xml')
    expect((await openPptxForEdit(next.record.saved.at(-1)!)).metadata(0).comments).toEqual([])
    const zip = await JSZip.loadAsync(next.record.saved.at(-1)!)
    for (const file of Object.values(zip.files).filter((item) =>
      /^ppt\/comments\/comment\d+\.xml$/.test(item.name),
    ))
      expect(await file.async('string')).not.toContain('<p:cm ')
    expect(await savedXml(next.record.saved.at(-1)!)).toContain('Q3 Business Review')
  })
  it('presenter shows live notes and next page; keys navigate without dirtying', async () => {
    const deck = await openUpstreamPptx(load('upstream/01_standard_business.pptx'))
    runTxn(deck, {
      ops: [{ op: 'setNotes', target: { slide: 0 }, text: '当前讲稿' }] as Op[],
      isolation: 'atomic',
    })
    const { host } = await mountEditor(await saveUpstreamPptx(deck), {
      hostApply: upstreamHostApply,
    })
    tab(host, '幻灯片')
    button(host, '从当前页放映').focus()
    click(button(host, '演讲者视图'))
    expect(host.querySelector('.mimir-pptx-presentation__notes')?.textContent).toContain('当前讲稿')
    const exit = button(host, '退出放映')
    const canvas = host.querySelector<HTMLElement>('[aria-label="放映画布，按空格播放下一步"]')!
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    await act(async () => exit.dispatchEvent(space))
    expect(space.defaultPrevented).toBe(false)
    expect(host.querySelector('.mimir-pptx-presentation__bar')?.textContent).toContain('1 / 5')
    exit.focus()
    await act(async () =>
      exit.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    )
    expect(document.activeElement).toBe(canvas)
    await act(async () =>
      canvas.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
      ),
    )
    expect(document.activeElement).toBe(exit)
    const fullscreen = button(host, '全屏放映')
    fullscreen.focus()
    const tabToCanvas = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })
    await act(async () => fullscreen.dispatchEvent(tabToCanvas))
    expect(tabToCanvas.defaultPrevented).toBe(false)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      await new Promise((tick) => setTimeout(tick, 5))
    })
    expect(host.querySelector('.mimir-pptx-presentation__bar')?.textContent).toContain('2 / 5')
    click(button(host, '退出放映'))
    expect(host.querySelector('.mimir-pptx-presentation')).toBeNull()
    expect(document.activeElement).toBe(button(host, '演讲者视图'))
    button(host, '演讲者视图').focus()
    click(button(host, '从当前页放映'))
    expect(host.querySelector('[aria-label="幻灯片放映"]')).not.toBeNull()
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    )
    expect(host.querySelector('.mimir-pptx-presentation')).toBeNull()
    expect(document.activeElement).toBe(button(host, '从当前页放映'))
    expect(button(host, '保存到库').disabled).toBe(true)
  })
  it('returns Inspector playback to the explicit custom-show button despite prior field focus', async () => {
    const { host } = await mountEditor(load('upstream/01_standard_business.pptx'), {
      hostApply: upstreamHostApply,
    })
    menu(host, '自定义放映与排练', '幻灯片')
    const checkbox = host.querySelector<HTMLInputElement>(
      '.mimir-pptx-show input[type="checkbox"]',
    )!
    click(checkbox)
    const field = host.querySelector<HTMLInputElement>('input[aria-label="列表名称"]')!
    field.focus()
    const start = button(host, '播放自定义放映')
    click(start)
    expect(host.querySelector('[aria-label="幻灯片放映"]')).not.toBeNull()
    click(button(host, '退出放映'))
    expect(document.activeElement).toBe(start)
    expect(button(host, '保存到库').disabled).toBe(true)
  })
  it('keeps one atomic rehearsal history step and redo through each completed save', async () => {
    const { host, record } = await mountEditor(load('upstream/01_standard_business.pptx'), {
      hostApply: upstreamHostApply,
    })
    menu(host, '自定义放映与排练', '幻灯片')
    click(button(host, '开始排练计时'))
    await act(async () => {
      await new Promise((tick) => setTimeout(tick, 5))
    })
    click(button(host, '结束排练'))
    expect(host.textContent).toContain('已记录 1 页')
    await change(host, () => click(button(host, '应用排练计时')))
    expect(host.querySelector('.mimir-pptx-show__rehearsal')).toBeNull()
    const path = 'ppt/slides/slide1.xml'
    expect(await saveAndRead(host, record, path)).toContain('advTm="1000"')
    await settle(() => button(host, '保存到库').disabled && !button(host, '撤销').disabled)
    expect(button(host, '重做').disabled).toBe(true)
    click(button(host, '撤销'))
    expect(button(host, '重做').disabled).toBe(false)
    expect(await saveAndRead(host, record, path)).not.toContain('advTm=')
    await settle(() => button(host, '保存到库').disabled)
    expect(button(host, '重做').disabled).toBe(false)
    click(button(host, '重做'))
    expect(await saveAndRead(host, record, path)).toContain('advTm="1000"')
    await settle(() => button(host, '保存到库').disabled)
    expect(button(host, '撤销').disabled).toBe(false)
  })
  it('click steps keep withPrev and afterPrev relative times', () => {
    expect(
      pptxPlaybackSteps([
        { spid: 1, effect: 'fade', trigger: 'onClick', durationMs: 500, delayMs: 100 },
        { spid: 2, effect: 'fade', trigger: 'withPrev', durationMs: 200, delayMs: 50 },
        { spid: 3, effect: 'fade', trigger: 'afterPrev', durationMs: 100, delayMs: 20 },
      ]).map((step) => step.map((item) => item.startMs)),
    ).toEqual([[], [100, 150, 370]])
  })
})
