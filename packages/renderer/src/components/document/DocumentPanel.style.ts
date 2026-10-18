import { createStyles } from 'antd-style'
import { CONTENT_WIDTH, FONT_SIZE, NAV_NARROW_QUERY, PANEL_HEADER_HEIGHT } from '../../theme/tokens'

/** Approved document-review-v1 typography; local roles do not change other modules. */
export const DOCUMENT_FONT_SIZE = {
  control: 12,
  path: 13,
  meta: 11,
  narrowTitle: 25,
  readingHeading: 22,
} as const

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
    /* 问 AI 是否覆盖正文取决于文档面板自身宽度，不取决于整页视口。 */
    container-type: inline-size;
    height: 100%;
    display: flex;
    min-width: 0;
    overflow: hidden;
    background: ${token.surfaceContent};
    /* Approved reading rhythm is scoped to this document host, including note body. */
    [data-document-prose] .tiptap,
    .mimir-markdown-body .ProseMirror {
      font-size: ${FONT_SIZE.reading}px;
      line-height: 1.9;
      h2 {
        font-size: ${DOCUMENT_FONT_SIZE.readingHeading}px;
        font-weight: 600;
        line-height: 1.5;
        letter-spacing: normal;
        margin: 30px 0 12px;
        scroll-margin-top: 24px;
        &:first-child {
          margin-top: 0;
        }
      }
      p {
        margin: 0 0 16px;
      }
      blockquote {
        border-left: 2px solid ${token.colorBorderSecondary};
        padding: 6px 16px;
        margin: 22px 0;
        color: ${token.colorTextSecondary};
        p:last-child {
          margin-bottom: 0;
        }
      }
      ul,
      ol {
        padding-left: 22px;
        margin: 16px 0;
      }
      ul[data-type='taskList'] {
        padding-left: 0;
      }
      ul[data-type='taskList'] p {
        margin: 0;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: ${FONT_SIZE.body}px;
        margin: 22px 0;
      }
      th,
      td {
        padding: 9px 12px;
        border: 1px solid ${token.colorBorderSecondary};
        text-align: left;
      }
      th {
        background: ${token.colorFillQuaternary};
        font-weight: 500;
      }
      pre {
        background: ${token.colorFillQuaternary};
        border: 0;
        border-radius: 8px;
        padding: 16px;
        font-family: ${token.fontFamilyCode};
        font-size: ${FONT_SIZE.excerpt}px;
        line-height: 1.75;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        code {
          font-size: inherit;
        }
      }
      img {
        max-width: 100%;
        height: auto;
        border-radius: 8px;
      }
    }
    .mimir-editor--note .mimir-editor__body--split > .me-scroll {
      padding-right: 196px;
    }
    .mimir-editor--note .mimir-editor__side {
      top: 0;
      right: 0;
      bottom: 0;
    }
    .mimir-markdown-body {
      max-width: ${CONTENT_WIDTH + 96}px;
      padding: 32px 32px 72px;
    }
    @container markdown-reading (max-width: 620px) {
      .mimir-markdown-body {
        padding: 28px 16px 48px;
      }
    }
    @media (max-width: 600px) {
      [data-document-prose] .tiptap h2,
      .mimir-markdown-body .ProseMirror h2 {
        font-size: ${DOCUMENT_FONT_SIZE.readingHeading - 1}px;
      }
    }
    [data-title-metadata] {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 16px;
      font-size: ${DOCUMENT_FONT_SIZE.meta}px;
      line-height: 1.7;
      color: ${token.colorTextSecondary};
      overflow-wrap: anywhere;
    }
    [data-document-empty-body] {
      margin: 0;
      color: ${token.colorTextSecondary};
      font-size: ${FONT_SIZE.reading}px;
      line-height: 1.9;
    }
    [data-document-notice] {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 9px 14px;
      background: ${token.colorFillQuaternary};
      color: ${token.colorTextSecondary};
      font-size: ${DOCUMENT_FONT_SIZE.control}px;
      line-height: 1.6;
      overflow-wrap: anywhere;
      flex: none;
      &[role='alert'],
      &[data-error] {
        color: ${token.colorErrorText};
        background: ${token.colorErrorBg};
      }
      p {
        margin: 0;
      }
      button {
        font-size: inherit;
      }
    }
  `,
  wrap: css`
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: ${token.surfaceContent};
  `,
  /** All document kinds use the compact Markdown note header. */
  header: css`
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    height: ${PANEL_HEADER_HEIGHT}px;
    padding: 0 10px;
    border-bottom: 1px solid ${token.colorBorderSecondary};

    @media (max-width: 600px) {
      gap: 4px;
      padding-inline: 6px;
    }
  `,
  /* Title and optional rename action shrink before the right-side actions. */
  headerTitleGroup: css`
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
  headerTitle: css`
    &&.${prefixCls}-typography {
      flex: 0 1 auto;
      min-width: 0;
      margin: 0;
      font-size: ${DOCUMENT_FONT_SIZE.path}px;
      font-weight: 500;
      line-height: 1.4;
      letter-spacing: 0;
      color: ${token.colorText};
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  `,
  headerPath: css`
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
    color: ${token.colorTextTertiary};
    font-size: ${DOCUMENT_FONT_SIZE.path}px;
  `,
  headerFolder: css`
    flex: 0 1 auto;
    max-width: 42%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    @media ${NAV_NARROW_QUERY} {
      display: none;
      & + span { display: none; }
    }
  `,
  headerPathCurrent: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: ${token.colorTextSecondary};
    font-weight: 400;
  `,
  saveStatus: css`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding-inline: 6px;
    color: ${token.colorTextTertiary};
    font-size: ${DOCUMENT_FONT_SIZE.meta}px;
    white-space: nowrap;
    &[data-save-state='error'] {
      color: ${token.colorErrorText};
    }
    &[data-save-state='saving'] svg {
      animation: mimir-save-spin 1s linear infinite;
    }
    @keyframes mimir-save-spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      &[data-save-state='saving'] svg {
        animation: none;
      }
    }
  `,
  noteHeading: css`
    margin-bottom: 28px;
  `,
  noteTitleGroup: css`
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
    [data-title-editor] {
      width: 100%;
      min-width: 0;
    }
    [data-title-actions] {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 8px;
      margin: 10px 0;
      button {
        font-size: ${DOCUMENT_FONT_SIZE.path}px;
      }
    }
    [data-title-error] {
      color: ${token.colorErrorText};
      font-size: ${DOCUMENT_FONT_SIZE.control}px;
      font-weight: 400;
      margin: 6px 0;
      overflow-wrap: anywhere;
    }
  `,
  noteTitle: css`
    &&.${prefixCls}-typography {
      flex: 0 1 auto;
      min-width: 0;
      margin: 0 0 10px;
      font-size: ${FONT_SIZE.display}px;
      font-weight: 700;
      line-height: 1.35;
      color: ${token.colorText};
      overflow-wrap: anywhere;
      @media (max-width: 600px) {
        font-size: ${DOCUMENT_FONT_SIZE.narrowTitle}px;
        line-height: 1.4;
      }
    }
  `,
  noteTitleInput: css`
    &&.${prefixCls}-input {
      width: 100%;
      margin-bottom: 10px;
      padding: 3px 6px;
      height: auto;
      border: 1px solid ${token.focusRing};
      border-radius: 6px;
      font-size: ${FONT_SIZE.display}px;
      font-weight: 700;
      line-height: 1.35;
      caret-color: ${token.colorText};
      &:focus,
      &:focus-within {
        border-color: ${token.focusRing};
        box-shadow: 0 0 0 2px ${token.colorPrimaryBg};
      }
      @media (max-width: 600px) {
        font-size: ${DOCUMENT_FONT_SIZE.narrowTitle}px;
        line-height: 1.4;
      }
    }
  `,
  noteTitleActions: css`
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
    margin: 10px 0;
    button {
      font-size: ${DOCUMENT_FONT_SIZE.path}px;
    }
  `,
  noteTitleError: css`
    color: ${token.colorErrorText};
    font-size: ${DOCUMENT_FONT_SIZE.control}px;
    font-weight: 400;
    margin: 6px 0;
    overflow-wrap: anywhere;
  `,
  noteUpdated: css`
    font-size: ${DOCUMENT_FONT_SIZE.meta}px;
    line-height: 1.7;
    color: ${token.colorTextTertiary};
  `,
  headerTitleEdit: css`
    flex: none;
    width: 28px;
    min-width: 28px;
    height: 28px;
    padding: 0;
    opacity: 0;
    color: ${token.colorTextTertiary};
    pointer-events: none;
    transition:
      opacity 0.12s ease-out,
      color 0.12s ease-out,
      background 0.12s ease-out;

    .note-title-group:hover &,
    .note-title-group:focus-within & {
      opacity: 1;
      pointer-events: auto;
    }

    /* 增强悬停反馈 */
    &:hover {
      color: ${token.colorPrimary};
      background: ${token.colorFillTertiary};
      border-radius: ${token.borderRadiusSM}px;
    }

    &:focus-visible { outline: 2px solid ${token.focusRing}; outline-offset: 2px; }

    &:active {
      background: ${token.colorFillSecondary};
    }

    @media (hover: none), (pointer: coarse), ${NAV_NARROW_QUERY} {
      width: 40px;
      min-width: 40px;
      height: 40px;
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
      height: 28px;
      padding-inline: 0;
      font-size: ${FONT_SIZE.section}px;
      font-weight: 600;
      line-height: 1.4;
      field-sizing: content;
      /* 编辑状态使用主色下划线，提供清晰的视觉反馈 */
      border-bottom-color: ${token.colorPrimary};

      &:focus,
      &:focus-within {
        border-bottom-color: ${token.colorPrimary};
        box-shadow: none;
      }

      @media (max-width: 600px) {
        flex: 1;
        max-width: none;
      }
    }
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
    height: 30px;
    min-width: 30px;
    padding: 4px 7px;
    font-size: ${DOCUMENT_FONT_SIZE.control}px;
    line-height: 20px;
    color: ${token.colorTextSecondary};

    &:hover {
      color: ${token.colorText} !important;
    }

    &:focus-visible {
      outline: 2px solid ${token.focusRing};
      outline-offset: 2px;
    }
    @media (max-width: 500px) {
      min-width: 36px;
      height: 40px;
      padding: 0;
      .${prefixCls}-btn-icon + span {
        display: none;
      }
    }
  `,
  /* Only the document header's organization menu. The popup is portalled to body,
     so its class belongs on Dropdown rather than on the header subtree. */
  docMenu: css`
    .${prefixCls}-dropdown-menu {
      min-width: min(238px, calc(100vw - 16px));
      max-width: min(320px, calc(100vw - 16px));
      padding: 6px;
      max-height: min(520px, calc(100dvh - 64px));
      overflow-y: auto;
      overscroll-behavior: contain;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: 10px;
      box-shadow: ${token.boxShadowSecondary};
    }

    .${prefixCls}-dropdown-menu-item,
    .${prefixCls}-dropdown-menu-submenu-title {
      min-height: 38px;
      padding: 7px 10px;
      border-radius: ${token.borderRadiusSM}px;
      color: ${token.colorText};
      font-size: ${DOCUMENT_FONT_SIZE.path}px;
      line-height: 1.4;
    }

    .${prefixCls}-dropdown-menu-item-icon {
      display: inline-flex;
      align-items: center;
      color: ${token.colorTextSecondary};
    }

    .${prefixCls}-dropdown-menu-item .${prefixCls}-dropdown-menu-title-content {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    .${prefixCls}-dropdown-menu-item-active,
    .${prefixCls}-dropdown-menu-submenu-active > .${prefixCls}-dropdown-menu-submenu-title {
      background: ${token.colorFillTertiary};
    }

    .${prefixCls}-dropdown-menu-item:focus-visible,
    .${prefixCls}-dropdown-menu-submenu-title:focus-visible {
      outline: 2px solid ${token.colorPrimaryBorder};
      outline-offset: -2px;
    }

    .${prefixCls}-dropdown-menu-item-divider {
      margin: 6px 8px 3px;
      background: ${token.colorBorderSecondary};
    }

    .${prefixCls}-dropdown-menu-item-group-title {
      padding: 5px 10px 4px;
      color: ${token.colorTextTertiary};
      font-size: ${DOCUMENT_FONT_SIZE.meta}px;
    }

    .${prefixCls}-dropdown-menu-sub .${prefixCls}-dropdown-menu-item {
      min-height: 34px;
      padding: 6px;
      font-size: ${DOCUMENT_FONT_SIZE.control}px;
    }

    [data-doc-menu-row] {
      display: flex;
      flex-direction: column;
      min-width: 0;
      max-width: 170px;
      gap: 2px;
    }

    [data-doc-menu-row='tags'] {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }

    [data-doc-menu-detail] {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: ${token.colorTextTertiary};
      font-size: ${DOCUMENT_FONT_SIZE.meta}px;
    }

    [data-doc-menu-group] {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    [data-doc-menu-cost] {
      color: ${token.colorTextSecondary};
      font-size: ${DOCUMENT_FONT_SIZE.meta}px;
      font-weight: 400;
    }
  `,
  /* Same quiet, borderless back action for notes, files and read-only documents. */
  back: css`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
    height: 28px;
    padding: 0 6px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    font-family: inherit;
    font-size: ${DOCUMENT_FONT_SIZE.control}px;
    color: ${token.colorTextSecondary};
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
      width: 40px;
      height: 40px;
      justify-content: center;
      padding: 0;

      span {
        display: none;
      }
    }

    @media (pointer: coarse) {
      min-width: 40px;
      min-height: 40px;
    }
  `,

  scroll: css`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    position: relative;
    scrollbar-width: thin;
    scrollbar-gutter: stable;
    /* Notes already own their scroll gutter; avoid reserving a second 16px outside the editor. */
    &:has(.mimir-editor--note) {
      scrollbar-gutter: auto;
    }
    scrollbar-color: ${token.colorBorderSecondary} transparent;
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
    max-width: ${CONTENT_WIDTH + 96}px;
    padding: 36px 48px 72px;

    @media ${NAV_NARROW_QUERY} {
      padding: 28px 16px 48px;
    }

    @media (max-width: 600px) {
      padding-inline: 16px;
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
    padding: 36px 12px 40px;
    /* 浮层浮在滚动内容之上，底必须不透明——否则滚动的文字从大纲字缝里透出来 */
    background: ${token.surfaceContent};
  `,

  /* ── 问 AI 侧栏（D-087）────────────────────────────────── */

  /**
   * 侧栏容器。**挂载与可见分离**的落点：`data-open` 不在时宽度折到 0
   * （transition 让它滑出），里面的内容保持挂载——流式进行中关掉再打开，
   * 回答还在继续。内层固定 400px，折起时内容不被压扁。
   */
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
    gap: 6px;
  `,

  guideChip: css`
    border: 1px solid ${token.colorBorderSecondary};
    background: ${token.surfaceContent};
    color: ${token.colorText};
    border-radius: 999px;
    padding: 2px 10px;
    min-height: 28px;
    font-size: ${DOCUMENT_FONT_SIZE.control}px;
    font-family: inherit;
    line-height: 1.5;
    cursor: pointer;

    &:hover {
      border-color: ${token.colorPrimary};
      color: ${token.colorLink};
    }

    &:focus-visible {
      outline: 2px solid ${token.focusRing};
      outline-offset: 2px;
    }
  `,

  aiOverlayBackdrop: css`
    position: absolute;
    inset: 0;
    z-index: 4;
    border: none;
    padding: 0;
    background: transparent;
  `,
  aiSidebar: css`
    flex: none;
    width: 0;
    overflow: hidden;
    border-left: 1px solid transparent;
    transition:
      width 0.22s ease-out,
      border-color 0.22s ease-out;

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }

    &[data-open] {
      width: 400px;
      border-left-color: ${token.colorBorderSecondary};
      background: ${token.surfaceContent};
    }

    /* 编辑区不足 480px 时才覆盖；宽度足够时保持真正的三栏布局，
       让编辑器测得的宽度等于可见中栏宽度，工具栏才能正确折叠。 */
    @container (max-width: 880px) {
      position: absolute;
      inset-block: 0;
      right: 0;
      z-index: 5;
      transition: none;

      &[data-open] {
        width: min(400px, calc(100% - 32px));
        box-shadow: ${token.boxShadowSecondary};
      }
    }
  `,

  aiSidebarInner: css`
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  `,

  aiSidebarHeader: css`
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    height: ${PANEL_HEADER_HEIGHT}px;
    padding: 0 10px 0 16px;
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
    font-size: ${DOCUMENT_FONT_SIZE.path}px;
    font-weight: 500;
    color: ${token.colorText};
  `,

  aiSidebarScope: css`
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
    padding: 12px 16px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    font-size: ${DOCUMENT_FONT_SIZE.control}px;
    color: ${token.colorTextSecondary};
    span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  assistantClose: css`
    flex: none;
    width: 30px;
    height: 30px;
    padding: 0;
    @container (max-width: 500px) {
      width: 40px;
      height: 40px;
    }
  `,
  assistantGuide: css`
    /* ChatPanel provides 38px top / 16px sides; the document guide target is 24 / 20. */
    margin-top: -14px;
    padding-inline: 4px;
    @container (max-width: 500px) {
      padding-inline: 0;
    }
    h3 {
      font-size: ${FONT_SIZE.section + 1}px;
      font-weight: 600;
      margin: 0 0 8px;
    }
    p {
      font-size: ${DOCUMENT_FONT_SIZE.path}px;
      line-height: 1.8;
      color: ${token.colorTextSecondary};
      margin: 0;
    }
  `,
  aiSidebarStatus: css`
    flex: none;
    padding: 16px;
    line-height: 1.8;
    overflow-wrap: anywhere;
    p {
      margin: 8px 0;
    }
    strong {
      color: ${token.colorText};
      font-weight: 600;
    }
    border-bottom: 1px solid ${token.colorBorderSecondary};
    color: ${token.colorTextSecondary};
    font-size: ${FONT_SIZE.note}px;
  `,

  aiSidebarBody: css`
    flex: 1;
    min-height: 0;
  `,

  outline: css`
    flex: none;
    width: 196px;
    align-self: stretch;
    padding: 36px 12px 40px;
    border-left: 1px solid transparent;
    background: ${token.surfaceContent};
    max-height: 100%;
    overflow-y: auto;

    @media ${NAV_NARROW_QUERY} {
      display: none;
    }
  `,
  outlineTitle: css`
    font-size: ${DOCUMENT_FONT_SIZE.meta}px;
    font-weight: 600;
    color: ${token.colorTextTertiary};
    margin-bottom: 10px;
    padding-left: 10px;
  `,
  olItem: css`
    display: block;
    width: 100%;
    padding: 6px 11px;
    min-height: 30px;
    margin: 2px 0;
    border: none;
    border-radius: ${token.borderRadiusSM}px;
    background: transparent;
    font-family: inherit;
    font-size: ${DOCUMENT_FONT_SIZE.control}px;
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

    &:focus-visible {
      outline: 2px solid ${token.focusRing};
      outline-offset: -2px;
    }
  `,
  olItemLv3: css`
    padding-left: 23px;
  `,
  olItemActive: css`
    color: ${token.colorLink};
    background: ${token.colorFillQuaternary};
    box-shadow: inset 1px 0 ${token.colorPrimary};
    font-weight: 600;
  `,
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
    margin: 0 0 24px;
    padding: 14px 16px;
    border-radius: 8px;
    background: ${token.colorFillQuaternary};
    [data-ai-result-heading] {
      display: flex;
      gap: 6px;
      align-items: center;
      margin-bottom: 8px;
      > button {
        margin-left: auto;
        min-height: 24px;
        padding: 0;
      }
    }
  `,

  aiLabel: css`
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextSecondary};
    margin-bottom: 6px;
  `,

  aiText: css`
    font-size: ${FONT_SIZE.body}px;
    line-height: 1.8;
    color: ${token.colorText};
    white-space: pre-wrap;
  `,

  aiTags: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  `,

  aiTag: css`
    border: 1px solid ${token.colorBorder};
    background: ${token.colorBgContainer};
    color: ${token.colorText};
    border-radius: 6px;
    padding: 3px 10px;
    font-size: ${FONT_SIZE.excerpt}px;
    cursor: pointer;
    font-family: inherit;

    &:hover {
      border-color: ${token.colorPrimary};
      color: ${token.colorPrimary};
    }
  `,

  foot: css`
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid ${token.colorBorderSecondary};
  `,
  footRow: css`
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin-bottom: 8px;
  `,
  footLabel: css`
    flex: none;
    width: 42px;
    font-size: ${DOCUMENT_FONT_SIZE.control}px;
    color: ${token.colorTextTertiary};
  `,
  footLinks: css`
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    min-width: 0;
    flex: 1;
  `,
  /* 双链的一条。**是真 button**（键盘可达），所以要把浏览器给 button 的
     默认观感全部推掉：它要看起来就是一条正文里的链接。
     padding 归 0 而不是留 2px——留了会在行里垫高、行距与旁边的标签对不上 */
  footLink: css`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 0;
    min-height: 26px;
    max-width: 100%;
    text-align: left;
    overflow-wrap: anywhere;
    border: none;
    background: none;
    font-family: inherit;
    font-size: ${DOCUMENT_FONT_SIZE.control}px;
    line-height: 1.6;
    color: ${token.colorLink};
    cursor: pointer;
    text-decoration: none;
    text-underline-offset: 3px;

    &:hover {
      text-decoration: underline;
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
