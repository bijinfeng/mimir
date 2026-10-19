import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const read = async (name) => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'))
const source = await read('../v4/scenes.json')
const current = await read('./scenes.json')
const catalog = await read('../../research/agui-v5-interaction-catalog.json')
assert.equal(current.version, 'chat-review-v5')
assert.equal(current.scenes.length, 403)
assert.equal(new Set(current.scenes.map((s) => s.id)).size, 403)
assert.deepEqual(
  current.scenes.map((s) => [s.id, s.current, s.source]),
  source.scenes.map((s) => [s.id, s.current, s.source]),
)
assert.equal(catalog.items.length, 126)
assert.equal(new Set(catalog.items.map((x) => x.id)).size, 126)
const hashes = {}
for (const name of ['review.html', 'thread.review.html', 'interactions.html']) {
  const bytes = await readFile(new URL(name, import.meta.url))
  assert(bytes.length > 10000)
  hashes[name] = createHash('sha256').update(bytes).digest('hex')
}
const resolution = await read('./runtime-resolution.json')
assert.deepEqual(resolution.versions, {
  '@tanstack/ai-react': '0.30.3',
  '@tanstack/ai-client': '0.39.2',
  '@tanstack/ai': '0.68.0',
})
for (const document of Object.values(resolution.documents))
  assert.equal(document.reactRoots.length, 1)
const messages = await readFile(new URL('./chat-components.tsx', import.meta.url), 'utf8')
assert(!messages.includes('@assistant-ui/'))
const proposed = await readFile(new URL('./thread-app.tsx', import.meta.url), 'utf8')
assert(proposed.includes('captureSendIntent'))
assert(proposed.includes('useChat'))
assert(!proposed.includes('@assistant-ui/'))
for (const name of ['composer-toolbar.tsx', 'chat-components.tsx']) {
  const code = await readFile(new URL(name, import.meta.url), 'utf8')
  assert(
    !/<button(?!\s+type=)/.test(code),
    'Every non-Send custom button must have explicit type=button',
  )
}
const coverage = {
  version: 'chat-review-v5',
  routes: 403,
  sourceGroups: 71,
  sourceStates: 379,
  attachmentStates: 24,
  catalogItems: 126,
  standardEventNames: catalog.eventCounts,
  checks: {
    stableSourceRoutes: true,
    currentEvidenceUnchanged: true,
    realTanStackHook: true,
    oneProjectReactPerDocument: true,
    noExecutingAssistantUi: true,
  },
  hashes,
  scope:
    'Artifact/source checks only; not 403 GUI tests or a claim of product service compatibility.',
}
await writeFile(new URL('./checks.json', import.meta.url), JSON.stringify(coverage, null, 2) + '\n')
console.log(JSON.stringify(coverage, null, 2))
