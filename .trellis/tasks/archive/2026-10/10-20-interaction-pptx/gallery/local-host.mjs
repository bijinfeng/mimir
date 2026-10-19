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
const helperRoot = resolve('/private/tmp', 'mimir-pptx-local-helper-3b5d912')
mkdirSync(helperRoot, { recursive: true })
const variants = { before: '/private/tmp/mimir-pptx-baseline-3b5d912', after: repo }
const executors = {}
const records = {}
for (const [variant, source] of Object.entries(variants)) {
  const filename = resolve(helperRoot, variant + '.cjs')
  const entry = resolve(source, 'apps/server/src/services/pptx-agent-host.ts')
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
    loader: { '.md': 'text' },
    plugins: [
      {
        name: 'isolated-fixture-boundaries',
        setup(build) {
          build.onResolve({ filter: /(?:documents|pptx-agent-services)\.js$/ }, (args) => {
            if (!args.importer.includes('/apps/server/src/services/')) return
            return { path: args.path.endsWith('documents.js') ? 'fixture-documents' : 'denied-services', namespace: 'isolation' }
          })
          build.onLoad({ filter: /.*/, namespace: 'isolation' }, ({ path }) => ({
            contents: path === 'fixture-documents'
              ? `export async function getDocument(id){return /^gallery-pptx-[0-9]+$/.test(id)?{id,kind:'file',mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation',fileExtension:'pptx'}:null}`
              : `export async function applyPptxService(){throw new Error('隔离演示不连接外部服务、Agent生成或远程图片')}`,
            loader: 'js',
          }))
        },
      },
    ],
  })
  writeFileSync(filename, built.outputFiles[0].contents)
  executors[variant] = require(filename)
  const sources = Object.keys(built.metafile.inputs)
    .filter((p) => !p.includes('node_modules') && !p.startsWith('isolation:'))
    .map((p) => resolve(repo, p.split('?')[0]))
    .filter((p) => p.startsWith(source + '/'))
    .map((p) => ({
      path: p.slice(source.length + 1),
      sha256: createHash('sha256').update(readFileSync(p)).digest('hex'),
    }))
    .toSorted((a, b) => a.path.localeCompare(b.path))
  records[variant] = {
    sourceRoot: source,
    entryPoint: 'apps/server/src/services/pptx-agent-host.ts',
    bundleSha256: createHash('sha256').update(built.outputFiles[0].contents).digest('hex'),
    files: sources,
    substitutions: [
      'getDocument: fixed fixture identity only; no DB module',
      'applyPptxService: explicit rejection; no model/network/storage calls',
    ],
  }
}
writeFileSync(
  resolve(gallery, 'helper-source-manifest.json'),
  JSON.stringify(
    {
      baseline: '3b5d912',
      adapterSha256: createHash('sha256')
        .update(readFileSync(fileURLToPath(import.meta.url)))
        .digest('hex'),
      variants: records,
    },
    null,
    2,
  ) + '\n',
)
const allowed = new Set(['http://127.0.0.1:5208', 'http://127.0.0.1:5209', 'http://127.0.0.1:5194'])
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
  const [, variant, kind] = (req.url ?? '').split('/')
  if (req.method !== 'POST' || !executors[variant] || !['ops','picture','upload'].includes(kind)) {
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
    if (!/^gallery-pptx-[0-9]+$/.test(input.documentId)) throw new Error('仅允许本页固定工作簿身份')
    const bytes = new Uint8Array(Buffer.from(input.bytes, 'base64'))
    if (bytes.length > 2 * 1024 * 1024 || bytes[0] !== 80 || bytes[1] !== 75)
      throw new Error('隔离工作簿须是最多2MiB的PPTX ZIP字节')
    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })
    const executor = kind === 'picture' ? executors[variant].applyPptxManualPictureOnHost : kind === 'upload' ? executors[variant].applyPptxManualUploadOnHost : executors[variant].applyPptxOpsOnHost
    const decode = (value) => value ? new Uint8Array(Buffer.from(value,'base64')) : undefined
    const result = await executor({
      ...input,
      bytes,
      imageBytes: decode(input.imageBytes), assetBytes: decode(input.assetBytes), posterBytes: decode(input.posterBytes),
      signal: controller.signal,
    })
    res.end(JSON.stringify({ ...result, bytes: Buffer.from(result.bytes).toString('base64') }))
  } catch (error) {
    res.writeHead(400)
    res.end(JSON.stringify({ error: error.message, name: error.name, warning: error.warning }))
  }
})
server.listen(5210, '127.0.0.1', () =>
  console.log(
    'PPTX isolated native Node helper: http://127.0.0.1:5210/{before,after}/{ops,picture,upload}; no DB, permanent disk writes, remote images or external services',
  ),
)
