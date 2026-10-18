import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { views, source } from './fixtures.ts'

const here = dirname(fileURLToPath(import.meta.url))
const read = async (file) => JSON.parse(await readFile(join(here, file), 'utf8'))
const inventory = await read('../research/capture-scenes.json')
const scenes = await read('scenes.json')
const coverage = await read('coverage.json')
const html = await readFile(join(here, 'review.html'), 'utf8')
const main = await readFile(join(here, 'main.tsx'), 'utf8')
const ids = inventory.scenes.map((scene) => scene.id)
assert.equal(inventory.groups.length, 9)
assert.equal(ids.length, 91)
assert.equal(new Set(ids).size, 91)
assert.deepEqual(
  scenes.scenes.map((scene) => scene.id),
  ids,
)
assert.deepEqual(
  coverage.items.map((scene) => scene.id),
  ids,
)
for (const scene of scenes.scenes) {
  assert.ok(views[scene.view], `missing visible view: ${scene.id}`)
  assert.ok(scene.path.length > 8, `missing interaction path: ${scene.id}`)
  assert.ok(html.includes(scene.id), `unreachable ID in built HTML: ${scene.id}`)
  const item = coverage.items.find((candidate) => candidate.id === scene.id)
  assert.equal(item.entry, `review.html#scene=${scene.id}`)
}
assert.equal(html.includes('src="/main.tsx"'), false)
assert.equal(
  /<(?:script|link)\b[^>]*(?:src|href)=["'](?:https?:|\/assets|\.\/assets)/i.test(html),
  false,
)
assert.equal(/from ['"][^'"]*(?:packages\/renderer|lib\/api|components\/)/.test(main), false)
assert.equal(/\bfetch\(|XMLHttpRequest|api\.documents|api\.capture/.test(main), false)
assert.equal(source('https://', false)?.label, '网页')
assert.equal(source('https://', true), null)
assert.equal(source('https://example.com/?from=github.com', true)?.label, 'GitHub 仓库')
assert.equal(source('  https://github.com/Tencent/WeKnora  ', true)?.label, 'GitHub 仓库')
assert.equal(source('https://example.com/?q=' + 'x'.repeat(2000), true), null)
assert.equal(source('example.com', false), null)
const report = {
  version: 'capture-review-v1',
  generatedAt: new Date().toISOString(),
  groups: 9,
  coverage: 91,
  distinctDataViews: new Set(scenes.scenes.map((scene) => scene.view)).size,
  inventoryComplete: true,
  singleFile: true,
  productImports: false,
  businessRequests: false,
  sourceFixtureAssertions: true,
  htmlSha256: createHash('sha256').update(html).digest('hex'),
  browserVerification:
    'Main session records screenshots/geometry separately. This check does not assert browser/native acceptance.',
}
await writeFile(join(here, 'checks.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
