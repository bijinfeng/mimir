// @vitest-environment happy-dom

/**
 * html 工具条的渲染契约。
 *
 * ## 为什么要有这一组断言
 *
 * html 这一条是六种编辑器里**最后一个**换到 `EditorShell` 原语的，而且换完
 * 之后调研的绕过点清单在这个格式上是**空的**——原生控件在更早的改动里就已经
 * 没有了。空清单不等于没问题：没有断言的「已经换好了」会在下一次改动里静默
 * 退回去（多一个裸 `<button>` 就是「同一排三种高度、三种焦点环」的起点），
 * 而静默正是这个仓库最不能接受的失败方式。所以这里把四件事钉住：
 *
 *  1. **没有绕过点**：`.mimir-editor` 子树里每一个 `button` / `input` /
 *     `select` / `textarea` 都必须带 `ant-` 类
 *  2. **都落在 small 档**：尺寸由 `EditorShell` 里那层只传 `componentSize`
 *     的 `ConfigProvider` 给，不是每个调用点各自写的
 *  3. **禁用必须给原因**：灰着的按钮不说是为什么，等于让人猜（DESIGN §8.4）
 *  4. **弹层就地渲染**：html 的查找栏不 portal 到 body（portal 会离开
 *     `--me-*` 子树，深色下退回浅色回退值）
 *
 * ## 为什么判据是类名，不是计算高度
 *
 * happy-dom **不解析跨元素的自定义属性与边框**，这些控件的
 * `getComputedStyle().height` 返回空串（实测）。所以「一行同高」只能靠 antd
 * 自己的尺寸档类来判——它们正是高度的来源。真正的同高验收要在浏览器里量，
 * 这里守的是**机制**（尺寸档确实传到了每个控件上）。
 */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { HtmlEditor } from './HtmlEditor.js'
import type { EditorIo } from './types.js'

/** 一份最小的页面：够 `SourceEditor` 起来、够预览脚本握手 */
const PAGE = `<!doctype html>
<html>
<head><title>契约</title></head>
<body><div class="hero"><h1>标题</h1><p>正文</p></div></body>
</html>`

const mounted: { unmount: () => void }[] = []

afterEach(() => {
  for (const item of mounted) item.unmount()
  mounted.length = 0
})

/**
 * 挂一棵真的编辑器。
 *
 * 解析是**异步**的（`useParsed`），所以 render 之后还要再等一拍——不然
 * `doc` 仍是 null，挂出来的是「正在解析页面…」那个占位，而下面的断言会在
 * 一棵空树上**静默通过**（每个 `querySelectorAll` 都返回空）。所以每条断言
 * 之前都先确认工具条真的在。
 */
async function boot(): Promise<HTMLElement> {
  const io: EditorIo = {
    load: async () => new TextEncoder().encode(PAGE),
    save: async () => {},
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => {
    root.render(<HtmlEditor documentId="contract" io={io} />)
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  if (host.querySelector('.mimir-editor__bar') === null) throw new Error('工具条没挂出来')
  // 源码栏（CodeMirror）也要在——它在 `.mimir-editor` 里面，是绕过点的另一半
  if (host.querySelector('.cm-editor') === null) throw new Error('源码栏没挂出来')
  mounted.push({
    unmount: () => {
      act(() => root.unmount())
      host.remove()
    },
  })
  return host
}

/** 子树里所有原生控件 */
const controls = (host: HTMLElement): HTMLElement[] => [
  ...host.querySelectorAll<HTMLElement>('button, input, select, textarea'),
]

/** 点一下（`mousedown` + `click`——原语在两个事件上都有语义） */
function press(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

describe('HtmlEditor 工具条的控件契约', () => {
  it('没有绕过点：每个原生控件都来自 antd', async () => {
    const host = await boot()
    const all = controls(host)
    // 非空前提：一棵空树上「零个绕过点」是句废话
    expect(all.length).toBeGreaterThan(10)
    const bypass = all
      .filter((element) => ![...element.classList].some((name) => name.startsWith('ant-')))
      .map((element) => `<${element.tagName.toLowerCase()} class="${element.className}">`)
    expect(bypass, `这些控件绕过了外壳的原语：${JSON.stringify(bypass)}`).toEqual([])
  })

  it('尺寸统一在 small 档（三种控件各自带自己的 sm 类）', async () => {
    const host = await boot()
    /*
     * 三类的判据都是 antd 自己的尺寸档类：
     *  - 按钮：`ant-btn-sm`
     *  - 互斥组（视图 / 设备）：`ant-segmented-sm`——注意它的项是
     *    `<label><input type=radio>`，不是 button，所以按钮那条扫不到它
     *  - 数字框（预览缩放）：`ant-input-number-sm`
     */
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button.ant-btn')]
    expect(buttons.length).toBeGreaterThan(3)
    const wrongButtons = buttons.filter(
      (button) =>
        // 弹层触发器是裸 `<button className="me-btn">`，本来就不该有 antd 类；
        // 这里只查真正走了 antd 的那些（见 shell.css 的 `.me-btn` 说明）
        !button.classList.contains('ant-btn-sm'),
    )
    expect(
      wrongButtons.map((button) => button.getAttribute('aria-label')),
      '这些按钮不在 small 档',
    ).toEqual([])

    const segmented = [...host.querySelectorAll<HTMLElement>('.ant-segmented')]
    expect(segmented.length).toBe(2)
    for (const group of segmented) expect(group.classList.contains('ant-segmented-sm')).toBe(true)

    const numbers = [...host.querySelectorAll<HTMLElement>('.ant-input-number')]
    expect(numbers.length).toBe(1)
    expect(numbers[0]?.classList.contains('ant-input-number-sm')).toBe(true)
  })

  it('不把 .me-btn / .me-input 挂到 antd 控件上（那会把高度与底色压回去）', async () => {
    const host = await boot()
    /*
     * `.me-btn` 的 `height` 与 antd 的 `:where(...).ant-btn-sm` 特异性相同
     * （都是 (0,1,0)），而 shell.css 在 head 里更靠后——挂上之后 small 档按钮
     * 会被拉成 `--me-control-height` 之外的值（实测 28px），它的
     * `background: transparent` 还会压过实心按钮。`.me-tb` 才是 antd 按钮的
     * 类（只有按下态那一条规则）。这一条就是那两个坑的守卫。
     *
     * **先打开查找栏**：里面有两个 antd `Input`，而它们正是「有没有把
     * `.me-input` 挂回 antd 控件上」唯一能兑现的地方——栏关着的时候树里
     * `.ant-input` 一个都没有，这条断言会空转（它曾经就是这样通过的）。
     */
    press(host.querySelector<HTMLButtonElement>('[aria-label="查找和替换"]')!)
    expect(
      host.querySelectorAll('.ant-input').length,
      '查找栏没打开，这条断言在空转',
    ).toBeGreaterThan(0)
    expect(host.querySelectorAll('.ant-btn.me-btn').length).toBe(0)
    expect(host.querySelectorAll('.ant-input.me-input').length).toBe(0)
    // `.me-input--num` 是**给 InputNumber 的**（宽度），它没有 height/底色，可以留
    expect(host.querySelectorAll('.ant-input-number.me-input--num').length).toBe(1)
  })

  it('禁用的按钮必须说明原因（灰着不说为什么等于让人猜）', async () => {
    const host = await boot()
    /*
     * **先打开查找栏**：里面那四个按钮（上一个 / 下一个匹配、替换这一个、
     * 全部替换）也会禁用，而这条断言原来跑在栏关着的时候——那几个按钮不在树上，
     * 于是「禁用必须给原因」在查找栏那一半从来没被守过（实测漏掉四个）。
     */
    press(host.querySelector<HTMLButtonElement>('[aria-label="查找和替换"]')!)
    let disabledCount = 0
    for (const button of host.querySelectorAll<HTMLButtonElement>('button')) {
      if (!button.disabled) continue
      disabledCount += 1
      const title = button.getAttribute('title') ?? ''
      const label = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? ''
      expect(title, `禁用的按钮没有说明原因：${label}`).not.toBe('')
      // 原因与名字混成一件就等于没说：`title` 与 `aria-label` 必须不同
      expect(title, `禁用的按钮把原因与名字混成一件事：${label}`).not.toBe(label)
    }
    // 刚打开时撤销 / 重做 / 定位选中元素 / 保存 / 查找栏四个都是禁用的——这一条不该是空循环
    expect(disabledCount).toBeGreaterThan(2)
  })

  it('查找按钮是按下态，且查找栏就地渲染（不 portal 到 body）', async () => {
    const host = await boot()
    const findButton = host.querySelector<HTMLButtonElement>('[aria-label="查找和替换"]')
    expect(findButton).not.toBeNull()
    expect(findButton!.getAttribute('aria-pressed')).toBe('false')

    const bodyChildrenBefore = document.body.childElementCount
    press(findButton!)
    expect(findButton!.getAttribute('aria-pressed')).toBe('true')
    // 栏落在次工具条里（`.mimir-editor__chrome` 那一条 sticky 容器）
    expect(host.querySelector('.mimir-editor__subbar .me-find')).not.toBeNull()
    // 就地渲染：整页的元素数一个不增（antd 的 Dropdown / Select 会 +1）
    expect(document.body.childElementCount).toBe(bodyChildrenBefore)
  })
})
