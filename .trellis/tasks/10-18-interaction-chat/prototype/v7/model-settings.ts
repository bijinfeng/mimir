/** Explicitly synthetic capability fixtures. These are not claims about named commercial models. */
export type ReasoningCapability =
  | {
      status: 'supported'
      options: { value: string; label: string }[]
      default?: string
      allowInherit?: boolean
    }
  | { status: 'unsupported' | 'unknown' | 'loading' | 'error' }
export type ModelOption = {
  providerId: string
  providerLabel: string
  modelId: string
  label: string
  reasoning: ReasoningCapability
}
export type ModelSelection = { providerId: string; modelId: string; reasoningEffort?: string }
export const demoModels: ModelOption[] = [
  {
    providerId: 'demo-personal',
    providerLabel: '个人供应商 · 演示',
    modelId: 'model-a',
    label: '模型 A',
    reasoning: {
      status: 'supported',
      options: [
        { value: 'low', label: '低' },
        { value: 'medium', label: '中' },
        { value: 'high', label: '高' },
      ],
      default: 'medium',
    },
  },
  {
    providerId: 'demo-personal',
    providerLabel: '个人供应商 · 演示',
    modelId: 'model-b',
    label: '模型 B',
    reasoning: {
      status: 'supported',
      options: [
        { value: 'off', label: '关闭' },
        { value: 'high', label: '高' },
      ],
      default: 'off',
    },
  },
  {
    providerId: 'demo-team',
    providerLabel: '团队供应商 · 演示',
    modelId: 'model-a',
    label: '模型 A',
    reasoning: { status: 'unsupported' },
  },
  {
    providerId: 'demo-team',
    providerLabel: '团队供应商 · 演示',
    modelId: 'model-fixed',
    label: '模型 D（固定等级）',
    reasoning: {
      status: 'supported',
      options: [{ value: 'fixed', label: '固定' }],
      default: 'fixed',
    },
  },
  {
    providerId: 'demo-team',
    providerLabel: '团队供应商 · 演示',
    modelId: 'model-toggle',
    label: '模型 E（开关）',
    reasoning: {
      status: 'supported',
      options: [
        { value: 'off', label: '关闭' },
        { value: 'on', label: '开启' },
      ],
      default: 'off',
    },
  },
  {
    providerId: 'demo-team',
    providerLabel: '团队供应商 · 演示',
    modelId: 'model-default',
    label: '模型 F（供应商默认）',
    reasoning: {
      status: 'supported',
      options: [{ value: 'high', label: '高' }],
      allowInherit: true,
    },
  },
  {
    providerId: 'demo-team',
    providerLabel: '团队供应商 · 演示',
    modelId: 'model-loading',
    label: '模型 G（能力加载中）',
    reasoning: { status: 'loading' },
  },
  {
    providerId: 'demo-team',
    providerLabel: '团队供应商 · 演示',
    modelId: 'model-error',
    label: '模型 H（能力读取失败）',
    reasoning: { status: 'error' },
  },
  {
    providerId: 'demo-team',
    providerLabel: '团队供应商 · 演示',
    modelId: 'model-c',
    label: '模型 C',
    reasoning: { status: 'unknown' },
  },
]
export function modelKey(model: { providerId: string; modelId: string }): string {
  return JSON.stringify([model.providerId, model.modelId])
}
export function selectedModel(
  models: ModelOption[],
  selection?: ModelSelection,
): ModelOption | undefined {
  return selection && models.find((model) => modelKey(model) === modelKey(selection))
}
export function selectModel(model: ModelOption, previous?: ModelSelection): ModelSelection {
  const capability = model.reasoning
  return {
    providerId: model.providerId,
    modelId: model.modelId,
    ...(capability.status === 'supported'
      ? {
          reasoningEffort: capability.options.some(
            (option) => option.value === previous?.reasoningEffort,
          )
            ? previous!.reasoningEffort
            : capability.default,
        }
      : {}),
  }
}
export const initialModel = selectModel(demoModels[0]!)

export function validateModelSelection(models: ModelOption[], selection?: ModelSelection): boolean {
  const model = selectedModel(models, selection)
  if (!model) return false
  if (model.reasoning.status !== 'supported') return !selection?.reasoningEffort
  return (
    (!selection?.reasoningEffort && !!model.reasoning.allowInherit) ||
    model.reasoning.options.some((option) => option.value === selection?.reasoningEffort)
  )
}
