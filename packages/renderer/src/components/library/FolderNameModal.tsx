import { useRef, useState, useId } from 'react'
import { Input, Modal } from 'antd'
import type { InputRef } from 'antd'
import { useLibraryDialogStyles } from './library-dialog-styles'

/** Mount once per operation so failed requests never replace the user's draft. */
export function FolderNameModal({
  initialName = '',
  parent,
  onSubmit,
  onClose,
  afterClose,
}: {
  initialName?: string
  parent: string
  onSubmit: (name: string) => Promise<void>
  onClose: () => void
  afterClose: () => void
}) {
  const { styles } = useLibraryDialogStyles()
  const id = useId()
  const field = useRef<InputRef>(null)
  const flight = useRef(false)
  const composing = useRef(false)
  const [name, setName] = useState(initialName)
  const [error, setError] = useState('')
  const [requestError, setRequestError] = useState('')
  const [retryBlocked, setRetryBlocked] = useState(false)
  const [pending, setPending] = useState(false)
  const [open, setOpen] = useState(true)
  const edit = initialName !== ''
  const close = () => {
    if (flight.current || composing.current) return
    setOpen(false)
    onClose()
  }
  const submit = async () => {
    if (flight.current || composing.current || retryBlocked) return
    const value = name.trim()
    const invalid = !value
      ? '请输入文件夹名称'
      : value.includes('/')
        ? '名称不能包含 /'
        : value === '.' || value === '..' || value.includes('\\')
          ? '名称不能包含路径符号'
          : value.length > 60
            ? '名称最多 60 字'
            : ''
    setError(invalid)
    if (invalid) {
      field.current?.focus()
      return
    }
    if (edit && value === initialName) {
      close()
      return
    }
    flight.current = true
    setPending(true)
    setRequestError('')
    try {
      await onSubmit(value)
      setOpen(false)
      onClose()
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : '请求失败，请重试')
      setRetryBlocked(
        Boolean(
          cause && typeof cause === 'object' && 'retryBlocked' in cause && cause.retryBlocked,
        ),
      )
    } finally {
      flight.current = false
      setPending(false)
    }
  }
  return (
    <Modal
      open={open}
      title={edit ? '重命名文件夹' : '新建文件夹'}
      width={500}
      onOk={() => void submit()}
      onCancel={close}
      afterClose={afterClose}
      afterOpenChange={(visible) => {
        if (visible) field.current?.focus({ cursor: edit ? 'all' : 'end' })
      }}
      okText={pending ? '正在提交' : requestError ? '重试' : edit ? '重命名' : '创建'}
      cancelText="取消"
      closable={!pending}
      keyboard={!pending}
      mask={{ closable: !pending }}
      cancelButtonProps={{ disabled: pending }}
      okButtonProps={{ loading: pending, disabled: !name.trim() || retryBlocked }}
      focusable={{ focusTriggerAfterClose: false }}
      classNames={{ root: styles.root, container: styles.dialog, body: styles.body }}
    >
      <label className={styles.label} htmlFor={id} title={`所在目录：${parent}`}>
        文件夹名称
      </label>
      <Input
        id={id}
        ref={field}
        autoFocus
        value={name}
        disabled={pending}
        maxLength={60}
        placeholder="如：参考资料"
        status={error ? 'error' : undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
        onChange={(event) => {
          setName(event.target.value)
          setError('')
          if (!retryBlocked) setRequestError('')
        }}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
        }}
        onPressEnter={(event) => {
          if (!event.nativeEvent.isComposing && event.keyCode !== 229) void submit()
        }}
      />
      <p id={`${id}-hint`} className={styles.hint}>
        名称不超过 60 字，不能包含 /。
        {edit ? '仅更改名称，目录位置保持不变。' : '将在当前目录下新建。'}
      </p>
      {error && (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
      {requestError && (
        <p className={styles.error} role="alert">
          {requestError}
        </p>
      )}
    </Modal>
  )
}
