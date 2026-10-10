import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Input, Typography } from 'antd'
import { useState } from 'react'
import { Database, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api'
import { LoadError } from '../LoadError'
import { BlockDesc, Panel, Row, SourceBadge, TechnicalDetails } from './parts'
import { SettingControl } from './SettingControl'
import { useStyles } from './settings.style'

/**
 * 检索分区的**相关性自检**。
 *
 * 原型里这个功能是写死的演示数据，这里接真实检索：输入一句话，
 * 看各通道各命中多少。
 *
 * 它的价值在于**区分「没存过」和「分词没切对」**——如果词级召回 0 段、
 * 但子串兜底命中了，那就是分词问题（`.trellis/spec/project/product.md` §5.6 的同一个理由）。
 *
 * ## 参数从 `/api/config` 来，不在前端抄一份
 *
 * 权重与融合参数是**在这里改的**（`SettingControl`，与存储分区同一套
 * 形态：显式保存 + 来源徽标），前端抄一份会在调参之后继续显示旧值——
 * 那是「界面说谎」，比没有这一页更糟。
 *
 * **可写就必须给入口**：这五个键（`retrieval.rrfK` / `perLegLimit` /
 * `maxChunksPerDoc` 与两条通道的 `weight`）都是 `writable: true`，
 * 而这一页下面那段文案正教用户「改完权重后在这里试一句」——
 * 只印数值不给输入框时，用户按指引去调参却找不到任何地方能改，
 * 只能去改 `.env` 再重启，正是 `.trellis/spec/project/architecture.md` §7.5 要消掉的那种摩擦。
 * 那一行还挂着「来源」徽标，更容易让人以为是自己没找到改的地方。
 *
 * ## 通道列表也来自注册表
 *
 * 这一页按 `plugins` 里 `seam === 'leg'` 的条目渲染，所以
 * M1 加向量通道时它会自动多一行，且带着那个通道自己的就绪状态
 * （「需要先配置向量化模型」这类原因也由服务端给出）。
 */
export function RetrievalSection() {
  const { styles } = useStyles()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [probe, setProbe] = useState('')

  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })

  /**
   * 分块与嵌入的状态（M1-B）。
   *
   * 「待嵌入 N 段」是这一页**最需要如实显示的数字**：向量通道就绪但
   * 向量还没补上时，语义检索会安静地少返回结果——而那看起来像
   * 「库里没有相关内容」（`.trellis/spec/project/architecture.md` §4.10 的「界面以待嵌入 N 段
   * 如实显示」）。`pending` 为 null 表示没配向量化模型，那时这一栏
   * 该说「未配置」而不是显示 0（0 会被读成「都嵌好了」）。
   */
  const chunkQuery = useQuery({
    queryKey: ['chunks-status'],
    queryFn: api.maintenance.chunks,
  })

  const embed = useMutation({
    mutationFn: () => api.maintenance.embed(64),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['chunks-status'] })
      if (result.remaining === null) {
        message.info('还没有配置向量化模型')
        return
      }
      if (result.remaining === 0) {
        message.success(`全部嵌入完成（这次补了 ${result.processed} 段）`)
        return
      }
      message.success(
        `补了 ${result.processed} 段，还剩 ${result.remaining} 段——再点一次继续` +
          (result.failed > 0 ? `（${result.failed} 篇失败，详见日志）` : ''),
      )
    },
    onError: (error: unknown) =>
      message.error(error instanceof Error ? error.message : '补嵌入失败'),
  })

  const rebuildChunks = useMutation({
    mutationFn: api.maintenance.rebuildChunks,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['chunks-status'] })
      message.success(`分块已重建：${result.documents} 篇文档，共 ${result.chunks} 段`)
    },
    onError: (error: unknown) =>
      message.error(error instanceof Error ? error.message : '重建分块失败'),
  })
  const settings = configQuery.data?.settings ?? []
  const legs = (configQuery.data?.plugins ?? []).filter((plugin) => plugin.seam === 'leg')

  const probeQuery = useQuery({
    queryKey: ['retrieval-probe', probe],
    queryFn: () => api.search({ q: probe, limit: 5 }),
    enabled: probe.trim().length > 0,
  })

  const result = probeQuery.data

  /**
   * 按通道统计命中。
   *
   * 从 `result.channels` 取而不是写死 'keyword' / 'substring'——
   * 写死会在加通道之后继续只报那两个，而用户以为看到了全部
   * （契约里 `matchedBy` 与 `channels` 都是 `string[]`，就是为了这个）。
   */
  const byChannel = (name: string) =>
    result?.hits.filter((hit) => hit.matchedBy.includes(name)).length ?? 0

  const retrievalParams = ['retrieval.rrfK', 'retrieval.perLegLimit', 'retrieval.maxChunksPerDoc']
    .map((key) => settings.find((entry) => entry.key === key))
    .filter((entry) => entry !== undefined)

  const weightOf = (id: string) => settings.find((entry) => entry.key === `retrieval.${id}.weight`)

  /** 数值很短（RRF k 最大三位数），给它们 320px 会把值列撑得不像输入框 */
  const NUMBER_WIDTH = 110

  const status = chunkQuery.data

  return (
    <>
      <Panel title="分块与向量">
        {chunkQuery.isError ? (
          /* 「读取中…」在失败时会永远挂着——用户以为它在加载，实际是请求失败 */
          <div className={styles.block}>
            <LoadError
              compact
              message="分块状态读取失败"
              onRetry={() => void chunkQuery.refetch()}
            />
          </div>
        ) : (
          <>
            <Row label="分块">
              <span className={styles.blockDesc}>
                {status ? `${status.documents} 篇文档 · 共 ${status.total} 段` : '读取中…'}
              </span>
            </Row>
            <Row label="待嵌入">
              {/*
            `null` 是「没配向量化模型」——不能显示成 0（那会被读成「都嵌好了」），
            也不能显示成「未知」（用户会以为是在加载）。如实说没配。
          */}
              {status === undefined ? (
                <span className={styles.blockDesc}>读取中…</span>
              ) : status.pending === null ? (
                <span className={styles.blockDesc}>
                  未配置向量化模型；语义检索暂不可用。请在「模型」中分配向量化任务。
                </span>
              ) : status.pending === 0 ? (
                <span className={styles.blockDesc}>全部已嵌入</span>
              ) : (
                <span className={styles.blockDesc}>
                  {status.pending} 段；补嵌入前只能按关键词检索。
                </span>
              )}
            </Row>

            <div className={styles.block}>
              <div className={styles.actions}>
                <Button
                  icon={<Database size={14} />}
                  loading={embed.isPending}
                  disabled={status?.pending === null || status?.pending === 0}
                  onClick={() => embed.mutate()}
                >
                  补嵌入
                </Button>
                <Button
                  icon={<RefreshCw size={14} />}
                  loading={rebuildChunks.isPending}
                  onClick={() => rebuildChunks.mutate()}
                >
                  重建分块
                </Button>
              </div>
              <BlockDesc>
                调整分块参数后请重建分块；变化的段落需重新补嵌入，<b>会产生模型用量</b>。
              </BlockDesc>
            </div>
            <TechnicalDetails>
              补嵌入每次处理最多 64 段，可多次继续。重建分块不会调用模型；未变化段落的向量会保留。
            </TechnicalDetails>
          </>
        )}
      </Panel>

      <Panel title="融合参数">
        {retrievalParams.map((entry) => (
          <Row key={entry.key} label={entry.label}>
            <div className={styles.actions}>
              <SettingControl entry={entry} width={NUMBER_WIDTH} />
              <SourceBadge source={entry.source} />
            </div>
            <BlockDesc>{entry.description}</BlockDesc>
            {entry.problem ? <BlockDesc>{entry.problem}</BlockDesc> : null}
          </Row>
        ))}
        <TechnicalDetails>
          <Row label="分词器">jieba（@node-rs/jieba）· 写入时预分词</Row>
        </TechnicalDetails>
      </Panel>

      <Panel title="检索通道">
        {legs.map((leg) => {
          const weight = weightOf(leg.id)
          return (
            <Row key={leg.id} label={leg.name}>
              {weight ? (
                <div className={styles.actions}>
                  <SettingControl entry={weight} width={NUMBER_WIDTH} />
                  <SourceBadge source={weight.source} />
                </div>
              ) : null}
              <BlockDesc>{leg.description}</BlockDesc>
              {weight?.problem ? <BlockDesc>{weight.problem}</BlockDesc> : null}
            </Row>
          )
        })}
      </Panel>

      <Panel title="相关性自检">
        <div className={styles.block}>
          <Input.Search
            aria-label="测试检索词"
            placeholder="输入检索词，例如：向量检索"
            value={probe}
            onChange={(event) => setProbe(event.target.value)}
            loading={probeQuery.isFetching}
            enterButton="测试检索"
          />
        </div>

        {result && (
          <div className={styles.block}>
            <div className={styles.hits}>
              命中 <b>{result.total}</b> 段
              {result.channels.map((channel) => (
                <span key={channel}>
                  {' · '}
                  {channel} <b>{byChannel(channel)}</b> 段
                </span>
              ))}
              {' · 耗时 '}
              {result.tookMs}ms
            </div>

            {result.total === 0 && (
              <Typography.Paragraph className={styles.blockDesc} style={{ margin: '6px 0 0' }}>
                没有命中。若文档中确有相关内容，请先检查分块状态，必要时重建分块。
              </Typography.Paragraph>
            )}

            {byChannel('keyword') === 0 && byChannel('substring') > 0 && (
              <Typography.Paragraph
                className={`${styles.blockDesc} ${styles.warnText}`}
                style={{ margin: '6px 0 0' }}
              >
                关键词未命中，子串检索找到了结果；可能是分词不匹配。
              </Typography.Paragraph>
            )}

            {result.hits.map((hit) => (
              <div key={`${hit.documentId}:${hit.snippet.start}`} className={styles.file}>
                {hit.title}（{hit.matchedBy.join(' + ')}）
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  )
}
