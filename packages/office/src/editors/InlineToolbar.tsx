/**
 * 选区工具条：选中一段文字后浮出。
 *
 * ## 为什么在包里（而不是宿主用 render-prop 注入）
 *
 * 它需要**编辑器实例**才能读选区，而实例由这个包的 `MarkdownEditor` 持有。
 * 之前它作为 `selectionToolbar: (editor) => ReactNode` 注入，结果是宿主每次
 * 渲染都新建一个组件类型 → React 把旧的卸载、新的挂载 → 浮层状态丢失；
 * 而 lint 会报 `no-unstable-nested-components`（这条报得对）。
 *
 * 换成「宿主给一个回调、包自己渲染工具条」，两个问题一起消失：
 * 组件类型稳定，且实例不外泄。
 *
 * ## 「改写 / 翻译 / 精简 / 扩写」由宿主注入（M1-D）
 *
 * 这四项需要模型侧的内联改写能力，M1-D 落了地。实现方式与「就这段提问」
 * 完全一致：**宿主给一个回调**（`onRewrite`），包自己不碰网络——
 * 它不知道 `api` 是什么、也不知道模型配在哪。
 *
 * 代价是四个按钮在**没有回调时**要保留但禁用（M0 的行为）：删掉会让
 * 用户找不到这个入口（以为产品不支持），而做得像能点却没反应是最坏的一种
 * （`docs/DESIGN.md` §7.4）。
 *
 * ## 为什么结果要替换选区，而不是弹出显示
 *
 * 改写的用处是「换掉这段文字」。弹一个面板显示结果会让用户多做一次
 * 复制粘贴，而那正是这个功能要省掉的事。所以回调返回新文本时，
 * **直接替换选区**——这是唯一让「选中 → 改写」成为一个完整动作的做法。
 *
 * 替换走 Tiptap 的 `insertContent`：它经过 schema 校验（不会把 HTML
 * 注入文档），且自动进入 undo 栈（用户能 Ctrl+Z 撤销，这很重要——
 * 模型改坏了要能一键回到原文）。
 */

import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/core'
import { ToolbarButton, ToolbarDivider } from '../shell/EditorShell.js'

/** 内联改写的四个动作。key 与服务端契约的 `rewriteActionSchema` 一一对应 */
const REWRITE_ACTIONS = [
  { label: '改写', action: 'rewrite' },
  { label: '翻译', action: 'translate' },
  { label: '精简', action: 'shorten' },
  { label: '扩写', action: 'expand' },
] as const

export type RewriteActionName = (typeof REWRITE_ACTIONS)[number]['action']

export interface InlineToolbarProps {
  editor: Editor
  /** 「就这段提问」：把选中的话带进对话 */
  onAskAboutSelection: (passage: string) => void
  /**
   * 内联改写。返回改写后的文本，由这里替换掉选区。
   *
   * **成功时返回文本、失败时抛错**：把「显示错误」留给宿主（它才知道
   * 该怎么提示用户），这里只负责「拿到文本就替换」这一件事。
   */
  onRewrite?: (text: string, action: RewriteActionName) => Promise<string | null>
  /** 正在改写（按钮转 loading，防连点） */
  rewriting?: boolean
}

/**
 * 取当前选中的纯文本。
 *
 * 用 `state.doc.textBetween` 而不是 `window.getSelection()`：后者拿到的是
 * DOM 文本，会把块级元素之间的换行、列表标记、代码块的缩进都带进来。
 * 前者取的是文档模型的文本，正是要给模型看的东西。
 */
function selectedTextOf(editor: Editor): string {
  const { from, to } = editor.state.selection
  return editor.state.doc.textBetween(from, to, '\n').trim()
}

export function InlineToolbar({
  editor,
  onAskAboutSelection,
  onRewrite,
  rewriting = false,
}: InlineToolbarProps) {
  /**
   * 替换选区。
   *
   * `insertContent` 而不是 `setContent`：前者只动选区、经过 schema 校验、
   * 且进 undo 栈。`setContent` 会整篇重写（把光标位置、历史全丢掉），
   * 那对一个「改一段」的动作来说是灾难。
   */
  const replaceSelection = (text: string): void => {
    editor.chain().focus().insertContent(text).run()
  }

  return (
    <BubbleMenu
      editor={editor}
      /**
       * 只在一段非空选区上出现。
       *
       * `from !== to` 排除光标（没有选中任何东西）；长度 < 2 排除误触
       * （点一下就弹出工具条很吵）。代码块里也不出现——那里的选区是
       * 编辑代码用的，浮一个格式条会挡住内容。
       */
      shouldShow={({ editor: instance, from, to }) =>
        from !== to && to - from > 1 && !instance.isActive('codeBlock') && instance.isEditable
      }
      options={{ placement: 'top', offset: 8 }}
    >
      <div className="mimir-inline-bar">
        {REWRITE_ACTIONS.map(({ label, action }) => (
          <ToolbarButton
            key={action}
            label={
              onRewrite ? `${label}（选中这一段，交给模型）` : `${label}需要先在设置里配置模型`
            }
            /* 没有回调时禁用并在 tooltip 里说明原因——见文件头注释 */
            disabled={!onRewrite || rewriting}
            onClick={() => {
              if (!onRewrite) return
              const passage = selectedTextOf(editor)
              if (passage === '') return
              void onRewrite(passage, action).then((next) => {
                // null = 宿主已经处理过（例如弹了「没配模型」的提示）。
                // 不替换、也不报错——这里没有「失败」这个概念
                if (next !== null) replaceSelection(next)
              })
            }}
          >
            {label}
          </ToolbarButton>
        ))}

        <ToolbarDivider />

        {/*
          `onMouseDown` 阻止默认行为由 `ToolbarButton` 统一处理——点按钮会让
          编辑区失焦、选区被清掉，那样就读不到选中的内容了
        */}
        <ToolbarButton
          label="就这段提问"
          onClick={() => onAskAboutSelection(selectedTextOf(editor))}
        >
          就这段提问
        </ToolbarButton>
      </div>
    </BubbleMenu>
  )
}
