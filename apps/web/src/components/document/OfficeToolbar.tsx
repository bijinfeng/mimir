import {
  BoldOutlined,
  ItalicOutlined,
  OrderedListOutlined,
  StrikethroughOutlined,
  UnorderedListOutlined,
  UnderlineOutlined,
} from '@ant-design/icons'
import type { Editor } from '@tiptap/core'
import { Button, Divider, Tooltip } from 'antd'
import { createStyles } from 'antd-style'

/**
 * Office 编辑器的工具栏。
 *
 * ## 为什么是顶栏而不是气泡
 *
 * 笔记编辑器（`InlineToolbar`）用气泡菜单——它跟随选区，适合「写完再调格式」。
 * Word 的习惯是**顶栏常驻**，理由不同：Office 文档的格式是**边写边调**的
 * （对齐、列表、行距），而且要能一眼看到当前光标处的格式状态。用气泡的话
 * 每次都要先选中才看得到工具。
 *
 * 两者的按钮实现是同一套（`editor.chain().focus()...`），只是容器不同。
 *
 * ## 命令必须用 `toggleMark('bold')` 而不是 `toggleBold()`
 *
 * **踩过**：`toggleBold()` / `toggleItalic()` 这些是 `@tiptap/extension-bold`
 * 之类的**扩展提供的便捷命令**，而 vendored 的编辑器没有用那些扩展——
 * 它自己定义了 `BoldMark = Mark.create({ name: 'bold' })`（见 `editor/marks.ts`），
 * 并只注册了 `commands.toggleMark('bold')`。
 *
 * 所以调 `toggleBold()` 是**静默无效**：命令不存在，`chain()` 照样返回成功，
 * 只是什么都不做。实测症状是「点了加粗，没有反应，也不报错」。
 *
 * ## 列表：不能调 `toggleList`，要自己改节点
 *
 * 这份编辑器的列表**不是标准的「listItem 嵌在 bulletList 里」结构**，
 * 而是**扁平的块节点** `docListItem`（`group: 'block'`，带 `kind` 与 `numId`
 * 属性，见 `editor/extensions.ts`）。它这么设计是为了对应 docx 的真实形状
 * （段落 + `w:numPr` 引用 numbering.xml 的编号定义）。
 *
 * 所以：
 *   - `toggleList('bulletList', 'listItem')` 在这里**没有对应节点**，调了无效
 *   - 正确做法是改节点类型与 `kind`/`numId` 属性
 *
 * `numId` 从**光标处已有的列表项**取（同一份文档里的列表通常共用一个编号
 * 定义）。取不到就不带 numId——它仍然是一个「缩进的块」，只是没有标记符号；
 * 这比画一个点了没反应的按钮诚实（`docs/DESIGN.md` §7.4 的规矩）。
 */
export interface OfficeToolbarProps {
  editor: Editor | null
  disabled?: boolean
}

const useStyles = createStyles(({ css, token }) => ({
  bar: css`
    display: flex;
    align-items: center;
    gap: 2px;
    flex-wrap: wrap;
    padding: 4px 2px;
    margin-bottom: 8px;
  `,
  /* 激活态用主色底：Word 的工具栏也是「按下去」的样子 */
  active: css`
    && {
      background: ${token.colorPrimaryBg};
      color: ${token.colorPrimary};
    }
  `,
}))

export function OfficeToolbar({ editor, disabled = false }: OfficeToolbarProps) {
  const { styles, cx } = useStyles()
  if (!editor) return null

  const active = (name: string): boolean => editor.isActive(name)

  /**
   * 每个按钮都是「聚焦编辑器 → 执行命令」：不聚焦的话第一次点击只移动
   * 焦点、命令作用不到选区。
   *
   * **一定要 `.run()`**：链式调用是惰性的，不 run 等于没写。
   */
  const run = (fn: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>): void => {
    fn(editor.chain().focus()).run()
  }

  /** 光标处的列表类型（不在列表里返回 null） */
  const currentKind = (): 'bullet' | 'ordered' | null => {
    const attrs = editor.getAttributes('docListItem')
    if (!attrs || Object.keys(attrs).length === 0) return null
    return (attrs.kind as 'bullet' | 'ordered') ?? 'bullet'
  }

  /**
   * 切换光标所在块的列表类型。
   *
   * 三种情况：
   *   1. 已是同类列表 → 变回普通段落（再点一次取消）
   *   2. 已是另一类列表 → 只改 `kind`
   *   3. 普通块 → 换成 `docListItem`，`numId` 沿用文档里已有的同类列表
   *
   * `numId` 沿用而不是新建：新建要在 numbering.xml 里分配定义，那是**保存
   * 路径**的事（`allocateListNumId` 在上游的 host 侧，未 vendored）。
   * 沿用时新项与已有列表共享编号，符合 Word 的直觉（连续编号）。
   */
  const toggleList = (kind: 'bullet' | 'ordered'): void => {
    const { state } = editor
    const { $from } = state.selection
    const node = $from.parent

    if (node.type.name === 'docListItem') {
      const current = (node.attrs.kind as string) ?? 'bullet'
      if (current === kind) {
        // 再点一次取消：变回普通段落
        run((c) => c.setNode('docParagraph', { ...node.attrs, kind: null, numId: null }))
      } else {
        run((c) => c.updateAttributes('docListItem', { kind }))
      }
      return
    }

    // 普通块 → 列表项。numId 从文档里已有的同类列表找
    const numId = findExistingNumId(kind)
    run((c) =>
      c.setNode('docListItem', {
        ...node.attrs,
        kind,
        numId,
        ilvl: 0,
      }),
    )
  }

  /** 文档里第一个同类列表项的 numId（没有则 null） */
  const findExistingNumId = (kind: 'bullet' | 'ordered'): string | null => {
    let found: string | null = null
    editor.state.doc.descendants((node) => {
      if (found !== null) return false
      if (node.type.name !== 'docListItem') return true
      if (((node.attrs.kind as string) ?? 'bullet') !== kind) return true
      const id = node.attrs.numId as string | null
      if (id) found = id
      return found === null
    })
    return found
  }

  const items = [
    {
      key: 'bold',
      icon: <BoldOutlined />,
      label: '加粗 (Ctrl+B)',
      isOn: active('bold'),
      on: () => run((c) => c.toggleMark('bold')),
    },
    {
      key: 'italic',
      icon: <ItalicOutlined />,
      label: '倾斜 (Ctrl+I)',
      isOn: active('italic'),
      on: () => run((c) => c.toggleMark('italic')),
    },
    {
      key: 'underline',
      icon: <UnderlineOutlined />,
      label: '下划线 (Ctrl+U)',
      isOn: active('underline'),
      on: () => run((c) => c.toggleMark('underline')),
    },
    {
      key: 'strike',
      icon: <StrikethroughOutlined />,
      label: '删除线',
      isOn: active('strike'),
      on: () => run((c) => c.toggleMark('strike')),
    },
    { divider: true, key: 'd1' },
    {
      key: 'bulletList',
      icon: <UnorderedListOutlined />,
      label: '项目符号列表',
      isOn: active('docListItem') && currentKind() === 'bullet',
      on: () => toggleList('bullet'),
    },
    {
      key: 'orderedList',
      icon: <OrderedListOutlined />,
      label: '编号列表',
      isOn: active('docListItem') && currentKind() === 'ordered',
      on: () => toggleList('ordered'),
    },
  ] as const

  return (
    <div className={styles.bar}>
      {items.map((item) =>
        'divider' in item ? (
          <Divider key={item.key} type="vertical" />
        ) : (
          <Tooltip key={item.key} title={item.label}>
            <Button
              type="text"
              size="small"
              icon={item.icon}
              disabled={disabled}
              className={cx(item.isOn ? styles.active : undefined)}
              /* 用 onMouseDown + preventDefault：按下按钮时不让编辑器失焦，
                 否则选区会先被清掉，加粗作用不到它（Word 也是这样） */
              onMouseDown={(event) => {
                event.preventDefault()
                if (!disabled) item.on()
              }}
            />
          </Tooltip>
        ),
      )}
    </div>
  )
}
