import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFile(join(here, name), 'utf8')
const packageInventory = JSON.parse(await read('../research/chat-package-inventory.json'))
const hostInventory = JSON.parse(await read('../research/chat-host-inventory.json'))
const groups = [...packageInventory.groups, ...hostInventory.groups]
const manifest = JSON.parse(await read('scenes.json'))
const coverage = JSON.parse(await read('coverage.json'))
const main = await read('main.tsx')
const css = await read('review.css')
const html = await read('review.html')
const total = groups.reduce((count, group) => count + group.states.length, 0)
assert.equal(groups.length, 71)
assert.equal(total, 379)
assert.equal(manifest.groupCount, groups.length)
assert.equal(manifest.stateCount, total)
assert.equal(manifest.scenes.length, total)
assert.equal(new Set(manifest.scenes.map((scene) => scene.id)).size, total)
assert.deepEqual(
  coverage.items.map((item) => item.id),
  groups.map((group) => group.id),
)
for (const group of groups) {
  const item = coverage.items.find((entry) => entry.id === group.id)
  assert.equal(item.states.length, group.states.length)
  for (const state of group.states) {
    const scene = manifest.scenes.find((entry) => entry.id === state.id)
    assert.ok(scene && scene.track && scene.source.length)
    assert.equal(scene.current, state.description)
    assert.equal(scene.description, state.description)
    assert.deepEqual(scene.source, group.source)
    assert.ok(scene.proposed.length > 20)
    assert.equal(scene.boundary, group.boundary)
    const mapped = item.states.find((entry) => entry.state === state.id.split('.')[1])
    assert.equal(mapped.entry, `review.html#scene=${state.id}`)
    assert.deepEqual(mapped.ui, scene.ui)
    assert.ok(html.includes(state.id))
  }
}
// Track bindings point to rendered structures and actual local event handlers.
// They are source checks, not a claim that every recipe was browser-executed.
const bindings = {
  empty: ['empty-stage', 'empty-greeting', '向知识库提问'],
  sidebar: ['quick-questions', '!snapshot', 'send([', '标准模式'],
  draft: ['draft-consume', '重投同一草稿', '投递新草稿', '模拟页面刷新'],
  history: ['skeleton', 'loadError', '读取成功', 'setDelivered'],
  messages: ['message-thread', 'ui.emptyAnswer', 'lastSuccessful', '!ui.multiTurn'],
  scroll: ['scrollAway', 'scroller.current?.scrollTo', 'composer-line'],
  composer: ['onCompositionStart', 'composing.current', 'event.shiftKey', 'Enter 排队'],
  send: ['function send(', 'function stop(', "setDelivered('none')", 'enqueue(value'],
  scope: ['renderScopeMenu', 'docsRead', 'sampleDocs.map', 'setScope(doc)'],
  strength: ['setDeep(false)', 'setDeep(true)', '!sidebar'],
  model: ['bound-option', 'aria-disabled="true"', '管理模型', 'ui.sameModel'],
  usage: ['输入（上下文）', '输出：1,280 tok', '合计：1.7万 tok'],
  queue: ['queue-row', 'restoreQueued', 'setLastQuestion(queued)'],
  stop: ['function stop()', 'delivered', '已停止生成'],
  trace: ['traceReady', 'trace-waiting', 'setManual(true)', 'wasLive'],
  reasoning: ['reasoning-shell', 'ui.reasoningOpen', "ui.specialState==='long'"],
  markdown: ['table-scroll', 'code-head', 'stream-caret', 'prose'],
  code: [
    'function copyAnswer',
    'if (code && !after) return',
    '复制失败，请选择代码后手动复制',
    'fallback',
  ],
  tool: ["scene.track==='tool' && agentCard", 'Args', 'Result', 'tool-disclosure'],
  citations: ['citation-title', 'citation-snippet', 'unknownChannel', "openTarget('current')"],
  save: ['saveAnswer', 'setSaving(true)', 'completeSave', 'saveError'],
  copy: ['copyAnswer', '已复制原文片段与来源链接', 'copyStatus'],
  failure: ['failureUI', 'quota:', 'timeout:', 'truncated:', 'offline:', '暂不可用'],
  recovery: [
    'ui.historyMode) setDeep(false)',
    "if (search) setScope('')",
    'enqueue(lastQuestion',
    'zero-stream',
  ],
  sources: ["scene.track==='sources'", 'source-chip', 'ui.noHref'],
  files: ["scene.track==='files'", 'ui.unsafeFile', 'FileGlyph kind="pdf"'],
  images: ['imageState', 'image-error', 'broken-image', "setImageState('loading')"],
  audio: ["scene.track==='audio'", 'FileGlyph kind="audio"', '访谈录音.mp3'],
  agent: ['bridgePanel', 'agent-progress', "specialState==='execute'", '停止工具'],
  'agent-stop': ['agent-stop', '停止工具失败', '已经落到画布'],
  'agent-resume': [
    'agent-resume',
    '重试续传工具结果',
    '缓存的工具结果',
    "agentStage==='submitting'",
  ],
  'agent-media': ['mediaRequest', '选择本地文件', '使用文档中选中的图片', 'mediaChoice'],
  'agent-draft': ['partialDraft', 'beginDraftAction', 'settleDraft', '保留草稿', '丢弃草稿'],
  'agent-undo': ['const undo =', "beginDraftAction('undo')", '无法安全回退'],
  'agent-create': ['const created =', "openTarget('new')", 'parse-error', 'stopped-after'],
  'agent-history': ['historyNotice', 'agent-history', 'history-original', '取消待处理工具'],
  snapshot: ['Snapshot', 'sentSnapshot', '移除第3页截图', 'ui.noVision'],
  'snapshot-validation': [
    'validationIssue',
    'setSnapshotIssue(validationIssue',
    "setValidationIssue('')",
  ],
  'snapshot-queue': ['snapshot-queue', 'stale-new', 'queued-text', 'restoreQueued'],
  'snapshot-retry': [
    'sentSnapshot) && validationIssue',
    'sentSnapshot) && search',
    'snapshotIssue',
  ],
  'agent-service': [
    'agent-service',
    'original-attachment',
    'original-media',
    'stream-writing',
    'export-sheet',
  ],
  'history-error': ['load-error', '暂时无法读取这段对话', '记录还在'],
  'history-nav': ['historyRead', 'history-row', 'aria-current', '对话刷新失败'],
  navigation: ['navOpen', 'runGuarded', 'performPendingNavigation'],
  'search-handoff': ['搜索问题交接', '只预填问题，不自动发送', 'ui.searchBlocked'],
  'citation-handoff': ['runGuarded(()=>openTarget', '返回对话', 'sourceTarget'],
  layout: ['FitPreview', 'ResizeObserver', 'ChatDemo', 'narrow='],
  'sidebar-lifetime': ['setHidden(true)', '重新打开助手', '同篇生成继续进行'],
  'sidebar-overlay': ['aria-modal={overlay', 'inert={overlay', 'overlay-dismiss', 'handleRootKey'],
  capability: ["capability==='loading'", "capability==='nomodel'", 'revision-switch'],
  'agent-boundary': ['ui.special', 'ui.capability', 'agentStage', '画布版本'],
  'agent-end': ['manualChanged', 'agentChanged', 'changeAgent'],
}
const sourceBindings = []
const compactOffsets = []
let compactMain = ''
for (let offset = 0; offset < main.length; offset++) {
  if (!/\s/.test(main[offset])) {
    compactMain += main[offset]
    compactOffsets.push(offset)
  }
}
const anchorLine = (needle) => {
  const found = compactMain.indexOf(needle.replace(/\s+/g, ''))
  const offset = compactOffsets[found] ?? 0
  return main.slice(0, offset).split('\n').length
}
for (const track of new Set(manifest.scenes.map((scene) => scene.track))) {
  assert.ok(bindings[track], `Missing rendered binding for track ${track}`)
  for (const needle of bindings[track])
    assert.ok(
      main.replace(/\s+/g, '').includes(needle.replace(/\s+/g, '')),
      `Missing ${track}: ${needle}`,
    )
  sourceBindings.push({
    track,
    source: 'main.tsx',
    anchors: bindings[track].map((needle) => ({
      needle,
      line: anchorLine(needle),
    })),
  })
}
assert.ok(css.includes('#00834d') && css.includes('#007846') && css.includes('#006b3e'))
assert.ok(css.includes('#e7e9e8') && css.includes('#00a35f'))
assert.ok(css.includes('#454b47') && css.includes('#66736c') && css.includes('#50c28f'))
assert.ok(css.includes('prefers-reduced-motion'))
assert.ok(css.includes('.preview-viewport') && main.includes('适应窗口'))
assert.equal(/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/.test(main), false)
assert.equal(/from\s*['"][^'"]*(?:packages\/renderer|lib\/api|components\/)/.test(main), false)
assert.equal(
  /<(?:script|link)\b[^>]*(?:src|href)=["'](?:https?:|\/assets|\.\/assets)/i.test(html),
  false,
)
assert.equal(html.includes('src="/main.tsx"'), false)
assert.ok(html.includes('data:image/svg+xml,'))
const report = {
  version: manifest.version,
  groups: groups.length,
  linkedStates: total,
  renderedTracks: sourceBindings.length,
  sourceBindings,
  standalone: true,
  productImports: false,
  businessRequests: false,
  persistence: false,
  scope:
    'Routes + source recipe bindings; not 379 GUI tests. API settlement, tools, PNG capture, clipboard, file picker, native media, Electron and screen readers are simulated or boundary-only.',
  htmlSha256: createHash('sha256').update(html).digest('hex'),
}
await writeFile(join(here, 'checks.json'), JSON.stringify(report, null, 2) + '\n')
console.log(
  JSON.stringify({ ...report, sourceBindings: `${sourceBindings.length} track bindings` }, null, 2),
)
