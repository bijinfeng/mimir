import { FolderOpenOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, Button, Dropdown, Input, Modal, Skeleton, Tooltip, Tree } from 'antd'
import { createStyles } from 'antd-style'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { FolderNode } from '@mimir/shared'
import type { DataNode } from 'antd/es/tree'
import { api } from '@/lib/api'
import { dropTargetPath, isDescendantOf, joinPath, nameOf, parentOf } from './folder-ops'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 左导航的知识库分区：目录树 + 增删改移（D-068）。
 *
 * 「全部文档」不再是导航项（用户拍板移除）：进入库就是默认视图，
 * 侧边栏里要出现的是**结构**而不是一个重复入口。分区标题行右侧的
 * ＋ 新建顶层目录；行上 hover 出 ⋯ 菜单（新建子目录 / 重命名 / 删除）；
 * 拖拽 = 重挂父级（不排序兄弟——树的位置按名称稳定排序，见服务端）。
 *
 * 删除的语义（D-068）：删的是**目录**，里面的文档保留、指派清空——
 * 文档的删除有自己的确认流，藏在删目录里等于绕过了那道防线。
 *
 * 树的移动走 `folder-ops.ts` 的纯函数算落点——算错不报错，只会搬错位置，
 * 所以那一步必须有断言守着。
 */

interface FolderSectionProps {
  items: FolderNode[] | undefined
  isLoading: boolean
  /** 当前选中的目录完整路径（scope=folder:x 时），其余视图为 null */
  activePath: string | null
  onSelect: (path: string) => void
}

const useStyles = createStyles(({ css, token, prefixCls }) => ({
  head: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    /* 与 antd 分组标签同节奏（NavSidebar.style.ts 的 group-title 一致） */
    padding: 14px 6px 4px 14px;
  `,
  /**
   * 分区标题，**同时是「回到全部文档」的入口**。
   *
   * 展开态此前没有任何回库根的入口：D-068 移除了「全部文档」导航项之后，
   * 进过一次目录（或点过卡片上的标签）就只剩浏览器后退一条路——
   * 折叠态的替身（`NavSidebar.tsx` 的 `collapsedLibrary`）反倒有这个按钮。
   *
   * 不把它做成一行导航项：用户拍板过「左导航不放重复的库入口」（D-068），
   * 而这里要的只是「回得去」，标题行本身最省地方。语义沿用那条决策——
   * 目录路径为空即库根（`onSelect('')`）。
   *
   * 观感仍是素文字标签：去掉 antd 文本按钮的内边距与固定高度，
   * 只借它的焦点环、悬停反馈与「Enter/Space 可激活」——裸 span 加 onClick
   * 键盘按不动（D-042）。
   */
  headTitle: css`
    height: auto;
    /* 竖向补到 24px（antd 小按钮的高度）：字号只有 badge 档，而这是个
       可点的入口，热区不该跟着字形一起缩到 18px */
    padding: 3px 0;
    font-size: ${FONT_SIZE.badge}px;
    font-weight: 600;
    color: ${token.colorTextTertiary};
    letter-spacing: 0.02em;

    &:hover {
      color: ${token.colorTextSecondary};
    }
  `,
  headAdd: css`
    opacity: 0;
    transition: opacity 0.12s ease-out;

    &:hover,
    &:focus-visible {
      opacity: 1;
    }
  `,
  headAddAlways: css`
    opacity: 1;
  `,
  /**
   * 树行。**两处 display 是必需的，不是排版偏好。**
   *
   * antd（rc-tree）把一行的结构写成 `.ant-tree-node-content-wrapper`
   * （默认 `display: block`，行高 28px）里放「图标 + `.ant-tree-title`」，
   * 而 `.ant-tree-title` 是**行内**元素（计算值 `display: inline`）。
   * 行内容（名称 + 计数 + ⋯）是一个 flex 盒子——块级 flex 放不进行内
   * 格式化上下文里图标所在的 line box，于是被折到下一行：实测每一行的
   * `.ant-tree-title` top 都比本行高**恰好 28px**（技术 345.2 → 373.2、
   * 后端 377.2 → 405.2，七行无一例外）。
   *
   * 后果不是「难看」，是**点错**：名字画在下一行的行带上，后一个节点
   * 绘制在上，`elementFromPoint` 取「技术」字形中心命中的是「后端」的
   * 行盒；真指针点「技术」进的是 `folder:技术/后端`，点「前端」进
   * `folder:生活`。目录树是进任何目录的唯一入口，每次点击都在赌。
   *
   * 修法是让这一行成为**一次** flex 布局：wrapper 横排居中（图标与
   * 标题同一行），标题 `flex: 1` 吃掉剩余宽度——名称与计数靠左、⋯ 贴行尾，
   * 这正是 `folderTitleRender` 那个 span 的写法（`margin-inline-start: auto`）。
   */
  treeWrap: css`
    .${prefixCls}-tree {
      background: transparent;
      font-size: ${FONT_SIZE.item}px;
    }

    .${prefixCls}-tree-node-content-wrapper {
      display: flex;
      align-items: center;
      height: 28px;
      /* line-height 不再需要：子项现在都在 flex 里，各自按图标/文字定高。
         留着它反而会让折叠进来的长行高参与计算 */
      padding-inline: 6px !important;
      border-radius: 6px;
      color: ${token.colorTextSecondary};
    }

    /* 标题吃掉剩余宽度：名称靠左、⋯ 由 folderTitleRender 的
       margin-inline-start: auto 推到行尾。min-width: 0 让长目录名省略号生效 */
    .${prefixCls}-tree-title {
      display: flex;
      flex: 1;
      min-width: 0;
    }

    .${prefixCls}-tree-node-selected .${prefixCls}-tree-node-content-wrapper {
      background: ${token.colorPrimaryBg};
      color: ${token.colorLink};
    }
  `,
  rowCount: css`
    margin-inline-start: 6px;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
    font-variant-numeric: tabular-nums;
  `,
  /* hover 才出现的行级 ⋯。键盘可达：focus-visible 同样显形 */
  rowOps: css`
    opacity: 0;
    margin-inline-start: auto;

    &:hover,
    &:focus-visible {
      opacity: 1;
    }

    .${prefixCls}-tree-node-content-wrapper:hover & {
      opacity: 1;
    }
  `,
  emptyHint: css`
    padding: 2px 14px 6px;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.7;
    color: ${token.colorTextTertiary};
  `,
  dialogHint: css`
    margin-top: 8px;
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextTertiary};
  `,
}))

/** antd Tree 需要的 key/title 与目录自身的 path/name/count 合一 */
interface FolderTreeNode extends DataNode {
  name: string
  path: string
  count: number
}

/** 服务端的目录树 → antd Tree 的形状。key 用完整路径，它就是筛选条件 */
function toTreeNodes(items: FolderNode[]): FolderTreeNode[] {
  return items.map((item) => ({
    key: item.path,
    title: item.name,
    // name 单独带上：titleRender 里 asFolder 要按 FolderNode 的形状取末段名
    name: item.name,
    path: item.path,
    count: item.count,
    children: toTreeNodes(item.children),
  }))
}

/** 事件节点带的是 Tree 的基础形状，目录自身的字段要收窄一次 */
const asFolder = (node: unknown): FolderNode => {
  const { path, name, count, children } = node as FolderNode
  return { path, name, count, children: children as FolderNode[] }
}

/** 行内 ⋯ 菜单。动作对每个目录一致，不依赖具体节点 */
const ROW_MENU = [
  { key: 'create-child', label: '新建子目录' },
  { key: 'rename', label: '重命名' },
  { type: 'divider' as const },
  { key: 'remove', label: '删除', danger: true },
]

interface TitleContext {
  rowCountClass: string
  opsClass: string
  onAction: (folder: FolderNode, key: string) => void
}

/** 树行的内容：名称 + 计数 + hover 显形的 ⋯。放模块级——在组件里内联返回
    JSX 的箭头会被 react(no-unstable-nested-components) 拦下 */
function folderTitleRender(node: unknown, ctx: TitleContext): ReactNode {
  const folder = asFolder(node)
  return (
    <span style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1 }}>
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {folder.name}
      </span>
      {folder.count > 0 && <span className={ctx.rowCountClass}>{folder.count}</span>}
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        menu={{ items: ROW_MENU, onClick: ({ key }) => ctx.onAction(folder, key) }}
      >
        <Button
          type="text"
          size="small"
          className={ctx.opsClass}
          aria-label={`目录 ${folder.name} 的操作`}
          icon={<MoreOutlined />}
          onClick={(event) => event.stopPropagation()}
        />
      </Dropdown>
    </span>
  )
}

export function FolderSection({ items, isLoading, activePath, onSelect }: FolderSectionProps) {
  const { styles } = useStyles()
  const queryClient = useQueryClient()
  const { message, modal } = App.useApp()

  const folders = items ?? []
  const isEmpty = !isLoading && folders.length === 0

  /** 输入对话框：新建（记父路径）与重命名（记原路径）共用一个 Modal */
  const [dialog, setDialog] = useState<{
    mode: 'create' | 'rename'
    /** create：父路径；rename：原完整路径 */
    path: string
    initial: string
  } | null>(null)
  const [name, setName] = useState('')

  const openCreate = (parent: string) => {
    setName('')
    setDialog({ mode: 'create', path: parent, initial: '' })
  }
  const openRename = (path: string) => {
    setName(nameOf(path))
    setDialog({ mode: 'rename', path, initial: nameOf(path) })
  }
  const closeDialog = () => setDialog(null)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['folders'] })
    void queryClient.invalidateQueries({ queryKey: ['documents'] })
    // 打开中的详情也显示目录归属，一并失效——少刷一处就是数字在骗人
    void queryClient.invalidateQueries({ queryKey: ['document'] })
  }

  const createMut = useMutation({
    mutationFn: (input: { parent: string; name: string }) =>
      api.folders.create(joinPath(input.parent, input.name)),
    onSuccess: (_data, vars) => {
      invalidate()
      message.success('已新建目录')
      closeDialog()
      onSelect(joinPath(vars.parent, vars.name))
    },
    onError: (error: unknown) =>
      message.error(error instanceof Error ? error.message : '新建目录失败'),
  })

  /**
   * 改名 / 移动之后，**当前所在目录可能已经在旧路径上失效**——
   * URL 还停在 scope=folder:旧路径，选中态丢失、列表指向一个不存在的目录。
   * 所以每次搬移子树后，凡是 activePath 落在子树里，都要跟着改写到新路径。
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

  const moveMut = useMutation({
    mutationFn: (input: { from: string; to: string }) => api.folders.move(input.from, input.to),
    onSuccess: (_data, vars) => {
      invalidate()
      message.success('已移动目录')
      followActivePath(vars.from, vars.to)
    },
    onError: (error: unknown) => message.error(error instanceof Error ? error.message : '移动失败'),
  })

  const removeMut = useMutation({
    mutationFn: (path: string) => api.folders.remove(path),
    onSuccess: (data, path) => {
      invalidate()
      message.success(
        data.cleared > 0 ? `已删除目录，${data.cleared} 篇文档移回库根` : '已删除目录',
      )
      // 删的正是当前所在目录（或其祖先）时，留在原 scope 等于看一个空目录——
      // 回库默认视图
      if (activePath && (activePath === path || isDescendantOf(activePath, path))) onSelect('')
    },
    onError: (error: unknown) => message.error(error instanceof Error ? error.message : '删除失败'),
  })

  const confirmRemove = (node: FolderNode) => {
    modal.confirm({
      title: `删除目录「${node.name}」？`,
      content:
        node.count > 0
          ? `里面的 ${node.count} 篇文档会保留，指派清空后回到库根。`
          : '这是一个空目录，删除后不影响任何文档。',
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
      message.error('目录名不能包含 /')
      return
    }
    if (!dialog) return
    if (dialog.mode === 'create') {
      createMut.mutate({ parent: dialog.path, name: trimmed })
    } else {
      if (trimmed === nameOf(dialog.path)) {
        closeDialog()
        return
      }
      renameMut.mutate({ from: dialog.path, name: trimmed })
    }
  }

  const onRowMenuClick = (node: FolderNode, key: string) => {
    if (key === 'create-child') openCreate(node.path)
    if (key === 'rename') openRename(node.path)
    if (key === 'remove') confirmRemove(node)
  }

  return (
    <div>
      <div className={styles.head}>
        {/* 标题即「全部文档」入口：进过目录 / 点过标签之后，这是展开态里
            唯一能回库根的控件（折叠态有它的替身，见 NavSidebar）。
            悬停给一句说明——它看起来只是个分组标签 */}
        <Tooltip title="回到全部文档" placement="right">
          <Button
            type="text"
            size="small"
            className={styles.headTitle}
            onClick={() => onSelect('')}
          >
            知识库
          </Button>
        </Tooltip>
        <Tooltip title="新建目录" placement="right">
          <Button
            type="text"
            size="small"
            aria-label="新建目录"
            icon={<PlusOutlined />}
            /* 空库里 ＋ 常驻：hover 显形的前提是「已经有东西可指」，此时没有 */
            className={`${styles.headAdd} ${isEmpty ? styles.headAddAlways : ''}`}
            onClick={() => openCreate('')}
          />
        </Tooltip>
      </div>

      {isLoading ? (
        <div className={styles.emptyHint}>
          <Skeleton active paragraph={{ rows: 2 }} title={false} />
        </div>
      ) : folders.length === 0 ? (
        <div className={styles.emptyHint}>还没有目录，点上方 ＋ 新建</div>
      ) : (
        <Tree
          blockNode
          showIcon
          defaultExpandAll
          className={styles.treeWrap}
          treeData={toTreeNodes(folders)}
          selectedKeys={activePath ? [activePath] : []}
          onSelect={(_keys, info) => onSelect(asFolder(info.node).path)}
          icon={<FolderOpenOutlined />}
          draggable={{ icon: false }}
          allowDrop={({ dropPosition }) =>
            /* 只允许「拖进某个目录」（dropPosition 0），不允许插成兄弟——
               树按名称稳定排序，兄弟间排序是未实现的语义 */
            dropPosition === 0
          }
          onDrop={(info) => {
            const dragPath = asFolder(info.dragNode).path
            const dropPath = asFolder(info.node).path
            const target = dropTargetPath(dragPath, dropPath)
            if (!target) return
            moveMut.mutate({ from: dragPath, to: joinPath(target, nameOf(dragPath)) })
          }}
          titleRender={(node) =>
            folderTitleRender(node, {
              rowCountClass: styles.rowCount,
              opsClass: styles.rowOps,
              onAction: onRowMenuClick,
            })
          }
        />
      )}

      {/* 新建与重命名共用一个输入对话框：都只问一个「名字」，
          父路径由触发处决定（顶部 ＋ 是顶层，行内 ⋯ 是该目录）。 */}
      <Modal
        title={dialog?.mode === 'create' ? '新建目录' : '重命名目录'}
        open={dialog !== null}
        onOk={submitDialog}
        onCancel={closeDialog}
        okText={dialog?.mode === 'create' ? '创建' : '重命名'}
        cancelText="取消"
        okButtonProps={{ disabled: name.trim() === '' }}
        destroyOnHidden
        width={420}
      >
        <Input
          value={name}
          autoFocus
          placeholder="目录名"
          onChange={(event) => setName(event.target.value)}
          onPressEnter={submitDialog}
        />
        <div className={styles.dialogHint}>
          {dialog?.mode === 'create'
            ? `将创建在：${dialog.path || '顶层'}`
            : `位置不变：${dialog ? parentOf(dialog.path) || '顶层' : ''}`}
        </div>
      </Modal>
    </div>
  )
}
