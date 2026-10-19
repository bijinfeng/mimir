import { useRef, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import type { Citation, MiniappDocument } from '@mimir/shared/miniapp'
import { Action, Gate, ErrorNotice } from '../../components/ui'
import { Markdown, markdownBlocks } from '../../components/markdown'
import { api, errorMessage } from '../../lib/api'
import { useSession, getSession } from '../../lib/session'
import { localKey, readStorage } from '../../lib/storage'
import { askScope, editorUrl } from '../../lib/navigation'
import { openOriginal } from '../../lib/files'
export default function ReaderPage() {
  const session = useSession()
  const router = useRouter()
  const id = router.params.id || ''
  return (
    <Gate>
      {session && (
        <Reader
          key={`${session.user.id}:${id}`}
          ownerId={session.user.id}
          id={id}
          showCitation={router.params.citation === '1'}
        />
      )}
    </Gate>
  )
}
function Reader({
  ownerId,
  id,
  showCitation,
}: {
  ownerId: string
  id: string
  showCitation: boolean
}) {
  const [document, setDocument] = useState<MiniappDocument | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState(false)
  const sequence = useRef(0)
  const [quoted] = useState(() =>
    showCitation ? readStorage<Citation>(localKey(ownerId, `citation:${id}`)) : null,
  )
  async function load() {
    const run = ++sequence.current
    setBusy(true)
    setError('')
    try {
      const result = await api.document(id)
      if (run === sequence.current && getSession()?.user.id === ownerId)
        setDocument(result.document)
    } catch (error) {
      if (run === sequence.current) setError(errorMessage(error))
    } finally {
      if (run === sequence.current) setBusy(false)
    }
  }
  useDidShow(() => {
    void load()
  })
  const matches = Boolean(
    document && quoted && document.body.slice(quoted.start, quoted.end) === quoted.snippet,
  )
  const target =
    matches && quoted && document
      ? markdownBlocks(document.body).findIndex(
          (block) => block.start < quoted.end && block.end > quoted.start,
        )
      : -1
  async function original() {
    if (!document || opening) return
    setOpening(true)
    setError('')
    try {
      await openOriginal(document)
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setOpening(false)
    }
  }
  return (
    <View className="reader-page">
      <ErrorNotice
        error={error}
        onRetry={() => {
          void load()
        }}
      />
      {busy && !document && <Text className="loading">正在读取…</Text>}
      {document && (
        <>
          <View className="reader-heading">
            <Text className="document-title">{document.title}</Text>
            <Text className="block muted small">
              {document.folder || '未归入目录'} · {document.kind === 'note' ? '笔记' : '只读资料'}
              {document.tags.length ? ` · ${document.tags.join(' / ')}` : ''}
            </Text>
          </View>
          {document.indexState === 'stale' && (
            <View className="notice warning">
              源文与索引尚未同步，当前阅读显示源文，问答可能暂不可用。请到电脑端同步资料。
            </View>
          )}
          {quoted && (
            <View className="notice source-preview">
              <Text className="strong">
                {matches ? '引用片段已在正文中标出' : '来源内容已变化'}
              </Text>
              <Text className="block" selectable>
                {quoted.snippet}
              </Text>
              {!matches && (
                <Text className="block muted">
                  这里是回答生成时的片段。当前原文无法确认相同位置，未进行定位或伪造页码。
                </Text>
              )}
            </View>
          )}
          <ScrollView
            className="reader-scroll"
            scrollY
            scrollIntoView={target >= 0 ? `md-block-${target}` : undefined}
          >
            <View className="reader-body">
              {document.body ? (
                <Markdown
                  body={document.body}
                  links={document.links.sources}
                  highlight={
                    matches && quoted ? { start: quoted.start, end: quoted.end } : undefined
                  }
                />
              ) : (
                <Text className="muted">
                  {document.parseError || '此资料暂无提取正文，可尝试查看原件。'}
                </Text>
              )}
              {document.url && (
                <View className="section source-url">
                  <Text className="muted">原始来源</Text>
                  <Text
                    className="block md-link"
                    onClick={() => {
                      void Taro.setClipboardData({ data: document.url! })
                    }}
                  >
                    {document.url}
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
          <View className="reader-actions">
            <Action
              primary
              onClick={() => {
                void askScope({ type: 'document', documentId: document.id }, document.title)
              }}
            >
              问这篇
            </Action>
            {document.canEditBody && (
              <Action
                onClick={() => {
                  void Taro.navigateTo({ url: editorUrl('edit', id) })
                }}
              >
                编辑
              </Action>
            )}
            <Action
              onClick={() => {
                void Taro.showActionSheet({
                  itemList: document.canEditBody
                    ? [
                        '追加笔记',
                        '整理标题、标签和位置',
                        ...(document.hasOriginal ? ['查看原件'] : []),
                      ]
                    : ['整理标题、标签和位置', ...(document.hasOriginal ? ['查看原件'] : [])],
                })
                  .then((result) => {
                    const action = document.canEditBody ? result.tapIndex : result.tapIndex + 1
                    if (action === 0) void Taro.navigateTo({ url: editorUrl('append', id) })
                    else if (action === 1) void Taro.navigateTo({ url: editorUrl('metadata', id) })
                    else void original()
                  })
                  .catch(() => undefined)
              }}
            >
              更多
            </Action>
            {document.hasOriginal && (
              <Action
                disabled={opening}
                onClick={() => {
                  void original()
                }}
              >
                {opening ? '读取中…' : '原件'}
              </Action>
            )}
          </View>
        </>
      )}
    </View>
  )
}
