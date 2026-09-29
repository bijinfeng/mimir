import { createStyles } from 'antd-style'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 库视图（浏览态主区）的样式。
 *
 * 卡片网格：`auto-fill + minmax(260px, 1fr)`——列数由容器宽度决定，
 * 不写死断点（DESIGN §5.4）。260px 是「标题一行 + 摘要三行 + meta 一行」
 * 舒服展开的最小宽度；更窄的容器自动减列，更宽自动加列。
 *
 * ## 内容列的两侧留白只给一次
 *
 * 头部与列表是在同一个内容盒里的两段，所以**两侧留白挂在 `page` 上**，
 * 头部与 body 自己不再加左右内边距。曾经两处各写 28px：头部的正文
 * （标题、搜索框）落在内容盒里再内缩 28px，而卡片网格直接贴着内容盒
 * ——实测标题与搜索框在 308、卡片外框在 280，第一眼就是「没对齐」。
 * 现在两者的外沿是同一条竖线（卡片的内边距仍按 DESIGN §5.1 给 15px，
 * 那是卡片自己的形状，不是列的位置）。
 */
export const useStyles = createStyles(({ css, token }) => ({
  page: css`
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 0 28px;
    background: ${token.colorBgContainer};
  `,

  head: css`
    flex: none;
    padding: 18px 0 14px;
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
    align-items: center;
    justify-content: space-between;
    /* 窄窗口里标题先占满一行、两个入口落到下一行，而不是把「全部文档」
       与「17 条」各自挤成两行（DESIGN §0.2：状态不能被折成一团） */
    flex-wrap: wrap;
    gap: 12px;
  `,
  headTitle: css`
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
  `,
  title: css`
    font-size: ${FONT_SIZE.pageTitle}px;
    font-weight: 600;
    margin: 0;
    color: ${token.colorText};
    /* 标题与计数各自不折行：空间不够时由标题截断（下面那条 ellipsis），
       计数保持完整——「17 / 条」被拆开读起来像渲染坏了 */
    white-space: nowrap;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  `,
  sub: css`
    flex: none;
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextTertiary};
    white-space: nowrap;
  `,
  headActions: css`
    flex: none;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  `,
  searchRow: css`
    display: flex;
    align-items: center;
    gap: 12px;
  `,

  body: css`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 18px 0 28px;
  `,
  grid: css`
    max-width: 1080px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
    align-content: start;
  `,

  /* ── 列表布局 ────────────────────────────────────────
     行条消费与卡片同一份 items，扫读对象从「摘要」换成「标题清单」。
     通用形态仍是卡片而不是通栏分隔线（DESIGN §8.2：靠留白划分边界
     比靠 1px 线扫读快）——区别是行的留白更薄、摘要只剩一行 */
  list: css`
    max-width: 1080px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  `,
  row: css`
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
    padding: 9px 12px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background 0.12s ease-out,
      border-color 0.12s ease-out,
      box-shadow 0.12s ease-out;

    &:hover {
      background: ${token.colorFillTertiary};
    }

    /* 与卡片同一套焦点线索（DESIGN §7.2）；行条静息时边框是透明的，
       聚焦时把它提亮到与卡片一致 */
    &:focus-visible {
      border-color: ${token.colorPrimaryBorder};
      box-shadow: 0 0 0 3px ${token.controlOutline};
      outline: none;
    }
  `,
  rowTop: css`
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  `,
  rowTitle: css`
    flex: 1;
    min-width: 0;
    font-size: ${FONT_SIZE.body}px;
    font-weight: 600;
    color: ${token.colorText};
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `,
  rowTime: css`
    flex: none;
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextTertiary};
    font-variant-numeric: tabular-nums;
  `,
  rowBottom: css`
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
  `,
  rowExcerpt: css`
    flex: 1;
    min-width: 0;
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextSecondary};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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

    /*
     自定义 button 没有 antd 的焦点环兜底，必须自己补（DESIGN §7.2）：
     一圈柔光 + 边框提亮，与搜索框那种 antd 控件是同一套观感。
     柔光用 token.controlOutline 而不是字面量 rgba——它是 antd 按当前
     主色与底色算好的半透明主色，换外观时跟着变（与 Composer 同一处做法）。
    */
    &:focus-visible {
      border-color: ${token.colorPrimaryBorder};
      box-shadow: 0 0 0 3px ${token.controlOutline};
      outline: none;
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
  /**
   * 卡片元信息行。
   *
   * ## 为什么时间要在这一层、而不是跟着标签一起折
   *
   * 这一行是「徽标 + 标签 + 格式 …… 时间」。原先它们在一个 `flex-wrap`
   * 容器里平铺：标签多到换行时，时间也被挤到第二行——实测同一排四张卡
   * 的卡片高度都是 144px，而时间分别落在两个高度上（一张卡 meta 盒
   * 49px、其余 20–26px）。沿一排往下扫「什么时候更新的」时对不齐，
   * 时间列就失去了意义（DESIGN §8.2 的形态是一行）。
   *
   * 所以分成两层：外层**不折行**、按**基线**对齐（时间与标签的文字坐在
   * 同一条基线上——「同一行」的准确含义是基线，不是盒顶）；折行只发生在
   * 内层的「徽标 + 标签 + 格式」里，折成两行时时间的基线仍取自第一行。
   */
  cardMeta: css`
    display: flex;
    align-items: baseline;
    gap: 7px;
    margin-top: auto;
    padding-top: 4px;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
  `,
  cardMetaMain: css`
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 7px;
    flex: 1 1 auto;
    min-width: 0;
  `,
  spacer: css`
    flex: none;
    margin-left: auto;
  `,

  /* 可点击的标签：比普通 Tag 多一层「这是筛选入口」的暗示（hover 提亮）
     ——`colorPrimary` 是**填充**角色，当文字用不达标（深色下实测 2.82:1，
     浅色 3.80:1，都低于 AA）；文字角色一律走 `colorLink`（DESIGN §3.5） */
  tagLink: css`
    cursor: pointer;

    &:hover {
      color: ${token.colorLink};
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
  /* 空态的动作行：Empty 的 children 渲染在 description 之下 */
  emptyActions: css`
    margin-top: 16px;
    display: flex;
    justify-content: center;
    gap: 10px;
  `,

  loading: css`
    padding: 20px;
  `,
}))
