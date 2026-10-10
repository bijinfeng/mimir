/**
 * 桌面端启动自检（手动跑：`node scripts/smoke.mjs`）。
 * 设置 `MIMIR_SMOKE_EXECUTABLE` 可对解包后的真实可执行文件运行同一组判据。
 *
 * 它回答的是「这个客户端真的起来了吗」——而那是**代码推断不出来**的：
 * 三段产物各自构建成功、类型也过，窗口里仍然可能是白屏（preload 静默不执行、
 * 渲染入口没挂上、宿主静态服务找不到 index.html）。
 *
 * 两个场景，各跑一次真实 Electron（一次性 userData，不碰开发者的本地库）：
 *
 * **A. 已选模式**（预置 `desktop-config.json`）——读宿主访问日志取证，
 * 每条判据各对应一个曾经静默失败过的接缝：
 *
 *   1. `/assets/*.js` + `*.css` 200   → 静态服务指对了 `dist/renderer`
 *   2. `/api/auth/get-session` 200    → 本地模式令牌 cookie 生效（没破同源前提）
 *   3. `/api/documents` 200           → 路由守卫放行（不是停在登录页）
 *   4. `/api/folders` 200             → 应用外壳渲染了，不只是一个空路由
 *
 * **B. 首次启动**（空 userData）——窗口该落在选择页，而**宿主不该启动**：
 * 那一页必须在没有任何宿主时就能打开（D-100）。判据是「没有任何宿主日志」
 * 加「进程还活着」——若实现哪天把宿主提前起来了，这一条会红。
 *
 * 为什么不用 `--remote-debugging-port` 在窗口里断言：那需要从本进程连回
 * Electron 的调试端口，而受限环境里这条连接不一定通（实测被拦），于是自检
 * 会因为**自己的**取证手段失败而报错——那种假阴性比没有自检更糟。
 *
 * **完全不碰产品代码**：不注入自检开关、不读特殊环境变量。
 * 不进 `pnpm test`：它要跑真实 Electron 与一个真实宿主，不是单元测试的粒度。
 */
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const packagedExecutable = process.env.MIMIR_SMOKE_EXECUTABLE

// 转义序列用 String.fromCharCode 拼，不写字面控制字符：
// 直接写 \u001b 会触发 no-control-regex（那条规则防的是误打进正则的控制字符）
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, 'g')

/**
 * 起一次 Electron，等到 `until` 在日志里出现（或超时），然后关掉。
 *
 * @param preset - 预置的模式选择；null 表示空 userData（首次启动）
 * @param until - 判定「可以收尾了」的正则；null 表示固定等 `graceMs`
 */
async function run({ preset, until, graceMs = 12_000, timeoutMs = 90_000 }) {
  const userData = await mkdtemp(join(tmpdir(), 'mimir-smoke-'))
  if (preset) {
    // 文件形状与 config.ts 写出的一致
    await writeFile(join(userData, 'desktop-config.json'), JSON.stringify(preset))
  }

  const child = spawn(
    packagedExecutable ?? join(desktopRoot, 'node_modules', '.bin', 'electron'),
    [...(packagedExecutable ? [] : ['.']), `--user-data-dir=${userData}`],
    // AppImage 是包装进程：只 kill child 会留下真正的 Electron 孙进程，
    // 下一轮首启测试随后复用上一轮单实例，得到假的「已选模式」日志。
    { cwd: desktopRoot, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' },
  )

  const killTree = (signal) => {
    if (!child.pid) return
    try {
      if (process.platform === 'win32') child.kill(signal)
      else process.kill(-child.pid, signal)
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }

  let log = ''
  const collect = (chunk) => {
    log += chunk.toString()
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)

  const outcome = await new Promise((resolve) => {
    let pollTimer
    let graceTimer
    const finish = (value) => {
      clearInterval(pollTimer)
      clearTimeout(graceTimer)
      clearTimeout(deadlineTimer)
      child.off('exit', onExit)
      resolve(value)
    }
    const onExit = () => finish('exited')
    child.once('exit', onExit)
    if (until) {
      pollTimer = setInterval(() => {
        if (typeof until === 'function' ? until(log) : until.test(log)) finish('ready')
      }, 300)
    } else {
      graceTimer = setTimeout(() => finish('waited'), graceMs)
    }
    const deadlineTimer = setTimeout(() => finish('timeout'), timeoutMs)
  })

  const alive = child.exitCode === null
  killTree('SIGTERM')
  await new Promise((r) => setTimeout(r, 1500))
  killTree('SIGKILL')
  await rm(userData, { recursive: true, force: true })

  return { outcome, alive, log: log.replace(ANSI, '') }
}

/** 一条「METHOD /path 200」的成功判据。路径后面允许跟查询串 */
const served = (log, method, path) => new RegExp(`--> ${method} ${path}(\\?[^ ]*)? 200`).test(log)

const checks = []

/* ── A. 已选模式：正常进入主界面 ─────────────────────────── */
const main = await run({ preset: { mode: 'local' }, until: /GET \/api\/documents/ })

checks.push(
  [main.outcome === 'ready', 'A 已选模式：页面启动流程走到了取数据这一步'],
  [
    /--> GET \/assets\/[^ ]+\.js 200/.test(main.log),
    'A 渲染产物被真的加载（静态服务指向 dist/renderer）',
  ],
  [/--> GET \/assets\/[^ ]+\.css 200/.test(main.log), 'A 渲染层样式被加载'],
  [served(main.log, 'GET', '/api/auth/get-session'), 'A 本地模式免登录生效（令牌 cookie 带上了）'],
  [served(main.log, 'GET', '/api/documents'), 'A 守卫放行，页面开始取文档（不是停在登录页）'],
  [served(main.log, 'GET', '/api/folders'), 'A 侧栏开始取目录树（应用外壳渲染了）'],
)

/* ── B. 首次启动：落在选择页，且宿主不启动 ───────────────── */
const setup = await run({ preset: null, until: null })

checks.push(
  [setup.alive, 'B 首次启动：进程活着（没有因为缺少宿主而崩）'],
  [!/--> GET \//.test(setup.log), 'B 首次启动不启动宿主（选择页必须在没有宿主时也能打开）'],
  [!/启动失败|Error:/.test(setup.log), 'B 首次启动没有报错'],
)

/* ── C. 云端模式：远端页面没有本机桥，也不启动本地宿主 ──────── */
const cloudRequests = []
const cloudServer = createServer((request, response) => {
  cloudRequests.push(request.url ?? '')
  if (request.url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(
      '<!doctype html><script>fetch("/bridge-probe?exposed=" + ("mimirDesktop" in window))</script>',
    )
  } else {
    response.writeHead(204)
    response.end()
  }
})
await new Promise((resolve) => cloudServer.listen(0, '127.0.0.1', resolve))
const cloudAddress = cloudServer.address()
if (!cloudAddress || typeof cloudAddress === 'string') throw new Error('云端冒烟测试未获得端口')
const cloudOrigin = `http://127.0.0.1:${cloudAddress.port}`
let cloud
try {
  cloud = await run({
    preset: { mode: 'cloud', cloudUrl: cloudOrigin },
    until: () => cloudRequests.some((path) => path === '/bridge-probe?exposed=false'),
  })
} finally {
  cloudServer.closeAllConnections()
  await new Promise((resolve, reject) =>
    cloudServer.close((error) => (error ? reject(error) : resolve())),
  )
}
checks.push(
  [cloud.outcome === 'ready', 'C 云端模式：远端页面已加载且拿不到桌面桥'],
  [cloudRequests.includes('/'), 'C 云端模式：窗口确实请求了远端页面'],
  [!/本地模式宿主|--> GET \/api\//.test(cloud.log), 'C 云端模式：没有启动本地宿主'],
)

console.log('')
let failure = null
for (const [pass, label] of checks) {
  console.log(`[smoke] ${pass ? 'PASS' : 'FAIL'} ${label}`)
  if (!pass) failure = label
}

if (failure) {
  console.error(`\n[smoke] 自检失败：${failure}`)
  console.error('— A 日志尾部 —')
  console.error(main.log.split('\n').slice(-30).join('\n'))
  console.error('— B 日志尾部 —')
  console.error(setup.log.split('\n').slice(-30).join('\n'))
  console.error('— C 日志尾部 —')
  console.error(cloud.log.split('\n').slice(-30).join('\n'))
  process.exit(1)
}
console.log('\n[smoke] 自检通过')
