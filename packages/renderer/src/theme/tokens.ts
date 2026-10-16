import { theme } from 'antd'
import type { MappingAlgorithm, ThemeConfig } from 'antd'
import type { Appearance } from './appearance'

/** Shared Web/Desktop theme. UI actions and neutral navigation use separate roles. */
export const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
export const FONT_MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace"

/** Shape and UI typography are shared by both appearances. Reading has its own role below. */
const BASE_TOKEN = {
  borderRadius: 6,
  borderRadiusSM: 6,
  borderRadiusLG: 6,
  fontSize: 14,
  fontFamily: FONT_SANS,
  fontFamilyCode: FONT_MONO,
  controlOutlineWidth: 2,
  lineWidthFocus: 2,
} as const

const LIGHT_COLOR = {
  colorPrimary: '#00834d',
  // Semantic selection (citations/editor pressed states), never neutral navigation.
  colorPrimaryBg: '#e8f5ee',
  colorPrimaryBgHover: '#d8eddf',
  colorPrimaryBorder: '#00834d',
  colorPrimaryBorderHover: '#007846',
  colorPrimaryHover: '#007846',
  colorPrimaryActive: '#006b3e',
  colorPrimaryText: '#007a45',
  colorPrimaryTextHover: '#006b3e',
  colorPrimaryTextActive: '#005b35',
  colorLink: '#007a45',
  colorLinkHover: '#006b3e',
  colorLinkActive: '#005b35',
  controlOutline: '#00834d',
  colorTextBase: '#262626',
  colorText: '#262626',
  colorTextSecondary: '#595959',
  colorTextTertiary: '#6b6b6b',
  colorTextQuaternary: '#808080',
  colorSuccessBg: '#e8f5ee',
  colorSuccessText: '#007a45',
  colorWarningBg: '#fff3e0',
  colorWarningText: '#8a5700',
  colorErrorBg: '#fef0ee',
  colorErrorText: '#b42318',
  colorInfoBg: '#e8f0fe',
  colorInfoText: '#1a56c4',
  colorBgLayout: '#ffffff',
  colorBgContainer: '#ffffff',
  colorBgElevated: '#ffffff',
  colorBorder: '#8a8a8a',
  colorBorderSecondary: '#e8e8e8',
} as const

const DARK_LINK = '#6bdaa5'
const DARK_COLOR = {
  colorBgLayout: '#18191a',
  colorBgContainer: '#202225',
  colorBgElevated: '#26282b',
  colorBorder: '#686e76',
  colorBorderSecondary: '#3b3e43',
  colorText: '#eceeef',
  colorTextSecondary: '#b3b6bb',
  colorTextTertiary: '#969ba2',
  colorTextQuaternary: '#858a91',
  colorPrimaryBorder: DARK_LINK,
  controlOutline: DARK_LINK,
  colorSuccessBg: '#173a2a',
  colorSuccessText: DARK_LINK,
  colorWarningBg: '#352a17',
  colorWarningText: '#f3c46d',
  colorErrorBg: '#3b2221',
  colorErrorText: '#ffb4ab',
  colorInfoBg: '#192b43',
  colorInfoText: '#9fc0ff',
} as const

/**
 * Seed names are recomputed by antd. Calibrate after darkAlgorithm so green
 * white-text buttons and links retain their separate, measured contrast roles.
 * antd-style provides the base algorithm; do not add darkAlgorithm twice.
 */
const darkCalibration: MappingAlgorithm = (seedToken, mapToken) => ({
  ...(mapToken ?? theme.darkAlgorithm(seedToken)),
  colorPrimary: '#00834d',
  colorPrimaryBg: '#173a2a',
  colorPrimaryBgHover: '#204b36',
  colorPrimaryBorderHover: '#89e4ba',
  colorPrimaryHover: '#007846',
  colorPrimaryActive: '#006b3e',
  colorPrimaryText: DARK_LINK,
  colorPrimaryTextHover: '#89e4ba',
  colorPrimaryTextActive: '#aaedce',
  colorLink: DARK_LINK,
  colorLinkHover: '#89e4ba',
  colorLinkActive: '#aaedce',
})

const COMPONENT_TOKEN: Record<Appearance, ThemeConfig['components']> = {
  light: {
    Tabs: { itemSelectedColor: LIGHT_COLOR.colorLink },
    Menu: {
      itemSelectedColor: '#262626',
      itemSelectedBg: '#eff0f0',
      itemHoverBg: '#e9ebeb',
      itemActiveBg: '#eff0f0',
    },
  },
  dark: {
    Tabs: { itemSelectedColor: DARK_LINK },
    Menu: {
      itemSelectedColor: '#eceeef',
      itemSelectedBg: '#303235',
      itemHoverBg: '#303235',
      itemActiveBg: '#303235',
    },
  },
}

export const mimirTheme: ThemeConfig = {
  cssVar: { key: 'mimir' },
  token: { ...BASE_TOKEN, ...LIGHT_COLOR },
  components: COMPONENT_TOKEN.light,
}

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
 * 文档阅读列以 760px 为起点；设置表单与 Office 画布按自身任务布局。
 */
export const CONTENT_WIDTH = 760

/** 工作区、文档与文档问 AI 三栏共享的头部高度。 */
export const PANEL_HEADER_HEIGHT = 48

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
 * 窄屏断点：≤880px 时任务侧栏收起，只保留 52px 功能栏（`.trellis/spec/project/design.md` §5.5）。
 *
 * ## 为什么它必须是一个共享的查询串，而不是各写各的
 *
 * 这个断点要在两处生效：
 *
 *  1. **外壳的网格**（`routes/_app.tsx` 的 `@media`）——决定左列多宽
 *  2. **`matchMedia`**（`lib/nav-collapse.ts`）——决定栏内**内容**怎么渲染
 *
 * 第二处容易被漏掉，因为只改网格「看起来也能跑」：容器确实收成了功能栏宽度，
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
/**
 * 窗口标题栏的高度（D-094）。
 *
 * 桌面窗口标题栏固定为 44px；工作区、文档与问 AI 的面板头部
 * 使用独立的 `PANEL_HEADER_HEIGHT`（48px）。
 *
 * 写在这里的原因与断点一样：这个值同时被标题栏组件（内联高度）与
 * 页面布局（主区高度的起点）读，各写一份必然漂移。
 */
export const TITLEBAR_HEIGHT = 44

export const FONT_SIZE = {
  /** 文档标题（编辑器 H1）。全界面最大的一档 */
  display: 28,
  /** 页面标题：正文 H2、设置页 H1 */
  pageTitle: 19,
  /** 小节标题：正文 H3、卡片标题、空态标题 */
  section: 16,
  /** 界面正文：按钮、输入、对话正文 */
  body: 14,
  /** 文档连续阅读正文；与界面控件字号独立 */
  reading: 15,
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

/** Reading rhythm, independent of compact UI controls. */
export const READING_LINE_HEIGHT = 1.9
