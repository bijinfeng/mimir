import type { DocumentDetail } from '@mimir/shared'
import { useStyles } from '@/components/document/DocumentPanel.style'

/**
 * 侧栏空态的使用指南（D-090，形态照语雀的阅读助手）。
 *
 * ## 它要回答的三个问题
 *
 * 第一次点开「问 AI」的人看着一个空输入框，需要知道：
 *
 *  1. **你是谁**——一句话的问候（标题里已经写了「问 AI · 文档名」）
 *  2. **你能干什么**——能力清单，按「读这篇」的实际用途列，不列产品功能
 *  3. **我该问什么**——可点的示例问题。空输入框是最大的门槛，
 *     给一两个真问题比任何说明都有效
 *
 * ## 示例问题按文档类型给
 *
 * 笔记问「讲了什么、怎么用」，上传件问「这份文件里的关键信息」——
 * 这不是智能推断，只是两三条**确实能回答**的模板。它们必须真的能答：
 * 一条点了没用的建议比没有建议更伤（用户会怀疑整个功能坏了）。
 * 所以示例里不写「总结这一页」这类依赖具体内容的问题，只写
 * 检索范围稳定命中本篇的问法。
 *
 * ## 与主视图空态的关系
 *
 * 主视图的空态是**居中舞台**（问候语 + 输入框成一组）；侧栏是
 * **指南在上、输入框固定底部**。两种形态各自服务一个场景：
 * 主视图是全屏页面，居中更像「新对话」；侧栏是窄面板 + 辅助阅读，
 * 指南占住空间、输入框钉在底部才不显得空。共同的判断是
 * 「空态必须说清楚这个输入框会做什么」。
 */
export function DocChatGuide({
  doc,
  onAsk,
}: {
  doc: DocumentDetail
  onAsk: (question: string) => void
}) {
  const { styles } = useStyles()

  /**
   * 示例问题。**只给能稳定命中的**——它们都会走「限定本篇」的检索，
   * 而下面三条问的都是「这一篇本身」，不依赖用户存了什么别的内容。
   */
  const suggestions = [
    { label: '速读本文', question: '这篇讲了什么？用几句话概括。' },
    { label: '提出要点', question: '这篇里最重要的几个要点是什么？' },
    { label: '解释细节', question: '这篇里有哪些我需要特别注意的细节？' },
  ]

  return (
    <div className={styles.guide}>
      <div className={styles.guideHello}>
        <span aria-hidden="true">👋</span> 你好，我是阅读助手
      </div>
      <p className={styles.guideLead}>
        我会读当前这篇《{doc.title}》，帮你概括内容、回答问题。 范围锁定在这一篇，不会去找别的文档。
      </p>

      <div className={styles.guideCard}>
        <div className={styles.guideCardTitle}>快速上手指南</div>
        <ul className={styles.guideList}>
          <li>
            <span className={styles.guideDot} aria-hidden="true" />
            <b>速读文章</b>
            <span className={styles.guideItemDesc}>点下面的「速读本文」，或直接在输入框里提问</span>
          </li>
          <li>
            <span className={styles.guideDot} aria-hidden="true" />
            <b>带着问题读法</b>
            <span className={styles.guideItemDesc}>
              选中正文里的一段话，点浮出的「就这段提问」——比问整篇更精确
            </span>
          </li>
          <li>
            <span className={styles.guideDot} aria-hidden="true" />
            <b>提问会先检索</b>
            <span className={styles.guideItemDesc}>
              回答基于命中原文并标出 [1] [2] 引用，点引用能跳回原处
            </span>
          </li>
          <li>
            <span className={styles.guideDot} aria-hidden="true" />
            <b>没配模型也能用</b>
            <span className={styles.guideItemDesc}>
              那种情况下它只做检索、把命中的原文列出来，并说明没有花钱
            </span>
          </li>
        </ul>
      </div>

      {/*
        示例问题：点一下直接发出去（不是塞进输入框让用户再按一次回车）。
        它们的问题文本已经完整，多一步确认只是摩擦。
      */}
      <div className={styles.guideSuggest}>
        {suggestions.map((item) => (
          <button
            key={item.label}
            type="button"
            className={styles.guideChip}
            onClick={() => onAsk(item.question)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className={styles.guideFoot}>对话会留在这里；一轮问答结束后可以「存为笔记」。</p>
    </div>
  )
}
