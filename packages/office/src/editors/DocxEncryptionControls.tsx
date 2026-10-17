import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { Input, type InputRef } from 'antd'
import { LockKeyhole } from 'lucide-react'
import { ToolbarButton, ToolbarMenuNote, ToolbarSelect } from '../shell/EditorShell.js'
import {
  readDocxEncryptionState,
  subscribeDocxEncryption,
  docxEncryptionRevision,
} from '../docx-encrypted-session.js'
import { applyDocxEncryption } from './docx-encryption.js'
import type { DocxAdvancedContext } from './DocxAdvancedControls.js'
import type { DocxOpening } from './use-docx-opening.js'
import './docx-encryption.css'

export function DocxOpeningControls({ opening }: { opening: DocxOpening }) {
  const state = useSyncExternalStore(opening.subscribe, opening.getSnapshot)
  const [password, setPassword] = useState('')
  const passwordId = useId()
  const formRef = useRef<HTMLFormElement>(null),
    inputRef = useRef<InputRef>(null),
    wasBusy = useRef(false)
  useEffect(() => {
    if (
      wasBusy.current &&
      !state.busy &&
      (document.activeElement === document.body ||
        (document.activeElement && formRef.current?.contains(document.activeElement)))
    )
      inputRef.current?.focus()
    wasBusy.current = state.busy
  }, [state.busy])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!password || state.busy) return
    const value = password
    setPassword('')
    void opening.open(value)
  }
  return (
    <form
      className="mimir-docx-opening"
      ref={formRef}
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          setPassword('')
          opening.cancel()
        }
      }}
    >
      <LockKeyhole aria-hidden="true" size={24} />
      <h2>打开加密文档</h2>
      <p>输入文件的打开密码。密码与解密仅在当前设备处理。</p>
      <label htmlFor={passwordId}>打开密码</label>
      <Input.Password
        id={passwordId}
        ref={inputRef}
        aria-label="打开密码"
        autoFocus
        autoComplete="off"
        value={password}
        disabled={state.busy}
        maxLength={1024}
        onChange={(event) => setPassword(event.target.value)}
      />
      <p role="status" className="mimir-docx-encryption__feedback">
        {state.feedback}
      </p>
      <div className="mimir-docx-opening__actions">
        <ToolbarButton
          label="取消本地打开"
          onClick={() => {
            setPassword('')
            opening.cancel()
          }}
        >
          取消
        </ToolbarButton>
        <ToolbarButton
          label={state.busy ? '正在本地解密…' : '打开文档'}
          primary
          disabled={state.busy || !password}
          onClick={() => {
            if (password && !state.busy) {
              const value = password
              setPassword('')
              void opening.open(value)
            }
          }}
        >
          <LockKeyhole />
        </ToolbarButton>
      </div>
    </form>
  )
}
export function DocxEncryptionControls({ context }: { context: DocxAdvancedContext }) {
  const { editor, session } = context
  const doc = useSyncExternalStore(
    (notify) => {
      editor.on('transaction', notify)
      return () => {
        editor.off('transaction', notify)
      }
    },
    () => editor.state.doc,
  )
  useSyncExternalStore(
    (notify) => subscribeDocxEncryption(session, notify),
    () => docxEncryptionRevision(session),
  )
  const readVersion = (context as DocxAdvancedContext & { compare?: { getVersion: () => number } })
    .compare?.getVersion
  const version = readVersion?.() ?? context.version
  const access = useSyncExternalStore(session.protection.subscribe, session.protection.getAccess)
  return <EncryptionForm key={`${version}:${access.epoch}`} context={context} target={doc} />
}
function EncryptionForm({
  context,
  target,
}: {
  context: DocxAdvancedContext
  target: DocxAdvancedContext['editor']['state']['doc']
}) {
  const { editor, session } = context
  const access = useSyncExternalStore(session.protection.subscribe, session.protection.getAccess)
  const state = readDocxEncryptionState(session, target.toJSON())
  const [mode, setMode] = useState<'change' | 'remove'>('change')
  const [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const reason =
    !access.writable || access.mandatoryTracking
      ? (access.reason ?? '原件编辑限制不允许更改打开密码')
      : null
  const remove = state.encrypted && mode === 'remove'
  const apply = () => {
    if (reason) return
    if (!remove && (!password || password !== confirm)) {
      setMessage('两次输入的打开密码不一致')
      return
    }
    try {
      applyDocxEncryption(editor, session, target, remove ? null : password)
      setPassword('')
      setConfirm('')
      setMessage('已应用，保存到库后生效。')
    } catch (cause) {
      setPassword('')
      setConfirm('')
      setMessage(cause instanceof Error ? cause.message : '设置未应用')
    }
  }
  return (
    <div
      className="mimir-docx-encryption"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setPassword('')
          setConfirm('')
        }
      }}
    >
      <div className="mimir-docx-encryption__body">
        <dl className="mimir-docx-encryption__values">
          <dt>当前设置</dt>
          <dd>{state.encrypted ? '需要打开密码' : '无需打开密码'}</dd>
          <dt>已保存文件</dt>
          <dd>{state.persisted ? '已加密' : '未加密'}</dd>
        </dl>
        {state.encrypted && (
          <ToolbarSelect
            label="打开密码操作"
            value={mode}
            disabled={!!reason}
            options={[
              { value: 'change', label: '更改打开密码' },
              { value: 'remove', label: '移除打开密码' },
            ]}
            onChange={(value) => {
              setMode(value as 'change' | 'remove')
              setPassword('')
              setConfirm('')
              setMessage('')
            }}
          />
        )}
        {remove ? (
          <ToolbarMenuNote>应用并保存后，打开此文件将不再需要密码。</ToolbarMenuNote>
        ) : (
          <div className="mimir-docx-encryption__fields">
            <label>
              新的打开密码
              <Input.Password
                aria-label="新的打开密码"
                autoComplete="new-password"
                disabled={!!reason}
                maxLength={1024}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>
              再次输入打开密码
              <Input.Password
                aria-label="再次输入打开密码"
                autoComplete="new-password"
                disabled={!!reason}
                maxLength={1024}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </label>
          </div>
        )}
        <ToolbarMenuNote>
          仅在本地处理。打开密码用于文件加密，与“文档保护”中的修改密码、编辑限制密码分别设置。
        </ToolbarMenuNote>
        <ToolbarMenuNote>
          保存到库或导出当前副本时生效。加密文件保存在库中时不索引正文；请妥善保管密码，遗失后无法恢复。
        </ToolbarMenuNote>
        {reason && <ToolbarMenuNote>{reason}</ToolbarMenuNote>}
        <p role="status" className="mimir-docx-encryption__feedback">
          {message || (confirm && password !== confirm ? '两次输入的打开密码不一致' : '')}
        </p>
      </div>
      <div className="mimir-docx-encryption__actions">
        <ToolbarButton
          label={remove ? '应用移除密码' : '应用打开密码'}
          primary
          disabled={!!reason || (!remove && (!password || password !== confirm))}
          disabledReason={reason ?? undefined}
          onClick={apply}
        >
          <LockKeyhole />
        </ToolbarButton>
      </div>
    </div>
  )
}
