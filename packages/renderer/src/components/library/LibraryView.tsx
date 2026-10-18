import { confirmDanger } from '../confirm-danger'
import { UploadPanel } from '../UploadPanel'
import { useUploadStyles } from '../capture/upload-styles'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { App, Button, Dropdown, Empty, Segmented, Skeleton, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import {
  Copy,
  Download,
  Eye,
  Pencil,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  FilePenLine,
  FilePlus2,
  Folder,
  FolderPlus,
  FolderUp,
  Globe,
  LayoutGrid,
  List,
  Plus,
  Upload,
} from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  folderUpdateRecoverySchema,
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
import { api, ApiRequestError } from '../../lib/api'
import { useAppShell } from '../../lib/app-shell-context'
import { useScrolled } from '../../lib/use-scrolled'
import { useUnsaved } from '../../lib/unsaved'
import { useStyles } from './LibraryView.style'
import { displayDocumentTitle } from './document-name'
import { FileFormatIcon } from './FileFormatIcon'
import { FolderNameModal } from './FolderNameModal'
import { SourceReplaceDialog } from './SourceReplaceDialog'
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
  const [narrowViewport, setNarrowViewport] = useState(false)
  const measurePage = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const measure = () => {
      if (node.clientWidth > 0) setNarrowViewport(node.clientWidth <= 700)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    measure()
    return () => observer.disconnect()
  }, [])
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { openDocument, openCapture, requestNewNoteFocus, claimUploadBatch, releaseUploadBatch } =
    useAppShell()
  const { runGuarded } = useUnsaved()
  const { message, modal } = App.useApp()

  /** 惰性初始化只读一次 localStorage；之后读的都是 state（与折叠偏好同型） */
  const [createKbOpen, setCreateKbOpen] = useState(false)
  const [fullPath, setFullPath] = useState(false)
  const createFlight = useRef(false)
  const [creatingNote, setCreatingNote] = useState(false)
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
    queryFn: async () => ({
      ...(await api.documents.list({ ...scopeParams(scope), limit: 100 })),
      sourceScope: scope,
    }),
    placeholderData: (previous, previousQuery) =>
      previous ? { ...previous, sourceScope: String(previousQuery?.queryKey[1] ?? '') } : undefined,
  })

  const items = listQuery.data?.items ?? []
  const sourceScope = listQuery.isPlaceholderData ? (listQuery.data?.sourceScope ?? '') : scope
  const sourceFolder = sourceScope.startsWith('folder:') ? sourceScope.slice(7) : null
  const subFolders = sourceFolder
    ? (findFolder(foldersQuery.data?.items ?? [], sourceFolder)?.children ?? [])
    : []

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
    void queryClient.invalidateQueries({ queryKey: ['document'] })
    void queryClient.invalidateQueries({ queryKey: ['recent-documents'] })
  }

  const createNote = async () => {
    if (createFlight.current) return
    createFlight.current = true
    setCreatingNote(true)
    try {
      const created = await api.documents.createNote({
        title: '未命名笔记',
        body: '',
        tags: [],
        ...(folderPath ? { folder: folderPath } : {}),
      })
      invalidateList()
      requestNewNoteFocus(created.id)
      open(created.id)
    } catch {
      message.error('新建文件失败')
    } finally {
      createFlight.current = false
      setCreatingNote(false)
    }
  }

  const confirmDelete = (doc: DocumentSummary) => {
    confirmDanger(modal, {
      title: `删除《${doc.title}》？`,
      content:
        doc.kind === 'file'
          ? '不可撤销：记录与原件都会删除。'
          : doc.kind === 'note'
            ? '笔记将从知识库移除，文件保留在回收站。当前应用没有一键恢复入口。'
            : '这条资料记录及正文将被删除。当前应用没有一键恢复入口。',
      onConfirm: async () => {
        await api.documents.remove(doc.id)
        invalidateList()
        void queryClient.invalidateQueries({ queryKey: ['recent-documents'] })
        message.success(
          doc.kind === 'note'
            ? '已移入回收站'
            : doc.kind === 'file'
              ? '已删除文件与原件'
              : '已删除资料',
        )
      },
    })
  }

  const operationTrigger = useRef<HTMLElement | null>(null)
  const [replacement, setReplacement] = useState<DocumentSummary | null>(null)
  const restoreOperationFocus = () => {
    requestAnimationFrame(() => {
      if (operationTrigger.current?.isConnected) operationTrigger.current.focus()
      else bodyRef.current?.querySelector<HTMLElement>('button')?.focus()
    })
  }
  const startReplace = (doc: DocumentSummary) => {
    if (replacement) return
    operationTrigger.current = document.activeElement as HTMLElement | null
    setReplacement(doc)
  }

  const onAddMenu: MenuProps['onClick'] = ({ key }) => {
    if (key === 'upload-file') return openCapture({ tab: 'upload', folder: folderPath })
    if (key === 'upload-folder')
      return openCapture({ tab: 'upload', directory: true, folder: folderPath })
    if (key === 'capture-url') return openCapture({ tab: 'url', folder: folderPath })
    if (key === 'edit-now') return void createNote()
  }

  const [folderOperation, setFolderOperation] = useState<{
    target?: FolderNode
    parent: string
  } | null>(null)
  const openCreateFolder = () => {
    operationTrigger.current = document.activeElement as HTMLElement | null
    setFolderOperation({ parent: folderPath ?? '' })
  }
  const openRename = (folder: FolderNode) => {
    operationTrigger.current = document.activeElement as HTMLElement | null
    setFolderOperation({ target: folder, parent: parentOf(folder.path) })
  }
  const submitFolderName = async (name: string) => {
    if (!folderOperation) return
    const source = folderOperation.target
    if (source) {
      const next = joinPath(parentOf(source.path), name)
      try {
        await api.folders.move(source.path, next)
      } catch (cause) {
        const recovery = folderUpdateRecoverySchema.safeParse(
          cause instanceof ApiRequestError &&
            cause.details &&
            typeof cause.details === 'object' &&
            'recovery' in cause.details
            ? cause.details.recovery
            : undefined,
        )
        let safe = false
        try {
          const refreshed = await api.folders.list()
          queryClient.setQueryData(['folders'], refreshed)
          const resolved = source.code
            ? findFolderByCode(refreshed.items, source.code)
            : findFolder(refreshed.items, source.path)
          safe = Boolean(
            resolved &&
            resolved.path === source.path &&
            (!source.code || resolved.code === source.code),
          )
        } catch {
          /* A failed reconciliation cannot authorize another write. */
        }
        if (
          !safe ||
          (recovery.success && !recovery.data.retrySafe) ||
          (cause instanceof ApiRequestError &&
            cause.code === 'FOLDER_UPDATE_FAILED' &&
            !recovery.success)
        ) {
          const blocked = new Error(
            `${cause instanceof Error ? cause.message : '重命名失败'}。暂时无法确认目录状态，请关闭后重新读取目录再操作。`,
          )
          Object.assign(blocked, { retryBlocked: true })
          throw blocked
        }
        throw cause
      }
      if (folderPath === source.path) goFolder(next)
      else if (folderPath?.startsWith(`${source.path}/`))
        goFolder(`${next}${folderPath.slice(source.path.length)}`)
    } else await api.folders.create(joinPath(folderOperation.parent, name))
    invalidateList()
    message.success(source ? '已重命名文件夹' : '已新建文件夹')
  }

  const deleteFolderMut = useMutation({
    mutationFn: (path: string) => api.folders.remove(path),
    onSuccess: (data, path) => {
      invalidateList()
      message.success(
        data.cleared > 0 ? `已删除文件夹，${data.cleared} 篇文档的目录归属已清空` : '已删除文件夹',
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
          ? `里面的 ${folder.count} 篇文档会保留，但目录归属将被清空，不再显示在当前知识库中。`
          : '这是一个空文件夹，删除后不影响任何文档。',
      onConfirm: () => deleteFolderMut.mutateAsync(folder.path),
    })
  }

  /* 页面级拖放上传 */
  const dropDepth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const canDrop = folderPath !== null && Boolean(currentNode)
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
  const isStaleFolder = folderPath !== null && foldersQuery.isSuccess && !kbRoot

  const isMissingChild =
    folderPath !== null && foldersQuery.isSuccess && Boolean(kbRoot) && !currentNode

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
      ref={measurePage}
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
            {kbDesc && <LibraryDescription key={kbRoot?.code ?? segments[0]} text={kbDesc} />}
            <div className={styles.metaRow}>
              <span>
                {listQuery.isLoading
                  ? '正在读取文档'
                  : items.length >= 100
                    ? `已显示 ${items.length} 个文档`
                    : `${items.length} 个文档`}
              </span>
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
          <h1 className={styles.kbTitle} title={tagName ? `#${tagName}` : '知识库'}>
            {tagName ? `#${tagName}` : '知识库'}
          </h1>
        )}

        <div className={styles.toolbar}>
          {showKbChrome && (
            <Dropdown
              trigger={['click']}
              menu={{ items: ADD_MENU, onClick: onAddMenu, className: styles.menu }}
            >
              <Button
                type="primary"
                className={styles.toolbarPrimary}
                data-capture-trigger
                disabled={!currentNode}
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
                    className: styles.menu,
                    items: [
                      {
                        key: 'file',
                        label: '新建文件',
                        icon: <FilePlus2 size={16} />,
                        disabled: !currentNode || creatingNote,
                      },
                      {
                        key: 'folder',
                        label: '新建文件夹',
                        icon: <FolderPlus size={16} />,
                        disabled: !currentNode,
                      },
                    ],
                    onClick: ({ key }) => {
                      if (key === 'file') void createNote()
                      if (key === 'folder') openCreateFolder()
                    },
                  }}
                >
                  <Button icon={<ChevronDown size={15} />} iconPlacement="end">
                    新建
                  </Button>
                </Dropdown>
              ) : (
                <>
                  <Button
                    icon={<FilePlus2 size={16} />}
                    loading={creatingNote}
                    disabled={!currentNode}
                    onClick={() => void createNote()}
                  >
                    新建文件
                  </Button>
                  <Button
                    icon={<FolderPlus size={16} />}
                    onClick={openCreateFolder}
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
          <nav
            className={styles.sectionLabel}
            data-expanded={fullPath || undefined}
            aria-label={`当前目录：${folderPath ?? '知识库'}`}
          >
            {folderPath ? (
              <>
                <button
                  type="button"
                  className={styles.crumbLink}
                  onClick={() => goFolder(segments[0]!)}
                >
                  文档
                </button>
                {segments.length > 3 && !fullPath ? (
                  <>
                    <span className={styles.crumbSep}>/</span>
                    <button
                      type="button"
                      className={styles.crumbLink}
                      aria-label="展开完整目录路径"
                      onClick={() => setFullPath(true)}
                    >
                      …
                    </button>
                    <span className={styles.crumbSep}>/</span>
                    <span title={folderPath}>{segments.at(-1)}</span>
                  </>
                ) : (
                  segments.slice(1).map((name, index) => {
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
                  })
                )}
              </>
            ) : (
              '文档'
            )}
          </nav>
          {narrowViewport && layoutControl}
          {showSectionHint && !narrowViewport && (
            <span className={styles.sectionHint}>含当前目录及其下级文档</span>
          )}
        </div>
      </div>

      <div className={styles.body} ref={bodyRef}>
        {listQuery.isPlaceholderData && (
          <div role="status" className={styles.notice}>
            正在读取「{folderPath ?? (tagName ? `#${tagName}` : '知识库')}」；以下内容仍来自「
            {listQuery.data?.sourceScope.replace(/^(folder|tag):/, '')}」。
          </div>
        )}
        {items.length >= 100 && (
          <div className={styles.notice}>当前最多显示最近更新的 100 个文档，包含下级目录。</div>
        )}
        {folderPath !== null && foldersQuery.isError && foldersQuery.data && (
          <div role="status" className={styles.notice}>
            目录刷新失败，保留上一次读取的目录。
            <Button type="text" size="small" onClick={() => void foldersQuery.refetch()}>
              重新读取目录
            </Button>
          </div>
        )}
        {listQuery.isError && listQuery.data && (
          <div role="status" className={styles.notice}>
            刷新失败，保留上一次读取的内容。
            <Button type="text" size="small" onClick={() => void listQuery.refetch()}>
              重新读取
            </Button>
          </div>
        )}
        {listQuery.isLoading ||
        (listQuery.isPlaceholderData && items.length === 0) ||
        (folderPath !== null && foldersQuery.isLoading) ? (
          <div className={styles.loading}>
            <Skeleton active paragraph={{ rows: 5 }} title={false} />
          </div>
        ) : (listQuery.isError && !listQuery.data) ||
          ((folderPath !== null || scope === 'all') &&
            foldersQuery.isError &&
            !foldersQuery.data) ? (
          /* 失败必须先于「空」判断（见 LoadError 的说明）：把请求失败
             渲染成「这里还是空的」是界面在说谎——数据没丢，只是这次没取到 */
          <LoadError
            message="文档列表读取失败"
            onRetry={() => {
              if (listQuery.isError) void listQuery.refetch()
              if (foldersQuery.isError) void foldersQuery.refetch()
            }}
          />
        ) : isStaleFolder ? (
          <Empty
            className={styles.empty}
            image={<Folder size={32} aria-hidden />}
            styles={{ image: { height: 32, display: 'flex', justifyContent: 'center' } }}
            description="这个知识库不存在（可能已被删除）"
          >
            <div className={styles.emptyActions}>
              <Button
                type="primary"
                onClick={() => {
                  if (firstPath) goFolder(firstPath)
                  else setCreateKbOpen(true)
                }}
              >
                {firstPath ? '返回知识库' : '创建知识库'}
              </Button>
            </div>
          </Empty>
        ) : isMissingChild ? (
          <Empty
            className={styles.empty}
            image={<Folder size={32} aria-hidden />}
            styles={{ image: { height: 32, display: 'flex', justifyContent: 'center' } }}
            description={
              <span>
                这个目录不存在
                <span className={styles.emptyHint}>它可能已被重命名或删除，知识库仍然可用。</span>
              </span>
            }
          >
            <Button onClick={() => goFolder(segments[0]!)}>返回知识库根目录</Button>
          </Empty>
        ) : items.length === 0 && subFolders.length === 0 ? (
          <Empty
            className={styles.empty}
            image={<Folder size={32} aria-hidden />}
            styles={{ image: { height: 32, display: 'flex', justifyContent: 'center' } }}
            description={
              <span>
                {tagName ? `还没有带「${tagName}」标签的文档` : '这里还是空的'}
                <span className={styles.emptyHint}>
                  {tagName
                    ? '可在文档中添加这个标签后，再回到这里查看。'
                    : '拖文件到本页，或用「添加文档」收进来'}
                </span>
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
                location={documentLocation(doc, sourceFolder)}
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
              <span className={styles.headTime}>更新时间</span>
              <span className={styles.headMore} />
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
              <DocRow
                key={doc.id}
                doc={doc}
                location={documentLocation(doc, sourceFolder)}
                hasStatus={hasFailedDocuments}
                onOpen={() => open(doc.id)}
                onEdit={() => open(doc.id)}
                onReplace={() => startReplace(doc)}
                onDelete={() => confirmDelete(doc)}
              />
            ))}
          </div>
        )}
      </div>

      <KnowledgeBaseCreateModal
        open={createKbOpen}
        onCancel={() => setCreateKbOpen(false)}
        onCreated={(path) => {
          setCreateKbOpen(false)
          goFolder(path)
        }}
      />
      {replacement && (
        <SourceReplaceDialog
          doc={replacement}
          onSaved={invalidateList}
          onClosed={() => {
            setReplacement(null)
            restoreOperationFocus()
          }}
        />
      )}
      {folderOperation && (
        <FolderNameModal
          initialName={folderOperation.target?.name}
          parent={folderOperation.parent}
          onSubmit={submitFolderName}
          onClose={() => {}}
          afterClose={() => {
            setFolderOperation(null)
            restoreOperationFocus()
          }}
        />
      )}
    </div>
  )
}

function LibraryDescription({ text }: { text: string }) {
  const { styles } = useStyles()
  const body = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [clipped, setClipped] = useState(false)
  useEffect(() => {
    const element = body.current
    if (!element || element.textContent !== text) return
    const measure = () => {
      if (!expanded) setClipped(element.scrollHeight > element.clientHeight + 1)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [text, expanded])
  return (
    <>
      <p ref={body} className={styles.kbDesc} data-expanded={expanded || undefined}>
        {text}
      </p>
      {(clipped || expanded) && (
        <Button
          type="text"
          size="small"
          className={styles.descriptionToggle}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '收起描述' : '展开完整描述'}
          <ChevronDown size={13} />
        </Button>
      )}
    </>
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

function findFolderByCode(items: FolderNode[], code: string): FolderNode | undefined {
  for (const item of items) {
    if (item.code === code) return item
    const found = findFolderByCode(item.children, code)
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
  if (!doc.folder) return '未归属知识库'
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

export { displayDocumentTitle } from './document-name'

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

/** All list/card formats use the approved Phosphor duotone family. */
export function docIcon(doc: DocumentSummary): ReactNode {
  return <FileFormatIcon doc={doc} />
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
  const trigger = useRef<HTMLButtonElement>(null)
  return (
    <span className={styles.cardActions} onClick={(event) => event.stopPropagation()}>
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        menu={{
          className: styles.menu,
          items: FOLDER_MENU,
          onClick: ({ key, domEvent }) => {
            domEvent.stopPropagation()
            trigger.current?.focus()
            if (key === 'rename') onRename()
            if (key === 'remove') onDelete()
          },
        }}
      >
        <Button
          type="text"
          size="small"
          ref={trigger}
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
  { key: 'rename', label: '重命名', icon: <Pencil size={15} /> },
  { type: 'divider' },
  { key: 'remove', label: '删除', danger: true, icon: <Trash2 size={15} /> },
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
        <DocMenu
          doc={doc}
          onOpen={onOpen}
          onEdit={onEdit}
          onReplace={onReplace}
          onDelete={onDelete}
        />
      </span>
      <span className={styles.cardMeta} title={formatLibraryRowDetail(location, docMetaOf(doc))}>
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

/** Shared card/list actions: portal clicks must never open the surrounding document. */
function DocMenu({ doc, onOpen, onEdit, onReplace, onDelete }: Omit<DocCardProps, 'location'>) {
  const { styles } = useStyles()
  const trigger = useRef<HTMLButtonElement>(null)
  const closingFocus = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (closingFocus.current !== null) cancelAnimationFrame(closingFocus.current)
    },
    [],
  )
  return (
    <span className={styles.cardActions} onClick={(event) => event.stopPropagation()}>
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        onOpenChange={(visible, info) => {
          if (closingFocus.current !== null) cancelAnimationFrame(closingFocus.current)
          if (!visible && info.source === 'trigger')
            closingFocus.current = requestAnimationFrame(() => trigger.current?.focus())
        }}
        menu={{
          className: styles.menu,
          onClick: ({ domEvent }) => domEvent.stopPropagation(),
          items: [
            { key: 'open', label: '打开', onClick: onOpen, icon: <Eye size={15} /> },
            ...(isEditable(doc)
              ? [{ key: 'edit', label: '编辑', onClick: onEdit, icon: <Pencil size={15} /> }]
              : []),
            ...(doc.kind === 'file'
              ? [
                  {
                    key: 'download',
                    icon: <Download size={15} />,
                    label: (
                      <a href={api.documents.sourceUrl(doc.id, { download: true })}>下载原件</a>
                    ),
                  },
                  {
                    key: 'replace',
                    label: '替换原件',
                    icon: <RefreshCw size={15} />,
                    onClick: () => {
                      trigger.current?.focus()
                      onReplace()
                    },
                  },
                ]
              : []),
            { type: 'divider' as const },
            {
              key: 'remove',
              label: '删除',
              danger: true,
              icon: <Trash2 size={15} />,
              onClick: () => {
                trigger.current?.focus()
                onDelete()
              },
            },
          ],
        }}
      >
        <Button
          ref={trigger}
          className={styles.cardActionMore}
          type="text"
          size="small"
          aria-label={`${doc.title} 的更多操作`}
          icon={<Ellipsis size={16} />}
          onClick={(event) => event.stopPropagation()}
        />
      </Dropdown>
    </span>
  )
}

export function DocRow({
  doc,
  location,
  hasStatus,
  onOpen,
  onEdit,
  onReplace,
  onDelete,
}: DocCardProps & { hasStatus: boolean }) {
  const { styles } = useStyles()
  return (
    <div
      className={`kb-row ${styles.row}`}
      data-has-status={hasStatus || undefined}
      onClick={(event) => {
        if (event.currentTarget.contains(event.target as Node)) onOpen()
      }}
    >
      <span className={styles.cardIcon}>{docIcon(doc)}</span>
      <button
        type="button"
        className={styles.rowTitle}
        onClick={(event) => {
          event.stopPropagation()
          onOpen()
        }}
      >
        <DocumentName doc={doc} />
        {doc.status === 'failed' && (
          <span className={styles.compactStatus}>
            <StatusBadge status={doc.status} />
          </span>
        )}
      </button>
      <span className={styles.rowMeta} title={formatLibraryRowDetail(location, docMetaOf(doc))}>
        {formatLibraryRowDetail(location, docMetaOf(doc))}
      </span>
      <span className={styles.rowStatus}>
        <StatusBadge status={doc.status} />
      </span>
      <span className={styles.rowTime}>{doc.updatedAt ? formatDate(doc.updatedAt) : ''}</span>
      <span className={`kb-row-menu ${styles.rowMenuCell}`}>
        <DocMenu
          doc={doc}
          onOpen={onOpen}
          onEdit={onEdit}
          onReplace={onReplace}
          onDelete={onDelete}
        />
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
