import { Button } from 'antd'
import { ArrowUpRight, BookOpen, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { BrandMark } from '../BrandMark'
import { useCitationStyles } from './CitationDemo.style'

/** An intentionally bounded public example: no private data and no model request. */
export function CitationDemo() {
  const { styles } = useCitationStyles()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const source = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) source.current?.focus()
  }, [open])

  function close() {
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }

  return (
    <div className={styles.demo}>
      <div className={styles.question}>
        “上次那份访谈，
        <br />
        为什么强调来源？”
      </div>
      <div className={styles.answer}>
        <BrandMark size={22} title={null} />
        <p>
          引用让结论可以核对，也让我们保留最初的上下文。读到答案之后，仍然能回到资料里，看看这句话是怎么说的。
        </p>
      </div>
      <Button
        ref={trigger}
        className={styles.citation}
        type="text"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <BookOpen size={16} aria-hidden="true" />
        <span>[1] 产品访谈 · 查看原文</span>
        <ArrowUpRight size={16} aria-hidden="true" />
      </Button>
      <div
        id={panelId}
        className={styles.source}
        hidden={!open}
        ref={source}
        tabIndex={-1}
        role="region"
        aria-label="引用原文示例"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            close()
          }
        }}
      >
        <div className={styles.sourceHeading}>
          <span>产品访谈 · 原文片段</span>
          <Button
            type="text"
            size="small"
            icon={<X size={16} />}
            aria-label="收起原文"
            onClick={close}
          />
        </div>
        <blockquote>
          “每条结论，都应能回到它的来源。我们需要的不只是一个答案，还需要知道它从哪里来、在什么情境下成立。”
        </blockquote>
      </div>
      <p className={styles.label}>交互演示 · 示例内容，不调用 AI</p>
    </div>
  )
}
