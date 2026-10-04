import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, Input, Modal } from 'antd'
import { createStyles } from 'antd-style'
import { useState } from 'react'
import { FOLDER_ICONS } from '@mimir/shared'
import { FolderGlyph } from '@/components/nav/folder-icons'
import { api } from '@/lib/api'
import { FONT_SIZE } from '@/theme/tokens'

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
  fieldLabel: css`
    display: block;
    margin: 14px 0 6px;
    font-size: ${FONT_SIZE.item}px;
    color: ${token.colorTextSecondary};

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
    background: transparent;
    color: ${token.colorTextSecondary};
    font-size: ${FONT_SIZE.badge}px;
    cursor: pointer;

    &:hover {
      border-color: ${token.colorPrimaryBorder};
      color: ${token.colorText};
    }
  `,
  iconCellActive: css`
    border-color: ${token.colorPrimary};
    background: ${token.colorPrimaryBg};
    color: ${token.colorPrimary};
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

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  /** 图标键；null = 未选（行上回退文件夹图标） */
  const [icon, setIcon] = useState<string | null>(null)

  const reset = () => {
    setName('')
    setDescription('')
    setIcon(null)
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
    onError: (error: unknown) => message.error(error instanceof Error ? error.message : '新建失败'),
  })

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (trimmed.includes('/')) {
      message.error('名称不能包含 /')
      return
    }
    createMut.mutate({ name: trimmed, description: description.trim(), icon })
  }

  return (
    <Modal
      title="创建知识库"
      open={open}
      onOk={submit}
      onCancel={() => {
        reset()
        onCancel()
      }}
      okText="创建"
      cancelText="取消"
      okButtonProps={{ disabled: name.trim() === '', loading: createMut.isPending }}
      destroyOnHidden
      width={520}
    >
      <label className={styles.fieldLabel} htmlFor="kb-name">
        名称
      </label>
      <Input
        id="kb-name"
        value={name}
        autoFocus
        placeholder="如：技术笔记"
        maxLength={60}
        onChange={(event) => setName(event.target.value)}
        onPressEnter={submit}
      />

      <label className={styles.fieldLabel} htmlFor="kb-desc">
        描述
      </label>
      <Input.TextArea
        id="kb-desc"
        value={description}
        placeholder="这库收什么内容（可留空）"
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
    </Modal>
  )
}
