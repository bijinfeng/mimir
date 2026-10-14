import { useStyles } from './DocumentPanel.style'

/**
 * 快捷提问。**只给能稳定命中的**——它们都会走「限定本篇」的检索，
 * 而这三条问的都是「这一篇本身」，不依赖用户存了什么别的内容。
 */
export const QUICK_ASKS = [
  { label: '速读本文', question: '这篇讲了什么？用几句话概括。' },
  { label: '提出要点', question: '这篇里最重要的几个要点是什么？' },
  { label: '解释细节', question: '这篇里有哪些我需要特别注意的细节？' },
] as const

/**
 * 快捷提问贴着输入框，让空态通过可执行的动作表达用途。
 *
 * 点一下**直接发出**，不是塞进输入框让用户再按回车：问题文本已经完整，
 * 多一步确认只是摩擦。
 */
export function DocQuickAsks({ onAsk }: { onAsk: (question: string) => void }) {
  const { styles } = useStyles()

  return (
    <div className={styles.guideSuggest}>
      {QUICK_ASKS.map((item) => (
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
  )
}
