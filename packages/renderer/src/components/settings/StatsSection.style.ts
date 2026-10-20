import { createStyles } from 'antd-style'
import { FONT_SIZE } from '../../theme/tokens'

/**
 * 热力图与统计表的样式（`.trellis/spec/project/design.md` §3.6.1 / §8.12）。
 *
 * ## 颜色只有一个来源
 *
 * 热力图的色值要同时喂给两处：`createStyles`（图例色块、斜线）与
 * SVG 的 `fill`（由库渲染的格子）。后者只能拿到字符串，所以这里把
 * token 展开成 CSS 变量挂在容器上，组件里用 `var(--mimir-heat-*)` 引用——
 * 比在组件里 import 色值常量更稳：色值仍然只在这里定义一次。
 *
 * ## 空格子不用白色
 *
 * 用 `colorFillQuaternary`（一层很淡的灰）。理由是这条：antd 的
 * `colorPrimaryBg`（`#e6f4ff`）与白底只差 1.05:1，拿它当最浅档会让
 * 「有一点活动」和「完全没活动」在屏幕上几乎一样——而**这正是贡献图
 * 最常见的失败**。最浅档往下压（`heatL1`），空格子反过来填浅灰，两边让开。
 *
 * ## 「未知」用斜线而不是颜色
 *
 * 它是**唯一的非颜色线索**，色盲用户也能分辨；只靠一个更浅的颜色，
 * 在四档色阶里根本认不出来。
 */
export const useHeatmapStyles = createStyles(({ css, token }) => ({
  /**
   * 左侧内边距**刻意小于右侧**（8px vs 16px）。
   *
   * 图的宽度是按列数算死的（库的列数从容器宽度推，交给 CSS 自适应会
   * 静默丢天），所以这里必须给它留够位置：一年 54 列 = 730px，
   * 面板内宽 758px，左 8 + 右 16 刚好放得下，**不会出现横向滚动条**。
   * 用对称的 16px 会让它超 4px，于是多一条滚动条看起来像渲染坏了。
   */
  wrap: css`
    /* 库的 SVG 用 var() 取色，变量在这里定义——色值仍然只有这一处 */
    --mimir-heat-empty: ${token.colorFillQuaternary};
    --mimir-heat-l1: ${token.heatL1};
    --mimir-heat-l2: ${token.heatL2};
    --mimir-heat-l3: ${token.heatL3};
    --mimir-heat-l4: ${token.heatL4};

    padding: 14px 16px 16px 8px;

    /* 库自带的 hover / active 色改成我们的 token（它默认是 GitHub 的绿） */
    --rhm-rect-hover-stroke: ${token.colorPrimaryBorder};
    --rhm-rect-active: ${token.heatL4};

    /* 月份 / 星期标签的颜色。
       库在 svg 上写了**内联**样式 —— color: var(--rhm-text-color, #24292e)
       （esm/SVG.js），标签自己是 fill: currentColor，所以同元素上的
       color 压不过它，只能给这个变量赋值。不给的表现是深色下标签用库的
       回退色 #24292e 画在 #141618 的底上，实测 1.23:1：整条时间轴等于
       没画（哪一列是哪个月、哪一行是星期几都读不出来）。浅色下同一个
       回退值是 14:1，所以这个洞只在深色露出来。 */
    --rhm-text-color: ${token.colorTextTertiary};

    /* 库的格子默认带 cursor: pointer，但这里点击没有行为——
       留下手型会让人以为可以点开（DESIGN §7.4 的同一条判断） */
    rect {
      cursor: default;
    }
  `,

  /**
   * 只让**图**滚动，不连图例一起滚。
   *
   * 一开始把 `overflow-x` 放在 `wrap` 上，结果滚动条出现在图例下方——
   * 图例是说明文字，它不该跟着图横向移动（窄屏下滚过去就看不到「少/多」了）。
   */
  chartScroll: css`
    overflow-x: auto;
    overflow-y: hidden;

    &:focus-visible {
      outline: 2px solid ${token.focusRing};
      outline-offset: 2px;
      border-radius: 4px;
    }
  `,

  /**
   * 只在窄屏出现。图本身必须保持列的日历形状，不能压缩成看不清的格子；
   * 于是明确告诉用户这里可以滑动，而不是让图看起来被裁掉。
   */
  scrollHint: css`
    display: none;
    margin: 6px 0 0;
    font-size: ${FONT_SIZE.badge}px;
    line-height: 1.6;
    color: ${token.colorTextTertiary};
    @media (max-width: 575px) {
      display: block;
    }
  `,

  /**
   * 图的宽度由组件按列数算好（`style={{ width }}`）——库的列数是
   * 从容器宽度推的，交给 CSS 自适应会静默丢掉放不下的那几天。
   * 这里只禁止它被压扁。
   */
  chart: css`
    display: block;
    flex: none;
  `,

  /**
   * 斜线：`stroke` 而不是 `fill`，所以它不参与色阶，也不受填充影响。
   * `vector-effect` 让描边宽度不随 SVG 缩放变化（库的 svg 是 100% 宽）。
   */
  hatchLine: css`
    stroke: ${token.colorTextQuaternary};
    stroke-width: 1.5;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  `,
  hatchSwatch: css`
    display: block;
    flex: none;
    vertical-align: middle;
  `,

  /* ── 图例 ─────────────────────────────────────────── */
  /**
   * 图例**允许换行**（`flex-wrap`）。
   *
   * 它是说明文字，不是图的一部分：窄窗口下它比面板宽（420px 视口里
   * 实测 clientWidth 266 / scrollWidth 427），而不换行时面板的
   * `overflow: hidden` 直接把尾部切掉——「这一年还没有用量 · 按
   * Asia/Shanghai 聚合」停在半个字上，没有省略号，看起来像文案本来就
   * 是断的，而**聚合口径**恰恰是这张图唯一需要声明的口径。
   *
   * 与图不同待遇：图有 `chartScroll` 的横向滚动（它必须保持列的
   * 形状），图例宁可折到第二行。
   */
  legend: css`
    display: flex;
    align-items: center;
    gap: 3px;
    row-gap: 4px;
    flex-wrap: wrap;
    margin-top: 8px;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
  `,
  legendLabel: css`
    padding: 0 3px;
    white-space: nowrap;
  `,
  legendNote: css`
    margin-left: 8px;
    white-space: nowrap;
  `,
  swatch: css`
    width: 11px;
    height: 11px;
    border-radius: 2px;
    flex: none;
  `,
  swatchEmpty: css`
    background: ${token.colorFillQuaternary};
    fill: ${token.colorFillQuaternary};
  `,
  swatch1: css`
    background: ${token.heatL1};
  `,
  swatch2: css`
    background: ${token.heatL2};
  `,
  swatch3: css`
    background: ${token.heatL3};
  `,
  swatch4: css`
    background: ${token.heatL4};
  `,
  /* 无记录时的说明。「没有」要说得出来——不然热力图面板只剩一个标题 */
  empty: css`
    padding: 18px 16px;
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextSecondary};
  `,
}))

/** 统计分区的通用样式：按角色的表与页脚 */
export const useStatsStyles = createStyles(({ css, token, prefixCls }) => ({
  /* ── 按角色的表 ──────────────────────────────────── */
  /**
   * antd `Table` 的外层容器。
   *
   * ## 为什么只改这几处，而不是把表格样式重写一遍
   *
   * 表头底色、单元格内边距、行 hover、边框在深浅两套主题下都已经由
   * antd 的 token 校准过——自己写一遍等于抄一份会漂移的副本，而
   * 「两份样式各自演化」正是这个项目反复记录的那类问题。
   * 所以这里只做三件 antd 不知道的事：
   *
   *  1. **列宽与对齐**：数值列右对齐（在 `columns` 里给 `align: 'right'`），
   *     数字用等宽字形（`tabular-nums`），扫读时不跳
   *  2. **字号**：表格用 `excerpt` 档，与设置页其它密集内容一致
   *  3. **单元格里的语义色**：`.stats-*` 那几条——列定义是模块级常量
   *     （`StatsSection.tsx` 的 `ROLE_COLUMNS`），拿不到 `createStyles`
   *     返回的类名，所以用嵌套选择器在这里一次性定义
   *
   * 顶部那条外边框去掉：面板标题已经有一条分隔线，再来一条会变成双线。
   */
  table: css`
    font-size: ${FONT_SIZE.excerpt}px;
    font-variant-numeric: tabular-nums;

    /* 面板标题下面已经有一条线，表格自己不再画一条 */
    .${prefixCls}-table-container {
      border-start-start-radius: 0;
      border-start-end-radius: 0;
    }
    /**
     * **只留行分隔线，去掉列之间的竖线。**
     *
     * antd 的默认表格画竖线（border-inline-end），那是给宽表用的——
     * 列一多、一行很长时，竖线帮视线横向对齐。这里只有六列、内容很短，
     * 竖线只是把已经很干净的一行切成格子，而且面板本身已经是一层容器，
     * 再来一层网格是双重的分隔（与设置页「面板不套 Card」是同一条判断）。
     *
     * 行分隔线保留：它是**行**的分隔，扫读一行到下一行时需要它。
     */
    .${prefixCls}-table-thead > tr > th {
      font-size: ${FONT_SIZE.badge}px;
      font-weight: 600;
      color: ${token.colorTextSecondary};
      background: ${token.tintList};

      &::before {
        display: none;
      }
    }
    .${prefixCls}-table-tbody > tr > td {
      border-inline-end: none;
    }

    /* 单元格内的语义色。列定义是模块级常量，拿不到类名，所以在这里定义 */
    .stats-role {
      font-weight: 500;
      color: ${token.colorText};
    }
    .stats-model {
      font-family: ${token.fontFamilyCode};
      font-size: ${FONT_SIZE.meta}px;
      color: ${token.colorTextSecondary};
    }
    /** 0 与「—」比真实数字弱一档：它们是「没有」而不是「有个小数字」 */
    .stats-zero {
      color: ${token.colorTextTertiary};
    }
    .stats-failed {
      color: ${token.colorErrorText};
    }
  `,
  empty: css`
    padding: 18px 16px;
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextSecondary};
  `,
  emptyLink: css`
    display: block;
    width: fit-content;
    margin-top: 8px;
    color: ${token.colorLink};
    &:focus-visible {
      outline: 2px solid ${token.colorPrimaryBorder};
      outline-offset: 2px;
    }
  `,

  footer: css`
    padding: 12px 16px;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.8;
    color: ${token.colorTextSecondary};
    border-top: 1px solid ${token.colorBorderSecondary};
  `,
  footerStrong: css`
    font-weight: 600;
    color: ${token.colorText};
  `,
}))
