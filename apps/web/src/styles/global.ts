import { createGlobalStyle } from 'antd-style'

/**
 * 文档级样式 —— 只做五件事：重置、高度链、文档字体、底色、动效退化。
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

  /*
  /*
   * 底色必须画在 html 上，不能只靠各页面的容器。
   *
   * 三栏布局里每栏都有自己的底（colorBgLayout / tintNav / colorBgContainer），
   * 但**滚动到顶端之外、overscroll 回弹、以及页面比视口短**这三种情况下
   * 露出来的是 html 的底。不画的话深色模式下会露出浏览器默认的白色，
   * 而那种白闪看起来像渲染出错了。
   *
   * 这里用插值而不是 --ant-* 变量：
   * 变量注入在 antd 组件的 DOM 子树上，html 上取不到（见 §10.3）。
   *
   * **!important 是为了压过 index.html 里那段首帧脚本**（它给 html 写了一个
   * 内联兜底背景，只为覆盖「脚本执行到样式注入」那段空白）。内联样式优先于
   * 样式表，不加 !important 的话那个值会一直赢——**运行时切换外观时 html 的底
   * 不会跟着变**（刷新后才对），表现是切换后 overscroll 露出上一层外观的颜色。
   * 它针对的是那一个内联声明，不是为了跟别处的规则抢优先级。
   *
   * 注意：**这个模板字符串里不能再出现反引号**，注释里也不行。
   * 反引号会提前结束模板，于是整段样式变成非法 TS——
   * 表现是 React Compiler 插件在这个文件上报「Expected a semicolon」，
   * 而那个报错位置指着一句看起来毫无问题的中文注释。
   */
  html {
    background: ${(p) => p.theme.colorBgLayout} !important;
  }

  body {
    font-family: ${(p) => p.theme.fontFamily};
    color: ${(p) => p.theme.colorText};
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
