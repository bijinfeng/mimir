import { supportedReasoningLevels } from '@tanstack/ai'
import {
  createOpenaiChatCompletions,
  OpenAIChatCompletionsTextAdapter,
  OPENAI_CHAT_MODELS,
} from '@tanstack/ai-openai'
import type {
  ChatModelOption,
  ChatModelSelection,
  ModelAdapter,
  ProviderModel,
} from '@mimir/shared'
import type { InternalProvider } from './instances.js'
import { NATIVE_TOOL_MODELS, NATIVE_CONTEXT_WINDOWS } from './native-tool-models.js'

type NativeModel = (typeof OPENAI_CHAT_MODELS)[number]

/** Public adapter subclass exposes its official protected model metadata, without I/O. */
class NativeMetadata extends OpenAIChatCompletionsTextAdapter<NativeModel> {
  describeReasoning() {
    return this.modelReasoning(this.model)
  }
}

export function isNativeOpenAI(baseUrl: string): boolean {
  const url = new URL(baseUrl)
  return (
    url.protocol === 'https:' &&
    url.hostname === 'api.openai.com' &&
    (!url.port || url.port === '443') &&
    /^\/v1\/?$/.test(url.pathname)
  )
}

function nativeMetadata(provider: InternalProvider, model: ProviderModel) {
  if (!isNativeOpenAI(provider.baseUrl) || !OPENAI_CHAT_MODELS.includes(model.id as NativeModel))
    return null
  return new NativeMetadata(
    { apiKey: 'metadata-only-no-network', baseURL: provider.baseUrl },
    model.id as NativeModel,
  )
}

export function describeChatModel(
  provider: InternalProvider,
  model: ProviderModel,
): ChatModelOption {
  const native = nativeMetadata(provider, model)
  const official = native?.describeReasoning()
  const configured = model.capabilities
  return {
    providerId: provider.id,
    modelId: model.id,
    label: model.id,
    reasoning: native
      ? official
        ? { status: 'supported', levels: [...supportedReasoningLevels(official)] }
        : { status: 'unsupported' }
      : (configured?.reasoning ?? { status: 'unknown' }),
    vision: native?.inputModalities
      ? native.inputModalities.includes('image')
        ? 'supported'
        : 'unsupported'
      : (configured?.vision ?? 'unknown'),
    ...(native && NATIVE_CONTEXT_WINDOWS[model.id]
      ? { contextWindowTokens: NATIVE_CONTEXT_WINDOWS[model.id] }
      : configured?.contextWindowTokens
        ? { contextWindowTokens: configured.contextWindowTokens }
        : {}),
    tools: native
      ? NATIVE_TOOL_MODELS.has(model.id)
        ? 'supported'
        : 'unsupported'
      : (configured?.tools ?? 'unknown'),
  }
}

export function selectedChatAdapter(
  provider: InternalProvider,
  model: ProviderModel,
  apiKey: string,
  selection: ChatModelSelection,
  compatible: () => unknown,
): ModelAdapter {
  const capabilities = describeChatModel(provider, model)
  const effort = selection.reasoningEffort
  if (
    effort !== undefined &&
    (capabilities.reasoning.status !== 'supported' ||
      !capabilities.reasoning.levels.includes(effort))
  ) {
    throw new Error('所选模型的推理等级已失效，请重新选择')
  }
  const native = nativeMetadata(provider, model)
  let modelOptions: Record<string, unknown> | undefined
  if (!native && effort !== undefined) {
    const parameter = model.capabilities?.reasoningParameter
    if (!parameter) throw new Error('供应商尚未配置推理参数映射')
    modelOptions =
      parameter === 'thinking.type' ? { thinking: { type: effort } } : { reasoning_effort: effort }
  }
  return {
    role: 'chat',
    model: model.id,
    providerId: provider.id,
    baseUrlHost: new URL(provider.baseUrl).host,
    instance: native
      ? createOpenaiChatCompletions(model.id as NativeModel, apiKey, { baseURL: provider.baseUrl })
      : compatible(),
    ...(native && effort !== undefined ? { reasoning: { level: effort } } : {}),
    ...(modelOptions ? { modelOptions } : {}),
  }
}
