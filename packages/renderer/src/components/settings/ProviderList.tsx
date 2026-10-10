import { useMutation } from '@tanstack/react-query'
import { App, Button, Popconfirm, Tooltip } from 'antd'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import {
  MODEL_PURPOSE_LABELS,
  type ModelRoleStatus,
  type ProviderInstance,
  type ProviderPreset,
} from '@mimir/shared'
import { api } from '../../lib/api'
import { purposeSummary, withProviderRemoved, type ModelConfigDraft } from './model-config'
import { Panel } from './parts'
import { useStyles } from './settings.style'

/**
 * 供应商列表。**只读**（D-080）——看是看，改是改。
 *
 * ## 为什么不再是「就地编辑」
 *
 * 早先每一家都是展开的输入框（名字 / 地址 / 密钥 / 模型），一屏里全是
 * 可编辑控件：想确认「向量化这家配好没有」要从三个输入框里把值读出来，
 * 而误点一下就是一个未保存的改动。现在卡片只展示事实——
 * 名字、密钥有没有、地址、几个模型、用途分布、哪个角色在用——
 * 要改就进「编辑」页（与创建复用同一张表单）。
 *
 * ## 展开的模型明细也是只读的
 *
 * 用途标在模型行上（D-080 的用途模型），所以看一眼就知道
 * 「向量化这家有没有能用的」。改用途要去编辑页——那是一个显式动作。
 */
export function ProviderList({
  providers,
  roles,
  onEdit,
  onDraft,
}: {
  providers: ProviderInstance[]
  roles: ModelRoleStatus[]
  /** `null` 表示新建 */
  onEdit: (provider: ProviderInstance | null) => void
  /** 把改动交给外层统一提交（一个 json 键 = 整份配置一起写） */
  onDraft: (draft: ModelConfigDraft, options?: { silent?: boolean }) => void
}) {
  const { styles } = useStyles()
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())

  const toggle = (id: string) => {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpanded(next)
  }

  return (
    <Panel
      title={
        <>
          供应商
          {providers.length > 0 ? (
            <span className={styles.seamTag}>{providers.length} 个</span>
          ) : null}
        </>
      }
    >
      {providers.length === 0 ? (
        <div className={styles.providerEmpty}>
          <span className={styles.blockDesc}>暂无供应商</span>
          <Button type="primary" onClick={() => onEdit(null)}>
            添加供应商
          </Button>
        </div>
      ) : (
        providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            providersSnapshot={providers}
            roles={roles}
            expanded={expanded.has(provider.id)}
            onToggle={() => toggle(provider.id)}
            onEdit={() => onEdit(provider)}
            onDraft={onDraft}
          />
        ))
      )}

      {providers.length > 0 ? (
        <div className={styles.block}>
          <Button onClick={() => onEdit(null)}>添加供应商</Button>
        </div>
      ) : null}
    </Panel>
  )
}

/**
 * 一个供应商（只读卡片）。
 *
 * 摘要行回答四个问题：有几个模型、什么时候拉的、用途怎么分布、
 * 哪个角色在用。它们全是**扫读型事实**——用户来这一页就是来核对这些的。
 */
function ProviderCard({
  provider,
  providersSnapshot,
  roles,
  expanded,
  onToggle,
  onEdit,
  onDraft,
}: {
  provider: ProviderInstance
  /** 完整列表：删除时要基于它算出「去掉这一个」的结果 */
  providersSnapshot: ProviderInstance[]
  roles: ModelRoleStatus[]
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDraft: (draft: ModelConfigDraft, options?: { silent?: boolean }) => void
}) {
  const { styles } = useStyles()
  const { message } = App.useApp()

  /** 供应商级探测：不依赖角色绑定，所以新建之后立刻能验 */
  const probe = useMutation({
    mutationFn: () => api.probeProvider(provider.id),
    onSuccess: (result) => {
      if (result.ok) message.success(result.message)
      else message.error(result.message)
    },
    onError: (error) => message.error(String(error)),
  })

  const usedBy = roles.filter((role) => role.providerId === provider.id)
  const purposes = purposeSummary(provider.models)
  const fetched = provider.modelsFetchedAt
    ? `${new Date(provider.modelsFetchedAt).toLocaleString()} 拉取过`
    : '来自预设'

  const meta = [
    `${provider.models.length} 个模型 · ${fetched}`,
    purposes,
    usedBy.length > 0 ? `角色在用：${usedBy.map((role) => role.label).join('、')}` : null,
  ].filter(Boolean)

  return (
    <div className={styles.providerCard}>
      <div>
        <div className={styles.providerHead}>
          <span className={styles.providerName}>{provider.name}</span>
          <KeyBadge provider={provider} />
        </div>

        <div className={styles.providerUrl}>{provider.baseUrl}</div>
        <div className={styles.blockDesc} style={{ marginTop: 5 }}>
          {meta.join(' · ')}
        </div>
      </div>

      {/*
        三个动作在**右上角**（demo 形态，用户拍板）：它们作用于整张卡，
        与左侧「这个供应商是谁」的信息是两个并列的子项。挤在信息块下面
        会让卡片在纵向上多出一行按钮的高度，而右上角本来就是这类
        「卡级动作」的惯常位置。
      */}
      <div className={styles.providerActions}>
        <Tooltip title="会发起真实模型调用，可能产生用量">
          <Button size="small" loading={probe.isPending} onClick={() => probe.mutate()}>
            测试连接
          </Button>
        </Tooltip>
        <Button size="small" onClick={onEdit}>
          编辑
        </Button>
        <Popconfirm
          title="删除这个供应商？"
          description="绑定到它的角色会被清空"
          onConfirm={() =>
            // 从外层传来的完整列表里摘掉这一个（并清掉指向它的角色绑定）
            onDraft(withProviderRemoved({ providers: providersSnapshot, roles: {} }, provider.id))
          }
        >
          <Button size="small" danger>
            删除
          </Button>
        </Popconfirm>
      </div>

      {/*
        「查看模型」是**链接样式**（demo 形态）而不是与上面三个动作同款的
        按钮：它不作用于这一张卡，而是**展开这张卡的另一层**。同款按钮会让
        四个并排的动作里混进一个语义不同的东西；链接色 + 无边框把它读成
        「这一行的展开入口」。箭头在文字之后，展开时翻转。
      */}
      <div className={styles.providerExpander}>
        <button type="button" className={styles.expanderLink} onClick={onToggle}>
          {expanded ? '收起模型' : `查看模型（${provider.models.length}）`}
          <ChevronDown
            size={12}
            style={{
              transform: expanded ? 'rotate(180deg)' : undefined,
              transition: 'transform .15s',
            }}
          />
        </button>
      </div>

      {expanded ? (
        <div className={styles.readonlyModels}>
          {provider.models.length === 0 ? (
            <div className={styles.blockDesc}>这家还没有模型。进「编辑」拉取或手动添加。</div>
          ) : (
            provider.models.map((model) => (
              <div key={model.id} className={styles.modelRowRead}>
                <span className={styles.modelId} title={model.id}>
                  {model.id}
                </span>
                <span className={styles.chipGroup}>
                  {model.purposes.map((purpose) => (
                    <span key={purpose} className={styles.chipStatic}>
                      {MODEL_PURPOSE_LABELS[purpose]}
                    </span>
                  ))}
                </span>
                <span className={styles.sourceTag}>{SOURCE_TEXT[model.source]}</span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

const SOURCE_TEXT = { preset: '预设', fetched: '拉取', manual: '手动' } as const

/** 密钥状态徽标。**只显示有没有，不显示值** */
function KeyBadge({ provider }: { provider: ProviderInstance }) {
  const { styles } = useStyles()

  if (provider.hasKey) return <span className={styles.okBadge}>已配置密钥</span>
  return <span className={styles.pending}>未配置密钥</span>
}

export type { ProviderPreset }
