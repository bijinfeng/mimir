import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Ellipsis,
  File,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  FolderUp,
  Globe,
  LayoutGrid,
  List,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  allScenes,
  docs,
  group,
  longDescription,
  longTitle,
  makeDocuments,
  stateLabel,
} from './fixtures'
import type { Doc, Scene } from './fixtures'
import './review.css'

type ModalKind =
  | 'kb-delete'
  | 'folder-create'
  | 'folder-rename'
  | 'folder-delete'
  | 'doc-delete'
  | 'kb-create'
  | 'kb-edit'
  | 'replace'
  | 'rename-note'
  | 'move'
  | 'guard'
  | 'capture'
  | 'download'
  | null
type MockFolder = { path: string; name: string; count: number }
type Phase = 'idle' | 'pending' | 'error' | 'success'
type MenuKind = 'add' | 'new' | 'folder' | 'doc' | 'kb' | 'detail' | null
const is = (scene: Scene, ...ids: string[]) => ids.includes(scene.itemId)
const has = (scene: Scene, ...states: string[]) => states.includes(scene.state)
function initialModal(s: Scene): ModalKind {
  if (is(s, 'LIB-003'))
    return has(s, 'success', 'cancel') ? null : s.state === 'create' ? 'kb-create' : 'kb-edit'
  if (is(s, 'LIB-043') && has(s, 'delete-empty', 'delete-nonempty')) return 'kb-delete'
  if (is(s, 'LIB-043') && has(s, 'edit')) return 'kb-edit'
  if (is(s, 'LIB-002') && s.state === 'create-open') return 'kb-create'
  if (
    is(s, 'LIB-011', 'LIB-023', 'LIB-024', 'LIB-025', 'LIB-038', 'LIB-039', 'LIB-040') &&
    has(s, 'success', 'cancel', 'focus-return')
  )
    return null
  if (is(s, 'LIB-011', 'LIB-P02')) return 'folder-create'
  if (is(s, 'LIB-023')) return 'folder-rename'
  if (is(s, 'LIB-024', 'LIB-025')) return 'folder-delete'
  if (is(s, 'LIB-038', 'LIB-039', 'LIB-040', 'LIB-P06'))
    return has(s, 'folder-assignment-cleared') ? 'folder-delete' : 'doc-delete'
  if (is(s, 'LIB-036', 'LIB-037', 'LIB-P05')) return 'replace'
  if (is(s, 'LIB-044')) return has(s, 'success', 'cancel') ? null : 'rename-note'
  if (is(s, 'LIB-045')) return has(s, 'success', 'cancel') ? null : 'move'
  if (is(s, 'LIB-035')) return 'download'
  if (has(s, 'unsaved-guard')) return 'guard'
  return null
}
function initialDoc(s: Scene): Doc {
  if (is(s, 'LIB-009') && has(s, 'success'))
    return {
      id: 'created-note',
      title: '未命名笔记',
      kind: '笔记',
      detail: '还没有内容',
      location: '当前目录',
      status: '就绪',
      date: '2026/10/18 23:59',
    }
  if (
    is(s, 'LIB-039', 'LIB-035', 'LIB-036', 'LIB-037', 'LIB-P05') ||
    has(s, 'file-original-delete', 'file-readonly', 'readonly-file')
  )
    return docs[4]!
  if (is(s, 'LIB-040') || has(s, 'web-softdelete', 'web')) return docs[5]!
  if (has(s, 'file-editable', 'editable-office')) return docs[1]!
  return docs[0]!
}
function initialPhase(s: Scene): Phase {
  if (has(s, 'pending', 'busy', 'pending-guard', 'pending-gap')) return 'pending'
  if (
    has(
      s,
      'request-error',
      'retry-error',
      'retry-draft',
      'network-error',
      'oversize-server-error',
      'failure',
      'failure-rechoose',
      'reconcile-error',
      'read-refresh-error',
    )
  )
    return 'error'
  if (
    has(
      s,
      'success',
      'created',
      'success-parse-empty',
      'success-parse-error',
      'complete',
      'success-undo',
    )
  )
    return 'success'
  return 'idle'
}
function initialMenu(s: Scene): MenuKind {
  if (is(s, 'LIB-008')) return 'add'
  if (is(s, 'LIB-010') && has(s, 'narrow-menu')) return 'new'
  if (is(s, 'LIB-022')) return 'folder'
  if (is(s, 'LIB-028', 'LIB-P01')) return 'doc'
  if (is(s, 'LIB-043')) return has(s, 'delete-empty', 'delete-nonempty', 'edit') ? null : 'kb'
  if (is(s, 'LIB-046')) return 'detail'
  return null
}
import glyph0 from './assets/description.svg'
import glyph1 from './assets/table_chart.svg'
import glyph2 from './assets/slideshow.svg'
import glyph3 from './assets/picture_as_pdf.svg'
import glyph4 from './assets/code.svg'
import glyph5 from './assets/notes.svg'
import glyph6 from './assets/image.svg'
import glyph7 from './assets/audio_file.svg'
import glyph8 from './assets/video_file.svg'
import glyph9 from './assets/folder_zip.svg'
import glyph10 from './assets/draft.svg'
import glyph11 from './assets/article.svg'
const glyphs: Record<string, string> = {
  Word: glyph0,
  Excel: glyph1,
  PowerPoint: glyph2,
  PDF: glyph3,
  HTML: glyph4,
  代码: glyph4,
  笔记: glyph5,
  图片: glyph6,
  音频: glyph7,
  视频: glyph8,
  压缩包: glyph9,
  未知文件: glyph10,
  文本: glyph11,
}
function Icon({ doc }: { doc: Doc }) {
  if (['网页', '公众号', 'GitHub'].includes(doc.kind))
    return <FileText size={19} strokeWidth={1.7} aria-hidden />
  const url = `url("${glyphs[doc.kind] ?? glyph10}")`
  return (
    <span className="format-glyph" aria-hidden style={{ maskImage: url, WebkitMaskImage: url }} />
  )
}
function Name({ doc }: { doc: Doc }) {
  const full =
    doc.ext && !doc.title.toLowerCase().endsWith(doc.ext.toLowerCase())
      ? doc.title + doc.ext
      : doc.title
  const stem = doc.ext ? full.slice(0, -doc.ext.length) : full
  return (
    <span className="filename" title={full}>
      <span>{stem}</span>
      {doc.ext && <span>{full.slice(-doc.ext.length)}</span>}
    </span>
  )
}
function Btn({
  children,
  icon,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode }) {
  return (
    <button type="button" className={`btn ${className}`} {...props}>
      {icon}
      {children}
    </button>
  )
}
function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div role={error ? 'alert' : 'status'} className={`notice ${error ? 'error' : ''}`}>
      {children}
    </div>
  )
}
function Pane({ scene, after }: { scene: Scene; after: boolean }) {
  const host = useRef<HTMLElement>(null)
  const origin = useRef<HTMLElement | null>(null)
  const restoreFrame = useRef<number | null>(null)
  const newNoteSequence = useRef(0)
  const requestLock = useRef(initialPhase(scene) === 'pending')
  const [readPhase, setReadPhase] = useState(
    has(scene, 'folders-loading')
      ? 'loading'
      : has(scene, 'folders-error', 'read-refresh-error', 'reconcile-error')
        ? 'error'
        : 'ready',
  )
  const [committed] = useState(has(scene, 'read-refresh-error'))
  const [parseOutcome, setParseOutcome] = useState(
    has(scene, 'success-parse-empty')
      ? 'empty'
      : has(scene, 'success-parse-error')
        ? 'error'
        : 'text',
  )
  const [kbDeleted, setKbDeleted] = useState(false)
  const [recovered, setRecovered] = useState(false)
  const [queryFinished, setQueryFinished] = useState(false)
  const [layout, setLayout] = useState<'list' | 'card'>(() =>
    has(
      scene,
      'card',
      'tag-cards',
      'cards',
      'body-click',
      'title-keyboard',
      'meta-click',
      'action-no-open',
    ) || is(scene, 'LIB-027', 'LIB-028')
      ? 'card'
      : 'list',
  )
  const [modal, setModal] = useState<ModalKind>(() => initialModal(scene))
  const [phase, setPhase] = useState<Phase>(() => initialPhase(scene))
  const [menu, setMenu] = useState<MenuKind>(() => initialMenu(scene))
  const [menuPos, setMenuPos] = useState({ top: 244, right: 24 })
  const [documentEntries, setDocumentEntries] = useState<Doc[]>(() => makeDocuments(scene))
  const [target, setTarget] = useState<Doc>(
    () => makeDocuments(scene).find((doc) => doc.id === initialDoc(scene).id) ?? initialDoc(scene),
  )
  const [kbName, setKbName] = useState('设计工作台')
  const [kbDescription, setKbDescription] = useState(
    has(scene, 'legacy-description') ? longDescription : '这里沉淀设计原则、研究笔记和产品规范。',
  )
  const [value, setValue] = useState(() =>
    has(scene, 'empty-disabled', 'blank-disabled', 'invalid-name')
      ? ''
      : has(scene, 'slash', 'invalid-inline')
        ? '资料/设计'
        : has(scene, 'trim')
          ? '  设计资料  '
          : has(scene, '60-limit')
            ? '长'.repeat(60)
            : is(scene, 'LIB-023')
              ? has(scene, 'request-error', 'pending')
                ? '参考资料（修订）'
                : '参考资料'
              : is(scene, 'LIB-044')
                ? has(scene, 'failure', 'read-refresh-error')
                  ? '产品设计原则（修订）'
                  : '产品设计原则'
                : is(scene, 'LIB-003') && !has(scene, 'create')
                  ? '设计工作台'
                  : has(
                        scene,
                        'pending',
                        'pending-guard',
                        'request-error',
                        'retry-draft',
                        'retry-error',
                        'enter',
                        'ime',
                      )
                    ? '设计资料'
                    : '',
  )
  const initialDescription = has(scene, 'legacy-description')
    ? longDescription
    : '这里沉淀设计原则、研究笔记和产品规范。'
  const descriptionLegacyUnchanged = (text: string) =>
    has(scene, 'legacy-description') && text === initialDescription
  const [description, setDescription] = useState(() =>
    has(scene, 'description-limit')
      ? '描'.repeat(501)
      : has(scene, 'legacy-description')
        ? longDescription
        : '这里沉淀设计原则、研究笔记和产品规范。',
  )
  const [fieldError, setFieldError] = useState(
    has(scene, 'invalid-inline') && after
      ? '名称不能包含 /'
      : has(scene, 'invalid')
        ? '请输入有效名称'
        : '',
  )
  const [toast, setToast] = useState(() =>
    has(scene, 'success', 'created')
      ? is(scene, 'LIB-005')
        ? '已复制知识库 ID（模拟）'
        : is(scene, 'LIB-011')
          ? '已新建文件夹'
          : is(scene, 'LIB-023')
            ? '已重命名文件夹'
            : is(scene, 'LIB-024', 'LIB-025')
              ? after
                ? '已删除文件夹，文档保留，目录归属已清空。'
                : '已删除文件夹，4 篇文档移回库根'
              : is(scene, 'LIB-038')
                ? '已移入回收站'
                : is(scene, 'LIB-039')
                  ? '已删除文件与原件'
                  : is(scene, 'LIB-040')
                    ? after
                      ? '已移除资料记录'
                      : '已删除文件与原件'
                    : '操作成功（本地模拟）'
      : !after && has(scene, 'request-error', 'network-error', 'failure', 'oversize-server-error')
        ? '请求失败：网络连接中断；当前通过全局反馈告知。'
        : '',
  )
  const [location, setLocation] = useState(() =>
    has(
      scene,
      'nested',
      'nested-folder',
      'ancestor-link',
      'current-text',
      'empty-child',
      'missing-child',
      'existing-root',
      'new-scope-pending',
      'placeholder',
      'scope-changing',
    )
      ? '参考资料/设计规范'
      : has(scene, 'long-path', 'long-breadcrumb')
        ? '参考资料/设计规范/项目归档/关于知识工作台设计思考的完整研究记录'
        : '',
  )
  const [listState, setListState] = useState(() =>
    is(scene, 'LIB-013') ||
    (is(scene, 'LIB-006', 'LIB-019') && has(scene, 'loading')) ||
    (has(scene, 'folders-loading', 'tag-loading', 'documents-loading') && !is(scene, 'LIB-045'))
      ? 'loading'
      : is(scene, 'LIB-014') || (has(scene, 'failure') && is(scene, 'LIB-019'))
        ? 'error'
        : 'ready',
  )
  const [openDoc, setOpenDoc] = useState(
    is(scene, 'LIB-034', 'LIB-044', 'LIB-045', 'LIB-046', 'LIB-P08') ||
      (is(scene, 'LIB-009') && has(scene, 'success')),
  )
  const [showDescription, setShowDescription] = useState(false)
  const [showFullPath, setShowFullPath] = useState(false)
  const [hasLibrary, setHasLibrary] = useState(
    is(scene, 'LIB-002')
      ? has(scene, 'created')
      : !has(scene, 'no-libraries', 'zero-roots', 'zero-roots-folder'),
  )
  const [folderEntries, setFolderEntries] = useState<MockFolder[]>(() =>
    (is(scene, 'LIB-002') && has(scene, 'created')) ||
    is(scene, 'LIB-018', 'LIB-020') ||
    (is(scene, 'LIB-019') && has(scene, 'empty'))
      ? []
      : [
          { path: '参考资料', name: '参考资料', count: 4 },
          { path: '参考资料/设计规范', name: '设计规范', count: 1 },
          { path: '灵感收集', name: '灵感收集', count: 2 },
          ...(is(scene, 'LIB-011') && has(scene, 'success')
            ? [{ path: '设计资料', name: '设计资料', count: 0 }]
            : []),
          ...(has(scene, 'long-name') ? [{ path: longTitle, name: longTitle, count: 0 }] : []),
        ].map((folder) =>
          is(scene, 'LIB-023') && has(scene, 'success') && folder.path.startsWith('参考资料')
            ? Object.assign({}, folder, {
                name: folder.path === '参考资料' ? '设计资料' : folder.name,
                path: '设计资料' + folder.path.slice('参考资料'.length),
              })
            : folder,
        ),
  )
  const [folderTarget, setFolderTarget] = useState<MockFolder>(() =>
    is(scene, 'LIB-024')
      ? { path: '空文件夹', name: '空文件夹', count: 0 }
      : { path: '参考资料', name: '参考资料', count: 4 },
  )
  const [removedFolders, setRemovedFolders] = useState<string[]>(
    has(scene, 'success') && is(scene, 'LIB-024', 'LIB-025')
      ? [is(scene, 'LIB-024') ? '空文件夹' : '参考资料']
      : [],
  )
  const [pathChanges, setPathChanges] = useState<Array<{ from: string; to: string }>>([])
  const [captureEntry, setCaptureEntry] = useState(
    has(scene, 'upload-folder')
      ? 'upload-folder'
      : has(scene, 'upload-file', 'upload')
        ? 'upload-file'
        : 'capture-url',
  )
  const [removed, setRemoved] = useState<string[]>(
    has(scene, 'success')
      ? is(scene, 'LIB-024', 'LIB-025')
        ? []
        : is(scene, 'LIB-038', 'LIB-039', 'LIB-040')
          ? [initialDoc(scene).id]
          : []
      : [],
  )
  const [selectedFile, setSelectedFile] = useState(() =>
    has(scene, 'choose', 'native-cancel') ? '' : '知识管理研究修订版.pdf',
  )
  const [moveUndo, setMoveUndo] = useState<{ id: string; location: string } | null>(
    has(scene, 'success-undo', 'undo-error') ? { id: 'note', location: '当前目录' } : null,
  )
  const [moveTo, setMoveTo] = useState(
    has(scene, 'current-target', 'unchanged')
      ? '设计工作台/当前目录'
      : has(scene, 'no-folder')
        ? ''
        : '设计工作台/参考资料',
  )
  const [importOpen, setImportOpen] = useState(is(scene, 'LIB-042'))
  const [importStatus, setImportStatus] = useState(
    has(scene, 'mixed-results')
      ? 'mixed'
      : has(scene, 'all-failed')
        ? 'failed'
        : has(scene, 'complete')
          ? 'complete'
          : 'busy',
  )
  const [copied, setCopied] = useState(is(scene, 'LIB-005') && has(scene, 'success'))
  const isTag =
    is(scene, 'LIB-019', 'LIB-020') ||
    has(
      scene,
      'empty-tag',
      'tag-disabled',
      'tag-list',
      'tag-cards',
      'tag-location',
      'long-tag',
      'tag-loading',
    )
  const missingChild = !recovered && (is(scene, 'LIB-017') || has(scene, 'missing-child'))
  const missingRoot =
    !recovered &&
    ((is(scene, 'LIB-016') && (hasLibrary || after)) || (has(scene, 'zero-roots-folder') && after))
  const predefinedEmpty =
    !recovered &&
    (is(scene, 'LIB-018', 'LIB-020') ||
      (has(scene, 'empty-root', 'empty-child', 'empty-tag', 'empty') && is(scene, 'LIB-019')) ||
      missingChild ||
      (is(scene, 'LIB-016') && !hasLibrary) ||
      has(scene, 'zero-roots-folder'))
  const longDesc = has(scene, 'long-description', 'low-height') || is(scene, 'LIB-P07')
  const pending = phase === 'pending'
  const locked =
    pending &&
    (after ||
      modal === 'folder-delete' ||
      modal === 'doc-delete' ||
      modal === 'kb-create' ||
      modal === 'kb-edit' ||
      modal === 'kb-delete' ||
      modal === 'move' ||
      modal === 'rename-note')
  const currentReplacementGap = !after && modal === 'replace'
  const headline = has(scene, 'long-title') ? longTitle : kbName
  const currentPathOf = (path: string) =>
    pathChanges.reduce(
      (currentPath, change) =>
        currentPath === change.from || currentPath.startsWith(change.from + '/')
          ? change.to + currentPath.slice(change.from.length)
          : currentPath,
      path,
    )
  const baseDocs = documentEntries
    .filter((doc) => !removed.includes(doc.id) && doc.location !== '__unassigned__')
    .map((doc) => Object.assign({}, doc, { location: currentPathOf(doc.location) }))
    .toSorted((left, right) => right.date.localeCompare(left.date))
  const scopedDocs =
    !isTag && Boolean(location) && !has(scene, 'new-scope-pending', 'placeholder', 'scope-changing')
      ? baseDocs.filter(
          (doc) => doc.location === location || doc.location.startsWith(location + '/'),
        )
      : baseDocs
  const listDocs = scopedDocs
    .filter(
      (doc) =>
        !removedFolders.some(
          (path) => doc.location === path || doc.location.startsWith(path + '/'),
        ),
    )
    .map((doc) =>
      Object.assign({}, doc, {
        location:
          location && doc.location.startsWith(location)
            ? doc.location === location
              ? '当前目录'
              : doc.location.slice(location.length + 1)
            : doc.location,
      }),
    )
  const DocRowElement = after ? 'div' : 'button'
  const hasFailed = listDocs.some((doc) => doc.status === '提取失败')
  const folders =
    is(scene, 'LIB-043') && has(scene, 'delete-empty')
      ? []
      : folderEntries
          .filter((folder) => {
            const parent = folder.path.includes('/')
              ? folder.path.slice(0, folder.path.lastIndexOf('/'))
              : ''
            return (
              parent === location &&
              !removedFolders.some(
                (path) => folder.path === path || folder.path.startsWith(path + '/'),
              )
            )
          })
          .map((folder) =>
            Object.assign({}, folder, {
              count: baseDocs.filter(
                (doc) => doc.location === folder.path || doc.location.startsWith(folder.path + '/'),
              ).length,
            }),
          )
  const empty =
    (predefinedEmpty && !is(scene, 'LIB-018')) ||
    (listDocs.length === 0 && (isTag || folders.length === 0))
  const cachedError = !queryFinished && has(scene, 'cached-data-error', 'cached-refresh-error')
  const switching = !queryFinished && (is(scene, 'LIB-015') || has(scene, 'scope-changing'))
  const maxCount = has(scene, '100-cap', '100-limit', '100-loaded') || is(scene, 'LIB-050')
  const needsEmptyGuide = kbDeleted || (!hasLibrary && is(scene, 'LIB-001', 'LIB-002'))

  useEffect(() => {
    if (menu && !modal)
      host.current?.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus()
  }, [menu, modal])
  useEffect(() => {
    if (is(scene, 'LIB-047') && has(scene, 'scrolled')) {
      const body = host.current?.querySelector<HTMLElement>('.library-body')
      if (body) body.scrollTop = 240
    }
  }, [scene])
  function rememberFocus() {
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  function dismiss() {
    if (locked || (requestLock.current && after)) return
    setModal(null)
    setMenu(null)
    setFieldError('')
    setPhase('idle')
    restoreFrame.current = requestAnimationFrame(() => {
      restoreFrame.current = null
      if (origin.current?.isConnected) origin.current.focus()
      else host.current?.querySelector<HTMLButtonElement>('.focus-fallback')?.focus()
    })
  }
  function openModal(kind: ModalKind, doc = target) {
    if (restoreFrame.current !== null) {
      cancelAnimationFrame(restoreFrame.current)
      restoreFrame.current = null
    }
    if (!menu) rememberFocus()
    requestLock.current = false
    setTarget(doc)
    setModal(kind)
    setMenu(null)
    setPhase('idle')
    setFieldError('')
    if (kind === 'kb-edit') {
      setValue(kbName)
      setDescription(kbDescription)
    }
    if (kind === 'folder-create') setValue('')
    if (kind === 'folder-rename') setValue(folderTarget.name)
    if (kind === 'rename-note') setValue(doc.title)
    if (kind === 'replace') setSelectedFile('')
  }
  function openMenu(
    kind: MenuKind,
    event: React.MouseEvent<HTMLButtonElement>,
    doc = target,
    folder?: MockFolder,
  ) {
    event.stopPropagation()
    if (restoreFrame.current !== null) {
      cancelAnimationFrame(restoreFrame.current)
      restoreFrame.current = null
    }
    origin.current = event.currentTarget
    setTarget(doc)
    if (folder) setFolderTarget(folder)
    const rect = event.currentTarget.getBoundingClientRect()
    const box = host.current!.querySelector('.surface')!.getBoundingClientRect()
    setMenuPos({
      top: Math.min(rect.bottom - box.top + 4, box.height - 248),
      right: Math.max(12, box.right - rect.right),
    })
    setMenu(menu === kind ? null : kind)
  }
  function openDocument(doc: Doc) {
    setTarget(doc)
    setOpenDoc(true)
    setMenu(null)
    setToast('已在当前目录打开文档；此处仅演示与阅读模块的交接。')
  }
  function request(event?: FormEvent) {
    event?.preventDefault()
    if (requestLock.current && (after || locked)) return
    if ((modal === 'move' || modal === 'rename-note') && committed) {
      setReadPhase('loading')
      setPhase('pending')
      return
    }
    if (modal === 'kb-edit' && has(scene, 'reconcile-error') && readPhase !== 'ready') return
    if (modal === 'move' && readPhase !== 'ready') return
    if (
      modal === 'move' &&
      (moveTo === '设计工作台/当前目录'
        ? '当前目录'
        : moveTo
          ? moveTo.replace(/^设计工作台\//, '')
          : '__unassigned__') ===
        currentPathOf((documentEntries.find((doc) => doc.id === target.id) ?? target).location)
    ) {
      dismiss()
      return
    }
    if (modal === 'replace' && !selectedFile) {
      setFieldError('请先选择一个替换文件')
      return
    }
    if (
      ['folder-create', 'folder-rename', 'rename-note', 'kb-create', 'kb-edit'].includes(
        modal ?? '',
      )
    ) {
      if (!value.trim()) {
        setFieldError(after || modal?.startsWith('kb') ? '请输入名称' : '')
        return
      }
      if (value.includes('/')) {
        if (after || modal?.startsWith('kb')) setFieldError('名称不能包含 /')
        else setToast('名称不能包含 /')
        return
      }
      if (
        modal?.startsWith('kb') &&
        description.length > 500 &&
        !descriptionLegacyUnchanged(description)
      ) {
        setFieldError('描述请控制在 500 字以内')
        return
      }
      if (modal === 'kb-edit' && value.trim() === kbName && description === kbDescription) {
        dismiss()
        return
      }
      if (
        (modal === 'folder-rename' && value.trim() === folderTarget.name) ||
        (modal === 'rename-note' && value.trim() === target.title)
      ) {
        dismiss()
        return
      }
    }
    setFieldError('')
    requestLock.current = true
    setPhase('pending')
    if (currentReplacementGap)
      setToast('当前没有替换请求中的可见状态；下方评审工具可结束模拟请求。')
  }
  function patchDocument(id: string, patch: Partial<Doc>) {
    const old = documentEntries.find((doc) => doc.id === id) ?? target
    const next = Object.assign({}, old, patch)
    setDocumentEntries(documentEntries.map((doc) => (doc.id === id ? next : doc)))
    setTarget(next)
    return next
  }
  function applyMove(destination: string) {
    const previous = documentEntries.find((doc) => doc.id === target.id)
    if (previous) setMoveUndo({ id: previous.id, location: previous.location })
    const path =
      destination === '设计工作台/当前目录'
        ? '当前目录'
        : destination
          ? destination.replace(/^设计工作台\//, '')
          : '__unassigned__'
    patchDocument(target.id, { location: path, date: '2026/10/18 23:59' })
    setMoveTo(destination)
  }
  function undoMove() {
    if (has(scene, 'undo-error')) {
      setToast('撤销失败，请重新选择原目录；原移动已生效。')
      return
    }
    if (!moveUndo) {
      setToast('请先移动文档，再模拟撤销；当前没有待撤销移动。')
      return
    }
    patchDocument(moveUndo.id, { location: moveUndo.location })
    setMoveUndo(null)
    setToast('已撤销移动，恢复原目录归属')
  }
  function finish(ok: boolean, parse?: string) {
    if (!pending && phase !== 'success' && !committed) {
      setToast('请先在画面内提交请求，再用评审工具选择结果。')
      return
    }
    requestLock.current = false
    if (committed && (modal === 'move' || modal === 'rename-note')) {
      setReadPhase(ok ? 'ready' : 'error')
      setPhase(ok ? 'success' : 'error')
      if (ok) {
        setToast('写入已生效，重新读取成功；没有重复提交写请求')
        setModal(null)
      }
      return
    }
    if (parse) setParseOutcome(parse)
    if (!ok) {
      setPhase('error')
      if (modal === 'guard') setToast('保存失败，修改仍保留；请重新保存或继续编辑。')
      if (!after && !locked && modal !== 'kb-create' && modal !== 'kb-edit')
        setToast(modal === 'replace' ? '替换失败：网络连接中断' : '请求失败：连接中断，请重试')
      return
    }
    setPhase('success')
    if (modal === 'guard') {
      setModal(null)
      setOpenDoc(true)
      setToast('已保存本次模拟修改，继续原导航；既有文档未被替换或新建。')
    } else if (modal === 'folder-create') {
      const name = value.trim() || '设计资料'
      const path = location ? location + '/' + name : name
      setFolderEntries([...folderEntries, { path, name, count: 0 }])
      setToast('已新建文件夹')
      setModal(null)
    } else if (modal === 'folder-rename') {
      const name = value.trim() || '设计资料'
      const parent = folderTarget.path.includes('/')
        ? folderTarget.path.slice(0, folderTarget.path.lastIndexOf('/'))
        : ''
      const to = parent ? parent + '/' + name : name
      setFolderEntries(
        folderEntries.map((folder) =>
          folder.path === folderTarget.path
            ? Object.assign({}, folder, { name, path: to })
            : folder.path.startsWith(folderTarget.path + '/')
              ? Object.assign({}, folder, {
                  path: to + folder.path.slice(folderTarget.path.length),
                })
              : folder,
        ),
      )
      setPathChanges([...pathChanges, { from: folderTarget.path, to }])
      if (location === folderTarget.path || location.startsWith(folderTarget.path + '/'))
        setLocation(to + location.slice(folderTarget.path.length))
      setToast('已重命名文件夹，目录及其子树路径同步更新')
      setModal(null)
    } else if (modal === 'folder-delete') {
      setRemovedFolders([...removedFolders, folderTarget.path])
      setDocumentEntries(
        documentEntries.map((doc) =>
          currentPathOf(doc.location) === folderTarget.path ||
          currentPathOf(doc.location).startsWith(folderTarget.path + '/')
            ? Object.assign({}, doc, { location: '__unassigned__' })
            : doc,
        ),
      )
      if (location === folderTarget.path || location.startsWith(folderTarget.path + '/'))
        setLocation(
          folderTarget.path.includes('/')
            ? folderTarget.path.slice(0, folderTarget.path.lastIndexOf('/'))
            : '',
        )
      setToast(
        after
          ? `已删除文件夹，${folderTarget.count} 篇文档保留，目录归属已清空。`
          : `已删除文件夹，${folderTarget.count} 篇文档移回库根`,
      )
      setModal(null)
    } else if (modal === 'kb-delete') {
      setHasLibrary(false)
      setKbDeleted(true)
      setModal(null)
      setToast(
        after
          ? '知识库已删除；文档保留，目录归属已清空。当前没有其他知识库，回到创建引导。'
          : has(scene, 'delete-empty')
            ? '已删除知识库'
            : '已删除知识库，8 篇文档移回库根',
      )
    } else if (modal === 'doc-delete') {
      setDocumentEntries(documentEntries.filter((doc) => doc.id !== target.id))
      setRemoved([...removed, target.id])
      setToast(
        target.ext
          ? '已删除文件与原件'
          : target.kind === '笔记'
            ? '已移入回收站'
            : after
              ? '已移除资料记录'
              : '已删除文件与原件',
      )
      setModal(null)
    } else if (modal === 'kb-create' || modal === 'kb-edit') {
      setHasLibrary(true)
      if (modal === 'kb-create') {
        setDocumentEntries([])
        setFolderEntries([])
        setLocation('')
        setRemoved([])
        setRemovedFolders([])
        setPathChanges([])
      }
      setKbName(value.trim())
      setKbDescription(description.trim())
      setKbDeleted(false)
      setRecovered(true)
      setToast(modal === 'kb-create' ? '已创建知识库' : '知识库名称和描述已保存')
      setModal(null)
    } else if (modal === 'replace') {
      const outcome = parse ?? parseOutcome
      patchDocument(target.id, {
        status: outcome === 'error' ? '提取失败' : '就绪',
        detail:
          outcome === 'empty'
            ? '5.2 MB · 无可搜索正文'
            : outcome === 'error'
              ? '5.2 MB · 正文提取失败'
              : '5.2 MB',
        date: '2026/10/18 23:59',
      })
      setToast(
        after
          ? outcome === 'error'
            ? '原件已保存，正文提取失败。可打开文档查看详情。'
            : outcome === 'empty'
              ? '原件已保存，未提取到可搜索正文。'
              : '原件已替换，正文已更新。'
          : '已替换原件',
      )
    } else if (modal === 'move') {
      applyMove(moveTo)
      setToast('已移动到 ' + (moveTo || '无目录归属'))
      setModal(null)
    } else if (modal === 'rename-note') {
      patchDocument(target.id, { title: value.trim(), date: '2026/10/18 23:59' })
      setToast('已重命名笔记')
      setModal(null)
    } else {
      const note: Doc = {
        id: 'new-note-' + ++newNoteSequence.current,
        title: '未命名笔记',
        kind: '笔记',
        detail: '还没有内容',
        location: location || '当前目录',
        status: '就绪',
        date: '2026/10/18 23:59',
      }
      setDocumentEntries([note, ...documentEntries])
      setTarget(note)
      setToast('已创建未命名笔记')
      setOpenDoc(true)
    }
    requestAnimationFrame(() => origin.current?.isConnected && origin.current.focus())
  }
  function menuAction(action: string) {
    setMenu(null)
    if (action === 'open' || action === 'edit') openDocument(target)
    if (action === 'remove') openModal('doc-delete')
    if (action === 'replace') openModal('replace')
    if (action === 'download') openModal('download')
    if (action === 'rename-folder') openModal('folder-rename')
    if (action === 'delete-folder') openModal('folder-delete')
    if (action === 'file' || action === 'edit-now') {
      if (after && requestLock.current) return
      requestLock.current = true
      if (!menu) rememberFocus()
      setPhase('pending')
      setToast(
        after
          ? '正在当前目录创建笔记…'
          : '当前新建文件没有等待反馈或防重；请用评审工具完成模拟请求。',
      )
    }
    if (action === 'folder') openModal('folder-create')
    if (action.startsWith('upload') || action === 'capture-url') {
      setCaptureEntry(action)
      openModal('capture')
      setToast(
        action === 'capture-url'
          ? '已切到网页收集，当前目录随入口传递'
          : action === 'upload-folder'
            ? '已请求文件夹选择；原生选择器须宿主另验'
            : '已切到文件导入，当前目录随入口传递',
      )
    }
    if (action === 'kb-edit') {
      openModal('kb-edit')
      setValue(kbName)
    }
    if (action === 'kb-delete') {
      openModal('kb-delete')
    }
    if (action === 'move') openModal('move')
    if (action === 'detail-other') {
      applyMove('设计工作台/灵感收集')
      setToast('已移动到 设计工作台/灵感收集（模拟）')
    }
    if (action === 'detail-out') {
      applyMove('')
      setToast('已移出目录，目录归属清空（模拟）')
    }
  }
  function menuKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      dismiss()
      return
    }
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
    )
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      buttons[
        (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      ]?.focus()
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      buttons[event.key === 'Home' ? 0 : buttons.length - 1]?.focus()
    }
  }
  const isFile = Boolean(target.ext)
  const editable = target.kind === '笔记' || ['Word', 'Excel', 'PowerPoint'].includes(target.kind)
  const menuItems =
    menu === 'add'
      ? ([
          ['upload-file', '上传文件', Upload],
          ['upload-folder', '上传文件夹', FolderUp],
          ['capture-url', '网页抓取', Globe],
          ['edit-now', '直接编辑', Pencil],
        ] as const)
      : menu === 'new'
        ? ([
            ['file', '新建文件', FilePlus2],
            ['folder', '新建文件夹', FolderPlus],
          ] as const)
        : menu === 'folder'
          ? ([
              ['rename-folder', '重命名', Pencil],
              ['delete-folder', '删除', Trash2],
            ] as const)
          : menu === 'kb'
            ? ([
                ['kb-edit', '编辑', Pencil],
                ['kb-delete', '删除', Trash2],
              ] as const)
            : menu === 'detail'
              ? ([
                  ['detail-current', '参考资料（当前目录）', Folder],
                  ['detail-other', '灵感收集', Folder],
                  ...(!has(scene, 'no-folder') && moveTo
                    ? [['detail-out', '移出目录', FolderUp] as const]
                    : []),
                ] as const)
              : ([
                  ['open', '打开', FileText],
                  ...(editable ? [['edit', '编辑', Pencil] as const] : []),
                  ...(isFile
                    ? [
                        ['download', '下载原件', Download] as const,
                        ['replace', '替换原件', RefreshCw] as const,
                      ]
                    : []),
                  ['remove', '删除', Trash2],
                ] as const)
  const currentListMenuMissing =
    !after && is(scene, 'LIB-P01') && has(scene, 'list-menu', 'portal-no-open')
  const activeMenu = menu && !currentListMenuMissing
  const deleteFolder = modal === 'folder-delete' || modal === 'kb-delete'
  const danger = deleteFolder || modal === 'doc-delete'
  const title =
    modal === 'folder-create'
      ? '新建文件夹'
      : modal === 'folder-rename'
        ? '重命名文件夹'
        : modal === 'kb-delete'
          ? '删除知识库「设计工作台」？'
          : modal === 'folder-delete'
            ? `删除文件夹「${folderTarget.name}」？`
            : modal === 'doc-delete'
              ? `删除《${target.title}${target.ext ?? ''}》？`
              : modal === 'kb-create'
                ? '创建知识库'
                : modal === 'kb-edit'
                  ? '编辑知识库'
                  : modal === 'replace'
                    ? '替换原件'
                    : modal === 'rename-note'
                      ? '重命名笔记'
                      : modal === 'move'
                        ? '移动到目录'
                        : modal === 'guard'
                          ? '有尚未保存的修改'
                          : modal === 'download'
                            ? '下载原件 · 宿主交接'
                            : '收集与导入 · 模块交接'
  let consequence = deleteFolder
    ? folderTarget.count === 0 || (is(scene, 'LIB-043') && has(scene, 'delete-empty'))
      ? '这是一个空文件夹，删除后不影响任何文档。'
      : after
        ? `目录及其下级会删除。${folderTarget.count} 篇文档会保留，但目录归属将清空，不会自动留在当前知识库。当前没有重新归库或一键撤销入口。`
        : `里面的 ${folderTarget.count} 篇文档会保留，指派清空后回到知识库根。`
    : target.ext
      ? '不可撤销：记录与原件都会删除。'
      : target.kind === '笔记'
        ? '笔记将从知识库移除，文件保留在回收站。当前应用没有一键恢复入口。'
        : after
          ? '此资料记录将从知识库移除。当前应用没有一键恢复入口。'
          : '笔记将从知识库移除，文件保留在回收站。当前应用没有一键恢复入口。'
  if (modal === 'kb-delete')
    consequence = has(scene, 'delete-empty')
      ? '这是一个空知识库，删除后不影响任何文档。'
      : after
        ? '知识库及其下级目录会删除。8 篇文档保留，但目录归属将清空。当前没有一键恢复入口。'
        : '里面的 8 篇文档会保留，指派清空后回到库根。'

  return (
    <section
      data-side={after ? 'after' : 'before'}
      className={`pane ${after ? 'after' : 'before'}`}
      ref={host}
      aria-label={after ? '打磨后界面' : '当前界面'}
      onKeyDown={(event) => {
        if (after && event.nativeEvent.isComposing && event.key === 'Escape') {
          event.stopPropagation()
          return
        }
        if (
          event.key === 'ArrowDown' &&
          !menu &&
          event.target instanceof HTMLElement &&
          event.target.closest('button[aria-haspopup=menu]')
        ) {
          event.preventDefault()
          event.target.closest<HTMLButtonElement>('button')?.click()
          return
        }
        if (event.key === 'F6') {
          event.preventDefault()
          const dest = event.shiftKey
            ? host.current?.querySelector<HTMLElement>(
                '.dialog input,.dialog button:not(:disabled),.focus-fallback',
              )
            : host.current?.querySelector<HTMLElement>('.simulation button')
          dest?.focus()
          return
        }
        if (event.key === 'Escape' && (modal || menu)) {
          event.stopPropagation()
          dismiss()
        }
      }}
    >
      <div className="pane-label">
        <strong>{after ? '打磨后' : '当前'}</strong>
        <span>{after ? '待认可的独立方案' : '依据当前源码与运行截图'}</span>
      </div>
      <div
        aria-label={after ? '打磨后产品画布' : '当前产品画布'}
        className={`surface ${is(scene, 'LIB-048') ? 'force-narrow' : ''}`}
      >
        <div className="product-page">
          {importOpen && (
            <section className="inline-import">
              <div className="import-heading">
                <strong>文件导入</strong>
                <span>设计工作台{location ? '/' + location : ''}</span>
              </div>
              <div className="import-file">
                <FileText size={17} />
                <span>研究笔记.pdf</span>
                <span className={importStatus === 'failed' ? 'failed' : 'ready'}>
                  {importStatus === 'busy'
                    ? '上传中…'
                    : importStatus === 'failed'
                      ? '未保存：网络连接中断'
                      : '原件已保存'}
                </span>
              </div>
              {importStatus === 'mixed' && (
                <div className="import-file">
                  <FileText size={17} />
                  <span>设计规范.docx</span>
                  <span className="failed">未保存：连接中断</span>
                </div>
              )}
              <p>
                {importStatus === 'busy'
                  ? '正在提交文件，不显示虚构百分比。'
                  : importStatus === 'mixed'
                    ? '1 个成功，1 个失败。失败文件需重新选择上传。'
                    : importStatus === 'failed'
                      ? '全部失败，可以重新选择文件。'
                      : '导入完成，文档列表将刷新。'}
              </p>
              {importStatus !== 'busy' && <Btn onClick={() => setImportOpen(false)}>清空结果</Btn>}
            </section>
          )}
          {!needsEmptyGuide && !isTag && (
            <div className="topbar">
              <span>知识库</span>
              <ChevronRight size={14} />
              <strong>{headline}</strong>
            </div>
          )}
          {needsEmptyGuide ? (
            <div className="onboard">
              <h1>先创建一个知识库</h1>
              <p>
                知识库是内容的容器：文档、网页、笔记都收在里面。
                <br />
                还没有知识库时，「全部文档」也不存在——所有内容都要有归属。
              </p>
              <Btn
                className="primary focus-fallback"
                icon={<Plus size={16} />}
                onClick={() => openModal('kb-create')}
              >
                创建知识库
              </Btn>
            </div>
          ) : openDoc ? (
            <div className="detail-view">
              <Btn
                className="text focus-fallback"
                icon={<ArrowLeft size={16} />}
                onClick={() => {
                  setOpenDoc(false)
                  setModal(null)
                }}
              >
                返回知识库
              </Btn>
              <div className="detail-title">
                <h1>
                  <Name doc={target} />
                </h1>
                <Btn
                  icon={<Ellipsis size={17} />}
                  aria-haspopup="menu"
                  aria-label="文档目录菜单"
                  onClick={(event) => openMenu('detail', event)}
                >
                  目录
                </Btn>
              </div>
              <p className="muted">
                {target.ext ? `${target.kind} 文件 · ${target.detail}` : '笔记 · ' + kbName} ·
                位置：{target.location === '__unassigned__' ? '无目录归属' : target.location}
              </p>
              <div className="handoff-content">
                <h2>{is(scene, 'LIB-P08') ? '浏览页保持专注于浏览' : '文档操作交接'}</h2>
                <p>
                  打开与编辑沿用现有文档能力。重命名仅支持笔记；移动通过已批准的文档命令或详情目录菜单完成。
                </p>
                <p>本轮不新增浏览页移动或重命名，不修改阅读器与 Office 工具栏。</p>
                <div className="actions">
                  <Btn disabled={target.kind !== '笔记'} onClick={() => openModal('rename-note')}>
                    重命名笔记
                  </Btn>
                  <Btn onClick={() => openModal('move')}>移动到目录</Btn>
                </div>
                {is(scene, 'LIB-046') && (
                  <Notice>
                    移动成功后的撤销沿用现有 8 秒合同；评审模拟不运行真实计时。
                    <Btn className="text" onClick={undoMove}>
                      撤销移动
                    </Btn>
                  </Notice>
                )}
              </div>
            </div>
          ) : (
            <>
              <header className="identity">
                <h1 title={headline}>
                  {isTag ? '#' + (has(scene, 'long-tag') ? longTitle : '设计研究') : headline}
                </h1>
                {!isTag && !has(scene, 'no-description') && hasLibrary && !missingRoot && (
                  <p
                    className={`description ${after && longDesc && !showDescription ? 'clamped' : ''}`}
                  >
                    {longDesc ? longDescription : kbDescription}
                  </p>
                )}
                {after && longDesc && (
                  <Btn
                    className="text description-toggle"
                    onClick={() => setShowDescription(!showDescription)}
                  >
                    {showDescription ? '收起描述' : '展开完整描述'}
                    <ChevronDown size={13} />
                  </Btn>
                )}
                {!isTag && (
                  <div className="meta">
                    <span>
                      {listState === 'loading'
                        ? '正在读取文档'
                        : maxCount && after
                          ? `已显示 ${listDocs.length} 个文档`
                          : `${empty ? 0 : listDocs.length} 个文档`}
                    </span>
                    {!has(scene, 'missing-code') && hasLibrary && !missingRoot && (
                      <Btn
                        className="text id-copy focus-fallback"
                        title="点击复制知识库 ID"
                        aria-label="知识库 ID DSN8K2，点击复制"
                        onClick={() => {
                          setCopied(!has(scene, 'clipboard-error'))
                          setToast(
                            has(scene, 'clipboard-error')
                              ? '复制失败，请手动选中复制'
                              : '已复制知识库 ID（模拟）',
                          )
                        }}
                      >
                        <span>知识库 ID：</span>
                        <code>DSN8K2</code>
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                      </Btn>
                    )}
                  </div>
                )}
                <div className="toolbar">
                  {!isTag && (
                    <>
                      <Btn
                        className="primary focus-fallback"
                        aria-haspopup="menu"
                        icon={<Plus size={16} />}
                        onClick={(event) => openMenu('add', event)}
                      >
                        添加文档
                      </Btn>
                      <div className="creation">
                        <Btn
                          className="new-file"
                          disabled={after && pending && !modal}
                          icon={
                            after && pending && !modal ? (
                              <LoaderCircle size={15} className="spin" />
                            ) : (
                              <FilePlus2 size={15} />
                            )
                          }
                          onClick={() => menuAction('file')}
                        >
                          新建文件
                        </Btn>
                        <Btn
                          className="new-folder"
                          icon={<FolderPlus size={16} />}
                          disabled={
                            missingChild ||
                            has(scene, 'missing-node-disabled') ||
                            (is(scene, 'LIB-049') && has(scene, 'disabled'))
                          }
                          onClick={() => openModal('folder-create')}
                        >
                          新建文件夹
                        </Btn>
                        <Btn
                          aria-haspopup="menu"
                          className="new-combined"
                          icon={<ChevronDown size={14} />}
                          onClick={(event) => openMenu('new', event)}
                        >
                          新建
                        </Btn>
                      </div>
                    </>
                  )}
                  <div className="layout-switch" role="group" aria-label="文档布局">
                    <Btn
                      className={layout === 'list' ? 'selected' : 'text'}
                      icon={<List size={16} />}
                      aria-pressed={layout === 'list'}
                      onClick={() => {
                        setLayout('list')
                        if (has(scene, 'storage-unavailable'))
                          setToast('存储偏好不可用，本次布局切换仍生效（模拟）')
                      }}
                    >
                      列表
                    </Btn>
                    <Btn
                      className={layout === 'card' ? 'selected' : 'text'}
                      icon={<LayoutGrid size={16} />}
                      aria-pressed={layout === 'card'}
                      onClick={() => {
                        setLayout('card')
                        if (has(scene, 'reload'))
                          setToast('布局偏好将沿用本次选择；重载行为在评审工具中模拟')
                      }}
                    >
                      卡片
                    </Btn>
                  </div>
                </div>
                <div className="section-head">
                  <nav aria-label="当前目录" className={`crumbs ${showFullPath ? 'expanded' : ''}`}>
                    <Btn
                      className="text crumb"
                      onClick={() => {
                        setLocation('')
                        setToast('已返回当前知识库根；知识库身份不变')
                      }}
                    >
                      文档
                    </Btn>
                    {location && (
                      <>
                        <span>/</span>
                        {after && location.split('/').length > 2 && !showFullPath ? (
                          <>
                            <Btn
                              className="text"
                              aria-label="展开完整目录路径"
                              onClick={() => setShowFullPath(true)}
                            >
                              …
                            </Btn>
                            <span>/</span>
                            <strong>{location.split('/').at(-1)}</strong>
                          </>
                        ) : (
                          location.split('/').map((part, index, parts) => (
                            <span className="crumb-part" key={part}>
                              {index > 0 && <span>/</span>}
                              {index === parts.length - 1 ? (
                                <strong>{part}</strong>
                              ) : (
                                <Btn
                                  className="text crumb"
                                  onClick={() => setLocation(parts.slice(0, index + 1).join('/'))}
                                >
                                  {part}
                                </Btn>
                              )}
                            </span>
                          ))
                        )}
                      </>
                    )}
                  </nav>
                  {!isTag && (
                    <span className="section-hint">
                      {after ? '含当前目录及其下级文档' : '可拖入文件上传，单文件不超过 50 MB'}
                    </span>
                  )}
                </div>
              </header>
              <div
                className="library-body"
                onScroll={(event) =>
                  event.currentTarget.classList.toggle(
                    'scrolled',
                    event.currentTarget.scrollTop > 0,
                  )
                }
              >
                {after && maxCount && (
                  <Notice>当前最多显示最近更新的 100 个文档，包含下级目录。</Notice>
                )}
                {after && switching && (
                  <Notice>
                    <LoaderCircle size={15} className="spin" />
                    正在读取「参考资料」；以下内容仍来自上一个目录。
                  </Notice>
                )}
                {cachedError && after && (
                  <Notice error>
                    刷新失败，保留上一次读取的内容。
                    <Btn
                      className="text"
                      onClick={() => {
                        setListState('loading')
                        setToast('正在重试读取；在评审工具选择结果')
                      }}
                    >
                      重新读取
                    </Btn>
                  </Notice>
                )}
                {listState === 'loading' ? (
                  <div className="skeleton" aria-label="正在读取文档列表">
                    {[0, 1, 2, 3, 4].map((index) => (
                      <span key={index} />
                    ))}
                  </div>
                ) : (listState === 'error' && !(cachedError && after)) ||
                  (cachedError && !after) ? (
                  <div className="empty-block">
                    <RefreshCw size={30} />
                    <h2>文档列表读取失败</h2>
                    <p>数据没有丢失，请重新读取。</p>
                    <Btn
                      onClick={() => {
                        setListState('loading')
                        setToast('正在重试；使用评审结果控件结束请求')
                      }}
                    >
                      重试
                    </Btn>
                  </div>
                ) : missingRoot && (after || hasLibrary) ? (
                  <div className="empty-block">
                    <Folder size={32} />
                    <h2>这个知识库不存在（可能已被删除）</h2>
                    <p>
                      {after && !hasLibrary
                        ? '当前没有可访问的知识库，请创建一个。'
                        : '可以返回仍然存在的知识库。'}
                    </p>
                    <Btn
                      className="primary"
                      onClick={() => {
                        if (!hasLibrary) openModal('kb-create')
                        else {
                          setLocation('')
                          setRecovered(true)
                          setToast('已返回第一个有效知识库（模拟）')
                        }
                      }}
                    >
                      {hasLibrary ? '返回知识库' : '创建知识库'}
                    </Btn>
                  </div>
                ) : missingChild && after ? (
                  <div className="empty-block">
                    <Folder size={32} />
                    <h2>这个目录不存在</h2>
                    <p>它可能已被重命名或删除，知识库仍然可用。</p>
                    <Btn
                      onClick={() => {
                        setLocation('')
                        setToast('已返回「设计工作台」根目录（模拟）')
                      }}
                    >
                      返回知识库根目录
                    </Btn>
                  </div>
                ) : empty ? (
                  <div className="empty-block">
                    <Folder size={32} />
                    <h2>{after && isTag ? '还没有带「设计研究」标签的文档' : '这里还是空的'}</h2>
                    <p>
                      {after && isTag
                        ? '可在文档中添加这个标签后，再回到这里查看。'
                        : after
                          ? `可以上传文件，或在${location ? '此目录' : '知识库'}直接写一篇笔记。`
                          : '拖文件到本页，或用右上角「添加文档」收进来'}
                    </p>
                    {!isTag && (
                      <div className="actions">
                        <Btn
                          icon={<Upload size={16} />}
                          onClick={() => {
                            setCaptureEntry('upload-file')
                            openModal('capture')
                          }}
                        >
                          上传文件
                        </Btn>
                        <Btn className="primary" onClick={() => menuAction('edit-now')}>
                          直接编辑
                        </Btn>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {layout === 'list' ? (
                      <div className="document-list">
                        <div
                          className={`list-head ${after ? 'has-actions' : ''} ${hasFailed ? 'has-status' : ''}`}
                          aria-hidden="true"
                        >
                          <span />
                          <span>名称</span>
                          <span className="details-cell">详情</span>
                          {hasFailed && <span className="status-cell">状态</span>}
                          <span className="date-cell">更新时间</span>
                          {after && <span className="more-cell" />}
                        </div>
                        {!isTag &&
                          folders.map((folder) => (
                            <div
                              className={`row folder-row ${after ? 'has-actions' : ''} ${hasFailed ? 'has-status' : ''}`}
                              key={folder.name}
                              onClick={(event) => {
                                if (
                                  !(event.target instanceof Element) ||
                                  !event.target.closest('button')
                                )
                                  setLocation(folder.path)
                              }}
                            >
                              <span className="file-icon">
                                <Folder size={19} />
                              </span>
                              <button
                                type="button"
                                className="title-button"
                                title={folder.name}
                                onClick={() => {
                                  setLocation(folder.path)
                                  setToast('已进入子目录；根知识库名称、描述与ID保持不变')
                                }}
                              >
                                {folder.name}
                              </button>
                              <span className="details-cell">{folder.count} 个文档</span>
                              {hasFailed && <span className="status-cell" />}
                              <span className="date-cell" />
                              <Btn
                                className="text icon-btn folder-more"
                                aria-haspopup="menu"
                                aria-label={`${folder.name} 的更多操作`}
                                icon={<Ellipsis size={17} />}
                                onClick={(event) => openMenu('folder', event, undefined, folder)}
                              />
                            </div>
                          ))}
                        {listDocs.map((doc) => (
                          <DocRowElement
                            className={`row document-row ${after ? 'has-actions' : ''} ${hasFailed ? 'has-status' : ''}`}
                            key={doc.id}
                            type={after ? undefined : 'button'}
                            onClick={() => {
                              if (!after) openDocument(doc)
                            }}
                          >
                            <span className={`file-icon tone-${doc.kind}`}>
                              <Icon doc={doc} />
                            </span>
                            {after ? (
                              <button
                                type="button"
                                className="title-button"
                                onClick={() => openDocument(doc)}
                              >
                                <Name doc={doc} />
                                {doc.status === '提取失败' && (
                                  <span className="failed compact-status">提取失败</span>
                                )}
                              </button>
                            ) : (
                              <span className="title-button">
                                {' '}
                                <Name doc={doc} />
                                {doc.status === '提取失败' && (
                                  <span className="failed compact-status">提取失败</span>
                                )}
                              </span>
                            )}
                            <span
                              className="details-cell"
                              title={doc.location + ' · ' + doc.detail}
                            >
                              {doc.location !== '当前目录' ? doc.location + ' · ' : ''}
                              {doc.detail}
                            </span>
                            {hasFailed && (
                              <span className="status-cell">
                                {doc.status === '提取失败' && (
                                  <span className="failed">提取失败</span>
                                )}
                              </span>
                            )}
                            <span className="date-cell">{doc.date}</span>
                            {after && (
                              <Btn
                                className="text icon-btn more-cell"
                                icon={<Ellipsis size={17} />}
                                aria-haspopup="menu"
                                aria-label={`${doc.title} 的更多操作`}
                                onClick={(event) => openMenu('doc', event, doc)}
                              />
                            )}
                          </DocRowElement>
                        ))}
                      </div>
                    ) : (
                      <div className="card-grid">
                        {!isTag &&
                          folders.map((folder) => (
                            <article
                              className="document-card folder-card"
                              key={folder.name}
                              onClick={() => setLocation(folder.path)}
                            >
                              <div className="card-heading">
                                <Folder size={20} />
                                <button
                                  type="button"
                                  className="title-button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setLocation(folder.path)
                                  }}
                                >
                                  {folder.name}
                                </button>
                                <span className="kind-chip">文件夹</span>
                                <Btn
                                  className="text icon-btn"
                                  icon={<Ellipsis size={17} />}
                                  aria-haspopup="menu"
                                  aria-label={`${folder.name} 的更多操作`}
                                  onClick={(event) => openMenu('folder', event, undefined, folder)}
                                />
                              </div>
                              <p>{folder.count} 个文档</p>
                            </article>
                          ))}
                        {listDocs.map((doc) => (
                          <article
                            className="document-card"
                            key={doc.id}
                            onClick={() => openDocument(doc)}
                          >
                            <div className="card-heading">
                              <span className={`file-icon tone-${doc.kind}`}>
                                <Icon doc={doc} />
                              </span>
                              <button
                                type="button"
                                className="title-button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  openDocument(doc)
                                }}
                              >
                                <Name doc={doc} />
                              </button>
                              {!doc.ext && <span className="kind-chip">{doc.kind}</span>}
                              <Btn
                                className="text icon-btn"
                                icon={<Ellipsis size={17} />}
                                aria-haspopup="menu"
                                aria-label={`${doc.title} 的更多操作`}
                                onClick={(event) => openMenu('doc', event, doc)}
                              />
                            </div>
                            <p title={doc.location + ' · ' + doc.detail}>
                              {doc.location} · {doc.detail}
                            </p>
                            <footer>
                              <span className={doc.status === '提取失败' ? 'failed' : 'ready'}>
                                {doc.status}
                              </span>
                              <time>{doc.date}</time>
                            </footer>
                          </article>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {is(scene, 'LIB-043') && (
                  <div className="sidebar-handoff">
                    <h2>侧边栏知识库入口 · 复用第二模块</h2>
                    <div className="sidebar-kb">
                      <Folder size={16} />
                      <strong>{kbName}</strong>
                      <Btn
                        className="text icon-btn"
                        icon={<Ellipsis size={17} />}
                        aria-haspopup="menu"
                        aria-label="知识库操作"
                        onClick={(event) => openMenu('kb', event)}
                      />
                    </div>
                    <p>编辑名称和描述由侧边栏进入；浏览主区不新增编辑按钮。</p>
                  </div>
                )}
              </div>
            </>
          )}
          {is(scene, 'LIB-041') &&
            !has(scene, 'tag-disabled', 'nonfiles-ignore', 'empty-ignore') && (
              <div className="drag-layer">
                <Upload size={30} />
                <strong>松开即上传到当前知识库</strong>
                <span>设计工作台{location && '/' + location}</span>
                <small>文件拖入效果模拟；不支持目录重排</small>
              </div>
            )}
        </div>
        {activeMenu && (
          <div
            className="menu-dismiss"
            onClick={() => {
              setMenu(null)
              origin.current?.focus()
            }}
          />
        )}
        {activeMenu && (
          <div
            role="menu"
            tabIndex={-1}
            aria-label="更多操作"
            className="menu"
            style={{ top: Math.max(90, menuPos.top), right: menuPos.right }}
            onKeyDown={menuKey}
          >
            {menuItems.map(([key, label, ItemIcon]) => (
              <button
                key={key + label}
                type="button"
                role="menuitem"
                className={key.includes('delete') || key === 'remove' ? 'danger-text' : ''}
                disabled={(key === 'folder' && missingChild) || key === 'detail-current'}
                onClick={() => menuAction(key)}
              >
                <ItemIcon size={15} />
                {label}
              </button>
            ))}
          </div>
        )}
        {modal && (
          <div
            className="modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !danger) dismiss()
            }}
          >
            <Dialog title={title} busy={locked} initialCancel={danger} onClose={dismiss}>
              {currentReplacementGap ? (
                <div className="native-boundary">
                  <File size={30} />
                  <h3>由系统文件选择器接管</h3>
                  <p>当前没有自定义替换弹窗、等待状态或保留文件重试。这里不伪造系统选择器。</p>
                  <p>
                    目标：{target.title}
                    {target.ext}
                  </p>
                  {selectedFile && <p>模拟已选择：{selectedFile}</p>}
                  <Btn onClick={() => setSelectedFile('知识管理研究修订版.pdf')}>模拟选择文件</Btn>
                  <Btn disabled={!selectedFile} onClick={() => request()}>
                    模拟开始请求
                  </Btn>
                  <Btn onClick={dismiss}>模拟原生取消</Btn>
                </div>
              ) : danger ? (
                <>
                  <div className="danger-content">
                    <p>{consequence}</p>
                  </div>
                  {phase === 'error' && (
                    <Notice error>删除失败：网络连接中断。对象未变，可重试或取消。</Notice>
                  )}
                  <div className="modal-footer">
                    <Btn className="cancel" disabled={locked} onClick={dismiss}>
                      取消
                    </Btn>
                    <Btn
                      className="danger"
                      disabled={locked}
                      icon={pending ? <LoaderCircle size={15} className="spin" /> : undefined}
                      onClick={() => request()}
                    >
                      {pending ? '正在删除' : phase === 'error' ? '重试删除' : '删除'}
                    </Btn>
                  </div>
                </>
              ) : modal === 'guard' ? (
                <>
                  <p>离开前请处理当前文档的修改。</p>
                  <div className="modal-footer">
                    <Btn className="cancel" onClick={dismiss}>
                      继续编辑
                    </Btn>
                    <Btn
                      onClick={() => {
                        dismiss()
                        setToast('已放弃本次模拟修改，继续原导航')
                      }}
                    >
                      放弃修改
                    </Btn>
                    <Btn
                      className="primary"
                      onClick={() => {
                        setPhase('pending')
                        setToast('保存后继续由已批准的未保存守卫处理')
                      }}
                    >
                      保存后继续
                    </Btn>
                  </div>
                </>
              ) : modal === 'download' ? (
                <>
                  <div className="native-boundary">
                    <Download size={30} />
                    <h3>
                      {target.title}
                      {target.ext}
                    </h3>
                    <p>
                      浏览器接管原件下载。点击链接无法证明下载完成，当前无下载完成或网络失败的应用内反馈。
                    </p>
                    <p>
                      此 HTML 不请求业务接口，不产生真实下载。原件内容、权限和宿主下载记录另行验证。
                    </p>
                  </div>
                  <div className="modal-footer">
                    <Btn className="cancel" onClick={dismiss}>
                      返回列表
                    </Btn>
                  </div>
                </>
              ) : modal === 'capture' ? (
                <>
                  <div className="capture-handoff">
                    <div className="tabs">
                      <strong>{captureEntry === 'capture-url' ? '网页收集' : '文件导入'}</strong>
                      <span>{captureEntry === 'capture-url' ? '文件导入' : '网页收集'}</span>
                    </div>
                    <p>
                      目标目录：{kbName}
                      {location && '/' + location}
                    </p>
                    {captureEntry === 'capture-url' ? (
                      <>
                        <label htmlFor={(after ? 'a' : 'b') + '-url'}>网页链接</label>
                        <input
                          id={(after ? 'a' : 'b') + '-url'}
                          placeholder="粘贴网页、公众号文章或 GitHub 仓库链接"
                        />
                      </>
                    ) : (
                      <div className="native-boundary">
                        <Upload size={26} />
                        <h3>
                          {captureEntry === 'upload-folder' ? '选择文件夹导入' : '选择文件导入'}
                        </h3>
                        <p>
                          {captureEntry === 'upload-folder'
                            ? '请求系统文件夹选择器；文件夹导入上下文 directory=true。'
                            : '请求系统文件选择器；允许多个文件。'}
                        </p>
                        <p>此处不仿造操作系统选择器，原生选择、取消与实际上传在宿主另验。</p>
                      </div>
                    )}
                    <p className="muted">
                      准确交接到第四模块；完整来源判断、文件选择、部分成功与失败恢复沿用已认可稿，不重新设计。
                    </p>
                  </div>
                  <div className="modal-footer">
                    <Btn className="cancel" onClick={dismiss}>
                      返回知识库
                    </Btn>
                  </div>
                </>
              ) : (
                <form onSubmit={request}>
                  {modal === 'replace' ? (
                    <>
                      <p>
                        目标文件：
                        <strong>
                          {target.title}
                          {target.ext}
                        </strong>
                      </p>
                      <p className="muted">替换会更新原件及提取正文；原文件将被覆盖。</p>
                      <div className="replace-file">
                        <FileText size={22} />
                        <span>{selectedFile || '尚未选择替换文件'}</span>
                        <Btn
                          disabled={pending}
                          onClick={() => {
                            setSelectedFile('知识管理研究修订版.pdf')
                            setPhase('idle')
                            setFieldError('')
                          }}
                        >
                          {selectedFile
                            ? has(scene, 'same-file-reselect')
                              ? '再次选择同一文件'
                              : '重新选择'
                            : '选择文件'}
                        </Btn>
                      </div>
                      <p className="muted">
                        文件选择在此模拟，系统原生取消不改变原件；失败后可重新选择。
                      </p>
                      {phase === 'success' && (
                        <Notice>
                          {parseOutcome === 'error'
                            ? '原件已保存，正文提取失败；文件仍可打开。'
                            : parseOutcome === 'empty'
                              ? '原件已保存，未提取到可搜索正文。'
                              : '原件已替换，正文已更新。'}
                        </Notice>
                      )}
                    </>
                  ) : modal === 'move' ? (
                    <>
                      <p>文档：{target.title}</p>
                      <label htmlFor={(after ? 'a' : 'b') + '-move'}>目标目录</label>
                      {readPhase === 'loading' && !committed ? (
                        <p>
                          <LoaderCircle size={16} className="spin" /> 正在读取目录…
                        </p>
                      ) : readPhase === 'error' && !committed ? (
                        <Notice error>
                          目录读取失败
                          <Btn onClick={() => setReadPhase('ready')}>重新读取目录（模拟成功）</Btn>
                        </Notice>
                      ) : (
                        <select
                          id={(after ? 'a' : 'b') + '-move'}
                          value={moveTo}
                          disabled={pending}
                          onChange={(event) => setMoveTo(event.target.value)}
                        >
                          <option value="设计工作台/当前目录">设计工作台 / 当前目录</option>
                          <option value="设计工作台/参考资料">设计工作台 / 参考资料</option>
                          <option value="设计工作台/灵感收集">设计工作台 / 灵感收集</option>
                          <option value="">知识库根</option>
                        </select>
                      )}
                      <p className="muted">
                        空值会清空目录归属，不表示当前知识库根。复用第三模块命令合同。
                      </p>
                    </>
                  ) : (
                    <>
                      <label htmlFor={(after ? 'a' : 'b') + '-name'}>
                        {modal === 'rename-note'
                          ? '笔记名称'
                          : modal?.startsWith('kb')
                            ? '知识库名称'
                            : '文件夹名称'}
                      </label>
                      <input
                        id={(after ? 'a' : 'b') + '-name'}
                        value={value}
                        maxLength={60}
                        autoComplete="off"
                        disabled={locked || committed}
                        aria-invalid={Boolean(fieldError)}
                        aria-describedby={
                          fieldError ? (after ? 'a' : 'b') + '-field-error' : undefined
                        }
                        placeholder={modal === 'folder-create' ? '如：参考资料' : '请输入名称'}
                        onChange={(event) => {
                          setValue(event.target.value)
                          setFieldError('')
                        }}
                        onKeyDown={(event) => {
                          if (
                            (after || modal?.startsWith('kb') || modal === 'rename-note') &&
                            event.key === 'Enter' &&
                            event.nativeEvent.isComposing
                          )
                            event.preventDefault()
                          if (
                            !after &&
                            event.key === 'Enter' &&
                            value.includes('/') &&
                            modal === 'folder-create'
                          ) {
                            event.preventDefault()
                            setToast('当前 Enter 遇到 / 静默不提交；提案统一字段错误')
                          }
                        }}
                      />
                      {modal?.startsWith('kb') && (
                        <>
                          <label
                            className="description-label"
                            htmlFor={(after ? 'a' : 'b') + '-description'}
                          >
                            描述 <span className="muted">选填</span>
                          </label>
                          <textarea
                            id={(after ? 'a' : 'b') + '-description'}
                            value={description}
                            disabled={pending}
                            rows={4}
                            aria-invalid={
                              description.length > 500 && !descriptionLegacyUnchanged(description)
                            }
                            onChange={(event) => setDescription(event.target.value)}
                          />
                          <div className="char-count">
                            {description.length} / 500
                            {has(scene, 'legacy-description') && ' · 原有长描述可保持不变保存'}
                          </div>
                        </>
                      )}
                      {after && !modal?.startsWith('kb') && modal !== 'rename-note' && (
                        <p className="muted form-hint">
                          名称不超过 60 字，不能包含 /。
                          {modal === 'folder-rename'
                            ? '仅更改名称，目录位置保持不变。'
                            : '将在当前目录下新建。'}
                        </p>
                      )}
                    </>
                  )}
                  {fieldError && (
                    <div
                      id={(after ? 'a' : 'b') + '-field-error'}
                      role="alert"
                      className="field-error"
                    >
                      {fieldError}
                    </div>
                  )}
                  {phase === 'error' &&
                    (after ||
                      modal?.startsWith('kb') ||
                      modal === 'move' ||
                      modal === 'rename-note') && (
                      <Notice error>
                        {has(scene, 'reconcile-error', 'read-refresh-error')
                          ? committed
                            ? '写入已经生效，但重新读取失败。仅重新读取，不重复提交。'
                            : '无法确认最新目录信息，草稿已保留。请重新读取后重试。'
                          : '请求失败：连接中断。草稿已保留，可重试。'}
                      </Notice>
                    )}
                  <div className="modal-footer">
                    <Btn className="cancel" disabled={locked} onClick={dismiss}>
                      {phase === 'success' ? '完成' : '取消'}
                    </Btn>
                    {phase !== 'success' && (
                      <button
                        type="submit"
                        className="btn primary"
                        disabled={
                          locked ||
                          (modal === 'kb-edit' &&
                            has(scene, 'reconcile-error') &&
                            readPhase !== 'ready') ||
                          (modal === 'move' && readPhase !== 'ready' && !committed) ||
                          (modal !== 'replace' && modal !== 'move' && !value.trim()) ||
                          (modal === 'replace' && !selectedFile)
                        }
                      >
                        {pending && <LoaderCircle size={15} className="spin" />}
                        {pending
                          ? '正在提交'
                          : phase === 'error'
                            ? committed
                              ? '重新读取'
                              : '重试'
                            : modal === 'folder-create'
                              ? '创建'
                              : modal === 'folder-rename'
                                ? '重命名'
                                : modal === 'move'
                                  ? '移动'
                                  : modal === 'replace'
                                    ? '替换原件'
                                    : '保存'}
                      </button>
                    )}
                  </div>
                </form>
              )}
            </Dialog>
          </div>
        )}
        {toast && (
          <div className="toast" role="status">
            <span>{toast}</span>
            <Btn
              className="text icon-btn"
              aria-label="关闭反馈"
              icon={<X size={14} />}
              onClick={() => setToast('')}
            />
          </div>
        )}
      </div>
      <div className="simulation">
        <div>
          <strong>评审模拟</strong>
          <span>下列属于审阅工具，非产品功能。F6 跳到结果控件；Shift+F6 返回画面。</span>
        </div>
        <div className="simulation-actions">
          {modal === 'kb-edit' && has(scene, 'reconcile-error') && readPhase !== 'ready' && (
            <Btn
              onClick={() => {
                setReadPhase('ready')
                setToast('已按知识库 ID DSN8K2 读取最新路径；草稿保持，可重新保存（模拟）')
              }}
            >
              模拟按稳定 ID 对账成功
            </Btn>
          )}
          {(pending || committed) && (
            <>
              <Btn onClick={() => finish(true)}>模拟请求成功</Btn>
              <Btn onClick={() => finish(false)}>模拟请求失败</Btn>
            </>
          )}
          {modal === 'move' && readPhase !== 'ready' && !committed && (
            <>
              <Btn
                onClick={() => {
                  setReadPhase('ready')
                  setToast('目录已读取（模拟）')
                }}
              >
                模拟目录读取成功
              </Btn>
              <Btn
                onClick={() => {
                  setReadPhase('error')
                  setToast('目录读取失败，未提交移动')
                }}
              >
                模拟目录读取失败
              </Btn>
            </>
          )}
          {modal === 'replace' && after && (pending || phase === 'success') && (
            <>
              <Btn onClick={() => finish(true, 'empty')}>原件保存 / 无正文</Btn>
              <Btn onClick={() => finish(true, 'error')}>原件保存 / 提取失败</Btn>
            </>
          )}
          {(listState === 'loading' || switching || cachedError) && (
            <>
              <Btn
                onClick={() => {
                  setListState('ready')
                  setQueryFinished(true)
                }}
              >
                读取成功
              </Btn>
              <Btn
                onClick={() => {
                  setListState('error')
                  setQueryFinished(true)
                }}
              >
                读取失败
              </Btn>
            </>
          )}
          {is(scene, 'LIB-041', 'LIB-042') && (
            <>
              <Btn
                onClick={() => {
                  if (isTag || has(scene, 'nonfiles-ignore', 'empty-ignore')) {
                    setToast('当前输入被忽略，不创建导入批次。')
                    return
                  }
                  setImportOpen(true)
                  setImportStatus('busy')
                  setToast('已模拟接收文件，当前目录锁定')
                }}
              >
                模拟拖入文件
              </Btn>
              <Btn
                onClick={() => {
                  setImportOpen(true)
                  setImportStatus('mixed')
                }}
              >
                模拟部分失败
              </Btn>
              <Btn
                onClick={() => {
                  setImportOpen(true)
                  setImportStatus('complete')
                }}
              >
                模拟导入完成
              </Btn>
            </>
          )}
          {is(scene, 'LIB-007') && (
            <Btn
              onClick={() =>
                setToast(`模拟重载：恢复${layout === 'list' ? '列表' : '卡片'}偏好；未写产品存储`)
              }
            >
              模拟重载偏好
            </Btn>
          )}
          {is(scene, 'LIB-009') && !pending && (
            <Btn onClick={() => menuAction('file')}>触发新建文件请求</Btn>
          )}
          {is(scene, 'LIB-001') && (
            <Btn
              onClick={() => {
                setHasLibrary(true)
                setListState('ready')
                setToast('/docs?scope=all → 首个知识库（replace历史）')
              }}
            >
              模拟首库重定向
            </Btn>
          )}
          {is(scene, 'LIB-046') && (
            <Btn
              onClick={() => setToast('撤销失败：连接中断。当前移动结果仍生效；可重新选择原目录。')}
            >
              模拟撤销失败
            </Btn>
          )}
          {is(scene, 'LIB-049') && (
            <span className="simulation-hint">
              {has(scene, 'disabled')
                ? '当前目录节点不可用：新建文件夹禁用，不能触发请求。'
                : has(scene, 'pressed')
                  ? '按住添加文档按钮：仅背景变化；松开后菜单出现，边框始终1px。'
                  : has(scene, 'focus-return')
                    ? '点击文件夹更多→重命名→取消；焦点应回到原更多按钮。'
                    : 'Tab聚焦更多，Enter或方向键展开，方向键遍历，Escape回到原按钮。'}
            </span>
          )}
          {!modal && listState !== 'loading' && !pending && (
            <span className="simulation-hint">
              可直接点击画面内的菜单、布局、目录、文件和表单。
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
function Dialog({
  title,
  children,
  busy,
  initialCancel,
  onClose,
}: {
  title: string
  children: ReactNode
  busy: boolean
  initialCancel: boolean
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    const focus = initialCancel
      ? el?.querySelector<HTMLElement>('.cancel')
      : el?.querySelector<HTMLElement>('input,textarea,select,button:not(.close)')
    focus?.focus()
  }, [initialCancel])
  function trap(event: KeyboardEvent) {
    if (event.key !== 'Tab') return
    const nodes = Array.from(
      ref.current!.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
      ),
    )
    if (!nodes.length) {
      event.preventDefault()
      return
    }
    const first = nodes[0]!
    const last = nodes.at(-1)!
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
  return (
    <div
      className="dialog"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-busy={busy}
      ref={ref}
      onKeyDown={trap}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <Btn
          className="text close icon-btn"
          disabled={busy}
          aria-label="关闭弹窗"
          icon={<X size={18} />}
          onClick={onClose}
        />
      </div>
      <div className="dialog-content">{children}</div>
    </div>
  )
}
function readHash() {
  const id = new URLSearchParams(location.hash.slice(1)).get('scene')
  return allScenes.find((s) => s.id === id) ?? allScenes.find((s) => s.id === 'LIB-026.open')!
}
function App() {
  const [scene, setScene] = useState(readHash)
  const [search, setSearch] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    has(readHash(), '390-dark') ? 'dark' : 'light',
  )
  const [mode, setMode] = useState('after')
  const [size, setSize] = useState(() =>
    has(
      readHash(),
      '390-light',
      '390-dark',
      '390',
      'narrow-failed',
      'narrow-hidden',
      'narrow-menu',
      'touch-actions',
      'layout-wrap',
    )
      ? 'mobile'
      : has(readHash(), 'low-height')
        ? 'low'
        : 'desktop',
  )
  const [zoom, setZoom] = useState(false)
  const [reduced, setReduced] = useState(() => has(readHash(), 'reduced-motion'))
  const [navOpen, setNavOpen] = useState(false)
  const itemScenes = allScenes.filter((s) => s.itemId === scene.itemId)
  const itemHeads = allScenes.filter(
    (s, i, all) => all.findIndex((x) => x.itemId === s.itemId) === i,
  )
  const found = itemHeads.filter((s) =>
    (s.itemId + s.label + s.currentBehavior).toLowerCase().includes(search.toLowerCase()),
  )
  function select(next: Scene) {
    setScene(next)
    history.replaceState(null, '', '#scene=' + next.id)
    setNavOpen(false)
    if (
      has(
        next,
        '390-light',
        '390-dark',
        '390',
        'narrow-failed',
        'narrow-hidden',
        'narrow-menu',
        'touch-actions',
        'layout-wrap',
      )
    )
      setSize('mobile')
    if (has(next, '390-dark')) setTheme('dark')
    if (has(next, '390-light')) setTheme('light')
    if (has(next, 'low-height')) setSize('low')
    if (has(next, 'reduced-motion')) setReduced(true)
  }
  useEffect(() => {
    const handler = () => setScene(readHash())
    addEventListener('hashchange', handler)
    return () => removeEventListener('hashchange', handler)
  }, [])
  const boundary = is(
    scene,
    'LIB-035',
    'LIB-036',
    'LIB-041',
    'LIB-042',
    'LIB-034',
    'LIB-043',
    'LIB-044',
    'LIB-045',
    'LIB-046',
    'LIB-P08',
  )
  return (
    <main className={`review ${theme} ${reduced ? 'reduced' : ''} ${zoom ? 'zoom-text' : ''}`}>
      <header className="review-top">
        <div>
          <h1>知识库与目录</h1>
          <span>第五模块 · 交互打磨对比 v1</span>
        </div>
        <button type="button" className="btn mobile-nav" onClick={() => setNavOpen(!navOpen)}>
          <List size={16} />
          场景目录
        </button>
        <span className="planning">独立 HTML · 待认可 · 未改产品代码</span>
      </header>
      <div className="review-workspace">
        <aside className={`scene-nav ${navOpen ? 'open' : ''}`}>
          <label className="scene-search">
            <Search size={15} />
            <input
              aria-label="搜索覆盖项"
              placeholder="搜索场景或 LIB 编号"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <p className="nav-count">58 个覆盖项 · 299 个可定位状态</p>
          {[
            '首页与工具条',
            '加载与定位',
            '列表与卡片',
            '文件与删除',
            '交接与适配',
            '拟修复与边界',
          ].map((category) => (
            <section key={category}>
              <h2>{category}</h2>
              {found
                .filter((s) => group(s) === category)
                .map((s) => (
                  <button
                    type="button"
                    key={s.itemId}
                    className={s.itemId === scene.itemId ? 'active' : ''}
                    onClick={() => select(s)}
                  >
                    <small>{s.itemId}</small>
                    <span>{s.label}</span>
                  </button>
                ))}
            </section>
          ))}
          {!found.length && <p>没有匹配的覆盖项。</p>}
        </aside>
        <div className="review-main">
          <div className="review-controls">
            <label>
              对比
              <select
                aria-label="对比方式"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              >
                <option value="both">并排对比</option>
                <option value="after">仅打磨后</option>
                <option value="before">仅当前</option>
              </select>
            </label>
            <label>
              主题
              <select
                aria-label="主题"
                value={theme}
                onChange={(event) => setTheme(event.target.value as 'light' | 'dark')}
              >
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </label>
            <label>
              尺寸
              <select
                aria-label="预览尺寸"
                value={size}
                onChange={(event) => setSize(event.target.value)}
              >
                <option value="desktop">桌面</option>
                <option value="mobile">390px</option>
                <option value="low">低高度 480px</option>
              </select>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={zoom}
                onChange={(event) => setZoom(event.target.checked)}
              />
              200% 文字
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={reduced}
                onChange={(event) => setReduced(event.target.checked)}
              />
              减少动效
            </label>
          </div>
          <section className="scene-intro">
            <div>
              <h2>{scene.label}</h2>
              <span
                className={scene.classification === 'proposed' ? 'proposal-badge' : 'source-badge'}
              >
                {scene.classification === 'proposed' ? '拟修复 / 边界决定' : '现有能力'}
              </span>
            </div>
            <details className="current-contract">
              <summary>查看当前行为与能力边界</summary>
              <p>{scene.currentBehavior}</p>
            </details>
            <label className="state-picker">
              本项状态
              <select
                aria-label="场景状态"
                value={scene.id}
                onChange={(event) => select(allScenes.find((s) => s.id === event.target.value)!)}
              >
                {itemScenes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {stateLabel(s.state)} · {s.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="state-tabs">
              {itemScenes.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  aria-pressed={s.id === scene.id}
                  className={s.id === scene.id ? 'active' : ''}
                  onClick={() => select(s)}
                >
                  {stateLabel(s.state)}
                </button>
              ))}
            </div>
          </section>
          <div className={`preview-grid mode-${mode} size-${size}`}>
            {mode !== 'after' && <Pane key={scene.id + '-before'} scene={scene} after={false} />}
            {mode !== 'before' && <Pane key={scene.id + '-after'} scene={scene} after />}
          </div>
          <section className="evidence">
            <details>
              <summary>本场景依据与模拟边界</summary>
              <p>
                {scene.id} · 归属：{scene.owner}。前后使用相同虚构内容与尺寸；当前侧依据现行代码及
                baseline 截图，当前绿色聚焦受并发主题 tokens 影响，提案沿用用户认可的中性细焦点。
              </p>
              <ul>
                {scene.source.map((source) => (
                  <li key={source}>
                    <code>{source}</code>
                  </li>
                ))}
              </ul>
              {boundary && (
                <p>
                  跨模块结构仅演示交接位置；宿主文件选择、拖入、剪贴板、下载、真实服务端结果、读屏和
                  Electron 未由 HTML 验收。本版不请求业务接口、不读写真实产品数据。
                </p>
              )}
              <p>
                新入口仅限列表复用卡片已有动作；本版不增加浏览页移动、重命名入口。目录列表包含下级文档且最多
                100 条，暂无分页与总数。
              </p>
              <p>
                提案中的目录与知识库删除后果说明对应现有服务端结果：保留文档并清空目录归属，没有新增移动或恢复能力。
              </p>
            </details>
          </section>
        </div>
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
