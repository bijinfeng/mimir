// @vitest-environment happy-dom

/**
 * PDF 工具条的渲染契约。
 *
 * 这一组守的是「**控件是外壳的 antd 原语，而且是 small 档**」这条被 D-064
 * 定下来的边界。它验的是界面，不是模型——模型那一层由 `pdf-pages.test.ts`
 * 与 `pdf-text.test.ts` 用另一份库独立读回产出物在守。
 *
 * ## 四件容易静默失效的事
 *
 *  1. **原生控件混回来**：手写的 `<button>` / `<input>` 语法对、类型过、界面
 *     「看着还行」，但深浅主题管不到它们（D-042 记的就是这个）。所以先有一条
 *     **静态守护**读 `PdfEditor.tsx` 的源码文本，再有一条**挂真组件**的断言
 *     按 antd 的类名数控件
 *  2. **尺寸档掉了**：`EditorShell` 里那层 `ConfigProvider componentSize="small"`
 *     一旦被传上 `theme`（或挪出 `.mimir-editor` 这棵子树），控件会静默变回
 *     `ant-btn`（默认 32px 档），界面只是「高一点」。happy-dom 下**取不到计算
 *     高度**（与「跨元素自定义属性 / 边框不解析」同一类限制），所以判据落在
 *     类名上：`ant-btn-sm` / `ant-input-number-sm` / `ant-select-sm`
 *  3. **禁用的按钮没有原因**：一个灰着而不说为什么的按钮等于让人猜（DESIGN
 *     §8.4）。这里对工具条上**每一个** disabled 的按钮断言它带着非空 `title`
 *  4. **点了没反应**：旋转 + 保存这一条走完整条路——点按钮、写回字节、再用
 *     pdf-lib 读回那一页的 `/Rotate`。断的是文件里到底写了什么，不是返回值
 *
 * 另有两条 Step 4 点名要保持的语义在这条工具条上的实测：按下时
 * `preventDefault`（点按钮不夺焦点、不清选区）与弹层面板**就地渲染、不
 * portal 到 body**（`ToolbarMenu` 不迁 antd Dropdown 的硬理由）。
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { PdfEditor } from './PdfEditor.js'
import { openSelect, selectValueText } from '../shell/antd-test-dom.js'
import type { EditorIo } from './types.js'

/**
 * 源码路径**不能用 `new URL(…, import.meta.url)`**：这个文件跑在 happy-dom 下，
 * 它替换了全局的 `URL`，`readFileSync` 会拒收那个对象（`The URL must be of
 * scheme file`）——`vitest.config.ts` 顶部写着这条，`PptxEditor.test.tsx` 也踩过。
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE = resolve(HERE, 'PdfEditor.tsx')

/* ── 挂载 ────────────────────────────────────────────────────── */

const mounted: { unmount: () => void }[] = []

afterEach(() => {
  for (const item of mounted) item.unmount()
  mounted.length = 0
})

/** 造一份 PDF：每页一个词。尺寸与页数可调（裁剪上限随纸的大小变） */
async function makePdf(
  options: { pages?: number; width?: number; height?: number } = {},
): Promise<Uint8Array> {
  const { pages = 2, width = 300, height = 400 } = options
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let index = 0; index < pages; index += 1) {
    const page = doc.addPage([width, height])
    page.drawText(`page ${index + 1}`, { x: 10, y: height - 20, size: 10, font })
  }
  return doc.save()
}

/**
 * 把挂起的工作推进完（直到 `done` 为真或超时）。
 *
 * **不能只弹微任务队列**：读原件与解析 PDF 走真 promise 链，每轮要让出一次
 * 宏任务（与 `PptxEditor.test.tsx` 同一套，症状都是「界面一直不出现」）。
 */
async function settle(done: () => boolean): Promise<void> {
  for (let i = 0; i < 60 && !done(); i += 1) {
    await act(async () => {
      await new Promise((tick) => setTimeout(tick, 2))
    })
  }
}

interface Harness {
  host: HTMLElement
  /** 写回时收到的字节（点「保存到库」之后才有内容） */
  saved: Uint8Array[]
}

async function mount(bytes: Uint8Array): Promise<Harness> {
  const saved: Uint8Array[] = []
  const io: EditorIo = {
    load: async () => bytes,
    save: async (next) => {
      saved.push(next)
    },
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => {
    root.render(<PdfEditor documentId="doc-1" io={io} />)
  })
  // 工具条只在页序解析出来之后才渲染（之前是「正在解析 PDF…」）
  await settle(() => host.querySelector('.mimir-editor__bar') !== null)
  expect(host.querySelector('.mimir-editor__bar'), '工具条没有渲染出来').not.toBeNull()
  mounted.push({
    unmount: () => {
      act(() => root.unmount())
      host.remove()
    },
  })
  return { host, saved }
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  if (label === '页面与版式操作') {
    const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '页面',
    )
    if (tab && tab.getAttribute('aria-selected') !== 'true') click(tab)
  }
  const found = [...host.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === label,
  )
  if (found === undefined) throw new Error(`没有名为「${label}」的按钮`)
  return found
}

function menuItem(host: HTMLElement, label: string): HTMLButtonElement {
  if (host.querySelector('.mimir-pptx-pdf-toolbar__panel') === null) {
    click(button(host, '页面与版式操作'))
  }
  const found = [
    ...host.querySelectorAll<HTMLButtonElement>('.mimir-pptx-pdf-toolbar__panel [role="menuitem"]'),
  ].find((item) => item.textContent?.trim() === label)
  if (found === undefined) throw new Error(`页面菜单里没有「${label}」`)
  return found
}

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

const hasClass = (element: Element, name: string): boolean => element.classList.contains(name)

/* ── 静态守护：这个文件里不写原生控件 ─────────────────────────── */

describe('PdfEditor.tsx 的静态守护', () => {
  /**
   * 扫的是**源码文本**，不是渲染结果——渲染结果里永远能找到 antd 自己渲染的
   * `<input>`（InputNumber、Upload 都带），所以「有没有人手写原生控件」只能
   * 在源码这一层问。注释先剥掉，免得文档里一句示例把守护弄红。
   */
  const source = readFileSync(SOURCE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('没有手写的 button / input / select / textarea', () => {
    const hits = source.match(/<(button|input|select|textarea)[\s>/]/g) ?? []
    expect(hits, `PdfEditor.tsx 里还有原生控件：${hits.join(' ')}`).toEqual([])
  })

  it('不直接 import antd：控件只经过外壳的原语', () => {
    // 直接 import 会把「尺寸档 / 按下 preventDefault / 禁用给原因」三条约定
    // 各绕开一处，而绕开之后界面看着没问题
    expect(source).not.toMatch(/from\s+'antd'/)
  })
})

/* ── 渲染结果：控件确实来自 antd，且是 small 档 ───────────────── */

describe('PdfEditor 工具条的控件', () => {
  it('定位原文进入只读模式；工具栏不提供未验收的替换动作', async () => {
    const { host } = await mount(await makePdf({ pages: 1 }))
    const editTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '编辑',
    )
    expect(editTab).toBeDefined()
    click(editTab!)
    click(button(host, '定位原文'))
    expect(button(host, '定位原文').getAttribute('aria-pressed')).toBe('true')
    expect(host.textContent).toContain('正在读取原文位置')
    expect(
      [...host.querySelectorAll('button')].some((item) => item.textContent?.includes('替换原文')),
    ).toBe(false)
  })

  it('按钮都是 antd 的；手写的只有两个就地弹层触发器', async () => {
    const { host } = await mount(await makePdf())
    const bar = host.querySelector('.mimir-editor__bar')
    if (bar === null) throw new Error('没有工具条')

    const buttons = [...bar.querySelectorAll('button')]
    expect(buttons.length).toBeGreaterThan(4)

    const antd = buttons.filter((item) => hasClass(item, 'ant-btn'))
    /*
     * 例外只有两个：`ToolbarMenu` 的触发器（「整份」与「裁剪」）。它们**故意
     * 不迁** antd 的 Dropdown——面板要用 `--me-*` 上色、必须就地 `fixed`，
     * 而 Dropdown 会 portal 且不给触发按钮 `aria-expanded`（D-064 的落地表）。
     * 判据用 `aria-haspopup`，不是「名字长这样」。
     */
    const own = buttons.filter((item) => !hasClass(item, 'ant-btn'))
    expect(new Set(own.map((item) => item.className))).toEqual(
      new Set(['mimir-compact-toolbar__tab']),
    )
    expect(
      own
        .filter((item) => hasClass(item, 'me-btn'))
        .every((item) => item.getAttribute('aria-haspopup') !== null),
    ).toBe(true)
    expect(antd.length).toBe(buttons.length - own.length)

    /*
     * 裸 `<input>` 一个都不许有：antd 的 InputNumber / Select / Upload 都会渲染
     * 自己的 input，所以判据是「每一个 input 都在某个 antd 控件的根里」。
     */
    for (const input of bar.querySelectorAll('input, select, textarea')) {
      const insideAntd = input.closest('.ant-input-number, .ant-select, .ant-input, .ant-upload')
      expect(insideAntd, `工具条上有一个裸控件：${input.outerHTML.slice(0, 80)}`).not.toBeNull()
    }
  })

  it('控件都落在 small 档（EditorShell 那层 ConfigProvider 盖到了这棵子树）', async () => {
    const { host } = await mount(await makePdf())
    const bar = host.querySelector('.mimir-editor__bar')
    if (bar === null) throw new Error('没有工具条')

    for (const item of bar.querySelectorAll('.ant-btn')) {
      expect(hasClass(item, 'ant-btn-sm'), `按钮没在 small 档：${item.className}`).toBe(true)
    }
    // 页码与缩放两个数字框、纸型一个下拉——数量写死是刻意的：少一个就说明
    // 有人把它换回了别的实现（换回原生控件时上面那条静态守护也会红）
    const numbers = [...bar.querySelectorAll('.ant-input-number')]
    expect(numbers).toHaveLength(2)
    for (const item of numbers) expect(hasClass(item, 'ant-input-number-sm')).toBe(true)

    click(button(host, '页面与版式操作'))
    const selects = [...bar.querySelectorAll('.ant-select')]
    expect(selects).toHaveLength(1)
    expect(hasClass(selects[0] as Element, 'ant-select-sm')).toBe(true)

    // 这两处是 ask 的「一行同高」在 happy-dom 里能拿到的最强证据：small 档的
    // 类名。**计算高度取不到**（返回空串），那一条只能进浏览器验收。
  })

  it('禁用的按钮都带着原因（灰着而不说为什么等于让人猜）', async () => {
    const { host } = await mount(await makePdf())

    // 第 1 页：往回翻与往前挪都不能点，且各自说明理由
    expect(button(host, '上一页').disabled).toBe(true)
    expect(button(host, '上一页').getAttribute('title')).toBe('已经是第一页')
    expect(menuItem(host, '把这一页往前挪').disabled).toBe(true)
    expect(menuItem(host, '把这一页往前挪').getAttribute('title')).toBe('已经在最前面')

    // 每一条都这样断言一遍：没有「禁用了但没写理由」的按钮
    for (const item of host.querySelectorAll<HTMLButtonElement>(
      '.mimir-editor__bar button:disabled',
    )) {
      const reason = item.getAttribute('title')
      expect(reason, `「${item.getAttribute('aria-label')}」禁用了却没给理由`).toBeTruthy()
    }
  })

  it('裁剪菜单：当前档标出来、超上限的档禁用并说明原因', async () => {
    /*
     * 用的是一张 **60 × 60 pt 的小纸**：`maxCropInset` 是短边的一半减 20
     * （`pdf-pages.ts:225`），这张纸的上限是 10pt，于是 10 档可用、20/36/72
     * 三档都该是「禁用了并写着为什么」。默认那张 300 × 400 的纸四档都可用，
     * 验不出禁用这一支。
     */
    const { host } = await mount(await makePdf({ pages: 1, width: 60, height: 60 }))
    click(button(host, '页面与版式操作'))

    const items = [...host.querySelectorAll<HTMLButtonElement>('.me-menu__panel [role="menuitem"]')]
    expect(items.length).toBeGreaterThan(4)

    // 还没裁剪：第一项「不裁剪」是当前值
    const none = items.find((item) => item.getAttribute('title') === '不裁剪（还原这一页）')
    expect(none?.getAttribute('aria-current')).toBe('true')

    // 超上限的那三档：disabled，且 title 就是原因（不是它自己的名字）
    const over = items.filter((item) => item.disabled && item.textContent?.startsWith('四边各裁'))
    expect(over.map((item) => item.textContent)).toEqual([
      '四边各裁 20 pt',
      '四边各裁 36 pt',
      '四边各裁 72 pt',
    ])
    for (const item of over) {
      expect(item.getAttribute('title')).toContain('上限 10 pt')
    }

    // 可用那一档点了真的落到页面上：状态行写着「已修改」与裁剪量
    const ten = items.find((item) => item.textContent === '四边各裁 10 pt')
    if (ten === undefined) throw new Error('菜单里没有「四边各裁 10 pt」')
    click(ten)
    const status = host.querySelector('.mimir-editor__status')?.textContent ?? ''
    expect(status).toContain('已修改，未保存')
    expect(status).toContain('裁剪：四边各 10 pt')
    // 面板跟着关了
    expect(host.querySelector('.me-menu__panel')).toBeNull()
  })

  it('「查找文字」是按下态按钮：aria-pressed 跟着它走', async () => {
    const { host } = await mount(await makePdf())
    expect(button(host, '查找文字').getAttribute('aria-pressed')).toBe('false')
    click(button(host, '查找文字'))
    /*
     * **antd 不认 `aria-pressed`**（它只在 hover/active 上着色，D-064 的落地表
     * 记了这条），所以这个属性是读屏与 `.me-tb[aria-pressed]` 样式的唯一真相。
     * 丢了它，按钮就是「按下去和没按一样」，而没有任何东西会报错。
     */
    expect(button(host, '查找文字').getAttribute('aria-pressed')).toBe('true')
    /*
     * 文字层的扫描是异步的（`buildPdfTextIndex`）。让它跑完再收尾：不跑完的话
     * 未落地的 promise 会在下一条测试里 setState（React 报「not wrapped in
     * act」）。判据是次工具条不再是「正在读取文字层…」那一行。
     */
    await settle(
      () =>
        host.querySelector('.mimir-editor__subbar') === null ||
        host.querySelector('.me-find') !== null,
    )

    /*
     * 这一条是 happy-dom 里能走到的那支：pdf.js 的 worker 起不来（测试环境
     * 没有真 worker），于是文字层扫描失败，界面上出现一条**危险色的临时提示**
     * （`ToolbarNotice`，类名 `.me-notice`）并写着原因。真浏览器里的另一支是
     * 「这份 PDF 没有文字层（可能是扫描件）」——两句话都由同一个 state 渲染。
     */
    const notice = host.querySelector('.mimir-editor__footer .me-notice')
    expect(notice, '提示没有走 ToolbarNotice（外壳里那一档危险色的原语）').not.toBeNull()
    expect(notice?.textContent ?? '').toContain('文字层')
  })

  it("纸型下拉：`''` 是一个真的选项值，显示成「原件尺寸」而不是空", async () => {
    const { host } = await mount(await makePdf())
    const label = '这一页的纸型（会按比例缩放内容）'

    /*
     * 这一条守的是**界面说真话**：`PdfEditor` 用 `''` 表示「原件尺寸」，而
     * **不是** `null`（`null` 在外壳的 `ToolbarSelect` 里是「不是选项里的
     * 任何一个」，会显示 `placeholder`）。两者的区别只有在渲染结果里才看得见
     * ——antd 的 Select 拿到空串时可能显示 placeholder 或什么都不显示。
     */
    click(button(host, '页面与版式操作'))
    expect(selectValueText(host, label)).toBe('原件尺寸')

    // 换一档：下拉里选 A4，状态行与下拉本身都要跟着说 A4
    const a4 = openSelect(host, label).find((item) => (item.textContent ?? '').startsWith('A4'))
    if (a4 === undefined) throw new Error('纸型下拉里没有 A4')
    act(() => {
      a4.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(selectValueText(host, label)).toMatch(/^A4/)
    const status = host.querySelector('.mimir-editor__status')?.textContent ?? ''
    expect(status).toContain('已修改，未保存')
    expect(status).toContain('纸型：A4')
  })

  it('按下时不夺焦点：mousedown 被 preventDefault（拖动选区不会因点按钮而丢）', async () => {
    const { host } = await mount(await makePdf())
    const pressed = menuItem(host, '向右旋转 90 度')
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    act(() => {
      pressed.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
  })
})

/* ── 动作真的落到文件上 ───────────────────────────────────────── */

describe('PdfEditor 工具条的动作', () => {
  it('缩略图选择、复制、上移后保存，复制页的旋转与原页独立', async () => {
    const { host, saved } = await mount(await makePdf())
    click(button(host, '第 2 页'))
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('第 2 / 2 页')

    act(() => {
      host
        .querySelectorAll('.mimir-page-browser__item')[1]!
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })
    await settle(() => host.querySelector('.ant-dropdown-menu') !== null)
    const duplicate = [
      ...host.querySelectorAll<HTMLElement>(
        '.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item',
      ),
    ].find((item) => item.textContent?.trim() === '复制此页')
    if (duplicate === undefined) throw new Error('缩略图菜单里没有复制此页')
    click(duplicate)
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('第 3 / 3 页')

    click(menuItem(host, '向右旋转 90 度'))
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('第 3 / 3 页')
    act(() => {
      host
        .querySelectorAll('.mimir-page-browser__item')[2]!
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })
    await settle(() => host.querySelector('.ant-dropdown-menu') !== null)
    const up = [...host.querySelectorAll<HTMLElement>('.ant-dropdown-menu-item')].findLast(
      (item) => item.textContent?.trim() === '上移',
    )
    if (up === undefined) throw new Error('缩略图菜单里没有上移')
    click(up)
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('第 2 / 3 页')

    click(button(host, '保存到库'))
    await settle(() => saved.length > 0)
    const reopened = await PDFDocument.load(saved[0]!)
    expect(reopened.getPageCount()).toBe(3)
    expect(reopened.getPages().map((page) => page.getRotation().angle)).toEqual([0, 90, 0])
  })

  /**
   * 「删除这一页」**必须问一句**。
   *
   * 它与左右两个纯图标按钮（插入空白页、导入页面）并排，代价却完全不同：这一条
   * 工具条**没有撤销**（docx / html / 笔记都有），一次误点就少一页，唯一的路
   * 是「不保存、退出、重进」。确认框须同时说明无撤销和退出退路。
   */
  it('「删除这一页」先弹确认：取消不动、确认才真的删', async () => {
    const { host } = await mount(await makePdf({ pages: 3 }))
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('/ 3 页')

    click(button(host, '删除这一页'))
    /*
     * antd 的 `Popconfirm` portal 到 body（显式的例外：`.mimir-editor` 是
     * `overflow: clip`，就地渲染会被裁掉），所以弹层不在 `host` 里。
     */
    const popup = document.querySelector('.ant-popconfirm')
    expect(popup, '点「删除这一页」没有弹确认框').not.toBeNull()
    // 在操作点说明代价和退路，不占用画布底部的常驻说明。
    expect(popup?.textContent).toContain('没有撤销')
    expect(popup?.textContent).toContain('不保存退出')

    // 取消：页数不动、也没有未保存的改动
    const cancel = [...popup!.querySelectorAll('button')].find(
      (item) => item.textContent?.trim() === '算了',
    )
    if (cancel === undefined) throw new Error('确认框里没有取消按钮: ' + popup!.outerHTML)
    click(cancel)
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('/ 3 页')
    expect(host.querySelector('.mimir-editor__status')?.textContent).not.toContain('已修改')

    // 再来一次并确认：这一回真的少一页
    await settle(() => document.querySelector('.ant-popconfirm') === null)
    click(button(host, '删除这一页'))
    const again = document.querySelector('.ant-popconfirm')
    const confirm = [...(again?.querySelectorAll('button') ?? [])].find(
      (item) => item.textContent?.trim() === '删除这一页',
    )
    if (confirm === undefined) throw new Error('确认框里没有确认按钮')
    click(confirm)
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('/ 2 页')
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('已修改，未保存')
  })

  it('删除确认是外壳的原语（PdfEditor 不直接 import antd）', () => {
    // 「顺手在编辑器里 import 一次 antd」会把尺寸档 / 禁用给原因两条约定绕开
    // 一处（上面那两条静态守护守着），这一条守「确认框也走原语」
    const text = readFileSync(SOURCE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(text).not.toMatch(/from\s+'antd'/)
    expect(text).toContain('ToolbarConfirm')
  })

  it('默认不占用画布底部说明区域，状态与保存仍可见', async () => {
    const { host } = await mount(await makePdf({ pages: 3 }))
    expect(host.querySelector('.mimir-editor__footer')).toBeNull()
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('/ 3 页')
    expect(button(host, '保存到库')).toBeTruthy()
  })

  it('切到页面分类后仍可用 Ctrl+F 打开查找', async () => {
    const { host } = await mount(await makePdf())
    const pageTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '页面',
    )!
    click(pageTab)
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true })))
    expect(host.querySelector('.mimir-editor__subbar')).not.toBeNull()
  })

  it('旋转 + 保存：写回的字节里那一页真的是 90 度', async () => {
    const { host, saved } = await mount(await makePdf())

    const pageTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === '页面',
    )!
    click(pageTab)
    click(button(host, '向右旋转 90 度'))
    // 状态行如实报告「已修改」，页面标签写着这一页的旋转角度
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('已修改，未保存')
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('旋转 90°')

    click(button(host, '保存到库'))
    await settle(() => saved.length > 0)
    const bytes = saved.at(-1)
    if (bytes === undefined) throw new Error('保存没有写回字节')

    // 用 pdf-lib 独立读回产出物（pdf-pages.test.ts 同一手法）
    const reopened = await PDFDocument.load(bytes)
    expect(reopened.getPageCount()).toBe(2)
    expect(reopened.getPage(0).getRotation().angle).toBe(90)
    expect(reopened.getPage(1).getRotation().angle).toBe(0)

    // 保存后按钮自己变灰，且理由从「没有改动」角度说清楚
    await settle(() => host.querySelector('.mimir-editor__status')?.textContent === '已保存')
    expect(button(host, '保存到库').disabled).toBe(true)
    expect(button(host, '保存到库').getAttribute('title')).toBe('没有改动，不用保存')
  })

  it('带表单的 PDF 不写回原件，并在编辑器中说明原因', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([300, 400])
    doc.getForm().createTextField('contact').addToPage(page)
    const { host, saved } = await mount(await doc.save())

    click(menuItem(host, '向右旋转 90 度'))
    click(button(host, '保存到库'))
    await settle(() =>
      (host.querySelector('.mimir-editor__footer .me-notice')?.textContent ?? '').includes(
        '未保存',
      ),
    )

    expect(saved).toHaveLength(0)
    const notice = host.querySelector('.mimir-editor__footer .me-notice')?.textContent ?? ''
    expect(notice).toContain('AcroForm')
    expect(notice).toContain('未写回原件')
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('已修改，未保存')
  })

  it('弹层面板就地渲染，不 portal 到 body（否则深色下会退回浅色回退值）', async () => {
    const { host } = await mount(await makePdf())
    const before = document.body.childElementCount
    const trigger = button(host, '页面与版式操作')

    click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const panel = host.querySelector('.me-menu__panel')
    expect(panel, '面板没有渲染在编辑器子树里').not.toBeNull()
    expect(document.body.childElementCount, '面板 portal 出去了').toBe(before)

    // 菜单项是真的接了动作：全部页向右旋转 90 度
    const rotateAll = [...(panel?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].find(
      (element) => element.getAttribute('title') === '全部页向右旋转 90 度',
    )
    if (rotateAll === undefined) throw new Error('菜单里没有「全部页向右旋转 90 度」')
    click(rotateAll)
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('已修改，未保存')
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('旋转 90°')
    // 面板关掉了
    expect(host.querySelector('.me-menu__panel')).toBeNull()
  })

  it('「从另一份 PDF 导入页面」带上了正确的文件过滤条件', async () => {
    const { host } = await mount(await makePdf())
    click(button(host, '页面与版式操作'))
    const input = host.querySelector<HTMLInputElement>('.mimir-editor__bar input[type=file]')
    expect(input).not.toBeNull()
    // 没有过滤条件的话系统选择器里什么都能选，选错了要到解析时才报错
    expect(input?.getAttribute('accept')).toBe('application/pdf,.pdf')
    // 按钮的无障碍名称与它一致（文件名选择器那一步是 antd Upload 的机制）
    expect(button(host, '从另一份 PDF 导入页面（它的全部页面，插在当前页之后）')).toBeTruthy()
  })
})
