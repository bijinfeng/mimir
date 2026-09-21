import { createStyles } from 'antd-style'
import { CONTENT_WIDTH } from '@/theme/tokens'

/**
 * 笔记编辑器的样式。
 *
 * 分两层看：
 *
 * 1. **外壳**（`shell` / `path` / `title`）—— 组件自己的布局。
 * 2. **正文排版**（`body`）—— 编辑器挂载点的内容。Tiptap 渲染出的
 *    `<h1>` `<pre>` `<table>` 是裸 DOM，不是 React 组件，拿不到 className，
 *    所以只能从一个祖先类名往下选。这正是 `createStyles` 里嵌套选择器的用途。
 *
 * 正文的颜色引用 antd 变量（`token.*`），不写字面量——这样界面灰阶调整时
 * 正文不会掉队。规范与实测对比度见 `docs/DESIGN.md` §4.3。
 */
export const useStyles = createStyles(({ css, token }) => {
  return {
    shell: css`
      max-width: ${CONTENT_WIDTH}px;
      margin: 0 auto;
      padding: 32px 40px 160px;
    `,
    meta: css`
      margin-bottom: 10px;
    `,
    title: css`
      font-size: 28px;
      font-weight: 700;
      padding: 0;
      margin-bottom: 8px;
    `,
    path: css`
      display: block;
      font-size: 12px;
      margin-bottom: 20px;
    `,

    /* ── 正文排版 ────────────────────────────────────────────
       字号阶梯 28 / 20 / 16 / 14 / 13 见 docs/DESIGN.md §4.2。 */
    body: css`
      font-size: 14px;
      /* 中文正文比拉丁文需要更多行距：界面 1.57，正文 1.75 */
      line-height: 1.75;
      color: ${token.colorText};

      h1 {
        font-size: 28px;
        font-weight: 700;
        line-height: 1.3;
        margin: 0 0 16px;
      }

      h2 {
        font-size: 20px;
        font-weight: 600;
        line-height: 1.4;
        margin: 26px 0 10px;
      }

      h3 {
        font-size: 16px;
        font-weight: 600;
        line-height: 1.5;
        margin: 20px 0 8px;
      }

      p {
        margin: 12px 0;
      }

      a {
        color: ${token.colorLink};
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      code {
        font-family: ${token.fontFamilyCode};
        font-size: 13px;
        background: ${token.colorFillSecondary};
        color: ${token.inlineCodeFg};
        padding: 1.5px 5px;
        border-radius: ${token.borderRadiusSM}px;
      }

      pre {
        background: ${token.colorFillTertiary};
        border: 1px solid ${token.colorBorderSecondary};
        border-radius: ${token.borderRadius}px;
        padding: 14px 16px;
        margin: 14px 0;
        overflow-x: auto;
        font-size: 13px;
        line-height: 1.6;

        code {
          background: none;
          color: ${token.colorText};
          padding: 0;
        }
      }

      blockquote {
        border-left: 3px solid ${token.colorBorder};
        padding: 2px 0 2px 14px;
        margin: 14px 0;
        color: ${token.colorTextSecondary};
      }

      ul,
      ol {
        margin: 12px 0;
        padding-left: 22px;
      }

      li {
        margin: 5px 0;
      }

      table {
        border-collapse: collapse;
        margin: 14px 0;
        width: 100%;
        font-size: 13px;
      }

      th,
      td {
        border: 1px solid ${token.colorBorderSecondary};
        padding: 7px 11px;
        text-align: left;
      }

      th {
        background: ${token.tintNav};
        font-weight: 600;
      }

      hr {
        border: none;
        border-top: 1px solid ${token.colorBorderSecondary};
        margin: 26px 0;
      }

      mark {
        background: ${token.highlightBg};
        color: inherit;
        border-radius: 2px;
        padding: 0 1px;
      }

      /* Tiptap 在空段落上挂的类，位置由 float 撑住不占高度。
         3.1:1 —— 占位符不承载信息，允许低于 4.5 */
      p.is-editor-empty:first-child::before {
        content: attr(data-placeholder);
        color: ${token.colorTextQuaternary};
        float: left;
        height: 0;
        pointer-events: none;
      }
    `,
  }
})

/**
 * 保存状态指示器的样式。
 *
 * 颜色随 `state` 变化，所以走 `createStyles` 的第二个入参（props）而不是内联
 * `style`——这样颜色仍然来自 token，而且对比度由 `design.test.ts` 统一守。
 * 失败时点击可重试：不能只把失败画出来却不给动作（见 docs/PRD.md §5.9）。
 */
export const useIndicatorStyles = createStyles(
  ({ css, token }, state: 'idle' | 'saving' | 'saved' | 'error') => {
    // 状态是信息，它的对比度由规范统一保证（docs/DESIGN.md §3.3 / §3.4）
    const color = {
      idle: undefined,
      saving: token.colorTextQuaternary,
      saved: token.colorSuccessText,
      error: token.colorErrorText,
    }[state]

    return {
      indicator: css`
        font-size: 12px;
        color: ${color};
        cursor: ${state === 'error' ? 'pointer' : 'default'};
      `,
    }
  },
)
