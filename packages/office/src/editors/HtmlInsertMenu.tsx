import { useState } from 'react'
import type { HtmlAgentResult } from '../agent/html-agent.js'
import type { InsertKind } from '../../vendor/apps/html/src/renderer/document/insert-presets.js'
import {
  ToolbarButton,
  ToolbarMenu,
  ToolbarNote,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTextField,
} from '../shell/EditorShell.js'

const kinds: Array<{ value: InsertKind; label: string }> = [
  { value: 'heading', label: '标题' },
  { value: 'paragraph', label: '段落' },
  { value: 'list', label: '列表' },
  { value: 'button', label: '按钮' },
  { value: 'image', label: '图片 URL' },
  { value: 'table', label: '表格' },
  { value: 'section', label: '章节' },
  { value: 'divider', label: '分隔线' },
]

export function HtmlInsertMenu({
  onInsert,
}: {
  onInsert: (
    kind: InsertKind,
    options: { url?: string; rows?: number; cols?: number },
  ) => HtmlAgentResult
}) {
  const [kind, setKind] = useState<InsertKind>('heading')
  const [url, setUrl] = useState('')
  const [rows, setRows] = useState('3')
  const [cols, setCols] = useState('3')
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const insert = () => {
    if (kind === 'image' && !/^https?:\/\//i.test(url)) {
      setMessage({ text: '请输入以 http:// 或 https:// 开始的图片 URL。', error: true })
      return
    }
    const r = Number(rows)
    const c = Number(cols)
    if (
      kind === 'table' &&
      (!Number.isInteger(r) || r < 1 || r > 8 || !Number.isInteger(c) || c < 1 || c > 10)
    ) {
      setMessage({ text: '表格行数需为 1–8，列数需为 1–10。', error: true })
      return
    }
    const result = onInsert(kind, {
      ...(kind === 'image' ? { url } : {}),
      ...(kind === 'table' ? { rows: r, cols: c } : {}),
    })
    setMessage({
      text: result.ok ? (result.summary ?? '已插入。') : (result.error ?? '插入失败。'),
      error: !result.ok,
    })
  }
  return (
    <ToolbarMenu
      label="插入 HTML 元素"
      text="插入"
      panelWidth={280}
      renderPanel={() => (
        <div className="mimir-html-op-panel">
          <ToolbarPropertyForm columns={1}>
            <ToolbarSelect
              label="插入元素"
              value={kind}
              options={kinds}
              onChange={(next) => {
                setKind(next)
                setMessage(null)
              }}
            />
            {kind === 'image' && (
              <ToolbarTextField
                label="图片 URL"
                value={url}
                onChange={setUrl}
                placeholder="https://…"
              />
            )}
            {kind === 'table' && (
              <div className="mimir-html-op-row">
                <ToolbarTextField label="表格行数" value={rows} onChange={setRows} />
                <ToolbarTextField label="表格列数" value={cols} onChange={setCols} />
              </div>
            )}
          </ToolbarPropertyForm>
          <ToolbarButton label="插入所选 HTML 元素" primary onClick={insert} />
          {message && (
            <div role={message.error ? 'alert' : 'status'}>
              <ToolbarNote>{message.text}</ToolbarNote>
            </div>
          )}
        </div>
      )}
    />
  )
}
