import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFile(join(here, name), 'utf8')
const parse = async (name) => JSON.parse(await read(name))
const hash = (value) => createHash('sha256').update(value).digest('hex')
const inventories = await Promise.all(
  ['../../research/chat-package-inventory.json', '../../research/chat-host-inventory.json'].map(
    parse,
  ),
)
const groups = inventories.flatMap((data) => data.groups)
const manifest = await parse('scenes.json')
const coverage = await parse('coverage.json')
const additions = await parse('attachment-coverage.json')
const provenance = await parse('provenance.json')
const resolution = await parse('runtime-resolution.json')
const thread = await read('thread-app.tsx')
const frame = await read('thread-frame.tsx')
const main = await read('main.tsx')
const css = await read('official.css')
const html = await read('review.html')
const iframeHtml = await read('thread.review.html')
assert.equal(groups.length, 71)
assert.equal(
  groups.reduce((sum, item) => sum + item.states.length, 0),
  379,
)
assert.equal(manifest.baselineGroupCount, 71)
assert.equal(manifest.baselineStateCount, 379)
assert.equal(coverage.groups, 71)
assert.equal(coverage.states, 379)
assert.equal(additions.excludedFromSourceBaseline, true)
assert.equal(additions.states, 24)
assert.equal(manifest.stateCount, 379 + additions.states)
assert.equal(manifest.scenes.length, manifest.stateCount)
assert.equal(manifest.groupCount, 72)
assert.equal(new Set(manifest.scenes.map((scene) => scene.id)).size, manifest.stateCount)
const authoritativeCounts = {
  'official-default': 71,
  'external-host': 179,
  removed: 7,
  boundary: 122,
}
const dispositions = new Set(['official-default', 'external-host', 'removed', 'boundary'])
for (const [kind, count] of Object.entries(authoritativeCounts))
  assert.equal(manifest.scenes.filter((scene) => scene.proposedDisposition === kind).length, count)
for (const group of groups) {
  const item = coverage.items.find((entry) => entry.id === group.id)
  assert.equal(item.states.length, group.states.length)
  for (const state of group.states) {
    const scene = manifest.scenes.find((entry) => entry.id === state.id)
    assert.ok(scene)
    assert.equal(scene.current, state.description)
    assert.equal(scene.description, state.description)
    assert.deepEqual(scene.source, group.source)
    assert.equal(scene.boundary, group.boundary)
    assert.ok(dispositions.has(scene.proposedDisposition), state.id)
    const mapped = item.states.find((entry) => `${item.id}.${entry.state}` === state.id)
    assert.deepEqual(mapped.ui, scene.ui)
    assert.equal(mapped.proposedDisposition, scene.proposedDisposition)
    assert.equal(mapped.proposed, scene.proposed)
    assert.ok(html.includes(state.id), state.id)
  }
}
const traces = manifest.scenes.filter((scene) => scene.track === 'trace')
assert.equal(traces.length, 7)
assert.ok(traces.every((scene) => scene.proposedDisposition === 'removed'))
assert.ok(main.includes('!after &&') && main.includes('ui.trace'))
assert.match(thread, /<Thread\s*\/>/)
assert.equal(
  /components\s*=|register(?:Data|Tool)|makeAssistantTool|style\s*=|fontSize|setProperty|mimir\.trace/.test(
    thread,
  ),
  false,
)
assert.equal(/official-message|official\.scoped/.test(main + thread + css), false)
assert.ok(
  thread.includes('useExternalStoreRuntime') && thread.includes('createLocalAttachmentAdapter'),
)
assert.ok(thread.includes('steer(message)') && thread.includes('enqueue(message)'))
assert.ok(thread.includes('fixture.canReload') && thread.includes('onReload'))
assert.ok(
  frame.includes('srcDoc={documentHtml}') &&
    frame.includes('event.source !== frame.current?.contentWindow'),
)
assert.ok(css.includes("@import './vendor/apps/registry/app/globals.css'"))
assert.ok(css.includes("@import './vendor/packages/tw-shimmer/src/index.css'"))
assert.equal(/!important|:root|\.aui|--color|prefix\(/.test(css), false)
assert.equal(provenance.commit, 'a587b2838f2d644549d216098d54cfbeedfac522')
assert.equal(provenance.files.length, 35)
for (const file of provenance.files) {
  assert.equal(hash(await readFile(join(here, file.path))), file.sha256, file.path)
  assert.equal(file.modified, false)
}
assert.equal(resolution.assistantUi, '0.15.29')
assert.equal(resolution.core, '0.3.29')
for (const document of Object.values(resolution.documents)) {
  assert.equal(document.reactRoots.length, 1)
  assert.equal(
    document.reactModules.some((id) => id.includes('/tmp/mimir-chat-official-v3')),
    false,
  )
}
const lock = await parse('dependencies/package-lock.json')
assert.deepEqual(lock.packages[''].dependencies, provenance.dependencies)
const license = (await read('vendor/LICENSE'))
  .replaceAll('--', '&#45;&#45;')
  .replaceAll('>', '&gt;')
for (const page of [html, iframeHtml]) {
  const embedded = page.match(
    /<!--\nThird-party license: assistant-ui registry \(AgentbaseAI Inc\.\)\n([\s\S]*?)\n-->/,
  )?.[1]
  assert.equal(embedded, license)
  assert.equal(
    /<(?:script|link)\b[^>]*(?:src|href)=["'](?:https?:|\/assets|\.\/assets)/i.test(page),
    false,
  )
  assert.equal(page.includes('src="/main.tsx"') || page.includes('src="/thread-app.tsx"'), false)
}
assert.equal(/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/.test(main + thread), false)
const adapter = await read('attachment-adapter.ts')
for (const needle of [
  'maxFiles: 4',
  'maxTotalBytes: 20',
  'maxImageBytes: 5',
  'maxImageEdge: 4096',
  '16_000_000',
  'context.searchOnly',
  'context.noVision',
  '12000',
  '24000',
  'options?.signal',
  'createImageBitmap',
])
  assert.ok(adapter.includes(needle), needle)
const report = {
  version: 'chat-review-v3',
  sourceGroups: 71,
  sourceStates: 379,
  additionalAttachmentStates: additions.states,
  totalRoutes: manifest.stateCount,
  dispositions: Object.fromEntries(
    [...dispositions].map((value) => [
      value,
      manifest.scenes.filter((scene) => scene.proposedDisposition === value).length,
    ]),
  ),
  officialSourceFiles: provenance.files.length,
  officialRender:
    'Direct complete Thread; no renderer/components/theme/style overrides; original registry CSS + Tailwind4.3.3 in isolated document',
  sdk: resolution.assistantUi,
  core: resolution.core,
  react: resolution.react,
  reactInstancesPerDocument: 1,
  productChanges: false,
  businessRequests: false,
  localAttachmentMock: true,
  htmlSha256: hash(html),
  threadHtmlSha256: hash(iframeHtml),
  scope:
    'Static source mapping, original-byte and standalone artifact checks; not 403 GUI tests or proof of product adapters/services.',
}
await writeFile(join(here, 'checks.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
