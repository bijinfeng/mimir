import { confirmDanger } from '../confirm-danger'
import { UploadPanel } from '../UploadPanel'
import { useUploadStyles } from '../capture/upload-styles'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { App, Button, Dropdown, Empty, Input, Modal, Segmented, Skeleton, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import {
  Copy,
  ChevronDown,
  ChevronRight,
  Download,
  Ellipsis,
  Eye,
  FilePenLine,
  FilePlus2,
  FileText,
  FolderPlus,
  FolderUp,
  Globe,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  FILE_MAX_BYTES,
  formatBytes,
  parseTargetFor,
  type DocumentSummary,
  type FolderNode,
} from '@mimir/shared'
import { StatusBadge } from '../DocumentBadges'
import { KnowledgeBaseCreateModal } from '../KnowledgeBaseCreateModal'
import { LoadError } from '../LoadError'
import {
  excerptText,
  formatDate,
  formatLibraryRowDetail,
  kindLabel,
  readLibraryLayout,
  scopeParams,
  writeLibraryLayout,
  type LibraryLayout,
} from '../list-helpers'
import { FolderGlyph } from '../nav/folder-icons'
import { joinPath, parentOf } from '../nav/folder-ops'
import { api } from '../../lib/api'
import { useAppShell } from '../../lib/app-shell-context'
import { useScrolled } from '../../lib/use-scrolled'
import { useUnsaved } from '../../lib/unsaved'
import { useNarrowViewport } from '../../lib/nav-collapse'
import { useStyles } from './LibraryView.style'
import descriptionIcon from './material-symbols-rounded/description.svg?url'
import tableChartIcon from './material-symbols-rounded/table_chart.svg?url'
import slideshowIcon from './material-symbols-rounded/slideshow.svg?url'
import pdfIcon from './material-symbols-rounded/picture_as_pdf.svg?url'
import codeIcon from './material-symbols-rounded/code.svg?url'
import notesIcon from './material-symbols-rounded/notes.svg?url'
import imageIcon from './material-symbols-rounded/image.svg?url'
import audioIcon from './material-symbols-rounded/audio_file.svg?url'
import videoIcon from './material-symbols-rounded/video_file.svg?url'
import archiveIcon from './material-symbols-rounded/folder_zip.svg?url'
import draftIcon from './material-symbols-rounded/draft.svg?url'
import articleIcon from './material-symbols-rounded/article.svg?url'

/**
 * 知识库页：文档模式的**浏览态主区**（URL 无 `id` 时，D-079）。
 *
 * ## 「全部文档」页退役（用户拍板）
 *
 * 内容都住在知识库里，`scope=all` 不再是一个页面：进 `/docs` 时这里
 * 把它**重定向到第一个知识库**；一个知识库都没有时给创建引导。
 * 标签视图（`scope=tag:x`）保留——它是横切筛选，不是容器。
 *
 * ## 版式（对齐用户给的目标稿）
 *
 * 头部是知识库自己的身份证：名称、描述、ID 与创建者；下面是工具条
 * （计数 + 卡片/列表 + 新建文件夹/新建文件/添加文档），再下面是
 * 「文档」区（文件夹卡片在前、文档卡片在后）。
 *
 * ## 「添加文档」（目标稿的按钮交互）
 *
 * 一枚主按钮，点开是四个动作：上传文件 / 上传文件夹 / 网页抓取 /
 * 直接编辑。四条路都**带当前目录**——从知识库页收进来的内容落在这个
 * 知识库里，不是又一次「先入库再说」（写入端见 `noteCreateSchema.folder`
 * / `captureInputSchema.folder` / multipart 的 `folder` 字段）。
 *
 * ## 页面级拖放上传
 *
 * 目标稿写着「可直接拖到本页上传」，所以拖放区是**整页**而不只是一个
 * 虚线盒子。拖放只在知识库视图生效（标签视图没有可落的目录）。
 */
export function LibraryView({ scope }: { scope: string }) {
  const { styles } = useStyles()
  const { styles: captureStyles } = useUploadStyles()
  const narrowViewport = useNarrowViewport()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { openDocument, openCapture, requestNewNoteFocus, claimUploadBatch, releaseUploadBatch } =
    useAppShell()
  const { runGuarded } = useUnsaved()
  const { message, modal } = App.useApp()

  /** 惰性初始化只读一次 localStorage；之后读的都是 state（与折叠偏好同型） */
  const [layout, setLayout] = useState<LibraryLayout>(readLibraryLayout)

  const foldersQuery = useQuery({ queryKey: ['folders'], queryFn: api.folders.list })

  const folderPath = scope.startsWith('folder:') ? scope.slice('folder:'.length) : null
  const tagName = scope.startsWith('tag:') ? scope.slice('tag:'.length) : null
  const segments = folderPath ? folderPath.split('/') : []

  /** 当前目录节点（在树里按完整路径找）。找不到 = 链接指向的目录已不存在 */
  const currentNode = folderPath
    ? findFolder(foldersQuery.data?.items ?? [], folderPath)
    : undefined

  const listQuery = useQuery({
    queryKey: ['documents', scope],
    queryFn: () => api.documents.list({ ...scopeParams(scope), limit: 100 }),
    placeholderData: keepPreviousData,
  })

  const items = listQuery.data?.items ?? []
  const subFolders = currentNode?.children ?? []

  const open = (id: string) => runGuarded(() => openDocument(id))
  const goFolder = (path: string) =>
    runGuarded(() => void navigate({ to: '/docs', search: { scope: `folder:${path}` } }))

  /* ── 「全部文档」不再是页面：落到第一个知识库 ───────────── */
  const firstPath = foldersQuery.data?.items[0]?.path
  useEffect(() => {
    if (scope !== 'all') return
    if (!firstPath) return
    void navigate({ to: '/docs', search: { scope: `folder:${firstPath}` }, replace: true })
  }, [scope, firstPath, navigate])

  /* ── 工具条与动作 ─────────────────────────────────────── */
  const switchLayout = (next: LibraryLayout) => {
    setLayout(next)
    writeLibraryLayout(next)
  }

  const invalidateList = () => {
    void queryClient.invalidateQueries({ queryKey: ['documents'] })
    void queryClient.invalidateQueries({ queryKey: ['folders'] })
    void queryClient.invalidateQueries({ queryKey: ['counts'] })
  }

  const createNote = async () => {
    try {
      const created = await api.documents.createNote({
        title: '未命名笔记',
        body: '',
        tags: [],
        ...(folderPath ? { folder: folderPath } : {}),
      })
      requestNewNoteFocus(created.id)
      open(created.id)
    } catch {
      message.error('新建文件失败')
    }
  }

  const confirmDelete = (doc: DocumentSummary) => {
    confirmDanger(modal, {
      title: `删除《${doc.title}》？`,
      content:
        doc.kind === 'file'
          ? '不可撤销：记录与原件都会删除。'
          : '笔记将从知识库移除，文件保留在回收站。当前应用没有一键恢复入口。',
      onConfirm: async () => {
        await api.documents.remove(doc.id)
        invalidateList()
        void queryClient.invalidateQueries({ queryKey: ['recent-documents'] })
        message.success(doc.kind === 'note' ? '已移入回收站' : '已删除文件与原件')
      },
    })
  }

  /* 替换原件：一个隐藏的文件选择器 + 待替换的目标 id */
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null)
  const startReplace = (doc: DocumentSummary) => {
    setReplaceTarget(doc.id)
    replaceInputRef.current?.click()
  }

  const onAddMenu: MenuProps['onClick'] = ({ key }) => {
    if (key === 'upload-file') return openCapture({ tab: 'upload', folder: folderPath })
    if (key === 'upload-folder')
      return openCapture({ tab: 'upload', directory: true, folder: folderPath })
    if (key === 'capture-url') return openCapture({ tab: 'url', folder: folderPath })
    if (key === 'edit-now') return void createNote()
  }

  /* 新建文件夹：子目录表单只问名字（描述与图标是知识库自己的元信息） */
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  const createFolderMut = useMutation({
    mutationFn: (name: string) => api.folders.create(joinPath(folderPath ?? '', name)),
    onSuccess: () => {
      invalidateList()
      // 「新建」是文件夹这条线的统一动词（按钮「新建文件夹」、弹窗标题「新建文件夹」）；
      // 知识库那条线用「创建」（知识库是更重的实体，语义上创建而非新建）
      message.success('已新建文件夹')
      setFolderDialogOpen(false)
      setFolderName('')
    },
    onError: (error: unknown) => message.error(error instanceof Error ? error.message : '新建失败'),
  })

  /**
   * 子文件夹的改名与删除。
   *
   * 知识库页能建文件夹，就必须能管它——否则建错了只能去数据库里改。
   * 改名走的是同一个 `api.folders.move`（改名即移动，`services/folders.ts`），
   * 所以**当前正处在这个子树里时要把 scope 跟过去**，否则 URL 停在
   * 旧路径上、列表指向一个不存在的目录。
   *
   * ## 落点取被改名文件夹**自己**的父级，不是当前 scope 的父级
   *
   * 实测踩出来的（2026-10-01）：第一版写 `segments.slice(0, -1)`（当前所在
   * 目录的父级），于是站在「技术/后端」里重命名另一个子文件夹时，它会被
   * **搬进「后端」**——一次「改名」变成了一次「移动」（实测 URL 从
   * `folder:技术` 变成 `folder:技术/资料库X`，查库确认路径真被搬了）。
   * 目标路径属于被操作的对象，不属于当前视图：用 `parentOf(from)`。
   */
  const [renameTarget, setRenameTarget] = useState<FolderNode | null>(null)
  const renameTriggerRef = useRef<HTMLElement | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameFolderMut = useMutation({
    mutationFn: (input: { from: string; to: string }) => api.folders.move(input.from, input.to),
    onSuccess: (_data, vars) => {
      invalidateList()
      message.success('已重命名文件夹')
      closeRename()
      /* 当前所在位置跟着搬：自己在子树里（或就是它）时改写 scope */
      if (folderPath === vars.from) goFolder(vars.to)
      else if (folderPath?.startsWith(`${vars.from}/`))
        goFolder(`${vars.to}${folderPath.slice(vars.from.length)}`)
    },
    onError: (error: unknown) =>
      message.error(error instanceof Error ? error.message : '重命名失败'),
  })

  /** 提交重命名（弹窗的按钮与回车共用同一份校验） */
  const submitRename = () => {
    const trimmed = renameValue.trim()
    if (!renameTarget || !trimmed) return
    if (trimmed.includes('/')) {
      message.error('名称不能包含 /')
      return
    }
    if (trimmed === renameTarget.name) {
      closeRename()
      return
    }
    renameFolderMut.mutate({
      from: renameTarget.path,
      to: joinPath(parentOf(renameTarget.path), trimmed),
    })
  }

  const deleteFolderMut = useMutation({
    mutationFn: (path: string) => api.folders.remove(path),
    onSuccess: (data, path) => {
      invalidateList()
      message.success(
        data.cleared > 0 ? `已删除文件夹，${data.cleared} 篇文档移回库根` : '已删除文件夹',
      )
      if (folderPath === path || folderPath?.startsWith(`${path}/`)) {
        goFolder(segments.slice(0, path.split('/').length - 1).join('/'))
      }
    },
  })

  const confirmDeleteFolder = (folder: FolderNode) => {
    confirmDanger(modal, {
      title: `删除文件夹「${folder.name}」？`,
      content:
        folder.count > 0
          ? `里面的 ${folder.count} 篇文档会保留，指派清空后回到知识库根。`
          : '这是一个空文件夹，删除后不影响任何文档。',
      onConfirm: () => deleteFolderMut.mutateAsync(folder.path),
    })
  }

  const openRename = (folder: FolderNode) => {
    renameTriggerRef.current = document.activeElement as HTMLElement | null
    setRenameTarget(folder)
    setRenameValue(folder.name)
  }
  const closeRename = () => {
    setRenameTarget(null)
    requestAnimationFrame(() => {
      const trigger = renameTriggerRef.current
      if (trigger?.isConnected) trigger.focus()
      else bodyRef.current?.querySelector<HTMLElement>('button')?.focus()
    })
  }

  /* 页面级拖放上传 */
  const dropDepth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const canDrop = folderPath !== null
  const [droppedBatch, setDroppedBatch] = useState<{
    files: File[]
    folder: string
    nonce: number
  } | null>(null)
  const dropActive = useRef(false)
  const dropNonce = useRef(0)
  const uploadDropped = (files: File[]) => {
    if (
      folderPath === null ||
      !files.length ||
      dropActive.current ||
      (claimUploadBatch && !claimUploadBatch())
    )
      return
    dropActive.current = true
    setDroppedBatch({ files, folder: folderPath, nonce: ++dropNonce.current })
  }

  const isOnboard = scope === 'all' && foldersQuery.isSuccess && !firstPath

  /**
   * 知识库身份取自**顶层节点**，而不是当前所在的子目录。
   *
   * 头部那几行（名称 / 描述 / ID / 创建者）回答的是「我在哪个知识库」——
   * 进子文件夹时它不变，位置由「文档 / 子目录」那行面包屑表达
   * （用户拍板的版式）。ID 是知识库自己的，子目录没有 ID。
   */
  const kbRoot =
    segments.length > 0 ? findFolder(foldersQuery.data?.items ?? [], segments[0]!) : undefined
  const isStaleFolder =
    folderPath !== null &&
    foldersQuery.isSuccess &&
    (foldersQuery.data?.items.length ?? 0) > 0 &&
    !kbRoot

  const kbTitle = kbRoot?.name ?? segments[0] ?? ''
  const kbDesc = kbRoot?.description ?? ''

  /* 固定头部与滚动内容之间那条界线随滚动显形（D-070），开关挂在列表的滚动容器上 */
  const bodyRef = useRef<HTMLDivElement>(null)
  const bodyScrolled = useScrolled(bodyRef)

  const copyCode = async () => {
    if (!kbRoot?.code) return
    try {
      await navigator.clipboard.writeText(kbRoot.code)
      message.success('已复制知识库 ID')
    } catch {
      message.error('复制失败，请手动选中复制')
    }
  }

  /* ── 引导：一个知识库都没有 ──────────────────────────── */
  if (isOnboard) {
    return <OnboardCreate />
  }

  const showKbChrome = folderPath !== null
  const showSectionHint = folderPath !== null
  const hasFailedDocuments = items.some((doc) => doc.status === 'failed')

  const layoutControl = (
    <Segmented
      className={styles.layoutSwitch}
      value={layout}
      onChange={(value) => switchLayout(value as LibraryLayout)}
      options={[
        { value: 'list', icon: <List size={16} />, label: '列表' },
        { value: 'card', icon: <LayoutGrid size={16} />, label: '卡片' },
      ]}
    />
  )

  return (
    <div
      className={styles.page}
      onDragEnter={(event) => {
        if (!canDrop || !event.dataTransfer.types.includes('Files')) return
        dropDepth.current += 1
        setDragging(true)
      }}
      onDragLeave={() => {
        if (!canDrop) return
        dropDepth.current = Math.max(0, dropDepth.current - 1)
        if (dropDepth.current === 0) setDragging(false)
      }}
      onDragOver={(event) => {
        if (!canDrop || !event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(event) => {
        if (!canDrop || !event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        dropDepth.current = 0
        setDragging(false)
        const files = Array.from(event.dataTransfer.files)
        if (files.length > 0) uploadDropped(files)
      }}
    >
      {dragging && (
        <div className={styles.dropOverlay}>
          <span>松开即上传到当前知识库</span>
          <span>{folderPath}</span>
        </div>
      )}
      {droppedBatch && (
        <section className={captureStyles.integrated} aria-label="文件导入">
          <div className={captureStyles.integratedHeading}>
            <strong>文件导入</strong>
            <span>{droppedBatch.folder}</span>
          </div>
          <UploadPanel
            key={droppedBatch.nonce}
            inline
            initialFiles={droppedBatch.files}
            folder={droppedBatch.folder}
            onUploaded={() => {}}
            onComplete={invalidateList}
            releaseBatch={releaseUploadBatch}
            onBusyChange={(value) => {
              dropActive.current = value
            }}
            onCleared={() => setDroppedBatch(null)}
          />
        </section>
      )}

      {showKbChrome && (
        <div className={styles.topBar} aria-label="知识库位置">
          <span>知识库</span>
          <ChevronRight size={14} aria-hidden />
          <span className={styles.topBarCurrent}>{kbTitle}</span>
        </div>
      )}
      <div className={styles.head}>
        {showKbChrome ? (
          <>
            <h1 className={styles.kbTitle} title={kbTitle}>
              {kbTitle}
            </h1>
            {kbDesc && <p className={styles.kbDesc}>{kbDesc}</p>}
            <div className={styles.metaRow}>
              <span>{listQuery.isLoading ? '正在读取文档' : `${items.length} 个文档`}</span>
              {/* ID 整块可点，悬停时提示复制动作。 */}
              {kbRoot?.code && (
                <Tooltip title="点击复制知识库 ID">
                  <Button
                    type="text"
                    size="small"
                    className={styles.idChip}
                    aria-label={`知识库 ID ${kbRoot.code}，点击复制`}
                    onClick={() => void copyCode()}
                  >
                    <span className={styles.idChipInner}>
                      <span>知识库 ID：</span>
                      <span className={`kb-id-code ${styles.idCode}`}>{kbRoot.code}</span>
                      <Copy size={14} className={`kb-id-icon ${styles.idIcon}`} />
                    </span>
                  </Button>
                </Tooltip>
              )}
            </div>
          </>
        ) : (
          <h1 className={styles.kbTitle}>{tagName ? `#${tagName}` : '知识库'}</h1>
        )}

        <div className={styles.toolbar}>
          {showKbChrome && (
            <Dropdown trigger={['click']} menu={{ items: ADD_MENU, onClick: onAddMenu }}>
              <Button
                type="primary"
                className={styles.toolbarPrimary}
                data-capture-trigger
                icon={<Plus size={16} />}
              >
                添加文档
              </Button>
            </Dropdown>
          )}
          <div className={styles.toolbarActions}>
            {/* 带文字标签的 Segmented：纯图标档的可及名称问题（AGENTS 坑表）
                在这里靠「文字就在标签里」直接绕开 */}
            {showKbChrome &&
              (narrowViewport ? (
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      { key: 'file', label: '新建文件', icon: <FilePlus2 size={16} /> },
                      {
                        key: 'folder',
                        label: '新建文件夹',
                        icon: <FolderPlus size={16} />,
                        disabled: !currentNode,
                      },
                    ],
                    onClick: ({ key }) => {
                      if (key === 'file') void createNote()
                      if (key === 'folder') setFolderDialogOpen(true)
                    },
                  }}
                >
                  <Button icon={<ChevronDown size={15} />} iconPlacement="end">
                    新建
                  </Button>
                </Dropdown>
              ) : (
                <>
                  <Button icon={<FilePlus2 size={16} />} onClick={() => void createNote()}>
                    新建文件
                  </Button>
                  <Button
                    icon={<FolderPlus size={16} />}
                    onClick={() => setFolderDialogOpen(true)}
                    disabled={!currentNode}
                  >
                    新建文件夹
                  </Button>
                </>
              ))}
          </div>
          {!narrowViewport && layoutControl}
        </div>

        {/*
         * 「文档 / 子目录 / …」这一行。
         *
         * 面包屑**不在头部**（用户拍板的版式）：头部是知识库的身份，进子
         * 目录它不变；位置感由这一行表达——「文档」是知识库根，点它回去，
         * 中间每一段可点，末段是当前所在。右侧的格式提示跟着一起走。
         */}
        <div className={styles.sectionHead} data-scrolled={bodyScrolled || undefined}>
          <span className={styles.sectionLabel} aria-label={`当前目录：${folderPath ?? '知识库'}`}>
            {folderPath ? (
              <>
                <button
                  type="button"
                  className={styles.crumbLink}
                  onClick={() => goFolder(segments[0]!)}
                >
                  文档
                </button>
                {segments.slice(1).map((name, index) => {
                  const path = segments.slice(0, index + 2).join('/')
                  const isLast = index === segments.length - 2
                  return (
                    <Fragment key={path}>
                      <span className={styles.crumbSep}>/</span>
                      {isLast ? (
                        <span>{name}</span>
                      ) : (
                        <button
                          type="button"
                          className={styles.crumbLink}
                          onClick={() => goFolder(path)}
                        >
                          {name}
                        </button>
                      )}
                    </Fragment>
                  )
                })}
              </>
            ) : (
              '文档'
            )}
          </span>
          {narrowViewport && layoutControl}
          {showSectionHint && !narrowViewport && (
            <span className={styles.sectionHint}>
              可拖入文件上传，单文件不超过 {formatBytes(FILE_MAX_BYTES)}
            </span>
          )}
        </div>
      </div>

      <div className={styles.body} ref={bodyRef}>
        {listQuery.isLoading || (folderPath !== null && foldersQuery.isLoading) ? (
          <div className={styles.loading}>
            <Skeleton active paragraph={{ rows: 5 }} title={false} />
          </div>
        ) : listQuery.isError || foldersQuery.isError ? (
          /* 失败必须先于「空」判断（见 LoadError 的说明）：把请求失败
             渲染成「这里还是空的」是界面在说谎——数据没丢，只是这次没取到 */
          <LoadError
            message="文档列表读取失败"
            onRetry={() => {
              void (listQuery.isError ? listQuery.refetch() : foldersQuery.refetch())
            }}
          />
        ) : isStaleFolder ? (
          <Empty
            className={styles.empty}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="这个知识库不存在（可能已被删除）"
          >
            <div className={styles.emptyActions}>
              <Button type="primary" onClick={() => goFolder(firstPath ?? '')}>
                返回知识库
              </Button>
            </div>
          </Empty>
        ) : items.length === 0 && subFolders.length === 0 ? (
          <Empty
            className={styles.empty}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span>
                这里还是空的
                <span className={styles.emptyHint}>拖文件到本页，或用右上角「添加文档」收进来</span>
              </span>
            }
          >
            {showKbChrome && (
              <div className={styles.emptyActions}>
                <Button
                  icon={<Upload size={16} />}
                  onClick={() => openCapture({ tab: 'upload', folder: folderPath })}
                >
                  上传文件
                </Button>
                <Button type="primary" onClick={() => void createNote()}>
                  直接编辑
                </Button>
              </div>
            )}
          </Empty>
        ) : layout === 'card' ? (
          <div className={styles.grid}>
            {subFolders.map((folder) => (
              <FolderCard
                key={folder.path}
                folder={folder}
                onOpen={() => goFolder(folder.path)}
                onRename={() => openRename(folder)}
                onDelete={() => confirmDeleteFolder(folder)}
              />
            ))}
            {items.map((doc) => (
              <DocCard
                key={doc.id}
                doc={doc}
                onOpen={() => open(doc.id)}
                onEdit={() => open(doc.id)}
                onReplace={() => startReplace(doc)}
                onDelete={() => confirmDelete(doc)}
                location={documentLocation(doc, folderPath)}
              />
            ))}
          </div>
        ) : (
          <div className={styles.list}>
            {/* 表头。`aria-hidden`：每行的可及名称已经是完整的一句话
                （「检索设计说明 PDF 1.4 KB 就绪 2026/09/29 12:54」），
                列标签对读屏是重复信息；它服务的是「用眼睛扫列」这件事 */}
            <div
              className={styles.listHead}
              data-has-status={hasFailedDocuments || undefined}
              aria-hidden="true"
            >
              <span />
              <span>名称</span>
              <span>详情</span>
              <span>状态</span>
              <span>更新时间</span>
            </div>
            {subFolders.map((folder) => (
              <div
                key={folder.path}
                className={`kb-row ${styles.row}`}
                data-has-status={hasFailedDocuments || undefined}
                onClick={() => goFolder(folder.path)}
              >
                <span className={styles.cardIcon}>
                  <FolderGlyph iconKey={folder.icon} size={16} />
                </span>
                <button
                  type="button"
                  className={styles.rowTitle}
                  onClick={(event) => {
                    event.stopPropagation()
                    goFolder(folder.path)
                  }}
                >
                  {folder.name}
                </button>
                <span className={styles.rowMeta}>{folder.count} 个文档</span>
                <span className={`kb-row-menu ${styles.rowMenuCell}`}>
                  <FolderRowMenu
                    name={folder.name}
                    onRename={() => openRename(folder)}
                    onDelete={() => confirmDeleteFolder(folder)}
                  />
                </span>
              </div>
            ))}
            {items.map((doc) => (
              <button
                key={doc.id}
                type="button"
                className={`kb-row ${styles.row}`}
                data-has-status={hasFailedDocuments || undefined}
                onClick={() => open(doc.id)}
              >
                <span className={styles.cardIcon}>{docIcon(doc)}</span>
                <span className={styles.rowTitle}>
                  <DocumentName doc={doc} />
                </span>
                <span
                  className={styles.rowMeta}
                  title={formatLibraryRowDetail(documentLocation(doc, folderPath), docMetaOf(doc))}
                >
                  {formatLibraryRowDetail(documentLocation(doc, folderPath), docMetaOf(doc))}
                </span>
                <span
                  className={styles.rowStatus}
                  data-failed={doc.status === 'failed' || undefined}
                >
                  <StatusBadge status={doc.status} />
                </span>
                <span className={styles.rowTime}>
                  {doc.updatedAt ? formatDate(doc.updatedAt) : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 替换原件的文件选择器：藏在页面里，一次只服务一个目标 */}
      <input
        ref={replaceInputRef}
        type="file"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          const target = replaceTarget
          setReplaceTarget(null)
          if (!file || !target) return
          try {
            await api.documents.replaceSource(target, file)
            invalidateList()
            message.success('已替换原件')
          } catch (error) {
            message.error(error instanceof Error ? error.message : '替换失败')
          }
        }}
      />

      {/* 新建文件夹（子目录） */}
      <Modal
        title="新建文件夹"
        open={folderDialogOpen}
        onOk={() => {
          const trimmed = folderName.trim()
          if (!trimmed) return
          if (trimmed.includes('/')) {
            message.error('名称不能包含 /')
            return
          }
          createFolderMut.mutate(trimmed)
        }}
        onCancel={() => {
          setFolderDialogOpen(false)
          setFolderName('')
        }}
        okText="创建"
        cancelText="取消"
        okButtonProps={{ disabled: folderName.trim() === '', loading: createFolderMut.isPending }}
        destroyOnHidden
      >
        <label className={styles.modalFieldLabel} htmlFor="folder-name">
          文件夹名称
        </label>
        <Input
          id="folder-name"
          autoFocus
          value={folderName}
          placeholder="如：参考资料"
          maxLength={60}
          onChange={(event) => setFolderName(event.target.value)}
          onPressEnter={() => {
            const trimmed = folderName.trim()
            if (trimmed && !trimmed.includes('/')) createFolderMut.mutate(trimmed)
          }}
        />
      </Modal>

      {/* 子文件夹改名。改名即移动（同一目录下换名字），当前位置跟着搬 */}
      <Modal
        title="重命名文件夹"
        open={renameTarget !== null}
        onOk={submitRename}
        onCancel={closeRename}
        okText="重命名"
        cancelText="取消"
        okButtonProps={{
          disabled: renameValue.trim() === '',
          loading: renameFolderMut.isPending,
        }}
        destroyOnHidden
      >
        <label className={styles.modalFieldLabel} htmlFor="folder-rename">
          文件夹名称
        </label>
        <Input
          id="folder-rename"
          autoFocus
          value={renameValue}
          maxLength={60}
          onChange={(event) => setRenameValue(event.target.value)}
          onPressEnter={submitRename}
        />
      </Modal>
    </div>
  )
}

/**
 * 「添加文档」菜单（目标稿的四个动作）。
 *
 * 放模块级：`items` 里带图标元素，每次渲染重建没有意义，而且菜单在
 * 整个应用生命周期里形状不变。
 */
const ADD_MENU: MenuProps['items'] = [
  { key: 'upload-file', icon: <Upload size={16} />, label: '上传文件' },
  { key: 'upload-folder', icon: <FolderUp size={16} />, label: '上传文件夹' },
  { key: 'capture-url', icon: <Globe size={16} />, label: '网页抓取' },
  { type: 'divider' },
  { key: 'edit-now', icon: <FilePenLine size={16} />, label: '直接编辑' },
]

/** 在目录树里按完整路径找节点（找不到返回 undefined） */
function findFolder(items: FolderNode[], path: string): FolderNode | undefined {
  for (const item of items) {
    if (item.path === path) return item
    const found = findFolder(item.children, path)
    if (found) return found
  }
  return undefined
}

/**
 * 卡片上的属性行。
 *
 * **不重复徽标里的信息**：格式（PDF / Excel…）已经在标题行的徽标上，
 * 这里给的是它回答不了的那一半——原件多大、这一篇里有什么。
 * 目标稿的属性行是「51.4 MB · 0 个分块」；分块数要等 M1 的切分做完，
 * 现在先如实给大小与摘要。
 */
function docMetaOf(doc: DocumentSummary): string {
  if (doc.kind === 'file') return doc.size === null ? '' : formatBytes(doc.size)
  return excerptText(doc)
}

function documentLocation(doc: DocumentSummary, currentFolder: string | null): string {
  if (!doc.folder) return '知识库根'
  if (!currentFolder) return doc.folder
  if (doc.folder === currentFolder) return '当前目录'
  return doc.folder.startsWith(`${currentFolder}/`)
    ? doc.folder.slice(currentFolder.length + 1)
    : doc.folder
}

/** 文件已有类型图形与后缀；只给笔记和网页等资料保留来源徽标。 */
export function chipOf(doc: DocumentSummary): string | null {
  return doc.kind === 'file' ? null : kindLabel(doc)
}

/** 这个文档能不能在站内编辑（决定「编辑」图标出不出现） */
function isEditable(doc: DocumentSummary): boolean {
  if (doc.kind === 'note') return true
  const target = parseTargetFor(doc.mime, displayDocumentTitle(doc))
  return target === 'docx' || target === 'xlsx' || target === 'pptx'
}

/** 标题是用户可改的；只在展示时补当前原件的扩展名，避免改名后重复拼接。 */
export function displayDocumentTitle(doc: DocumentSummary): string {
  if (doc.kind !== 'file' || !doc.fileExtension) return doc.title
  const suffix = `.${doc.fileExtension}`
  return doc.title.toLowerCase().endsWith(suffix.toLowerCase())
    ? doc.title
    : `${doc.title}${suffix}`
}

/** 窄列只省略主体，保留文件后缀供用户辨认类型。 */
function DocumentName({ doc }: { doc: DocumentSummary }) {
  const { styles } = useStyles()
  const fullName = displayDocumentTitle(doc)
  const suffixLength = doc.kind === 'file' && doc.fileExtension ? doc.fileExtension.length + 1 : 0
  return (
    <span className={styles.fileName} title={fullName}>
      <span className={styles.fileNameStem}>
        {suffixLength ? fullName.slice(0, -suffixLength) : fullName}
      </span>
      {suffixLength > 0 && (
        <span className={styles.fileNameExtension}>{fullName.slice(-suffixLength)}</span>
      )}
    </span>
  )
}

const FILE_ICONS = {
  document: descriptionIcon,
  table: tableChartIcon,
  slides: slideshowIcon,
  pdf: pdfIcon,
  code: codeIcon,
  note: notesIcon,
  image: imageIcon,
  audio: audioIcon,
  video: videoIcon,
  archive: archiveIcon,
  unknown: draftIcon,
  text: articleIcon,
} as const

type FileIconName = keyof typeof FILE_ICONS
type FileIconTone = 'neutral' | 'document' | 'table' | 'slides' | 'pdf' | 'code' | 'media'

function fileGlyph(name: FileIconName, tone: FileIconTone = 'neutral'): ReactNode {
  const url = `url("${FILE_ICONS[name]}")`
  return (
    <span
      data-file-icon={name}
      data-file-tone={tone}
      aria-hidden="true"
      style={{ maskImage: url, WebkitMaskImage: url }}
    />
  )
}

/** 格式各有图形，类别色来自主题 token；列表与卡片共用。 */
export function docIcon(doc: DocumentSummary): ReactNode {
  if (doc.kind === 'note') return fileGlyph('note')
  if (doc.kind !== 'file') return <FileText size={20} />
  const extension = doc.fileExtension?.toLowerCase() ?? ''
  const mime = (doc.mime ?? '').toLowerCase()
  const target = parseTargetFor(doc.mime, displayDocumentTitle(doc))
  if (extension === 'pdf' || mime === 'application/pdf') return fileGlyph('pdf', 'pdf')
  if (['doc', 'docx', 'odt', 'rtf'].includes(extension) || target === 'docx')
    return fileGlyph('document', 'document')
  if (['xls', 'xlsx', 'ods', 'csv'].includes(extension) || target === 'xlsx')
    return fileGlyph('table', 'table')
  if (['ppt', 'pptx', 'odp'].includes(extension) || target === 'pptx')
    return fileGlyph('slides', 'slides')
  if (['html', 'htm'].includes(extension) || target === 'html') return fileGlyph('code', 'code')
  if (extension === 'txt' || (!extension && mime === 'text/plain')) return fileGlyph('text')
  if (
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(extension) ||
    mime.startsWith('image/')
  )
    return fileGlyph('image', 'media')
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(extension) || mime.startsWith('audio/'))
    return fileGlyph('audio', 'media')
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(extension) || mime.startsWith('video/'))
    return fileGlyph('video', 'media')
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension) || mime === 'application/zip')
    return fileGlyph('archive')
  if (
    [
      'js',
      'ts',
      'tsx',
      'jsx',
      'py',
      'go',
      'rs',
      'java',
      'c',
      'cpp',
      'sh',
      'sql',
      'css',
      'json',
      'xml',
    ].includes(extension)
  )
    return fileGlyph('code', 'code')
  return fileGlyph('unknown')
}

/**
 * 文件夹卡片（知识库下的子目录）。
 *
 * 放在网格里与文档卡片同形——「这里有什么」一眼扫完，点进去是一层
 * 更窄的 scope（面包屑会出现在「文档」那一行）。悬停显形的 ⋯ 给
 * 改名与删除：知识库页能建文件夹，就得能管它。
 */
function FolderCard({
  folder,
  onOpen,
  onRename,
  onDelete,
}: {
  folder: FolderNode
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const { styles } = useStyles()
  return (
    <div className={`kb-card ${styles.card}`} onClick={onOpen}>
      <span className={styles.cardTop}>
        <span className={styles.cardIcon}>
          <FolderGlyph iconKey={folder.icon} size={16} />
        </span>
        <button
          type="button"
          className={styles.cardTitle}
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
        >
          {folder.name}
        </button>
        <span className={styles.chip}>文件夹</span>
        <FolderRowMenu name={folder.name} onRename={onRename} onDelete={onDelete} />
      </span>
      <span className={styles.cardMeta}>{folder.count} 个文档</span>
    </div>
  )
}

/**
 * 子文件夹的悬停动作菜单（卡片与行条共用）。模块级：动作固定、不依赖节点
 *
 * ## 包裹层的 `stopPropagation` 不是可选的
 *
 * antd 的 Dropdown 浮层 portal 到 body，但 **React 事件沿组件树冒泡**——
 * 点菜单项时事件会一路冒到 `FolderRowMenu` 的宿主卡片 / 行条，
 * 触发它自己的 `onClick`（卡片 = 进文件夹）。实测：点「重命名」会先跳进
 * 那个文件夹，再弹出重命名框（URL 从 `folder:技术` 变成
 * `folder:技术/资料库`）。在动作条的包裹层拦一次，菜单里的点击就到此为止。
 */
function FolderRowMenu({
  name,
  onRename,
  onDelete,
}: {
  name: string
  onRename: () => void
  onDelete: () => void
}) {
  const { styles } = useStyles()
  return (
    <span className={styles.cardActions} onClick={(event) => event.stopPropagation()}>
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        menu={{
          items: FOLDER_MENU,
          onClick: ({ key }) => {
            if (key === 'rename') onRename()
            if (key === 'remove') onDelete()
          },
        }}
      >
        <Button
          type="text"
          size="small"
          aria-label={`文件夹 ${name} 的操作`}
          icon={<Ellipsis size={16} />}
          onClick={(event) => event.stopPropagation()}
        />
      </Dropdown>
    </span>
  )
}

/** 文件夹动作（模块级常量，菜单形状不随节点变） */
const FOLDER_MENU: MenuProps['items'] = [
  { key: 'rename', label: '重命名' },
  { type: 'divider' },
  { key: 'remove', label: '删除', danger: true },
]

interface DocCardProps {
  doc: DocumentSummary
  location: string
  onOpen: () => void
  onEdit: () => void
  onReplace: () => void
  onDelete: () => void
}

/**
 * 文档卡片（目标稿的形态）。
 *
 * ## 为什么卡片本体不是 `role="button"`
 *
 * 卡片里要放动作按钮（打开 / 下载 / 编辑 / 替换 / 删除），而
 * **交互角色不能嵌套**：`role="button"` 的外层会把内层按钮的文本吸进
 * 自己的可及名称里，读屏把整张卡念成一长串（实测外层与内层同时命中
 * 「删除 未命名笔记」，`getByRole` 直接报 strict 冲突）。
 *
 * 所以改成：卡片本体是普通盒子，**标题本身是可聚焦的按钮**（键盘的
 * 打开入口），鼠标点卡片任意位置也能打开；动作按钮是它的兄弟。
 * 这与文件管理器（Finder / Google Drive）的卡片同构。
 */
export function DocCard({ doc, location, onOpen, onEdit, onReplace, onDelete }: DocCardProps) {
  const { styles } = useStyles()
  const chip = chipOf(doc)
  const isFile = doc.kind === 'file'

  return (
    <div className={`kb-card ${styles.card}`} onClick={onOpen}>
      <span className={styles.cardTop}>
        <span className={styles.cardIcon}>{docIcon(doc)}</span>
        <button
          type="button"
          className={styles.cardTitle}
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
        >
          <DocumentName doc={doc} />
        </button>
        {chip && <span className={styles.chip}>{chip}</span>}
        {/* 动作条统一拦一次冒泡（每个按钮自己也拦）：卡片本体是「打开」，
            这里任何一个动作都不该顺带把文档打开 */}
        <span className={styles.cardActions} onClick={(event) => event.stopPropagation()}>
          <Button
            className={styles.cardActionDirect}
            type="text"
            size="small"
            aria-label={`打开 ${doc.title}`}
            icon={<Eye size={16} />}
            onClick={(event) => {
              event.stopPropagation()
              onOpen()
            }}
          />
          {isFile && (
            <Button
              className={styles.cardActionDirect}
              type="text"
              size="small"
              aria-label={`下载 ${doc.title}`}
              icon={<Download size={16} />}
              href={api.documents.sourceUrl(doc.id, { download: true })}
              onClick={(event) => event.stopPropagation()}
            />
          )}
          {isEditable(doc) && (
            <Button
              className={styles.cardActionDirect}
              type="text"
              size="small"
              aria-label={`编辑 ${doc.title}`}
              icon={<Pencil size={16} />}
              onClick={(event) => {
                event.stopPropagation()
                onEdit()
              }}
            />
          )}
          {isFile && (
            <Button
              className={styles.cardActionDirect}
              type="text"
              size="small"
              aria-label={`替换原件 ${doc.title}`}
              icon={<RefreshCw size={16} />}
              onClick={(event) => {
                event.stopPropagation()
                onReplace()
              }}
            />
          )}
          <Button
            className={styles.cardActionDirect}
            type="text"
            size="small"
            aria-label={`删除 ${doc.title}`}
            icon={<Trash2 size={16} />}
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
          />
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'open', label: '打开', onClick: onOpen },
                ...(isEditable(doc) ? [{ key: 'edit', label: '编辑', onClick: onEdit }] : []),
                ...(isFile
                  ? [
                      {
                        key: 'download',
                        label: (
                          <a href={api.documents.sourceUrl(doc.id, { download: true })}>下载原件</a>
                        ),
                      },
                      { key: 'replace', label: '替换原件', onClick: onReplace },
                    ]
                  : []),
                { type: 'divider' as const },
                { key: 'remove', label: '删除', danger: true, onClick: onDelete },
              ],
            }}
          >
            <Button
              className={styles.cardActionMore}
              type="text"
              size="small"
              aria-label={`${doc.title} 的更多操作`}
              icon={<Ellipsis size={16} />}
              onClick={(event) => event.stopPropagation()}
            />
          </Dropdown>
        </span>
      </span>
      <span className={styles.cardMeta} title={doc.folder ?? '知识库根'}>
        {location}
        {docMetaOf(doc) ? ` · ${docMetaOf(doc)}` : ''}
      </span>
      <span className={styles.cardFoot}>
        <StatusBadge status={doc.status} showReady quiet />
        <span className={styles.cardTime}>{doc.updatedAt ? formatDate(doc.updatedAt) : ''}</span>
      </span>
    </div>
  )
}

/** 一个知识库都没有时的引导（scope=all 且 folders 为空） */
function OnboardCreate() {
  const { styles } = useStyles()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  return (
    <div className={styles.page}>
      <div className={styles.onboard}>
        <h1 className={styles.onboardTitle}>先创建一个知识库</h1>
        <p className={styles.onboardText}>
          知识库是内容的容器：文档、网页、笔记都收在里面。
          <br />
          还没有知识库时，「全部文档」也不存在——所有内容都要有归属。
        </p>
        <Button type="primary" size="large" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
          创建知识库
        </Button>
      </div>
      <KnowledgeBaseCreateModal
        open={open}
        onCancel={() => setOpen(false)}
        onCreated={(path) => {
          setOpen(false)
          void navigate({ to: '/docs', search: { scope: `folder:${path}` }, replace: true })
        }}
      />
    </div>
  )
}
