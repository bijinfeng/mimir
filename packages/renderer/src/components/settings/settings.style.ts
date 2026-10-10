import { createStyles } from 'antd-style'
import { CONTENT_WIDTH, FONT_SIZE } from '../../theme/tokens'

/**
 * 设置页的样式。
 *
 * 这个页面不是一堆散落的表单，而是**插件注册表的人类可读视图**
 * （`.trellis/spec/project/architecture.md` §7.4）：每一行「可配置的东西」都对应一个注册进接缝的实现。
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
 * 内容列恢复成完整的 760px（`.trellis/spec/project/design.md` §5.4）。
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
   *
   * 窄屏（≤880px）用的不是它，而是下面那个 `Select`：八个分区在 420px 里
   * 排不下（实测文字合计约 256px，导航条可用宽度只有 247px），而 `Tabs`
   * 不折行——它会把首个标签裁成半个字。
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

  /**
   * 窄屏形态的分区导航（`Select`，见 `routes/_app.settings.tsx`）。
   *
   * 与 tab 栏同一个位置、同一段下间距（26px），所以两种形态之间切换时
   * 下面的内容不会跳一下。
   */
  sectionSelect: css`
    display: block;
    margin-bottom: 26px;
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
   *
   * 标题条与行之间不画线（D-070）：tintList 底色已经把「标题条」和
   * 「内容行」分成两种表面，线是重复信号。
   */
  /**
   * 面板标题条：**flex 行**——标题在左、`extra` 动作在右。
   *
   * flex 而不是块级行内文本：`extra` 里是 antd 的小按钮（24px），
   * 需要与标题在一条中线上对齐；右对齐靠 `panelExtra` 的 `margin-left: auto`。
   * `gap` 负责标题与接缝标识之间的间距（`seamTag` 原本的 margin-left
   * 移到这里，两处都给会叠成 18px）。
   *
   * 内边距仍是 11px 16px（只有一处面板带 `extra`，44px 对 43px 的高差
   * 看不出来；收掉的话另外十几个面板的标题条会一起矮 6px）。
   * 标题条与内容行之间不画线（D-070）：tintList 底色已经把两种表面分开。
   */
  panelTitle: css`
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 11px 16px;
    font-size: ${FONT_SIZE.excerpt}px;
    font-weight: 600;
    color: ${token.colorTextSecondary};
    background: ${token.tintList};
  `,
  /** 标题条右端的动作组。`margin-left: auto` 把它推到最右 */
  panelExtra: css`
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  `,
  /** 面板标题里的接缝标识：等宽、比标题再弱一档 */
  seamTag: css`
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
     （与左导航「右侧对齐的元信息」是同一个理由，DESIGN §8.1）。

     宽度取**最长标签的实际宽度**（实测 124px），不是随手一个整数近似：
     标签文案来自注册表（core 的键表与插件的 `params`），最长的两条是
     「关键词（jieba 分词）」123px 与「每篇最多引用块数」105px。给 92px 时
     它们折成两行，同一块面板的行高就分成 22px 与 44px 两档，断词还把
     「每篇最多引用块 / 数」切在词中间——而这一列存在的理由是**对齐**，
     不是省这 30px。列宽一次放宽，加新键时也不会再撞上。 */
  rowLabel: css`
    flex: none;
    width: 124px;
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

  storageOptions: css`
    display: block;
  `,
  storageOption: css`
    display: flex;
    align-items: flex-start;
    margin: 0;
    padding: 13px 16px;
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
    padding: 0 16px 13px;
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
    padding: 12px 15px;
    margin: 14px 0;
    background: ${token.tintNav};
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadius}px;
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
  providerEmpty: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 18px 16px;
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
    padding: 14px 16px;

    & + & {
      border-top: 1px solid ${token.colorBorderSecondary};
    }
  `,
  /** 右上角的动作组。`flex-start` 让它们贴着这一行的上缘（与名字同高） */
  providerActions: css`
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding-top: 2px;
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
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
    /* 与面板里其它块同一套内边距（block 的 13px 16px）：
       第一版漏了它，九张卡片直接贴着面板的四条边（实测网格矩形 758×189
       而卡片起止就是面板边界），看起来像面板被压扁了 */
    padding: 13px 16px;
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
    margin: 0 16px 12px;

    .${prefixCls}-collapse-header {
      color: ${token.colorLink} !important;
      padding: 6px 0 !important;
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
  formRow: css`
    display: flex;
    gap: 16px;
    padding: 12px 16px;

    & + & {
      border-top: 1px solid ${token.colorBorderSecondary};
    }
  `,
  formLabel: css`
    flex: none;
    width: 92px;
    font-size: ${FONT_SIZE.excerpt}px;
    line-height: 32px;
    color: ${token.colorTextSecondary};
  `,
  formValue: css`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  `,
  formError: css`
    flex-basis: 100%;
    font-size: ${FONT_SIZE.badge}px;
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
    padding: 0 16px 10px;
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
    margin: 0 16px 10px;
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
    padding: 10px 16px 6px;
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextTertiary};
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  modelRow: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) 196px 56px 32px;
    align-items: center;
    gap: 12px;
    padding: 7px 16px;

    & + & {
      border-top: 1px solid ${token.colorBorderSecondary};
    }
  `,
  modelRowRead: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) 196px 56px;
    align-items: center;
    gap: 12px;
    padding: 6px 16px;

    & + & {
      border-top: 1px solid ${token.colorBorderSecondary};
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
    margin-bottom: 8px;

    > *:first-child {
      flex: 1;
      min-width: 0;
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
