import { FONT_SIZE, TITLEBAR_HEIGHT } from '@mimir/renderer/titlebar-kit'
import { createStyles } from 'antd-style'

/**
 * 自绘窗口标题栏的样式（D-094）。
 *
 * ## 高度是 `TITLEBAR_HEIGHT`，与页面头部同档（44px）
 *
 * 两处 44px 叠在一起会显得厚，所以标题栏**故意与页面头部同高**：
 * 视觉上它们读作「一条上铬条 + 一条下铬条」，节奏一致；而合并掉侧栏
 * 那条顶栏之后，垂直空间净增为零。
 *
 * ## macOS 的左侧让位写在这里，不写在组件里
 *
 * 三枚窗口控件的样式**不在这里**：它们在 `WindowControls.style.ts`，
 * 因为选择页也要用那一组而不需要标题栏的其余部分（D-103）。
 *
 * `--titlebar-pad-left` 按平台给：mac 的红绿灯（系统画）从 left 16 开始、
 * 三枚共 52px 宽，所以内容要右移到约 88px。Windows / Linux 没有这回事，
 * 保持 12px 的内边距。**用选择器而不是 JS 判断**——平台在构建时与运行时
 * 都不变，一个 `[data-platform]` 属性绑定就够了。
 */
export const useStyles = createStyles(({ css, token }) => ({
  bar: css`
    flex: none;
    display: flex;
    align-items: center;
    height: ${TITLEBAR_HEIGHT}px;
    padding-left: var(--titlebar-pad-left, 12px);
    background: ${token.colorBgLayout};
    /* 与下面侧栏/主区之间不画线：主区自己有一条头部界线，再画一条会
       出现「两道线夹着一条空带」（D-070 的去线原则） */
    -webkit-app-region: drag;
    user-select: none;

    &[data-platform='darwin'] {
      /* 红绿灯在 left 16，三枚 12px + 8px 间距 = 52px 宽 → 内容从 88px 起，
         与它们的右缘留出 20px 的呼吸 */
      --titlebar-pad-left: 88px;
    }
  `,

  /**
   * 品牌。字号比侧栏那条（16px）小一档——标题栏不是内容区，它整条
   * 44px 里只承载「这是哪个应用」，不需要与页面标题争视觉重量。
   */
  brand: css`
    flex: none;
    gap: 6px;
    margin-right: 0;

    b {
      font-size: ${FONT_SIZE.item}px;
      letter-spacing: 0.04em;
    }
  `,

  /**
   * 折叠开关。**它必须能点**（`-webkit-app-region: no-drag`），
   * 而它周围整条是拖动区——这一对的正确性靠一个类，漏了就变成
   * 「按钮点不动」（不报错、控制台也没有任何东西）。
   */
  toggle: css`
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    margin-left: 6px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: ${token.colorTextSecondary};
    cursor: pointer;
    -webkit-app-region: no-drag;

    &:hover {
      background: ${token.colorFillTertiary};
      color: ${token.colorText};
    }
  `,

  spacer: css`
    flex: 1;
    min-width: 0;
    height: 100%;
  `,
}))
