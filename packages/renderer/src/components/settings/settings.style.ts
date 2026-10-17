import { createStyles } from 'antd-style'
import { FONT_SIZE, NAV_NARROW_QUERY } from '../../theme/tokens'

/**
 * 设置页的样式。
 *
 * 设置只展示用户能理解的状态和可执行操作；部署与实现细节留在服务端配置中。
 *
 * 宽屏采用独立分区栏和最多 760px 的正文列；窄屏用 Select 定位分区。
 *
 * ## 为什么面板自己画边框，而不是用 `Card`
 *
 * `Card` + `Descriptions bordered` 会形成「卡片边框 + 表格边框 + 行分隔线」
 * 三层线，而设置项本身就是**结构化的键值数据**，行与行之间一条浅线足够。
 * 值全部走 `token.*`，不写字面量（`.trellis/spec/project/design.md` §3）。
 */
export const useStyles = createStyles(({ css, token, prefixCls }) => ({
  page: css`
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-columns: 176px minmax(0, 1fr);
    overflow: hidden;
    background: ${token.surfaceContent};
    @media ${NAV_NARROW_QUERY} {
      display: flex;
      flex-direction: column;
    }
  `,
  inner: css`
    min-width: 0;
    max-width: 760px;
    margin: 0;
  `,
  sectionRail: css`
    min-height: 0;
    overflow-y: auto;
    padding: 28px 16px;
    background: ${token.surfaceContent};
    border-right: 1px solid ${token.colorBorderSecondary};
  `,
  content: css`
    container-type: inline-size;
    container-name: settings-content;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 40px clamp(28px, 5vw, 64px) 72px;
    @media ${NAV_NARROW_QUERY} {
      flex: 1;
      padding: 24px 16px 64px;
    }
  `,
  mobileHead: css`
    flex: none;
    padding: 24px 16px 0;
    background: ${token.surfaceContent};
  `,

  /* ── 页头 ───────────────────────────────────────────── */
  title: css`
    margin: 0 10px 18px;
    font-size: ${FONT_SIZE.settingsTitle}px;
    font-weight: 600;
    line-height: 1.4;
    color: ${token.colorText};
    @media ${NAV_NARROW_QUERY} {
      margin: 0 0 14px;
    }
  `,
  contentTitle: css`
    margin: 0 0 24px;
    font-size: ${FONT_SIZE.settingsTitle}px;
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: -0.02em;
    color: ${token.colorText};
  `,
  lead: css`
    margin: 0 0 32px;
    font-size: ${FONT_SIZE.body}px;
    line-height: 1.65;
    color: ${token.colorTextSecondary};
    max-width: 560px;
  `,

  /** 宽屏分区菜单。 */
  sectionMenu: css`
    &.${prefixCls}-menu {
      background: transparent;
      border-inline-end: none !important;
    }
    .${prefixCls}-menu-item {
      margin: 2px 0;
      width: 100%;
      height: 34px;
      line-height: 34px;
      font-size: ${FONT_SIZE.item}px;
      border-radius: 6px;
      padding-inline: 12px !important;
    }

    .${prefixCls}-menu-item-selected {
      color: ${token.navSelectedText};
      background: ${token.navSelectedBg};
      font-weight: 600;
    }
  `,

  /**
   * 窄屏形态的分区导航（`Select`，见 `routes/_app.settings.tsx`）。
   *
   * 与 tab 栏同一个位置、同一段下间距（26px），所以两种形态之间切换时
   * 下面的内容不会跳一下。
   */
  sectionSelect: css`
    width: 100%;
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

  /* ── 面板：一张轻卡片（白底 + 细边 + 圆角） ─────────── */
  panel: css`
    background: ${token.colorBgContainer};
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadius}px;
    overflow: hidden;

    & + & {
      margin-top: 20px;
    }
  `,
  /**
   * 卡片头：标题 + 副标题在左，`extra` 动作在右。
   *
   * 标题用 14px / 600 / 正文色（它是这张卡片的标题，不是分组标签），
   * 副标题 12.5px / 三级色解释这一组是做什么的。
   */
  panelTitle: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 20px;
    border-bottom: 1px solid ${token.colorBorderSecondary};

    @container settings-content (max-width: 620px) {
      flex-wrap: wrap;
      gap: 10px;
      padding-inline: 16px;
    }
  `,
  panelTitleMain: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  `,
  panelTitleText: css`
    font-size: ${FONT_SIZE.body}px;
    font-weight: 600;
    line-height: 1.4;
    color: ${token.colorText};
  `,
  panelDesc: css`
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.5;
    color: ${token.colorTextTertiary};
  `,
  /** 标题条右端的动作组 */
  panelExtra: css`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: none;
    flex-wrap: wrap;
    max-width: 100%;
  `,
  /** 卡片标题里的接缝标识：等宽、比标题再弱一档 */
  seamTag: css`
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.meta}px;
    font-weight: 400;
    color: ${token.colorTextTertiary};
  `,

  /* ── 键值行：左标签 + 右值，卡片内水平内边距 20px ─────── */
  row: css`
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 20px;
    padding: 16px 20px;
    align-items: start;

    & + & {
      border-top: 1px solid ${token.colorBorderSecondary};
    }
    @container settings-content (max-width: 620px) {
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
      padding-inline: 16px;
    }
  `,
  rowLabel: css`
    font-size: ${FONT_SIZE.item}px;
    font-weight: 500;
    line-height: 1.6;
    color: ${token.colorText};
    padding-top: 4px;
  `,
  rowValue: css`
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
    padding: 16px 20px;

    & + & {
      border-top: 1px solid ${token.colorBorderSecondary};
    }
  `,
  capabilityGrid: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 24px;
    padding: 4px 20px 16px;
    @media (max-width: 600px) {
      grid-template-columns: minmax(0, 1fr);
    }
  `,
  capabilityItem: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    padding: 12px 0;
    border-bottom: 1px solid ${token.colorBorderSecondary};
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

  storageOptions: css`
    display: block;
  `,
  storageOption: css`
    display: flex;
    align-items: flex-start;
    margin: 0;
    padding: 14px 20px;
    width: 100%;

    & + & {
      border-top: 1px solid ${token.colorBorderSecondary};
    }
  `,
  storageOptionHead: css`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    color: ${token.colorText};
    font-size: ${FONT_SIZE.item}px;
  `,
  storageOptionReason: css`
    display: block;
    margin-top: 3px;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.7;
    color: ${token.colorTextSecondary};
  `,
  appearanceNote: css`
    padding: 0 20px 14px;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.7;
    color: ${token.colorTextTertiary};
  `,

  /* ── 说明块：解释「为什么这里改不了」这类前提 ──────────
     它不是提示条，不该用 `colorInfoBg`（那是有状态才用的语义色，
     DESIGN §0.1）。用导航底的浅灰 + 一档更弱的文字即可。

     上下都有外边距：它既可能排在面板之前（模型页），也可能排在面板之后
     （检索 / 抓取 / 插件 / 数据页）。只写下边距时，后一种情况下它会与
     上面那个面板贴在一起，看起来像面板的最后一行。 */
  note: css`
    margin: 8px 20px 20px;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.7;
    color: ${token.colorTextTertiary};
  `,

  /* ── 数值条：导出统计这类「几个事实」 ────────────────── */
  stats: css`
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    padding: 8px 20px 20px;
    @media (max-width: 680px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  `,
  statItem: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px 16px;
    background: ${token.tintNav};
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 8px;
  `,
  statLabel: css`
    font-size: ${FONT_SIZE.meta}px;
    line-height: 1.4;
    color: ${token.colorTextTertiary};
  `,
  statValue: css`
    font-size: ${FONT_SIZE.pageTitle}px;
    font-weight: 600;
    line-height: 1.2;
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
  providerEmpty: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 20px;
  `,
  /**
   * 卡片：信息在左、三个动作在右上、展开入口整行在下（demo 形态）。
   *
   * 两列网格而不是「信息块 + 下面一排按钮」：动作与信息是**并列**的两个
   * 子项，右上角本来就是卡级动作的惯常位置；纵排会让每张卡多出一行按钮的
   * 高度。第三行（展开入口）与展开后的模型明细都跨两列（`grid-column`），
   * 与 demo 的 `pcard` 同一套。
   */
  providerCard: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 12px;
    padding: 16px 20px;

    & + & {
      border-top: 1px solid ${token.colorBorderSecondary};
    }
    @media (max-width: 680px) {
      grid-template-columns: minmax(0, 1fr);
      padding-inline: 16px;
    }
  `,
  /** 右上角的动作组。`flex-start` 让它们贴着这一行的上缘（与名字同高） */
  providerActions: css`
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding-top: 2px;
    flex-wrap: wrap;
  `,
  /** 展开入口所在的行：跨两列、与上方信息隔一点距离 */
  providerExpander: css`
    grid-column: 1 / -1;
    margin-top: 9px;
  `,
  /**
   * 「查看模型」的链接样式。
   *
   * 它是**裸 button + 这套样式**而不是 antd `Button type="link"`：后者带
   * 自己的内边距与行高，为把文字与卡片左缘对齐要覆写三处（padding /
   * height / font-size），而这条链接的全部形态就五个属性。裸 button 也
   * 出现在同一分区的用途 chip 上（`chip`），不是新做法。
   *
   * hover 给下划线而不是换色：链接色本身已经是强调色，换色是重复信号
   * （与左导航菜单项 hover 同一条）。
   */
  expanderLink: css`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0;
    border: none;
    background: none;
    color: ${token.colorLink};
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.7;
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }

    &:focus-visible {
      outline: 2px solid ${token.focusRing};
      outline-offset: 2px;
    }
  `,
  /** 一行里的字段并排：显示名 + 密钥状态 */
  providerHead: css`
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  `,
  /** 卡片上的供应商名。比正文重一档，它是这一块的标题 */
  providerName: css`
    font-size: ${FONT_SIZE.body}px;
    font-weight: 600;
    line-height: 1.5;
    color: ${token.colorText};
  `,
  /** 接口地址。等宽 + 一档更弱——它是核对用的，不是主角 */
  providerUrl: css`
    margin-top: 1px;
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.meta}px;
    line-height: 1.7;
    color: ${token.colorTextTertiary};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  /* ── 预设选择器 ─────────────────────────────────────── */
  presetGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 180px), 1fr));
    gap: 8px;
    padding: 16px 20px 20px;
  `,
  /**
   * 预设卡片。
   *
   * 壳是 antd 的 `Button`（`default` 变体）：描边、hover 底色、按下态、
   * 焦点环都走 token，深浅两套外观都管得到。这里只改它不知道的三件事——
   * 卡片是**多行、左对齐、随内容变高**的，而按钮默认单行居中。
   *
   * `&.${prefixCls}-btn` 而不是裸类名：antd 的 `.${prefixCls}-btn` 与
   * 这一条同为单类选择器，谁后注入谁赢——那种胜负不该被依赖
   * （.trellis/spec/renderer/frontend/conventions.md 的样式规则第 7 条：覆写内部结构用 `${prefixCls}`）。
   */
  presetCard: css`
    &.${prefixCls}-btn {
      height: auto;
      padding: 10px 12px;
      align-items: stretch;
      justify-content: flex-start;
    }
  `,
  /** 卡片内容：三行竖排，整块撑满按钮宽度 */
  presetBody: css`
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
    min-width: 0;
    text-align: left;
  `,
  presetName: css`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: ${FONT_SIZE.excerpt}px;
    font-weight: 600;
    color: ${token.colorText};
  `,
  /**
   * 「常用」标记。
   *
   * 原先是一个 5px 的蓝点（`presetDot`）。点是**只有形状没有含义**的东西：
   * 页面上没有图例、卡片也没有 `title`，用户无从知道它想说「常用」——
   * 六张带点的卡与另外三张相比只是「多了个点」（DESIGN §7.3 对只有图标
   * 表达的控件要求可访问名称，这条对**标记**同样成立）。换成文字之后
   * 它自带解释，也不必再靠猜。
   *
   * 色对与 `sourceBadge` 同类：弱底色 + 次级文字，不用语义色——
   * 「常用」不是状态好坏，只是排序依据。
   */
  presetTag: css`
    flex: none;
    padding: 0 5px;
    border-radius: 4px;
    background: ${token.colorFillTertiary};
    font-size: ${FONT_SIZE.badge}px;
    font-weight: 400;
    line-height: 1.6;
    color: ${token.colorTextSecondary};
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
  technicalDetails: css`
    margin: 0 20px 16px;

    .${prefixCls}-collapse-header {
      color: ${token.colorLink} !important;
      padding: 8px 0 !important;
    }

    .${prefixCls}-collapse-content-box {
      padding: 4px 0 0 !important;
      color: ${token.colorTextSecondary};
    }
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

  /* ── 供应商表单（D-080）───────────────────────────────
     创建与编辑复用同一张表单。形态沿用设置页的键值行：标签列定宽、
     值列对齐——与任务分配那一组行是同一套（DESIGN §8.1 的「同一列对齐」）。 */
  formBar: css`
    margin-bottom: 14px;
    /* 返回按钮贴左，不要 antd Button 的内边距把它推进去 */
    margin-left: -7px;
  `,
  providerFormTitle: css`
    margin: 0 0 24px;
    font-size: ${FONT_SIZE.settingsTitle}px;
    font-weight: 650;
    line-height: 1.4;
    color: ${token.colorText};
  `,
  settingsPath: css`
    margin-bottom: 16px;
    font-size: ${FONT_SIZE.item}px;
    color: ${token.colorTextTertiary};
    @media ${NAV_NARROW_QUERY} { display: none; }
  `,
  formPanel: css`
    > [data-panel-heading] {
      border-bottom: none;
      padding-bottom: 12px;
    }
  `,
  presetPicker: css`
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;
    font-size: ${FONT_SIZE.item}px;
    color: ${token.colorTextSecondary};
    @container settings-content (max-width: 620px) {
      align-items: stretch;
      flex-direction: column;
      gap: 6px;
    }
  `,
  presetSelect: css`
    width: min(100%, 320px);
    min-width: 0;
  `,
  formRow: css`
    display: flex;
    gap: 16px;
    padding: 10px 20px;

    &:last-child {
      padding-bottom: 24px;
    }
    @container settings-content (max-width: 620px) {
      flex-direction: column;
      gap: 4px;
      padding-inline: 16px;
    }
  `,
  formLabel: css`
    flex: none;
    width: 92px;
    font-size: ${FONT_SIZE.excerpt}px;
    line-height: 32px;
    color: ${token.colorTextSecondary};
    @container settings-content (max-width: 620px) {
      width: auto;
      line-height: 1.5;
    }
  `,
  formValue: css`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;

    > * {
      max-width: 100%;
    }
  `,
  formError: css`
    flex-basis: 100%;
    grid-column: 1 / -1;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.7;
    color: ${token.colorErrorText};
  `,
  formFoot: css`
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 16px;
    flex-wrap: wrap;
  `,
  /** 表单里的说明文字（模型用途那段）。比 blockDesc 收一点，因为它连着控件 */
  modelHint: css`
    padding: 0 20px 12px;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.75;
    color: ${token.colorTextSecondary};

    b {
      font-weight: 600;
      color: ${token.colorText};
    }
  `,
  /**
   * 拉取结果的一行摘要。
   *
   * 用主色的浅底（`colorPrimaryBg`）而不是语义色：拉取成功不是「状态好」，
   * 它只是「刚发生了一件事、结果在下面那些行里」——语义色会读成
   * 「上线了 / 出问题了」。
   */
  pullNote: css`
    margin: 0 20px 12px;
    padding: 8px 12px;
    border-radius: ${token.borderRadius}px;
    background: ${token.colorPrimaryBg};
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.7;
    color: ${token.colorLink};
  `,

  /* ── 模型清单：表头 + 行（编辑态与只读态共用网格）────────
     两者的列宽只有一处定义（`modelColumns`），所以只读展开的行与表单里的
     行是同一套竖线。用 flex 各自算会各算各的（列表页表头那条教训，D-079）。 */
  modelHead: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) 196px 56px 32px;
    align-items: center;
    gap: 12px;
    padding: 10px 20px 6px;
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextTertiary};
    border-bottom: 1px solid ${token.colorBorderSecondary};
    @container settings-content (max-width: 620px) {
      display: none;
    }
  `,
  modelRow: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) 196px 56px 32px;
    align-items: center;
    gap: 12px;
    padding: 8px 20px;

    & + & {
      border-top: 1px solid ${token.colorBorderSecondary};
    }
    @container settings-content (max-width: 620px) {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      margin: 12px 16px;
      padding: 12px;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: ${token.borderRadius}px;
      background: transparent;

      > :nth-child(2) {
        grid-column: 1 / -1;
        grid-row: 2;
      }

      > :nth-child(3) {
        grid-column: 1 / -1;
        grid-row: 3;
      }

      > :nth-child(4) {
        grid-column: 2;
        grid-row: 1;
      }
    }
  `,
  modelRowRead: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) 196px 56px;
    align-items: center;
    gap: 12px;
    padding: 7px 20px;

    & + & {
      border-top: 1px solid ${token.colorBorderSecondary};
    }
    @container settings-content (max-width: 620px) {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
      padding-inline: 16px;
    }
  `,
  /**
   * 拉取后新增的行闪一下主色底。
   *
   * **只闪新增的**，不是「整块刷新一下」：用户需要知道的是「哪些是刚来的」，
   * 对整个列表做一次动效等于没告诉任何事。动画结束后底色回到透明，
   * 但类名留在 DOM 上（`animation-fill-mode: both` 的 `100%` 帧是透明），
   * 所以不需要定时器去摘它。
   */
  modelRowFlash: css`
    animation: mimir-model-flash 2.6s ease-out both;

    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }

    @keyframes mimir-model-flash {
      0% {
        background: ${token.colorPrimaryBg};
      }
      100% {
        background: transparent;
      }
    }
  `,
  /** 只读展开的模型明细：与上方摘要行之间一条线，表明「这是同一张卡的另一层」 */
  readonlyModels: css`
    grid-column: 1 / -1;
    margin-top: 10px;
    border-top: 1px solid ${token.colorBorderSecondary};
  `,
  modelId: css`
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorText};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  modelInput: css`
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.note}px;
  `,
  chipGroup: css`
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  `,
  /**
   * 用途 chip（可点的）。
   *
   * 壳是真实 `<button>` 而不是 `Tag.CheckableTag`：`aria-pressed` 是
   * 「这是一个开关」的语义，antd 的 CheckableTag 只渲染出视觉，
   * 读屏念不出按下状态。选中态的配色对与导航项同源
   * （`colorPrimaryBg` 底 + `colorLink` 字，DESIGN §8.1）。
   */
  chip: css`
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 6px;
    background: ${token.colorFillQuaternary};
    font-size: ${FONT_SIZE.meta}px;
    line-height: 1;
    color: ${token.colorTextSecondary};
    cursor: pointer;
    transition:
      color 0.12s,
      border-color 0.12s,
      background 0.12s;

    &:hover {
      border-color: ${token.colorTextQuaternary};
    }

    &:focus-visible {
      outline: 2px solid ${token.focusRing};
      outline-offset: 2px;
    }

    @media (pointer: coarse) {
      min-height: 40px;
    }
  `,
  chipOn: css`
    background: ${token.colorPrimaryBg};
    border-color: ${token.colorPrimaryBorder};
    color: ${token.colorLink};
    font-weight: 500;
  `,
  /** 只读态的用途 chip：同一形状，但不可点、也不给 hover */
  chipStatic: css`
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border: 1px solid ${token.colorPrimaryBorder};
    border-radius: 6px;
    background: ${token.colorPrimaryBg};
    font-size: ${FONT_SIZE.meta}px;
    line-height: 1;
    color: ${token.colorLink};
  `,
  /** 来源标签：拉取 / 预设 / 手动。中性三态，不用语义色（不是好坏之分） */
  sourceTag: css`
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextTertiary};
  `,

  /* ── 订阅（M1-E）───────────────────────────────────────── */

  /** 加订阅那一行：输入框吃掉剩余宽度，两个按钮在右侧 */
  feedAdd: css`
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 0 20px 12px;
    @media (max-width: 680px) {
      flex-wrap: wrap;
      margin-inline: 16px;
    }

    > *:first-child {
      flex: 1;
      min-width: min(100%, 220px);
    }
  `,

  feedTitle: css`
    display: inline-flex;
    align-items: center;
    gap: 8px;
  `,

  feedActions: css`
    display: inline-flex;
    gap: 8px;
    align-items: center;
  `,

  /** 地址用等宽：feed URL 里的路径段是有意义的，等宽更容易比对 */
  feedUrl: css`
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextSecondary};
    overflow-wrap: anywhere;
  `,

  /**
   * 失败原因用错误文字色（成对的语义 token，不是随手挑的红）。
   * 它必须显眼——这一行是「这个源现在不工作」的唯一线索。
   */
  feedError: css`
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorErrorText};
    overflow-wrap: anywhere;
  `,
}))

/**
 * 状态徽标：已注册 / 未实现。
 *
 * 颜色成对取自语义 token（`colorSuccessText` on `colorSuccessBg`，实测 ≥ 4.5:1），
 * **不用 `<Tag color="green">` 预设色**——预设走 antd 自己的调色板，
 * 对比度不由我们控制（`components/DocumentBadges.tsx` 的同一条理由，.trellis/spec/renderer/frontend/conventions.md 第 8 条）。
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
