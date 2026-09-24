import type { Citation } from '@mimir/shared'
import { KindBadge } from '@/components/DocumentBadges'
import { createStyles } from 'antd-style'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 回答下的引用块。
 *
 * 每个来源显示：类型徽标 + 标题 + 原文片段。点击跳回原文位置
 * （`docs/PRD.md` §5.2）。`documentId` 与字符偏移都来自服务端检索的真实结果，
 * 所以「点引用跳回原文」是真的能跳的，不是装饰。
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
    font-size: ${FONT_SIZE.excerpt}px;
    font-weight: 500;
    color: ${token.colorText};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  snippet: css`
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.55;
    color: ${token.colorTextSecondary};
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  `,
}))

export function CitationCards({
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
            <KindBadge kind={citation.kind} />
            <span className={styles.title}>{citation.title}</span>
          </div>
          <div className={styles.snippet}>{citation.snippet}</div>
        </button>
      ))}
    </div>
  )
}
