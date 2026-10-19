import { z } from 'zod'

/** Exact per-run identity; effort never chooses a role or another model. */
export const chatModelSelectionSchema = z
  .object({
    providerId: z.string().trim().min(1).max(200),
    modelId: z.string().trim().min(1).max(200),
    reasoningEffort: z.string().min(1).max(100).optional(),
  })
  .strict()
export type ChatModelSelection = z.infer<typeof chatModelSelectionSchema>

export const modelCapabilityStateSchema = z.enum(['supported', 'unsupported', 'unknown'])
export const modelReasoningSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('supported'),
    levels: z.array(z.string().min(1).max(100)).min(1).max(20),
    default: z.string().optional(),
  }),
  z.object({ status: z.literal('unsupported') }),
  z.object({ status: z.literal('unknown') }),
])
export type ModelReasoningCapability = z.infer<typeof modelReasoningSchema>

/** Explicit provider configuration, never inferred from a model's name. */
export const configuredModelCapabilitiesSchema = z
  .object({
    reasoning: modelReasoningSchema.optional(),
    reasoningParameter: z.enum(['reasoning_effort', 'thinking.type']).optional(),
    vision: modelCapabilityStateSchema.optional(),
    tools: modelCapabilityStateSchema.optional(),
    contextWindowTokens: z.number().int().min(1024).max(10000000).optional(),
  })
  .refine(
    (value) => value.reasoning?.status !== 'supported' || !!value.reasoningParameter,
    '支持推理等级时必须配置供应商参数映射',
  )
  .refine(
    (value) =>
      value.reasoning?.status !== 'supported' ||
      !value.reasoning.default ||
      value.reasoning.levels.includes(value.reasoning.default),
    '默认推理等级必须包含在支持等级中',
  )
export type ConfiguredModelCapabilities = z.infer<typeof configuredModelCapabilitiesSchema>
export const chatModelOptionSchema = z.object({
  providerId: z.string(),
  modelId: z.string(),
  label: z.string(),
  reasoning: modelReasoningSchema,
  vision: modelCapabilityStateSchema,
  tools: modelCapabilityStateSchema,
  contextWindowTokens: z.number().int().optional(),
})
export type ChatModelOption = z.infer<typeof chatModelOptionSchema>
export const chatModelCatalogSchema = z.object({
  providers: z.array(
    z.object({
      providerId: z.string(),
      providerName: z.string(),
      models: z.array(chatModelOptionSchema),
    }),
  ),
  defaultSelection: chatModelSelectionSchema.nullable(),
})
export type ChatModelCatalog = z.infer<typeof chatModelCatalogSchema>

/** Local branch selection is an ordered subset of canonical persisted message IDs. */
export const chatHistoryMessageIdsSchema = z
  .array(z.string().min(1).max(200))
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, '对话历史不能包含重复消息')
export const EVENT_MESSAGE_IDENTITY = 'mimir.message' as const
export interface ChatMessageIdentity {
  messageId: string
  clientMessageId: string
  role: 'user' | 'assistant'
}
