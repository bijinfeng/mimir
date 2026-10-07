import { createStyles } from 'antd-style'

/**
 * 代码块的样式（`CodeBlock.tsx` 的那一头一尾）。
 *
 * ## 为什么要在这里写「祖先 + pre」而不是在面板的 thread 里
 *
 * 正文对 `pre` 的通用样式写在 `ChatPanel.style.ts` 的 `[data-role='assistant']`
 * 块里（底色、边框、圆角、内边距——那是 markdown 正文的排版）。代码块的
 * **框架**要把上下两条圆角接起来，所以要盖掉其中几条。
 *
 * CSS 的胜负按**特异性**算：面板那条是 `[data-role='assistant'] pre`
 * （一个属性 + 一个元素）。这里两条选择器都是「属性 + 属性 + 元素」，
 * 数得比它多，所以在**任何顺序下**都赢——不必依赖样式注入的顺序
 * （那是最脆的一种依赖：注入顺序由 emotion 的插入时机决定，改了别处
 * 的组件就变）。
 *
 * 反过来说：如果把这两条写成「框架类里的 `pre`」（只有一个类 + 元素），
 * 特异性就**低于**面板那条，规则静默失效——症状是代码块顶部多一条边、
 * 圆角接不上，而控制台里什么都没有。
 *
 * ## 框架为什么用 `data-code-frame` 字面属性
 *
 * 它要能被上面那两条选择器命中，而那些选择器是**跨文件**写的
 * （`ChatPanel.style.ts` 的 thread 里没有这个包的哈希类名）。字面属性是
 * 「跨文件的选择器钩子」——与 `apps/web` 里 `.kb-card` 那条先例同一性质
 * （antd-style 的哈希类挂不上字面的后代选择器）。
 */
export const useCodeBlockStyles = createStyles(({ css, token }) => ({
  /* 框架本体：只负责它自己的外边距与「头 + pre 是一组」这件事。
     pre 的几条覆盖写在下面那个块里（那里特异性够） */
  frame: css`
    margin: 12px 0;

    /* 面板的 thread 里那条「[data-role='assistant'] 后代 pre」给 pre 的
       全套观感——这里只把「与头相接的那两条」改掉 */
    &[data-code-frame] pre {
      margin: 0;
      border-top: none;
      border-top-left-radius: 0;
      border-top-right-radius: 0;
    }
  `,

  bar: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px 4px 16px;
    border: 1px solid ${token.colorBorderSecondary};
    border-bottom: none;
    border-top-left-radius: ${token.borderRadius}px;
    border-top-right-radius: ${token.borderRadius}px;
    background: ${token.colorFillQuaternary};
    font-family: ${token.fontFamilyCode};
    font-size: var(--mimir-chat-font-badge, 11.5px);
    color: ${token.colorTextTertiary};
  `,
  /* 语言名。没有语言名时显示「文本」——**不留白**：
     那一格空着会让复制按钮看起来是浮在角落的 */
  lang: css`
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  /* 复制：两个图标叠在同一格做交换（200ms，DESIGN §7 的曲线） */
  copy: css`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border: none;
    border-radius: ${token.borderRadiusSM}px;
    background: none;
    color: ${token.colorTextTertiary};
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
    transition:
      color 0.12s ease-out,
      background-color 0.12s ease-out;

    &:hover {
      color: ${token.colorText};
      background: ${token.colorFillTertiary};
    }
    svg {
      transition:
        opacity 0.2s cubic-bezier(0.2, 0, 0, 1),
        transform 0.2s cubic-bezier(0.2, 0, 0, 1);
    }
    svg + svg {
      margin-left: -14px;
      opacity: 0;
      transform: scale(0.8);
    }
    &[data-copied] svg {
      opacity: 0;
      transform: scale(0.8);
    }
    &[data-copied] svg + svg {
      opacity: 1;
      transform: none;
    }
  `,
}))
