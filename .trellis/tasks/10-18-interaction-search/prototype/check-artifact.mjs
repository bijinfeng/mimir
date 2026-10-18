import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const scenes = JSON.parse(await readFile(join(here, 'scenes.json'), 'utf8'))
const coverage = JSON.parse(await readFile(join(here, 'coverage.json'), 'utf8'))
const html = await readFile(join(here, 'review.html'), 'utf8')
const sceneIds = scenes.groups.flatMap((group) => group.states.map((state) => state.id))
assert.equal(scenes.groups.length, 16)
assert.equal(sceneIds.length, 152)
assert.equal(new Set(sceneIds).size, 152)
assert.deepEqual(
  coverage.items.map((item) => item.id),
  sceneIds,
)
assert.equal(
  coverage.items.every((item) => item.entry === `review.html#scene=${item.id}`),
  true,
)
assert.equal(html.includes('src="/main.tsx"'), false)
assert.equal(
  /<(?:script|link)\b[^>]*(?:src|href)=["'](?:https?:|\/assets|\.\/assets)/i.test(html),
  false,
)
assert.equal(
  /from ['"][^'"]*packages\/renderer/.test(await readFile(join(here, 'main.tsx'), 'utf8')),
  false,
)
assert.equal(html.includes('正文末尾'), true)
console.log(
  JSON.stringify({
    passed: true,
    groups: 16,
    coverage: 152,
    singleFile: true,
    productImports: false,
  }),
)
