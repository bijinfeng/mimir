// @vitest-environment happy-dom

/**
 * 工具条上的每一个动作**真的落到模型上**。
 *
 * 守的都是静默失效：命令不存在时 `chain().run()` 照样返回 true，只是什么都
 * 不做——界面上「点了没反应，也不报错」。所以这里的断言一律**看模型变了什么**，
 * 不看命令的返回值（那正是会说谎的那个）。
 *
 * 表格那一批另有一个坑：`prosemirror-tables` 的命令签名是 `(state, dispatch)`，
 * 直接塞进链里会抛 `Cannot read properties of undefined`。这里把链式调用整条
 * 走一遍（`runTableCommand` 的那一层），确认它们真的执行了。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import type { Command } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import {
  addColumnAfter,
  addRowAfter,
  deleteRow,
  isInTable,
  mergeCells,
  selectedRect,
  setCellAttr,
  splitCell,
} from '@tiptap/pm/tables'
import { CellSelection } from '@tiptap/pm/tables'
import { editorExtensions } from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import {
  setParagraphDirection,
  setSelectionAlign,
} from '../../vendor/apps/docs/src/renderer/editor/direction.js'
import { insertPageBreak } from '../../vendor/apps/docs/src/renderer/editor/page-break.js'
import { moveBlocks } from '../../vendor/apps/docs/src/renderer/editor/move-block.js'
import {
  acceptAllRevisions,
  collectRevisions,
  rejectAllRevisions,
} from '../../vendor/apps/docs/src/renderer/editor/revisions.js'
import { openDocx } from '../docx.js'
import { runCommand } from '../shell/editor-commands.js'

const FIXTURE = join(
  import.meta.dirname,
  '../../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
)

async function makeEditor(): Promise<Editor> {
  const session = await openDocx(new Uint8Array(readFileSync(FIXTURE)))
  return new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: session.content as never,
  })
}

/** 顶层第一个某类型节点的位置（表格这类块的定位） */
function findTop(editor: Editor, type: string): number {
  let found = -1
  editor.state.doc.forEach((node, offset) => {
    if (found === -1 && node.type.name === type) found = offset
  })
  return found
}

/**
 * 与 `runTableCommand` 同一条通路（那个函数没导出，这里复刻它的那一层）。
 *
 * 这一层是**必需**的：`prosemirror-tables` 的命令签名是
 * `(state, dispatch?)`，而 Tiptap 的链把每一步当 `(props)` 调用——直接塞进去
 * 会抛 `Cannot read properties of undefined`。这里的类型也是同一件事的表达：
 * `Command` 就是 `(state, dispatch?) => boolean`。
 */
function tableCommand(editor: Editor, command: Command): boolean {
  return runCommand(editor, 'command', (props: { state: EditorState; dispatch?: () => void }) =>
    command(props.state, props.dispatch as ((tr: Transaction) => void) | undefined),
  )
}

describe('段落样式', () => {
  it('正文 → 标题 N → 正文，走 setNode', async () => {
    const editor = await makeEditor()
    const at = findTop(editor, 'docParagraph')
    editor.commands.setTextSelection(at + 1)

    editor.chain().focus().setNode('docHeading', { level: 2 }).run()
    expect(editor.isActive('docHeading', { level: 2 })).toBe(true)
    expect(editor.isActive('docParagraph')).toBe(false)

    editor.chain().focus().setNode('docParagraph').run()
    expect(editor.isActive('docParagraph')).toBe(true)
    editor.destroy()
  })

  it('引用是直接段落格式：左侧边线 + 左缩进，且可逆', async () => {
    const editor = await makeEditor()
    const at = findTop(editor, 'docParagraph')
    editor.commands.setTextSelection(at + 1)

    editor
      .chain()
      .focus()
      .setNode('docParagraph', {
        borders: 'l',
        borderLines: JSON.stringify({ l: { color: 'BFBFBF', szPt: 2, spacePt: 12 } }),
        indentLeft: 360,
      })
      .run()
    expect(editor.getAttributes('docParagraph').borders).toBe('l')
    expect(editor.getAttributes('docParagraph').indentLeft).toBe(360)

    // 解除：只清那三项，段落还是段落
    editor
      .chain()
      .focus()
      .setNode('docParagraph', { borders: null, borderLines: null, indentLeft: null })
      .run()
    expect(editor.getAttributes('docParagraph').borders).toBeNull()
    editor.destroy()
  })
})

describe('字号', () => {
  it('setMark 写的是半磅，读回来一致', async () => {
    const editor = await makeEditor()
    editor.commands.setTextSelection({ from: 2, to: 5 })
    editor.chain().focus().setMark('docTextStyle', { sizeHalfPoints: 28 }).run()
    expect(editor.getAttributes('docTextStyle').sizeHalfPoints).toBe(28)
    editor.destroy()
  })

  it('没有直接字号时读出来是 undefined —— 工具条据此禁用增减按钮', async () => {
    const editor = await makeEditor()
    editor.commands.setTextSelection({ from: 2, to: 5 })
    // 先清掉，再读
    editor.chain().focus().unsetMark('docTextStyle').run()
    const current = editor.getAttributes('docTextStyle').sizeHalfPoints
    // `undefined ± 2` 是 NaN：这就是必须兜底的原因，断言它确实不是有限数
    expect(Number.isFinite(current)).toBe(false)
    editor.destroy()
  })
})

describe('对齐与文字方向', () => {
  it('四种对齐都落到 align 上；justify 存的是 "justify"', async () => {
    const editor = await makeEditor()
    const at = findTop(editor, 'docParagraph')
    editor.commands.setTextSelection(at + 1)
    for (const value of ['center', 'right', 'justify'] as const) {
      setSelectionAlign(editor, value)
      expect(editor.getAttributes('docParagraph').align).toBe(value)
    }
    // 左对齐在 LTR 段落上是「清掉属性」（null = start）
    setSelectionAlign(editor, 'left')
    expect(editor.getAttributes('docParagraph').align).toBeNull()
    editor.destroy()
  })

  it('RTL / LTR 切换 bidi', async () => {
    const editor = await makeEditor()
    const at = findTop(editor, 'docParagraph')
    editor.commands.setTextSelection(at + 1)
    setParagraphDirection(editor, 'rtl')
    expect(editor.getAttributes('docParagraph').bidi).toBe(true)
    setParagraphDirection(editor, 'ltr')
    expect(editor.getAttributes('docParagraph').bidi).toBe(false)
    editor.destroy()
  })
})

describe('分页符与段落移动', () => {
  it('段中插分页符：后半段拿到 pageBreakBefore', async () => {
    const editor = await makeEditor()
    const at = findTop(editor, 'docParagraph')
    // 光标放在段中间（不是段首）——那条路是 splitBlock + 给后半段打属性
    editor.commands.setTextSelection(at + 3)
    expect(insertPageBreak(editor)).toBe(true)
    let hits = 0
    editor.state.doc.forEach((node) => {
      if (node.attrs.pageBreakBefore === true) hits += 1
    })
    expect(hits).toBeGreaterThan(0)
    editor.destroy()
  })

  it('上移/下移真的换了块序，且到边界时返回 false', async () => {
    const editor = await makeEditor()
    const order = (): string[] => {
      const names: string[] = []
      editor.state.doc.forEach((node) => names.push(node.type.name))
      return names
    }
    // 第一块上移：没有邻居，什么都不该发生
    editor.commands.setTextSelection(1)
    const before = order()
    expect(moveBlocks(editor, -1)).toBe(false)
    expect(order()).toEqual(before)

    // 往后站一块再上移，顺序必须真的变了
    editor.commands.setTextSelection(findTop(editor, 'docParagraph') + 1)
    const middle = order()
    expect(moveBlocks(editor, -1)).toBe(true)
    expect(order()).not.toEqual(middle)
    editor.destroy()
  })
})

describe('表格', () => {
  async function inTable(): Promise<Editor> {
    const editor = await makeEditor()
    const at = findTop(editor, 'docTable')
    // 进第一个格子的文本位置
    editor.commands.setTextSelection(at + 4)
    expect(isInTable(editor.state)).toBe(true)
    return editor
  }

  it('增删行列走包一层的通路，确实改了 TableMap', async () => {
    const editor = await inTable()
    const size = (): string => {
      const rect = selectedRect(editor.state)
      return `${rect.map.height}x${rect.map.width}`
    }
    const before = size()
    expect(tableCommand(editor, addRowAfter)).toBe(true)
    expect(size()).not.toBe(before)
    expect(tableCommand(editor, addColumnAfter)).toBe(true)
    expect(size()).not.toBe(before)
    const grown = size()
    expect(tableCommand(editor, deleteRow)).toBe(true)
    expect(size()).not.toBe(grown)
    editor.destroy()
  })

  it('单元格底纹走 setCellAttr(fill)，属性真的落上', async () => {
    const editor = await inTable()
    expect(tableCommand(editor, setCellAttr('fill', 'DEEAF6'))).toBe(true)
    expect(editor.getAttributes('docTableCell').fill).toBe('DEEAF6')
    editor.destroy()
  })

  it('合并 / 拆分：先选中两个格合并，再拆回两格', async () => {
    const editor = await inTable()
    const rect = selectedRect(editor.state)
    /*
     * 造一个跨两格的 `CellSelection` —— 与用户拖选两个单元格**同一个形状**。
     * 用事务直接设，而不是某个命令：这份编辑器没有注册
     * `setCellSelection`（那是 `@tiptap/extension-table` 提供的，未 vendored）。
     * 这也正是合并按钮的判据（`selection instanceof CellSelection`）——
     * 普通文字选区下 `mergeCells` 返回 false，按钮应当是禁用的。
     */
    const anchor = rect.tableStart + 1
    const firstRow = editor.state.doc.nodeAt(rect.tableStart - 1)?.child(0)
    const secondCell = (firstRow?.child(0)?.nodeSize ?? 0) + 1
    editor.view.dispatch(
      editor.state.tr.setSelection(
        CellSelection.create(editor.state.doc, anchor, rect.tableStart + secondCell),
      ),
    )
    expect(editor.state.selection).toBeInstanceOf(CellSelection)
    expect(tableCommand(editor, mergeCells)).toBe(true)
    expect(editor.getAttributes('docTableCell').colspan).toBe(2)

    expect(tableCommand(editor, splitCell)).toBe(true)
    expect(Number(editor.getAttributes('docTableCell').colspan) || 1).toBe(1)
    editor.destroy()
  })

  it('普通文字选区下合并返回 false —— 工具条据此禁用并说明原因', async () => {
    const editor = await inTable()
    expect(editor.state.selection).not.toBeInstanceOf(CellSelection)
    expect(tableCommand(editor, mergeCells)).toBe(false)
    editor.destroy()
  })

  it('行高 / 重复标题行 / 垂直对齐 / 自动调整：属性都落上', async () => {
    const editor = await inTable()
    editor
      .chain()
      .focus()
      .updateAttributes('docTableRow', { heightTwips: 800, heightRule: 'atLeast' })
      .run()
    expect(editor.getAttributes('docTableRow').heightTwips).toBe(800)
    expect(editor.getAttributes('docTableRow').heightRule).toBe('atLeast')

    // repeatHeaderEdited 不能省：保存路径只在它被显式改过时才写回 trPr
    editor
      .chain()
      .focus()
      .updateAttributes('docTableRow', { repeatHeader: true, repeatHeaderEdited: true })
      .run()
    expect(editor.getAttributes('docTableRow').repeatHeader).toBe(true)
    expect(editor.getAttributes('docTableRow').repeatHeaderEdited).toBe(true)

    editor.chain().focus().updateAttributes('docTableCell', { vAlign: 'center' }).run()
    expect(editor.getAttributes('docTableCell').vAlign).toBe('center')

    editor
      .chain()
      .focus()
      .updateAttributes('docTable', { tblAutoFit: 'contents', tblAutoFitEdited: true })
      .run()
    expect(editor.getAttributes('docTable').tblAutoFit).toBe('contents')
    expect(editor.getAttributes('docTable').tblAutoFitEdited).toBe(true)

    // cellMar 在 tableStructureSignature 里（convert.ts:1023-1024）——真的能落盘
    editor
      .chain()
      .focus()
      .updateAttributes('docTable', { cellMar: { top: 60, left: 108 }, cellMarEdited: true })
      .run()
    expect(editor.getAttributes('docTable').cellMar).toEqual({ top: 60, left: 108 })
    editor.destroy()
  })
})

describe('修订', () => {
  it('trackChanges 开关在 storage 上，打开后插入会记成 w:ins', async () => {
    const editor = await makeEditor()
    const storage = editor.storage as unknown as { trackChanges: { enabled: boolean } }
    expect(storage.trackChanges.enabled).toBe(false)
    storage.trackChanges.enabled = true

    editor.chain().focus().setTextSelection(2).insertContent('新').run()
    expect(collectRevisions(editor.state.doc).length).toBeGreaterThan(0)

    acceptAllRevisions(editor)
    expect(collectRevisions(editor.state.doc)).toHaveLength(0)
    expect(editor.state.doc.textContent).toContain('新')
    editor.destroy()
  })

  it('rejectAll 之后原文回来、新增的字没了', async () => {
    const editor = await makeEditor()
    const storage = editor.storage as unknown as { trackChanges: { enabled: boolean } }
    storage.trackChanges.enabled = true
    const before = editor.state.doc.textContent
    editor.chain().focus().setTextSelection(2).insertContent('临时').run()
    rejectAllRevisions(editor)
    expect(editor.state.doc.textContent).toBe(before)
    editor.destroy()
  })
})

describe('拼写检查', () => {
  it('setOptions 真的把 spellcheck 写到 contenteditable 元素上', async () => {
    const editor = await makeEditor()
    editor.setOptions({ editorProps: { attributes: { spellcheck: 'true' } } })
    expect(editor.view.dom.getAttribute('spellcheck')).toBe('true')
    editor.setOptions({ editorProps: { attributes: { spellcheck: 'false' } } })
    expect(editor.view.dom.getAttribute('spellcheck')).toBe('false')
    editor.destroy()
  })
})

describe('撤销 / 重做', () => {
  it('undo / redo 命令存在，且撤销栈跟着改动走', async () => {
    const editor = await makeEditor()
    expect(typeof (editor.chain() as unknown as Record<string, unknown>).undo).toBe('function')
    expect(typeof (editor.chain() as unknown as Record<string, unknown>).redo).toBe('function')
    editor.chain().focus().setTextSelection({ from: 2, to: 5 }).insertContent('X').run()
    expect(editor.can().undo()).toBe(true)
    editor.commands.undo()
    expect(editor.can().redo()).toBe(true)
    editor.destroy()
  })
})

describe('清除格式', () => {
  it('段落那一半逐类型写：标题上也清得掉（只写 docParagraph 时标题什么都不发生）', async () => {
    const editor = await makeEditor()
    // 在**标题**上试——这正是「只写 docParagraph」会静默失败的那一格
    const headingAt = findTop(editor, 'docHeading')
    editor.commands.setTextSelection(headingAt + 1)
    editor
      .chain()
      .focus()
      .updateAttributes('docHeading', { align: 'center', indentLeft: 720 })
      .run()
    expect(editor.getAttributes('docHeading').align).toBe('center')

    // 只写 docParagraph：标题不受影响（这就是必须逐类写的原因）
    editor.chain().focus().updateAttributes('docParagraph', { align: null, indentLeft: null }).run()
    expect(editor.getAttributes('docHeading').align).toBe('center')

    // 逐类写：生效
    for (const name of ['docHeading', 'docListItem', 'docParagraph']) {
      editor.chain().focus().updateAttributes(name, { align: null, indentLeft: null }).run()
    }
    expect(editor.getAttributes('docHeading').align).toBeNull()
    editor.destroy()
  })
})
