import { chat, embed, summarize, supportedReasoningLevels, clampReasoningLevel } from '@tanstack/ai'
import type { ModelReasoning, AdapterReasoning, ReasoningOptionFor } from '@tanstack/ai'
import {
  createOpenaiChat,
  createOpenaiEmbedding,
  createOpenaiSummarize,
  createOpenaiImage,
  createOpenaiTranscription,
} from '@tanstack/ai-openai'
import { openaiCompatible } from '@tanstack/ai-openai/compatible'

/** Compile-only calls for the same factory seams used by plugins/provider. */
export function providerCallTypeProbe() {
  const baseURL = 'https://local-probe.invalid/v1'
  const apiKey = 'local-fixture-only'
  const model = 'fixture-model'
  const adapter = openaiCompatible({ name: 'fixture', baseURL, apiKey, models: [model] })(model)
  const embedding = createOpenaiEmbedding('text-embedding-3-small', apiKey, { baseURL })
  const summary = createOpenaiSummarize('gpt-4o-mini', apiKey, { baseURL })
  const image = createOpenaiImage('gpt-image-1', apiKey, { baseURL })
  const transcription = createOpenaiTranscription('whisper-1', apiKey, { baseURL })
  return {
    image,
    transcription,
    adapter,
    embedding,
    summary,
    // Closures remain uncalled: no external provider I/O is performed.
    chat: () => chat({ adapter, messages: [{ role: 'user', content: 'ping' }], stream: false }),
    embed: () => embed({ adapter: embedding, input: 'ping' }),
    summarize: () => summarize({ adapter: summary, text: 'fixture text' }),
  }
}

export type O3Effort = ReasoningOptionFor<
  AdapterReasoning<ReturnType<typeof createOpenaiChat<'o3'>>>
>
export const legalO3Effort: O3Effort = 'high'
// @ts-expect-error o3 has no 'off' reasoning level in ai-openai0.30.0 metadata.
export const invalidO3Effort: O3Effort = 'off'

/** Explicit synthetic capability data exercises public 0.69 helpers, not model availability. */
export const syntheticReasoning: ModelReasoning = {
  levels: { low: 'provider-low', high: 'provider-high' },
  budget: false,
}
export const reasoningHelperResults = {
  supported: supportedReasoningLevels(syntheticReasoning),
  keepHigh: clampReasoningLevel(syntheticReasoning, 'high'),
  mediumClampsUp: clampReasoningLevel(syntheticReasoning, 'medium'),
  maxClampsDown: clampReasoningLevel(syntheticReasoning, 'max'),
  unsupported: supportedReasoningLevels(false),
  unknown: supportedReasoningLevels(undefined),
}

/** Actual ai + ai-openai request construction with a local fetch stub; no vendor request. */
export async function reasoningWireProbe() {
  const requests: Record<string, unknown>[] = []
  const adapter = createOpenaiChat('gpt-5.2', 'local-fixture-only', {
    fetch: async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)))
      const response = {
        id: 'resp-local',
        object: 'response',
        created_at: 0,
        status: 'completed',
        model: 'gpt-5.2',
        output: [
          {
            type: 'message',
            id: 'msg-local',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'local-only', annotations: [] }],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }
      const events = [
        {
          type: 'response.output_text.delta',
          delta: 'local-only',
          item_id: 'msg-local',
          output_index: 0,
          content_index: 0,
        },
        { type: 'response.completed', response },
      ]
      return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    },
  })
  const text = await chat({
    adapter,
    messages: [{ role: 'user', content: 'local fixture' }],
    reasoning: { level: 'high', summary: false },
    stream: false,
  })
  return { text, requests }
}
