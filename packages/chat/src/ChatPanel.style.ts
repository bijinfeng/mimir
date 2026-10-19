import { createStyles } from 'antd-style'

/**
 * 对话面板的样式。
 *
 * ## 字号走 CSS 变量，不 import 宿主的 FONT_SIZE
 *
 * `createStyles` 的样式体是**静态字符串**——读不到 React context 里的普通值，
 * 而这个包也不该 import 宿主的主题模块（包不认识宿主）。CSS 自定义属性是
 * 唯一能跨包流动的通道，所以字号一律 `var(--mimir-chat-font-note, 12.5px)`：
 *
 *  - **宿主填**（`apps/web/src/components/chat/ChatHostVars.tsx`，做法与
 *    `editor-theme-bridge.ts` 同源）：值来自 `theme/tokens.ts` 的 `FONT_SIZE`
 *  - **回退值让包在测试与独立预览里也能渲染**（不挂桥也不会退成浏览器默认
 *    的 13.3px —— 那正是 design.test.ts 那条守卫要消灭的东西）
 *
 * 变量**只在声明它的元素及其子树上生效**，所以宿主那一层必须挂在面板的
 * 祖先上；挂错的表现是「样式全都退回回退值」——界面能用、字号与设计稿差
 * 半个像素，不报错（`editor-theme-bridge.ts` 记过同一条）。
 *
 * ## 颜色/间距/圆角仍然走 antd token
 *
 * `createStyles` 内部就是宿主的 `theme.useToken()`，所以它自动继承宿主的
 * 外观与自定义 token（`tintList` / `tintHover` / `inlineCodeFg`）。
 * 包**不新建主题**、不传 `theme` 的 ConfigProvider（`.trellis/spec/office/engine/index.md`
 * 的规矩同样适用：内层传 theme 会重算 cssVar key，`--ant-*` 变量名变了，
 * 引用处静默失效）。
 *
 * 这几个类由面板里的几个部件共用（面板本体、空态、引用块、动作条）：
 * 它们的排版规则是同一套（内容列宽 + gutter 变量），各写一份必然漂移。
 */

/** 内容列宽（原型实测过的中文阅读宽度）。**只在这里写一次** */
export const CONTENT_WIDTH = 856

export const useChatPanelStyles = createStyles(({ css, token }) => ({
  /* 存成笔记 / 打开笔记的行：跟在引用卡之后，弱化成一条次级动作 */
  saveRow: css`
    display: flex;
    justify-content: flex-end;
    margin-top: -6px;
  `,
  wrap: css`
    height: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: ${token.surfaceContent ?? token.colorBgContainer};
  `,
  /* 滚动区的外壳。**必须有这一层**：「回到底部」按钮要浮在滚动区右下角，
     而它不能放进滚动容器里——那样它会跟着内容滚走 */
  scrollWrap: css`
    position: relative;
    flex: 1;
    min-height: 0;
  `,
  scroll: css`
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px 0 32px;

    /* 空态：整列变成居中舞台——问候语与输入框成一组、在可视区里垂直居中
       （Notion / ChatGPT 的新对话形态，用户拍板）。开始对话后输入部落回
       面板底部，这里恢复普通滚动列。子项的 margin auto 是关键：空间富余
       时居中、问候语+输入框超高时 auto 边距归零、内容可以正常滚出去
       （justify-content: center 会把溢出部分的顶部裁到摸不着）。 */
    &[data-empty] {
      display: flex;
      flex-direction: column;
    }
  `,
  /* 空态的内容组：水平居中在内容列上、垂直由滚动列的 auto 边距居中 */
  innerEmpty: css`
    width: 100%;
    max-width: 768px;
    margin: auto;
    padding-bottom: 32px;
  `,
  /* 离底时才出现的「回到底部」。位置贴着滚动区右下角、留出与内容列同量级
     的边距；阴影走浮层档（DESIGN §5.3）——它浮在内容之上。
     显隐不靠条件渲染：`ScrollToBottom` 在贴底时把自己置为 disabled，
     这里把它隐掉（`visibility` 而不是 `display`，位置不跳） */
  /* v7：在滚动区右下角保留固定位置，hover 不改变几何。 */
  backToBottom: css`
    position: absolute;
    right: 24px;
    bottom: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 6px;
    box-shadow: ${token.boxShadowSecondary};
    background: ${token.colorBgContainer};
    color: ${token.colorTextSecondary};
    cursor: pointer;
    z-index: 10;
    transition:
      color 0.12s ease-out,
      border-color 0.12s ease-out;

    &:hover,
    &:focus-visible {
      color: ${token.colorText};
      border-color: ${token.colorBorder};
    }
    &:focus-visible {
      outline: 2px solid ${token.colorPrimaryBorder};
      outline-offset: 2px;
    }

    &:disabled {
      visibility: hidden;
    }
  `,
  /* 输入区上方的界线滚动才显形（D-070）：消息被切断、顶着输入区走时才
     需要它；静态下输入区只有自己的圆角盒子。线画在这层包裹上而不是
     Composer 里——显形开关（滚动容器的 scrollTop）归面板管 */
  composerLine: css`
    border-top: 1px solid transparent;
    background: ${token.surfaceContent ?? token.colorBgContainer};
    transition: border-color 0.2s ease-out;

    &[data-scrolled] {
      border-top-color: ${token.colorBorderSecondary};
    }
  `,
  /**
   * 输入框上方那一排（快捷提问）。**与消息列同一套对齐**：同样的
   * max-width 与 gutter 变量，否则它会与输入框错开——那两处看似无关，
   * 但肉眼一眼就能看出没对齐。
   */
  composerTop: css`
    max-width: ${CONTENT_WIDTH}px;
    margin: 0 auto;
    /* 下内边距为 0：与输入框之间的那口气由 Composer 自己的上内边距给
       （12px）。这里再垫一层会叠成两段空隙——D-093 收尾时实测过
       34px 的间隔，就是三层边距累加出来的 */
    padding: 0 var(--mimir-chat-gutter, 24px);
  `,

  inner: css`
    width: 100%;
    max-width: 808px;
    margin: 0 auto;
    /*
     * 消息列上限 808px，输入区域上限 856px；左右内边距统一走变量，
     * 主视图为 24px，窄侧栏由宿主覆写为 16px。
     */
    padding: 0 var(--mimir-chat-gutter, 24px);
  `,

  thread: css`
    display: flex;
    flex-direction: column;
    gap: 32px;
    min-width: 0;

    [data-role='user'] {
      align-self: flex-end;
      width: fit-content;
      max-width: 90%;
      min-width: 0;
      color: ${token.colorText};
      font-size: var(--mimir-chat-font-body, 14px);
      line-height: 1.75;
    }
    [data-role='user'] > [data-message-body] {
      padding: 12px 16px;
      border-radius: ${token.borderRadius}px;
      background: ${token.colorFillQuaternary};
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    [data-role='user'] > [data-message-actions] {
      justify-content: flex-end;
      margin-top: 4px;
    }
    [data-role='user'] > [data-message-heading] {
      justify-content: flex-end;
    }
    [data-role='assistant'] {
      min-width: 0;
      font-size: var(--mimir-chat-font-reading, 15px);
      line-height: 1.85;
      color: ${token.colorText};
      content-visibility: auto;
      contain-intrinsic-size: auto 200px;
    }
    [data-message-body] {
      min-width: 0;
      overflow-wrap: anywhere;
    }
  `,
  branch: css`
    display: flex;
    align-items: center;
    gap: 8px;
    align-self: center;
    color: ${token.colorTextSecondary};
    font-size: var(--mimir-chat-font-meta, 12px);
    font-variant-numeric: tabular-nums;
    button {
      display: inline-grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border: 0;
      border-radius: ${token.borderRadius}px;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    button:hover:not(:disabled) {
      background: ${token.colorFillTertiary};
    }
    button:disabled {
      color: ${token.colorTextDisabled};
      cursor: not-allowed;
    }
    button:focus-visible {
      outline: 2px solid ${token.focusRing ?? token.colorPrimaryBorder};
      outline-offset: 2px;
    }
  `,
  historyError: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border: 1px solid ${token.colorErrorBorder};
    border-radius: ${token.borderRadius}px;
    background: ${token.colorErrorBg};
    color: ${token.colorErrorText};
    font-size: var(--mimir-chat-font-body, 14px);
    line-height: 1.7;
  `,

  assistantHeading: css`
    display: flex;
    align-items: center;
    margin-bottom: 10px;
    line-height: 1.5;
    color: ${token.colorTextSecondary};
    font-size: var(--mimir-chat-font-note, 12.5px);
    font-weight: 600;
  `,

  empty: css`
    padding: 0 var(--mimir-chat-gutter, 24px) 16px;
    text-align: center;
  `,
  emptyMark: css`
    display: inline-grid;
    place-items: center;
    width: 32px;
    height: 32px;
    margin-bottom: 16px;
    color: ${token.colorLink};
  `,
  emptyTitle: css`
    margin: 0 0 8px;
    font-size: var(--mimir-chat-font-display, 28px);
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 1.4;
    color: ${token.colorText};

    @media (max-width: 600px) {
      font-size: var(--mimir-chat-font-page-title, 19px);
    }
  `,
  emptyLead: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    font-size: var(--mimir-chat-font-body, 14px);
    line-height: 1.7;
  `,
  /* 空态里的发送失败行：组的其它内容都居中，它也居中
     （会话里那条 stopped 靠左是对的——它跟的是消息列） */
  emptyError: css`
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    font-size: var(--mimir-chat-font-note, 12.5px);
    color: ${token.colorTextTertiary};
  `,

  /* 「已停止生成」那一行（官方 StoppedRun 的 reason pill 形态）：
     mono 药丸装原因 + 旁边一句交代。写成正文色而不是警示色：
     停止是用户主动做的，不是错误（DESIGN §3.4） */
  stopped: css`
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 12px;
    line-height: 1.6;
    font-size: var(--mimir-chat-font-note, 12.5px);
    color: ${token.colorTextTertiary};
  `,
  stoppedPill: css`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: ${token.borderRadius}px;
    background: ${token.colorFillQuaternary};
    color: ${token.colorTextSecondary};
  `,
  stoppedNote: css`
    color: ${token.colorTextSecondary};
  `,

  /* 历史加载骨架屏（官方 ThreadHistorySkeleton 的换算）：右侧 h-9 的
     提问气泡（rounded-xl）+ 两组 h-4 递减文本条；组内 gap-y-2、组间
     由 thread 的 24px 出；入场 fade-in（官方 animate-in 的换算） */
  skeleton: css`
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding-top: 4px;
    animation: me-chat-fade-in 0.2s ease-out both;
    @media (prefers-reduced-motion: reduce) {
      &,
      * {
        animation: none;
      }
    }

    @keyframes me-chat-fade-in {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
  `,
  skeletonAsk: css`
    height: 36px;
    width: 40%;
    margin-left: auto;
    border-radius: 12px;
    background: ${token.colorFillTertiary};
    animation: me-chat-skeleton 1.4s ease-in-out infinite;
  `,
  skeletonGroup: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,
  skeletonLine: css`
    height: 16px;
    border-radius: ${token.borderRadiusSM}px;
    background: ${token.colorFillTertiary};
    animation: me-chat-skeleton 1.4s ease-in-out infinite;

    @keyframes me-chat-skeleton {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.45;
      }
    }
  `,

  /* 只给读屏的文案（骨架屏的「正在加载会话」）。
     用 clip-path 而不是 display: none——后者会把它从无障碍树上摘掉，
     于是读屏用户听到的是一片空白。 */
  srOnly: css`
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  `,
}))
