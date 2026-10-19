import { Brain, ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useProcessStyles } from './Process.style.js'
import { MarkdownPart } from './MarkdownPart.js'
/** Streaming follows until the user explicitly takes over disclosure or scroll. */
export function ReasoningPart({ text, status }: { text: string; status?: { type: string } }) {
  const { styles } = useProcessStyles()
  const contentId = useId()
  const live = status?.type === 'running'
  const [manual, setManual] = useState<boolean | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const open = manual ?? live
  useEffect(() => {
    if (!text && !live) return
    if (pinned.current && live && panel.current)
      panel.current.scrollTop = panel.current.scrollHeight
  }, [text, live])
  if (!text.trim() && !live) return null
  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={open ? contentId : undefined}
        onClick={() => setManual(!open)}
      >
        <Brain size={15} />
        <span>{live ? '正在思考…' : '思考过程'}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div
          ref={panel}
          id={contentId}
          role="region"
          aria-label="思考过程"
          tabIndex={0}
          className={`${styles.content} ${styles.reasoning}`}
          onScroll={() => {
            if (panel.current)
              pinned.current =
                panel.current.scrollHeight - panel.current.scrollTop - panel.current.clientHeight <
                24
          }}
        >
          <MarkdownPart text={text} />
        </div>
      )}
    </div>
  )
}
