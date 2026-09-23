import { createStyles } from 'antd-style'
import { CONTENT_WIDTH } from '@/theme/tokens'

/**
 * 笔记编辑器的样式。
 *
 * **正文排版与保存状态都不在这里**：
 *
 *  - 正文排版与只读视图共用 `components/ContentTypography.style.ts`
 *    （两个视图都让 Tiptap 渲染同一份 Markdown，排版必须同源）
 *  - 保存状态显示在 `DocumentPanel` 的工具条上——它原先渲染在正文上方
 *    标题与元信息之间，一块只有三个字的独立行，两侧都空且位置会跳
 *
 * 这个文件只管编辑器自己的两件事：内容列宽度，以及让「正文下方那片空白」
 * 也能落笔的书写区高度。
 */
export const useStyles = createStyles(({ css }) => {
  return {
    shell: css`
      max-width: ${CONTENT_WIDTH}px;
    `,
    /**
     * 书写区（EditorContent 的挂载点）。
     *
     * **`min-height` 不是装饰，它决定「点空白处也能继续写」**。
     * ProseMirror 的高度默认等于内容高度，所以一篇三行笔记的编辑区只有
     * 约 98px，而可见的正文列高约 900px——下面 800px 是**死区**，
     * 点上去什么都不发生（实测：点击后 `activeElement` 是 `body`）。
     * 记笔记最常见的一步就是「打开 → 在末尾接着写」，那一击落空很败好感。
     *
     * 给到 46vh 之后，这一片空白的点击会落在编辑区里，Tiptap 把光标放到
     * 最近的文字位置——即末尾，这是所有编辑器的一致行为。
     *
     * 只给编辑态、不给只读态：只读视图里撑出这么一片空白没有意义。
     */
    body: css`
      .ProseMirror {
        min-height: 46vh;

        /*
         * 焦点环。**:focus-visible 在这里不够用**：正文是 contenteditable，
         * 而规范规定文本输入类元素的 :focus-visible **永远匹配**（浏览器
         * 无法假定用户接下来用键盘还是鼠标）。实测鼠标点进正文也会拿到一圈
         * 原生环 outline: auto 1px rgb(16,16,16)，围着整个编辑区——
         * 而点进正文是几乎每次编辑都会做的事，这圈环成了常驻噪声。
         *
         * --mimir-focus-ring-style 由 lib/input-modality.ts 按**最近一次
         * 输入方式**切换：鼠标是 none、键盘是 solid。于是「键盘用户看得见焦点」
         * （DESIGN §7.2，不移除焦点可见性）与「鼠标用户看不到一圈黑框」同时成立。
         *
         * **颜色必须在这里写、不能塞进那个变量**：自定义属性里的 var() 在
         * 声明它的元素（html）上求值，而 --ant-* 注入在 antd 组件子树上，
         * html 上取不到 → 整个值无效 → outline 退回 none，键盘焦点环静默消失
         * （实测过）。写在这里就能拿到，因为 ProseMirror 在 .mimir 子树里。
         *
         * 颜色用浅蓝（colorPrimaryBorder #91caff）而不是主色：正文区很大，
         * 主色的环会比内容本身更抢眼。
         */
        outline-style: var(--mimir-focus-ring-style, none);
        outline-width: 2px;
        outline-color: var(--ant-color-primary-border);
        outline-offset: 3px;
        border-radius: 4px;
      }
    `,
  }
})
