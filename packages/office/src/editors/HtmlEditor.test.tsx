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
import { HtmlEditor, type HtmlAgentServices } from './HtmlEditor.js'
import type { HtmlAgentHandle } from '../agent/html-agent.js'
import type { EditorIo } from './types.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'

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

async function planningEditor(agentServices?: HtmlAgentServices) {
  let current: HtmlAgentHandle | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const io: EditorIo = { load: async () => new TextEncoder().encode(PAGE), save: async () => {} }
  const render = (documentId = 'planning-cancellation') =>
    root.render(
      <HtmlEditor
        documentId={documentId}
        io={io}
        agentServices={agentServices}
        onAgentHandleChange={(handle) => {
          current = handle
        }}
      />,
    )
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => {
    render()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  let live = true
  const dispose = () => {
    if (!live) return
    live = false
    act(() => root.unmount())
    host.remove()
  }
  mounted.push({ unmount: dispose })
  expect(current).not.toBeNull()
  return { host, render, dispose, handle: () => current! }
}

it('Stop closes only its own questions, ignores a superseded abort, and keeps the mounted source and preview', async () => {
  const ui = await planningEditor(),
    handle = ui.handle()
  const source = ui.host.querySelector('.cm-content'),
    frame = ui.host.querySelector('iframe')
  const version = handle.getVersion(),
    controller = new AbortController()
  let old!: ReturnType<HtmlAgentHandle['execute']>
  const args = { questions: [{ id: 'parts', label: '内容', multi: true, options: ['正文'] }] }
  act(() => {
    old = handle.execute('ask_clarification', args, { signal: controller.signal })
  })
  expect(ui.host.querySelector('[aria-label="页面创建前的问题"]')).not.toBeNull()
  act(() => controller.abort())
  expect(ui.host.querySelector('[aria-label="页面创建前的问题"]')).toBeNull()
  expect(await old).toMatchObject({ ok: false, changed: false })
  const superseded = new AbortController()
  let first!: ReturnType<HtmlAgentHandle['execute']>, next!: ReturnType<HtmlAgentHandle['execute']>
  act(() => {
    first = handle.execute('ask_clarification', args, { signal: superseded.signal })
  })
  act(() => {
    next = handle.execute('ask_clarification', args)
  })
  expect(await first).toMatchObject({ ok: false, changed: false })
  act(() => superseded.abort())
  expect(ui.host.querySelector('[aria-label="页面创建前的问题"]')).not.toBeNull()
  press(ui.host.querySelector('[aria-label="提交页面选择"]')!)
  expect(await next).toMatchObject({
    ok: true,
    changed: false,
    data: { selections: { parts: [] } },
  })
  expect(handle.getVersion()).toBe(version)
  expect(ui.host.querySelector('.cm-content')).toBe(source)
  expect(ui.host.querySelector('iframe')).toBe(frame)
})

it('Stop closes a live brief confirmation and never calls the page-writing service', async () => {
  const brief = {
    title: '提纲',
    tone: '简洁',
    audience: '读者',
    sections: [{ title: '正文', purpose: '说明' }],
  }
  let writes = 0
  const ui = await planningEditor({
    planPage: async () => brief,
    writeDocument: async () => {
      writes++
      return { html: PAGE, complete: true }
    },
  })
  const handle = ui.handle(),
    before = handle.getDocument(),
    controller = new AbortController()
  let pending!: ReturnType<HtmlAgentHandle['execute']>
  await act(async () => {
    pending = handle.execute(
      'plan_page',
      { mode: 'new', instruction: '创建页面' },
      { signal: controller.signal },
    )
    await Promise.resolve()
  })
  expect(ui.host.querySelector('[aria-label="确认页面提纲"]')).not.toBeNull()
  act(() => controller.abort())
  expect(ui.host.querySelector('[aria-label="确认页面提纲"]')).toBeNull()
  expect(await pending).toMatchObject({ ok: false, changed: false })
  expect(writes).toBe(0)
  expect(handle.getDocument()).toBe(before)
})

it('keeps a late old-session plan out of the new document and cancels old handles without reopening prompts', async () => {
  const brief = {
    title: '提纲',
    tone: '简洁',
    audience: '读者',
    sections: [{ title: '正文', purpose: '说明' }],
  }
  let finish!: (answer: typeof brief) => void,
    writes = 0
  const ui = await planningEditor({
    planPage: () =>
      new Promise((resolve) => {
        finish = resolve
      }),
    writeDocument: async () => {
      writes++
      return { html: PAGE, complete: true }
    },
  })
  const oldHandle = ui.handle()
  let pending!: ReturnType<HtmlAgentHandle['execute']>
  act(() => {
    pending = oldHandle.execute('plan_page', { mode: 'new', instruction: '创建页面' })
  })
  await act(async () => {
    ui.render('new-document')
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(ui.handle().documentId).toBe('new-document')
  await act(async () => finish(brief))
  expect(await pending).toMatchObject({ ok: false, changed: false })
  expect(writes).toBe(0)
  expect(ui.host.querySelector('[aria-label="确认页面提纲"]')).toBeNull()
  expect(
    await oldHandle.execute('ask_clarification', {
      questions: [{ id: 'parts', label: '内容', options: ['正文'] }],
    }),
  ).toMatchObject({ ok: false, changed: false })
  expect(ui.host.querySelector('[aria-label="页面创建前的问题"]')).toBeNull()
})

/** 点一下（`mousedown` + `click`——原语在两个事件上都有语义） */
function press(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

describe('HtmlEditor 工具条的控件契约', () => {
  it('保存与源码历史固定在分类左侧，状态栏只显示状态', async () => {
    const host = await boot()
    const quickAccess = host.querySelector('.mimir-compact-toolbar__quick-access')
    expect(quickAccess).not.toBeNull()
    expect(
      [...quickAccess!.querySelectorAll('button')].map((button) =>
        button.getAttribute('aria-label'),
      ),
    ).toEqual(['保存到库', '撤销 (Ctrl+Z)', '重做 (Ctrl+Shift+Z)'])
    expect(host.querySelector('.mimir-editor__status button[aria-label="保存到库"]')).toBeNull()
    expect(host.querySelector('[role="group"][aria-label="撤销与重做"]')).toBeNull()
    expect(quickAccess!.querySelector('button[aria-label="保存到库"]')?.getAttribute('title')).toBe(
      '没有未保存的改动',
    )
  })

  it('没有绕过点：每个原生控件都来自 antd', async () => {
    const host = await boot()
    const all = controls(host)
    // 非空前提：一棵空树上「零个绕过点」是句废话
    expect(all.length).toBeGreaterThan(8)
    const bypass = all
      .filter((element) => ![...element.classList].some((name) => name.startsWith('ant-')))
      // ToolbarMenu is the shell's deliberate popup-trigger exception.
      .filter((element) => !element.matches('.me-menu > .me-btn'))
      // The ribbon tabs use native buttons for the ARIA tab keyboard model.
      .filter((element) => !element.matches('.mimir-compact-toolbar__tab'))
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

    // The View tab owns both preview controls; Home keeps element actions visible.
    press([...host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === '视图')!)

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
    press(host.querySelector<HTMLButtonElement>('button[aria-label="查找和替换"]')!)
    expect(
      host.querySelectorAll('.ant-input').length,
      '查找栏没打开，这条断言在空转',
    ).toBeGreaterThan(0)
    expect(host.querySelectorAll('.ant-btn.me-btn').length).toBe(0)
    expect(host.querySelectorAll('.ant-input.me-input').length).toBe(0)
    // `.me-input--num` 是**给 InputNumber 的**（宽度），它没有 height/底色，可以留
    press([...host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === '视图')!)
    expect(host.querySelectorAll('.ant-input-number.me-input--num').length).toBe(1)
  })

  it('禁用的按钮必须说明原因（灰着不说为什么等于让人猜）', async () => {
    const host = await boot()
    /*
     * **先打开查找栏**：里面那四个按钮（上一个 / 下一个匹配、替换这一个、
     * 全部替换）也会禁用，而这条断言原来跑在栏关着的时候——那几个按钮不在树上，
     * 于是「禁用必须给原因」在查找栏那一半从来没被守过（实测漏掉四个）。
     */
    press(host.querySelector<HTMLButtonElement>('button[aria-label="查找和替换"]')!)
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
    const findButton = host.querySelector<HTMLButtonElement>('button[aria-label="查找和替换"]')
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

  it('分类切换保留可执行命令，状态栏不常驻预览操作教程', async () => {
    const host = await boot()
    expect([...host.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual([
      '开始',
      '插入',
      '视图',
    ])
    expect(host.querySelector('[aria-label="元素编辑"]')).not.toBeNull()
    expect(host.querySelector('.mimir-editor__status')?.textContent).not.toContain('点一个元素')
    press([...host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === '插入')!)
    expect(host.querySelector('[aria-label="插入 HTML 元素"]')).not.toBeNull()
    expect(host.querySelector('[aria-label="元素编辑"]')).toBeNull()
  })
})

it('Agent 改动在源码和预览可见，保存恢复 BOM/CRLF 且不写入预览映射', async () => {
  const original = '\uFEFF<!doctype html>\r\n<html><body><p>Hello</p></body></html>\r\n'
  let saved: Uint8Array | null = null
  let agent: HtmlAgentHandle | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => {
    root.render(
      <HtmlEditor
        documentId="agent-html"
        io={{
          load: async () => new TextEncoder().encode(original),
          save: async (bytes) => {
            saved = bytes
          },
        }}
        onAgentHandleChange={(handle) => {
          agent = handle
        }}
      />,
    )
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(agent).not.toBeNull()
  const handle = agent as HtmlAgentHandle | null
  if (!handle) throw new Error('HTML Agent 句柄未挂载')
  const sid = handle.getDocument().map.elements.find((entry) => entry.tag === 'p')?.sid
  if (sid === undefined) throw new Error('测试段落未解析')
  await act(async () => {
    expect(
      (
        await handle.execute(
          'apply_ops',
          { ops: [{ op: 'set_text', sid, text: 'Changed' }] },
          { expectedVersion: 1 },
        )
      ).ok,
    ).toBe(true)
  })
  expect(host.querySelector('.cm-content')?.textContent).toContain('Changed')
  expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('Changed')
  const frame = host.querySelector('iframe')!
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'gx:select',
          version: handle.getVersion(),
          element: { sid, tag: 'p', className: '' },
        },
        source: frame.contentWindow,
      }),
    )
  })
  press(host.querySelector<HTMLButtonElement>('[aria-label="元素编辑"]')!)
  press(
    [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (tab) => tab.textContent === '内容与结构',
    )!,
  )
  const field = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="内容"]')!
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter!.call(field, 'Manual')
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
  press(host.querySelector<HTMLButtonElement>('[aria-label="应用元素编辑"]')!)
  expect(handle.getDocument().text).toContain('<p>Manual</p>')
  press(host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(saved).not.toBeNull()
  const output = new TextDecoder('utf-8', { ignoreBOM: true }).decode(saved!)
  expect(output).toContain('\r\n')
  expect(output.startsWith('\uFEFF')).toBe(true)
  expect(output).toContain('<p>Manual</p>')
  expect(output).not.toContain('data-sid')
  let answer: Promise<Awaited<ReturnType<HtmlAgentHandle['execute']>>> | null = null
  act(() => {
    answer = handle.execute('ask_clarification', {
      questions: [{ id: 'audience', label: '面向谁', options: ['读者'] }],
    })
  })
  expect(host.querySelector('[aria-label="页面创建前的问题"]')).not.toBeNull()
  press(host.querySelector<HTMLButtonElement>('[aria-label="提交页面选择"]')!)
  expect((await answer!)?.data).toEqual({ answers: '面向谁: 由 AI 决定' })
  const sourceEditor = host.querySelector('.cm-content')
  const previewFrame = host.querySelector('iframe')
  const versionBeforeQuestions = handle.getVersion()
  act(() => {
    answer = handle.execute('ask_clarification', {
      questions: [
        { id: 'parts', label: '需要哪些内容', multi: true, options: ['介绍', '案例', '联系'] },
      ],
    })
  })
  const planning = host.querySelector('[aria-label="页面创建前的问题"]')!
  expect(planning.closest('.mimir-html-workspace')).not.toBeNull()
  expect(host.querySelector('.cm-content')).toBe(sourceEditor)
  expect(host.querySelector('iframe')).toBe(previewFrame)
  const choices = planning.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
  act(() => {
    choices[2]!.click()
    choices[0]!.click()
  })
  press(host.querySelector<HTMLButtonElement>('[aria-label="提交页面选择"]')!)
  expect((await answer!)?.data).toEqual({
    answers: '需要哪些内容: 介绍、联系',
    selections: { parts: ['介绍', '联系'] },
  })
  expect(handle.getVersion()).toBe(versionBeforeQuestions)
  expect(host.querySelector('.cm-content')).toBe(sourceEditor)
  expect(host.querySelector('iframe')).toBe(previewFrame)
  act(() => root.unmount())
  host.remove()
})

it('手动插入使用当前选中元素定位，保存重开仍是同一份源码', async () => {
  let saved: Uint8Array | null = null
  let agent: HtmlAgentHandle | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <HtmlEditor
        documentId="insert-html"
        io={{
          load: async () => new TextEncoder().encode(PAGE),
          save: async (bytes) => {
            saved = bytes
          },
        }}
        onAgentHandleChange={(handle) => {
          agent = handle
        }}
      />,
    )
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  const handle = agent as HtmlAgentHandle | null
  if (!handle) throw new Error('HTML Agent 句柄未挂载')
  const sid = handle.getDocument().map.elements.find((entry) => entry.tag === 'p')?.sid
  if (sid === undefined) throw new Error('测试段落未解析')
  const frame = host.querySelector('iframe')!
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'gx:select',
          version: handle.getVersion(),
          element: { sid, tag: 'p', className: '' },
        },
        source: frame.contentWindow,
      }),
    )
  })
  press([...host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === '插入')!)
  press(host.querySelector<HTMLButtonElement>('[aria-label="插入 HTML 元素"]')!)
  press(host.querySelector<HTMLButtonElement>('[aria-label="插入所选 HTML 元素"]')!)
  const text = handle.getDocument().text
  expect(text).toContain('<p>正文</p>\n<h2>新标题</h2>')
  expect(host.querySelector('.cm-content')?.textContent).toContain('新标题')
  expect(frame.getAttribute('srcdoc')).toContain('新标题')
  press(host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(new TextDecoder().decode(saved!)).toBe(text)
  expect(new TextDecoder().decode(saved!)).not.toContain('data-sid')
  act(() => root.unmount())
  host.remove()
})

it.each([
  { name: '段落', markup: '<p>新段落</p>' },
  { name: '列表', markup: '<ul>\n  <li>列表项</li>' },
  { name: '按钮', markup: '<button type="button">按钮</button>' },
  { name: '图片 URL', markup: '<img src="https://example.com/picture.png"' },
  { name: '表格', markup: '<table style="width: 100%; border-collapse: collapse;">' },
  { name: '章节', markup: '<section style="padding: 32px 24px;">' },
  { name: '分隔线', markup: '<hr>' },
])('手动插入预设 $name 写入当前画布并保存同一份源码', async ({ name, markup }) => {
  let saved: Uint8Array | null = null
  let agent: HtmlAgentHandle | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <HtmlEditor
        documentId={`insert-${name}`}
        io={{
          load: async () => new TextEncoder().encode(PAGE),
          save: async (bytes) => {
            saved = bytes
          },
        }}
        onAgentHandleChange={(handle) => {
          agent = handle
        }}
      />,
    )
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  const handle = agent as HtmlAgentHandle | null
  if (!handle) throw new Error('HTML Agent 句柄未挂载')
  const sid = handle.getDocument().map.elements.find((entry) => entry.tag === 'p')?.sid
  if (sid === undefined) throw new Error('测试段落未解析')
  const frame = host.querySelector('iframe')!
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'gx:select',
          version: handle.getVersion(),
          element: { sid, tag: 'p', className: '' },
        },
        source: frame.contentWindow,
      }),
    )
  })
  press([...host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === '插入')!)
  press(host.querySelector<HTMLButtonElement>('[aria-label="插入 HTML 元素"]')!)
  pickSelectOption(host, '插入元素', name)
  if (name === '图片 URL') {
    const field = host.querySelector<HTMLInputElement>('[aria-label="图片 URL"]')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        field,
        'https://example.com/picture.png',
      )
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  if (name === '表格') {
    for (const [label, value] of [
      ['表格行数', '2'],
      ['表格列数', '4'],
    ]) {
      const field = host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
          field,
          value,
        )
        field.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
  }
  press(host.querySelector<HTMLButtonElement>('[aria-label="插入所选 HTML 元素"]')!)
  const text = handle.getDocument().text
  expect(text).toContain(`<p>正文</p>\n${markup}`)
  expect([
    (text.match(/<tr>/g) ?? []).length,
    (text.match(/<th /g) ?? []).length,
    (text.match(/<td /g) ?? []).length,
  ]).toEqual(name === '表格' ? [2, 4, 4] : [0, 0, 0])
  const tag = markup.match(/^<([a-z]+)/)?.[1]
  if (!tag) throw new Error('预设标记没有 HTML 标签')
  expect(frame.getAttribute('srcdoc')).toMatch(new RegExp(`<${tag}[^>]*data-sid=`))
  press(host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  const reopened = new TextDecoder().decode(saved!)
  expect(reopened).toBe(text)
  expect(reopened).not.toContain('data-sid')
  act(() => root.unmount())
  host.remove()
})

it('手动快捷格式和复制共用 Agent 操作，保存字节可重新解析', async () => {
  let saved: Uint8Array | null = null
  let agent: HtmlAgentHandle | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <HtmlEditor
        documentId="quick-html"
        io={{
          load: async () => new TextEncoder().encode(PAGE),
          save: async (bytes) => {
            saved = bytes
          },
        }}
        onAgentHandleChange={(handle) => {
          agent = handle
        }}
      />,
    )
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  const handle = agent as HtmlAgentHandle | null
  if (!handle) throw new Error('HTML Agent 句柄未挂载')
  const sid = handle.getDocument().map.elements.find((entry) => entry.tag === 'p')?.sid
  if (sid === undefined) throw new Error('测试段落未解析')
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'gx:select',
          version: handle.getVersion(),
          element: { sid, tag: 'p', className: '', computed: { fontWeight: '400' } },
        },
        source: host.querySelector('iframe')!.contentWindow,
      }),
    )
  })
  press(host.querySelector<HTMLButtonElement>('[aria-label="元素编辑"]')!)
  press(host.querySelector<HTMLButtonElement>('[aria-label="加粗或取消加粗"]')!)
  expect(handle.getDocument().text).toContain('<p style="font-weight: 700">正文</p>')
  press(
    [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (tab) => tab.textContent === '内容与结构',
    )!,
  )
  press(host.querySelector<HTMLButtonElement>('[aria-label="复制选中元素"]')!)
  expect(handle.getDocument().text.match(/正文<\/p>/g)).toHaveLength(2)
  press(host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  const reopened = new TextDecoder().decode(saved!)
  expect(reopened).toBe(handle.getDocument().text)
  expect(reopened).not.toContain('data-sid')
  act(() => root.unmount())
  host.remove()
})

it('清除选中元素行内样式经共用操作写入源码、预览和重开的原件', async () => {
  const original =
    '\uFEFF<!doctype html>\r\n<html><body><p title="style=keep" style="color: red; font-weight: 700">正文</p></body></html>\r\n'
  let saved: Uint8Array | null = null
  let agent: HtmlAgentHandle | null = null
  const io: EditorIo = {
    load: async () => saved ?? new TextEncoder().encode(original),
    save: async (bytes) => {
      saved = bytes
    },
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <HtmlEditor
        documentId="reset-style"
        io={io}
        onAgentHandleChange={(handle) => {
          agent = handle
        }}
      />,
    )
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  const handle = agent as HtmlAgentHandle | null
  if (!handle) throw new Error('HTML Agent 句柄未挂载')
  const sid = handle.getDocument().map.elements.find((entry) => entry.tag === 'p')?.sid
  if (sid === undefined) throw new Error('测试段落未解析')
  const reset = () =>
    host.querySelector<HTMLButtonElement>('[aria-label="清除选中元素的行内样式"]')!
  expect(reset().disabled).toBe(true)
  expect(reset().getAttribute('title')).toBe('先在预览里点一个元素')
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'gx:select',
          version: handle.getVersion(),
          element: { sid, tag: 'p', className: '' },
        },
        source: host.querySelector('iframe')!.contentWindow,
      }),
    )
  })
  expect(reset().disabled).toBe(false)
  press(reset())
  expect(handle.getDocument().text).toContain('<p title="style=keep">正文</p>')
  expect(handle.getDocument().text).not.toContain('font-weight: 700')
  expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('<p title="style=keep"')
  expect(reset().disabled).toBe(true)
  expect(reset().getAttribute('title')).toBe('选中元素没有行内样式')
  press(host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  const output = new TextDecoder('utf-8', { ignoreBOM: true }).decode(saved!)
  expect(output).toBe(
    '\uFEFF<!doctype html>\r\n<html><body><p title="style=keep">正文</p></body></html>\r\n',
  )
  act(() => root.unmount())
  const reopened = createRoot(host)
  await act(async () => {
    reopened.render(<HtmlEditor documentId="reset-style-reopen" io={io} />)
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('<p title="style=keep"')
  expect(host.querySelector('iframe')?.getAttribute('srcdoc')).not.toContain('font-weight: 700')
  act(() => reopened.unmount())
  host.remove()
})

it('保存进行中继续编辑时保留未保存状态', async () => {
  let agent: HtmlAgentHandle | null = null
  let finishSave: (() => void) | null = null
  const dirtyChanges: boolean[] = []
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <HtmlEditor
        documentId="save-race-html"
        io={{
          load: async () => new TextEncoder().encode(PAGE),
          save: async () =>
            new Promise<void>((resolve) => {
              finishSave = resolve
            }),
        }}
        onDirtyChange={(value) => dirtyChanges.push(value)}
        onAgentHandleChange={(handle) => {
          agent = handle
        }}
      />,
    )
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  const handle = agent as HtmlAgentHandle | null
  if (!handle) throw new Error('HTML Agent 句柄未挂载')
  const sid = handle.getDocument().map.elements.find((entry) => entry.tag === 'p')?.sid
  if (sid === undefined) throw new Error('测试段落未解析')
  await act(async () => {
    await handle.execute('apply_ops', { ops: [{ op: 'set_text', sid, text: '保存前' }] })
  })
  press(host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!)
  expect(finishSave).not.toBeNull()
  await act(async () => {
    await handle.execute('apply_ops', { ops: [{ op: 'set_text', sid, text: '保存后新增' }] })
  })
  await act(async () => {
    finishSave?.()
  })
  expect(host.textContent).toContain('已修改，未保存')
  expect(dirtyChanges.at(-1)).toBe(true)
  act(() => root.unmount())
  host.remove()
})

it('预览内直接编辑与尺寸消息写回同一源码画布', async () => {
  let agent: HtmlAgentHandle | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <HtmlEditor
        documentId="preview-edit-html"
        io={{ load: async () => new TextEncoder().encode(PAGE), save: async () => {} }}
        onAgentHandleChange={(handle) => {
          agent = handle
        }}
      />,
    )
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  const handle = agent as HtmlAgentHandle | null
  if (!handle) throw new Error('HTML Agent 句柄未挂载')
  const sid = handle.getDocument().map.elements.find((entry) => entry.tag === 'p')?.sid
  if (sid === undefined) throw new Error('测试段落未解析')
  const send = (data: Record<string, unknown>) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { ...data, version: handle.getVersion() },
          source: host.querySelector('iframe')!.contentWindow,
        }),
      )
    })
  send({ type: 'gx:select', element: { sid, tag: 'p', className: '' } })
  send({ type: 'gx:textEditCommit', sid, textNodeIndex: 0, newText: '预览改写' })
  const beforeLateMessage = handle.getDocument().text
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'gx:textEditCommit',
          version: handle.getVersion() - 1,
          sid,
          textNodeIndex: 0,
          newText: '旧预览覆盖',
        },
        source: host.querySelector('iframe')!.contentWindow,
      }),
    )
  })
  expect(handle.getDocument().text).toBe(beforeLateMessage)
  send({ type: 'gx:resize', sid, styles: { width: '280px' } })
  expect(handle.getDocument().text).toContain('<p style="width: 280px">预览改写</p>')
  expect(host.querySelector('.cm-content')?.textContent).toContain('预览改写')
  expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('width: 280px')
  act(() => root.unmount())
  host.remove()
})

it('元素上移遵守同级顺序，图片旋转写入保存字节', async () => {
  const page =
    '<!doctype html><html><body><div><h1>标题</h1><p>段落</p></div><img src="old.png"></body></html>'
  let saved: Uint8Array | null = null
  let agent: HtmlAgentHandle | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <HtmlEditor
        documentId="move-image-html"
        io={{
          load: async () => new TextEncoder().encode(page),
          save: async (bytes) => {
            saved = bytes
          },
        }}
        onAgentHandleChange={(handle) => {
          agent = handle
        }}
      />,
    )
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  const handle = agent as HtmlAgentHandle | null
  if (!handle) throw new Error('HTML Agent 句柄未挂载')
  const select = (tag: string, computed: Record<string, string> = {}) => {
    const sid = handle.getDocument().map.elements.find((entry) => entry.tag === tag)?.sid
    if (sid === undefined) throw new Error(`${tag} 未解析`)
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'gx:select',
            version: handle.getVersion(),
            element: { sid, tag, className: '', computed },
          },
          source: host.querySelector('iframe')!.contentWindow,
        }),
      )
    })
  }
  select('p')
  press(host.querySelector<HTMLButtonElement>('[aria-label="元素编辑"]')!)
  press(
    [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (tab) => tab.textContent === '内容与结构',
    )!,
  )
  press(host.querySelector<HTMLButtonElement>('[aria-label="元素上移"]')!)
  expect(handle.getDocument().text).toContain('<p>段落</p><h1>标题</h1>')
  select('img', { transform: '', width: '200px', height: '100px' })
  press(host.querySelector<HTMLButtonElement>('[aria-label="图片向右旋转 90 度"]')!)
  expect(handle.getDocument().text).toContain('transform: rotate(90deg)')
  press(host.querySelector<HTMLButtonElement>('[aria-label="锁定图片宽高比例"]')!)
  const widthInput = host.querySelector<HTMLInputElement>('input[aria-label="宽度"]')!
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter!.call(widthInput, '300px')
    widthInput.dispatchEvent(new Event('input', { bubbles: true }))
  })
  press(host.querySelector<HTMLButtonElement>('[aria-label="设置宽度"]')!)
  expect(handle.getDocument().text).toContain('width: 300px')
  expect(handle.getDocument().text).toContain('height: 150px')
  expect(host.querySelector<HTMLInputElement>('input[aria-label="高度"]')!.value).toBe('150px')
  press(
    [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (tab) => tab.textContent === 'CSS',
    )!,
  )
  const cssField = host.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="自定义 CSS 声明"]',
  )!
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter!.call(cssField, 'opacity: 0.7; border-radius: 8px')
    cssField.dispatchEvent(new Event('input', { bubbles: true }))
  })
  press(host.querySelector<HTMLButtonElement>('[aria-label="应用自定义 CSS"]')!)
  expect(handle.getDocument().text).toContain('opacity: 0.7')
  expect(handle.getDocument().text).toContain('border-radius: 8px')
  press(
    [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (tab) => tab.textContent === '图片',
    )!,
  )
  const altInput = host.querySelector<HTMLInputElement>('input[aria-label="图片替代文字"]')!
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter!.call(altInput, '示意图')
    altInput.dispatchEvent(new Event('input', { bubbles: true }))
  })
  press(host.querySelector<HTMLButtonElement>('[aria-label="设置图片替代文字"]')!)
  expect(handle.getDocument().text).toContain('alt="示意图"')
  press(host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(new TextDecoder().decode(saved!)).toBe(handle.getDocument().text)
  act(() => root.unmount())
  host.remove()
})
