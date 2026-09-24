import { createStyles } from 'antd-style'
import { CONTENT_WIDTH, FONT_SIZE } from '@/theme/tokens'

/**
 * 设置页的样式。
 *
 * 这个页面不是一堆散落的表单，而是**插件注册表的人类可读视图**
 * （`docs/TECH.md` §7.4）：每一行「可配置的东西」都对应一个注册进接缝的实现。
 *
 * ## 形态：一个内容列 + 若干面板
 *
 * 早期版本是把 `Tabs` 摆成 `tabPosition="left"` 放在内容列**里面**。
 * 三个后果都在截图里看得见：
 *
 *  1. 它和全局左导航并排成了**两条左栏**，而这一页的位置反馈
 *     已经由左导航的「设置」提供了
 *  2. 限宽的 760px 内容列里再切出一条约 100px 的 tab 竖栏，
 *     正文实际只剩约 570px，右侧却空着半个屏幕
 *  3. 选中态的 ink bar 是一条脱离文字的竖线，看起来像渲染坏了
 *
 * 所以分区导航改成**横向**（见 `routes/_app.settings.tsx`），
 * 内容列恢复成完整的 760px（`docs/DESIGN.md` §5.4）。
 *
 * ## 为什么面板自己画边框，而不是用 `Card`
 *
 * `Card` + `Descriptions bordered` 会形成「卡片边框 + 表格边框 + 行分隔线」
 * 三层线，而设置项本身就是**结构化的键值数据**，行与行之间一条浅线足够。
 * 值全部走 `token.*`，不写字面量（`docs/DESIGN.md` §3）。
 */
export const useStyles = createStyles(({ css, token, prefixCls }) => ({
  page: css`
    height: 100%;
    overflow-y: auto;
    padding: 28px 40px 64px;
  `,
  inner: css`
    max-width: ${CONTENT_WIDTH}px;
    margin: 0 auto;
  `,

  /* ── 页头 ───────────────────────────────────────────── */
  title: css`
    margin: 0 0 8px;
    font-size: ${FONT_SIZE.pageTitle}px;
    font-weight: 700;
    line-height: 1.4;
    color: ${token.colorText};
  `,
  lead: css`
    margin: 0;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.75;
    color: ${token.colorTextSecondary};
  `,

  /**
   * 分区导航（横向 Tabs）。
   *
   * 只调两处：导航与内容之间的间距，以及 tab 的字号——
   * antd 默认 14px 与正文同大，分不出「导航」与「内容」。
   */
  tabs: css`
    .${prefixCls}-tabs-nav {
      margin-bottom: 26px;
    }
    .${prefixCls}-tabs-tab {
      padding: 10px 0;
      font-size: ${FONT_SIZE.item}px;
    }
  `,

  /* ── 分区标题 ───────────────────────────────────────── */
  sectionTitle: css`
    margin: 0 0 5px;
    font-size: ${FONT_SIZE.section}px;
    font-weight: 600;
    line-height: 1.5;
    color: ${token.colorText};
  `,
  sectionDesc: css`
    margin: 0 0 16px;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.75;
    color: ${token.colorTextSecondary};
  `,

  /* ── 面板：一组相关的设置项 ─────────────────────────── */
  panel: css`
    background: ${token.colorBgContainer};
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 10px;
    overflow: hidden;

    & + & {
      margin-top: 14px;
    }
  `,
  /**
   * 面板标题是**分组标签**，不是标题。
   *
   * 分区已经有 16px 的标题了（`sectionTitle`），面板再用同级字号会把
   * 层级压平。所以它走 13px / 600 / 次级色——读作「这一组是什么」。
   */
  panelTitle: css`
    padding: 11px 16px;
    font-size: ${FONT_SIZE.excerpt}px;
    font-weight: 600;
    color: ${token.colorTextSecondary};
    background: ${token.tintList};
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  /** 面板标题里的接缝标识：等宽、比标题再弱一档 */
  seamTag: css`
    margin-left: 9px;
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.meta}px;
    font-weight: 400;
    color: ${token.colorTextTertiary};
  `,

  /* ── 键值行 ─────────────────────────────────────────── */
  row: css`
    display: flex;
    align-items: baseline;
    gap: 16px;
    padding: 12px 16px;

    & + & {
      border-top: 1px solid ${token.colorBorderSecondary};
    }
  `,
  /* 固定标签列宽，让右侧的值对齐成一条竖线——扫读时视线不用来回跳
     （与左导航「右侧对齐的元信息」是同一个理由，DESIGN §8.1） */
  rowLabel: css`
    flex: none;
    width: 92px;
    font-size: ${FONT_SIZE.excerpt}px;
    line-height: 1.7;
    color: ${token.colorTextSecondary};
  `,
  rowValue: css`
    flex: 1;
    min-width: 0;
    font-size: ${FONT_SIZE.excerpt}px;
    line-height: 1.7;
    color: ${token.colorText};
  `,
  /* 未启用 / 未实现的取值。它是**状态**不是内容，所以比正文弱一档 */
  pending: css`
    color: ${token.colorTextTertiary};
  `,

  /* ── 块：一段占满整行的内容（插件条目、说明 + 按钮） ── */
  block: css`
    padding: 13px 16px;

    & + & {
      border-top: 1px solid ${token.colorBorderSecondary};
    }
  `,
  blockTitle: css`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 3px;
    font-size: ${FONT_SIZE.item}px;
    font-weight: 500;
    color: ${token.colorText};
  `,
  blockDesc: css`
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.7;
    color: ${token.colorTextSecondary};
  `,

  /* ── 说明块：解释「为什么这里改不了」这类前提 ──────────
     它不是提示条，不该用 `colorInfoBg`（那是有状态才用的语义色，
     DESIGN §0.1）。用导航底的浅灰 + 一档更弱的文字即可。

     上下都有外边距：它既可能排在面板之前（模型页），也可能排在面板之后
     （检索 / 抓取 / 插件 / 数据页）。只写下边距时，后一种情况下它会与
     上面那个面板贴在一起，看起来像面板的最后一行。 */
  note: css`
    padding: 12px 15px;
    margin: 14px 0;
    background: ${token.tintNav};
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 8px;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.8;
    color: ${token.colorTextSecondary};
  `,

  /* ── 数值条：导出统计这类「几个事实」 ────────────────── */
  stats: css`
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    padding: 14px 16px;
  `,
  statLabel: css`
    font-size: ${FONT_SIZE.meta}px;
    line-height: 1.6;
    color: ${token.colorTextTertiary};
  `,
  statValue: css`
    font-size: ${FONT_SIZE.body}px;
    font-weight: 500;
    line-height: 1.5;
    color: ${token.colorText};
    font-variant-numeric: tabular-nums;
  `,

  /**
   * 来源徽标：界面 / 环境变量 / 默认。
   *
   * 刻意**不用颜色**：这三种来源不是好坏之分（环境变量并不比界面值差），
   * 用语义色会暗示「红色 = 有问题」。弱一档的底色 + 等宽字足够读出来。
   */
  sourceBadge: css`
    display: inline-flex;
    align-items: center;
    flex: none;
    padding: 1px 6px;
    border-radius: 4px;
    background: ${token.colorFillTertiary};
    font-size: ${FONT_SIZE.badge}px;
    line-height: 1.7;
    color: ${token.colorTextSecondary};
  `,

  /* ── 供应商卡片 ─────────────────────────────────────── */
  /** 一行里的字段并排：显示名 + 地址 + 密钥状态 */
  providerHead: css`
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  `,
  /**
   * 密钥状态徽标。
   *
   * 与 `pending` 一样刻意**不用颜色**区分好坏：语义色会暗示
   * 「红色 = 出问题了」，而「还没填密钥」是一个中性的中间状态，
   * 不是错误（用户可能正要填）。
   */
  okBadge: css`
    display: inline-flex;
    align-items: center;
    flex: none;
    padding: 1px 6px;
    border-radius: 4px;
    background: ${token.colorSuccessBg};
    font-size: ${FONT_SIZE.badge}px;
    font-weight: 600;
    line-height: 1.7;
    color: ${token.colorSuccessText};
  `,
  /** 模型名列表。等宽 + 可换行，扫读时像看一份清单 */
  modelChips: css`
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 8px;
  `,
  modelChip: css`
    margin: 0;
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.meta}px;
  `,

  /**
   * 用原生 `<select>` 而不是 antd 的 `Select`。
   *
   * 理由是这个控件要出现在**很多行里**（每个角色两个），而 antd 的
   * `Select` 每实例挂一层浮层与虚拟列表——五行的设置页用不上那些，
   * 而且它的宽度会随内容跳动。原生控件的键盘行为与可访问性也已经是
   * 平台标准，不需要再造一遍。
   *
   * 样式只调外观：宽度、字号、边框跟随主题 token。
   */
  select: css`
    max-width: 220px;
    padding: 3px 8px;
    background: ${token.colorBgContainer};
    border: 1px solid ${token.colorBorder};
    border-radius: 6px;
    font-size: ${FONT_SIZE.excerpt}px;
    color: ${token.colorText};
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid ${token.colorPrimaryBorder};
      outline-offset: 1px;
    }

    &:disabled {
      cursor: not-allowed;
      color: ${token.colorTextTertiary};
    }
  `,

  /* ── 预设选择器 ─────────────────────────────────────── */
  presetGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
  `,
  presetCard: css`
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    text-align: left;
    background: ${token.colorBgContainer};
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 8px;
    cursor: pointer;

    &:hover {
      border-color: ${token.colorPrimaryBorder};
    }
  `,
  presetName: css`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: ${FONT_SIZE.excerpt}px;
    font-weight: 600;
    color: ${token.colorText};
  `,
  /** 常用标记：一个小圆点，比「常用」两个字轻 */
  presetDot: css`
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: ${token.colorPrimary};
  `,
  presetUrl: css`
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextTertiary};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,

  /* ── 工具类 ─────────────────────────────────────────── */
  mono: css`
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.meta}px;
  `,
  /* 路径、seam 标识：等宽且比正文弱 */
  file: css`
    margin-top: 5px;
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextTertiary};
  `,
  actions: css`
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  `,
  hint: css`
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.7;
    color: ${token.colorTextSecondary};
  `,
  /** 自检的结果行。数字用等宽对齐，扫读两行结果时不会跳 */
  hits: css`
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.9;
    color: ${token.colorTextSecondary};
    font-variant-numeric: tabular-nums;

    b {
      font-weight: 600;
      color: ${token.colorText};
    }
  `,
  /** 自检的提示语：分词没切对这类需要被看见的说明 */
  warnText: css`
    color: ${token.colorWarningText};
  `,
  /**
   * 段内的强调。
   *
   * **必须用元素而不是 `**星星**`**：这些说明文字是 JSX 里的普通文本，
   * 不走 Markdown 渲染，早先写进去的 `**` 会连星号一起显示在界面上。
   */
  strong: css`
    font-weight: 600;
  `,
  muted: css`
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.75;
    color: ${token.colorTextSecondary};
  `,
}))

/**
 * 状态徽标：已注册 / 未实现。
 *
 * 颜色成对取自语义 token（`colorSuccessText` on `colorSuccessBg`，实测 ≥ 4.5:1），
 * **不用 `<Tag color="green">` 预设色**——预设走 antd 自己的调色板，
 * 对比度不由我们控制（`components/DocumentBadges.tsx` 的同一条理由，AGENTS.md 第 8 条）。
 */
export const useStatusStyles = createStyles(({ css, token }, props: { on: boolean }) => ({
  badge: css`
    display: inline-flex;
    align-items: center;
    flex: none;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: ${FONT_SIZE.badge}px;
    font-weight: 600;
    line-height: 1.6;
    letter-spacing: 0.02em;
    color: ${props.on ? token.colorSuccessText : token.colorTextSecondary};
    background: ${props.on ? token.colorSuccessBg : token.colorFillTertiary};
  `,
}))
