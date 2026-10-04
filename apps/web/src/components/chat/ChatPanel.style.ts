import { createStyles } from 'antd-style'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 对话面板的样式。
 *
 * 从 `ChatPanel.tsx` 里搬出来的（纯搬运）：那个文件在加「停止 / 状态行 /
 * 回到底部」之前已经 536 行，超过 `apps/web/AGENTS.md` 说的 300 行——
 * 拆的依据是关注点，行数只是信号。样式是其中最容易整块搬走的一块。
 *
 * 这几个类由面板里的四个部件共用（面板本体、空态、本轮结果、动作条）：
 * 它们的排版规则是同一套（860px 内容列、40px 内边距），各写一份必然漂移。
 */
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
  /* 空态的内容组：水平居中在 860 列上、垂直由滚动列的 auto 边距居中 */
  innerEmpty: css`
    width: 100%;
    max-width: 860px;
    margin: auto;
  `,
  /* 离底时才出现的「回到底部」。位置贴着滚动区右下角、留出与内容列同量级
     的边距；阴影走浮层档（DESIGN §5.3）——它浮在内容之上 */
  backToBottom: css`
    position: absolute;
    right: 20px;
    bottom: 12px;
    box-shadow: ${token.boxShadowSecondary};
  `,
  /* 输入区上方的界线滚动才显形（D-070）：消息被切断、顶着输入区走时才
     需要它；静态下输入区只有自己的圆角盒子。线画在这层包裹上而不是
     Composer 里——显形开关（消息列表的 scrollTop）归 ChatPanel 管 */
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
    max-width: 860px;
    margin: 0 auto;
    /* 下内边距为 0：与输入框之间的那口气由 Composer 自己的上内边距给
       （12px）。这里再垫一层会叠成两段空隙——D-093 收尾时实测过
       34px 的间隔，就是三层边距累加出来的 */
    padding: 0 var(--mimir-chat-gutter, 40px);
  `,

  inner: css`
    max-width: 860px;
    margin: 0 auto;
    /*
     * 左右内边距走变量：主视图是 860px 的宽列，40px 是那里的比例；
     * 侧栏只有 400px，同样的 40px 会吃掉五分之一宽度，内容被压成一条
     * （实测指南在 400px 面板里只剩 320px 宽）。侧栏把它覆写成 16px
     * ——同一个「栏宽 → 边距」的比例关系，两种宽度下都成立。
     */
    padding: 0 var(--mimir-chat-gutter, 40px);
  `,

  /* 消息的排布。用户消息靠右、助手消息占满宽度——
     助手回答里会有表格与代码块，限宽会让它们挤成一团 */
  /* 消息之间的间距。原型的对话列是 max-width:860px 的居中单列，
     消息之间留 20px —— 比正文段落间距大，比卡片间距小。
     用户消息靠右、助手消息占满宽度（回答里会有表格与代码块，
     限宽会让它们挤成一团）。 */
  thread: css`
    display: flex;
    flex-direction: column;
    gap: 20px;

    [data-role='user'] {
      align-self: flex-end;
      max-width: 78%;
      padding: 9px 14px;
      border-radius: 12px 12px 2px 12px;
      background: ${token.colorPrimaryBg};
      font-size: ${FONT_SIZE.body}px;
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;
    }

    [data-role='assistant'] {
      font-size: ${FONT_SIZE.body}px;
      line-height: 1.75;
      color: ${token.colorText};
    }

    /* 助手回答是 Markdown（由官方的 TextPart 渲染），
       所以这里要覆盖它的元素样式以符合 mimir 的正文规范 */
    [data-role='assistant'] {
      p {
        margin: 12px 0;
      }
      h1,
      h2,
      h3 {
        margin: 20px 0 10px;
        line-height: 1.5;
      }
      h1 {
        font-size: ${FONT_SIZE.pageTitle}px;
      }
      h2 {
        font-size: ${FONT_SIZE.section}px;
      }
      ul,
      ol {
        margin: 12px 0;
        padding-left: 22px;
      }
      code {
        font-family: ${token.fontFamilyCode};
        font-size: ${FONT_SIZE.excerpt}px;
        background: ${token.colorFillSecondary};
        color: ${token.inlineCodeFg};
        padding: 1.5px 5px;
        border-radius: ${token.borderRadiusSM}px;
      }
      pre {
        background: ${token.colorFillTertiary};
        border: 1px solid ${token.colorBorderSecondary};
        border-radius: ${token.borderRadius}px;
        padding: 14px 16px;
        overflow-x: auto;
        font-size: ${FONT_SIZE.excerpt}px;

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
    }
  `,

  empty: css`
    /* 问候语与输入框成一组：原来的 80px 顶部留白是给「贴顶布局」的，
       居中之后组内只留与输入框之间的一口气；40px 与 Composer 自己的
       inner 内边距同宽，两组文字落在同一条内容竖线上 */
    padding: 0 40px 20px;
    text-align: center;
  `,
  emptyTitle: css`
    font-size: ${FONT_SIZE.section}px;
    font-weight: 600;
    margin-bottom: 8px;
    color: ${token.colorText};
  `,
  emptySub: css`
    font-size: ${FONT_SIZE.note}px;
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
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextTertiary};
  `,

  /* 「已停止生成」那一行。写成正文色而不是警示色：停止是用户主动做的，
     不是错误（DESIGN §3.4 的语义色只给偏离常态的状态） */
  stopped: css`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextTertiary};

    /* 行内图标按 DESIGN §7.1 的 14px，不跟着 12.5px 的文字缩 */
    svg {
      font-size: 14px; /* 图标字形，非文本 */
    }
  `,
}))
