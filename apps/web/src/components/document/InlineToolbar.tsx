import { MessageOutlined } from '@ant-design/icons'
import type { Editor } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/react/menus'
import { Button, Divider, Tooltip } from 'antd'
import { createStyles } from 'antd-style'

/**
 * 内联工具条：选中正文后出现。
 *
 * ## 为什么用官方的 BubbleMenu
 *
 * 「浮在选区上方」看似简单，实际要做对四件事：跟随选区定位、滚动时重算、
 * 靠近视口边缘时翻转方向、点到工具条本身时不取消选区。
 * `BubbleMenu` 全都处理好了（它内部用 floating-ui）。
 * 自己算 `getBoundingClientRect` 会在长文滚动、换行选区、触屏这三个场景出错。
 *
 * ## 为什么又用 antd 的组件
 *
 * BubbleMenu 只负责**浮层的位置与显隐**，里面放什么由我们决定。
 * 所以按钮、分隔线都用 antd——它们是这套设计系统的控件，
 * 颜色、焦点环、禁用态、点击反馈都跟着 token 走。
 *
 * ## 五条动作的现状
 *
 * 「改写 / 翻译 / 精简 / 扩写」需要模型侧的内联改写能力（`docs/PRD.md`
 * §4 M1），M0 还没有。它们**保留但禁用**，并在 tooltip 里说明原因——
 * 直接删掉会让用户找不到这个入口，而做得像能点却没反应是最坏的一种。
 *
 * 「就这段提问」现在就能用：它把选中内容作为引用带进主视图对话，
 * 这是删掉 AI 侧栏后补的三件事之一（§5.5）。
 */

const REWRITE_ACTIONS = ['改写', '翻译', '精简', '扩写'] as const

const useStyles = createStyles(({ css, token }) => ({
  bar: css`
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 10px;
    background: ${token.colorBgElevated};
    box-shadow: ${token.boxShadowSecondary};
  `,
}))

export interface InlineToolbarProps {
  editor: Editor | null
  /** 「就这段提问」：把选中的话带进对话 */
  onAskAboutSelection: (passage: string) => void
}

export function InlineToolbar({ editor, onAskAboutSelection }: InlineToolbarProps) {
  const { styles } = useStyles()

  if (!editor) return null

  /**
   * 取当前选中的纯文本。
   *
   * 用 `state.doc.textBetween` 而不是 `window.getSelection()`：后者拿到的是
   * DOM 文本，会把块级元素之间的换行、列表标记、代码块的缩进都带进来。
   * 前者取的是文档模型的文本，正是我们要给模型看的东西。
   */
  const selectedText = () => {
    const { from, to } = editor.state.selection
    return editor.state.doc.textBetween(from, to, '\n').trim()
  }

  return (
    <BubbleMenu
      editor={editor}
      /**
       * 只在一段非空选区上出现。
       *
       * `from !== to` 排除光标（没有选中任何东西）；
       * 长度 < 2 排除误触（点一下就弹出工具条很吵）。
       */
      shouldShow={({ editor: instance, from, to }) =>
        from !== to && to - from > 1 && !instance.isActive('codeBlock') && instance.isEditable
      }
      options={{ placement: 'top', offset: 8 }}
    >
      <div className={styles.bar}>
        {REWRITE_ACTIONS.map((action) => (
          <Tooltip key={action} title={`${action}需要模型侧的内联改写能力（M1）`}>
            {/* antd 的 Tooltip 需要一个能接收 ref 的子元素才显示禁用原因 */}
            <Button size="small" type="text" disabled>
              {action}
            </Button>
          </Tooltip>
        ))}

        <Divider type="vertical" style={{ margin: '0 4px' }} />

        <Button
          size="small"
          type="text"
          icon={<MessageOutlined />}
          // onMouseDown 阻止默认行为，否则点按钮会先让编辑区失焦、
          // 选区被清空，我们就读不到选中的内容了
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onAskAboutSelection(selectedText())}
        >
          就这段提问
        </Button>
      </div>
    </BubbleMenu>
  )
}
