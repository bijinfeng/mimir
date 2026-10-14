import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Input, Typography } from 'antd'
import { Database, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../lib/api'
import { LoadError } from '../LoadError'
import { Panel, Row } from './parts'
import { useStyles } from './settings.style'

/** 搜索状态与结果验证。检索算法的参数不在面向用户的设置中展示。 */
export function RetrievalSection() {
  const { styles } = useStyles()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [probe, setProbe] = useState('')

  const statusQuery = useQuery({ queryKey: ['chunks-status'], queryFn: api.maintenance.chunks })

  const embed = useMutation({
    mutationFn: () => api.maintenance.embed(64),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['chunks-status'] })
      void queryClient.invalidateQueries({ queryKey: ['retrieval-probe'] })
      if (result.remaining === null) {
        message.info('请先在「模型」中配置语义搜索模型')
      } else if (result.failed > 0) {
        message.warning(`有 ${result.failed} 篇文档未处理成功，请稍后重试`)
      } else if (result.remaining === 0) {
        message.success('语义搜索内容已补全')
      } else {
        message.success(`本次处理完成，还有 ${result.remaining} 段内容待处理`)
      }
    },
    onError: () => message.error('补全失败，请稍后重试'),
  })

  const rebuild = useMutation({
    mutationFn: api.maintenance.rebuildChunks,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['chunks-status'] })
      void queryClient.invalidateQueries({ queryKey: ['retrieval-probe'] })
      message.success('搜索内容已重新整理')
    },
    onError: () => message.error('重新整理失败，请稍后重试'),
  })

  const probeQuery = useQuery({
    queryKey: ['retrieval-probe', probe],
    queryFn: () => api.search({ q: probe, limit: 5 }),
    enabled: probe.length > 0,
  })

  const status = statusQuery.data
  const result = probeQuery.data

  return (
    <>
      <Panel title="搜索内容" desc="查看已收录文档并补全语义搜索索引">
        {statusQuery.isError ? (
          <div className={styles.block}>
            <LoadError
              compact
              message="搜索状态读取失败"
              onRetry={() => void statusQuery.refetch()}
            />
          </div>
        ) : (
          <>
            <Row label="已收录">
              <span className={styles.blockDesc}>
                {status ? `${status.documents} 篇文档` : '读取中…'}
              </span>
            </Row>
            <Row label="语义搜索">
              <span className={styles.blockDesc}>
                {status === undefined
                  ? '读取中…'
                  : status.pending === null
                    ? '未启用。请在「模型」中配置语义搜索模型。'
                    : status.pending === 0
                      ? '已就绪'
                      : `还有 ${status.pending} 段内容待处理，完成前部分结果可能缺失。`}
              </span>
            </Row>
            <div className={styles.block}>
              <div className={styles.actions}>
                <Button
                  icon={<Database size={14} />}
                  loading={embed.isPending}
                  disabled={status?.pending === null || status?.pending === 0}
                  onClick={() => embed.mutate()}
                >
                  补全语义搜索
                </Button>
                <Button
                  icon={<RefreshCw size={14} />}
                  loading={rebuild.isPending}
                  onClick={() => rebuild.mutate()}
                >
                  重新整理搜索内容
                </Button>
              </div>
            </div>
          </>
        )}
      </Panel>

      <Panel title="测试搜索" desc="输入关键词验证检索结果是否符合预期">
        <div className={styles.block}>
          <Input.Search
            aria-label="测试检索词"
            placeholder="输入文档中的关键词"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onSearch={() => {
              const next = draft.trim()
              if (next === probe && next) void probeQuery.refetch()
              else setProbe(next)
            }}
            loading={probeQuery.isFetching}
            enterButton="搜索"
          />
        </div>

        {probeQuery.isError ? (
          <LoadError compact message="搜索失败" onRetry={() => void probeQuery.refetch()} />
        ) : result ? (
          <div className={styles.block}>
            <div className={styles.hits}>找到 {result.total} 条匹配内容</div>
            {result.total === 0 ? (
              <Typography.Paragraph className={styles.blockDesc} style={{ margin: '6px 0 0' }}>
                没有找到相关内容。请换个词再试，或重新整理搜索内容。
              </Typography.Paragraph>
            ) : null}
            {result.hits.map((hit) => (
              <div key={`${hit.documentId}:${hit.snippet.start}`} className={styles.file}>
                {hit.title}
              </div>
            ))}
          </div>
        ) : null}
      </Panel>
    </>
  )
}
