import type { ThemeConfig } from 'antd'

/**
 * mimir 的设计 token —— 代码侧的唯一真相来源。规范与实测对比度见 `docs/DESIGN.md`。
 *
 * 三条不是随手定的规则，改动前先读：
 *
 * 1. **不换种子色，只覆盖叶子 token。**
 *    拿原型的深绿 / 深橙 / 深红去替换 `colorSuccess` 这类种子，antd 会按
 *    「假定种子是亮色」的算法派生底色，实测得到 `colorSuccessBg = #a8b3aa`
 *    这种灰绿脏色。所以种子保持 antd 默认，只覆盖真正要改的叶子。
 *
 * 2. **文字色与填充色分开。**
 *    `#1677ff` 作文字在浅蓝底上只有 3.61:1（选中态导航项就是这个组合），
 *    所以文字角色走 `colorLink`，取 antd 同色阶第 7 阶 `#0958d9`。
 *
 * 3. **语义色必须成对使用。**
 *    状态文字配同语义浅底。antd 默认那套是不达标的：实测 successText on
 *    successBg 只有 2.21:1，warning 1.83:1，error 2.99:1。下面覆盖的值
 *    全部 ≥ 4.5:1，`theme/design.test.ts` 会守住这条线。
 */

/**
 * 字体栈 —— 全项目唯一的定义处。
 *
 * antd 默认栈到 `Roboto` 就结束了，在 Linux 服务器上的浏览器里会一路落到
 * `sans-serif`，中文可能渲染成点阵字体。这里在系统 UI 字体后补中文兜底。
 *
 * 它同时是 antd token（`fontFamily`）和文档级样式（`styles/global.ts` 的 body）
 * 的值来源——两处写两份字体栈，必然有一天不一致。
 */
export const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"

/** 等宽只用于行内代码、代码块、文件路径、插件 seam 标识 */
export const FONT_MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace"

export const mimirTheme: ThemeConfig = {
  // key 固定成 mimir：注入的变量类名稳定（.mimir），换主题时不会整页重算变量名
  cssVar: { key: 'mimir' },

  token: {
    // ── 品牌 ──────────────────────────────────────────────
    colorPrimary: '#1677ff',
    colorLink: '#0958d9',

    // ── 文字阶 ────────────────────────────────────────────
    colorTextBase: '#1f2329',
    // 次要正文：摘要、表单标签、引用原文（三种内容底 5.47–5.91:1）
    colorTextSecondary: '#5c6570',
    // 元信息：时间戳、路径、计数（三种内容底 4.63–5.00:1）
    colorTextTertiary: '#68707c',
    // 占位符与禁用态：不承载信息，允许低于 4.5
    colorTextQuaternary: '#8b939c',

    // ── 语义色对：浅底 + 同色深阶文字 ─────────────────────
    colorSuccessBg: '#e6f4ea',
    colorSuccessText: '#137333',
    colorWarningBg: '#fff3e0',
    colorWarningText: '#b45309',
    colorErrorBg: '#fef7f6',
    colorErrorText: '#c5221f',
    colorInfoBg: '#e8f0fe',
    colorInfoText: '#1a56c4',

    // ── 表面与形状 ────────────────────────────────────────
    colorBgLayout: '#f5f6f8',
    borderRadius: 8,
    fontSize: 14,

    // ── 字体 ──────────────────────────────────────────────
    fontFamily: FONT_SANS,
    fontFamilyCode: FONT_MONO,
  },
}

/**
 * 内容列宽度。
 *
 * 文档正文与设置页共用同一个 measure —— 同一份规范里不该有两个「内容列宽度」。
 * 760px 对应约 11-12 个中文字符的舒适行宽（14px 字号）。
 */
export const CONTENT_WIDTH = 760

/**
 * 字号阶梯 —— **唯一的一份**。
 *
 * ## 为什么需要它
 *
 * 之前每个组件各写各的 `font-size`，全仓出现过 11 个不同的值
 * （10 / 10.5 / 11 / 11.5 / 12 / 12.5 / 13 / 13.5 / 14 / 15 / 16），
 * 而且同一个**角色**在不同地方用不同值：
 *
 * ```
 * 元信息（时间戳、计数）  文档页 12.5px，列表页 11.5px，导航 11.5px
 * ```
 *
 * 这不会报错，只是整页看起来「不整齐」——用户说不清哪里不对，
 * 但会觉得粗糙。字号是最容易被随手改的样式，因为它看起来无害。
 *
 * ## 取值依据
 *
 * 采原型实测的那套 .5 级差（`output/index.html`），而不是 antd 默认的
 * 12/14/16/20/24。原因：这份界面的信息密度高（列表项里同时有标题、
 * 摘要、徽标、计数），整数档在**相邻层级**之间跳得太大——
 * 摘要用 13px、元信息用 12px 时，两者挤在一起几乎同高；
 * 12.5 / 12 的差别让「哪一行是主体」在扫读时更清楚。
 *
 * 每一档都对应一个**角色**，不是「差不多大就用它」。
 * 加新样式时先找角色，找不到再考虑要不要加档（并在这里写清理由）。
 */
export const FONT_SIZE = {
  /** 文档标题（编辑器 H1）。全界面最大的一档 */
  display: 28,
  /** 页面标题：正文 H2、设置页 H1 */
  pageTitle: 19,
  /** 小节标题：正文 H3、卡片标题、空态标题 */
  section: 16,
  /** 界面正文：按钮、输入、对话正文、正文段落 */
  body: 14,
  /** 列表项标题、导航项 —— 比正文略小，因为它们是**被扫读**的 */
  item: 13.5,
  /** 摘要、表格、代码 —— 连续阅读的次级内容 */
  excerpt: 13,
  /** 次级说明、引用片段、检索过程 —— 一次性读一小段 */
  note: 12.5,
  /** 元信息：时间戳、路径、命令行 */
  meta: 12,
  /** 徽标、计数 —— 有底色衬托，允许更小（DESIGN §4.2 的下限是 10.5） */
  badge: 11.5,
} as const
