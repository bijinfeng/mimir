import { useEffect, useState } from 'react'
import { ToolbarButton, ToolbarNote, ToolbarTextArea } from '../shell/EditorShell.js'
import type { HtmlAgentResult } from '../agent/html-agent.js'

/** Same declaration grammar as fixed GenOffice StylePanel. */
export function parseHtmlDeclarations(css: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of css.split(';')) {
    const index = part.indexOf(':')
    if (index < 0) continue
    const property = part.slice(0, index).trim().toLowerCase()
    const value = part.slice(index + 1).trim()
    if (/^-?[a-z][a-z0-9-]*$/.test(property) && value) out[property] = value
  }
  return out
}

export function HtmlCssControls({
  sid,
  onPreview,
  onApply,
}: {
  sid: number
  onPreview: (sid: number, styles: Record<string, string> | null) => void
  onApply: (styles: Record<string, string>) => HtmlAgentResult
}) {
  const [css, setCss] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => {
      const styles = parseHtmlDeclarations(css)
      onPreview(sid, Object.keys(styles).length ? styles : null)
    }, 250)
    return () => clearTimeout(timer)
  }, [css, sid, onPreview])
  useEffect(() => () => onPreview(sid, null), [sid, onPreview])
  return (
    <div className="mimir-html-css-controls">
      <ToolbarTextArea
        label="自定义 CSS 声明"
        value={css}
        onChange={setCss}
        placeholder="例如 color: red; padding: 8px"
        rows={6}
      />
      <ToolbarNote>输入后临时预览；应用才会修改源码，取消、切换分类或关闭面板可恢复。</ToolbarNote>
      <div className="mimir-html-css-controls__actions">
        <ToolbarButton
          primary
          label="应用自定义 CSS"
          onClick={() => {
            const declarations = parseHtmlDeclarations(css)
            if (!Object.keys(declarations).length) return setMessage('没有有效的 CSS 声明。')
            onPreview(sid, null)
            const result = onApply(declarations)
            setMessage(result.ok ? '已应用 CSS。' : (result.error ?? '未能应用 CSS。'))
            if (result.ok) setCss('')
          }}
        />
        <ToolbarButton
          label="取消 CSS 预览"
          onClick={() => {
            setCss('')
            setMessage(null)
            onPreview(sid, null)
          }}
        >
          取消预览
        </ToolbarButton>
      </div>
      {message && (
        <div role="status">
          <ToolbarNote>{message}</ToolbarNote>
        </div>
      )}
    </div>
  )
}
