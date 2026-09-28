// @vitest-environment happy-dom

/**
 * 整条工具条的渲染契约。
 *
 * 单个命令的测试证明「命令能用」，但证明不了**按钮接上了它**——`DocxToolbar`
 * 是一个组件，按钮的 `disabled` / `active` / `onClick` 全在渲染里。这一组断言
 * 挂出一棵真的组件树，然后：
 *
 *  1. 数一遍工具条上有多少个**可点的**控件（一个都不能是「点了没反应的装饰」）
 *  2. 每个按钮都必须有 `aria-label`（读屏要念得出它是什么）
 *  3. **没有任何按钮的 `disabled` 是「没有原因」的**——设计上禁用必须带
 *     `disabledReason`，禁用一个按钮而不说为什么等于让人猜（DESIGN §8.4）
 *  4. 点一下真的改模型（拿「加粗」当样本，因为它是最容易接错的一个）
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { editorExtensions } from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import { openSelect, selectRoot } from '../shell/antd-test-dom.js'
import { openDocx } from '../docx.js'
import { DocxToolbar } from './DocxEditor.js'

const FIXTURE = join(
  import.meta.dirname,
  '../../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
)

const mounted: { unmount: () => void }[] = []

afterEach(() => {
  for (const item of mounted) item.unmount()
  mounted.length = 0
})

/**
 * 挂一棵「编辑器 + 工具条」的真树。
 *
 * 用 `useEditor` 而不是裸 `new Editor()`：工具条的可用性走
 * `useToolbarState`（`useEditorState`），而它订阅的是 Tiptap 的编辑器
 * 实例——`useEditor` 才提供那个挂载与销毁的生命周期。裸实例也能订阅，但
 * 测不到「组件挂载时行为正常」这件事。
 */
function Harness({ onReady }: { onReady: (editor: Editor) => void }) {
  const editor = useEditor({
    extensions: editorExtensions,
    content: contentJson as never,
    editorProps: { attributes: { spellcheck: 'true' } },
  })
  if (editor !== null) onReady(editor)
  return (
    <div>
      <DocxToolbar
        editor={editor}
        disabled={false}
        headingLevels={headingLevels}
        findOpen={false}
        onToggleFind={() => {}}
        onNotice={() => {}}
      />
      <EditorContent editor={editor} />
    </div>
  )
}

let contentJson: unknown = null
let headingLevels: readonly number[] = []

async function boot(): Promise<{ host: HTMLElement; editor: Editor }> {
  const session = await openDocx(new Uint8Array(readFileSync(FIXTURE)))
  contentJson = session.content
  headingLevels = session.headingLevels
  let editor: Editor | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  act(() => {
    root.render(
      <Harness
        onReady={(instance) => {
          editor = instance
        }}
      />,
    )
  })
  mounted.push({
    unmount: () => {
      act(() => root.unmount())
      host.remove()
    },
  })
  if (editor === null) throw new Error('编辑器没起来')
  return { host, editor }
}

const buttons = (host: HTMLElement): HTMLButtonElement[] =>
  Array.from(host.querySelectorAll<HTMLButtonElement>('button'))

/** 点一下（`mousedown` 与 `click` 都派发：工具条上两件事都有意义） */
function press(host: HTMLElement, label: string): void {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (button === null) throw new Error(`找不到「${label}」这个按钮`)
  act(() => {
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

/** 顶层第一个某类型节点的位置 */
function topNodeAt(editor: Editor, type: string): number {
  let found = -1
  editor.state.doc.forEach((node, offset) => {
    if (found === -1 && node.type.name === type) found = offset
  })
  return found
}

describe('DocxToolbar 渲染', () => {
  it('无障碍名称不重复（两个同名控件读屏分不出是哪个）', async () => {
    const { host } = await boot()
    /*
     * 实测踩过：分组的 `aria-label` 与组里那个下拉同名（都叫「表格」「字号」），
     * 读屏于是把同一个名字念两遍，而定位于那个名字的辅助软件会命中错的元素。
     * 分组名与控件名必须各说各的（「表格与插入」对「表格」「插入表格」）。
     */
    const seen = new Map<string, number>()
    for (const el of host.querySelectorAll<HTMLElement>('[aria-label]')) {
      // 隐藏的 file input 与它的按钮共用名字是**有意的**（input 的 tabIndex=-1，
      // 只是「打开选择器」的机制；见 ToolbarFileButton 的说明）
      if (el.tagName === 'INPUT' && el.getAttribute('type') === 'file') continue
      const label = el.getAttribute('aria-label') ?? ''
      if (label === '') continue
      seen.set(label, (seen.get(label) ?? 0) + 1)
    }
    const duplicated = [...seen.entries()].filter(([, count]) => count > 1)
    expect(duplicated, `这些名字出现了不止一次：${JSON.stringify(duplicated)}`).toEqual([])
  })

  it('每个按钮都**看得见内容**（图标或文字，不能是个空方块）', async () => {
    const { host } = await boot()
    /*
     * 实测踩过：`ToolbarToggleGroup` 只传 `option.icon`，而
     * `ToolbarButton` 里那段是 `{children !== undefined && …}` —— 一个没有
     * 图标的选项于是渲染成**一个空的纯色方块**。它在真实截图里才看得出来
     * （实测：文字方向那两个按钮就是两个蓝方块），而 DOM 断言完全正常：
     * `aria-label` 有、点击有效、`disabled` 也对。
     *
     * 所以这一条的判据是「里面有东西」：svg、文字、或一个有色块。
     */
    const empty: string[] = []
    for (const button of host.querySelectorAll<HTMLButtonElement>('.mimir-editor__bar button')) {
      if (button.classList.contains('me-menu__caret')) continue
      const label = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '?'
      const text = (button.textContent ?? '').trim()
      const hasSvg = button.querySelector('svg') !== null
      const hasSwatch = button.querySelector('.me-color__swatch') !== null
      if (text === '' && !hasSvg && !hasSwatch) empty.push(label)
    }
    expect(empty, `这些按钮渲染成了空方块：${JSON.stringify(empty)}`).toEqual([])
  })

  it('每个按钮都有无障碍名称（读屏念得出它是什么）', async () => {
    const { host } = await boot()
    const all = buttons(host)
    expect(all.length).toBeGreaterThan(20)
    for (const button of all) {
      const name = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? ''
      expect(name, `按钮没有名字：${button.outerHTML.slice(0, 120)}`).not.toBe('')
    }
  })

  it('禁用的按钮必须说明原因（灰着不说为什么等于让人猜）', async () => {
    const { host, editor } = await boot()
    /*
     * 先把光标放到**没有直接字号**的文字上——「减小/增大字号」于是必须禁用，
     * 并在 tooltip 里说清原因（`undefined ± 2` 是 NaN，会真落盘成
     * `w:sz w:val="NaN"`）。这样这一条断言的是**真的有按钮被禁用**，而不是
     * 一个空循环。
     */
    act(() => {
      editor.commands.setTextSelection({ from: 2, to: 5 })
      editor.chain().focus().unsetMark('docTextStyle').run()
    })
    const shrink = host.querySelector<HTMLButtonElement>('[aria-label="减小字号"]')
    expect(shrink).not.toBeNull()
    expect(shrink!.disabled).toBe(true)
    expect(shrink!.getAttribute('title')).toContain('没有直接字号')

    let disabledCount = 0
    for (const button of buttons(host)) {
      if (!button.disabled) continue
      disabledCount += 1
      // 禁用的 `title` 让给原因，`aria-label` 仍是按钮名——两者不同才说明给了原因
      const title = button.getAttribute('title') ?? ''
      const label = button.getAttribute('aria-label') ?? ''
      expect(title, `禁用的按钮没有说明原因：${label}`).not.toBe('')
      expect(title, `禁用的按钮把原因与名字混成一件事：${label}`).not.toBe(label)
    }
    expect(disabledCount).toBeGreaterThan(0)

    /*
     * **互斥组（antd `Segmented`）的禁用档也要扫**：它的项是
     * `<label><input type=radio disabled>`，不是 `<button>`，上面那个循环
     * 扫不到。现在这 4 个调用点都没有禁用档（所以这里是空循环），但**将来
     * 加一档禁用时**必须同样给出原因——antd 把 title 让给 label 文本，所以
     * 「原因」得另找地方表达（见 `ToolbarToggleGroup` 的说明）。
     */
    for (const item of host.querySelectorAll('.ant-segmented-item-disabled')) {
      const reason = item.getAttribute('title') ?? ''
      const name = (item.textContent ?? '').trim()
      expect(reason, `禁用的互斥项没有说明原因：${name}`).not.toBe('')
      expect(reason, `禁用的互斥项把原因与名字混成一件事：${name}`).not.toBe(name)
    }
  })

  it('段落样式下拉只列文档里真的存在的标题级别', async () => {
    const { host } = await boot()
    expect(selectRoot(host, '段落样式')).not.toBeNull()
    /*
     * 选项要**打开下拉**才渲染（antd 把列表放在弹层里），读的是**显示文案**：
     * 值（`p` / `h1`）在 antd 那边是 `option.value`，而「正文 / 标题 1 / 引用」
     * 才是用户看到的东西——判据仍然是「文档里有的级别一个不少、没有的一个不多」。
     */
    const shown = openSelect(host, '段落样式').map((option) => (option.textContent ?? '').trim())
    const styles = ['正文', '引用', ...headingLevels.map((level) => `标题 ${level}`)]
    expect(shown.toSorted()).toEqual(styles.toSorted())
  })

  it('字号下拉是 21 档、显示的是磅（存的是半磅）', async () => {
    const { host } = await boot()
    expect(selectRoot(host, '字号（磅）')).not.toBeNull()
    const shown = openSelect(host, '字号（磅）').map((option) => (option.textContent ?? '').trim())
    // 21 档；显示的是磅（10 半磅 → 5 磅、144 半磅 → 72 磅）
    expect(shown).toHaveLength(21)
    expect(shown[0]).toBe('5')
    expect(shown[shown.length - 1]).toBe('72')
  })

  it('点「加粗」真的给选区加上 bold（按钮不是装饰）', async () => {
    const { host, editor } = await boot()
    act(() => {
      editor.commands.setTextSelection({ from: 2, to: 5 })
    })
    expect(editor.isActive('bold')).toBe(false)
    const bold = host.querySelector<HTMLButtonElement>('[aria-label="加粗 (Ctrl+B)"]')
    expect(bold).not.toBeNull()
    act(() => {
      bold!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      bold!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(editor.isActive('bold')).toBe(true)
  })

  it('列表按钮走的是改节点类型（这个方言没有 bulletList 节点）', async () => {
    const { host, editor } = await boot()
    expect(editor.schema.nodes.bulletList).toBeUndefined()
    const at = editor.state.doc.child(0).nodeSize
    act(() => {
      editor.commands.setTextSelection(at + 1)
    })
    const bullet = host.querySelector<HTMLButtonElement>('[aria-label="项目符号列表"]')
    expect(bullet).not.toBeNull()
    act(() => {
      bullet!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      bullet!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(editor.isActive('docListItem')).toBe(true)
    expect(editor.getAttributes('docListItem').kind).toBe('bullet')
  })

  it('表格菜单在光标不在表格里时不出现', async () => {
    const { host, editor } = await boot()
    const tableMenu = (): Element | null => host.querySelector('button[aria-label="表格"]')
    editor.commands.setTextSelection(2)
    expect(tableMenu()).toBeNull()
    // 「插入表格」永远在（它不依赖光标）
    expect(host.querySelector('button[aria-label="插入表格"]')).not.toBeNull()

    // 进表格之后表格菜单才出现
    let tableAt = -1
    editor.state.doc.forEach((node, offset) => {
      if (tableAt === -1 && node.type.name === 'docTable') tableAt = offset
    })
    expect(tableAt).toBeGreaterThan(-1)
    act(() => {
      editor.commands.setTextSelection(tableAt + 4)
    })
    expect(tableMenu()).not.toBeNull()
  })
})

/**
 * 表格菜单的面板：**菜单项 + 一排色块 + 输入框混在同一个面板里**。
 *
 * 这一组守的是那三件手抄必漏的事（收进外壳原语之前，这里照着 `ToolbarMenu`
 * 的 `items` 分支抄过一遍）：
 *
 *  1. 菜单项是 `role="menuitem"`，禁用项把 `title` 让给原因
 *  2. 单元格底纹那一排**说得出当前值**（`aria-pressed`）——手抄的那版漏了它，
 *     于是「这一格现在是什么底纹」在界面与读屏上都读不到，而它看起来只是
 *     「点色块没反应」
 *  3. 色块点下去真的落到模型上（`setCellAttr(fill)`），下一帧的 `aria-pressed`
 *     跟着换——**界面显示的值必须来自真实模型**
 */
describe('表格菜单的面板', () => {
  /** 挂一棵树并把光标放进表格里，然后展开表格菜单 */
  async function openTableMenu(): Promise<{ host: HTMLElement; editor: Editor; panel: Element }> {
    const { host, editor } = await boot()
    const at = topNodeAt(editor, 'docTable')
    expect(at).toBeGreaterThan(-1)
    act(() => {
      editor.commands.setTextSelection(at + 4)
    })
    press(host, '表格')
    const panel = host.querySelector('.me-menu__panel')
    if (panel === null) throw new Error('表格菜单没有展开')
    return { host, editor, panel }
  }

  it('菜单项来自外壳原语：禁用项把 title 让给原因（不是它自己的名字）', async () => {
    const { panel } = await openTableMenu()
    const items = [...panel.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(items.length).toBeGreaterThan(6)
    expect(items[0]!.textContent).toBe('上方插入行')

    // 单元格选区下这两条可用（不 disabled），所以 title 是名字
    expect(items[0]!.disabled).toBe(false)
    expect(items[0]!.getAttribute('title')).toBe('上方插入行')

    // 「合并单元格」在普通文字选区下用不了——禁用它，且 title 是**为什么**
    const merge = items.find((item) => item.textContent === '合并单元格')!
    expect(merge.disabled).toBe(true)
    expect(merge.getAttribute('title')).toBe('先拖选一个矩形区域的多个单元格')
  })

  it('单元格底纹那一排色块说得出当前值（手抄的那版漏了 aria-pressed）', async () => {
    const { panel, editor } = await openTableMenu()
    const cells = [...panel.querySelectorAll<HTMLButtonElement>('.me-color__cell')]
    // 四个浅色 + 一个「清除底纹」
    expect(cells).toHaveLength(5)

    // 一开始这一格没有底纹：一个都不该是「按下」
    const pressed = (): string[] =>
      cells
        .filter((cell) => cell.getAttribute('aria-pressed') === 'true')
        .map((cell) => cell.getAttribute('aria-label') ?? '')
    expect(pressed()).toEqual([])

    // 点「浅蓝」：模型上真的落了 fill，且下一帧那一格变成当前值
    const blue = panel.querySelector<HTMLButtonElement>('[aria-label="浅蓝"]')!
    act(() => {
      blue.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      blue.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(editor.getAttributes('docTableCell').fill).toBe('DEEAF6')
    expect(pressed()).toEqual(['浅蓝'])

    // 内联形态**不关面板**：底纹常常要连着改好几个格子
    expect(blue.closest('.me-menu__panel')).not.toBeNull()
  })

  it('「清除底纹」是一个真实取值（不是「没点」），点了确实清掉', async () => {
    const { panel, editor } = await openTableMenu()
    act(() => {
      editor.chain().focus().updateAttributes('docTableCell', { fill: 'FFF2CC' }).run()
    })
    const cells = [...panel.querySelectorAll<HTMLButtonElement>('.me-color__cell')]
    const current = cells.find((cell) => cell.getAttribute('aria-pressed') === 'true')
    expect(current?.getAttribute('aria-label')).toBe('浅黄')

    const clear = panel.querySelector<HTMLButtonElement>('[aria-label="清除底纹"]')!
    act(() => {
      clear.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      clear.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(editor.getAttributes('docTableCell').fill).toBeNull()
  })

  it('面板里的数字框按上下键不被菜单吃掉（表单控件的键归它自己）', async () => {
    const { panel } = await openTableMenu()
    const field = panel.querySelector<HTMLInputElement>('[aria-label="行高"]')
    expect(field).not.toBeNull()
    const firstItem = panel.querySelector<HTMLElement>('[role="menuitem"]')!
    // 聚焦也要在 act 里：`InputNumber` 的 onFocus 会更新它自己的状态
    act(() => {
      field!.focus()
    })
    /*
     * 用 **Home** 而不是上下键：菜单的处理器对 `ArrowUp/Down`、`Home`、`End`
     * 都会 `preventDefault` + 挪焦点，而上下键还会让 `InputNumber` 自己更新一次
     * 内部状态（测试里就是一条 act 警告，会淹掉真正要紧的那几条）。Home 没有
     * 这一层——它干净地测同一个分支。
     */
    const event = new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })
    act(() => {
      field!.dispatchEvent(event)
    })
    // 菜单没抢它（以前靠调用点自己挂一层 stopPropagation，markdown 那边就漏了）
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(field)
    expect(document.activeElement).not.toBe(firstItem)
  })
})
