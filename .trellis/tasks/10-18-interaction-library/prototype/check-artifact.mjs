import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const json = async (path) => JSON.parse(await readFile(join(here, path), 'utf8'))
const inventory = await json('../research/library-scenes.json')
const scenes = await json('scenes.json')
const coverage = await json('coverage.json')
const html = await readFile(join(here, 'review.html'), 'utf8')
const main = await readFile(join(here, 'main.tsx'), 'utf8')
const fixtures = await readFile(join(here, 'fixtures.ts'), 'utf8')
assert.equal(inventory.items.length, 58)
assert.equal(scenes.scenes.length, 299)
assert.equal(new Set(scenes.scenes.map((s) => s.id)).size, 299)
assert.deepEqual(
  coverage.items.map((x) => x.id),
  inventory.items.map((x) => x.id),
)
for (const item of inventory.items) {
  const mapped = coverage.items.find((x) => x.id === item.id)
  assert.deepEqual(
    mapped.states.map((s) => s.state),
    item.states,
  )
  for (const state of item.states) {
    const scene = scenes.scenes.find((s) => s.id === item.id + '.' + state)
    assert.ok(scene && scene.view && scene.path && scene.expected)
    assert.equal(scene.currentBehavior, item.current_behavior)
    assert.ok(html.includes(scene.id))
    assert.equal(
      mapped.states.find((s) => s.state === state).entry,
      'review.html#scene=' + scene.id,
    )
  }
}
assert.equal(html.includes('src="/main.tsx"'), false)
assert.equal(
  /<(?:script|link)\b[^>]*(?:src|href)=["'](?:https?:|\/assets|\.\/assets)/i.test(html),
  false,
)
assert.equal(
  /from ['"][^'"]*(?:packages\/renderer|lib\/api|components\/)/.test(main + fixtures),
  false,
)
assert.equal(
  /\bfetch\(|XMLHttpRequest|api\.documents|api\.capture|localStorage/.test(main + fixtures),
  false,
)
assert.ok(fixtures.includes('length: 100'))
assert.ok(main.includes('requestLock'))
assert.ok(main.includes('data-side='))
const report = {
  version: 'library-review-v1',
  revision: 1,
  coverageItems: 58,
  linkedStateRoutes: 299,
  proposedItems: 8,
  adoptedProposalItems: 7,
  boundaryDecisions: 1,
  semanticTracks: new Set(scenes.scenes.map((s) => s.view)).size,
  renderedCompositionFamilies: [
    'onboarding',
    'library-list',
    'library-cards',
    'tag-list',
    'tag-cards',
    'empty-folder',
    'empty-tag',
    'loading',
    'load-error',
    'missing-root',
    'missing-child',
    'kb-create-edit',
    'folder-create',
    'folder-rename',
    'folder-delete',
    'kb-delete',
    'doc-delete',
    'replacement-native-boundary',
    'replacement-proposed',
    'download-boundary',
    'document-handoff',
    'note-command',
    'move-command',
    'unsaved-guard',
    'capture-handoff',
    'inline-upload-handoff',
    'drag-handoff',
  ],
  standalone: true,
  productImports: false,
  businessRequests: false,
  scope:
    'Static linkage and build checks only; 299 routes do not assert 299 browser tests or native coverage.',
  htmlSha256: createHash('sha256').update(html).digest('hex'),
}
await writeFile(join(here, 'checks.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
