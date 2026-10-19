/** Real PDF services, bounded loopback requests and memory-only file bytes; no product DB. */
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
const folder = '/private/tmp/mimir-pdf-helper-53285bb'
mkdirSync(folder, { recursive: true })
const executors = {},
  variants = {}
for (const [variant, source] of Object.entries({
  before: '/private/tmp/mimir-pdf-baseline-53285bb',
  after: repo,
})) {
  const entry = `export * from '${source}/apps/server/src/services/pdf-agent-host.ts';
export * from '${source}/apps/server/src/services/pdf-insert-layout.ts';
export * from '${source}/apps/server/src/services/pdf-annotations.ts';
export * from '${source}/apps/server/src/services/pdf-forms.ts';
export * from '${source}/apps/server/src/services/pdf-images.ts';
export * from '${source}/apps/server/src/services/pdf-local.ts';
export * from '${source}/apps/server/src/services/pdf-preserving-guard.ts';`
  const built = await esbuild.build({
    stdin: { contents: entry, resolveDir: source, loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    write: false,
    metafile: true,
    define: {
      'import.meta.url': JSON.stringify(
        pathToFileURL(resolve(source, 'apps/server/src/services/pdf-agent-host.ts')).href,
      ),
    },
    tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: false } },
    loader: { '.md': 'text' },
    plugins: [
      {
        name: 'isolated-dependency-resolution',
        setup(build) {
          build.onResolve({ filter: /^[^./]|^@/ }, (args) => {
            if (args.path.startsWith('node:')) return { path: args.path, external: true }
            if (args.path === '@mimir/shared')
              return { path: resolve(source, 'packages/shared/src/index.ts') }
            const dependencyRequire = createRequire(
              resolve(args.resolveDir || source, '__gallery__.cjs'),
            )
            return { path: dependencyRequire.resolve(args.path), external: true }
          })
        },
      },
    ],
  })
  const filename = resolve(folder, `${variant}.cjs`)
  writeFileSync(filename, built.outputFiles[0].contents)
  executors[variant] = require(filename)
  variants[variant] = {
    sourceRoot: source,
    bundleSha256: createHash('sha256').update(built.outputFiles[0].contents).digest('hex'),
    files: Object.keys(built.metafile.inputs)
      .filter((path) => !path.startsWith('<'))
      .map((path) => resolve(repo, path))
      .filter((path) => path.startsWith(source + '/'))
      .map((path) => ({
        path: path.slice(source.length + 1),
        sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
      }))
      .toSorted((a, b) => a.path.localeCompare(b.path)),
  }
}
writeFileSync(
  resolve(gallery, 'helper-source-manifest.json'),
  JSON.stringify(
    {
      baseline: '53285bbdeaa17475e04aae517f07c957776cb6b6',
      adapterSha256: createHash('sha256')
        .update(readFileSync(fileURLToPath(import.meta.url)))
        .digest('hex'),
      variants,
      boundary:
        'Product service functions only. No documents/DB/model/asset registry imports. Uploaded bytes are request-local. External assets explicitly rejected in demo.',
    },
    null,
    2,
  ) + '\n',
)
const decode = (value) => (value ? new Uint8Array(Buffer.from(value, 'base64')) : undefined)
const encode = (value) => (value ? Buffer.from(value).toString('base64') : undefined)
const server = createServer(async (req, res) => {
  const origin = req.headers.origin
  if (
    origin &&
    !['http://127.0.0.1:5194', 'http://127.0.0.1:5211', 'http://127.0.0.1:5212'].includes(origin)
  ) {
    res.writeHead(403)
    res.end('{}')
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
  const host = executors[variant]
  if (
    req.method !== 'POST' ||
    !host ||
    !['apply', 'inspect', 'markup', 'annotations', 'forms', 'blocks', 'images', 'local'].includes(
      kind,
    )
  ) {
    res.writeHead(404)
    res.end('{}')
    return
  }
  try {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > 8 * 1024 * 1024) throw new Error('隔离请求超过8MiB')
      chunks.push(chunk)
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8')),
      bytes = decode(input.bytes)
    if (
      !bytes ||
      bytes.length > 4 * 1024 * 1024 ||
      Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-'
    )
      throw new Error('仅允许4MiB以内的PDF字节')
    if (!Number.isSafeInteger(input.expectedVersion ?? 0) || (input.expectedVersion ?? 0) < 0)
      throw new Error('版本无效')
    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })
    if (input.operation && JSON.stringify(input.operation).includes('"url"'))
      throw new Error('隔离演示明确拒绝远程图片URL')
    let result
    if (kind === 'inspect') result = await host.inspectPdfTextTarget(bytes, input.probe)
    else if (kind === 'apply') {
      if (input.kind === 'layout')
        result = {
          bytes,
          version: input.expectedVersion,
          layouts: await Promise.all(
            input.items.map((item) => host.layoutPdfTextInsert(bytes, item)),
          ),
        }
      else
        result = {
          bytes:
            input.kind === 'edit'
              ? await host.applyPdfVerifiedTextEdit(bytes, input.items[0], input.items[0].target)
              : await host.applyPdfTextInserts(bytes, input.items),
          version: input.expectedVersion + 1,
        }
    } else if (kind === 'markup')
      result = {
        ...(await host.applyPdfMarkupWithCount(bytes, input.markup)),
        version: input.expectedVersion + 1,
      }
    else {
      if (kind === 'annotations')
        result = await host.applyPdfAnnotationOperation(
          bytes,
          input.operation,
          input.sha256,
          'admin',
        )
      if (kind === 'forms')
        result = await host.applyPdfFormOperation(
          bytes,
          input.operation,
          input.sha256,
          host.assertPdfPreservingSafe,
        )
      if (kind === 'blocks')
        result = await host.applyPdfTextBlockOperation(bytes, input.operation, controller.signal)
      if (kind === 'images')
        result = await host.applyPdfImageOperation(bytes, input.operation, controller.signal)
      if (kind === 'local')
        result = await host.applyPdfLocalOperation(
          bytes,
          input.operation,
          decode(input.assetBytes),
          controller.signal,
        )
      result = {
        ...result,
        version:
          input.expectedVersion +
          (result.bytes && kind === 'annotations' && input.operation.op === 'read'
            ? 0
            : result.bytes
              ? 1
              : 0),
      }
    }
    res.end(
      JSON.stringify({
        ...result,
        bytes: encode(result.bytes),
        outputs: result.outputs?.map((output) => ({ ...output, bytes: encode(output.bytes) })),
      }),
    )
  } catch (error) {
    res.writeHead(400)
    res.end(JSON.stringify({ error: error.message, name: error.name }))
  }
})
server.listen(5213, '127.0.0.1', () =>
  console.log(
    'PDF isolated native helper http://127.0.0.1:5213/{before,after}/{apply,inspect,markup,annotations,forms,blocks,images,local}; request bytes only; no DB or external services',
  ),
)
