// @vitest-environment happy-dom
import {
  PARAGRAPH_STYLES,
  applyLink,
  applyParagraphStyle,
  canInsertTable,
  codeLanguageOptions,
  currentCodeLanguage,
  currentColumnAlign,
  currentLinkHref,
  listItemNameAt,
  listItemNameFromState,
  paragraphStyleOf,
  removeLink,
  setCodeLanguage,
  setColumnAlign,
  styleFromToolbarState,
  taskListToggleBlockedReason,
  toggleWholeTaskList,
  toolbarHas,
  toolbarStateOf,
  wholeListRange,
} from '@mimir/office'
import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { createExtensions } from './extensions.js'

/**
 * **markdown 工具条的判据，在真方言上跑一遍。**
 *
 * 这些逻辑在 `packages/office/src/editors/markdown-format.ts` 里，而它们对不对
 * 只有配上真方言才知道——方言（`createExtensions`）在宿主这儿，包不拥有它。
 * 所以这个文件放在 `apps/web`：文档里那些「实测」写的就是这个文件里跑出来的。
 *
 * 每条断言背后都是一次**静默失效**（命令返回 true 而什么都没做、状态显示成
 * 另一个东西）。不报错的那类问题，正是这个仓库最怕的。
 */

function make(content: string): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: createExtensions(),
    content,
    contentType: 'markdown',
  })
}

/** 标签页里的下标，用来把光标放进某个文字 */
function posOfText(editor: Editor, text: string): number {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === text) found = pos + 1
    return true
  })
  if (found === -1) throw new Error(`找不到文字：${text}`)
  return found
}

/** 光标放进某个 listItem / taskItem */
function posOfItem(editor: Editor, name: 'listItem' | 'taskItem', kind: number): number {
  const positions: number[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === name) positions.push(pos)
    return true
  })
  const at = positions[kind]
  if (at === undefined) throw new Error(`找不到第 ${kind} 个 ${name}`)
  return at + 2
}

const shape = (editor: Editor): string[] => {
  const out: string[] = []
  const walk = (node: Editor['state']['doc'], indent: string): void => {
    out.push(`${indent}${node.type.name}`)
    node.forEach((child) => walk(child, `${indent}  `))
  }
  walk(editor.state.doc, '')
  return out
}

describe('段落样式下拉', () => {
  it('九项都在：正文 / h1-h6 / 引用 / 代码块', () => {
    expect(PARAGRAPH_STYLES).toEqual([
      'paragraph',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'codeBlock',
    ])
  })

  it('h4-h6 在这个方言里是可用的（StarterKit 的 heading 默认 1-6）', () => {
    const editor = make('#### 四级\n')
    expect(editor.schema.nodes.heading).toBeDefined()
    expect(editor.isActive('heading', { level: 4 })).toBe(true)
    editor.destroy()
  })

  /**
   * 六种上下文里的当前样式。这张表就是「下拉开着的时候显示什么」——
   * 写错一处就是界面在说假话（比如引用里的段落显示成「正文」，
   * 用户于是以为再选一次「正文」没有变化）。
   */
  it('当前样式：引用优先于标题，代码块优先于一切', () => {
    const cases: { md: string; text: string; expected: string }[] = [
      { md: '正文一段\n', text: '正文一段', expected: 'paragraph' },
      { md: '## 标题\n', text: '标题', expected: 'h2' },
      { md: '#### 四级\n', text: '四级', expected: 'h4' },
      { md: '> 引用\n', text: '引用', expected: 'blockquote' },
      { md: '> ## 引用里的标题\n', text: '引用里的标题', expected: 'blockquote' },
      { md: '```\n码\n```\n', text: '码', expected: 'codeBlock' },
      { md: '- 列表项\n', text: '列表项', expected: 'paragraph' },
      { md: '- [ ] 待办\n', text: '待办', expected: 'paragraph' },
    ]
    const actual = cases.map((testCase) => {
      const editor = make(testCase.md)
      editor.commands.setTextSelection(posOfText(editor, testCase.text))
      const style = paragraphStyleOf(editor)
      editor.destroy()
      return [testCase.md, style]
    })
    expect(actual).toEqual(cases.map((testCase) => [testCase.md, testCase.expected]))
  })

  it('状态串里的 style token 读得回来，取不到时是 none', () => {
    const editor = make('# 三级\n')
    editor.commands.setTextSelection(posOfText(editor, '三级'))
    expect(styleFromToolbarState(toolbarStateOf(editor))).toBe('h1')
    editor.commands.setContent({ type: 'doc', content: [{ type: 'image', attrs: { src: 'x' } }] })
    editor.commands.setNodeSelection(0)
    expect(styleFromToolbarState(toolbarStateOf(editor))).toBeNull()
    editor.destroy()
  })

  it('九个取值都能设到光标处', () => {
    const applied = PARAGRAPH_STYLES.map((style) => {
      const editor = make('一段文字\n')
      editor.commands.setTextSelection(posOfText(editor, '一段文字'))
      applyParagraphStyle(editor, style)
      const out = editor.getMarkdown().trim()
      editor.destroy()
      return [style, out]
    })
    expect(applied).toEqual([
      ['paragraph', '一段文字'],
      ['h1', '# 一段文字'],
      ['h2', '## 一段文字'],
      ['h3', '### 一段文字'],
      ['h4', '#### 一段文字'],
      ['h5', '##### 一段文字'],
      ['h6', '###### 一段文字'],
      ['blockquote', '> 一段文字'],
      ['codeBlock', '```\n一段文字\n```'],
    ])
  })

  /**
   * `setParagraph` 在**本来就是段落**的位置返回 false（`setBlockType` 发现
   * 类型没变就不派发）——这是「命令的返回值不是「它成功了吗」，而是「它做了
   * 什么吗」」的又一个例子。所以下拉的 onChange 不看返回值，只看效果。
   * 而在**列表项**上它返回 false 却真的把那一项提出了列表（实测）。
   */
  it('setParagraph 的返回值在列表项上会骗人：false 但文档变了', () => {
    const editor = make('- 一\n- 二\n')
    editor.commands.setTextSelection(posOfItem(editor, 'listItem', 0))
    expect(applyParagraphStyle(editor, 'paragraph')).toBe(false)
    expect(editor.getMarkdown().trim()).toBe('一\n\n- 二')
    editor.destroy()
  })
})

describe('列表：整张列表的作用域', () => {
  /**
   * 这条是本文件里最要紧的一个断言。
   *
   * `toggleTaskList` 的作用域是**光标那一项**：不先把选区铺到整张列表，
   * 光标在第二项上点「任务列表」会得到「第一项还是项目符号、第二项变成
   * 待办」——列表被拆成两张，而命令返回 true。
   */
  it('整张无序列表变成任务列表（不是只有光标那一项）', () => {
    const editor = make('- 一\n- 二\n- 三\n')
    editor.commands.setTextSelection(posOfItem(editor, 'listItem', 1))
    expect(toggleWholeTaskList(editor)).toBe(true)
    expect(editor.getMarkdown().trim()).toBe('- [ ] 一\n- [ ] 二\n- [ ] 三')
    editor.destroy()
  })

  it('有序列表也一样', () => {
    const editor = make('1. 一\n2. 二\n')
    editor.commands.setTextSelection(posOfItem(editor, 'listItem', 1))
    expect(toggleWholeTaskList(editor)).toBe(true)
    expect(editor.getMarkdown().trim()).toBe('- [ ] 一\n- [ ] 二')
    editor.destroy()
  })

  /**
   * 反过来：整张任务列表变回普通列表。
   *
   * 这里同时守着一个**区间算错**的坑：`$from.before(depth)` / `after(depth)`
   * 落在块级边界上，`setTextSelection` 把它们夹进文字选区之后会得到
   * `anchor:3 head:17` 这种端点，`toggleTaskList` 于是把列表拆成三个散段落
   * （而命令返回 true）。所以区间必须落在真实文字上。
   */
  it('整张任务列表再切一次：变回**段落**（上游 toggleList 的语义是 lift）', () => {
    const editor = make('- [ ] 一\n- [ ] 二\n- [ ] 三\n')
    editor.commands.setTextSelection(posOfItem(editor, 'taskItem', 1))
    expect(wholeListRange(editor)).toEqual({ from: 3, to: 14 })
    expect(toggleWholeTaskList(editor)).toBe(true)
    expect(editor.getMarkdown().trim()).toBe('一\n\n二\n\n三')
    expect(editor.isActive('taskList')).toBe(false)
    editor.destroy()
  })

  it('光标在**第一项**上结果一样（作用域与光标落在哪一项无关）', () => {
    const editor = make('- 一\n- 二\n- 三\n')
    editor.commands.setTextSelection(posOfItem(editor, 'listItem', 0))
    expect(toggleWholeTaskList(editor)).toBe(true)
    expect(editor.getMarkdown().trim()).toBe('- [ ] 一\n- [ ] 二\n- [ ] 三')
    editor.destroy()
  })

  it('一张列表一步撤销回原样', () => {
    const editor = make('- 一\n- 二\n- 三\n')
    editor.commands.setTextSelection(posOfItem(editor, 'listItem', 1))
    toggleWholeTaskList(editor)
    expect(editor.can().undo()).toBe(true)
    editor.commands.undo()
    expect(editor.getMarkdown().trim()).toBe('- 一\n- 二\n- 三')
    editor.destroy()
  })

  it('不在列表里：退回命令自己的作用域（新建一张任务列表）', () => {
    const editor = make('一段文字\n')
    editor.commands.setTextSelection(posOfText(editor, '一段文字'))
    expect(wholeListRange(editor)).toBeNull()
    expect(toggleWholeTaskList(editor)).toBe(true)
    expect(editor.getMarkdown().trim()).toBe('- [ ] 一段文字')
    editor.destroy()
  })

  /**
   * **嵌套列表上没有任何一条上游命令能整张转换**（实测四种走法：整张区间
   * 与 `setNodeSelection` 都返回 false 且文档一字未改；逐项链式会把内层项
   * 抬出来；光标在内层时普通 toggle 会把结构拆散）。所以按钮如实禁用，
   * 理由写在 tooltip 里——留一个点了没反应、或者会把文档改坏的按钮更糟。
   */
  it('嵌套列表：给出禁用理由，而不是一个点了没反应的按钮', () => {
    const editor = make('- 甲\n  - 甲一\n- 乙\n')
    editor.commands.setTextSelection(posOfItem(editor, 'listItem', 0))
    const reason = taskListToggleBlockedReason(editor)
    expect(reason).not.toBeNull()
    expect(reason).toContain('嵌套')
    editor.destroy()
  })

  it('平级列表与「不在列表里」都不拦', () => {
    const flat = make('- 甲\n- 乙\n')
    flat.commands.setTextSelection(posOfItem(flat, 'listItem', 0))
    expect(taskListToggleBlockedReason(flat)).toBeNull()
    flat.destroy()

    const plain = make('一段文字\n')
    plain.commands.setTextSelection(posOfText(plain, '一段文字'))
    expect(taskListToggleBlockedReason(plain)).toBeNull()
    plain.destroy()
  })

  it('空列表（一项也没文字）不炸：退回命令自己的作用域', () => {
    const editor = make('-\n')
    editor.commands.setTextSelection(2)
    expect(() => toggleWholeTaskList(editor)).not.toThrow()
    editor.destroy()
  })
})

describe('缩进：任务列表与普通列表是两种节点', () => {
  it('节点名按光标处判断', () => {
    const bullet = make('- 一\n- 二\n')
    bullet.commands.setTextSelection(posOfItem(bullet, 'listItem', 0))
    expect(listItemNameAt(bullet)).toBe('listItem')
    bullet.destroy()

    const task = make('- [ ] 一\n- [ ] 二\n')
    task.commands.setTextSelection(posOfItem(task, 'taskItem', 0))
    expect(listItemNameAt(task)).toBe('taskItem')
    task.destroy()
  })

  it('不在列表里时是 null（两个按钮都该禁用，而不是点了没反应）', () => {
    const editor = make('一段文字\n')
    editor.commands.setTextSelection(posOfText(editor, '一段文字'))
    expect(listItemNameAt(editor)).toBeNull()
    const state = toolbarStateOf(editor)
    expect(toolbarHas(state, 'outdent')).toBe(false)
    expect(toolbarHas(state, 'indent')).toBe(false)
    editor.destroy()
  })

  it('任务列表里用 taskItem 缩进真的有效（用 listItem 会返回 false）', () => {
    const editor = make('- [ ] 一\n- [ ] 二\n')
    editor.commands.setTextSelection(posOfItem(editor, 'taskItem', 1))
    const state = toolbarStateOf(editor)
    expect(toolbarHas(state, 'indent')).toBe(true)
    expect(listItemNameFromState(state)).toBe('taskItem')
    // 这就是那两个按钮的 onClick 走的路
    expect(editor.chain().focus().sinkListItem('taskItem').run()).toBe(true)
    expect(editor.getMarkdown().trim()).toBe('- [ ] 一\n  - [ ] 二')
    editor.destroy()
  })

  /**
   * **第一项**的「减少缩进」是有效的——上游的 `liftListItem` 把它**移出列表**
   * 变成段落（实测 `- 一\n- 二` → `一\n\n- 二`），与 Word 里「减少缩进」到最外层
   * 再按一次的效果同构。所以这个按钮在最外层时仍然可点，不能按「已经在最外层」
   * 去禁用——那会让用户出不了列表。
   */
  it('第一项也能「减少缩进」：它把这一项移出列表', () => {
    const editor = make('- 一\n- 二\n')
    editor.commands.setTextSelection(posOfItem(editor, 'listItem', 0))
    expect(toolbarHas(toolbarStateOf(editor), 'outdent')).toBe(true)
    expect(editor.chain().focus().liftListItem('listItem').run()).toBe(true)
    expect(editor.getMarkdown().trim()).toBe('一\n\n- 二')
    editor.destroy()
  })
})

describe('链接', () => {
  it('有选区就能设，整条 markdown 对得上', () => {
    const editor = make('一段文字\n')
    editor.commands.setTextSelection({ from: 1, to: 3 })
    expect(applyLink(editor, 'https://example.com')).toBe(true)
    expect(editor.getMarkdown().trim()).toBe('[一段](https://example.com)文字')
    editor.destroy()
  })

  /**
   * **空选区上 `setLink` 返回 true 却什么都不写**——实测它只把 `link` 塞进
   * storedMarks，接着敲的字会变成链接。那不是「给选中的文字加链接」，
   * 所以这里必须返回 false（按钮据此禁用），而不是留一个点了没反馈的按钮。
   */
  it('空选区且不在链接里：返回 false（按钮禁用的判据）', () => {
    const editor = make('一段文字\n')
    editor.commands.setTextSelection(posOfText(editor, '一段文字'))
    expect(applyLink(editor, 'https://example.com')).toBe(false)
    expect(editor.getMarkdown().trim()).toBe('一段文字')
    expect(toolbarHas(toolbarStateOf(editor), 'emptySelection')).toBe(true)
    editor.destroy()
  })

  it('光标在链接里：换成新地址，整条都换（不是半条）', () => {
    const editor = make('前 [链](https://old.a) 后\n')
    editor.commands.setTextSelection(posOfText(editor, '链'))
    expect(currentLinkHref(editor)).toBe('https://old.a')
    expect(toolbarHas(toolbarStateOf(editor), 'link')).toBe(true)
    expect(applyLink(editor, 'https://new.b')).toBe(true)
    expect(editor.getMarkdown().trim()).toBe('前 [链](https://new.b) 后')
    editor.destroy()
  })

  it('选中半条链接：也是整条换（extendMarkRange）', () => {
    const editor = make('[链接文字](https://old.a) 后\n')
    editor.commands.setTextSelection({ from: 2, to: 4 })
    expect(applyLink(editor, 'https://new.b')).toBe(true)
    expect(editor.getMarkdown().trim()).toBe('[链接文字](https://new.b) 后')
    editor.destroy()
  })

  it('移除链接', () => {
    const editor = make('前 [链](https://old.a) 后\n')
    editor.commands.setTextSelection(posOfText(editor, '链'))
    expect(removeLink(editor)).toBe(true)
    expect(editor.getMarkdown().trim()).toBe('前 链 后')
    editor.destroy()
  })

  it('不在链接里时读不到地址，也没有 link token', () => {
    const editor = make('一段文字\n')
    editor.commands.setTextSelection(posOfText(editor, '一段文字'))
    expect(currentLinkHref(editor)).toBeNull()
    expect(toolbarHas(toolbarStateOf(editor), 'link')).toBe(false)
    editor.destroy()
  })
})

describe('清除格式', () => {
  /**
   * 判据是「选中的范围里确实有标记」，不是命令的返回值——`unsetAllMarks`
   * 在空选区上直接返回 true 而什么都不改（`@tiptap/core` 里 `if (empty) return true`）。
   */
  it('空选区 / 没有格式的选区都不给这个能力', () => {
    const editor = make('一段文字\n')
    editor.commands.setTextSelection(posOfText(editor, '一段文字'))
    expect(toolbarHas(toolbarStateOf(editor), 'clear')).toBe(false)
    editor.commands.setTextSelection({ from: 1, to: 3 })
    expect(toolbarHas(toolbarStateOf(editor), 'clear')).toBe(false)
    editor.destroy()
  })

  it('选中带格式的文字才给，且真的全清（含链接）', () => {
    const editor = make('**粗** 与 [链](https://a.b)\n')
    editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 })
    expect(toolbarHas(toolbarStateOf(editor), 'clear')).toBe(true)
    expect(editor.chain().focus().unsetAllMarks().run()).toBe(true)
    expect(editor.getJSON().content?.[0]?.content?.every((node) => node.type === 'text')).toBe(true)
    expect(editor.getJSON().content?.[0]?.content?.every((node) => !node.marks)).toBe(true)
    editor.destroy()
  })

  it('方言里没有 mark 声明 clearable:false —— 所以清除是全清的', () => {
    const editor = make('**粗**\n')
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.chain().focus().unsetAllMarks().run()
    expect(editor.getMarkdown().trim()).toBe('粗')
    editor.destroy()
  })
})

describe('代码块语言', () => {
  it('候选从方言自己的 lowlight 读（common 那一套）', () => {
    const editor = make('```\n码\n```\n')
    const languages = codeLanguageOptions(editor)
    expect(languages.length).toBeGreaterThan(30)
    expect(languages).toContain('typescript')
    expect(languages).toContain('python')
    // 表里没有的东西不能被选（写了也没有语法去高亮它）
    expect(languages).not.toContain('ts')
    editor.destroy()
  })

  it('设语言 / 清除语言，markdown 跟着变', () => {
    const editor = make('```\n码\n```\n')
    editor.commands.setTextSelection(posOfText(editor, '码'))
    expect(currentCodeLanguage(editor)).toBeNull()
    expect(setCodeLanguage(editor, 'typescript')).toBe(true)
    expect(editor.getMarkdown().trim()).toBe('```typescript\n码\n```')
    expect(currentCodeLanguage(editor)).toBe('typescript')
    expect(setCodeLanguage(editor, null)).toBe(true)
    expect(editor.getMarkdown().trim()).toBe('```\n码\n```')
    editor.destroy()
  })
})

describe('表格', () => {
  /** 光标放进某个格子的文字里 */
  function cursorInCell(editor: Editor, text: string): void {
    editor.commands.setTextSelection(posOfText(editor, text))
  }

  it('插入表格可用（正文里）', () => {
    const editor = make('正文\n')
    cursorInCell(editor, '正文')
    expect(canInsertTable(editor)).toBe(true)
    editor.destroy()
  })

  it('表格里不能插表格（嵌套表格 markdown 表示不了）', () => {
    const inTable = make('| a |\n| --- |\n| 1 |\n')
    cursorInCell(inTable, '1')
    expect(canInsertTable(inTable)).toBe(false)
    inTable.destroy()
  })

  /**
   * 代码块里**可以**插：Tiptap 会把表格插到代码块**外面**的段落里
   * （实测 `"```\n码\n```\n\n\n| ..."`），正是用户想要的结果。
   */
  it('代码块里可以插（表格落在代码块外面）', () => {
    const inCode = make('```\n码\n```\n')
    cursorInCell(inCode, '码')
    expect(canInsertTable(inCode)).toBe(true)
    expect(
      inCode.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run(),
    ).toBe(true)
    expect(inCode.getMarkdown()).toContain('| --- | --- |')
    inCode.destroy()
  })

  /**
   * **列对齐必须改整列。**
   *
   * `setCellAttr` 对文本选区只改光标那一格，而 markdown 的列对齐一列只有一个
   * 值（写在表头下面那条分隔行上）。只改一格会当场产生两处不一致——实测：
   * 给正文行的一格设 center 之后，markdown 整列都是 `:---:`，而表头格的
   * `align` 仍是 `null`，界面接着读 `getAttributes('tableHeader').align`
   * 会说「没对齐」。
   */
  it('整列设置：表头格与所有正文格都变，markdown 与内存模型一致', () => {
    const editor = make('| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n')
    cursorInCell(editor, '1')
    expect(setColumnAlign(editor, 'center')).toBe(true)
    expect(editor.getMarkdown()).toContain('| :---: | --- |')
    // 表头格的属性也必须变了——否则界面读出来是「没对齐」
    expect(currentColumnAlign(editor)).toBe('center')
    editor.commands.undo()
    expect(editor.getMarkdown()).toContain('| --- | --- |')
    editor.destroy()
  })

  it('第二列只改第二列', () => {
    const editor = make('| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n')
    cursorInCell(editor, '2')
    expect(setColumnAlign(editor, 'right')).toBe(true)
    expect(editor.getMarkdown()).toContain('| --- | ---: | --- |')
    editor.destroy()
  })

  it('对齐清除回 null（分隔行回到光秃秃的三条杠）', () => {
    const editor = make('| a |\n| :---: |\n| 1 |\n')
    cursorInCell(editor, '1')
    expect(currentColumnAlign(editor)).toBe('center')
    expect(setColumnAlign(editor, null)).toBe(true)
    expect(editor.getMarkdown()).toContain('| --- |')
    expect(currentColumnAlign(editor)).toBeNull()
    editor.destroy()
  })

  it('往返保真：设过对齐的表格重新解析还是同一个对齐', () => {
    const editor = make('| a | b |\n| --- | --- |\n| 1 | 2 |\n')
    cursorInCell(editor, '1')
    setColumnAlign(editor, 'right')
    const markdown = editor.getMarkdown()
    editor.destroy()

    const again = make(markdown)
    again.commands.setTextSelection(posOfText(again, '1'))
    expect(currentColumnAlign(again)).toBe('right')
    expect(again.getMarkdown()).toBe(markdown)
    again.destroy()
  })

  it('不在表格里时整列设置返回 false', () => {
    const editor = make('正文\n')
    cursorInCell(editor, '正文')
    expect(setColumnAlign(editor, 'center')).toBe(false)
    expect(toolbarHas(toolbarStateOf(editor), 'table')).toBe(false)
    editor.destroy()
  })

  it('表格里：整组能力 token 都出现（含删除行列与切表头）', () => {
    const editor = make('| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n')
    cursorInCell(editor, '2')
    const state = toolbarStateOf(editor)
    expect(
      [
        'table',
        'rowBefore',
        'rowAfter',
        'colBefore',
        'colAfter',
        'delRow',
        'delCol',
        'delTable',
        'header',
      ].filter((token) => toolbarHas(state, token)),
    ).toEqual([
      'table',
      'rowBefore',
      'rowAfter',
      'colBefore',
      'colAfter',
      'delRow',
      'delCol',
      'delTable',
      'header',
    ])
    editor.destroy()
  })

  /**
   * `toggleHeaderRow` 的语义是「第一行在表头/正文之间切」，**不插入行**。
   * 文案与行为不一致的话，用户点一次「插入表头行」会发现表格少了一行表头。
   */
  it('切换表头行不改变行数', () => {
    const editor = make('| 甲 | 乙 |\n| --- | --- |\n| 丙 | 丁 |\n')
    const rowsBefore = editor.state.doc.firstChild?.childCount
    cursorInCell(editor, '甲')
    expect(editor.chain().focus().toggleHeaderRow().run()).toBe(true)
    expect(editor.state.doc.firstChild?.childCount).toBe(rowsBefore)
    // 第一行从表头变成正文格
    expect(editor.isActive('tableHeader')).toBe(false)
    editor.destroy()
  })
})

describe('工具条状态串', () => {
  it('token 是**精确匹配**的：codeBlock 里不该让「行内代码」亮起来', () => {
    const editor = make('```\n码\n```\n')
    editor.commands.setTextSelection(posOfText(editor, '码'))
    const state = toolbarStateOf(editor)
    expect(toolbarHas(state, 'codeBlock')).toBe(true)
    expect(toolbarHas(state, 'code')).toBe(false)
    editor.destroy()
  })

  it('撤销能力跟着历史栈走（不是文档状态）', () => {
    const editor = make('起始\n')
    expect(toolbarHas(toolbarStateOf(editor), 'undo')).toBe(false)
    editor.commands.setTextSelection(posOfText(editor, '起始'))
    editor.commands.insertContent('新')
    const state = toolbarStateOf(editor)
    expect(toolbarHas(state, 'undo')).toBe(true)
    editor.commands.undo()
    expect(toolbarHas(toolbarStateOf(editor), 'redo')).toBe(true)
    editor.destroy()
  })

  it('列表里 item token 与缩进能力同时给出', () => {
    const editor = make('- 一\n- 二\n')
    editor.commands.setTextSelection(posOfItem(editor, 'listItem', 1))
    const state = toolbarStateOf(editor)
    expect(toolbarHas(state, 'bullet')).toBe(true)
    expect(toolbarHas(state, 'item:listItem')).toBe(true)
    expect(toolbarHas(state, 'indent')).toBe(true)
    expect(toolbarHas(state, 'outdent')).toBe(true)
    editor.destroy()
  })

  it('空文档不炸（打开一篇新笔记的第一帧）', () => {
    const editor = make('')
    expect(() => toolbarStateOf(editor)).not.toThrow()
    expect(toolbarHas(toolbarStateOf(editor), 'undo')).toBe(false)
    editor.destroy()
  })

  it('段落与标题：style token 跟着光标走', () => {
    const editor = make('# 标题\n\n正文\n')
    editor.commands.setTextSelection(posOfText(editor, '标题'))
    expect(styleFromToolbarState(toolbarStateOf(editor))).toBe('h1')
    editor.commands.setTextSelection(posOfText(editor, '正文'))
    expect(styleFromToolbarState(toolbarStateOf(editor))).toBe('paragraph')
    editor.destroy()
  })
})

describe('形状：断言用的辅助', () => {
  it('shape 只用来排查失败（这里同时钉住它的用途）', () => {
    const editor = make('- 一\n')
    expect(shape(editor)).toEqual([
      'doc',
      '  bulletList',
      '    listItem',
      '      paragraph',
      '        text',
    ])
    editor.destroy()
  })
})
