import { createStyles } from 'antd-style'
import { LIBRARY_FONT_SIZE, libraryVisualTokens } from './library-tokens'
import { FONT_SIZE, NAV_NARROW_QUERY, PANEL_HEADER_HEIGHT } from '../../theme/tokens'

/**
 * 知识库页（浏览态主区）的样式（D-079，形态对齐用户给的目标稿）。
 *
 * ## 版式
 *
 * ```
 * 测试知识库                              ← 知识库名（hero 标题）
 * 描述（有内容时）                        ← 无描述时不占一行
 * 知识库 ID: 7ZZRF7 ⧉                   ← 可复制的元信息
 * 4 个文档   [卡片|列表] [新建文件夹] [新建文件] [添加文档 ▾]
 * 文档                支持文本…可直接拖到本页上传
 * ┌──────┐ ┌──────┐ ┌──────┐            ← 文件夹卡片在前，文档卡片在后
 * └──────┘ └──────┘ └──────┘
 * ```
 *
 * 默认列表便于扫读文件；卡片仍作为用户可切换的文件展台。
 *
 * ## 两侧留白只给一次
 *
 * 与旧版同一条：头部与列表在同一个内容盒里，左右留白挂在 `page` 上，
 * 头部与 body 自己不再加。两者的外沿是同一条竖线。
 */
export const useStyles = createStyles(({ css, token, prefixCls, appearance }) => {
  const v = libraryVisualTokens(appearance === 'dark')
  return {
    page: css`
      position: relative;
      height: 100%;
      container-type: inline-size;
      min-height: 0;
      display: flex;
      flex-direction: column;
      padding: 0;
      background: ${v.bg};
      .${prefixCls}-btn:not(.${prefixCls}-btn-icon-only) {
        padding-inline: 12px;
      }
      .${prefixCls}-btn {
        color: ${v.text};
        border-color: ${v.border};
        box-shadow: none;
      }
      .${prefixCls}-btn-default {
        background: ${v.bg};
      }
      .${prefixCls}-btn:hover:not(:disabled) {
        color: ${v.text};
        background: ${v.hover};
        border-color: ${v.focus};
      }
      .${prefixCls}-btn-text, .${prefixCls}-btn-text:hover:not(:disabled) {
        border-color: transparent;
        background: transparent;
      }
      .${prefixCls}-btn-text:hover:not(:disabled) {
        background: ${v.hover};
      }
      .${prefixCls}-btn-primary, .${prefixCls}-btn-primary:hover:not(:disabled) {
        color: ${v.primaryText};
        background: ${v.accent};
        border-color: ${v.accent};
      }
      .${prefixCls}-segmented {
        background: ${v.subtle};
        color: ${v.text};
        font-size: ${LIBRARY_FONT_SIZE.item}px;
      }
      .${prefixCls}-segmented-item-selected {
        background: ${v.bg};
        color: ${v.text};
      }
      .${prefixCls}-btn:disabled {
        opacity: 0.5;
        color: ${v.secondary};
        background: ${v.subtle};
        border-color: ${v.border};
      }
      &::selection {
        background: ${v.accentBg};
        color: ${v.text};
      }
    `,

    menu: css`
      &.${prefixCls}-dropdown-menu {
        background: ${v.bg};
        color: ${v.text};
      }
      .${prefixCls}-dropdown-menu-item {
        color: ${v.text};
      }
      .${prefixCls}-dropdown-menu-item:hover {
        background: ${v.hover};
      }
      .${prefixCls}-dropdown-menu-item-danger {
        color: ${v.danger};
      }
    `,
    topBar: css`
      display: flex;
      align-items: center;
      gap: 8px;
      flex: none;
      height: ${PANEL_HEADER_HEIGHT}px;
      padding-inline: clamp(24px, 3.2cqw, 48px);
      border-bottom: 1px solid ${v.border};
      color: ${v.secondary};
      font-size: ${LIBRARY_FONT_SIZE.item}px;
      > span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      > svg {
        flex: none;
      }
      @container (max-width: 700px) {
        height: 36px;
        border-bottom: 0;
        > svg {
          display: none;
        }
        > span:last-child {
          display: none;
        }
      }
      @container (max-width: 480px) {
        padding-inline: 16px;
      }
    `,
    topBarCurrent: css`
      color: ${v.text};
      font-weight: 500;
    `,
    head: css`
      flex: none;
      padding: 28px clamp(24px, 3.2cqw, 48px) 0;
      max-width: calc(1080px + 2 * clamp(24px, 3.2cqw, 48px));
      width: 100%;
      margin: 0 auto;

      @container (max-width: 700px) {
        padding-top: 8px;
        max-height: 58%;
        overflow-y: auto;
      }
      @media (max-height: 700px) {
        max-height: 56%;
        overflow-y: auto;
        scrollbar-width: thin;
      }

      @container (max-width: 480px) {
        padding-inline: 16px;
      }

      @container (max-width: 480px) {
        .${prefixCls}-btn:not(.${prefixCls}-btn-icon-only) {
          padding-inline: 10px;
          gap: 5px;
        }
      }
    `,
    kbTitle: css`
      font-size: ${FONT_SIZE.display}px;
      font-weight: 600;
      line-height: 1.25;
      margin: 0;
      color: ${v.text};
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      @container (max-width: 700px) {
        white-space: normal;
        overflow-wrap: anywhere;
      }

      @container (max-width: 480px) {
        font-size: ${LIBRARY_FONT_SIZE.narrowTitle}px;
        line-height: 1.4;
      }
    `,
    kbDesc: css`
      margin: 8px 0 0;
      font-size: ${FONT_SIZE.body}px;
      color: ${v.secondary};
      line-height: 1.8;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      &:not([data-expanded]) {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
      }

      @container (max-width: 480px) {
        font-size: ${LIBRARY_FONT_SIZE.item}px;
      }
    `,
    descriptionToggle: css`
      padding: 0 !important;
      height: 25px;
      margin: 2px 0 -2px;
      color: ${v.secondary};
      font-size: ${LIBRARY_FONT_SIZE.meta}px;
    `,
    notice: css`
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      max-width: 1080px;
      margin: 0 auto 10px;
      padding: 8px 12px;
      background: ${v.subtle};
      color: ${v.secondary};
      font-size: ${LIBRARY_FONT_SIZE.meta}px;
      border-radius: 4px;
    `,
    /* 面包屑（在「文档」那一行里）：知识库根 + 每一段子目录 */
    /**
     * 面包屑里可点的段（「文档」与中间各层）。
     *
     * **静息是正常文本色，不是链接蓝**（用户拍板）：这一行是**路径标签**
     * ——「文档 / 资料库」读起来是一句话，末段本来就是正文色，前几段单独染蓝
     * 会让同一行出现两种文字身份，而且与右侧格式提示、下方文件名的强调级别
     * 打架（§3.5 的链接色留给正文里的链接与真正需要强调的动作）。
     * 可点性靠 hover 给：文字转链接色 + 下划线，鼠标移上去才知道能点。
     */
    crumbLink: css`
      color: ${v.text};
      background: none;
      border: none;
      padding: 0;
      font: inherit;
      cursor: pointer;
      text-decoration: underline dotted;
      text-underline-offset: 2px;
      text-decoration-color: ${v.focus};

      &:hover {
        color: ${v.accent};
        text-decoration: underline solid;
      }
    `,
    crumbSep: css`
      color: ${v.secondary};
    `,
    metaRow: css`
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px 18px;
      margin-top: 10px;
      font-size: ${FONT_SIZE.meta}px;
      color: ${v.secondary};

      @container (max-width: 480px) {
        gap: 4px 12px;
      }
    `,
    /**
     * 知识库 ID 整块（文字 + 短码 + 复制图标）——**整块是一个按钮**。
     *
     * 形态来自用户目标稿：hover 时整块亮度变一下、悬停出 tooltip 说明动作、
     * 点块内任何位置都复制。
     *
     * ## 垂直居中完全交给 flex，不做任何像素补偿（用户明确要求）
     *
     * ```
     * button  height: 24px + align-items: center   ← 把内层摆到中线
     *   └ inner  inline-flex + align-items: center ← 把文字行盒与图标摆到同一条中线
     * ```
     *
     * **上下不加 padding**：早先的 `padding: 2px 6px` + `height: auto` 让高度
     * 由行盒+内距凑出来（实测 23.6px），是「用内距凑盒子」而不是居中——
     * 改字号 / 字体 / 行高时它会重新跑偏。定高 24px（与同一行的控件同高）
     * 之后，中线由 flex 几何决定，与内容无关。
     *
     * 内层的 `line-height: 1` 把行盒压到与字号同高：antd 默认的 1.5 会在
     * 中文下方留出一段用不到的下伸空白（中文字形没有西文那种下伸部），
     * 让行盒看起来「下重上轻」。居中仍由 flex 决定，与行盒高低无关。
     *
     * 残余的亚像素差来自字体本身：中文墨迹在字体盒里天然偏上（实测
     * 墨迹 ascent 11 / descent 2，而字体盒 descent 是 3）≈ 0.5px。
     * 这是字体度量，不是布局缺陷——不修正（修正只能靠 `top: 0.5px`
     * 这类偏移，明确不做）。
     */
    idChip: css`
      display: inline-flex;
      align-items: center;
      height: 24px;
      padding: 0 6px;
      margin-inline-start: -6px;
      font-size: ${FONT_SIZE.meta}px;
      color: ${v.secondary};
      white-space: nowrap;

      /* 悬停：整块提亮一档。底色由 antd 的文本按钮给（colorFillTertiary，
       两套外观下都是「亮度变化」），文字与图标再各提一档——
       「整块都在响应」要看得见 */
      &:hover {
        color: ${v.secondary};

        .kb-id-code {
          color: ${v.text};
        }

        .kb-id-icon {
          color: ${v.secondary};
        }
      }
    `,
    /**
     * 芯片内容行。放进 Button 的 children 里自己排：不依赖 antd 怎么处理
     * 多子元素（它按「单个字符串才拆字」的规则包装），gap 才稳定生效。
     *
     * `line-height: 1` 的理由见 `idChip` 的注释：压掉中文用不到的下伸空白，
     * 让行盒与字形同高。垂直居中靠上面的 `align-items: center`。
     */
    idChipInner: css`
      display: inline-flex;
      align-items: center;
      gap: 5px;
      line-height: 1;
    `,
    idCode: css`
      font-family: ${token.fontFamilyCode};
      letter-spacing: 0.04em;
      color: ${v.secondary};
    `,
    idIcon: css`
      flex: none;
      /* svg 是行内元素，按基线落会偏上；display: block 让它由 flex 的
       align-items: center 接管 */
      display: block;
      color: ${v.secondary};
    `,

    /* ── 工具条 ───────────────────────────────────────── */
    /**
     * 计数与动作条。
     *
     * **头下这条分割线是静态的**（用户拍板的目标稿）：头部身份区与工具条
     * 是两个区段，靠一条线分开——这是 D-070 之后少数被明确要求留下的静态线，
     * 理由与那条决策不冲突：它划分的是「身份 / 操作」两个不同角色的区段，
     * 而不是内容列表的行边界。滚动显形的界线仍在下面「文档」那一行
     * （`sectionHead` 的 data-scrolled）。
     */
    toolbar: css`
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px 12px;
      margin-top: 24px;
      padding: 0 0 20px;
      border-bottom: 1px solid ${v.border};

      @container (max-width: 700px) {
        margin-top: 24px;
        gap: 8px;
      }

      @container (max-width: 480px) {
        padding-bottom: 14px;
      }
    `,
    count: css`
      font-size: ${LIBRARY_FONT_SIZE.meta}px;
      color: ${v.secondary};
      font-variant-numeric: tabular-nums;
    `,
    toolbarActions: css`
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    `,
    toolbarPrimary: css`
      flex: none;
      order: 0;
    `,
    layoutSwitch: css`
      order: 2;
      margin-left: auto;
      flex: none;

      @container (max-width: 700px) {
        order: 1;
      }

      @container (max-width: 480px) {
        font-size: ${LIBRARY_FONT_SIZE.meta}px !important;
        .${prefixCls}-segmented-item-label {
          padding-inline: 5px;
          font-size: ${LIBRARY_FONT_SIZE.meta}px;
        }
        .${prefixCls}-segmented-item-icon {
          margin-inline-end: 4px;
        }
      }
    `,

    /**
     * 「文档 / 子目录 …」+ 格式提示那一行。
     *
     * 这一行是固定头部的最底边——列表从它下面被切断时，界线随滚动显形
     * （D-070，仍然只给「固定 vs 滚动」这一种界线）。
     */
    sectionHead: css`
      display: flex;
      min-height: 33px;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin: 14px 0 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid transparent;
      transition: border-color 0.2s ease-out;

      &[data-scrolled] {
        border-bottom-color: ${v.border};
      }

      @container (max-width: 480px) {
        margin-top: 10px;
        overflow: hidden;
      }
    `,
    sectionLabel: css`
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      > button {
        flex: none;
      }
      > span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      &[data-expanded] {
        > button {
          max-width: 100%;
          white-space: normal;
          overflow-wrap: anywhere;
          text-align: left;
        }
        flex-wrap: wrap;
        white-space: normal;
        overflow-wrap: anywhere;
      }
      font-size: ${FONT_SIZE.body}px;
      font-weight: 600;
      color: ${v.text};
    `,
    sectionHint: css`
      font-size: ${FONT_SIZE.meta}px;
      color: ${v.secondary};
      text-align: right;
      line-height: 1.6;
    `,

    body: css`
      flex: 1;
      min-height: 140px;
      overflow-y: auto;
      padding: 0 clamp(24px, 3.2cqw, 48px) 40px;
      scrollbar-gutter: stable;
      &::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      &::-webkit-scrollbar-thumb {
        background: ${v.scroll};
        border: 2px solid ${v.bg};
        border-radius: 6px;
      }
      &::-webkit-scrollbar-track {
        background: ${v.bg};
      }
      @container (max-width: 480px) {
        padding-inline: 16px;
      }
    `,

    /* ── 卡片网格 ─────────────────────────────────────── */
    grid: css`
      max-width: 1080px;
      width: 100%;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
      gap: 16px;
      align-content: start;

      @container (max-width: 480px) {
        gap: 12px;
      }

      @container (max-width: 700px) {
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
      }
    `,
    card: css`
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 118px;
      padding: 16px;
      border: 1px solid ${v.border};
      border-radius: ${token.borderRadius}px;
      background: ${v.bg};
      font-family: inherit;
      text-align: left;
      cursor: pointer;
      transition:
        border-color 0.12s ease-out,
        box-shadow 0.12s ease-out;

      &:hover {
        border-color: ${v.border};
        background: ${v.subtle};
      }

      /* 卡片本体不可聚焦（里面是标题按钮 + 动作按钮，见 DocCard 的注释），
       所以这里没有 &:focus-visible——键盘线索由标题按钮自己的焦点环给 */
      &:focus-within {
        border-color: ${v.focus};
      }
    `,
    cardTop: css`
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 20px;
    padding-inline-end: 20px;
    @container (max-width: 700px) { padding-inline-end: 32px; }
    @media (pointer: coarse), ${NAV_NARROW_QUERY} {
      padding-inline-end: 32px;
    }
  `,
    cardIcon: css`
      flex: none;
      display: inline-flex;
      align-items: center;
      color: ${v.secondary};
    `,
    /**
     * 卡片标题。它是**按钮**（键盘的打开入口）而不是纯文本——卡片本体
     * 只是可点的盒子（见 LibraryView 的 DocCard 注释：交互角色不能嵌套）。
     * 外观上读作标题：无边框无内距、字号字重与其它卡片标题一致。
     */
    cardTitle: css`
      flex: 1;
      min-width: 0;
      padding: 0;
      border: none;
      background: none;
      font-family: inherit;
      font-size: ${FONT_SIZE.body}px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 7px;
      line-height: 1.6;
      color: ${v.text};
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid ${v.focus};
        outline-offset: 2px;
        border-radius: ${token.borderRadiusSM}px;
      }
    `,
    fileName: css`
      display: inline-flex;
      align-items: baseline;
      max-width: 100%;
      min-width: 0;
    `,
    fileNameStem: css`
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `,
    fileNameExtension: css`
      flex: none;
      white-space: nowrap;
    `,
    chip: css`
      flex: none;
      font-size: ${LIBRARY_FONT_SIZE.badge}px;
      line-height: 1.6;
      padding: 0 6px;
      border-radius: 4px;
      color: ${v.secondary};
      background: ${v.subtle};
    `,
    /**
     * 悬停显形的动作条。**占位不消失**（opacity 而非 display）——
     * 显形时标题与徽标一个像素都不挪，卡片之间也不会因为多出几个图标而抖动。
     *
     * ## `.kb-card` / `.kb-row` 是**字面类名**，不是 `styles.card` 的哈希类
     *
     * antd-style 把每个样式块编译成哈希类名（`acss-xxxx`），所以同一文件里
     * 的 `.card:hover &` **永远匹配不到**——宿主元素上根本没有叫 `card` 的类，
     * 规则静默失效：动作条一直 opacity 0（元素还在，仍可点，所以自动化点得中、
     * 人眼看不见）。宿主要**额外挂一个字面类**（`kb-card` / `kb-row`），
     * 后代选择器才成立——`FolderSection` 的行用的是同一条做法（那里的字面
     * 类就叫 `row`）。改这两个选择器时要连元素上的类名一起看。
     */
    cardActions: css`
    flex: none;
    display: flex;
    align-items: center;
    gap: 2px;
    opacity: 1;
    transition: opacity 0.12s ease-out;
    margin-inline-end: -6px;
    .kb-card & {
      position: absolute;
      top: 8px;
      right: 8px;
      margin: 0;
    }
    > button,
    > a {
      width: 32px;
      height: 32px;
      min-width: 32px;
      padding: 0;
      @container (max-width: 700px) {
        width: 44px; height: 44px; min-width: 44px;
      }
      @media (pointer: coarse), ${NAV_NARROW_QUERY} {
        width: 44px;
        height: 44px;
        min-width: 44px;
      }
    }

    .kb-card:hover &,
    .kb-card:focus-within &,
    .kb-row:hover &,
    .kb-row:focus-within & {
      opacity: 1;
    }

    @media (hover: none), (max-width: 600px) {
      opacity: 1;
    }
  `,
    cardActionDirect: css`
      display: none;
    `,
    cardActionMore: css`
      display: inline-flex;
    `,
    cardMeta: css`
      line-height: 1.65;
      font-size: ${LIBRARY_FONT_SIZE.meta}px;
      color: ${v.secondary};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `,
    cardFoot: css`
      display: flex;
      font-size: ${LIBRARY_FONT_SIZE.badge}px;
      line-height: normal;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: auto;
      padding-top: 6px;
    `,
    cardTime: css`
      flex: none;
      font-size: ${LIBRARY_FONT_SIZE.badge}px;
      color: ${v.secondary};
      font-variant-numeric: tabular-nums;
    `,

    /* ── 列表（行条）布局 ─────────────────────────────── */
    /**
     * 列表是一张**表**：行与表头共用同一套列宽（网格），所以列一定对齐。
     *
     * 常态四个列位：图标 / 名称 / 详情 / 时间。出现提取失败时才加状态列。
     * 表头只是同一网格的另一行
     * （`listHead`），列宽由这一处定义——不用 flex 的理由就在这里：
     * 内容长度不同的行在 flex 下会各自算出不同的列宽，表头对不上任何一行
     * （实测旧版 meta 是 `flex: 0 1 auto`，每行宽度都不一样）。
     */
    list: css`
      max-width: 1080px;
      width: 100%;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 2px;
      container-type: inline-size;
    `,
    listHead: css`
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr) minmax(0, 260px) 116px 32px;
      align-items: center;
      gap: 10px;
      padding: 0 12px 10px;
      min-height: 30px;
      font-size: ${LIBRARY_FONT_SIZE.badge}px;
      color: ${v.secondary};
      border-bottom: 1px solid ${v.border};
      margin-bottom: 4px;
      > :nth-child(4) {
        display: none;
      }
      &[data-has-status] {
        grid-template-columns: 22px minmax(0, 1fr) minmax(0, 220px) 76px 116px 32px;
        > :nth-child(4) {
          display: block;
        }
      }
      @container (max-width: 700px) {
        grid-template-columns: 22px minmax(0, 1fr) 110px 44px;
        &[data-has-status] {
          grid-template-columns: 22px minmax(0, 1fr) 110px 44px;
        }
        > :nth-child(3),
        > :nth-child(4) {
          display: none !important;
        }
      }
      @container (max-width: 480px) {
        grid-template-columns: 22px minmax(0, 1fr) 44px;
        &[data-has-status] {
          grid-template-columns: 22px minmax(0, 1fr) 44px;
        }
      }
    `,
    headTime: css`
      grid-column: 4;
      [data-has-status] & {
        grid-column: 5;
      }
      @container (max-width: 700px) {
        grid-column: 3;
        [data-has-status] & {
          grid-column: 3;
        }
      }
      @container (max-width: 480px) {
        display: none;
      }
    `,
    headMore: css`
      grid-column: 5;
      [data-has-status] & {
        grid-column: 6;
      }
      @container (max-width: 700px) {
        grid-column: 4;
        [data-has-status] & {
          grid-column: 4;
        }
      }
      @container (max-width: 480px) {
        grid-column: 3;
        [data-has-status] & {
          grid-column: 3;
        }
      }
    `,
    row: css`
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr) minmax(0, 260px) 116px 32px;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 56px;
      padding: 8px 12px;
      border: 1px solid transparent;
      border-radius: ${token.borderRadiusSM}px;
      background: none;
      font-family: inherit;
      text-align: left;
      cursor: pointer;
      transition:
        background-color 0.12s ease-out,
        border-color 0.12s ease-out;
      &:hover {
        background: ${v.hover};
      }
      &:focus-within {
        outline: 1px solid ${v.focus};
        outline-offset: -1px;
      }
      &[data-has-status] {
        grid-template-columns: 22px minmax(0, 1fr) minmax(0, 220px) 76px 116px 32px;
      }
      @container (max-width: 700px) {
        grid-template-columns: 22px minmax(0, 1fr) 110px 44px;
        &[data-has-status] {
          grid-template-columns: 22px minmax(0, 1fr) 110px 44px;
        }
        > :nth-child(3) {
          display: none;
        }
      }
      @container (max-width: 480px) {
        grid-template-columns: 22px minmax(0, 1fr) 44px;
        &[data-has-status] {
          grid-template-columns: 22px minmax(0, 1fr) 44px;
        }
      }

      @container (max-width: 480px) {
        padding-inline: 8px;
      }
    `,
    rowMenuCell: css`
      grid-column: 5;
      justify-self: end;
      display: inline-flex;
      .kb-row[data-has-status] & {
        grid-column: 6;
      }
      @container (max-width: 700px) {
        grid-column: 4;
        .kb-row[data-has-status] & {
          grid-column: 4;
        }
      }
      @container (max-width: 480px) {
        grid-column: 3;
        .kb-row[data-has-status] & {
          grid-column: 3;
        }
      }
    `,
    compactStatus: css`
      display: none;
      @container (max-width: 700px) {
        display: inline-flex;
        margin-inline-start: 8px;
      }
    `,
    /**
     * 行内标题。既用于文档行的 span，也用于文件夹行的 button——
     * button 的默认外观在这里一次抹平（背景 / 边框 / 内距 / 字体），
     * 两行读起来是同一列文字。
     */
    rowTitle: css`
      min-width: 0;
      padding: 0;
      border: none;
      background: none;
      font-family: inherit;
      font-size: ${LIBRARY_FONT_SIZE.item}px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 7px;
      line-height: 1.6;
      color: ${v.text};
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      &:focus-visible {
        outline: 2px solid ${v.focus};
        outline-offset: 2px;
        border-radius: ${token.borderRadiusSM}px;
      }
    `,
    /**
     * 行内的属性位（大小 / 摘要片段）。
     *
     * **必须能收缩**：笔记的摘要是任意长的正文，而这一格是 `nowrap` ——
     * 不给它 `min-width: 0` 与省略号，一行就会被撑到比容器宽，
     * 整页冒出横向滚动条（实测：进列表布局后页面下方出现横向条）。
     */
    rowMeta: css`
      min-width: 0;
      font-size: ${LIBRARY_FONT_SIZE.meta}px;
      color: ${v.secondary};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `,
    rowStatus: css`
      display: none;
      justify-self: start;
      .kb-row[data-has-status] & {
        display: inline-flex;
      }
      @container (max-width: 700px) {
        .kb-row[data-has-status] & {
          display: none;
        }
      }
    `,
    rowTime: css`
      grid-column: 4;
      font-size: ${LIBRARY_FONT_SIZE.badge}px;
      color: ${v.secondary};
      font-variant-numeric: tabular-nums;

      .kb-row[data-has-status] & {
        grid-column: 5;
      }

      @container (max-width: 700px) {
        grid-column: 3;

        .kb-row[data-has-status] & {
          grid-column: 3;
        }
      }

      @container (max-width: 480px) {
        display: none;
      }
    `,

    /* 空态与加载 */
    empty: css`
      padding: 56px 20px;
      text-align: center;
    `,
    emptyHint: css`
      display: block;
      margin-top: 6px;
      font-size: ${FONT_SIZE.meta}px;
      color: ${v.secondary};
      line-height: 1.9;
    `,
    emptyActions: css`
      margin-top: 16px;
      display: flex;
      justify-content: center;
      gap: 10px;
    `,
    loading: css`
      max-width: 1080px;
      margin: 0 auto;
      padding: 8px 0;
    `,
    modalFieldLabel: css`
      display: block;
      margin-bottom: 8px;
      font-size: ${LIBRARY_FONT_SIZE.meta}px;
      font-weight: 600;
      color: ${v.text};
    `,

    /**
     * 拖放上传的整页提示（图1 的「可直接拖到本页上传」）。
     *
     * 覆盖在 `page` 上、不吃指针事件（pointer-events: none）——它出现时
     * 指针正拖着文件，任何拦截都会让 drop 落空。
     */
    dropOverlay: css`
      position: absolute;
      inset: 8px;
      z-index: 10;
      border: 2px dashed ${v.accent};
      border-radius: 12px;
      background: ${v.accentBg};
      display: grid;
      place-items: center;
      font-size: ${FONT_SIZE.body}px;
      color: ${v.secondary};
      pointer-events: none;
    `,

    /* 一个知识库都没有时的引导 */
    onboard: css`
      max-width: 460px;
      margin: 12vh auto 0;
      text-align: center;
    `,
    onboardTitle: css`
      font-size: ${LIBRARY_FONT_SIZE.onboard}px;
      font-weight: 600;
      color: ${v.text};
      margin: 0;
    `,
    onboardText: css`
      margin: 10px 0 20px;
      font-size: ${FONT_SIZE.excerpt}px;
      line-height: 1.8;
      color: ${v.secondary};
    `,
  }
})
