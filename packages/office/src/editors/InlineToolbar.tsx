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
 * ## 为什么「改写 / 翻译 / 精简 / 扩写」保留但禁用
 *
 * 它们需要模型侧的内联改写能力（`docs/PRD.md` §4 M1），M0 还没有。
 * **保留但禁用并在 tooltip 里说明原因**，比直接删掉好：删掉会让用户找不到
 * 这个入口（以为产品不支持），而做得像能点却没反应是最坏的一种
 * （`docs/DESIGN.md` §7.4）。
 *
 * 「就这段提问」现在就能用：它把选中内容作为引用带进主视图对话，
 * 这是删掉 AI 侧栏后补的三件事之一（§5.5）。
 */

import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/core'
import { ToolbarButton, ToolbarDivider } from '../shell/EditorShell.js'

/** 需要模型侧能力、M0 还没有的四个动作 */
const REWRITE_ACTIONS = ['改写', '翻译', '精简', '扩写'] as const

export interface InlineToolbarProps {
  editor: Editor
  /** 「就这段提问」：把选中的话带进对话 */
  onAskAboutSelection: (passage: string) => void
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

export function InlineToolbar({ editor, onAskAboutSelection }: InlineToolbarProps) {
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
        {REWRITE_ACTIONS.map((action) => (
          <ToolbarButton
            key={action}
            label={`${action}需要模型侧的内联改写能力（M1）`}
            disabled
            onClick={() => {}}
          >
            {action}
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
