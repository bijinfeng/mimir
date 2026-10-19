import { TextPart } from '@tanstack/ai-react/ui'
import type { MarkdownComponents } from '@tanstack/markdown/react'
import { createStyles } from 'antd-style'
import { CodeBlock } from './CodeBlock.js'

const COMPONENTS: MarkdownComponents = { pre: CodeBlock }
const useStyles = createStyles(({ css }) => ({
  text: css`
    /* Official TextPart adds a div. Keep the previous Markdown block layout
       and evaluate its edge paragraphs relative to the original parent. */
    display: contents;
    [data-role='assistant'] &:not(:first-child) > p:first-child {
      margin-top: 12px;
    }
    [data-role='assistant'] &:not(:last-child) > p:last-child {
      margin-bottom: 12px;
    }
  `,
}))

export function MarkdownPart({ text }: { text: string }) {
  const { styles } = useStyles()
  return <TextPart content={text} components={COMPONENTS} className={styles.text} />
}
