import { theme } from 'antd'
import type { MappingAlgorithm, ThemeConfig } from 'antd'
import type { Appearance } from '@/theme/appearance'

/**
 * mimir 的设计 token —— 代码侧的唯一真相来源。规范与实测对比度见 `docs/DESIGN.md`。
 *
 * ## 两种外观，共用一份形状
 *
 * 颜色分浅色 / 深色两套，**形状与字体只有一份**（`BASE_TOKEN`）。分成两个
 * 独立的 ThemeConfig 会把圆角与字体栈也抄成两份，而那种抄写不会报错——
 * 深色下的圆角悄悄变成 antd 默认的 6px 就是这样发生的。
 *
 * 深色不是「把浅色反过来」，它是**另一套校准过的值**：每一对的对比度都重算过，
 * `design.test.ts` 用同一组阈值守住两边（见 §11 与那份测试）。
 *
 * ## 三条不是随手定的规则，改动前先读
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

/**
 * 与外观无关的那部分：形状与字体。
 *
 * 两种外观必须给出**同一个值**，所以它们在这里定义一次。
 * 深色漏掉 `borderRadius` 时不会报错——antd 会回落到默认的 6px，
 * 表现只是「深色下的圆角好像小一点」，没人会去查。
 */
const BASE_TOKEN = {
  borderRadius: 8,
  fontSize: 14,
  fontFamily: FONT_SANS,
  fontFamilyCode: FONT_MONO,
} as const

/**
 * 浅色的颜色。每一项的用途与实测对比度见 `docs/DESIGN.md` §3.3–§3.6。
 */
const LIGHT_COLOR = {
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

  // ── 表面 ──────────────────────────────────────────────
  colorBgLayout: '#f5f6f8',
} as const

/**
 * 深色的链接色。
 *
 * **它不能写在 `DARK_COLOR` 里**，理由见 `darkCalibration` 的注释：
 * 与 seed 同名的键会被算法重算，直接传会被丢掉。
 */
const DARK_LINK = '#79b8ff'

/**
 * 深色的颜色。
 *
 * 取值来自 antd 深色算法的实际派生值再加校准（`docs/DESIGN.md` §3.8 有表）：
 * 文字阶与语义色对在深色下**比浅色更松**（深色底上文字的对比度天然更高），
 * 所以这里的值是按「≥ 浅色现状」而不是「随便挑一个好看的」定的。
 */
const DARK_COLOR = {
  // ── 表面 ──────────────────────────────────────────────
  // 与浅色同序：布局底 < 导航底 < 列表底 < 容器底（见 customToken.ts）
  colorBgLayout: '#0b0c0e',
  colorBgContainer: '#141618',
  colorBgElevated: '#1e2022',
  colorBorder: '#3c4044',
  colorBorderSecondary: '#2e3134',

  // ── 文字阶 ────────────────────────────────────────────
  // 深色的四级也是同一色的四档透明度，但档位必须拉开：
  // antd 深色默认的 0.45 / 0.25 在容器底上只有 4.54 / 2.25
  colorTextSecondary: 'rgba(255,255,255,0.68)',
  colorTextTertiary: 'rgba(255,255,255,0.52)',
  colorTextQuaternary: 'rgba(255,255,255,0.4)',

  /**
   * 主色浅底与描边。
   *
   * 深色算法把 `colorPrimaryBg` 与 `colorPrimaryBorder` 设成**同一个值**
   * （`#15325b`），而它们承担的是两种角色：前者是「选中项的底」，后者是
   * 「焦点环 / 选中项的描边」。同值意味着焦点环在选中项上完全看不见
   * （实测 1.00:1）。只校准描边这一半。
   */
  colorPrimaryBorder: '#4b93dc',

  // ── 语义色对：深底 + 亮阶文字 ─────────────────────────
  colorSuccessBg: '#162312',
  colorSuccessText: '#6cc24a',
  colorWarningBg: '#2b2111',
  colorWarningText: '#e0a830',
  colorErrorBg: '#2c1618',
  colorErrorText: '#f0777a',
  colorInfoBg: '#111a2c',
  colorInfoText: '#6a9fef',
} as const

/**
 * 深色的校准层 —— **在算法之后**修正几个被算法重算的 token。
 *
 * ## 为什么需要它
 *
 * antd 的 `formatToken` 会把与**种子同名**的覆盖值从最终结果里删掉：
 * 那些键（`colorPrimary`、`colorLink`、`colorSuccess` …）只被当作算法的
 * 输入，最终值由算法重新派生。
 *
 * 浅色下这一点**看不出来**：`@ant-design/colors` 的浅色色阶把输入色放在
 * 第 6 阶，而 `colorLink` 恰好取第 6 阶，于是 `colorLink: '#0958d9'` 看着
 * 就像「直接生效了」。深色色阶不是这样——输入 `#0958d9` 派生出的
 * `#4b93dc` 系颜色在选中底上只有 3.97:1；而 antd 深色**自带**的
 * `colorLink`（`#1668dc`）在容器底上只有 3.50:1。两侧都不达 AA。
 *
 * 所以深色必须给最终值。`MappingAlgorithm` 在算法链的最后运行，
 * 它写进去的值不会再被改写。
 *
 * 链接色在深色下的实测：容器底 8.74:1、浮层底 7.87:1、选中底 6.17:1
 * ——三处都在 4.5 以上（`design.test.ts` 会守）。
 */
const darkCalibration: MappingAlgorithm = (seedToken, mapToken) => ({
  // 第二个参数按类型是可选的（`DerivativeFunc` 的签名如此）。生产路径上
  // antd-style 一定会把基础算法的结果传进来；这里兜一层是为了让这个函数
  // 单独拿出来算也得到同一套值——否则它会静默算出一份少了 darkAlgorithm
  // 的 token，而那种偏差不会报错。
  ...(mapToken ?? theme.darkAlgorithm(seedToken)),
  colorLink: DARK_LINK,
})

/**
 * 组件级 token —— 只放「全局 token 表达不了」的那几个角色。
 *
 * ## 为什么 Tabs 的选中色必须单独给
 *
 * antd 的 `itemSelectedColor` 默认取 `colorPrimary`
 * （`es/tabs/style/index.js` 的 `prepareComponentToken`），而 `colorPrimary`
 * 承担的是**填充**角色（按钮底、选中项底）——按 §3.5 的推论，「不要把它
 * 直接用在文字上」。同一排里**未选中**的标签走 `colorText`，于是
 * **强调关系是反的**：
 *
 * | | 选中项 | 未选中项 | 容器底 |
 * |---|---|---|---|
 * | 浅色（实测） | `#1677ff` 4.10:1 | `rgba(31,35,41,.88)` 10.89:1 | `#ffffff` |
 * | 深色（实测） | `#1668dc` 3.50:1 | `rgba(255,255,255,.85)` 13.23:1 | `#141618` |
 *
 * 两处都低于 AA（13.5px 正文），深色还比浅色更弱——与 §3.8 的跨外观
 * 不回归规则相反，单看深色截图看不出来（「当前在哪一区」只是整排里最暗的
 * 那一个，像被禁用）。
 *
 * 修法与 §3.5 同一条：**强调的文字用 `colorLink`，强调的填充用
 * `colorPrimary`**。所以只换文字色；ink bar（下划线）是填充角色，
 * 仍由 antd 取 `colorPrimary`，不动。
 *
 * ## 为什么两套外观各写一次显式取值
 *
 * 组件 token 是**最终值**：`getComponentToken` 把它直接并进结果，不参与
 * 算法派生、也不受 `formatToken` 删同名键的影响。所以这里不能写
 * `colorLink` 这个 token 名，只能写字面值——两边各自引用本外观的链接色
 * 常量（浅色 `#0958d9` 6.16:1，深色 `#79b8ff` 8.74:1），改链接色时两处
 * 一起跟着走，不会漂移成两种蓝。
 */
const COMPONENT_TOKEN: Record<Appearance, ThemeConfig['components']> = {
  light: { Tabs: { itemSelectedColor: LIGHT_COLOR.colorLink } },
  dark: { Tabs: { itemSelectedColor: DARK_LINK } },
}

export const mimirTheme: ThemeConfig = {
  // key 固定成 mimir：注入的变量类名稳定（.mimir），换主题时不会整页重算变量名
  cssVar: { key: 'mimir' },
  token: { ...BASE_TOKEN, ...LIGHT_COLOR },
  components: COMPONENT_TOKEN.light,
}

/**
 * 深色主题。
 *
 * `algorithm` 这里**只放校准层**，不放 `darkAlgorithm`——基础算法由
 * antd-style 按当前 appearance 自动补（`AntdProvider` 会把
 * `[基础算法, ...本配置的算法]` 串起来，见 `algorithmFor` 的注释）。
 * 自己再写一遍 `darkAlgorithm` 会让它跑两次。
 */
export const mimirDarkTheme: ThemeConfig = {
  cssVar: { key: 'mimir' },
  token: { ...BASE_TOKEN, ...DARK_COLOR },
  algorithm: darkCalibration,
  components: COMPONENT_TOKEN.dark,
}

/** 当前外观对应的主题配置。`MimirProvider` 用它，**不要**在别处再判一次 */
export function themeConfigFor(appearance: Appearance): ThemeConfig {
  return appearance === 'dark' ? mimirDarkTheme : mimirTheme
}

/**
 * 把「基础算法 + 本项目的算法」按 antd-style 的规则串起来。
 *
 * 规则来自 `AntdProvider`（antd-style 4.x）：
 *
 * ```js
 * const baseAlgorithm = isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm
 * algorithm: !antdTheme.algorithm ? baseAlgorithm : [baseAlgorithm, ...algoProp]
 * ```
 *
 * 这里复写一遍是为了让**守门测试能在不挂 provider 的情况下**算出与线上
 * 完全一致的一套 token。测试里的结构一旦和生产分叉，它守住的就不是真实的
 * 东西了——所以 `design.test.ts` 另外挂了一次真实 provider 栈，
 * 把注入的 `--ant-*` 与这里算出的值对一遍：这处复写一旦漂移，那条断言会红。
 */
export function algorithmFor(appearance: Appearance): MappingAlgorithm[] {
  const base = appearance === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm
  const own = themeConfigFor(appearance).algorithm
  const ownList = own === undefined ? [] : Array.isArray(own) ? own : [own]
  return [base, ...ownList]
}

/**
 * 当前外观下**实际生效**的完整 token 集。
 *
 * 与 `theme.getDesignToken` 的区别是它会带上正确的算法链——直接拿
 * `getDesignToken(mimirDarkTheme)` 会少一层 `darkAlgorithm`，算出来的对比度
 * 是另一套数字（每个值都偏亮），而那种错误不会报错，只会让守门测试
 * 守着一个不存在的界面。
 */
export function effectiveTokens(appearance: Appearance) {
  const config = themeConfigFor(appearance)
  return theme.getDesignToken({ ...config, algorithm: algorithmFor(appearance) })
}

/**
 * 内容列宽度。
 *
 * 文档正文与设置页共用同一个 measure —— 同一份规范里不该有两个「内容列宽度」。
 * 760px 对应约 11-12 个中文字符的舒适行宽（14px 字号）。
 */
export const CONTENT_WIDTH = 760

/**
 * 左导航里一行的高度，以及它与容器左右的距离。
 *
 * **为什么值得提到这里**：底部账号行要与上面的菜单项看起来是同一套东西，
 * 而那依赖三处尺寸完全一致。第一版账号行按「看上去差不多」自己写了一组，
 * 实测三处都不同（高 32 vs 30、外边距 4 vs 6、内容还居中）——
 * 叠在一起就是「这一行不像同一套东西」，而且账号行右边缘溢出了容器 3px。
 *
 * 数字放在这里之后，菜单项与账号行引用同一个常量，不会各自漂移。
 */
export const NAV_ITEM_HEIGHT = 30
export const NAV_ITEM_MARGIN = 6

/**
 * 窄屏断点：≤880px 时左导航**强制折叠**成 48px 图标条（`docs/DESIGN.md` §5.5）。
 *
 * ## 为什么它必须是一个共享的查询串，而不是各写各的
 *
 * 这个断点要在两处生效：
 *
 *  1. **外壳的网格**（`routes/_app.tsx` 的 `@media`）——决定左列多宽
 *  2. **`matchMedia`**（`lib/nav-collapse.ts`）——决定栏内**内容**怎么渲染
 *
 * 第二处容易被漏掉，因为只改网格「看起来也能跑」：容器确实收成了 48px，
 * 而栏里的标签、目录树、品牌名是 React 渲染的，它们挤在一个图标条的宽度里
 * 逐字换行——实测「知识库」竖成一列、品牌名与折叠开关叠在一起、目录树整块
 * 歪掉。**不报错，只是全变形了**。
 *
 * 分成两份（CSS 写 880px、JS 写 880）也能跑，改一处漏一处同样是静默的：
 * 界面只是「挤」而不是「崩」。所以两边共用这一个查询串——它们在物理上
 * 无法分开，`design.test.ts` 有一条守着 `_app.tsx` 里不再出现 880 字面量。
 */
export const NAV_NARROW_BREAKPOINT = 880
export const NAV_NARROW_QUERY = `(max-width: ${NAV_NARROW_BREAKPOINT}px)`

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
 * 摘要用 13px、元信息用 12px 时，两人挤在一起几乎同高；
 * 12.5 / 12 的差别让「哪一行是主体」在扫读时更清楚。
 *
 * 每一档都对应一个**角色**，不是「差不多大就用它」。
 * 加新样式时先找角色，找不到再考虑要不要加档（并在这里写清理由）。
 *
 * 字号**不随外观变**：深色下不是「字变大」，只是底色变了。
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
