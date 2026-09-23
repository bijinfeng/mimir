import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Skeleton, Tooltip, Typography, message } from 'antd'
import type { ModelRoleStatus, ProbeResult, SettingEntry } from '@mimir/shared'
import { api } from '@/lib/api'
import { SettingControl } from '@/components/settings/SettingControl'
import { SourceBadge } from '@/components/settings/parts'
import { Note, Panel, Row } from '@/components/settings/parts'
import { useStyles } from '@/components/settings/settings.style'

/**
 * 模型分区：按角色配置模型 + 测试连接。
 *
 * ## 这一页从「只读快照」变成了**可编辑**
 *
 * M0 时这些值只能改 `.env` 再重启，所以这里只显示（D-025 的判断是对的：
 * 当时只有 5 个模型键，没有要调的参数）。M1 起它们可以就地改。
 *
 * 代价是必须**如实显示来源**——用户需要知道「我现在看到的是我改过的，
 * 还是环境变量里的，还是没人配过的默认值」。否则改了不生效时，
 * 他没法判断是自己没保存，还是被环境变量压住了。
 */
export function ModelsSection() {
  const { styles } = useStyles()
  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })
  const models = configQuery.data?.models
  const settings = configQuery.data?.settings ?? []
  const probes = configQuery.data?.probes ?? []

  if (!models) {
    return (
      <div className={styles.block}>
        <Skeleton active paragraph={{ rows: 3 }} title={false} />
      </div>
    )
  }

  const entry = (key: string): SettingEntry | undefined => settings.find((item) => item.key === key)

  return (
    <>
      <Typography.Paragraph className={styles.sectionDesc}>
        给不同任务分配不同的模型：便宜模型做摘要、强模型做推理。这是最直接的成本控制手段。
      </Typography.Paragraph>

      <Note>
        密钥<span className={styles.strong}>加密后存库，绝不下发浏览器</span>
        ——所以这一页只显示「有没有配」，不显示值本身。改完点保存立即生效，
        不需要重启。清除某一项表示回落到环境变量或默认值。
      </Note>

      <Panel title="连接">
        <ConfigRow entry={entry('model.baseUrl')} />
        <ConfigRow entry={entry('model.apiKey')} secret />
        <ConfigRow entry={entry('model.providerName')} />
      </Panel>

      <Panel title="任务分配">
        {models.map((model) => (
          <RoleRow
            key={model.role}
            model={model}
            entry={entry(`model.${model.role}.model`)}
            probe={probes.find((item) => item.role === model.role)}
          />
        ))}
      </Panel>

      <Panel title="向量化">
        <ConfigRow entry={entry('model.embed.dimensions')} />
      </Panel>
    </>
  )
}

/** 普通的「标签 + 输入框 + 来源」一行 */
function ConfigRow({
  entry,
  secret = false,
}: {
  entry: SettingEntry | undefined
  secret?: boolean
}) {
  const { styles } = useStyles()
  if (!entry) return null

  return (
    <Row label={entry.label}>
      <SettingControl entry={entry} width={300} secret={secret} />
      <div className={styles.blockDesc} style={{ marginTop: 6 }}>
        <SourceBadge source={entry.source} />
        <span style={{ marginLeft: 8 }}>{entry.description}</span>
      </div>
    </Row>
  )
}

/**
 * 一个模型角色：模型名 + 就绪状态 + 探测按钮。
 *
 * 状态与原因都来自服务端（`ready` / `reason`），前端不自己判断——
 * 「缺 key」与「模型名没配」这类条件写在前端就会与服务端漂移。
 */
function RoleRow({
  model,
  entry,
  probe,
}: {
  model: ModelRoleStatus
  entry: SettingEntry | undefined
  probe: ProbeResult | undefined
}) {
  const { styles } = useStyles()

  return (
    <Row label={model.label}>
      <div className={styles.actions}>
        {entry ? <SettingControl entry={entry} width={220} /> : null}
        <StatusDot model={model} probe={probe} />
        <ProbeButton role={model.role} />
      </div>
      {model.reason ? (
        <div className={styles.blockDesc} style={{ marginTop: 5 }}>
          {model.reason}
        </div>
      ) : null}
    </Row>
  )
}

/**
 * 就绪状态。**四态**，不是「可用 / 不可用」两态。
 *
 * `docs/TECH.md` §7.8 的判据：探测是显式动作，所以「配好了但没试过」
 * 与「试过不行」必须分开显示。把「没测过」显示成绿色，用户会以为
 * 已经验证过——而地址写错、模型名下架都只有真发一次才知道。
 */
function StatusDot({ model, probe }: { model: ModelRoleStatus; probe: ProbeResult | undefined }) {
  const { styles } = useStyles()

  if (!model.ready) {
    return (
      <Tooltip title={model.reason ?? '需要先配置'}>
        <span className={styles.pending}>未配置</span>
      </Tooltip>
    )
  }

  if (!probe) {
    return (
      <Tooltip title="配置看起来齐了，但还没实际调用过。点「测试连接」发一次真实请求">
        <span className={styles.muted}>未测试</span>
      </Tooltip>
    )
  }

  return probe.ok ? (
    <Tooltip title={`${probe.message}（${formatTime(probe.at)}）`}>
      <span className={styles.hint}>可用</span>
    </Tooltip>
  ) : (
    <Tooltip title={probe.message}>
      <span className={styles.warnText}>不可用</span>
    </Tooltip>
  )
}

/** 「刚刚 / 3 分钟前」比一串 ISO 时间可读——它表达的是「这个结论有多新」 */
function formatTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return '刚刚测过'
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟前测过`
  return `${Math.round(seconds / 3600)} 小时前测过`
}

/**
 * 测试连接：让服务端**真的调一次**。
 *
 * 密钥不出浏览器（请求体里只有角色名），服务端从库里取密钥去试——
 * 所以这个按钮在密钥没配的情况下也能给出「还没有配置 API 密钥」这种
 * 准确的提示，而不是一个笼统的失败。
 */
function ProbeButton({ role }: { role: string }) {
  const { styles } = useStyles()
  const [messageApi, contextHolder] = message.useMessage()
  const queryClient = useQueryClient()

  const probe = useMutation({
    mutationFn: () => api.probeModel(role),
    onSuccess: (result) => {
      // 失效查询：让上面的状态徽标拿到这次的结果
      void queryClient.invalidateQueries({ queryKey: ['config'] })
      if (result.ok) messageApi.success(result.message)
      else messageApi.error(result.message)
    },
    onError: (error) => messageApi.error(`探测失败：${String(error)}`),
  })

  return (
    <div className={styles.actions}>
      {contextHolder}
      <Button size="small" loading={probe.isPending} onClick={() => probe.mutate()}>
        测试连接
      </Button>
    </div>
  )
}
