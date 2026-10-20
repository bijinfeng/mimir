/** External macOS manual-update acceptance. Only app copies and mkdtemp userData are used. */
import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  rename,
  stat,
  lstat,
  realpath,
} from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, basename, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'
import { Cdp, officialRepository, sha256, until, versionPair } from './update-smoke-lib.mjs'

const exec = promisify(execFile)

export function macZipAsset(release, version, arch) {
  assert.ok(['arm64', 'x64'].includes(arch))
  assert.equal(release.tag_name, `v${version}`)
  assert.equal(release.draft, false)
  assert.equal(release.prerelease, false)
  const name = `mimir-${version}-mac-${arch}.zip`
  const asset = release.assets.find((entry) => entry.name === name)
  assert.ok(asset, `Missing official macOS ZIP: ${name}`)
  assert.equal(
    asset.browser_download_url,
    `https://github.com/${officialRepository}/releases/download/v${version}/${name}`,
  )
  assert.ok(Number.isSafeInteger(asset.id) && asset.id > 0)
  assert.equal(
    asset.url,
    `https://api.github.com/repos/${officialRepository}/releases/assets/${asset.id}`,
  )
  assert.match(asset.digest ?? '', /^sha256:[a-f0-9]{64}$/)
  assert.ok(Number.isSafeInteger(asset.size) && asset.size > 0)
  return asset
}

export function assertManualState(state, currentVersion, availableVersion) {
  assert.equal(state.currentVersion, currentVersion)
  assert.equal(state.capability, 'manual')
  assert.equal(state.autoDownload, false)
  assert.equal(state.platform, 'darwin')
  assert.ok(!['downloading', 'preparing', 'downloaded', 'restarting'].includes(state.status))
  if (availableVersion) {
    assert.equal(state.status, 'available')
    assert.equal(state.version, availableVersion)
    assert.equal(
      state.releaseUrl,
      `https://github.com/${officialRepository}/releases/tag/v${availableVersion}`,
    )
  }
}

export async function manualDownloadDirectory(requested, root) {
  if (!requested) return root
  assert.ok(isAbsolute(requested), 'Download cache must be an explicit absolute temporary path')
  const info = await lstat(requested)
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'Download cache must be a real directory')
  const directory = await realpath(requested)
  assert.equal(dirname(directory), await realpath(tmpdir()))
  assert.match(basename(directory), /^mimir-official-manual-update-[a-zA-Z0-9]+$/)
  return directory
}

export async function downloadOfficialZip(
  asset,
  directory,
  { request = fetch, timeoutMs = 3_600_000, stallMs = 60_000 } = {},
) {
  assert.match(asset.name, /^mimir-\d+\.\d+\.\d+-mac-(arm64|x64)\.zip$/)
  assert.ok(Number.isSafeInteger(asset.id) && asset.id > 0)
  assert.equal(
    asset.url,
    `https://api.github.com/repos/${officialRepository}/releases/assets/${asset.id}`,
  )
  assert.ok(Number.isSafeInteger(asset.size) && asset.size > 0)
  assert.match(asset.digest, /^sha256:[a-f0-9]{64}$/)
  const file = join(directory, asset.name)
  let offset = 0
  let exists = false
  try {
    const info = await lstat(file)
    assert.ok(info.isFile() && !info.isSymbolicLink(), 'Cached ZIP must be a regular file')
    offset = info.size
    exists = true
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  assert.ok(offset <= asset.size, 'Cached ZIP exceeds the official size')
  if (offset === asset.size) {
    assert.equal(`sha256:${await sha256(file)}`, asset.digest, 'Cached ZIP digest mismatch')
    return file
  }
  const stalled = new AbortController()
  const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs), stalled.signal])
  let timer
  function resetStall() {
    clearTimeout(timer)
    timer = setTimeout(() => stalled.abort(new Error('Official ZIP download stalled')), stallMs)
    timer.unref()
  }
  resetStall()
  try {
    // Both the source and any resumed byte range belong to the official anonymous asset API.
    const response = await request(asset.url, {
      headers: {
        Accept: 'application/octet-stream',
        ...(offset ? { Range: `bytes=${offset}-` } : {}),
      },
      signal,
    })
    assert.equal(response.status, offset ? 206 : 200)
    assert.match(response.headers.get('content-type') ?? '', /^application\/(octet-stream|zip)\b/)
    if (offset)
      assert.equal(
        response.headers.get('content-range'),
        `bytes ${offset}-${asset.size - 1}/${asset.size}`,
        'Resume must return the exact remaining official byte range',
      )
    const progress = new Transform({
      transform(chunk, encoding, callback) {
        resetStall()
        callback(null, chunk)
      },
    })
    await pipeline(
      Readable.fromWeb(response.body),
      progress,
      createWriteStream(file, { flags: exists ? 'a' : 'wx' }),
      { signal },
    )
    assert.equal((await stat(file)).size, asset.size)
    assert.equal(`sha256:${await sha256(file)}`, asset.digest)
    return file
  } finally {
    clearTimeout(timer)
    stalled.abort()
  }
}

async function portNumber() {
  const server = createServer()
  await new Promise((accept, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', accept)
  })
  const port = server.address().port
  await new Promise((accept, reject) => server.close((error) => (error ? reject(error) : accept())))
  return port
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

export async function runManualUpdateSmoke() {
  assert.equal(process.platform, 'darwin', 'Run only on the native macOS host')
  assert.equal(process.arch, 'arm64', 'This acceptance target is the current macOS ARM64 host')
  const { base, target } = versionPair(process.env.BASE_VERSION, process.env.TARGET_VERSION)
  const root = await mkdtemp(join(tmpdir(), 'mimir-official-manual-update-'))
  const downloadDirectory = await manualDownloadDirectory(
    process.env.MANUAL_UPDATE_DOWNLOAD_CACHE,
    root,
  )
  const evidence = process.env.MANUAL_UPDATE_EVIDENCE
    ? resolve(process.env.MANUAL_UPDATE_EVIDENCE)
    : join(root, 'evidence')
  const userData = join(root, 'user-data')
  const installation = join(root, 'installation')
  const app = join(installation, 'mimir.app')
  await mkdir(evidence, { recursive: true })
  await mkdir(userData)
  await mkdir(installation)
  await writeFile(join(userData, 'desktop-config.json'), JSON.stringify({ mode: 'local' }))
  const port = await portNumber()
  const endpoint = `http://127.0.0.1:${port}`
  const env = { ...process.env }
  for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE'])
    delete env[name]
  const result = {
    base,
    target,
    root,
    userData,
    installation,
    downloadDirectory,
    evidence,
    checks: [],
    limitations: [
      'This is a manual ZIP replacement of a disposable app copy, not an automatic installation.',
      'Node downloads do not simulate Finder quarantine or validate Gatekeeper/notarization.',
      'System notification delivery/focus is not asserted. Screenshots are actual packaged renderer CDP captures.',
      'The manual download button is inspected; it is not clicked because opening the system browser would use the user default download directory.',
    ],
  }
  const sessions = new Set()
  let active
  let workspace
  async function record(check, details = {}) {
    result.checks.push({ check, at: new Date().toISOString(), ...details })
    await writeFile(join(evidence, 'result.json'), JSON.stringify(result, null, 2))
    console.log(`PASS ${check}`)
  }
  async function latest() {
    const info = await officialRelease('latest')
    assert.equal(info.tag_name, `v${target}`, 'Official latest drifted')
    return info
  }
  async function download(asset) {
    return downloadOfficialZip(asset, downloadDirectory)
  }
  async function targets() {
    const response = await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(3000) })
    assert.ok(response.ok)
    return response.json()
  }
  async function connect(kind) {
    const info = await until(`real ${kind} renderer`, async () =>
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
  async function launch(label) {
    const child = spawn(
      join(app, 'Contents/MacOS/mimir'),
      [
        `--user-data-dir=${userData}`,
        `--remote-debugging-port=${port}`,
        '--remote-debugging-address=127.0.0.1',
      ],
      { env, cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const log = createWriteStream(join(evidence, `${label}.log`))
    child.stdout.pipe(log, { end: false })
    child.stderr.pipe(log, { end: false })
    active = { child, exited: false }
    const instance = active
    child.once('error', (error) => {
      instance.error = error
      log.write(String(error))
    })
    child.once('exit', (code, signal) => {
      instance.exited = true
      instance.code = code
      instance.signal = signal
    })
    child.once('close', () => log.end())
    workspace = await connect('workspace')
    await until('real authenticated local workspace', () =>
      workspace.evaluate(
        "fetch('/api/auth/get-session').then(r => r.json()).then(value => !!value.user)",
      ),
    )
    return workspace
  }
  async function closeNormally() {
    if (!active || active.exited) return
    // The existing IPC action executes BrowserWindow.close(), including real beforeunload.
    // No app.exit, process signal, force-restart or synthetic save response is used.
    await workspace.evaluate('window.mimirDesktop.window.close()').catch((error) => {
      if (!/CDP target closed/.test(String(error))) throw error
    })
    await until('own copied app exits after normal workspace close', () => active.exited, {
      timeout: 90_000,
    })
    if (active.error) throw active.error
    assert.equal(active.code, 0)
    assert.equal(active.signal, null)
  }
  async function capture(session, name) {
    const image = await session.call('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(evidence, `${name}.png`), Buffer.from(image.data, 'base64'))
    await writeFile(
      join(evidence, `${name}.html`),
      await session.evaluate('document.documentElement.outerHTML'),
    )
  }
  async function readNote(id) {
    return workspace.evaluate(
      `fetch('/api/documents/' + ${JSON.stringify(id)}).then(async response => { if (!response.ok) throw Error(response.status); return response.json() })`,
    )
  }
  try {
    const baseline = await officialRelease(`tags/v${base}`)
    const newest = await latest()
    const baseAsset = macZipAsset(baseline, base, process.arch)
    const targetAsset = macZipAsset(newest, target, process.arch)
    await writeFile(
      join(evidence, 'official-releases.json'),
      JSON.stringify({ baseline, newest }, null, 2),
    )
    const baselineZip = await download(baseAsset)
    await exec('ditto', ['-x', '-k', baselineZip, installation])
    const before = await sha256(join(app, 'Contents/Resources/app.asar'))
    await launch('baseline')
    const note = {
      title: `macOS手动升级资料 ${base} → ${target}`,
      body: '中文资料保留。Actual official macOS manual update retains the original document.',
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
    const originalNote = await readNote(created.id)
    assert.equal(originalNote.body, note.body)
    const available = await until(
      'official newer version appears without automatic download',
      async () => {
        const state = await workspace.evaluate('window.mimirDesktop.update.getState()')
        assertManualState(state, base)
        if (state.status !== 'available') return false
        assertManualState(state, base, target)
        return state
      },
    )
    assert.equal(
      (await targets()).some((entry) => /\/update\.html/.test(entry.url)),
      false,
    )
    await workspace.call('Page.bringToFront')
    const buttonPoint = await until('visible enabled TitleBar update action', () =>
      workspace.evaluate(`(() => {
      const button = document.querySelector('button[aria-label="发现新版本，查看软件更新"]');
      if (!button || button.disabled) return false;
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden' || !button.contains(document.elementFromPoint(x, y))) return false;
      return { x, y };
    })()`),
    )
    await workspace.call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...buttonPoint,
      button: 'left',
      clickCount: 1,
    })
    await workspace.call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...buttonPoint,
      button: 'left',
      clickCount: 1,
    })
    const details = await connect('update')
    await until('real manual download action is visible', () =>
      details.evaluate(
        '[...document.querySelectorAll("button")].some(button => !button.disabled && button.getClientRects().length > 0 && getComputedStyle(button).visibility !== "hidden" && button.textContent.replace(/\\s/g, "") === "下载macOS版")',
      ),
    )
    const state = await details.evaluate('window.mimirUpdater.getState()')
    assertManualState(state, base, target)
    const actions = await details.evaluate(
      '[...document.querySelectorAll("button")].map(button => button.textContent.replace(/\\s/g, ""))',
    )
    for (const forbidden of ['下载更新', '重启并安装', '重试重启'])
      assert.ok(!actions.includes(forbidden))
    assert.equal(await details.evaluate('!!document.querySelector("#automatic-download")'), false)
    await capture(details, 'manual-new-version')
    await record(
      'official newer version, real TitleBar/details, manual capability, no automatic download/install actions',
      { available, state, actions },
    )
    await closeNormally()
    assert.equal(
      await sha256(join(app, 'Contents/Resources/app.asar')),
      before,
      'Normal quit must not change the app',
    )
    await record('ordinary close completed normally without installing')
    await latest()
    const targetZip = await download(targetAsset)
    const replacement = join(root, 'replacement')
    await mkdir(replacement)
    await exec('ditto', ['-x', '-k', targetZip, replacement])
    // The paths are code-owned children of our own mkdtemp root; installed apps are untouched.
    await rm(app, { recursive: true })
    await rename(join(replacement, 'mimir.app'), app)
    assert.notEqual(await sha256(join(app, 'Contents/Resources/app.asar')), before)
    await launch('manually-replaced')
    const upgraded = await workspace.evaluate('window.mimirDesktop.update.getState()')
    assertManualState(upgraded, target)
    assert.deepEqual(await readNote(created.id), originalNote)
    assert.equal(
      JSON.parse(await readFile(join(userData, 'desktop-config.json'), 'utf8')).mode,
      'local',
    )
    await workspace.evaluate(
      `location.href = '/docs?scope=all&id=' + ${JSON.stringify(encodeURIComponent(created.id))}`,
    )
    await until('preserved note renders from the same userData in the new app', () =>
      workspace.evaluate(`document.body.innerText.includes(${JSON.stringify(note.body)})`),
    )
    await capture(workspace, 'manual-updated-document')
    await record(
      'official ZIP manually replaced only the copied app; target version and original local mode/document retained',
      { upgraded, documentId: created.id },
    )
    await closeNormally()
    await latest()
    result.success = true
  } catch (error) {
    result.success = false
    result.error = error.stack ?? String(error)
    throw error
  } finally {
    try {
      await closeNormally()
    } catch (error) {
      result.cleanupError = String(error)
    }
    for (const session of sessions) session.close()
    result.appStillRunning = Boolean(active && !active.exited)
    await writeFile(join(evidence, 'result.json'), JSON.stringify(result, null, 2))
    console.log(`Manual-update evidence retained at ${evidence}; disposable files at ${root}`)
  }
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runManualUpdateSmoke()
}
