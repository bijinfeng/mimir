import { useMutation, useQuery } from '@tanstack/react-query'
import { App, Button, Cascader, Skeleton, Tooltip } from 'antd'
import { useState } from 'react'
import type { ModelRoleStatus, ProviderInstance, RuntimeConfig, SettingEntry } from '@mimir/shared'
import { api, ApiRequestError } from '../../lib/api'
import { LoadError } from '../LoadError'
import { ProviderForm } from './ProviderForm'
import { ProviderList } from './ProviderList'
import {
  modelRoleLabel,
  roleOptions,
  rolesToRecord,
  useSaveModelConfig,
  withRoleBound,
  type ModelConfigDraft,
} from './model-config'
import { BlockDesc, Panel, Row } from './parts'
import { SettingControl } from './SettingControl'
import { useStyles } from './settings.style'

/**
 * 模型分区：**供应商在上，任务分配在下，同一屏**。
 *
 * ## 为什么放同一屏（而多数同类产品是两屏）
 *
 * 那些产品分屏是因为它们要装下 60-90 个预设供应商与十几个角色。
 * mimir 的规模是个位数供应商 + 四个角色——一屏装得下，而**装得下就放一起**：
 * 「我的模型从哪来」与「哪件事用哪个模型」是同一个决定的两半，
 * 分开两屏会让人来回对照。
 *
 * ## 两块的分工（这是之前别扭的地方）
 *
 * | 块 | 是什么 |
 * |---|---|
 * | 供应商 | 连接：地址 + 密钥 + 这个端点有哪些模型（含用途）|
 * | 任务分配 | 绑定：每个角色用**哪个供应商的哪个模型** |
 *
 * ## 列表与表单是两个视图，不是两种组件（D-080）
 *
 * 列表只读（`ProviderList`），点「编辑」或「+ 添加供应商」切到表单
 * （`ProviderForm`，创建与编辑复用）。表单是**同一屏里的另一个视图**，
 * 不弹窗、不跳路由：供应商配置本来就是这一页的内容，
 * 弹窗会把「我在配哪一段」这层上下文切掉。
 */
export function ModelsSection() {
  const { styles } = useStyles()
  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })
  const save = useSaveModelConfig()
  const { message } = App.useApp()

  /** 「编辑中」的目标实例。`undefined` = 在列表态；`null` = 新建 */
  const [editing, setEditing] = useState<ProviderInstance | null | undefined>(undefined)

  const modelConfig = configQuery.data?.modelConfig
  const settings = configQuery.data?.settings ?? []

  if (configQuery.isError) {
    return <LoadError message="配置读取失败" onRetry={() => void configQuery.refetch()} />
  }

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

  if (editing !== undefined) {
    return (
      <ProviderForm
        /* key 让切换编辑对象时表单重建：内部 state（名称 / 模型草稿）在
           初始化时取一次，不重建就会带着上一个供应商的值 */
        key={editing?.id ?? 'new'}
        providers={modelConfig.providers}
        roles={modelConfig.roles}
        presets={modelConfig.presets}
        editing={editing}
        onDraft={commit}
        onDone={() => setEditing(undefined)}
      />
    )
  }

  return (
    <>
      <h2 className={styles.contentTitle}>模型</h2>
      <ProviderList
        providers={modelConfig.providers}
        roles={modelConfig.roles}
        onEdit={setEditing}
        onDraft={commit}
      />

      <Panel title="任务分配" desc="为对话、摘要、嵌入等角色绑定具体模型">
        {modelConfig.providers.length === 0 ? (
          <div className={styles.block}>
            <div className={styles.blockDesc}>添加供应商后可选择模型</div>
          </div>
        ) : (
          modelConfig.roles.map((role) => (
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
          ))
        )}
      </Panel>

      <ModelServiceSettings
        title="图片生成"
        entries={settings.filter((entry) => entry.key.startsWith('model.image.'))}
      />
      <ModelServiceSettings
        title="视觉输入"
        entries={settings.filter((entry) => entry.key === 'model.vision.enabled')}
      />
      <ModelServiceSettings
        title="音频转录"
        entries={settings.filter((entry) => entry.key.startsWith('model.transcription.'))}
      />
    </>
  )
}

function ModelServiceSettings({ title, entries }: { title: string; entries: SettingEntry[] }) {
  if (entries.length === 0) return null

  return (
    <Panel title={title}>
      {entries.map((entry) => (
        <Row key={entry.key} label={entry.label}>
          <SettingControl entry={entry} secret={entry.type === 'secret'} width={320} />
          {entry.description ? <BlockDesc>{entry.description}</BlockDesc> : null}
        </Row>
      ))}
    </Panel>
  )
}

/**
 * 一个角色：**一个级联选择器（供应商 → 模型）**，外加状态与探测。
 *
 * ## 为什么合并成一个级联（用户拍板，取代早先的两个 Select）
 *
 * 两个下拉的问题出在「先选家」这个中间态：用户选了供应商、还没选模型时，
 * 角色处于半配置状态——界面上写「未就绪」，而用户以为已经配好，于是去点
 * 「测试」发现按不动。级联把「选家」与「选型号」收在一次选择里，
 * **选中叶子才算绑定**，那个中间态不存在。
 *
 * 早先选两个 Select 的理由是「先选家再选型号是用户心里的顺序」——
 * 那个顺序在级联里依然成立（第一层就是家），只是不再把半成品状态落下来。
 *
 * ## 就绪状态与原因都来自服务端
 *
 * 前端不自己判断「这个角色能不能用」——那需要知道供应商有没有密钥、
 * 密钥能不能解开、模型名是否为空、模型的用途覆不覆盖这个角色。
 * 那些条件写在服务端一处（`plugins/provider/src/provider.ts` 的
 * `overview()`），前端复刻一遍必然漂移。**原因只在 tooltip 里出现**：
 * 每行下方不再挂一行说明（用户要求去掉），需要时悬停「未就绪」读。
 *
 * ## 选项怎么填
 *
 * 候选过滤（用途）、孤立绑定、没有可用模型时的占位都由
 * `roleOptions` 负责（那个纯函数有测试）；这里只管渲染与提交。
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
      if (result.ok) {
        messageApi.success(role.role === 'embed' ? '语义搜索模型可用' : result.message)
      } else {
        messageApi.error(
          role.role === 'embed' ? '语义搜索模型不可用，请检查模型设置' : result.message,
        )
      }
    },
    onError: (error) =>
      messageApi.error(role.role === 'embed' ? '语义搜索模型测试失败' : String(error)),
  })

  /**
   * 占位符。
   *
   * 摘要允许留空（会回落到对话模型），所以它的空态说「留空（回落到对话模型）」
   * ——否则用户不知道空着也是合法的，会以为没配完。其余角色必须选到一个
   * 具体模型，「选择供应商与模型」把这一步要做的两件事一起说了。
   */
  const placeholder = role.role === 'summarize' ? '留空（回落到对话模型）' : '选择供应商与模型'

  return (
    <Row label={modelRoleLabel(role)}>
      {/*
        宽度写死。级联的下拉浮层按内容宽（供应商列 + 模型列），
        但触发器固定宽度，让四个角色的控件在行间上下对齐
        （扫读时视线不用来回跳，DESIGN §8.1）。
      */}
      <div className={styles.actions}>
        <Cascader
          /* 280px 让四个角色的选择器对齐，也为同一行的状态与测试按钮留出空间。
             窄视口仍受内容列宽度约束，避免整页横向滚动。 */
          style={{ width: 280, maxWidth: '100%' }}
          value={
            role.providerId !== null && role.model !== ''
              ? [role.providerId, role.model]
              : undefined
          }
          placeholder={placeholder}
          allowClear
          aria-label={`${modelRoleLabel(role)}的模型`}
          onChange={(value) => {
            // 清除（[]）与「只点到供应商层」都归为留空——
            // 级联的 changeOnSelect 是关的，后者本不该发生，兜一下
            if (!Array.isArray(value) || value.length < 2) {
              onBind(null)
              return
            }
            onBind({ providerId: String(value[0]), model: String(value[1]) })
          }}
          options={roleOptions(role, providers)}
        />

        <StatusDot role={role} />

        <Tooltip title="会发起真实模型调用，可能产生用量">
          <Button
            size="small"
            loading={probe.isPending}
            disabled={!role.ready}
            onClick={() => probe.mutate()}
          >
            测试
          </Button>
        </Tooltip>
      </div>
    </Row>
  )
}

/**
 * 就绪状态。**四态**（未配置 / 未测试 / 可用 / 不可用）。
 *
 * 「没试过」与「试过不行」必须分开显示：把未测试显示成绿色，
 * 用户会以为已经验证过——而地址写错、模型名下架都只有真发一次才知道
 * （`.trellis/spec/project/architecture.md` §7.8）。
 */
function StatusDot({ role }: { role: ModelRoleStatus }) {
  const { styles } = useStyles()
  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })
  const probe = configQuery.data?.probes.find((item) => item.target === `role:${role.role}`)

  if (!role.ready) {
    return (
      <Tooltip
        title={role.role === 'embed' ? '请先为语义搜索选择可用模型' : (role.reason ?? '需要先配置')}
      >
        <span className={styles.pending}>未就绪</span>
      </Tooltip>
    )
  }

  if (!probe) {
    return (
      <Tooltip title="尚未测试。测试会发起真实模型调用。">
        <span className={styles.muted}>未测试</span>
      </Tooltip>
    )
  }

  return probe.ok ? (
    <Tooltip
      title={
        role.role === 'embed'
          ? `语义搜索模型可用（${formatTime(probe.at)}）`
          : `${probe.message}（${formatTime(probe.at)}）`
      }
    >
      <span className={styles.hint}>可用</span>
    </Tooltip>
  ) : (
    <Tooltip title={role.role === 'embed' ? '请检查语义搜索模型设置' : probe.message}>
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
