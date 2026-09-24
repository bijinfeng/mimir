import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, Button, Empty, Input, Popconfirm, Tag, Tooltip, Typography } from 'antd'
import { useState } from 'react'
import type { ProviderInstance, ProviderPreset } from '@mimir/shared'
import { api, ApiRequestError } from '@/lib/api'
import {
  providerSummary,
  withRoleBindingCleared,
  type ModelConfigDraft,
} from '@/components/settings/model-config'
import { Panel } from '@/components/settings/parts'
import { useStyles } from '@/components/settings/settings.style'

/**
 * 供应商列表。
 *
 * ## 一次配置 = 一个实例，所以同一家可以配两次
 *
 * 这是与「一份全局 baseURL + key」的实质区别：列表里每一项各有自己的
 * 地址、密钥与模型列表。要一个云端做对话 + 一个本地做向量化，
 * 建两条即可——不需要任何「多实例」的特殊机制，因为**列表本身就是形状**。
 *
 * ## 密钥的三个动作（三个必须分清的状态）
 *
 * | 用户做什么 | 提交什么 | 服务端 |
 * |---|---|---|
 * | 不改密钥，只改名字 | 不传那个 id | 保留已存的那把 |
 * | 新填一把 | 传新值 | 加密后替换 |
 * | 点「清除」 | 传空串 | 删掉 |
 *
 * 中间那一列是**界面上唯一需要理解的部分**：不传与传空串的含义完全不同，
 * 而搞错的后果是密钥被静默清掉。
 */
export function ProviderList({
  providers,
  presets,
  onDraft,
}: {
  providers: ProviderInstance[]
  presets: ProviderPreset[]
  /** 把改动交给外层统一提交（一个 json 键 = 整份配置一起写） */
  onDraft: (draft: ModelConfigDraft, options?: { silent?: boolean }) => void
}) {
  const { styles } = useStyles()
  const [adding, setAdding] = useState(false)

  return (
    <>
      <Panel
        title={
          <>
            供应商
            <span className={styles.seamTag}>
              {providers.length > 0 ? `${providers.length} 个` : '还没有配置'}
            </span>
          </>
        }
      >
        {providers.length === 0 ? (
          <div className={styles.block}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <span className={styles.blockDesc}>
                  还没有供应商。加一个之后，下面的角色就能选它的模型了。
                </span>
              }
            />
          </div>
        ) : (
          providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              providersSnapshot={providers}
              onDraft={onDraft}
            />
          ))
        )}

        <div className={styles.block}>
          {adding ? (
            <PresetPicker
              presets={presets}
              onCancel={() => setAdding(false)}
              onPick={(preset, name, apiKey, provider) => {
                setAdding(false)
                onDraft(
                  {
                    providers: [...providers, provider],
                    roles: {},
                    keyDrafts: { [provider.id]: apiKey },
                  } as ModelConfigDraft,
                  { silent: true },
                )
                void name
              }}
            />
          ) : (
            <Button type="dashed" onClick={() => setAdding(true)}>
              + 添加供应商
            </Button>
          )}
        </div>
      </Panel>
    </>
  )
}

/**
 * 一个供应商。
 *
 * 字段就地可改（名字 / 地址），因为它们是**一行的两个属性**——
 * 弹窗或折叠面板会让「改一下地址」变成三步操作。
 * 模型列表与密钥另有两个显式动作（拉取 / 保存），因为它们各要一次请求。
 */
function ProviderCard({
  provider,
  providersSnapshot,
  onDraft,
}: {
  provider: ProviderInstance
  /** 完整列表：删除时要基于它算出「去掉这一个」的结果 */
  providersSnapshot: ProviderInstance[]
  onDraft: (draft: ModelConfigDraft, options?: { silent?: boolean }) => void
}) {
  const { styles } = useStyles()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const [name, setName] = useState(provider.name)
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl)
  const [keyDraft, setKeyDraft] = useState('')

  /** 拉到新列表后本地也要跟上（服务端已经写回了） */
  const refresh = useMutation({
    mutationFn: () => api.refreshProviderModels(provider.id),
    onSuccess: (result) => {
      message.success(`拉到 ${result.instance.models.length} 个模型`)
      void queryClient.invalidateQueries({ queryKey: ['config'] })
    },
    onError: (error) => {
      message.error(error instanceof ApiRequestError ? error.message : String(error))
    },
  })

  /** 供应商级探测：不依赖角色绑定，所以新建之后立刻能验 */
  const probe = useMutation({
    mutationFn: () => api.probeProvider(provider.id),
    onSuccess: (result) => {
      if (result.ok) message.success(result.message)
      else message.error(result.message)
    },
    onError: (error) => message.error(String(error)),
  })

  const dirty = name !== provider.name || baseUrl !== provider.baseUrl || keyDraft !== ''

  return (
    <div className={styles.block}>
      <div className={styles.providerHead}>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          style={{ width: 160 }}
          placeholder="显示名"
        />
        <Input
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          style={{ flex: 1, minWidth: 200 }}
          placeholder="https://api.example.com/v1"
        />
        <KeyBadge provider={provider} />
      </div>

      <div className={styles.providerHead} style={{ marginTop: 8 }}>
        <Input.Password
          value={keyDraft}
          onChange={(event) => setKeyDraft(event.target.value)}
          style={{ width: 260 }}
          placeholder={provider.hasKey ? '已配置密钥（留空则不修改）' : '填入 API 密钥'}
        />

        <Button
          size="small"
          type={dirty ? 'primary' : 'default'}
          disabled={!dirty}
          onClick={() => {
            /**
             * 一行的改动一起提交：名字、地址、密钥（如果有新填的）。
             *
             * 密钥只在**用户真的填了**时才进 `keyDrafts`——留空意味着
             * 「别动已存的那把」。这正是 `keyDrafts` 与「传空串」的区别。
             */
            onDraft({
              providers: [{ ...provider, name, baseUrl }],
              roles: {},
              ...(keyDraft.trim() !== '' ? { keyDrafts: { [provider.id]: keyDraft } } : {}),
            })
            setKeyDraft('')
          }}
        >
          {dirty ? '保存' : '已保存'}
        </Button>

        <Button size="small" loading={refresh.isPending} onClick={() => refresh.mutate()}>
          拉取模型
        </Button>

        <Button size="small" loading={probe.isPending} onClick={() => probe.mutate()}>
          测试连接
        </Button>

        <Popconfirm
          title="删除这个供应商？"
          description="绑定到它的角色会被清空"
          onConfirm={() =>
            // 从外层传来的完整列表里摘掉这一个（并清掉指向它的角色绑定）
            onDraft(
              withRoleBindingCleared({ providers: providersSnapshot, roles: {} }, provider.id),
            )
          }
        >
          <Button size="small" danger>
            删除
          </Button>
        </Popconfirm>
      </div>

      <div className={styles.blockDesc} style={{ marginTop: 6 }}>
        {providerSummary(provider)}
        {provider.modelsFetchedAt
          ? ` · ${new Date(provider.modelsFetchedAt).toLocaleString()} 拉取过`
          : provider.models.length > 0
            ? ' · 来自预设'
            : ''}
      </div>

      {provider.models.length > 0 ? (
        <div className={styles.modelChips}>
          {provider.models.slice(0, 12).map((model) => (
            <Tag key={model.id} className={styles.modelChip}>
              {model.id}
            </Tag>
          ))}
          {provider.models.length > 12 ? (
            <span className={styles.blockDesc}>还有 {provider.models.length - 12} 个…</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** 密钥状态徽标。**只显示有没有，不显示值** */
function KeyBadge({ provider }: { provider: ProviderInstance }) {
  const { styles } = useStyles()

  if (provider.hasKey) {
    return (
      <Tooltip title="密钥已加密存储，不会下发到浏览器">
        <span className={styles.okBadge}>已配置密钥</span>
      </Tooltip>
    )
  }

  return (
    <Tooltip title="没有密钥就没法发请求。点「保存」提交你填的那把">
      <span className={styles.pending}>未配置密钥</span>
    </Tooltip>
  )
}

/**
 * 预设选择器。
 *
 * 这是「加一家服务商不需要写代码」的界面落点：列表直接来自服务端
 * 返回的预设目录（`plugins/provider/src/presets.ts`），所以加一行数据
 * 界面上就多一个选项。
 *
 * 排序把常用（`popular`）放前面，其余按字母——常用的四五家覆盖绝大多数情况。
 */
function PresetPicker({
  presets,
  onPick,
  onCancel,
}: {
  presets: ProviderPreset[]
  onPick: (preset: ProviderPreset, name: string, apiKey: string, provider: ProviderInstance) => void
  onCancel: () => void
}) {
  const { styles } = useStyles()
  const [picked, setPicked] = useState<ProviderPreset | null>(null)
  const [key, setKey] = useState('')
  const [customUrl, setCustomUrl] = useState('')

  const sorted = [...presets].toSorted((a, b) => {
    if (a.popular !== b.popular) return a.popular ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  if (!picked) {
    return (
      <div className={styles.presetGrid}>
        {sorted.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={styles.presetCard}
            onClick={() => {
              setPicked(preset)
              setCustomUrl(preset.baseUrl)
            }}
          >
            <span className={styles.presetName}>{preset.name}</span>
            {preset.popular ? <span className={styles.presetDot} /> : null}
            <span className={styles.presetUrl}>{preset.baseUrl || '需要自己填地址'}</span>
          </button>
        ))}
        <button type="button" className={styles.presetCard} onClick={onCancel}>
          <span className={styles.presetName}>取消</span>
        </button>
      </div>
    )
  }

  return (
    <div className={styles.block}>
      <Typography.Paragraph className={styles.blockDesc} style={{ marginBottom: 10 }}>
        {picked.name}
        {picked.note ? ` — ${picked.note}` : ''}
      </Typography.Paragraph>

      <div className={styles.actions}>
        <Input
          value={customUrl}
          onChange={(event) => setCustomUrl(event.target.value)}
          style={{ width: 320 }}
          placeholder="接口地址"
        />
        <Input.Password
          value={key}
          onChange={(event) => setKey(event.target.value)}
          style={{ width: 260 }}
          placeholder={
            picked.id === 'ollama' || picked.id === 'lmstudio' ? '本地服务随便填一个' : 'API 密钥'
          }
        />
        <Button
          type="primary"
          onClick={() =>
            onPick(
              picked,
              picked.name,
              key.trim() === '' && (picked.id === 'ollama' || picked.id === 'lmstudio')
                ? 'local'
                : key,
              buildInstance(picked, customUrl),
            )
          }
        >
          添加
        </Button>
        <Button onClick={() => setPicked(null)}>返回</Button>
      </div>
    </div>
  )
}

/**
 * 从预设造一个实例。
 *
 * id 在前端生成（`crypto.randomUUID`）：服务端只把它当作不透明的标识，
 * 而本地生成让「加供应商」成为一次纯粹的写入——不需要先请服务端分配一个 id，
 * 也就没有「分配了但没保存」的中间态。
 */
function buildInstance(preset: ProviderPreset, baseUrl: string): ProviderInstance {
  return {
    id: crypto.randomUUID(),
    preset: preset.id,
    name: preset.name,
    family: preset.family,
    baseUrl: baseUrl.trim().replace(/\/+$/, ''),
    hasKey: false,
    models: preset.models.map((id) => ({ id, source: 'preset' as const })),
    modelsFetchedAt: null,
  }
}
