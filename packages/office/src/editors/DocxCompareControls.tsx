import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { FileSearch, FolderOpen } from 'lucide-react'
import { ToolbarButton } from '../shell/EditorShell.js'
import type { DocxAdvancedContext } from './DocxAdvancedControls.js'
import {
  compareDocxBodies,
  extractCompareBody,
  readCompareDocx,
  type CompareResult,
} from './docx-compare.js'
import { DocxComparePanel } from './DocxComparePanel.js'
import './docx-compare-split.css'
function invalidateRequest(request: { current: number }) {
  request.current++
}
export function DocxCompareControls({
  context,
  getVersion,
}: {
  context: DocxAdvancedContext
  getVersion: () => number
}) {
  const subscribe = useCallback(
    (notify: () => void) => {
      context.editor.on('transaction', notify)
      return () => {
        context.editor.off('transaction', notify)
      }
    },
    [context.editor],
  )
  const liveVersion = useSyncExternalStore(subscribe, getVersion)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const [version, setVersion] = useState(() => getVersion())
  const [result, setResult] = useState<CompareResult | null>(null)
  const request = useRef(0),
    input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const invalidate = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (!transaction.docChanged) return
      invalidateRequest(request)
      setBusy(false)
      setResult(null)
      setStale(true)
      setVersion(getVersion())
    }
    context.editor.on('transaction', invalidate)
    return () => {
      invalidateRequest(request)
      context.editor.off('transaction', invalidate)
    }
  }, [context.editor, getVersion])
  const compare = async () => {
    if (!file || busy) return
    const token = ++request.current,
      frozenVersion = getVersion()
    setBusy(true)
    setError('')
    setResult(null)
    setStale(false)
    setVersion(frozenVersion)
    try {
      const current = extractCompareBody(context.editor.getJSON())
      const other = await readCompareDocx(
        file,
        () =>
          token === request.current &&
          !context.editor.isDestroyed &&
          frozenVersion === getVersion(),
      )
      if (token !== request.current || context.editor.isDestroyed || frozenVersion !== getVersion())
        return
      const compared = compareDocxBodies(current, other)
      setResult(compared)
    } catch (cause) {
      if (token === request.current)
        setError(cause instanceof Error ? cause.message : '文件无法读取，请重新选择 DOCX')
    } finally {
      if (token === request.current) setBusy(false)
    }
  }
  return (
    <div className="mimir-docx-compare" aria-busy={busy}>
      <div className="mimir-docx-compare__body">
        <p className="mimir-docx-compare__note">
          比较当前未保存正文与本地 DOCX 的段落、表格文字。文件仅在浏览器内读取。
        </p>
        <input
          ref={input}
          hidden
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          aria-label="选择对比 DOCX"
          onChange={(event) => {
            invalidateRequest(request)
            setBusy(false)
            setFile(event.target.files?.[0] ?? null)
            setResult(null)
            setStale(false)
            setError('')
            event.target.value = ''
          }}
        />
        <ToolbarButton label="选择对比文档" onClick={() => input.current?.click()}>
          <FolderOpen size={14} />
          选择 DOCX
        </ToolbarButton>
        <dl className="mimir-docx-compare__source">
          <dt>当前文档</dt>
          <dd>画布版本 {liveVersion}</dd>
          <dt>对比文件</dt>
          <dd>{file?.name ?? '尚未选择'}</dd>
        </dl>
        <p className="mimir-docx-compare__note">
          不比较格式、页眉页脚、批注及修订语义。结果为只读清单。
        </p>
        {(stale || version !== liveVersion) && (
          <p role="status">文档已修改，原结果已失效。请重新比较。</p>
        )}
        {error && <p role="alert">{error}</p>}
        {result && version === liveVersion && (
          <DocxComparePanel key={`${version}:${file?.name}`} result={result} />
        )}
      </div>
      <div className="mimir-docx-compare__actions">
        <ToolbarButton
          label={busy ? '正在比较文档' : '比较文档'}
          primary
          disabled={!file || busy}
          disabledReason={busy ? '正在读取文件' : '请先选择本地 DOCX'}
          onClick={() => void compare()}
        >
          <FileSearch size={14} />
        </ToolbarButton>
      </div>
    </div>
  )
}
