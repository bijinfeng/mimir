import { Brain, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createStyles } from 'antd-style'
import { MarkdownPart } from './MarkdownPart.js'
const useStyles = createStyles(({ css, token }) => ({
  root: css`
    margin: 10px 0;
    color: ${token.colorTextSecondary};
    font-size: var(--mimir-chat-font-excerpt, 13px);
  `,
  trigger: css`
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 0;
    width: 100%;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    &:focus-visible {
      outline: 1px solid ${token.colorPrimary};
      outline-offset: 2px;
    }
    svg:last-child {
      margin-left: auto;
      transition: transform 0.15s;
    }
    &[aria-expanded='true'] svg:last-child {
      transform: rotate(180deg);
    }
  `,
  content: css`
    max-height: 220px;
    overflow: auto;
    padding: 0 12px;
    margin: 8px 0 0 7px;
    border-left: 1px solid ${token.colorBorderSecondary};
    font-size: var(--mimir-chat-font-excerpt, 13px);
    line-height: 1.9;
  `,
}))
/** Streaming follows until the user explicitly takes over disclosure or scroll. */
export function ReasoningPart({ text, status }: { text: string; status?: { type: string } }) {
  const { styles } = useStyles()
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
        onClick={() => setManual(!open)}
      >
        <Brain size={15} />
        {live ? '正在思考…' : '思考过程'}
        <ChevronDown size={13} />
      </button>
      {open && (
        <div
          ref={panel}
          className={styles.content}
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
