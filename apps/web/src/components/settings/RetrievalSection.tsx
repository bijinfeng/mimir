import { useQuery } from '@tanstack/react-query'
import { Input, Typography } from 'antd'
import { useState } from 'react'
import { api } from '@/lib/api'
import { BlockDesc, Note, Panel, Row, SourceBadge } from '@/components/settings/parts'
import { SettingControl } from '@/components/settings/SettingControl'
import { useStyles } from '@/components/settings/settings.style'

/**
 * 检索分区的**相关性自检**。
 *
 * 原型里这个功能是写死的演示数据，这里接真实检索：输入一句话，
 * 看各通道各命中多少。
 *
 * 它的价值在于**区分「没存过」和「分词没切对」**——如果词级召回 0 段、
 * 但子串兜底命中了，那就是分词问题（`docs/PRD.md` §5.6 的同一个理由）。
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
 * 只能去改 `.env` 再重启，正是 `docs/TECH.md` §7.5 要消掉的那种摩擦。
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
  const [probe, setProbe] = useState('')

  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })
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

  return (
    <>
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
        <Row label="分词器">jieba（@node-rs/jieba）· 写入时预分词</Row>
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
          <Typography.Paragraph className={styles.blockDesc} style={{ marginBottom: 10 }}>
            改完分词词典或权重后，在这里试一句——用的是库里的真实内容。
          </Typography.Paragraph>

          <Input.Search
            placeholder="比如：向量检索"
            value={probe}
            onChange={(event) => setProbe(event.target.value)}
            loading={probeQuery.isFetching}
            enterButton="试一下"
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
                没有命中。若确认内容存在，多半是分词没切对——词级通道靠写入时的 jieba
                分词，切错了就永远命中不了（子串通道是它的兜底）。
              </Typography.Paragraph>
            )}

            {byChannel('keyword') === 0 && byChannel('substring') > 0 && (
              <Typography.Paragraph
                className={`${styles.blockDesc} ${styles.warnText}`}
                style={{ margin: '6px 0 0' }}
              >
                词级召回 0 段、子串兜底命中：分词没切对，但兜底通道救回来了。
              </Typography.Paragraph>
            )}

            {result.hits.map((hit) => (
              <div key={hit.documentId} className={styles.file}>
                {hit.title}（{hit.matchedBy.join(' + ')}）
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Note>
        若自检报告 0 命中而你确认存过，问题多半在写入时的分词，或索引没建——
        先去「数据与备份」里重建一次。
      </Note>
    </>
  )
}
