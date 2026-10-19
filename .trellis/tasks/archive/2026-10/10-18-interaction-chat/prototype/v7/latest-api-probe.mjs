import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import {
  providerCallTypeProbe,
  reasoningHelperResults,
  reasoningWireProbe,
  legalO3Effort,
} from './provider-api-probe.ts'
const factories = providerCallTypeProbe()
assert.equal(factories.adapter.kind, 'text')
assert.equal(factories.image.kind, 'image')
assert.equal(factories.transcription.kind, 'transcription')
assert.equal(factories.embedding.kind, 'embedding')
assert.equal(factories.summary.kind, 'summarize')
assert.equal(legalO3Effort, 'high')
assert.deepEqual(reasoningHelperResults, {
  supported: ['low', 'high'],
  keepHigh: 'high',
  mediumClampsUp: 'high',
  maxClampsDown: 'high',
  unsupported: ['off'],
  unknown: ['off'],
})
const wire = await reasoningWireProbe()
assert.equal(wire.text.text, 'local-only')
assert.equal(wire.requests.length, 1)
assert.equal(wire.requests[0].model, 'gpt-5.2')
assert.deepEqual(wire.requests[0].reasoning, { effort: 'high' })
const result = {
  success: true,
  scope:
    'isolated exact ai0.69.0 + ai-openai0.30.0 factories/type checks/public reasoning helpers + actual request construction with local fetch stub; no vendor I/O or real-model availability claim',
  factories: [
    'openaiCompatible',
    'createOpenaiEmbedding',
    'createOpenaiSummarize',
    'createOpenaiImage',
    'createOpenaiTranscription',
  ],
  reasoningHelperResults,
  chatReasoningWire: wire.requests[0].reasoning,
  note: 'SDK unknown reasoning falls back to off; Mimir retains unknown status and does not infer unsupported. SDK clamp differs from explicit user model-switch default policy and must not silently replace it.',
}
await writeFile(
  new URL('./latest-api-probe-result.json', import.meta.url),
  JSON.stringify(result, null, 2) + '\n',
)
console.log(JSON.stringify(result, null, 2))
