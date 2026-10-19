import type { ChatModelCatalog, ChatModelSelection } from '@mimir/shared'
export function modelKey(model: { providerId: string; modelId: string }) {
  return JSON.stringify([model.providerId, model.modelId])
}
export function selectedModel(
  catalog: ChatModelCatalog | undefined,
  selection: ChatModelSelection | undefined,
) {
  return selection
    ? catalog?.providers
        .flatMap((provider) => provider.models)
        .find((model) => modelKey(model) === modelKey(selection))
    : undefined
}
export function changeModel(
  catalog: ChatModelCatalog | undefined,
  providerId: string,
  modelId: string,
  previous?: ChatModelSelection,
): ChatModelSelection {
  const model = selectedModel(catalog, { providerId, modelId })
  const effort =
    model?.reasoning.status === 'supported'
      ? previous?.reasoningEffort && model.reasoning.levels.includes(previous.reasoningEffort)
        ? previous.reasoningEffort
        : model.reasoning.default
      : undefined
  return { providerId, modelId, ...(effort ? { reasoningEffort: effort } : {}) }
}
export function assertModel(
  catalog: ChatModelCatalog | undefined,
  selection: ChatModelSelection | undefined,
) {
  const model = selectedModel(catalog, selection)
  if (!model || !selection) throw new Error('请选择可用模型后发送')
  if (
    selection.reasoningEffort !== undefined &&
    (model.reasoning.status !== 'supported' ||
      !model.reasoning.levels.includes(selection.reasoningEffort))
  )
    throw new Error('当前推理等级不可用，请重新选择')
  return model
}
export const effortLabel = (value: string) =>
  ({
    off: '关闭',
    none: '关闭',
    minimal: '极低',
    low: '低',
    medium: '中',
    high: '高',
    xhigh: '极高',
    max: '最高',
  })[value] ?? value
