import { applyPptxManualAnimation } from '../../../../apps/server/src/services/pptx-manual-animation.js'
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
import { editableElements, openPptxForEdit, textOfElement } from '../pptx.js'
import {
  openPptx as openUpstreamPptx,
  savePptx as saveUpstreamPptx,
} from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn, type Op } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import { getSlideAnimations } from '../../vendor/packages/pptx-engine/src/animation.js'
import type { PptxHostApply } from '../agent/pptx-agent.js'
import { openSelect, pickSelectOption, selectValueText } from '../shell/antd-test-dom.js'
import type { EditorIo } from './types.js'

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

const upstreamHostApply: PptxHostApply = async (request) => {
  if (request.action === 'manual_animation') return applyPptxManualAnimation(request)
  const { bytes, expectedVersion, ops } = request
  const opened = await openUpstreamPptx(bytes)
  const transaction = runTxn(opened, { ops: ops as Op[], isolation: 'atomic' })
  if (!transaction.applied) throw new Error(transaction.failures?.[0]?.error ?? 'PPTX 操作失败')
  return {
    bytes: await saveUpstreamPptx(opened),
    records: transaction.records ?? [],
    version: expectedVersion + 1,
  }
}
type HostPicture = NonNullable<Parameters<typeof PptxEditor>[0]['hostPicture']>
const upstreamHostPicture: HostPicture = async (request) => {
  const opened = await openUpstreamPptx(request.bytes)
  const op: Op =
    request.action === 'insert'
      ? {
          op: 'addPicture',
          target: { slide: request.slide },
          bytes: request.imageBytes,
          ext: 'png',
          offset: { x: 914400, y: 1371600, cx: 5486400, cy: 2743200 },
        }
      : {
          op: 'replacePicture',
          target: { slide: request.slide, el: request.elementId },
          bytes: request.imageBytes,
          ext: 'png',
        }
  const transaction = runTxn(opened, { ops: [op], isolation: 'atomic' })
  if (!transaction.applied) throw new Error(transaction.failures?.[0]?.error ?? '图片操作失败')
  return { bytes: await saveUpstreamPptx(opened), version: request.expectedVersion + 1 }
}

async function imageBytes(): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(load('image-deck.pptx'))
  return zip.file('ppt/media/image1.png')!.async('uint8array')
}
const ONE_PIXEL_PNG = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X9WQAAAAASUVORK5CYII=',
    'base64',
  ),
)

/* ── 挂载 / 交互 ─────────────────────────────────────────────── */

const mounted: { unmount: () => void }[] = []

afterEach(() => {
  for (const item of mounted) item.unmount()
  mounted.length = 0
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
  for (let i = 0; i < 60 && !done(); i += 1) {
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
  options: { record?: Recorder; hostApply?: PptxHostApply; hostPicture?: HostPicture } = {},
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
        hostApply={options.hostApply}
        hostPicture={options.hostPicture}
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
    const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '对象',
    )
    if (tab && tab.getAttribute('aria-selected') !== 'true') click(tab)
  }
  const found = [...host.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === label,
  )
  if (found === undefined) throw new Error(`没有名为「${label}」的按钮`)
  return found as HTMLButtonElement
}

/** 次要命令通过具名菜单执行，测试走和用户相同的打开路径。 */
function menuItem(host: HTMLElement, label: string): HTMLButtonElement {
  if (host.querySelector('.mimir-pptx-pdf-toolbar__panel') === null) {
    click(button(host, '文字格式'))
  }
  const found = [
    ...host.querySelectorAll<HTMLButtonElement>('.mimir-pptx-pdf-toolbar__panel [role="menuitem"]'),
  ].find((item) => item.textContent?.trim() === label)
  if (found === undefined) throw new Error(`文字格式菜单里没有「${label}」`)
  return found
}

function objectMenuItem(host: HTMLElement, label: string): HTMLButtonElement {
  if (host.querySelector('.mimir-pptx-pdf-toolbar__panel') === null) {
    click(button(host, '对象与幻灯片操作'))
  }
  const found = [
    ...host.querySelectorAll<HTMLButtonElement>('.mimir-pptx-pdf-toolbar__panel [role="menuitem"]'),
  ].find((item) => item.textContent?.trim() === label)
  if (!found) throw new Error(`对象菜单里没有「${label}」`)
  return found
}

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

function tableTab(host: HTMLElement, label: string) {
  const tab = [
    ...host.querySelectorAll<HTMLButtonElement>('[aria-label="表格编辑分类"] [role="tab"]'),
  ].find((item) => item.textContent === label)
  if (!tab) throw new Error(`没有表格分类${label}`)
  click(tab)
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

async function pickImage(host: HTMLElement, label: string, bytes: Uint8Array): Promise<void> {
  const trigger = button(host, label)
  const input = trigger.closest('.me-file')?.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error(`没有「${label}」的文件输入`)
  const file = new File([new Uint8Array(bytes)], 'picture.png', { type: 'image/png' })
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((tick) => setTimeout(tick, 0))
  })
}

async function slideAction(host: HTMLElement, page: number, label: string): Promise<void> {
  const item = host.querySelectorAll<HTMLElement>('.mimir-page-browser__item')[page - 1]
  if (!item) throw new Error(`没有第 ${page} 页的缩略图`)
  act(() => {
    item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
  })
  await act(async () => {
    await new Promise((tick) => setTimeout(tick, 0))
  })
  const menu = [...host.querySelectorAll<HTMLElement>('.ant-dropdown')].findLast(
    (node) => !node.classList.contains('ant-dropdown-hidden'),
  )
  const action = [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].find(
    (node) => node.textContent?.trim() === label,
  )
  if (!action) throw new Error(`第 ${page} 页没有「${label}」操作`)
  click(action)
  await act(async () => {
    await new Promise((tick) => setTimeout(tick, 0))
  })
}

function touchPointer(type: string): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    pointerType: { value: 'touch' },
    clientX: { value: 20 },
    clientY: { value: 20 },
  })
  return event
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
    throw new Error('保存没有写回新的字节')
  }
  const zip = await JSZip.loadAsync(bytes)
  const file = zip.file(entry)
  if (!file) throw new Error(`zip 里没有 ${entry}`)
  return file.async('string')
}

/** 某个元素名对应的那个 `<p:sp>` 的 XML 片段（按 name="…" 定位，够用且稳） */
function elementXml(xml: string, name: string): string {
  const at = xml.indexOf(`name="${name}"`)
  if (at < 0) throw new Error(`XML 里没有 name="${name}"`)
  const start = xml.lastIndexOf('<p:sp>', at)
  const end = xml.indexOf('</p:sp>', at)
  return xml.slice(start, end)
}

/**
 * 带着文字的 `<a:r>` 片段（**连 rPr 的子节点**，不只开标签的属性）。
 *
 * 颜色与字体在 rPr 里是**子节点**（`<a:solidFill><a:srgbClr val="…"/>`、
 * `<a:latin typeface="…"/>`），只取开标签会看不到它们——断言就会退化成
 * 「只看字形属性」，而颜色/字体是不是被顺带改坏了恰好是这里要守的。
 *
 * 只认 `<a:r>`：`<a:endParaRPr>` 之类的段落标记不是 run，把它算进来会让
 * 「第几条 run」对不上。
 */
function textRunBlocks(spXml: string): string[] {
  return [...spXml.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)].map((match) => match[1]!)
}

/**
 * 上游那份 5 页文稿，第 3 页的标题被改造成「加粗标签 `Key ` + 普通正文
 * `Results`」两 run（`sz=3600 b=1` 深灰 + `sz=2400` 红字）。
 *
 * 为什么要造它：**混合格式的段落**是这个界面最容易静默出错的地方——无论是
 * 「每段回传一条 run」还是「改字顺手压平 run」，症状都一样：保存成功、文字也对，
 * 只有格式没了。最小夹具（每段一条 run）根本触发不到。
 */
async function twoRunUpstreamDeck(): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(load('upstream/01_standard_business.pptx'))
  const slide = await zip.file('ppt/slides/slide3.xml')!.async('string')
  const twoRun = slide.replace(
    /<a:r><a:rPr sz="3600" b="1">[\s\S]*?<\/a:r>/,
    '<a:r><a:rPr sz="3600" b="1"><a:solidFill><a:srgbClr val="1F2937"/></a:solidFill></a:rPr><a:t>Key </a:t></a:r>' +
      '<a:r><a:rPr sz="2400"><a:solidFill><a:srgbClr val="C0392B"/></a:solidFill></a:rPr><a:t>Results</a:t></a:r>',
  )
  expect(twoRun).not.toBe(slide)
  zip.file('ppt/slides/slide3.xml', twoRun)
  return zip.generateAsync({ type: 'uint8array' })
}

async function tableWithFormattedParagraphs(): Promise<Uint8Array> {
  const opened = await openUpstreamPptx(load('title-layout.pptx'))
  const inserted = runTxn(opened, {
    ops: [
      {
        op: 'addTable',
        target: { slide: 0 },
        rows: 2,
        cols: 2,
        offset: { x: 914400, y: 1371600, cx: 5486400, cy: 1371600 },
      },
    ],
    isolation: 'atomic',
  })
  expect(inserted.applied).toBe(true)
  const table = opened.deck.slides[0]?.elements.find((element) => element.type === 'table')
  if (!table) throw new Error('表格夹具创建失败')
  const prepared = runTxn(opened, {
    ops: [
      {
        op: 'setTableCell',
        target: { slide: 0, el: table.id },
        row: 0,
        col: 0,
        paragraphs: [
          {
            runs: [
              { text: 'Key ', bold: true },
              { text: 'Results', color: '#C0392B' },
            ],
          },
          {
            runs: [
              { text: 'Keep ', italic: true },
              { text: 'second', color: '#008800' },
            ],
          },
        ],
      },
    ],
    isolation: 'atomic',
  })
  expect(prepared.applied).toBe(true)
  return saveUpstreamPptx(opened)
}

/** 用「跳到第几页」输入框翻到某一页（走 `ToolbarNumberField` 的契约：回车提交） */
async function jumpToPage(host: HTMLElement, page: number): Promise<void> {
  const field = host.querySelector<HTMLInputElement>('input[aria-label="跳到第几页"]')
  if (field === null) throw new Error('没有跳页输入框')
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter!.call(field, String(page))
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  await settle(
    () =>
      host.querySelector('.mimir-editor__status')?.textContent?.includes(`第 ${page} /`) === true,
  )
}

/* ── 用例 ───────────────────────────────────────────────────── */

describe('pptx 工具条：每个按钮都真的改了元件', () => {
  it('加粗整段：两段的 b 一起变（第一段本来就有 b="1"）', async () => {
    /*
     * 夹具的第一段是 `b="1" sz="2800"` 的红字、第二段是 `sz="1200" i="1"`。
     * 两段取值不一致 → 按钮不该亮着（`everyRun` 的判据）；点一次把整段都打开。
     */
    const { host, record } = await mountEditor(load('formatted-text.pptx'))
    // 夹具的第一个元素是「加粗大字 / 斜体小字」两段（`formatted-text.pptx`）
    selectOnCanvas(host, 0)
    expect(button(host, '加粗（整框）').getAttribute('aria-pressed')).toBe('false')

    click(button(host, '加粗（整框）'))
    const after = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const runs = textRunBlocks(elementXml(after, 'TextBox 1'))
    // 两段都真的加粗了
    expect(runs[0]).toContain('b="1"')
    expect(runs[1]).toContain('b="1"')
    // 第二段原有的斜体与字号、第一段的颜色一个字都没动
    expect(runs[1]).toContain('i="1"')
    expect(runs[1]).toContain('sz="1200"')
    expect(runs[0]).toContain('sz="2800"')
    expect(runs[0]).toContain('<a:srgbClr val="C0392B"/>')
  })

  it('加粗再点一次：整段取消（写 b="0" 而不是删属性）', async () => {
    const { host, record } = await mountEditor(load('formatted-text.pptx'))
    selectOnCanvas(host, 0)
    click(button(host, '加粗（整框）'))
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    // 现在两段都是加粗的 → 按钮亮着
    expect(button(host, '加粗（整框）').getAttribute('aria-pressed')).toBe('true')

    click(button(host, '加粗（整框）'))
    const after = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const runs = textRunBlocks(elementXml(after, 'TextBox 1'))
    // `b="0"` 是**显式取消**（覆盖母版/版式继承来的加粗），不是删掉属性
    expect(runs[0]).toContain('b="0"')
    expect(runs[1]).toContain('b="0"')
  })

  it('倾斜整段：i="1"，同段的字号与颜色不受影响', async () => {
    const { host, record } = await mountEditor(load('formatted-text.pptx'))
    selectOnCanvas(host, 0)
    click(button(host, '倾斜（整框）'))
    const after = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const runs = textRunBlocks(elementXml(after, 'TextBox 1'))
    expect(runs.filter((item) => item.includes('i="1"')).length).toBe(2)
    // 第一段的 b="1" 与颜色没被这次改动碰过
    expect(runs[0]).toContain('b="1"')
    expect(runs[0]).toContain('<a:srgbClr val="C0392B"/>')
    expect(runs[0]).toContain('sz="2800"')
  })

  it('下划线 / 删除线：u="sng" 与 strike="sngStrike"', async () => {
    // 这个夹具的 run **完全没有 rPr**（字号与字体全从版式继承）→ 走的是
    // `patchRun` 的「注入一个 rPr」分支，正好是另一条代码路径
    const { host, record } = await mountEditor(load('title-layout.pptx'))
    selectOnCanvas(host, 0)
    click(button(host, '下划线（整框）'))
    click(menuItem(host, '删除线（整框）'))
    const after = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const runs = textRunBlocks(elementXml(after, 'Title 1'))
    expect(runs[0]).toContain('u="sng"')
    expect(runs[0]).toContain('strike="sngStrike"')
    // 字号是继承来的（原 run 没有 sz），不该因为改字形被烧进字节
    expect(runs[0]).not.toContain('sz=')
  })

  it('上标 / 下标：baseline="30000" 与 "-25000"，再点一次回到 0', async () => {
    const { host, record } = await mountEditor(load('title-layout.pptx'))
    selectOnCanvas(host, 0)
    click(menuItem(host, '上标（整框）'))
    let after = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(textRunBlocks(elementXml(after, 'Title 1'))[0]).toContain('baseline="30000"')

    // 取消（同一页、同一个选中）：写的是显式的 0，而不是删掉属性
    click(menuItem(host, '上标（整框）'))
    after = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(textRunBlocks(elementXml(after, 'Title 1'))[0]).toContain('baseline="0"')

    click(menuItem(host, '下标（整框）'))
    after = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(textRunBlocks(elementXml(after, 'Title 1'))[0]).toContain('baseline="-25000"')
  })

  it('清除字形：五项一次性清零，字号与字体不动', async () => {
    const { host, record } = await mountEditor(load('formatted-text.pptx'))
    selectOnCanvas(host, 0)
    click(menuItem(host, '清除字形（加粗、倾斜、下划线、删除线、上下标；不动字号、字体与颜色）'))
    const after = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const runs = textRunBlocks(elementXml(after, 'TextBox 1'))
    expect(runs[0]).toContain('b="0"')
    expect(runs[1]).toContain('i="0"')
    /*
     * 下划线与删除线**不写属性**：原件里本来就没有 `u` / `strike`，而
     * `generate.ts` 的 `patchRunProps` 只在「原本有属性」或「显式要求 none」
     * 时才写 `u="none"` / `strike="noStrike"`——没有的东西不必声明没有。
     * 这里守的正是「不乱写」：多写一个 `u="none"` 会让这一条 run 从
     * 「继承版式的下划线」变成「明确没有下划线」，那是**改了原件的意思**。
     */
    expect(runs[0]).not.toContain('u=')
    expect(runs[0]).not.toContain('strike=')
    // 字号与颜色是「清除字形」明确不碰的两项
    expect(runs[0]).toContain('sz="2800"')
    expect(runs[0]).toContain('<a:srgbClr val="C0392B"/>')
  })

  it('字号：多档时不显示一个数字（那个数字不是文档里的值）', async () => {
    const { host } = await mountEditor(load('formatted-text.pptx'))
    selectOnCanvas(host, 0)
    // 两段是 28pt 与 12pt → 没有「当前字号」这回事
    expect(host.querySelector('input[aria-label="字号（pt，整框）"]')).toBeNull()
    expect(host.textContent).toContain('多档字号')
  })

  it('字号：写 sz="2000"，并保持原有的字形与颜色', async () => {
    const { host, record } = await mountEditor(load('title-layout.pptx'))
    // 第二个元素是正文占位符，两段都是 32pt（继承自版式）
    selectOnCanvas(host, 1)
    const field = host.querySelector<HTMLInputElement>('input[aria-label="字号（pt，整框）"]')
    expect(field, '两段字号一致时应当显示输入框').not.toBeNull()
    expect(field!.value).toBe('32')

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter!.call(field, '20')
      field!.dispatchEvent(new Event('input', { bubbles: true }))
      field!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    const after = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const sp = elementXml(after, 'Content Placeholder 2')
    const runs = textRunBlocks(sp)
    expect(runs[0]).toContain('sz="2000"')
    expect(runs[1]).toContain('sz="2000"')
    /*
     * 段落属性（这里的项目符号）**不是**写在幻灯片里的：`•` 来自母版的
     * `bodyStyle`（`slideMaster1.xml` 里有 `<a:buChar char="•"/>`，而这张
     * `slide1.xml` 的 `<a:lstStyle/>` 是空的）。所以「没丢」在这里的判据是
     * **没有凭空写出一段 `<a:pPr>`**——写了就等于把母版的符号烧进这一页，
     * 那是「改字号顺带改了段落属性」，而它不是这次动作的意思。
     */
    expect(sp).not.toContain('<a:pPr')
    expect(runs[0]).toContain('<a:t>第一条</a:t>')
  })

  it('增大 / 减小字号：按每条 run 自己的值 ±2pt', async () => {
    const { host, record } = await mountEditor(load('formatted-text.pptx'))
    selectOnCanvas(host, 0)
    click(menuItem(host, '增大字号 2pt（整框）'))
    let after = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    let runs = textRunBlocks(elementXml(after, 'TextBox 1'))
    // 28 → 30，12 → 14（两段各按自己的值走）
    expect(runs[0]).toContain('sz="3000"')
    expect(runs[1]).toContain('sz="1400"')

    click(menuItem(host, '减小字号 2pt（整框）'))
    after = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    runs = textRunBlocks(elementXml(after, 'TextBox 1'))
    expect(runs[0]).toContain('sz="2800"')
    expect(runs[1]).toContain('sz="1200"')
  })

  it('字体：三个槽位都写（latin / ea / cs）', async () => {
    const { host, record } = await mountEditor(load('title-layout.pptx'))
    selectOnCanvas(host, 0)
    // antd 的下拉要打开弹层才渲染选项，选中一项是**点它**（不是改 value 再 change）
    click(button(host, '文字格式'))
    pickSelectOption(host, '字体（整框，中英文一起换）', '微软雅黑')

    const after = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const sp = elementXml(after, 'Title 1')
    expect(sp).toContain('<a:latin typeface="微软雅黑"/>')
    expect(sp).toContain('<a:ea typeface="微软雅黑"/>')
    expect(sp).toContain('<a:cs typeface="微软雅黑"/>')
  })

  it('字体颜色：写 srgbClr，并把主题链接标记一起清掉', async () => {
    const { host, record } = await mountEditor(load('title-layout.pptx'))
    selectOnCanvas(host, 0)
    click(button(host, '文字格式'))
    click(button(host, '字体颜色（整框）'))
    // 面板里的色块：按 option 的 label 找
    const cell = [...host.querySelectorAll('button[aria-label]')].find(
      (item) => item.getAttribute('aria-label') === '红',
    )
    expect(cell, '调色板里应当有「红」').not.toBeUndefined()
    click(cell!)

    const after = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const sp = elementXml(after, 'Title 1')
    expect(sp).toContain('<a:srgbClr val="FF0000"/>')
    // 颜色是继承来的（colorInherited），改色之后不该还留着「主题色」的语义
    expect(sp).not.toContain('schemeClr')
  })

  it('编辑现有多系列图表显示在画布并保存重开，其他系列保留', async () => {
    const opened = await openUpstreamPptx(load('title-layout.pptx'))
    expect(
      runTxn(opened, {
        ops: [
          {
            op: 'addChart',
            target: { slide: 0 },
            kind: 'bar',
            title: '原图表',
            categories: ['Q1', 'Q2'],
            series: [
              { name: '收入', values: [12, 18] },
              { name: '成本', values: [3, 5] },
            ],
            offset: { x: 914400, y: 1371600, cx: 5486400, cy: 2743200 },
          },
        ],
        isolation: 'atomic',
      }).applied,
    ).toBe(true)
    const requests: Parameters<PptxHostApply>[0][] = []
    const { host, record } = await mountEditor(await saveUpstreamPptx(opened), {
      hostApply: async (request) => {
        requests.push(request)
        return upstreamHostApply(request)
      },
    })
    click(host.querySelector('.mimir-pptx-slide [data-element-kind="chart"]')!)
    click(button(host, '对象与幻灯片操作'))
    click(objectMenuItem(host, '编辑图表'))
    typeInField(host, '图表标题', '季度收入')
    click([...host.querySelectorAll('[role="tab"]')].find((item) => item.textContent === '数据')!)
    typeInField(host, '系列 1 数值（每行一项）', '20\n30')
    click(button(host, '应用图表修改'))
    await settle(
      () => host.querySelector('.mimir-pptx-slide')?.textContent?.includes('季度收入') === true,
    )
    expect(requests.at(-1)?.action).toBe('edit_chart')
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const reopened = await openPptxForEdit(record.saved.at(-1)!)
    const chart = reopened.slides()[0]!.elements.find((item) => item.type === 'chart')
    expect(chart?.type === 'chart' ? chart.chart.series.map((item) => item.values) : null).toEqual([
      [20, 30],
      [3, 5],
    ])
    expect(chart?.type === 'chart' ? chart.chart.title : null).toBe('季度收入')
    await reopened.save()
    reopened.commit()
    const again = await openPptxForEdit(await reopened.save())
    expect(again.slides()[0]!.elements.find((item) => item.type === 'chart')?.type).toBe('chart')
  })

  it('图表修改失败保留输入且不标脏，未确认的导入图表不执行', async () => {
    const opened = await openUpstreamPptx(load('title-layout.pptx'))
    runTxn(opened, {
      ops: [
        {
          op: 'addChart',
          target: { slide: 0 },
          kind: 'line',
          categories: ['Q1'],
          series: [{ name: '收入', values: [12] }],
          offset: { x: 914400, y: 1371600, cx: 5486400, cy: 2743200 },
        },
      ],
      isolation: 'atomic',
    })
    const zip = await JSZip.loadAsync(await saveUpstreamPptx(opened))
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
    zip.file('ppt/slides/slide1.xml', xml.replace('descr="aislides-chart"', 'descr="imported"'))
    const hostApply = vi.fn<PptxHostApply>(async () => {
      throw new Error('图表服务暂不可用')
    })
    const { host } = await mountEditor(await zip.generateAsync({ type: 'uint8array' }), {
      hostApply,
    })
    click(host.querySelector('.mimir-pptx-slide [data-element-kind="chart"]')!)
    click(button(host, '对象与幻灯片操作'))
    click(objectMenuItem(host, '编辑图表'))
    typeInField(host, '图表标题', '保留草稿')
    const confirm = vi.fn<() => boolean>(() => false)
    vi.stubGlobal('confirm', confirm)
    click(button(host, '应用图表修改'))
    expect(hostApply).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    click(button(host, '应用图表修改'))
    await settle(() => host.textContent?.includes('图表服务暂不可用') === true)
    expect(host.querySelector<HTMLInputElement>('input[aria-label="图表标题"]')?.value).toBe(
      '保留草稿',
    )
    expect(button(host, '保存到库').disabled).toBe(true)
    vi.unstubAllGlobals()
  })

  it('讲稿、换页时间和动画顺序有当前状态并保存重开', async () => {
    const { host, record } = await mountEditor(load('title-layout.pptx'), {
      hostApply: upstreamHostApply,
    })
    selectOnCanvas(host, 0)
    click(
      host.querySelector('[role=tab][data-tab-key=slide]') ??
        Array.from(host.querySelectorAll('[role=tab]')).find(
          (tab) => tab.textContent === '幻灯片',
        )!,
    )
    click(button(host, '备注与放映'))
    click(
      Array.from(host.querySelectorAll('[role=tab]')).find((tab) => tab.textContent === '备注')!,
    )
    typeInField(host, '演讲者备注', '第一段讲稿\n第二段 & 细节')
    click(button(host, '应用演讲者备注'))
    await settle(() => host.textContent?.includes('已应用幻灯片修改') === true)
    expect(
      host.querySelector<HTMLTextAreaElement>('textarea[aria-label="演讲者备注"]')?.value,
    ).toBe('第一段讲稿\n第二段 & 细节')
    click(
      Array.from(host.querySelectorAll('[role=tab]')).find((tab) => tab.textContent === '切换')!,
    )
    typeInField(host, '自动换页秒数', '8')
    act(() =>
      host
        .querySelector<HTMLInputElement>('input[aria-label="自动换页秒数"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    )
    await settle(() => host.textContent?.includes('当前 8 秒后自动换页') === true)
    expect(await saveAndRead(host, record, 'ppt/slides/slide1.xml')).toContain('advTm="8000"')
    click(
      Array.from(host.querySelectorAll('[role=tab]')).find((tab) => tab.textContent === '效果')!,
    )
    click(button(host, '为选中对象添加动画'))
    await settle(() => host.textContent?.includes('共 1 个动画') === true)
    await settle(() => !button(host, '为选中对象添加动画').disabled)
    pickSelectOption(host, '新增动画效果', '旋转')
    click(button(host, '为选中对象添加动画'))
    await settle(() => host.textContent?.includes('共 2 个动画') === true)
    click(
      Array.from(host.querySelectorAll('[role=tab]')).find((tab) => tab.textContent === '时间线')!,
    )
    expect(host.textContent).toContain('共 2 个动画')
    click(button(host, '上移动画 2'))
    await settle(() => !button(host, '删除动画 1').disabled)
    const xml = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(xml).toContain('advTm="8000"')
    expect(xml).toContain('<p:timing>')
    const reopened = await openPptxForEdit(record.saved.at(-1)!)
    expect(reopened.notes(0)).toBe('第一段讲稿\n第二段 & 细节')
    expect(getSlideAnimations(reopened.slides()[0]!).map((item) => item.effect)).toEqual([
      'spin',
      'fade',
    ])
    click(button(host, '删除动画 1'))
    await settle(() => host.textContent?.includes('共 1 个动画') === true)
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const latest = await openPptxForEdit(record.saved.at(-1)!)
    expect(latest.notes(0)).toBe('第一段讲稿\n第二段 & 细节')
    expect(getSlideAnimations(latest.slides()[0]!).map((item) => item.effect)).toEqual(['fade'])
  })

  it('窄栏表格先关闭内层选择，再关闭面板并回焦到属性与位置组', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('mimir-compact-toolbar__commands'))
        return DOMRect.fromRect({ width: 420, height: 56 })
      if (this.dataset.sectionKey)
        return DOMRect.fromRect({
          width: this.hasAttribute('data-collapsed') ? 72 : 300,
          height: 56,
        })
      return DOMRect.fromRect({ width: 100, height: 32 })
    })
    const { host } = await mountEditor(await tableWithFormattedParagraphs(), {
      hostApply: upstreamHostApply,
    })
    click(host.querySelector('.mimir-pptx-slide [data-element-kind="table"]')!)
    click(
      [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
        (item) => item.textContent === '对象',
      )!,
    )
    const group = button(host, '属性与位置')
    click(group)
    click(objectMenuItem(host, '编辑表格'))
    const row = host.querySelector<HTMLInputElement>('input[aria-label="行"]')!
    act(() => {
      row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      row.focus()
    })
    expect(host.querySelector('button[aria-label="对象与幻灯片操作"]')).toBeNull()
    openSelect(host, '行')
    const escape = async () =>
      act(async () => {
        row.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true,
          }),
        )
        await new Promise((finish) => setTimeout(finish, 0))
      })
    await escape()
    expect(host.querySelector('[aria-label="编辑表格面板"]')).not.toBeNull()
    expect(row.getAttribute('aria-expanded')).toBe('false')
    await escape()
    expect(host.querySelector('[aria-label="编辑表格面板"]')).toBeNull()
    expect(document.activeElement).toBe(group)
  })

  it('位置尺寸宿主处理期间禁用重复提交与保存，完成后四项均保存到原件', async () => {
    const releases: (() => void)[] = []
    const delayedHost = vi.fn<PptxHostApply>(async (request) => {
      await new Promise<void>((finish) => releases.push(finish))
      return upstreamHostApply(request)
    })
    const { host, record } = await mountEditor(await tableWithFormattedParagraphs(), {
      hostApply: delayedHost,
    })
    click(host.querySelector('.mimir-pptx-slide [data-element-kind="table"]')!)
    click(
      [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
        (item) => item.textContent === '对象',
      )!,
    )
    for (const [index, [label, value]] of [
      ['左', '650'],
      ['上', '300'],
      ['宽', '110'],
      ['高', '110'],
    ].entries()) {
      typeInField(host, label!, value!)
      act(() =>
        host
          .querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
          .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
      )
      await settle(() => releases.length > index)
      for (const field of ['左', '上', '宽', '高'])
        expect(host.querySelector<HTMLInputElement>(`input[aria-label="${field}"]`)!.disabled).toBe(
          true,
        )
      expect(button(host, '保存到库').disabled).toBe(true)
      expect(button(host, '撤销').disabled).toBe(true)
      expect(host.textContent).toContain('正在应用修改')
      click(button(host, '保存到库'))
      expect(record.saved).toHaveLength(0)
      expect(delayedHost).toHaveBeenCalledTimes(index + 1)
      await act(async () => releases[index]!())
      await settle(() => !host.querySelector<HTMLInputElement>('input[aria-label="左"]')!.disabled)
    }
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const reopened = await openPptxForEdit(record.saved.at(-1)!)
    const table = reopened.slides()[0]!.elements.find((item) => item.type === 'table')!
    expect(table.transform.offset).toEqual({
      x: 650 * 12700,
      y: 300 * 12700,
      cx: 110 * 12700,
      cy: 110 * 12700,
    })
  })

  it('同tick重复位置提交明确拒绝，宿主失败后可重试且不保存半成品', async () => {
    let rejectHost!: (reason: Error) => void
    const pending = new Promise<never>((_, reject) => {
      rejectHost = reject
    })
    const hostApply = vi
      .fn<PptxHostApply>()
      .mockImplementationOnce(() => pending)
      .mockImplementation(upstreamHostApply)
    const { host, record } = await mountEditor(await tableWithFormattedParagraphs(), { hostApply })
    click(host.querySelector('.mimir-pptx-slide [data-element-kind="table"]')!)
    click(
      [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
        (item) => item.textContent === '对象',
      )!,
    )
    const initialY = host.querySelector<HTMLInputElement>('input[aria-label="上"]')!.value
    typeInField(host, '左', '650')
    typeInField(host, '上', '300')
    act(() => {
      for (const label of ['左', '上'])
        host
          .querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
          .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await settle(() => hostApply.mock.calls.length > 0)
    expect(hostApply).toHaveBeenCalledOnce()
    expect(host.textContent).toContain('正在处理文档，请稍后重试')
    expect(record.saved).toHaveLength(0)
    await act(async () => rejectHost(new Error('测试宿主失败')))
    await settle(() => !host.querySelector<HTMLInputElement>('input[aria-label="左"]')!.disabled)
    expect(host.textContent).toContain('测试宿主失败')
    expect(host.querySelector<HTMLInputElement>('input[aria-label="上"]')!.value).toBe(initialY)
    expect(button(host, '保存到库').disabled).toBe(true)
    typeInField(host, '上', '300')
    act(() =>
      host
        .querySelector<HTMLInputElement>('input[aria-label="上"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    )
    await settle(() => !host.querySelector<HTMLInputElement>('input[aria-label="左"]')!.disabled)
    expect(hostApply).toHaveBeenCalledTimes(2)
    expect(host.querySelector<HTMLInputElement>('input[aria-label="上"]')!.value).toBe('300')
  })

  it('图库来源分类切走后关闭面板回焦到当前Ribbon分类', async () => {
    const { host } = await mountEditor(load('title-layout.pptx'), { hostApply: upstreamHostApply })
    const ribbonTab = (label: string) =>
      [
        ...host.querySelectorAll<HTMLButtonElement>('.mimir-compact-toolbar__tabs [role="tab"]'),
      ].find((item) => item.textContent === label)!
    click(ribbonTab('插入'))
    click(button(host, '形状库'))
    click(ribbonTab('对象'))
    const panel = host.querySelector<HTMLElement>('[aria-label="形状库面板"]')!
    act(() => {
      panel.focus()
      panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(host.querySelector('[aria-label="形状库面板"]')).toBeNull()
    expect(document.activeElement).toBe(ribbonTab('对象'))
  })

  it('表格应用预设保留分类与行列，撤销重做丢弃旧版本草稿', async () => {
    const { host } = await mountEditor(await tableWithFormattedParagraphs(), {
      hostApply: upstreamHostApply,
    })
    click(host.querySelector('.mimir-pptx-slide [data-element-kind="table"]')!)
    click(objectMenuItem(host, '编辑表格'))
    pickSelectOption(host, '行', '第 2 行')
    pickSelectOption(host, '列', '第 2 列')
    const panel = host.querySelector('.mimir-pptx-table-editor')
    tableTab(host, '样式')
    click(button(host, '表格样式：蓝色交替行'))
    click(button(host, '应用表格样式'))
    await settle(() => panel?.getAttribute('aria-busy') === 'false')
    expect(host.querySelector('.mimir-pptx-table-editor')).toBe(panel)
    expect(host.querySelector('[aria-label="表格样式"]')).not.toBeNull()
    expect(selectValueText(host, '行')).toBe('第 2 行')
    expect(selectValueText(host, '列')).toBe('第 2 列')
    tableTab(host, '内容')
    const currentText = host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="单元格文字"]',
    )!.value
    typeInField(host, '单元格文字', 'Old source draft')
    tableTab(host, '样式')
    pickSelectOption(host, '表格方向', '从右到左')
    click(button(host, '撤销'))
    await settle(() => button(host, '表格样式：蓝色交替行').getAttribute('aria-pressed') !== 'true')
    expect(selectValueText(host, '表格方向')).toBe('从左到右')
    expect(button(host, '应用表格样式').disabled).toBe(true)
    tableTab(host, '内容')
    expect(
      host.querySelector<HTMLTextAreaElement>('textarea[aria-label="单元格文字"]')!.value,
    ).toBe(currentText)
    click(button(host, '重做'))
    await settle(() => button(host, '重做').disabled)
    expect(
      host.querySelector<HTMLTextAreaElement>('textarea[aria-label="单元格文字"]')!.value,
    ).toBe(currentText)
    tableTab(host, '样式')
    expect(button(host, '表格样式：蓝色交替行').getAttribute('aria-pressed')).toBe('true')
    expect(button(host, '应用表格样式').disabled).toBe(true)
    expect(selectValueText(host, '行')).toBe('第 2 行')
    expect(selectValueText(host, '列')).toBe('第 2 列')
  })

  it('表格插入行、行高、对齐和交替行采用原生表格并保存重开', async () => {
    const { host, record } = await mountEditor(await tableWithFormattedParagraphs(), {
      hostApply: upstreamHostApply,
    })
    click(host.querySelector('.mimir-pptx-slide [data-element-kind="table"]')!)
    click(button(host, '对象与幻灯片操作'))
    click(objectMenuItem(host, '编辑表格'))
    tableTab(host, '布局')
    click(button(host, '在当前行后插入行'))
    await settle(() => !button(host, '在当前行后插入行').disabled)
    typeInField(host, '当前行高（pt）', '64')
    act(() =>
      host
        .querySelector<HTMLInputElement>('input[aria-label="当前行高（pt）"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    )
    await settle(() => !button(host, '在当前行后插入行').disabled)
    pickSelectOption(host, '单元格垂直对齐', '底端')
    await settle(() => !button(host, '在当前行后插入行').disabled)
    tableTab(host, '样式')
    const wasBanded = button(host, '表格交替行').getAttribute('aria-pressed') === 'true'
    click(button(host, '表格交替行'))
    click(button(host, '应用表格样式'))
    await settle(
      () =>
        button(host, '应用表格样式').disabled &&
        host.querySelector('.mimir-pptx-table-editor')?.getAttribute('aria-busy') === 'false',
    )
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const reopened = await openPptxForEdit(record.saved.at(-1)!)
    const table = reopened.slides()[0]!.elements.find((item) => item.type === 'table')
    if (table?.type !== 'table') throw new Error('表格丢失')
    expect(table.rows).toHaveLength(3)
    expect(table.rowHeights[0]).toBe(64 * 12700)
    expect(table.rows[0]?.[0]?.text?.anchor).toBe('bottom')
    expect(table.styleFlags?.bandRow).toBe(!wasBanded)
    expect(table.rows[0]?.[0]?.text?.paragraphs[0]?.runs.map((item) => item.text)).toEqual([
      'Key ',
      'Results',
    ])
  })

  it('手动对象填充经同一宿主操作写入未保存画布并保存重开', async () => {
    const { host, record } = await mountEditor(load('title-layout.pptx'), {
      hostApply: upstreamHostApply,
    })
    selectOnCanvas(host, 0)
    click(button(host, '对象与幻灯片操作'))
    click(button(host, '填充颜色'))
    const red = [...host.querySelectorAll('button[aria-label]')].find(
      (item) => item.getAttribute('aria-label') === '红',
    )
    expect(red).toBeDefined()
    click(red!)
    await settle(
      () =>
        host.querySelector<HTMLButtonElement>('button[aria-label="保存到库"]')?.disabled === false,
    )
    const xml = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(elementXml(xml, 'Title 1')).toContain('<a:srgbClr val="FF0000"/>')
    const reopened = await openPptxForEdit(record.saved.at(-1)!)
    expect(reopened.slides()[0]?.elements).toHaveLength(2)
  })

  it('插入分类的直接命令写入同一画布并保存重开', async () => {
    const { host, record } = await mountEditor(load('title-layout.pptx'), {
      hostApply: upstreamHostApply,
    })
    const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '插入',
    )!
    click(tab)
    expect(host.querySelector('button[aria-label="对象与幻灯片操作"]')).toBeNull()
    click(button(host, '插入文本框'))
    await settle(() => button(host, '保存到库').disabled === false)
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const reopened = await openPptxForEdit(record.saved.at(-1)!)
    expect(reopened.slides()[0]?.elements).toHaveLength(3)
  })

  it('插入表格在画布可见，并以原生表格保存重开', async () => {
    const { host, record } = await mountEditor(load('title-layout.pptx'), {
      hostApply: upstreamHostApply,
    })
    const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '插入',
    )!
    click(tab)
    click(button(host, '插入表格'))
    click(button(host, '插入 2 行 3 列表格'))
    await settle(() => host.querySelector('[data-element-kind="table"]') !== null)
    const visibleTable = host.querySelector('[data-element-kind="table"]')
    expect(visibleTable).not.toBeNull()
    expect(visibleTable?.querySelector('rect, line, text')).not.toBeNull()
    expect(button(host, '保存到库').disabled).toBe(false)

    const xml = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(xml).toContain('<a:tbl>')
    const reopened = await openPptxForEdit(record.saved.at(-1)!)
    const table = reopened.slides()[0]?.elements.find((element) => element.type === 'table')
    expect(table?.type).toBe('table')
    if (table?.type !== 'table') throw new Error('保存后没有原生表格')
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0]).toHaveLength(3)
  })

  it('图表工具栏只用明确输入的用户数据，画布显示并保存原生图表', async () => {
    const input = load('title-layout.pptx')
    const observedOps: unknown[] = []
    const { host, record } = await mountEditor(input, {
      hostApply: async (request) => {
        observedOps.push(request.ops[0])
        return upstreamHostApply(request)
      },
    })
    const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '插入',
    )!
    click(tab)
    click(button(host, '插入图表'))
    expect(host.textContent).toContain('数据来源：你在此输入的数值')
    expect(button(host, '按输入数据插入图表').disabled).toBe(true)
    expect(button(host, '按输入数据插入图表').title).toContain('请填写类别')
    typeInField(host, '数据系列名称', '收入')
    typeInField(host, '图表类别（每行一项）', 'Q1\nQ2')
    typeInField(host, '图表数值（每行一项）', '12')
    expect(button(host, '按输入数据插入图表').disabled).toBe(true)
    expect(button(host, '按输入数据插入图表').title).toContain('数值行数必须与类别行数相同')
    typeInField(host, '图表数值（每行一项）', '12\n18')
    expect(button(host, '按输入数据插入图表').disabled).toBe(false)
    click(button(host, '按输入数据插入图表'))
    await settle(() => host.querySelector('.mimir-pptx-slide [data-element-kind="chart"]') !== null)
    expect(observedOps).toEqual([
      expect.objectContaining({
        op: 'addChart',
        dataSource: 'user',
        categories: ['Q1', 'Q2'],
        series: [{ name: '收入', values: [12, 18] }],
      }),
    ])
    const chartNode = host.querySelector('.mimir-pptx-slide [data-element-kind="chart"]')
    expect(chartNode).not.toBeNull()
    expect(chartNode?.querySelector('rect, path, polyline')).not.toBeNull()
    expect(button(host, '保存到库').disabled).toBe(false)
    const xml = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(xml).toContain('<c:chart')
    const savedZip = await JSZip.loadAsync(record.saved.at(-1)!)
    const chartPath = Object.keys(savedZip.files).find((path) =>
      /^ppt\/charts\/chart\d+\.xml$/.test(path),
    )
    expect(chartPath).toBeDefined()
    const chartXml = await savedZip.file(chartPath!)!.async('string')
    expect(chartXml).toContain('Q1')
    expect(chartXml).toContain('Q2')
    expect(chartXml).toContain('12')
    expect(chartXml).toContain('18')
    const sourceZip = await JSZip.loadAsync(input)
    expect(await savedZip.file('ppt/theme/theme1.xml')?.async('uint8array')).toEqual(
      await sourceZip.file('ppt/theme/theme1.xml')?.async('uint8array'),
    )
    const reopened = await openPptxForEdit(record.saved.at(-1)!)
    const chart = reopened.slides()[0]?.elements.find((element) => element.type === 'chart')
    if (chart?.type !== 'chart') throw new Error('重开后图表丢失')
    expect(chart.chart.categories).toEqual(['Q1', 'Q2'])
    expect(chart.chart.series[0]?.values).toEqual([12, 18])

    const slideTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '幻灯片',
    )!
    click(slideTab)
    click(button(host, '放映时隐藏本页'))
    await settle(() => button(host, '保存到库').disabled === false)
    const secondXml = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(secondXml).toContain('<c:chart')
    const reopenedTwice = await openPptxForEdit(record.saved.at(-1)!)
    const retained = reopenedTwice.slides()[0]?.elements.find((element) => element.type === 'chart')
    expect(retained?.type === 'chart' ? retained.chart.series[0]?.values : null).toEqual([12, 18])
  })

  it('图表宿主不可用和无效数值均不能写入', async () => {
    const unavailable = await mountEditor(load('title-layout.pptx'))
    const tab = [...unavailable.host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '插入',
    )!
    click(tab)
    click(button(unavailable.host, '插入图表'))
    expect(unavailable.host.textContent).toContain('当前未连接 PPTX 宿主，无法插入图表')
    expect(unavailable.host.querySelector('button[aria-label="按输入数据插入图表"]')).toBeNull()

    const { host } = await mountEditor(load('title-layout.pptx'), { hostApply: upstreamHostApply })
    const insertTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '插入',
    )!
    click(insertTab)
    click(button(host, '插入图表'))
    typeInField(host, '数据系列名称', '收入')
    typeInField(host, '图表类别（每行一项）', 'Q1')
    typeInField(host, '图表数值（每行一项）', 'Infinity')
    expect(button(host, '按输入数据插入图表').disabled).toBe(true)
    expect(button(host, '按输入数据插入图表').title).toContain('有限数值')
    pickSelectOption(host, '图表类型', '饼图')
    typeInField(host, '图表数值（每行一项）', '-1')
    expect(button(host, '按输入数据插入图表').title).toContain('饼图数值不能为负')
    expect(host.querySelector('[data-element-kind="chart"]')).toBeNull()
    expect(button(host, '保存到库').disabled).toBe(true)
  })

  it.each([
    ['折线图', 'line'],
    ['饼图', 'pie'],
  ] as const)('图表类型 %s 写入原生图表', async (label, kind) => {
    const { host, record } = await mountEditor(load('title-layout.pptx'), {
      hostApply: upstreamHostApply,
    })
    const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '插入',
    )!
    click(tab)
    click(button(host, '插入图表'))
    pickSelectOption(host, '图表类型', label)
    typeInField(host, '数据系列名称', '占比')
    typeInField(host, '图表类别（每行一项）', '甲\n乙')
    typeInField(host, '图表数值（每行一项）', '25\n75')
    click(button(host, '按输入数据插入图表'))
    await settle(() => host.querySelector('[data-element-kind="chart"]') !== null)
    expect(host.querySelector('[data-element-kind="chart"]')).not.toBeNull()
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const reopened = await openPptxForEdit(record.saved.at(-1)!)
    const chart = reopened.slides()[0]?.elements.find((element) => element.type === 'chart')
    expect(chart?.type === 'chart' ? chart.chart.kind : null).toBe(kind)
  })

  it('图表宿主失败时保留输入和原画布', async () => {
    const { host, record } = await mountEditor(load('title-layout.pptx'), {
      hostApply: async () => {
        throw new Error('图表写入失败，请重试')
      },
    })
    const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '插入',
    )!
    click(tab)
    click(button(host, '插入图表'))
    typeInField(host, '数据系列名称', '收入')
    typeInField(host, '图表类别（每行一项）', 'Q1')
    typeInField(host, '图表数值（每行一项）', '12')
    click(button(host, '按输入数据插入图表'))
    await settle(() => host.textContent?.includes('图表写入失败，请重试') === true)
    expect(host.querySelector('[data-element-kind="chart"]')).toBeNull()
    expect(host.querySelector<HTMLInputElement>('input[aria-label="数据系列名称"]')?.value).toBe(
      '收入',
    )
    expect(
      host.querySelector<HTMLTextAreaElement>('textarea[aria-label="图表数值（每行一项）"]')?.value,
    ).toBe('12')
    expect(button(host, '保存到库').disabled).toBe(true)
    expect(record.saved).toHaveLength(0)
  })

  it('对象工具栏编辑现有单元格：显示当前值，保留其他段落和 run 并保存重开', async () => {
    const { host, record } = await mountEditor(await tableWithFormattedParagraphs(), {
      hostApply: upstreamHostApply,
    })
    const tableNode = host.querySelector('.mimir-pptx-slide [data-element-kind="table"]')
    expect(tableNode).not.toBeNull()
    click(tableNode!)
    click(button(host, '对象与幻灯片操作'))
    click(objectMenuItem(host, '编辑表格'))
    const area = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="单元格文字"]')
    expect(area?.value).toBe('Key Results')
    expect(button(host, '应用单元格文字').disabled).toBe(true)
    expect(button(host, '应用单元格文字').title).toContain('文字没有变化')
    pickSelectOption(host, '段落', '第 2 段')
    const second = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="单元格文字"]')!
    expect(second.value).toBe('Keep second')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter!.call(second, 'Keep updated')
      second.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(button(host, '应用单元格文字').disabled).toBe(false)
    click(button(host, '应用单元格文字'))
    await settle(
      () =>
        host.querySelector('[data-element-kind="table"]')?.textContent?.includes('updated') ===
        true,
    )
    expect(host.querySelector('[data-element-kind="table"]')?.textContent).toContain('Keep updated')
    const xml = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(xml).toContain('<a:t>Keep </a:t>')
    expect(xml).toContain('<a:t>updated</a:t>')
    const reopened = await openPptxForEdit(record.saved.at(-1)!)
    const table = reopened.slides()[0]?.elements.find((element) => element.type === 'table')
    if (table?.type !== 'table') throw new Error('重开后表格丢失')
    const paragraphs = table.rows[0]?.[0]?.text?.paragraphs
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs?.[0]?.runs.map((run) => run.text)).toEqual(['Key ', 'Results'])
    expect(paragraphs?.[1]?.runs.map((run) => run.text)).toEqual(['Keep ', 'updated'])
    expect(paragraphs?.[0]?.runs[0]?.bold).toBe(true)
    expect(paragraphs?.[0]?.runs[1]?.color).toBe('#C0392B')
    expect(paragraphs?.[1]?.runs[0]?.italic).toBe(true)
    expect(paragraphs?.[1]?.runs[1]?.color).toBe('#008800')
  })

  it('单元格提交成功后清除草稿，撤销时显示恢复后的当前文字', async () => {
    const { host } = await mountEditor(await tableWithFormattedParagraphs(), {
      hostApply: upstreamHostApply,
    })
    click(host.querySelector('.mimir-pptx-slide [data-element-kind="table"]')!)
    click(button(host, '对象与幻灯片操作'))
    click(objectMenuItem(host, '编辑表格'))
    const area = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="单元格文字"]')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter!.call(area, 'Changed')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click(button(host, '应用单元格文字'))
    await settle(
      () =>
        host.querySelector('[data-element-kind="table"]')?.textContent?.includes('Changed') ===
        true,
    )
    click(objectMenuItem(host, '撤销上一次对象操作'))
    await settle(
      () =>
        host.querySelector('[data-element-kind="table"]')?.textContent?.includes('Key Results') ===
        true,
    )
    click(host.querySelector('.mimir-pptx-slide [data-element-kind="table"]')!)
    click(button(host, '对象与幻灯片操作'))
    click(objectMenuItem(host, '编辑表格'))
    expect(
      host.querySelector<HTMLTextAreaElement>('textarea[aria-label="单元格文字"]')?.value,
    ).toBe('Key Results')
    expect(host.querySelector('[data-element-kind="table"]')?.textContent).toContain('Key Results')
  })

  it('表格未连接宿主时说明原因，宿主失败时保留原单元格和草稿', async () => {
    const bytes = await tableWithFormattedParagraphs()
    const unavailable = await mountEditor(bytes)
    click(unavailable.host.querySelector('.mimir-pptx-slide [data-element-kind="table"]')!)
    click(button(unavailable.host, '对象与幻灯片操作'))
    click(objectMenuItem(unavailable.host, '编辑表格'))
    expect(unavailable.host.textContent).toContain('当前未连接 PPTX 宿主，无法编辑表格单元格')
    expect(unavailable.host.querySelector('textarea[aria-label="单元格文字"]')).toBeNull()

    const { host } = await mountEditor(bytes, {
      hostApply: async () => {
        throw new Error('表格写入失败，请重试')
      },
    })
    click(host.querySelector('.mimir-pptx-slide [data-element-kind="table"]')!)
    click(button(host, '对象与幻灯片操作'))
    click(objectMenuItem(host, '编辑表格'))
    const area = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="单元格文字"]')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter!.call(area, 'Changed')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click(button(host, '应用单元格文字'))
    await settle(() => host.textContent?.includes('表格写入失败，请重试') === true)
    expect(host.querySelector('[data-element-kind="table"]')?.textContent).toContain('Key Results')
    expect(area.value).toBe('Changed')
    expect(button(host, '保存到库').disabled).toBe(true)
  })

  it('行列选择只写目标单元格', async () => {
    const { host, record } = await mountEditor(await tableWithFormattedParagraphs(), {
      hostApply: upstreamHostApply,
    })
    click(host.querySelector('.mimir-pptx-slide [data-element-kind="table"]')!)
    click(button(host, '对象与幻灯片操作'))
    click(objectMenuItem(host, '编辑表格'))
    pickSelectOption(host, '行', '第 2 行')
    pickSelectOption(host, '列', '第 2 列')
    const area = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="单元格文字"]')!
    expect(area.value).toBe('')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter!.call(area, 'Bottom right')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click(button(host, '应用单元格文字'))
    await settle(
      () =>
        host.querySelector('[data-element-kind="table"]')?.textContent?.includes('Bottom right') ===
        true,
    )
    await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const reopened = await openPptxForEdit(record.saved.at(-1)!)
    const table = reopened.slides()[0]?.elements.find((element) => element.type === 'table')
    if (table?.type !== 'table') throw new Error('重开后表格丢失')
    expect(table.rows[1]?.[1]?.text?.paragraphs[0]?.runs[0]?.text).toBe('Bottom right')
    expect(table.rows[0]?.[0]?.text?.paragraphs[0]?.runs.map((run) => run.text)).toEqual([
      'Key ',
      'Results',
    ])
  })

  it('表格宿主不可用时给出原因，不展示可点击的尺寸网格', async () => {
    const { host } = await mountEditor(load('title-layout.pptx'))
    const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '插入',
    )!
    click(tab)
    click(button(host, '插入表格'))
    expect(host.textContent).toContain('当前未连接 PPTX 宿主，无法插入表格')
    expect(host.querySelector('[aria-label="插入 2 行 3 列表格"]')).toBeNull()
  })

  it('插入表格失败时保留原画布并显示宿主原因', async () => {
    const { host } = await mountEditor(load('title-layout.pptx'), {
      hostApply: async () => {
        throw new Error('表格插入失败，请重试')
      },
    })
    const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '插入',
    )!
    click(tab)
    click(button(host, '插入表格'))
    click(button(host, '插入 2 行 3 列表格'))
    await settle(() => host.textContent?.includes('表格插入失败，请重试') === true)
    expect(host.textContent).toContain('表格插入失败，请重试')
    expect(host.querySelector('[data-element-kind="table"]')).toBeNull()
    expect(button(host, '保存到库').disabled).toBe(true)
  })

  it('图片不透明度在画布立即更新，并保存重开', async () => {
    const { host, record } = await mountEditor(load('image-deck.pptx'), {
      hostApply: upstreamHostApply,
    })
    const picture = host.querySelector('.mimir-pptx-slide [data-element-kind="picture"]')
    expect(picture).not.toBeNull()
    click(picture!)
    click(objectMenuItem(host, '图片不透明度 50%'))
    await settle(
      () =>
        host.querySelector('[data-element-kind="picture"] image')?.getAttribute('opacity') ===
        '0.5',
    )
    expect(host.querySelector('[data-element-kind="picture"] image')?.getAttribute('opacity')).toBe(
      '0.5',
    )

    const xml = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(xml).toContain('<a:alphaModFix amt="50000"/>')
    const reopened = await openPptxForEdit(record.saved.at(-1)!)
    const savedPicture = reopened
      .slides()[0]
      ?.elements.find((element) => element.type === 'picture')
    expect(savedPicture?.type === 'picture' ? savedPicture.opacity : null).toBe(0.5)
  })

  it('图片宿主不可用时禁用操作并说明原因', async () => {
    const { host } = await mountEditor(load('image-deck.pptx'))
    const picture = host.querySelector('.mimir-pptx-slide [data-element-kind="picture"]')
    expect(picture).not.toBeNull()
    click(picture!)
    const item = objectMenuItem(host, '图片不透明度 50%')
    expect(item.disabled).toBe(true)
    expect(item.getAttribute('title')).toContain('当前未连接 PPTX 宿主')
  })

  it('图片修改失败时保持当前透明度并显示原因', async () => {
    const { host } = await mountEditor(load('image-deck.pptx'), {
      hostApply: async () => {
        throw new Error('图片修改失败，请重试')
      },
    })
    const picture = host.querySelector('.mimir-pptx-slide [data-element-kind="picture"]')
    expect(picture).not.toBeNull()
    click(picture!)
    click(objectMenuItem(host, '图片不透明度 50%'))
    await settle(() => host.textContent?.includes('图片修改失败，请重试') === true)
    expect(host.textContent).toContain('图片修改失败，请重试')
    expect(
      host.querySelector('[data-element-kind="picture"] image')?.getAttribute('opacity'),
    ).toBeNull()
    expect(button(host, '保存到库').disabled).toBe(true)
  })

  it('本地 PNG 从插入工具栏写入画布、原生媒体与保存重开', async () => {
    const { host, record } = await mountEditor(load('title-layout.pptx'), {
      hostPicture: upstreamHostPicture,
    })
    const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '插入',
    )!
    click(tab)
    await pickImage(host, '插入图片', await imageBytes())
    await settle(
      () => host.querySelector('.mimir-pptx-slide [data-element-kind="picture"] image') !== null,
    )
    expect(
      host.querySelector('.mimir-pptx-slide [data-element-kind="picture"] image'),
    ).not.toBeNull()
    const xml = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(xml).toContain('<p:pic>')
    const zip = await JSZip.loadAsync(record.saved.at(-1)!)
    expect(zip.file('ppt/media/image1.png')).not.toBeNull()
    const reopened = await openPptxForEdit(record.saved.at(-1)!)
    expect(reopened.slides()[0]?.elements.some((element) => element.type === 'picture')).toBe(true)
  })

  it('替换选中图片后画布与保存文件均更新', async () => {
    const { host, record } = await mountEditor(load('image-deck.pptx'), {
      hostPicture: upstreamHostPicture,
    })
    const picture = host.querySelector('.mimir-pptx-slide [data-element-kind="picture"]')
    expect(picture).not.toBeNull()
    const beforeImage = picture?.querySelector('image')?.getAttribute('href')
    click(picture!)
    click(button(host, '对象与幻灯片操作'))
    await pickImage(host, '替换选中图片', ONE_PIXEL_PNG)
    await settle(
      () =>
        host
          .querySelector('.mimir-pptx-slide [data-element-kind="picture"] image')
          ?.getAttribute('href') !== beforeImage,
    )
    expect(
      host
        .querySelector('.mimir-pptx-slide [data-element-kind="picture"] image')
        ?.getAttribute('href'),
    ).not.toBe(beforeImage)
    const xml = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(xml).toContain('<p:pic>')
    const reopened = await openPptxForEdit(record.saved.at(-1)!)
    const savedPicture = reopened
      .slides()[0]
      ?.elements.find((element) => element.type === 'picture')
    expect(savedPicture?.type).toBe('picture')
    if (savedPicture?.type !== 'picture') throw new Error('保存后没有图片')
    const zip = await JSZip.loadAsync(record.saved.at(-1)!)
    expect(await zip.file(savedPicture.mediaRef)?.async('uint8array')).toEqual(ONE_PIXEL_PNG)
  })

  it('图片宿主不可用与失败时不把画布标脏', async () => {
    const absent = await mountEditor(load('title-layout.pptx'))
    const tab = [...absent.host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '插入',
    )!
    click(tab)
    expect(button(absent.host, '插入图片').disabled).toBe(true)
    expect(button(absent.host, '插入图片').title).toContain('未连接 PPTX 图片宿主')

    const failed = await mountEditor(load('title-layout.pptx'), {
      hostPicture: async () => {
        throw new Error('图片写入失败，请重试')
      },
    })
    const failedTab = [...failed.host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '插入',
    )!
    click(failedTab)
    await pickImage(failed.host, '插入图片', await imageBytes())
    await settle(() => failed.host.textContent?.includes('图片写入失败，请重试') === true)
    expect(failed.host.querySelector('.mimir-pptx-slide [data-element-kind="picture"]')).toBeNull()
    expect(button(failed.host, '保存到库').disabled).toBe(true)
  })

  it('手动调整对象层级与翻转经 Agent 共用操作保存读回', async () => {
    const { host, record } = await mountEditor(load('title-layout.pptx'), {
      hostApply: upstreamHostApply,
    })
    selectOnCanvas(host, 0)
    click(objectMenuItem(host, '置于顶层'))
    await settle(
      () =>
        host.querySelector<HTMLButtonElement>('button[aria-label="保存到库"]')?.disabled === false,
    )
    const firstXml = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(firstXml.indexOf('name="Title 1"')).toBeGreaterThan(
      firstXml.indexOf('name="Subtitle 2"'),
    )
    const first = await openPptxForEdit(record.saved.at(-1)!)
    expect(first.slides()[0]?.elements.at(-1)?.name).toBe('Title 1')

    selectOnCanvas(host, 1)
    click(objectMenuItem(host, '水平翻转'))
    await settle(
      () =>
        host.querySelector<HTMLButtonElement>('button[aria-label="保存到库"]')?.disabled === false,
    )
    const flippedXml = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(elementXml(flippedXml, 'Title 1')).toMatch(/flipH="1"/)
    const reopened = await openPptxForEdit(record.saved.at(-1)!)
    expect(
      reopened.slides()[0]?.elements.find((item) => item.name === 'Title 1')?.transform.flipH,
    ).toBe(true)
  })

  it('本页背景与放映隐藏共用宿主操作，保存后可独立读回', async () => {
    const { host, record } = await mountEditor(load('title-layout.pptx'), {
      hostApply: upstreamHostApply,
    })
    click(button(host, '对象与幻灯片操作'))
    click(button(host, '本页背景颜色'))
    const red = [...host.querySelectorAll('button[aria-label]')].find(
      (item) => item.getAttribute('aria-label') === '红',
    )
    expect(red).toBeDefined()
    click(red!)
    await settle(
      () =>
        host.querySelector<HTMLButtonElement>('button[aria-label="保存到库"]')?.disabled === false,
    )
    const backgroundXml = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(backgroundXml).toContain('FF0000')

    click(objectMenuItem(host, '在放映中隐藏本页'))
    await settle(() => host.textContent?.includes('这一页在放映时隐藏') === true)
    const hiddenXml = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(hiddenXml).toContain('show="0"')
    expect(hiddenXml).toContain('FF0000')
    const reopened = await openPptxForEdit(record.saved.at(-1)!)
    expect(reopened.slides()[0]?.background).toMatchObject({ type: 'solid', color: '#FF0000' })
  })

  it('在两 run 的段落里改字：只动那一条，标签的加粗与字号都还在', async () => {
    /*
     * 这一条守的是**段落输入框**那条路（与格式按钮无关）。原先的写法是「每段回传
     * 一条 run」，于是在正文里改一个字会把同段的两条 run 压成一条、取
     * `dominantRun` 的格式——标签的 `b="1" sz="3600"` 悄悄没了，而保存成功、
     * 文字也对。修法是取新旧文本的公共前后缀，只改真正变动的那条 run。
     */
    const deck = await twoRunUpstreamDeck()
    const { host, record } = await mountEditor(deck)
    await jumpToPage(host, 3)
    const label = [...host.querySelectorAll('.mimir-pptx-slide [data-element-id]')].find((node) =>
      node.textContent?.includes('Key'),
    )!
    expect(label).toBeDefined()
    click(label)

    // 第一个段落输入框里是「Key Results」——只把正文那半句改掉
    const area = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
    expect(area.value).toBe('Key Results')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter!.call(area, 'Key 成果')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const after = await saveAndRead(host, record, 'ppt/slides/slide3.xml')
    const runs = textRunBlocks(elementXml(after, 'TextBox 2'))
    // 两条 run 都还在，各自的字号与颜色都没动，只有第二条的文本变了
    expect(runs).toHaveLength(2)
    expect(runs[0]).toContain('<a:t>Key </a:t>')
    expect(runs[0]).toContain('b="1"')
    expect(runs[0]).toContain('sz="3600"')
    expect(runs[0]).toContain('<a:srgbClr val="1F2937"/>')
    expect(runs[1]).toContain('<a:t>成果</a:t>')
    expect(runs[1]).toContain('sz="2400"')
    expect(runs[1]).toContain('<a:srgbClr val="C0392B"/>')
  })

  it('段尾追加一个字符：两条 run 都还在，各自的格式不变', async () => {
    /*
     * 这一条守的是「改动落在**段尾**」的情形（上一轮实测的高危问题）。取公共
     * 前后缀之后，纯插入的区间是**零宽**的——它与 0 条 run 相交，于是
     * `editParagraphRuns` 返回 null、调用方提交「整段一条 run」，两条 run 被压成
     * 一条、第二条的 sz 与颜色被静默丢掉。修复后插入必须落进插入点所在的那条
     * run（段尾 = 最后一条），其余 run 原样。
     */
    const deck = await twoRunUpstreamDeck()
    const { host, record } = await mountEditor(deck)
    await jumpToPage(host, 3)
    const label = [...host.querySelectorAll('.mimir-pptx-slide [data-element-id]')].find((node) =>
      node.textContent?.includes('Key'),
    )!
    expect(label).toBeDefined()
    click(label)

    const area = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
    expect(area.value).toBe('Key Results')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter!.call(area, 'Key Results!')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const after = await saveAndRead(host, record, 'ppt/slides/slide3.xml')
    const runs = textRunBlocks(elementXml(after, 'TextBox 2'))
    // 两条 run 都还在：新字符落在末尾那条（红字正文），标签那条一个字节没动
    expect(runs).toHaveLength(2)
    expect(runs[0]).toContain('<a:t>Key </a:t>')
    expect(runs[0]).toContain('b="1"')
    expect(runs[0]).toContain('sz="3600"')
    expect(runs[0]).toContain('<a:srgbClr val="1F2937"/>')
    expect(runs[1]).toContain('<a:t>Results!</a:t>')
    expect(runs[1]).toContain('sz="2400"')
    expect(runs[1]).toContain('<a:srgbClr val="C0392B"/>')
  })

  it('段首插入一个字符：两条 run 都还在，各自的格式不变', async () => {
    /*
     * 段首与段尾是同一个根因的另一面：纯插入的区间是零宽的，与 0 条 run 相交。
     * 修复前同样走到「整段重写」、把两条 run 压成一条。新字符的归属是第一条
     * run（在「Key 」的开头打字，新字跟着标签的格式走）。
     */
    const deck = await twoRunUpstreamDeck()
    const { host, record } = await mountEditor(deck)
    await jumpToPage(host, 3)
    const label = [...host.querySelectorAll('.mimir-pptx-slide [data-element-id]')].find((node) =>
      node.textContent?.includes('Key'),
    )!
    expect(label).toBeDefined()
    click(label)

    const area = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter!.call(area, '※Key Results')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const after = await saveAndRead(host, record, 'ppt/slides/slide3.xml')
    const runs = textRunBlocks(elementXml(after, 'TextBox 2'))
    expect(runs).toHaveLength(2)
    expect(runs[0]).toContain('<a:t>※Key </a:t>')
    expect(runs[0]).toContain('b="1"')
    expect(runs[0]).toContain('sz="3600"')
    expect(runs[0]).toContain('<a:srgbClr val="1F2937"/>')
    expect(runs[1]).toContain('<a:t>Results</a:t>')
    expect(runs[1]).toContain('sz="2400"')
    expect(runs[1]).toContain('<a:srgbClr val="C0392B"/>')
  })

  it('run 边界插入一个字符：两条 run 都还在，各自的格式不变', async () => {
    /*
     * 插入点正好落在两条 run 的交界（「Key 」与「Results」之间）——零宽区间
     * 与 0 条 run 相交的第三种来源。归属规则是插入点前那个字符所在的 run
     * （「Key 」），与「在加粗文字后面接着打字、新字也是加粗的」一致。
     */
    const deck = await twoRunUpstreamDeck()
    const { host, record } = await mountEditor(deck)
    await jumpToPage(host, 3)
    const label = [...host.querySelectorAll('.mimir-pptx-slide [data-element-id]')].find((node) =>
      node.textContent?.includes('Key'),
    )!
    expect(label).toBeDefined()
    click(label)

    const area = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter!.call(area, 'Key ·Results')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const after = await saveAndRead(host, record, 'ppt/slides/slide3.xml')
    const runs = textRunBlocks(elementXml(after, 'TextBox 2'))
    expect(runs).toHaveLength(2)
    expect(runs[0]).toContain('<a:t>Key ·</a:t>')
    expect(runs[0]).toContain('b="1"')
    expect(runs[0]).toContain('sz="3600"')
    expect(runs[0]).toContain('<a:srgbClr val="1F2937"/>')
    expect(runs[1]).toContain('<a:t>Results</a:t>')
    expect(runs[1]).toContain('sz="2400"')
    expect(runs[1]).toContain('<a:srgbClr val="C0392B"/>')
  })

  it('在软换行的下一行行首打字：换行与两条文字 run 都还在，新字落在第二行那条', async () => {
    /*
     * 纯插入的落点若掉进软换行哨兵（`text === '\n'` 的那条 run），哨兵就不再
     * 是 `'\n'`，`patchTextElementXml` 的逐 run 对齐失效、退化成整段重建——
     * 明明只加一个字。落点规则把「换行之后」的插入改落到下一行那条 run 的
     * 开头。夹具的两行给了**不同字号**（28pt / 24pt）：修复前走整段重写，两行
     * 被并成一条 run 重建、都取 dominantRun 的 28pt——第二行的 24pt 静默丢失；
     * 修复后逐 run 外科式补丁，各自的字号原样。
     */
    const zip = await JSZip.loadAsync(load('formatted-text.pptx'))
    const slide = await zip.file('ppt/slides/slide1.xml')!.async('string')
    const twoLine = slide.replace(
      '<a:t>加粗大字</a:t>',
      '<a:t>加粗</a:t></a:r><a:br/><a:r><a:rPr b="1" sz="2400"/><a:t>大字</a:t>',
    )
    expect(twoLine).not.toBe(slide)
    zip.file('ppt/slides/slide1.xml', twoLine)

    const { host, record } = await mountEditor(await zip.generateAsync({ type: 'uint8array' }))
    selectOnCanvas(host, 0)
    const area = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
    expect(area.value).toBe('加粗\n大字\n斜体小字')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter!.call(area, '加粗\nX大字\n斜体小字')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const after = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const sp = elementXml(after, 'TextBox 1')
    const runs = textRunBlocks(sp)
    /*
     * `<a:br/>` 不是 `<a:r>`，所以这个元素共 3 条：第一段两条（加粗 / X大字，
     * 中间隔着换行）加第二段一条（斜体小字）。第一段的两条**各自的字号**都
     * 还在——第二行是 24pt，没有被重写并成第一行的 28pt。
     */
    expect(runs).toHaveLength(3)
    expect(runs[0]).toContain('<a:t>加粗</a:t>')
    expect(runs[0]).toContain('sz="2800"')
    expect(runs[1]).toContain('<a:t>X大字</a:t>')
    expect(runs[1]).toContain('sz="2400"')
    expect(runs[2]).toContain('<a:t>斜体小字</a:t>')
    expect(sp.indexOf('<a:br/>')).toBeGreaterThan(sp.indexOf('加粗'))
    expect(sp.indexOf('<a:br/>')).toBeLessThan(sp.indexOf('X大字'))
  })

  it('整段重写（跨两条 run 的改动）：新文字跟正文那条 run 的格式走，不钉死在第一条', async () => {
    /*
     * 跨了两条 run 的改动（整段删了重打）确实只能整段重写——但格式取谁是有
     * 约定的：`applyEditParagraphs` 对「未带 srcRun 的单 run 替换多 run 段落」
     * 取 `dominantRun`（正文那条，a rewrite of the whole paragraph is not a
     * rewrite of its label）。原先回传写死 `srcRun: 0`，绕开了它、钉死在标签
     * 那条上——正文 24pt 红字被换成标签的 36pt 深灰加粗。
     */
    const deck = await twoRunUpstreamDeck()
    const { host, record } = await mountEditor(deck)
    await jumpToPage(host, 3)
    const label = [...host.querySelectorAll('.mimir-pptx-slide [data-element-id]')].find((node) =>
      node.textContent?.includes('Key'),
    )!
    expect(label).toBeDefined()
    click(label)

    const area = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter!.call(area, '全新标题')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const after = await saveAndRead(host, record, 'ppt/slides/slide3.xml')
    const runs = textRunBlocks(elementXml(after, 'TextBox 2'))
    // 重写后只有一条 run（文本与原来对不上号），格式跟正文（24pt 红字）走
    expect(runs).toHaveLength(1)
    expect(runs[0]).toContain('<a:t>全新标题</a:t>')
    expect(runs[0]).toContain('sz="2400"')
    expect(runs[0]).toContain('<a:srgbClr val="C0392B"/>')
    expect(runs[0]).not.toContain('b="1"')
    expect(runs[0]).not.toContain('sz="3600"')
  })

  it('两 run 的段落不会被压成一条（这一版最关键的一条）', async () => {
    const deck = await twoRunUpstreamDeck()

    const { host, record } = await mountEditor(deck)
    await jumpToPage(host, 3)
    const nodes = [...host.querySelectorAll('.mimir-pptx-slide [data-element-id]')]
    const label = nodes.find((node) => node.textContent?.includes('Key'))!
    expect(label, '第 3 页上应当有那个两 run 的文本框').toBeDefined()
    click(label)

    click(button(host, '倾斜（整框）'))
    const after = await saveAndRead(host, record, 'ppt/slides/slide3.xml')
    const runs = textRunBlocks(elementXml(after, 'TextBox 2'))
    // 两条 run 都还在，各自保留自己的字号与颜色
    expect(runs).toHaveLength(2)
    expect(runs[0]).toContain('sz="3600"')
    expect(runs[0]).toContain('b="1"')
    expect(runs[0]).toContain('<a:srgbClr val="1F2937"/>')
    expect(runs[1]).toContain('sz="2400"')
    expect(runs[1]).toContain('<a:srgbClr val="C0392B"/>')
    // 两条都变斜了，但两条的文本与其余属性没被动
    expect(runs[0]).toContain('i="1"')
    expect(runs[1]).toContain('i="1"')
    expect(runs[0]).toContain('<a:t>Key </a:t>')
    expect(runs[1]).toContain('<a:t>Results</a:t>')
  })

  it('文字编辑仍然工作，且不会把格式清掉', async () => {
    const { host, record } = await mountEditor(load('formatted-text.pptx'))
    const id = selectOnCanvas(host, 0)
    const area = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(area, '改过的第一段\n斜体小字')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const after = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    expect(after).toContain('改过的第一段')
    const runs = textRunBlocks(elementXml(after, 'TextBox 1'))
    // 只改了文字，这一段的字形、字号与颜色一个都没动
    expect(runs[0]).toContain('b="1"')
    expect(runs[0]).toContain('sz="2800"')
    expect(runs[0]).toContain('<a:srgbClr val="C0392B"/>')
    // 第二段原样
    expect(runs[1]).toContain('<a:t>斜体小字</a:t>')
    expect(id).not.toBe('')
  })

  it('段落里的软换行是真 textarea 才保得住（换单行输入会静默删掉 `<a:br/>`）', async () => {
    /*
     * 这一条守的是「为什么段落框必须是 `<textarea>`」（`ToolbarTextArea`）。
     * 软换行 `<a:br/>` 在模型里是一条 `text === '\n'` 的 run，而**单行 `<input>`
     * 会在值消毒时把 `\n` 直接删掉**（实测：happy-dom 里 `input.value = 'a\nb'`
     * 读回来是 `"ab"`，textarea 是 `"a\nb"`；`PptxEditor.tsx` 的注释里也记着）。
     * 那样「改一个字」会顺手把换行也删了，而保存成功、界面不报错。
     *
     * 夹具里没有现成的 `<a:br/>`，所以先把第 1 段的文本改成两行（`\n` 会被
     * `generateRunXml` 重写成 `<a:r>…</a:r><a:br/><a:r>…`），再从界面改一次。
     */
    const zip = await JSZip.loadAsync(load('formatted-text.pptx'))
    const slide = await zip.file('ppt/slides/slide1.xml')!.async('string')
    const twoLine = slide.replace(
      '<a:t>加粗大字</a:t>',
      '<a:t>加粗</a:t></a:r><a:br/><a:r><a:rPr b="1" sz="2800"/><a:t>大字</a:t>',
    )
    expect(twoLine).not.toBe(slide)
    zip.file('ppt/slides/slide1.xml', twoLine)

    const { host, record } = await mountEditor(await zip.generateAsync({ type: 'uint8array' }))
    selectOnCanvas(host, 0)
    const area = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
    // 换行在框里读得到——它没有被消毒掉（这是这一条断言的前提）
    expect(area.value).toBe('加粗\n大字\n斜体小字')

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      // 只改第二行的两个字：改动落在倒数第一条 run 内
      setter?.call(area, '加粗\n小字\n斜体小字')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const after = await saveAndRead(host, record, 'ppt/slides/slide1.xml')
    const sp = elementXml(after, 'TextBox 1')
    // 换行还在（`<a:br/>` 与它两侧的 run 都保住了）
    expect(after).toContain('<a:br/>')
    expect(after).toContain('加粗')
    expect(after).toContain('小字')
    expect(after).not.toContain('大字')
    // 第二段（斜体小字）没被这次改动碰到；第一段仍是「一条 run + br + 一条 run」
    expect(textRunBlocks(sp)).toHaveLength(3)
    expect(elementXml(after, 'TextBox 1')).toContain('<a:t>斜体小字</a:t>')
    expect(sp.indexOf('<a:br/>')).toBeLessThan(sp.indexOf('小字'))
    expect(sp.indexOf('加粗')).toBeLessThan(sp.indexOf('<a:br/>'))
  })
})

describe('pptx 工具条：查找和替换', () => {
  it('切到对象分类后仍可用 Ctrl+F 打开查找', async () => {
    const { host } = await mountEditor(load('title-layout.pptx'))
    const objectTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '对象',
    )!
    click(objectTab)
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true })))
    expect(host.querySelector('input[data-find-input]')).not.toBeNull()
  })

  it('跨页命中会被带出来，替换之后原文没了', async () => {
    const { host, record } = await mountEditor(load('upstream/01_standard_business.pptx'))
    click(button(host, '查找和替换'))

    const query = host.querySelector<HTMLInputElement>('input[aria-label="查找内容"]')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(query, 'Agenda')
      query.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // 匹配数由适配器报给这一条栏（它会重扫：query 是受控 prop）
    await act(async () => {
      await Promise.resolve()
    })
    expect(host.textContent).toContain('1 / 1')

    // 「Agenda」在第 2 页；点「下一个匹配」应当把那一页带出来
    click(button(host, '下一个匹配'))
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('第 2 / 5 页')

    const replace = host.querySelector<HTMLInputElement>('input[aria-label="替换为"]')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(replace, '议程')
      replace.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click(button(host, '全部替换'))

    const after = await saveAndRead(host, record, 'ppt/slides/slide2.xml')
    expect(after).toContain('议程')
    expect(after).not.toContain('Agenda')
    // 替换不该把那一页的其余文字弄丢
    expect(after).toContain('Financial results')
  })

  it('没有可查内容时整条栏空转（adapter 的形参写错会让这里炸）', async () => {
    const { host } = await mountEditor(load('title-layout.pptx'))
    click(button(host, '查找和替换'))
    const query = host.querySelector<HTMLInputElement>('input[aria-label="查找内容"]')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(query, '第')
      query.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
    })
    // 标题与正文里各有一个「第」字
    expect(host.querySelector('.me-find__count')?.textContent).toBe('1 / 2')
    // 关闭按钮把栏收掉，并把高亮撤掉
    click(button(host, '关闭查找'))
    expect(host.querySelector('.me-find')).toBeNull()
  })
})

describe('pptx 次工具条：翻页与隐藏标记', () => {
  it('跳到第 N 页：夹到 1..页数', async () => {
    const { host } = await mountEditor(load('upstream/01_standard_business.pptx'))
    const field = host.querySelector<HTMLInputElement>('input[aria-label="跳到第几页"]')!
    /*
     * 上界走 `aria-valuemax`（antd 的 InputNumber 用 ARIA 表达取值区间，不再
     * 写原生 `max` 属性）——读屏因此也拿得到「最大 5 页」，比原来那条更强。
     */
    expect(field.getAttribute('aria-valuemax')).toBe('5')
    expect(field.getAttribute('aria-valuemin')).toBe('1')

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      // 99 超出上界：ToolbarNumberField 必须夹到 5
      setter?.call(field, '99')
      field.dispatchEvent(new Event('input', { bubbles: true }))
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('第 5 / 5 页')
  })

  it('隐藏页只标记、不改变页序（`<p:sld show="0">`）', async () => {
    // 把第 2 页标成 show="0"
    const zip = await JSZip.loadAsync(load('upstream/01_standard_business.pptx'))
    const slide = await zip.file('ppt/slides/slide2.xml')!.async('string')
    const hidden = slide.replace(/<p:sld\b([^>]*)>/, '<p:sld$1 show="0">')
    expect(hidden).not.toBe(slide)
    zip.file('ppt/slides/slide2.xml', hidden)
    const deck = await zip.generateAsync({ type: 'uint8array' })

    const { host } = await mountEditor(deck)
    // 第 1 页没有标记
    expect(host.textContent).not.toContain('这一页在放映时隐藏')

    const second = [...host.querySelectorAll('.me-tab')].find((tab) => tab.textContent === '2')!
    click(second)
    expect(host.textContent).toContain('这一页在放映时隐藏')
    // 页数没有变（隐藏不是删除）
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('第 2 / 5 页')
  })
})

describe('pptx 缩略图与页级操作', () => {
  it('复制后删除副本恢复未修改状态', async () => {
    const { host } = await mountEditor(load('upstream/01_standard_business.pptx'))
    await slideAction(host, 1, '复制此幻灯片')
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('未保存')
    await slideAction(host, 2, '删除此幻灯片')
    expect(host.querySelectorAll('.mimir-page-browser__item')).toHaveLength(5)
    expect(host.querySelector('.mimir-editor__status')?.textContent).not.toContain('未保存')
    expect(button(host, '保存到库').disabled).toBe(true)
  })

  it('缩略图显示每页真实内容，点击后画布与页码同步', async () => {
    const { host } = await mountEditor(load('upstream/01_standard_business.pptx'))
    const previews = host.querySelectorAll('.mimir-page-browser__preview svg')
    expect(previews.length).toBeGreaterThanOrEqual(2)
    const first = previews[0]?.textContent
    const second = previews[1]?.textContent
    expect(first?.length).toBeGreaterThan(0)
    expect(second?.length).toBeGreaterThan(0)
    expect(first).not.toBe(second)
    click(button(host, '第 2 幻灯片'))
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('第 2 / 5 页')
    expect(button(host, '第 2 幻灯片').getAttribute('aria-current')).toBe('page')
    expect(host.querySelector('.mimir-pptx-slide svg')?.textContent).toBe(second)
  })

  it('新增、复制、移动、删除后保存并重新打开，内容与顺序一致', async () => {
    const original = load('upstream/01_standard_business.pptx')
    const source = await openPptxForEdit(original)
    const sourcePath = source.slides()[1]?.path
    const { host, record } = await mountEditor(original)

    await slideAction(host, 2, '复制此幻灯片')
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('第 3 / 6 页')
    expect(host.querySelectorAll('.mimir-page-browser__item')).toHaveLength(6)

    await slideAction(host, 3, '下移')
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('第 4 / 6 页')
    await slideAction(host, 4, '删除此幻灯片')
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('第 4 / 5 页')

    click(button(host, '新增幻灯片'))
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('第 5 / 6 页')
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('未保存')

    await saveAndRead(host, record, 'ppt/presentation.xml')
    const reopened = await openPptxForEdit(record.saved.at(-1)!)
    expect(reopened.slides()).toHaveLength(6)
    expect(reopened.slides()[1]?.path).toBe(sourcePath)
    expect(reopened.slides()[4]?.elements).toHaveLength(0)
  })

  it('拖放排序选择被移动页，操作菜单提供键盘可触发的上移', async () => {
    const { host } = await mountEditor(load('upstream/01_standard_business.pptx'))
    const first = host.querySelectorAll('.mimir-page-browser__preview svg')[0]?.textContent
    const items = host.querySelectorAll<HTMLElement>('.mimir-page-browser__item')
    const transfer = { effectAllowed: '', dropEffect: '', setData: () => undefined }
    const dragEvent = (type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', { value: transfer })
      Object.defineProperty(event, 'clientY', { value: 1 })
      return event
    }
    act(() => {
      items[0]!.dispatchEvent(dragEvent('dragstart'))
    })
    act(() => {
      items[2]!.dispatchEvent(dragEvent('dragover'))
    })
    act(() => {
      items[2]!.dispatchEvent(dragEvent('drop'))
    })
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('第 3 / 5 页')
    expect(host.querySelectorAll('.mimir-page-browser__preview svg')[2]?.textContent).toBe(first)

    act(() => {
      button(host, '第 3 幻灯片').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }),
      )
    })
    await act(async () => {
      await new Promise((tick) => setTimeout(tick, 0))
    })
    const menu = [...host.querySelectorAll<HTMLElement>('.ant-dropdown')].findLast(
      (node) => !node.classList.contains('ant-dropdown-hidden'),
    )
    const up = [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].find(
      (node) => node.textContent?.trim() === '上移',
    )
    expect(up).toBeDefined()
    expect(document.activeElement?.closest('.ant-dropdown-menu')).not.toBeNull()
    act(() => {
      up!.focus()
      up!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }),
      )
    })
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('第 2 / 5 页')
  })

  it('缩略图栏可收起并重新打开，单页不能删除', async () => {
    const { host } = await mountEditor(load('upstream/01_standard_business.pptx'))
    expect(host.querySelectorAll('.mimir-page-browser__menu-button')).toHaveLength(0)
    expect(host.querySelector('.mimir-page-browser')?.getAttribute('data-open')).toBe('auto')
    click(button(host, '收起缩略图'))
    expect(host.querySelector('.mimir-page-browser__sidebar')?.hasAttribute('hidden')).toBe(true)
    click(button(host, '显示缩略图'))
    expect(host.querySelector('.mimir-page-browser__sidebar')?.hasAttribute('hidden')).toBe(false)
    expect(host.querySelector('.mimir-page-browser')?.getAttribute('data-open')).toBe('open')
    click(button(host, '第 1 幻灯片'))
    expect(host.querySelector('.mimir-page-browser')?.getAttribute('data-open')).toBe('auto')
    const first = host.querySelector('.mimir-page-browser__item') as HTMLElement
    expect(first.getAttribute('draggable')).toBe('true')

    const single = await mountEditor(load('formatted-text.pptx'))
    expect(single.host.querySelectorAll('.mimir-page-browser__item')).toHaveLength(1)
    act(() => {
      single.host
        .querySelector('.mimir-page-browser__item')!
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })
    await act(async () => {
      await new Promise((tick) => setTimeout(tick, 0))
    })
    const deleteItem = [...single.host.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (node) => node.textContent?.trim().startsWith('删除此幻灯片'),
    )
    expect(deleteItem?.getAttribute('aria-disabled')).toBe('true')
    expect(deleteItem?.textContent).toContain('至少保留一张幻灯片')
  })

  it('触屏长按打开同一页操作菜单，结束触碰不会误选页', async () => {
    const { host } = await mountEditor(load('upstream/01_standard_business.pptx'))
    const item = host.querySelectorAll<HTMLElement>('.mimir-page-browser__item')[1]!
    act(() => {
      item.dispatchEvent(touchPointer('pointerdown'))
    })
    await act(async () => {
      await new Promise((tick) => setTimeout(tick, 580))
    })
    const menu = [...host.querySelectorAll<HTMLElement>('.ant-dropdown')].findLast(
      (node) => !node.classList.contains('ant-dropdown-hidden'),
    )
    expect(menu?.textContent).toContain('复制此幻灯片')
    act(() => {
      item.dispatchEvent(touchPointer('pointerup'))
    })
    click(button(host, '第 2 幻灯片'))
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('第 1 / 5 页')
  })
})

describe('pptx 模型的入口断言（组件之外的事实）', () => {
  it('选定页码的 input 上界等于幻灯片张数', async () => {
    const session = await openPptxForEdit(load('upstream/01_standard_business.pptx'))
    expect(session.slides()).toHaveLength(5)
    // 与组件读的同一个来源（`view().slides().length`）
    expect(session.view().slides()).toHaveLength(5)
  })

  it('夹具里的两段文字：改一段只动那一段', async () => {
    const session = await openPptxForEdit(load('formatted-text.pptx'))
    const el = editableElements(session.slides()[0]!)[0]!
    const texts = textOfElement(el)!.paragraphs.map((p) => p.runs.map((r) => r.text).join(''))
    expect(texts).toEqual(['加粗大字', '斜体小字'])
  })
})

/* ── 控件契约：没有绕过点、尺寸落在 small 档、禁用给原因 ─────────── */

describe('PptxEditor 的控件契约', () => {
  /**
   * 扫的是**源码文本**，不是渲染结果——渲染结果里永远能找到 antd 自己渲染的
   * `<input>`（Select / InputNumber / Upload 都带），所以「有没有人手写原生
   * 控件」只能在源码这一层问。注释先剥掉：上面那段说明里就写着上一版那个
   * `<textarea className="mimir-paras__item">`，不剥会把守护弄红。
   */
  const source = readFileSync(resolve(HERE, 'PptxEditor.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('没有手写的 button / input / select / textarea', () => {
    const hits = source.match(/<(button|input|select|textarea)[\s>/]/g) ?? []
    expect(hits, `PptxEditor.tsx 里还有原生控件：${hits.join(' ')}`).toEqual([])
  })

  it('不直接 import antd：控件只经过外壳的原语', () => {
    // 直接 import 会把「尺寸档 / 按下 preventDefault / 禁用给原因」三条约定
    // 各绕开一处，而绕开之后界面看着没问题
    expect(source).not.toMatch(/from\s+'antd'/)
  })

  it('完整文本框用一个 antd 多行输入，真实选区可以跨段', async () => {
    const { host } = await mountEditor(load('formatted-text.pptx'))
    selectOnCanvas(host, 0)
    const areas = [
      ...host.querySelectorAll<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]'),
    ]
    expect(areas).toHaveLength(1)
    const area = areas[0]!
    expect(area.classList.contains('ant-input')).toBe(true)
    expect(area.classList.contains('ant-input-sm')).toBe(true)
    expect(area.value).toBe('加粗大字\n斜体小字')
    expect(area.getAttribute('aria-describedby')).toBeTruthy()
    expect(host.textContent).toContain('整个文本框')
  })

  it('控件都落在 small 档（EditorShell 那层 ConfigProvider 盖到了这棵子树）', async () => {
    const { host } = await mountEditor(load('upstream/01_standard_business.pptx'))
    selectOnCanvas(host, 0)

    // 判据是 antd 自己的尺寸档类：happy-dom 下**计算高度取不到**（返回空串，
    // 与「跨元素自定义属性 / 边框不解析」同一类限制），所以「一行同高」这一条
    // 只能进浏览器验收；这里守的是机制（尺寸档确实传到了每个控件上）
    const buttons = [...host.querySelectorAll('.ant-btn')]
    expect(buttons.length).toBeGreaterThan(5)
    for (const item of buttons) {
      expect(item.classList.contains('ant-btn-sm'), `按钮不在 small 档：${item.className}`).toBe(
        true,
      )
    }

    // 字体下拉一个、字号与跳页两个数字框、段落输入框（ToolbarTextArea）
    click(button(host, '文字格式'))
    const selects = [...host.querySelectorAll('.ant-select')]
    expect(selects).toHaveLength(1)
    expect(selects[0]?.classList.contains('ant-select-sm')).toBe(true)

    const numbers = [...host.querySelectorAll('.ant-input-number')]
    expect(numbers).toHaveLength(2)
    for (const item of numbers) {
      expect(item.classList.contains('ant-input-number-sm'), `数字框不在 small 档`).toBe(true)
    }

    // 段落输入框（`ToolbarTextArea`）。这份文稿第 1 页的元素只有一段，所以
    // 判据是「至少一个」——**不能只写 0 个也通过**：一个都没有时这一条会在
    // 空集合上静默通过（`for` 不执行），而那正是它要防的情形
    const areas = [...host.querySelectorAll('textarea.ant-input')]
    expect(areas.length).toBeGreaterThan(0)
    for (const item of areas) expect(item.classList.contains('ant-input-sm')).toBe(true)
  })

  it('工具条上的原生控件都来自 antd；非 antd 的只有外壳自己那两类', async () => {
    const { host } = await mountEditor(load('upstream/01_standard_business.pptx'))
    // 选中一个元素：工具条上「要选中才出现」的那半排（字体下拉、颜色面板的
    // 触发器、段落输入框）才在 DOM 里——不选的话这一条会漏掉它们
    selectOnCanvas(host, 0)
    const all = [...host.querySelectorAll<HTMLElement>('button, input, select, textarea')]
    expect(all.length).toBeGreaterThan(10)

    const own = all.filter((el) => ![...el.classList].some((name) => name.startsWith('ant-')))
    /*
     * 两类有意的例外（都是**外壳的原语**，不是这里绕过原语的写法）：
     *
     *  - `.me-tab`：`ToolbarTabs` 的页签。antd 的 `Tabs` 会把页签渲染成 div
     *    并多一个隐藏的 `.ant-tabs-nav-more`，D-064 明确不迁
     *  - `.me-btn`：`ToolbarColorPicker` 的触发按钮（面板要就地 `fixed` 且用
     *    `--me-*` 上色，antd 的 ColorPicker 会 portal）
     *
     * 集合相等而不是「数量相等」：多出任何一种类名都说明有人自造了一个控件。
     */
    expect(new Set(own.map((el) => el.className))).toEqual(
      new Set(['me-tab', 'me-btn', 'mimir-compact-toolbar__tab']),
    )

    // 输入类必须都在 antd 控件的根里（一个裸的都算绕过点）
    for (const field of host.querySelectorAll('input, select, textarea')) {
      const insideAntd = field.closest(
        '.ant-input-number, .ant-select, .ant-input, .ant-upload, .ant-input-number-input',
      )
      expect(insideAntd, `有一个裸控件：${field.outerHTML.slice(0, 80)}`).not.toBeNull()
    }

    /*
     * 画布是**白名单里的例外**（`PptxEditor.tsx` 里那段注释就是它的存档）：
     * 它是可点但非按钮的 div —— 被点中的目标是注入进来的 SVG 节点，动作随
     * 点在哪而变，换成 ToolbarButton 没有意义。这里把它显式钉住：白名单要
     * 是悄悄多出一处，就会变成「下一处 onClick on div」的先例。
     */
    const canvases = [...host.querySelectorAll<HTMLElement>('.mimir-editor__body div')].filter(
      (el) => el.className === 'mimir-pptx-slide',
    )
    expect(canvases).toHaveLength(1)
    expect(canvases[0]?.getAttribute('role')).toBeNull()
  })

  it('禁用的按钮都带着原因（灰着而不说为什么等于让人猜）', async () => {
    const { host } = await mountEditor(load('upstream/01_standard_business.pptx'))
    const quickAccess = host.querySelector('.mimir-compact-toolbar__quick-access')
    expect(quickAccess?.querySelectorAll('button')).toHaveLength(3)
    expect(quickAccess?.querySelector('button[aria-label="保存到库"]')).toBe(
      button(host, '保存到库'),
    )
    expect(host.querySelector('.mimir-editor__status button[aria-label="保存到库"]')).toBeNull()
    expect(button(host, '撤销').getAttribute('title')).toBe('没有可撤销的修改')
    expect(button(host, '重做').getAttribute('title')).toBe('没有可重做的修改')
    // 第 1 页：往回翻不能点，且说明理由
    expect(button(host, '上一页').disabled).toBe(true)
    expect(button(host, '上一页').getAttribute('title')).toBe('已经是第一页')
    // 没改动时保存不能点，且与「正在保存」区分开
    expect(button(host, '保存到库').disabled).toBe(true)
    expect(button(host, '保存到库').getAttribute('title')).toBe('没有未保存的改动')

    /*
     * **先打开查找栏**：它那四个按钮（上一个 / 下一个匹配、替换这一个、全部替换）
     * 也有禁用态，而栏关着的时候它们不在树上——这条断言曾经就是这样漏掉它们的
     * （与 `HtmlEditor.test.tsx` 那条同一个盲区）。
     */
    click(button(host, '查找和替换'))

    for (const item of host.querySelectorAll<HTMLButtonElement>('button:disabled')) {
      const label = item.getAttribute('aria-label') ?? ''
      const title = item.getAttribute('title') ?? ''
      expect(title, `「${label}」禁用了却没给理由`).not.toBe('')
      // 原因与名字混成一件就等于没说
      expect(title, `「${label}」把原因与名字混成一件事`).not.toBe(label)
    }
  })

  it('查找栏就地渲染（不 portal 到 body），且是按下态', async () => {
    const { host } = await mountEditor(load('title-layout.pptx'))
    const findButton = button(host, '查找和替换')
    expect(findButton.getAttribute('aria-pressed')).toBe('false')
    // 工具条上有一个 antd 的下拉（字体）——它收起时不 portal，所以这条断言
    // 量的是「查找栏自己有没有被 portal 出去」（`ToolbarMenu` / 颜色面板同理）
    const before = document.body.childElementCount
    click(findButton)
    expect(findButton.getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector('.mimir-editor__subbar .me-find')).not.toBeNull()
    expect(document.body.childElementCount).toBe(before)
  })

  it('按下工具条按钮不夺焦点：mousedown 被 preventDefault', async () => {
    const { host } = await mountEditor(load('title-layout.pptx'))
    const target = button(host, '查找和替换')
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    act(() => {
      target.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
  })
})
