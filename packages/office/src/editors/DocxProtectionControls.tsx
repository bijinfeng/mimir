import { FORCED_TRACKING_REASON } from '../docx-forced-tracking.js'
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Input, type InputRef } from 'antd'
import { DOCX_PASSWORD_MAX_LENGTH } from '../docx-protection-password-crypto.js'
import { ShieldCheck } from 'lucide-react'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarSelect,
} from '../shell/EditorShell.js'
import type { DocxAdvancedContext } from './DocxAdvancedControls.js'
import { toggleProtectedForm } from './docx-form-controls.js'
import './docx-protection.css'
import { DocxProtectionSettingsControls } from './DocxProtectionSettingsControls.js'
const LABELS: Record<string, string> = {
  readOnly: '只读',
  comments: '仅批注',
  forms: '仅填写表单',
  trackedChanges: '强制修订',
}
export function DocxProtectionControls({ context }: { context: DocxAdvancedContext }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const controller = context.session.protection
  const access = useSyncExternalStore(controller.subscribe, controller.getAccess)
  const native = controller.native
  const passwordId = useId()
  const panelRef = useRef<HTMLDivElement>(null),
    passwordRef = useRef<InputRef>(null),
    returnPasswordFocus = useRef<typeof controller | null>(null),
    mouseFocus = useRef<Element | null>(null)
  const [draft, setDraft] = useState({ controller, value: '' })
  const [feedback, setFeedback] = useState({ controller, value: '' })
  const [verifying, setVerifying] = useState<typeof controller | null>(null)
  const request = useRef<{ controller: typeof controller; aborter: AbortController } | null>(null)
  const password = draft.controller === controller ? draft.value : ''
  const passwordError = feedback.controller === controller ? feedback.value : ''
  const busy = verifying === controller
  useEffect(
    () => () => {
      if (request.current?.controller === controller) {
        request.current.aborter.abort()
        request.current = null
      }
    },
    [controller],
  )
  useLayoutEffect(() => {
    if (returnPasswordFocus.current !== controller || busy) return
    returnPasswordFocus.current = null
    if (
      passwordRef.current?.input?.isConnected &&
      (document.activeElement === document.body ||
        panelRef.current?.contains(document.activeElement))
    )
      passwordRef.current.focus()
  }, [busy, controller])
  const cancel = (restoreFocus = false) => {
    // ToolbarButton blurs form inputs on mousedown. Retain that origin so a
    // BODY focus caused by disabling our input differs from an external input.
    const focused =
      document.activeElement === document.body
        ? (mouseFocus.current ?? document.body)
        : document.activeElement
    returnPasswordFocus.current =
      restoreFocus && (focused === document.body || panelRef.current?.contains(focused))
        ? controller
        : null
    mouseFocus.current = null
    request.current?.aborter.abort()
    request.current = null
    setDraft({ controller, value: '' })
    setFeedback({ controller, value: '' })
    setVerifying(null)
  }
  const verify = async () => {
    if (request.current || !password) return
    mouseFocus.current = null
    const active = new AbortController()
    request.current = { controller, aborter: active }
    setVerifying(controller)
    setFeedback({ controller, value: '' })
    try {
      await controller.verifyModificationPassword(password, active.signal)
      if (!active.signal.aborted) setDraft({ controller, value: '' })
    } catch (cause) {
      if (!active.signal.aborted)
        setFeedback({
          controller,
          value: cause instanceof Error ? cause.message : '密码验证失败，请重试',
        })
    } finally {
      if (request.current?.aborter === active) {
        request.current = null
        setVerifying(null)
      }
    }
  }
  const doc = useSyncExternalStore(
    (notify) => {
      context.editor.on('transaction', notify)
      return () => {
        context.editor.off('transaction', notify)
      }
    },
    () => context.editor.state.doc,
  )
  const controls = controller.readFormControls(doc.toJSON())
  const [selected, setSelected] = useState('')
  const current = controls.find((control) => control.id === selected) ?? controls[0]
  const [message, setMessage] = useState('')
  const toggle = () => {
    if (!current) return
    try {
      toggleProtectedForm(context.editor.view, controller, current.id)
      setMessage('可继续填写，完成后保存到库。')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause))
    }
  }
  if (settingsOpen)
    return (
      <DocxProtectionSettingsControls context={context} onBack={() => setSettingsOpen(false)} />
    )
  return (
    <div
      ref={panelRef}
      className="mimir-docx-protection"
      onMouseDownCapture={() => {
        mouseFocus.current = document.activeElement
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') cancel()
      }}
    >
      <div className="mimir-docx-protection__body">
        <ToolbarMenuFields label="原件保护">
          <dl className="mimir-docx-protection__values">
            <dt>当前状态</dt>
            <dd>
              {access.mandatoryTracking
                ? '强制修订 · 段内文字可编辑'
                : access.writable
                  ? '可以编辑'
                  : access.commentsOnly
                    ? '仅批注 · 正文只读'
                    : access.formsOnly
                      ? '仅填写表单 · 正文只读'
                      : '只读保留'}
            </dd>
            <dt>编辑限制</dt>
            <dd>
              {native.uncertain
                ? '无法可靠读取'
                : native.enforced
                  ? (LABELS[native.mode ?? ''] ?? '未知限制')
                  : '未启用'}
            </dd>
            <dt>修改密码</dt>
            <dd>
              {native.uncertain || native.credentials === 'unsupported'
                ? '凭据无法可靠读取'
                : native.modificationPassword
                  ? access.modificationUnlocked
                    ? '本次会话已验证'
                    : '已设置，等待验证'
                  : '未设置'}
            </dd>
            <dt>只读建议</dt>
            <dd>
              {native.uncertain ? '无法可靠读取' : native.recommended ? '原件建议只读' : '无'}
            </dd>
          </dl>
          {access.reason && <p role="status">{access.reason}</p>}
          <ToolbarButton
            label="更改保护设置"
            disabled={!!controller.settingsReason()}
            disabledReason={controller.settingsReason() ?? undefined}
            onClick={() => setSettingsOpen(true)}
          >
            更改保护设置
          </ToolbarButton>
        </ToolbarMenuFields>
        {access.modificationPasswordRequired && (
          <ToolbarMenuFields label="验证修改密码">
            <label htmlFor={passwordId}>修改密码</label>
            <Input.Password
              ref={passwordRef}
              id={passwordId}
              autoComplete="off"
              value={password}
              maxLength={DOCX_PASSWORD_MAX_LENGTH}
              disabled={busy}
              status={passwordError ? 'error' : undefined}
              aria-invalid={!!passwordError}
              aria-describedby={`${passwordId}-help`}
              onChange={(event) => {
                setDraft({ controller, value: event.target.value })
                setFeedback({ controller, value: '' })
              }}
              onPressEnter={(event) => {
                event.preventDefault()
                void verify()
              }}
            />
            <p
              id={`${passwordId}-help`}
              role={passwordError ? 'alert' : 'status'}
              className={passwordError ? 'mimir-docx-protection__error' : undefined}
            >
              {passwordError ||
                (busy
                  ? '正在本地验证，可随时取消。'
                  : '仅用于当前编辑会话。原件的其他编辑限制会继续生效。')}
            </p>
          </ToolbarMenuFields>
        )}
        {native.mode === 'forms' && (
          <ToolbarMenuFields label="表单复选框">
            {controls.length ? (
              <>
                <ToolbarSelect
                  label="选择复选框"
                  value={current?.id ?? ''}
                  options={controls.map((control) => ({
                    value: control.id,
                    label: `${control.label} · ${control.checked === null ? '状态无法读取' : control.checked ? '已勾选' : '未勾选'}`,
                  }))}
                  onChange={(id) => {
                    setSelected(id)
                    setMessage('')
                  }}
                />
                <dl className="mimir-docx-protection__values">
                  <dt>控件类型</dt>
                  <dd>{current?.kind === 'legacy' ? '旧式表单复选框' : '内容控件复选框'}</dd>
                  <dt>当前状态</dt>
                  <dd>
                    {current?.checked === null
                      ? '无法可靠读取'
                      : current?.checked
                        ? '已勾选'
                        : '未勾选'}
                  </dd>
                </dl>
                <ToolbarMenuNote>
                  {current?.reason ??
                    '聚焦下方按钮后按空格切换，也可以直接点击文档中的这个复选框。'}
                </ToolbarMenuNote>
              </>
            ) : (
              <ToolbarMenuNote>
                此原件没有可识别的表单复选框。普通方框文字保持只读。
              </ToolbarMenuNote>
            )}
            {message && <p role="status">{message}</p>}
          </ToolbarMenuFields>
        )}
        <ToolbarMenuFields label="可用操作">
          <ToolbarMenuNote>
            {access.mandatoryTracking
              ? FORCED_TRACKING_REASON
              : access.writable
                ? '使用工具栏编辑当前文档，修改后手动保存。'
                : access.commentsOnly
                  ? '可为普通单段文字添加批注，在“管理批注”中编辑、回复、解决和删除受支持的讨论。复杂原生锚点只读保留，正文保持只读。'
                  : access.formsOnly
                    ? '仅受支持的原生复选框可填写。正文、普通方框文字及其他控件保持只读；可撤销或重做本次填写。'
                    : '可以阅读、选取复制、查找、对比文档，并导出未修改的原件。'}
          </ToolbarMenuNote>
          <ToolbarMenuNote>
            修改密码验证仅在当前会话生效。更改保护设置后需保存到库；关闭文档后重新验证。
          </ToolbarMenuNote>
        </ToolbarMenuFields>
      </div>
      <div className="mimir-docx-protection__actions">
        {access.modificationPasswordRequired ? (
          <>
            <ToolbarButton
              label={busy ? '正在验证…' : '验证并继续编辑'}
              primary
              disabled={busy || !password}
              disabledReason={busy ? '正在本地验证' : '请输入修改密码'}
              onClick={() => {
                void verify()
              }}
            />
            {busy && (
              <ToolbarButton label="取消验证" onClick={() => cancel(true)}>
                取消
              </ToolbarButton>
            )}
          </>
        ) : native.mode === 'forms' && controls.length ? (
          <ToolbarButton
            label={current?.checked ? '取消勾选此复选框' : '勾选此复选框'}
            primary
            disabled={!current || !!current.reason}
            disabledReason={current?.reason ?? undefined}
            onClick={toggle}
          />
        ) : access.recommendedChoice ? (
          <ToolbarButton
            label="仍然编辑此文档"
            primary
            onClick={() => controller.continueRecommendedEditing()}
          >
            <ShieldCheck size={14} />
          </ToolbarButton>
        ) : (
          <ToolbarMenuNote>
            {access.writable || access.commentsOnly || access.formsOnly
              ? '保护设置随原件保留'
              : '当前保护不允许写入'}
          </ToolbarMenuNote>
        )}
      </div>
    </div>
  )
}
