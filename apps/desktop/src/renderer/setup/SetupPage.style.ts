import { TITLEBAR_HEIGHT } from '@mimir/renderer/titlebar-kit'
import { createStyles } from 'antd-style'

/**
 * 首启选择页的样式（D-100 / D-103）。
 *
 * 全部值走 antd token——这一页原先是自包含的静态 HTML，手抄了一套
 * `--bg` / `--text` / `--border` 变量与一份深色媒体查询。那份拷贝与设计系统
 * 必然漂移，且漂移是**静默**的：两边都「看着对」，并排放才发现不一样。
 */
export const useStyles = createStyles(({ css, token }) => ({
  page: css`
    height: 100%;
    display: flex;
    flex-direction: column;
    background: ${token.colorBgLayout};
  `,

  /**
   * 拖动区。这一页的标题栏只有窗口控件（没有折叠按钮——
   * 这里没有侧栏可折叠），所以不复用 `components/TitleBar.tsx`：
   * 那个组件的 props 是「侧栏折叠态」，在这里一项都不成立。
   *
   * 共用的是高度与窗口控件；品牌件放在下方的入口品牌区。
   */
  bar: css`
    flex: none;
    display: flex;
    align-items: center;
    height: ${TITLEBAR_HEIGHT}px;
    padding-left: var(--titlebar-pad-left, 16px);
    -webkit-app-region: drag;
    user-select: none;

    &[data-platform='darwin'] {
      /* 给系统红绿灯让位，与主界面标题栏同一个值（D-094） */
      --titlebar-pad-left: 88px;
    }
  `,
  brand: css`
    display: flex;
    align-items: center;
    gap: 12px;
    color: ${token.colorLink};
  `,
  brandName: css`
    margin: 0 !important;
    color: ${token.colorText} !important;
    font-weight: 700 !important;
    letter-spacing: 0.06em;
  `,
  brandPosition: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    @media (max-width: 760px) {
      display: none;
    }
  `,
  spacer: css`
    flex: 1;
    min-width: 0;
    height: 100%;
  `,

  body: css`
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(320px, 2fr) minmax(0, 3fr);
    overflow: auto;
    @media (max-width: 760px) {
      grid-template-columns: minmax(0, 1fr);
      align-content: start;
      background: ${token.colorBgContainer};
    }
  `,
  brandPane: css`
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-width: 0;
    padding: clamp(32px, 5vw, 72px);
    background: ${token.tintNav};
    border-right: 1px solid ${token.colorBorderSecondary};
    @media (max-width: 760px) {
      padding: 28px 28px 20px;
      border-right: 0;
      border-bottom: 1px solid ${token.colorBorderSecondary};
    }
  `,
  formPane: css`
    min-width: 0;
    display: grid;
    place-items: center;
    padding: 48px 28px;
    background: ${token.colorBgContainer};
    @media (max-width: 760px) {
      display: block;
      padding: 40px 28px 56px;
    }
  `,
  formContent: css`
    width: min(100%, 440px);
    min-width: 0;
  `,
  heading: css`
    margin: 0 0 22px !important;
  `,

  lead: css`
    /* antd 的 Paragraph 自带下边距，这里统一由卡片的间距节奏接管 */
    margin-bottom: 24px !important;
  `,

  options: css`
    display: grid;
    margin-bottom: 24px;
    border-top: 1px solid ${token.colorBorderSecondary};
  `,
  /**
   * 单个选项。**用原生 button 而不是 antd 的 Radio.Button**：这里的命中区是
   * 一整块卡片（标题 + 整句描述），而那个组件的内容模型是一行文字。
   *
   * 焦点环与悬停底色仍然走 token，所以观感与界面其余部分一致。
   */
  option: css`
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    align-items: center;
    gap: 14px;
    width: 100%;
    text-align: left;
    padding: 16px 14px;
    border: 0;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    border-radius: 0;
    background: ${token.colorBgContainer};
    color: ${token.colorText};
    cursor: pointer;
    transition:
      color 0.2s,
      background-color 0.2s,
      border-color 0.2s;

    &:hover {
      background: ${token.tintHover};
    }

    &:focus-visible {
      outline: 2px solid ${token.colorPrimaryBorder};
      outline-offset: 1px;
    }

    &[aria-pressed='true'] {
      color: ${token.colorLink};
      background: ${token.colorPrimaryBg};
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.65;
    }
  `,
  optionText: css`
    display: flex;
    flex-direction: column;
    min-width: 0;
  `,
  optionName: css`
    font-weight: 600;
  `,
  optionDesc: css`
    display: block;
    color: ${token.colorTextSecondary};
    line-height: 1.7;
  `,

  field: css`
    margin-bottom: 16px;
  `,

  row: css`
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  `,
}))
