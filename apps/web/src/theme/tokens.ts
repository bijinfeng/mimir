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
