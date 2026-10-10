import { createGlobalStyle } from 'antd-style'

/**
 * 文档级样式 —— 只做五件事：重置、高度链、文档字体、底色、动效退化。
 *
 * 这是**唯一的全局样式出口**，而且只放「React 组件树之外」的东西：
 * `html` / `body` / `#root` 这些节点不归任何组件管，只能全局选择。
 * 组件样式一律走 `createStyles`（局部作用域），不要往这里加。
 *
 * 内容区排版（编辑器正文）曾经也在这里，现在挂在 `NoteEditor` 的样式模块上——
 * 它是一个组件的样式，就该有作用域。规范见 `.trellis/spec/project/design.md` §4.3。
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
  /* 引用跳转的原文高亮（CSS Custom Highlight API，D-047 待办收尾）。
     Range 注册在 CSS.highlights 上，不改 DOM——只读正文与编辑器的
     文本节点都适用。用主色的浅阶（colorPrimaryBg），与选中态同源 */
  ::highlight(mimir-citation) {
    background-color: ${(p) => p.theme.colorPrimaryBg};
  }

  #root > .${(p) => p.theme.prefixCls}-app {
    height: 100%;
  }

  /*
   * 表单校验的错误文字要用**校准过的**那一支错误色。
   *
   * antd 的 Form 把 explain 文案写成 color: token.colorError
   * （es/form/style/index.js:246），也就是未校准的 #ff4d4f——白底
   * 3.27:1、深色 #dc4446 压在容器底上 4.28:1，都不到 AA。而项目按
   * .trellis/spec/project/design.md §3.1/§3.3 校准过语义文字色（浅色 #c5221f 5.80:1、
   * 深色 #f0777a 6.59:1），只是这一处没被 antd 取用。
   *
   * 为什么放在全局而不是登录页的 createStyles 里：它盖的是 antd 内部的
   * 类名，登录页那一条只对**渲染了那一页样式**的表单生效——下一处用
   * Form 的地方会静默地退回未校准的色，而 design.test.ts 只能看见
   * 变量、看不见 antd 把 explain 渲染成了另一个值（这正是它一直是绿的
   * 原因）。放这里一处覆盖所有表单。
   *
   * 只改文字色：错误边框保持 colorError——它是**非文本**，
   * 3.27:1 已过 3:1 的线。
   *
   * 选择器写成两段（.ant-form .ant-form-item-explain-error）是有意的：
   * antd 那条规则嵌在 componentCls 里，落下来就是两个类（(0,2,0)）。
   * 只写一个类的话特异性更低，盖不住它——**改完看着没变**，而且没有任何
   * 提示。
   */
  .${(p) => p.theme.prefixCls}-form .${(p) => p.theme.prefixCls}-form-item-explain-error {
    color: ${(p) => p.theme.colorErrorText};
  }

  /*
   * 密码可见性开关（Input.Password 右端那颗眼睛）自己的焦点环。
   *
   * 它是 role="button" + tabindex="0" 的元素，键盘能 Tab 到，但 antd 没给它
   * 焦点样式——实测 Tab 到它时是浏览器默认的 outline: rgb(16,16,16) auto 1px，
   * 紧贴字形的小黑方框，与同页其它可聚焦元素的蓝色环不是一套语言
   * （.trellis/spec/project/design.md §7.2：焦点必须可见，自定义的可聚焦元素补项目自己的环；
   * 登录按钮实测是 3px 的蓝环、输入框是主色光晕）。
   *
   * 用 token.controlOutline 而不是字面量 rgba(22,119,255,.1)：它是 antd 按
   * 当前主色与底色算好的半透明主色，深色下自动换成更亮的一档（写死的
   * rgba 在深色下几乎不可见，Composer 的注释记的就是这件事）。
   */
  .${(p) => p.theme.prefixCls}-input-password-icon:focus-visible {
    outline: none;
    border-radius: 4px;
    box-shadow: 0 0 0 3px ${(p) => p.theme.controlOutline};
    color: ${(p) => p.theme.colorPrimary};
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
   * 变量注入在 antd 组件的 DOM 子树上，html 上取不到（见 .trellis/spec/renderer/frontend/theme/pitfalls.md）。
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
