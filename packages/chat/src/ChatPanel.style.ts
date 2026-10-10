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
export const CONTENT_WIDTH = 860

export const useChatPanelStyles = createStyles(({ css, token }) => ({
  /* 存成笔记 / 打开笔记的行：跟在引用卡之后，弱化成一条次级动作 */
  saveRow: css`
    display: flex;
    justify-content: flex-end;
    margin-top: -6px;
  `,
  wrap: css`
    height: 100%;
    display: flex;
    flex-direction: column;
    background: ${token.colorBgContainer};
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
    padding: 24px 0 16px;

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
    max-width: ${CONTENT_WIDTH}px;
    margin: auto;
  `,
  /* 离底时才出现的「回到底部」。位置贴着滚动区右下角、留出与内容列同量级
     的边距；阴影走浮层档（DESIGN §5.3）——它浮在内容之上。
     显隐不靠条件渲染：`ScrollToBottom` 在贴底时把自己置为 disabled，
     这里把它隐掉（`visibility` 而不是 `display`，位置不跳） */
  /* 回到底部（官方 ThreadScrollToBottom 的换算）：圆形 outline 钮、
   **居中**悬在 composer 上方（-top-12 的语义），不再是右下角 */
  backToBottom: css`
    position: absolute;
    left: 50%;
    bottom: 10px;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 9999px;
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
      outline: 1px solid ${token.colorPrimaryBorder};
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
    padding: 0 var(--mimir-chat-gutter, 40px);
  `,

  inner: css`
    max-width: ${CONTENT_WIDTH}px;
    margin: 0 auto;
    /*
     * 左右内边距走变量：主视图是 860px 的宽列，40px 是那里的比例；
     * 侧栏只有 400px，同样的 40px 会吃掉五分之一宽度，内容被压成一条
     * （实测指南在 400px 面板里只剩 320px 宽）。侧栏把它覆写成 16px
     * ——同一个「栏宽 → 边距」的比例关系，两种宽度下都成立。
     */
    padding: 0 var(--mimir-chat-gutter, 40px);
  `,

  /* 消息的排布。Codex 式的 transcript，不是聊天气泡：用户消息不缩进右边、
     不上底色，行首一枚 › 标记（挂在左缩进槽里）承担「这是你说的」，
     其余靠留白与字号分层。助手回答占满宽度——回答里会有表格与代码块，
     限宽会让它们挤成一团 */
  thread: css`
    display: flex;
    flex-direction: column;
    gap: 24px; /* 官方 gap-y-6：轮次之间的空隙是容器的，不是消息自己的 */

    /*
     * 消息的排布（assistant-ui 的 thread 形态，D-099 收尾）：
     *
     *  - **用户消息：右对齐的 muted 气泡**。对应上游的 flex justify-end +
     *    bg-muted + rounded-2xl + max-width 85% + px-4 py-3；
     *    D-097 曾把它改平成左对齐 transcript（行首 › 标记），用户随后点名
     *    「整个对话的交互样式都按 assistant-ui 来」，气泡回归——
     *    三条「气泡压碎中文」的理由被用户明示的样式取向覆盖，记录在案
     *  - **助手消息：左对齐占满宽度**，只有 py-2 的呼吸——assistant-ui
     *    不用大间距，轮次之间的空隙由每条消息自己的上下 padding 出
     *  - 说话人的区分靠**对齐 + 气泡**（上游同款），不再需要行首标记
     */
    [data-role='user'] {
      align-self: flex-end;
      max-width: 85%;
      background: ${token.colorFillTertiary};
      border-radius: 16px; /* 官方 rounded-(--composer-radius) = 1rem */
      padding: 8px 16px; /* 官方 px-4 py-2 */
      font-size: var(--mimir-chat-font-body, 14px);
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;
      color: ${token.colorText};

      /* 正文是 <div><p>；p 有全局 reset 兜着，
         这里再压一次保险（气泡里多出一段 margin 会把文字推离内边距） */
      p {
        margin: 0;
      }
    }

    [data-role='assistant'] {
      font-size: var(--mimir-chat-font-body, 14px);
      line-height: 1.75;
      color: ${token.colorText};

      /* 渲染性能：长会话里每一条都参与布局是浪费。contain-intrinsic-size
         给出占位高度，滚动条不会因为「还没渲染的条目」而乱跳
         （200px 是普通一条回答的高度量级） */
      content-visibility: auto;
      contain-intrinsic-size: auto 200px;
    }

    /* 助手回答是 Markdown（由 parts/MarkdownPart 渲染），
       所以这里要覆盖它的元素样式以符合 mimir 的正文规范 */
    [data-role='assistant'] {
      p {
        margin: 12px 0;

        /* 首尾归零：中文正文里最容易多出的一段空白——第一条与最后一个
           段落各多 12px，整块看起来「飘」 */
        &:first-child {
          margin-top: 0;
        }
        &:last-child {
          margin-bottom: 0;
        }
      }
      h1,
      h2,
      h3 {
        margin: 20px 0 10px;
        line-height: 1.5;
      }
      h1 {
        font-size: var(--mimir-chat-font-page-title, 19px);
      }
      h2 {
        font-size: var(--mimir-chat-font-section, 16px);
      }
      ul,
      ol {
        margin: 12px 0;
        padding-left: 22px;
      }
      code {
        font-family: ${token.fontFamilyCode};
        font-size: var(--mimir-chat-font-excerpt, 13px);
        background: ${token.colorFillSecondary};
        color: ${token.inlineCodeFg};
        padding: 1.5px 5px;
        border-radius: ${token.borderRadiusSM}px;
      }
      /* 代码块的「头」（语言名 + 复制）在 CodeBlock 里；这里只管 pre 的
         底与段落级排版，块内的 code 不再重复上底色 */
      pre {
        background: ${token.colorFillTertiary};
        border: 1px solid ${token.colorBorderSecondary};
        border-radius: ${token.borderRadius}px;
        padding: 14px 16px;
        overflow-x: auto;
        font-size: var(--mimir-chat-font-excerpt, 13px);
        margin: 12px 0;

        code {
          background: none;
          color: ${token.colorText};
          padding: 0;
        }
      }
      a {
        color: ${token.colorLink};
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      /* 代码块自己的那一组覆盖（头与 pre 的接缝）在
         parts/CodeBlock.style.ts 里——那边用「属性 + 属性 + 元素」的选择器
         压过这里的 pre 规则，靠的是特异性而不是注入顺序。见那边的说明。 */
    }
  `,

  empty: css`
    /* 空态（官方 ThreadWelcome 形态）：欢迎语在列内**左对齐**（不是
       居中舞台），24px medium 一句话（官方 text-2xl font-medium
       tracking-tight），下方留 mb-6 与输入区隔开 */
    padding: 0 2px 24px;
    text-align: left;
  `,
  emptyTitle: css`
    font-size: var(--mimir-chat-font-display, 24px); /* 官方 text-2xl */
    font-weight: 500;
    letter-spacing: -0.02em; /* 官方 tracking-tight */
    margin-bottom: 8px;
    color: ${token.colorText};
  `,
  emptySub: css`
    font-size: var(--mimir-chat-font-note, 12.5px);
    color: ${token.colorTextTertiary};
    line-height: 1.9;
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
    margin-top: 8px;
    font-size: var(--mimir-chat-font-note, 12.5px);
    color: ${token.colorTextTertiary};
  `,
  stoppedPill: css`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 9999px;
    background: ${token.colorFillQuaternary};
    font-family: ${token.fontFamilyCode};
    color: ${token.colorTextTertiary};
  `,
  stoppedNote: css`
    color: ${token.colorTextQuaternary};
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
