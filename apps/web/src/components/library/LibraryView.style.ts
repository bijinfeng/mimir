import { createStyles } from 'antd-style'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 库视图（浏览态主区）的样式。
 *
 * 卡片网格：`auto-fill + minmax(260px, 1fr)`——列数由容器宽度决定，
 * 不写死断点（DESIGN §5.4）。260px 是「标题一行 + 摘要三行 + meta 一行」
 * 舒服展开的最小宽度；更窄的容器自动减列，更宽自动加列。
 */
export const useStyles = createStyles(({ css, token }) => ({
  page: css`
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: ${token.colorBgContainer};
  `,

  head: css`
    flex: none;
    padding: 18px 28px 14px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    display: flex;
    flex-direction: column;
    gap: 12px;
    /* 主区的头部要能撑满宽屏——内容列宽与详情共用同一条节奏 */
    max-width: 1080px;
    width: 100%;
    margin: 0 auto;
  `,
  headRow: css`
    display: flex;
    align-items: baseline;
    gap: 10px;
  `,
  title: css`
    font-size: ${FONT_SIZE.pageTitle}px;
    font-weight: 600;
    margin: 0;
    color: ${token.colorText};
  `,
  sub: css`
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextTertiary};
  `,

  body: css`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 18px 28px 28px;
  `,
  grid: css`
    max-width: 1080px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
    align-content: start;
  `,

  /* 卡片仍是 button（可键盘 tab 到，DESIGN §7.3），视觉是「一张卡」：
     底色 + 边框常驻（网格里卡片之间靠边界划分，hover 只是加深） */
  card: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 15px 12px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 10px;
    background: ${token.colorBgContainer};
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 0.12s ease-out,
      box-shadow 0.12s ease-out;

    &:hover {
      border-color: ${token.colorPrimaryBorder};
      box-shadow: ${token.boxShadowTertiary};
    }
  `,
  cardTitle: css`
    font-size: ${FONT_SIZE.body}px;
    font-weight: 600;
    color: ${token.colorText};
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  `,
  cardExcerpt: css`
    margin: 0;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.55;
    color: ${token.colorTextSecondary};
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    /* 摘要为空的卡片保持等高观感：占位但不可见 */
    min-height: calc(${FONT_SIZE.note}px * 1.55 * 2);
  `,
  cardMeta: css`
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: auto;
    padding-top: 4px;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
  `,
  spacer: css`
    margin-left: auto;
  `,

  /* 可点击的标签：比普通 Tag 多一层「这是筛选入口」的暗示（hover 提亮） */
  tagLink: css`
    cursor: pointer;

    &:hover {
      color: ${token.colorPrimary};
      border-color: ${token.colorPrimaryBorder};
    }
  `,

  format: css`
    color: ${token.colorTextQuaternary};
    white-space: nowrap;
  `,

  empty: css`
    padding: 64px 20px;
    text-align: center;
  `,
  emptyHint: css`
    display: block;
    margin-top: 6px;
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextTertiary};
    line-height: 1.9;
  `,

  loading: css`
    padding: 20px;
  `,
}))
