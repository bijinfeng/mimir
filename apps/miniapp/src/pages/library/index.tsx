import { useCallback, useRef, useState } from 'react'
import { View, Text, Picker } from '@tarojs/components'
import Taro, { useDidShow, useReachBottom, usePullDownRefresh } from '@tarojs/taro'
import type { FolderNode, MiniappDocumentSummary, TagListResponse } from '@mimir/shared/miniapp'
import { Action, Gate, ErrorNotice, Empty } from '../../components/ui'
import { api, errorMessage } from '../../lib/api'
import { useSession, getSession } from '../../lib/session'
import { openReader, editorUrl, askScope } from '../../lib/navigation'
export default function LibraryPage() {
  const session = useSession()
  return <Gate>{session && <Library key={session.user.id} ownerId={session.user.id} />}</Gate>
}
function Library({ ownerId }: { ownerId: string }) {
  const [tree, setTree] = useState<FolderNode[]>([])
  const [folder, setFolder] = useState('')
  const [tag, setTag] = useState('')
  const [tags, setTags] = useState<TagListResponse['items']>([])
  const [documents, setDocuments] = useState<MiniappDocumentSummary[]>([])
  const [next, setNext] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const loading = useRef(false)
  const load = useCallback(
    async (path: string, activeTag: string, offset = 0) => {
      const run = ++generation.current
      loading.current = true
      setBusy(true)
      setError('')
      try {
        const result = await api.documents({
          folder: path || undefined,
          tag: activeTag || undefined,
          limit: 30,
          offset,
        })
        if (run !== generation.current || getSession()?.user.id !== ownerId) return
        setDocuments((previous) => (offset ? [...previous, ...result.items] : result.items))
        setNext(result.nextOffset)
        setLoaded(true)
      } catch (error) {
        if (run === generation.current) setError(errorMessage(error))
      } finally {
        if (run === generation.current) {
          loading.current = false
          setBusy(false)
        }
      }
    },
    [ownerId],
  )
  const refresh = useCallback(async () => {
    await Promise.all([
      load(folder, tag),
      api
        .folders()
        .then((result) => {
          if (getSession()?.user.id === ownerId) setTree(result.items)
        })
        .catch((error) => setError(errorMessage(error))),
      api
        .tags()
        .then((result) => {
          if (getSession()?.user.id === ownerId) setTags(result.items)
        })
        .catch((error) => setError(errorMessage(error))),
    ])
  }, [folder, tag, load, ownerId])
  useDidShow(() => {
    void refresh()
  })
  usePullDownRefresh(() => {
    void refresh().finally(() => Taro.stopPullDownRefresh())
  })
  useReachBottom(() => {
    if (!loading.current && next !== null) void load(folder, tag, next)
  })
  function chooseFolder(path: string) {
    setFolder(path)
    setDocuments([])
    setLoaded(false)
    void load(path, tag)
  }
  function find(items: FolderNode[], path: string): FolderNode | undefined {
    for (const item of items) {
      if (item.path === path) return item
      const found = find(item.children, path)
      if (found) return found
    }
    return undefined
  }
  const children = folder ? find(tree, folder)?.children || [] : tree
  const parent = folder.split('/').slice(0, -1).join('/')
  return (
    <View className="page library-page">
      <View className="toolbar">
        <Text className="page-title">{folder ? folder.split('/').pop() : '知识库'}</Text>
        <View className="action-row">
          <Action
            onClick={() => {
              void Taro.navigateTo({
                url: `/pages/capture/index?folder=${encodeURIComponent(folder)}`,
              })
            }}
          >
            收集链接
          </Action>
          <Action
            onClick={() => {
              void Taro.navigateTo({ url: editorUrl('new', '', folder) })
            }}
          >
            新笔记
          </Action>
        </View>
      </View>
      {folder && (
        <View className="toolbar compact">
          <Action onClick={() => chooseFolder(parent)}>上一级</Action>
          <Action
            onClick={() => {
              void askScope({ type: 'folder', path: folder }, folder)
            }}
          >
            问这个库
          </Action>
        </View>
      )}
      <Text className="block muted breadcrumb">{folder || '全部知识库'}</Text>
      {children.map((item) => (
        <View
          className="library-row"
          key={item.path}
          onClick={() => chooseFolder(item.path)}
          role="button"
        >
          <View>
            <Text className="row-title">{item.name}</Text>
            {item.description && <Text className="block muted clamp-two">{item.description}</Text>}
          </View>
          <Text className="count">{item.count} 篇</Text>
        </View>
      ))}
      <Picker
        mode="selector"
        range={['全部标签', ...tags.map((item) => `${item.name} (${item.count})`)]}
        value={Math.max(0, tags.findIndex((item) => item.name === tag) + 1)}
        onChange={(event) => {
          const selected = tags[Number(event.detail.value) - 1]?.name || ''
          setTag(selected)
          setDocuments([])
          void load(folder, selected)
        }}
      >
        <View className="picker-row section-small">
          <Text className="muted">标签</Text>
          <Text>{tag || '全部标签'}</Text>
        </View>
      </Picker>
      <ErrorNotice
        error={error}
        onRetry={() => {
          void refresh()
        }}
      />
      {documents.map((document) => (
        <View
          className="document-row"
          key={document.id}
          role="button"
          onClick={() => {
            void openReader(document.id)
          }}
        >
          <Text className="row-title">{document.title}</Text>
          <Text className="block muted clamp-two">{document.excerpt}</Text>
          <Text className="row-meta">
            {document.kind === 'note' ? '笔记' : document.fileExtension?.toUpperCase() || '资料'} ·{' '}
            {document.folder || '未归入目录'}
            {document.tags.length ? ` · ${document.tags.join(' / ')}` : ''}
          </Text>
        </View>
      ))}
      {loaded && !documents.length && (
        <Empty>{tag ? '此标签下暂无资料。' : '这里暂无资料，可以新建笔记或收集链接。'}</Empty>
      )}
      {busy && <Text className="loading">正在读取…</Text>}
      {!busy && next !== null && (
        <Action
          onClick={() => {
            void load(folder, tag, next)
          }}
        >
          加载更多
        </Action>
      )}
    </View>
  )
}
