/**
 * @vitest-environment happy-dom
 *
 * 外壳的渲染契约。
 *
 * 这些断言守的都是**静默失效**：界面看起来是对的，只有键盘用户、读屏用户、
 * 或者下一次改样式的人才会碰到。所以它们不测「长什么样」（那是视觉验证的
 * 事），只测结构上与行为上的硬要求。
 *
 * ## 控件换成 antd 之后（D-064）这些断言改成什么样、**没放宽什么**
 *
 * | 原来守的 | 现在怎么守 |
 * |---|---|
 * | 是 `<button>` 不是 div | 不变（antd 渲染的就是 button） |
 * | `aria-pressed` 表达按下态 | 不变（antd **不认**这个属性，所以按下态样式由 `shell.css` 的 `.me-tb` 规则负责，另有一条静态守护） |
 * | 按下时 `preventDefault` | 不变（选区不能被清掉，antd 不会替我们做） |
 * | 禁用时 title 让给原因 | 不变（`disabledReason` 的语义一字未改） |
 * | 原生 `<select>` 的 option 列表 | 改成**点开下拉再读选项**（antd 的选项打开弹层才渲染） |
 * | 互斥组「只有一个 aria-pressed=true」 | 改成 radio 语义：**恰好一个 `checked`** |
 *
 * 这个文件单独要 DOM 环境（见 vitest.config.ts 里为什么默认是 Node）。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Editor, Mark, Node } from '@tiptap/core'
import {
  EditorShell,
  EditorState,
  FindReplaceBar,
  ToolbarButton,
  ToolbarColorPicker,
  ToolbarDivider,
  ToolbarFileButton,
  ToolbarGridPicker,
  ToolbarGroup,
  ToolbarLabel,
  ToolbarMenu,
  ToolbarMenuItemRow,
  ToolbarMenuSeparator,
  ToolbarNotice,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarSpacer,
  ToolbarTabs,
  ToolbarTextButton,
  ToolbarTextField,
  ToolbarToggleGroup,
  useToolbarState,
  type FindReplaceAdapter,
} from './EditorShell.js'
import { openSelect, selectRoot } from './antd-test-dom.js'

/** 本文件所在目录，用来读 `shell.css` 做静态守护 */
const here = import.meta.dirname

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node)

/* ── DOM 渲染的小工具：挂载 → 交互 → 卸载 ─────────────────────── */

const mounted: { unmount: () => void }[] = []

afterEach(() => {
  for (const item of mounted) item.unmount()
  mounted.length = 0
})

function mountRoot(node: Parameters<typeof createRoot>[1] extends never ? never : React.ReactNode) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  // React 要求测试里显式声明这是 act 环境，否则 setState 会打警告
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  act(() => root.render(node))
  let live = true
  const unmount = () => {
    if (!live) return
    live = false
    act(() => root.unmount())
    host.remove()
  }
  mounted.push({ unmount })
  return { host, unmount }
}

function mount(node: Parameters<typeof createRoot>[1] extends never ? never : React.ReactNode) {
  return mountRoot(node).host
}

/**
 * 往受控控件里「真的输入」。
 *
 * **必须走原型上的 setter**：直接 `input.value = x` 之后 React 的值追踪器
 * 认为没变，`onChange` 不会触发——测试于是「通过」在一个从没被通知的组件上。
 * 这是测受控输入时最容易写出假绿的一条。
 *
 * 换成 antd 之后 `HTMLSelectElement` 那一支没有了（下拉不再是原生 select，
 * 用法见 `openSelect`），所以参数只剩 input。
 */
function setValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(element, value)
  act(() => {
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function press(element: Element, key: string) {
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

function mouseDown(element: Element): boolean {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  act(() => {
    element.dispatchEvent(event)
  })
  return event.defaultPrevented
}

/**
 * 只有查找的适配器（pdf 就是这个形状）：`replaceOne` / `replaceAll` 不存在。
 *
 * 这一份在文件顶层而不是某个 describe 里——`unicorn(consistent-function-scoping)`
 * 会指出「它没有捕获任何父作用域的变量」，而那条规则是对的：放在里面等于每次
 * 都新建一份。
 */
const searchOnly = () => ({
  search: vi.fn<(query: string, options: unknown, active: number) => number>(() => 3),
  activate: vi.fn<(index: number) => void>(),
  clear: vi.fn<() => void>(),
})

describe('EditorShell', () => {
  it('四个槽位自上而下：工具条 → 内容 → 附属面板 → 状态行', () => {
    const out = html(
      <EditorShell
        toolbar={<ToolbarLabel>工具条</ToolbarLabel>}
        footer={<span>附属</span>}
        status={<span>状态</span>}
      >
        <div>内容</div>
      </EditorShell>,
    )

    const at = (needle: string) => {
      const index = out.indexOf(needle)
      expect(index, `没找到「${needle}」`).toBeGreaterThan(-1)
      return index
    }
    expect(at('工具条')).toBeLessThan(at('内容'))
    expect(at('内容')).toBeLessThan(at('附属'))
    expect(at('附属')).toBeLessThan(at('状态'))
  })

  it('没传的槽位不渲染——空槽位会占位、看起来像内容没出来', () => {
    const out = html(
      <EditorShell>
        <div>内容</div>
      </EditorShell>,
    )
    expect(out).not.toContain('mimir-editor__bar')
    expect(out).not.toContain('mimir-editor__footer')
    expect(out).not.toContain('mimir-editor__status')
    expect(out).toContain('内容')
  })

  it('贴边模式去掉外框与圆角（它已经在面板里，不要框套框）', () => {
    const flush = html(
      <EditorShell flush>
        <div>内容</div>
      </EditorShell>,
    )
    const boxed = html(
      <EditorShell>
        <div>内容</div>
      </EditorShell>,
    )
    expect(flush).toContain('mimir-editor--flush')
    expect(boxed).not.toContain('mimir-editor--flush')
  })
})

describe('ToolbarButton', () => {
  it('是真 button，不是带 onClick 的 div（键盘与读屏都靠它）', () => {
    const out = html(<ToolbarButton label="加粗" onClick={() => {}} />)
    expect(out).toContain('<button')
    expect(out).toContain('type="button"')
  })

  it('按下态写进 aria-pressed，没有第二处状态；不传 active 时整个属性不出现', () => {
    const on = html(<ToolbarButton label="加粗" active onClick={() => {}} />)
    const off = html(<ToolbarButton label="加粗" active={false} onClick={() => {}} />)
    expect(on).toContain('aria-pressed="true"')
    // 真切换按钮的「没按下」也要说出来（读屏才知道这是个切换）
    expect(off).toContain('aria-pressed="false"')
    /*
     * **一次性动作不该带 aria-pressed**：保存、上一页、A+/A− 没有两个状态，
     * 无条件下发 `aria-pressed="false"` 会让读屏把它们报成「未按下的切换按钮」
     * （实测 pdf 工具条上 15 个按钮全带）。判据是「调用方给没给 `active`」。
     */
    const plain = html(<ToolbarButton label="保存到库" onClick={() => {}} />)
    expect(plain).not.toContain('aria-pressed')
  })

  it('提示文字同时是无障碍名称（title 之外还要 aria-label）', () => {
    const withIcon = html(
      <ToolbarButton label="加粗" onClick={() => {}}>
        <b>B</b>
      </ToolbarButton>,
    )
    expect(withIcon).toContain('title="加粗"')
    expect(withIcon).toContain('aria-label="加粗"')
  })

  it('主按钮显示文字标签——只有图标的话「保存」这个动作认不出来', () => {
    const out = html(<ToolbarButton label="保存" primary onClick={() => {}} />)
    /*
     * **两个类都要断，一个都不能少。**
     *
     * antd 的 `button.js` 里 `ant-btn-${type}` 与 `ant-btn-color-*` /
     * `ant-btn-variant-*` 是**两个独立分支**，可以同时出现。实测
     * `<Button type="primary" variant="text" color="default">` 仍然带
     * `ant-btn-primary`，但它是**透明的**（background transparent、文字色是
     * 普通文字色）——也就是一个看得见却看不见的「保存」，而 antd 对这种组合
     * 不给任何告警。只断 `ant-btn-primary` 会把它放过去。
     */
    expect(out).toContain('ant-btn-color-primary')
    expect(out).toContain('ant-btn-variant-solid')
    expect(out).toContain('保存')
    // 普通按钮反过来：只可能是 text + default，不能是实心的
    const plain = html(<ToolbarButton label="加粗" onClick={() => {}} />)
    expect(plain).toContain('ant-btn-variant-text')
    expect(plain).not.toContain('ant-btn-color-primary')
  })

  it('禁用态落到 disabled 属性上，而不是只把颜色调淡', () => {
    const out = html(<ToolbarButton label="保存" disabled onClick={() => {}} />)
    expect(out).toContain('disabled')
  })

  /**
   * **按下时不能让编辑区失焦。**
   *
   * 这是工具条里最容易静默坏掉的一条：按钮默认会在 mousedown 时拿走焦点，
   * 浏览器随即清掉编辑区里的选区，于是 `toggleMark('bold')` 作用在一个
   * 空选区上——「点了加粗，没有反应，也不报错」。Word 也是这么做的。
   */
  it('按下时阻止默认行为——否则选区先被清掉，命令作用不到它', () => {
    const host = mount(<ToolbarButton label="加粗" onClick={() => {}} />)
    const button = host.querySelector('button')!
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    act(() => {
      button.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
  })

  it('点击转发到 onClick', () => {
    const onClick = vi.fn<() => void>()
    const host = mount(<ToolbarButton label="加粗" onClick={onClick} />)
    act(() => {
      host.querySelector('button')!.click()
    })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  /**
   * **主按钮外面会多一层 antd 的 `Wave`**（水波纹），而我们那句
   * `preventDefault` 必须仍然生效——否则点「保存」会让编辑区失焦。
   *
   * 实测 Wave 是「加一个原生 listener + 合并 ref」的实现，不覆盖我们的
   * React `onMouseDown`；这一条断言把它钉住，免得哪天 antd 改了包装方式。
   */
  it('主按钮（外面套一层 Wave）同样阻止默认行为', () => {
    const host = mount(<ToolbarButton label="保存" primary onClick={() => {}} />)
    expect(mouseDown(host.querySelector('button')!)).toBe(true)
  })

  /**
   * **ref 必须转发到真正的 `<button>` 上。**
   *
   * `ToolbarConfirm`（以及将来任何包一层的定位原语）靠
   * `cloneElement(child, { ref })` 拿触发元素；ref 被函数组件丢掉时
   * rc-trigger 的 `targetEle` 是 null，`onAlign` 直接返回，弹层留在初始位置
   * `left: -1000vw; top: -1000vh`——**DOM 里一切正常、点确认也能走到
   * `onConfirm`，只有屏幕上看不见**（真实浏览器实测：确认框的 rect 是
   * x=-14400、y=-9000）。所以这里断的是「ref 落到了一个真元素上」。
   */
  it('ref 转发到真正的 button 上（丢掉它会让外层的弹层静默跑到屏幕外）', () => {
    let captured: Element | null = null
    mount(
      <ToolbarButton
        label="加粗"
        onClick={() => {}}
        ref={(node) => {
          captured = node
        }}
      />,
    )
    expect(captured).not.toBeNull()
    expect(captured!.tagName).toBe('BUTTON')
    expect(captured!.getAttribute('aria-label')).toBe('加粗')
  })
})

describe('ToolbarTabs', () => {
  it('选中态写进 aria-selected，且带 role=tab（读屏要靠它报「第几张表」）', () => {
    const out = html(
      <ToolbarTabs
        label="工作表"
        value="b"
        onChange={() => {}}
        items={[
          { value: 'a', label: '表一' },
          { value: 'b', label: '表二' },
        ]}
      />,
    )
    expect(out).toContain('role="tablist"')
    expect(out).toContain('aria-label="工作表"')
    expect(out).toContain('aria-selected="true"')
    expect(out).toContain('aria-selected="false"')
  })

  it('点页签把它的值报上去', () => {
    const onChange = vi.fn<(value: string) => void>()
    const host = mount(
      <ToolbarTabs
        label="工作表"
        value="a"
        onChange={onChange}
        items={[
          { value: 'a', label: '表一' },
          { value: 'b', label: '表二' },
        ]}
      />,
    )
    const tabs = host.querySelectorAll('button')
    act(() => {
      tabs[1]!.click()
    })
    expect(onChange).toHaveBeenCalledWith('b')
  })
})

describe('零件', () => {
  it('分隔线与撑开块都是纯装饰，读屏不该念它们', () => {
    expect(html(<ToolbarDivider />)).toContain('aria-hidden="true"')
    expect(html(<ToolbarSpacer />)).not.toContain('<button')
  })

  /**
   * antd 的 `Divider` 自带 `role="separator"`，而要它别念出来只能靠
   * `aria-hidden`（我们自己加）。反过来，**不能再挂 `.me-sep`**：那个类是
   * 「1px 宽 + background」的画法，与 antd 的 `border-inline-start` 不重叠、
   * 特异性相同、都生效——结果是 1px 内容盒 + 1px 边框。
   *
   * **「画出 2px」是从两边的源码推的**（happy-dom 取不到
   * `border-inline-start-width` 的值），所以这条断言守的是「别挂那个类」，
   * 真正的像素要在浏览器里核。
   */
  it('分隔线不再挂 me-sep（两条画法叠加会画出 2px）', () => {
    const out = html(<ToolbarDivider />)
    expect(out).not.toContain('me-sep')
    expect(out).toContain('ant-divider-vertical')
  })

  it('分隔线不打废弃告警（`type="vertical"` 在 v6 已废弃，要走 orientation）', () => {
    const errors: unknown[][] = []
    const error = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args)
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation((...args) => {
      errors.push(args)
    })
    const host = mount(<ToolbarDivider />)
    error.mockRestore()
    warn.mockRestore()
    expect(host.querySelector('[role="separator"]')).not.toBeNull()
    expect(errors).toEqual([])
  })

  it('错误态与普通态是两个类，不靠颜色硬编码区分', () => {
    const error = html(<EditorState tone="error">读取失败</EditorState>)
    const muted = html(<EditorState>渲染中</EditorState>)
    expect(error).toContain('me-state--error')
    expect(muted).not.toContain('me-state--error')
  })
})

/**
 * **样式的静态守护。**
 *
 * 这一层能守的东西有限，原因是实测出来的：`import '@mimir/office/shell.css'`
 * 在 vitest 下**不注入任何规则**（默认 `test.css: false`，实测 STYLE_TAGS: 0、
 * 按钮的计算高度是空串），所以「按下态的背景色与没按下不同」这种断言在这里
 * 写不出来。能写的是**读 CSS 文本**，删掉规则就红。
 *
 * 真正的视觉验证在浏览器里做（见 .trellis/spec/project/decisions.md D-064 的验收清单）。
 */
describe('shell.css 的静态守护', () => {
  const css = readFileSync(join(here, 'shell.css'), 'utf8')

  it('按下态的那一对选择器都在——antd 不认 aria-pressed，这是唯一的外观来源', () => {
    expect(css).toContain(".me-tb[aria-pressed='true']")
    /*
     * `:hover` 的伴随选择器**不是重复**：antd 的
     * `.ant-btn-variant-text:hover:not(:disabled)` 是 (0,3,0)，只写
     * `.me-tb[aria-pressed='true']`（(0,2,0)）的话鼠标一悬停按下态就被
     * hover 底色盖掉。删掉这一条，下面那条断言会红。
     */
    expect(css).toContain(".me-tb[aria-pressed='true']:hover:not(:disabled)")
  })

  it('.me-btn 的尺寸、焦点环、禁用态都在——两个未迁移的弹层触发器只靠它', () => {
    // 这三条一起保证「键盘用户按 Tab 走到「段落样式」上看得到焦点」
    expect(css).toContain('.me-btn:focus-visible')
    expect(css).toContain('.me-btn:disabled')
    expect(css).toMatch(/--me-control-height:\s*24px/)
  })

  it('.me-sr-only 留在无障碍树里（用 clip-path，不用 display:none）', () => {
    /*
     * 图标档的可及名称完全依赖这段文字留在无障碍树里——`display: none` 与
     * `visibility: hidden` 会把名称一起去掉，那等于没修。判据是标准的
     * `clip-path: inset(50%)` 做法，且规则里不能出现那两个属性。
     */
    const rule = /\.me-sr-only \{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(rule).toContain('clip-path: inset(50%)')
    expect(rule).not.toContain('display: none')
    expect(rule).not.toContain('visibility: hidden')
  })
})

describe('EditorShell 的次工具条与状态行', () => {
  it('笔记变体只作用于笔记，工具分组与状态仍可达', () => {
    const toolbar = (
      <ToolbarGroup label="字符格式">
        <ToolbarButton label="加粗" />
      </ToolbarGroup>
    )
    const note = html(
      <EditorShell variant="note" toolbar={toolbar} status={<ToolbarLabel>已修改</ToolbarLabel>}>
        <div>正文</div>
      </EditorShell>,
    )
    const office = html(
      <EditorShell toolbar={toolbar}>
        <div>正文</div>
      </EditorShell>,
    )

    expect(note).toContain('mimir-editor--note')
    expect(office).not.toContain('mimir-editor--note')
    expect(note).toContain('aria-label="字符格式"')
    expect(note.indexOf('mimir-editor__body')).toBeLessThan(note.indexOf('mimir-editor__status'))
    expect(note).toContain('已修改')
  })

  it('顶部工具条与底部状态行各自渲染，状态行没有操作列', () => {
    const out = html(
      <EditorShell
        toolbar={
          <ToolbarGroup label="字符格式">
            <ToolbarButton label="加粗" />
          </ToolbarGroup>
        }
        status={<ToolbarLabel>第 2 页</ToolbarLabel>}
      >
        <div>内容</div>
      </EditorShell>,
    )
    expect(out).toContain('mimir-editor__tools')
    expect(out.indexOf('mimir-editor__body')).toBeLessThan(out.indexOf('mimir-editor__status'))
    expect(out).toContain('mimir-editor__status-content')
    expect(out).toContain('第 2 页')
    expect(out).not.toContain('mimir-editor__status-actions')
    expect(out).toContain('me-group__caption')

    const css = readFileSync(join(here, 'shell.css'), 'utf8')
    expect(css).toMatch(/\.mimir-editor__tools\s*\{[^}]*overflow-y:\s*auto/s)
    expect(css).not.toMatch(/\.mimir-editor__chrome\s*\{[^}]*overflow-y:\s*auto/s)
    expect(css).not.toContain('.mimir-editor__status-actions')
  })

  it('只传状态也渲染状态行，不制造空的顶部工具条', () => {
    const host = mount(
      <EditorShell status={<ToolbarLabel>已修改，未保存</ToolbarLabel>}>
        <div>内容</div>
      </EditorShell>,
    )

    expect(host.querySelector('.mimir-editor__chrome')).toBeNull()
    expect(host.querySelector('.mimir-editor__bar')).toBeNull()
    const status = host.querySelector('.mimir-editor__status')!
    expect(status.querySelector('.mimir-editor__status-content')?.textContent).toBe(
      '已修改，未保存',
    )
    expect(status.querySelector('button')).toBeNull()
  })

  it('未传状态时不渲染空状态行或附属面板', () => {
    const host = mount(
      <EditorShell>
        <div>内容</div>
      </EditorShell>,
    )

    expect(host.querySelector('.mimir-editor__status')).toBeNull()
    expect(host.querySelector('.mimir-editor__footer')).toBeNull()
    expect(host.querySelector('.mimir-editor__body')?.textContent).toBe('内容')
  })

  it('长状态说明可换行，计数仍保留在同一状态行', () => {
    const out = html(
      <EditorShell
        status={
          <>
            <ToolbarLabel>文件已修改，尚未保存</ToolbarLabel>
            <ToolbarLabel>3 张幻灯片</ToolbarLabel>
          </>
        }
      >
        <div>内容</div>
      </EditorShell>,
    )
    expect(out.match(/mimir-editor__status-content/g)).toHaveLength(1)
    expect(out).toContain('文件已修改，尚未保存')
    expect(out).toContain('3 张幻灯片')

    const css = readFileSync(join(here, 'shell.css'), 'utf8')
    const content = /\.mimir-editor__status-content \{[^}]*\}/.exec(css)?.[0] ?? ''
    const labels = /\.mimir-editor__status-content > \.me-label \{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(content).toContain('flex-wrap: wrap')
    expect(content).toContain('min-width: 0')
    expect(labels).toContain('white-space: normal')
    expect(labels).toContain('overflow-wrap: anywhere')
  })

  it('subbar 在工具条之后、内容之前，且与工具条同包一层——两行各自 sticky 会重叠', () => {
    const out = html(
      <EditorShell toolbar={<span>工具条</span>} subbar={<span>次工具条</span>}>
        <div>内容</div>
      </EditorShell>,
    )
    const at = (needle: string) => out.indexOf(needle)
    expect(at('工具条')).toBeLessThan(at('次工具条'))
    expect(at('次工具条')).toBeLessThan(at('内容'))
    // 两行都在同一个 sticky 容器里（`__chrome` 只出现一次）
    expect(out.match(/mimir-editor__chrome/g)).toHaveLength(1)
  })

  it('只给 subbar 时也渲染 chrome——否则查找栏不会跟着吸顶', () => {
    const out = html(
      <EditorShell subbar={<span>查找</span>}>
        <div>内容</div>
      </EditorShell>,
    )
    expect(out).toContain('mimir-editor__chrome')
    expect(out).toContain('mimir-editor__subbar')
    expect(out).not.toContain('mimir-editor__bar"')
  })

  it('两个槽位都不给时不渲染 chrome——空容器会占掉一行高度', () => {
    const out = html(
      <EditorShell>
        <div>内容</div>
      </EditorShell>,
    )
    expect(out).not.toContain('mimir-editor__chrome')
  })
})

describe('ToolbarButton 的 disabledReason', () => {
  it('禁用时 title 让给原因，aria-label 仍是动作名——读屏要听到「什么不可用」', () => {
    const out = html(
      <ToolbarButton
        label="插入表格"
        disabled
        disabledReason="这个方言没有表格节点"
        onClick={() => {}}
      />,
    )
    expect(out).toContain('title="这个方言没有表格节点"')
    expect(out).toContain('aria-label="插入表格"')
  })

  it('可用时 title 还是 label（原因只属于禁用态）', () => {
    const out = html(
      <ToolbarButton label="插入表格" disabledReason="这个方言没有表格节点" onClick={() => {}} />,
    )
    expect(out).toContain('title="插入表格"')
    expect(out).not.toContain('这个方言没有表格节点')
  })

  it('没给原因时禁用态的 title 保持 label——不要凭空出现空 tooltip', () => {
    const out = html(<ToolbarButton label="保存" disabled onClick={() => {}} />)
    expect(out).toContain('title="保存"')
  })
})

describe('ToolbarGroup', () => {
  it('是 role=group 的边界盒，名字给读屏（分隔线只是装饰，表达不了范围）', () => {
    const out = html(
      <ToolbarGroup label="对齐方式">
        <ToolbarButton label="左对齐" onClick={() => {}} />
      </ToolbarGroup>,
    )
    expect(out).toContain('role="group"')
    expect(out).toContain('aria-label="对齐方式"')
  })
})

describe('ToolbarSelect', () => {
  it('无障碍名称与悬停说明都在（title 是工具条上唯一的悬停说明）', () => {
    const out = html(
      <ToolbarSelect
        label="字号"
        value="12"
        onChange={() => {}}
        options={[
          { value: '10', label: '10' },
          { value: '12', label: '12' },
        ]}
      />,
    )
    expect(out).toContain('aria-label="字号"')
    expect(out).toContain('title="字号"')
  })

  /**
   * antd 的默认箭头图标带 `aria-label="down"`——同一条工具条上几个下拉就有
   * 几个同名控件（docx 有 9 个），「无障碍名称不得重复」那条契约会直接红。
   */
  it('自带的箭头图标必须换掉，否则会有 N 个叫 down 的控件', () => {
    const out = html(
      <ToolbarSelect
        label="字号"
        value="12"
        onChange={() => {}}
        options={[{ value: '12', label: '12' }]}
      />,
    )
    expect(out).not.toContain('aria-label="down"')
  })

  it('值不在选项里时显示「不是任何一档」，而不是冒充第一项', () => {
    const out = html(
      <ToolbarSelect
        label="字号"
        value={null}
        fallbackLabel="混合"
        onChange={() => {}}
        options={[{ value: '12', label: '12' }]}
      />,
    )
    expect(out).toContain('混合')
    // 一个「已选中」的标记都没有——显示区是占位，不是第一项
    expect(out).not.toContain('ant-select-content-has-value')
  })

  /**
   * `null`（这里没有直接取值）与「值不在档位里」是**两件事**，说的是两句不同
   * 的话：前者是「这里没设，跟着样式走」，后者是「有一个具体的值，只是不在
   * 预设档位里」。共用一个说法时第一句会被读成第二句——docx 的字号原先两处
   * 都是「其它」，在没设字号的文字上显示成「我选了别的字号」。
   */
  it('`emptyLabel` 只作用于 `null` 那一支，不碰「值不在档位里」那一句', () => {
    const empty = html(
      <ToolbarSelect
        label="字号（磅）"
        value={null}
        fallbackLabel="其它"
        emptyLabel="（默认）"
        onChange={() => {}}
        options={[{ value: '22', label: '11' }]}
      />,
    )
    expect(empty).toContain('（默认）')
    expect(empty).not.toContain('其它')

    const outside = html(
      <ToolbarSelect
        label="字号（磅）"
        value="22"
        fallbackLabel="其它"
        emptyLabel="（默认）"
        onChange={() => {}}
        options={[{ value: '20', label: '10' }]}
      />,
    )
    // 有具体值（半磅 22 = 11 磅）时仍说「22（其它）」，不冒充默认
    expect(outside).toContain('22（其它）')
    expect(outside).not.toContain('（默认）')
  })

  it('不给 `emptyLabel` 时退回 `fallbackLabel`（老调用点行为不变）', () => {
    const out = html(
      <ToolbarSelect
        label="字号"
        value={null}
        fallbackLabel="混合"
        onChange={() => {}}
        options={[{ value: '12', label: '12' }]}
      />,
    )
    expect(out).toContain('混合')
  })

  /**
   * **不在档位里的值不显示原值，显示 `值（占位说明）`。**
   *
   * docx 的字号存的是**半磅**（`w:sz` 的单位），直接显示原值会让界面说一个
   * 用户从没见过的数（他填的是 11 磅，框里写着 22）。
   */
  it('值在选项之外时显示「值（占位说明）」而不是原值本身', () => {
    const out = html(
      <ToolbarSelect
        label="字号（磅）"
        value="22"
        fallbackLabel="其它"
        onChange={() => {}}
        options={[{ value: '20', label: '10' }]}
      />,
    )
    expect(out).toContain('22（其它）')
    expect(out).not.toContain('ant-select-content-has-value')
  })

  it('选一项把它的值报上去', () => {
    const onChange = vi.fn<(value: string) => void>()
    const host = mount(
      <ToolbarSelect
        label="字号"
        value="10"
        onChange={onChange}
        options={[
          { value: '10', label: '10' },
          { value: '12', label: '12' },
        ]}
      />,
    )
    const options = openSelect(host, '字号')
    expect(options.map((option) => option.textContent)).toEqual(['10', '12'])
    click(options[1]!)
    expect(onChange).toHaveBeenCalledWith('12')
  })

  it('单档不可选时那一项带 aria-disabled（有这一档但当前文档用不了）', () => {
    const host = mount(
      <ToolbarSelect
        label="字号"
        value="10"
        onChange={() => {}}
        options={[
          { value: '10', label: '10' },
          { value: '72', label: '72', disabled: true },
        ]}
      />,
    )
    const options = openSelect(host, '字号')
    expect(options[0]!.getAttribute('aria-disabled')).toBe('false')
    expect(options[1]!.getAttribute('aria-disabled')).toBe('true')
  })

  /**
   * 关闭态不该有 `role="listbox"` 之类的半展开语义——读屏会以为它已经展开。
   * 展开态的那些属性（`aria-expanded` / `aria-haspopup` / `role=combobox`）
   * 由 antd 给，这里只确认它们确实在。
   */
  it('收起时也是 combobox 语义，展开状态由 aria-expanded 表达', () => {
    const out = html(
      <ToolbarSelect
        label="字号"
        value="10"
        onChange={() => {}}
        options={[{ value: '10', label: '10' }]}
      />,
    )
    expect(out).toContain('role="combobox"')
    expect(out).toContain('aria-expanded="false"')
    expect(out).toContain('aria-haspopup="listbox"')
  })

  /**
   * **下拉弹层 portal 到 body，这是显式例外**（见 `ToolbarSelect` 的说明）：
   * 弹层内容只有文本选项、不吃 `--me-*`，antd 自己的 `css-var-root` 提供
   * `--ant-*`，所以颜色不会坏。改 `getPopupContainer` 反而会被外壳的
   * `overflow: clip` 裁掉（弹层会退成 `position: absolute`）。
   *
   * 这一条把「它确实 portal 了」写下来，免得下一个人当 bug 去「修」。
   */
  it('下拉弹层 portal 到 body（与 ToolbarMenu 的就地渲染相反，是有意的）', () => {
    const before = document.body.childElementCount
    const host = mount(
      <ToolbarSelect
        label="字号"
        value="10"
        onChange={() => {}}
        options={[{ value: '10', label: '10' }]}
      />,
    )
    openSelect(host, '字号')
    expect(document.body.childElementCount).toBeGreaterThan(before)
    // 弹层不在 host 里
    expect(host.querySelector('.ant-select-dropdown')).toBeNull()
    expect(selectRoot(host, '字号')).not.toBeNull()
  })

  it('紧凑触发器打开的选项列表至少有可读宽度', () => {
    const host = mount(
      <ToolbarSelect
        label="段落样式"
        value="p"
        onChange={() => {}}
        options={[
          { value: 'p', label: '正文' },
          { value: 'h0', label: '标题（这份文档没有标题样式）', disabled: true },
        ]}
      />,
    )
    const options = openSelect(host, '段落样式')
    const popup = options[0]!.closest<HTMLElement>('.ant-select-dropdown')
    expect(popup?.style.minWidth).toBe('180px')
    expect(popup?.style.maxWidth).toBe('calc(100vw - 16px)')
    expect(popup?.style.width).toBe('')
  })
})

describe('ToolbarToggleGroup', () => {
  it('互斥由 radio 语义表达：恰好一个 checked（读屏报的是单选组）', () => {
    const host = mount(
      <ToolbarToggleGroup
        label="对齐方式"
        value="center"
        onChange={() => {}}
        options={[
          { value: 'left', label: '左对齐' },
          { value: 'center', label: '居中' },
          { value: 'right', label: '右对齐' },
        ]}
      />,
    )
    expect(host.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('对齐方式')
    const radios = [...host.querySelectorAll<HTMLInputElement>('input[type=radio]')]
    expect(radios).toHaveLength(3)
    expect(radios.filter((radio) => radio.checked)).toHaveLength(1)
    expect(radios[1]!.checked).toBe(true)
  })

  /**
   * **按下时不能让编辑区失焦。**
   *
   * antd 的 `Segmented` 项**自己不做** `preventDefault`（实测
   * `SEG_MOUSEDOWN_PREVENTED: false`），落点是一个可聚焦的 `<input type=radio>`
   * ——不拦的话点一下就可能把编辑区失焦、选区被清，与工具条按钮是同一个坑。
   */
  it('在项上按下时阻止默认行为——否则选区先被清掉', () => {
    const host = mount(
      <ToolbarToggleGroup
        label="对齐方式"
        value="left"
        onChange={() => {}}
        options={[
          { value: 'left', label: '左对齐' },
          { value: 'right', label: '右对齐' },
        ]}
      />,
    )
    expect(mouseDown(host.querySelector('label')!)).toBe(true)
  })

  it('没给图标的选项退回 label 文字（不给就是个空方块）', () => {
    /*
     * 实测踩过：只传 `icon` 的那一支会渲染成**一个空的纯色方块**——它在真实
     * 截图里才看得出来（文字方向那两个按钮就是两个蓝方块），而 DOM 断言完全
     * 正常：`aria-label` 有、点击有效、`disabled` 也对。
     *
     * 所以判据是「里面有文字」：`label` 同时进了 `title`，光看「字符串出现在
     * 输出里」会被它蒙对。
     */
    const host = mount(
      <ToolbarToggleGroup
        label="文字方向"
        value="ltr"
        onChange={() => {}}
        options={[
          { value: 'ltr', label: '从左到右' },
          { value: 'rtl', label: '从右到左' },
        ]}
      />,
    )
    const texts = [...host.querySelectorAll('.ant-segmented-item-label')].map((item) =>
      (item.textContent ?? '').trim(),
    )
    expect(texts).toEqual(['从左到右', '从右到左'])
  })

  it('给了图标就只显示图标（文字以 .me-sr-only 留给读屏，名称不能丢）', () => {
    /*
     * 「只显示图标」与「有可及名称」曾经只能二选一：旧实现每档是一个带
     * `aria-label` 的按钮，换成 antd `Segmented` 后 `title` 挂在内层 label 的
     * div 上、可聚焦的是 `<input type=radio>`，两者不关联——实测真 Chromium 的
     * AX 树里只传 `title` 的档全部 `name: ""`（6 个档全空；把 title 挪到 input
     * 上也仍然是空），读屏只念「单选按钮，1 of 3」，用户听不出这一档是什么。
     *
     * 所以 label 文字必须**真的在 label 元素里**（那是名称的来源），只是视觉上
     * 不占位：`.me-sr-only` 用 `clip-path` 藏，而 `display:none` 会把名称一起
     * 去掉（那等于没修，所以 CSS 那边另有一条静态守护）。
     */
    const host = mount(
      <ToolbarToggleGroup
        label="对齐方式"
        value="left"
        onChange={() => {}}
        options={[{ value: 'left', label: '左对齐', icon: <span>↤</span> }]}
      />,
    )
    const item = host.querySelector('.ant-segmented-item-label')!
    // 图标还在（档上看得见的是它）
    expect(item.textContent).toContain('↤')
    // 名称的来源：文字在 label 元素里
    expect(item.querySelector('.me-sr-only')?.textContent).toBe('左对齐')
    // 悬停说明仍在（鼠标也能拿到名字）
    expect(item.getAttribute('title')).toBe('左对齐')
  })

  it('点另一个值把新值报上去', () => {
    const onChange = vi.fn<(value: string) => void>()
    const host = mount(
      <ToolbarToggleGroup
        label="对齐方式"
        value="left"
        onChange={onChange}
        options={[
          { value: 'left', label: '左对齐' },
          { value: 'right', label: '右对齐' },
        ]}
      />,
    )
    click(host.querySelectorAll('input[type=radio]')[1]!)
    expect(onChange).toHaveBeenCalledWith('right')
  })
})

describe('ToolbarNumberField', () => {
  const props = { label: '页码', min: 1, max: 10, onCommit: () => {} }

  it.each([false, true])(
    'commits an active number draft before the first apply click (textButton=%s)',
    (textButton) => {
      const apply = vi.fn<(value: number) => void>()
      function Form() {
        const [value, setNumber] = useState(80)
        return (
          <>
            <ToolbarNumberField label="横坐标" value={value} onCommit={setNumber} />
            {textButton ? (
              <ToolbarTextButton label="应用" onClick={() => apply(value)} />
            ) : (
              <ToolbarButton label="应用" onClick={() => apply(value)}>
                应用
              </ToolbarButton>
            )}
          </>
        )
      }
      const host = mount(<Form />)
      const input = host.querySelector('input')!
      act(() => input.focus())
      setValue(input, '110')
      const button = host.querySelector('button')!
      mouseDown(button)
      click(button)
      expect(apply).toHaveBeenCalledExactlyOnceWith(110)
      expect(input.value).toBe('110')
    },
  )

  it('回车提交，并夹到 [min, max]', () => {
    const onCommit = vi.fn<(value: number) => void>()
    const host = mount(<ToolbarNumberField {...props} value={3} onCommit={onCommit} />)
    const input = host.querySelector('input')!
    setValue(input, '99')
    press(input, 'Enter')
    expect(onCommit).toHaveBeenCalledWith(10)
  })

  it('失焦也提交（输入完直接点别处不该丢掉）', () => {
    const onCommit = vi.fn<(value: number) => void>()
    const host = mount(<ToolbarNumberField {...props} value={3} onCommit={onCommit} />)
    const input = host.querySelector('input')!
    setValue(input, '2')
    act(() => {
      // React 的 onBlur 挂在根上，靠冒泡的 focusout 触发
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(onCommit).toHaveBeenCalledWith(2)
  })

  it('Esc 还原：草稿丢掉，显示回到外部值', () => {
    const onCommit = vi.fn<(value: number) => void>()
    const host = mount(<ToolbarNumberField {...props} value={3} onCommit={onCommit} />)
    const input = host.querySelector('input')!
    setValue(input, '7')
    press(input, 'Escape')
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('3')
  })

  /**
   * **空输入框不能提交，而且显示要回到外部值。**
   *
   * `Number('')` 是 0，不拦的话「清空再回车」会把页码静默改成 0（然后夹到
   * 1）——用户以为自己只是清掉了输入框。
   *
   * 后一句是**这一轮新增的**：antd 的 InputNumber 清空后会**一直空着**
   * （失焦也不恢复），照「空值不提交」走就成了「界面显示空、模型还是 3」——
   * 界面说了假话。所以草稿在提交后被丢掉，显示回到外部值。
   */
  it('空值不提交，且显示回到外部值（不能界面空着、模型还是旧值）', () => {
    const onCommit = vi.fn<(value: number) => void>()
    const host = mount(<ToolbarNumberField {...props} value={3} onCommit={onCommit} />)
    const input = host.querySelector('input')!
    setValue(input, '')
    press(input, 'Enter')
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('3')

    setValue(input, '')
    act(() => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('3')
  })

  it('非数字也不提交（Number 解析不出来时不能把 NaN 写进模型）', () => {
    const onCommit = vi.fn<(value: number) => void>()
    const host = mount(<ToolbarNumberField {...props} value={3} onCommit={onCommit} />)
    const input = host.querySelector('input')!
    setValue(input, 'abc')
    press(input, 'Enter')
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('3')
  })

  it('值没变时不重复提交（避免每次失焦都触发一次保存）', () => {
    const onCommit = vi.fn<(value: number) => void>()
    const host = mount(<ToolbarNumberField {...props} value={3} onCommit={onCommit} />)
    const input = host.querySelector('input')!
    setValue(input, '3')
    press(input, 'Enter')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('是无障碍名称完整的 input（读屏要念出这是「页码」）', () => {
    const out = html(<ToolbarNumberField {...props} value={1} onCommit={() => {}} suffix="页" />)
    expect(out).toContain('aria-label="页码"')
    expect(out).toContain('title="页码"')
    expect(out).toContain('页')
  })

  /**
   * `controls={false}` 不是可选项：默认的上下两个抓手会渲染成
   * `<span role="button" aria-label="Increase Value">` / `"Decrease Value"`，
   * 10 个数字框就是 10 组重复的无障碍名，docx 的「名字不得重复」会红。
   */
  it('不渲染上下抓手（那会带来一堆重复的 "Increase Value"）', () => {
    const out = html(<ToolbarNumberField {...props} value={1} onCommit={() => {}} />)
    expect(out).not.toContain('Increase Value')
    expect(out).not.toContain('Decrease Value')
    expect(out).toContain('ant-input-number-without-controls')
  })
})

describe('ToolbarTextField', () => {
  it('回车与 Esc 各自回调化——同一排里三种含义不同', () => {
    const onSubmit = vi.fn<() => void>()
    const onCancel = vi.fn<() => void>()
    const host = mount(
      <ToolbarTextField
        label="查找内容"
        value="abc"
        onChange={() => {}}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    )
    const input = host.querySelector('input')!
    press(input, 'Enter')
    press(input, 'Escape')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('输入把新值报上去', () => {
    const onChange = vi.fn<(value: string) => void>()
    const host = mount(<ToolbarTextField label="链接地址" value="" onChange={onChange} />)
    setValue(host.querySelector('input')!, 'https://example.com')
    expect(onChange).toHaveBeenCalledWith('https://example.com')
  })

  it('不会被拼写检查划红线（查找框 / 链接地址上那是纯噪音）', () => {
    const out = html(<ToolbarTextField label="查找内容" value="" onChange={() => {}} />)
    // 服务端渲染保留 JSX 的大小写，所以按不区分大小写来断言属性名
    expect(out).toMatch(/spellcheck="false"/i)
  })
})

describe('ToolbarFileButton', () => {
  it('是一个真按钮 + 一个隐藏 input（不能只有 input——它开不了选择器的样子）', () => {
    const out = html(<ToolbarFileButton label="插入图片" accept="image/png" onPick={() => {}} />)
    expect(out).toContain('<button')
    expect(out).toContain('type="file"')
    expect(out).toContain('accept="image/png"')
    expect(out).toContain('aria-label="插入图片"')
  })

  /**
   * **同一个文件连选两次都必须触发。**
   *
   * 不清掉上一次的选择时，第二次选同一个文件浏览器不派发 `change`，症状是
   * 「点了没反应」而代码看不出问题。旧实现是「选完清 value」，antd 的 Upload
   * 是**换 key 重挂 input**——机制不同、目标一致，这一条断言不看机制，只看
   * 结果（两次都拿到文件），顺带把「input 被换掉了」记下来。
   */
  it('同一文件连选两次都能触发（第二次不触发 change 就是「点了没反应」）', async () => {
    const onPick = vi.fn<(file: File) => void>()
    const host = mount(<ToolbarFileButton label="插入图片" onPick={onPick} />)
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const pick = async (): Promise<HTMLInputElement> => {
      const input = host.querySelector<HTMLInputElement>('input[type=file]')!
      Object.defineProperty(input, 'files', { value: [file], configurable: true })
      await act(async () => {
        input.dispatchEvent(new Event('change', { bubbles: true }))
        /*
         * rc-upload 的 `beforeUpload` 是异步的（`await` 完它才 reset），所以
         * 要等一个微任务——不等的话状态更新落在 act 之外，React 会警告
         * 「update not wrapped in act」。
         */
        await Promise.resolve()
      })
      return input
    }
    const first = await pick()
    const second = await pick()
    expect(onPick).toHaveBeenCalledTimes(2)
    expect(second).not.toBe(first)
    expect(second.value).toBe('')
  })

  it('禁用时按钮是 disabled 的，点它不会开选择器', () => {
    const host = mount(<ToolbarFileButton label="插入图片" disabled onPick={() => {}} />)
    const button = host.querySelector('button')!
    expect(button.disabled).toBe(true)
  })
})

describe('ToolbarMenu', () => {
  const items = [
    { key: 'a', label: '一级标题' },
    { key: 'b', label: '二级标题', active: true },
    { key: 'c', label: '三级标题', disabled: true, disabledReason: '这个方言没有三级标题' },
  ]

  it('触发按钮带 aria-haspopup 与 aria-expanded（读屏要知道它能展开）', () => {
    const out = html(<ToolbarMenu label="段落样式" items={items} />)
    expect(out).toContain('aria-haspopup="menu"')
    expect(out).toContain('aria-expanded="false"')
    expect(out).not.toContain('role="menu"')
  })

  /**
   * **范围提醒：这一条只管 `ToolbarMenu`（与 `ToolbarColorPicker`）。**
   *
   * antd 的 `Select` 那类控件**会** portal 到 body，那是显式接受的例外
   * （见上面 `ToolbarSelect` 的那条断言与 `EditorShell.tsx` 的说明）——
   * 两个弹层是两种处置：我们的面板要用 `--me-*` 上色（出去就退回浅色回退值），
   * antd 的弹层内容只有文本、自带 `--ant-*`。别把后者当 bug 去"修"。
   */
  it('展开后是 role=menu + menuitem，且**就地渲染**不 portal（portal 会离开 --me-* 子树）', () => {
    const before = document.body.childElementCount
    const host = mount(<ToolbarMenu label="段落样式" items={items} />)
    click(host.querySelector('button')!)
    expect(host.querySelector('[role="menu"]')).not.toBeNull()
    expect(host.querySelectorAll('[role="menuitem"]')).toHaveLength(3)
    // portal 到 body 的话 body 下会多出一个元素
    expect(document.body.childElementCount).toBe(before + 1)
    expect(host.querySelector('button')!.getAttribute('aria-expanded')).toBe('true')
  })

  it('当前值用 aria-current 表达，禁用项带原因', () => {
    const host = mount(<ToolbarMenu label="段落样式" items={items} />)
    click(host.querySelector('button')!)
    const rendered = host.querySelectorAll('[role="menuitem"]')
    expect(rendered[1]!.getAttribute('aria-current')).toBe('true')
    expect(rendered[2]!.getAttribute('disabled')).not.toBeNull()
    expect(rendered[2]!.getAttribute('title')).toBe('这个方言没有三级标题')
  })

  it('没有可选项时给一条禁用的说明项，不留空面板', () => {
    const host = mount(<ToolbarMenu label="插入" items={[]} emptyLabel="还没有可插入的内容" />)
    click(host.querySelector('button')!)
    const only = host.querySelector('[role="menuitem"]')!
    expect(only.textContent).toBe('还没有可插入的内容')
    expect((only as HTMLButtonElement).disabled).toBe(true)
  })

  it('Esc 关闭并把焦点还给触发按钮——焦点不能掉到 body 上', () => {
    const host = mount(<ToolbarMenu label="段落样式" items={items} />)
    const trigger = host.querySelector('button')!
    click(trigger)
    press(host.querySelector('[role="menu"]')!, 'Escape')
    expect(host.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('点外部关闭（不还焦点——用户已经点到别处了）', () => {
    const host = mount(<ToolbarMenu label="段落样式" items={items} />)
    click(host.querySelector('button')!)
    act(() => {
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    expect(host.querySelector('[role="menu"]')).toBeNull()
  })

  it('面板里的下拉：弹层里的按下不算「点外面」——面板不能被关掉', () => {
    /*
     * 面板里的 antd `Select`（docx 的固定行距、行高规则、表格对齐、自动调整
     * 四处）打开后弹层 portal 到 body，**祖先链不在面板里**：只看
     * `panelRef.contains(target)` 的话，真浏览器里 pointerdown 一落地面板就关、
     * 弹层跟着卸载，后面的 click 落在已经不存在的选项上——症状是「点一档什么
     * 也不会发生」，界面还不报错。这就是换成 antd Select 引入的回归（原来的
     * 裸 `<select>` 选项在面板内部，所以 contains 判定为「面板内」）。
     *
     * 真浏览器的点击序列是 pointerdown → mousedown → mouseup → click，
     * 这里照抄那一步不放，而**不能只派发 click**：只发 click 的话 React 会把
     * 它和别的事件一起批处理，onChange 照样发出，这个 bug 会被测成通过。
     */
    const onChange = vi.fn<(value: string) => void>()
    const host = mount(
      <ToolbarMenu
        label="固定行距"
        renderPanel={() => (
          <ToolbarSelect
            label="行距规则"
            value=""
            onChange={onChange}
            options={[
              { value: '', label: '自动（按倍数）' },
              { value: 'exact', label: '固定值' },
            ]}
          />
        )}
      />,
    )
    click(host.querySelector('.me-btn')!)
    const option = openSelect(host, '行距规则').find((item) => item.textContent === '固定值')!
    // 真浏览器按下时先来这一步——面板与选项都要活着
    act(() => {
      option.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
    })
    expect(host.querySelector('[role="menu"]')).not.toBeNull()
    expect(option.isConnected).toBe(true)
    click(option)
    expect(onChange).toHaveBeenCalledWith('exact')
  })

  it('方向键在项之间移动，跳过禁用项', () => {
    const host = mount(<ToolbarMenu label="段落样式" items={items} />)
    click(host.querySelector('button')!)
    const panel = host.querySelector('[role="menu"]')!
    press(panel, 'ArrowDown')
    const rendered = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    expect(document.activeElement).toBe(rendered[0])
    press(rendered[0]!, 'ArrowDown')
    expect(document.activeElement).toBe(rendered[1])
    // 第三项禁用，所以再往下绕回第一项
    press(rendered[1]!, 'ArrowDown')
    expect(document.activeElement).toBe(rendered[0])
  })

  it('选中一项后关闭并执行回调', () => {
    const onSelect = vi.fn<() => void>()
    const host = mount(
      <ToolbarMenu label="段落样式" items={[{ key: 'a', label: '一级标题', onSelect }]} />,
    )
    click(host.querySelector('button')!)
    click(host.querySelector('[role="menuitem"]')!)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[role="menu"]')).toBeNull()
  })

  it('滚动就关闭——坐标是打开那一刻算的，滚完面板会悬在旧位置', () => {
    const host = mount(<ToolbarMenu label="段落样式" items={items} />)
    click(host.querySelector('button')!)
    act(() => {
      document.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    expect(host.querySelector('[role="menu"]')).toBeNull()
  })

  it('renderPanel 拿得到 close，面板内容由调用方决定', () => {
    const host = mount(
      <ToolbarMenu label="插入" renderPanel={(close) => <button onClick={close}>自定义</button>} />,
    )
    click(host.querySelector('button')!)
    expect(host.textContent).toContain('自定义')
    click(host.querySelector('[role="menu"] button')!)
    expect(host.querySelector('[role="menu"]')).toBeNull()
  })
})

describe('ToolbarColorPicker', () => {
  const options = [
    { value: 'yellow', label: '黄色', swatch: '#FFFF00' },
    { value: 'darkBlue', label: '深蓝', swatch: '#00008B' },
  ]

  it('value 与 swatch 分开：存的是 OOXML 色名，显示的是 CSS 颜色', () => {
    const onPick = vi.fn<(value: string) => void>()
    const host = mount(
      <ToolbarColorPicker label="突出显示" value="yellow" options={options} onPick={onPick} />,
    )
    click(host.querySelector('button')!)
    click(
      host.querySelectorAll('[aria-label="深蓝"]')[1] ?? host.querySelector('[aria-label="深蓝"]')!,
    )
    expect(onPick).toHaveBeenCalledWith('darkBlue')
  })

  it('选中项写进 aria-pressed，面板里只有一个', () => {
    const host = mount(
      <ToolbarColorPicker label="突出显示" value="yellow" options={options} onPick={() => {}} />,
    )
    click(host.querySelector('button')!)
    const cells = host.querySelectorAll('.me-color__cell')
    expect(cells[0]!.getAttribute('aria-pressed')).toBe('true')
    expect(cells[1]!.getAttribute('aria-pressed')).toBe('false')
  })

  it('value 为 null 表示「没设置」，不是「默认色」', () => {
    const out = html(
      <ToolbarColorPicker label="字体颜色" value={null} options={options} onPick={() => {}} />,
    )
    expect(out).toContain('me-color__swatch--none')
  })

  it('给了 onClear 才渲染清除', () => {
    const without = mount(
      <ToolbarColorPicker label="字体颜色" value="yellow" options={options} onPick={() => {}} />,
    )
    const withClear = mount(
      <ToolbarColorPicker
        label="字体颜色"
        value="yellow"
        options={options}
        onPick={() => {}}
        onClear={() => {}}
      />,
    )
    click(withClear.querySelector('button')!)
    click(without.querySelector('button')!)
    expect(without.querySelector('[aria-label="清除颜色"]')).toBeNull()
    expect(withClear.querySelector('[aria-label="清除颜色"]')).not.toBeNull()
  })

  it('清除把空值报上去（「无底纹」是一个真实取值，不是没点）', () => {
    const onClear = vi.fn<() => void>()
    const host = mount(
      <ToolbarColorPicker
        label="段落底纹"
        value="yellow"
        options={options}
        onPick={() => {}}
        onClear={onClear}
      />,
    )
    click(host.querySelector('button')!)
    click(host.querySelector('[aria-label="清除颜色"]')!)
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})

describe('FindReplaceBar', () => {
  it('适配器没有替换方法时不渲染替换区——空实现点了没反应，正是要避免的', () => {
    const host = mount(
      <FindReplaceBar adapter={searchOnly()} query="甲" onQueryChange={() => {}} />,
    )
    expect(host.textContent).not.toContain('替换')
  })

  it('有替换方法时才出现替换输入与两个按钮', () => {
    const adapter: FindReplaceAdapter = {
      ...searchOnly(),
      replaceOne: () => {},
      replaceAll: () => {},
    }
    const host = mount(<FindReplaceBar adapter={adapter} query="甲" onQueryChange={() => {}} />)
    expect(host.querySelector('[aria-label="替换为"]')).not.toBeNull()
    expect(host.textContent).toContain('替换')
    expect(host.textContent).toContain('全部替换')
  })

  it('只有 replaceAll 时只出现「全部替换」——能力按方法存在与否判断', () => {
    const adapter: FindReplaceAdapter = { ...searchOnly(), replaceAll: () => {} }
    const host = mount(<FindReplaceBar adapter={adapter} query="甲" onQueryChange={() => {}} />)
    expect(host.textContent).toContain('全部替换')
    expect(host.querySelector('[aria-label="替换这一个"]')).toBeNull()
  })

  it('匹配数报出来，且是 aria-live（它是「有没有找到」的唯一反馈）', () => {
    const host = mount(
      <FindReplaceBar adapter={searchOnly()} query="甲" onQueryChange={() => {}} />,
    )
    const count = host.querySelector('.me-find__count')!
    expect(count.textContent).toBe('1 / 3')
    expect(count.getAttribute('aria-live')).toBe('polite')
  })

  it('回车走下一个匹配（Shift 回车走上一个），与浏览器自带的查找一致', () => {
    const adapter = searchOnly()
    const host = mount(<FindReplaceBar adapter={adapter} query="甲" onQueryChange={() => {}} />)
    const input = host.querySelector<HTMLInputElement>('[aria-label="查找内容"]')!
    press(input, 'Enter')
    expect(adapter.activate).toHaveBeenLastCalledWith(1)
    press(input, 'Enter')
    expect(adapter.activate).toHaveBeenLastCalledWith(2)
    // 到末尾绕回第一个
    press(input, 'Enter')
    expect(adapter.activate).toHaveBeenLastCalledWith(0)
  })

  it('没有匹配时前后按钮都禁用（可点而无事发生是最坏的一种）', () => {
    const adapter = { ...searchOnly(), search: () => 0 }
    const host = mount(
      <FindReplaceBar adapter={adapter} query="没有这个" onQueryChange={() => {}} />,
    )
    expect(host.querySelector('.me-find__count')!.textContent).toBe('无匹配')
    const buttons = host.querySelectorAll<HTMLButtonElement>('.me-find__row button')
    expect(buttons[0]!.disabled).toBe(true)
    expect(buttons[1]!.disabled).toBe(true)
  })

  /**
   * 禁用必须说清**是哪一种**禁用（DESIGN §8.4）。
   *
   * 这四个按钮灰着的判据是 `count === 0`，那有两种情形：还没输查询词、
   * 输了但没找到。不给 `disabledReason` 时 `title` 落回按钮自己的名字，
   * 用户只能猜。**这条断言曾经扫不到它们**——调用方的契约测试只在工具条
   * （`.mimir-editor__bar`）上扫，而查找栏在 `.mimir-editor__subbar` 里。
   */
  it('禁用时给出原因，且两种原因分得开（没输词 / 没匹配）', () => {
    const adapter = { ...searchOnly(), search: () => 0 }
    const empty = mount(<FindReplaceBar adapter={adapter} query="" onQueryChange={() => {}} />)
    for (const button of empty.querySelectorAll<HTMLButtonElement>('.me-find__row button')) {
      if (!button.disabled) continue
      expect(button.getAttribute('title')).toBe('先输入要查找的内容')
      // 原因与名字不能混成一件（那就是「什么都没说」）
      expect(button.getAttribute('title')).not.toBe(button.getAttribute('aria-label'))
    }
    const typed = mount(
      <FindReplaceBar adapter={adapter} query="没有这个" onQueryChange={() => {}} />,
    )
    const next = typed.querySelector<HTMLButtonElement>('[aria-label="下一个匹配"]')!
    expect(next.disabled).toBe(true)
    expect(next.getAttribute('title')).toBe('没有匹配的内容')
    expect(next.getAttribute('title')).not.toBe(next.getAttribute('aria-label'))
  })

  it('关闭时清掉高亮——高亮是画在编辑器上的，不擦会一直留着', () => {
    const adapter = searchOnly()
    const { host, unmount } = mountRoot(
      <FindReplaceBar adapter={adapter} query="甲" onQueryChange={() => {}} />,
    )
    expect(host.querySelector('[aria-label="查找内容"]')).not.toBeNull()
    unmount()
    expect(adapter.clear).toHaveBeenCalled()
  })

  it('查询是受控的：打字只报上去，不自己存一份', () => {
    const onQueryChange = vi.fn<(value: string) => void>()
    const host = mount(
      <FindReplaceBar adapter={searchOnly()} query="" onQueryChange={onQueryChange} />,
    )
    const input = host.querySelector<HTMLInputElement>('[aria-label="查找内容"]')!
    setValue(input, '乙')
    expect(onQueryChange).toHaveBeenCalledWith('乙')
    // 外部值没变，所以显示不变——受控的意思就在这里
    expect(input.value).toBe('')
  })

  it('选项开关只在调用方给了 options 时渲染（pdf 未必实现得了全词匹配）', () => {
    const adapter = searchOnly()
    const without = mount(<FindReplaceBar adapter={adapter} query="甲" onQueryChange={() => {}} />)
    expect(without.querySelector('[aria-label="区分大小写"]')).toBeNull()
  })

  it('选项开关把新选项报上去，两个开关互不影响', () => {
    const onOptionsChange = vi.fn<(options: { matchCase: boolean; wholeWord: boolean }) => void>()
    const host = mount(
      <FindReplaceBar
        adapter={searchOnly()}
        query="甲"
        onQueryChange={() => {}}
        options={{ matchCase: false, wholeWord: false }}
        onOptionsChange={onOptionsChange}
      />,
    )
    click(host.querySelector('[aria-label="全词匹配"]')!)
    expect(onOptionsChange).toHaveBeenCalledWith({ matchCase: false, wholeWord: true })
  })

  it('适配器为 null（还没解析完）时不崩，且没有匹配', () => {
    const host = mount(<FindReplaceBar adapter={null} query="甲" onQueryChange={() => {}} />)
    expect(host.querySelector('.me-find__count')!.textContent).toBe('无匹配')
    expect(host.querySelectorAll('button')).toHaveLength(2)
  })
})

/**
 * `useToolbarState` 的契约。
 *
 * 这一条是那批「显示当前状态」按钮的**前提**：Tiptap v3 的 `useEditor` 默认
 * 不在事务上重渲染，所以渲染期直接读 `isActive` 会停在旧值——按钮不跟着光标
 * 亮/灭，也不报错。这里用一个最小方言造一个真编辑器来验证订阅确实生效。
 */
const Probe = ({ editor }: { editor: Editor }) => {
  const state = useToolbarState(editor, (instance) => (instance.isActive('bold') ? 'bold' : '-'))
  return <span>{state}</span>
}

/** editor 为 null（解析还没完成）时的分支 */
const ProbeNull = () => <span>{useToolbarState(null, () => '不该被调用')}</span>

describe('useToolbarState', () => {
  const Doc = Node.create({
    name: 'doc',
    topNode: true,
    content: 'block+',
    renderHTML: () => ['div', 0],
  })
  const Paragraph = Node.create({
    name: 'paragraph',
    group: 'block',
    content: 'inline*',
    renderHTML: () => ['p', 0],
  })
  const Text = Node.create({ name: 'text', group: 'inline' })
  const Bold = Mark.create({
    name: 'bold',
    parseHTML: () => [{ tag: 'strong' }],
    renderHTML: () => ['strong', 0],
  })

  function makeEditor() {
    const element = document.createElement('div')
    const editor = new Editor({
      element,
      extensions: [Doc, Paragraph, Text, Bold],
      content: '<p>hello</p>',
    })
    return editor
  }

  it('编辑器事务后重新算 selector（否则按钮永远停在打开文档那一刻）', () => {
    const editor = makeEditor()
    const host = mount(<Probe editor={editor} />)
    expect(host.textContent).toBe('-')
    act(() => {
      editor.chain().selectAll().toggleMark('bold').run()
    })
    expect(host.textContent).toBe('bold')
    editor.destroy()
  })

  it('editor 为 null 时返回空串，不抛异常（解析还没完成的那一刻）', () => {
    const host = mount(<ProbeNull />)
    expect(host.textContent).toBe('')
  })
})

/**
 * 「菜单项 + 别的控件混在同一个面板里」那一类面板（docx 的表格菜单与修订面板）
 * 用的原语。
 *
 * 这三条以前是**每个调用点自己手抄一遍 markup** 才有的：抄的那份漏过
 * `aria-current`（「当前值是这一项」于是只在 `items` 分支里有）、漏过早绑定
 * `close` 的时机。收进原语之后这些断言守的是唯一实现。
 */
describe('ToolbarMenuItemRow', () => {
  it('禁用时 title 让给原因，可用时 title 就是名字', () => {
    const blocked = mount(
      <ToolbarMenuItemRow
        item={{ key: 'a', label: '删除行', disabled: true, disabledReason: '整张表都在选区里' }}
      />,
    )
    const item = blocked.querySelector<HTMLButtonElement>('[role="menuitem"]')!
    expect(item.disabled).toBe(true)
    expect(item.getAttribute('title')).toBe('整张表都在选区里')
    expect(item.textContent).toBe('删除行')

    const open = mount(<ToolbarMenuItemRow item={{ key: 'a', label: '删除行' }} />)
    expect(open.querySelector('[role="menuitem"]')!.getAttribute('title')).toBe('删除行')
  })

  it('active 写 aria-current 并画出勾（样式读 aria-current，不另加类）', () => {
    const host = mount(<ToolbarMenuItemRow item={{ key: 'a', label: '关闭修订', active: true }} />)
    const item = host.querySelector('[role="menuitem"]')!
    expect(item.getAttribute('aria-current')).toBe('true')
    expect(item.querySelector('.me-menu__check svg')).not.toBeNull()

    const inactive = mount(<ToolbarMenuItemRow item={{ key: 'a', label: '关闭修订' }} />)
    expect(inactive.querySelector('[role="menuitem"]')!.getAttribute('aria-current')).toBeNull()
    // 打勾那一格常驻，只是里面没有勾（否则选中时整行文字会右移）
    expect(inactive.querySelector('.me-menu__check')).not.toBeNull()
  })

  it('按下时阻止默认行为——否则选区先被清掉，命令作用不到它', () => {
    const host = mount(<ToolbarMenuItemRow item={{ key: 'a', label: '删除行' }} />)
    expect(mouseDown(host.querySelector('[role="menuitem"]')!)).toBe(true)
  })

  it('给了 close 才关面板：连着用的动作不能被一次点击带走', () => {
    const closed = vi.fn<() => void>()
    const onSelect = vi.fn<() => void>()
    const host = mount(
      <ToolbarMenuItemRow item={{ key: 'a', label: '下一处', onSelect }} close={closed} />,
    )
    click(host.querySelector('[role="menuitem"]')!)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(closed).toHaveBeenCalledTimes(1)

    const stay = mount(<ToolbarMenuItemRow item={{ key: 'a', label: '下一处', onSelect }} />)
    click(stay.querySelector('[role="menuitem"]')!)
    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(closed).toHaveBeenCalledTimes(1)
  })

  it('separator 是一条分组线，不是菜单项（读屏不该念它）', () => {
    const host = mount(<ToolbarMenuSeparator />)
    expect(host.querySelector('[role="separator"]')).not.toBeNull()
    expect(host.querySelector('[role="menuitem"]')).toBeNull()
  })
})

/**
 * 面板上的按键归谁。
 *
 * 踩过的坑：`ToolbarMenu` 的面板装着一个方向键处理器（在菜单项之间挪焦点），
 * 它以前对 `ArrowUp/Down`、`Home/End` 一律 `preventDefault`，而事件会从面板里
 * 的输入框冒泡上来——**输入框还在，只是按不动了**。docx 自己挂了一层
 * `stopPropagation` 绕过，markdown 的两个面板没有那一层。
 *
 * 现在判据是「事件从哪来」，不是「容器挂了哪个类名」——所以两条都测。
 */
describe('ToolbarMenu 面板里的表单控件', () => {
  it('Escape closes only the innermost menu and returns focus to its surviving trigger', () => {
    const host = mount(
      <ToolbarMenu
        label="字体组"
        renderPanel={() => <ToolbarMenu label="文字颜色" items={[{ key: 'red', label: '红色' }]} />}
      />,
    )
    const outerTrigger = host.querySelector('button')!
    click(outerTrigger)
    const innerTrigger = host.querySelector<HTMLButtonElement>('button[aria-label="文字颜色"]')!
    click(innerTrigger)
    const innerPanel = host.querySelector('[role="menu"][aria-label="文字颜色"]')!
    press(innerPanel, 'Escape')
    expect(host.querySelector('[role="menu"][aria-label="文字颜色"]')).toBeNull()
    const outerPanel = host.querySelector('[role="menu"][aria-label="字体组"]')
    expect(outerPanel).not.toBeNull()
    expect(document.activeElement).toBe(innerTrigger)
    press(innerTrigger, 'Escape')
    expect(host.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(outerTrigger)
  })

  it('Tab enters a custom command panel, traverses its controls and exits at its last control', () => {
    const host = mount(
      <ToolbarMenu
        label="字体"
        renderPanel={() => (
          <>
            <button disabled>不可用</button>
            <button>加粗</button>
            <input aria-label="字号" />
            <button>清除格式</button>
          </>
        )}
      />,
    )
    const trigger = host.querySelector('button')!
    click(trigger)
    const panel = host.querySelector('[role="menu"]')!
    press(panel, 'Tab')
    const buttons = panel.querySelectorAll('button')
    expect(document.activeElement).toBe(buttons[1])
    const middleTab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    act(() => buttons[1]!.dispatchEvent(middleTab))
    expect(middleTab.defaultPrevented).toBe(false)
    expect(host.querySelector('[role="menu"]')).toBe(panel)
    act(() => buttons[2]!.focus())
    press(buttons[2]!, 'Tab')
    expect(host.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('arrow keys can enter a custom panel with ordinary toolbar buttons', () => {
    const host = mount(
      <ToolbarMenu
        label="字体"
        renderPanel={() => (
          <>
            <button>加粗</button>
            <button>清除格式</button>
          </>
        )}
      />,
    )
    click(host.querySelector('button')!)
    const panel = host.querySelector('[role="menu"]')!
    press(panel, 'ArrowDown')
    expect(document.activeElement).toBe(panel.querySelector('button'))
  })

  it('来自输入框的方向键不被菜单吃掉（数字框的上下键是改数）', () => {
    const host = mount(<ToolbarMenu label="插入" renderPanel={() => <input aria-label="行数" />} />)
    click(host.querySelector('button')!)
    const input = host.querySelector<HTMLInputElement>('[aria-label="行数"]')!
    input.focus()
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    })
    act(() => {
      input.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(false)
    // 焦点没被挪到别处（面板里没有菜单项，挪的话就掉到 body 上了）
    expect(document.activeElement).toBe(input)
  })

  it('来自菜单项的方向键照旧在项之间移动——拦的是表单控件，不是整个面板', () => {
    const host = mount(
      <ToolbarMenu
        label="表格"
        renderPanel={() => (
          <>
            <ToolbarMenuItemRow item={{ key: 'a', label: '上方插入行' }} />
            <input aria-label="行高" />
          </>
        )}
      />,
    )
    click(host.querySelector('button')!)
    const panel = host.querySelector('[role="menu"]')!
    press(panel, 'ArrowDown')
    expect(document.activeElement).toBe(host.querySelector('[role="menuitem"]'))
  })
})

describe('ToolbarColorPicker 的内联形态', () => {
  const options = [
    { value: 'DEEAF6', label: '浅蓝', swatch: '#DEEAF6' },
    { value: 'FFF2CC', label: '浅黄', swatch: '#FFF2CC' },
  ]

  /**
   * 内联形态的存在理由：它长在**已经展开的表格菜单**里（docx 的单元格底纹），
   * 那个位置没法再套一个「触发器 + 弹层」。以前只能照着内部 markup 手抄一份，
   * 而抄的那份漏了 `aria-pressed`——「当前底纹是什么」在界面与读屏上都读不到。
   */
  it('不渲染触发器、不渲染弹层，只有那排色块', () => {
    const host = mount(
      <ToolbarColorPicker
        inline
        label="单元格底纹"
        value={null}
        options={options}
        onPick={() => {}}
      />,
    )
    expect(host.querySelectorAll('.me-color__cell')).toHaveLength(options.length)
    // 触发器是带 aria-haspopup 的那个——内联形态不该有
    expect(host.querySelector('[aria-haspopup]')).toBeNull()
    expect(host.querySelector('.me-color__panel')).toBeNull()
  })

  it('当前值仍然写进 aria-pressed（手抄那一版漏的就是它）', () => {
    const host = mount(
      <ToolbarColorPicker
        inline
        label="单元格底纹"
        value="FFF2CC"
        options={options}
        onPick={() => {}}
      />,
    )
    const cells = host.querySelectorAll('.me-color__cell')
    expect(cells[0]!.getAttribute('aria-pressed')).toBe('false')
    expect(cells[1]!.getAttribute('aria-pressed')).toBe('true')
  })

  it('选中之后不关任何东西（它没有自己的面板可关）', () => {
    const onPick = vi.fn<(value: string) => void>()
    const host = mount(
      <ToolbarColorPicker
        inline
        label="单元格底纹"
        value={null}
        options={options}
        onPick={onPick}
      />,
    )
    click(host.querySelector('[aria-label="浅蓝"]')!)
    expect(onPick).toHaveBeenCalledWith('DEEAF6')
  })

  it('「清除」那一格的说明能改：底纹上不该被念成「清除颜色」', () => {
    const host = mount(
      <ToolbarColorPicker
        inline
        label="单元格底纹"
        value={null}
        options={options}
        onPick={() => {}}
        onClear={() => {}}
        clearLabel="清除底纹"
      />,
    )
    expect(host.querySelector('[aria-label="清除底纹"]')).not.toBeNull()
    expect(host.querySelector('[aria-label="清除颜色"]')).toBeNull()
  })
})

describe('ToolbarGridPicker', () => {
  it('行列都从 1 起，每格自己说明白点它会做什么', () => {
    const onPick = vi.fn<(row: number, column: number) => void>()
    const host = mount(
      <ToolbarGridPicker
        label="插入表格的大小"
        rows={3}
        columns={3}
        cellLabel={(row, column) => `插入 ${row} 行 ${column} 列`}
        onPick={onPick}
      />,
    )
    const cells = host.querySelectorAll('.me-table-grid__cell')
    expect(cells).toHaveLength(9)
    expect(cells[0]!.getAttribute('aria-label')).toBe('插入 1 行 1 列')
    expect(cells[8]!.getAttribute('aria-label')).toBe('插入 3 行 3 列')
    expect(host.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('插入表格的大小')

    click(cells[4]!)
    expect(onPick).toHaveBeenCalledWith(2, 2)
  })
})

describe('ToolbarNotice', () => {
  it('是危险色的行内文字，且**不 nowrap**（一长句原因不能撑破状态行）', () => {
    const out = html(<ToolbarNotice>只支持 PNG / JPEG / GIF 图片</ToolbarNotice>)
    expect(out).toContain('me-notice')
    expect(out).toContain('只支持 PNG / JPEG / GIF 图片')
  })

  it('样式表里有它，且没有 nowrap——状态行是 flex-wrap，撑破的是整行', () => {
    const css = readFileSync(join(here, 'shell.css'), 'utf8')
    const rule = /\.me-notice \{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(rule).toContain('--me-danger')
    expect(rule).not.toContain('nowrap')
    expect(rule).toContain('overflow-wrap: anywhere')
  })
})

/**
 * 状态行上的**可点文字**。
 *
 * 这一档的坑是静默的：它本该是「说明 + 一个动作」合起来的一句话，而 antd 的
 * `Button` 自带 `height: 24px` / `padding: 0 7px` / `border` / `white-space: nowrap`
 * ——不压掉就是一个方框控件（撑高状态行、长原因撑破整行）。所以断言集中在
 * **`.me-text-btn` 有没有把这些压下去**。
 *
 * 唯一的计算样式断言（第一条）**自己注入 `shell.css`**：这个包在 vitest 下
 * `test.css: false`，`import './shell.css'` 不注入任何规则（同文件上面那条
 * 「静态守护」的说明），所以不注入就只能读 CSS 文本。注入是真的量——
 * 实测得到 height `auto`、padding `0px`、borderStyle `none`、backgroundColor
 * `none`、whiteSpace `normal`、fontSize `12px`、color 是 `--me-danger` 的回退值。
 */
describe('ToolbarTextButton', () => {
  /** 把真的 shell.css 挂进 head。**只在这个 describe 里用**，别扩到别的测试 */
  function withRealCss(): void {
    const style = document.createElement('style')
    style.textContent = readFileSync(join(here, 'shell.css'), 'utf8')
    document.head.append(style)
  }

  it('是危险色的下划线文字，不是方框——高度/内边距/边框全归零', () => {
    withRealCss()
    const host = mount(<ToolbarTextButton label="保存失败：磁盘已满 · 点此重试" danger />)
    const button = host.querySelector('button')!
    const style = getComputedStyle(button)
    // 文案一字不差：`autoInsertSpace={false}` 挡住了「两个汉字之间插空格」
    expect(button.textContent).toBe('保存失败：磁盘已满 · 点此重试')
    expect(button.classList.contains('me-text-btn')).toBe(true)
    expect(button.classList.contains('me-text-btn--danger')).toBe(true)
    // 这五条每一条都是 antd 的默认行为，不压掉就变回一个方框控件
    expect(style.height).toBe('auto')
    expect(style.padding).toBe('0px')
    expect(style.borderStyle).toBe('none')
    expect(style.backgroundColor).toBe('none')
    expect(style.whiteSpace).toBe('normal')
    expect(style.overflowWrap).toBe('anywhere')
    // 字号取状态行那一档，不是 antd 的控件字号（small 档是 14px）
    expect(style.fontSize).toBe('12px')
    /*
     * 字色来自 `--me-danger`。这个测试里没有宿主声明那个变量，取到的是回退值
     * ——**而且 happy-dom 不把颜色规范成 `rgb()`**，原样回声明里的十六进制
     * （浏览器里同一条是 `rgb(207, 19, 34)`）。这里要的是「不是 antd 的
     * `colorError`（`#ff4d4f`，容器底上实测 3.27:1，不达 AA）」。
     */
    expect(style.color).toBe('#cf1322')
    expect(button.querySelector('.ant-btn-icon')).toBeNull()
  })

  it('下划线写在样式表里（happy-dom 不解析 `text-decoration` 简写）', () => {
    const css = readFileSync(join(here, 'shell.css'), 'utf8')
    const rule = /\.me-text-btn \{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(rule).toContain('text-decoration: underline')
    expect(rule).toContain('text-underline-offset: 2px')
  })

  it('危险色来自 `--me-danger`，不是 antd 的 error 种子', () => {
    /*
     * 这条守的是**对比度**，不是审美：antd 的 `color="danger"` 把字色设成
     * `colorError`（`#ff4d4f`），在容器底上实测 **3.27:1**——不达 AA。
     * 宿主校准过的 `--me-danger`（`colorErrorText`）是 5.80:1（浅色）/ 6.59:1
     * （深色，DESIGN §3.4 的色对）。量不到计算值（`--me-*` 在这个包外没有
     * 声明），所以读样式表：`.me-text-btn--danger` 必须把 `--me-danger` 写进
     * 字色，且**连着 `:hover` 一起钉**（antd 的 hover 是 (0,3,0)，只写基础
     * 那条会被它盖掉）。
     */
    const css = readFileSync(join(here, 'shell.css'), 'utf8')
    expect(css).toMatch(
      /\.me-text-btn--danger,\s*\.me-text-btn--danger:hover:not\(:disabled\),\s*\.me-text-btn--danger:active:not\(:disabled\)\s*\{[^}]*--me-danger/,
    )
  })

  it('不 nowrap，且长 token 能断——与 .me-notice 同一条断词规矩', () => {
    const css = readFileSync(join(here, 'shell.css'), 'utf8')
    const rule = /\.me-text-btn \{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(rule).toContain('white-space: normal')
    expect(rule).toContain('overflow-wrap: anywhere')
    // 字号取状态行那一档（--me-font-size-sm），不是 antd 的控件字号
    expect(rule).toContain('--me-font-size-sm')
  })

  it('按下时阻止默认行为——点重试之后用户往往接着打字', () => {
    const host = mount(<ToolbarTextButton label="重试" onClick={() => {}} danger />)
    expect(mouseDown(host.querySelector('button')!)).toBe(true)
  })

  it('点击转发到 onClick（点了要真的重试，不能只是个装饰）', () => {
    const onClick = vi.fn<() => void>()
    const host = mount(<ToolbarTextButton label="点此重试" onClick={onClick} danger />)
    click(host.querySelector('button')!)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('禁用时 title 让给原因，aria-label 仍是动作名', () => {
    const host = mount(
      <ToolbarTextButton label="点此重试" disabled disabledReason="正在保存…" onClick={() => {}} />,
    )
    const button = host.querySelector('button')!
    expect(button.getAttribute('title')).toBe('正在保存…')
    expect(button.getAttribute('aria-label')).toBe('点此重试')
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('不给 danger 时是普通文字色（继承状态行），不硬编码颜色', () => {
    const host = mount(<ToolbarTextButton label="点此关闭" onClick={() => {}} />)
    const button = host.querySelector('button')!
    expect(button.classList.contains('me-text-btn--danger')).toBe(false)
    // 继承：`.me-text-btn` 写的是 `color: inherit`
    const css = readFileSync(join(here, 'shell.css'), 'utf8')
    expect(/\.me-text-btn \{[^}]*color: inherit/.test(css)).toBe(true)
  })
})

describe('异步操作中的工具栏禁用', () => {
  it('下拉、数字输入和两种调色板表达原因并拒绝交互', () => {
    const change = vi.fn<(value: string) => void>()
    const commit = vi.fn<(value: number) => void>()
    const host = mount(
      <>
        <ToolbarSelect
          label="忙碌下拉"
          value="a"
          options={[{ value: 'a', label: 'A' }]}
          onChange={change}
          disabled
          disabledReason="正在保存"
        />
        <ToolbarNumberField
          label="忙碌数字"
          value={1}
          onCommit={commit}
          disabled
          disabledReason="正在保存"
          step={0.5}
        />
        <ToolbarColorPicker
          label="忙碌颜色"
          value={null}
          options={[{ value: '#FF0000', label: '红色', swatch: '#FF0000' }]}
          onPick={change}
          disabled
          disabledReason="正在保存"
        />
        <ToolbarColorPicker
          label="忙碌内联颜色"
          value={null}
          options={[{ value: '#000000', label: '黑色', swatch: '#000000' }]}
          onPick={change}
          inline
          disabled
          disabledReason="正在保存"
        />
      </>,
    )
    const number = host.querySelector<HTMLInputElement>('input[aria-label="忙碌数字"]')!
    expect(number.disabled).toBe(true)
    expect(number.title).toBe('正在保存')
    setValue(number, '3')
    press(number, 'Enter')
    expect(commit).not.toHaveBeenCalled()
    expect(host.querySelector<HTMLInputElement>('input[aria-label="忙碌下拉"]')?.disabled).toBe(
      true,
    )
    const color = host.querySelector<HTMLButtonElement>('button[aria-label="忙碌颜色"]')!
    const inline = host.querySelector<HTMLButtonElement>('button[aria-label="黑色"]')!
    expect(color.disabled).toBe(true)
    expect(inline.disabled).toBe(true)
    expect(inline.title).toBe('正在保存')
    act(() => {
      color.click()
      inline.click()
    })
    expect(change).not.toHaveBeenCalled()
    expect(host.querySelector('.me-color__panel')).toBeNull()
  })
})
