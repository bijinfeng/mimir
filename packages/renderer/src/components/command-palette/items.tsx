import type { DocumentDetail, SearchHit } from '@mimir/shared'
import { ArrowLeft, FilePlus, FileText, FolderInput, Pencil, Search, Upload } from 'lucide-react'
import type { ReactNode } from 'react'
import type { CommandPaletteProps } from '../CommandPalette'

export interface PaletteItem {
  type: 'command' | 'document'
  key: string
  icon: ReactNode
  title: string
  sub?: string
  path?: string
  run: () => void
}

type Actions = Omit<CommandPaletteProps, 'open'>

export function paletteCommands(props: Actions, currentKind?: string): PaletteItem[] {
  return [
    {
      type: 'command',
      key: 'new-note',
      icon: <FilePlus size={16} aria-hidden />,
      title: '新建笔记',
      run: () => void props.onNewNote(),
    },
    {
      type: 'command',
      key: 'capture',
      icon: <Upload size={16} aria-hidden />,
      title: '收集链接或文件',
      sub: '网页、公众号、GitHub、文件',
      run: props.onOpenCapture,
    },
    ...(props.currentDocumentId
      ? [
          ...(currentKind === 'note'
            ? [
                {
                  type: 'command' as const,
                  key: 'rename-current',
                  icon: <Pencil size={16} aria-hidden />,
                  title: '重命名当前笔记',
                  run: () => props.onCurrentCommand('rename'),
                },
              ]
            : []),
          ...(currentKind
            ? [
                {
                  type: 'command' as const,
                  key: 'move-current',
                  icon: <FolderInput size={16} aria-hidden />,
                  title: '移动当前文档',
                  run: () => props.onCurrentCommand('move'),
                },
              ]
            : []),
          ...(currentKind === 'note'
            ? [
                {
                  type: 'command' as const,
                  key: 'search-current',
                  icon: <Search size={16} aria-hidden />,
                  title: '搜索当前笔记',
                  run: () => props.onCurrentCommand('search'),
                },
              ]
            : []),
          {
            type: 'command' as const,
            key: 'back-to-library',
            icon: <ArrowLeft size={16} aria-hidden />,
            title: '返回知识库',
            run: props.onReturnToLibrary,
          },
        ]
      : []),
  ]
}

export function paletteDocuments(
  hits: SearchHit[] | undefined,
  recent: DocumentDetail[],
  props: Actions,
): PaletteItem[] {
  if (hits === undefined)
    return recent
      .filter((doc) => doc.kind === 'note')
      .map((doc) => ({
        type: 'document',
        key: `recent:${doc.id}`,
        icon: <FileText size={16} aria-hidden />,
        title: doc.title,
        sub: doc.folder ?? '知识库根',
        run: () => props.onOpenRecent(doc.id, doc.folder ? `folder:${doc.folder}` : 'all'),
      }))
  const totals = new Map<string, number>()
  const ordinals = new Map<string, number>()
  const identities = new Map<string, number>()
  for (const hit of hits) totals.set(hit.documentId, (totals.get(hit.documentId) ?? 0) + 1)
  return hits.map((hit) => {
    const ordinal = (ordinals.get(hit.documentId) ?? 0) + 1
    ordinals.set(hit.documentId, ordinal)
    const identity = `${hit.documentId}:${hit.snippet.start}:${hit.snippet.end}`
    const duplicate = identities.get(identity) ?? 0
    identities.set(identity, duplicate + 1)
    return {
      type: 'document',
      key: `hit:${identity}:${duplicate}`,
      icon: <FileText size={16} aria-hidden />,
      title: (totals.get(hit.documentId) ?? 0) > 1 ? `${hit.title} · 命中 ${ordinal}` : hit.title,
      sub: hit.snippet.text,
      path: hit.path ?? '知识库根',
      run: () => props.onOpenSearchHit(hit),
    }
  })
}
