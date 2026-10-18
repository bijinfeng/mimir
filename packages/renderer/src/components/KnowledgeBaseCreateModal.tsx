import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, Button, Input, Modal } from 'antd'
import type { InputRef } from 'antd'
import { createStyles } from 'antd-style'
import { useId, useRef, useState } from 'react'
import { folderUpdateRecoverySchema } from '@mimir/shared'
import type { FolderNode } from '@mimir/shared'
import { api, ApiRequestError } from '../lib/api'
import { FONT_SIZE } from '../theme/tokens'
import { joinPath, nameOf, parentOf } from './nav/folder-ops'

export interface KnowledgeBaseModalProps {
  open: boolean
  folder?: FolderNode
  onCancel: () => void
  onSaved: (path: string, from?: string) => void
  onReconciled?: (from: string, to: string) => void
  afterClose?: () => void
}

function findIdentity(items: FolderNode[], original: FolderNode): FolderNode | undefined {
  for (const item of items) {
    if (original.code ? item.code === original.code : item.path === original.path) return item
    const child = findIdentity(item.children, original)
    if (child) return child
  }
  return undefined
}

const useStyles = createStyles(({ css, token }) => ({
  dialog: css`
    display: flex;
    flex-direction: column;
    max-height: calc(100dvh - 48px);
  `,
  body: css`
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  `,
  descriptionControl: css`
    padding-bottom: 24px;
  `,
  error: css`
    margin: 6px 0 0;
    color: ${token.colorErrorText};
    font-size: ${FONT_SIZE.note}px;
    overflow-wrap: anywhere;
  `,
  fieldLabel: css`
    display: block;
    margin: 20px 0 7px;
    font-size: ${FONT_SIZE.item}px;
    font-weight: 600;
    color: ${token.colorText};

    &:first-child {
      margin-top: 0;
    }
  `,
}))

/** Shared create/edit form. Mount with the edited path as key to isolate drafts. */
export function KnowledgeBaseModal({
  open,
  folder,
  onCancel,
  onSaved,
  onReconciled,
  afterClose,
}: KnowledgeBaseModalProps) {
  const { styles } = useStyles()
  const queryClient = useQueryClient()
  const { message } = App.useApp()
  const fieldId = useId()
  const nameRef = useRef<InputRef>(null)
  const submitting = useRef(false)
  const composing = useRef(false)
  const actual = useRef(folder)
  const [unsafeRecovery, setUnsafeRecovery] = useState(false)
  const unsafeRecoveryRef = useRef(false)
  const [name, setName] = useState(folder?.name ?? '')
  const [description, setDescription] = useState(folder?.description ?? '')
  const [nameError, setNameError] = useState('')
  const [descriptionError, setDescriptionError] = useState('')
  const [requestError, setRequestError] = useState('')
  const [recoveryBlocked, setRecoveryBlocked] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const edit = Boolean(folder)
  const busy = recovering

  const reset = () => {
    setName(folder?.name ?? '')
    setDescription(folder?.description ?? '')
    setNameError('')
    setDescriptionError('')
    setRequestError('')
    setRecoveryBlocked(false)
    actual.current = folder
    unsafeRecoveryRef.current = false
    setUnsafeRecovery(false)
  }
  const reconcile = async () => {
    if (!actual.current) return
    setRecovering(true)
    try {
      const result = await api.folders.list()
      queryClient.setQueryData(['folders'], result)
      const resolved = findIdentity(result.items, actual.current)
      if (!resolved) throw new Error('知识库已不可用，请关闭后重新选择')
      const from = actual.current.path
      actual.current = resolved
      if (from !== resolved.path) onReconciled?.(from, resolved.path)
      setRecoveryBlocked(unsafeRecoveryRef.current)
    } catch {
      setRecoveryBlocked(true)
    } finally {
      setRecovering(false)
    }
  }
  const mutation = useMutation({
    mutationFn: async (input: { name: string; description: string }) => {
      const source = actual.current
      if (!source) {
        await api.folders.create(
          input.name,
          input.description ? { description: input.description } : {},
        )
        return { path: input.name, from: undefined }
      }
      const path = joinPath(parentOf(source.path), input.name)
      const result = await api.folders.move(
        source.path,
        path,
        input.description === (source.description ?? '') ? {} : { description: input.description },
      )
      return { path: result.path ?? path, from: source.path }
    },
    onSuccess: async (result) => {
      await Promise.all(
        [['folders'], ['documents'], ['document'], ['recent-documents']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      )
      message.success(edit ? '已保存知识库' : '已创建知识库')
      reset()
      onSaved(result.path, result.from)
    },
    onError: async (error: unknown) => {
      setRequestError(error instanceof Error ? error.message : '请求失败，请重试')
      const recovery = folderUpdateRecoverySchema.safeParse(
        error instanceof ApiRequestError &&
          error.details &&
          typeof error.details === 'object' &&
          'recovery' in error.details
          ? error.details.recovery
          : undefined,
      )
      if (recovery.success && !recovery.data.retrySafe) {
        unsafeRecoveryRef.current = true
        setUnsafeRecovery(true)
        setRecoveryBlocked(true)
      }
      // Even a lost response may have committed a rename. Resolve the stable code before retry.
      if (edit) await reconcile()
    },
    onSettled: () => {
      submitting.current = false
    },
  })
  const pending = mutation.isPending || busy
  const submit = () => {
    if (submitting.current || composing.current || recoveryBlocked) return
    const trimmed = name.trim()
    const error = !trimmed
      ? '请输入知识库名称'
      : trimmed.includes('/')
        ? '名称不能包含 /'
        : trimmed === '.' || trimmed === '..' || trimmed.includes('\\')
          ? '名称不能包含路径符号'
          : trimmed.length > 60 && trimmed !== actual.current?.name
            ? '名称最多 60 字'
            : ''
    setNameError(error)
    if (error) {
      nameRef.current?.focus()
      return
    }
    // Legacy descriptions over 500 remain intact when only the name is changed.
    const originalDescription = actual.current?.description ?? ''
    if (description.length > 500 && description !== originalDescription) {
      setDescriptionError('描述最多 500 字；原有长描述可保持不变')
      return
    }
    if (
      actual.current &&
      trimmed === nameOf(actual.current.path) &&
      description === originalDescription
    ) {
      reset()
      onCancel()
      return
    }
    setRequestError('')
    submitting.current = true
    mutation.mutate({ name: trimmed, description })
  }
  return (
    <Modal
      title={edit ? '编辑知识库' : '创建知识库'}
      open={open}
      onOk={submit}
      onCancel={() => {
        if (!submitting.current && !pending) {
          reset()
          onCancel()
        }
      }}
      afterClose={afterClose}
      okText={
        pending
          ? edit
            ? '保存中…'
            : '创建中…'
          : requestError
            ? edit
              ? '重试保存'
              : '重试创建'
            : edit
              ? '保存'
              : '创建'
      }
      closable={!pending}
      keyboard={!pending}
      mask={{ closable: !pending }}
      cancelButtonProps={{ disabled: pending }}
      cancelText="取消"
      afterOpenChange={(visible) => {
        if (visible) nameRef.current?.focus()
      }}
      okButtonProps={{ disabled: !name.trim() || recoveryBlocked, loading: pending }}
      destroyOnHidden
      centered
      classNames={{ container: styles.dialog, body: styles.body }}
      width={520}
    >
      <label className={styles.fieldLabel} htmlFor={`${fieldId}-name`}>
        名称
      </label>
      <Input
        id={`${fieldId}-name`}
        ref={nameRef}
        disabled={pending}
        value={name}
        status={nameError ? 'error' : undefined}
        aria-invalid={Boolean(nameError)}
        aria-describedby={nameError ? `${fieldId}-name-error` : undefined}
        autoFocus
        placeholder="如：技术笔记"
        maxLength={60}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
        }}
        onChange={(event) => {
          setName(event.target.value)
          setNameError('')
          setRequestError('')
        }}
        onPressEnter={(event) => {
          if (!event.nativeEvent.isComposing && event.keyCode !== 229) submit()
        }}
      />
      {nameError && (
        <p id={`${fieldId}-name-error`} role="alert" className={styles.error}>
          {nameError}
        </p>
      )}
      <label className={styles.fieldLabel} htmlFor={`${fieldId}-desc`}>
        描述（可选）
      </label>
      <div className={styles.descriptionControl}>
        <Input.TextArea
          id={`${fieldId}-desc`}
          disabled={pending}
          value={description}
          status={descriptionError ? 'error' : undefined}
          aria-invalid={Boolean(descriptionError)}
          aria-describedby={descriptionError ? `${fieldId}-desc-error` : undefined}
          placeholder="简单描述这个知识库"
          autoSize={{ minRows: 3, maxRows: 5 }}
          maxLength={folder && (folder.description?.length ?? 0) > 500 ? 2000 : 500}
          showCount
          onChange={(event) => {
            setDescription(event.target.value)
            setDescriptionError('')
            setRequestError('')
          }}
        />
      </div>
      {descriptionError && (
        <p id={`${fieldId}-desc-error`} role="alert" className={styles.error}>
          {descriptionError}
        </p>
      )}
      {requestError && (
        <p role="alert" className={styles.error}>
          {edit ? '保存' : '创建'}失败：{requestError}。草稿已保留，请重试。
        </p>
      )}
      {recoveryBlocked && (
        <div role="alert" className={styles.error}>
          {unsafeRecovery
            ? '保存未能完整恢复，请关闭后重新打开知识库检查内容。'
            : '暂时无法确认知识库的最新状态，请重新读取后再保存。'}
          <Button type="link" size="small" loading={recovering} onClick={() => void reconcile()}>
            重新读取状态
          </Button>
        </div>
      )}
    </Modal>
  )
}

/** Compatibility entry point; both creation surfaces use the same editor. */
export function KnowledgeBaseCreateModal({
  open,
  onCancel,
  onCreated,
}: {
  open: boolean
  onCancel: () => void
  onCreated: (path: string) => void
}) {
  return <KnowledgeBaseModal open={open} onCancel={onCancel} onSaved={(path) => onCreated(path)} />
}
