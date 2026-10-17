import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire, stripTypeScriptTypes } from 'node:module'
import { pathToFileURL } from 'node:url'
/** Runs the actual production worker entry/core under worker_threads, with Buffer unavailable. */
export function prepareNativeEncryptionWorker(): { worker: URL; core: URL } {
  const dir = mkdtempSync(join(tmpdir(), 'mimir-docx-encryption-worker-'))
  const require = createRequire(import.meta.url)
  const modules = ['types', 'container', 'info', 'zip', 'core']
  for (const name of [...modules, 'worker']) {
    const file = name === 'worker' ? 'docx-encryption.worker.ts' : `docx-encryption-${name}.ts`
    const code = stripTypeScriptTypes(readFileSync(new URL(file, import.meta.url), 'utf8'), {
      mode: 'strip',
    }).replace(/from '([^']+)'/g, (_all, specifier: string) => {
      if (specifier.startsWith('./')) return `from '${specifier.replace(/\.js$/, '.mjs')}'`
      const resolved =
        specifier === 'fast-xml-parser'
          ? require.resolve(specifier).replace(/lib\/fxp\.cjs$/, 'src/fxp.js')
          : require.resolve(specifier)
      return `from '${pathToFileURL(resolved).href}'`
    })
    writeFileSync(join(dir, file.replace(/\.ts$/, '.mjs')), code)
  }
  const workerUrl = pathToFileURL(join(dir, 'docx-encryption.worker.mjs'))
  const bridge = `import { parentPort } from 'node:worker_threads';
    globalThis.Buffer = undefined;
    globalThis.addEventListener = (type, fn) => parentPort.once('message', (data) => fn({data}));
    globalThis.postMessage = (message, transfer) => parentPort.postMessage(message, transfer);
    await import(${JSON.stringify(workerUrl.href)});
    parentPort.postMessage({ready: true});`
  const entry = join(dir, 'bridge.mjs')
  writeFileSync(entry, bridge)
  return {
    worker: pathToFileURL(entry),
    core: pathToFileURL(join(dir, 'docx-encryption-core.mjs')),
  }
}
