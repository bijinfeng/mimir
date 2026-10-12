/**
 * @vitest-environment happy-dom
 *
 * markdown 工具条的**按钮 → 命令**契约。
 *
 * ## 为什么在宿主这边（而不是在包里）
 *
 * 因为**方言在这里**。`packages/office/src/editors/MarkdownEditor.tsx` 里 `MarkdownToolbar` 的每个
 * 按钮判据只有在真扩展列表（`createExtensions()`）上跑才算数——换一组扩展，
 * `hasNode('table')`、`can().sinkListItem('taskItem')` 都会是另一个答案。
 * `MarkdownEditor` 的 `extensions` 也是宿主注入的，所以只有这里能挂出
 * **与线上同一套方言**的工具条。
 *
 * ## 为什么直接挂 `MarkdownToolbar`（而不是整个 `MarkdownEditor`）
 *
 * 因为工具条要**一个真的编辑器实例**才谈得上「点了按钮，文档变了没」。
 * 从 `MarkdownEditor` 里面拿实例要多加一个只为测试存在的出口，而在
 * happy-dom 里造不出「真的输入事件」——它不跑 ProseMirror 的 DOM 观察器
 * （实测：`beforeinput`、`paste` 派发过去文档都不变，`execCommand` 在
 * happy-dom 里根本没有）。所以这里自己 `new Editor(...)`，把实例喂给
 * 工具条——**挂的是线上那个组件**，走的是线上那条 `onClick`。
 *
 * ## 每条断言守的都是「点了没反应」
 *
 * 按钮接错命令时 `chain().run()` 照样返回 true，界面看不出异样，文件里
 * 却是空的。所以这里的断言都读 **`getMarkdown()` 出来的正文**，不是
 * 「命令返回值」——返回值本身也会骗人：`setParagraph` 在列表项上返回 false
 * 却真的把那一项提出了列表（实测，见 `markdown-toolbar.test.ts`）。
 */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { MarkdownToolbar } from '@mimir/office'
/**
 * 驱动 antd 下拉的辅助。**从包里来**（`@mimir/office/test-dom`）：docx / pptx /
 * 外壳三处的测试在做同一套动作，各写一份必然漂移——而这个仓库最讨厌的就是
 * 同一件事的两份实现。
 */
// 代码块语言仍是 ToolbarSelect（表单语义的取值），段落样式已是 me-menu（D-088）——
// 两套助手并存，各服务各的控件
import {
  menuTriggerText,
  openMenuItems,
  openSelect,
  pickMenuItem,
  pickSelectOption,
  selectRoot,
  selectValueText,
} from '@mimir/office/test-dom'
import { createExtensions } from './extensions.js'

/* ── 挂载 / 交互 ─────────────────────────────────────────────── */

const live: { unmount: () => void; editor: Editor }[] = []

afterEach(() => {
  for (const item of live) item.unmount()
  live.length = 0
  for (const item of live) item.editor.destroy()
  live.length = 0
  vi.unstubAllGlobals()
})

interface Harness {
  host: HTMLElement
  editor: Editor
}

/** 造一个真编辑器 + 挂上工具条。`spellCheck` 由调用方控制，与 `MarkdownEditor` 同构 */
function mount(body: string, options: { withImageUpload?: boolean } = {}): Harness {
  const dom = document.createElement('div')
  const editor = new Editor({
    element: dom,
    extensions: createExtensions(),
    content: body,
    contentType: 'markdown',
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  act(() => {
    root.render(
      <MarkdownToolbar
        editor={editor}
        spellCheck={false}
        onToggleSpellCheck={() => {}}
        {...(options.withImageUpload === true ? { onPickImage: () => {} } : {})}
      />,
    )
  })

  live.push({
    editor,
    unmount: () => {
      act(() => root.unmount())
      host.remove()
      dom.remove()
    },
  })
  return { host, editor }
}

/** 按无障碍名称找工具条上的按钮 */
function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === label,
  )
  if (found === undefined) throw new Error(`没有名为「${label}」的按钮`)
  return found as HTMLButtonElement
}

function hasButton(host: HTMLElement, label: string): boolean {
  return [...host.querySelectorAll('button')].some(
    (item) => item.getAttribute('aria-label') === label,
  )
}

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

/** 打开某个 `ToolbarMenu` 的面板并返回面板里的按钮 */
function openMenu(host: HTMLElement, label: string): HTMLElement {
  click(button(host, label))
  const panel = host.querySelector<HTMLElement>('[role="menu"]')
  if (panel === null) throw new Error(`「${label}」的面板没有展开`)
  return panel
}

/**
 * 把光标放进文档里第一段出现 `text` 的地方，并让工具条跟着刷新。
 *
 * `editor.commands.*` 会派发事务，而工具条通过 `useSyncExternalStore` 订阅它
 * ——不包在 `act` 里 React 会警告「测试里没包 act」，而且**按钮状态可能还没
 * 刷到**。这两件事是同一个原因，所以这里一起解决。
 */
function cursorAt(editor: Editor, text: string): void {
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === text) at = pos + 1
    return true
  })
  if (at === -1) throw new Error(`找不到文字：${text}`)
  act(() => {
    editor.commands.setTextSelection(at)
  })
}

/** 设一个文字区间（同上：要包在 `act` 里） */
function selectRange(editor: Editor, from: number, to: number): void {
  act(() => {
    editor.commands.setTextSelection({ from, to })
  })
}

const markdown = (editor: Editor): string => editor.getMarkdown().trim()

/* ── 断言 ─────────────────────────────────────────────────────── */

describe('工具条渲染', () => {
  it('窄栏的更多菜单不列出当前没有控件的上下文组', () => {
    let resize: ResizeObserverCallback | undefined
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback
        }
        observe() {}
        disconnect() {}
      },
    )
    const { host } = mount('正文\n')
    act(() => {
      resize?.([{ contentRect: { width: 320 } } as ResizeObserverEntry], {} as ResizeObserver)
    })
    const menu = openMenu(host, '更多笔记工具')
    expect(menu.querySelector('[role="group"][aria-label="表格"]')).toBeNull()
    expect(menu.querySelector('[role="group"][aria-label="代码块语言"]')).toBeNull()
    expect(menu.querySelector('[role="group"][aria-label="插入"]')).not.toBeNull()
  })

  it('这一批按钮都在（少一个就是「接不上」的那一种）', () => {
    const { host } = mount('正文\n')
    for (const label of [
      '撤销 (Ctrl+Z)',
      '重做 (Ctrl+Shift+Z)',
      '加粗 (Ctrl+B)',
      '倾斜 (Ctrl+I)',
      '删除线',
      '行内代码',
      '清除格式',
      '项目符号列表',
      '编号列表',
      '任务列表',
      '减少缩进',
      '增加缩进',
      '插入表格',
      '分隔线',
    ]) {
      expect(hasButton(host, label), `缺按钮：${label}`).toBe(true)
    }
    // 段落样式已迁去 me-menu（D-088）：判据是触发按钮存在（带 haspopup）
    const styleTrigger = host.querySelector('button[aria-label="段落样式"]')
    expect(styleTrigger?.getAttribute('aria-haspopup')).toBe('menu')
    expect(hasButton(host, '链接')).toBe(true)
  })

  /**
   * 下划线**不是 GFM**：`@tiptap/markdown` 把它序列化成 `++文字++`，
   * 别的 markdown 工具多半不认。用的人有权知道，所以写在 label 里。
   */
  it('下划线的提示里写明它序列化成 ++x++、不是 GFM', () => {
    const { host } = mount('正文\n')
    const underline = [...host.querySelectorAll('button')].find((item) =>
      item.getAttribute('aria-label')?.startsWith('下划线'),
    )
    expect(underline?.getAttribute('aria-label')).toContain('++')
    expect(underline?.getAttribute('aria-label')).toContain('不是 GFM')
  })

  it('「插入图片」只在宿主给了上传通道时出现', () => {
    const without = mount('正文\n')
    expect(hasButton(without.host, '插入图片')).toBe(false)
    const withUpload = mount('正文\n', { withImageUpload: true })
    expect(hasButton(withUpload.host, '插入图片')).toBe(true)
    expect(withUpload.host.querySelector('input[type=file]')).not.toBeNull()
  })
})

describe('撤销与重做', () => {
  it('没有历史时禁用，并给出原因（不是灰着让人猜）', () => {
    const { host } = mount('正文\n')
    const undo = button(host, '撤销 (Ctrl+Z)')
    expect(undo.disabled).toBe(true)
    expect(undo.title).toBe('没有可撤销的改动')
    expect(button(host, '重做 (Ctrl+Shift+Z)').disabled).toBe(true)
  })

  it('改过文档之后可用；点一下真的撤销', () => {
    const { host, editor } = mount('正文\n')
    act(() => {
      editor
        .chain()
        .focus()
        .insertContentAt(editor.state.doc.content.size - 1, '新')
        .run()
    })
    // 状态订阅要跟着事务刷新（useToolbarState 的契约）
    expect(button(host, '撤销 (Ctrl+Z)').disabled).toBe(false)

    click(button(host, '撤销 (Ctrl+Z)'))
    expect(markdown(editor)).toBe('正文')
    expect(button(host, '重做 (Ctrl+Shift+Z)').disabled).toBe(false)

    click(button(host, '重做 (Ctrl+Shift+Z)'))
    expect(markdown(editor)).toBe('正文新')
  })
})

describe('段落样式下拉', () => {
  it('九项：正文 / h1-h6 / 引用 / 代码块', () => {
    const { host } = mount('正文\n')
    // 选项在弹层里，所以要打开才读得到（文案就是判据：用户看到的是它）
    expect(
      openMenuItems(host, '段落样式').map((option) => (option.textContent ?? '').trim()),
    ).toEqual([
      '正文',
      '标题 1',
      '标题 2',
      '标题 3',
      '标题 4',
      '标题 5',
      '标题 6',
      '引用',
      '代码块',
    ])
  })

  it('下拉显示光标处当前的样式，选了就改文档', () => {
    const { host, editor } = mount('## 标题\n\n正文\n')

    cursorAt(editor, '标题')
    expect(menuTriggerText(host, '段落样式')).toBe('标题 2')

    pickMenuItem(host, '段落样式', '标题 4')
    expect(markdown(editor)).toBe('#### 标题\n\n正文')

    pickMenuItem(host, '段落样式', '代码块')
    expect(markdown(editor)).toBe('```\n标题\n```\n\n正文')
  })
})

describe('列表与缩进', () => {
  it('「任务列表」把**整张**列表变成待办（不是只有光标那一项）', () => {
    const { host, editor } = mount('- 一\n- 二\n- 三\n')
    // 光标故意放在第二项上：作用域写错时正是这里露馅
    cursorAt(editor, '二')
    click(button(host, '任务列表'))
    expect(markdown(editor)).toBe('- [ ] 一\n- [ ] 二\n- [ ] 三')
  })

  it('嵌套列表：按钮禁用并说明原因（没有任何一条上游命令能整张转换）', () => {
    const { host, editor } = mount('- 甲\n  - 甲一\n- 乙\n')
    cursorAt(editor, '甲')
    const task = button(host, '任务列表')
    expect(task.disabled).toBe(true)
    expect(task.title).toContain('嵌套')
  })

  it('缩进：两个按钮的节点名按光标处判断（任务列表是另一种节点）', () => {
    const { host, editor } = mount('- [ ] 一\n- [ ] 二\n')
    cursorAt(editor, '二')
    const indent = button(host, '增加缩进')
    expect(indent.disabled).toBe(false)
    click(indent)
    expect(markdown(editor)).toBe('- [ ] 一\n  - [ ] 二')
  })

  it('不在列表里：两个缩进按钮都禁用，理由是「光标不在列表里」', () => {
    const { host } = mount('正文\n')
    expect(button(host, '减少缩进').disabled).toBe(true)
    expect(button(host, '减少缩进').title).toBe('光标不在列表里')
    expect(button(host, '增加缩进').disabled).toBe(true)
  })
})

describe('链接', () => {
  it('选中文字 + 面板里填地址 → 真的写成链接', () => {
    const { host, editor } = mount('一段文字\n')
    selectRange(editor, 1, 3)

    const panel = openMenu(host, '链接')
    const input = panel.querySelector<HTMLInputElement>('[aria-label="链接地址"]')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'https://example.com')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click(panel.querySelector<HTMLButtonElement>('button[aria-label^="应用链接"]')!)
    expect(markdown(editor)).toBe('[一段](https://example.com)文字')
  })

  /**
   * **空选区上 `setLink` 返回 true 却什么都不写**（实测它只把 `link` 塞进
   * storedMarks）。所以那个「应用」按钮必须禁用并说明原因。
   */
  it('空选区且不在链接里：「应用」禁用并说明要先选中文字', () => {
    const { host, editor } = mount('一段文字\n')
    cursorAt(editor, '一段文字')
    const panel = openMenu(host, '链接')
    const apply = panel.querySelector<HTMLButtonElement>('button[aria-label^="应用链接"]')!
    expect(apply.disabled).toBe(true)
    expect(apply.title).toBe('先选中要加链接的文字')
  })

  it('光标在链接里：换成新地址，整条都换', () => {
    const { host, editor } = mount('前 [链](https://old.a) 后\n')
    cursorAt(editor, '链')
    // 在链接里时工具条多一个「移除链接」的快捷按钮
    expect(hasButton(host, '移除链接')).toBe(true)
    expect(button(host, '移除链接').disabled).toBe(false)

    const panel = openMenu(host, '链接')
    const input = panel.querySelector<HTMLInputElement>('[aria-label="链接地址"]')!
    expect(input.value).toBe('https://old.a')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'https://new.b')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click(panel.querySelector<HTMLButtonElement>('button[aria-label^="应用链接"]')!)
    expect(markdown(editor)).toBe('前 [链](https://new.b) 后')
  })

  it('不在链接里时没有「移除链接」按钮', () => {
    const { host } = mount('一段文字\n')
    expect(hasButton(host, '移除链接')).toBe(false)
  })
})

describe('表格', () => {
  it('插入表格：面板里填行列，插进去的是带表头的表格', () => {
    const { host, editor } = mount('正文\n')
    cursorAt(editor, '正文')
    const panel = openMenu(host, '插入表格')
    const rowInput = panel.querySelector<HTMLInputElement>('[aria-label="行数"]')!
    const colInput = panel.querySelector<HTMLInputElement>('[aria-label="列数"]')!
    expect(rowInput.value).toBe('3')
    expect(colInput.value).toBe('3')

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(rowInput, '2')
      rowInput.dispatchEvent(new Event('input', { bubbles: true }))
      rowInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    click(panel.querySelector<HTMLButtonElement>('button[aria-label^="插入 2"]')!)

    const out = markdown(editor)
    expect(out).toContain('| --- | --- | --- |')
    // 2 行 + 分隔行 = 3 行
    expect(out.split('\n').filter((line) => line.startsWith('|'))).toHaveLength(3)
  })

  /**
   * **列对齐要改整列。**只改一格会当场产生「markdown 里整列都对齐了、
   * 而表头格的 `align` 还是 null」两处不一致（实测）。
   */
  it('切到表格里才出现表格菜单，且列对齐对整列生效', () => {
    const { host, editor } = mount('正文\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n')
    // 打开文档时光标在第一段（不在表格里）
    expect(hasButton(host, '表格')).toBe(false)

    cursorAt(editor, '1')
    expect(hasButton(host, '表格')).toBe(true)
    const panel = openMenu(host, '表格')
    click(
      [...panel.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((item) =>
        item.textContent?.includes('本列居中'),
      )!,
    )
    expect(markdown(editor)).toContain('| :---: | --- |')

    // 表头格也变了——界面读的那一处必须和文件一致（列对齐是「一整列一个值」）
    cursorAt(editor, 'a')
    expect(openMenu(host, '表格')).toBeDefined()
  })

  it('光标不在表格里时不出现表格菜单', () => {
    const { host } = mount('正文\n')
    expect(hasButton(host, '表格')).toBe(false)
  })
})

describe('代码块语言', () => {
  it('光标在代码块里才出现语言下拉，选了改围栏', () => {
    const { host, editor } = mount('正文\n\n```\n码\n```\n')
    // 打开文档时光标在第一段
    expect(host.querySelector('[aria-label="代码块语言"]')).toBeNull()

    cursorAt(editor, '码')
    expect(selectRoot(host, '代码块语言')).not.toBeNull()
    /*
     * 没选语言时显示的是「自动识别」这个档（`value: ''` 是一档真实取值，
     * 不是占位）——比旧版读 `select.value === ''` 更直白：界面说的是人话。
     */
    expect(selectValueText(host, '代码块语言')).toBe('自动识别')

    // 候选来自方言自己的 lowlight（common 那一套）
    expect(
      openSelect(host, '代码块语言').map((option) => (option.textContent ?? '').trim()),
    ).toContain('typescript')

    pickSelectOption(host, '代码块语言', 'typescript')
    expect(markdown(editor)).toBe('正文\n\n```typescript\n码\n```')
  })
})

describe('清除格式', () => {
  it('选中带格式的文字才可点；点了真的清掉', () => {
    const { host, editor } = mount('**粗** 字\n')
    cursorAt(editor, '粗')
    expect(button(host, '清除格式').disabled).toBe(true)
    expect(button(host, '清除格式').title).toBe('先选中带格式的文字')

    selectRange(editor, 1, editor.state.doc.content.size - 1)
    const clear = button(host, '清除格式')
    expect(clear.disabled).toBe(false)
    click(clear)
    expect(markdown(editor)).toBe('粗 字')
  })
})

describe('拼写检查', () => {
  /**
   * 属性写死成显式值，不留给浏览器默认：不写的时候 `getAttribute` 是 `null`，
   * 而按钮要显示「开 / 关」——两处说法迟早不一致。
   */
  it('按钮的 label 反映当前状态', () => {
    const dom = document.createElement('div')
    const editor = new Editor({
      element: dom,
      extensions: createExtensions(),
      content: '正文\n',
      contentType: 'markdown',
      editorProps: { attributes: { spellcheck: 'true' } },
    })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    act(() => {
      root.render(<MarkdownToolbar editor={editor} spellCheck onToggleSpellCheck={() => {}} />)
    })
    expect(hasButton(host, '关闭拼写检查')).toBe(true)
    expect(editor.view.dom.getAttribute('spellcheck')).toBe('true')
    // 方法真的存在（`setOptions` → `view.setProps`），属性会跟着变
    act(() => {
      editor.setOptions({ editorProps: { attributes: { spellcheck: 'false' } } })
    })
    expect(editor.view.dom.getAttribute('spellcheck')).toBe('false')

    act(() => {
      root.unmount()
    })
    host.remove()
    dom.remove()
    editor.destroy()
  })
})
