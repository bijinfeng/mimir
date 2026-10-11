import { createStyles } from 'antd-style'
import { FONT_SIZE, NAV_NARROW_QUERY } from '../../theme/tokens'

/**
 * 文档视图的样式。
 *
 * 单独成文件的原因：正文排版（Tiptap 渲染出的裸 DOM）与只读正文的
 * 样式覆写加起来三百多行，混在组件文件里会把逻辑挤到看不见。
 * 规范见 `.trellis/spec/project/design.md` §4.3 / §5。
 */
export const useStyles = createStyles(({ css, token, prefixCls }) => ({
  /**
   * 根容器：文档视图 + （可选的）问 AI 侧栏，横向排列。
   * `.wrap` 原来的职责（整列）原样保留，只是变成了根的一个 flex 子项。
   */
  root: css`
    position: relative;
    height: 100%;
    display: flex;
    min-width: 0;
    overflow: hidden;
    background: ${token.colorBgContainer};
  `,
  wrap: css`
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: ${token.colorBgContainer};
  `,
  /**
   * 文档头部。**单行**，文件沿用 Office 标题栏，笔记通过 noteHeader 强化标题。
   *
   * 它原先占三行：一个「返回库」胶囊独占一行、28px 的大标题一行、元信息行
   * 又一行——加起来约 150px，而下面才是内容。Office 的头部只有一行：文件名
   * 在左、动作在右，其余信息不占版面。文件类文档下面就是纸张 / 表格 / 幻灯片，
   * 那些是**越高越好**的东西，上面压三行铬条说不过去。
   *
   * 顺序固定为：返回 · 标题 · 元信息 · 动作（靠右）。与下方工具区
   * 之间用轻边界区分，正文滚动时顶部操作持续可见。
   */
  header: css`
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 48px;
    padding: 0 20px;
    border-bottom: 1px solid ${token.colorBorderSecondary};

    @media (max-width: 600px) {
      padding-inline: 10px;
      gap: 4px;
    }
  `,
  noteHeader: css`
    --document-title-size: ${FONT_SIZE.item}px;
    --document-title-weight: 500;
    gap: 10px;
    padding-inline: 10px;

    @media (max-width: 600px) {
      gap: 4px;
    }
  `,
  /**
   * 文档标题。文件用原有 16px；笔记用克制的单行文件名样式。
   *
   * ## 两个坑叠在一起，都静默
   *
   * **一、必须用 `&.${prefixCls}-typography` 抬特异性。** antd 的
   * `Typography.Title` 自带一条
   * `h1:where(...).ant-typography { font-size: var(--ant-font-size-heading-1) }`
   * ——`h1` 元素贡献 (0,0,1)、`.ant-typography` 贡献 (0,1,0)，合计 (0,1,1)，
   * 单类选择器 (0,1,0) 盖不住。不抬的话标题渲染成 38px，而规范写的是 16px，
   * 且不报错、看起来只是「标题偏大」。
   *
   * **二、抬了特异性之后，纯 `<h1>` 又匹配不上这条规则。** 上传件的标题
   * 原先渲染成裸 `<h1>`，于是 `&&.ant-typography` 匹配不到它，字号回落到
   * 浏览器默认的 2em = **28px**——一个 44px 的头部里塞着 28px 的字，看起来
   * 就是「挤在一起且很丑」（用户的原话）。修法是**两个分支都用
   * `Typography.Title`**：展示态一个元素类型、一条样式路径，不存在「哪条
   * 规则匹配不到」这种问题。笔记编辑态单独使用 Input underlined。
   */
  headerTitle: css`
    &&.${prefixCls}-typography {
      flex: none;
      min-width: 0;
      max-width: 40%;
      margin: 0;
      font-size: var(--document-title-size, ${FONT_SIZE.section}px);
      font-weight: var(--document-title-weight, 600);
      line-height: 1.4;
      letter-spacing: 0;
      color: ${token.colorText};
      /* 长标题省略而不是换行——换行会把 44px 的头部撑成两行 */
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;

      @media (max-width: 600px) {
        flex: 1;
        min-width: 0;
        max-width: none;
      }
    }
  `,
  noteTitleGroup: css`
    display: flex;
    align-items: center;
    flex: 0 1 auto;
    min-width: 0;
    max-width: 55%;

    @media (max-width: 600px) {
      flex: 1;
      max-width: none;
    }
  `,
  noteTitleText: css`
    &&&.${prefixCls}-typography {
      flex: 0 1 auto;
      max-width: none;
    }
  `,
  headerTitleEdit: css`
    flex: none;
    width: 24px;
    min-width: 24px;
    height: 24px;
    padding: 0;
    opacity: 0;
    color: ${token.colorTextTertiary};
    pointer-events: none;
    transition: opacity 0.12s ease-out;

    .note-title-group:hover &,
    .note-title-group:focus-within & {
      opacity: 1;
      pointer-events: auto;
    }
    @media (hover: none) {
      opacity: 1;
      pointer-events: auto;
    }
  `,
  headerTitleInput: css`
    &&.${prefixCls}-input {
      flex: 0 1 auto;
      width: auto;
      min-width: 120px;
      max-width: 55%;
      height: 24px;
      padding-inline: 0;
      font-size: var(--document-title-size, ${FONT_SIZE.section}px);
      font-weight: var(--document-title-weight, 600);
      line-height: 1.4;
      field-sizing: content;

      @media (max-width: 600px) {
        flex: 1;
        max-width: none;
      }
    }
  `,
  /* 元信息：一行、可省略。它承载的是「一眼要确认的东西」——状态、来源、
     在哪、格式与大小、日期。标签与目录不在这里（它们在 doc-menu.tsx 里，
     那里还能增删——同一份信息两条路径没有必要）。

     **项与项之间给一个分隔点**：五项灰色文字挨在一起时读不出分组，看起来
     像一长串没说完的话（实测就是这个观感）。点用 `::before` 画，不占 DOM。 */
  headerMeta: css`
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextTertiary};
    white-space: nowrap;

    @media (max-width: 600px) {
      display: none;
    }

    /*
     * 短标签**不收缩**——半截的标签（「手…」）与半截的汉字一样读不出意思。
     *
     * 原先写的就是 flex: none，问题出在**没有任何东西让位**：这一行比内容
     * 窄时由外层 overflow: hidden 直接切一刀——22px 的容器里放 60px 的
     * 「手动编辑」徽标，结果是「手动」加半个字配一条竖直硬切边（实测
     * 420px 视口：文字右缘 341 对裁剪线 310，31px 文字被切掉）。
     *
     * 让位分两层：**长项缩（省略号）**、**短项整块消失**。长项是位置
     * （vault 路径 / 原文件名 / URL），它自己那条规则带 flex: 0 1 auto 与
     * min-width 48px——缩了也仍然有用，所以它接住所有挤压；短项是徽标、
     * 格式、日期，它们由下面的容器查询按重要性整块摘掉。
     */
    > * {
      flex: none;
    }

    /*
     * **整项让位**（见下面的容器查询）：短标签不缩成「手…」。
     *
     * 「手动编辑」这类标注只有四五个字，缩到极限剩下的一个多字读不出
     * 意思，而它要么说清、要么让开。让位的顺序按「谁最不重要」：日期 →
     * 格式与大小 → 来源标注 → 全空。位置（vault 路径 / 原文件名 / URL）
     * 留到最后——它是这一行里唯一**缩了也仍然有用**的一项。
     *
     * 判据是**这一行自己的宽度**（容器查询）而不是视口宽度：同一个视口下
     * 笔记的标题短、上传件还多一个「下载」按钮，两者的元信息行能差一倍
     * （实测 480px 视口：笔记 58px 对上传件 27px），按视口定阈值必然有一边
     * 判断错。这一行最后有多宽由 flex 算，不由我们猜。
     *
     * 阈值是**按最宽的一档相加**得出的（上传件那一档：来源 60 + 中点 8 +
     * 位置 48 + 中点 8 + 格式 82 + 中点 8 + 日期 68 = 282），所以它覆盖
     * 项数更少的笔记。位置自己带 48px 的下界，于是任何一档都不会「缩到
     * 看不见字」——真到了 48px 以下，整行空着。
     */
    container-type: inline-size;

    /* 日期最不重要：282px = 60 + 8 + 48 + 8 + 82 + 8 + 68 + 2 */
    @container (max-width: 282px) {
      > :last-child {
        display: none;
      }
    }

    /* 来源标注 / 状态徽标：124px = 60 + 8 + 48 + 8 */
    @container (max-width: 124px) {
      > :first-child {
        display: none;
      }
    }

    /* 连 48px 的位置都放不下：空着，不留一截 */
    @container (max-width: 48px) {
      > * {
        display: none;
      }
    }

    /* 除第一个之外的每一项前面一个中点 */
    > * + *::before {
      content: '·';
      margin-right: 8px;
      color: ${token.colorTextQuaternary};
    }
  `,
  noteMeta: css`
    flex: none;
    color: ${token.colorTextTertiary};
  `,
  /* 位置（笔记的 vault 路径 / 资料的 URL）。它是元信息里唯一可能很长的一项，
     所以只有它能被压缩并省略 */
  location: css`
    flex: 0 1 auto;
    min-width: 48px;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.meta}px;
  `,
  /* 动作区。**靠右**：高频动作在左、状态在中间、动作在右是工具条的通用约定 */
  headerActions: css`
    display: flex;
    align-items: center;
    gap: 2px;
    flex: none;
    margin-left: auto;
  `,
  /* 头部动作按钮的文字档。默认的 antd Button 是「控件」的重量（有底色、
     有边框），而头部上的它更像一个**动作入口**——无底色 + hover 才显形，
     这样头部读起来是一条安静的路径栏，不是一个表单 */
  tbBtn: css`
    flex: none;
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextSecondary};

    &:hover {
      color: ${token.colorText} !important;
    }

    @media (max-width: 500px) {
      .${prefixCls}-btn-icon + span {
        display: none;
      }
    }
  `,
  /* 来源标注：手动编辑 / AI 整理 / 本机导入。借自 WeKnora ——
     标出内容是人写的还是机器生成的（PRD §5.10）。

     两处色对原先写死在浅色上（`#1a56c4` on `#e8f1ff`、`#5c6570` on `#f0f1f3`），
     深色下它们是「深蓝字压在浅蓝底上」，在本该变暗的面板上会亮得刺眼。
     改成走语义 token 的成对值：手动编辑 = 信息色对，AI 整理 = 中性色对。
     两者都在 design.test.ts 的通用矩阵里（语义文字 on 同语义底 ≥ 4.5）。

     **窄到放不下时整块让位**（见 headerMeta 的 container-type 与那里的阈值，
     124px）：四个字的标注缩成「手…」读不出意思，而它要么说清、要么让开。
     阈值必须与那里一致——状态徽标存在时它是第二个子项，
     那条「第一项」的规则管不到它 */
  originManual: css`
    padding: 1px 7px;
    border-radius: 4px;
    font-size: ${FONT_SIZE.badge}px;
    font-weight: 500;
    color: ${token.colorInfoText};
    background: ${token.colorInfoBg};

    @container (max-width: 124px) {
      display: none;
    }
  `,
  originAuto: css`
    padding: 1px 7px;
    border-radius: 4px;
    font-size: ${FONT_SIZE.badge}px;
    font-weight: 500;
    color: ${token.colorTextSecondary};
    background: ${token.colorFillTertiary};

    @container (max-width: 124px) {
      display: none;
    }
  `,
  /* 上传件的格式与大小（「PDF · 2.4 MB」）。
     **不是徽标**——它没有底色，只是一条中性文字：格式是文件的属性，
     而彩色徽标专指「来源」（DESIGN §3.7、§8.3） */
  formatMeta: css`
    color: ${token.colorTextTertiary};
    white-space: nowrap;

    /* 格式与大小比位置更早让位（206px = 60 + 8 + 48 + 8 + 82）。
       让位的判据与阈值见 headerMeta 的 container-type 那一段 */
    @container (max-width: 206px) {
      display: none;
    }
  `,

  /* 返回。Office 里没有这个按钮，而 mimir 的两栏布局必须有（PRD §5.5：
     「回去」是显式动作，不能靠浏览器后退）。做成**低调的小胶囊**：它是
     入口而非主要内容，不该像原来那样独占一整行 */
  back: css`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
    height: 26px;
    padding: 0 9px;
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

    &:focus-visible {
      outline: 2px solid ${token.colorPrimaryBorder};
      outline-offset: 2px;
    }

    @media (max-width: 500px) {
      width: 28px;
      justify-content: center;
      padding: 0;

      span {
        display: none;
      }
    }
  `,
  noteBack: css`
    height: 28px;
    padding-inline: 6px;
    border-color: transparent;
    border-radius: 6px;
    color: ${token.colorTextSecondary};
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
    /*
     * **height: 100% 而不是 min-height: 100%**：这一行是**有界**的。
     *
     * 原先写 min-height 时它只是下限，高度仍按内容 auto 撑开——于是外壳
     * （.mimir-editor）在可用高度只有 856px 的容器里量出 922px，超出
     * 66px；换来的是面板那个滚动条，代价是**外壳的底部被挤出视口**：pptx
     * 选中一个文本框之后，附属面板（y 875–931）与状态行（sticky bottom，
     * y 873–900）同占一段位置，前者整块落在视口外——点上去像没反应。
     * 实测同一位置 xlsx 的面板 y 833–873 刚好放得下，所以只有 pptx 露出来。
     *
     * 定死高度之后，多出来的内容由**外壳自己**滚（.me-scroll，它本来就是
     * flex: 1 + min-height: 0 + overflow: auto）——工具条、附属面板、状态行
     * 都在这条滚动链之外，三个都常驻可见。
     *
     * 只读资料那一列不受影响：它是 align-self: flex-start、按内容高，
     * 撑出这一行时面板照样滚（scrollHeight 会算上溢出的后代）。
     */
    height: 100%;
  `,
  /**
   * 内容列。**760px 是正文的（markdown 笔记、抓取的资料）**——行宽有可读性
   * 上限，再宽眼睛回行时容易串行。原件不适用这条：纸张、表格、幻灯片是
   * 「越宽越好看清」的东西，在 760px 里被挤成一条（实测在 1440 宽屏上两侧
   * 各空 280px，用户的原话是「留那么大的空白也没必要」）。
   */
  inner: css`
    flex: 1;
    min-width: 0;
    max-width: 860px;
    padding: 48px 50px 140px;

    @media ${NAV_NARROW_QUERY} {
      padding: 28px 24px 110px;
    }

    @media (max-width: 600px) {
      padding-inline: 18px;
    }
  `,
  /**
   * 原件的内容列：占满容器。
   *
   * 内边距也收窄（40px → 16px）——那两个边距是为正文的行宽服务的，与
   * 480px 的编辑器配在一起就是「内容挤在中间、四周一圈空的」。
   */
  innerWide: css`
    flex: 1;
    min-width: 0;
    /*
     * **align-self: stretch 是必须的**：外层内容行是 align-items: flex-start
     * （正文那一列要按内容高，不要被拉长），于是这一列默认也只有内容高——
     * 高度链就断在这里，编辑器铺不到窗口底（实测高度只有 219px，而可用的是
     * 800+）。撑起来之后编辑器自己的 flex: 1 才拿得到剩余高度。
     */
    align-self: stretch;
    /*
     * **四边不留 padding**（D-054）：编辑器自己带边框与圆角，外面再垫一层
     * 就是「框套框」——而且垫掉的每一像素都是内容能用的高度。Office 网页版
     * 也是这样：编辑区直接贴着标题栏，中间没有一条灰带。
     */
    padding: 0;
    /* 内容要能撑满：列本身是 flex 子项，子项再往下要拿到高度 */
    display: flex;
    flex-direction: column;
    min-height: 0;
  `,

  /* 右侧大纲。只在标题数 ≥ 2 时出现——两段话的笔记不需要目录，
     常驻只是白占 196px（.trellis/spec/project/product.md §5.10） */
  /**
   * 笔记的大纲：在编辑器外壳的 bodySide 里（工具栏下面、正文右边）。
   * 外壳的 `.mimir-editor__side` 已经给了宽度 / 滚动 / 右内边距，
   * 这里只补排版细节。sticky 不需要——侧列本身就是固定高度。
   */
  outlineSide: css`
    height: 100%;
    padding: 6px 0 24px 10px;
    /* 浮层浮在滚动内容之上，底必须不透明——否则滚动的文字从大纲字缝里透出来 */
    background: ${token.colorBgContainer};
  `,

  /* ── 问 AI 侧栏（D-087）────────────────────────────────── */

  /**
   * 侧栏容器。**挂载与可见分离**的落点：`data-open` 不在时宽度折到 0
   * （transition 让它滑出），里面的内容保持挂载——流式进行中关掉再打开，
   * 回答还在继续。内层固定 400px，折起时内容不被压扁。
   */
  /* ── 侧栏空态的使用指南（D-090）────────────────────────── */

  /*
   * 横向内边距由 `--mimir-chat-gutter` 提供（ChatPanel 的 inner），
   * 这里只管纵向节奏——两处都加会在侧栏里叠出双倍左缩进。
   *
   * 顶部给 0：滚动区自己已经有 24px 上边距，再加上这里的 16px 就是
   * 从面板顶到问候语之间空 84px（44 头部 + 24 + 16）——在 400px 宽的
   * 面板里那是很显眼的一段空白。底部留 8，与滚动区的 16 合成 24。
   */
  guide: css`
    padding: 0 0 8px;
  `,

  guideHello: css`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: ${FONT_SIZE.body}px;
    font-weight: 600;
    color: ${token.colorText};
    margin-bottom: 8px;
  `,

  guideLead: css`
    margin: 0 0 16px;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.75;
    color: ${token.colorTextSecondary};
  `,

  /**
   * 能力清单的卡片。底色比面板浅一档（fill 档而不是容器色）——
   * 它是一块「说明」，与聊天内容区分开；不用警示色，这里没有异常。
   */
  guideCard: css`
    padding: 16px 18px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadius}px;
    background: ${token.colorFillQuaternary};
    margin-bottom: 16px;
  `,

  guideCardTitle: css`
    font-size: ${FONT_SIZE.note}px;
    font-weight: 600;
    color: ${token.colorText};
    margin-bottom: 8px;
  `,

  guideList: css`
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 12px;

    li {
      display: grid;
      grid-template-columns: 2px 1fr;
      column-gap: 12px;
      font-size: ${FONT_SIZE.note}px;
      line-height: 1.6;
    }

    b {
      color: ${token.colorText};
      font-weight: 600;
    }
  `,

  /** 每个要点前的细色条，与工作区选中态使用同一语义色。 */
  guideDot: css`
    width: 2px;
    height: 100%;
    border-radius: 2px;
    background: ${token.colorLink};
  `,

  /** 要点的第二行说明。与标题同一格（第二列），自然换行 */
  guideItemDesc: css`
    grid-column: 2;
    color: ${token.colorTextTertiary};
  `,

  /**
   * 快捷提问：一排可点的胶囊，点一下直接发出。
   *
   * **没有下外边距**：它现在是 `composerTop` 的最后一个子元素、紧挨着
   * 输入框，而下面那 12px 由 Composer 自己的上内边距提供。这里再留一格
   * 会叠成 34px 的空隙（实测：14 + 8 + 12）——胶囊与输入框是一组，
   * 中间只该有一口气。
   */
  guideSuggest: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  `,

  guideChip: css`
    border: 1px solid ${token.colorBorder};
    background: ${token.colorBgContainer};
    color: ${token.colorText};
    border-radius: 999px;
    padding: 4px 12px;
    font-size: ${FONT_SIZE.note}px;
    font-family: inherit;
    line-height: 1.5;
    cursor: pointer;

    &:hover {
      border-color: ${token.colorPrimary};
      color: ${token.colorLink};
    }
  `,

  aiSidebar: css`
    flex: none;
    width: 0;
    overflow: hidden;
    border-left: 1px solid transparent;
    transition:
      width 0.22s ease-out,
      border-color 0.22s ease-out;

    &[data-open] {
      width: 400px;
      border-left-color: ${token.colorBorderSecondary};
      background: ${token.colorBgContainer};
    }

    /* 工作区不足以并排放正文和 400px 助手时，覆盖正文右侧。
       留 40px 露出正文，使它仍被理解为当前文档的辅助面板。 */
    @media (max-width: 1250px) {
      position: absolute;
      inset-block: 0;
      right: 0;
      z-index: 5;
      transition: none;

      &[data-open] {
        width: min(400px, calc(100% - 40px));
        box-shadow: ${token.boxShadowSecondary};
      }
    }
  `,

  aiSidebarInner: css`
    width: 400px;
    height: 100%;
    display: flex;
    flex-direction: column;

    /* 覆盖层变窄时让内容随宽度收缩，发送按钮始终在面板内。 */
    @media (max-width: 1250px) {
      width: 100%;
      max-width: 100%;
    }
  `,

  aiSidebarHeader: css`
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    height: 44px;
    padding: 0 8px 0 14px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,

  /**
   * 侧栏标题。长标题截断——它后面只有一个关闭按钮，让标题吃掉剩余空间
   * 并省略，比把按钮挤出去好。
   */
  aiSidebarTitle: css`
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: ${FONT_SIZE.note}px;
    font-weight: 600;
    color: ${token.colorTextSecondary};
  `,

  aiSidebarBody: css`
    flex: 1;
    min-height: 0;
  `,

  outline: css`
    flex: none;
    width: 196px;
    align-self: stretch;
    padding: 28px 12px 40px;
    border-left: 1px solid ${token.colorBorderSecondary};
    background: ${token.tintNav};
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
    border-radius: ${token.borderRadiusSM}px;
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
  /* 来源标注：手动编辑 / AI 整理。
     借自 WeKnora —— 标出内容是人写的还是机器生成的（PRD 5.10）。

     两处色对原先写死在浅色上（`#1a56c4` on `#e8f1ff`、`#5c6570` on `#f0f1f3`），
     深色下它们是「深蓝字压在浅蓝底上」，在本该变暗的面板上会亮得刺眼。
     改成走语义 token 的成对值：手动编辑 = 信息色对，AI 整理 = 中性色对。
     两者都在 design.test.ts 的通用矩阵里（语义文字 on 同语义底 ≥ 4.5）。 */

  /* 标题。原型用 letter-spacing:-.01em 收紧——28px 的中文标题不收紧
     会显得松散。字号阶梯见 .trellis/spec/project/design.md §4.2。

     **必须用 `&.${prefixCls}-typography` 抬特异性。** 标题是 antd 的
     `Typography.Title`，它自带一条
     `h1:where(...).ant-typography { font-size: var(--ant-font-size-heading-1) }`
     ——`h1` 元素贡献 (0,0,1)、`.ant-typography` 贡献 (0,1,0)，合计 (0,1,1)，
     而单类选择器只有 (0,1,0)，把它盖不住。实测标题因此渲染成 **38px**
     （antd 的 h1 档），而规范写的是 28px，且不报错、看起来只是「标题偏大」。
     叠上 `&.ant-typography` 后 (0,2,0) 胜出。 */

  /* ── 页脚：来源 / 被引用 ────────────────────────────── */
  /**
   * AI 的两块结果（摘要 / 标签候选）。
   *
   * 底色比正文**略浅一档**（`colorFillQuaternary` 而不是容器底色）：
   * 它是模型生成的内容，不是文档本身，视觉上必须能与正文分开——
   * 用户读到的每一句话都该知道它是谁说的（与引用卡片的处理同一条规矩）。
   *
   * 不用警示色（橙 / 黄）：摘要不是警告。用配色区分「这是机器生成的」
   * 会让它看起来像出了问题。
   */
  aiBlock: css`
    margin: 0 0 20px;
    padding: 14px 16px;
    border-radius: ${token.borderRadius}px;
    background: var(--ant-color-fill-quaternary);
  `,

  aiLabel: css`
    font-size: ${FONT_SIZE.meta}px;
    color: var(--ant-color-text-secondary);
    margin-bottom: 6px;
  `,

  aiText: css`
    font-size: ${FONT_SIZE.body}px;
    line-height: 1.7;
    color: var(--ant-color-text);
    white-space: pre-wrap;
  `,

  aiTags: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  `,

  aiTag: css`
    border: 1px solid var(--ant-color-border);
    background: var(--ant-color-bg-container);
    color: var(--ant-color-text);
    border-radius: 6px;
    padding: 3px 10px;
    font-size: ${FONT_SIZE.excerpt}px;
    cursor: pointer;
    font-family: inherit;

    &:hover {
      border-color: var(--ant-color-primary);
      color: var(--ant-color-primary);
    }
  `,

  foot: css`
    margin-top: 40px;
    padding-top: 18px;
    /* 不画线（D-070）：40px 的留白已经把「正文」和「元信息」分成两段，
       线是重复信号——这是滚动内容内部的分区，不是固定区与滚动区的边界 */
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
  /* 双链的一条。**是真 button**（键盘可达），所以要把浏览器给 button 的
     默认观感全部推掉：它要看起来就是一条正文里的链接。
     padding 归 0 而不是留 2px——留了会在行里垫高、行距与旁边的标签对不上 */
  footLink: css`
    padding: 0;
    border: none;
    background: none;
    font-family: inherit;
    font-size: ${FONT_SIZE.note}px;
    line-height: inherit;
    color: ${token.colorLink};
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;

    &:hover {
      opacity: 0.8;
    }

    &:focus-visible {
      outline: 2px solid ${token.colorPrimaryBorder};
      outline-offset: 2px;
      border-radius: 2px;
    }
  `,

  warn: css`
    margin-top: 20px;
    padding: 11px 14px;
    border-radius: ${token.borderRadius}px;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.75;
    color: ${token.colorWarningText};
    background: ${token.colorWarningBg};

    b {
      display: block;
      margin-bottom: 3px;
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
