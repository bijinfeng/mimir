import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { createLocalConnection } from './local-connection.ts'
import { atomicPatch, prepareEvents, reduceProtocol, emptyProtocolState } from './protocol-state.ts'
const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(resolve(here, '../../../../..'), 'apps/web/package.json'))
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild')
const output = await build({
  entryPoints: [join(here, 'protocol-examples.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
})
const { extraVariants } = await import(
  `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`
)
const catalog = JSON.parse(
  await readFile(join(here, '../../research/agui-v5-interaction-catalog.json'), 'utf8'),
)
const standard = catalog.items.filter((item) => item.example.events.length)
for (const item of standard)
  assert.deepEqual(prepareEvents(item.example.events).diagnostics, [], item.id)
const variants = catalog.items.flatMap((item) =>
  extraVariants(item.id).map((sample) => ({ item: item.id, ...sample })),
)
const intentionallyInvalid = new Set([
  'first-event-invalid',
  'nested-run',
  'after-terminal',
  'mixed-conflict',
  'missing-first-id',
  'unknown-parent',
  'duplicate-id',
  'root-finished-too-early',
  'unknown-part',
])
const samples = []
for (const sample of variants) {
  const parsed = prepareEvents(sample.events)
  const expectedInvalid = intentionallyInvalid.has(sample.id)
  assert.equal(
    parsed.diagnostics.length > 0,
    expectedInvalid,
    `${sample.item}/${sample.id}: ${parsed.diagnostics.join(';')}`,
  )
  samples.push({
    item: sample.item,
    id: sample.id,
    accepted: parsed.accepted.length,
    diagnostics: parsed.diagnostics,
    expectedInvalid,
  })
}
for (const operation of ['add', 'remove', 'replace', 'move', 'copy', 'test']) {
  const sample = extraVariants('AGUI-FLOW-004').find((v) => v.id === operation)
  const final = sample.events.reduce(reduceProtocol, emptyProtocolState())
  assert.equal(final.diagnostics.length, 0, operation)
}
const before = { count: 1, items: [1, 2] }
assert.throws(() =>
  atomicPatch(before, [
    { op: 'replace', path: '/count', value: 2 },
    { op: 'remove', path: '/missing' },
  ]),
)
assert.deepEqual(before, { count: 1, items: [1, 2] })
const activity = extraVariants('AGUI-ACTIVITY-002')
  .find((v) => v.id === 'invalid-patch')
  .events.reduce(reduceProtocol, emptyProtocolState())
assert.equal(activity.activities['activity-1'].content.count, 1)
assert.equal(activity.diagnostics.length, 1)
const state = extraVariants('AGUI-FLOW-004')
  .find((v) => v.id === 'invalid-op')
  .events.reduce(reduceProtocol, emptyProtocolState())
assert.deepEqual(state.shared, { count: 1 })
assert.equal(state.diagnostics.length, 1)
const replace = extraVariants('AGUI-FLOW-004')
  .find((v) => v.id === 'replace-false')
  .events.reduce(reduceProtocol, emptyProtocolState())
assert.equal(replace.activities['activity-1'].content.count, 1)
const reasoning = [
  { type: 'REASONING_START', messageId: 'r' },
  { type: 'REASONING_END', messageId: 'r' },
].reduce(reduceProtocol, emptyProtocolState())
assert.equal(reasoning.reasoning, 'complete')
const previousWindow = globalThis.window
try {
  globalThis.window = { setTimeout }
  const local = createLocalConnection(undefined, { autoComplete: false })
  local.next([
    { type: 'RUN_STARTED', threadId: 't', runId: 'r' },
    { type: 'REASONING_START', messageId: 'r1' },
  ])
  const observed = []
  for await (const event of local.connection.connect([], {}, undefined, {
    threadId: 't',
    runId: 'r',
  }))
    observed.push(event)
  assert.deepEqual(
    observed.map((e) => e.type),
    ['RUN_STARTED', 'REASONING_START'],
  )
} finally {
  globalThis.window = previousWindow
}
const result = {
  success: true,
  scope:
    'schema/sequence and explicit sidecar only; not browser, HTTP, model or Agent verification',
  defaultSequences: standard.length,
  variants: samples,
  checks: [
    'six JSON Patch operations',
    'atomic invalid patch preserves original',
    'state invalid patch diagnostic',
    'activity invalid patch diagnostic',
    'replace=false preserves activity',
    'reasoning lifecycle without text',
    'legacy explicit normalization',
    'single-step connection emits no synthetic terminal',
  ],
}
await writeFile(join(here, 'protocol-probe-result.json'), JSON.stringify(result, null, 2) + '\n')
console.log(
  JSON.stringify({
    success: true,
    defaultSequences: standard.length,
    variants: samples.length,
    checks: result.checks.length,
  }),
)
