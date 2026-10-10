import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, Button, Dropdown, Input, Modal, Skeleton, Tooltip } from 'antd'
import { createStyles } from 'antd-style'
import { Ellipsis, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { FolderNode } from '@mimir/shared'
import { KnowledgeBaseCreateModal } from '../KnowledgeBaseCreateModal'
import { api } from '../../lib/api'
import { FolderGlyph } from './folder-icons'
import { isDescendantOf, joinPath, nameOf, parentOf } from './folder-ops'
import { FONT_SIZE } from '../../theme/tokens'

/**
 * 左导航的知识库分区：**平铺的知识库列表** + 增删改（D-079）。
 *
 * 曾经是一棵目录树（D-068）：行上 hover 出 ⋯、拖拽重挂父级、三角展开子级。
 * 树的层级随着「知识库成为内容的主容器」失去了意义——侧边栏要回答的是
 * 「我有哪些知识库」，而不是「目录树长什么样」：
 *
 *  - **只列顶层**。顶层 = 知识库；子目录是知识库**内部**的结构，在知识库页
 *    里以文件夹卡片与面包屑呈现（`LibraryView`），不再占据侧边栏。
 *  - **无拖拽**。拖拽的语义是「重挂父级」，平铺之后父级只剩库根，
 *    没有可拖的东西；「移动」没有独立语义，改名即移动
 *    （`services/folders.ts` 的 moveFolder）。
 *  - **行上 ⋯ 只剩改名与删除**。「新建子目录」跟着树一起退场——建目录
 *    的入口在知识库页的工具条上（「新建文件夹」）。
 *
 * 删除的语义（D-068，未变）：删的是**目录**，里面的文档保留、指派清空——
 * 文档的删除有自己的确认流，藏在删目录里等于绕过了那道防线。
 */

interface FolderSectionProps {
  items: FolderNode[] | undefined
  isLoading: boolean
  /** 请求失败。必须与「空」分开——失败时装作没有知识库是界面在说谎 */
  isError?: boolean
  onRetry?: () => void
  /** 当前选中的目录完整路径（scope=folder:x 时），其余视图为 null */
  activePath: string | null
  onSelect: (path: string) => void
}

const useStyles = createStyles(({ css, token }) => ({
  head: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    /* 与 antd 分组标签同节奏（NavSidebar.style.ts 的 group-title 一致）：
       顶部间距拆成 margin（组间距）+ padding（行内），行悬停的底色只染
       行内那 30px，不把 11px 的组间距也染进去 */
    margin-top: 11px;
    /* 左内距 8 + 容器 padding-inline 6 = 文字仍在 14px——与「对话」分组
       标签的文字位置同一条竖线（间距归容器统一，见 NavSidebar 的 body） */
    padding: 3px 6px 3px 8px;
    border-radius: 6px;

    &:hover {
      .folder-head-add {
        opacity: 1;
      }
    }

    /* 键盘用户 tab 进行内按钮时，+ 同样显形 */
    &:focus-within .folder-head-add {
      opacity: 1;
    }
  `,
  headTitle: css`
    height: auto;
    /* 竖向补到 24px（antd 小按钮的高度）：字号只有 badge 档，热区不该
       跟着字形一起缩到 18px */
    padding: 3px 0;
    font-size: ${FONT_SIZE.badge}px;
    font-weight: 600;
    color: ${token.colorTextTertiary};
    letter-spacing: 0.02em;
    background-color: transparent;
  `,
  headAdd: css`
    opacity: 0;
    transition: opacity 0.12s ease-out;
    /* 显形条件在 head 上：行悬停（.folder-head-add）与行内聚焦
       （head:focus-within）各一条——这里只管过渡 */
  `,
  headAddAlways: css`
    opacity: 1;
  `,
  /**
   * 平铺的行。与旧树行同一套几何（28px 高、6px 圆角、pill 内距归容器），
   * 差别只有两个：没有缩进，也不再依赖 rc-tree 的行盒——名字、计数、⋯
   * 直接是一次 flex 布局，旧树「标题被折到下一行」的坑
   * （`.ant-tree-title` 行内元素问题）在结构上就不可能再发生。
   */
  list: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
  `,
  emptyHint: css`
    padding: 2px 14px 6px;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.7;
    color: ${token.colorTextTertiary};
  `,
  /* 读取失败。与 emptyHint 同样的排版，但失败提示要**能被看见**
     （tertiary 太弱——它读起来像一句说明而不是一个问题），所以用次级文字色 */
  errorHint: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 8px 6px 14px;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.7;
    color: ${token.colorTextSecondary};
  `,
  dialogHint: css`
    margin-top: 8px;
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextTertiary};
  `,
}))

/**
 * 单行样式（FolderRow 用）。**抽成独立的 createStyles** 而不是塞进上面的
 * useStyles：FolderRow 是模块级组件（React Compiler 的要求，见下），
 * 它在自己的 hooks 里拿样式，不经过 props 传 className 链。
 */
const useRowStyles = createStyles(({ css, token }) => ({
  rowWrap: css`
    display: flex;
    align-items: center;
    height: 28px;
    padding-inline: 6px;
    border-radius: 6px;
    color: ${token.colorTextSecondary};
    transition: background 0.12s ease-out;

    &:hover {
      background: ${token.colorBgTextHover};
    }

    &[aria-current] {
      background: ${token.colorPrimaryBg};
    }
  `,
  rowBtn: css`
    display: flex;
    align-items: center;
    gap: 7px;
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: none;
    background: none;
    font-family: inherit;
    font-size: inherit;
    color: inherit;
    cursor: pointer;

    &:focus-visible {
      outline: none;
      box-shadow: inset 0 0 0 1px ${token.colorPrimaryBorder};
      border-radius: 6px;
    }
  `,
  rowName: css`
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  `,
  rowCount: css`
    flex: none;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
    font-variant-numeric: tabular-nums;
  `,
  /* hover 才出现的行级 ⋯。键盘可达：包裹层 focus-within 同样显形 */
  rowOps: css`
    opacity: 0;
    flex: none;
    transition: opacity 0.12s ease-out;

    .row:hover &,
    .row:focus-within & {
      opacity: 1;
    }
  `,
}))

/** 行内 ⋯ 菜单。平铺之后只剩库自己的管理动作（D-079） */
const ROW_MENU = [
  { key: 'rename', label: '重命名' },
  { type: 'divider' as const },
  { key: 'remove', label: '删除', danger: true },
]

interface RowProps {
  folder: FolderNode
  active: boolean
  onSelect: (path: string) => void
  onAction: (folder: FolderNode, key: string) => void
}

/**
 * 单行。
 *
 * ⋯ 菜单是行 button 的**兄弟**（都挂在 rowWrap 里），不是它的子元素——
 * button 里嵌 button 是无效 HTML，读屏会把两个控件念成一个；
 * 旧树行的写法在 rc-tree 的行盒里没有这个问题，平铺后要自己摆对。
 */
function FolderRow({ folder, active, onSelect, onAction }: RowProps): ReactNode {
  const { styles } = useRowStyles()
  return (
    <div
      className={`row ${styles.rowWrap}`}
      aria-current={active || undefined}
      onClick={(event) => {
        // 点 ⋯ 的冒泡不该被当成「进知识库」——⋯ 自己有 handler，
        // 但 Dropdown 的浮层点击也会冒泡到这里，统一在行层排除按钮目标
        if ((event.target as HTMLElement).closest('button')) return
        onSelect(folder.path)
      }}
    >
      <button
        type="button"
        className={styles.rowBtn}
        aria-current={active || undefined}
        onClick={() => onSelect(folder.path)}
      >
        <FolderGlyph iconKey={folder.icon} />
        <span className={styles.rowName}>{folder.name}</span>
        {folder.count > 0 && <span className={styles.rowCount}>{folder.count}</span>}
      </button>
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        menu={{ items: ROW_MENU, onClick: ({ key }) => onAction(folder, key) }}
      >
        <Button
          type="text"
          size="small"
          className={styles.rowOps}
          aria-label={`知识库 ${folder.name} 的操作`}
          icon={<Ellipsis size={16} />}
        />
      </Dropdown>
    </div>
  )
}

export function FolderSection({
  items,
  isLoading,
  isError = false,
  onRetry,
  activePath,
  onSelect,
}: FolderSectionProps) {
  const { styles } = useStyles()
  const queryClient = useQueryClient()
  const { message, modal } = App.useApp()

  /* 只取顶层——子目录是知识库内部的结构，归知识库页管（D-079） */
  const folders = items ?? []
  const isEmpty = !isLoading && folders.length === 0

  /**
   * 新建走**共享表单**（`KnowledgeBaseCreateModal`）——知识库页的引导空态
   * 也要同一张表单，各写一份会从第一天起漂移。重命名只问名字，留在本地。
   */
  const [createOpen, setCreateOpen] = useState(false)
  const [dialog, setDialog] = useState<{
    /** 原完整路径（重命名用） */
    path: string
    initial: string
  } | null>(null)
  const [name, setName] = useState('')
  const renameTriggerRef = useRef<HTMLElement | null>(null)

  const openRename = (path: string) => {
    renameTriggerRef.current =
      Array.from(document.querySelectorAll<HTMLElement>('button')).find(
        (button) => button.getAttribute('aria-label') === `知识库 ${nameOf(path)} 的操作`,
      ) ?? null
    setName(nameOf(path))
    setDialog({ path, initial: nameOf(path) })
  }
  const closeDialog = () => setDialog(null)
  const restoreRenameFocus = () => {
    const trigger = renameTriggerRef.current
    if (trigger?.isConnected && trigger.getClientRects().length > 0) trigger.focus()
    else document.querySelector<HTMLElement>('[aria-label="知识库"]')?.focus()
  }

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['folders'] })
    void queryClient.invalidateQueries({ queryKey: ['documents'] })
    // 打开中的详情也显示目录归属，一并失效——少刷一处就是数字在骗人
    void queryClient.invalidateQueries({ queryKey: ['document'] })
  }

  /**
   * 改名之后，**当前所在知识库可能已经在旧路径上失效**——
   * URL 还停在 scope=folder:旧路径，选中态丢失、列表指向一个不存在的目录。
   * 所以凡是 activePath 落在子树里，都要跟着改写到新路径。
   */
  const followActivePath = (from: string, to: string) => {
    if (!activePath) return
    if (activePath === from) onSelect(to)
    else if (isDescendantOf(activePath, from)) onSelect(`${to}${activePath.slice(from.length)}`)
  }

  const renameMut = useMutation({
    mutationFn: (input: { from: string; name: string }) =>
      api.folders.move(input.from, joinPath(parentOf(input.from), input.name)),
    onSuccess: (_data, vars) => {
      invalidate()
      message.success(`已重命名为「${vars.name}」`)
      closeDialog()
      followActivePath(vars.from, joinPath(parentOf(vars.from), vars.name))
    },
    onError: (error: unknown) =>
      message.error(error instanceof Error ? error.message : '重命名失败'),
  })

  const removeMut = useMutation({
    mutationFn: (path: string) => api.folders.remove(path),
    onSuccess: (data, path) => {
      invalidate()
      message.success(
        data.cleared > 0 ? `已删除知识库，${data.cleared} 篇文档移回库根` : '已删除知识库',
      )
      // 删的正是当前所在知识库（或其内部）时，留在原 scope 等于看一个空目录
      if (activePath && (activePath === path || isDescendantOf(activePath, path))) onSelect('')
    },
    onError: (error: unknown) => message.error(error instanceof Error ? error.message : '删除失败'),
  })

  const confirmRemove = (node: FolderNode) => {
    modal.confirm({
      title: `删除知识库「${node.name}」？`,
      content:
        node.count > 0
          ? `里面的 ${node.count} 篇文档会保留，指派清空后回到库根。`
          : '这是一个空知识库，删除后不影响任何文档。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => removeMut.mutateAsync(node.path),
    })
  }

  const submitDialog = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (trimmed.includes('/')) {
      message.error('名称不能包含 /')
      return
    }
    if (!dialog) return
    if (trimmed === nameOf(dialog.path)) {
      closeDialog()
      return
    }
    renameMut.mutate({ from: dialog.path, name: trimmed })
  }

  const onRowMenuClick = (node: FolderNode, key: string) => {
    if (key === 'rename') openRename(node.path)
    if (key === 'remove') confirmRemove(node)
  }

  return (
    <div>
      <div className={styles.head}>
        {/* 分组标签。曾经整行可点回「全部文档」，那个页面已随 D-079 退役，
            标签退回纯文字——不再假装自己是个入口 */}
        <span className={styles.headTitle}>知识库</span>
        <Tooltip title="创建知识库" placement="right">
          <Button
            type="text"
            size="small"
            aria-label="创建知识库"
            icon={<Plus size={16} />}
            /* 空库里 ＋ 常驻：hover 显形的前提是「已经有东西可指」，此时没有 */
            className={`folder-head-add ${styles.headAdd} ${isEmpty ? styles.headAddAlways : ''}`}
            onClick={() => setCreateOpen(true)}
          />
        </Tooltip>
      </div>

      {isLoading ? (
        <div className={styles.emptyHint}>
          <Skeleton active paragraph={{ rows: 2 }} title={false} />
        </div>
      ) : isError ? (
        /* 失败不能落进「还没有知识库」那一支——那句会让用户以为库没了 */
        <div className={styles.errorHint}>
          <span>知识库读取失败</span>
          {onRetry ? (
            <Button type="link" size="small" onClick={onRetry}>
              重试
            </Button>
          ) : null}
        </div>
      ) : folders.length === 0 ? (
        <div className={styles.emptyHint}>还没有知识库，点上方 ＋ 创建</div>
      ) : (
        <div className={styles.list}>
          {folders.map((folder) => (
            <FolderRow
              key={folder.path}
              folder={folder}
              active={Boolean(
                activePath &&
                (activePath === folder.path || isDescendantOf(activePath, folder.path)),
              )}
              onSelect={onSelect}
              onAction={onRowMenuClick}
            />
          ))}
        </div>
      )}

      {/* 新建 = 共享的创建知识库表单（名称 / 描述 / 图标，D-078）；
          重命名只问名字，留在本地 */}
      <KnowledgeBaseCreateModal
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onCreated={(path) => {
          setCreateOpen(false)
          onSelect(path)
        }}
      />

      <Modal
        title="重命名知识库"
        open={dialog !== null}
        onOk={submitDialog}
        onCancel={closeDialog}
        afterClose={restoreRenameFocus}
        okText="重命名"
        cancelText="取消"
        okButtonProps={{ disabled: name.trim() === '' }}
        destroyOnHidden
      >
        <Input
          value={name}
          autoFocus
          placeholder="新名称"
          onChange={(event) => setName(event.target.value)}
          onPressEnter={submitDialog}
        />
        <div className={styles.dialogHint}>改名即移动：该知识库下的目录结构原样保留</div>
      </Modal>
    </div>
  )
}
