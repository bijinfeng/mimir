import { useState } from 'react'
import {
  ToolbarButton,
  ToolbarMenu,
  ToolbarMenuFields,
  ToolbarPropertyForm,
  ToolbarTextField,
  ToolbarSelect,
  ToolbarMenuNote,
} from '../shell/EditorShell.js'
import type { XlsxFindMatch } from '../xlsx-find.js'
export function XlsxFindControls({
  sheetId,
  inspect,
  onSelect,
}: {
  sheetId: string
  inspect: (args: Record<string, unknown>) => Promise<unknown>
  onSelect: (match: XlsxFindMatch) => void
}) {
  const [query, setQuery] = useState(''),
    [scope, setScope] = useState('sheet'),
    [lookIn, setLookIn] = useState('both'),
    [regex, setRegex] = useState(false),
    [errors, setErrors] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [matches, setMatches] = useState<XlsxFindMatch[]>([])
  const search = async () => {
    setBusy(true)
    setMessage('')
    try {
      const r = (await inspect({
        query,
        regex,
        errors_only: errors,
        look_in: lookIn,
        ...(scope === 'sheet' ? { sheetId } : {}),
        max_results: 200,
      })) as { data: { matches: XlsxFindMatch[]; truncated: boolean } }
      setMatches(r.data.matches)
      setMessage(
        r.data.truncated ? '已显示前200项，请缩小搜索范围' : `找到${r.data.matches.length}项`,
      )
    } catch (e) {
      setMatches([])
      setMessage(e instanceof Error ? e.message : '查找失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <ToolbarMenu
      label="高级查找"
      text="高级查找"
      panelWidth={360}
      renderPanel={() => (
        <ToolbarPropertyForm columns={1}>
          <div className="mimir-xlsx-tools">
            <ToolbarMenuFields label="查找条件">
              <ToolbarTextField
                label="搜索文字或正则表达式"
                value={query}
                onChange={setQuery}
                onSubmit={() => void search()}
              />
              <ToolbarSelect
                label="查找范围"
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'sheet', label: '当前工作表' },
                  { value: 'workbook', label: '整个工作簿' },
                ]}
              />
              <ToolbarSelect
                label="查找内容"
                value={lookIn}
                onChange={setLookIn}
                options={[
                  { value: 'both', label: '显示值与公式' },
                  { value: 'values', label: '显示值' },
                  { value: 'formulas', label: '公式' },
                ]}
              />
              <div className="mimir-xlsx-tools__actions">
                <ToolbarButton
                  label="使用正则表达式"
                  active={regex}
                  onClick={() => setRegex(!regex)}
                >
                  正则
                </ToolbarButton>
                <ToolbarButton
                  label="只找公式错误"
                  active={errors}
                  onClick={() => setErrors(!errors)}
                >
                  公式错误
                </ToolbarButton>
              </div>
              <ToolbarButton
                label="搜索工作簿"
                primary
                disabled={busy || (!errors && !query)}
                disabledReason={busy ? '正在搜索' : '填写搜索内容或选择公式错误'}
                onClick={() => void search()}
              />
            </ToolbarMenuFields>
            <ToolbarMenuNote>公式结果按当前缓存搜索，未重新计算的结果可能过期。</ToolbarMenuNote>
            <div role="status" className="mimir-xlsx-tools__feedback">
              {message}
            </div>
            {matches.length > 0 && (
              <ToolbarMenuFields label="匹配结果">
                {matches.map((m) => (
                  <ToolbarButton
                    key={`${m.sheetId}:${m.address}`}
                    label={`转到${m.sheetName}!${m.address}`}
                    onClick={() => onSelect(m)}
                  >
                    {m.sheetName}!{m.address} · {m.text.slice(0, 50)}
                  </ToolbarButton>
                ))}
              </ToolbarMenuFields>
            )}
          </div>
        </ToolbarPropertyForm>
      )}
    />
  )
}
