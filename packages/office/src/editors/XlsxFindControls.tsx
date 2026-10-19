import { useLayoutEffect, useRef, useState } from 'react'
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

interface FindDraft {
  query: string
  scope: string
  lookIn: string
  regex: boolean
  errors: boolean
}
interface FindContext {
  documentId: string
  sourceKey: unknown
  sheetId: string
  version: number
  inspect: (args: Record<string, unknown>) => Promise<unknown>
  onSelect: (match: XlsxFindMatch) => void
}
export function XlsxFindControls(props: FindContext) {
  // Conditions are a useful draft; results belong only to a mounted menu session.
  const [draft, setDraft] = useState<FindDraft>({
    query: '',
    scope: 'sheet',
    lookIn: 'both',
    regex: false,
    errors: false,
  })
  return (
    <ToolbarMenu
      label="高级查找"
      text="高级查找"
      panelWidth={360}
      renderPanel={() => <FindPanel {...props} draft={draft} onDraftChange={setDraft} />}
    />
  )
}
function FindPanel({
  documentId,
  sourceKey,
  sheetId,
  version,
  inspect,
  onSelect,
  draft,
  onDraftChange,
}: FindContext & { draft: FindDraft; onDraftChange: (next: FindDraft) => void }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [failed, setFailed] = useState(false),
    [matches, setMatches] = useState<XlsxFindMatch[]>([])
  const context = useRef<object | null>(null),
    request = useRef<object | null>(null)
  const [session, setSession] = useState(() => ({ documentId, sourceKey, sheetId, version, draft }))
  if (
    session.documentId !== documentId ||
    session.sourceKey !== sourceKey ||
    session.sheetId !== sheetId ||
    session.version !== version ||
    session.draft !== draft
  ) {
    setSession({ documentId, sourceKey, sheetId, version, draft })
    setBusy(false)
    setMatches([])
    setMessage('')
    setFailed(false)
  }
  useLayoutEffect(() => {
    context.current = session
    request.current = null
    return () => {
      context.current = null
      request.current = null
    }
  }, [session])
  const update = (patch: Partial<FindDraft>) => {
    if (!request.current) onDraftChange({ ...draft, ...patch })
  }
  const search = async () => {
    const identity = context.current
    if (!identity || request.current || (!draft.errors && !draft.query)) return
    const token = {}
    request.current = token
    const current = () => context.current === identity && request.current === token
    setBusy(true)
    setMessage('正在搜索…')
    setFailed(false)
    try {
      const result = (await inspect({
        query: draft.query,
        regex: draft.regex,
        errors_only: draft.errors,
        look_in: draft.lookIn,
        ...(draft.scope === 'sheet' ? { sheetId } : {}),
        max_results: 200,
      })) as { data: { matches: XlsxFindMatch[]; truncated: boolean } }
      if (!current()) return
      setMatches(result.data.matches)
      setMessage(
        result.data.truncated
          ? '已显示前200项，请缩小搜索范围'
          : `找到${result.data.matches.length}项`,
      )
    } catch (error) {
      if (!current()) return
      setMatches([])
      setFailed(true)
      setMessage(error instanceof Error ? error.message : '查找失败')
    } finally {
      if (current()) {
        request.current = null
        setBusy(false)
      }
    }
  }
  return (
    <ToolbarPropertyForm>
      <div className="mimir-xlsx-tools mimir-xlsx-find">
        <fieldset disabled={busy} aria-busy={busy}>
          <ToolbarMenuFields label="查找条件">
            <div className="mimir-xlsx-find__query">
              <ToolbarTextField
                label="搜索文字或正则表达式"
                value={draft.query}
                onChange={(query) => update({ query })}
                onSubmit={() => void search()}
              />
            </div>
            <ToolbarSelect
              label="查找范围"
              disabled={busy}
              disabledReason="正在搜索"
              value={draft.scope}
              onChange={(scope) => update({ scope })}
              options={[
                { value: 'sheet', label: '当前工作表' },
                { value: 'workbook', label: '整个工作簿' },
              ]}
            />
            <ToolbarSelect
              label="查找内容"
              disabled={busy}
              disabledReason="正在搜索"
              value={draft.lookIn}
              onChange={(lookIn) => update({ lookIn })}
              options={[
                { value: 'both', label: '显示值与公式' },
                { value: 'values', label: '显示值' },
                { value: 'formulas', label: '公式' },
              ]}
            />
            <div className="mimir-xlsx-tools__actions">
              <ToolbarButton
                label="使用正则表达式"
                active={draft.regex}
                disabled={busy}
                onClick={() => update({ regex: !draft.regex })}
              >
                正则
              </ToolbarButton>
              <ToolbarButton
                label="只找公式错误"
                active={draft.errors}
                disabled={busy}
                onClick={() => update({ errors: !draft.errors })}
              >
                公式错误
              </ToolbarButton>
            </div>
          </ToolbarMenuFields>
        </fieldset>
        <div className="mimir-xlsx-tools__actions">
          <ToolbarButton
            label="搜索工作簿"
            primary
            disabled={busy || (!draft.errors && !draft.query)}
            disabledReason={busy ? '正在搜索' : '填写搜索内容或选择公式错误'}
            onClick={() => void search()}
          />
        </div>
        <div role={failed ? 'alert' : 'status'} className="mimir-xlsx-tools__feedback">
          {message}
        </div>
        {matches.length > 0 && (
          <ToolbarMenuFields label="匹配结果">
            <ul className="mimir-xlsx-find__results" aria-label="匹配结果">
              {matches.map((match) => (
                <li key={`${match.sheetId}:${match.address}`}>
                  <ToolbarButton
                    label={`转到${match.sheetName}!${match.address}`}
                    disabled={busy}
                    disabledReason="正在搜索"
                    onClick={() => {
                      if (context.current && !request.current) onSelect(match)
                    }}
                  >
                    <span className="mimir-xlsx-find__result">
                      <span className="mimir-xlsx-find__address">
                        {match.sheetName}!{match.address}
                      </span>
                      <span className="mimir-xlsx-find__value" title={match.text}>
                        {match.text || '（空值）'}
                      </span>
                    </span>
                  </ToolbarButton>
                </li>
              ))}
            </ul>
          </ToolbarMenuFields>
        )}
        <ToolbarMenuNote>公式结果按当前缓存搜索，未重新计算的结果可能过期。</ToolbarMenuNote>
      </div>
    </ToolbarPropertyForm>
  )
}
