import { useQuery } from '@tanstack/react-query'
import { Skeleton, Typography } from 'antd'
import { useState } from 'react'
import { api } from '@/lib/api'
import { Panel, Stats } from '@/components/settings/parts'
import { useStyles } from '@/components/settings/settings.style'
import { useStatsStyles } from '@/components/settings/StatsSection.style'
import { formatTokens, UsageHeatmap } from '@/components/settings/UsageHeatmap'
import { MODEL_ROLE_LABELS } from '@mimir/shared'

/**
 * 用量统计（`docs/TECH.md` §12、`docs/PRD.md` §5.11）。
 *
 * ## 口径：token，不是调用次数
 *
 * 用户明确要求热力图量的是 **token 消耗量**。理由站得住：一次深度推理
 * 可能抵二十次摘要，而「我花了多少」比「我点了多少次」更常被问起。
 *
 * 代价是**它不再能回答「我还在不在用」**（那是 `PRD.md` §7 的成功判据）。
 * 补偿很便宜：tooltip 里同时给调用次数，所以两个问题一次答完，
 * 不需要第二张图。
 *
 * ## 范围切换只影响热力图，不影响右边的概览
 *
 * 概览的今日 / 本周 / 本月是**固定口径**（它们的定义不该跟着视图变），
 * 而热力图的时间范围是一个查看动作。把两者绑在一起会让「本月」
 * 在你切到「最近 30 天」时含义改变——那种改变没有任何提示，只会让人
 * 纳闷数字怎么不一样了。
 */
const RANGES = [
  { key: 30, label: '最近 30 天' },
  { key: 90, label: '最近 90 天' },
  { key: 370, label: '最近一年' },
] as const

export function StatsSection() {
  const { styles } = useStyles()
  const { styles: statsStyles } = useStatsStyles()
  const [days, setDays] = useState<number>(370)

  const statsQuery = useQuery({
    queryKey: ['usage-stats', days],
    queryFn: () => api.stats(days),
  })

  const data = statsQuery.data

  if (!data) {
    return (
      <div className={styles.block}>
        <Skeleton active paragraph={{ rows: 4 }} title={false} />
      </div>
    )
  }

  return (
    <>
      <Typography.Paragraph className={styles.sectionDesc}>
        每次模型调用都会记账——包括失败的、以及设置页「测试连接」发出的那些。 记录的是供应商回传的
        token 数，它不是从文档或对话数推导出来的。
      </Typography.Paragraph>

      <Panel>
        <Stats
          items={[
            { label: '今日', value: formatTokens(data.totals.today) },
            { label: '本周', value: formatTokens(data.totals.week) },
            { label: '本月', value: formatTokens(data.totals.month) },
            { label: '全部', value: formatTokens(data.totals.all) },
          ]}
        />
      </Panel>

      <Panel title="消耗热力图">
        <div className={statsStyles.rangeRow}>
          <span>范围</span>
          {/* 用原生 select 而不是 antd Radio：三个选项不值得一行按钮的宽度 */}
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            style={{ font: 'inherit' }}
            aria-label="热力图时间范围"
          >
            {RANGES.map((range) => (
              <option key={range.key} value={range.key}>
                {range.label}
              </option>
            ))}
          </select>
        </div>

        <UsageHeatmap days={data.days} thresholds={data.thresholds} timezone={data.timezone} />
      </Panel>

      <Panel title="按角色">
        {data.byRole.length === 0 ? (
          <div className={statsStyles.empty}>
            还没有调用记录。配置模型后问一次问题就会出现在这里。
          </div>
        ) : (
          <table className={statsStyles.table}>
            <thead>
              <tr>
                <th>角色</th>
                <th>模型</th>
                <th>调用</th>
                <th>输入</th>
                <th>输出</th>
                <th>失败</th>
              </tr>
            </thead>
            <tbody>
              {data.byRole.map((row) => (
                <tr key={`${row.role}:${row.model}`}>
                  <td className={statsStyles.roleName}>
                    {MODEL_ROLE_LABELS[row.role as keyof typeof MODEL_ROLE_LABELS] ?? row.role}
                  </td>
                  <td className={statsStyles.modelName}>{row.model || '—'}</td>
                  <td>{row.calls}</td>
                  <td>
                    {row.promptTokens > 0 ? (
                      formatTokens(row.promptTokens)
                    ) : (
                      <span className={statsStyles.zero}>—</span>
                    )}
                  </td>
                  <td>
                    {row.completionTokens > 0 ? (
                      formatTokens(row.completionTokens)
                    ) : (
                      <span className={statsStyles.zero}>—</span>
                    )}
                  </td>
                  <td>
                    {row.failed > 0 ? (
                      <span className={statsStyles.failed}>{row.failed}</span>
                    ) : (
                      <span className={statsStyles.zero}>0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/*
          页脚必须解释两件事，否则数字会误导：

          1. **未上报的用量**。它是「供应商没回传」，不是「消耗为 0」。
             不写这一句，用户会把这类调用读成零消耗
          2. **测试连接单列**。它是真实调用（发 ping、max_tokens=1），
             混进「我的用量」是另一种说谎
        */}
        <div className={statsStyles.footer}>
          共 <span className={statsStyles.footerStrong}>{data.totals.calls}</span> 次调用
          {data.totals.unknownCount > 0 ? (
            <>
              ，其中 <span className={statsStyles.footerStrong}>{data.totals.unknownCount}</span> 次
              供应商未回传用量（消耗未知，不是 0）
            </>
          ) : null}
          {data.totals.probeCalls > 0 ? (
            <>
              ，另有 <span className={statsStyles.footerStrong}>{data.totals.probeCalls}</span>{' '}
              次来自设置页的「测试连接」
            </>
          ) : null}
          。
        </div>
      </Panel>

      <Typography.Paragraph className={styles.muted} style={{ marginTop: 14 }}>
        token 是供应商回传的事实，所以只统计它。金额要按单价换算，而单价随时会变——
        用今天的单价乘历史用量，会让过去的金额自己变，那是记账的大忌。
      </Typography.Paragraph>
    </>
  )
}
