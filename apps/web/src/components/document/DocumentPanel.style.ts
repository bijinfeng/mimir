import { createStyles } from 'antd-style'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 文档视图的样式。
 *
 * 单独成文件的原因：正文排版（Tiptap 渲染出的裸 DOM）与只读正文的
 * 样式覆写加起来三百多行，混在组件文件里会把逻辑挤到看不见。
 * 规范见 `docs/DESIGN.md` §4.3 / §5。
 */
export const useStyles = createStyles(({ css, token, prefixCls }) => ({
  wrap: css`
    height: 100%;
    display: flex;
    flex-direction: column;
    background: ${token.colorBgContainer};
  `,

  toolbar: css`
    flex: none;
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  path: css`
    flex: 1;
    min-width: 0;
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextTertiary};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  /* 工具条按钮。默认的 antd Button 是「控件」的重量（有底色、有边框），
     而工具条上的它更像一个**动作入口**——原型用无底色 + hover 才显形，
     这样工具条读起来是一条安静的路径栏，不是一个表单。
     用 antd Button 的 type="text" 做底，这里只补文字尺寸与间距。 */
  tbBtn: css`
    flex: none;
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextSecondary};

    &:hover {
      color: ${token.colorText} !important;
    }
  `,
  /**
   * 工具条上的保存状态。
   *
   * 它是个 button 只为了让**失败态能点**（重试），所以要把按钮的外观全部
   * 去掉、只留文字。非失败态 `disabled`，于是没有 hover 反馈——一个可点
   * 却无事发生的状态显示是最坏的一种（`docs/DESIGN.md` §8.9 同一条理由）。
   *
   * 它原先渲染在正文上方、标题与元信息之间：一块只有「已保存」三个字的
   * 独立行，两侧都空，看起来像没画完；而且**位置会跳**——状态出现与消失时
   * 整块正文上下移动。移到常驻且不占额外高度的工具条上，与路径、问 AI 同级，
   * 也正是 `docs/PRD.md` §5.9 写的「工具条常驻」。
   */
  save: css`
    flex: none;
    padding: 0;
    border: none;
    background: none;
    font-family: inherit;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextQuaternary};
    cursor: default;

    /* 非失败态一律 disabled，用它的文字色代表「已完成/进行中」 */
    &:disabled {
      color: ${token.colorSuccessText};
    }
  `,
  /* 失败态：可点、有下划线、用错误色。加上 :disabled 是为了盖过上面那条 */
  saveError: css`
    text-decoration: underline;
    text-underline-offset: 2px;

    &,
    &:disabled {
      color: ${token.colorErrorText};
      cursor: pointer;
    }
  `,

  scroll: css`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    position: relative;
  `,
  cols: css`
    display: flex;
    align-items: flex-start;
    justify-content: center;
  `,
  inner: css`
    flex: 1;
    min-width: 0;
    max-width: 760px;
    padding: 24px 40px 140px;
  `,

  /* 右侧大纲。只在标题数 ≥ 2 时出现——两段话的笔记不需要目录，
     常驻只是白占 196px（docs/PRD.md §5.10） */
  outline: css`
    flex: none;
    width: 196px;
    position: sticky;
    top: 0;
    align-self: flex-start;
    padding: 30px 14px 40px 0;
    max-height: 100%;
    overflow-y: auto;
  `,
  outlineTitle: css`
    font-size: ${FONT_SIZE.badge}px;
    font-weight: 600;
    color: ${token.colorTextTertiary};
    letter-spacing: 0.04em;
    margin-bottom: 8px;
    padding-left: 9px;
  `,
  olItem: css`
    display: block;
    width: 100%;
    padding: 5px 9px;
    border: none;
    border-left: 2px solid transparent;
    border-radius: 0 6px 6px 0;
    background: transparent;
    font-family: inherit;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.5;
    color: ${token.colorTextSecondary};
    text-align: left;
    cursor: pointer;
    transition:
      color 0.12s ease-out,
      background 0.12s ease-out;

    &:hover {
      background: ${token.colorFillTertiary};
    }
  `,
  olItemLv3: css`
    padding-left: 20px;
  `,
  olItemActive: css`
    color: ${token.colorLink};
    border-left-color: ${token.colorLink};
    font-weight: 600;
  `,

  /* ── 整理条 ────────────────────────────────────────────
     收件箱原来是个死胡同：有「待整理」徽标但没有任何整理动作。
     这里把整理变成一组显式操作，并把建议标签直接摆出来（PRD §2.2 / §5.10）。

     表面用 tintWarningSurface 而**不是** colorWarningBg：后者是给提示条调的，
     饱和度偏高，而整理条在文档顶部占一整行、长期存在，用它会变成页面上最吵
     的东西（实测第一眼全落在它上面，而不是标题）。原型那个 #fffaf2 是同色相
     但淡两档。文字仍用 colorWarningText——在更淡的底上对比度只增不减。 */
  triage: css`
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    /* 收紧一档：原先 11px 14px 在收件箱的每一篇上都占一整行，
       而它只是**辅助动作**，不该和正文抢纵向空间 */
    padding: 9px 12px;
    margin: 0 0 22px;
    border: 1px solid ${token.borderWarningSurface};
    border-radius: 9px;
    background: ${token.tintWarningSurface};

    /* 建议标签与分隔线在窄列下一起换行时，让按钮组整体留在同一行 */
    > button {
      flex: none;
    }
  `,
  triageLabel: css`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: none;
    font-size: ${FONT_SIZE.note}px;
    font-weight: 600;
    color: ${token.colorWarningText};
  `,
  triageHint: css`
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextSecondary};
    margin-right: 1px;
  `,
  triageSep: css`
    width: 1px;
    height: 18px;
    background: ${token.borderWarningSurface};
    margin: 0 1px;
  `,

  /* 元信息行。原型在这里有一条下边框把「标题+元信息」与正文分开，
     而不是让标题直接撞上第一段——没有这条线时标题与正文糊成一片，
     读者分不出「这篇的开头」在哪。 */
  meta: css`
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 9px;
    padding-bottom: 16px;
    margin-bottom: 22px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextTertiary};
  `,
  metaSpacer: css`
    margin-left: auto;
  `,
  /* 来源标注：手动编辑 / AI 整理。
     借自 WeKnora —— 标出内容是人写的还是机器生成的（PRD 5.10） */
  originManual: css`
    font-size: ${FONT_SIZE.badge}px;
    font-weight: 500;
    padding: 1px 7px;
    border-radius: 4px;
    color: #1a56c4;
    background: #e8f1ff;
  `,
  originAuto: css`
    font-size: ${FONT_SIZE.badge}px;
    font-weight: 500;
    padding: 1px 7px;
    border-radius: 4px;
    color: ${token.colorTextSecondary};
    background: #f0f1f3;
  `,

  /* 标题。原型用 letter-spacing:-.01em 收紧——28px 的中文标题不收紧
     会显得松散。字号阶梯见 docs/DESIGN.md §4.2。

     **必须用 `&.${prefixCls}-typography` 抬特异性。** 标题是 antd 的
     `Typography.Title`，它自带一条
     `h1:where(...).ant-typography { font-size: var(--ant-font-size-heading-1) }`
     ——`h1` 元素贡献 (0,0,1)、`.ant-typography` 贡献 (0,1,0)，合计 (0,1,1)，
     而单类选择器只有 (0,1,0)，把它盖不住。实测标题因此渲染成 **38px**
     （antd 的 h1 档），而规范写的是 28px，且不报错、看起来只是「标题偏大」。
     叠上 `&.ant-typography` 后 (0,2,0) 胜出。 */
  title: css`
    &.${prefixCls}-typography {
      font-size: ${FONT_SIZE.display}px;
      font-weight: 700;
      line-height: 1.3;
      letter-spacing: -0.01em;
      margin: 0 0 8px;
      color: ${token.colorText};
    }
  `,

  /* ── 页脚：来源 / 被引用 ────────────────────────────── */
  foot: css`
    margin-top: 40px;
    padding-top: 18px;
    border-top: 1px solid ${token.colorBorderSecondary};
  `,
  footRow: css`
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 8px;
  `,
  footLabel: css`
    flex: none;
    width: 46px;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
  `,
  footLinks: css`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  `,
  footLink: css`
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorLink};
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;

    &:hover {
      opacity: 0.8;
    }
  `,

  warn: css`
    margin-top: 20px;
    padding: 11px 14px;
    border-radius: 8px;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.75;
    color: ${token.colorWarningText};
    background: ${token.colorWarningBg};

    b {
      display: block;
      margin-bottom: 3px;
    }
  `,

  backChat: css`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 14px;
    padding: 4px 10px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 999px;
    background: transparent;
    font-family: inherit;
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorLink};
    cursor: pointer;
    transition: background 0.12s ease-out;

    &:hover {
      background: ${token.colorFillTertiary};
    }
  `,

  centered: css`
    padding: 80px;
    text-align: center;
  `,
  emptyLarge: css`
    margin-top: 120px;
  `,
}))
