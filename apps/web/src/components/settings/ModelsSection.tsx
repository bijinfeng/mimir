import { useMutation, useQuery } from '@tanstack/react-query'
import { App, Button, Select, Skeleton, Tooltip } from 'antd'
import type { ModelRoleStatus, ProviderInstance, RuntimeConfig } from '@mimir/shared'
import { api, ApiRequestError } from '@/lib/api'
import { ProviderList } from '@/components/settings/ProviderList'
import {
  modelsForRole,
  roleHint,
  useSaveModelConfig,
  withRoleBound,
  type ModelConfigDraft,
} from '@/components/settings/model-config'
import { Note, Panel, Row } from '@/components/settings/parts'
import { useStyles } from '@/components/settings/settings.style'

/**
 * 模型分区：**供应商在上，任务分配在下，同一屏**。
 *
 * ## 为什么放同一屏（而多数同类产品是两屏）
 *
 * 那些产品分屏是因为它们要装下 60-90 个预设供应商与十几个角色。
 * mimir 的规模是个位数供应商 + 五个角色——一屏装得下，而**装得下就放一起**：
 * 「我的模型从哪来」与「哪件事用哪个模型」是同一个决定的两半，
 * 分开两屏会让人来回对照。
 *
 * ## 两块的分工（这是之前别扭的地方）
 *
 * | 块 | 是什么 |
 * |---|---|
 * | 供应商 | 连接：地址 + 密钥 + 这个端点有哪些模型 |
 * | 任务分配 | 绑定：每个角色用**哪个供应商的哪个模型** |
 *
 * 之前是「一份全局连接 + 一堆裸模型名」，所以改供应商要来回看两处、
 * 而且无法表达「对话用 A 家、向量化用 B 家」。现在下边那一栏的选择器
 * 自带供应商——「模型和提供商分开」这个问题在下拉里就消失了。
 */
export function ModelsSection() {
  const { styles } = useStyles()
  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })
  const save = useSaveModelConfig()
  const { message } = App.useApp()

  const modelConfig = configQuery.data?.modelConfig

  if (!modelConfig) {
    return (
      <div className={styles.block}>
        <Skeleton active paragraph={{ rows: 4 }} title={false} />
      </div>
    )
  }

  /**
   * 提交改动。
   *
   * 每次都提交**整份配置**——它是一个 json 键，服务端按 `fromWire` 合并密钥。
   * 所以这里不需要「只提交改动的字段」那种局部更新，也就没有
   * 「漏传一个 id 导致密钥被清掉」的风险（那个风险由 `keyDrafts` 的语义管）。
   */
  const commit = (draft: ModelConfigDraft, options?: { silent?: boolean }) => {
    save.mutate(draft, {
      onSuccess: () => {
        if (!options?.silent) message.success('已保存')
      },
      onError: (error) => {
        const detail =
          error instanceof ApiRequestError && Array.isArray(error.details)
            ? (error.details as { message?: string }[]).map((item) => item.message).join('；')
            : String(error)
        message.error(`保存失败：${detail}`)
      },
    })
  }

  return (
    <>
      <Note>
        密钥只存服务端，<span className={styles.strong}>不下发浏览器</span>。
      </Note>

      <ProviderList
        providers={modelConfig.providers}
        presets={modelConfig.presets}
        onDraft={commit}
      />

      <Panel title="任务分配">
        {modelConfig.roles.map((role) => (
          <RoleRow
            key={role.role}
            role={role}
            providers={modelConfig.providers}
            onBind={(binding) =>
              commit(
                withRoleBound(
                  { providers: modelConfig.providers, roles: rolesToRecord(modelConfig.roles) },
                  role.role,
                  binding,
                ),
              )
            }
          />
        ))}
      </Panel>
    </>
  )
}

function rolesToRecord(roles: ModelRoleStatus[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const role of roles) {
    result[role.role] =
      role.providerId && role.model ? { providerId: role.providerId, model: role.model } : null
  }
  return result
}

/**
 * 一个角色：供应商 + 模型两个下拉，外加状态与探测。
 *
 * ## 为什么是两个下拉而不是一个「供应商/模型」组合下拉
 *
 * 组合下拉（一个 listbox 里分组）在选项多时更好，但 mimir 的规模下
 * 两个下拉更直接：**先选家再选型号**是用户心里的顺序，而且改供应商时
 * 不用重新在一长串里找位置。
 *
 * ## 就绪状态与原因都来自服务端
 *
 * 前端不自己判断「这个角色能不能用」——那需要知道供应商有没有密钥、
 * 密钥能不能解开、模型名是否为空。那些条件写在服务端一处
 * （`plugins/provider/src/provider.ts` 的 `overview()`），
 * 前端复刻一遍必然漂移。
 */
function RoleRow({
  role,
  providers,
  onBind,
}: {
  role: ModelRoleStatus
  providers: ProviderInstance[]
  onBind: (binding: { providerId: string; model: string } | null) => void
}) {
  const { styles } = useStyles()
  const { message: messageApi } = App.useApp()

  const probe = useMutation({
    mutationFn: () => api.probeRole(role.role),
    onSuccess: (result) => {
      if (result.ok) messageApi.success(result.message)
      else messageApi.error(result.message)
    },
    onError: (error) => messageApi.error(String(error)),
  })

  const current = providers.find((provider) => provider.id === role.providerId)
  const choices = current ? modelsForRole(current, role.role) : []
  const hint = roleHint(role)

  /**
   * 模型下拉的选项。
   *
   * 当前绑定的模型**不在列表里时也要显示出来**，否则用户看不到自己选了什么
   * （它可能是刚被「拉取模型」刷掉的名字，或是手改配置写进来的）。
   */
  const modelOptions = [
    ...(role.model !== '' && !choices.some((model) => model.id === role.model)
      ? [{ value: role.model, label: `${role.model}（不在列表里）` }]
      : []),
    ...choices.map((model) => ({ value: model.id, label: model.id })),
  ]

  return (
    <Row label={role.label}>
      {/*
        两个下拉都用 antd 的 `Select`，宽度写死。
        宽度不写死的话它会**随选中项的文字长度变宽**，而这两列在五行之间
        要能上下对齐（扫读时视线不用来回跳，DESIGN §8.1）。宽度取
        「够放常见供应商名 + 缺密钥后缀」——再长的名字截断，下拉里读全。

        早期这里是原生 `<select>`（理由是「五行设置页用不上浮层与虚拟列表」），
        但它不服从 token 体系：深色下是浏览器默认的白框，是整页唯一不属于
        这套设计的东西——与统计分区、账号分区被改掉的是同一个问题
        （docs/DECISIONS.md D-042、D-045）。
      */}
      <div className={styles.actions}>
        <Select<string | undefined>
          style={{ width: 200 }}
          value={role.providerId ?? undefined}
          placeholder="选择供应商"
          allowClear
          /* 下拉按内容宽：选项里会缀「· 缺密钥」，不必压进 200px 的框 */
          popupMatchSelectWidth={false}
          aria-label={`${role.label}的供应商`}
          onChange={(providerId) => {
            if (!providerId) {
              onBind(null)
              return
            }
            // 换供应商时模型要跟着重置——旧模型名在另一家多半不存在，
            // 留着它会让这个角色处于「绑定了一个不存在的模型」的状态
            const next = providers.find((provider) => provider.id === providerId)
            const first = next ? modelsForRole(next, role.role)[0]?.id : undefined
            onBind(first ? { providerId, model: first } : null)
          }}
          options={providers.map((provider) => ({
            value: provider.id,
            label: provider.hasKey ? provider.name : `${provider.name} · 缺密钥`,
          }))}
        />

        <Select<string | undefined>
          style={{ width: 220 }}
          value={role.model === '' ? undefined : role.model}
          disabled={!current || choices.length === 0}
          /*
            两种情况要分开说：
            - 没选供应商 → 「先选供应商」（用户知道下一步做什么）
            - 选了但没有模型 → 「这家没有模型」（用户知道要去拉取或手加）
            两者都显示同一句话会让用户以为是后一种而出错方向
          */
          placeholder={current ? '这家没有模型' : '先选供应商'}
          popupMatchSelectWidth={false}
          aria-label={`${role.label}的模型`}
          onChange={(model) => {
            if (!current || !model) return
            onBind({ providerId: current.id, model })
          }}
          options={modelOptions}
        />

        <StatusDot role={role} />

        <Button
          size="small"
          loading={probe.isPending}
          disabled={!role.ready}
          onClick={() => probe.mutate()}
        >
          测试
        </Button>
      </div>

      {hint ? (
        <div className={styles.blockDesc} style={{ marginTop: 5 }}>
          {hint}
        </div>
      ) : null}
    </Row>
  )
}

/**
 * 就绪状态。**四态**（未配置 / 未测试 / 可用 / 不可用）。
 *
 * 「没试过」与「试过不行」必须分开显示：把未测试显示成绿色，
 * 用户会以为已经验证过——而地址写错、模型名下架都只有真发一次才知道
 * （`docs/TECH.md` §7.8）。
 */
function StatusDot({ role }: { role: ModelRoleStatus }) {
  const { styles } = useStyles()
  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })
  const probe = configQuery.data?.probes.find((item) => item.target === `role:${role.role}`)

  if (!role.ready) {
    return (
      <Tooltip title={role.reason ?? '需要先配置'}>
        <span className={styles.pending}>未就绪</span>
      </Tooltip>
    )
  }

  if (!probe) {
    return (
      <Tooltip title="配置看起来齐了，但还没实际调用过。点「测试」发一次真实请求">
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

/** 「刚刚 / 3 分钟前」比 ISO 时间可读——它表达的是「这个结论有多新」 */
function formatTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return '刚刚测过'
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟前测过`
  return `${Math.round(seconds / 3600)} 小时前测过`
}

export type { RuntimeConfig }
