import type { Citation } from '@mimir/shared'
import { parseMarkdown } from '@tanstack/markdown'
import type { BlockNode, InlineNode } from '@tanstack/markdown'
import { Tag } from 'antd'
import { createStyles } from 'antd-style'

/**
 * 回答下的引用块。
 *
 * 每个来源显示：标题 + 原文片段 + **命中通道**。点击跳回原文位置
 * （`.trellis/spec/project/product.md` §5.2）。`documentId` 与字符偏移都来自服务端检索的真实结果，
 * 所以「点引用跳回原文」是真的能跳的，不是装饰。
 *
 * ## 命中通道为什么必须显示
 *
 * 通道是判断「这条为什么被选中」的唯一线索（`.trellis/spec/project/product.md` §5.2 把
 * 「标题、原文片段与命中通道」列为引用块的组成部分；`.trellis/spec/project/architecture.md` §7 说
 * 实际跑了哪些通道写进 `matchedBy`，就是为了让这件事在界面上可解释）。
 * 缺了它，用户看不出这条是词级命中还是子串兜底命中——而后者意味着
 * **分词没切对、检索随时可能漏**。
 *
 * ## 通道名在这里翻译，不取注册表
 *
 * 契约里 `matchedBy` 是 `string[]`（通道 id，来自 `plugins/leg/` 的注册表，
 * 见 `packages/shared/src/search.ts`）。显示用的是**检索过程那一行同一套词**
 * （「词级召回 / 子串兜底」）——两块内容挨着，同一个通道两个名字会让人
 * 以为它们不是一回事。注册表里将来多出来的通道没有对应词就原样显示 id，
 * 那比编一个名字诚实。
 *
 * ## 为什么是通栏的浅色块，而不是并排的卡片方阵
 *
 * 曾经做成 grid 的卡片方阵。原型不是那样——它把引用做成**一条条通栏的
 * 浅色出处块**（`max-width:640px`，无边框，只有 tintList 底色）。
 * 差别不只是好看：
 *
 *  - 引用在语义上接近**脚注**：「这段结论出自哪里」。通栏更贴这个语义
 *  - 并排卡片会让人误以为它们是**可对比的选项**（像产品对比表），
 *    而实际上它们是同一段回答的多个出处，没有并列关系
 *  - 引用文字比正文短，通栏不会浪费横向空间
 */

/**
 * 通道 id → 界面上读得懂的名字。
 *
 * 与检索过程那一行的措辞一致（`apps/server/src/services/assistant-stream.ts`
 * 的 `词级召回 N 段 · 子串兜底 N 段`）。`scope` 是单篇提问时服务端写的
 * 伪通道（没有走召回），也得有个名字——否则那类引用块会显示一个英文 id。
 */
const CHANNEL_LABEL: Record<string, string> = {
  keyword: '词级召回',
  substring: '子串兜底',
  vector: '向量',
  scope: '限定本篇',
}

/** 卡片显示可扫读的文字；点击仍传原始 Citation，保留精确片段与偏移。 */
function inlineText(node: InlineNode): string {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
      return node.value
    case 'image':
      return node.alt
    case 'break':
      return ' '
    case 'inlineHtml':
      return ''
    case 'footnoteReference':
      return ''
    default:
      return node.children.map(inlineText).join('')
  }
}

function blockText(node: BlockNode): string {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return node.children.map(inlineText).join('')
    case 'code':
    case 'html':
      return node.value
    case 'list':
      return node.items.map((item) => item.children.map(blockText).join(' ')).join(' ')
    case 'blockquote':
    case 'callout':
    case 'component':
      return node.children.map(blockText).join(' ')
    case 'table':
      return [...node.header, ...node.rows.flat()]
        .map((cell) => cell.children.map(inlineText).join(' '))
        .join(' ')
    case 'footnotes':
      return node.items.map((item) => item.children.map(blockText).join(' ')).join(' ')
    case 'thematicBreak':
      return ''
  }
}

function citationPreview(snippet: string): string {
  return parseMarkdown(snippet, { frontmatter: false, headingIds: false })
    .children.map(blockText)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const useStyles = createStyles(({ css, token }) => ({
  list: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 12px;
    /* 与检索过程、消息气泡同宽：对话列里这三样是一条竖线上的三个块 */
    max-width: 640px;
  `,
  /* 无边框、只有底色。原型没给引用块描边——描边会把它变成一个「控件」，
     而它其实是一块**引用区**。hover 只提亮底色，表示「可以点」 */
  card: css`
    display: block;
    width: 100%;
    padding: 8px 11px;
    border: none;
    border-radius: 6px;
    background: ${token.tintList};
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s ease-out;

    &:hover {
      background: ${token.tintHover};
    }
  `,
  top: css`
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 3px;
  `,
  title: css`
    flex: 1;
    min-width: 0;
    font-size: var(--mimir-chat-font-excerpt, 13px);
    font-weight: 500;
    color: ${token.colorText};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  /* 命中通道。中性、无彩色底：它是**元信息**（这条为什么在这），
     不是状态徽标（DESIGN §3.7 那种色对留给「偏离常态」的状态）。
     与标题同排但小一档，扫读时不会跟标题抢。 */
  channel: css`
    flex: none;
    margin-inline-end: 0;
    font-size: var(--mimir-chat-font-badge, 11.5px);
    line-height: 1.6;
    color: ${token.colorTextTertiary};
  `,
  snippet: css`
    font-size: var(--mimir-chat-font-note, 12.5px);
    line-height: 1.55;
    color: ${token.colorTextSecondary};
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  `,
}))

/**
 * 引用块。
 *
 * `citations` 由调用方给（消息层从 parts 里取，见 `data-parts.ts` 的
 * `useCitationsPart`）——**这一层只管长什么样**。
 * 与 `TraceDisclosure` 同一种拆法：数据那条路径归 `data-parts.ts`。
 */
export function CitationList({
  citations,
  onOpen,
}: {
  citations: Citation[]
  onOpen: (documentId: string, citation: Citation) => void
}) {
  const { styles } = useStyles()

  if (citations.length === 0) return null

  return (
    <div className={styles.list}>
      {citations.map((citation) => (
        <button
          key={`${citation.documentId}-${citation.start}`}
          type="button"
          className={styles.card}
          onClick={() => onOpen(citation.documentId, citation)}
        >
          <div className={styles.top}>
            <span className={styles.title}>{citation.title}</span>
            {/* 命中通道。多个通道一起命中就并列写出来（通道之间是「都命中」，
                不是「或」）；通道名未知时原样显示 id，见 CHANNEL_LABEL */}
            {citation.matchedBy.length > 0 && (
              <Tag variant="filled" className={styles.channel}>
                {citation.matchedBy.map((id) => CHANNEL_LABEL[id] ?? id).join(' + ')}
              </Tag>
            )}
          </div>
          <div className={styles.snippet}>{citationPreview(citation.snippet)}</div>
        </button>
      ))}
    </div>
  )
}
