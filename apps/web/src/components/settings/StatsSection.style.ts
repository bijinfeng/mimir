import { createStyles } from 'antd-style'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 热力图与统计表的样式（`docs/DESIGN.md` §3.6.1 / §8.12）。
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

    /* 标签颜色走 currentColor（库的 LabelsWeek / LabelsMonth 都写了
       fill: currentColor），所以在这里统一给一个弱化的文字色 */
    color: ${token.colorTextTertiary};

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
  legend: css`
    display: flex;
    align-items: center;
    gap: 3px;
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
}))

/** 统计分区的通用样式：范围切换那一行、按角色的表、页脚 */
export const useStatsStyles = createStyles(({ css, token }) => ({
  rangeRow: css`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextSecondary};
  `,

  /* ── 按角色的表 ──────────────────────────────────── */
  table: css`
    width: 100%;
    border-collapse: collapse;
    font-size: ${FONT_SIZE.excerpt}px;
    font-variant-numeric: tabular-nums;

    th {
      padding: 9px 16px;
      font-size: ${FONT_SIZE.badge}px;
      font-weight: 600;
      color: ${token.colorTextSecondary};
      text-align: right;
      border-bottom: 1px solid ${token.colorBorderSecondary};
    }
    th:first-child,
    th:nth-child(2) {
      text-align: left;
    }

    td {
      padding: 10px 16px;
      color: ${token.colorText};
      text-align: right;
      border-bottom: 1px solid ${token.colorBorderSecondary};
    }
    td:first-child,
    td:nth-child(2) {
      text-align: left;
    }
    tr:last-child td {
      border-bottom: none;
    }
  `,
  roleName: css`
    font-weight: 500;
  `,
  modelName: css`
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextSecondary};
  `,
  /** 0 与「—」比真实数字弱一档：它们是「没有」而不是「有个小数字」 */
  zero: css`
    color: ${token.colorTextTertiary};
  `,
  failed: css`
    color: ${token.colorErrorText};
  `,
  empty: css`
    padding: 18px 16px;
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextSecondary};
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
