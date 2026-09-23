import { useQuery } from '@tanstack/react-query'
import { Input, Typography } from 'antd'
import { useState } from 'react'
import { api } from '@/lib/api'
import { Note, Panel, Row } from '@/components/settings/parts'
import { useStyles } from '@/components/settings/settings.style'

/**
 * 检索分区的**相关性自检**。
 *
 * 原型里这个功能是写死的演示数据，这里接真实检索：输入一句话，
 * 看两个通道各命中多少。
 *
 * 它的价值在于**区分「没存过」和「分词没切对」**——如果词级召回 0 段、
 * 但子串兜底命中了，那就是分词问题（`docs/PRD.md` §5.6 的同一个理由）。
 *
 * 参数也从 `GET /api/config` 来：权重与融合参数写在服务端常量里，
 * 前端抄一份就会在调参之后继续显示旧值。
 */
export function RetrievalSection() {
  const { styles } = useStyles()
  const [probe, setProbe] = useState('')

  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })
  const retrieval = configQuery.data?.retrieval

  const probeQuery = useQuery({
    queryKey: ['retrieval-probe', probe],
    queryFn: () => api.search({ q: probe, limit: 5 }),
    enabled: probe.trim().length > 0,
  })

  const result = probeQuery.data
  const keywordHits = result?.hits.filter((hit) => hit.matchedBy.includes('keyword')).length ?? 0
  const substringHits =
    result?.hits.filter((hit) => hit.matchedBy.includes('substring')).length ?? 0

  return (
    <>
      <Typography.Paragraph className={styles.sectionDesc}>
        检索是核心功能，不是附属特性——搜不到等于没存。下面是当前生效的参数，以及一个用来验证分词的入口。
      </Typography.Paragraph>

      <Panel title="融合参数">
        {retrieval ? (
          <>
            <Row label="RRF k">{retrieval.rrfK}</Row>
            {retrieval.legs.map((leg) => (
              <Row key={leg.name} label={leg.name}>
                权重 {leg.weight}
              </Row>
            ))}
            <Row label="候选数">每通道各取 {retrieval.perLegLimit} 条再融合</Row>
            <Row label="分词器">jieba（@node-rs/jieba）· 写入时预分词</Row>
          </>
        ) : (
          <Row label="分词器">jieba（@node-rs/jieba）· 写入时预分词</Row>
        )}
      </Panel>

      <Panel title="相关性自检">
        <div className={styles.block}>
          <Typography.Paragraph className={styles.blockDesc} style={{ marginBottom: 10 }}>
            改完分词词典或权重后，直接在这里试一句，不用回主界面。
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
              命中 <b>{result.total}</b> 段 · 词级召回 <b>{keywordHits}</b> 段 · 子串兜底{' '}
              <b>{substringHits}</b> 段 · 耗时 {result.tookMs}ms
            </div>

            {result.total === 0 && (
              <Typography.Paragraph className={styles.blockDesc} style={{ margin: '6px 0 0' }}>
                没有命中。若确认内容存在，多半是分词没切对——词级通道靠写入时的 jieba
                分词，切错了就永远命中不了（子串通道是它的兜底）。
              </Typography.Paragraph>
            )}

            {keywordHits === 0 && substringHits > 0 && (
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
        自检只用当前库里的真实内容，所以它同时能验证
        <span className={styles.strong}>分词</span>是否切对。若它报告 0
        命中而你确认存过，问题多半在写入时的分词，或者索引没建——先去「数据与备份」里重建一次。
      </Note>
    </>
  )
}
