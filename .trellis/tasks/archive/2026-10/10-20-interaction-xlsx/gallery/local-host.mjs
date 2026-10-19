/** Isolated loopback helper: original Node executor; fixture-only identity, no DB/file writes. */
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const gallery = dirname(fileURLToPath(import.meta.url))
const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: gallery,
  encoding: 'utf8',
}).trim()
const require = createRequire(resolve(repo, 'apps/web/package.json'))
const esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
const helperRoot = resolve('/private/tmp', 'mimir-xlsx-local-helper-dcb9a40')
mkdirSync(helperRoot, { recursive: true })
const variants = { before: '/private/tmp/mimir-xlsx-baseline-dcb9a40', after: repo }
const executors = {}
const records = {}
for (const [variant, source] of Object.entries(variants)) {
  const filename = resolve(helperRoot, variant + '.cjs')
  const entry = resolve(source, 'apps/server/src/services/xlsx-agent-host.ts')
  const built = await esbuild.build({
    entryPoints: [entry],
    alias: { '@mimir/shared': resolve(source, 'packages/shared/src/index.ts') },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    write: false,
    metafile: true,
    tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: false } },
    plugins: [
      {
        name: 'isolated-fixture-boundaries',
        setup(build) {
          build.onResolve({ filter: /(?:documents|xlsx-recalc|docx-image-fetch)\.js$/ }, (args) => {
            const name = args.path.split('/').pop()
            if (name === 'documents.js' && args.importer.endsWith('/xlsx-agent-host.ts'))
              return { path: 'fixture-documents', namespace: 'isolation' }
            if (name === 'xlsx-recalc.js') return { path: 'denied-recalc', namespace: 'isolation' }
            if (name === 'docx-image-fetch.js')
              return { path: 'denied-remote-image', namespace: 'isolation' }
          })
          build.onLoad({ filter: /.*/, namespace: 'isolation' }, ({ path }) => ({
            contents:
              path === 'fixture-documents'
                ? `export async function getDocument(id){return /^gallery-xlsx-[0-9]+$/.test(id)?{id,kind:'file',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',fileExtension:'xlsx'}:null}`
                : path === 'denied-recalc'
                  ? `export async function recalculateXlsx(){throw new Error('隔离演示不启动外部计算进程')}`
                  : `export async function fetchDocxImage(){throw new Error('隔离演示不读取远程图片')}`,
            loader: 'js',
          }))
        },
      },
    ],
  })
  writeFileSync(filename, built.outputFiles[0].contents)
  executors[variant] = require(filename).applyXlsxOpsOnHost
  const sources = Object.keys(built.metafile.inputs)
    .filter((p) => !p.includes('node_modules') && !p.startsWith('isolation:'))
    .map((p) => resolve(repo, p))
    .filter((p) => p.startsWith(source + '/'))
    .map((p) => ({
      path: p.slice(source.length + 1),
      sha256: createHash('sha256').update(readFileSync(p)).digest('hex'),
    }))
    .toSorted((a, b) => a.path.localeCompare(b.path))
  records[variant] = {
    sourceRoot: source,
    entryPoint: 'apps/server/src/services/xlsx-agent-host.ts',
    bundleSha256: createHash('sha256').update(built.outputFiles[0].contents).digest('hex'),
    files: sources,
    substitutions: [
      'getDocument: fixture identity only; no DB module',
      'recalculateXlsx: explicit rejection, no worker/process',
      'fetchDocxImage: explicit rejection, no network',
    ],
  }
}
writeFileSync(
  resolve(gallery, 'helper-source-manifest.json'),
  JSON.stringify(
    {
      baseline: 'dcb9a40',
      adapterSha256: createHash('sha256')
        .update(readFileSync(fileURLToPath(import.meta.url)))
        .digest('hex'),
      variants: records,
    },
    null,
    2,
  ) + '\n',
)
const allowed = new Set(['http://127.0.0.1:5204', 'http://127.0.0.1:5205', 'http://127.0.0.1:5194'])
const server = createServer(async (req, res) => {
  const origin = req.headers.origin
  if (origin && !allowed.has(origin)) {
    res.writeHead(403)
    res.end('Origin unavailable')
    return
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  const variant = req.url === '/before' ? 'before' : req.url === '/after' ? 'after' : null
  if (req.method !== 'POST' || !variant) {
    res.writeHead(404)
    res.end('{}')
    return
  }
  let received = 0
  const chunks = []
  try {
    for await (const chunk of req) {
      received += chunk.length
      if (received > 4 * 1024 * 1024) throw new Error('隔离请求超过4MiB')
      chunks.push(chunk)
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!/^gallery-xlsx-[0-9]+$/.test(input.documentId)) throw new Error('仅允许本页固定工作簿身份')
    if (input.action && input.action !== 'apply_ops') throw new Error('隔离演示不启动计算工作进程')
    if (input.image || input.imageFile || input.ops?.some((op) => op.op === 'add_image'))
      throw new Error('隔离演示不读取远程或上传图片')
    const bytes = new Uint8Array(Buffer.from(input.bytes, 'base64'))
    if (bytes.length > 2 * 1024 * 1024 || bytes[0] !== 80 || bytes[1] !== 75)
      throw new Error('隔离工作簿须是最多2MiB的XLSX ZIP字节')
    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })
    const result = await executors[variant]({
      ...input,
      bytes,
      principal: 'gallery-local-only',
      signal: controller.signal,
    })
    res.end(JSON.stringify({ ...result, bytes: Buffer.from(result.bytes).toString('base64') }))
  } catch (error) {
    res.writeHead(400)
    res.end(JSON.stringify({ error: error.message, name: error.name, warning: error.warning }))
  }
})
server.listen(5206, '127.0.0.1', () =>
  console.log(
    'XLSX isolated native Node helper: http://127.0.0.1:5206/{before,after}; no DB, disk writes, remote images or external computation',
  ),
)
