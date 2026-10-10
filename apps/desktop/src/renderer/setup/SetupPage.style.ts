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
   * 拖动区。这一页的标题栏**只有品牌 + 两枚控件**（没有折叠按钮——
   * 这里没有侧栏可折叠），所以不复用 `components/TitleBar.tsx`：
   * 那个组件的 props 是「侧栏折叠态」，在这里一项都不成立。
   *
   * 共用的是**样式常量与品牌件**（高度、BrandMark），那才是不该有第二份的东西。
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
    gap: 8px;
    color: ${token.colorPrimary};

    b {
      font-size: ${token.fontSize}px;
      font-weight: 700;
      letter-spacing: 0.06em;
      /* 文字用正文色而不是主色：主色作文字在白底上只有 4.10:1
         （.trellis/spec/project/design.md §3.5），品牌名不该是全页唯一不达标的文字 */
      color: ${token.colorText};
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
    /* minmax(0, 1fr) 而不是默认的 auto：auto 那一档的 track 最小尺寸是
       min-content，卡片上写死的宽度会把 track 撑开，窄窗口下整页横向溢出
       （与登录页记过的同一条，.trellis/spec/project/design.md §5.5） */
    grid-template-columns: minmax(0, 1fr);
    place-items: center;
    padding: 24px;
    overflow-y: auto;
  `,
  card: css`
    width: 520px;
    max-width: 100%;
  `,

  lead: css`
    /* antd 的 Paragraph 自带下边距，这里统一由卡片的间距节奏接管 */
    margin-bottom: 18px !important;
  `,

  /** 两个选项竖排：描述是整句话，并排会被压到换行 */
  options: css`
    display: grid;
    gap: 10px;
    margin-bottom: 16px;
  `,
  /**
   * 单个选项。**用原生 button 而不是 antd 的 Radio.Button**：这里的命中区是
   * 一整块卡片（标题 + 整句描述），而那个组件的内容模型是一行文字。
   *
   * 焦点环与悬停底色仍然走 token，所以观感与界面其余部分一致。
   */
  option: css`
    display: block;
    width: 100%;
    text-align: left;
    padding: 12px 14px;
    border: 1px solid ${token.colorBorder};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorBgContainer};
    color: ${token.colorText};
    cursor: pointer;
    transition:
      color 0.2s,
      background-color 0.2s,
      border-color 0.2s;

    &:hover {
      border-color: ${token.colorPrimaryBorderHover};
    }

    &:focus-visible {
      outline: 2px solid ${token.colorPrimaryBorder};
      outline-offset: 1px;
    }

    &[aria-pressed='true'] {
      border-color: ${token.colorPrimary};
      background: ${token.controlItemBgActive};
    }
  `,
  optionName: css`
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    margin-bottom: 4px;
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

  footnote: css`
    margin-top: 14px;
    color: ${token.colorTextTertiary};
  `,
}))
