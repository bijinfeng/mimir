import { TextPart } from '@tanstack/ai-react/ui'
import type { MarkdownComponents } from '@tanstack/markdown/react'
import type { ComponentProps } from 'react'
import { createStyles } from 'antd-style'
import { CodeBlock } from './CodeBlock.js'

const COMPONENTS: MarkdownComponents = { pre: CodeBlock, table: MarkdownTable }
const useStyles = createStyles(({ css, token }) => ({
  text: css`
    min-width: 0;
    overflow-wrap: anywhere;
    & + & {
      margin-top: 14px;
    }
    p {
      margin: 12px 0;
    }
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      margin: 28px 0 12px;
      font-weight: 600;
      line-height: 1.55;
      color: ${token.colorText};
      text-wrap: pretty;
    }
    h1 {
      font-size: var(--mimir-chat-font-page-title, 19px);
    }
    h2 {
      font-size: var(--mimir-chat-font-section, 16px);
    }
    h3,
    h4,
    h5,
    h6 {
      font-size: var(--mimir-chat-font-reading, 15px);
    }
    ul,
    ol {
      margin: 12px 0;
      padding-inline-start: 24px;
    }
    li {
      margin: 5px 0;
      padding-inline-start: 3px;
    }
    li > p {
      margin: 6px 0;
    }
    li > ul,
    li > ol {
      margin: 6px 0;
    }
    li::marker {
      color: ${token.colorTextSecondary};
    }
    blockquote {
      margin: 16px 0;
      padding: 4px 16px;
      border-inline-start: 1px solid ${token.colorBorder};
      color: ${token.colorTextSecondary};
      > :first-child {
        margin-top: 0;
      }
      > :last-child {
        margin-bottom: 0;
      }
    }
    code {
      font-family: ${token.fontFamilyCode};
      font-size: var(--mimir-chat-font-excerpt, 13px);
      background: ${token.colorFillQuaternary};
      color: ${token.inlineCodeFg};
      padding: 2px 5px;
      border-radius: ${token.borderRadiusSM}px;
      box-decoration-break: clone;
    }
    pre {
      max-width: 100%;
      margin: 16px 0;
      padding: 14px 16px;
      overflow: auto;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: ${token.borderRadius}px;
      background: ${token.colorFillQuaternary};
      font-family: ${token.fontFamilyCode};
      font-size: var(--mimir-chat-font-excerpt, 13px);
      line-height: 1.75;
      tab-size: 2;
      code {
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: ${token.colorText};
      }
    }
    a {
      color: ${token.colorLink};
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    a:hover {
      color: ${token.colorLinkHover};
    }
    a:focus-visible {
      outline: 2px solid ${token.focusRing ?? token.colorPrimaryBorder};
      outline-offset: 2px;
      border-radius: 2px;
    }
    strong {
      font-weight: 600;
    }
    hr {
      margin: 24px 0;
      border: 0;
      border-top: 1px solid ${token.colorBorderSecondary};
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: ${token.borderRadius}px;
    }
    > :first-child {
      margin-top: 0;
    }
    > :last-child {
      margin-bottom: 0;
    }
    ::selection {
      background: ${token.colorPrimaryBg};
      color: ${token.colorText};
    }
  `,
  table: css`
    max-width: 100%;
    margin: 16px 0;
    overflow-x: auto;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadius}px;
    &:focus-visible {
      outline: 2px solid ${token.focusRing ?? token.colorPrimaryBorder};
      outline-offset: 2px;
    }
    table {
      width: 100%;
      min-width: 460px;
      border-collapse: collapse;
      text-align: left;
      font-size: var(--mimir-chat-font-item, 13.5px);
      line-height: 1.7;
    }
    th,
    td {
      padding: 10px 14px;
      border-bottom: 1px solid ${token.colorBorderSecondary};
      vertical-align: top;
    }
    th {
      background: ${token.colorFillQuaternary};
      font-weight: 600;
    }
    tbody tr:last-child td {
      border-bottom: 0;
    }
    th:not(:last-child),
    td:not(:last-child) {
      border-inline-end: 1px solid ${token.colorBorderSecondary};
    }
  `,
}))

function MarkdownTable(props: ComponentProps<'table'>) {
  const { styles } = useStyles()
  return (
    <div className={styles.table} role="region" aria-label="回答表格，可横向滚动" tabIndex={0}>
      <table {...props} />
    </div>
  )
}
export function MarkdownPart({ text }: { text: string }) {
  const { styles } = useStyles()
  return <TextPart content={text} components={COMPONENTS} className={styles.text} />
}
