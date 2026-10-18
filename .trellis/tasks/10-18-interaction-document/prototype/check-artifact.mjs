import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFile(join(here, name), 'utf8')
const inventory = JSON.parse(await read('../research/document-scenes.json'))
const manifest = JSON.parse(await read('scenes.json'))
const coverage = JSON.parse(await read('coverage.json'))
const main = await read('main.tsx')
const css = await read('review.css')
const html = await read('review.html')
const count = inventory.items.reduce((n, item) => n + item.states.length, 0)
assert.equal(inventory.items.length, 78)
assert.equal(count, 422)
assert.equal(manifest.groups, inventory.items.length)
assert.equal(manifest.scenes.length, count)
assert.equal(new Set(manifest.scenes.map((scene) => scene.id)).size, count)
assert.deepEqual(
  coverage.items.map((item) => item.id),
  inventory.items.map((item) => item.id),
)
for (const item of inventory.items) {
  const mapped = coverage.items.find((entry) => entry.id === item.id)
  assert.deepEqual(
    mapped.states.map((entry) => entry.state),
    item.states,
  )
  for (const state of item.states) {
    const scene = manifest.scenes.find((entry) => entry.id === `${item.id}.${state}`)
    assert.ok(scene && scene.track && scene.source.length)
    assert.equal(scene.currentBehavior, item.current_behavior)
    assert.equal(scene.proposal, item.target_behavior)
    assert.equal(scene.currentState, item.current_states.includes(state))
    assert.equal(scene.proposalState, item.proposal_states.includes(state))
    assert.equal(
      mapped.states.find((entry) => entry.state === state).entry,
      `review.html#scene=${scene.id}`,
    )
    assert.ok(html.includes(scene.id))
  }
}
// These are source bindings to rendered structures and actual event handlers.
// They are stronger than route-string checks but are not browser execution.
const mechanisms = {
  entry: ['library-handoff', 'navigate()'],
  empty: ['component-empty', '选一条开始看'],
  loading: ['className="skeleton"'],
  read: ['readError', 'setReadError(false)', '重试刷新', '重新加载'],
  header: ['className="document-header"', 'save-status'],
  navigation: ['function navigate()', "open('guard')", 'setLeft(true)'],
  title: [
    'saveTitle',
    'onCompositionStart',
    'metadataSaved',
    'retryMetadataRead',
    'title-form-actions',
  ],
  save: ['save-status', '已保存 · 待刷新', '保存中…'],
  handoff: ['editor-handoff', 'setQuestion', 'snapshot-draft', 'snapshotPreview'],
  outline: [
    'className="outline"',
    'function jump(',
    'aria-current',
    'fenced-heading',
    'dom-replaced',
  ],
  citation: [
    'repeat-fixture',
    'repeat-first',
    'repeat-later',
    'cross-node',
    'citation-highlight',
    '定位本篇引用',
  ],
  menu: ['organize-menu', 'onPointerDown', 'ArrowDown', 'Escape'],
  tags: ['mutateTags', 'tagIntent.current', 'suggestRead', 'tags.length >= 20'],
  folder: ['folderRead', 'beginRead', '移出目录', 'undoing.current', '模拟8秒到期'],
  'ai-organize': ['产生用量', 'disabled={noBody || pending}'],
  summary: ['ai-result', 'setSummary', '不会保存到正文'],
  'ai-tags': ['applyingTags', 'tagIntent.current', 'candidate', '本次没有生成标签候选'],
  'stale-ai': ['stale-request', 'setSwitched(true)', '投递文档 A 的旧响应'],
  body: ['className="prose"', 'diagram-sample', 'math-sample', 'inline-image', 'readonly'],
  links: [
    'document-footer',
    "matches(scene, 'backlinks')",
    "matches(scene, 'sources')",
    '新增前端入口',
  ],
  file: ['const media =', 'const missing', 'className="plain"', '下载原件'],
  media: ['<audio', '<video', 'sample-image', 'setMediaFailed(true)'],
  office: ['editor-boundary', '研究资料原件.docx', 'cannotSave', '工具栏中保存'],
  assistant: [
    'assistant-header',
    'revision-switch',
    'role="switch"',
    'capability-state',
    '停止生成',
    'assistant-handoff',
  ],
  command: [
    'function submitCommand()',
    'submitCommand()',
    'folderRead',
    '至少输入两个字符',
    '未找到匹配内容',
  ],
  guard: ['role="dialog"', 'function close()', 'cannotSave && after', '保存并离开', '继续编辑'],
  layout: ['sizeFor', 'ResizeObserver', 'articleHeadings', 'availableWidth', '200% 字体'],
  accessibility: ['function close()', 'const trap', 'F6', 'focus()'],
}
const bindingReport = []
for (const track of new Set(manifest.scenes.map((scene) => scene.track))) {
  const needles = mechanisms[track] ?? (track === 'reader' ? mechanisms.body : null)
  assert.ok(needles, `Missing rendered mechanism for ${track}`)
  for (const needle of needles)
    assert.ok(main.includes(needle), `Missing ${track} mechanism: ${needle}`)
  bindingReport.push({
    track,
    source: 'main.tsx',
    anchors: needles.map((needle) => ({
      needle,
      line: main.slice(0, main.indexOf(needle)).split('\n').length,
    })),
    scope: 'source binding only, not runtime proof',
  })
}
// Critical contracts previously caught by independent review.
assert.ok(main.includes('const [metadataSaved, setMetadataSaved]'))
assert.ok(
  main.indexOf('} else if (tagIntent.current)') < main.indexOf("} else if (panel === 'ai-tags')"),
)
assert.ok(main.includes('onClick={retryMetadataRead}'))
assert.ok(main.includes('if (readOnlyRetry.current)'))
assert.ok(/!applyingTags\s*&&\s*\['summary', 'ai-tags'\]\.includes\(panel\)/.test(main))
assert.ok(main.includes('num !== 58') && main.includes('num !== 62') && main.includes('num !== 63'))
assert.ok(main.includes('nativeBoundary = num === 74'))
assert.ok(main.includes('不承诺新增全局router blocker'))
assert.ok(main.includes('candidate') && main.includes('setCandidates'))
assert.ok(css.includes('.simulation-bar') && css.includes('z-index: 20'))
assert.ok(css.includes('.workspace-rail') && css.includes('width: 52px'))
assert.ok(css.includes('prefers') || css.includes('.reduced'))
assert.equal(/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/.test(main), false)
assert.equal(/from\s*['"][^'"]*(?:packages\/renderer|lib\/api|components\/)/.test(main), false)
assert.equal(
  /<(?:script|link)\b[^>]*(?:src|href)=["'](?:https?:|\/assets|\.\/assets)/i.test(html),
  false,
)
assert.equal(html.includes('src="/main.tsx"'), false)
const report = {
  version: 'document-review-v1',
  coverageGroups: inventory.items.length,
  linkedStates: count,
  renderedTracks: bindingReport.length,
  sourceBindings: bindingReport,
  standalone: true,
  productImports: false,
  businessRequests: false,
  manualOutcomes: true,
  currentProposalDistinguished: true,
  scope:
    'Static routes, source bindings, local-only contracts. Does not assert 422 GUI tests, real backend writes, native media playback, downloads, clipboard, screen reader, or Electron success.',
  htmlSha256: createHash('sha256').update(html).digest('hex'),
}
await writeFile(join(here, 'checks.json'), JSON.stringify(report, null, 2) + '\n')
console.log(
  JSON.stringify(
    { ...report, sourceBindings: `${bindingReport.length} render-track source bindings` },
    null,
    2,
  ),
)
