import { createStyles } from 'antd-style'
import { FONT_SIZE } from '@/theme/tokens'

/** 中栏的样式。单独成文件是因为它占了这个组件一半的篇幅 */
export const useStyles = createStyles(({ css, token }) => ({
  col: css`
    height: 100%;
    display: flex;
    flex-direction: column;
    background: ${token.tintList};
    border-right: 1px solid ${token.colorBorderSecondary};
  `,

  head: css`
    flex: none;
    padding: 12px 12px 10px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    display: flex;
    flex-direction: column;
    gap: 10px;
  `,
  headRow: css`
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  title: css`
    font-size: ${FONT_SIZE.body}px;
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
    /* 6px 的上下留白：卡片与列边缘之间要有呼吸，否则贴边时看不出是卡片
       （与 item 的 margin 相加 = 12px 的可视外边距） */
    padding: 6px 0;
  `,

  /* 列表项用 button：可点击的东西就该能被键盘 tab 到（DESIGN.md §7.3）。
     做成**卡片**（圆角 + 内边距 + 项间留白）而不是通栏分隔线：
     列表项的边界靠留白划分时，扫读速度明显快于靠 1px 线——线会让整列
     变成一张表格，而这里是一堆**内容摘要**，不是表格行。 */
  item: css`
    display: block;
    width: calc(100% - 12px);
    margin: 0 6px 3px;
    padding: 10px 11px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s ease-out;

    &:hover {
      background: ${token.colorFillTertiary};
    }
  `,
  /* 选中态：浅底 + 一道内描边。列表里 hover 与选中经常同时出现，
     只靠底色深浅分不出来（两者都是浅灰/浅蓝），所以这里**确实**需要一条
     边界——但不是靠描边颜色够深，而是靠**边框占位**：未选中时边框是
     transparent（占住 1px），选中时换成主色的浅阶。这样既不加粗也不位移。 */
  itemActive: css`
    background: ${token.colorPrimaryBg};
    border-color: ${token.colorPrimaryBorder};

    &:hover {
      background: ${token.colorPrimaryBg};
    }
  `,
  itemTop: css`
    display: flex;
    align-items: center;
    gap: 7px;
  `,
  itemTitle: css`
    flex: 1;
    min-width: 0;
    font-size: ${FONT_SIZE.item}px;
    font-weight: 500;
    color: ${token.colorText};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  itemExcerpt: css`
    margin: 3px 0 0;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.5;
    color: ${token.colorTextSecondary};
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  `,
  itemMeta: css`
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 6px;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
  `,
  spacer: css`
    margin-left: auto;
  `,

  /* 格式与大小（「PDF · 2.4 MB」）。**中性文字色**——
     它是一条属性而非状态：彩色徽标只给「来源」用（DESIGN §0.1、§3.7），
     而格式是文件的属性，不该每加一种就多占一个色位 */
  format: css`
    color: ${token.colorTextQuaternary};
    white-space: nowrap;
  `,

  /* 引用卡多一行：它是被哪个通道命中的。
     这一行让「为什么是这篇」有据可查（PRD §5.2） */
  citeStep: css`
    margin-top: 5px;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
  `,

  empty: css`
    padding: 44px 20px;
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
    padding: 14px;
  `,

  hint: css`
    padding: 8px 14px 4px;
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextTertiary};
    line-height: 1.7;
  `,
}))
