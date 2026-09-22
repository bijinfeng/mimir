import { createStyles } from 'antd-style'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 左导航的样式。
 *
 * 形态参照一份桌面应用侧栏：**顶部的动作列表、素文字分区标签、
 * 行内右侧对齐的弱化元信息**。三条都是刻意的：
 *
 *  1. **动作列表**（图标 + 文字 + 右侧快捷键）比一排按钮好——
 *     它把「能做什么」摊平成可扫读的清单，而不是让人去找按钮
 *  2. **素文字分区标签**（不是带箭头的大标题）——分区是**路标**，
 *     不该比它所标示的内容更显眼
 *  3. **右侧对齐的元信息**（计数、相对时间）——它让每一行的左侧
 *     对齐成一条整齐的竖线，扫读时视线不用来回跳
 *
 * 组件形态见 `docs/DESIGN.md` §8，字号一律走 `FONT_SIZE`（D-017）。
 */
export const useStyles = createStyles(({ css, token, prefixCls }) => ({
  nav: css`
    height: 100%;
    display: flex;
    flex-direction: column;
    background: ${token.tintNav};
    border-right: 1px solid ${token.colorBorderSecondary};
  `,

  /* ── 顶栏：品牌 + 前进/后退 ─────────────────────────── */
  topBar: css`
    flex: none;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 12px 10px 10px 14px;
  `,
  brandLockup: css`
    display: flex;
    align-items: center;
    gap: 7px;
    margin-right: auto;
    color: ${token.colorPrimary};

    b {
      font-size: ${FONT_SIZE.section}px;
      font-weight: 700;
      letter-spacing: 0.06em;
      /* 文字用正文色而不是主色：主色 #1677ff 作文字在白底上只有 4.10:1
         （docs/DESIGN.md §3.5），品牌名不该是全页唯一不达标的文字 */
      color: ${token.colorText};
    }
  `,

  /* ── 主体：一个可滚动的 Menu + 一个 Tree ─────────────── */
  body: css`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 6px;
  `,

  /**
   * antd Menu 的收敛。
   *
   * Menu 默认是给「应用级导航」调的：字号偏大、行高偏松、选中态是右侧一条蓝线。
   * 这里的侧栏信息密度更高，需要收紧；选中态也换成整行浅底（与列表项一致）。
   */
  menu: css`
    background: transparent;
    border-inline-end: none !important;
    font-size: ${FONT_SIZE.item}px;

    /* 行高与内边距：比 antd 默认紧，但仍留出可点击的余量 */
    .${prefixCls}-menu-item,
    .${prefixCls}-menu-submenu-title {
      height: 30px;
      line-height: 30px;
      margin: 1px 6px;
      padding-inline: 8px !important;
      border-radius: 6px;
      color: ${token.colorTextSecondary};
    }

    .${prefixCls}-menu-item:hover {
      background: ${token.colorFillTertiary};
    }

    /* 选中态：整行浅底 + 链接色文字。用 colorLink 而不是 colorPrimary
       ——主色作文字在浅蓝底上只有 3.61:1（DESIGN §3.2） */
    .${prefixCls}-menu-item-selected {
      background: ${token.colorPrimaryBg} !important;
      color: ${token.colorLink} !important;
      font-weight: 500;
    }

    /* antd 默认给选中项右侧加一条竖线，与「整行浅底」重复了 */
    .${prefixCls}-menu-item-selected::after {
      display: none;
    }

    .${prefixCls}-menu-item-icon {
      font-size: ${FONT_SIZE.item}px;
      opacity: 0.65;
      margin-inline-end: 8px;
    }

    /* 分区标签：素文字，不抢内容。
       参考里它是很轻的一行，而不是带箭头的大标题 */
    .${prefixCls}-menu-item-group-title {
      padding: 14px 6px 4px 14px;
      font-size: ${FONT_SIZE.badge}px;
      font-weight: 600;
      color: ${token.colorTextTertiary};
      letter-spacing: 0.02em;
    }

    /* 右侧元信息（计数 / 相对时间）。**这一栏是扫读的锚点**——
       它让每行左边的内容对齐成一条竖线 */
    .${prefixCls}-menu-item-extra {
      font-size: ${FONT_SIZE.badge}px;
      color: ${token.colorTextTertiary};
      font-variant-numeric: tabular-nums;
      margin-inline-start: 8px;
    }

    /* 选中项的计数跟着变成链接色，否则浅蓝底上会有一块灰字显得脏 */
    .${prefixCls}-menu-item-selected .${prefixCls}-menu-item-extra {
      color: ${token.colorLink};
    }

    .${prefixCls}-menu-item-divider {
      margin: 8px 12px 8px 10px;
      border-color: ${token.colorBorderSecondary};
    }
  `,

  /* ── 目录树 ──────────────────────────────────────────
     Tree 不在 Menu 里：Menu 是扁平的，而目录是层级结构。
     两处的行高与选中态必须看起来是同一套东西 */
  treeGroup: css`
    padding: 0 6px;
  `,
  treeWrap: css`
    .${prefixCls}-tree {
      background: transparent;
      font-size: ${FONT_SIZE.item}px;
    }

    .${prefixCls}-tree-node-content-wrapper {
      height: 28px;
      line-height: 28px;
      padding-inline: 6px !important;
      border-radius: 6px;
      color: ${token.colorTextSecondary};
    }

    .${prefixCls}-tree-node-selected .${prefixCls}-tree-node-content-wrapper {
      background: ${token.colorPrimaryBg};
      color: ${token.colorLink};
    }
  `,
  treeCount: css`
    margin-inline-start: 6px;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
    font-variant-numeric: tabular-nums;
  `,

  emptyHint: css`
    padding: 2px 14px 6px;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.7;
    color: ${token.colorTextTertiary};
  `,

  /* ── 底部 ──────────────────────────────────────────── */
  foot: css`
    flex: none;
    border-top: 1px solid ${token.colorBorderSecondary};
    padding: 4px 0;
  `,
}))
