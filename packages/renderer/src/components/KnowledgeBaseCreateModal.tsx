import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, Input, Modal } from 'antd'
import type { InputRef } from 'antd'
import { createStyles } from 'antd-style'
import { useId, useRef, useState } from 'react'
import { FOLDER_ICONS } from '@mimir/shared'
import { FolderGlyph } from './nav/folder-icons'
import { api } from '../lib/api'
import { FONT_SIZE } from '../theme/tokens'

/**
 * 「创建知识库」表单（名称 / 描述 / 图标，D-078）。
 *
 * ## 为什么是一个共享组件
 *
 * 两个入口都要它：侧边栏知识库分组的 ＋（`FolderSection`）与知识库页
 * 在没有知识库时给的引导（`LibraryView`）。两处各写一份表单会**从第一天
 * 起就漂移**——字段一样、校验一样、提交一样，而任何一处改样式或加字段
 * 都不会让另一处跟着动。表单只有一份，谁要谁挂。
 *
 * 创建成功后失效 `folders` 查询并回调 `onCreated(path)`：调用方决定
 * 「建完去哪」（侧边栏进入该库、库页引导进入该库）。
 */
export interface KnowledgeBaseCreateModalProps {
  open: boolean
  onCancel: () => void
  /** 建好之后。`path` 是新建知识库的完整路径（顶层，即名称本身） */
  onCreated: (path: string) => void
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
  /**
   * 图标网格：**flex 换行 + 居中**，不是 4 列定行网格。
   *
   * 13 个图标按 4 列排出来是 4/4/4/1——最后一行孤零零一个格子贴在左缘，
   * 看起来像渲染漏了几格。换行 + 居中之后，末行的 1 个（或 2 个、3 个）
   * 落在中线上，读作「这一组到此为止」而不是「少了三个」。
   *
   * 每格宽 `(100% - 3×gap) / 4` 保持四列节奏：居中只在**不完整的行**
   * 上产生可见差别（整行四个正好铺满，居中没有效果）。
   */
  iconGrid: css`
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    padding: 10px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadius}px;
    background: ${token.colorFillQuaternary};
  `,
  iconCell: css`
    width: calc((100% - 24px) / 4);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 9px 4px 7px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadius}px;
    background: ${token.colorBgContainer};
    color: ${token.colorTextSecondary};
    font-size: ${FONT_SIZE.badge}px;
    cursor: pointer;

    &:hover {
      border-color: ${token.colorPrimaryBorder};
      color: ${token.colorText};
    }

    &:disabled {
      cursor: not-allowed;
      color: ${token.colorTextDisabled};
    }

    &:focus-visible {
      outline: 2px solid ${token.colorPrimaryBorder};
      outline-offset: 2px;
    }
  `,
  iconCellActive: css`
    border-color: ${token.colorLink};
    background: ${token.colorPrimaryBg};
    color: ${token.colorLink};
  `,
}))

export function KnowledgeBaseCreateModal({
  open,
  onCancel,
  onCreated,
}: KnowledgeBaseCreateModalProps) {
  const { styles } = useStyles()
  const queryClient = useQueryClient()
  const { message } = App.useApp()

  const fieldId = useId()
  const nameRef = useRef<InputRef>(null)
  const submitting = useRef(false)
  const [nameError, setNameError] = useState('')
  const [requestError, setRequestError] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  /** 图标键；null = 未选（行上回退文件夹图标） */
  const [icon, setIcon] = useState<string | null>(null)

  const reset = () => {
    setName('')
    setDescription('')
    setIcon(null)
    setNameError('')
    setRequestError('')
  }

  const createMut = useMutation({
    mutationFn: (input: { name: string; description: string; icon: string | null }) =>
      api.folders.create(input.name, {
        // 空描述 = 没写；不把空串发上去，服务端默认值承担「没写」
        ...(input.description ? { description: input.description } : {}),
        ...(input.icon ? { icon: input.icon } : {}),
      }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] })
      message.success('已创建知识库')
      reset()
      onCreated(vars.name)
    },
    onError: (error: unknown) => {
      setRequestError(error instanceof Error ? error.message : '新建失败，请重试')
    },
    onSettled: () => {
      submitting.current = false
    },
  })

  const submit = () => {
    if (submitting.current) return
    const trimmed = name.trim()
    const error = !trimmed ? '请输入知识库名称' : trimmed.includes('/') ? '名称不能包含 /' : ''
    setNameError(error)
    if (error) {
      nameRef.current?.focus()
      return
    }
    setRequestError('')
    submitting.current = true
    createMut.mutate({ name: trimmed, description: description.trim(), icon })
  }

  return (
    <Modal
      title="创建知识库"
      open={open}
      onOk={submit}
      onCancel={() => {
        if (submitting.current) return
        reset()
        onCancel()
      }}
      okText={createMut.isPending ? '创建中…' : requestError ? '重试创建' : '创建'}
      closable={!createMut.isPending}
      keyboard={!createMut.isPending}
      mask={{ closable: !createMut.isPending }}
      cancelButtonProps={{ disabled: createMut.isPending }}
      afterOpenChange={(visible) => {
        if (visible) nameRef.current?.focus()
      }}
      cancelText="取消"
      okButtonProps={{ disabled: name.trim() === '', loading: createMut.isPending }}
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
        disabled={createMut.isPending}
        status={nameError ? 'error' : undefined}
        aria-invalid={Boolean(nameError)}
        aria-describedby={nameError ? `${fieldId}-name-error` : undefined}
        value={name}
        autoFocus
        placeholder="如：技术笔记"
        maxLength={60}
        onChange={(event) => {
          setName(event.target.value)
          setNameError('')
          setRequestError('')
        }}
        onPressEnter={submit}
      />

      {nameError && (
        <p id={`${fieldId}-name-error`} role="alert" className={styles.error}>
          {nameError}
        </p>
      )}

      <label className={styles.fieldLabel} htmlFor={`${fieldId}-desc`}>
        描述（可选）
      </label>
      <Input.TextArea
        id={`${fieldId}-desc`}
        disabled={createMut.isPending}
        value={description}
        placeholder="简单描述这个知识库"
        autoSize={{ minRows: 3, maxRows: 5 }}
        maxLength={2000}
        showCount
        onChange={(event) => setDescription(event.target.value)}
      />

      <span className={styles.fieldLabel}>图标</span>
      {/* 13 格图标网格（与 shared 的 FOLDER_ICONS 同序）。
          再点已选的格子 = 取消选择，可以不要图标 */}
      <div className={styles.iconGrid}>
        {FOLDER_ICONS.map((item) => {
          const active = icon === item.key
          return (
            <button
              key={item.key}
              type="button"
              disabled={createMut.isPending}
              aria-pressed={active}
              aria-label={item.label}
              className={`${styles.iconCell} ${active ? styles.iconCellActive : ''}`}
              onClick={() => setIcon(active ? null : item.key)}
            >
              <FolderGlyph iconKey={item.key} size={18} />
              {item.label}
            </button>
          )
        })}
      </div>
      {requestError && (
        <p role="alert" className={styles.error}>
          创建失败：{requestError}。草稿已保留，请重试。
        </p>
      )}
    </Modal>
  )
}
