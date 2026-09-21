/**
 * mimir 的自定义 token —— antd 没有这些语义的那部分。
 *
 * antd 的 token 体系里有品牌色、文字阶、语义色，但没有「列表列的底色」和
 * 「行内代码的字色」。历史上这三个值是 `global.css` 里的 `--mimir-*` 变量；
 * 改用 antd-style 后它们走 `customToken`，原因是：
 *
 * 1. 有类型 —— `createStyles` 里的 `token.tintList` 能补全，拼错会报错
 * 2. 有作用域 —— 值跟着 ThemeProvider 走，不再是全局裸变量
 * 3. 一处定义 —— 不需要 `:root` 与组件样式两处维护
 *
 * 规范与实测对比度见 `docs/DESIGN.md` §3.6 / §4.3。
 */
export interface MimirCustomToken {
  /** 第四层表面：三栏里的中栏列表、大纲列。比容器底稍冷，用来分隔而不加边框 */
  tintList: string
  /** 第四层表面：左导航、浮层页脚 */
  tintNav: string
  /** 行内代码字色。配 `colorFillSecondary` 底，实测 4.85:1 */
  inlineCodeFg: string
  /** 正文 `<mark>` 的高亮底。字色继承正文，实测 11.82:1 */
  highlightBg: string

  /**
   * 整理条的表面与描边。
   *
   * `colorWarningBg` (#fff3e0) 是给**提示条**用的，饱和度偏高；整理条在
   * 文档顶部占一整行且长期存在，用它会变成页面上最吵的东西。
   * 原型实测的 #fffaf2 + #ffe0b2 是同色相但淡两档，既认得出是「待办」
   * 又不抢标题。文字色仍用 `colorWarningText`（在这两个底上对比度只增不减）。
   */
  tintWarningSurface: string
  borderWarningSurface: string
}

/**
 * 把自定义 token 的类型接进 antd-style。
 *
 * 这一步不做的话 `token.tintList` 在 `createStyles` 里是类型错误——
 * antd-style 的 `FullToken = AntdToken & CustomToken`，`CustomToken` 默认是空接口。
 */
declare module 'antd-style' {
  export interface CustomToken extends MimirCustomToken {}
}

export const mimirCustomToken: MimirCustomToken = {
  tintList: '#fcfcfd',
  tintNav: '#fbfbfc',
  inlineCodeFg: '#c7254e',
  highlightBg: '#fff3b0',
  tintWarningSurface: '#fffaf2',
  borderWarningSurface: '#ffe0b2',
}
