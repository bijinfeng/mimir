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
const icons = await readFile(join(here, 'file-icons.tsx'), 'utf8')
const gallery = await readFile(join(here, 'icon-gallery.tsx'), 'utf8')
const iconManifest = await json('icon-assets.json')
const v1 = await json('versions/v1-version.json')
assert.equal(
  createHash('sha256')
    .update(await readFile(join(here, 'versions/v1.html')))
    .digest('hex'),
  v1.htmlSha256,
)
assert.equal(iconManifest.assets.length, 29)
assert.equal(iconManifest.mappings.length, 16)
assert.equal(new Set(iconManifest.mappings.map((item) => item.id)).size, 16)
for (const asset of iconManifest.assets) {
  const data = await readFile(join(here, asset.localPath))
  assert.equal(createHash('sha256').update(data).digest('hex'), asset.sha256)
  assert.equal(
    createHash('sha1')
      .update(Buffer.concat([Buffer.from(`blob ${data.length}\0`), data]))
      .digest('hex'),
    asset.blobSha,
  )
  assert.ok(data.toString().startsWith('<svg'))
  assert.equal(
    /<(?:script|foreignObject|image)\b|\bon\w+=|(?:href|src)=/i.test(data.toString()),
    false,
  )
}
for (const item of iconManifest.mappings) {
  assert.ok(iconManifest.assets.some((asset) => asset.localPath === item.A))
  assert.ok(iconManifest.assets.some((asset) => asset.localPath === item.B))
  assert.ok(icons.includes(`id: '${item.id}'`))
}
for (const family of ['phosphor', 'material']) {
  const license = await readFile(join(here, 'assets', family, 'LICENSE.txt'), 'utf8')
  assert.equal(
    license,
    await readFile(join(here, '../research/icon-evidence', family + '-LICENSE.txt'), 'utf8'),
  )
  assert.ok(license.includes('MIT License'))
  assert.ok(html.includes(license.split('\n').find((line) => line.startsWith('Copyright'))))
  assert.ok(html.includes('Permission is hereby granted'))
}
assert.ok(main.includes("get('view') === 'icons'"))
assert.ok(main.includes("scheme={after ? iconScheme : 'original'}"))
assert.ok(gallery.includes('const sizes = [20, 24, 32]'))
assert.ok(gallery.includes('IconGallery'))
assert.equal(/(?:fetch\(|XMLHttpRequest|localStorage)/.test(icons + gallery), false)
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
  revision: 2,
  iconSelectionView: 'review.html?view=icons',
  iconCandidates: ['A: Phosphor duotone', 'B: Material Icon Theme + Phosphor source glyphs'],
  defaultIconCandidate: 'A (pending selection)',
  iconFormats: 16,
  iconSizes: [20, 24, 32],
  vendoredSvgAssets: 29,
  iconLicensesEmbedded: true,
  originalV1Sha256: v1.htmlSha256,
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
