import { useQuery } from '@tanstack/react-query'
import { Skeleton, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { api } from '@/lib/api'
import { Panel, Stats } from '@/components/settings/parts'
import { useStyles } from '@/components/settings/settings.style'
import { useStatsStyles } from '@/components/settings/StatsSection.style'
import { formatTokens, UsageHeatmap } from '@/components/settings/UsageHeatmap'
import { MODEL_ROLE_LABELS, type UsageByRole } from '@mimir/shared'

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
 * ## 热力图固定一年，**不做范围切换**
 *
 * 第一版有三个范围（30 天 / 90 天 / 一年），是一个 `Segmented`。
 * 去掉了，两条理由：
 *
 *  1. **概览那一排已经回答了「最近怎么样」**（今日 / 本周 / 本月）。
 *     热力图回答的是另一个问题：「这一年我在持续用吗」——它需要的正是
 *     一整年的形状，切短反而看不出疏密变化
 *  2. **切范围会让分档口径跟着变**。分位数是按当前范围算的，所以
 *     换范围时同一个颜色代表的数字会变，得在图例里额外解释一句
 *     「按当前范围分档」。固定一年之后这句话不需要了：
 *     一档就是一个确定的区间，图例可以直接写死
 *
 * 少一个控件，也少一个要解释的地方。
 */

/**
 * 按角色的列定义。
 *
 * 提到模块作用域而不是内联在 JSX 里：`columns` 是一个**数据**参数，
 * 内联数组每次渲染都是新对象，会让 antd Table 重算列宽；
 * 而提到外面之后它也更容易读——六个列挤在一个 JSX 属性里很挤。
 *
 * 三处 `render` 都对应同一条判断：**「没有」和「有个小数字」要能分开**。
 * 0 与「—」用弱一档的文字色，失败数才用错误色——把 0 也染红会让
 * 「这一列有问题」变成噪音。
 */
const ROLE_COLUMNS: ColumnsType<UsageByRole> = [
  {
    title: '角色',
    dataIndex: 'role',
    render: (_value, row) => (
      <span className="stats-role">
        {MODEL_ROLE_LABELS[row.role as keyof typeof MODEL_ROLE_LABELS] ?? row.role}
      </span>
    ),
  },
  {
    title: '模型',
    dataIndex: 'model',
    render: (value: string) => <span className="stats-model">{value || '—'}</span>,
  },
  { title: '调用', dataIndex: 'calls', align: 'right' },
  {
    title: '输入',
    dataIndex: 'promptTokens',
    align: 'right',
    render: (value: number) =>
      value > 0 ? formatTokens(value) : <span className="stats-zero">—</span>,
  },
  {
    title: '输出',
    dataIndex: 'completionTokens',
    align: 'right',
    render: (value: number) =>
      value > 0 ? formatTokens(value) : <span className="stats-zero">—</span>,
  },
  {
    title: '失败',
    dataIndex: 'failed',
    align: 'right',
    render: (value: number) =>
      value > 0 ? (
        <span className="stats-failed">{value}</span>
      ) : (
        <span className="stats-zero">0</span>
      ),
  },
]

export function StatsSection() {
  const { styles } = useStyles()
  const { styles: statsStyles } = useStatsStyles()

  const statsQuery = useQuery({
    queryKey: ['usage-stats'],
    queryFn: () => api.stats(),
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
        每次模型调用都记账，含失败与「测试连接」——所以调用次数不等于你提问的次数。
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
        <UsageHeatmap days={data.days} thresholds={data.thresholds} timezone={data.timezone} />
      </Panel>

      <Panel title="按角色">
        {data.byRole.length === 0 ? (
          <div className={statsStyles.empty}>
            还没有调用记录。配置模型后问一次问题就会出现在这里。
          </div>
        ) : (
          /*
            用 antd Table 而不是手写 `<table>`：表头底色、单元格内边距、
            边框与 hover 在深浅两套主题下都已经由 token 校准过，
            自己写一遍等于抄一份会漂移的副本（这正是这个项目反复
            记录的那类问题——`docs/DESIGN.md` §8 的形态缺位）。
            关掉分页：这里最多五六行。
          */
          <Table<UsageByRole>
            className={statsStyles.table}
            columns={ROLE_COLUMNS}
            dataSource={data.byRole}
            rowKey={(row) => `${row.role}:${row.model}`}
            pagination={false}
            size="small"
          />
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
