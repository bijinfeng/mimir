/**
 * Real official-release upgrade, only on disposable GitHub native Windows/Linux runners.
 * BASE_VERSION and TARGET_VERSION must already be public, with target the official latest.
 * No production test hooks, custom update feeds, credentials, direct installer calls or
 * synthetic save acknowledgements. CDP drives the packaged renderer's actual buttons.
 */
import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile, access, chmod, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Cdp,
  officialRepository,
  releaseAsset,
  sha256,
  until,
  versionPair,
} from './update-smoke-lib.mjs'

const exec = promisify(execFile)
const { base, target } = versionPair(process.env.BASE_VERSION, process.env.TARGET_VERSION)
assert.equal(
  process.env.GITHUB_ACTIONS,
  'true',
  'Refuse to touch a developer installation: disposable GitHub runner required',
)
assert.ok(
  ['win32', 'linux'].includes(process.platform),
  'Automatic installation is only verified on Windows/Linux',
)
assert.equal(process.arch, 'x64')
const root = resolve(process.env.RUNNER_TEMP, 'mimir-update-e2e')
const evidence = resolve(process.env.UPDATE_SMOKE_EVIDENCE ?? join(root, 'evidence'))
const scriptRoot = dirname(fileURLToPath(import.meta.url))
const userData =
  process.platform === 'win32'
    ? join(process.env.APPDATA, 'mimir')
    : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'mimir')
await assert.rejects(access(userData), 'Refuse to reuse an existing Mimir userData directory')
await mkdir(root, { recursive: true })
await mkdir(evidence, { recursive: true })
const result = {
  base,
  target,
  platform: process.platform,
  checks: [],
  limitations: [
    'Headless/session notification delivery and focus are not asserted by CDP.',
    'macOS ad-hoc builds remain manual; this test never claims macOS automatic installation.',
  ],
}
const sessions = new Set()
let wizard
let executable
const port = 19223
const endpoint = `http://127.0.0.1:${port}`
const env = { ...process.env, APPIMAGE_EXTRACT_AND_RUN: '1' }
for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE'])
  delete env[key]

async function record(check, details = {}) {
  result.checks.push({ check, at: new Date().toISOString(), ...details })
  await writeFile(join(evidence, 'result.json'), JSON.stringify(result, null, 2))
  console.log(`PASS ${check}`)
}
async function officialRelease(suffix) {
  const response = await fetch(
    `https://api.github.com/repos/${officialRepository}/releases/${suffix}`,
    {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(30_000),
    },
  )
  assert.equal(response.status, 200, `Anonymous official release request: ${suffix}`)
  return response.json()
}
async function latestIsTarget() {
  const latest = await officialRelease('latest')
  assert.equal(
    latest.tag_name,
    `v${target}`,
    'Official latest drifted; do not accept a different upgrade',
  )
  return latest
}
async function download(asset) {
  const destination = join(root, asset.name)
  const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(600_000) })
  assert.equal(response.status, 200)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination))
  assert.equal((await stat(destination)).size, asset.size)
  assert.equal(`sha256:${await sha256(destination)}`, asset.digest)
  return destination
}
async function targets() {
  const response = await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(3000) })
  assert.ok(response.ok)
  return response.json()
}
async function connect(kind) {
  const info = await until(`CDP ${kind} renderer`, async () =>
    (await targets()).find(
      (entry) =>
        entry.type === 'page' &&
        (kind === 'update'
          ? /\/update\.html\?/.test(entry.url)
          : /^http:\/\/127\.0\.0\.1:\d+\//.test(entry.url)),
    ),
  )
  const session = await Cdp.connect(info.webSocketDebuggerUrl)
  sessions.add(session)
  return session
}
async function state(session, updater = false) {
  return session.evaluate(
    updater ? 'window.mimirUpdater.getState()' : 'window.mimirDesktop.update.getState()',
  )
}
async function screenshot(session, name) {
  const image = await session.call('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(evidence, `${name}.png`), Buffer.from(image.data, 'base64'))
  await writeFile(
    join(evidence, `${name}.html`),
    await session.evaluate('document.documentElement.outerHTML'),
  )
}
async function click(session, text) {
  await session.call('Page.bringToFront')
  const point = await until(`visible enabled button: ${text}`, () =>
    session.evaluate(`(() => {
      const text = ${JSON.stringify(text)};
      for (const button of document.querySelectorAll('button')) {
        if (button.disabled || !(button.textContent.replace(/\\s/g, '') === text.replace(/\\s/g, '') || button.getAttribute('aria-label') === text)) continue;
        button.scrollIntoView({ block: 'center' });
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
        if (rect.width && rect.height && style.visibility !== 'hidden' && style.display !== 'none' && button.contains(document.elementFromPoint(x, y))) return { x, y };
      }
      return false;
    })()`),
  )
  await session.call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...point,
    button: 'left',
    clickCount: 1,
  })
  await session.call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...point,
    button: 'left',
    clickCount: 1,
  })
}
async function verifyWindowsCachedInstaller(asset) {
  if (process.platform !== 'win32') return
  const config = await readFile(join(dirname(executable), 'resources', 'app-update.yml'), 'utf8')
  const cacheName = config.match(/^updaterCacheDirName:\s*['"]?([^'"\r\n]+)['"]?\s*$/m)?.[1]
  assert.ok(
    cacheName && basename(cacheName) === cacheName,
    'Package must specify one safe updater cache directory',
  )
  const pending = join(process.env.LOCALAPPDATA, cacheName, 'pending')
  const info = JSON.parse(await readFile(join(pending, 'update-info.json'), 'utf8'))
  assert.equal(basename(info.fileName), info.fileName)
  const cached = join(pending, info.fileName)
  assert.equal((await stat(cached)).size, asset.size)
  assert.equal(
    `sha256:${await sha256(cached)}`,
    asset.digest,
    'Actual updater download must match the official target asset',
  )
}
async function normalClose() {
  if (process.platform === 'win32') {
    await exec(
      'pwsh',
      ['-NoProfile', '-File', join(scriptRoot, 'update-smoke-native.ps1'), '-Action', 'close'],
      { env },
    )
  } else {
    const { stdout } = await exec('wmctrl', ['-lp'])
    await writeFile(join(evidence, 'native-windows.txt'), stdout)
    for (const row of stdout.split('\n').filter((line) => /mimir/i.test(line))) {
      await exec('wmctrl', ['-i', '-c', row.split(/\s+/)[0]])
    }
  }
}
async function processIds() {
  if (process.platform === 'win32') {
    const { stdout } = await exec(
      'pwsh',
      ['-NoProfile', '-File', join(scriptRoot, 'update-smoke-native.ps1'), '-Action', 'pids'],
      { env },
    )
    return stdout.trim().split(/\s+/).filter(Boolean).map(Number)
  }
  try {
    const { stdout } = await exec('pgrep', ['-x', 'mimir'])
    return stdout.trim().split(/\s+/).filter(Boolean).map(Number)
  } catch (error) {
    if (error.code === 1) return []
    throw error
  }
}
async function running() {
  return (await processIds()).length > 0
}
async function noProcesses() {
  await until('all Mimir processes exit normally', async () => !(await running()), {
    timeout: 90_000,
  })
}
async function launch(name) {
  const child = spawn(
    executable,
    [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'],
    {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const stream = createWriteStream(join(evidence, `${name}.log`))
  child.stdout.pipe(stream, { end: false })
  child.stderr.pipe(stream, { end: false })
  child.on('error', (error) => stream.write(String(error)))
  child.on('close', () => stream.end())
  const workspace = await connect('workspace')
  await until('local authenticated workspace', () =>
    workspace.evaluate(
      `fetch('/api/auth/get-session').then(r => r.ok && r.json()).then(s => !!s?.user)`,
    ),
  )
  return workspace
}
async function downloaded(workspace) {
  return until(
    'real official update download and verification',
    async () => {
      const value = await state(workspace)
      if (value.status === 'error' || value.status === 'blocked')
        throw new Error(JSON.stringify(value))
      assert.equal(value.currentVersion, base)
      assert.equal(value.capability, 'automatic')
      if (value.status !== 'downloaded') return false
      assert.equal(value.version, target)
      return value
    },
    { timeout: 15 * 60_000, interval: 1000 },
  )
}
async function openDetails(workspace) {
  await click(workspace, '可重启更新，查看软件更新')
  const details = await connect('update')
  await until('details UI ready', () => details.evaluate('!!document.querySelector("h2")'))
  return details
}
async function documentValue(workspace, id) {
  return workspace.evaluate(
    `fetch('/api/documents/' + ${JSON.stringify(id)}).then(async r => { if (!r.ok) throw Error(r.status); return r.json() })`,
  )
}

try {
  const baseline = await officialRelease(`tags/v${base}`)
  const newest = await latestIsTarget()
  const baseAsset = releaseAsset(baseline, base, process.platform)
  const targetAsset = releaseAsset(newest, target, process.platform)
  await writeFile(
    join(evidence, 'official-releases.json'),
    JSON.stringify({ baseline, newest }, null, 2),
  )
  const installer = await download(baseAsset)
  if (process.platform === 'win32') {
    const installation = join(root, 'installation')
    // Only first installation is silent. The actual update uses its normal UI wizard.
    await exec(
      'pwsh',
      [
        '-NoProfile',
        '-File',
        join(scriptRoot, 'update-smoke-native.ps1'),
        '-Action',
        'install',
        '-Installer',
        installer,
        '-Installation',
        installation,
      ],
      { env, timeout: 300_000 },
    )
    executable = join(installation, 'mimir.exe')
  } else {
    // Keep the official versioned filename: verify updater's real filename-change behavior.
    executable = installer
    await chmod(executable, 0o755)
  }
  const beforeHash = await sha256(executable)
  await mkdir(userData, { recursive: true })
  await writeFile(join(userData, 'desktop-config.json'), JSON.stringify({ mode: 'local' }))
  let workspace = await launch('baseline-first')
  const note = {
    title: `真实升级资料 ${base} → ${target}`,
    body: 'Official release upgrade preserves this local Markdown document. 中文资料保留。',
    tags: ['更新验收'],
    folder: '更新验收',
  }
  const created = await workspace.evaluate(`(async () => {
    const folder = await fetch('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: '更新验收' }) });
    if (!folder.ok) throw Error('Folder creation: ' + folder.status);
    const response = await fetch('/api/documents/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${JSON.stringify(note)}) });
    if (!response.ok) throw Error('Note creation: ' + response.status);
    return response.json();
  })()`)
  assert.ok(created.id)
  assert.equal((await documentValue(workspace, created.id)).body, note.body)
  await downloaded(workspace)
  await verifyWindowsCachedInstaller(targetAsset)
  assert.equal(
    (await targets()).some((entry) => /\/update\.html/.test(entry.url)),
    false,
    'Download must not open or focus an update window',
  )
  let details = await openDetails(workspace)
  await screenshot(details, 'download-ready')
  await record('official download verified; completion did not open a details window', {
    downloaded: await state(details, true),
  })
  await click(details, '稍后')
  await click(workspace, '关闭')
  await noProcesses()
  assert.equal(
    await sha256(executable),
    beforeHash,
    'Ordinary quit must not replace the installed application',
  )
  await record('ordinary UI close after download did not install')

  workspace = await launch('baseline-second')
  assert.equal((await documentValue(workspace, created.id)).body, note.body)
  await downloaded(workspace)
  details = await openDetails(workspace)
  await workspace.evaluate(
    `location.href = '/docs?scope=all&id=' + ${JSON.stringify(encodeURIComponent(created.id))}`,
  )
  await until('real note editor', () =>
    workspace.evaluate('!!document.querySelector("[contenteditable=true]")'),
  )
  // Stall only the real save HTTP request. The production dirty state/save guard stays intact.
  let pausedSave
  let pausedBody
  let interceptionError
  workspace.on('Fetch.requestPaused', (request) => {
    if (
      request.request.method === 'PATCH' &&
      request.request.url.includes(`/api/documents/${created.id}`) &&
      !pausedSave
    ) {
      pausedSave = request.requestId
      pausedBody = JSON.parse(request.request.postData).body
    } else {
      void workspace
        .call('Fetch.continueRequest', { requestId: request.requestId })
        .catch((error) => {
          interceptionError = error
        })
    }
  })
  await workspace.call('Fetch.enable', {
    patterns: [{ urlPattern: '*api/documents/*', requestStage: 'Request' }],
  })
  await workspace.call('Page.bringToFront')
  await workspace.evaluate('document.querySelector("[contenteditable=true]").focus()')
  const addedText = '真实待保存改动 retained through update. '
  await workspace.call('Input.insertText', { text: addedText })
  await until('real autosave request paused', () => pausedSave)
  await click(details, '重启并安装')
  await until('real save protection dialog', () =>
    workspace.evaluate(
      '[...document.querySelectorAll("button")].some(b => b.textContent.replace(/\\s/g, "") === "继续编辑")',
    ),
  )
  await screenshot(workspace, 'save-guard')
  await click(workspace, '继续编辑')
  await until(
    'install canceled by real save guard',
    async () => (await state(details, true)).status === 'blocked',
  )
  assert.equal(await sha256(executable), beforeHash)
  await record('pending real HTTP save triggered guard; continue editing canceled installation')
  await workspace.call('Fetch.continueRequest', { requestId: pausedSave })
  await workspace.call('Fetch.disable')
  if (interceptionError) throw interceptionError
  await until('edited document persisted before retry', async () => {
    const value = await documentValue(workspace, created.id)
    return value.body.includes(addedText.trim()) ? value : false
  })
  await screenshot(details, 'retry-after-save')
  // A second real edit exercises save-and-restart, rather than retrying an already clean editor.
  pausedSave = undefined
  await workspace.call('Fetch.enable', {
    patterns: [{ urlPattern: '*api/documents/*', requestStage: 'Request' }],
  })
  await workspace.call('Page.bringToFront')
  await workspace.evaluate('document.querySelector("[contenteditable=true]").focus()')
  const finalText = 'Saved by the actual restart guard. '
  await workspace.call('Input.insertText', { text: finalText })
  await until('second real autosave request paused', () => pausedSave)
  const expectedBody = pausedBody
  assert.ok(expectedBody.includes(finalText.trim()) && expectedBody.includes(addedText.trim()))
  await latestIsTarget()
  if (process.platform === 'win32') {
    wizard = spawn(
      'pwsh',
      ['-NoProfile', '-File', join(scriptRoot, 'update-smoke-native.ps1'), '-Action', 'wizard'],
      { env, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const wizardLog = createWriteStream(join(evidence, 'nsis-update-wizard.log'))
    wizard.stdout.pipe(wizardLog, { end: false })
    wizard.stderr.pipe(wizardLog, { end: false })
    wizard.on('close', (code) => {
      result.wizardExitCode = code
      wizardLog.end()
    })
  }
  const previousProcesses = new Set(await processIds())
  assert.ok(previousProcesses.size > 0)
  await click(details, '重试重启')
  await click(workspace, '保存并重启')
  await until('save-and-restart awaits the real HTTP save', () =>
    workspace.evaluate('document.body.innerText.includes("保存中")'),
  )
  assert.equal(
    await sha256(executable),
    beforeHash,
    'Installer cannot run before the real save completes',
  )
  await screenshot(workspace, 'save-and-restart-awaiting-http')
  if (interceptionError) throw interceptionError
  await workspace.call('Fetch.continueRequest', { requestId: pausedSave })
  // Observe replacement performed by the actual updater, never launch a target installer ourselves.
  if (process.platform === 'linux') {
    executable = join(root, targetAsset.name)
    await until(
      'AppImage replaced with exact official target bytes',
      async () => {
        try {
          return `sha256:${await sha256(executable)}` === targetAsset.digest
        } catch {
          return false
        }
      },
      { timeout: 600_000, interval: 1500 },
    )
  } else {
    await until(
      'Windows installed executable replaced',
      async () => (await sha256(executable)) !== beforeHash,
      { timeout: 600_000, interval: 1500 },
    )
    await until('NSIS wizard finished normally', () => result.wizardExitCode === 0, {
      timeout: 600_000,
    })
  }
  const relaunchedProcesses = await until(
    'updater automatically relaunched a new installed application process',
    async () => {
      const current = await processIds()
      return current.length > 0 && current.every((pid) => !previousProcesses.has(pid))
        ? current
        : false
    },
    { timeout: 120_000 },
  )
  await record('updater relaunched new processes after the old application exited', {
    previousProcesses: [...previousProcesses],
    relaunchedProcesses,
  })
  await normalClose()
  await noProcesses()
  workspace = await launch('upgraded')
  const upgraded = await state(workspace)
  assert.equal(upgraded.currentVersion, target)
  assert.equal(upgraded.capability, 'automatic')
  const actual = await documentValue(workspace, created.id)
  assert.equal(actual.body, expectedBody)
  assert.equal(actual.title, note.title)
  assert.deepEqual(actual.tags, note.tags)
  assert.equal(actual.folder, note.folder)
  assert.equal(
    JSON.parse(await readFile(join(userData, 'desktop-config.json'), 'utf8')).mode,
    'local',
  )
  await workspace.evaluate(
    `location.href = '/docs?scope=all&id=' + ${JSON.stringify(encodeURIComponent(created.id))}`,
  )
  await until('preserved document rendered in upgraded application', () =>
    workspace.evaluate(`document.body.innerText.includes(${JSON.stringify(addedText.trim())})`),
  )
  await screenshot(workspace, 'upgraded-document')
  await record(
    'real save-and-restart installed official target and relaunched; version, mode, Markdown, tags and folder retained',
    { upgraded },
  )
  await click(workspace, '关闭')
  await noProcesses()
  await latestIsTarget()
  result.success = true
} catch (error) {
  result.success = false
  result.error = error.stack ?? String(error)
  throw error
} finally {
  for (const session of sessions) session.close()
  await writeFile(join(evidence, 'result.json'), JSON.stringify(result, null, 2))
  // Failure cleanup remains an ordinary window-close request. Do not force a save-vetoed process.
  await normalClose().catch(() => {})
  if (wizard && wizard.exitCode === null) wizard.kill()
}
