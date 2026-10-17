import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Input } from 'antd'
import { closeHistory } from '@tiptap/pm/history'
import { DOCX_PASSWORD_MAX_LENGTH } from '../docx-protection-password-crypto.js'
import type { DocxPasswordIntent, DocxRestrictionMode } from '../docx-protection-settings.js'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarSelect,
  ToolbarPropertyForm,
} from '../shell/EditorShell.js'
import type { DocxAdvancedContext } from './DocxAdvancedControls.js'
const MODES = [
  { value: 'readOnly', label: '只读' },
  { value: 'comments', label: '仅批注' },
  { value: 'forms', label: '仅填写表单' },
  { value: 'trackedChanges', label: '强制修订' },
] as const
const INTENTS = [
  { value: 'preserve', label: '保留当前密码' },
  { value: 'replace', label: '设置新密码' },
  { value: 'clear', label: '清除密码' },
] as const
/** Draft values stay within this mounted panel; history contains only a controller-owned opaque ID. */
export function DocxProtectionSettingsControls({
  context,
  onBack,
}: {
  context: DocxAdvancedContext
  onBack: () => void
}) {
  const controller = context.session.protection,
    native = controller.native
  const [enabled, setEnabled] = useState(native.enforced)
  const [mode, setMode] = useState<DocxRestrictionMode>(
    MODES.find((m) => m.value === native.mode)?.value ?? 'readOnly',
  )
  const [recommended, setRecommended] = useState(native.recommended)
  const [restriction, setRestriction] = useState<DocxPasswordIntent['action']>('preserve')
  const [modification, setModification] = useState<DocxPasswordIntent['action']>('preserve')
  const [restrictionPassword, setRestrictionPassword] = useState(''),
    [restrictionConfirm, setRestrictionConfirm] = useState('')
  const [modificationPassword, setModificationPassword] = useState(''),
    [modificationConfirm, setModificationConfirm] = useState('')
  const [current, setCurrent] = useState('')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('')
  const request = useRef<AbortController | null>(null),
    latest = useRef(context),
    id = useId()
  useLayoutEffect(() => {
    latest.current = context
  })
  const clear = () => {
    setRestrictionPassword('')
    setRestrictionConfirm('')
    setModificationPassword('')
    setModificationConfirm('')
    setCurrent('')
  }
  const cancel = () => {
    request.current?.abort()
    request.current = null
    setBusy(false)
    setError('')
    clear()
  }
  useEffect(
    () => () => {
      request.current?.abort()
      request.current = null
    },
    [],
  )
  const mismatch =
    (restriction === 'replace' &&
      (!restrictionPassword || restrictionPassword !== restrictionConfirm)) ||
    (modification === 'replace' &&
      (!modificationPassword || modificationPassword !== modificationConfirm))
  const apply = async () => {
    if (request.current) return
    setError('')
    setMessage('')
    if (mismatch) {
      setError('请输入新密码，并确保两次输入一致。')
      return
    }
    const aborter = new AbortController(),
      doc = context.editor.state.doc,
      options = context.options,
      version = context.version
    request.current = aborter
    setBusy(true)
    try {
      const changed = await controller.applySettings(
        {
          enabled,
          mode,
          recommended,
          restrictionPassword:
            restriction === 'replace'
              ? { action: restriction, password: restrictionPassword }
              : { action: restriction },
          modificationPassword:
            modification === 'replace'
              ? { action: modification, password: modificationPassword }
              : { action: modification },
          currentRestrictionPassword: current,
        },
        doc.toJSON(),
        options,
        (token) => {
          if (
            aborter.signal.aborted ||
            context.editor.isDestroyed ||
            context.editor.state.doc !== doc ||
            latest.current.version !== version ||
            latest.current.options !== options
          )
            return false
          const transaction = closeHistory(context.editor.state.tr).setDocAttribute(
            'mimirProtectionState',
            token,
          )
          context.editor.view.dispatch(transaction)
          if (context.editor.state.doc.attrs.mimirProtectionState !== token) return false
          context.editor.view.dispatch(
            closeHistory(context.editor.state.tr).setMeta('addToHistory', false),
          )
          return true
        },
        aborter.signal,
      )
      if (!aborter.signal.aborted) {
        clear()
        setRestriction('preserve')
        setModification('preserve')
        const reason = controller.getAccess().reason
        setMessage(
          changed
            ? `保护设置已应用。${reason?.startsWith('新编辑限制') ? reason : ''}`
            : '保护设置没有变化。',
        )
      }
    } catch (cause) {
      if (!aborter.signal.aborted)
        setError(cause instanceof Error ? cause.message : '保护设置未应用，请重试')
    } finally {
      if (request.current === aborter) {
        request.current = null
        setBusy(false)
      }
    }
  }
  const password = (label: string, value: string, set: (value: string) => void, suffix: string) => (
    <div className="mimir-docx-protection__password">
      <label htmlFor={`${id}-${suffix}`}>{label}</label>
      <Input.Password
        id={`${id}-${suffix}`}
        value={value}
        autoComplete="off"
        maxLength={DOCX_PASSWORD_MAX_LENGTH}
        disabled={busy}
        onChange={(e) => {
          set(e.target.value)
          setError('')
          setMessage('')
        }}
        onPressEnter={(e) => {
          e.preventDefault()
          void apply()
        }}
      />
    </div>
  )
  return (
    <div
      className="mimir-docx-protection"
      onKeyDown={(e) => {
        if (e.key === 'Escape') cancel()
      }}
    >
      <div className="mimir-docx-protection__body">
        <ToolbarButton
          label="返回保护状态"
          disabled={busy}
          onClick={() => {
            cancel()
            onBack()
          }}
        >
          返回保护状态
        </ToolbarButton>
        <ToolbarPropertyForm columns={1}>
          <ToolbarMenuFields label="编辑限制">
            <ToolbarSelect
              label="启用编辑限制"
              value={enabled ? 'on' : 'off'}
              options={[
                { value: 'off', label: '不限制编辑' },
                { value: 'on', label: '启用编辑限制' },
              ]}
              disabled={busy}
              onChange={(v) => {
                setEnabled(v === 'on')
                setMessage('')
              }}
            />
            {enabled && (
              <>
                <ToolbarSelect
                  label="限制模式"
                  value={mode}
                  options={MODES}
                  disabled={busy}
                  onChange={setMode}
                />
                <ToolbarSelect
                  label="编辑限制密码操作"
                  value={restriction}
                  options={INTENTS}
                  disabled={busy}
                  onChange={(v) => {
                    setRestriction(v)
                    setRestrictionPassword('')
                    setRestrictionConfirm('')
                    setError('')
                  }}
                />
                {restriction === 'replace' && (
                  <>
                    {password(
                      '新的编辑限制密码',
                      restrictionPassword,
                      setRestrictionPassword,
                      'restriction',
                    )}
                    {password(
                      '确认编辑限制密码',
                      restrictionConfirm,
                      setRestrictionConfirm,
                      'restriction-confirm',
                    )}
                  </>
                )}
                {restriction === 'clear' && (
                  <ToolbarMenuNote>应用后此编辑限制不再需要密码即可停止。</ToolbarMenuNote>
                )}
                {mode === 'trackedChanges' && (
                  <ToolbarMenuNote>
                    此模式会强制记录受支持原生段落内的文字修改；复杂内容、结构与格式只读保留。
                  </ToolbarMenuNote>
                )}
              </>
            )}
            {controller.restrictionPasswordRequired() &&
              password('当前编辑限制密码', current, setCurrent, 'current')}
          </ToolbarMenuFields>
          <ToolbarMenuFields label="修改密码">
            <ToolbarSelect
              label="修改密码操作"
              value={modification}
              options={INTENTS}
              disabled={busy}
              onChange={(v) => {
                setModification(v)
                setModificationPassword('')
                setModificationConfirm('')
                setError('')
              }}
            />
            {modification === 'replace' && (
              <>
                {password(
                  '新的修改密码',
                  modificationPassword,
                  setModificationPassword,
                  'modification',
                )}
                {password(
                  '确认修改密码',
                  modificationConfirm,
                  setModificationConfirm,
                  'modification-confirm',
                )}
              </>
            )}
            {modification === 'clear' && (
              <ToolbarMenuNote>应用后原件将移除修改密码。</ToolbarMenuNote>
            )}
          </ToolbarMenuFields>
          <ToolbarMenuFields label="只读建议">
            <ToolbarSelect
              label="打开时建议只读"
              value={recommended ? 'on' : 'off'}
              options={[
                { value: 'off', label: '不建议只读' },
                { value: 'on', label: '建议以只读方式打开' },
              ]}
              disabled={busy}
              onChange={(v) => setRecommended(v === 'on')}
            />
            <ToolbarMenuNote>密码在当前设备本地处理。空白输入不会清除现有密码。</ToolbarMenuNote>
          </ToolbarMenuFields>
        </ToolbarPropertyForm>
        {busy && <p role="status">正在本地处理保护设置，可取消。</p>}
        {error && (
          <p className="mimir-docx-protection__error" role="alert">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {controller.settingsReason() && <p role="status">{controller.settingsReason()}</p>}
      </div>
      <div className="mimir-docx-protection__actions">
        <ToolbarButton
          label={busy ? '正在处理…' : '应用保护设置'}
          primary
          disabled={
            busy ||
            !!controller.settingsReason() ||
            !!mismatch ||
            (controller.restrictionPasswordRequired() && !current)
          }
          disabledReason={
            controller.settingsReason() ??
            (mismatch ? '请输入一致的新密码' : '请输入当前编辑限制密码')
          }
          onClick={() => void apply()}
        />
        {busy && (
          <ToolbarButton label="取消保护设置" onClick={cancel}>
            取消
          </ToolbarButton>
        )}
      </div>
    </div>
  )
}
