import { createStyles } from 'antd-style'
import { FONT_SIZE } from '../theme/tokens'

/**
 * 正文排版 —— **编辑器与只读视图共用的一份**。
 *
 * ## 为什么单独成一个模块
 *
 * 这两个视图都让 Tiptap 渲染同一份 Markdown（`MarkdownBody` 的注释解释了
 * 为什么不用第二个渲染库），所以它们**必然**要有同一套排版。但样式原先写在
 * 两处——编辑态一份、只读态一份——两份手抄的规则漂移出四处（图片没有
 * `max-width` 撑破内容列、行内代码底一个用字面量一个用 token、字号差半档、
 * 任务列表两边都没处理），而**没有任何一处报错**。
 * 漂移的代价正是 `.trellis/spec/project/design.md` §8 开头那段话：**没有形态可依时每个组件
 * 各写各的**。同一篇笔记在编辑态与只读态长得不一样，用户会以为内容变了。
 *
 * 放这个目录（而不是 `src/styles/`）是刻意的：`design.test.ts` 的字号字面量
 * 扫描只覆盖 `src/components` 与 `src/routes`，挪出去会让这份最密集的排版
 * 规则脱离守卫。
 *
 * ## 规则来源
 *
 * `.trellis/spec/project/design.md` §4.3 是这份值的规范。Tiptap 渲染的是裸 DOM（`<h1>`
 * `<pre>` `<table>` 拿不到 className），所以只能从挂载点的类名往下写嵌套
 * 选择器——这正是 `createStyles` 嵌套选择器的用途，且规则有作用域。
 *
 * **不写字面量颜色**（`.trellis/spec/renderer/frontend/conventions.md` 样式第 3 条）：全部走 `token.*`，
 * 于是换主题时正文不会掉队。对比度由 `design.test.ts` 守。
 */
export const useContentStyles = createStyles(({ css, token }) => ({
  content: css`
    font-size: ${FONT_SIZE.body}px;
    /* 中文正文比拉丁文需要更多行距：界面 1.57，正文 1.75 */
    line-height: 1.75;
    color: ${token.colorText};

    h1 {
      font-size: ${FONT_SIZE.display}px;
      font-weight: 700;
      line-height: 1.3;
      margin: 0 0 16px;
    }

    h2 {
      font-size: ${FONT_SIZE.pageTitle}px;
      font-weight: 650;
      line-height: 1.4;
      letter-spacing: -0.005em;
      margin: 26px 0 10px;
    }

    h3 {
      font-size: ${FONT_SIZE.section}px;
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

    /*
     * 行内代码：13px（excerpt）+ inlineCodeFg 配 fill-secondary 底。
     * 这组对比度由 design.test.ts 守着（白底 4.93:1、列表底 4.80:1）。
     *
     * 这里曾经是字面量 #f0f1f3 配 12.5px，而只读视图是 fill-secondary 配
     * 13px——同一个元素两个灰度，差得看得出来。
     */
    code {
      font-family: ${token.fontFamilyCode};
      font-size: ${FONT_SIZE.excerpt}px;
      background: ${token.colorFillSecondary};
      color: ${token.inlineCodeFg};
      padding: 1.5px 5px;
      border-radius: 4px;
    }

    pre {
      background: ${token.tintNav};
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: ${token.borderRadius}px;
      padding: 14px 16px;
      margin: 14px 0;
      overflow-x: auto;
      font-size: ${FONT_SIZE.note}px;
      line-height: 1.65;

      code {
        background: none;
        color: ${token.colorText};
        padding: 0;
        font-size: inherit;
      }
    }

    /*
     * 语法高亮的着色。
     *
     * **这组规则原先完全缺失，于是高亮静默失效**：CodeBlockLowlight 挂着
     * lowlight 与 common 语法包，解析出的确实带 hljs-keyword 之类的类
     * （实测一个五行代码块产出 12 个 span、6 种 token），而全仓没有一条
     * hljs 规则——所有 token 渲染成同一个颜色。看起来像「这个编辑器不支持
     * 高亮」，实际只是少了 CSS，不报错。
     *
     * 取色只用既有的语义 token（不新造色值），对比度由 design.test.ts 守。
     * 函数名与章节名靠**字重**而不是色相区分：再多一个色相就会让代码块
     * 比正文更抢眼，而代码块在笔记里是配角。
     */
    .hljs-comment,
    .hljs-quote {
      color: ${token.colorTextTertiary};
      font-style: italic;
    }

    .hljs-keyword,
    .hljs-selector-tag,
    .hljs-built_in,
    .hljs-name,
    .hljs-tag {
      color: ${token.colorLink};
    }

    .hljs-string,
    .hljs-regexp,
    .hljs-addition,
    .hljs-meta .hljs-string {
      color: ${token.colorSuccessText};
    }

    .hljs-number,
    .hljs-literal,
    .hljs-attr,
    .hljs-variable,
    .hljs-template-variable {
      color: ${token.colorWarningText};
    }

    .hljs-title,
    .hljs-section,
    .hljs-selector-id,
    .hljs-selector-class,
    .hljs-title.function_,
    .hljs-title.class_ {
      color: ${token.colorText};
      font-weight: 600;
    }

    .hljs-attribute,
    .hljs-symbol,
    .hljs-bullet,
    .hljs-link,
    .hljs-params {
      color: ${token.colorTextSecondary};
    }

    .hljs-deletion {
      color: ${token.colorErrorText};
    }

    blockquote {
      border-left: 3px solid ${token.colorBorder};
      padding: 2px 0 2px 14px;
      margin: 14px 0;
      color: ${token.colorTextSecondary};
    }

    ul,
    ol {
      margin: 12px 0 12px 4px;
      padding-left: 20px;
    }

    li {
      margin: 5px 0;
      line-height: 1.7;
    }

    /*
     * 任务列表。Tiptap 的 TaskItem 产出
     * ul[data-type=taskList] > li[data-checked] > label > input + div > p，
     * **没有自带样式**，于是落进上面两条通用规则：拿到项目符号（disc）与
     * 20px 缩进，而里面的 <p> 还带着 12px 上下边距——结果是「圆点 + 复选框」
     * 并排，文字被挤到第二行（实测截图确认）。
     *
     * 用 flex 把复选框与文字排成一行；去掉内层 p 的边距，否则每个待办都会
     * 比相邻的普通列表项高一倍。
     */
    ul[data-type='taskList'] {
      list-style: none;
      padding-left: 0;
      margin-left: 0;

      li {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin: 6px 0;

        > label {
          flex: none;
          /* 与首行文字的光学中线对齐（正文 14px/1.7，行盒约 24px） */
          margin-top: 4px;
          user-select: none;
          cursor: pointer;
        }

        > div {
          flex: 1;
          min-width: 0;
        }

        p {
          margin: 0;
        }
      }

      /* 已完成：文字转弱并划掉。这是待办列表的通用约定——
         状态不该只靠复选框里那一点点颜色差来传达 */
      li[data-checked='true'] > div {
        color: ${token.colorTextTertiary};
        text-decoration: line-through;
      }
    }

    /* 复选框用浏览器原生控件，只改强调色与大小：手绘一个会丢掉键盘与
       无障碍语义，而 Tiptap 已经配好了 aria-label */
    input[type='checkbox'] {
      accent-color: ${token.colorPrimary};
      width: 15px;
      height: 15px;
      margin: 0;
      cursor: pointer;
    }

    table {
      border-collapse: collapse;
      margin: 14px 0;
      width: 100%;
      font-size: ${FONT_SIZE.excerpt}px;
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

    /*
     * 图片。**这条原先只存在于只读视图**：笔记里插一张 1200px 的图会直接
     * 撑破 760px 的内容列（实测编辑区 scrollWidth 1200 / clientWidth 664，
     * 出现横向滚动条），而同一篇文档在只读态是正常的。
     */
    img {
      max-width: 100%;
      border-radius: 6px;
    }

    .mimir-diagram,
    .mimir-math-block {
      margin: 14px 0;
      padding: 12px 16px;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: ${token.borderRadius}px;
      background: ${token.colorFillQuaternary};
    }

    .mimir-math-block__preview {
      overflow-x: auto;
      min-height: 1.5em;
    }

    .mimir-diagram__preview {
      overflow-x: auto;
      min-height: 1.5em;

      img {
        display: block;
        height: auto;
        margin: 0 auto;
        background: ${token.colorBgContainer};
      }
    }

    .mimir-diagram__error {
      white-space: pre-wrap;
      color: ${token.colorError};
    }

    .mimir-diagram pre {
      margin-bottom: 0;
    }

    .mimir-math-block__error {
      white-space: pre-wrap;
      font-family: ${token.fontFamilyCode};
      color: ${token.colorError};
    }

    .mimir-math-block__source {
      display: block;
      width: 100%;
      min-height: 3em;
      margin-top: 8px;
      padding: 6px 8px;
      resize: vertical;
      font: inherit;
      font-family: ${token.fontFamilyCode};
      color: ${token.colorText};
      background: transparent;
      border: 1px solid ${token.colorBorder};
      border-radius: ${token.borderRadiusSM}px;
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
}))
