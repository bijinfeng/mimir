import { useMutation } from '@tanstack/react-query'
import { App, Button, Input, Select, Tooltip, type SelectProps } from 'antd'
import { ArrowLeft, X } from 'lucide-react'
import { useState } from 'react'
import {
  MODEL_PURPOSES,
  inferModelPurposes,
  type FetchedModel,
  type ModelPurpose,
  type ModelRoleStatus,
  type ProviderInstance,
  type ProviderModel,
  type ProviderPreset,
} from '@mimir/shared'
import { api, ApiRequestError } from '../../lib/api'
import {
  mergeFetchedModels,
  modelPurposeLabel,
  modelRoleLabel,
  rolesToRecord,
  validateProviderForm,
  withProviderSaved,
  type ModelConfigDraft,
} from './model-config'
import { Panel } from './parts'
import { useStyles } from './settings.style'

/**
 * 表单里的一行模型。
 *
 * ## 为什么模型列表不是 `ProviderModel[]` 而是带行键的数组
 *
 * React key 需要一个**在改名时稳定的标识**：手动行从空串改成
 * `my-model` 时，若用 `model.id` 作 key，每次按键都换 key、整行重挂载、
 * 输入框丢焦点（中文输入法下更明显）；用下标作 key 则移动 / 删除行时
 * 受控值会错位（lint 也拦 `no-array-index-key`）。
 *
 * 所以列表在表单内部是一个 `{ key, model }` 数组——`key` 在行创建时
 * 生成、只在提交时丢弃；`model.id` 随便改，行身份不变。
 */
interface ModelDraftRow {
  key: string
  model: ProviderModel
}

/** 建一个行键。`crypto.randomUUID` 在测试环境（happy-dom 的部分版本）可能没有 */
function rowKey(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `row-${Math.random().toString(36).slice(2)}`
}

function toRows(models: ProviderModel[]): ModelDraftRow[] {
  return models.map((model) => ({ key: rowKey(), model }))
}

/**
 * 用合并后的模型清单重建行，**尽量沿用旧行的键**（按模型 id 对上）。
 *
 * 拉取会整表换掉模型列表：直接重建行会让所有行换 key、整块重挂载，
 * 新增行的闪光动画也失去「加在已有列表上」的感觉。对上 id 的行保留键，
 * 新模型拿新键。
 */
function rebuildRows(rows: ModelDraftRow[], models: ProviderModel[]): ModelDraftRow[] {
  const byId = new Map(
    rows.filter((row) => row.model.id !== '').map((row) => [row.model.id, row.key]),
  )
  return models.map((model) => ({ key: byId.get(model.id) ?? rowKey(), model }))
}

/**
 * 供应商的创建 / 编辑表单。**两者复用这一张**（D-080）——
 * 唯一的区别是创建时顶部多一块「从预设开始」，编辑时没有。
 *
 * ## 为什么从「就地编辑」改成整页表单
 *
 * 列表页原先每一家都是展开的输入框（名字 / 地址 / 密钥 / 模型 chips），
 * 一屏里全是可编辑控件——看一眼现状要先从输入框里把它读出来。
 * 现在列表只读、编辑进表单：**看是看，改是改**。
 *
 * ## 为什么拉取与手改共用一份草稿
 *
 * 「拉取模型」的结果**不写配置**（服务端的 `fetch-models` 是纯读），
 * 它进的是这张表单的模型清单——用户可以在其中删掉不要的、改用途、
 * 手加模型，然后**一起**保存。拉取与手改不是两条路径，
 * 它们是同一个清单的两种填入方式。
 *
 * ## 密钥的三态（与 `.trellis/spec/project/architecture.md` §5.7 同一张表）
 *
 * | 用户做什么 | `keyDraft` | 提交 |
 * |---|---|---|
 * | 不改密钥 | null | 不带那个 id（服务端保留已存的）|
 * | 新填一把 | 新值 | 进 `keyDrafts` |
 * | 点「清除」 | 空串 | 进 `keyDrafts`（明确清除）|
 */
export function ProviderForm({
  providers,
  roles,
  presets,
  editing,
  onDraft,
  onDone,
}: {
  providers: ProviderInstance[]
  roles: ModelRoleStatus[]
  presets: ProviderPreset[]
  /** 编辑的目标实例。`null` 表示创建 */
  editing: ProviderInstance | null
  onDraft: (draft: ModelConfigDraft, options?: { silent?: boolean }) => void
  onDone: () => void
}) {
  const { styles } = useStyles()
  const { message, modal } = App.useApp()

  const [name, setName] = useState(editing?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(editing?.baseUrl ?? '')
  const [keyDraft, setKeyDraft] = useState('')
  const [keyCleared, setKeyCleared] = useState(false)
  const [rows, setRows] = useState<ModelDraftRow[]>(() => toRows(editing?.models ?? []))
  const [preset, setPreset] = useState<ProviderPreset | null>(null)
  const [fetchedAt, setFetchedAt] = useState(editing?.modelsFetchedAt ?? null)
  const [pullNote, setPullNote] = useState<string | null>(null)
  const [flashIds, setFlashIds] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const fieldId = (field: string) => `provider-${editing?.id ?? 'new'}-${field}`
  const focusError = (field: string) => {
    requestAnimationFrame(() => {
      const modelIndex = /^model(\d+)$/.exec(field)?.[1]
      const row = modelIndex === undefined ? undefined : rows[Number(modelIndex)]
      document.getElementById(fieldId(row ? `model-${row.key}` : field))?.focus()
    })
  }

  /** 已存的密钥状态。编辑时来自实例；本次填的密钥由 `keyDraft` 表达 */
  const hasKey = editing?.hasKey ?? false
  const models = rows.map((row) => row.model)

  const markDirty = () => setDirty(true)

  /** 改一行模型（保留行键——手动行改 ID 时输入框不重挂载、不丢焦点）*/
  const patchRow = (index: number, patch: Partial<ProviderModel>) => {
    const next = rows.slice()
    const row = next[index]
    if (!row) return
    next[index] = { key: row.key, model: Object.assign({}, row.model, patch) }
    setRows(next)
  }

  const clearModelError = (index: number) => {
    setErrors((prev) => {
      if (!(prev[`model${index}`] !== undefined)) return prev
      const next = { ...prev }
      delete next[`model${index}`]
      return next
    })
  }

  /** 拉取模型：纯读请求，结果进草稿 */
  const pull = useMutation({
    mutationFn: () =>
      api.fetchModels({
        providerId: editing?.id ?? null,
        baseUrl: baseUrl.trim(),
        // 新填的密钥 > 已存的那把（服务端解析顺序，这里只负责如实传）
        apiKeyDraft: keyDraft.trim() !== '' ? keyDraft : null,
      }),
    onSuccess: (result) => {
      const merged = mergeFetchedModels(models, result.models)
      setRows(rebuildRows(rows, merged.models))
      setFlashIds(merged.added)
      setFetchedAt(result.fetchedAt)
      setPullNote(describePull(merged, result.models))
      setDirty(true)
      setErrors({})
      message.success(`拉到 ${result.models.length} 个模型`)
    },
    onError: (error) => {
      message.error(error instanceof ApiRequestError ? error.message : String(error))
    },
  })

  const askPull = () => {
    const url = baseUrl.trim()
    if (url === '') {
      setErrors((prev) => ({ ...prev, baseUrl: '先填接口地址' }))
      message.error('先填接口地址')
      focusError('baseUrl')
      return
    }
    const isLocal = /localhost|127\.0\.0\.1|\.local(\/|:|$)/.test(url)
    if (keyDraft.trim() === '' && !hasKey && !isLocal) {
      message.error('先填 API 密钥')
      return
    }
    pull.mutate()
  }

  const addManualModel = () => {
    // 已有一行空的手动行就停在那里，不再叠第二行
    const emptyRow = rows.find((row) => row.model.source === 'manual' && row.model.id.trim() === '')
    if (emptyRow) {
      requestAnimationFrame(() => {
        const input = document.getElementById(fieldId(`model-${emptyRow.key}`))
        input?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
        input?.focus({ preventScroll: true })
      })
      message.info('先填写这行的模型 ID')
      return
    }
    setRows([...rows, { key: rowKey(), model: { id: '', source: 'manual', purposes: ['chat'] } }])
    markDirty()
  }

  const togglePurpose = (index: number, purpose: ModelPurpose) => {
    const row = rows[index]
    if (!row) return
    const purposes = row.model.purposes.includes(purpose)
      ? row.model.purposes.filter((item) => item !== purpose)
      : [...row.model.purposes, purpose]
    patchRow(index, { purposes })
    clearModelError(index)
    markDirty()
  }

  const removeModel = (index: number) => {
    const model = models[index]
    if (!model) return

    const boundRoles = roles.filter(
      (role) => role.providerId === editing?.id && role.model === model.id,
    )

    const drop = () => {
      setRows(rows.filter((_, i) => i !== index))
      markDirty()
    }

    if (boundRoles.length > 0) {
      modal.confirm({
        title: `移除「${model.id}」？`,
        content: `它正被「${boundRoles.map(modelRoleLabel).join('、')}」任务使用，保存后需要重新分配。`,
        okText: '移除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: drop,
      })
      return
    }

    drop()
  }

  const pickPreset = (picked: ProviderPreset) => {
    setPreset(picked)
    setName(picked.name)
    setBaseUrl(picked.baseUrl)
    if (rows.length === 0) {
      setRows(
        toRows(
          picked.models.map((id) => ({
            id,
            source: 'preset' as const,
            purposes: inferModelPurposes(id),
          })),
        ),
      )
    }
    markDirty()
    requestAnimationFrame(() => {
      const input = document.getElementById(fieldId('name'))
      input?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
      input?.focus({ preventScroll: true })
    })
  }

  const tryBack = () => {
    if (!dirty) {
      onDone()
      return
    }
    modal.confirm({
      title: '放弃未保存的改动？',
      content: '保存之前，名称、地址、密钥、模型与用途都不会生效。',
      okText: '放弃并返回',
      okButtonProps: { danger: true },
      cancelText: '继续编辑',
      onOk: onDone,
    })
  }

  const save = () => {
    const nextErrors = validateProviderForm({
      name,
      baseUrl,
      models,
      hasKey,
      keyDraft,
      keyCleared,
      editing,
    })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      message.error('还有几处没填完')
      const first = ['name', 'baseUrl', 'key', ...models.map((_, index) => `model${index}`)].find(
        (field) => nextErrors[field],
      )
      if (first) focusError(first)
      return
    }

    const id = editing?.id ?? crypto.randomUUID()
    const instance: ProviderInstance = {
      id,
      preset: preset?.id ?? editing?.preset ?? 'custom',
      name: name.trim(),
      family: editing?.family ?? 'openai-compatible',
      baseUrl: baseUrl.trim().replace(/\/+$/, ''),
      hasKey: keyCleared ? false : hasKey || keyDraft.trim() !== '',
      models: models.map((model) => Object.assign({}, model, { id: model.id.trim() })),
      modelsFetchedAt: fetchedAt,
    }

    // 密钥指令：清除 > 新填 > 不动（不传）
    const keyDirective = keyCleared
      ? { value: '' }
      : keyDraft.trim() !== ''
        ? { value: keyDraft }
        : null

    onDraft(withProviderSaved({ providers, roles: rolesToRecord(roles) }, instance, keyDirective))
    onDone()
  }

  const isCreate = editing === null

  return (
    <>
      <div className={styles.settingsPath}>设置 / 模型</div>
      <div className={styles.formBar}>
        <Button type="text" size="small" icon={<ArrowLeft size={14} />} onClick={tryBack}>
          返回供应商列表
        </Button>
      </div>

      <h2 className={styles.providerFormTitle}>{isCreate ? '新建供应商' : '编辑供应商'}</h2>
      {isCreate ? (
        <PresetPanel
          presets={presets}
          picked={preset}
          onPick={pickPreset}
          onReset={() => setPreset(null)}
        />
      ) : null}

      <Panel className={styles.formPanel} title="连接" desc="配置显示名、接口地址与认证凭据">
        <div className={styles.formRow}>
          <label className={styles.formLabel} htmlFor={fieldId('name')}>
            显示名
          </label>
          <div className={styles.formValue}>
            <Input
              id={fieldId('name')}
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setErrors((current) => ({ ...current, name: '' }))
                markDirty()
              }}
              style={{ width: 300, maxWidth: '100%' }}
              placeholder="比如 DeepSeek"
              aria-label="显示名"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? fieldId('name-error') : undefined}
            />
            {errors.name ? (
              <div id={fieldId('name-error')} className={styles.formError} role="alert">
                {errors.name}
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles.formRow}>
          <label className={styles.formLabel} htmlFor={fieldId('baseUrl')}>
            接口地址
          </label>
          <div className={styles.formValue}>
            <Input
              id={fieldId('baseUrl')}
              value={baseUrl}
              onChange={(event) => {
                setBaseUrl(event.target.value)
                setErrors((current) => ({ ...current, baseUrl: '' }))
                markDirty()
              }}
              style={{ width: '100%', maxWidth: 440 }}
              placeholder="https://api.example.com/v1"
              aria-label="接口地址"
              aria-invalid={Boolean(errors.baseUrl)}
              aria-describedby={errors.baseUrl ? fieldId('baseUrl-error') : undefined}
            />
            {errors.baseUrl ? (
              <div id={fieldId('baseUrl-error')} className={styles.formError} role="alert">
                {errors.baseUrl}
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles.formRow}>
          <label className={styles.formLabel} htmlFor={fieldId('key')}>
            API 密钥
          </label>
          <div className={styles.formValue}>
            <Input.Password
              id={fieldId('key')}
              value={keyDraft}
              onChange={(event) => {
                setKeyDraft(event.target.value)
                setErrors((current) => ({ ...current, key: '' }))
                if (event.target.value.trim() !== '') setKeyCleared(false)
                markDirty()
              }}
              style={{ width: 300, maxWidth: '100%' }}
              placeholder={
                keyCleared
                  ? '保存后将清除密钥'
                  : hasKey
                    ? '已配置密钥（留空不修改）'
                    : '填入 API 密钥'
              }
              aria-label="API 密钥"
              aria-invalid={Boolean(errors.key)}
              aria-describedby={errors.key ? fieldId('key-error') : undefined}
            />

            {hasKey && !keyCleared ? (
              <Button
                size="small"
                onClick={() => {
                  setKeyDraft('')
                  setKeyCleared(true)
                  markDirty()
                }}
              >
                清除
              </Button>
            ) : null}
            {keyCleared ? (
              <Button
                type="link"
                size="small"
                onClick={() => {
                  setKeyCleared(false)
                  markDirty()
                }}
              >
                撤销清除
              </Button>
            ) : null}

            <KeyState hasKey={hasKey} keyCleared={keyCleared} keyDraft={keyDraft} />
            {errors.key ? (
              <div id={fieldId('key-error')} className={styles.formError} role="alert">
                {errors.key}
              </div>
            ) : null}
          </div>
        </div>
      </Panel>

      <Panel
        className={styles.formPanel}
        title={
          <>
            模型与用途
            <span className={styles.seamTag}>{models.length} 个</span>
          </>
        }
        desc="拉取或手动添加模型，并分配到对话、摘要等任务"
        extra={
          /*
            两个动作放标题条右端（demo 形态，用户拍板）：它们是**这一组的
            动作**——「给这家的模型清单拉取 / 加一个」。放进内容区会让标题
            与动作分成上下两块，多占一行高度。
          */
          <>
            <Button size="small" loading={pull.isPending} onClick={askPull}>
              拉取模型
            </Button>
            <Button size="small" onClick={addManualModel}>
              + 手动添加
            </Button>
          </>
        }
      >
        {pullNote ? <div className={styles.pullNote}>{pullNote}</div> : null}

        {models.length === 0 ? (
          <div className={styles.modelHint} style={{ paddingTop: 12 }}>
            暂无模型。
          </div>
        ) : (
          <>
            <div className={styles.modelHead}>
              <span>模型</span>
              <span>用途</span>
              <span>来源</span>
              <span aria-hidden />
            </div>
            {rows.map((row, index) => (
              <ModelRow
                key={row.key}
                model={row.model}
                index={index}
                flash={flashIds.includes(row.model.id)}
                error={errors[`model${index}`]}
                inputId={fieldId(`model-${row.key}`)}
                errorId={fieldId(`model${index}-error`)}
                onRename={(value) => {
                  patchRow(index, { id: value })
                  clearModelError(index)
                  markDirty()
                }}
                onToggle={(purpose) => togglePurpose(index, purpose)}
                onRemove={() => removeModel(index)}
              />
            ))}
          </>
        )}
      </Panel>

      <div className={styles.formFoot}>
        <Button type="primary" onClick={save}>
          保存
        </Button>
        <Button onClick={tryBack}>取消</Button>
      </div>
    </>
  )
}

/* ── 预设面板 ─────────────────────────────────────────── */

function PresetPanel({
  presets,
  picked,
  onPick,
  onReset,
}: {
  presets: ProviderPreset[]
  picked: ProviderPreset | null
  onPick: (preset: ProviderPreset) => void
  onReset: () => void
}) {
  const { styles } = useStyles()

  const sorted = [...presets].toSorted((a, b) => {
    if (a.popular !== b.popular) return a.popular ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className={styles.presetPicker}>
      <label htmlFor="provider-preset">从预设开始</label>
      <Select
        id="provider-preset"
        aria-label="供应商预设"
        className={styles.presetSelect}
        placeholder="选择预设，或直接填写"
        allowClear
        value={picked?.id}
        showSearch={{ optionFilterProp: 'searchLabel' }}
        onChange={(value) => {
          const preset = presets.find((item) => item.id === value)
          if (preset) onPick(preset)
          else onReset()
        }}
        options={sorted.map((preset) => ({
          value: preset.id,
          label: preset.name,
          searchLabel: `${preset.name} ${preset.baseUrl}`,
          url: preset.baseUrl,
          bodyClassName: styles.presetBody,
          urlClassName: styles.presetUrl,
        }))}
        optionRender={renderPresetOption}
      />
    </div>
  )
}

const renderPresetOption: SelectProps['optionRender'] = (option) => (
  <span className={option.data.bodyClassName}>
    <span>{option.label}</span>
    <span className={option.data.urlClassName}>{option.data.url || '需要自己填写接口地址'}</span>
  </span>
)

/* ── 模型行 ───────────────────────────────────────────── */

function ModelRow({
  model,
  index,
  flash,
  error,
  inputId,
  errorId,
  onRename,
  onToggle,
  onRemove,
}: {
  model: ProviderModel
  index: number
  flash: boolean
  error: string | undefined
  inputId: string
  errorId: string
  onRename: (value: string) => void
  onToggle: (purpose: ModelPurpose) => void
  onRemove: () => void
}) {
  const { styles } = useStyles()
  const manual = model.source === 'manual'

  return (
    <div className={`${styles.modelRow} ${flash ? styles.modelRowFlash : ''}`}>
      {manual ? (
        <Input
          id={inputId}
          size="small"
          value={model.id}
          onChange={(event) => onRename(event.target.value)}
          placeholder="模型 ID"
          aria-label={`模型 ${index + 1} 的 ID`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={styles.modelInput}
          autoFocus={model.id === ''}
        />
      ) : (
        <span className={styles.modelId} title={model.id}>
          {model.id}
        </span>
      )}

      <span className={styles.chipGroup}>
        {MODEL_PURPOSES.map((purpose) => {
          const on = model.purposes.includes(purpose)
          return (
            <button
              id={!manual && purpose === MODEL_PURPOSES[0] ? inputId : undefined}
              key={purpose}
              type="button"
              className={`${styles.chip} ${on ? styles.chipOn : ''}`}
              aria-pressed={on}
              aria-invalid={!manual && Boolean(error)}
              aria-describedby={!manual && error ? errorId : undefined}
              onClick={() => onToggle(purpose)}
            >
              {modelPurposeLabel(purpose)}
            </button>
          )
        })}
      </span>

      <span className={styles.sourceTag} title={SOURCE_HINT[model.source]}>
        {SOURCE_TEXT[model.source]}
      </span>

      <Tooltip title="从列表里移除。拉取过的模型下次拉取还会出现">
        <Button
          type="text"
          size="small"
          icon={<X size={14} />}
          aria-label={`移除 ${model.id || '这一行'}`}
          onClick={onRemove}
        />
      </Tooltip>

      {error ? (
        <div id={errorId} className={styles.formError} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  )
}

const SOURCE_TEXT = { preset: '预设', fetched: '拉取', manual: '手动' } as const

const SOURCE_HINT = {
  preset: '来自预设建议；拉取后被端点真实清单取代',
  fetched: '来自端点 /models',
  manual: '手动添加；拉取时不会被冲掉',
} as const

function KeyState({
  hasKey,
  keyCleared,
  keyDraft,
}: {
  hasKey: boolean
  keyCleared: boolean
  keyDraft: string
}) {
  const { styles } = useStyles()

  if (keyCleared) return <span className={styles.pending}>保存后清除</span>
  if (keyDraft.trim() !== '') {
    return (
      <span className={styles.pending} role="status">
        {hasKey ? '密钥已修改，待保存' : '密钥待保存'}
      </span>
    )
  }
  if (hasKey) return <span className={styles.okBadge}>已配置密钥</span>
  return <span className={styles.pending}>未配置密钥</span>
}

function describePull(
  merged: { added: string[]; removed: number; kept: number; typed: number },
  fetched: FetchedModel[],
): string {
  const parts = [
    `拉到 ${fetched.length} 个模型`,
    merged.added.length > 0 ? `新增 ${merged.added.length}` : null,
    merged.removed > 0 ? `移除 ${merged.removed}` : null,
    merged.kept > 0 ? `保留 ${merged.kept}` : null,
  ].filter(Boolean)

  const how =
    merged.typed > 0
      ? `其中 ${merged.typed} 个新模型的用途来自端点回传的类型，其余按模型名推断`
      : '端点没回传模型类型，新模型的用途按模型名推断'

  return `${parts.join(' · ')}——${how}。保存后生效。`
}
