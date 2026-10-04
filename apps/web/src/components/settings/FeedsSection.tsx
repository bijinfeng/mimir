import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Input, Skeleton, Tag } from 'antd'
import { Plus, RefreshCw, Rss, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { FeedSummary } from '@mimir/shared'
import { api } from '@/lib/api'
import { Block, BlockDesc, Note, Panel, Row } from '@/components/settings/parts'
import { useStyles } from '@/components/settings/settings.style'

/**
 * 订阅（RSS / Atom）。
 *
 * ## 为什么这一页在设置里
 *
 * 订阅是**来源**，不是内容——收进来的文章是普通的 `documents` 行
 * （铁律 3），所以它们出现在知识库里、可搜、可被引用，与手动抓的一模一样。
 * 这一页管理的是订阅关系本身（加、改、更新、退订），那是配置。
 *
 * ## 状态如实显示两件事（**分开**）
 *
 * 每一条订阅显示「上次成功拉取」与「上次失败原因」。它们必须分开：
 * 一个源挂了之后，「上次成功是什么时候」仍然是有用的信息——
 * 用户据此判断「是刚挂还是一直没好」。
 *
 * 把失败画成一个红点、把成功时间抹掉，会让用户以为这个源从来没工作过。
 *
 * ## 取消订阅**不删文章**
 *
 * 界面上要说清楚。用户点「退订」的意思是「别再自动收了」，
 * 而不是「删掉我读过的东西」——后者不可逆，不该藏在一个
 * 看起来是「取消自动更新」的动作里。所以文案与提示都写明这一点。
 */
export function FeedsSection() {
  const { styles } = useStyles()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')

  const feedsQuery = useQuery({ queryKey: ['feeds'], queryFn: api.feeds.list })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['feeds'] })
    // 收进来的是文档——列表、计数、目录树都可能变
    void queryClient.invalidateQueries({ queryKey: ['documents'] })
    void queryClient.invalidateQueries({ queryKey: ['counts'] })
    void queryClient.invalidateQueries({ queryKey: ['folders'] })
  }

  const add = useMutation({
    mutationFn: (url: string) => api.feeds.create({ url }),
    onSuccess: (result) => {
      setDraft('')
      invalidate()
      message.success(
        result.imported > 0
          ? `已订阅《${result.feed.title}》，收了 ${result.imported} 篇`
          : `已订阅《${result.feed.title}》（暂时没有新文章）`,
      )
    },
    onError: (error: unknown) => message.error(error instanceof Error ? error.message : '订阅失败'),
  })

  const refresh = useMutation({
    mutationFn: (url?: string) => api.feeds.refresh(url),
    onSuccess: (result) => {
      invalidate()
      /**
       * **逐条如实回报**，而不是一句「更新完成」。
       * 三个源里有一个挂了是常态，而汇报总数会让那个失败被埋掉。
       */
      const failures = result.items.filter((item) => item.error)
      const imported = result.items.reduce((sum, item) => sum + item.imported, 0)
      if (failures.length === 0) {
        message.success(imported > 0 ? `收到 ${imported} 篇新文章` : '没有新文章')
      } else {
        message.warning(`${imported} 篇新文章；${failures.length} 个源失败：${failures[0]!.error}`)
      }
    },
    onError: (error: unknown) => message.error(error instanceof Error ? error.message : '更新失败'),
  })

  const remove = useMutation({
    mutationFn: (url: string) => api.feeds.remove(url),
    onSuccess: () => {
      invalidate()
      message.success('已退订（已收进来的文章保留在知识库里）')
    },
  })

  const feeds = feedsQuery.data?.items ?? []

  return (
    <>
      <Panel title="订阅（RSS / Atom）" extra={<Tag>{feeds.length} 个源</Tag>}>
        <BlockDesc>
          技术博客的主路径。定时拉取更新，新文章自动入库——它们与手动抓来的资料是同一种记录，
          可搜、可被引用。退订只停止自动更新，已经收进知识库的文章会保留。
        </BlockDesc>

        <Block>
          <div className={styles.feedAdd}>
            <Input
              placeholder="https://example.com/feed.xml（feed 地址，不是站点首页）"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onPressEnter={() => {
                if (draft.trim() !== '') add.mutate(draft.trim())
              }}
            />
            <Button
              type="primary"
              icon={<Plus size={14} />}
              loading={add.isPending}
              disabled={draft.trim() === ''}
              onClick={() => add.mutate(draft.trim())}
            >
              订阅
            </Button>
            <Button
              icon={<RefreshCw size={14} />}
              loading={refresh.isPending}
              disabled={feeds.length === 0}
              onClick={() => refresh.mutate(undefined)}
            >
              全部更新
            </Button>
          </div>
          <Note>
            订阅时会先拉取一次——拉不通就不落库，避免留下一个「订了但从没成功过」的源
            （那种源与「暂时坏掉的源」长得一样，而该做的事完全不同）。
          </Note>
        </Block>
      </Panel>

      {feedsQuery.isLoading ? (
        <Skeleton active />
      ) : feeds.length === 0 ? (
        <Panel title="还没有订阅">
          <BlockDesc>
            粘一个 feed 地址在上面即可。找不到 feed 地址时，多数站点在
            <code> /feed.xml</code> 或 <code> /rss.xml</code>，也可以在页面源码里搜
            <code> application/rss+xml</code>。
          </BlockDesc>
        </Panel>
      ) : (
        feeds.map((feed) => (
          <FeedRow
            key={feed.url}
            feed={feed}
            refreshing={refresh.isPending}
            onRefresh={() => refresh.mutate(feed.url)}
            onRemove={() => remove.mutate(feed.url)}
          />
        ))
      )}
    </>
  )
}

function FeedRow({
  feed,
  refreshing,
  onRefresh,
  onRemove,
}: {
  feed: FeedSummary
  refreshing: boolean
  onRefresh: () => void
  onRemove: () => void
}) {
  const { styles } = useStyles()

  return (
    <Panel
      title={
        <span className={styles.feedTitle}>
          <Rss size={14} />
          {feed.title || feed.url}
        </span>
      }
      extra={
        <span className={styles.feedActions}>
          <Button
            size="small"
            icon={<RefreshCw size={14} />}
            loading={refreshing}
            onClick={onRefresh}
          >
            更新
          </Button>
          <Button size="small" danger icon={<Trash2 size={14} />} onClick={onRemove}>
            退订
          </Button>
        </span>
      }
    >
      {/*
        两行分开：一行是「上次成功」，一行是「上次失败」（可能没有）。
        把它们压成一行会让失败盖掉成功时间，而那个时间正是用户判断
        「刚挂还是一直没好」的依据。
      */}
      <Row label="地址">
        <span className={styles.feedUrl}>{feed.url}</span>
      </Row>
      <Row label="上次成功">
        <span className={styles.feedUrl}>
          {feed.lastFetchedAt
            ? new Date(feed.lastFetchedAt).toLocaleString()
            : '（还没有成功拉取过）'}
        </span>
      </Row>
      <Row label="已收文章">
        <span className={styles.feedUrl}>{feed.itemCount} 篇</span>
      </Row>
      {feed.lastError ? (
        <Row label="上次失败">
          <span className={styles.feedError}>{feed.lastError}</span>
        </Row>
      ) : null}
    </Panel>
  )
}
