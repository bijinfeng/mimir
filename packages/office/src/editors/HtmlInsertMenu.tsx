import { useState } from 'react'
import type { HtmlAgentResult } from '../agent/html-agent.js'
import type { InsertKind } from '../../vendor/apps/html/src/renderer/document/insert-presets.js'
import {
  ToolbarButton,
  ToolbarMenu,
  ToolbarNote,
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
  const [message, setMessage] = useState<string | null>(null)
  const insert = () => {
    if (kind === 'image' && !/^https?:\/\//i.test(url)) {
      setMessage('请输入以 http:// 或 https:// 开始的图片 URL。')
      return
    }
    const r = Number(rows)
    const c = Number(cols)
    if (
      kind === 'table' &&
      (!Number.isInteger(r) || r < 1 || r > 8 || !Number.isInteger(c) || c < 1 || c > 10)
    ) {
      setMessage('表格行数需为 1–8，列数需为 1–10。')
      return
    }
    const result = onInsert(kind, {
      ...(kind === 'image' ? { url } : {}),
      ...(kind === 'table' ? { rows: r, cols: c } : {}),
    })
    setMessage(result.ok ? (result.summary ?? '已插入。') : (result.error ?? '插入失败。'))
  }
  return (
    <ToolbarMenu
      label="插入 HTML 元素"
      text="插入"
      panelWidth={360}
      renderPanel={() => (
        <div className="mimir-html-op-panel">
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
            <>
              <ToolbarTextField label="表格行数" value={rows} onChange={setRows} />
              <ToolbarTextField label="表格列数" value={cols} onChange={setCols} />
            </>
          )}
          <ToolbarButton label="插入所选 HTML 元素" onClick={insert}>
            插入
          </ToolbarButton>
          {message && <ToolbarNote>{message}</ToolbarNote>}
        </div>
      )}
    />
  )
}
