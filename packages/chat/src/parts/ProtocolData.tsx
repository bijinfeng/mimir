import type { ReactNode } from 'react'
import { createStyles } from 'antd-style'

const useStyles = createStyles(({ css, token }) => ({
  root: css`
    min-width: 0;
    margin: 12px 0;
    color: ${token.colorTextSecondary};
    font-size: var(--mimir-chat-font-excerpt, 13px);
    line-height: 1.75;
    summary {
      width: fit-content;
      max-width: 100%;
      padding: 4px 0;
      cursor: pointer;
      overflow-wrap: anywhere;
    }
    summary:focus-visible {
      outline: 2px solid ${token.focusRing ?? token.colorPrimaryBorder};
      outline-offset: 2px;
    }
    pre:focus-visible {
      outline: 2px solid ${token.focusRing ?? token.colorPrimaryBorder};
      outline-offset: -2px;
    }
    pre {
      min-width: 0;
      max-width: 100%;
      max-height: 280px;
      overflow: auto;
      margin: 8px 0 0;
      padding: 12px;
      border-radius: ${token.borderRadius}px;
      background: ${token.colorFillQuaternary};
      color: ${token.colorTextSecondary};
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-family: ${token.fontFamilyCode};
      font-size: var(--mimir-chat-font-meta, 12px);
      line-height: 1.75;
    }
  `,
}))

/** Read-only protocol payloads remain inspectable without becoming answer prose. */
export function ProtocolData({ title, children }: { title?: string; children: ReactNode }) {
  const { styles } = useStyles()
  return title ? (
    <details className={styles.root}>
      <summary>{title}</summary>
      <pre tabIndex={0} aria-label={title ?? '结构化结果'}>
        {children}
      </pre>
    </details>
  ) : (
    <div className={styles.root}>
      <pre tabIndex={0} aria-label={title ?? '结构化结果'}>
        {children}
      </pre>
    </div>
  )
}
