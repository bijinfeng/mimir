import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, InputNumber, Switch, Tooltip, message } from 'antd'
import { useState } from 'react'
import type { SettingEntry } from '@mimir/shared'
import { ApiRequestError, api } from '../../lib/api'
import { useStyles } from './settings.style'
import { clearSettingDraft, readSettingDraft, writeSettingDraft } from './draft-memory'

/** 把契约里的 unknown 值收窄成这个控件能处理的标量。结构化值一律当空 */
function toScalar(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return value as string | number | boolean
  }
  return null
}

/**
 * 一行可编辑的配置项。
 *
 * ## 为什么保存是**显式动作**，不是 onBlur
 *
 * 最初把保存挂在 `onBlur` 上，实测**没有生效**——真实浏览器里
 * 输入框按 Tab 之后仍保持焦点，blur 没触发，于是：
 *
 * ```
 * 界面上显示新值 → 数据库里一行都没有 → 徽标依然写「默认」
 * ```
 *
 * 用户看到的是「我改了」，实际什么都没发生。这正是设置页自己那条
 * 「画一个存不进去的假表单比没有更糟」（`.trellis/spec/project/architecture.md` §7.7）。
 *
 * 所以改成：改动即标脏 → 出现「保存」按钮 → 点它或按回车保存。
 * 两条路径都比一个看不见的 blur 可靠，而且**用户能看见自己还没保存**。
 *
 * ## 错误必须说出来
 *
 * 保存失败（值不合法、网络断了）时给出服务端返回的具体原因，
 * 而不是静默回滚——否则用户会以为是自己点错了地方。
 * 值本身先保持用户输入的内容，让人能改它。
 */
export function SettingControl({
  entry,
  width,
  /** 秘密类的输入框用密码样式，并且不回显当前值 */
  secret = false,
  placeholder,
  draftScope,
}: {
  entry: SettingEntry
  width?: number
  secret?: boolean
  placeholder?: string
  /** Keep only explicitly scoped drafts across section unmounts (S3 uses account ID). */
  draftScope?: string
}) {
  const { styles } = useStyles()
  const queryClient = useQueryClient()
  const [messageApi, contextHolder] = message.useMessage()

  /**
   * 草稿。初值来自服务端。
   *
   * `entry.value` 的类型是 `unknown`（契约里 json 类的值是任意结构，
   * 而这个控件只处理标量）。这里收窄一次：非标量一律当空——
   * 结构化值由专门的界面渲染（如供应商列表），不走这个控件。
   */
  const scalar = toScalar(entry.value)
  const serverValue = secret ? '' : scalar
  const draftKey = draftScope ? `${draftScope}:${entry.key}` : null
  const [draft, setDraft] = useState<string | number | boolean | null>(
    () => (draftKey ? readSettingDraft(draftKey) : undefined) ?? (secret ? '' : scalar),
  )
  const updateDraft = (value: string | number | boolean | null) => {
    setDraft(value)
    if (draftKey) {
      if (value === serverValue) clearSettingDraft(draftKey)
      else writeSettingDraft(draftKey, value)
    }
  }

  /**
   * 服务端值变了（保存成功后重新拉取、或另一个标签页改过）
   * 就把草稿同步过来——否则输入框会一直显示编辑前的旧值。
   *
   * **用「渲染期调整 state」而不是 `useEffect`**：effect 里同步 setState
   * 会触发一轮级联渲染，React 自己的 lint（`react/set-state-in-effect`）
   * 会拦下它，而且 React Compiler 会**跳过整个组件**（静默不优化，
   * 见 `.trellis/spec/renderer/frontend/conventions.md`）。这个写法是 React 官方推荐的替代方案：
   * 在同一次渲染中根据上一次的 props 调整 state，React 会立刻重渲染
   * 且不提交中间状态，用户看不到闪烁。
   */
  const [lastServerValue, setLastServerValue] = useState(serverValue)
  if (serverValue !== lastServerValue) {
    setLastServerValue(serverValue)
    if (!draftKey || readSettingDraft(draftKey) === undefined) setDraft(serverValue)
  }

  const save = useMutation({
    mutationFn: (value: string | number | boolean | null) =>
      api.updateSettings({ [entry.key]: value }),
    onSuccess: () => {
      if (draftKey) clearSettingDraft(draftKey)
      if (secret) setDraft('')
      messageApi.success('已保存')
      void queryClient.invalidateQueries({ queryKey: ['config'] })
    },
    onError: (error) => {
      // 服务端把「哪个键、什么原因」放在 details 里，直接显示它
      const detail =
        error instanceof ApiRequestError && Array.isArray(error.details)
          ? (error.details as { message?: string }[]).map((item) => item.message).join('；')
          : String(error)
      messageApi.error(`保存失败：${detail}`)
    },
  })

  /** 编辑后是否还没保存。空串视作「清除覆盖」，所以它也算改动 */
  const dirty = String(draft ?? '') !== String(secret ? '' : (scalar ?? ''))

  /**
   * 保存。`clear` 为真时显式写入 `null`（删除覆盖）。
   *
   * 「清除」不能复用「保存当前草稿」——用户可能在输入框里打了半截东西，
   * 此时点「清除」的意图是删掉已存的值，不是把那半截存进去。
   */
  const commit = (options: { clear?: boolean } = {}) => {
    if (!entry.writable) return
    if (options.clear) {
      updateDraft('')
      save.mutate(null)
      return
    }
    // 空串的语义也是「清除覆盖」——与服务端一致（null = 删除覆盖）
    save.mutate(draft === '' ? null : draft)
  }

  if (!entry.writable) {
    return <span className={styles.mono}>{String(entry.value)}</span>
  }

  /**
   * 文本类输入框（Input / Input.Password）在 actions 里吃满剩余宽度。
   * InputNumber 与 Switch 是固定语义宽度的控件，不给 flex:1——
   * 否则开关会被拉成一条横杠。
   */
  const isTextInput = entry.type === 'string' || secret

  const common = {
    'aria-label': entry.label,
    style: isTextInput
      ? { flex: 1, ...(width ? { maxWidth: width } : {}) }
      : width
        ? { width, maxWidth: '100%' }
        : undefined,
    disabled: save.isPending,
    onPressEnter: () => commit(),
    ...(placeholder ? { placeholder } : {}),
  }

  return (
    <div className={styles.actions}>
      {contextHolder}

      {entry.type === 'number' ? (
        <InputNumber
          {...common}
          value={typeof draft === 'number' ? draft : Number(entry.defaultValue)}
          onChange={(value) => updateDraft(value)}
        />
      ) : entry.type === 'boolean' ? (
        /*
          开关用 antd 的 `Switch` 而不是原生 checkbox：原生控件不服从 token
          体系——深色下是浏览器默认的白框，而勾选态的颜色（各浏览器不同）
          也不由我们校准（.trellis/spec/project/decisions.md D-042、D-045）。
        */
        <Switch
          aria-label={entry.label}
          checked={draft === true}
          disabled={save.isPending}
          onChange={(checked) => {
            updateDraft(checked)
            // 开关只有两态，用户点它就是这个意思——不需要再点一次保存
            save.mutate(checked)
          }}
        />
      ) : secret ? (
        <Input.Password
          {...common}
          value={typeof draft === 'string' ? draft : ''}
          placeholder={placeholder ?? (entry.configured ? '已配置（留空则不修改）' : '尚未配置')}
          onChange={(event) => updateDraft(event.target.value)}
        />
      ) : (
        <Input
          {...common}
          value={typeof draft === 'string' ? draft : String(entry.value ?? '')}
          onChange={(event) => updateDraft(event.target.value)}
        />
      )}

      <SaveButton
        dirty={dirty}
        pending={save.isPending}
        secret={secret}
        configured={entry.configured}
        onSave={() => commit()}
        onClear={() => commit({ clear: true })}
      />

      {entry.problem ? (
        <Tooltip title="这个值没有真正生效，见右侧说明">
          <span className={styles.warnText}>{entry.problem}</span>
        </Tooltip>
      ) : null}
    </div>
  )
}

/**
 * 保存按钮 + 秘密类的「清除」。
 *
 * 不脏的时候按钮**禁用**而不是隐藏：隐藏会让每一行的宽度跳来跳去，
 * 而禁用能告诉用户「这里有一个动作，只是现在不需要」。
 */
function SaveButton({
  dirty,
  pending,
  secret,
  configured,
  onSave,
  onClear,
}: {
  dirty: boolean
  pending: boolean
  secret: boolean
  configured: boolean
  onSave: () => void
  onClear: () => void
}) {
  return (
    <>
      <Button
        size="small"
        type={dirty ? 'primary' : 'default'}
        disabled={!dirty}
        loading={pending}
        onClick={onSave}
      >
        {dirty ? '保存' : '已保存'}
      </Button>
      {secret && configured ? (
        <Button size="small" onClick={onClear} disabled={pending}>
          清除
        </Button>
      ) : null}
    </>
  )
}
