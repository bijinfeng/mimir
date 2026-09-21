import { createGlobalStyle } from 'antd-style'

/**
 * 文档级样式 —— 只做四件事：重置、高度链、文档字体、动效退化。
 *
 * 这是**唯一的全局样式出口**，而且只放「React 组件树之外」的东西：
 * `html` / `body` / `#root` 这些节点不归任何组件管，只能全局选择。
 * 组件样式一律走 `createStyles`（局部作用域），不要往这里加。
 *
 * 内容区排版（编辑器正文）曾经也在这里，现在挂在 `NoteEditor` 的样式模块上——
 * 它是一个组件的样式，就该有作用域。规范见 `docs/DESIGN.md` §4.3。
 */
export const GlobalStyles = createGlobalStyle`
  * {
    box-sizing: border-box;
  }

  html,
  body,
  #root {
    height: 100%;
    margin: 0;
  }

  /* antd 的 App 包装层默认没有高度，会把 height:100% 的链条断在这里——
     表现是登录卡片不垂直居中、Layout 的 height:100% 只撑到内容高度。
     补上这一层，链条才完整：html → body → #root → .ant-app → 页面。
     prefixCls 从主题取，antd 换个前缀这条规则跟着换。 */
  #root > .${(p) => p.theme.prefixCls}-app {
    height: 100%;
  }

  body {
    font-family: ${(p) => p.theme.fontFamily};
    -webkit-font-smoothing: antialiased;
  }

  /* 动效退化。antd 组件的动效由 token 控制，这里是给自定义过渡兜底。
     前庭功能敏感的用户会因为 0.15s 的位移而眩晕，这不是可选项。 */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
`
