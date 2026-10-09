import { TITLEBAR_HEIGHT } from '@mimir/renderer/titlebar-kit'
import { createStyles } from 'antd-style'

/**
 * 三枚窗口控件的样式（D-094）。
 *
 * 从 `TitleBar.style.ts` 拆出来：选择页也要用这一组（D-103），而那一页
 * 没有标题栏的其余部分（折叠按钮、品牌让位）。放在一起的话，选择页要么
 * 连不需要的样式一起引，要么抄一份——后者就是搬迁前的状态。
 */
export const useStyles = createStyles(({ css, token }) => ({
  controls: css`
    flex: none;
    display: flex;
    align-self: stretch;
    height: ${TITLEBAR_HEIGHT}px;
  `,

  /**
   * 单枚控件：46×44，与 Windows 11 一致。
   *
   * **不用我们自己的 `.me-btn` 观感**（圆角、悬停底色）：这三枚是**窗口
   * 级**控件，用户在同一个系统里所有窗口上都见过它们——画成应用风格的
   * 圆角小按钮会让人迟疑「这是不是应用自己的按钮」。系统约定优先。
   */
  ctl: css`
    width: 46px;
    height: ${TITLEBAR_HEIGHT}px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    color: ${token.colorTextSecondary};
    cursor: default;
    padding: 0;
    -webkit-app-region: no-drag;

    &:hover {
      background: ${token.colorFillTertiary};
      color: ${token.colorText};
    }

    &:focus-visible {
      outline: 2px solid ${token.colorPrimaryBorder};
      outline-offset: -2px;
    }
  `,

  /**
   * 关闭：悬停红底白字。**Windows 的约定**，也是唯一一处用危险色而
   * 不需要确认的地方（系统级动作，用户按之前就知道会发生什么）。
   * 深浅两套都用同一个红——它与应用的语义色系统无关，是平台语言。
   */
  ctlClose: css`
    &:hover {
      background: #e81123;
      color: #ffffff;
    }
  `,
}))
