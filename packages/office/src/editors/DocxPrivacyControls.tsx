import { useCallback, useEffect, useId, useState, useSyncExternalStore } from 'react'
import { Switch } from 'antd'
import { ShieldCheck } from 'lucide-react'
import { ToolbarButton, ToolbarMenuNote } from '../shell/EditorShell.js'
import { docxPrivacyIntent } from '../docx-privacy-state.js'
import type { DocxAdvancedContext } from './DocxAdvancedControls.js'
import { applyDocxPrivacy } from './docx-privacy.js'
import './docx-privacy.css'

export function DocxPrivacyControls({ context }: { context: DocxAdvancedContext }) {
  const { editor, session } = context
  const getVersion = (context as DocxAdvancedContext & { compare?: { getVersion: () => number } })
    .compare?.getVersion
  const openingVersion = context.version
  const readVersion = useCallback(
    () => getVersion?.() ?? openingVersion,
    [getVersion, openingVersion],
  )
  const controller = session.protection
  const access = useSyncExternalStore(controller.subscribe, controller.getAccess)
  const doc = useSyncExternalStore(
    (notify) => {
      editor.on('transaction', notify)
      return () => {
        editor.off('transaction', notify)
      }
    },
    () => editor.state.doc,
  )
  const [nativeRecord, setNative] = useState<{
    session: typeof session
    value: Awaited<ReturnType<typeof session.readPrivacyState>>
  } | null>(null)
  const native = nativeRecord?.session === session ? nativeRecord.value : null
  const [target, setTarget] = useState(doc)
  const [targetVersion, setTargetVersion] = useState(readVersion)
  const [draft, setDraft] = useState(false)
  const [message, setMessage] = useState('')
  const [readError, setReadError] = useState<typeof session | null>(null)
  const labelId = useId(),
    helpId = useId()
  useEffect(() => {
    let active = true
    const initial = editor.state.doc,
      initialVersion = readVersion()
    const read = async (initialize = false) => {
      try {
        const state = await session.readPrivacyState()
        if (!active) return
        setNative({ session, value: state })
        setReadError(null)
        if (initialize) {
          setTarget(initial)
          setTargetVersion(initialVersion)
          setDraft(docxPrivacyIntent(initial.toJSON()) ?? state.original)
        }
      } catch (cause) {
        if (active) {
          setReadError(session)
          setMessage(cause instanceof Error ? cause.message : String(cause))
        }
      }
    }
    void read(true)
    const unsubscribe = session.subscribePrivacy(() => {
      void read()
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [editor, session, readVersion])
  const current = native ? (docxPrivacyIntent(doc.toJSON()) ?? native.original) : false
  const stale = target !== doc || targetVersion !== readVersion()
  const reason =
    !access.writable || access.mandatoryTracking
      ? (access.reason ?? '原件编辑限制不允许更改个人信息设置')
      : null
  const reload = () => {
    setTarget(doc)
    setTargetVersion(readVersion())
    setDraft(current)
    setMessage('已读取当前设置')
  }
  const apply = () => {
    if (!native) return
    try {
      if (targetVersion !== readVersion()) throw new Error('文档已变化，请重新读取设置')
      setTarget(applyDocxPrivacy(editor, session, target, draft, native.original))
      setTargetVersion(readVersion())
      setMessage('设置已应用，保存到库后生效。')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause))
    }
  }
  return (
    <div className="mimir-docx-privacy">
      <div className="mimir-docx-privacy__body">
        <div className="mimir-docx-privacy__setting">
          <div>
            <span id={labelId} className="mimir-docx-privacy__label">
              保存时清理个人信息
            </span>
            <p id={helpId}>清理作者、修订与批注署名、公司等已知文件元数据。</p>
          </div>
          <Switch
            checked={stale ? current : draft}
            onChange={setDraft}
            disabled={!native || !!reason || stale}
            aria-labelledby={labelId}
            aria-describedby={helpId}
          />
        </div>
        <dl className="mimir-docx-privacy__values">
          <dt>当前设置</dt>
          <dd>
            {native ? (current ? '开启' : '关闭') : readError === session ? '读取失败' : '读取中…'}
          </dd>
          <dt>已保存设置</dt>
          <dd>
            {native
              ? native.persisted
                ? '开启'
                : '关闭'
              : readError === session
                ? '读取失败'
                : '读取中…'}
          </dd>
        </dl>
        <ToolbarMenuNote>
          保存到库或导出当前副本时生效。不会清理正文、自定义
          XML、自定义属性或二进制附件中的个人信息。
        </ToolbarMenuNote>
        <ToolbarMenuNote>
          关闭开关不会恢复已成功保存清理的姓名。撤销与重做仅恢复设置意图。
        </ToolbarMenuNote>
        {native?.cleaned && (
          <ToolbarMenuNote>本次会话已保存清理结果，后续保存会保留这些清理。</ToolbarMenuNote>
        )}
        {reason && <ToolbarMenuNote>{reason}</ToolbarMenuNote>}
        {stale && (
          <div className="mimir-docx-privacy__stale">
            <ToolbarMenuNote>文档已变化，请重新读取设置后再操作。</ToolbarMenuNote>
            <ToolbarButton label="重新读取设置" onClick={reload} />
          </div>
        )}
        <p className="mimir-docx-privacy__feedback" role="status">
          {message}
        </p>
      </div>
      <div className="mimir-docx-privacy__actions">
        <ToolbarButton
          label="应用设置"
          primary
          disabled={!native || !!reason || stale || draft === current}
          disabledReason={reason ?? (stale ? '请先重新读取设置' : undefined)}
          onClick={apply}
        >
          <ShieldCheck />
        </ToolbarButton>
      </div>
    </div>
  )
}
