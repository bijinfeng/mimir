import { createStyles } from 'antd-style'
import { CONTENT_WIDTH, FONT_MONO, FONT_SANS, FONT_SIZE } from './tokens'

/**
 * 编辑器外壳的主题桥。
 *
 * ## 它解决的是什么
 *
 * `@mimir/office` 里的编辑器外壳（`shell.css`、`editors.css`）读一份**自己的**
 * 自定义属性（`--me-*`，见 `shell.css` 顶部那张表）：底色、分隔线、正文与辅助
 * 字号、工具条的间距、弹层的阴影与圆角。这些东西 antd 的 token 体系里是有，
 * 但宿主必须**显式填进去**——CSS 自定义属性不会自己跨包流动。
 *
 * ## 它**不**负责什么（D-064 起）
 *
 * 工具条**控件**的观感归 antd（高度、内边距、圆角、边框、hover、焦点环、
 * 禁用态、控件字号），由 antd 自己的 `--ant-*` 承担——这个包现在依赖 antd。
 * 所以这里不再需要「把控件的高度也填一遍」，`--me-control-height` 由包内自己
 * 声明（`shell.css`），宿主不填。
 *
 * ## 为什么是 `createStyles` 而不是全局变量
 *
 * 这些值随外观（浅/深）变，而 `createStyles` 拿到的 `token` 已经是当前
 * 外观那一套。写死在 `:root` 上就得自己判断外观——`apps/web/AGENTS.md`
 * 明令不要那么做（「深色那一套也要走 token」）。
 *
 * ## 一条静默失效的坑
 *
 * CSS 自定义属性**只在声明它的元素及其子树**上生效。所以这个类必须挂在
 * 编辑器的祖先上，而不是随便一个兄弟节点。挂错的表现是「样式全都退回了
 * 回退值」——界面看起来是能用的（只是颜色不对），不会报错。
 */
export const useEditorThemeVars = createStyles(({ css, token }) => ({
  /**
   * 这一层同时是**布局链的一环**，不只是变量容器。
   *
   * `flex: 1; min-height: 0` 让它把父容器（`DocumentPanel` 的内容列）的高度
   * 传下去——编辑器自己写了 `flex: 1`，但它只能在**flex 容器里**吃掉剩余高度。
   * 一个默认的 `display: block` 包裹层会让链条在它这里断掉：实测编辑器只有
   * 219px 高（可用的是 800+），下面的滚动区缩成一条，页面大片留白。
   */
  vars: css`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;

    --me-text: ${token.colorText};
    --me-text-weak: ${token.colorTextTertiary};
    --me-border: ${token.colorBorderSecondary};
    /* 工具条与状态行用第四层填充：它比容器底暗一档，能托住控件而不抢内容 */
    --me-bar-bg: ${token.colorFillQuaternary};
    --me-surface: ${token.colorBgContainer};
    --me-hover: ${token.colorFillTertiary};
    --me-accent: ${token.colorPrimary};
    /**
     * 强调的**文字**角色。
     *
     * --me-accent 是 colorPrimary，它承担填充与描边（按钮底、选中底、
     * 边框、焦点环）；把它当文字用是 DESIGN §3.5 明令禁止的那一条——
     * 实测工具条按下态浅色 3.66:1、深色 **2.47:1**（#1668dc on #15325b），
     * 菜单「当前值」浅色 4.10:1、深色 3.50:1。
     *
     * 所以文字那一档另给 colorLink（它本来就是「强调文字」的角色，
     * 校准过：浅色 6.16:1、深色 8.74:1，落在 accent 底上是 5.50 / 6.17）。
     * 消费点只有两处，都在 shell.css：.me-tb[aria-pressed='true']
     * 与 .me-menu__item[aria-current='true']。
     *
     * 这段注释里不能出现反引号——它在 createStyles 的模板串里会终止字符串
     * （check-style-backticks 守着；实测已经踩过一次）。
     */
    --me-accent-text: ${token.colorLink};
    /* 激活态底色。用 antd 派生的浅阶而不是 colorPrimaryBg 的字面值——
       品牌色改了它自动跟着走 */
    --me-accent-bg: ${token.colorPrimaryBg};
    /* 焦点环描边。用派生阶而不是主色——正文区很大，主色的环比内容本身抢眼 */
    --me-accent-border: ${token.colorPrimaryBorder};
    --me-danger: ${token.colorErrorText};
    --me-danger-bg: ${token.colorErrorBg};
    /* 工作台（纸张与幻灯片之外的底）：比容器底暗，让「纸」浮起来 */
    --me-stage-bg: ${token.colorFillQuaternary};
    /* 浮层阴影（菜单、颜色面板，以及 pptx 幻灯片与 pdf 页面这两块「大画布」） */
    --me-shadow: ${token.boxShadowSecondary};
    /* 纸张阴影（docx 的 .doc-page）。**单列一档**：DESIGN §5.3 的 secondary
       是给浮层的，纸是「微浮起」的卡片，归 tertiary。原先纸张读的是
       --docs-page-shadow，那个变量只在一份没被 import 的 vendor 样式里，
       于是纸与工作台糊成一片（editors.css 的 .mimir-docx-scroll 记着） */
    --me-page-shadow: ${token.boxShadowTertiary};

    /* 正文列宽。笔记没有纸张，靠它把行宽收在可读范围内 */
    --me-content-width: ${CONTENT_WIDTH}px;

    --me-radius: ${token.borderRadius}px;
    --me-font: ${FONT_SANS};
    --me-font-mono: ${FONT_MONO};
    --me-font-size: ${FONT_SIZE.body}px;
    --me-font-size-sm: ${FONT_SIZE.note}px;
    /* 图标字形，非文本。跟着正文字号走一档 */
    --me-icon-size: ${FONT_SIZE.item}px;
  `,
}))
