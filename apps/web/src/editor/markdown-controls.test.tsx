/**
 * @vitest-environment happy-dom
 *
 * markdown 编辑器的**控件契约**（渲染层）。
 *
 * ## 为什么在宿主这边
 *
 * 因为**方言在这里**。`packages/office` 不依赖 `@tiptap/starter-kit`，拿一组临时
 * 凑的扩展挂出来测的就是另一个编辑器（`MarkdownEditor.test.tsx` 顶部那段说的是
 * 同一件事）。包里那份（`packages/office/src/editors/markdown-controls.test.ts`）
 * 只能读源码文本守「没有人手写原生控件」；下面这四条要**真的渲染结果**。
 *
 * ## 为什么挂整个 `MarkdownEditor`（不是 `MarkdownToolbar`）
 *
 * 尺寸档来自 `EditorShell` 内部那层只传 `componentSize="small"` 的
 * `ConfigProvider`（D-064）。只挂工具条就绕过了它——量出来的是默认 32px 档，
 * 而**产品里不是**。这一条也正是它守的东西：那层 `ConfigProvider` 一旦被挪出
 * `.mimir-editor` 子树或被传上 `theme`，控件会静默变回默认档。
 *
 * ## 四条，都是会静默失效的
 *
 *  1. **没有绕过点**：子树里每个 `button` / `input` / `select` / `textarea` 都要
 *     么带 `ant-` 类，要么落在外壳自己那两类未迁移元素里（白名单，逐条给理由）
 *  2. **都在 small 档**：happy-dom 取不到这些控件的计算高度（返回空串，与「跨
 *     元素自定义属性 / 边框不解析」同一类限制），所以判据是 antd 自己的尺寸档
 *     类名——它们正是高度的来源。真正的「一行同高」只能在浏览器里量
 *  3. **禁用必须给原因**：灰着不说为什么等于让人猜（`docs/DESIGN.md` §8.4）
 *  4. **弹层就地渲染**：`ToolbarMenu` 的面板不 portal 到 body。portal 会离开
 *     `--me-*` 子树，深色下那些颜色退回浅色回退值
 */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownEditor } from '@mimir/office'
import { createExtensions } from './extensions.js'

const mounted: { unmount: () => void }[] = []

afterEach(() => {
  for (const item of mounted) item.unmount()
  mounted.length = 0
})

/** 挂一棵真树：真方言 + 整个编辑器（含外壳那层 `ConfigProvider`） */
async function mount(options: { onSave?: (markdown: string) => Promise<void> } = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => {
    root.render(
      <MarkdownEditor
        documentId="doc-1"
        extensions={createExtensions()}
        initialContent={'正文\n'}
        onSave={options.onSave ?? (async () => {})}
        onUploadImage={async (file) => ({ url: '/api/documents/i/file', name: file.name })}
      />,
    )
  })
  mounted.push({
    unmount: () => {
      act(() => root.unmount())
      host.remove()
    },
  })
  return host
}

function press(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

/**
 * 允许**不经 antd** 的元素：白名单，逐条给理由。
 *
 * 这两类是外壳里有意保留的手写控件（`EditorShell.tsx` 头注释那张表、D-064 的
 * 落地表）：它们的面板必须就地 `fixed` 渲染并吃 `--me-*`，而 antd 的 Dropdown /
 * ColorPicker 都 portal 到 body，且 Dropdown 不给触发按钮 `aria-expanded`。
 */
const SHELL_NON_ANTD = [
  '.me-btn', // ToolbarMenu 的触发器（链接、表格那几个）
  '.me-menu__item', // 弹层面板里的菜单项
  '.me-tab', // ToolbarTabs：antd 的 Tabs 把页签渲染成 div，还多一个 nav-more
  '.me-color__cell', // 颜色面板里的色块
  /*
   * `ToolbarFileButton`（插入图片）里 rc-upload 的那个隐藏 input。它**自己没有
   * 类名**（`<input type="file">` 光秃秃的），所以按类名判会把它算成绕过点，
   * 而它其实是 antd 的内部结构——判据落在祖先 `.ant-upload` 上。
   */
  '.ant-upload',
] as const

describe('markdown 的控件契约（渲染层）', () => {
  it('没有绕过点：每个原生控件都来自 antd（白名单之外）', async () => {
    const host = await mount()
    const all = [
      ...host.querySelectorAll<HTMLElement>(
        '.mimir-editor button, .mimir-editor input, .mimir-editor select, .mimir-editor textarea',
      ),
    ]
    // 非空前提：一棵空树上「零个绕过点」是句废话
    expect(all.length).toBeGreaterThan(10)
    const bypass = all
      .filter(
        (element) =>
          ![...element.classList].some((name) => name.startsWith('ant-')) &&
          !SHELL_NON_ANTD.some((selector) => element.closest(selector) !== null),
      )
      .map((element) => `<${element.tagName.toLowerCase()} class="${element.className}">`)
    expect(bypass, `这些控件绕过了外壳的原语：${JSON.stringify(bypass)}`).toEqual([])
  })

  it('尺寸统一在 small 档（外壳那层 ConfigProvider 盖到了这棵子树）', async () => {
    const host = await mount()
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.mimir-editor button.ant-btn')]
    expect(buttons.length).toBeGreaterThan(10)
    const wrong = buttons.filter((button) => !button.classList.contains('ant-btn-sm'))
    expect(
      wrong.map((button) => button.getAttribute('aria-label') ?? button.textContent),
      '这些按钮不在 small 档',
    ).toEqual([])

    // 常驻的 Select 已随段落样式迁去 me-menu（D-087）而消失；代码块语言的
    // Select 只在代码块里出现，这份正文里没有——所以这里只剩「有则必 sm」，
    // 存在性断言留给 docx 工具条（那边仍有 9 个）。
    const selects = [...host.querySelectorAll<HTMLElement>('.mimir-editor .ant-select')]
    for (const item of selects) expect(item.classList.contains('ant-select-sm')).toBe(true)
    // 段落样式现在是 me-menu 触发器：带 haspopup/expanded，面板开着时九项可读
    const styleTrigger = host.querySelector<HTMLButtonElement>('button[aria-label="段落样式"]')
    expect(styleTrigger).not.toBeNull()
    expect(styleTrigger!.getAttribute('aria-haspopup')).toBe('menu')
  })

  it('不把 `.me-btn` / `.me-input` 挂到 antd 控件上（会把高度与实心底色压回去）', async () => {
    const host = await mount()
    /*
     * `.me-btn` 的 `height` 与 antd 的 `:where(...).ant-btn-sm` 特异性相同（都是
     * (0,1,0)）而 `shell.css` 在 head 里更靠后——挂上之后 small 档按钮会被拉成
     * `--me-control-height` 之外的值（实测 28px），它的 `background: transparent`
     * 还会压过实心的「立即保存」（症状：透明的保存按钮）。
     *
     * **先打开链接面板**：里面有一个 antd `Input`（`ToolbarTextField`），而它正是
     * 「有没有把 `.me-input` 挂回 antd 控件上」唯一能兑现的地方——面板关着时树里
     * `.ant-input` 一个都没有，这条断言会空转（`HtmlEditor.test.tsx` 里那条曾经
     * 就是这样通过的）。
     */
    // 选择器必须限定 `button`：外层那个 `ToolbarGroup` 的 div 也挂着 `aria-label="链接"`
    press(host.querySelector<HTMLButtonElement>('button[aria-label="链接"]')!)
    expect(
      host.querySelectorAll('.ant-input').length,
      '链接面板没打开，这条断言在空转',
    ).toBeGreaterThan(0)
    expect(host.querySelectorAll('.ant-btn.me-btn').length).toBe(0)
    expect(host.querySelectorAll('.ant-input.me-input').length).toBe(0)
  })

  it('禁用的按钮都带着原因，且原因不等于名字', async () => {
    const host = await mount()
    let disabled = 0
    for (const button of host.querySelectorAll<HTMLButtonElement>('.mimir-editor button')) {
      if (!button.disabled) continue
      disabled += 1
      const label = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? ''
      const title = button.getAttribute('title') ?? ''
      expect(title, `禁用的按钮没有说明原因：${label}`).not.toBe('')
      // 原因与名字混成一件就等于没说
      expect(title, `禁用的按钮把原因与名字混成一件事：${label}`).not.toBe(label)
    }
    // 刚打开时撤销 / 重做 / 立即保存 / 清除格式都是禁用的——这条不该是空循环
    expect(disabled).toBeGreaterThan(2)
  })

  it('`ToolbarMenu` 的面板就地渲染，不 portal 到 body', async () => {
    const host = await mount()
    /*
     * 选 `button[aria-label="链接"]`，不能只写 `[aria-label="链接"]`——
     * `ToolbarGroup label="链接"` 那一层 div 也叫这个名字，而它在 DOM 里更靠前
     * （实测：不限定标签时拿到的是那个 div，于是两个 aria 断言都是 null）。
     */
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="链接"]')
    expect(trigger).not.toBeNull()
    // 语义：能展开的东西要让读屏知道（antd 的 Dropdown 不给这两个属性）
    expect(trigger!.getAttribute('aria-haspopup')).not.toBeNull()
    expect(trigger!.getAttribute('aria-expanded')).toBe('false')

    const before = document.body.childElementCount
    press(trigger!)
    expect(trigger!.getAttribute('aria-expanded')).toBe('true')
    // 面板落在编辑器子树里（所以它吃 `--me-*`），而整页的元素数一个不增
    expect(host.querySelector('.mimir-editor [role="menu"]')).not.toBeNull()
    expect(document.body.childElementCount).toBe(before)
  })

  /**
   * 状态行里那句**带动作**的话。
   *
   * 它原来是裸 `<button className="me-status-action">`（D-064 的最后两个绕过点
   * 之一），现在走外壳的 `ToolbarTextButton`。三条一起断言，因为它们各自都会
   * 静默退化：换回原生控件（尺寸与焦点环脱管）、点了没反应（最坏的一种）、
   * 以及「只把失败画出来却不给动作」。
   */
  it('保存失败时状态行给一个可点的 antd 按钮，点它真的重试', async () => {
    let attempts = 0
    const host = await mount({
      onSave: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('磁盘已满')
      },
    })

    /*
     * 先真的改一下文档，再等自动保存那一拍——**失败必须由线上那条路产生**。
     *
     * 两处都不能图快：① 「立即保存」在没有改动时是禁用的
     * （`disabledReason="没有未保存的改动"`），点它什么都不会发生，那样这条测试
     * 会在一条永远成功的路径上静默通过；② 改完文档之后它立刻变成「正在保存…」
     * 且**仍然禁用**（实测：`aria-label` 跟着状态换名字），所以失败只能来自防抖
     * 到点的那次自动保存。
     *
     * 用工具条上的「分隔线」来改：它无条件可用，走的是线上那条 `onClick` →
     * 命令 → `onUpdate` → 标脏 + 起防抖。happy-dom 里造不出真的输入事件
     * （`MarkdownEditor.test.tsx` 顶部记着这条），所以只能从工具条这头进。
     */
    const rule = host.querySelector<HTMLButtonElement>('button[aria-label="分隔线"]')
    expect(rule, '工具条上没有「分隔线」——这条测试需要一个能改文档的按钮').not.toBeNull()
    act(() => {
      rule!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    // 防抖是 900ms（`MarkdownEditor` 的 `SAVE_DEBOUNCE_MS`），等过它
    await act(async () => {
      await new Promise((tick) => setTimeout(tick, 1000))
    })
    expect(attempts, '自动保存没有发生——防抖那条路断了').toBe(1)

    const status = host.querySelector('.mimir-editor__status')
    expect(status?.textContent).toContain('保存失败：磁盘已满')
    expect(status?.textContent).toContain('点此重试')

    const retry = [
      ...host.querySelectorAll<HTMLButtonElement>('.mimir-editor__status button'),
    ].find((button) => (button.getAttribute('aria-label') ?? '').includes('点此重试'))
    expect(retry, '状态行里的「点此重试」不是一个按钮').not.toBeUndefined()
    // 它是 antd 的按钮、在 small 档、并被压成文字（不是一个 24px 的方框）
    expect(retry!.classList.contains('ant-btn')).toBe(true)
    expect(retry!.classList.contains('ant-btn-sm')).toBe(true)
    expect(retry!.classList.contains('me-text-btn')).toBe(true)
    expect(retry!.classList.contains('me-text-btn--danger')).toBe(true)

    // 按下时阻止默认行为：点它之后用户往往接着打字，不能把选区/焦点夺走
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    act(() => {
      retry!.dispatchEvent(down)
    })
    expect(down.defaultPrevented).toBe(true)

    // 点了真的重试（第二次成功），状态行回到「已保存」
    await act(async () => {
      retry!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(attempts, '点了「点此重试」但没有再保存一次——那正是最坏的一种').toBe(2)
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('已保存')
  })
})
